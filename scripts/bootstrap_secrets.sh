#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_TOML="${ROOT_DIR}/wrangler.toml"
DEV_VARS_FILE="${DEV_VARS_FILE:-${ROOT_DIR}/.dev.vars}"
PROJECT_NAME="${CF_PAGES_PROJECT_NAME:-}"
WRITE_LOCAL=1
SYNC_CLOUDFLARE=1

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap_secrets.sh [options]

Options:
  --local-only                Write .dev.vars but do not sync Cloudflare Pages secrets
  --cloudflare-only           Sync Cloudflare Pages secrets but do not write .dev.vars
  --project-name <name>       Override the Cloudflare Pages project name
  --dev-vars-file <path>      Override the local .dev.vars path
  -h, --help                  Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-only)
      SYNC_CLOUDFLARE=0
      ;;
    --cloudflare-only)
      WRITE_LOCAL=0
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

generate_analytics_key() {
  python3 -c 'import secrets; print(secrets.token_hex(24))'
}

prompt_secret() {
  local key="$1"
  local label="$2"
  local generated_default="${3:-}"
  local value="${!key:-}"

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
  local value="${!key:-}"

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

write_dev_vars_file() {
  umask 077
  : > "${DEV_VARS_FILE}"

  {
    printf 'TURNSTILE_SECRET_KEY=%s\n' "${TURNSTILE_SECRET_KEY}"
    printf 'CF_ACCESS_CLIENT_ID=%s\n' "${CF_ACCESS_CLIENT_ID}"
    printf 'CF_ACCESS_CLIENT_SECRET=%s\n' "${CF_ACCESS_CLIENT_SECRET}"
    printf 'LITELLM_API_KEY=%s\n' "${LITELLM_API_KEY}"
    printf 'ANALYTICS_API_KEY=%s\n' "${ANALYTICS_API_KEY}"
    if [[ -n "${GRAFANA_TOKEN:-}" ]]; then
      printf 'GRAFANA_TOKEN=%s\n' "${GRAFANA_TOKEN}"
    fi
  } >> "${DEV_VARS_FILE}"

  chmod 600 "${DEV_VARS_FILE}"
  printf 'Wrote %s\n' "${DEV_VARS_FILE}" >&2
}

sync_secret() {
  local key="$1"
  local value="${!key:-}"

  printf 'Syncing %s to Cloudflare Pages project %s...\n' "${key}" "${PROJECT_NAME}" >&2
  printf '%s' "${value}" | npx --yes wrangler --cwd "${ROOT_DIR}" pages secret put "${key}" --project-name "${PROJECT_NAME}"
}

if [[ "${SYNC_CLOUDFLARE}" -eq 1 ]] && ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to sync Cloudflare Pages secrets." >&2
  exit 1
fi

prompt_secret "TURNSTILE_SECRET_KEY" "Turnstile secret key"
prompt_secret "CF_ACCESS_CLIENT_ID" "Cloudflare Access client ID"
prompt_secret "CF_ACCESS_CLIENT_SECRET" "Cloudflare Access client secret"
prompt_secret "LITELLM_API_KEY" "LiteLLM API key"
prompt_secret "ANALYTICS_API_KEY" "Analytics API key" "$(generate_analytics_key)"
prompt_optional_secret "GRAFANA_TOKEN" "Grafana bearer token"

if [[ "${WRITE_LOCAL}" -eq 1 ]]; then
  write_dev_vars_file
fi

if [[ "${SYNC_CLOUDFLARE}" -eq 1 ]]; then
  sync_secret "TURNSTILE_SECRET_KEY"
  sync_secret "CF_ACCESS_CLIENT_ID"
  sync_secret "CF_ACCESS_CLIENT_SECRET"
  sync_secret "LITELLM_API_KEY"
  sync_secret "ANALYTICS_API_KEY"
fi

printf 'Secret bootstrap complete.\n' >&2
