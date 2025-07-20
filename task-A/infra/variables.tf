# Production-grade Terraform variables for Solace decryption service

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-west-2"
}

variable "lambda_memory_size" {
  description = "Memory allocation for Lambda function (MB)"
  type        = number
  default     = 256
  
  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240
    error_message = "Lambda memory must be between 128 and 10240 MB."
  }
}

variable "lambda_timeout" {
  description = "Timeout for Lambda function (seconds)"
  type        = number
  default     = 30
  
  validation {
    condition     = var.lambda_timeout >= 1 && var.lambda_timeout <= 900
    error_message = "Lambda timeout must be between 1 and 900 seconds."
  }
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency for Lambda function"
  type        = number
  default     = 100
  
  validation {
    condition     = var.lambda_reserved_concurrency >= 0 && var.lambda_reserved_concurrency <= 1000
    error_message = "Reserved concurrency must be between 0 and 1000."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log retention period (days)"
  type        = number
  default     = 30
  
  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653
    ], var.log_retention_days)
    error_message = "Log retention must be a valid CloudWatch retention period."
  }
}

variable "kms_deletion_window" {
  description = "KMS key deletion window (days)"
  type        = number
  default     = 30
  
  validation {
    condition     = var.kms_deletion_window >= 7 && var.kms_deletion_window <= 30
    error_message = "KMS deletion window must be between 7 and 30 days."
  }
}

variable "enable_xray_tracing" {
  description = "Enable X-Ray tracing for Lambda function"
  type        = bool
  default     = true
}

variable "enable_monitoring_alarms" {
  description = "Enable CloudWatch monitoring alarms"
  type        = bool
  default     = true
}

variable "alarm_error_threshold" {
  description = "Error count threshold for CloudWatch alarm"
  type        = number
  default     = 5
}

variable "alarm_duration_threshold" {
  description = "Duration threshold for CloudWatch alarm (milliseconds)"
  type        = number
  default     = 25000
}

variable "s3_force_destroy" {
  description = "Allow Terraform to destroy S3 bucket with objects"
  type        = bool
  default     = false
}

variable "cors_allowed_origins" {
  description = "CORS allowed origins for Lambda function URL"
  type        = list(string)
  default     = ["*"]
}

variable "enable_s3_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = true
}

variable "s3_lifecycle_expiration_days" {
  description = "S3 object lifecycle expiration (days)"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
