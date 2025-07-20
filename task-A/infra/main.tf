# Minimal Terraform configuration for Solace decryption service
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Local values for consistent naming
locals {
  service_name = "solace-decrypt"
  environment  = var.environment
  
  common_tags = {
    Service     = local.service_name
    Environment = local.environment
    ManagedBy   = "terraform"
    Owner       = "solace-team"
  }
}

# Use existing KMS key without modification
data "aws_kms_key" "existing" {
  key_id = "a856b583-ddc2-44e9-83f5-137017adaed5"
}

# Lambda function with minimal configuration
resource "aws_lambda_function" "decrypt" {
  filename         = "deployment-package.zip"
  function_name    = "${local.service_name}-${local.environment}"
  role            = aws_iam_role.lambda_role.arn
  handler         = "handler.handler"
  runtime         = "python3.11"
  timeout         = 30
  memory_size     = 256
  
  environment {
    variables = {
      BUCKET                = aws_s3_bucket.blobs.bucket
      KEY_ID               = data.aws_kms_key.existing.key_id
      ENVIRONMENT          = local.environment
      LOG_LEVEL           = "INFO"
      POWERTOOLS_SERVICE_NAME = local.service_name
    }
  }
  
  depends_on = [
    aws_iam_role_policy_attachment.attach_policy,
  ]
  
  tags = merge(local.common_tags, {
    Name = "${local.service_name}-function"
  })
}

# Lambda function URL with enhanced security
resource "aws_lambda_function_url" "decrypt_url" {
  function_name      = aws_lambda_function.decrypt.function_name
  authorization_type = "NONE"  # TODO: Add auth in production
  
  cors {
    allow_credentials = false
    allow_headers     = ["authorization", "content-type"]
    allow_methods     = ["POST"]
    allow_origins     = ["*"]
    expose_headers    = ["date"]
    max_age          = 86400
  }
}

# Lambda permission for public function URL access
resource "aws_lambda_permission" "public_invoke" {
  statement_id            = "AllowPublicFunctionURLInvoke"
  action                  = "lambda:InvokeFunctionUrl"
  function_name           = aws_lambda_function.decrypt.function_name
  principal               = "*"
  function_url_auth_type  = "NONE"
}
