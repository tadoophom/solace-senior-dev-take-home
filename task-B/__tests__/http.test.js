jest.mock('../src/crypto', () => ({
  decryptBlob: jest.fn().mockResolvedValue('plain')
}));

jest.mock('cross-fetch', () => jest.fn());
const fetch = require('cross-fetch');

const { uploadBlob, downloadAndDecrypt } = require('../src/http');
const { decryptBlob } = require('../src/crypto');

const apiUrl = 'https://example.com';

describe('HTTP helpers', () => {
  afterEach(() => jest.clearAllMocks());

  it('uploadBlob returns blobKey on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ blobKey: 'abc123' })
    });

    const blobKey = await uploadBlob(Buffer.from('data'), apiUrl);
    expect(blobKey).toBe('abc123');
    expect(fetch).toHaveBeenCalled();
  });

  it('downloadAndDecrypt fetches cipher and calls decryptBlob', async () => {
    const cipher = { iv: 'a', ciphertext: 'b', tag: 'c' };
    fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(cipher) });

    const plain = await downloadAndDecrypt('abc123', apiUrl, 'key');
    expect(plain).toBe('plain');
    expect(decryptBlob).toHaveBeenCalledWith(cipher, 'key');
  });
}); 