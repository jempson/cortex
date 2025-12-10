/**
 * Cortex SQLite Database Module
 *
 * This module provides the Database class that uses SQLite for persistence.
 * It's a drop-in replacement for the JSON file-based database.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'cortex.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * SQLite-backed Database class
 * Provides the same interface as the original JSON-based Database class
 */
export class DatabaseSQLite {
  constructor(options = {}) {
    this.dbPath = options.dbPath || DB_PATH;
    this.db = null;
    this.init();
  }

  init() {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Check if this is a fresh database
    const isNewDb = !fs.existsSync(this.dbPath);

    // Open database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Create schema if new database
    if (isNewDb) {
      console.log('📦 Creating new SQLite database...');
      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
      this.db.exec(schema);
      console.log('✅ SQLite database created');

      // Seed demo data if configured
      if (process.env.SEED_DEMO_DATA === 'true') {
        this.seedDemoData();
      }
    } else {
      console.log('📂 Connected to SQLite database');
      // Apply any schema updates for existing databases
      this.applySchemaUpdates();
    }

    // Prepare commonly used statements
    this.prepareStatements();
  }

  applySchemaUpdates() {
    // Check if FTS table exists
    const ftsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'
    `).get();

    if (!ftsExists) {
      console.log('📝 Creating FTS5 search index...');

      // Create FTS5 virtual table
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          id UNINDEXED,
          content,
          content='messages',
          content_rowid='rowid'
        );
      `);

      // Create triggers to keep FTS in sync
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
          INSERT INTO messages_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END;
      `);

      // Populate FTS with existing messages
      const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
      if (messageCount > 0) {
        console.log(`📚 Indexing ${messageCount} existing messages...`);
        this.db.exec(`
          INSERT INTO messages_fts(rowid, id, content)
          SELECT rowid, id, content FROM messages;
        `);
      }

      console.log('✅ FTS5 search index created');
    }

    // Check if reports table exists (v1.9.0)
    const reportsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='reports'
    `).get();

    if (!reportsExists) {
      console.log('📝 Creating reports table...');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          details TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          resolution TEXT,
          resolution_notes TEXT,
          created_at TEXT NOT NULL,
          resolved_at TEXT,
          resolved_by TEXT REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
        CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
        CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
      `);
      console.log('✅ Reports table created');
    }

    // Check if warnings table exists (v1.9.0)
    const warningsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='warnings'
    `).get();

    if (!warningsExists) {
      console.log('📝 Creating warnings table...');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS warnings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          issued_by TEXT NOT NULL REFERENCES users(id),
          reason TEXT NOT NULL,
          report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id);
        CREATE INDEX IF NOT EXISTS idx_warnings_issued_by ON warnings(issued_by);
        CREATE INDEX IF NOT EXISTS idx_warnings_report ON warnings(report_id);
      `);
      console.log('✅ Warnings table created');
    }

    // Check if moderation_log table exists (v1.9.0)
    const modLogExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='moderation_log'
    `).get();

    if (!modLogExists) {
      console.log('📝 Creating moderation_log table...');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS moderation_log (
          id TEXT PRIMARY KEY,
          admin_id TEXT NOT NULL REFERENCES users(id),
          action_type TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          reason TEXT,
          details TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_moderation_log_admin ON moderation_log(admin_id);
        CREATE INDEX IF NOT EXISTS idx_moderation_log_target ON moderation_log(target_type, target_id);
        CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log(created_at DESC);
      `);
      console.log('✅ Moderation log table created');
    }
  }

  prepareStatements() {
    // User statements
    this.stmts = {
      findUserByHandle: this.db.prepare(`
        SELECT * FROM users WHERE handle = ? COLLATE NOCASE OR email = ? COLLATE NOCASE
      `),
      findUserById: this.db.prepare('SELECT * FROM users WHERE id = ?'),
      insertUser: this.db.prepare(`
        INSERT INTO users (id, handle, email, password_hash, display_name, avatar, avatar_url, bio, node_name, status, is_admin, created_at, last_seen, last_handle_change, preferences)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateUser: this.db.prepare(`
        UPDATE users SET handle = ?, email = ?, display_name = ?, avatar = ?, avatar_url = ?, bio = ?, node_name = ?, status = ?, is_admin = ?, last_seen = ?, last_handle_change = ?, preferences = ?
        WHERE id = ?
      `),
      updateUserStatus: this.db.prepare('UPDATE users SET status = ?, last_seen = ? WHERE id = ?'),
      updateUserPassword: this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
      countUsers: this.db.prepare('SELECT COUNT(*) as count FROM users'),
      searchUsers: this.db.prepare(`
        SELECT id, handle, display_name, avatar, status, node_name
        FROM users
        WHERE id != ? AND (handle LIKE ? OR display_name LIKE ?)
        LIMIT 10
      `),
    };
  }

  seedDemoData() {
    console.log('🌱 Seeding demo data...');
    const passwordHash = bcrypt.hashSync('Demo123!', 12);
    const now = new Date().toISOString();

    const demoUsers = [
      { id: 'user-mal', handle: 'mal', email: 'mal@serenity.ship', displayName: 'Malcolm Reynolds', avatar: 'M', isAdmin: true },
      { id: 'user-zoe', handle: 'zoe', email: 'zoe@serenity.ship', displayName: 'Zoe Washburne', avatar: 'Z', isAdmin: false },
      { id: 'user-wash', handle: 'wash', email: 'wash@serenity.ship', displayName: 'Hoban Washburne', avatar: 'W', isAdmin: false },
      { id: 'user-kaylee', handle: 'kaylee', email: 'kaylee@serenity.ship', displayName: 'Kaylee Frye', avatar: 'K', isAdmin: false },
      { id: 'user-jayne', handle: 'jayne', email: 'jayne@serenity.ship', displayName: 'Jayne Cobb', avatar: 'J', isAdmin: false },
    ];

    const insertUser = this.db.prepare(`
      INSERT INTO users (id, handle, email, password_hash, display_name, avatar, node_name, status, is_admin, created_at, last_seen, preferences)
      VALUES (?, ?, ?, ?, ?, ?, 'Serenity', 'offline', ?, ?, ?, '{"theme":"firefly","fontSize":"medium"}')
    `);

    for (const u of demoUsers) {
      insertUser.run(u.id, u.handle, u.email, passwordHash, u.displayName, u.avatar, u.isAdmin ? 1 : 0, now, now);
    }

    // Create demo group
    this.db.prepare(`
      INSERT INTO groups (id, name, description, created_by, created_at)
      VALUES ('group-crew', 'Serenity Crew', 'The crew of Serenity', 'user-mal', ?)
    `).run(now);

    const insertMember = this.db.prepare(`
      INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ('group-crew', ?, ?, ?)
    `);
    for (const u of demoUsers) {
      insertMember.run(u.id, u.id === 'user-mal' ? 'admin' : 'member', now);
    }

    // Demo waves
    const waves = [
      { id: 'wave-1', title: 'Welcome to Cortex', privacy: 'public', createdBy: 'user-mal' },
      { id: 'wave-2', title: 'Private Chat Test', privacy: 'private', createdBy: 'user-mal' },
      { id: 'wave-3', title: 'Crew Discussion', privacy: 'group', groupId: 'group-crew', createdBy: 'user-mal' },
      { id: 'wave-4', title: 'Zoe Private Wave', privacy: 'private', createdBy: 'user-zoe' },
      { id: 'wave-5', title: 'Wash Public Wave', privacy: 'public', createdBy: 'user-wash' },
    ];

    const insertWave = this.db.prepare(`
      INSERT INTO waves (id, title, privacy, group_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const w of waves) {
      insertWave.run(w.id, w.title, w.privacy, w.groupId || null, w.createdBy, now, now);
    }

    // Wave participants
    const participants = [
      { waveId: 'wave-1', userId: 'user-mal' },
      { waveId: 'wave-2', userId: 'user-mal' },
      { waveId: 'wave-2', userId: 'user-zoe' },
      { waveId: 'wave-3', userId: 'user-mal' },
      { waveId: 'wave-3', userId: 'user-zoe' },
      { waveId: 'wave-3', userId: 'user-wash' },
      { waveId: 'wave-4', userId: 'user-zoe' },
      { waveId: 'wave-4', userId: 'user-mal' },
      { waveId: 'wave-5', userId: 'user-wash' },
    ];

    const insertParticipant = this.db.prepare(`
      INSERT INTO wave_participants (wave_id, user_id, joined_at, archived) VALUES (?, ?, ?, 0)
    `);
    for (const p of participants) {
      insertParticipant.run(p.waveId, p.userId, now);
    }

    // Demo messages
    const messages = [
      { id: 'msg-1', waveId: 'wave-1', authorId: 'user-mal', content: 'Welcome to Cortex! This is a public wave visible to everyone.', privacy: 'public' },
      { id: 'msg-2', waveId: 'wave-2', authorId: 'user-mal', content: 'This is a private wave for testing.', privacy: 'private' },
      { id: 'msg-3', waveId: 'wave-3', authorId: 'user-mal', content: 'This is a group wave for the crew.', privacy: 'group' },
      { id: 'msg-4', waveId: 'wave-4', authorId: 'user-zoe', content: "Zoe's private wave.", privacy: 'private' },
      { id: 'msg-5', waveId: 'wave-5', authorId: 'user-wash', content: "Wash's public wave.", privacy: 'public' },
    ];

    const insertMessage = this.db.prepare(`
      INSERT INTO messages (id, wave_id, author_id, content, privacy, version, created_at, reactions)
      VALUES (?, ?, ?, ?, ?, 1, ?, '{}')
    `);
    const insertReadBy = this.db.prepare(`
      INSERT INTO message_read_by (message_id, user_id, read_at) VALUES (?, ?, ?)
    `);

    for (const m of messages) {
      insertMessage.run(m.id, m.waveId, m.authorId, m.content, m.privacy, now);
      insertReadBy.run(m.id, m.authorId, now);
    }

    console.log('✅ Demo data seeded (password: Demo123!)');
  }

  // Helper to convert SQLite row to user object
  rowToUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      handle: row.handle,
      email: row.email,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      nodeName: row.node_name,
      status: row.status,
      isAdmin: row.is_admin === 1,
      createdAt: row.created_at,
      lastSeen: row.last_seen,
      lastHandleChange: row.last_handle_change,
      preferences: row.preferences ? JSON.parse(row.preferences) : { theme: 'firefly', fontSize: 'medium' },
      handleHistory: this.getHandleHistory(row.id),
    };
  }

  getHandleHistory(userId) {
    const rows = this.db.prepare('SELECT old_handle, changed_at FROM handle_history WHERE user_id = ? ORDER BY changed_at DESC').all(userId);
    return rows.map(r => ({ handle: r.old_handle, changedAt: r.changed_at }));
  }

  // === User Methods ===
  findUserByHandle(handle) {
    if (!handle) return null;
    const sanitized = handle.toLowerCase().trim();
    const row = this.stmts.findUserByHandle.get(sanitized, sanitized);
    return this.rowToUser(row);
  }

  findUserById(id) {
    if (!id) return null;
    const row = this.stmts.findUserById.get(id);
    return this.rowToUser(row);
  }

  createUser(userData) {
    const now = new Date().toISOString();
    const isFirstUser = this.stmts.countUsers.get().count === 0;

    const user = {
      id: userData.id,
      handle: userData.handle,
      email: userData.email,
      passwordHash: userData.passwordHash,
      displayName: userData.displayName,
      avatar: userData.avatar || '?',
      avatarUrl: userData.avatarUrl || null,
      bio: userData.bio || null,
      nodeName: userData.nodeName || 'Local',
      status: userData.status || 'online',
      isAdmin: isFirstUser,
      createdAt: now,
      lastSeen: now,
      lastHandleChange: null,
      preferences: userData.preferences || { theme: 'firefly', fontSize: 'medium' },
      handleHistory: [],
    };

    this.stmts.insertUser.run(
      user.id, user.handle, user.email, user.passwordHash, user.displayName,
      user.avatar, user.avatarUrl, user.bio, user.nodeName, user.status,
      user.isAdmin ? 1 : 0, user.createdAt, user.lastSeen, user.lastHandleChange,
      JSON.stringify(user.preferences)
    );

    return user;
  }

  updateUser(userId, updates) {
    const user = this.findUserById(userId);
    if (!user) return null;

    const updated = { ...user, ...updates };

    this.db.prepare(`
      UPDATE users SET
        handle = ?, email = ?, display_name = ?, avatar = ?, avatar_url = ?,
        bio = ?, node_name = ?, status = ?, is_admin = ?, last_seen = ?,
        last_handle_change = ?, preferences = ?
      WHERE id = ?
    `).run(
      updated.handle, updated.email, updated.displayName, updated.avatar, updated.avatarUrl,
      updated.bio, updated.nodeName, updated.status, updated.isAdmin ? 1 : 0, updated.lastSeen,
      updated.lastHandleChange, JSON.stringify(updated.preferences), userId
    );

    return this.findUserById(userId);
  }

  updateUserStatus(userId, status) {
    const now = new Date().toISOString();
    this.stmts.updateUserStatus.run(status, now, userId);
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = this.findUserById(userId);
    if (!user) return { success: false, error: 'User not found' };

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return { success: false, error: 'Current password is incorrect' };

    // Simple password validation (detailed validation done in route)
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    this.stmts.updateUserPassword.run(newHash, userId);
    return { success: true };
  }

  requestHandleChange(userId, newHandle) {
    const user = this.findUserById(userId);
    if (!user) return { success: false, error: 'User not found' };

    // Check if handle is taken
    const existing = this.db.prepare('SELECT id FROM users WHERE handle = ? COLLATE NOCASE AND id != ?').get(newHandle, userId);
    if (existing) return { success: false, error: 'Handle is already taken' };

    // Check cooldown (30 days)
    if (user.lastHandleChange) {
      const daysSince = (Date.now() - new Date(user.lastHandleChange).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return { success: false, error: `You can change your handle again in ${Math.ceil(30 - daysSince)} days` };
      }
    }

    // Check if handle was recently used by someone else (90 day reservation)
    const recentlyUsed = this.db.prepare(`
      SELECT 1 FROM handle_history
      WHERE old_handle = ? COLLATE NOCASE
      AND changed_at > datetime('now', '-90 days')
    `).get(newHandle);
    if (recentlyUsed) return { success: false, error: 'This handle was recently used and is reserved for 90 days' };

    // Create request
    const request = {
      id: `req-${uuidv4()}`,
      userId,
      currentHandle: user.handle,
      newHandle: newHandle,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO handle_requests (id, user_id, current_handle, new_handle, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(request.id, request.userId, request.currentHandle, request.newHandle, request.status, request.createdAt);

    return { success: true, request };
  }

  approveHandleChange(requestId, adminId) {
    const admin = this.findUserById(adminId);
    if (!admin?.isAdmin) return { success: false, error: 'Not authorized' };

    const request = this.db.prepare('SELECT * FROM handle_requests WHERE id = ?').get(requestId);
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Request not found or already processed' };
    }

    const user = this.findUserById(request.user_id);
    if (!user) return { success: false, error: 'User not found' };

    const now = new Date().toISOString();

    // Store old handle in history
    this.db.prepare('INSERT INTO handle_history (user_id, old_handle, changed_at) VALUES (?, ?, ?)').run(user.id, user.handle, now);

    // Update handle
    this.db.prepare('UPDATE users SET handle = ?, last_handle_change = ? WHERE id = ?').run(request.new_handle, now, user.id);

    // Update request
    this.db.prepare(`
      UPDATE handle_requests SET status = 'approved', processed_at = ?, processed_by = ? WHERE id = ?
    `).run(now, adminId, requestId);

    return { success: true };
  }

  rejectHandleChange(requestId, adminId, reason) {
    const admin = this.findUserById(adminId);
    if (!admin?.isAdmin) return { success: false, error: 'Not authorized' };

    const request = this.db.prepare('SELECT * FROM handle_requests WHERE id = ?').get(requestId);
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Request not found or already processed' };
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE handle_requests SET status = 'rejected', reason = ?, processed_at = ?, processed_by = ? WHERE id = ?
    `).run(reason, now, adminId, requestId);

    return { success: true };
  }

  getPendingHandleRequests() {
    return this.db.prepare(`
      SELECT * FROM handle_requests WHERE status = 'pending' ORDER BY created_at DESC
    `).all().map(r => ({
      id: r.id,
      userId: r.user_id,
      currentHandle: r.current_handle,
      newHandle: r.new_handle,
      status: r.status,
      reason: r.reason,
      createdAt: r.created_at,
      processedAt: r.processed_at,
      processedBy: r.processed_by,
    }));
  }

  searchUsers(query, excludeUserId) {
    if (!query || query.length < 2) return [];
    const pattern = `%${query}%`;
    const rows = this.stmts.searchUsers.all(excludeUserId, pattern, pattern);
    return rows.map(r => ({
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      avatar: r.avatar,
      status: r.status,
      nodeName: r.node_name,
    }));
  }

  // === Contact Methods ===
  getContactsForUser(userId) {
    const rows = this.db.prepare(`
      SELECT u.id, u.handle, u.display_name, u.avatar, u.status, u.node_name
      FROM contacts c
      JOIN users u ON c.contact_id = u.id
      WHERE c.user_id = ?
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      handle: r.handle,
      name: r.display_name,
      avatar: r.avatar,
      status: r.status,
      nodeName: r.node_name,
    }));
  }

  addContact(userId, contactId) {
    try {
      this.db.prepare('INSERT INTO contacts (user_id, contact_id, added_at) VALUES (?, ?, ?)').run(userId, contactId, new Date().toISOString());
      return true;
    } catch (err) {
      // Unique constraint violation means already exists
      return false;
    }
  }

  removeContact(userId, contactId) {
    const result = this.db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?').run(userId, contactId);
    return result.changes > 0;
  }

  isContact(userId, contactId) {
    const row = this.db.prepare('SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?').get(userId, contactId);
    return !!row;
  }

  // === Contact Request Methods ===
  createContactRequest(fromUserId, toUserId, message = null) {
    const fromUser = this.findUserById(fromUserId);
    const toUser = this.findUserById(toUserId);
    if (!fromUser || !toUser) return { error: 'User not found' };
    if (fromUserId === toUserId) return { error: 'Cannot add yourself as a contact' };
    if (this.isContact(fromUserId, toUserId)) return { error: 'Already a contact' };
    if (this.isBlocked(toUserId, fromUserId)) return { error: 'Cannot send request to this user' };

    // Check for existing pending request
    const existing = this.db.prepare(`
      SELECT id, from_user_id FROM contact_requests
      WHERE status = 'pending' AND (
        (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
      )
    `).get(fromUserId, toUserId, toUserId, fromUserId);

    if (existing) {
      return { error: existing.from_user_id === fromUserId ? 'Request already pending' : 'This user has already sent you a request' };
    }

    const request = {
      id: uuidv4(),
      from_user_id: fromUserId,
      to_user_id: toUserId,
      message: message,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO contact_requests (id, from_user_id, to_user_id, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(request.id, request.from_user_id, request.to_user_id, request.message, request.status, request.created_at);

    return {
      ...request,
      from_user: { id: fromUser.id, handle: fromUser.handle, displayName: fromUser.displayName, avatar: fromUser.avatar },
      to_user: { id: toUser.id, handle: toUser.handle, displayName: toUser.displayName, avatar: toUser.avatar },
    };
  }

  getContactRequestsForUser(userId) {
    const rows = this.db.prepare(`
      SELECT cr.*, u.id as fu_id, u.handle as fu_handle, u.display_name as fu_display_name, u.avatar as fu_avatar
      FROM contact_requests cr
      JOIN users u ON cr.from_user_id = u.id
      WHERE cr.to_user_id = ? AND cr.status = 'pending'
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      from_user_id: r.from_user_id,
      to_user_id: r.to_user_id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      responded_at: r.responded_at,
      from_user: { id: r.fu_id, handle: r.fu_handle, displayName: r.fu_display_name, avatar: r.fu_avatar },
    }));
  }

  getSentContactRequests(userId) {
    const rows = this.db.prepare(`
      SELECT cr.*, u.id as tu_id, u.handle as tu_handle, u.display_name as tu_display_name, u.avatar as tu_avatar
      FROM contact_requests cr
      JOIN users u ON cr.to_user_id = u.id
      WHERE cr.from_user_id = ? AND cr.status = 'pending'
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      from_user_id: r.from_user_id,
      to_user_id: r.to_user_id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      responded_at: r.responded_at,
      to_user: { id: r.tu_id, handle: r.tu_handle, displayName: r.tu_display_name, avatar: r.tu_avatar },
    }));
  }

  getContactRequest(requestId) {
    return this.db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(requestId);
  }

  acceptContactRequest(requestId, userId) {
    const request = this.getContactRequest(requestId);
    if (!request) return { error: 'Request not found' };
    if (request.to_user_id !== userId) return { error: 'Not authorized' };
    if (request.status !== 'pending') return { error: 'Request already processed' };

    const now = new Date().toISOString();

    // Update request
    this.db.prepare('UPDATE contact_requests SET status = ?, responded_at = ? WHERE id = ?').run('accepted', now, requestId);

    // Create mutual contacts
    this.addContact(request.from_user_id, request.to_user_id);
    this.addContact(request.to_user_id, request.from_user_id);

    return { success: true, request: { ...request, status: 'accepted', responded_at: now } };
  }

  declineContactRequest(requestId, userId) {
    const request = this.getContactRequest(requestId);
    if (!request) return { error: 'Request not found' };
    if (request.to_user_id !== userId) return { error: 'Not authorized' };
    if (request.status !== 'pending') return { error: 'Request already processed' };

    const now = new Date().toISOString();
    this.db.prepare('UPDATE contact_requests SET status = ?, responded_at = ? WHERE id = ?').run('declined', now, requestId);

    return { success: true, request: { ...request, status: 'declined', responded_at: now } };
  }

  cancelContactRequest(requestId, userId) {
    const request = this.getContactRequest(requestId);
    if (!request) return { error: 'Request not found' };
    if (request.from_user_id !== userId) return { error: 'Not authorized' };
    if (request.status !== 'pending') return { error: 'Request already processed' };

    this.db.prepare('DELETE FROM contact_requests WHERE id = ?').run(requestId);
    return { success: true };
  }

  getPendingRequestBetween(userId1, userId2) {
    return this.db.prepare(`
      SELECT * FROM contact_requests
      WHERE status = 'pending' AND (
        (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
      )
    `).get(userId1, userId2, userId2, userId1);
  }

  // === Group Methods ===
  getGroupsForUser(userId) {
    const rows = this.db.prepare(`
      SELECT g.*, gm.role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdBy: r.created_by,
      createdAt: r.created_at,
      memberCount: r.member_count,
      role: r.role,
    }));
  }

  getGroup(groupId) {
    const row = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  getGroupMembers(groupId) {
    const rows = this.db.prepare(`
      SELECT u.id, u.handle, u.display_name, u.avatar, u.status, gm.role, gm.joined_at
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `).all(groupId);

    return rows.map(r => ({
      id: r.id,
      handle: r.handle,
      name: r.display_name,
      avatar: r.avatar,
      status: r.status,
      role: r.role,
      joinedAt: r.joined_at,
    }));
  }

  isGroupMember(groupId, userId) {
    const row = this.db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    return !!row;
  }

  isGroupAdmin(groupId, userId) {
    const row = this.db.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'").get(groupId, userId);
    return !!row;
  }

  createGroup(data) {
    const now = new Date().toISOString();
    const group = {
      id: `group-${uuidv4()}`,
      name: data.name.slice(0, 100),
      description: (data.description || '').slice(0, 500),
      createdBy: data.createdBy,
      createdAt: now,
    };

    this.db.prepare('INSERT INTO groups (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(group.id, group.name, group.description, group.createdBy, group.createdAt);

    // Add creator as admin
    this.db.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)").run(group.id, data.createdBy, now);

    return group;
  }

  updateGroup(groupId, data) {
    const group = this.getGroup(groupId);
    if (!group) return null;

    const name = data.name ? data.name.slice(0, 100) : group.name;
    const description = data.description !== undefined ? data.description.slice(0, 500) : group.description;

    this.db.prepare('UPDATE groups SET name = ?, description = ? WHERE id = ?').run(name, description, groupId);

    return this.getGroup(groupId);
  }

  deleteGroup(groupId) {
    const result = this.db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    return result.changes > 0;
  }

  addGroupMember(groupId, userId, role = 'member') {
    if (this.isGroupMember(groupId, userId)) return false;
    try {
      this.db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(groupId, userId, role, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  removeGroupMember(groupId, userId) {
    const result = this.db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    if (result.changes === 0) return false;

    // Remove from group wave participants
    this.db.prepare(`
      DELETE FROM wave_participants
      WHERE user_id = ? AND wave_id IN (
        SELECT id FROM waves WHERE privacy = 'group' AND group_id = ?
      )
    `).run(userId, groupId);

    return true;
  }

  updateGroupMemberRole(groupId, userId, role) {
    const result = this.db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, userId);
    return result.changes > 0;
  }

  // === Group Invitation Methods ===
  createGroupInvitation(groupId, invitedBy, invitedUserId, message = null) {
    const group = this.getGroup(groupId);
    if (!group) return { error: 'Group not found' };

    const inviter = this.findUserById(invitedBy);
    const invitee = this.findUserById(invitedUserId);
    if (!inviter || !invitee) return { error: 'User not found' };
    if (invitedBy === invitedUserId) return { error: 'Cannot invite yourself' };
    if (!this.isGroupMember(groupId, invitedBy)) return { error: 'Only group members can invite others' };
    if (this.isGroupMember(groupId, invitedUserId)) return { error: 'User is already a group member' };
    if (this.isBlocked(invitedUserId, invitedBy)) return { error: 'Cannot invite this user' };

    // Check for existing pending invitation
    const existing = this.db.prepare(`
      SELECT 1 FROM group_invitations WHERE group_id = ? AND invited_user_id = ? AND status = 'pending'
    `).get(groupId, invitedUserId);
    if (existing) return { error: 'Invitation already pending for this user' };

    const invitation = {
      id: uuidv4(),
      group_id: groupId,
      invited_by: invitedBy,
      invited_user_id: invitedUserId,
      message,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO group_invitations (id, group_id, invited_by, invited_user_id, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(invitation.id, invitation.group_id, invitation.invited_by, invitation.invited_user_id, invitation.message, invitation.status, invitation.created_at);

    return {
      ...invitation,
      group: { id: group.id, name: group.name },
      invited_by_user: { id: inviter.id, handle: inviter.handle, displayName: inviter.displayName, avatar: inviter.avatar },
      invited_user: { id: invitee.id, handle: invitee.handle, displayName: invitee.displayName, avatar: invitee.avatar },
    };
  }

  getGroupInvitationsForUser(userId) {
    const rows = this.db.prepare(`
      SELECT gi.*,
        g.id as g_id, g.name as g_name, g.description as g_desc,
        u.id as u_id, u.handle as u_handle, u.display_name as u_display_name, u.avatar as u_avatar
      FROM group_invitations gi
      JOIN groups g ON gi.group_id = g.id
      JOIN users u ON gi.invited_by = u.id
      WHERE gi.invited_user_id = ? AND gi.status = 'pending'
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      group_id: r.group_id,
      invited_by: r.invited_by,
      invited_user_id: r.invited_user_id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      responded_at: r.responded_at,
      group: { id: r.g_id, name: r.g_name, description: r.g_desc },
      invited_by_user: { id: r.u_id, handle: r.u_handle, displayName: r.u_display_name, avatar: r.u_avatar },
    }));
  }

  getGroupInvitationsSent(groupId, userId) {
    const rows = this.db.prepare(`
      SELECT gi.*, u.id as u_id, u.handle as u_handle, u.display_name as u_display_name, u.avatar as u_avatar
      FROM group_invitations gi
      JOIN users u ON gi.invited_user_id = u.id
      WHERE gi.group_id = ? AND gi.invited_by = ? AND gi.status = 'pending'
    `).all(groupId, userId);

    return rows.map(r => ({
      id: r.id,
      group_id: r.group_id,
      invited_by: r.invited_by,
      invited_user_id: r.invited_user_id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      invited_user: { id: r.u_id, handle: r.u_handle, displayName: r.u_display_name, avatar: r.u_avatar },
    }));
  }

  getGroupInvitation(invitationId) {
    return this.db.prepare('SELECT * FROM group_invitations WHERE id = ?').get(invitationId);
  }

  acceptGroupInvitation(invitationId, userId) {
    const invitation = this.getGroupInvitation(invitationId);
    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.invited_user_id !== userId) return { error: 'Not authorized' };
    if (invitation.status !== 'pending') return { error: 'Invitation already processed' };

    if (this.isGroupMember(invitation.group_id, userId)) {
      this.db.prepare('UPDATE group_invitations SET status = ?, responded_at = ? WHERE id = ?').run('accepted', new Date().toISOString(), invitationId);
      return { error: 'Already a group member' };
    }

    const now = new Date().toISOString();
    this.db.prepare('UPDATE group_invitations SET status = ?, responded_at = ? WHERE id = ?').run('accepted', now, invitationId);
    this.addGroupMember(invitation.group_id, userId, 'member');

    const group = this.getGroup(invitation.group_id);
    return { success: true, invitation: { ...invitation, status: 'accepted', responded_at: now }, group: group ? { id: group.id, name: group.name } : null };
  }

  declineGroupInvitation(invitationId, userId) {
    const invitation = this.getGroupInvitation(invitationId);
    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.invited_user_id !== userId) return { error: 'Not authorized' };
    if (invitation.status !== 'pending') return { error: 'Invitation already processed' };

    const now = new Date().toISOString();
    this.db.prepare('UPDATE group_invitations SET status = ?, responded_at = ? WHERE id = ?').run('declined', now, invitationId);

    return { success: true, invitation: { ...invitation, status: 'declined', responded_at: now } };
  }

  cancelGroupInvitation(invitationId, userId) {
    const invitation = this.getGroupInvitation(invitationId);
    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.invited_by !== userId) return { error: 'Not authorized' };
    if (invitation.status !== 'pending') return { error: 'Invitation already processed' };

    this.db.prepare('DELETE FROM group_invitations WHERE id = ?').run(invitationId);
    return { success: true };
  }

  // === Moderation Methods ===
  blockUser(userId, blockedUserId) {
    const user = this.findUserById(userId);
    const blockedUser = this.findUserById(blockedUserId);
    if (!user || !blockedUser) return false;

    try {
      this.db.prepare('INSERT INTO blocks (id, user_id, blocked_user_id, blocked_at) VALUES (?, ?, ?, ?)').run(uuidv4(), userId, blockedUserId, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  unblockUser(userId, blockedUserId) {
    const result = this.db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_user_id = ?').run(userId, blockedUserId);
    return result.changes > 0;
  }

  getBlockedUsers(userId) {
    const rows = this.db.prepare(`
      SELECT b.*, u.handle, u.display_name FROM blocks b
      JOIN users u ON b.blocked_user_id = u.id
      WHERE b.user_id = ?
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      blockedUserId: r.blocked_user_id,
      blockedAt: r.blocked_at,
      handle: r.handle,
      displayName: r.display_name,
    }));
  }

  isBlocked(userId, otherUserId) {
    const row = this.db.prepare(`
      SELECT 1 FROM blocks WHERE
        (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)
    `).get(userId, otherUserId, otherUserId, userId);
    return !!row;
  }

  muteUser(userId, mutedUserId) {
    const user = this.findUserById(userId);
    const mutedUser = this.findUserById(mutedUserId);
    if (!user || !mutedUser) return false;

    try {
      this.db.prepare('INSERT INTO mutes (id, user_id, muted_user_id, muted_at) VALUES (?, ?, ?, ?)').run(uuidv4(), userId, mutedUserId, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  unmuteUser(userId, mutedUserId) {
    const result = this.db.prepare('DELETE FROM mutes WHERE user_id = ? AND muted_user_id = ?').run(userId, mutedUserId);
    return result.changes > 0;
  }

  getMutedUsers(userId) {
    const rows = this.db.prepare(`
      SELECT m.*, u.handle, u.display_name FROM mutes m
      JOIN users u ON m.muted_user_id = u.id
      WHERE m.user_id = ?
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      mutedUserId: r.muted_user_id,
      mutedAt: r.muted_at,
      handle: r.handle,
      displayName: r.display_name,
    }));
  }

  isMuted(userId, otherUserId) {
    const row = this.db.prepare('SELECT 1 FROM mutes WHERE user_id = ? AND muted_user_id = ?').get(userId, otherUserId);
    return !!row;
  }

  // === Report Methods ===
  createReport(reporterId, type, targetId, reason, details = '') {
    const report = {
      id: uuidv4(),
      reporterId: reporterId,
      type: type,
      targetId: targetId,
      reason: reason,
      details: details || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO reports (id, reporter_id, type, target_id, reason, details, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(report.id, report.reporterId, report.type, report.targetId, report.reason, report.details, report.status, report.createdAt);

    return report;
  }

  getReportsByUser(userId) {
    const rows = this.db.prepare(`
      SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC
    `).all(userId);

    return rows.map(r => this._enrichReport(r));
  }

  getPendingReports(limit = 50, offset = 0) {
    const rows = this.db.prepare(`
      SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    return rows.map(r => this._enrichReport(r));
  }

  getReportsByStatus(status, limit = 50, offset = 0) {
    const rows = this.db.prepare(`
      SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(status, limit, offset);

    return rows.map(r => this._enrichReport(r));
  }

  getReportById(reportId) {
    const row = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    if (!row) return null;
    return this._enrichReport(row);
  }

  getReports(filters = {}) {
    let sql = 'SELECT * FROM reports WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => this._enrichReport(r));
  }

  resolveReport(reportId, resolution, resolvedBy, notes = null) {
    const report = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    if (!report) return null;
    if (report.status !== 'pending') return null;

    const now = new Date().toISOString();
    const resolutionText = notes ? `${resolution}: ${notes}` : resolution;

    this.db.prepare(`
      UPDATE reports SET status = 'resolved', resolution = ?, resolved_at = ?, resolved_by = ? WHERE id = ?
    `).run(resolutionText, now, resolvedBy, reportId);

    return this.getReportById(reportId);
  }

  dismissReport(reportId, resolvedBy, reason = null) {
    const report = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    if (!report) return null;
    if (report.status !== 'pending') return null;

    const now = new Date().toISOString();
    const resolutionText = reason ? `Dismissed: ${reason}` : 'Dismissed';

    this.db.prepare(`
      UPDATE reports SET status = 'dismissed', resolution = ?, resolved_at = ?, resolved_by = ? WHERE id = ?
    `).run(resolutionText, now, resolvedBy, reportId);

    return this.getReportById(reportId);
  }

  // Helper method to enrich report data with context
  _enrichReport(r) {
    const reporter = this.findUserById(r.reporter_id);
    let context = {};

    if (r.type === 'message') {
      const msg = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(r.target_id);
      if (msg) {
        const author = this.findUserById(msg.author_id);
        const wave = this.getWave(msg.wave_id);
        context = {
          content: msg.content,
          authorHandle: author?.handle,
          authorName: author?.displayName,
          createdAt: msg.created_at,
          waveId: msg.wave_id,
          waveName: wave?.title
        };
      }
    } else if (r.type === 'wave') {
      const wave = this.getWave(r.target_id);
      if (wave) {
        const creator = this.findUserById(wave.createdBy);
        context = {
          title: wave.title,
          privacy: wave.privacy,
          creatorHandle: creator?.handle,
          creatorName: creator?.displayName
        };
      }
    } else if (r.type === 'user') {
      const user = this.findUserById(r.target_id);
      if (user) context = { handle: user.handle, displayName: user.displayName };
    }

    return {
      id: r.id,
      reporterId: r.reporter_id,
      type: r.type,
      targetId: r.target_id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      resolution: r.resolution,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by,
      reporterHandle: reporter?.handle,
      reporterName: reporter?.displayName,
      context,
    };
  }

  // === Warning Methods ===
  createWarning(userId, issuedBy, reason, reportId = null) {
    const id = `warn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO warnings (id, user_id, issued_by, reason, report_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, issuedBy, reason, reportId, now);

    // Log the moderation action
    this.logModerationAction(issuedBy, 'warning_issued', 'user', userId, reason);

    return { id, userId, issuedBy, reason, reportId, createdAt: now };
  }

  getWarningsByUser(userId) {
    const warnings = this.db.prepare(`
      SELECT w.*, u.handle as issued_by_handle, u.display_name as issued_by_name
      FROM warnings w
      LEFT JOIN users u ON w.issued_by = u.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
    `).all(userId);

    return warnings.map(w => ({
      id: w.id,
      userId: w.user_id,
      issuedBy: w.issued_by,
      issuedByHandle: w.issued_by_handle,
      issuedByName: w.issued_by_name,
      reason: w.reason,
      reportId: w.report_id,
      createdAt: w.created_at,
    }));
  }

  getUserWarningCount(userId) {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM warnings WHERE user_id = ?').get(userId);
    return result?.count || 0;
  }

  // === Moderation Log Methods ===
  logModerationAction(adminId, actionType, targetType, targetId, reason = null, details = null) {
    const id = `modlog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO moderation_log (id, admin_id, action_type, target_type, target_id, reason, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, adminId, actionType, targetType, targetId, reason, details, now);

    return { id, adminId, actionType, targetType, targetId, reason, details, createdAt: now };
  }

  getModerationLog(limit = 50, offset = 0) {
    const logs = this.db.prepare(`
      SELECT ml.*, u.handle as admin_handle, u.display_name as admin_name
      FROM moderation_log ml
      LEFT JOIN users u ON ml.admin_id = u.id
      ORDER BY ml.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return logs.map(l => ({
      id: l.id,
      adminId: l.admin_id,
      adminHandle: l.admin_handle,
      adminName: l.admin_name,
      actionType: l.action_type,
      targetType: l.target_type,
      targetId: l.target_id,
      reason: l.reason,
      details: l.details,
      createdAt: l.created_at,
    }));
  }

  getModerationLogForTarget(targetType, targetId) {
    const logs = this.db.prepare(`
      SELECT ml.*, u.handle as admin_handle, u.display_name as admin_name
      FROM moderation_log ml
      LEFT JOIN users u ON ml.admin_id = u.id
      WHERE ml.target_type = ? AND ml.target_id = ?
      ORDER BY ml.created_at DESC
    `).all(targetType, targetId);

    return logs.map(l => ({
      id: l.id,
      adminId: l.admin_id,
      adminHandle: l.admin_handle,
      adminName: l.admin_name,
      actionType: l.action_type,
      targetType: l.target_type,
      targetId: l.target_id,
      reason: l.reason,
      details: l.details,
      createdAt: l.created_at,
    }));
  }

  // === Wave Methods ===
  getWavesForUser(userId, includeArchived = false) {
    // Get user's group IDs
    const userGroupIds = this.db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId).map(r => r.group_id);

    // Get blocked/muted user IDs for unread count calculation
    const blockedIds = this.db.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').all(userId).map(r => r.blocked_user_id);
    const mutedIds = this.db.prepare('SELECT muted_user_id FROM mutes WHERE user_id = ?').all(userId).map(r => r.muted_user_id);

    // Build wave query
    let sql = `
      SELECT w.*, wp.archived, wp.last_read,
        u.display_name as creator_name, u.avatar as creator_avatar, u.handle as creator_handle,
        g.name as group_name,
        (SELECT COUNT(*) FROM messages WHERE wave_id = w.id) as message_count
      FROM waves w
      LEFT JOIN wave_participants wp ON w.id = wp.wave_id AND wp.user_id = ?
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN groups g ON w.group_id = g.id
      WHERE (
        w.privacy = 'public'
        OR (w.privacy = 'private' AND wp.user_id IS NOT NULL)
        OR (w.privacy = 'group' AND w.group_id IN (${userGroupIds.map(() => '?').join(',') || 'NULL'}))
      )
    `;

    const params = [userId, ...userGroupIds];

    if (!includeArchived) {
      sql += ' AND (wp.archived IS NULL OR wp.archived = 0)';
    }

    sql += ' ORDER BY w.updated_at DESC';

    const rows = this.db.prepare(sql).all(...params);

    return rows.map(r => {
      // Get participants for this wave
      const participants = this.getWaveParticipants(r.id);

      // Calculate unread count
      const unreadCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM messages m
        WHERE m.wave_id = ?
          AND m.deleted = 0
          AND m.author_id != ?
          AND m.author_id NOT IN (${blockedIds.map(() => '?').join(',') || 'NULL'})
          AND m.author_id NOT IN (${mutedIds.map(() => '?').join(',') || 'NULL'})
          AND NOT EXISTS (SELECT 1 FROM message_read_by mrb WHERE mrb.message_id = m.id AND mrb.user_id = ?)
      `).get(r.id, userId, ...blockedIds, ...mutedIds, userId).count;

      return {
        id: r.id,
        title: r.title,
        privacy: r.privacy,
        groupId: r.group_id,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        creator_name: r.creator_name || 'Unknown',
        creator_avatar: r.creator_avatar || '?',
        creator_handle: r.creator_handle || 'unknown',
        participants,
        message_count: r.message_count,
        unread_count: unreadCount,
        is_participant: r.archived !== null,
        is_archived: r.archived === 1,
        group_name: r.group_name,
      };
    });
  }

  getWave(waveId) {
    const row = this.db.prepare('SELECT * FROM waves WHERE id = ?').get(waveId);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      privacy: row.privacy,
      groupId: row.group_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getWaveParticipants(waveId) {
    const rows = this.db.prepare(`
      SELECT u.id, u.display_name, u.avatar, u.status, u.handle
      FROM wave_participants wp
      JOIN users u ON wp.user_id = u.id
      WHERE wp.wave_id = ?
    `).all(waveId);

    return rows.map(r => ({
      id: r.id,
      name: r.display_name,
      avatar: r.avatar,
      status: r.status,
      handle: r.handle,
    }));
  }

  canAccessWave(waveId, userId) {
    const wave = this.getWave(waveId);
    if (!wave) return false;

    if (wave.privacy === 'public') return true;

    if (wave.privacy === 'group' && wave.groupId) {
      return this.isGroupMember(wave.groupId, userId);
    }

    // Check if participant
    const participant = this.db.prepare('SELECT 1 FROM wave_participants WHERE wave_id = ? AND user_id = ?').get(waveId, userId);
    return !!participant;
  }

  createWave(data) {
    const now = new Date().toISOString();
    const wave = {
      id: `wave-${uuidv4()}`,
      title: data.title.slice(0, 200),
      privacy: data.privacy || 'private',
      groupId: data.groupId || null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare('INSERT INTO waves (id, title, privacy, group_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(wave.id, wave.title, wave.privacy, wave.groupId, wave.createdBy, wave.createdAt, wave.updatedAt);

    // Add creator as participant
    this.db.prepare('INSERT INTO wave_participants (wave_id, user_id, joined_at, archived) VALUES (?, ?, ?, 0)').run(wave.id, data.createdBy, now);

    // Add other participants
    if (data.participants) {
      for (const userId of data.participants) {
        if (userId !== data.createdBy) {
          this.db.prepare('INSERT OR IGNORE INTO wave_participants (wave_id, user_id, joined_at, archived) VALUES (?, ?, ?, 0)').run(wave.id, userId, now);
        }
      }
    }

    return wave;
  }

  updateWavePrivacy(waveId, privacy, groupId = null) {
    const wave = this.getWave(waveId);
    if (!wave) return null;

    const now = new Date().toISOString();
    this.db.prepare('UPDATE waves SET privacy = ?, group_id = ?, updated_at = ? WHERE id = ?').run(privacy, privacy === 'group' ? groupId : null, now, waveId);

    return this.getWave(waveId);
  }

  updateWaveTimestamp(waveId) {
    this.db.prepare('UPDATE waves SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), waveId);
  }

  addWaveParticipant(waveId, userId) {
    try {
      this.db.prepare('INSERT INTO wave_participants (wave_id, user_id, joined_at, archived) VALUES (?, ?, ?, 0)').run(waveId, userId, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  archiveWaveForUser(waveId, userId, archived = true) {
    const result = this.db.prepare('UPDATE wave_participants SET archived = ? WHERE wave_id = ? AND user_id = ?').run(archived ? 1 : 0, waveId, userId);
    return result.changes > 0;
  }

  markWaveAsRead(waveId, userId) {
    // Check if participant
    let participant = this.db.prepare('SELECT 1 FROM wave_participants WHERE wave_id = ? AND user_id = ?').get(waveId, userId);

    if (!participant && this.canAccessWave(waveId, userId)) {
      this.addWaveParticipant(waveId, userId);
      participant = true;
    }

    if (!participant) return false;

    this.db.prepare('UPDATE wave_participants SET last_read = ? WHERE wave_id = ? AND user_id = ?').run(new Date().toISOString(), waveId, userId);
    return true;
  }

  deleteWave(waveId, userId) {
    const wave = this.getWave(waveId);
    if (!wave) return { success: false, error: 'Wave not found' };
    if (wave.createdBy !== userId) return { success: false, error: 'Only wave creator can delete' };

    const participants = this.getWaveParticipants(waveId);

    // Delete wave (cascade will handle participants, messages, etc.)
    this.db.prepare('DELETE FROM waves WHERE id = ?').run(waveId);

    return { success: true, wave, participants };
  }

  // === Message Methods ===
  getMessagesForWave(waveId, userId = null) {
    // Get blocked/muted users
    let blockedIds = [];
    let mutedIds = [];
    if (userId) {
      blockedIds = this.db.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').all(userId).map(r => r.blocked_user_id);
      mutedIds = this.db.prepare('SELECT muted_user_id FROM mutes WHERE user_id = ?').all(userId).map(r => r.muted_user_id);
    }

    let sql = `
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url, u.handle as sender_handle
      FROM messages m
      JOIN users u ON m.author_id = u.id
      WHERE m.wave_id = ?
    `;
    const params = [waveId];

    if (blockedIds.length > 0) {
      sql += ` AND m.author_id NOT IN (${blockedIds.map(() => '?').join(',')})`;
      params.push(...blockedIds);
    }
    if (mutedIds.length > 0) {
      sql += ` AND m.author_id NOT IN (${mutedIds.map(() => '?').join(',')})`;
      params.push(...mutedIds);
    }

    sql += ' ORDER BY m.created_at ASC';

    const rows = this.db.prepare(sql).all(...params);

    return rows.map(m => {
      // Check if user has read this message
      const hasRead = userId ? !!this.db.prepare('SELECT 1 FROM message_read_by WHERE message_id = ? AND user_id = ?').get(m.id, userId) : false;
      const isUnread = m.deleted ? false : (userId ? !hasRead && m.author_id !== userId : false);

      // Get read by users
      const readBy = this.db.prepare('SELECT user_id FROM message_read_by WHERE message_id = ?').all(m.id).map(r => r.user_id);

      return {
        id: m.id,
        waveId: m.wave_id,
        parentId: m.parent_id,
        authorId: m.author_id,
        content: m.content,
        privacy: m.privacy,
        version: m.version,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        deleted: m.deleted === 1,
        deletedAt: m.deleted_at,
        reactions: m.reactions ? JSON.parse(m.reactions) : {},
        readBy,
        sender_name: m.sender_name,
        sender_avatar: m.sender_avatar,
        sender_avatar_url: m.sender_avatar_url,
        sender_handle: m.sender_handle,
        author_id: m.author_id,
        parent_id: m.parent_id,
        wave_id: m.wave_id,
        created_at: m.created_at,
        edited_at: m.edited_at,
        deleted_at: m.deleted_at,
        is_unread: isUnread,
      };
    });
  }

  createMessage(data) {
    const now = new Date().toISOString();
    const message = {
      id: `msg-${uuidv4()}`,
      waveId: data.waveId,
      parentId: data.parentId || null,
      authorId: data.authorId,
      content: data.content,
      privacy: data.privacy || 'private',
      version: 1,
      createdAt: now,
      editedAt: null,
      reactions: {},
    };

    this.db.prepare(`
      INSERT INTO messages (id, wave_id, parent_id, author_id, content, privacy, version, created_at, reactions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')
    `).run(message.id, message.waveId, message.parentId, message.authorId, message.content, message.privacy, message.version, message.createdAt);

    // Author has read their own message
    this.db.prepare('INSERT INTO message_read_by (message_id, user_id, read_at) VALUES (?, ?, ?)').run(message.id, data.authorId, now);

    // Update wave timestamp
    this.updateWaveTimestamp(data.waveId);

    const author = this.findUserById(data.authorId);
    return {
      ...message,
      sender_name: author?.displayName || 'Unknown',
      sender_avatar: author?.avatar || '?',
      sender_avatar_url: author?.avatarUrl || null,
      sender_handle: author?.handle || 'unknown',
      author_id: message.authorId,
      parent_id: message.parentId,
      wave_id: message.waveId,
      created_at: message.createdAt,
      edited_at: message.editedAt,
    };
  }

  updateMessage(messageId, content) {
    const message = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message || message.deleted) return null;

    // Save history
    this.db.prepare(`
      INSERT INTO message_history (id, message_id, content, version, edited_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(`hist-${uuidv4()}`, messageId, message.content, message.version, new Date().toISOString());

    // Update message
    const now = new Date().toISOString();
    this.db.prepare('UPDATE messages SET content = ?, version = ?, edited_at = ? WHERE id = ?').run(content, message.version + 1, now, messageId);

    // Return updated message
    const updated = this.db.prepare(`
      SELECT m.*, u.display_name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url, u.handle as sender_handle
      FROM messages m
      JOIN users u ON m.author_id = u.id
      WHERE m.id = ?
    `).get(messageId);

    return {
      id: updated.id,
      waveId: updated.wave_id,
      parentId: updated.parent_id,
      authorId: updated.author_id,
      content: updated.content,
      privacy: updated.privacy,
      version: updated.version,
      createdAt: updated.created_at,
      editedAt: updated.edited_at,
      sender_name: updated.sender_name,
      sender_avatar: updated.sender_avatar,
      sender_avatar_url: updated.sender_avatar_url,
      sender_handle: updated.sender_handle,
      author_id: updated.author_id,
      parent_id: updated.parent_id,
      wave_id: updated.wave_id,
      created_at: updated.created_at,
      edited_at: updated.edited_at,
    };
  }

  deleteMessage(messageId, userId) {
    const message = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) return { success: false, error: 'Message not found' };
    if (message.deleted) return { success: false, error: 'Message already deleted' };
    if (message.author_id !== userId) return { success: false, error: 'Only message author can delete' };

    const now = new Date().toISOString();

    // Soft delete
    this.db.prepare(`
      UPDATE messages SET content = '[Message deleted]', deleted = 1, deleted_at = ?, reactions = '{}'
      WHERE id = ?
    `).run(now, messageId);

    // Clear read status
    this.db.prepare('DELETE FROM message_read_by WHERE message_id = ?').run(messageId);

    // Clear history
    this.db.prepare('DELETE FROM message_history WHERE message_id = ?').run(messageId);

    return { success: true, messageId, waveId: message.wave_id, deleted: true };
  }

  toggleMessageReaction(messageId, userId, emoji) {
    const message = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) return { success: false, error: 'Message not found' };
    if (message.deleted) return { success: false, error: 'Cannot react to deleted message' };

    let reactions = message.reactions ? JSON.parse(message.reactions) : {};
    if (!reactions[emoji]) reactions[emoji] = [];

    const userIndex = reactions[emoji].indexOf(userId);
    if (userIndex > -1) {
      reactions[emoji].splice(userIndex, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(userId);
    }

    this.db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId);

    return { success: true, messageId, reactions, waveId: message.wave_id };
  }

  markMessageAsRead(messageId, userId) {
    const message = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) return false;
    if (message.deleted) return true;

    try {
      this.db.prepare('INSERT INTO message_read_by (message_id, user_id, read_at) VALUES (?, ?, ?)').run(messageId, userId, new Date().toISOString());
      return true;
    } catch {
      // Already read
      return true;
    }
  }

  searchMessages(query, filters = {}) {
    const { waveId, authorId, fromDate, toDate } = filters;
    const searchTerm = query.trim();
    if (!searchTerm) return [];

    // Escape FTS5 special characters and prepare search terms
    // FTS5 uses AND by default for multiple terms
    const ftsQuery = searchTerm
      .replace(/["\-*()]/g, ' ')  // Remove FTS special chars
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `"${term}"*`)  // Prefix match for each term
      .join(' ');

    if (!ftsQuery) return [];

    // Use FTS5 for full-text search with snippet highlighting
    // snippet() returns text with highlighted matches using <mark> tags
    let sql = `
      SELECT
        m.id,
        m.content,
        snippet(messages_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        m.wave_id,
        m.author_id,
        m.created_at,
        m.parent_id,
        w.title as wave_name,
        u.display_name as author_name,
        u.handle as author_handle,
        bm25(messages_fts) as rank
      FROM messages_fts
      JOIN messages m ON messages_fts.id = m.id
      JOIN waves w ON m.wave_id = w.id
      JOIN users u ON m.author_id = u.id
      WHERE messages_fts MATCH ? AND m.deleted = 0
    `;
    const params = [ftsQuery];

    if (waveId) {
      sql += ' AND m.wave_id = ?';
      params.push(waveId);
    }
    if (authorId) {
      sql += ' AND m.author_id = ?';
      params.push(authorId);
    }
    if (fromDate) {
      sql += ' AND m.created_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND m.created_at <= ?';
      params.push(toDate);
    }

    // Order by relevance (bm25), then by date
    sql += ' ORDER BY rank, m.created_at DESC LIMIT 100';

    try {
      const rows = this.db.prepare(sql).all(...params);

      return rows.map(r => ({
        id: r.id,
        content: r.content,
        snippet: r.snippet,  // Highlighted snippet with <mark> tags
        waveId: r.wave_id,
        waveName: r.wave_name,
        authorId: r.author_id,
        authorName: r.author_name,
        authorHandle: r.author_handle,
        createdAt: r.created_at,
        parentId: r.parent_id,
      }));
    } catch (err) {
      // Fallback to LIKE search if FTS fails (e.g., invalid query)
      console.warn('FTS search failed, falling back to LIKE:', err.message);
      return this.searchMessagesLike(query, filters);
    }
  }

  // Fallback LIKE-based search for when FTS fails
  searchMessagesLike(query, filters = {}) {
    const { waveId, authorId, fromDate, toDate } = filters;
    const searchTerm = query.toLowerCase().trim();
    if (!searchTerm) return [];

    let sql = `
      SELECT m.id, m.content, m.wave_id, m.author_id, m.created_at, m.parent_id,
        w.title as wave_name, u.display_name as author_name, u.handle as author_handle
      FROM messages m
      JOIN waves w ON m.wave_id = w.id
      JOIN users u ON m.author_id = u.id
      WHERE m.content LIKE ? AND m.deleted = 0
    `;
    const params = [`%${searchTerm}%`];

    if (waveId) {
      sql += ' AND m.wave_id = ?';
      params.push(waveId);
    }
    if (authorId) {
      sql += ' AND m.author_id = ?';
      params.push(authorId);
    }
    if (fromDate) {
      sql += ' AND m.created_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND m.created_at <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT 100';

    const rows = this.db.prepare(sql).all(...params);

    return rows.map(r => ({
      id: r.id,
      content: r.content,
      snippet: null,  // No highlighting for LIKE search
      waveId: r.wave_id,
      waveName: r.wave_name,
      authorId: r.author_id,
      authorName: r.author_name,
      authorHandle: r.author_handle,
      createdAt: r.created_at,
      parentId: r.parent_id,
    }));
  }

  // ============ Push Subscription Methods ============

  getPushSubscriptions(userId) {
    const rows = this.db.prepare(`
      SELECT * FROM push_subscriptions WHERE user_id = ?
    `).all(userId);

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      endpoint: r.endpoint,
      keys: JSON.parse(r.keys),
      createdAt: r.created_at
    }));
  }

  addPushSubscription(userId, subscription) {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Use INSERT OR REPLACE to handle duplicate endpoints
    this.db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, keys, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, subscription.endpoint, JSON.stringify(subscription.keys), now);

    return true;
  }

  removePushSubscription(userId, endpoint) {
    const result = this.db.prepare(`
      DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?
    `).run(userId, endpoint);

    return result.changes > 0;
  }

  removeAllPushSubscriptions(userId) {
    const result = this.db.prepare(`
      DELETE FROM push_subscriptions WHERE user_id = ?
    `).run(userId);

    return result.changes > 0;
  }

  removeExpiredPushSubscription(endpoint) {
    // Called when a push notification fails (subscription expired/invalid)
    this.db.prepare(`
      DELETE FROM push_subscriptions WHERE endpoint = ?
    `).run(endpoint);
  }

  // Placeholder for JSON compatibility - not needed with SQLite
  saveUsers() {}
  saveWaves() {}
  saveMessages() {}
  saveGroups() {}
  saveHandleRequests() {}
  saveReports() {}
  saveContactRequests() {}
  saveGroupInvitations() {}
  saveModeration() {}
  savePushSubscriptions() {}
  saveAll() {}

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Export for use in server.js
export default DatabaseSQLite;
