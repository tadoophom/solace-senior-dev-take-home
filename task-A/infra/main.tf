# Get current user for KMS policy
data "aws_caller_identity" "current" {}

# KMS key for decrypting blobs
resource "aws_kms_key" "decrypt" {
  description             = "Key for Solace decrypt lambda"
  deletion_window_in_days = 7

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Allow the account root full access (default best-practice)
      {
        Sid    = "EnableRootPermissions"
        Effect  = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      # Only the Lambda role may decrypt blobs
      {
        Sid      = "AllowLambdaDecrypt"
        Effect    = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_role.arn
        }
        Action   = ["kms:Decrypt"]
        Resource = "*"
      },
      # Any principal in this AWS account may encrypt (for local tests)
      {
        Sid      = "AllowAccountEncrypt"
        Effect    = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = [
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "decrypt_alias" {
  name          = "alias/solace/decrypt"
  target_key_id = aws_kms_key.decrypt.key_id
}
