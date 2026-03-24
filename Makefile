SHELL := /bin/bash

.PHONY: help build dev dev-build functions-build activity-refresh secrets-bootstrap secrets-local secrets-update terraform-init terraform-plan terraform-apply

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*## ' Makefile | awk 'BEGIN {FS = ":.*## "}; {printf "%-20s %s\n", $$1, $$2}'

build: ## Build the Hugo site
	hugo --minify

dev: ## Serve the current public/ build with Pages Functions locally
	npx --yes wrangler pages dev public

dev-build: ## Rebuild Hugo output, then serve it with Pages Functions locally
	hugo --minify
	npx --yes wrangler pages dev public

functions-build: ## Build Pages Functions locally with Wrangler
	npx --yes wrangler pages functions build

activity-refresh: ## Refresh GitHub activity data (requires GITHUB_TOKEN)
	python3 scripts/generate_dev_activity.py

secrets-bootstrap: ## Prompt for secrets, write .dev.vars, and sync Cloudflare Pages secrets
	./scripts/bootstrap_secrets.sh $(if $(KEY),--key $(KEY),) $(foreach key,$(KEYS),--key $(key))

secrets-local: ## Prompt for secrets and write .dev.vars only
	./scripts/bootstrap_secrets.sh --local-only $(if $(KEY),--key $(KEY),) $(foreach key,$(KEYS),--key $(key))

secrets-update: ## Update specific keys, for example: make secrets-update KEYS="ANALYTICS_API_KEY LITELLM_API_KEY"
	@if [ -z "$(strip $(KEY))$(strip $(KEYS))" ]; then echo "Set KEY=... or KEYS=\"...\""; exit 1; fi
	./scripts/bootstrap_secrets.sh $(if $(KEY),--key $(KEY),) $(foreach key,$(KEYS),--key $(key))

terraform-init: ## Initialize Terraform in infra/terraform
	cd infra/terraform && terraform init

terraform-plan: ## Plan Cloudflare infra changes
	cd infra/terraform && terraform plan

terraform-apply: ## Apply Cloudflare infra changes
	cd infra/terraform && terraform apply
