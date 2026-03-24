output "pages_project_name" {
  description = "Cloudflare Pages project name."
  value       = cloudflare_pages_project.site.name
}

output "pages_project_subdomain" {
  description = "Default pages.dev hostname for the project."
  value       = cloudflare_pages_project.site.subdomain
}

output "pages_custom_domains" {
  description = "Attached custom domains and their validation status."
  value = {
    for domain_name, domain in cloudflare_pages_domain.site :
    domain_name => domain.status
  }
}

output "counters_kv_namespace_id" {
  description = "KV namespace ID for the COUNTERS binding when Terraform manages it."
  value       = try(cloudflare_workers_kv_namespace.counters[0].id, null)
}
