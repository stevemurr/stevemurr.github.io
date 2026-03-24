# Operations

## Model

The repo is now split into two concerns:

- app code and Pages Functions live in Git and deploy from `main`
- Cloudflare infrastructure is described in `infra/terraform`

This gives you a cleaner source of truth than ad hoc dashboard edits, while still letting Cloudflare hold encrypted secrets.

## What Terraform Manages

- the Pages project
- GitHub source settings for the Pages project
- custom domains attached to the Pages project
- optional extra DNS records in the `stevemurr.com` zone
- optional `COUNTERS` KV namespace ownership

## What Stays Manual

- `TURNSTILE_SECRET_KEY`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`
- `LITELLM_API_KEY`
- `ANALYTICS_API_KEY`
- Turnstile widget hostnames and dashboard-level widget settings

Secrets stay out of Git because Cloudflare Pages secrets are encrypted bindings. Treat them as write-only and reapply them when rebuilding an environment.

## Bootstrap

1. Install Terraform locally.
2. Create a Cloudflare API token with at least:
   - `Pages Write`
   - `DNS Write`
   - `Workers KV Storage Write`
3. Export it as `CLOUDFLARE_API_TOKEN`.
4. Copy `infra/terraform/terraform.tfvars.example` to `infra/terraform/terraform.tfvars`.
5. Fill in `account_id` and `zone_id`.
6. Run:

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

## Secret Bootstrap

The repo now includes a small secret bootstrap flow:

- `make secrets-bootstrap` prompts for secret values, writes `.dev.vars`, and syncs the same values into Cloudflare Pages
- `make secrets-local` only writes `.dev.vars`
- `make secrets-update KEY=ANALYTICS_API_KEY` rotates a single secret without prompting for the rest
- `make secrets-update KEYS="TURNSTILE_SECRET_KEY LITELLM_API_KEY"` rotates multiple specific secrets
- the bootstrap script can also store an optional local `GRAFANA_TOKEN`, but it does not push that token to Pages by default

The underlying script is [scripts/bootstrap_secrets.sh](../scripts/bootstrap_secrets.sh), and the local file template is [.dev.vars.example](../.dev.vars.example).

## Adopting Existing Cloudflare Resources

Because the current site already exists in Cloudflare, do not point Terraform at the account and immediately apply without first reviewing the plan.

Use one of these approaches:

- import the existing Pages project, attached domains, and KV namespace into Terraform state before the first apply
- or apply this config into a clean account / clean zone and let Terraform create the infrastructure from scratch

The import-first path is safer for the current production account because it avoids duplicate Pages projects, duplicate domains, and a second KV namespace.

## Rebuild Caveats

You can rebuild most of the Cloudflare side from this directory, but there are still a few caveats:

- secrets are not recoverable from Cloudflare after they are set, so they must be reapplied
- GitHub-backed Pages creation assumes the Cloudflare account is already authorized to access the GitHub repo
- if Terraform creates a fresh `COUNTERS` namespace instead of importing the existing one, update the namespace ID in `wrangler.toml`

## Pages Secrets

Run these from the repo root after the Pages project exists if you want to set individual secrets by hand:

```bash
npx --yes wrangler pages secret put TURNSTILE_SECRET_KEY
npx --yes wrangler pages secret put CF_ACCESS_CLIENT_ID
npx --yes wrangler pages secret put CF_ACCESS_CLIENT_SECRET
npx --yes wrangler pages secret put LITELLM_API_KEY
npx --yes wrangler pages secret put ANALYTICS_API_KEY
```

## Notes

- `wrangler.toml` remains the source of truth for Pages Functions runtime bindings used by local development and deployments.
- `infra/terraform` owns the infrastructure envelope around that runtime.
