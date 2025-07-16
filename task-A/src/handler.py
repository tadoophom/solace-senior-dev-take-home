import json
import os
import base64
import boto3
from botocore.exceptions import ClientError
import logging
import uuid

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Lambda handler for uploading/downloading encrypted blobs to/from S3 using KMS.
    - POST with binary data (Content-Type: application/octet-stream): Upload blob
    - POST with JSON body containing blobKey: Download/decrypt blob
    """
    # CORS headers for all responses
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    }
    
    try:
        # Handle preflight OPTIONS request (Lambda Function URL format)
        request_method = event.get("requestContext", {}).get("http", {}).get("method")
        if request_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
            return {
                "statusCode": 200,
                "headers": headers,
                "body": ""
            }
        
        # Get environment variables
        bucket_name = os.environ.get("BUCKET")
        kms_key_id = os.environ.get("KEY_ID")
        if not bucket_name:
            logger.error("BUCKET environment variable not set")
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"error": "Internal server error"})
            }
        
        # Initialize AWS clients
        s3_client = boto3.client("s3")
        kms_client = boto3.client("kms")
        
        # Determine operation based on Content-Type (check both API Gateway and Function URL formats)
        content_type = (
            event.get("headers", {}).get("content-type", "") or
            event.get("headers", {}).get("Content-Type", "")
        ).lower()
        
        if content_type == "application/octet-stream":
            # Upload operation
            return handle_upload(event, s3_client, kms_client, bucket_name, kms_key_id, headers)
        else:
            # Download/decrypt operation (default)
            return handle_download(event, s3_client, kms_client, bucket_name, headers)
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Internal server error"})
        }

def handle_upload(event, s3_client, kms_client, bucket_name, kms_key_id, headers):
    """Handle blob upload and encryption"""
    try:
        # Get binary data from request body
        body = event.get("body", "")
        is_base64 = event.get("isBase64Encoded", False)
        
        if is_base64:
            blob_data = base64.b64decode(body)
        else:
            blob_data = body.encode('utf-8') if isinstance(body, str) else body
        
        # Generate unique blob key
        blob_key = str(uuid.uuid4()) + ".blob"
        
        # Encrypt data using KMS
        logger.info(f"Encrypting blob data with KMS key: {kms_key_id}")
        kms_response = kms_client.encrypt(
            KeyId=kms_key_id,
            Plaintext=blob_data
        )
        encrypted_blob = kms_response["CiphertextBlob"]
        
        # Upload encrypted blob to S3
        logger.info(f"Uploading encrypted blob: {blob_key} to bucket: {bucket_name}")
        s3_client.put_object(
            Bucket=bucket_name,
            Key=blob_key,
            Body=encrypted_blob,
            ContentType="application/octet-stream"
        )
        
        logger.info(f"Successfully uploaded blob: {blob_key}")
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"blobKey": blob_key})
        }
        
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        logger.error(f"AWS error during upload: {error_code}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Upload failed"})
        }
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Upload failed"})
        }

def handle_download(event, s3_client, kms_client, bucket_name, headers):
    """Handle blob download and decryption"""
    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        blob_key = body.get("blobKey")
        
        if not blob_key:
            logger.warning("Missing blobKey in request")
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "blobKey is required"})
            }
        
        # Fetch encrypted blob from S3
        logger.info(f"Fetching blob: {blob_key} from bucket: {bucket_name}")
        try:
            s3_response = s3_client.get_object(Bucket=bucket_name, Key=blob_key)
            encrypted_blob = s3_response["Body"].read()
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "NoSuchKey":
                logger.warning(f"Blob not found: {blob_key}")
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"error": "Blob not found"})
                }
            else:
                logger.error(f"S3 error: {error_code}")
                return {
                    "statusCode": 500,
                    "headers": headers,
                    "body": json.dumps({"error": "Failed to fetch blob"})
                }
        
        # Decrypt blob using KMS
        logger.info("Decrypting blob with KMS")
        try:
            kms_response = kms_client.decrypt(CiphertextBlob=encrypted_blob)
            plaintext_bytes = kms_response["Plaintext"]
            plaintext = plaintext_bytes.decode("utf-8")
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            logger.error(f"KMS decrypt error: {error_code}")
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"error": "Decryption failed"})
            }
        except UnicodeDecodeError:
            logger.error("Failed to decode decrypted data as UTF-8")
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"error": "Invalid data format"})
            }
        
        logger.info("Successfully decrypted blob")
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"plaintext": plaintext})
        }
        
    except json.JSONDecodeError:
        logger.warning("Invalid JSON in request body")
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Invalid JSON"})
        }
