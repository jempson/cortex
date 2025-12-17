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
import sanitizeHtml from 'sanitize-html';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ Security: Input Sanitization ============
const sanitizeMessageOptions = {
  allowedTags: ['img', 'a', 'br', 'p', 'strong', 'em', 'code', 'pre'],
  allowedAttributes: {
    'img': ['src', 'alt', 'width', 'height', 'class', 'style'],
    'a': ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'data'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data']
  },
  transformTags: {
    'a': (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
    }),
    'img': (tagName, attribs) => {
      const src = attribs.src || '';
      const isGif = src.match(/\.gif(\?|$)/i) ||
                    src.match(/(giphy\.com|tenor\.com)/i);
      return {
        tagName: 'img',
        attribs: {
          ...attribs,
          style: attribs.style || 'max-width: 100%; height: auto;',
          loading: isGif ? 'eager' : 'lazy',
          class: 'message-media'
        }
      };
    }
  }
};

function sanitizeMessage(content) {
  if (typeof content !== 'string') return '';
  return sanitizeHtml(content, sanitizeMessageOptions).trim().slice(0, 10000);
}

function detectAndEmbedMedia(content) {
  const urlRegex = /(?<!["'>])(https?:\/\/[^\s<]+)(?![^<]*>|[^<>]*<\/)/gi;
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/i;
  const imageHosts = /(media\.giphy\.com|i\.giphy\.com|media\.tenor\.com|c\.tenor\.com)/i;
  const imgStyle = 'max-width:200px;max-height:150px;border-radius:4px;cursor:pointer;object-fit:cover;display:block;border:1px solid #3a4a3a;';

  content = content.replace(urlRegex, (match) => {
    if (imageExtensions.test(match) || imageHosts.test(match)) {
      return `<img src="${match}" alt="Embedded media" style="${imgStyle}" class="zoomable-image" />`;
    }
    return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });

  const uploadPathRegex = /(?<!["'>])(\/uploads\/(?:messages|avatars)\/[^\s<]+)(?![^<]*>|[^<>]*<\/)/gi;
  content = content.replace(uploadPathRegex, (match) => {
    if (imageExtensions.test(match)) {
      return `<img src="${match}" alt="Uploaded image" style="${imgStyle}" class="zoomable-image" />`;
    }
    return match;
  });

  return content;
}

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

    // Database encryption support (requires SQLCipher build of better-sqlite3)
    // To enable: npm install @journeyapps/sqlcipher (instead of better-sqlite3)
    // Then set DB_ENCRYPTION_KEY environment variable
    const encryptionKey = process.env.DB_ENCRYPTION_KEY;
    if (encryptionKey) {
      try {
        // Apply encryption key - this only works with SQLCipher
        this.db.pragma(`key = '${encryptionKey}'`);
        console.log('🔐 Database encryption enabled');
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          console.error('FATAL: DB_ENCRYPTION_KEY set but encryption failed. Install @journeyapps/sqlcipher for encryption support.');
          process.exit(1);
        } else {
          console.warn('⚠️  DB_ENCRYPTION_KEY set but encryption not available. Install @journeyapps/sqlcipher for encryption.');
        }
      }
    } else if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_DB_ENCRYPTION === 'true') {
      console.error('FATAL: REQUIRE_DB_ENCRYPTION is true but DB_ENCRYPTION_KEY is not set');
      process.exit(1);
    }

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
    // Check if we need to migrate messages to droplets (v1.10.0)
    const messagesExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='messages'
    `).get();
    const dropletsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='droplets'
    `).get();

    if (messagesExists && !dropletsExists) {
      console.log('📝 Migrating messages table to droplets (v1.10.0)...');

      // Rename messages table to droplets
      this.db.exec('ALTER TABLE messages RENAME TO droplets');

      // Rename message_read_by to droplet_read_by
      const readByExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='message_read_by'
      `).get();
      if (readByExists) {
        this.db.exec('ALTER TABLE message_read_by RENAME TO droplet_read_by');
        this.db.exec('ALTER TABLE droplet_read_by RENAME COLUMN message_id TO droplet_id');
      }

      // Rename message_history to droplet_history
      const historyExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='message_history'
      `).get();
      if (historyExists) {
        this.db.exec('ALTER TABLE message_history RENAME TO droplet_history');
        this.db.exec('ALTER TABLE droplet_history RENAME COLUMN message_id TO droplet_id');
      }

      // Drop old FTS table and triggers
      this.db.exec('DROP TRIGGER IF EXISTS messages_fts_insert');
      this.db.exec('DROP TRIGGER IF EXISTS messages_fts_delete');
      this.db.exec('DROP TRIGGER IF EXISTS messages_fts_update');
      this.db.exec('DROP TABLE IF EXISTS messages_fts');

      // Create new droplets_fts table
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS droplets_fts USING fts5(
          id UNINDEXED,
          content,
          content='droplets',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS droplets_fts_insert AFTER INSERT ON droplets BEGIN
          INSERT INTO droplets_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END;

        CREATE TRIGGER IF NOT EXISTS droplets_fts_delete AFTER DELETE ON droplets BEGIN
          INSERT INTO droplets_fts(droplets_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
        END;

        CREATE TRIGGER IF NOT EXISTS droplets_fts_update AFTER UPDATE ON droplets BEGIN
          INSERT INTO droplets_fts(droplets_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
          INSERT INTO droplets_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END;
      `);

      // Populate FTS with existing droplets
      const dropletCount = this.db.prepare('SELECT COUNT(*) as count FROM droplets').get().count;
      if (dropletCount > 0) {
        console.log(`📚 Indexing ${dropletCount} existing droplets...`);
        this.db.exec(`
          INSERT INTO droplets_fts(rowid, id, content)
          SELECT rowid, id, content FROM droplets;
        `);
      }

      console.log('✅ Migration to droplets complete');
    }

    // Check if FTS table exists (for fresh installs or post-migration)
    const ftsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='droplets_fts'
    `).get();

    if (!ftsExists) {
      console.log('📝 Creating FTS5 search index...');

      // Create FTS5 virtual table
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS droplets_fts USING fts5(
          id UNINDEXED,
          content,
          content='droplets',
          content_rowid='rowid'
        );
      `);

      // Create triggers to keep FTS in sync
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS droplets_fts_insert AFTER INSERT ON droplets BEGIN
          INSERT INTO droplets_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END;

        CREATE TRIGGER IF NOT EXISTS droplets_fts_delete AFTER DELETE ON droplets BEGIN
          INSERT INTO droplets_fts(droplets_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
        END;

        CREATE TRIGGER IF NOT EXISTS droplets_fts_update AFTER UPDATE ON droplets BEGIN
          INSERT INTO droplets_fts(droplets_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
          INSERT INTO droplets_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END;
      `);

      // Populate FTS with existing droplets
      const dropletCount = this.db.prepare('SELECT COUNT(*) as count FROM droplets').get().count;
      if (dropletCount > 0) {
        console.log(`📚 Indexing ${dropletCount} existing droplets...`);
        this.db.exec(`
          INSERT INTO droplets_fts(rowid, id, content)
          SELECT rowid, id, content FROM droplets;
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

    // Check if breakout columns exist on droplets table (v1.10.0 Phase 5)
    const dropletColumns = this.db.prepare(`PRAGMA table_info(droplets)`).all();
    const hasBrokenOutTo = dropletColumns.some(c => c.name === 'broken_out_to');

    if (!hasBrokenOutTo) {
      console.log('📝 Adding breakout columns to droplets table (v1.10.0)...');
      this.db.exec(`
        ALTER TABLE droplets ADD COLUMN broken_out_to TEXT REFERENCES waves(id) ON DELETE SET NULL;
        ALTER TABLE droplets ADD COLUMN original_wave_id TEXT REFERENCES waves(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_droplets_broken_out ON droplets(broken_out_to);
        CREATE INDEX IF NOT EXISTS idx_droplets_original_wave ON droplets(original_wave_id);
      `);
      console.log('✅ Breakout columns added to droplets');
    }

    // Check if breakout columns exist on waves table (v1.10.0 Phase 5)
    const waveColumns = this.db.prepare(`PRAGMA table_info(waves)`).all();
    const hasRootDroplet = waveColumns.some(c => c.name === 'root_droplet_id');

    if (!hasRootDroplet) {
      console.log('📝 Adding breakout columns to waves table (v1.10.0)...');
      this.db.exec(`
        ALTER TABLE waves ADD COLUMN root_droplet_id TEXT REFERENCES droplets(id) ON DELETE SET NULL;
        ALTER TABLE waves ADD COLUMN broken_out_from TEXT REFERENCES waves(id) ON DELETE SET NULL;
        ALTER TABLE waves ADD COLUMN breakout_chain TEXT;
        CREATE INDEX IF NOT EXISTS idx_waves_root_droplet ON waves(root_droplet_id);
        CREATE INDEX IF NOT EXISTS idx_waves_broken_out_from ON waves(broken_out_from);
      `);
      console.log('✅ Breakout columns added to waves');
    }

    // Check if notifications table exists (v1.11.0)
    const notificationsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'
    `).get();

    if (!notificationsExists) {
      console.log('📝 Creating notifications tables (v1.11.0)...');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          wave_id TEXT REFERENCES waves(id) ON DELETE SET NULL,
          droplet_id TEXT REFERENCES droplets(id) ON DELETE SET NULL,
          actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          body TEXT,
          preview TEXT,
          read INTEGER DEFAULT 0,
          dismissed INTEGER DEFAULT 0,
          push_sent INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          read_at TEXT,
          group_key TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = 0;
        CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_wave ON notifications(wave_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_droplet ON notifications(droplet_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON notifications(group_key);

        CREATE TABLE IF NOT EXISTS wave_notification_settings (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
          enabled INTEGER DEFAULT 1,
          level TEXT DEFAULT 'all',
          sound INTEGER DEFAULT 1,
          push INTEGER DEFAULT 1,
          PRIMARY KEY (user_id, wave_id)
        );
        CREATE INDEX IF NOT EXISTS idx_wave_notification_settings_user ON wave_notification_settings(user_id);
        CREATE INDEX IF NOT EXISTS idx_wave_notification_settings_wave ON wave_notification_settings(wave_id);
      `);
      console.log('✅ Notifications tables created');
    }

    // Check if push_subscriptions table exists and has correct schema (v1.12.0 fix)
    const pushSubsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='push_subscriptions'
    `).get();

    if (!pushSubsExists) {
      console.log('📝 Creating push_subscriptions table...');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          keys TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (user_id, endpoint)
        );
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
      `);
      console.log('✅ Push subscriptions table created');
    } else {
      // Check if UNIQUE constraint exists - if table was created without it, recreate
      const tableInfo = this.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='push_subscriptions'`).get();
      if (tableInfo && !tableInfo.sql.includes('UNIQUE')) {
        console.log('📝 Recreating push_subscriptions table with UNIQUE constraint (v1.12.0 fix)...');

        // Backup existing data
        const existingData = this.db.prepare('SELECT * FROM push_subscriptions').all();

        // Drop old table and indexes
        this.db.exec('DROP INDEX IF EXISTS idx_push_subscriptions_user');
        this.db.exec('DROP INDEX IF EXISTS idx_push_subscriptions_endpoint');
        this.db.exec('DROP TABLE push_subscriptions');

        // Create new table with constraint
        this.db.exec(`
          CREATE TABLE push_subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint TEXT NOT NULL,
            keys TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (user_id, endpoint)
          );
          CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
          CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
        `);

        // Restore data (skip duplicates)
        if (existingData.length > 0) {
          const seenPairs = new Set();
          const insertStmt = this.db.prepare(`
            INSERT INTO push_subscriptions (id, user_id, endpoint, keys, created_at)
            VALUES (?, ?, ?, ?, ?)
          `);

          for (const row of existingData) {
            const key = `${row.user_id}:${row.endpoint}`;
            if (!seenPairs.has(key)) {
              seenPairs.add(key);
              insertStmt.run(row.id, row.user_id, row.endpoint, row.keys, row.created_at);
            }
          }
          console.log(`✅ Restored ${seenPairs.size} unique push subscriptions`);
        }

        console.log('✅ Push subscriptions table recreated with UNIQUE constraint');
      }
    }

    // Check if federation tables exist (v1.13.0)
    const serverIdentityExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='server_identity'
    `).get();

    if (!serverIdentityExists) {
      console.log('📝 Creating federation tables (v1.13.0)...');
      this.db.exec(`
        -- Server's own identity and keypair (singleton table)
        CREATE TABLE IF NOT EXISTS server_identity (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            node_name TEXT NOT NULL,
            public_key TEXT NOT NULL,
            private_key TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Trusted federation partners (allowlist)
        CREATE TABLE IF NOT EXISTS federation_nodes (
            id TEXT PRIMARY KEY,
            node_name TEXT NOT NULL UNIQUE,
            base_url TEXT NOT NULL,
            public_key TEXT,
            status TEXT DEFAULT 'pending',
            added_by TEXT REFERENCES users(id),
            last_contact_at TEXT,
            failure_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Incoming federation requests from other servers
        CREATE TABLE IF NOT EXISTS federation_requests (
            id TEXT PRIMARY KEY,
            from_node_name TEXT NOT NULL,
            from_base_url TEXT NOT NULL,
            from_public_key TEXT NOT NULL,
            to_node_name TEXT NOT NULL,
            message TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            responded_at TEXT
        );

        -- Cached profiles from federated servers
        CREATE TABLE IF NOT EXISTS remote_users (
            id TEXT PRIMARY KEY,
            node_name TEXT NOT NULL,
            handle TEXT NOT NULL,
            display_name TEXT,
            avatar TEXT,
            avatar_url TEXT,
            bio TEXT,
            cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(node_name, handle)
        );

        -- Track which nodes are participating in our waves
        CREATE TABLE IF NOT EXISTS wave_federation (
            wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
            node_name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (wave_id, node_name)
        );

        -- Cached droplets from federated servers
        CREATE TABLE IF NOT EXISTS remote_droplets (
            id TEXT PRIMARY KEY,
            wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
            origin_wave_id TEXT NOT NULL,
            origin_node TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_node TEXT NOT NULL,
            parent_id TEXT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            edited_at TEXT,
            deleted INTEGER DEFAULT 0,
            reactions TEXT DEFAULT '{}',
            cached_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Outbound federation message queue
        CREATE TABLE IF NOT EXISTS federation_queue (
            id TEXT PRIMARY KEY,
            target_node TEXT NOT NULL,
            message_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 5,
            next_retry_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            delivered_at TEXT,
            last_error TEXT
        );

        -- Inbound message log (for idempotency)
        CREATE TABLE IF NOT EXISTS federation_inbox_log (
            id TEXT PRIMARY KEY,
            source_node TEXT NOT NULL,
            message_type TEXT NOT NULL,
            received_at TEXT DEFAULT CURRENT_TIMESTAMP,
            processed_at TEXT,
            status TEXT DEFAULT 'received'
        );

        -- Federation indexes
        CREATE INDEX IF NOT EXISTS idx_federation_nodes_status ON federation_nodes(status);
        CREATE INDEX IF NOT EXISTS idx_federation_nodes_name ON federation_nodes(node_name);
        CREATE INDEX IF NOT EXISTS idx_federation_requests_status ON federation_requests(status);
        CREATE INDEX IF NOT EXISTS idx_federation_requests_from_node ON federation_requests(from_node_name);
        CREATE INDEX IF NOT EXISTS idx_remote_users_node ON remote_users(node_name);
        CREATE INDEX IF NOT EXISTS idx_remote_users_handle ON remote_users(node_name, handle);
        CREATE INDEX IF NOT EXISTS idx_wave_federation_wave ON wave_federation(wave_id);
        CREATE INDEX IF NOT EXISTS idx_wave_federation_node ON wave_federation(node_name);
        CREATE INDEX IF NOT EXISTS idx_remote_droplets_wave ON remote_droplets(wave_id);
        CREATE INDEX IF NOT EXISTS idx_remote_droplets_origin ON remote_droplets(origin_node, origin_wave_id);
        CREATE INDEX IF NOT EXISTS idx_remote_droplets_author ON remote_droplets(author_node, author_id);
        CREATE INDEX IF NOT EXISTS idx_federation_queue_status ON federation_queue(status, next_retry_at);
        CREATE INDEX IF NOT EXISTS idx_federation_queue_node ON federation_queue(target_node);
        CREATE INDEX IF NOT EXISTS idx_federation_inbox_source ON federation_inbox_log(source_node);
        CREATE INDEX IF NOT EXISTS idx_federation_inbox_status ON federation_inbox_log(status);
      `);
      console.log('✅ Federation tables created');
    }

    // Check if federation_requests table exists (added after initial federation release)
    const fedRequestsExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='federation_requests'
    `).get();

    if (!fedRequestsExists) {
      console.log('📝 Creating federation_requests table...');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS federation_requests (
            id TEXT PRIMARY KEY,
            from_node_name TEXT NOT NULL,
            from_base_url TEXT NOT NULL,
            from_public_key TEXT NOT NULL,
            to_node_name TEXT NOT NULL,
            message TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            responded_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_federation_requests_status ON federation_requests(status);
        CREATE INDEX IF NOT EXISTS idx_federation_requests_from_node ON federation_requests(from_node_name);
      `);
      console.log('✅ Federation requests table created');
    }

    // Check if wave federation columns exist (v1.13.0)
    const waveColumnsForFed = this.db.prepare(`PRAGMA table_info(waves)`).all();
    const hasFederationState = waveColumnsForFed.some(c => c.name === 'federation_state');

    if (!hasFederationState) {
      console.log('📝 Adding federation columns to waves table (v1.13.0)...');
      this.db.exec(`
        ALTER TABLE waves ADD COLUMN federation_state TEXT DEFAULT 'local';
        ALTER TABLE waves ADD COLUMN origin_node TEXT;
        ALTER TABLE waves ADD COLUMN origin_wave_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_waves_federation_state ON waves(federation_state);
        CREATE INDEX IF NOT EXISTS idx_waves_origin_node ON waves(origin_node);
      `);
      console.log('✅ Wave federation columns added');
    }

    // Migrate contacts table to remove FK constraint on contact_id (v1.13.0)
    // This allows storing remote user IDs for federated follows
    const contactsInfo = this.db.prepare(`PRAGMA table_info(contacts)`).all();
    const contactsFKs = this.db.prepare(`PRAGMA foreign_key_list(contacts)`).all();
    const hasContactIdFK = contactsFKs.some(fk => fk.from === 'contact_id' && fk.table === 'users');

    if (hasContactIdFK) {
      console.log('📝 Migrating contacts table to support federated follows (v1.13.0)...');
      this.db.exec(`
        -- Temporarily disable foreign keys for migration
        PRAGMA foreign_keys = OFF;

        -- Create new contacts table without FK on contact_id
        CREATE TABLE contacts_new (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contact_id TEXT NOT NULL,
          added_at TEXT NOT NULL,
          PRIMARY KEY (user_id, contact_id)
        );

        -- Copy existing data
        INSERT INTO contacts_new SELECT * FROM contacts;

        -- Drop old table and rename new one
        DROP TABLE contacts;
        ALTER TABLE contacts_new RENAME TO contacts;

        -- Re-enable foreign keys
        PRAGMA foreign_keys = ON;
      `);
      console.log('✅ Contacts table migrated for federation support');
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

    // Demo droplets
    const droplets = [
      { id: 'droplet-1', waveId: 'wave-1', authorId: 'user-mal', content: 'Welcome to Cortex! This is a public wave visible to everyone.', privacy: 'public' },
      { id: 'droplet-2', waveId: 'wave-2', authorId: 'user-mal', content: 'This is a private wave for testing.', privacy: 'private' },
      { id: 'droplet-3', waveId: 'wave-3', authorId: 'user-mal', content: 'This is a group wave for the crew.', privacy: 'group' },
      { id: 'droplet-4', waveId: 'wave-4', authorId: 'user-zoe', content: "Zoe's private wave.", privacy: 'private' },
      { id: 'droplet-5', waveId: 'wave-5', authorId: 'user-wash', content: "Wash's public wave.", privacy: 'public' },
    ];

    const insertDroplet = this.db.prepare(`
      INSERT INTO droplets (id, wave_id, author_id, content, privacy, version, created_at, reactions)
      VALUES (?, ?, ?, ?, ?, 1, ?, '{}')
    `);
    const insertReadBy = this.db.prepare(`
      INSERT INTO droplet_read_by (droplet_id, user_id, read_at) VALUES (?, ?, ?)
    `);

    for (const d of droplets) {
      insertDroplet.run(d.id, d.waveId, d.authorId, d.content, d.privacy, now);
      insertReadBy.run(d.id, d.authorId, now);
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

  getAllUsers() {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    return rows.map(r => this.rowToUser(r));
  }

  getPublicStats() {
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const waveCount = this.db.prepare('SELECT COUNT(*) as count FROM waves').get().count;
    return { userCount, waveCount };
  }

  getAdminUsers() {
    const rows = this.db.prepare('SELECT * FROM users WHERE is_admin = 1').all();
    return rows.map(r => this.rowToUser(r));
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

  updateUserPreferences(userId, preferences) {
    const user = this.findUserById(userId);
    if (!user) return null;

    const updatedPrefs = { ...user.preferences, ...preferences };
    this.db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(
      JSON.stringify(updatedPrefs),
      userId
    );
    return updatedPrefs;
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

  // ============ Account Lockout Methods ============

  /**
   * Record a failed login attempt for rate limiting
   * @param {string} handle - User handle or email
   * @returns {{locked: boolean, attemptsRemaining: number, lockedUntil?: string}}
   */
  recordFailedLogin(handle) {
    const now = new Date();
    const normalizedHandle = handle.toLowerCase();

    // Get current lockout status
    let lockout = this.db.prepare('SELECT * FROM account_lockouts WHERE handle = ?').get(normalizedHandle);

    // Check if currently locked
    if (lockout?.locked_until && new Date(lockout.locked_until) > now) {
      return {
        locked: true,
        attemptsRemaining: 0,
        lockedUntil: lockout.locked_until
      };
    }

    // If lock expired, reset
    if (lockout?.locked_until && new Date(lockout.locked_until) <= now) {
      this.db.prepare('DELETE FROM account_lockouts WHERE handle = ?').run(normalizedHandle);
      lockout = null;
    }

    const failedAttempts = (lockout?.failed_attempts || 0) + 1;
    const maxAttempts = 5;
    const lockoutMinutes = 15;

    if (failedAttempts >= maxAttempts) {
      // Lock the account
      const lockedUntil = new Date(now.getTime() + lockoutMinutes * 60 * 1000).toISOString();
      this.db.prepare(`
        INSERT OR REPLACE INTO account_lockouts (handle, failed_attempts, locked_until, last_attempt)
        VALUES (?, ?, ?, ?)
      `).run(normalizedHandle, failedAttempts, lockedUntil, now.toISOString());

      return {
        locked: true,
        attemptsRemaining: 0,
        lockedUntil
      };
    }

    // Update failed attempts
    this.db.prepare(`
      INSERT OR REPLACE INTO account_lockouts (handle, failed_attempts, locked_until, last_attempt)
      VALUES (?, ?, NULL, ?)
    `).run(normalizedHandle, failedAttempts, now.toISOString());

    return {
      locked: false,
      attemptsRemaining: maxAttempts - failedAttempts
    };
  }

  /**
   * Clear failed login attempts (on successful login)
   * @param {string} handle - User handle or email
   */
  clearFailedLogins(handle) {
    const normalizedHandle = handle.toLowerCase();
    this.db.prepare('DELETE FROM account_lockouts WHERE handle = ?').run(normalizedHandle);
  }

  /**
   * Check if an account is currently locked
   * @param {string} handle - User handle or email
   * @returns {{locked: boolean, lockedUntil?: string, attemptsRemaining: number}}
   */
  isAccountLocked(handle) {
    const normalizedHandle = handle.toLowerCase();
    const lockout = this.db.prepare('SELECT * FROM account_lockouts WHERE handle = ?').get(normalizedHandle);

    if (!lockout) {
      return { locked: false, attemptsRemaining: 5 };
    }

    const now = new Date();
    if (lockout.locked_until && new Date(lockout.locked_until) > now) {
      return {
        locked: true,
        lockedUntil: lockout.locked_until,
        attemptsRemaining: 0
      };
    }

    // Lock expired
    if (lockout.locked_until && new Date(lockout.locked_until) <= now) {
      this.db.prepare('DELETE FROM account_lockouts WHERE handle = ?').run(normalizedHandle);
      return { locked: false, attemptsRemaining: 5 };
    }

    return {
      locked: false,
      attemptsRemaining: 5 - (lockout.failed_attempts || 0)
    };
  }

  // ============ Password Reset Methods ============

  /**
   * Find user by email address
   * @param {string} email - Email address
   * @returns {Object|null} User object or null
   */
  findUserByEmail(email) {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!row) return null;
    return this.rowToUser(row);
  }

  /**
   * Create a password reset token
   * @param {string} userId - User ID
   * @param {string} tokenHash - Hashed token (store hash, not plaintext)
   * @param {number} expiresInMinutes - Token validity in minutes (default: 60)
   * @returns {{id: string, expiresAt: string}}
   */
  createPasswordResetToken(userId, tokenHash, expiresInMinutes = 60) {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();

    // Invalidate any existing tokens for this user
    this.db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);

    // Create new token
    this.db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, tokenHash, expiresAt, now.toISOString());

    return { id, expiresAt };
  }

  /**
   * Verify a password reset token
   * @param {string} tokenHash - Hashed token to verify
   * @returns {{valid: boolean, userId?: string, error?: string}}
   */
  verifyPasswordResetToken(tokenHash) {
    const token = this.db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL
    `).get(tokenHash);

    if (!token) {
      return { valid: false, error: 'Invalid or expired reset token' };
    }

    if (new Date(token.expires_at) < new Date()) {
      return { valid: false, error: 'Reset token has expired' };
    }

    return { valid: true, userId: token.user_id };
  }

  /**
   * Mark a password reset token as used
   * @param {string} tokenHash - Hashed token
   */
  markPasswordResetTokenUsed(tokenHash) {
    this.db.prepare(`
      UPDATE password_reset_tokens
      SET used_at = ?
      WHERE token_hash = ?
    `).run(new Date().toISOString(), tokenHash);
  }

  /**
   * Set password directly (used for password reset, admin reset)
   * @param {string} userId - User ID
   * @param {string} newPassword - New password (will be hashed)
   * @param {boolean} requireChange - Force password change on next login
   * @returns {{success: boolean, error?: string}}
   */
  async setPassword(userId, newPassword, requireChange = false) {
    const user = this.findUserById(userId);
    if (!user) return { success: false, error: 'User not found' };

    const newHash = await bcrypt.hash(newPassword, 12);
    this.db.prepare(`
      UPDATE users SET password_hash = ?, require_password_change = ?
      WHERE id = ?
    `).run(newHash, requireChange ? 1 : 0, userId);

    // Invalidate all reset tokens for this user
    this.db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);

    return { success: true };
  }

  /**
   * Check if user needs to change password
   * @param {string} userId - User ID
   * @returns {boolean}
   */
  requiresPasswordChange(userId) {
    const row = this.db.prepare('SELECT require_password_change FROM users WHERE id = ?').get(userId);
    return row?.require_password_change === 1;
  }

  /**
   * Clear the password change requirement flag
   * @param {string} userId - User ID
   */
  clearPasswordChangeRequirement(userId) {
    this.db.prepare('UPDATE users SET require_password_change = 0 WHERE id = ?').run(userId);
  }

  /**
   * Clean up expired password reset tokens
   * @returns {number} Number of tokens deleted
   */
  cleanupExpiredResetTokens() {
    const result = this.db.prepare(`
      DELETE FROM password_reset_tokens
      WHERE expires_at < datetime('now')
    `).run();
    return result.changes;
  }

  // ============ Multi-Factor Authentication Methods ============

  /**
   * Get MFA settings for a user
   * @param {string} userId - User ID
   * @returns {Object|null} MFA settings or null
   */
  getMfaSettings(userId) {
    const row = this.db.prepare('SELECT * FROM user_mfa WHERE user_id = ?').get(userId);
    if (!row) return null;
    return {
      userId: row.user_id,
      totpEnabled: row.totp_enabled === 1,
      emailMfaEnabled: row.email_mfa_enabled === 1,
      hasRecoveryCodes: !!row.recovery_codes,
      recoveryCodesGeneratedAt: row.recovery_codes_generated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Check if user has any MFA method enabled
   * @param {string} userId - User ID
   * @returns {boolean}
   */
  hasMfaEnabled(userId) {
    const settings = this.getMfaSettings(userId);
    if (!settings) return false;
    return settings.totpEnabled || settings.emailMfaEnabled;
  }

  /**
   * Get enabled MFA methods for a user
   * @param {string} userId - User ID
   * @returns {string[]} Array of enabled methods
   */
  getEnabledMfaMethods(userId) {
    const settings = this.getMfaSettings(userId);
    if (!settings) return [];
    const methods = [];
    if (settings.totpEnabled) methods.push('totp');
    if (settings.emailMfaEnabled) methods.push('email');
    if (settings.hasRecoveryCodes) methods.push('recovery');
    return methods;
  }

  /**
   * Store pending TOTP secret (before verification)
   * @param {string} userId - User ID
   * @param {string} encryptedSecret - Encrypted TOTP secret
   */
  storePendingTotpSecret(userId, encryptedSecret) {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT user_id FROM user_mfa WHERE user_id = ?').get(userId);

    if (existing) {
      this.db.prepare(`
        UPDATE user_mfa SET totp_secret = ?, updated_at = ?
        WHERE user_id = ?
      `).run(encryptedSecret, now, userId);
    } else {
      this.db.prepare(`
        INSERT INTO user_mfa (user_id, totp_secret, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(userId, encryptedSecret, now, now);
    }
  }

  /**
   * Get stored TOTP secret for verification
   * @param {string} userId - User ID
   * @returns {string|null} Encrypted TOTP secret
   */
  getTotpSecret(userId) {
    const row = this.db.prepare('SELECT totp_secret FROM user_mfa WHERE user_id = ?').get(userId);
    return row?.totp_secret || null;
  }

  /**
   * Enable TOTP after successful verification
   * @param {string} userId - User ID
   */
  enableTotp(userId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE user_mfa SET totp_enabled = 1, updated_at = ?
      WHERE user_id = ?
    `).run(now, userId);
  }

  /**
   * Disable TOTP
   * @param {string} userId - User ID
   */
  disableTotp(userId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE user_mfa SET totp_enabled = 0, totp_secret = NULL, updated_at = ?
      WHERE user_id = ?
    `).run(now, userId);
  }

  /**
   * Enable email MFA
   * @param {string} userId - User ID
   */
  enableEmailMfa(userId) {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT user_id FROM user_mfa WHERE user_id = ?').get(userId);

    if (existing) {
      this.db.prepare(`
        UPDATE user_mfa SET email_mfa_enabled = 1, updated_at = ?
        WHERE user_id = ?
      `).run(now, userId);
    } else {
      this.db.prepare(`
        INSERT INTO user_mfa (user_id, email_mfa_enabled, created_at, updated_at)
        VALUES (?, 1, ?, ?)
      `).run(userId, now, now);
    }
  }

  /**
   * Disable email MFA
   * @param {string} userId - User ID
   */
  disableEmailMfa(userId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE user_mfa SET email_mfa_enabled = 0, updated_at = ?
      WHERE user_id = ?
    `).run(now, userId);
  }

  /**
   * Store recovery codes (hashed)
   * @param {string} userId - User ID
   * @param {string[]} hashedCodes - Array of hashed recovery codes
   */
  storeRecoveryCodes(userId, hashedCodes) {
    const now = new Date().toISOString();
    const codesJson = JSON.stringify(hashedCodes);
    const existing = this.db.prepare('SELECT user_id FROM user_mfa WHERE user_id = ?').get(userId);

    if (existing) {
      this.db.prepare(`
        UPDATE user_mfa SET recovery_codes = ?, recovery_codes_generated_at = ?, updated_at = ?
        WHERE user_id = ?
      `).run(codesJson, now, now, userId);
    } else {
      this.db.prepare(`
        INSERT INTO user_mfa (user_id, recovery_codes, recovery_codes_generated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, codesJson, now, now, now);
    }
  }

  /**
   * Get recovery codes (hashed)
   * @param {string} userId - User ID
   * @returns {string[]} Array of hashed recovery codes
   */
  getRecoveryCodes(userId) {
    const row = this.db.prepare('SELECT recovery_codes FROM user_mfa WHERE user_id = ?').get(userId);
    if (!row?.recovery_codes) return [];
    try {
      return JSON.parse(row.recovery_codes);
    } catch {
      return [];
    }
  }

  /**
   * Remove a used recovery code
   * @param {string} userId - User ID
   * @param {number} codeIndex - Index of the used code
   */
  markRecoveryCodeUsed(userId, codeIndex) {
    const codes = this.getRecoveryCodes(userId);
    if (codeIndex >= 0 && codeIndex < codes.length) {
      codes.splice(codeIndex, 1);
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE user_mfa SET recovery_codes = ?, updated_at = ?
        WHERE user_id = ?
      `).run(JSON.stringify(codes), now, userId);
    }
  }

  /**
   * Create an MFA challenge for login
   * @param {string} userId - User ID
   * @param {string} challengeType - Type of challenge (totp, email, recovery)
   * @param {string} codeHash - Hashed code for email challenges
   * @param {number} expiresInMinutes - Expiry time in minutes
   * @returns {{id: string, expiresAt: string}}
   */
  createMfaChallenge(userId, challengeType, codeHash = null, expiresInMinutes = 10) {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();

    // Clean up any existing challenges for this user
    this.db.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').run(userId);

    this.db.prepare(`
      INSERT INTO mfa_challenges (id, user_id, challenge_type, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, challengeType, codeHash, expiresAt, now.toISOString());

    return { id, expiresAt };
  }

  /**
   * Get MFA challenge by ID
   * @param {string} challengeId - Challenge ID
   * @returns {Object|null} Challenge details or null
   */
  getMfaChallenge(challengeId) {
    const row = this.db.prepare(`
      SELECT * FROM mfa_challenges
      WHERE id = ? AND verified_at IS NULL
    `).get(challengeId);

    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
      // Expired, clean up
      this.db.prepare('DELETE FROM mfa_challenges WHERE id = ?').run(challengeId);
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      challengeType: row.challenge_type,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  /**
   * Mark MFA challenge as verified
   * @param {string} challengeId - Challenge ID
   */
  markMfaChallengeVerified(challengeId) {
    this.db.prepare(`
      UPDATE mfa_challenges SET verified_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), challengeId);
  }

  /**
   * Delete MFA challenge
   * @param {string} challengeId - Challenge ID
   */
  deleteMfaChallenge(challengeId) {
    this.db.prepare('DELETE FROM mfa_challenges WHERE id = ?').run(challengeId);
  }

  /**
   * Clean up expired MFA challenges
   * @returns {number} Number of challenges deleted
   */
  cleanupExpiredMfaChallenges() {
    const result = this.db.prepare(`
      DELETE FROM mfa_challenges
      WHERE expires_at < datetime('now')
    `).run();
    return result.changes;
  }

  // ============ Activity Log Methods ============

  /**
   * Log an activity event
   * @param {string|null} userId - User ID (null for anonymous actions)
   * @param {string} actionType - Type of action (login, logout, password_change, etc.)
   * @param {string|null} resourceType - Type of resource (user, wave, droplet, etc.)
   * @param {string|null} resourceId - ID of the affected resource
   * @param {Object} metadata - Additional context (ip, userAgent, etc.)
   * @returns {string} Activity log entry ID
   */
  logActivity(userId, actionType, resourceType = null, resourceId = null, metadata = {}) {
    const id = `act-${uuidv4()}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO activity_log (id, user_id, action_type, resource_type, resource_id, ip_address, user_agent, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      actionType,
      resourceType,
      resourceId,
      metadata.ip || null,
      metadata.userAgent || null,
      JSON.stringify(metadata),
      now
    );

    return id;
  }

  /**
   * Get activity log entries with filters
   * @param {Object} filters - Filter options
   * @param {string} filters.userId - Filter by user ID
   * @param {string} filters.actionType - Filter by action type
   * @param {string} filters.resourceType - Filter by resource type
   * @param {string} filters.resourceId - Filter by resource ID
   * @param {string} filters.startDate - Filter by start date (ISO string)
   * @param {string} filters.endDate - Filter by end date (ISO string)
   * @param {number} filters.limit - Max entries to return (default 100)
   * @param {number} filters.offset - Offset for pagination (default 0)
   * @returns {Object} { entries, total }
   */
  getActivityLog(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.userId) {
      conditions.push('user_id = ?');
      params.push(filters.userId);
    }
    if (filters.actionType) {
      conditions.push('action_type = ?');
      params.push(filters.actionType);
    }
    if (filters.resourceType) {
      conditions.push('resource_type = ?');
      params.push(filters.resourceType);
    }
    if (filters.resourceId) {
      conditions.push('resource_id = ?');
      params.push(filters.resourceId);
    }
    if (filters.startDate) {
      conditions.push('created_at >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('created_at <= ?');
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    // Get total count
    const countRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_log ${whereClause}
    `).get(...params);

    // Get entries with user info
    const entries = this.db.prepare(`
      SELECT
        a.*,
        u.handle as user_handle,
        u.displayName as user_display_name
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Parse metadata JSON
    return {
      entries: entries.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : {}
      })),
      total: countRow.count
    };
  }

  /**
   * Get activity log for a specific user
   * @param {string} userId - User ID
   * @param {number} limit - Max entries (default 50)
   * @returns {Array} Activity entries
   */
  getUserActivityLog(userId, limit = 50) {
    const entries = this.db.prepare(`
      SELECT * FROM activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);

    return entries.map(e => ({
      ...e,
      metadata: e.metadata ? JSON.parse(e.metadata) : {}
    }));
  }

  /**
   * Clean up old activity log entries
   * @param {number} daysOld - Delete entries older than this many days (default 90)
   * @returns {number} Number of entries deleted
   */
  cleanupOldActivityLogs(daysOld = 90) {
    const result = this.db.prepare(`
      DELETE FROM activity_log
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `).run(daysOld);
    return result.changes;
  }

  /**
   * Get activity summary/statistics
   * @param {number} days - Number of days to summarize (default 7)
   * @returns {Object} Activity statistics
   */
  getActivityStats(days = 7) {
    const stats = this.db.prepare(`
      SELECT
        action_type,
        COUNT(*) as count
      FROM activity_log
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY action_type
      ORDER BY count DESC
    `).all(days);

    const totalLogins = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_log
      WHERE action_type = 'login' AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(days);

    const failedLogins = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_log
      WHERE action_type = 'login_failed' AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(days);

    const uniqueUsers = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM activity_log
      WHERE user_id IS NOT NULL AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(days);

    return {
      byActionType: stats,
      totalLogins: totalLogins.count,
      failedLogins: failedLogins.count,
      uniqueActiveUsers: uniqueUsers.count,
      periodDays: days
    };
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
    // Get local user contacts
    const localRows = this.db.prepare(`
      SELECT u.id, u.handle, u.display_name, u.avatar, u.avatar_url, u.status, NULL as node_name
      FROM contacts c
      JOIN users u ON c.contact_id = u.id
      WHERE c.user_id = ?
    `).all(userId);

    // Get remote user contacts (federated follows)
    const remoteRows = this.db.prepare(`
      SELECT ru.id, ru.handle, ru.display_name, ru.avatar, ru.avatar_url, 'online' as status, ru.node_name
      FROM contacts c
      JOIN remote_users ru ON c.contact_id = ru.id
      WHERE c.user_id = ?
    `).all(userId);

    const allRows = [...localRows, ...remoteRows];

    return allRows.map(r => ({
      id: r.id,
      handle: r.handle,
      name: r.display_name,
      avatar: r.avatar,
      avatarUrl: r.avatar_url,
      status: r.status,
      nodeName: r.node_name || null,
      isRemote: !!r.node_name,
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
    if (!user) return false;

    // Check if target is local user or remote user
    const blockedUser = this.findUserById(blockedUserId) || this.getRemoteUser(blockedUserId);
    if (!blockedUser) return false;

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
    // Get locally blocked users
    const localRows = this.db.prepare(`
      SELECT b.*, u.handle, u.display_name, NULL as node_name FROM blocks b
      JOIN users u ON b.blocked_user_id = u.id
      WHERE b.user_id = ?
    `).all(userId);

    // Get blocked remote users
    const remoteRows = this.db.prepare(`
      SELECT b.*, ru.handle, ru.display_name, ru.node_name FROM blocks b
      JOIN remote_users ru ON b.blocked_user_id = ru.id
      WHERE b.user_id = ?
    `).all(userId);

    const allRows = [...localRows, ...remoteRows];

    return allRows.map(r => ({
      id: r.id,
      userId: r.user_id,
      blockedUserId: r.blocked_user_id,
      blockedAt: r.blocked_at,
      handle: r.handle,
      displayName: r.display_name,
      nodeName: r.node_name || null,
      isRemote: !!r.node_name,
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
    if (!user) return false;

    // Check if target is local user or remote user
    const mutedUser = this.findUserById(mutedUserId) || this.getRemoteUser(mutedUserId);
    if (!mutedUser) return false;

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
    // Get locally muted users
    const localRows = this.db.prepare(`
      SELECT m.*, u.handle, u.display_name, NULL as node_name FROM mutes m
      JOIN users u ON m.muted_user_id = u.id
      WHERE m.user_id = ?
    `).all(userId);

    // Get muted remote users
    const remoteRows = this.db.prepare(`
      SELECT m.*, ru.handle, ru.display_name, ru.node_name FROM mutes m
      JOIN remote_users ru ON m.muted_user_id = ru.id
      WHERE m.user_id = ?
    `).all(userId);

    const allRows = [...localRows, ...remoteRows];

    return allRows.map(r => ({
      id: r.id,
      userId: r.user_id,
      mutedUserId: r.muted_user_id,
      mutedAt: r.muted_at,
      handle: r.handle,
      displayName: r.display_name,
      nodeName: r.node_name || null,
      isRemote: !!r.node_name,
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

    if (r.type === 'droplet' || r.type === 'message') {
      // Support both 'droplet' (new) and 'message' (legacy) report types
      const droplet = this.db.prepare('SELECT * FROM droplets WHERE id = ?').get(r.target_id);
      if (droplet) {
        const author = this.findUserById(droplet.author_id);
        const wave = this.getWave(droplet.wave_id);
        context = {
          content: droplet.content,
          authorHandle: author?.handle,
          authorName: author?.displayName,
          createdAt: droplet.created_at,
          waveId: droplet.wave_id,
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
    // Note: federated participant waves (crossServer with federation_state='participant') are shown to all local users
    let sql = `
      SELECT w.*, wp.archived, wp.last_read,
        u.display_name as creator_name, u.avatar as creator_avatar, u.handle as creator_handle,
        g.name as group_name,
        (SELECT COUNT(*) FROM droplets WHERE wave_id = w.id) as droplet_count
      FROM waves w
      LEFT JOIN wave_participants wp ON w.id = wp.wave_id AND wp.user_id = ?
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN groups g ON w.group_id = g.id
      WHERE (
        w.privacy = 'public'
        OR (w.privacy = 'private' AND wp.user_id IS NOT NULL)
        OR (w.privacy = 'crossServer' AND wp.user_id IS NOT NULL)
        OR (w.privacy = 'cross-server' AND wp.user_id IS NOT NULL)
        OR (w.privacy = 'crossServer' AND w.federation_state = 'participant')
        OR (w.privacy = 'cross-server' AND w.federation_state = 'participant')
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
        SELECT COUNT(*) as count FROM droplets d
        WHERE d.wave_id = ?
          AND d.deleted = 0
          AND d.author_id != ?
          AND d.author_id NOT IN (${blockedIds.map(() => '?').join(',') || 'NULL'})
          AND d.author_id NOT IN (${mutedIds.map(() => '?').join(',') || 'NULL'})
          AND NOT EXISTS (SELECT 1 FROM droplet_read_by drb WHERE drb.droplet_id = d.id AND drb.user_id = ?)
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
        droplet_count: r.droplet_count,
        unread_count: unreadCount,
        is_participant: r.archived !== null,
        is_archived: r.archived === 1,
        group_name: r.group_name,
        federationState: r.federation_state || 'local',
        originNode: r.origin_node || null,
        originWaveId: r.origin_wave_id || null,
      };
    });
  }

  // Helper to convert wave row to object
  rowToWave(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      privacy: row.privacy,
      groupId: row.group_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Breakout fields
      rootDropletId: row.root_droplet_id,
      brokenOutFrom: row.broken_out_from,
      breakoutChain: row.breakout_chain ? JSON.parse(row.breakout_chain) : null,
      // Federation fields
      federationState: row.federation_state || 'local',
      originNode: row.origin_node || null,
      originWaveId: row.origin_wave_id || null,
    };
  }

  getWave(waveId) {
    const row = this.db.prepare('SELECT * FROM waves WHERE id = ?').get(waveId);
    return this.rowToWave(row);
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

  isWaveParticipant(waveId, userId) {
    const row = this.db.prepare(`
      SELECT 1 FROM wave_participants WHERE wave_id = ? AND user_id = ?
    `).get(waveId, userId);
    return !!row;
  }

  canAccessWave(waveId, userId) {
    const wave = this.getWave(waveId);
    if (!wave) return false;

    if (wave.privacy === 'public') return true;

    // Federated participant waves are accessible to all local users
    if ((wave.privacy === 'crossServer' || wave.privacy === 'cross-server') && wave.federationState === 'participant') {
      return true;
    }

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

  // Break out a droplet and its replies into a new wave
  breakoutDroplet(dropletId, newWaveTitle, participants, userId) {
    const now = new Date().toISOString();

    // Get the original droplet
    const droplet = this.db.prepare(`
      SELECT d.*, w.title as wave_title, w.id as wave_id
      FROM droplets d
      JOIN waves w ON d.wave_id = w.id
      WHERE d.id = ?
    `).get(dropletId);

    if (!droplet) {
      return { success: false, error: 'Droplet not found' };
    }

    // Check if already broken out
    if (droplet.broken_out_to) {
      return { success: false, error: 'Droplet already broken out' };
    }

    const originalWaveId = droplet.wave_id;
    const originalWave = this.getWave(originalWaveId);

    // Get all child droplets recursively
    const getAllChildren = (parentId) => {
      const children = this.db.prepare('SELECT id FROM droplets WHERE parent_id = ?').all(parentId);
      let allIds = children.map(c => c.id);
      for (const child of children) {
        allIds = allIds.concat(getAllChildren(child.id));
      }
      return allIds;
    };

    const childIds = getAllChildren(dropletId);
    const allDropletIds = [dropletId, ...childIds];

    // Build breakout chain - append to existing chain if this wave was itself broken out
    let breakoutChain = [];
    if (originalWave.breakout_chain) {
      try {
        breakoutChain = JSON.parse(originalWave.breakout_chain);
      } catch (e) {
        breakoutChain = [];
      }
    }
    // Add the current wave to the chain
    breakoutChain.push({
      wave_id: originalWaveId,
      droplet_id: dropletId,
      title: originalWave.title
    });

    // Create the new wave with breakout metadata
    const newWaveId = `wave-${uuidv4()}`;

    this.db.prepare(`
      INSERT INTO waves (id, title, privacy, group_id, created_by, created_at, updated_at, root_droplet_id, broken_out_from, breakout_chain)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newWaveId,
      newWaveTitle.slice(0, 200),
      originalWave.privacy || 'private',
      originalWave.groupId || null,
      userId,
      now,
      now,
      dropletId,
      originalWaveId,
      JSON.stringify(breakoutChain)
    );

    // Add participants to new wave
    const participantSet = new Set(participants);
    participantSet.add(userId); // Ensure creator is included
    for (const participantId of participantSet) {
      this.db.prepare('INSERT OR IGNORE INTO wave_participants (wave_id, user_id, joined_at, archived) VALUES (?, ?, ?, 0)').run(newWaveId, participantId, now);
    }

    // Move all droplets to the new wave (update wave_id, set original_wave_id)
    // The root droplet becomes the root of the new wave (parent_id stays null or its existing value)
    for (const id of allDropletIds) {
      this.db.prepare(`
        UPDATE droplets SET wave_id = ?, original_wave_id = ? WHERE id = ?
      `).run(newWaveId, originalWaveId, id);
    }

    // Mark the original droplet as broken out in the original wave
    // We need to create a "link card" - this is done by setting broken_out_to
    // But since the droplet has moved, we need to create a placeholder
    // Actually, per the design doc, the root droplet itself gets broken_out_to set
    // Let me re-read... the design says the original droplet displays as link card
    // So we should NOT move the root droplet, just mark it and move only children
    // Wait, re-reading design: "droplets move, not copy" and "Original droplet gets broken_out_to field set on its record in the original wave"

    // Let me reconsider: The root droplet stays in original wave as a link card
    // Only the REPLIES move to the new wave
    // The new wave's root_droplet_id points to the droplet in original wave
    // Actually no - looking at the diagram, Droplet B moves to new wave AND shows as link card

    // I think the correct approach:
    // 1. Root droplet stays in original wave with broken_out_to set (becomes link card)
    // 2. Root droplet is ALSO the root of new wave (referenced, not copied)
    // 3. Child droplets move to new wave

    // But that's complex with SQLite constraints. Simpler approach per design:
    // - The droplet ID stays the same
    // - broken_out_to points to the new wave
    // - When rendering original wave, droplets with broken_out_to show as link cards
    // - The new wave loads the same droplet by ID

    // Let's undo the move and do it correctly:
    // Restore original wave_id for all droplets
    for (const id of allDropletIds) {
      this.db.prepare('UPDATE droplets SET wave_id = ?, original_wave_id = NULL WHERE id = ?').run(originalWaveId, id);
    }

    // Set broken_out_to on the root droplet only
    this.db.prepare('UPDATE droplets SET broken_out_to = ? WHERE id = ?').run(newWaveId, dropletId);

    // The new wave references the droplet via root_droplet_id
    // When fetching droplets for the new wave, we'll check if it's a breakout wave
    // and include the root droplet + children

    const newWave = this.getWave(newWaveId);

    return {
      success: true,
      newWave,
      originalWaveId,
      dropletId,
      childCount: childIds.length
    };
  }

  // Alias for rippleDroplet (new terminology)
  rippleDroplet(dropletId, newWaveTitle, participants, userId) {
    return this.breakoutDroplet(dropletId, newWaveTitle, participants, userId);
  }

  // Get droplets for a rippled wave (includes root droplet from original wave)
  getDropletsForBreakoutWave(waveId, userId = null) {
    const wave = this.getWave(waveId);
    if (!wave || !wave.rootDropletId) {
      return this.getDropletsForWave(waveId, userId);
    }

    // Get blocked/muted users
    let blockedIds = [];
    let mutedIds = [];
    if (userId) {
      blockedIds = this.db.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').all(userId).map(r => r.blocked_user_id);
      mutedIds = this.db.prepare('SELECT muted_user_id FROM mutes WHERE user_id = ?').all(userId).map(r => r.muted_user_id);
    }

    // Get root droplet and all its descendants
    const getAllDescendants = (parentId, results = []) => {
      const droplet = this.db.prepare(`
        SELECT d.*, u.display_name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url, u.handle as sender_handle,
               bow.title as broken_out_to_title
        FROM droplets d
        JOIN users u ON d.author_id = u.id
        LEFT JOIN waves bow ON d.broken_out_to = bow.id
        WHERE d.id = ?
      `).get(parentId);

      if (!droplet) return results;

      // Skip blocked/muted users
      if (blockedIds.includes(droplet.author_id) || mutedIds.includes(droplet.author_id)) {
        return results;
      }

      results.push(droplet);

      // Get children
      const children = this.db.prepare('SELECT id FROM droplets WHERE parent_id = ?').all(parentId);
      for (const child of children) {
        getAllDescendants(child.id, results);
      }

      return results;
    };

    const rows = getAllDescendants(wave.rootDropletId);

    return rows.map(d => {
      const hasRead = userId ? !!this.db.prepare('SELECT 1 FROM droplet_read_by WHERE droplet_id = ? AND user_id = ?').get(d.id, userId) : false;
      const isUnread = d.deleted ? false : (userId ? !hasRead && d.author_id !== userId : false);
      const readBy = this.db.prepare('SELECT user_id FROM droplet_read_by WHERE droplet_id = ?').all(d.id).map(r => r.user_id);

      return {
        id: d.id,
        waveId: waveId, // Report as belonging to this wave for UI purposes
        parentId: d.parent_id,
        authorId: d.author_id,
        content: d.content,
        privacy: d.privacy,
        version: d.version,
        createdAt: d.created_at,
        editedAt: d.edited_at,
        deleted: d.deleted === 1,
        deletedAt: d.deleted_at,
        reactions: d.reactions ? JSON.parse(d.reactions) : {},
        readBy,
        sender_name: d.sender_name,
        sender_avatar: d.sender_avatar,
        sender_avatar_url: d.sender_avatar_url,
        sender_handle: d.sender_handle,
        author_id: d.author_id,
        parent_id: d.parent_id,
        wave_id: waveId,
        created_at: d.created_at,
        edited_at: d.edited_at,
        deleted_at: d.deleted_at,
        is_unread: isUnread,
        brokenOutTo: d.broken_out_to,
        brokenOutToTitle: d.broken_out_to_title,
      };
    });
  }

  // === Droplet Methods (formerly Message Methods) ===
  getDropletsForWave(waveId, userId = null) {
    // Get blocked/muted users
    let blockedIds = [];
    let mutedIds = [];
    if (userId) {
      blockedIds = this.db.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').all(userId).map(r => r.blocked_user_id);
      mutedIds = this.db.prepare('SELECT muted_user_id FROM mutes WHERE user_id = ?').all(userId).map(r => r.muted_user_id);
    }

    let sql = `
      SELECT d.*, u.display_name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url, u.handle as sender_handle,
             bow.title as broken_out_to_title
      FROM droplets d
      JOIN users u ON d.author_id = u.id
      LEFT JOIN waves bow ON d.broken_out_to = bow.id
      WHERE d.wave_id = ?
    `;
    const params = [waveId];

    if (blockedIds.length > 0) {
      sql += ` AND d.author_id NOT IN (${blockedIds.map(() => '?').join(',')})`;
      params.push(...blockedIds);
    }
    if (mutedIds.length > 0) {
      sql += ` AND d.author_id NOT IN (${mutedIds.map(() => '?').join(',')})`;
      params.push(...mutedIds);
    }

    sql += ' ORDER BY d.created_at ASC';

    const rows = this.db.prepare(sql).all(...params);

    const localDroplets = rows.map(d => {
      // Check if user has read this droplet
      const hasRead = userId ? !!this.db.prepare('SELECT 1 FROM droplet_read_by WHERE droplet_id = ? AND user_id = ?').get(d.id, userId) : false;
      const isUnread = d.deleted ? false : (userId ? !hasRead && d.author_id !== userId : false);

      // Get read by users
      const readBy = this.db.prepare('SELECT user_id FROM droplet_read_by WHERE droplet_id = ?').all(d.id).map(r => r.user_id);

      return {
        id: d.id,
        waveId: d.wave_id,
        parentId: d.parent_id,
        authorId: d.author_id,
        content: d.content,
        privacy: d.privacy,
        version: d.version,
        createdAt: d.created_at,
        editedAt: d.edited_at,
        deleted: d.deleted === 1,
        deletedAt: d.deleted_at,
        reactions: d.reactions ? JSON.parse(d.reactions) : {},
        readBy,
        sender_name: d.sender_name,
        sender_avatar: d.sender_avatar,
        sender_avatar_url: d.sender_avatar_url,
        sender_handle: d.sender_handle,
        author_id: d.author_id,
        parent_id: d.parent_id,
        wave_id: d.wave_id,
        created_at: d.created_at,
        edited_at: d.edited_at,
        deleted_at: d.deleted_at,
        is_unread: isUnread,
        brokenOutTo: d.broken_out_to,
        brokenOutToTitle: d.broken_out_to_title,
        isRemote: false,
      };
    });

    // Also get remote droplets for federated waves
    const remoteDroplets = this.getRemoteDropletsForWave(waveId).map(rd => ({
      id: rd.id,
      waveId: rd.waveId,
      parentId: rd.parentId,
      authorId: rd.authorId,
      content: rd.content,
      privacy: null,
      version: 1,
      createdAt: rd.createdAt,
      editedAt: rd.editedAt,
      deleted: rd.deleted,
      deletedAt: null,
      reactions: rd.reactions || {},
      readBy: [],
      sender_name: rd.authorDisplayName || 'Unknown',
      sender_avatar: rd.authorAvatar || '?',
      sender_avatar_url: rd.authorAvatarUrl,
      sender_handle: `${rd.authorId}@${rd.authorNode}`,
      author_id: rd.authorId,
      parent_id: rd.parentId,
      wave_id: rd.waveId,
      created_at: rd.createdAt,
      edited_at: rd.editedAt,
      deleted_at: null,
      is_unread: false, // Remote droplets don't track read status locally
      brokenOutTo: null,
      brokenOutToTitle: null,
      isRemote: true,
      originNode: rd.originNode,
      authorNode: rd.authorNode,
    }));

    // Merge and deduplicate by ID (prefer local over remote)
    const seenIds = new Set(localDroplets.map(d => d.id));
    const uniqueRemoteDroplets = remoteDroplets.filter(rd => !seenIds.has(rd.id));

    const allDroplets = [...localDroplets, ...uniqueRemoteDroplets];
    allDroplets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return allDroplets;
  }

  // Backward compatibility alias
  getMessagesForWave(waveId, userId = null) {
    return this.getDropletsForWave(waveId, userId);
  }

  createDroplet(data) {
    const now = new Date().toISOString();

    // Sanitize and auto-embed media URLs
    let content = sanitizeMessage(data.content);
    content = detectAndEmbedMedia(content);

    const droplet = {
      id: `droplet-${uuidv4()}`,
      waveId: data.waveId,
      parentId: data.parentId || null,
      authorId: data.authorId,
      content: content,
      privacy: data.privacy || 'private',
      version: 1,
      createdAt: now,
      editedAt: null,
      reactions: {},
    };

    this.db.prepare(`
      INSERT INTO droplets (id, wave_id, parent_id, author_id, content, privacy, version, created_at, reactions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')
    `).run(droplet.id, droplet.waveId, droplet.parentId, droplet.authorId, droplet.content, droplet.privacy, droplet.version, droplet.createdAt);

    // Author has read their own droplet
    this.db.prepare('INSERT INTO droplet_read_by (droplet_id, user_id, read_at) VALUES (?, ?, ?)').run(droplet.id, data.authorId, now);

    // Update wave timestamp
    this.updateWaveTimestamp(data.waveId);

    const author = this.findUserById(data.authorId);
    return {
      ...droplet,
      sender_name: author?.displayName || 'Unknown',
      sender_avatar: author?.avatar || '?',
      sender_avatar_url: author?.avatarUrl || null,
      sender_handle: author?.handle || 'unknown',
      author_id: droplet.authorId,
      parent_id: droplet.parentId,
      wave_id: droplet.waveId,
      created_at: droplet.createdAt,
      edited_at: droplet.editedAt,
    };
  }

  // Backward compatibility alias
  createMessage(data) {
    return this.createDroplet(data);
  }

  getDroplet(dropletId) {
    const d = this.db.prepare(`
      SELECT d.*, u.display_name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url, u.handle as sender_handle
      FROM droplets d
      JOIN users u ON d.author_id = u.id
      WHERE d.id = ?
    `).get(dropletId);

    if (!d) return null;

    return {
      id: d.id,
      waveId: d.wave_id,
      parentId: d.parent_id,
      authorId: d.author_id,
      content: d.content,
      privacy: d.privacy,
      version: d.version,
      createdAt: d.created_at,
      editedAt: d.edited_at,
      deleted: d.deleted === 1,
      deletedAt: d.deleted_at,
      reactions: d.reactions ? JSON.parse(d.reactions) : {},
      sender_name: d.sender_name,
      sender_avatar: d.sender_avatar,
      sender_avatar_url: d.sender_avatar_url,
      sender_handle: d.sender_handle,
      author_id: d.author_id,
      parent_id: d.parent_id,
      wave_id: d.wave_id,
      created_at: d.created_at,
      edited_at: d.edited_at,
      deleted_at: d.deleted_at,
      brokenOutTo: d.broken_out_to,
    };
  }

  // Backward compatibility alias
  getMessage(dropletId) {
    return this.getDroplet(dropletId);
  }

  updateDroplet(dropletId, content) {
    const droplet = this.db.prepare('SELECT * FROM droplets WHERE id = ?').get(dropletId);
    if (!droplet || droplet.deleted) return null;

    // Save history
    this.db.prepare(`
      INSERT INTO droplet_history (id, droplet_id, content, version, edited_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(`hist-${uuidv4()}`, dropletId, droplet.content, droplet.version, new Date().toISOString());

    // Sanitize and auto-embed media URLs (same as createDroplet)
    let processedContent = sanitizeMessage(content);
    processedContent = detectAndEmbedMedia(processedContent);

    // Update droplet
    const now = new Date().toISOString();
    this.db.prepare('UPDATE droplets SET content = ?, version = ?, edited_at = ? WHERE id = ?').run(processedContent, droplet.version + 1, now, dropletId);

    // Return updated droplet
    const updated = this.db.prepare(`
      SELECT d.*, u.display_name as sender_name, u.avatar as sender_avatar, u.avatar_url as sender_avatar_url, u.handle as sender_handle
      FROM droplets d
      JOIN users u ON d.author_id = u.id
      WHERE d.id = ?
    `).get(dropletId);

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

  // Backward compatibility alias
  updateMessage(dropletId, content) {
    return this.updateDroplet(dropletId, content);
  }

  deleteDroplet(dropletId, userId) {
    const droplet = this.db.prepare('SELECT * FROM droplets WHERE id = ?').get(dropletId);
    if (!droplet) return { success: false, error: 'Droplet not found' };
    if (droplet.deleted) return { success: false, error: 'Droplet already deleted' };
    if (droplet.author_id !== userId) return { success: false, error: 'Only droplet author can delete' };

    const now = new Date().toISOString();

    // Soft delete
    this.db.prepare(`
      UPDATE droplets SET content = '[Droplet deleted]', deleted = 1, deleted_at = ?, reactions = '{}'
      WHERE id = ?
    `).run(now, dropletId);

    // Clear read status
    this.db.prepare('DELETE FROM droplet_read_by WHERE droplet_id = ?').run(dropletId);

    // Clear history
    this.db.prepare('DELETE FROM droplet_history WHERE droplet_id = ?').run(dropletId);

    return { success: true, dropletId, waveId: droplet.wave_id, deleted: true };
  }

  // Backward compatibility alias
  deleteMessage(dropletId, userId) {
    return this.deleteDroplet(dropletId, userId);
  }

  toggleDropletReaction(dropletId, userId, emoji) {
    const droplet = this.db.prepare('SELECT * FROM droplets WHERE id = ?').get(dropletId);
    if (!droplet) return { success: false, error: 'Droplet not found' };
    if (droplet.deleted) return { success: false, error: 'Cannot react to deleted droplet' };

    let reactions = droplet.reactions ? JSON.parse(droplet.reactions) : {};
    if (!reactions[emoji]) reactions[emoji] = [];

    const userIndex = reactions[emoji].indexOf(userId);
    if (userIndex > -1) {
      reactions[emoji].splice(userIndex, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(userId);
    }

    this.db.prepare('UPDATE droplets SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), dropletId);

    return { success: true, dropletId, reactions, waveId: droplet.wave_id };
  }

  // Backward compatibility alias
  toggleMessageReaction(dropletId, userId, emoji) {
    return this.toggleDropletReaction(dropletId, userId, emoji);
  }

  markDropletAsRead(dropletId, userId) {
    const droplet = this.db.prepare('SELECT * FROM droplets WHERE id = ?').get(dropletId);
    if (!droplet) return false;
    if (droplet.deleted) return true;

    try {
      this.db.prepare('INSERT INTO droplet_read_by (droplet_id, user_id, read_at) VALUES (?, ?, ?)').run(dropletId, userId, new Date().toISOString());
      return true;
    } catch {
      // Already read
      return true;
    }
  }

  // Backward compatibility alias
  markMessageAsRead(dropletId, userId) {
    return this.markDropletAsRead(dropletId, userId);
  }

  searchDroplets(query, filters = {}) {
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
        d.id,
        d.content,
        snippet(droplets_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
        d.wave_id,
        d.author_id,
        d.created_at,
        d.parent_id,
        w.title as wave_name,
        u.display_name as author_name,
        u.handle as author_handle,
        bm25(droplets_fts) as rank
      FROM droplets_fts
      JOIN droplets d ON droplets_fts.id = d.id
      JOIN waves w ON d.wave_id = w.id
      JOIN users u ON d.author_id = u.id
      WHERE droplets_fts MATCH ? AND d.deleted = 0
    `;
    const params = [ftsQuery];

    if (waveId) {
      sql += ' AND d.wave_id = ?';
      params.push(waveId);
    }
    if (authorId) {
      sql += ' AND d.author_id = ?';
      params.push(authorId);
    }
    if (fromDate) {
      sql += ' AND d.created_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND d.created_at <= ?';
      params.push(toDate);
    }

    // Order by relevance (bm25), then by date
    sql += ' ORDER BY rank, d.created_at DESC LIMIT 100';

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
      return this.searchDropletsLike(query, filters);
    }
  }

  // Backward compatibility alias
  searchMessages(query, filters = {}) {
    return this.searchDroplets(query, filters);
  }

  // Fallback LIKE-based search for when FTS fails
  searchDropletsLike(query, filters = {}) {
    const { waveId, authorId, fromDate, toDate } = filters;
    const searchTerm = query.toLowerCase().trim();
    if (!searchTerm) return [];

    let sql = `
      SELECT d.id, d.content, d.wave_id, d.author_id, d.created_at, d.parent_id,
        w.title as wave_name, u.display_name as author_name, u.handle as author_handle
      FROM droplets d
      JOIN waves w ON d.wave_id = w.id
      JOIN users u ON d.author_id = u.id
      WHERE d.content LIKE ? AND d.deleted = 0
    `;
    const params = [`%${searchTerm}%`];

    if (waveId) {
      sql += ' AND d.wave_id = ?';
      params.push(waveId);
    }
    if (authorId) {
      sql += ' AND d.author_id = ?';
      params.push(authorId);
    }
    if (fromDate) {
      sql += ' AND d.created_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND d.created_at <= ?';
      params.push(toDate);
    }

    sql += ' ORDER BY d.created_at DESC LIMIT 100';

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

  // Backward compatibility alias
  searchMessagesLike(query, filters = {}) {
    return this.searchDropletsLike(query, filters);
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

    // Use ON CONFLICT to properly handle duplicate user_id + endpoint combinations
    this.db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, keys, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, endpoint) DO UPDATE SET
        keys = excluded.keys,
        created_at = excluded.created_at
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

  // ============ Notification Methods ============

  createNotification({ userId, type, waveId, dropletId, actorId, title, body, preview, groupKey }) {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, wave_id, droplet_id, actor_id, title, body, preview, read, dismissed, push_sent, created_at, group_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(id, userId, type, waveId || null, dropletId || null, actorId || null, title, body || null, preview || null, now, groupKey || null);

    return {
      id,
      userId,
      type,
      waveId,
      dropletId,
      actorId,
      title,
      body,
      preview,
      read: false,
      dismissed: false,
      pushSent: false,
      createdAt: now,
      groupKey
    };
  }

  getNotifications(userId, { unread = false, type = null, limit = 50, offset = 0 } = {}) {
    let query = `
      SELECT n.*,
             u.handle as actor_handle,
             u.display_name as actor_display_name,
             u.avatar as actor_avatar,
             u.avatar_url as actor_avatar_url,
             w.title as wave_title
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      LEFT JOIN waves w ON n.wave_id = w.id
      WHERE n.user_id = ? AND n.dismissed = 0
    `;
    const params = [userId];

    if (unread) {
      query += ' AND n.read = 0';
    }
    if (type) {
      query += ' AND n.type = ?';
      params.push(type);
    }

    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params);

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      waveId: r.wave_id,
      dropletId: r.droplet_id,
      actorId: r.actor_id,
      title: r.title,
      body: r.body,
      preview: r.preview,
      read: !!r.read,
      dismissed: !!r.dismissed,
      pushSent: !!r.push_sent,
      createdAt: r.created_at,
      readAt: r.read_at,
      groupKey: r.group_key,
      // Actor info
      actorHandle: r.actor_handle,
      actorDisplayName: r.actor_display_name,
      actorAvatar: r.actor_avatar,
      actorAvatarUrl: r.actor_avatar_url,
      waveTitle: r.wave_title
    }));
  }

  getNotificationCounts(userId) {
    const rows = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM notifications
      WHERE user_id = ? AND read = 0 AND dismissed = 0
      GROUP BY type
    `).all(userId);

    const byType = {};
    let total = 0;
    for (const r of rows) {
      byType[r.type] = r.count;
      total += r.count;
    }

    return { total, byType };
  }

  // Get unread notification counts grouped by wave with priority types
  getUnreadCountsByWave(userId) {
    const rows = this.db.prepare(`
      SELECT wave_id, type, COUNT(*) as count
      FROM notifications
      WHERE user_id = ? AND read = 0 AND dismissed = 0 AND wave_id IS NOT NULL
      GROUP BY wave_id, type
    `).all(userId);

    const byWave = {};
    // Priority: direct_mention > reply > ripple > wave_activity
    const typePriority = { direct_mention: 4, reply: 3, ripple: 2, wave_activity: 1 };

    for (const r of rows) {
      if (!byWave[r.wave_id]) {
        byWave[r.wave_id] = { count: 0, highestType: null, highestPriority: 0 };
      }
      byWave[r.wave_id].count += r.count;
      const priority = typePriority[r.type] || 0;
      if (priority > byWave[r.wave_id].highestPriority) {
        byWave[r.wave_id].highestPriority = priority;
        byWave[r.wave_id].highestType = r.type;
      }
    }

    return byWave;
  }

  markNotificationRead(notificationId) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE notifications SET read = 1, read_at = ? WHERE id = ?
    `).run(now, notificationId);
    return result.changes > 0;
  }

  // Mark all notifications for a specific droplet as read for a user
  markNotificationsReadByDroplet(dropletId, userId) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE notifications SET read = 1, read_at = ?
      WHERE droplet_id = ? AND user_id = ? AND read = 0
    `).run(now, dropletId, userId);
    return result.changes;
  }

  markAllNotificationsRead(userId) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE notifications SET read = 1, read_at = ? WHERE user_id = ? AND read = 0
    `).run(now, userId);
    return result.changes;
  }

  dismissNotification(notificationId) {
    const result = this.db.prepare(`
      UPDATE notifications SET dismissed = 1 WHERE id = ?
    `).run(notificationId);
    return result.changes > 0;
  }

  markNotificationPushSent(notificationId) {
    this.db.prepare(`
      UPDATE notifications SET push_sent = 1 WHERE id = ?
    `).run(notificationId);
  }

  deleteOldNotifications(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const cutoffStr = cutoff.toISOString();

    const result = this.db.prepare(`
      DELETE FROM notifications WHERE created_at < ? AND (read = 1 OR dismissed = 1)
    `).run(cutoffStr);
    return result.changes;
  }

  // Wave notification settings
  getWaveNotificationSettings(userId, waveId) {
    const row = this.db.prepare(`
      SELECT * FROM wave_notification_settings WHERE user_id = ? AND wave_id = ?
    `).get(userId, waveId);

    if (!row) {
      return { enabled: true, level: 'all', sound: true, push: true };
    }

    return {
      enabled: !!row.enabled,
      level: row.level,
      sound: !!row.sound,
      push: !!row.push
    };
  }

  setWaveNotificationSettings(userId, waveId, settings) {
    this.db.prepare(`
      INSERT OR REPLACE INTO wave_notification_settings (user_id, wave_id, enabled, level, sound, push)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      waveId,
      settings.enabled !== false ? 1 : 0,
      settings.level || 'all',
      settings.sound !== false ? 1 : 0,
      settings.push !== false ? 1 : 0
    );
  }

  // Check if user should receive notification for a wave
  shouldNotifyForWave(userId, waveId, notificationType) {
    const settings = this.getWaveNotificationSettings(userId, waveId);

    if (!settings.enabled) return false;

    switch (settings.level) {
      case 'none':
        return false;
      case 'mentions':
        return notificationType === 'direct_mention';
      case 'all':
      default:
        return true;
    }
  }

  // ============ Federation - Server Identity Methods ============

  getServerIdentity() {
    const row = this.db.prepare('SELECT * FROM server_identity WHERE id = 1').get();
    if (!row) return null;
    return {
      nodeName: row.node_name,
      publicKey: row.public_key,
      privateKey: row.private_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  setServerIdentity({ nodeName, publicKey, privateKey }) {
    const now = new Date().toISOString();
    const existing = this.getServerIdentity();

    if (existing) {
      this.db.prepare(`
        UPDATE server_identity
        SET node_name = ?, public_key = ?, private_key = ?, updated_at = ?
        WHERE id = 1
      `).run(nodeName, publicKey, privateKey, now);
    } else {
      this.db.prepare(`
        INSERT INTO server_identity (id, node_name, public_key, private_key, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
      `).run(nodeName, publicKey, privateKey, now, now);
    }

    return this.getServerIdentity();
  }

  hasServerIdentity() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM server_identity').get();
    return row.count > 0;
  }

  // ============ Federation - Trusted Nodes Methods ============

  getFederationNodes({ status = null } = {}) {
    let query = 'SELECT * FROM federation_nodes';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all(...params);
    return rows.map(r => ({
      id: r.id,
      nodeName: r.node_name,
      baseUrl: r.base_url,
      publicKey: r.public_key,
      status: r.status,
      addedBy: r.added_by,
      lastContactAt: r.last_contact_at,
      failureCount: r.failure_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getFederationNode(nodeId) {
    const row = this.db.prepare('SELECT * FROM federation_nodes WHERE id = ?').get(nodeId);
    if (!row) return null;
    return {
      id: row.id,
      nodeName: row.node_name,
      baseUrl: row.base_url,
      publicKey: row.public_key,
      status: row.status,
      addedBy: row.added_by,
      lastContactAt: row.last_contact_at,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  getFederationNodeByName(nodeName) {
    const row = this.db.prepare('SELECT * FROM federation_nodes WHERE node_name = ?').get(nodeName);
    if (!row) return null;
    return {
      id: row.id,
      nodeName: row.node_name,
      baseUrl: row.base_url,
      publicKey: row.public_key,
      status: row.status,
      addedBy: row.added_by,
      lastContactAt: row.last_contact_at,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  addFederationNode({ nodeName, baseUrl, publicKey = null, status = 'pending', addedBy }) {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO federation_nodes (id, node_name, base_url, public_key, status, added_by, failure_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, nodeName, baseUrl, publicKey, status, addedBy, now, now);

    return this.getFederationNode(id);
  }

  updateFederationNode(nodeId, updates) {
    const now = new Date().toISOString();
    const node = this.getFederationNode(nodeId);
    if (!node) return null;

    const allowedFields = ['nodeName', 'baseUrl', 'publicKey', 'status', 'lastContactAt', 'failureCount'];
    const dbFields = {
      nodeName: 'node_name',
      baseUrl: 'base_url',
      publicKey: 'public_key',
      status: 'status',
      lastContactAt: 'last_contact_at',
      failureCount: 'failure_count'
    };

    const setClauses = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && dbFields[key]) {
        setClauses.push(`${dbFields[key]} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) return node;

    setClauses.push('updated_at = ?');
    params.push(now);
    params.push(nodeId);

    this.db.prepare(`
      UPDATE federation_nodes SET ${setClauses.join(', ')} WHERE id = ?
    `).run(...params);

    return this.getFederationNode(nodeId);
  }

  deleteFederationNode(nodeId) {
    const result = this.db.prepare('DELETE FROM federation_nodes WHERE id = ?').run(nodeId);
    return result.changes > 0;
  }

  recordFederationContact(nodeId, success = true) {
    const now = new Date().toISOString();

    if (success) {
      this.db.prepare(`
        UPDATE federation_nodes
        SET last_contact_at = ?, failure_count = 0, updated_at = ?
        WHERE id = ?
      `).run(now, now, nodeId);
    } else {
      this.db.prepare(`
        UPDATE federation_nodes
        SET failure_count = failure_count + 1, updated_at = ?
        WHERE id = ?
      `).run(now, nodeId);
    }
  }

  // ============ Federation - Request Methods ============

  createFederationRequest(fromNodeName, fromBaseUrl, fromPublicKey, toNodeName, message = null) {
    const id = `fedreq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO federation_requests (id, from_node_name, from_base_url, from_public_key, to_node_name, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, fromNodeName, fromBaseUrl, fromPublicKey, toNodeName, message, now);

    return this.getFederationRequest(id);
  }

  getFederationRequest(requestId) {
    const row = this.db.prepare('SELECT * FROM federation_requests WHERE id = ?').get(requestId);
    if (!row) return null;
    return {
      id: row.id,
      fromNodeName: row.from_node_name,
      fromBaseUrl: row.from_base_url,
      fromPublicKey: row.from_public_key,
      toNodeName: row.to_node_name,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      respondedAt: row.responded_at
    };
  }

  getPendingFederationRequests() {
    const rows = this.db.prepare(`
      SELECT * FROM federation_requests WHERE status = 'pending' ORDER BY created_at DESC
    `).all();

    return rows.map(row => ({
      id: row.id,
      fromNodeName: row.from_node_name,
      fromBaseUrl: row.from_base_url,
      fromPublicKey: row.from_public_key,
      toNodeName: row.to_node_name,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      respondedAt: row.responded_at
    }));
  }

  getPendingRequestFromNode(fromNodeName) {
    const row = this.db.prepare(`
      SELECT * FROM federation_requests WHERE from_node_name = ? AND status = 'pending'
    `).get(fromNodeName);
    if (!row) return null;
    return {
      id: row.id,
      fromNodeName: row.from_node_name,
      fromBaseUrl: row.from_base_url,
      fromPublicKey: row.from_public_key,
      toNodeName: row.to_node_name,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      respondedAt: row.responded_at
    };
  }

  acceptFederationRequest(requestId) {
    const request = this.getFederationRequest(requestId);
    if (!request) return null;
    if (request.status !== 'pending') return null;

    const now = new Date().toISOString();

    // Update request status
    this.db.prepare(`
      UPDATE federation_requests SET status = 'accepted', responded_at = ? WHERE id = ?
    `).run(now, requestId);

    // Create federation node entry (or update if exists)
    const existingNode = this.getFederationNodeByName(request.fromNodeName);
    if (existingNode) {
      this.updateFederationNode(existingNode.id, {
        publicKey: request.fromPublicKey,
        status: 'active',
        baseUrl: request.fromBaseUrl
      });
    } else {
      const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.db.prepare(`
        INSERT INTO federation_nodes (id, node_name, base_url, public_key, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?)
      `).run(nodeId, request.fromNodeName, request.fromBaseUrl, request.fromPublicKey, now, now);
    }

    return this.getFederationRequest(requestId);
  }

  declineFederationRequest(requestId) {
    const request = this.getFederationRequest(requestId);
    if (!request) return null;
    if (request.status !== 'pending') return null;

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE federation_requests SET status = 'declined', responded_at = ? WHERE id = ?
    `).run(now, requestId);

    return this.getFederationRequest(requestId);
  }

  // ============ Federation - Remote Users Methods ============

  getRemoteUser(id) {
    const row = this.db.prepare('SELECT * FROM remote_users WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      nodeName: row.node_name,
      handle: row.handle,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      cachedAt: row.cached_at,
      updatedAt: row.updated_at,
      isRemote: true
    };
  }

  getRemoteUserByHandle(nodeName, handle) {
    const row = this.db.prepare('SELECT * FROM remote_users WHERE node_name = ? AND handle = ?').get(nodeName, handle);
    if (!row) return null;
    return {
      id: row.id,
      nodeName: row.node_name,
      handle: row.handle,
      displayName: row.display_name,
      avatar: row.avatar,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      cachedAt: row.cached_at,
      updatedAt: row.updated_at,
      isRemote: true
    };
  }

  cacheRemoteUser({ id, nodeName, handle, displayName, avatar, avatarUrl, bio }) {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO remote_users (id, node_name, handle, display_name, avatar, avatar_url, bio, cached_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (node_name, handle) DO UPDATE SET
        id = excluded.id,
        display_name = excluded.display_name,
        avatar = excluded.avatar,
        avatar_url = excluded.avatar_url,
        bio = excluded.bio,
        updated_at = excluded.updated_at
    `).run(id, nodeName, handle, displayName || null, avatar || null, avatarUrl || null, bio || null, now, now);

    return this.getRemoteUser(id);
  }

  // ============ Federation - Wave Federation Methods ============

  getWaveFederationNodes(waveId) {
    const rows = this.db.prepare(`
      SELECT wf.*, fn.base_url, fn.public_key, fn.status as node_status
      FROM wave_federation wf
      JOIN federation_nodes fn ON wf.node_name = fn.node_name
      WHERE wf.wave_id = ?
    `).all(waveId);

    return rows.map(r => ({
      waveId: r.wave_id,
      nodeName: r.node_name,
      status: r.status,
      addedAt: r.added_at,
      baseUrl: r.base_url,
      publicKey: r.public_key,
      nodeStatus: r.node_status
    }));
  }

  addWaveFederationNode(waveId, nodeName) {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR IGNORE INTO wave_federation (wave_id, node_name, status, added_at)
      VALUES (?, ?, 'active', ?)
    `).run(waveId, nodeName, now);

    return true;
  }

  removeWaveFederationNode(waveId, nodeName) {
    const result = this.db.prepare(`
      DELETE FROM wave_federation WHERE wave_id = ? AND node_name = ?
    `).run(waveId, nodeName);
    return result.changes > 0;
  }

  // Update wave to be a federated origin wave
  setWaveAsOrigin(waveId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE waves SET federation_state = 'origin', updated_at = ? WHERE id = ?
    `).run(now, waveId);
    return this.getWave(waveId);
  }

  // Create a participant wave (copy of origin wave from another server)
  createParticipantWave({ id, title, privacy, createdBy, originNode, originWaveId }) {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO waves (id, title, privacy, created_by, created_at, updated_at, federation_state, origin_node, origin_wave_id)
      VALUES (?, ?, ?, ?, ?, ?, 'participant', ?, ?)
    `).run(id, title, privacy, createdBy, now, now, originNode, originWaveId);

    return this.getWave(id);
  }

  // Get federated waves where this server is origin
  getOriginWaves() {
    const rows = this.db.prepare(`
      SELECT * FROM waves WHERE federation_state = 'origin'
      ORDER BY updated_at DESC
    `).all();

    return rows.map(r => this.rowToWave(r));
  }

  // Get federated waves where this server is participant
  getParticipantWaves() {
    const rows = this.db.prepare(`
      SELECT * FROM waves WHERE federation_state = 'participant'
      ORDER BY updated_at DESC
    `).all();

    return rows.map(r => this.rowToWave(r));
  }

  // Get wave by origin identifiers (for incoming federated messages)
  getWaveByOrigin(originNode, originWaveId) {
    const row = this.db.prepare(`
      SELECT * FROM waves WHERE origin_node = ? AND origin_wave_id = ?
    `).get(originNode, originWaveId);

    return row ? this.rowToWave(row) : null;
  }

  // ============ Federation - Remote Droplets Methods ============

  getRemoteDroplet(id) {
    const row = this.db.prepare('SELECT * FROM remote_droplets WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      waveId: row.wave_id,
      originWaveId: row.origin_wave_id,
      originNode: row.origin_node,
      authorId: row.author_id,
      authorNode: row.author_node,
      parentId: row.parent_id,
      content: row.content,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deleted: !!row.deleted,
      reactions: JSON.parse(row.reactions || '{}'),
      cachedAt: row.cached_at,
      updatedAt: row.updated_at,
      isRemote: true
    };
  }

  getRemoteDropletsForWave(waveId) {
    const rows = this.db.prepare(`
      SELECT rd.*, ru.display_name as author_display_name, ru.avatar as author_avatar, ru.avatar_url as author_avatar_url
      FROM remote_droplets rd
      LEFT JOIN remote_users ru ON rd.author_id = ru.id
      WHERE rd.wave_id = ? AND rd.deleted = 0
      ORDER BY rd.created_at ASC
    `).all(waveId);

    return rows.map(r => ({
      id: r.id,
      waveId: r.wave_id,
      originWaveId: r.origin_wave_id,
      originNode: r.origin_node,
      authorId: r.author_id,
      authorNode: r.author_node,
      authorDisplayName: r.author_display_name,
      authorAvatar: r.author_avatar,
      authorAvatarUrl: r.author_avatar_url,
      parentId: r.parent_id,
      content: r.content,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deleted: !!r.deleted,
      reactions: JSON.parse(r.reactions || '{}'),
      cachedAt: r.cached_at,
      updatedAt: r.updated_at,
      isRemote: true
    }));
  }

  cacheRemoteDroplet({ id, waveId, originWaveId, originNode, authorId, authorNode, parentId, content, createdAt, editedAt, reactions }) {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO remote_droplets (id, wave_id, origin_wave_id, origin_node, author_id, author_node, parent_id, content, created_at, edited_at, reactions, cached_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        content = excluded.content,
        edited_at = excluded.edited_at,
        reactions = excluded.reactions,
        updated_at = excluded.updated_at
    `).run(id, waveId, originWaveId, originNode, authorId, authorNode, parentId || null, content, createdAt, editedAt || null, JSON.stringify(reactions || {}), now, now);

    return this.getRemoteDroplet(id);
  }

  markRemoteDropletDeleted(id) {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE remote_droplets SET deleted = 1, updated_at = ? WHERE id = ?
    `).run(now, id);
    return result.changes > 0;
  }

  // ============ Federation - Message Queue Methods ============

  queueFederationMessage({ targetNode, messageType, payload }) {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO federation_queue (id, target_node, message_type, payload, status, attempts, created_at, next_retry_at)
      VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
    `).run(id, targetNode, messageType, JSON.stringify(payload), now, now);

    return id;
  }

  getPendingFederationMessages(limit = 10) {
    const now = new Date().toISOString();

    const rows = this.db.prepare(`
      SELECT * FROM federation_queue
      WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `).all(now, limit);

    return rows.map(r => ({
      id: r.id,
      targetNode: r.target_node,
      messageType: r.message_type,
      payload: JSON.parse(r.payload),
      status: r.status,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      nextRetryAt: r.next_retry_at,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      lastError: r.last_error
    }));
  }

  markFederationMessageDelivered(messageId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE federation_queue SET status = 'delivered', delivered_at = ? WHERE id = ?
    `).run(now, messageId);
  }

  markFederationMessageFailed(messageId, error) {
    const now = new Date().toISOString();

    // Get current attempt count
    const msg = this.db.prepare('SELECT attempts, max_attempts FROM federation_queue WHERE id = ?').get(messageId);
    if (!msg) return;

    const newAttempts = msg.attempts + 1;

    if (newAttempts >= msg.max_attempts) {
      // Max retries exceeded, mark as permanently failed
      this.db.prepare(`
        UPDATE federation_queue SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?
      `).run(newAttempts, error, messageId);
    } else {
      // Calculate exponential backoff: 1min, 5min, 25min, 2hr, 10hr
      const backoffMinutes = Math.pow(5, newAttempts);
      const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

      this.db.prepare(`
        UPDATE federation_queue SET attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?
      `).run(newAttempts, nextRetry, error, messageId);
    }
  }

  cleanupOldFederationMessages(daysOld = 7) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const result = this.db.prepare(`
      DELETE FROM federation_queue WHERE (status = 'delivered' OR status = 'failed') AND created_at < ?
    `).run(cutoff);

    return result.changes;
  }

  // ============ Federation - Inbox Log Methods (for idempotency) ============

  hasReceivedFederationMessage(messageId) {
    const row = this.db.prepare('SELECT id FROM federation_inbox_log WHERE id = ?').get(messageId);
    return !!row;
  }

  logFederationInbox({ id, sourceNode, messageType }) {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR IGNORE INTO federation_inbox_log (id, source_node, message_type, received_at, status)
      VALUES (?, ?, ?, ?, 'received')
    `).run(id, sourceNode, messageType, now);
  }

  markFederationInboxProcessed(messageId) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE federation_inbox_log SET processed_at = ?, status = 'processed' WHERE id = ?
    `).run(now, messageId);
  }

  cleanupOldInboxLog(daysOld = 30) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const result = this.db.prepare(`
      DELETE FROM federation_inbox_log WHERE received_at < ?
    `).run(cutoff);

    return result.changes;
  }

  // Placeholder for JSON compatibility - not needed with SQLite
  saveUsers() {}
  saveWaves() {}
  saveDroplets() {}
  saveMessages() {} // Backward compatibility alias
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
