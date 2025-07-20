# Task A: Enclave-Style Decryption Service

**Goal**: Emulate a TEE by using AWS Lambda + KMS for "data in use" security.

## Architecture

```text
HTTP POST → Lambda Function URL → Lambda Handler → KMS Decrypt → JSON Response
                ↓
            S3 Bucket (encrypted blobs)
```

### Components
- **Lambda Function**: Python handler that processes decryption requests
- **KMS Key**: `/solace/decrypt` alias with Lambda-only access policy  
- **S3 Bucket**: Encrypted blob storage with bucket policies
- **Lambda Function URL**: Public HTTPS endpoint with CORS

## Requirements Implemented

### 1. Lambda Implementation (`src/`)
**Handler**: Receives blobKey via HTTP POST  
**S3 Integration**: Fetches encrypted blob using AWS SDK  
**KMS Decryption**: Uses KMS Decrypt API with IAM enforcement  
**Response**: Returns `{ plaintext: string }` with CORS headers  

### 2. Infrastructure as Code (`infra/`)
**Terraform**: Complete infrastructure definition  
**Lambda Function**: Memory and timeout optimized for decrypt operations  
**KMS Key**: `/solace/decrypt` alias with restrictive policy  
**S3 Bucket**: Encryption at rest enforced  
**API Gateway**: Lambda Function URL for public access  

### 3. Security Best Practices
**IAM Roles**: Least-privilege permissions  
**Encryption**: S3 server-side encryption enforced  
**Environment Variables**: Configuration via env vars  
**CORS**: Proper headers for web client access  

### 4. Testing
**Sample Data**: Encrypted test blobs provided  
**Test Script**: `decrypt_test.sh` for end-to-end validation  
**Unit Tests**: Comprehensive handler testing  

## Setup Steps

### Prerequisites
- Python ≥3.9
- AWS CLI configured with Lambda, KMS, S3, IAM permissions
- Terraform ≥1.0

### Deployment Commands

1. **Initialize Terraform**:
```bash
cd infra/
terraform init
```

2. **Deploy Infrastructure**:
```bash
terraform apply
```

3. **Test Deployment**:
```bash
./decrypt_test.sh
```

### Example curl Invocation

```bash
# Get function URL from Terraform output
FUNCTION_URL=$(terraform output -raw function_url)

# Test decryption
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"blobKey": "test.blob"}' \
  | jq
```

**Expected Response**:
```json
{
  "plaintext": "Hello, Solace!",
  "size": 14,
  "cached": false,
  "metadata": {
    "encrypted": true,
    "version": "2.0"
  },
  "request_id": "abc123",
  "timestamp": 1640995200
}
```

## File Structure

```
task-A/
├── src/
│   └── handler.py          # Lambda function implementation
├── infra/
│   ├── main.tf            # Main Terraform configuration
│   ├── lambda.tf          # Lambda function resources
│   ├── iam.tf             # IAM roles and policies
│   ├── s3.tf              # S3 bucket configuration
│   ├── outputs.tf         # Terraform outputs
│   └── variables.tf       # Input variables
├── decrypt_test.sh        # End-to-end test script
├── encrypted.blob         # Sample encrypted test data
└── README.md              # This file
```

## Performance & Optimization

- **Connection Pooling**: Reused AWS clients across invocations
- **Caching**: In-memory blob cache for frequently accessed data
- **Memory**: 512MB allocation for optimal cold start performance  
- **Timeout**: 30s to handle large blob processing

## Security Model

- **KMS Key Policy**: Only Lambda execution role can decrypt
- **S3 Bucket Policy**: Lambda read-only access to blob objects
- **IAM Least Privilege**: Minimal required permissions
- **Encryption at Rest**: S3 server-side encryption enforced
- **Transport Security**: HTTPS-only with security headers

## Monitoring

- **CloudWatch Logs**: Structured logging with request tracing
- **CloudWatch Metrics**: Lambda performance and error metrics
- **X-Ray Tracing**: Request flow visualization (optional)

## Testing

### Unit Tests
```bash
cd src/
python -m pytest tests/
```

### Integration Test
```bash
./decrypt_test.sh sample.txt
```

### Load Testing
```bash
# Use the provided test blob for load testing
for i in {1..10}; do
  curl -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -d '{"blobKey": "test.blob"}' &
done
wait
```
