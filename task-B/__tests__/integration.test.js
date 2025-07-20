/**
 * Integration tests for @solace/client-sdk
 * Tests the full workflow of encryption, upload, download, and decryption
 */

import { encryptBlob, decryptBlob, uploadBlob, downloadAndDecrypt } from '../src/index.js';

// Mock fetch for HTTP tests
global.fetch = jest.fn();

describe('SDK Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Encryption + Decryption Workflow', () => {
    test('encrypts and decrypts data successfully', async () => {
      const originalData = 'Hello, Solace! This is a test message.';
      const key = 'test-key-32-bytes-long-for-aes-256';

      // Encrypt
      const encrypted = await encryptBlob(originalData, key);
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('tag');

      // Decrypt
      const decrypted = await decryptBlob(encrypted, key);
      expect(decrypted).toBe(originalData);
    });

    test('handles large data encryption/decryption', async () => {
      const largeData = 'A'.repeat(10000); // 10KB of data
      const key = 'test-key-32-bytes-long-for-aes-256';

      const encrypted = await encryptBlob(largeData, key);
      const decrypted = await decryptBlob(encrypted, key);
      
      expect(decrypted).toBe(largeData);
      expect(decrypted.length).toBe(10000);
    });

    test('fails with wrong decryption key', async () => {
      const originalData = 'Secret message';
      const correctKey = 'correct-key-32-bytes-long-for-aes';
      const wrongKey = 'wrong-key-32-bytes-long-for-aes-256';

      const encrypted = await encryptBlob(originalData, correctKey);
      
      await expect(decryptBlob(encrypted, wrongKey)).rejects.toThrow();
    });
  });

  describe('Upload + Download Workflow', () => {
    test('uploads and downloads encrypted data', async () => {
      const originalData = 'Test data for upload/download';
      const key = 'test-key-32-bytes-long-for-aes-256';
      const apiUrl = 'https://api.example.com';
      const mockBlobKey = 'test-blob-key-123';

      // Mock successful upload
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ blobKey: mockBlobKey })
      });

      // Mock successful download
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          iv: 'mock-iv',
          ciphertext: 'mock-ciphertext',
          tag: 'mock-tag'
        })
      });

      // Encrypt data
      const encrypted = await encryptBlob(originalData, key);
      
      // Upload
      const blobKey = await uploadBlob(encrypted, apiUrl);
      expect(blobKey).toBe(mockBlobKey);

      // Verify upload call
      expect(fetch).toHaveBeenCalledWith(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted)
      });
    });

    test('handles upload failures gracefully', async () => {
      const encrypted = { iv: 'test', ciphertext: 'test', tag: 'test' };
      const apiUrl = 'https://api.example.com';

      // Mock failed upload
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(uploadBlob(encrypted, apiUrl)).rejects.toThrow('Upload failed: 500 Internal Server Error');
    });

    test('handles download failures gracefully', async () => {
      const blobKey = 'test-key';
      const apiUrl = 'https://api.example.com';
      const key = 'test-key-32-bytes-long-for-aes-256';

      // Mock failed download
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(downloadAndDecrypt(blobKey, apiUrl, key)).rejects.toThrow('Download failed: 404 Not Found');
    });
  });

  describe('End-to-End Workflow', () => {
    test('complete encrypt -> upload -> download -> decrypt cycle', async () => {
      const originalData = 'End-to-end test data';
      const key = 'test-key-32-bytes-long-for-aes-256';
      const apiUrl = 'https://api.example.com';
      const mockBlobKey = 'e2e-test-blob-key';

      // Step 1: Encrypt
      const encrypted = await encryptBlob(originalData, key);
      
      // Step 2: Mock upload
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ blobKey: mockBlobKey })
      });
      
      const blobKey = await uploadBlob(encrypted, apiUrl);
      
      // Step 3: Mock download (return the same encrypted data)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(encrypted)
      });
      
      // Step 4: Download and decrypt
      const decrypted = await downloadAndDecrypt(blobKey, apiUrl, key);
      
      // Verify the complete cycle
      expect(decrypted).toBe(originalData);
      expect(blobKey).toBe(mockBlobKey);
    });

    test('handles network timeouts', async () => {
      const encrypted = { iv: 'test', ciphertext: 'test', tag: 'test' };
      const apiUrl = 'https://api.example.com';

      // Mock network timeout
      fetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(uploadBlob(encrypted, apiUrl)).rejects.toThrow('Network timeout');
    });
  });

  describe('Error Handling', () => {
    test('validates encryption inputs', async () => {
      const key = 'test-key-32-bytes-long-for-aes-256';

      await expect(encryptBlob(null, key)).rejects.toThrow();
      await expect(encryptBlob('data', null)).rejects.toThrow();
      await expect(encryptBlob('data', 'short-key')).rejects.toThrow();
    });

    test('validates decryption inputs', async () => {
      const key = 'test-key-32-bytes-long-for-aes-256';
      const validEncrypted = { iv: 'test', ciphertext: 'test', tag: 'test' };

      await expect(decryptBlob(null, key)).rejects.toThrow();
      await expect(decryptBlob(validEncrypted, null)).rejects.toThrow();
      await expect(decryptBlob({}, key)).rejects.toThrow();
    });

    test('validates upload inputs', async () => {
      const apiUrl = 'https://api.example.com';
      const validEncrypted = { iv: 'test', ciphertext: 'test', tag: 'test' };

      await expect(uploadBlob(null, apiUrl)).rejects.toThrow();
      await expect(uploadBlob(validEncrypted, null)).rejects.toThrow();
      await expect(uploadBlob(validEncrypted, 'invalid-url')).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    test('encryption performance is acceptable', async () => {
      const data = 'A'.repeat(1000); // 1KB
      const key = 'test-key-32-bytes-long-for-aes-256';

      const startTime = performance.now();
      await encryptBlob(data, key);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    test('handles concurrent operations', async () => {
      const data = 'Concurrent test data';
      const key = 'test-key-32-bytes-long-for-aes-256';

      // Run 5 concurrent encryptions
      const promises = Array.from({ length: 5 }, (_, i) => 
        encryptBlob(`${data} ${i}`, key)
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toHaveProperty('iv');
        expect(result).toHaveProperty('ciphertext');
        expect(result).toHaveProperty('tag');
      });
    });
  });

  describe('Cross-Platform Compatibility', () => {
    test('works with different data types', async () => {
      const key = 'test-key-32-bytes-long-for-aes-256';
      
      // Test with different data types
      const testCases = [
        'string data',
        JSON.stringify({ object: 'data' }),
        '12345',
        'unicode: 🚀 🎉 ✨',
        'special chars: !@#$%^&*()_+'
      ];

      for (const testData of testCases) {
        const encrypted = await encryptBlob(testData, key);
        const decrypted = await decryptBlob(encrypted, key);
        expect(decrypted).toBe(testData);
      }
    });

    test('handles empty and edge case data', async () => {
      const key = 'test-key-32-bytes-long-for-aes-256';
      
      // Test edge cases
      const edgeCases = ['', ' ', '\n', '\t'];
      
      for (const testData of edgeCases) {
        const encrypted = await encryptBlob(testData, key);
        const decrypted = await decryptBlob(encrypted, key);
        expect(decrypted).toBe(testData);
      }
    });
  });
}); 