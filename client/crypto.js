/**
 * Cortex E2EE Crypto Module (v1.19.0)
 *
 * End-to-end encryption using Web Crypto API.
 *
 * Key Hierarchy:
 * - User Passphrase → PBKDF2 → Passphrase-Derived Key (PDK)
 * - PDK wraps User Private Key (ECDH P-384)
 * - User keypair encrypts Wave Keys (AES-256-GCM)
 * - Wave Keys encrypt Droplet content
 */

// Constants
const PBKDF2_ITERATIONS = 600000;  // OWASP 2023 recommendation
const SALT_LENGTH = 16;            // 128 bits
const NONCE_LENGTH = 12;           // 96 bits for AES-GCM

// ============ Utility Functions ============

/**
 * Encode ArrayBuffer to Base64
 */
export function base64Encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode Base64 to ArrayBuffer
 */
export function base64Decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate cryptographically secure random bytes
 */
export function generateRandomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generate a random salt for PBKDF2
 */
export function generateSalt() {
  return base64Encode(generateRandomBytes(SALT_LENGTH));
}

/**
 * Generate a random nonce for AES-GCM
 */
export function generateNonce() {
  return generateRandomBytes(NONCE_LENGTH);
}

// ============ Key Derivation ============

/**
 * Derive an AES-256-GCM key from a passphrase using PBKDF2
 * @param {string} passphrase - User's passphrase
 * @param {string} saltBase64 - Base64-encoded salt
 * @returns {Promise<CryptoKey>} - AES-GCM key for encryption
 */
export async function deriveKeyFromPassphrase(passphrase, saltBase64) {
  const encoder = new TextEncoder();
  const salt = base64Decode(saltBase64);

  // Import passphrase as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key for encrypting private key
  // Using AES-GCM instead of AES-KW for better compatibility with JWK sizes
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============ User Keypair Generation ============

/**
 * Generate an ECDH P-384 keypair for the user
 * @returns {Promise<CryptoKeyPair>} - { publicKey, privateKey }
 */
export async function generateUserKeypair() {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-384'
    },
    true,  // extractable (we need to export/wrap the private key)
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Export public key to Base64 SPKI format
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>} - Base64-encoded SPKI
 */
export async function exportPublicKey(publicKey) {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return base64Encode(exported);
}

/**
 * Import public key from Base64 SPKI format
 * @param {string} spkiBase64
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(spkiBase64) {
  const spki = base64Decode(spkiBase64);
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'ECDH', namedCurve: 'P-384' },
    true,
    []
  );
}

// ============ Private Key Wrapping ============

/**
 * Wrap (encrypt) a private key with a passphrase-derived key
 * Uses AES-GCM for encryption, which handles any data size (unlike AES-KW)
 * @param {CryptoKey} privateKey - ECDH private key
 * @param {CryptoKey} wrappingKey - AES-GCM key from PBKDF2
 * @returns {Promise<string>} - Base64-encoded nonce:ciphertext
 */
export async function wrapPrivateKey(privateKey, wrappingKey) {
  // Export private key to JWK format
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const jwkString = JSON.stringify(jwk);
  const encoder = new TextEncoder();
  const jwkBytes = encoder.encode(jwkString);

  // Generate nonce and encrypt
  const nonce = generateNonce();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    wrappingKey,
    jwkBytes
  );

  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.byteLength);
  combined.set(nonce, 0);
  combined.set(new Uint8Array(ciphertext), nonce.length);

  return base64Encode(combined);
}

/**
 * Unwrap (decrypt) a private key with a passphrase-derived key
 * @param {string} wrappedKeyBase64 - Base64-encoded nonce:ciphertext
 * @param {CryptoKey} unwrappingKey - AES-GCM key from PBKDF2
 * @returns {Promise<CryptoKey>} - ECDH private key
 */
export async function unwrapPrivateKey(wrappedKeyBase64, unwrappingKey) {
  const combined = new Uint8Array(base64Decode(wrappedKeyBase64));

  // Extract nonce and ciphertext
  const nonce = combined.slice(0, NONCE_LENGTH);
  const ciphertext = combined.slice(NONCE_LENGTH);

  // Decrypt
  const jwkBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    unwrappingKey,
    ciphertext
  );

  // Parse JWK and import
  const decoder = new TextDecoder();
  const jwkString = decoder.decode(jwkBytes);
  const jwk = JSON.parse(jwkString);

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-384' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// ============ Wave Key Generation & Exchange ============

/**
 * Generate a random AES-256-GCM key for a wave
 * @returns {Promise<CryptoKey>}
 */
export async function generateWaveKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,  // extractable for distribution
    ['encrypt', 'decrypt']
  );
}

/**
 * Export wave key to raw bytes
 * @param {CryptoKey} waveKey
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportWaveKey(waveKey) {
  return crypto.subtle.exportKey('raw', waveKey);
}

/**
 * Import wave key from raw bytes
 * @param {ArrayBuffer} keyData
 * @returns {Promise<CryptoKey>}
 */
export async function importWaveKey(keyData) {
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a shared secret from ECDH and derive an AES-GCM key
 * @param {CryptoKey} privateKey - Sender's ECDH private key
 * @param {CryptoKey} publicKey - Recipient's ECDH public key
 * @returns {Promise<CryptoKey>} - AES-GCM key for encrypting the wave key
 */
async function deriveSharedKey(privateKey, publicKey) {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey
    },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a wave key for a recipient
 * @param {CryptoKey} waveKey - AES-256-GCM wave key
 * @param {CryptoKey} recipientPublicKey - Recipient's ECDH public key
 * @param {CryptoKey} senderPrivateKey - Sender's ECDH private key
 * @returns {Promise<{encryptedKey: string, nonce: string}>}
 */
export async function encryptWaveKey(waveKey, recipientPublicKey, senderPrivateKey) {
  // Derive shared secret
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientPublicKey);

  // Export the wave key
  const rawWaveKey = await exportWaveKey(waveKey);

  // Encrypt with shared key
  const nonce = generateNonce();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    sharedKey,
    rawWaveKey
  );

  return {
    encryptedKey: base64Encode(encrypted),
    nonce: base64Encode(nonce)
  };
}

/**
 * Decrypt a wave key from sender
 * @param {string} encryptedKeyBase64 - Base64-encoded encrypted wave key
 * @param {string} nonceBase64 - Base64-encoded nonce
 * @param {CryptoKey} senderPublicKey - Sender's ECDH public key
 * @param {CryptoKey} recipientPrivateKey - Recipient's ECDH private key
 * @returns {Promise<CryptoKey>} - Decrypted AES-256-GCM wave key
 */
export async function decryptWaveKey(encryptedKeyBase64, nonceBase64, senderPublicKey, recipientPrivateKey) {
  // Derive shared secret (same as sender used)
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderPublicKey);

  // Decrypt
  const encryptedKey = base64Decode(encryptedKeyBase64);
  const nonce = base64Decode(nonceBase64);

  const rawWaveKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    sharedKey,
    encryptedKey
  );

  // Import as AES-GCM key
  return importWaveKey(rawWaveKey);
}

// ============ Droplet Content Encryption ============

/**
 * Encrypt droplet content
 * @param {string} plaintext - Message content
 * @param {CryptoKey} waveKey - AES-256-GCM wave key
 * @returns {Promise<{ciphertext: string, nonce: string}>}
 */
export async function encryptDroplet(plaintext, waveKey) {
  const encoder = new TextEncoder();
  const nonce = generateNonce();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    waveKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: base64Encode(ciphertext),
    nonce: base64Encode(nonce)
  };
}

/**
 * Decrypt droplet content
 * @param {string} ciphertextBase64 - Base64-encoded ciphertext
 * @param {string} nonceBase64 - Base64-encoded nonce
 * @param {CryptoKey} waveKey - AES-256-GCM wave key
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decryptDroplet(ciphertextBase64, nonceBase64, waveKey) {
  const decoder = new TextDecoder();
  const ciphertext = base64Decode(ciphertextBase64);
  const nonce = base64Decode(nonceBase64);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    waveKey,
    ciphertext
  );

  return decoder.decode(plaintext);
}

// ============ Complete Setup Helpers ============

/**
 * Complete E2EE setup for a new user
 * Generates keypair, wraps with passphrase, and prepares for storage
 * @param {string} passphrase - User's chosen E2EE passphrase
 * @returns {Promise<{publicKey: string, encryptedPrivateKey: string, salt: string, keyPair: CryptoKeyPair}>}
 */
export async function setupUserE2EE(passphrase) {
  // Generate salt and derive wrapping key
  const salt = generateSalt();
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);

  // Generate user keypair
  const keyPair = await generateUserKeypair();

  // Export public key
  const publicKey = await exportPublicKey(keyPair.publicKey);

  // Wrap private key
  const encryptedPrivateKey = await wrapPrivateKey(keyPair.privateKey, wrappingKey);

  return {
    publicKey,
    encryptedPrivateKey,
    salt,
    keyPair  // Return in-memory keys for immediate use
  };
}

/**
 * Unlock user's private key with passphrase
 * @param {string} passphrase - User's E2EE passphrase
 * @param {string} encryptedPrivateKey - Base64-encoded wrapped private key
 * @param {string} salt - Base64-encoded PBKDF2 salt
 * @returns {Promise<CryptoKey>} - Unwrapped ECDH private key
 */
export async function unlockPrivateKey(passphrase, encryptedPrivateKey, salt) {
  const unwrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  return unwrapPrivateKey(encryptedPrivateKey, unwrappingKey);
}

/**
 * Setup encryption for a new wave
 * @param {Array<{userId: string, publicKey: string}>} participants - Participant public keys
 * @param {CryptoKey} creatorPrivateKey - Wave creator's private key
 * @param {string} creatorPublicKeyBase64 - Creator's public key for distribution
 * @returns {Promise<{waveKey: CryptoKey, keyDistribution: Array<{userId: string, encryptedWaveKey: string, nonce: string, senderPublicKey: string}>}>}
 */
export async function setupWaveEncryption(participants, creatorPrivateKey, creatorPublicKeyBase64) {
  // Generate wave key
  const waveKey = await generateWaveKey();

  // Encrypt wave key for each participant
  const keyDistribution = await Promise.all(
    participants.map(async ({ userId, publicKey }) => {
      if (!publicKey) {
        // Participant hasn't set up E2EE yet
        return { userId, error: 'no_public_key' };
      }

      try {
        const recipientPublicKey = await importPublicKey(publicKey);
        const { encryptedKey, nonce } = await encryptWaveKey(waveKey, recipientPublicKey, creatorPrivateKey);

        return {
          userId,
          encryptedWaveKey: encryptedKey,
          nonce,
          senderPublicKey: creatorPublicKeyBase64
        };
      } catch (err) {
        console.error(`Failed to encrypt wave key for ${userId}:`, err);
        return { userId, error: err.message };
      }
    })
  );

  return { waveKey, keyDistribution };
}

/**
 * Add a new participant to an encrypted wave
 * @param {CryptoKey} waveKey - Existing wave key
 * @param {string} newParticipantPublicKey - New participant's public key (Base64)
 * @param {CryptoKey} senderPrivateKey - Any existing participant's private key
 * @param {string} senderPublicKeyBase64 - Sender's public key
 * @returns {Promise<{encryptedWaveKey: string, nonce: string, senderPublicKey: string}>}
 */
export async function addParticipantToWave(waveKey, newParticipantPublicKey, senderPrivateKey, senderPublicKeyBase64) {
  const recipientPublicKey = await importPublicKey(newParticipantPublicKey);
  const { encryptedKey, nonce } = await encryptWaveKey(waveKey, recipientPublicKey, senderPrivateKey);

  return {
    encryptedWaveKey: encryptedKey,
    nonce,
    senderPublicKey: senderPublicKeyBase64
  };
}

// ============ Recovery Key Setup ============

/**
 * Create a recovery key backup
 * @param {CryptoKey} privateKey - User's ECDH private key
 * @param {string} recoveryPassphrase - Separate recovery passphrase
 * @returns {Promise<{encryptedPrivateKey: string, recoverySalt: string}>}
 */
export async function createRecoveryBackup(privateKey, recoveryPassphrase) {
  const recoverySalt = generateSalt();
  const wrappingKey = await deriveKeyFromPassphrase(recoveryPassphrase, recoverySalt);
  const encryptedPrivateKey = await wrapPrivateKey(privateKey, wrappingKey);

  return {
    encryptedPrivateKey,
    recoverySalt
  };
}

/**
 * Recover private key using recovery passphrase
 * @param {string} recoveryPassphrase
 * @param {string} encryptedPrivateKey
 * @param {string} recoverySalt
 * @returns {Promise<CryptoKey>}
 */
export async function recoverPrivateKey(recoveryPassphrase, encryptedPrivateKey, recoverySalt) {
  return unlockPrivateKey(recoveryPassphrase, encryptedPrivateKey, recoverySalt);
}

// ============ Verification ============

/**
 * Verify that a passphrase correctly unlocks the private key
 * @param {string} passphrase
 * @param {string} encryptedPrivateKey
 * @param {string} salt
 * @returns {Promise<boolean>}
 */
export async function verifyPassphrase(passphrase, encryptedPrivateKey, salt) {
  try {
    await unlockPrivateKey(passphrase, encryptedPrivateKey, salt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Web Crypto API is available
 * @returns {boolean}
 */
export function isCryptoAvailable() {
  return !!(
    typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.generateKey === 'function'
  );
}
