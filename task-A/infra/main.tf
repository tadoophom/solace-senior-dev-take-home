# KMS key for decrypting blobs
resource "aws_kms_key" "decrypt" {
  description             = "Key for Solace decrypt lambda"
  deletion_window_in_days = 7
}

resource "aws_kms_alias" "decrypt_alias" {
  name          = "alias/solace/decrypt"
  target_key_id = aws_kms_key.decrypt.key_id
}
