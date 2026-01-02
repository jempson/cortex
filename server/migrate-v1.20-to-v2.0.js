#!/usr/bin/env node
/**
 * Farhold v2.0.0 Migration Script
 *
 * Migrates Cortex database from v1.20.x to v2.0.0 (Farhold)
 *
 * Table renames:
 * - droplets → pings
 * - droplet_read_by → ping_read_by
 * - droplets_fts → pings_fts
 * - groups → crews
 * - group_members → crew_members
 * - group_invitations → crew_invitations
 *
 * Usage:
 *   node migrate-v1.20-to-v2.0.js [--dry-run] [--force]
 *
 * Options:
 *   --dry-run   Preview changes without modifying database
 *   --force     Skip confirmation prompt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SOURCE_DB_PATH = path.join(DATA_DIR, 'cortex.db');
const TARGET_DB_PATH = path.join(DATA_DIR, 'farhold.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backup-v2.0');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSection(title) {
  console.log();
  log(`═══ ${title} ═══`, 'cyan');
}

// Prompt for confirmation
async function confirm(message) {
  if (FORCE) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${message} (y/N): ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Table rename mappings
const TABLE_RENAMES = [
  { from: 'droplets', to: 'pings' },
  { from: 'droplet_read_by', to: 'ping_read_by' },
  { from: 'droplet_history', to: 'ping_history' },
  { from: 'groups', to: 'crews' },
  { from: 'group_members', to: 'crew_members' },
  { from: 'group_invitations', to: 'crew_invitations' }
];

// Index renames (these need to be dropped and recreated)
const INDEX_RENAMES = [
  // Droplet → Ping indexes
  { old: 'idx_droplets_wave', new: 'idx_pings_wave', table: 'pings', columns: 'wave_id' },
  { old: 'idx_droplets_author', new: 'idx_pings_author', table: 'pings', columns: 'author_id' },
  { old: 'idx_droplets_parent', new: 'idx_pings_parent', table: 'pings', columns: 'parent_id' },
  { old: 'idx_droplets_created', new: 'idx_pings_created', table: 'pings', columns: 'wave_id, created_at' },
  { old: 'idx_droplets_deleted', new: 'idx_pings_deleted', table: 'pings', columns: 'deleted' },
  { old: 'idx_droplets_broken_out', new: 'idx_pings_broken_out', table: 'pings', columns: 'broken_out_to' },
  { old: 'idx_droplets_original_wave', new: 'idx_pings_original_wave', table: 'pings', columns: 'original_wave_id' },
  { old: 'idx_droplet_read_user', new: 'idx_ping_read_user', table: 'ping_read_by', columns: 'user_id' },
  { old: 'idx_droplet_read_droplet', new: 'idx_ping_read_ping', table: 'ping_read_by', columns: 'ping_id' },
  { old: 'idx_droplet_history_droplet', new: 'idx_ping_history_ping', table: 'ping_history', columns: 'ping_id' },

  // Group → Crew indexes
  { old: 'idx_groups_created_by', new: 'idx_crews_created_by', table: 'crews', columns: 'created_by' },
  { old: 'idx_group_members_user', new: 'idx_crew_members_user', table: 'crew_members', columns: 'user_id' },
  { old: 'idx_group_members_group', new: 'idx_crew_members_crew', table: 'crew_members', columns: 'crew_id' },
  { old: 'idx_group_invitations_group', new: 'idx_crew_invitations_crew', table: 'crew_invitations', columns: 'crew_id' },
  { old: 'idx_group_invitations_inviter', new: 'idx_crew_invitations_inviter', table: 'crew_invitations', columns: 'invited_by' },
  { old: 'idx_group_invitations_invitee', new: 'idx_crew_invitations_invitee', table: 'crew_invitations', columns: 'invited_user_id' },
  { old: 'idx_group_invitations_status', new: 'idx_crew_invitations_status', table: 'crew_invitations', columns: 'status' }
];

// Column renames within tables
const COLUMN_RENAMES = [
  // droplet_read_by → ping_read_by: droplet_id → ping_id
  { table: 'ping_read_by', from: 'droplet_id', to: 'ping_id' },
  // droplet_history → ping_history: droplet_id → ping_id
  { table: 'ping_history', from: 'droplet_id', to: 'ping_id' },
  // group_members → crew_members: group_id → crew_id
  { table: 'crew_members', from: 'group_id', to: 'crew_id' },
  // group_invitations → crew_invitations: group_id → crew_id
  { table: 'crew_invitations', from: 'group_id', to: 'crew_id' },
  // waves: group_id → crew_id (stays as waves table)
  { table: 'waves', from: 'group_id', to: 'crew_id' },
  // waves: root_droplet_id → root_ping_id
  { table: 'waves', from: 'root_droplet_id', to: 'root_ping_id' },
  // pings: parent_id stays as parent_id (it's a ping parent)
  // notifications: droplet_id → ping_id
  { table: 'notifications', from: 'droplet_id', to: 'ping_id' },
  // remote_droplets → remote_pings (table rename)
];

// Additional table renames for federation
const ADDITIONAL_TABLE_RENAMES = [
  { from: 'remote_droplets', to: 'remote_pings' }
];

async function main() {
  logSection('Farhold v2.0.0 Migration');

  if (DRY_RUN) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  // Check if farhold.db already exists and is migrated
  if (fs.existsSync(TARGET_DB_PATH)) {
    const existingDb = new Database(TARGET_DB_PATH);
    const tables = existingDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    existingDb.close();

    if (tables.includes('pings') && !tables.includes('droplets')) {
      log('Database already migrated to Farhold v2.0.0!', 'green');
      process.exit(0);
    }

    if (tables.includes('droplets')) {
      log(`Found existing ${TARGET_DB_PATH} with old schema - will migrate in place`, 'yellow');
    } else if (tables.length === 0 || !tables.includes('users')) {
      log(`Found empty or invalid ${TARGET_DB_PATH} - removing and copying from source`, 'yellow');
      if (!DRY_RUN) {
        fs.unlinkSync(TARGET_DB_PATH);
        // Also remove WAL and SHM files if they exist
        if (fs.existsSync(TARGET_DB_PATH + '-wal')) fs.unlinkSync(TARGET_DB_PATH + '-wal');
        if (fs.existsSync(TARGET_DB_PATH + '-shm')) fs.unlinkSync(TARGET_DB_PATH + '-shm');
      }
    }
  }

  // Check if source database exists
  if (!fs.existsSync(TARGET_DB_PATH)) {
    if (!fs.existsSync(SOURCE_DB_PATH)) {
      log(`Source database not found at ${SOURCE_DB_PATH}`, 'red');
      log('Nothing to migrate.', 'yellow');
      process.exit(1);
    }

    // Copy source to target
    log(`Copying ${SOURCE_DB_PATH} to ${TARGET_DB_PATH}...`, 'blue');
    if (!DRY_RUN) {
      fs.copyFileSync(SOURCE_DB_PATH, TARGET_DB_PATH);
      // Also copy WAL and SHM files if they exist (for complete state)
      if (fs.existsSync(SOURCE_DB_PATH + '-wal')) {
        fs.copyFileSync(SOURCE_DB_PATH + '-wal', TARGET_DB_PATH + '-wal');
      }
      if (fs.existsSync(SOURCE_DB_PATH + '-shm')) {
        fs.copyFileSync(SOURCE_DB_PATH + '-shm', TARGET_DB_PATH + '-shm');
      }
    }
    log('Database copied successfully', 'green');
  }

  // Open the target database for migration
  const db = new Database(TARGET_DB_PATH);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);

  if (tables.includes('pings') && !tables.includes('droplets')) {
    log('Database already migrated to Farhold v2.0.0!', 'green');
    db.close();
    process.exit(0);
  }

  if (!tables.includes('droplets')) {
    log('No droplets table found - database may be in unexpected state', 'red');
    db.close();
    process.exit(1);
  }

  // Show current state
  logSection('Current Database State');
  const dropletCount = db.prepare('SELECT COUNT(*) as count FROM droplets').get().count;
  const groupCount = db.prepare('SELECT COUNT(*) as count FROM groups').get().count;
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const waveCount = db.prepare('SELECT COUNT(*) as count FROM waves').get().count;

  log(`Users: ${userCount}`, 'blue');
  log(`Waves: ${waveCount}`, 'blue');
  log(`Droplets (→ Pings): ${dropletCount}`, 'blue');
  log(`Groups (→ Crews): ${groupCount}`, 'blue');

  // Confirm migration
  if (!DRY_RUN) {
    console.log();
    const proceed = await confirm('Proceed with migration?');
    if (!proceed) {
      log('Migration cancelled.', 'yellow');
      db.close();
      process.exit(0);
    }
  }

  // Create backup
  logSection('Creating Backup');
  if (!DRY_RUN) {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const backupPath = path.join(BACKUP_DIR, `cortex-v1.20-${Date.now()}.db`);
    fs.copyFileSync(TARGET_DB_PATH, backupPath);
    log(`Backup created: ${backupPath}`, 'green');
  } else {
    log('Would create backup at: ' + path.join(BACKUP_DIR, 'cortex-v1.20-*.db'), 'yellow');
  }

  // Start migration
  logSection('Migrating Tables');

  if (!DRY_RUN) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN TRANSACTION');
  }

  try {
    // 1. Drop FTS table and triggers (must be done before renaming)
    log('Dropping FTS table and triggers...', 'blue');
    if (!DRY_RUN) {
      db.exec('DROP TRIGGER IF EXISTS droplets_fts_insert');
      db.exec('DROP TRIGGER IF EXISTS droplets_fts_delete');
      db.exec('DROP TRIGGER IF EXISTS droplets_fts_update');
      db.exec('DROP TABLE IF EXISTS droplets_fts');
    }

    // 2. Rename tables
    for (const { from, to } of [...TABLE_RENAMES, ...ADDITIONAL_TABLE_RENAMES]) {
      if (tables.includes(from)) {
        log(`  Renaming ${from} → ${to}`, 'blue');
        if (!DRY_RUN) {
          db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
        }
      } else {
        log(`  Skipping ${from} (not found)`, 'yellow');
      }
    }

    // 3. Rename columns (SQLite 3.25.0+ supports ALTER TABLE RENAME COLUMN)
    logSection('Renaming Columns');
    for (const { table, from, to } of COLUMN_RENAMES) {
      // Check if table and column exist
      try {
        const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
        const hasColumn = tableInfo.some(col => col.name === from);

        if (hasColumn) {
          log(`  ${table}: ${from} → ${to}`, 'blue');
          if (!DRY_RUN) {
            db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
          }
        } else {
          // Column might already be renamed or not exist
          const hasNewColumn = tableInfo.some(col => col.name === to);
          if (hasNewColumn) {
            log(`  ${table}: ${to} already exists (skipping)`, 'yellow');
          } else {
            log(`  ${table}: Column ${from} not found (skipping)`, 'yellow');
          }
        }
      } catch (err) {
        log(`  ${table}: Table not found or error (${err.message})`, 'yellow');
      }
    }

    // 4. Recreate indexes with new names
    logSection('Recreating Indexes');
    for (const idx of INDEX_RENAMES) {
      log(`  ${idx.old} → ${idx.new}`, 'blue');
      if (!DRY_RUN) {
        // Drop old index if it exists
        db.exec(`DROP INDEX IF EXISTS ${idx.old}`);
        // Create new index
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS ${idx.new} ON ${idx.table}(${idx.columns})`);
        } catch (err) {
          log(`    Warning: Could not create ${idx.new}: ${err.message}`, 'yellow');
        }
      }
    }

    // 5. Recreate FTS table with new name
    logSection('Recreating Full-Text Search');
    log('Creating pings_fts table...', 'blue');
    if (!DRY_RUN) {
      // Create new FTS table
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS pings_fts USING fts5(
          id UNINDEXED,
          content,
          content='pings',
          content_rowid='rowid'
        )
      `);

      // Create triggers
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS pings_fts_insert AFTER INSERT ON pings BEGIN
          INSERT INTO pings_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS pings_fts_delete AFTER DELETE ON pings BEGIN
          INSERT INTO pings_fts(pings_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS pings_fts_update AFTER UPDATE ON pings BEGIN
          INSERT INTO pings_fts(pings_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
          INSERT INTO pings_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
        END
      `);

      // Rebuild FTS index from existing data
      log('Rebuilding FTS index...', 'blue');
      const pings = db.prepare('SELECT rowid, id, content FROM pings WHERE deleted = 0').all();
      const insertFts = db.prepare('INSERT INTO pings_fts(rowid, id, content) VALUES (?, ?, ?)');
      for (const ping of pings) {
        insertFts.run(ping.rowid, ping.id, ping.content);
      }
      log(`  Indexed ${pings.length} pings`, 'green');
    }

    // 6. Update waves.idx_waves_root_droplet index name
    logSection('Updating Wave Indexes');
    if (!DRY_RUN) {
      db.exec('DROP INDEX IF EXISTS idx_waves_root_droplet');
      db.exec('CREATE INDEX IF NOT EXISTS idx_waves_root_ping ON waves(root_ping_id)');
      db.exec('DROP INDEX IF EXISTS idx_waves_group');
      db.exec('CREATE INDEX IF NOT EXISTS idx_waves_crew ON waves(crew_id)');
    }
    log('  idx_waves_root_droplet → idx_waves_root_ping', 'blue');
    log('  idx_waves_group → idx_waves_crew', 'blue');

    // 7. Update notifications index
    if (!DRY_RUN) {
      db.exec('DROP INDEX IF EXISTS idx_notifications_droplet');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_ping ON notifications(ping_id)');
    }
    log('  idx_notifications_droplet → idx_notifications_ping', 'blue');

    // 8. Update remote_pings indexes
    if (!DRY_RUN) {
      db.exec('DROP INDEX IF EXISTS idx_remote_droplets_wave');
      db.exec('DROP INDEX IF EXISTS idx_remote_droplets_origin');
      db.exec('DROP INDEX IF EXISTS idx_remote_droplets_author');
      try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_remote_pings_wave ON remote_pings(wave_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_remote_pings_origin ON remote_pings(origin_node, origin_wave_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_remote_pings_author ON remote_pings(author_node, author_id)');
      } catch (err) {
        log(`  Warning: Could not create remote_pings indexes: ${err.message}`, 'yellow');
      }
    }

    // Commit transaction
    if (!DRY_RUN) {
      db.exec('COMMIT');
      db.pragma('foreign_keys = ON');
    }

    logSection('Migration Complete');

    if (DRY_RUN) {
      log('DRY RUN - No changes were made', 'yellow');
      log('Run without --dry-run to apply changes', 'yellow');
    } else {
      // Verify migration
      const newTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);

      log('Verification:', 'green');
      log(`  pings table: ${newTables.includes('pings') ? 'OK' : 'MISSING'}`, newTables.includes('pings') ? 'green' : 'red');
      log(`  crews table: ${newTables.includes('crews') ? 'OK' : 'MISSING'}`, newTables.includes('crews') ? 'green' : 'red');
      log(`  pings_fts table: ${newTables.includes('pings_fts') ? 'OK' : 'MISSING'}`, newTables.includes('pings_fts') ? 'green' : 'red');
      log(`  Old droplets table: ${!newTables.includes('droplets') ? 'REMOVED' : 'STILL EXISTS'}`, !newTables.includes('droplets') ? 'green' : 'yellow');
      log(`  Old groups table: ${!newTables.includes('groups') ? 'REMOVED' : 'STILL EXISTS'}`, !newTables.includes('groups') ? 'green' : 'yellow');

      console.log();
      log('Database successfully migrated to Farhold v2.0.0!', 'green');
      log('Remember to update your server and client code.', 'blue');
    }

  } catch (err) {
    if (!DRY_RUN) {
      db.exec('ROLLBACK');
      db.pragma('foreign_keys = ON');
    }
    log(`Migration failed: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
