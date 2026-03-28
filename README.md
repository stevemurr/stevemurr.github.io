# stevemurr.com

Personal site for Steve Murr, built with Hugo and deployed to Cloudflare Pages.

## Stack

- Hugo for site generation
- Cloudflare Pages Functions for same-origin runtime APIs
- Cloudflare KV for analytics counters
- GitHub `main` as the deployment source of truth
- Terraform scaffolding for Cloudflare infrastructure in `infra/terraform`

## Repo Layout

- `content/`: research posts, code-page content, and page content
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
- Node.js with `npm` and `npx`
- GitHub access if you want to refresh activity data
- Terraform if you want to manage Cloudflare infra locally

Install the local JS dependency used by Pages Functions front matter parsing:

```bash
npm install
```

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

Admin runtime values are managed through the same flow:

- `GITHUB_CONTENTS_TOKEN`
- `ADMIN_EMAIL`
- `GITHUB_COMMITTER_NAME`
- `GITHUB_COMMITTER_EMAIL`

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
- `GITHUB_CONTENTS_TOKEN`
- `ADMIN_EMAIL`
- `GITHUB_COMMITTER_NAME`
- `GITHUB_COMMITTER_EMAIL`

Optional local-only secret:

- `GRAFANA_TOKEN`

## Admin

The repo includes a private `/admin/` surface for post and code-page editing.

- Protect `/admin*` and `/api/admin/*` with Cloudflare Access.
- Set `ADMIN_EMAIL` to the exact Cloudflare Access-authenticated email that should be allowed through the server-side check.
- Keep `ACCESS_TEAM_DOMAIN` and `ACCESS_APPLICATION_AUD` in [wrangler.toml](/Users/murr/Code/github.com/stevemurr/stevemurr.github.io/wrangler.toml) aligned with the Cloudflare Access app protecting those paths.
- Create a fine-grained GitHub PAT with repository `Contents: write` permission and store it as `GITHUB_CONTENTS_TOKEN`.
- The admin writes directly to `main` through the GitHub contents API.

See [docs/operations.md](docs/operations.md) for the Cloudflare and Terraform workflow.
