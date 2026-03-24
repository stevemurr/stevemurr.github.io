# Cloudflare Infra

This directory captures the site's Cloudflare infrastructure in Terraform:

- `cloudflare_pages_project` for the Pages app
- `cloudflare_pages_domain` for `stevemurr.com` and `www.stevemurr.com`
- optional `cloudflare_workers_kv_namespace` for the `COUNTERS` binding
- optional `cloudflare_dns_record` resources for any extra zone records outside the Pages hostnames

What stays outside Terraform:

- secret values
- Turnstile widget configuration
- one-time GitHub authorization inside the Cloudflare account if the Pages project is Git-backed

See [docs/operations.md](../../docs/operations.md) for the adoption and rebuild workflow.
