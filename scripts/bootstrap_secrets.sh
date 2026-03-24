#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_TOML="${ROOT_DIR}/wrangler.toml"
DEV_VARS_FILE="${DEV_VARS_FILE:-${ROOT_DIR}/.dev.vars}"
PROJECT_NAME="${CF_PAGES_PROJECT_NAME:-}"
WRITE_LOCAL=1
SYNC_CLOUDFLARE=1
KNOWN_KEYS=(
  "TURNSTILE_SECRET_KEY"
  "CF_ACCESS_CLIENT_ID"
  "CF_ACCESS_CLIENT_SECRET"
  "LITELLM_API_KEY"
  "ANALYTICS_API_KEY"
  "GRAFANA_TOKEN"
)
CLOUDFLARE_KEYS=(
  "TURNSTILE_SECRET_KEY"
  "CF_ACCESS_CLIENT_ID"
  "CF_ACCESS_CLIENT_SECRET"
  "LITELLM_API_KEY"
  "ANALYTICS_API_KEY"
)
SELECTED_KEYS=()
SELECTED_KEYS_COUNT=0

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap_secrets.sh [options]

Options:
  --local-only                Write .dev.vars but do not sync Cloudflare Pages secrets
  --cloudflare-only           Sync Cloudflare Pages secrets but do not write .dev.vars
  --key <NAME>                Only update the named secret; may be passed multiple times
  --project-name <name>       Override the Cloudflare Pages project name
  --dev-vars-file <path>      Override the local .dev.vars path
  -h, --help                  Show this help
EOF
}

contains_key() {
  local needle="$1"
  shift
  local item

  for item in "$@"; do
    if [[ "${item}" == "${needle}" ]]; then
      return 0
    fi
  done

  return 1
}

is_selected_key() {
  local key="$1"

  if [[ "${SELECTED_KEYS_COUNT}" -eq 0 ]]; then
    return 0
  fi

  contains_key "${key}" "${SELECTED_KEYS[@]}"
}

label_for_key() {
  case "$1" in
    TURNSTILE_SECRET_KEY) echo "Turnstile secret key" ;;
    CF_ACCESS_CLIENT_ID) echo "Cloudflare Access client ID" ;;
    CF_ACCESS_CLIENT_SECRET) echo "Cloudflare Access client secret" ;;
    LITELLM_API_KEY) echo "LiteLLM API key" ;;
    ANALYTICS_API_KEY) echo "Analytics API key" ;;
    GRAFANA_TOKEN) echo "Grafana bearer token" ;;
    *) echo "$1" ;;
  esac
}

validate_selected_key() {
  local key="${1:-}"

  if [[ -z "${key}" ]]; then
    echo "--key requires a value." >&2
    exit 1
  fi

  if ! contains_key "${key}" "${KNOWN_KEYS[@]}"; then
    echo "Unknown secret key: ${key}" >&2
    echo "Allowed keys: ${KNOWN_KEYS[*]}" >&2
    exit 1
  fi
}

load_existing_dev_vars() {
  local line key value existing_var

  if [[ ! -f "${DEV_VARS_FILE}" ]]; then
    return
  fi

  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"

    if contains_key "${key}" "${KNOWN_KEYS[@]}"; then
      existing_var="EXISTING_${key}"
      printf -v "${existing_var}" '%s' "${value}"
    fi
  done < "${DEV_VARS_FILE}"
}

generate_analytics_key() {
  python3 -c 'import secrets; print(secrets.token_hex(24))'
}

prompt_secret() {
  local key="$1"
  local label="$2"
  local generated_default="${3:-}"
  local value="${!key-}"

  if [[ -n "${value}" ]]; then
    printf 'Using %s from environment.\n' "${key}" >&2
    printf -v "${key}" '%s' "${value}"
    return
  fi

  if [[ -n "${generated_default}" ]]; then
    printf 'Press enter to use generated %s.\n' "${label}" >&2
  fi

  while true; do
    printf '%s: ' "${label}" >&2
    IFS= read -r -s value
    printf '\n' >&2

    if [[ -z "${value}" && -n "${generated_default}" ]]; then
      value="${generated_default}"
      printf 'Generated %s.\n' "${label}" >&2
    fi

    if [[ -n "${value}" ]]; then
      printf -v "${key}" '%s' "${value}"
      return
    fi

    printf '%s cannot be empty.\n' "${label}" >&2
  done
}

prompt_optional_secret() {
  local key="$1"
  local label="$2"
  local value="${!key-}"

  if [[ -n "${value}" ]]; then
    printf 'Using %s from environment.\n' "${key}" >&2
    printf -v "${key}" '%s' "${value}"
    return
  fi

  printf '%s (optional, press enter to skip): ' "${label}" >&2
  IFS= read -r -s value
  printf '\n' >&2
  printf -v "${key}" '%s' "${value}"
}

resolve_selected_secrets() {
  local key label

  for key in "${KNOWN_KEYS[@]}"; do
    if ! is_selected_key "${key}"; then
      continue
    fi

    label="$(label_for_key "${key}")"
    case "${key}" in
      ANALYTICS_API_KEY)
        prompt_secret "${key}" "${label}" "$(generate_analytics_key)"
        ;;
      GRAFANA_TOKEN)
        prompt_optional_secret "${key}" "${label}"
        ;;
      *)
        prompt_secret "${key}" "${label}"
        ;;
    esac
  done
}

write_dev_vars_file() {
  local key value existing_var existing_value

  umask 077
  : > "${DEV_VARS_FILE}"

  for key in "${KNOWN_KEYS[@]}"; do
    value="${!key-}"
    existing_var="EXISTING_${key}"
    existing_value="${!existing_var-}"

    if [[ -z "${value}" && -n "${existing_value}" ]]; then
      value="${existing_value}"
    fi

    if [[ -n "${value}" ]]; then
      printf '%s=%s\n' "${key}" "${value}" >> "${DEV_VARS_FILE}"
    fi
  done

  chmod 600 "${DEV_VARS_FILE}"
  printf 'Wrote %s\n' "${DEV_VARS_FILE}" >&2
}

sync_secret() {
  local key="$1"
  local value="${!key-}"

  if [[ -z "${value}" ]]; then
    echo "Cannot sync ${key}; no value was provided." >&2
    exit 1
  fi

  printf 'Syncing %s to Cloudflare Pages project %s...\n' "${key}" "${PROJECT_NAME}" >&2
  printf '%s' "${value}" | npx --yes wrangler --cwd "${ROOT_DIR}" pages secret put "${key}" --project-name "${PROJECT_NAME}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-only)
      SYNC_CLOUDFLARE=0
      ;;
    --cloudflare-only)
      WRITE_LOCAL=0
      ;;
    --key)
      validate_selected_key "${2:-}"
      if [[ "${SELECTED_KEYS_COUNT}" -eq 0 ]] || ! contains_key "${2}" "${SELECTED_KEYS[@]}"; then
        SELECTED_KEYS+=("${2}")
        SELECTED_KEYS_COUNT=$((SELECTED_KEYS_COUNT + 1))
      fi
      shift
      ;;
    --project-name)
      PROJECT_NAME="${2:-}"
      shift
      ;;
    --dev-vars-file)
      DEV_VARS_FILE="${2:-}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ -z "${PROJECT_NAME}" && -f "${WRANGLER_TOML}" ]]; then
  PROJECT_NAME="$(awk -F'"' '/^name = "/ {print $2; exit}' "${WRANGLER_TOML}")"
fi

if [[ -z "${PROJECT_NAME}" && "${SYNC_CLOUDFLARE}" -eq 1 ]]; then
  echo "Could not determine Cloudflare Pages project name." >&2
  exit 1
fi

load_existing_dev_vars

if [[ "${SYNC_CLOUDFLARE}" -eq 1 ]] && ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to sync Cloudflare Pages secrets." >&2
  exit 1
fi

resolve_selected_secrets

if [[ "${WRITE_LOCAL}" -eq 1 ]]; then
  write_dev_vars_file
fi

if [[ "${SYNC_CLOUDFLARE}" -eq 1 ]]; then
  synced_count=0
  for key in "${CLOUDFLARE_KEYS[@]}"; do
    if ! is_selected_key "${key}"; then
      continue
    fi
    sync_secret "${key}"
    synced_count=1
  done

  if [[ "${synced_count}" -eq 0 && "${SELECTED_KEYS_COUNT}" -gt 0 ]]; then
    printf 'No Cloudflare-managed keys were selected for sync.\n' >&2
  fi
fi

if [[ "${SYNC_CLOUDFLARE}" -eq 1 && "${SELECTED_KEYS_COUNT}" -gt 0 ]] && contains_key "GRAFANA_TOKEN" "${SELECTED_KEYS[@]}"; then
  printf 'Skipping GRAFANA_TOKEN Cloudflare sync; it is treated as a local-only secret.\n' >&2
fi

printf 'Secret bootstrap complete.\n' >&2
