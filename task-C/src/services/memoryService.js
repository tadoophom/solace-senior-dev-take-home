/**
 * Memory service for encrypted conversation storage using Solace SDK
 */

import { encryptBlob, uploadBlob, downloadAndDecrypt } from '@solace/client-sdk';

class MemoryService {
  constructor() {
    this.apiUrl = import.meta.env.VITE_SOLACE_API_URL;
    this.encryptionKey = import.meta.env.VITE_SOLACE_ENC_KEY;
    this.keyBytes = null;
    this.conversationBlobKey = null;
    this.initializeKey();
  }

  /**
   * Initialize encryption key bytes
   */
  initializeKey() {
    if (this.encryptionKey) {
      try {
        // Convert base64 key to Uint8Array
        const keyString = atob(this.encryptionKey);
        this.keyBytes = new Uint8Array(keyString.length);
        for (let i = 0; i < keyString.length; i++) {
          this.keyBytes[i] = keyString.charCodeAt(i);
        }
      } catch (error) {
        console.error('Failed to initialize encryption key:', error);
      }
    }
  }

  /**
   * Save conversation history to encrypted storage
   */
  async saveConversation(conversationHistory) {
    if (!this.isConfigured()) {
      throw new Error('Memory service not properly configured');
    }

    try {
      // Convert conversation to JSON string
      const conversationData = JSON.stringify({
        timestamp: new Date().toISOString(),
        history: conversationHistory
      });

      // Create blob from conversation data
      const dataBlob = new Blob([conversationData], { type: 'application/json' });

      // Encrypt the blob
      const encryptedBlob = await encryptBlob(dataBlob, this.keyBytes);

      // Upload to Solace API
      const blobKey = await uploadBlob(encryptedBlob, this.apiUrl);
      
      // Store blob key for retrieval
      this.conversationBlobKey = blobKey;
      localStorage.setItem('solace_conversation_key', blobKey);

      return blobKey;

    } catch (error) {
      console.error('Failed to save conversation:', error);
      throw new Error(`Memory save failed: ${error.message}`);
    }
  }

  /**
   * Load conversation history from encrypted storage
   */
  async loadConversation() {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      // Get blob key from storage or instance
      const blobKey = this.conversationBlobKey || localStorage.getItem('solace_conversation_key');
      
      if (!blobKey) {
        return []; // No saved conversation
      }

      // Download and decrypt conversation
      const decryptedData = await downloadAndDecrypt(blobKey, this.apiUrl, this.keyBytes);
      
      const conversationData = JSON.parse(decryptedData);
      return conversationData.history || [];

    } catch (error) {
      console.error('Failed to load conversation:', error);
      // Return empty array if loading fails
      return [];
    }
  }

  /**
   * Clear saved conversation
   */
  clearConversation() {
    this.conversationBlobKey = null;
    localStorage.removeItem('solace_conversation_key');
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return !!(this.apiUrl && this.encryptionKey && this.keyBytes);
  }
}

export default MemoryService; 