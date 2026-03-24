SHELL := /bin/bash

.PHONY: help build functions-build activity-refresh secrets-bootstrap secrets-local terraform-init terraform-plan terraform-apply

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*## ' Makefile | awk 'BEGIN {FS = ":.*## "}; {printf "%-20s %s\n", $$1, $$2}'

build: ## Build the Hugo site
	hugo --minify

functions-build: ## Build Pages Functions locally with Wrangler
	npx --yes wrangler pages functions build

activity-refresh: ## Refresh GitHub activity data (requires GITHUB_TOKEN)
	python3 scripts/generate_dev_activity.py

secrets-bootstrap: ## Prompt for secrets, write .dev.vars, and sync Cloudflare Pages secrets
	./scripts/bootstrap_secrets.sh

secrets-local: ## Prompt for secrets and write .dev.vars only
	./scripts/bootstrap_secrets.sh --local-only

terraform-init: ## Initialize Terraform in infra/terraform
	cd infra/terraform && terraform init

terraform-plan: ## Plan Cloudflare infra changes
	cd infra/terraform && terraform plan

terraform-apply: ## Apply Cloudflare infra changes
	cd infra/terraform && terraform apply
