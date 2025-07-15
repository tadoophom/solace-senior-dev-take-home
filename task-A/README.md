# Solace – Task A

**Enclave-Style Decryption Service (AWS Lambda + KMS)**

This service emulates a trusted-execution environment (TEE) by keeping data encrypted at rest (S3), only decrypting inside an AWS Lambda function that has exclusive access to a dedicated KMS key.  The function is exposed through a Lambda Function URL, allowing any HTTP client to request a plaintext reveal of a previously-uploaded, encrypted blob.

## 1. Architecture

```text
Client ──► S3 (encrypted blob)
        └──► Lambda URL  ─►  Lambda (Python) ─► KMS Decrypt ─► Plaintext JSON
```

* **S3 Bucket** – stores ciphertext blobs (server-side encryption enforced).
* **KMS CMK** (`alias/solace/decrypt`) – only the Lambda’s IAM role has `kms:Decrypt` permissions.
* **Lambda Function** – Python 3.9 runtime, 128 MB memory, 30 s timeout.  Retrieves the object, calls KMS `Decrypt`, and returns `{ "plaintext": string }` with CORS headers.
* **Lambda Function URL** – public HTTPS endpoint (no auth for demo; tighten in prod).
* All resources are provisioned with **Terraform** (see `infra/`).

## 2. Prerequisites

* Python ≥ 3.9
* AWS CLI configured with an account that can create Lambda, IAM, KMS, S3.
* Terraform ≥ 1.0
* jq
* [uv](https://github.com/astral-sh/uv)

## 3. Deployment

1. Clone the repository and move into Task A:

   ```bash
   git clone <repo-url>
   cd solace-senior-dev-take-home/task-A
   ```

2. Build the Lambda deployment package (source + dependencies):

   ```bash
   ./infra/deploy.sh
   ```

   This script:
   * Installs Python dependencies listed in `requirements.txt` into a temporary directory.
   * Copies `src/handler.py`.
   * Produces `infra/deployment-package.zip` which Terraform references.

3. Provision AWS resources:

   ```bash
   cd infra
   terraform init
   terraform apply -auto-approve
   ```

   Useful outputs:

   * `function_url` – HTTPS endpoint
   * `bucket_name` – ciphertext storage bucket
   * `kms_key_id` – CMK ID (for local encryption tests)

## 4. End-to-End Test

After `terraform apply` completes:

```bash
# Export helper vars for the test script
export BUCKET=$(terraform output -raw bucket_name)
export FUNCTION_URL=$(terraform output -raw function_url)

# (Optional) verify
echo "Bucket:        $BUCKET"
echo "Function URL: $FUNCTION_URL"

# Run provided helper – encrypt sample.txt, upload, decrypt via Lambda
./decrypt_test.sh sample.txt
```

You should see output similar to:

```json
{
  "plaintext": "Hello from Solace! This is a sample file."
}
```

### Manual cURL

Assuming you already uploaded `test.blob` to S3:

```bash
curl -X POST "$FUNCTION_URL" \
     -H "Content-Type: application/json" \
     -d '{"blobKey": "test.blob"}'
```

---

## 5. Cleanup

```bash
cd infra
terraform destroy -auto-approve
```