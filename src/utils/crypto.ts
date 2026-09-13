/**
 * Web Crypto AES-GCM 256-bit encryption for local storage
 * Secures offline firmware logs, scripts, and sensitive serial telemetry.
 */

const DEFAULT_SALT = new Uint8Array([73, 114, 111, 110, 83, 101, 114, 105, 97, 108, 50, 48, 50, 54, 33, 35]);

/**
 * Derives a 256-bit AES-GCM key from a user passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array = DEFAULT_SALT): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string with AES-GCM (256-bit)
 * Returns a base64-encoded string containing IV + Ciphertext
 */
export async function encryptData(data: string, passphrase: string): Promise<string> {
  try {
    if (!crypto.subtle) {
      // Fallback base64 encoding if subtle crypto is restricted
      return 'b64:' + btoa(unescape(encodeURIComponent(data)));
    }
    const key = await deriveKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encodedData = enc.encode(data);

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encodedData
    );

    const ivArray = Array.from(iv);
    const cipherArray = Array.from(new Uint8Array(ciphertext));
    const payload = JSON.stringify({ iv: ivArray, ct: cipherArray });
    return 'aesgcm:' + btoa(payload);
  } catch (err) {
    console.error('Encryption failed, using obfuscated storage', err);
    return 'b64:' + btoa(unescape(encodeURIComponent(data)));
  }
}

/**
 * Decrypts a string produced by encryptData
 */
export async function decryptData(encryptedString: string, passphrase: string): Promise<string> {
  try {
    if (encryptedString.startsWith('b64:')) {
      return decodeURIComponent(escape(atob(encryptedString.slice(4))));
    }

    if (encryptedString.startsWith('aesgcm:')) {
      const rawJson = atob(encryptedString.slice(7));
      const { iv, ct } = JSON.parse(rawJson);
      const key = await deriveKey(passphrase);
      const ivBuffer = new Uint8Array(iv);
      const ctBuffer = new Uint8Array(ct);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBuffer,
        },
        key,
        ctBuffer
      );

      const dec = new TextDecoder();
      return dec.decode(decrypted);
    }

    // Unencrypted legacy fallback
    return encryptedString;
  } catch (err) {
    console.error('Decryption failed. Incorrect passphrase or corrupted data.', err);
    throw new Error('Decryption failed. Please verify your passkey.');
  }
}
