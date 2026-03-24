variable "account_id" {
  description = "Cloudflare account ID that owns the Pages project."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID for stevemurr.com."
  type        = string
}

variable "project_name" {
  description = "Cloudflare Pages project name."
  type        = string
  default     = "stevemurr-github-io"
}

variable "production_branch" {
  description = "Git branch used for production deploys."
  type        = string
  default     = "main"
}

variable "build_command" {
  description = "Pages build command."
  type        = string
  default     = "hugo --minify"
}

variable "destination_dir" {
  description = "Pages publish directory."
  type        = string
  default     = "public"
}

variable "root_dir" {
  description = "Pages build root directory."
  type        = string
  default     = "/"
}

variable "custom_domains" {
  description = "Custom domains attached to the Pages project."
  type        = list(string)
  default     = ["stevemurr.com", "www.stevemurr.com"]
}

variable "manage_github_source" {
  description = "Whether Terraform should manage the Pages GitHub source configuration."
  type        = bool
  default     = true
}

variable "github_owner" {
  description = "GitHub owner for the Pages source repository."
  type        = string
  default     = "stevemurr"
}

variable "github_owner_id" {
  description = "GitHub owner numeric ID."
  type        = number
  default     = 11822551
}

variable "github_repo_name" {
  description = "GitHub repository name used by the Pages project."
  type        = string
  default     = "stevemurr.github.io"
}

variable "github_repo_id" {
  description = "GitHub repository numeric ID."
  type        = number
  default     = 1176088760
}

variable "manage_counters_kv_namespace" {
  description = "Whether Terraform should create/import the COUNTERS KV namespace."
  type        = bool
  default     = false
}

variable "counters_kv_title" {
  description = "Title for the COUNTERS KV namespace if Terraform manages it."
  type        = string
  default     = "stevemurr-site-counters"
}

variable "additional_dns_records" {
  description = "Optional extra DNS records to manage in the zone."
  type = map(object({
    name    = string
    type    = string
    content = optional(string)
    ttl     = optional(number)
    proxied = optional(bool)
    comment = optional(string)
  }))
  default = {}
}
