#!/usr/bin/env node
/**
 * Cortex Migration Script: v1.2 → v1.3
 * 
 * This script migrates your existing v1.2 data to v1.3 format.
 * 
 * Changes:
 * - users.json: username → handle, adds handleHistory, isAdmin
 * - threads.json → waves.json: adds archivedBy field
 * - messages.json: threadId → waveId
 * - Creates empty handle-requests.json
 * 
 * Usage:
 *   node migrate-v1.2-to-v1.3.js /path/to/v1.2/data /path/to/v1.3/data
 * 
 * Example:
 *   node migrate-v1.2-to-v1.3.js ./data ./server/data
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  CORTEX MIGRATION SCRIPT v1.2 → v1.3                       ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    node migrate-v1.2-to-v1.3.js <source-dir> <dest-dir>    ║
║                                                            ║
║  Example:                                                  ║
║    node migrate-v1.2-to-v1.3.js ./data ./server/data       ║
║                                                            ║
║  This will migrate:                                        ║
║    • users.json (username → handle, add handleHistory)     ║
║    • threads.json → waves.json (add archivedBy)            ║
║    • messages.json (threadId → waveId)                     ║
║    • groups.json (copy as-is)                              ║
║    • Create empty handle-requests.json                     ║
╚════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

const [sourceDir, destDir] = args;

// Validate source directory
if (!fs.existsSync(sourceDir)) {
  console.error(`❌ Source directory not found: ${sourceDir}`);
  process.exit(1);
}

// Create destination directory if needed
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`📁 Created destination directory: ${destDir}`);
}

// Helper to read JSON file
function readJSON(filepath) {
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  File not found, using empty object: ${filepath}`);
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (err) {
    console.error(`❌ Failed to parse ${filepath}:`, err.message);
    return {};
  }
}

// Helper to write JSON file
function writeJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`✅ Written: ${filepath} (${data.length} records)`);
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Starting Migration v1.2 → v1.3                            ║
╠════════════════════════════════════════════════════════════╣
║  Source: ${sourceDir.padEnd(46)}║
║  Dest:   ${destDir.padEnd(46)}║
╚════════════════════════════════════════════════════════════╝
`);

// ============ Migrate Users ============
console.log('\n📋 Migrating users...');
const usersFile = readJSON(path.join(sourceDir, 'users.json'));
const now = new Date().toISOString();

// v1.2 structure: { users: [], contacts: [] }
const oldUsers = usersFile.users || usersFile || [];
const oldContacts = usersFile.contacts || [];

console.log(`   • Found ${oldUsers.length} user records`);
console.log(`   • Found ${oldContacts.length} contact relationships`);
if (oldUsers.length > 0) {
  console.log(`   • Sample user keys: ${Object.keys(oldUsers[0]).slice(0, 5).join(', ')}...`);
}

const newUsers = oldUsers.map((user, index) => {
  // v1.2 uses 'username', v1.3 uses 'handle'
  const handle = user.username || user.handle;
  
  return {
    id: user.id,
    handle: handle,
    email: user.email,
    displayName: user.displayName || handle,
    avatar: user.avatar || (handle ? handle[0].toUpperCase() : '?'),
    passwordHash: user.passwordHash,
    nodeName: user.nodeName || 'Serenity',
    status: user.status || 'offline',
    isAdmin: index === 0 ? true : (user.isAdmin || false),  // First user becomes admin
    handleHistory: user.handleHistory || [{ handle: handle, from: user.createdAt || now, to: null }],
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
    lastPasswordChange: user.lastPasswordChange || user.createdAt || now,
    lastSeen: user.lastSeen || now,
  };
});

// Write in v1.3 format (plain array, contacts separate)
writeJSON(path.join(destDir, 'users.json'), newUsers);
console.log(`   • Migrated ${newUsers.length} users`);
if (newUsers.length > 0) {
  console.log(`   • First user (${newUsers[0].handle}) set as admin`);
}

// Also save contacts (for future use)
if (oldContacts.length > 0) {
  writeJSON(path.join(destDir, 'contacts.json'), oldContacts);
  console.log(`   • Migrated ${oldContacts.length} contacts`);
}

// ============ Migrate Threads → Waves ============
console.log('\n📋 Migrating threads → waves...');
const threadsFile = readJSON(path.join(sourceDir, 'threads.json'));

// v1.2 structure: { threads: [], participants: [] }
const oldThreads = threadsFile.threads || threadsFile || [];
const oldParticipants = threadsFile.participants || [];

console.log(`   • Found ${oldThreads.length} threads`);
console.log(`   • Found ${oldParticipants.length} participant relationships`);

const newWaves = oldThreads.map(thread => {
  // Get participants for this thread
  const threadParticipants = oldParticipants
    .filter(p => p.threadId === thread.id)
    .map(p => p.userId);
  
  // Make sure creator is included
  if (thread.createdBy && !threadParticipants.includes(thread.createdBy)) {
    threadParticipants.unshift(thread.createdBy);
  }
  
  return {
    id: thread.id,
    title: thread.title,
    privacy: thread.privacy || 'private',
    createdBy: thread.createdBy,
    participants: threadParticipants.length > 0 ? threadParticipants : [thread.createdBy],
    groupId: thread.groupId || null,
    createdAt: thread.createdAt || now,
    updatedAt: thread.updatedAt || now,
    archived: thread.archived || false,
    archivedBy: thread.archivedBy || [],  // New field for personal archiving
  };
});

writeJSON(path.join(destDir, 'waves.json'), newWaves);
console.log(`   • Migrated ${newWaves.length} threads → waves`);

// ============ Migrate Messages ============
console.log('\n📋 Migrating messages...');
const messagesFile = readJSON(path.join(sourceDir, 'messages.json'));

// v1.2 structure: { messages: [], history: [] }
const oldMessages = messagesFile.messages || messagesFile || [];
const oldHistory = messagesFile.history || [];

console.log(`   • Found ${oldMessages.length} messages`);
console.log(`   • Found ${oldHistory.length} edit history records`);

const newMessages = oldMessages.map(msg => {
  // Get version history for this message
  const msgHistory = oldHistory
    .filter(h => h.messageId === msg.id)
    .map(h => ({ content: h.content, editedAt: h.editedAt }));
  
  return {
    id: msg.id,
    waveId: msg.waveId || msg.threadId,  // Rename threadId → waveId
    authorId: msg.authorId,
    content: msg.content,
    parentId: msg.parentId || null,
    privacy: msg.privacy || 'private',
    createdAt: msg.createdAt || now,
    updatedAt: msg.editedAt || msg.createdAt || now,
    versions: msgHistory.length > 0 ? msgHistory : (msg.versions || []),
  };
});

writeJSON(path.join(destDir, 'messages.json'), newMessages);
console.log(`   • Migrated ${newMessages.length} messages`);

// ============ Migrate Groups ============
console.log('\n📋 Migrating groups...');
const groupsFile = readJSON(path.join(sourceDir, 'groups.json'));

// v1.2 structure: { groups: [], members: [] }
const oldGroups = groupsFile.groups || groupsFile || [];
const oldMembers = groupsFile.members || [];

console.log(`   • Found ${oldGroups.length} groups`);
console.log(`   • Found ${oldMembers.length} membership records`);

// Convert to v1.3 format (members embedded in group)
const newGroups = oldGroups.map(group => {
  const groupMembers = oldMembers
    .filter(m => m.groupId === group.id)
    .map(m => ({
      userId: m.userId,
      role: m.role || 'member',
      joinedAt: m.joinedAt || now,
    }));
  
  return {
    id: group.id,
    name: group.name,
    description: group.description || '',
    ownerId: group.createdBy,
    members: groupMembers,
    createdAt: group.createdAt || now,
    updatedAt: group.updatedAt || now,
  };
});

writeJSON(path.join(destDir, 'groups.json'), newGroups);
console.log(`   • Migrated ${newGroups.length} groups`);

// ============ Create Handle Requests ============
console.log('\n📋 Creating handle-requests.json...');
writeJSON(path.join(destDir, 'handle-requests.json'), []);
console.log('   • Created empty handle requests file');

// ============ Summary ============
const pad = (str, len) => String(str).padEnd(len);

console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ Migration Complete!                                    ║
╠════════════════════════════════════════════════════════════╣
║  Users:           ${pad(newUsers.length, 6)} (username → handle, +isAdmin)   ║
║  Contacts:        ${pad(oldContacts.length, 6)} (preserved)                   ║
║  Waves:           ${pad(newWaves.length, 6)} (threads → waves)              ║
║  Messages:        ${pad(newMessages.length, 6)} (threadId → waveId)           ║
║  Groups:          ${pad(newGroups.length, 6)} (members embedded)             ║
║  Handle Requests: 0      (new file created)              ║
╠════════════════════════════════════════════════════════════╣
║  IMPORTANT: v1.3 uses 'handle' instead of 'username'       ║
║  Login with your existing username - it's now your handle  ║
╠════════════════════════════════════════════════════════════╣
║  Next steps:                                               ║
║  1. Review migrated data in: ${pad(destDir, 25)}║
║  2. Start v1.3 server                                      ║
║  3. Test login with existing credentials                   ║
╚════════════════════════════════════════════════════════════╝
`);
