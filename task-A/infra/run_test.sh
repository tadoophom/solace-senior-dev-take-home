#!/bin/bash
# Helper script to run the decrypt test with proper environment variables

# Source the .env file from the project root
source ../../.env

# Set the required variables for the test script
export BUCKET="$SOLACE_S3_BUCKET"
export FUNCTION_URL="$SOLACE_LAMBDA_URL"

echo "Using:"
echo "  BUCKET: $BUCKET"
echo "  FUNCTION_URL: $FUNCTION_URL"
echo "  AWS_REGION: $AWS_REGION"
echo ""

# Run the decrypt test
./decrypt_test.sh "$@"
