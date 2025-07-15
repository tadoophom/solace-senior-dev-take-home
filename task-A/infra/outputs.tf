output "function_url" {
  description = "Lambda function URL for testing"
  value       = aws_lambda_function_url.decrypt_url.function_url
}

output "bucket_name" {
  description = "S3 bucket name for encrypted blobs"
  value       = aws_s3_bucket.blobs.bucket
}

output "kms_key_id" {
  description = "KMS key ID for encryption"
  value       = aws_kms_key.decrypt.key_id
} 