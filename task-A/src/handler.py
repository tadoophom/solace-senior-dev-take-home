import json
import os
import base64
import boto3
from botocore.exceptions import ClientError
from aws_lambda_powertools import Logger

logger = Logger()

def handler(event, context):
    """
    Lambda handler for decrypting blobs from S3 using KMS.
    Expects POST with JSON body containing blobKey.
    """
    # CORS headers for all responses
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    }
    
    try:
        # Handle preflight OPTIONS request
        if event.get("httpMethod") == "OPTIONS":
            return {
                "statusCode": 200,
                "headers": headers,
                "body": ""
            }
        
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
        
        # Get environment variables
        bucket_name = os.environ.get("BUCKET")
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
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Internal server error"})
        }
