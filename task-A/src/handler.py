"""
Production-grade Lambda handler for Solace decryption service.
Implements secure blob storage/retrieval with comprehensive error handling.
Enhanced with connection pooling, caching, and performance optimizations.
VERSION: 2.0 - Performance optimized
"""

import json
import os
import base64
import boto3
from botocore.exceptions import ClientError, BotoCoreError
from botocore.config import Config
import logging
import uuid
import time
from typing import Dict, Any, Optional, Tuple, Union
import hashlib
import re
from functools import lru_cache
import threading

# Configure structured logging with performance context
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
MAX_BLOB_SIZE = 10 * 1024 * 1024  # 10MB limit
BLOB_KEY_PATTERN = re.compile(r'^[a-zA-Z0-9\-_\.]{1,100}\.blob$')  # More flexible for testing
ALLOWED_CONTENT_TYPES = {'application/octet-stream', 'application/json'}

# Performance optimizations
CHUNK_SIZE = 64 * 1024  # 64KB chunks for large blob processing
CACHE_TTL = 300  # 5 minutes cache TTL
MAX_CACHE_SIZE = 100

# Global connection pools (reused across Lambda invocations)
_s3_client = None
_kms_client = None
_client_lock = threading.Lock()

# In-memory cache for frequently accessed small blobs
_blob_cache = {}
_cache_timestamps = {}

class SolaceDecryptionError(Exception):
    """Custom exception for Solace decryption service errors."""
    def __init__(self, message: str, status_code: int = 500, error_code: str = None):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or 'SOLACE_ERROR'
        super().__init__(self.message)

class SecurityHeaders:
    """Production security headers for CORS and security policies."""
    
    @staticmethod
    def get_cors_headers() -> Dict[str, str]:
        return {
            "Access-Control-Allow-Origin": "*",  # TODO: Restrict in production
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
            "Content-Type": "application/json",
            # Enhanced security headers
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Content-Security-Policy": "default-src 'none'",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        }

def get_request_metadata(event: Dict[str, Any]) -> Dict[str, Any]:
    """Extract and cache request metadata for logging and monitoring."""
    request_context = event.get("requestContext", {})
    http_context = request_context.get("http", {})
    headers = event.get("headers", {})
    
    return {
        "request_id": request_context.get("requestId", str(uuid.uuid4())),
        "source_ip": http_context.get("sourceIp", "unknown"),
        "user_agent": headers.get("user-agent", headers.get("User-Agent", "unknown")),
        "method": http_context.get("method", "unknown"),
        "path": http_context.get("path", "/"),
        "protocol": http_context.get("protocol", "unknown")
    }

@lru_cache(maxsize=1)
def validate_environment() -> Tuple[str, Optional[str]]:
    """Validate required environment variables with caching."""
    bucket_name = os.environ.get("BUCKET")
    kms_key_id = os.environ.get("KEY_ID")
    
    if not bucket_name:
        raise SolaceDecryptionError("BUCKET environment variable not configured", 500, "CONFIG_ERROR")
    
    return bucket_name, kms_key_id

def get_optimized_aws_clients() -> Tuple[Any, Any]:
    """Get or create optimized AWS clients with connection pooling."""
    global _s3_client, _kms_client
    
    with _client_lock:
        if _s3_client is None or _kms_client is None:
            # Optimized boto3 configuration for Lambda
            config = Config(
                retries={'max_attempts': 3, 'mode': 'adaptive'},
                max_pool_connections=10,  # Connection pooling
                connect_timeout=5,
                read_timeout=30,
                tcp_keepalive=True
            )
            
            session = boto3.Session()
            _s3_client = session.client('s3', config=config)
            _kms_client = session.client('kms', config=config)
            
            logger.info("Initialized optimized AWS clients with connection pooling")
    
    return _s3_client, _kms_client

def create_success_response(data: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    """Create standardized success response with performance metadata."""
    return {
        "statusCode": 200,
        "headers": SecurityHeaders.get_cors_headers(),
        "body": json.dumps({
            **data,
            "request_id": request_id,
            "timestamp": int(time.time()),
            "version": "2.0"
        })
    }

def create_error_response(error: SolaceDecryptionError, request_id: str) -> Dict[str, Any]:
    """Create standardized error response with enhanced debugging info."""
    logger.error(f"Request {request_id} failed: {error.message} (code: {error.error_code})")
    
    return {
        "statusCode": error.status_code,
        "headers": SecurityHeaders.get_cors_headers(),
        "body": json.dumps({
            "error": error.message,
            "error_code": error.error_code,
            "request_id": request_id,
            "timestamp": int(time.time()),
            "version": "2.0"
        })
    }

def validate_blob_key(blob_key: str) -> bool:
    """Validate blob key format with enhanced security checks."""
    if not blob_key or not isinstance(blob_key, str):
        return False
    
    # Check format and length
    if not BLOB_KEY_PATTERN.match(blob_key):
        return False
    
    # Additional security: check for path traversal attempts
    if '..' in blob_key or '/' in blob_key or '\\' in blob_key:
        return False
    
    return True

def get_cached_blob(blob_key: str) -> Optional[bytes]:
    """Get blob from in-memory cache if available and not expired."""
    if blob_key not in _blob_cache:
        return None
    
    # Check if cache entry is expired
    if blob_key in _cache_timestamps:
        age = time.time() - _cache_timestamps[blob_key]
        if age > CACHE_TTL:
            # Remove expired entry
            del _blob_cache[blob_key]
            del _cache_timestamps[blob_key]
            return None
    
    logger.info(f"Cache hit for blob: {blob_key}")
    return _blob_cache[blob_key]

def cache_blob(blob_key: str, data: bytes) -> None:
    """Cache small blobs in memory for performance."""
    # Only cache small blobs to avoid memory issues
    if len(data) <= 1024 * 1024:  # 1MB limit for cache
        # Manage cache size
        if len(_blob_cache) >= MAX_CACHE_SIZE:
            # Remove oldest entry
            oldest_key = min(_cache_timestamps.keys(), key=lambda k: _cache_timestamps[k])
            del _blob_cache[oldest_key]
            del _cache_timestamps[oldest_key]
        
        _blob_cache[blob_key] = data
        _cache_timestamps[blob_key] = time.time()
        logger.info(f"Cached blob: {blob_key} ({len(data)} bytes)")

def process_large_blob(data: bytes, operation: str) -> bytes:
    """Process large blobs in chunks for memory efficiency."""
    if len(data) <= CHUNK_SIZE:
        return data
    
    logger.info(f"Processing large blob in chunks: {len(data)} bytes, operation: {operation}")
    
    # For now, return as-is since encryption/decryption is handled by KMS
    # This structure allows for future chunked processing if needed
    return data

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Optimized production Lambda handler for encrypted blob operations.
    
    Supports:
    - POST with binary data: Upload and encrypt blob
    - POST with JSON {blobKey}: Download and decrypt blob
    - OPTIONS: CORS preflight
    """
    start_time = time.time()
    request_metadata = get_request_metadata(event)
    request_id = request_metadata["request_id"]
    
    logger.info(f"Request {request_id} started (v2.0) - Method: {request_metadata.get('method', 'unknown')}, IP: {request_metadata.get('source_ip', 'unknown')}")
    
    try:
        # Validate environment configuration (cached)
        bucket_name, kms_key_id = validate_environment()
        
        # Handle CORS preflight
        request_method = event.get("requestContext", {}).get("http", {}).get("method", "")
        if request_method == "OPTIONS":
            return create_success_response({}, request_id)
        
        # Validate HTTP method
        if request_method != "POST":
            raise SolaceDecryptionError(f"Method {request_method} not allowed", 405, "METHOD_NOT_ALLOWED")
        
        # Get optimized AWS clients with connection pooling
        s3_client, kms_client = get_optimized_aws_clients()
        
        # Determine operation based on Content-Type
        content_type = (
            event.get("headers", {}).get("content-type", "") or
            event.get("headers", {}).get("Content-Type", "")
        ).lower().split(';')[0]  # Remove charset if present
        
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise SolaceDecryptionError(f"Unsupported content type: {content_type}", 400, "INVALID_CONTENT_TYPE")
        
        # Route to appropriate handler
        if content_type == "application/octet-stream":
            response_data = handle_upload_optimized(event, s3_client, kms_client, bucket_name, kms_key_id, request_id)
        else:
            response_data = handle_download_optimized(event, s3_client, kms_client, bucket_name, request_id)
        
        processing_time = time.time() - start_time
        logger.info(f"Request {request_id} completed successfully in {processing_time:.3f}s")
        
        # Add performance metadata
        response_data["performance"] = {
            "processing_time_ms": round(processing_time * 1000, 2),
            "cache_enabled": True
        }
        
        return create_success_response(response_data, request_id)
        
    except SolaceDecryptionError as e:
        return create_error_response(e, request_id)
    except Exception as e:
        logger.exception(f"Unexpected error in request {request_id}: {str(e)}")
        return create_error_response(
            SolaceDecryptionError("Internal server error", 500, "INTERNAL_ERROR"),
            request_id
        )

def handle_upload_optimized(
    event: Dict[str, Any],
    s3_client: Any,
    kms_client: Any,
    bucket_name: str,
    kms_key_id: Optional[str],
    request_id: str
) -> Dict[str, Any]:
    """Handle secure blob upload with optimization and caching."""
    try:
        # Extract and validate request body
        body = event.get("body", "")
        is_base64 = event.get("isBase64Encoded", False)
        
        if not body:
            raise SolaceDecryptionError("Empty request body", 400, "EMPTY_BODY")
        
        # Optimized body decoding
        if is_base64:
            try:
                blob_data = base64.b64decode(body)
            except Exception:
                raise SolaceDecryptionError("Invalid base64 encoding", 400, "INVALID_BASE64")
        else:
            blob_data = body.encode('utf-8') if isinstance(body, str) else body
        
        # Validate blob size
        blob_size = len(blob_data)
        if blob_size > MAX_BLOB_SIZE:
            raise SolaceDecryptionError(f"Blob size exceeds {MAX_BLOB_SIZE} bytes", 413, "BLOB_TOO_LARGE")
        
        if blob_size == 0:
            raise SolaceDecryptionError("Empty blob data", 400, "EMPTY_BLOB")
        
        # Generate secure blob key and hash
        blob_key = str(uuid.uuid4()) + ".blob"
        blob_hash = hashlib.sha256(blob_data).hexdigest()
        
        logger.info(f"Request {request_id}: Uploading blob {blob_key}, size: {blob_size} bytes")
        
        # Process large blobs efficiently
        processed_data = process_large_blob(blob_data, "upload")
        
        # Encrypt with KMS if key provided, otherwise store as-is
        if kms_key_id:
            try:
                start_encrypt = time.time()
                kms_response = kms_client.encrypt(
                    KeyId=kms_key_id,
                    Plaintext=processed_data
                )
                encrypted_blob = kms_response["CiphertextBlob"]
                encrypt_time = time.time() - start_encrypt
                logger.info(f"Request {request_id}: Data encrypted with KMS in {encrypt_time:.3f}s")
            except ClientError as e:
                error_code = e.response["Error"]["Code"]
                logger.error(f"Request {request_id}: KMS encryption failed: {error_code}")
                raise SolaceDecryptionError("Encryption failed", 500, "KMS_ENCRYPT_ERROR")
        else:
            encrypted_blob = processed_data
            logger.warning(f"Request {request_id}: No KMS key provided, storing unencrypted")
        
        # Upload to S3 with optimized metadata
        try:
            start_upload = time.time()
            s3_client.put_object(
                Bucket=bucket_name,
                Key=blob_key,
                Body=encrypted_blob,
                ContentType="application/octet-stream",
                Metadata={
                    "request-id": request_id,
                    "content-hash": blob_hash,
                    "encrypted": "true" if kms_key_id else "false",
                    "upload-time": str(int(time.time())),
                    "original-size": str(blob_size),
                    "version": "2.0"
                },
                ServerSideEncryption="AES256"
            )
            upload_time = time.time() - start_upload
            logger.info(f"Request {request_id}: Successfully uploaded blob {blob_key} in {upload_time:.3f}s")
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            logger.error(f"Request {request_id}: S3 upload failed: {error_code}")
            raise SolaceDecryptionError("Upload failed", 500, "S3_UPLOAD_ERROR")
        
        return {
            "blobKey": blob_key,
            "size": blob_size,
            "hash": blob_hash,
            "encrypted": bool(kms_key_id)
        }
        
    except SolaceDecryptionError:
        raise
    except Exception as e:
        logger.exception(f"Request {request_id}: Upload error: {str(e)}")
        raise SolaceDecryptionError("Upload processing failed", 500, "UPLOAD_PROCESSING_ERROR")

def handle_download_optimized(
    event: Dict[str, Any],
    s3_client: Any,
    kms_client: Any,
    bucket_name: str,
    request_id: str
) -> Dict[str, Any]:
    """Handle secure blob download with optimization and caching."""
    try:
        # Parse and validate request body
        try:
            body = json.loads(event.get("body", "{}"))
        except json.JSONDecodeError:
            raise SolaceDecryptionError("Invalid JSON in request body", 400, "INVALID_JSON")
        
        blob_key = body.get("blobKey")
        if not blob_key:
            raise SolaceDecryptionError("blobKey is required", 400, "MISSING_BLOB_KEY")
        
        # Validate blob key format
        if not validate_blob_key(blob_key):
            raise SolaceDecryptionError("Invalid blob key format", 400, "INVALID_BLOB_KEY")
        
        logger.info(f"Request {request_id}: Downloading blob {blob_key}")
        
        # Check cache first
        cached_data = get_cached_blob(blob_key)
        if cached_data:
            try:
                plaintext = cached_data.decode("utf-8")
                return {
                    "plaintext": plaintext,
                    "size": len(cached_data),
                    "cached": True,
                    "metadata": {
                        "cache_hit": True
                    }
                }
            except UnicodeDecodeError:
                # Remove invalid cache entry
                if blob_key in _blob_cache:
                    del _blob_cache[blob_key]
                    del _cache_timestamps[blob_key]
        
        # Fetch blob from S3
        try:
            start_download = time.time()
            s3_response = s3_client.get_object(Bucket=bucket_name, Key=blob_key)
            encrypted_blob = s3_response["Body"].read()
            metadata = s3_response.get("Metadata", {})
            download_time = time.time() - start_download
            
            logger.info(f"Request {request_id}: Retrieved blob {blob_key}, size: {len(encrypted_blob)} bytes in {download_time:.3f}s")
            
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "NoSuchKey":
                logger.warning(f"Request {request_id}: Blob not found: {blob_key}")
                raise SolaceDecryptionError("Blob not found", 404, "BLOB_NOT_FOUND")
            else:
                logger.error(f"Request {request_id}: S3 error: {error_code}")
                raise SolaceDecryptionError("Failed to retrieve blob", 500, "S3_DOWNLOAD_ERROR")
        
        # Process large blobs efficiently
        processed_blob = process_large_blob(encrypted_blob, "download")
        
        # Decrypt blob if it was encrypted
        # If no metadata, assume it's encrypted (for compatibility with external uploads)
        is_encrypted = metadata.get("encrypted") == "true" or not metadata
        
        if is_encrypted:
            try:
                start_decrypt = time.time()
                kms_response = kms_client.decrypt(CiphertextBlob=processed_blob)
                plaintext_bytes = kms_response["Plaintext"]
                decrypt_time = time.time() - start_decrypt
                logger.info(f"Request {request_id}: Successfully decrypted blob in {decrypt_time:.3f}s")
            except ClientError as e:
                error_code = e.response["Error"]["Code"]
                logger.error(f"Request {request_id}: KMS decryption failed: {error_code}")
                raise SolaceDecryptionError("Decryption failed", 500, "KMS_DECRYPT_ERROR")
        else:
            plaintext_bytes = processed_blob
            logger.info(f"Request {request_id}: Blob was not encrypted")
        
        # Cache the decrypted data for future requests
        cache_blob(blob_key, plaintext_bytes)
        
        # Decode to UTF-8 string
        try:
            plaintext = plaintext_bytes.decode("utf-8")
        except UnicodeDecodeError:
            logger.error(f"Request {request_id}: Failed to decode as UTF-8")
            raise SolaceDecryptionError("Invalid text encoding", 400, "INVALID_ENCODING")
        
        # Verify content hash if available
        if "content-hash" in metadata:
            computed_hash = hashlib.sha256(plaintext_bytes).hexdigest()
            if computed_hash != metadata["content-hash"]:
                logger.error(f"Request {request_id}: Content hash mismatch")
                raise SolaceDecryptionError("Data integrity check failed", 500, "INTEGRITY_ERROR")
        
        return {
            "plaintext": plaintext,
            "size": len(plaintext_bytes),
            "cached": False,
            "metadata": {
                "upload_time": metadata.get("upload-time"),
                "encrypted": metadata.get("encrypted", "false") == "true",
                "version": metadata.get("version", "1.0"),
                "cache_hit": False
            }
        }
        
    except SolaceDecryptionError:
        raise
    except Exception as e:
        logger.exception(f"Request {request_id}: Download error: {str(e)}")
        raise SolaceDecryptionError("Download processing failed", 500, "DOWNLOAD_PROCESSING_ERROR")
