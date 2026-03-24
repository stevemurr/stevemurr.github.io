locals {
  pages_source = var.manage_github_source ? {
    type = "github"
    config = {
      deployments_enabled            = true
      owner                          = var.github_owner
      owner_id                       = tostring(var.github_owner_id)
      path_excludes                  = []
      path_includes                  = []
      pr_comments_enabled            = true
      preview_branch_excludes        = []
      preview_branch_includes        = []
      preview_deployment_setting     = "all"
      production_branch              = var.production_branch
      production_deployments_enabled = true
      repo_id                        = tostring(var.github_repo_id)
      repo_name                      = var.github_repo_name
    }
  } : null
}

resource "cloudflare_pages_project" "site" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch

  build_config = {
    build_command   = var.build_command
    destination_dir = var.destination_dir
    root_dir        = var.root_dir
  }

  source = local.pages_source
}

resource "cloudflare_pages_domain" "site" {
  for_each = toset(var.custom_domains)

  account_id   = var.account_id
  project_name = cloudflare_pages_project.site.name
  name         = each.value
}

resource "cloudflare_workers_kv_namespace" "counters" {
  count = var.manage_counters_kv_namespace ? 1 : 0

  account_id = var.account_id
  title      = var.counters_kv_title
}

resource "cloudflare_dns_record" "additional" {
  for_each = var.additional_dns_records

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  content = try(each.value.content, null)
  ttl     = try(each.value.ttl, 1)
  proxied = try(each.value.proxied, null)
  comment = try(each.value.comment, null)
}
