/**
 * Migration: Add Wave Categories (v2.2.0)
 *
 * This migration adds support for user-defined wave organization:
 * - wave_categories table for user-defined categories
 * - wave_category_assignments table for wave-to-category mappings
 * - pinned column to wave_participants for pinned waves
 * - Creates default "General" category for all existing users
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function migrateWaveCategories(dbPath) {
  console.log('Running migration: add-wave-categories.js');

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  try {
    db.transaction(() => {
      // Check if migration already applied
      const tableCheck = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='wave_categories'
      `).get();

      if (tableCheck) {
        console.log('  ✓ Wave categories tables already exist, skipping migration');
        return;
      }

      console.log('  → Adding pinned column to wave_participants...');
      // Add pinned column to wave_participants if it doesn't exist
      const columnCheck = db.prepare(`
        SELECT COUNT(*) as count FROM pragma_table_info('wave_participants')
        WHERE name='pinned'
      `).get();

      if (columnCheck.count === 0) {
        db.prepare(`
          ALTER TABLE wave_participants ADD COLUMN pinned INTEGER DEFAULT 0
        `).run();
        console.log('    ✓ Added pinned column');
      } else {
        console.log('    ✓ Pinned column already exists');
      }

      // Create wave_categories table
      console.log('  → Creating wave_categories table...');
      db.prepare(`
        CREATE TABLE IF NOT EXISTS wave_categories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT DEFAULT 'var(--accent-green)',
          sort_order INTEGER DEFAULT 0,
          collapsed INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, name)
        )
      `).run();
      console.log('    ✓ Created wave_categories table');

      // Create wave_category_assignments table
      console.log('  → Creating wave_category_assignments table...');
      db.prepare(`
        CREATE TABLE IF NOT EXISTS wave_category_assignments (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
          category_id TEXT REFERENCES wave_categories(id) ON DELETE SET NULL,
          assigned_at TEXT NOT NULL,
          PRIMARY KEY (user_id, wave_id)
        )
      `).run();
      console.log('    ✓ Created wave_category_assignments table');

      // Create indexes
      console.log('  → Creating indexes...');

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_wave_participants_pinned
        ON wave_participants(user_id, pinned) WHERE pinned = 1
      `).run();

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_wave_categories_user
        ON wave_categories(user_id)
      `).run();

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_wave_categories_sort
        ON wave_categories(user_id, sort_order)
      `).run();

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_wave_category_assignments_user
        ON wave_category_assignments(user_id)
      `).run();

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_wave_category_assignments_category
        ON wave_category_assignments(category_id)
      `).run();

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_wave_category_assignments_wave
        ON wave_category_assignments(wave_id)
      `).run();

      console.log('    ✓ Created indexes');

      // Create default "General" category for all existing users
      console.log('  → Creating default "General" category for existing users...');
      const users = db.prepare('SELECT id FROM users').all();
      const now = new Date().toISOString();

      const insertCategory = db.prepare(`
        INSERT INTO wave_categories (id, user_id, name, color, sort_order, collapsed, created_at, updated_at)
        VALUES (?, ?, 'General', 'var(--accent-green)', 0, 0, ?, ?)
      `);

      let categoryCount = 0;
      for (const user of users) {
        const categoryId = `cat-${uuidv4()}`;
        insertCategory.run(categoryId, user.id, now, now);
        categoryCount++;
      }

      console.log(`    ✓ Created ${categoryCount} default categories`);

      console.log('  ✅ Migration completed successfully');

    })();

  } catch (error) {
    console.error('  ❌ Migration failed:', error.message);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.argv[2] || join(__dirname, '..', 'farhold.db');
  console.log(`Database: ${dbPath}`);
  migrateWaveCategories(dbPath);
}
