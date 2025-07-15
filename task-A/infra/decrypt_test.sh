#!/usr/bin/env bash
set -e
if [ -z "$BUCKET" ] || [ -z "$FUNCTION_URL" ]; then
  echo "ERROR: $BUCKET and $FUNCTION_URL env vars must be set"
  exit 1
fi

PLAINTEXT_FILE=${1:-sample.txt}

# Encrypt sample
aws kms encrypt \
  --key-id alias/solace/decrypt \
  --plaintext fileb://"$PLAINTEXT_FILE" \
  --output text --query CiphertextBlob | base64 --decode > encrypted.blob

# Upload to S3
aws s3 cp encrypted.blob s3://"$BUCKET"/test.blob

# Invoke Lambda URL and pretty-print
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "{\"blobKey\":\"test.blob\"}" | jq .
