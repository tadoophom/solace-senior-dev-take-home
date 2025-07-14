variable "bucket_name" {
  description = "S3 bucket for encrypted blobs"
  type        = string
  default     = "solace-decrypt-blobs"
}

resource "aws_s3_bucket" "blobs" {
  bucket = var.bucket_name

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket_policy" "blobs_policy" {
  bucket = aws_s3_bucket.blobs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowLambdaRead"
      Effect    = "Allow"
      Principal = { AWS = aws_iam_role.lambda_role.arn }
      Action    = ["s3:GetObject"]
      Resource  = ["${aws_s3_bucket.blobs.arn}/*"]
    }]
  })
}
