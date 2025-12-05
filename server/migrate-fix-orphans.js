/**
 * Migration Script: Fix Orphaned Messages
 *
 * This script finds and removes orphaned messages - messages whose parentId
 * points to a message that no longer exists (was hard-deleted before the
 * soft-delete feature was implemented).
 *
 * Run this on your production server to fix the "phantom unread" bug where
 * users couldn't clear their unread count because deleted messages were
 * still being counted.
 *
 * Usage:
 *   node migrate-fix-orphans.js           # Dry run - shows what would be deleted
 *   node migrate-fix-orphans.js --apply   # Actually delete the orphans
 *
 * IMPORTANT: Back up your data/messages.json before running with --apply!
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const BACKUP_FILE = path.join(__dirname, 'data', 'messages.backup.json');

const dryRun = !process.argv.includes('--apply');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           Fix Orphaned Messages Migration                  ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made');
  console.log('   Run with --apply to actually delete orphans');
  console.log('');
}

// Read messages
if (!fs.existsSync(MESSAGES_FILE)) {
  console.error('❌ Error: messages.json not found at', MESSAGES_FILE);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
const messages = data.messages;
const messageIds = new Set(messages.map(m => m.id));

// Find orphans
const orphans = messages.filter(m =>
  m.parentId !== null && !messageIds.has(m.parentId)
);

console.log(`📊 Total messages: ${messages.length}`);
console.log(`🔗 Messages with parents: ${messages.filter(m => m.parentId).length}`);
console.log(`👻 Orphaned messages: ${orphans.length}`);
console.log('');

if (orphans.length === 0) {
  console.log('✅ No orphaned messages found. Nothing to do!');
  process.exit(0);
}

// Group orphans by wave for better reporting
const orphansByWave = {};
orphans.forEach(m => {
  if (!orphansByWave[m.waveId]) orphansByWave[m.waveId] = [];
  orphansByWave[m.waveId].push(m);
});

console.log('📋 Orphan details by wave:');
console.log('─'.repeat(60));

Object.entries(orphansByWave).forEach(([waveId, waveOrphans]) => {
  console.log(`\n  Wave: ${waveId}`);
  console.log(`  Orphans: ${waveOrphans.length}`);
  waveOrphans.forEach(m => {
    const preview = m.content.replace(/<[^>]*>/g, '').substring(0, 40);
    console.log(`    - ${m.id}`);
    console.log(`      Parent (missing): ${m.parentId}`);
    console.log(`      Content: "${preview}${m.content.length > 40 ? '...' : ''}"`);
    console.log(`      Author: ${m.authorId}`);
  });
});

console.log('');
console.log('─'.repeat(60));

if (dryRun) {
  console.log('');
  console.log('⚠️  DRY RUN COMPLETE');
  console.log('   To delete these orphans, run:');
  console.log('   node migrate-fix-orphans.js --apply');
  console.log('');
  console.log('💡 Tip: Back up data/messages.json first!');
} else {
  // Create backup
  console.log('');
  console.log('📦 Creating backup...');
  fs.copyFileSync(MESSAGES_FILE, BACKUP_FILE);
  console.log(`   Backup saved to: ${BACKUP_FILE}`);

  // Remove orphans
  const orphanIds = new Set(orphans.map(m => m.id));
  data.messages = messages.filter(m => !orphanIds.has(m.id));

  // Also remove any history for deleted messages
  if (data.history) {
    const originalHistoryCount = data.history.length;
    data.history = data.history.filter(h => !orphanIds.has(h.messageId));
    const removedHistory = originalHistoryCount - data.history.length;
    if (removedHistory > 0) {
      console.log(`   Also removed ${removedHistory} history entries`);
    }
  }

  // Save
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));

  console.log('');
  console.log('✅ MIGRATION COMPLETE');
  console.log(`   Deleted ${orphans.length} orphaned messages`);
  console.log(`   Remaining messages: ${data.messages.length}`);
  console.log('');
  console.log('🔄 Restart your server to apply changes');
}
