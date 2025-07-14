import json

def handler(event, context):
    body = json.loads(event.get("body", "{}"))
    blob_key = body.get("blobKey")
    # TODO: fetch from S3, decrypt with KMS, return plaintext
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"plaintext": ""})
    }
