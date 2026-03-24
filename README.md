# stevemurr.com

Personal site for Steve Murr, built with Hugo and deployed to Cloudflare Pages.

## Stack

- Hugo for site generation
- Cloudflare Pages Functions for same-origin runtime APIs
- Cloudflare KV for analytics counters
- GitHub `main` as the deployment source of truth
- Terraform scaffolding for Cloudflare infrastructure in `infra/terraform`

## Repo Layout

- `content/`: research posts, resume, and page content
- `layouts/`: Hugo templates and partials
- `assets/`: site JavaScript and CSS
- `functions/`: Cloudflare Pages Functions
- `cloudflare/lib/`: shared Cloudflare runtime helpers
- `scripts/`: operational scripts
- `infra/terraform/`: Cloudflare infrastructure definitions
- `docs/operations.md`: operational notes and rebuild flow

## Quick Start

### Prerequisites

- Hugo
- Node.js with `npx`
- GitHub access if you want to refresh activity data
- Terraform if you want to manage Cloudflare infra locally

### Local Build

```bash
make build
```

### Local Pages Runtime

Serve the current `public/` build with Pages Functions:

```bash
make dev
```

Rebuild Hugo output first, then serve:

```bash
make dev-build
```

### Local Secrets

Write local-only secrets into `.dev.vars`:

```bash
make secrets-local
```

Write `.dev.vars` and sync runtime secrets into the Cloudflare Pages project:

```bash
make secrets-bootstrap
```

Rotate a single secret:

```bash
make secrets-update KEY=ANALYTICS_API_KEY
```

Rotate multiple secrets:

```bash
make secrets-update KEYS="TURNSTILE_SECRET_KEY LITELLM_API_KEY"
```

### Activity Data

Refresh the GitHub activity snapshot:

```bash
GITHUB_TOKEN=... make activity-refresh
```

### Functions Build Check

```bash
make functions-build
```

### Infrastructure

```bash
make terraform-init
make terraform-plan
make terraform-apply
```

Copy `infra/terraform/terraform.tfvars.example` to `infra/terraform/terraform.tfvars` first and set `account_id` and `zone_id`.

## Deployment Model

- Push to `main`
- Cloudflare Pages deploys from GitHub
- GitHub Actions refreshes `data/dev_activity.json` on a schedule

## Runtime Secrets

Main production/runtime secrets:

- `TURNSTILE_SECRET_KEY`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`
- `LITELLM_API_KEY`
- `ANALYTICS_API_KEY`

Optional local-only secret:

- `GRAFANA_TOKEN`

See [docs/operations.md](docs/operations.md) for the Cloudflare and Terraform workflow.
