const crypto = require('crypto');
const { encryptBlob, decryptBlob } = require('../src/index');

test('encryptBlob/decryptBlob round-trip', async () => {
  const keyMaterial = crypto.webcrypto.getRandomValues(new Uint8Array(32));
  const data = 'Hello, Solace!';
  const { iv, ciphertext, tag } = await encryptBlob(data, keyMaterial);
  const decrypted = await decryptBlob({ iv, ciphertext, tag }, keyMaterial);
  expect(decrypted).toBe(data);
});
