/**
 * E2EE Context and Hooks (v1.19.0)
 *
 * Manages end-to-end encryption state and operations.
 * Integrates with AuthContext to provide E2EE after login.
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as crypto from './crypto.js';

// ============ Constants ============
const WAVE_KEY_CACHE_MAX = 100;  // Max cached wave keys

// ============ Context ============
const E2EEContext = createContext(null);

export const useE2EE = () => {
  const context = useContext(E2EEContext);
  if (!context) {
    throw new Error('useE2EE must be used within E2EEProvider');
  }
  return context;
};

// ============ Provider ============
export function E2EEProvider({ children, token, API_URL }) {
  // E2EE State
  const [e2eeStatus, setE2eeStatus] = useState(null);  // null = loading, { enabled: bool }
  const [privateKey, setPrivateKey] = useState(null);  // CryptoKey in memory only
  const [publicKey, setPublicKey] = useState(null);    // CryptoKey
  const [publicKeyBase64, setPublicKeyBase64] = useState(null);  // For API calls
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(null);

  // Wave key cache (waveId -> { waveKey: CryptoKey, version: number })
  const waveKeyCacheRef = useRef(new Map());

  // Fetch helper
  const fetchAPI = useCallback(async (path, options = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    return res;
  }, [API_URL, token]);

  // ============ E2EE Status Check ============
  const checkE2EEStatus = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetchAPI('/e2ee/status');
      if (res.ok) {
        const data = await res.json();
        setE2eeStatus({ enabled: data.e2eeEnabled, keyVersion: data.keyVersion });

        if (data.e2eeEnabled) {
          setNeedsPassphrase(true);
          setNeedsSetup(false);
        } else {
          setNeedsPassphrase(false);
          setNeedsSetup(true);
        }
      } else {
        setE2eeStatus({ enabled: false });
        setNeedsSetup(true);
      }
    } catch (err) {
      console.error('E2EE status check failed:', err);
      setE2eeStatus({ enabled: false, error: err.message });
    }
  }, [token, fetchAPI]);

  // ============ E2EE Setup ============
  const setupE2EE = useCallback(async (passphrase, createRecoveryKey = true) => {
    if (!token) throw new Error('Not authenticated');

    try {
      // Generate keys
      const { publicKey: pubKeyBase64, encryptedPrivateKey, salt, keyPair } = await crypto.setupUserE2EE(passphrase);

      // Register with server
      const res = await fetchAPI('/e2ee/keys/register', {
        method: 'POST',
        body: JSON.stringify({
          publicKey: pubKeyBase64,
          encryptedPrivateKey,
          salt
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to register keys');
      }

      // Generate and store recovery key if requested
      let recoveryKey = null;
      if (createRecoveryKey) {
        const recovery = await crypto.createRecoveryBackup(keyPair.privateKey);
        const recoveryRes = await fetchAPI('/e2ee/recovery/setup', {
          method: 'POST',
          body: JSON.stringify({
            encryptedPrivateKey: recovery.encryptedPrivateKey,
            recoverySalt: recovery.recoverySalt
          })
        });

        if (recoveryRes.ok) {
          recoveryKey = recovery.recoveryKey;  // Return to show user
        } else {
          console.warn('Recovery setup failed, but main keys are registered');
        }
      }

      // Store keys in memory
      setPrivateKey(keyPair.privateKey);
      setPublicKey(keyPair.publicKey);
      setPublicKeyBase64(pubKeyBase64);
      setNeedsSetup(false);
      setNeedsPassphrase(false);
      setE2eeStatus({ enabled: true });

      return { success: true, recoveryKey };
    } catch (err) {
      console.error('E2EE setup error:', err);
      throw err;
    }
  }, [token, fetchAPI]);

  // ============ Unlock with Passphrase ============
  const unlockE2EE = useCallback(async (passphrase) => {
    if (!token) throw new Error('Not authenticated');

    setIsUnlocking(true);
    setUnlockError(null);

    try {
      // Fetch encrypted keys from server
      const res = await fetchAPI('/e2ee/keys/me');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch keys');
      }

      const { encryptedPrivateKey, keyDerivationSalt, publicKey: pubKeyBase64 } = await res.json();

      // Decrypt private key
      const privKey = await crypto.unlockPrivateKey(passphrase, encryptedPrivateKey, keyDerivationSalt);
      const pubKey = await crypto.importPublicKey(pubKeyBase64);

      // Store in memory
      setPrivateKey(privKey);
      setPublicKey(pubKey);
      setPublicKeyBase64(pubKeyBase64);
      setNeedsPassphrase(false);
      setIsUnlocking(false);

      return { success: true };
    } catch (err) {
      console.error('E2EE unlock error:', err);
      setUnlockError(err.message || 'Incorrect passphrase');
      setIsUnlocking(false);
      throw err;
    }
  }, [token, fetchAPI]);

  // ============ Recovery ============
  const recoverWithPassphrase = useCallback(async (recoveryPassphrase) => {
    if (!token) throw new Error('Not authenticated');

    try {
      // Fetch recovery data
      const res = await fetchAPI('/e2ee/recovery');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'No recovery key configured');
      }

      const { encryptedPrivateKey, recoverySalt } = await res.json();

      // Decrypt with recovery passphrase
      const privKey = await crypto.recoverPrivateKey(recoveryPassphrase, encryptedPrivateKey, recoverySalt);

      // Fetch public key
      const keysRes = await fetchAPI('/e2ee/keys/me');
      const { publicKey: pubKeyBase64 } = await keysRes.json();
      const pubKey = await crypto.importPublicKey(pubKeyBase64);

      // Store in memory
      setPrivateKey(privKey);
      setPublicKey(pubKey);
      setPublicKeyBase64(pubKeyBase64);
      setNeedsPassphrase(false);

      return { success: true };
    } catch (err) {
      console.error('E2EE recovery error:', err);
      throw err;
    }
  }, [token, fetchAPI]);

  // ============ Wave Key Management ============
  const getWaveKey = useCallback(async (waveId) => {
    // Check cache first
    const cached = waveKeyCacheRef.current.get(waveId);
    if (cached) {
      return cached.waveKey;
    }

    if (!privateKey) {
      throw new Error('E2EE not unlocked');
    }

    try {
      // Fetch from server
      const res = await fetchAPI(`/waves/${waveId}/key`);
      if (!res.ok) {
        const err = await res.json();
        if (!err.encrypted) return null;  // Wave not encrypted
        throw new Error(err.error || 'Failed to fetch wave key');
      }

      const { encrypted, encryptedWaveKey, senderPublicKey, keyVersion } = await res.json();

      if (!encrypted) {
        return null;  // Wave not encrypted
      }

      // Parse the encrypted key (format: encryptedKey:nonce)
      const [encKeyBase64, nonceBase64] = encryptedWaveKey.split(':');

      // Import sender's public key
      const senderPubKey = await crypto.importPublicKey(senderPublicKey);

      // Decrypt wave key
      const waveKey = await crypto.decryptWaveKey(encKeyBase64, nonceBase64, senderPubKey, privateKey);

      // Cache it (with LRU eviction)
      if (waveKeyCacheRef.current.size >= WAVE_KEY_CACHE_MAX) {
        const firstKey = waveKeyCacheRef.current.keys().next().value;
        waveKeyCacheRef.current.delete(firstKey);
      }
      waveKeyCacheRef.current.set(waveId, { waveKey, version: keyVersion });

      return waveKey;
    } catch (err) {
      console.error('Get wave key error:', err);
      throw err;
    }
  }, [privateKey, fetchAPI]);

  const createWaveWithEncryption = useCallback(async (participants) => {
    if (!privateKey || !publicKeyBase64) {
      throw new Error('E2EE not unlocked');
    }

    try {
      // Get participant public keys
      const participantKeys = await Promise.all(
        participants.map(async (userId) => {
          const res = await fetchAPI(`/e2ee/keys/user/${userId}`);
          if (res.ok) {
            const { publicKey } = await res.json();
            return { userId, publicKey };
          }
          return { userId, publicKey: null };
        })
      );

      // Add self
      participantKeys.push({ userId: 'self', publicKey: publicKeyBase64 });

      // Generate and distribute wave key
      const { waveKey, keyDistribution } = await crypto.setupWaveEncryption(
        participantKeys.filter(p => p.publicKey),
        privateKey,
        publicKeyBase64
      );

      // Format for API (combine encryptedKey and nonce)
      const formattedDistribution = keyDistribution
        .filter(k => !k.error)
        .map(({ userId, encryptedWaveKey, nonce, senderPublicKey }) => ({
          userId: userId === 'self' ? null : userId,  // Server will use req.user.userId for self
          encryptedWaveKey: `${encryptedWaveKey}:${nonce}`,
          senderPublicKey
        }));

      return { waveKey, keyDistribution: formattedDistribution };
    } catch (err) {
      console.error('Create encrypted wave error:', err);
      throw err;
    }
  }, [privateKey, publicKeyBase64, fetchAPI]);

  // ============ Encrypt/Decrypt Droplets ============
  const encryptDroplet = useCallback(async (content, waveId) => {
    const waveKey = await getWaveKey(waveId);
    if (!waveKey) {
      throw new Error('Wave key not found');
    }

    const { ciphertext, nonce } = await crypto.encryptDroplet(content, waveKey);
    return { ciphertext, nonce };
  }, [getWaveKey]);

  const decryptDroplet = useCallback(async (ciphertext, nonce, waveId, keyVersion = null) => {
    // For key rotation: may need to get specific version
    let waveKey;

    if (keyVersion !== null) {
      // Fetch specific version
      const cached = waveKeyCacheRef.current.get(`${waveId}:${keyVersion}`);
      if (cached) {
        waveKey = cached.waveKey;
      } else {
        // Need to fetch old version from server
        const res = await fetchAPI(`/waves/${waveId}/keys/all`);
        if (res.ok) {
          const { keys } = await res.json();
          const versionKey = keys.find(k => k.keyVersion === keyVersion);
          if (versionKey) {
            const [encKeyBase64, nonceBase64] = versionKey.encryptedWaveKey.split(':');
            const senderPubKey = await crypto.importPublicKey(versionKey.senderPublicKey);
            waveKey = await crypto.decryptWaveKey(encKeyBase64, nonceBase64, senderPubKey, privateKey);
            waveKeyCacheRef.current.set(`${waveId}:${keyVersion}`, { waveKey, version: keyVersion });
          }
        }
      }
    } else {
      waveKey = await getWaveKey(waveId);
    }

    if (!waveKey) {
      throw new Error('Wave key not found');
    }

    return crypto.decryptDroplet(ciphertext, nonce, waveKey);
  }, [getWaveKey, fetchAPI, privateKey]);

  // ============ Key Rotation ============
  const rotateWaveKey = useCallback(async (waveId, remainingParticipantIds) => {
    if (!privateKey || !publicKeyBase64) {
      throw new Error('E2EE not unlocked');
    }

    try {
      // Get public keys for remaining participants
      const participantKeys = await Promise.all(
        remainingParticipantIds.map(async (userId) => {
          const res = await fetchAPI(`/e2ee/keys/user/${userId}`);
          if (res.ok) {
            const { publicKey } = await res.json();
            return { userId, publicKey };
          }
          return { userId, publicKey: null };
        })
      );

      // Add self
      participantKeys.push({ userId: 'self', publicKey: publicKeyBase64 });

      // Generate new wave key and distribute
      const { waveKey, keyDistribution } = await crypto.setupWaveEncryption(
        participantKeys.filter(p => p.publicKey),
        privateKey,
        publicKeyBase64
      );

      // Format for API
      const formattedDistribution = keyDistribution
        .filter(k => !k.error)
        .map(({ userId, encryptedWaveKey, nonce, senderPublicKey }) => ({
          userId: userId === 'self' ? null : userId,
          encryptedWaveKey: `${encryptedWaveKey}:${nonce}`,
          senderPublicKey
        }));

      // Call rotation endpoint
      const res = await fetchAPI(`/waves/${waveId}/key/rotate`, {
        method: 'POST',
        body: JSON.stringify({ keyDistribution: formattedDistribution })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to rotate wave key');
      }

      const { newKeyVersion } = await res.json();

      // Invalidate cached key so new one is fetched
      waveKeyCacheRef.current.delete(waveId);

      return { success: true, newKeyVersion };
    } catch (err) {
      console.error('Wave key rotation error:', err);
      throw err;
    }
  }, [privateKey, publicKeyBase64, fetchAPI]);

  // ============ Clear on Logout ============
  const clearE2EE = useCallback(() => {
    setPrivateKey(null);
    setPublicKey(null);
    setPublicKeyBase64(null);
    setE2eeStatus(null);
    setNeedsPassphrase(false);
    setNeedsSetup(false);
    waveKeyCacheRef.current.clear();
  }, []);

  // ============ Invalidate wave key cache ============
  const invalidateWaveKey = useCallback((waveId) => {
    waveKeyCacheRef.current.delete(waveId);
  }, []);

  // ============ Context Value ============
  const value = {
    // Status
    e2eeStatus,
    isE2EEEnabled: e2eeStatus?.enabled || false,
    isUnlocked: !!privateKey,
    needsPassphrase,
    needsSetup,
    isUnlocking,
    unlockError,

    // Keys (for display/verification only)
    publicKeyBase64,

    // Actions
    checkE2EEStatus,
    setupE2EE,
    unlockE2EE,
    recoverWithPassphrase,
    clearE2EE,

    // Wave operations
    getWaveKey,
    createWaveWithEncryption,
    invalidateWaveKey,
    rotateWaveKey,

    // Droplet operations
    encryptDroplet,
    decryptDroplet,

    // Crypto availability check
    isCryptoAvailable: crypto.isCryptoAvailable()
  };

  return (
    <E2EEContext.Provider value={value}>
      {children}
    </E2EEContext.Provider>
  );
}

export default E2EEContext;
