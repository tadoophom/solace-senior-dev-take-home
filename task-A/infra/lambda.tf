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
  
  cors {
    allow_credentials = false
    allow_headers     = ["content-type"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    expose_headers    = ["date", "keep-alive"]
    max_age          = 86400
  }
}

resource "aws_lambda_permission" "public_invoke" {
  statement_id            = "AllowPublicFunctionURLInvoke"
  action                  = "lambda:InvokeFunctionUrl"
  function_name           = aws_lambda_function.decrypt.function_name
  principal               = "*"
  function_url_auth_type  = "NONE"
}
