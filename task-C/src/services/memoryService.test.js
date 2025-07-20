import MemoryService from './memoryService';

// Mock @solace/client-sdk
jest.mock('@solace/client-sdk', () => ({
  encryptBlob: jest.fn().mockResolvedValue({
    iv: 'mock-iv',
    ciphertext: 'mock-ciphertext',
    tag: 'mock-tag'
  }),
  uploadBlob: jest.fn().mockResolvedValue('mock-blob-key-123'),
  downloadAndDecrypt: jest.fn().mockResolvedValue(JSON.stringify({
    timestamp: '2023-01-01T00:00:00.000Z',
    history: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ]
  }))
}));

// Mock environment variables
const mockEnv = {
  VITE_SOLACE_API_URL: 'https://mock-api.example.com',
  VITE_SOLACE_ENC_KEY: btoa('mock-32-byte-encryption-key-here!') // Base64 encoded
};

describe('MemoryService', () => {
  let memoryService;
  let originalEnv;

  beforeEach(() => {
    // Mock environment variables
    originalEnv = import.meta.env;
    import.meta.env = { ...originalEnv, ...mockEnv };
    
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    // Mock atob/btoa
    global.atob = jest.fn().mockImplementation((str) => {
      return Buffer.from(str, 'base64').toString('binary');
    });
    global.btoa = jest.fn().mockImplementation((str) => {
      return Buffer.from(str, 'binary').toString('base64');
    });

    memoryService = new MemoryService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    import.meta.env = originalEnv;
  });

  describe('Initialization', () => {
    test('initializes with correct configuration', () => {
      expect(memoryService.apiUrl).toBe(mockEnv.VITE_SOLACE_API_URL);
      expect(memoryService.encryptionKey).toBe(mockEnv.VITE_SOLACE_ENC_KEY);
      expect(memoryService.keyBytes).toBeInstanceOf(Uint8Array);
    });

    test('isConfigured returns true when properly configured', () => {
      expect(memoryService.isConfigured()).toBe(true);
    });

    test('isConfigured returns false when missing configuration', () => {
      import.meta.env.VITE_SOLACE_API_URL = '';
      const service = new MemoryService();
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('Save Conversation', () => {
    test('saves conversation successfully', async () => {
      const mockHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const { encryptBlob, uploadBlob } = require('@solace/client-sdk');
      
      const blobKey = await memoryService.saveConversation(mockHistory);

      expect(encryptBlob).toHaveBeenCalled();
      expect(uploadBlob).toHaveBeenCalled();
      expect(blobKey).toBe('mock-blob-key-123');
      expect(localStorage.setItem).toHaveBeenCalledWith('solace_conversation_key', 'mock-blob-key-123');
    });

    test('throws error when not configured', async () => {
      import.meta.env.VITE_SOLACE_API_URL = '';
      const service = new MemoryService();

      await expect(service.saveConversation([])).rejects.toThrow('Memory service not properly configured');
    });

    test('handles encryption errors gracefully', async () => {
      const { encryptBlob } = require('@solace/client-sdk');
      encryptBlob.mockRejectedValue(new Error('Encryption failed'));

      await expect(memoryService.saveConversation([])).rejects.toThrow('Memory save failed: Encryption failed');
    });

    test('handles upload errors gracefully', async () => {
      const { uploadBlob } = require('@solace/client-sdk');
      uploadBlob.mockRejectedValue(new Error('Upload failed'));

      await expect(memoryService.saveConversation([])).rejects.toThrow('Memory save failed: Upload failed');
    });
  });

  describe('Load Conversation', () => {
    test('loads conversation successfully', async () => {
      localStorage.getItem.mockReturnValue('mock-blob-key-123');

      const history = await memoryService.loadConversation();

      expect(history).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]);
    });

    test('returns empty array when no saved conversation', async () => {
      localStorage.getItem.mockReturnValue(null);

      const history = await memoryService.loadConversation();

      expect(history).toEqual([]);
    });

    test('returns empty array when not configured', async () => {
      import.meta.env.VITE_SOLACE_API_URL = '';
      const service = new MemoryService();

      const history = await service.loadConversation();

      expect(history).toEqual([]);
    });

    test('handles decryption errors gracefully', async () => {
      localStorage.getItem.mockReturnValue('mock-blob-key-123');
      const { downloadAndDecrypt } = require('@solace/client-sdk');
      downloadAndDecrypt.mockRejectedValue(new Error('Decryption failed'));

      const history = await memoryService.loadConversation();

      expect(history).toEqual([]);
    });

    test('handles invalid JSON gracefully', async () => {
      localStorage.getItem.mockReturnValue('mock-blob-key-123');
      const { downloadAndDecrypt } = require('@solace/client-sdk');
      downloadAndDecrypt.mockResolvedValue('invalid-json');

      const history = await memoryService.loadConversation();

      expect(history).toEqual([]);
    });
  });

  describe('Clear Conversation', () => {
    test('clears conversation successfully', () => {
      memoryService.conversationBlobKey = 'some-key';
      
      memoryService.clearConversation();

      expect(memoryService.conversationBlobKey).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('solace_conversation_key');
    });
  });

  describe('Key Initialization', () => {
    test('handles invalid base64 key gracefully', () => {
      import.meta.env.VITE_SOLACE_ENC_KEY = 'invalid-base64!@#';
      global.atob = jest.fn().mockImplementation(() => {
        throw new Error('Invalid base64');
      });

      const service = new MemoryService();
      
      expect(service.keyBytes).toBeNull();
    });

    test('handles missing encryption key', () => {
      import.meta.env.VITE_SOLACE_ENC_KEY = '';
      
      const service = new MemoryService();
      
      expect(service.keyBytes).toBeNull();
    });
  });

  describe('Integration', () => {
    test('full save and load cycle', async () => {
      const originalHistory = [
        { role: 'user', content: 'Test message' },
        { role: 'assistant', content: 'Test response' }
      ];

      // Save conversation
      const blobKey = await memoryService.saveConversation(originalHistory);
      expect(blobKey).toBe('mock-blob-key-123');

      // Load conversation
      const loadedHistory = await memoryService.loadConversation();
      expect(loadedHistory).toEqual(originalHistory);
    });

    test('conversation persistence across service instances', async () => {
      const history = [{ role: 'user', content: 'Persistent message' }];
      
      // Save with first instance
      await memoryService.saveConversation(history);
      
      // Load with new instance
      const newService = new MemoryService();
      const loadedHistory = await newService.loadConversation();
      
      expect(loadedHistory).toEqual(history);
    });
  });
}); 