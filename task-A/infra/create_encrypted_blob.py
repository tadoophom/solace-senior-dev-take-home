#!/usr/bin/env python3
import boto3
import json

def create_encrypted_blob():
    # Initialize clients
    kms = boto3.client('kms', region_name='us-west-2')
    s3 = boto3.client('s3', region_name='us-west-2')
    
    # Test data to encrypt
    test_data = "Hello from Solace! This is encrypted test content for the take-home assignment."
    
    # KMS key ID from Terraform output
    key_id = "a856b583-ddc2-44e9-83f5-137017adaed5"
    bucket = "solace-decrypt-blobs"
    
    try:
        # Encrypt the data
        print(f"Encrypting data with KMS key: {key_id}")
        response = kms.encrypt(
            KeyId=key_id,
            Plaintext=test_data.encode('utf-8')
        )
        
        encrypted_blob = response['CiphertextBlob']
        print(f"Encryption successful. Encrypted blob size: {len(encrypted_blob)} bytes")
        
        # Upload encrypted blob to S3
        blob_key = "encrypted-test-blob.bin"
        print(f"Uploading encrypted blob to s3://{bucket}/{blob_key}")
        
        s3.put_object(
            Bucket=bucket,
            Key=blob_key,
            Body=encrypted_blob,
            ContentType='application/octet-stream'
        )
        
        print(f"Successfully uploaded encrypted blob: {blob_key}")
        return blob_key
        
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    result = create_encrypted_blob()
    if result:
        print(f"\nEncrypted blob ready for testing: {result}")
        print("Test with: curl -X POST <function-url> -d '{\"blobKey\": \"encrypted-test-blob.bin\"}'")
    else:
        print("Failed to create encrypted blob") 