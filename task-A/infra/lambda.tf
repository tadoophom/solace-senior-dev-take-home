resource "aws_lambda_function" "decrypt" {
  function_name = "solace-decrypt-lambda"
  role          = aws_iam_role.lambda_role.arn
  handler       = "handler.handler"
  runtime       = "python3.9"
  filename      = "deployment-package.zip"  # zip of src/
  timeout       = 30

  environment {
    variables = {
      BUCKET = var.bucket_name
      KEY_ID = aws_kms_key.decrypt.key_id
    }
  }
}

resource "aws_lambda_function_url" "decrypt_url" {
  function_name = aws_lambda_function.decrypt.function_name
  authorization_type = "NONE"
}
