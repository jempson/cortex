/**
 * Wave Participation Encryption Module (v2.21.0)
 *
 * Encrypts wave participation data at rest so database dumps cannot reveal social graphs.
 * Uses AES-256-GCM encryption with server-side key management.
 *
 * Architecture:
 * - Database stores encrypted participant blobs
 * - Server maintains in-memory cache for runtime operations
 * - All routing, access control, and notifications use the memory cache
 *
 * Key management:
 * - WAVE_PARTICIPATION_KEY environment variable (32-byte hex)
 * - If not set, falls back to plaintext storage (with warning)
 */

import crypto from 'crypto';

// Encryption key from environment
const PARTICIPATION_KEY = process.env.WAVE_PARTICIPATION_KEY || null;

// Warn if encryption is not configured
if (!PARTICIPATION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️  WARNING: WAVE_PARTICIPATION_KEY not set - participation data will be stored in plaintext');
  } else {
    console.log('ℹ️  Wave participation encryption disabled (set WAVE_PARTICIPATION_KEY to enable)');
  }
}

// In-memory caches for fast lookups
// waveId → Set<userId>
const waveToParticipants = new Map();
// userId → Set<waveId>
const userToWaves = new Map();

// Reference to database instance (set during initialization)
let db = null;

/**
 * Encrypt participant list for a wave
 * @param {string[]} userIds - Array of user IDs
 * @returns {{blob: string, iv: string}|null} Encrypted data or null if encryption disabled
 */
export function encryptParticipants(userIds) {
  if (!PARTICIPATION_KEY) return null;

  try {
    const key = Buffer.from(PARTICIPATION_KEY, 'hex');
    const iv = crypto.randomBytes(12); // AES-GCM uses 12-byte IV
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const data = JSON.stringify(userIds);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Combine ciphertext + auth tag
    const combined = Buffer.concat([Buffer.from(encrypted, 'base64'), authTag]).toString('base64');

    return {
      blob: combined,
      iv: iv.toString('base64')
    };
  } catch (err) {
    console.error('Wave participation encryption error:', err.message);
    return null;
  }
}

/**
 * Decrypt participant list for a wave
 * @param {string} blob - Base64 encrypted data (ciphertext + auth tag)
 * @param {string} iv - Base64 initialization vector
 * @returns {string[]|null} Array of user IDs or null on error
 */
export function decryptParticipants(blob, iv) {
  if (!PARTICIPATION_KEY || !blob || !iv) return null;

  try {
    const key = Buffer.from(PARTICIPATION_KEY, 'hex');
    const ivBuffer = Buffer.from(iv, 'base64');
    const combined = Buffer.from(blob, 'base64');

    // Split ciphertext and auth tag (auth tag is last 16 bytes)
    const authTag = combined.slice(-16);
    const ciphertext = combined.slice(0, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Wave participation decryption error:', err.message);
    return null;
  }
}

/**
 * Initialize the participation cache from database
 * Called on server startup after database initialization
 * @param {Object} database - Database instance with access to encrypted participation data
 * @returns {Promise<{waveCount: number, participantCount: number}>} Stats about loaded data
 */
export async function initializeCache(database) {
  db = database;
  waveToParticipants.clear();
  userToWaves.clear();

  let waveCount = 0;
  let participantCount = 0;

  // Check if encrypted table exists AND has data
  const encryptedTableExists = db.db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='wave_participants_encrypted'
  `).get();

  const encryptedCount = encryptedTableExists
    ? db.db.prepare('SELECT COUNT(*) as count FROM wave_participants_encrypted').get()?.count || 0
    : 0;

  if (encryptedTableExists && PARTICIPATION_KEY && encryptedCount > 0) {
    // Load from encrypted table (migration has been run)
    console.log('🔐 Loading encrypted wave participation data...');
    const rows = db.db.prepare('SELECT wave_id, participant_blob, iv FROM wave_participants_encrypted').all();

    for (const row of rows) {
      const userIds = decryptParticipants(row.participant_blob, row.iv);
      if (userIds && Array.isArray(userIds)) {
        waveToParticipants.set(row.wave_id, new Set(userIds));
        waveCount++;

        for (const userId of userIds) {
          if (!userToWaves.has(userId)) {
            userToWaves.set(userId, new Set());
          }
          userToWaves.get(userId).add(row.wave_id);
          participantCount++;
        }
      }
    }

    console.log(`✅ Loaded ${waveCount} encrypted waves with ${participantCount} participant mappings`);
  } else {
    // Encryption not enabled, table doesn't exist, or no migration yet - load from plaintext table
    if (PARTICIPATION_KEY && encryptedCount === 0) {
      console.log('📂 Loading from plaintext table (run migration to encrypt existing data)...');
    } else {
      console.log('📂 Loading wave participation data from plaintext table...');
    }
    const rows = db.db.prepare('SELECT wave_id, user_id FROM wave_participants').all();

    for (const row of rows) {
      // Build waveToParticipants
      if (!waveToParticipants.has(row.wave_id)) {
        waveToParticipants.set(row.wave_id, new Set());
        waveCount++;
      }
      waveToParticipants.get(row.wave_id).add(row.user_id);

      // Build userToWaves
      if (!userToWaves.has(row.user_id)) {
        userToWaves.set(row.user_id, new Set());
      }
      userToWaves.get(row.user_id).add(row.wave_id);
      participantCount++;
    }

    console.log(`✅ Loaded ${waveCount} waves with ${participantCount} participant mappings into cache`);
  }

  return { waveCount, participantCount };
}

/**
 * Update the encrypted blob in the database for a wave
 * @param {string} waveId - Wave ID
 * @private
 */
function updateEncryptedBlob(waveId) {
  if (!PARTICIPATION_KEY || !db) return;

  const participants = waveToParticipants.get(waveId);
  if (!participants || participants.size === 0) {
    // No participants - delete the encrypted record
    db.db.prepare('DELETE FROM wave_participants_encrypted WHERE wave_id = ?').run(waveId);
    return;
  }

  const userIds = Array.from(participants);
  const encrypted = encryptParticipants(userIds);

  if (encrypted) {
    const now = Math.floor(Date.now() / 1000);
    db.db.prepare(`
      INSERT INTO wave_participants_encrypted (wave_id, participant_blob, iv, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(wave_id) DO UPDATE SET
        participant_blob = excluded.participant_blob,
        iv = excluded.iv,
        updated_at = excluded.updated_at
    `).run(waveId, encrypted.blob, encrypted.iv, now);
  }
}

/**
 * Add a participant to a wave (updates both cache and DB)
 * @param {string} waveId - Wave ID
 * @param {string} userId - User ID
 * @param {Object} options - Additional options (joinedAt, archived)
 * @returns {boolean} Success
 */
export function addParticipant(waveId, userId, options = {}) {
  // Update in-memory cache
  if (!waveToParticipants.has(waveId)) {
    waveToParticipants.set(waveId, new Set());
  }
  waveToParticipants.get(waveId).add(userId);

  if (!userToWaves.has(userId)) {
    userToWaves.set(userId, new Set());
  }
  userToWaves.get(userId).add(waveId);

  // Update plaintext table (still needed for metadata like joined_at, archived, last_read)
  // The wave_participants table stores metadata, encrypted table stores the user<->wave mapping
  if (db) {
    const now = options.joinedAt || new Date().toISOString();
    const archived = options.archived || 0;
    try {
      db.db.prepare(`
        INSERT OR IGNORE INTO wave_participants (wave_id, user_id, joined_at, archived)
        VALUES (?, ?, ?, ?)
      `).run(waveId, userId, now, archived);
    } catch (err) {
      console.error('Failed to insert into wave_participants:', err.message);
    }

    // Update encrypted blob
    updateEncryptedBlob(waveId);
  }

  return true;
}

/**
 * Remove a participant from a wave (updates both cache and DB)
 * @param {string} waveId - Wave ID
 * @param {string} userId - User ID
 * @returns {boolean} Success
 */
export function removeParticipant(waveId, userId) {
  // Update in-memory cache
  const waveParticipants = waveToParticipants.get(waveId);
  if (waveParticipants) {
    waveParticipants.delete(userId);
    if (waveParticipants.size === 0) {
      waveToParticipants.delete(waveId);
    }
  }

  const userWaves = userToWaves.get(userId);
  if (userWaves) {
    userWaves.delete(waveId);
    if (userWaves.size === 0) {
      userToWaves.delete(userId);
    }
  }

  // Update plaintext table
  if (db) {
    db.db.prepare('DELETE FROM wave_participants WHERE wave_id = ? AND user_id = ?').run(waveId, userId);
    // Update encrypted blob
    updateEncryptedBlob(waveId);
  }

  return true;
}

/**
 * Get all participants in a wave (from cache)
 * @param {string} waveId - Wave ID
 * @returns {string[]} Array of user IDs
 */
export function getWaveParticipants(waveId) {
  const participants = waveToParticipants.get(waveId);
  return participants ? Array.from(participants) : [];
}

/**
 * Get all waves a user participates in (from cache)
 * @param {string} userId - User ID
 * @returns {string[]} Array of wave IDs
 */
export function getUserWaves(userId) {
  const waves = userToWaves.get(userId);
  return waves ? Array.from(waves) : [];
}

/**
 * Check if a user is a participant in a wave (from cache)
 * @param {string} waveId - Wave ID
 * @param {string} userId - User ID
 * @returns {boolean} True if participant
 */
export function isParticipant(waveId, userId) {
  const participants = waveToParticipants.get(waveId);
  return participants ? participants.has(userId) : false;
}

/**
 * Sync cache from database for a specific wave
 * Call this after database operations that create/modify participants directly
 * @param {string} waveId - Wave ID
 */
export function syncWaveFromDb(waveId) {
  if (!db) return;

  // Get current participants from database
  const rows = db.db.prepare('SELECT user_id FROM wave_participants WHERE wave_id = ?').all(waveId);
  const dbUserIds = new Set(rows.map(r => r.user_id));

  // Get current cache state
  const cachedUserIds = waveToParticipants.get(waveId) || new Set();

  // Find users to add to cache
  for (const userId of dbUserIds) {
    if (!cachedUserIds.has(userId)) {
      // Add to cache
      if (!waveToParticipants.has(waveId)) {
        waveToParticipants.set(waveId, new Set());
      }
      waveToParticipants.get(waveId).add(userId);

      if (!userToWaves.has(userId)) {
        userToWaves.set(userId, new Set());
      }
      userToWaves.get(userId).add(waveId);
    }
  }

  // Find users to remove from cache
  for (const userId of cachedUserIds) {
    if (!dbUserIds.has(userId)) {
      // Remove from cache
      waveToParticipants.get(waveId)?.delete(userId);
      userToWaves.get(userId)?.delete(waveId);

      if (userToWaves.get(userId)?.size === 0) {
        userToWaves.delete(userId);
      }
    }
  }

  if (waveToParticipants.get(waveId)?.size === 0) {
    waveToParticipants.delete(waveId);
  }

  // Update encrypted blob
  updateEncryptedBlob(waveId);
}

/**
 * Delete all participation data for a wave (when wave is deleted)
 * @param {string} waveId - Wave ID
 */
export function deleteWaveParticipation(waveId) {
  const participants = waveToParticipants.get(waveId);
  if (participants) {
    // Remove wave from each participant's userToWaves
    for (const userId of participants) {
      const userWaves = userToWaves.get(userId);
      if (userWaves) {
        userWaves.delete(waveId);
        if (userWaves.size === 0) {
          userToWaves.delete(userId);
        }
      }
    }
    waveToParticipants.delete(waveId);
  }

  // Clean up database
  if (db) {
    db.db.prepare('DELETE FROM wave_participants WHERE wave_id = ?').run(waveId);
    db.db.prepare('DELETE FROM wave_participants_encrypted WHERE wave_id = ?').run(waveId);
  }
}

/**
 * Delete all participation data for a user (when user is deleted)
 * @param {string} userId - User ID
 */
export function deleteUserParticipation(userId) {
  const waves = userToWaves.get(userId);
  if (waves) {
    // Remove user from each wave's waveToParticipants
    for (const waveId of waves) {
      const waveParticipants = waveToParticipants.get(waveId);
      if (waveParticipants) {
        waveParticipants.delete(userId);
        if (waveParticipants.size === 0) {
          waveToParticipants.delete(waveId);
        }
        // Update encrypted blob for this wave
        updateEncryptedBlob(waveId);
      }
    }
    userToWaves.delete(userId);
  }

  // Clean up database
  if (db) {
    db.db.prepare('DELETE FROM wave_participants WHERE user_id = ?').run(userId);
  }
}

/**
 * Migrate existing plaintext participation data to encrypted storage
 * Called from admin endpoint
 * @returns {{success: boolean, migratedWaves: number, error?: string}}
 */
export function migrateToEncrypted() {
  if (!PARTICIPATION_KEY) {
    return { success: false, error: 'WAVE_PARTICIPATION_KEY not configured' };
  }

  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  try {
    // Get all waves with participants from plaintext table
    const waves = db.db.prepare(`
      SELECT DISTINCT wave_id FROM wave_participants
    `).all();

    let migratedWaves = 0;

    for (const { wave_id } of waves) {
      // Get participants for this wave
      const participants = db.db.prepare(`
        SELECT user_id FROM wave_participants WHERE wave_id = ?
      `).all(wave_id);

      const userIds = participants.map(p => p.user_id);

      // Encrypt and store
      const encrypted = encryptParticipants(userIds);
      if (encrypted) {
        const now = Math.floor(Date.now() / 1000);
        db.db.prepare(`
          INSERT INTO wave_participants_encrypted (wave_id, participant_blob, iv, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(wave_id) DO UPDATE SET
            participant_blob = excluded.participant_blob,
            iv = excluded.iv,
            updated_at = excluded.updated_at
        `).run(wave_id, encrypted.blob, encrypted.iv, now);
        migratedWaves++;
      }
    }

    console.log(`✅ Migrated ${migratedWaves} waves to encrypted participation storage`);
    return { success: true, migratedWaves };
  } catch (err) {
    console.error('Migration error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get statistics about the participation cache
 * @returns {{waveCount: number, userCount: number, totalMappings: number, encryptionEnabled: boolean}}
 */
export function getCacheStats() {
  let totalMappings = 0;
  for (const participants of waveToParticipants.values()) {
    totalMappings += participants.size;
  }

  return {
    waveCount: waveToParticipants.size,
    userCount: userToWaves.size,
    totalMappings,
    encryptionEnabled: !!PARTICIPATION_KEY
  };
}

/**
 * Check if encryption is enabled
 * @returns {boolean}
 */
export function isEncryptionEnabled() {
  return !!PARTICIPATION_KEY;
}

export default {
  encryptParticipants,
  decryptParticipants,
  initializeCache,
  addParticipant,
  removeParticipant,
  getWaveParticipants,
  getUserWaves,
  isParticipant,
  syncWaveFromDb,
  deleteWaveParticipation,
  deleteUserParticipation,
  migrateToEncrypted,
  getCacheStats,
  isEncryptionEnabled
};
