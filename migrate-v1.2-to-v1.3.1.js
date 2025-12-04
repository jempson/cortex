#!/usr/bin/env node
/**
 * Cortex Migration Script: v1.2 → v1.3.1
 *
 * This script migrates your existing v1.2 or v1.3 data to v1.3.1 format.
 *
 * Changes:
 * - users.json: Converts to { users: [], contacts: [] } format, adds lastHandleChange
 * - waves.json: Converts to { waves: [], participants: [] } format, adds lastRead for notifications
 * - messages.json: Converts to { messages: [], history: [] } format
 * - groups.json: Converts to { groups: [], members: [] } format
 * - Creates handle-requests.json if missing
 *
 * Usage:
 *   node migrate-v1.2-to-v1.3.1.js /path/to/old/data /path/to/new/data
 *
 * Example:
 *   node migrate-v1.2-to-v1.3.1.js ./production/data ./server/data
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  CORTEX MIGRATION SCRIPT v1.2/v1.3 → v1.3.1                ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║    node migrate-v1.2-to-v1.3.1.js <source-dir> <dest-dir>  ║
║                                                            ║
║  Example:                                                  ║
║    node migrate-v1.2-to-v1.3.1.js ./data ./server/data     ║
║                                                            ║
║  This will migrate to v1.3.1 format:                       ║
║    • users.json → { users: [], contacts: [] }              ║
║    • waves.json → { waves: [], participants: [] }          ║
║    • messages.json → { messages: [], history: [] }         ║
║    • groups.json → { groups: [], members: [] }             ║
║    • Adds unread notification support (lastRead field)     ║
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

// Backup existing destination if it exists
if (fs.existsSync(destDir) && fs.readdirSync(destDir).length > 0) {
  const backupDir = `${destDir}.backup.${Date.now()}`;
  console.log(`📦 Creating backup: ${backupDir}`);
  fs.cpSync(destDir, backupDir, { recursive: true });
}

// Helper to read JSON file
function readJSON(filepath) {
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  File not found: ${filepath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (err) {
    console.error(`❌ Failed to parse ${filepath}:`, err.message);
    return null;
  }
}

// Helper to write JSON file
function writeJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  const size = Object.keys(data).map(k => Array.isArray(data[k]) ? data[k].length : 0).reduce((a,b) => a+b, 0);
  console.log(`✅ Written: ${path.basename(filepath)} (${size} total records)`);
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Starting Migration → v1.3.1                               ║
╠════════════════════════════════════════════════════════════╣
║  Source: ${sourceDir.padEnd(46)}║
║  Dest:   ${destDir.padEnd(46)}║
╚════════════════════════════════════════════════════════════╝
`);

const now = new Date().toISOString();

// ============ Migrate Users ============
console.log('\n📋 Migrating users...');
const usersData = readJSON(path.join(sourceDir, 'users.json'));
const contactsData = readJSON(path.join(sourceDir, 'contacts.json'));

// Handle both old array format and new object format
let oldUsers, oldContacts;
if (Array.isArray(usersData)) {
  // Old format: plain array
  oldUsers = usersData;
  oldContacts = contactsData || [];
} else if (usersData && usersData.users) {
  // New format: object with users/contacts
  oldUsers = usersData.users;
  oldContacts = usersData.contacts || contactsData || [];
} else {
  oldUsers = [];
  oldContacts = [];
}

console.log(`   • Found ${oldUsers.length} users`);
console.log(`   • Found ${oldContacts.length} contacts`);

const newUsers = oldUsers.map((user, index) => {
  const handle = user.handle || user.username;

  return {
    id: user.id,
    handle: handle,
    email: user.email,
    displayName: user.displayName || handle,
    avatar: user.avatar || (handle ? handle[0].toUpperCase() : '?'),
    passwordHash: user.passwordHash,
    nodeName: user.nodeName || 'Local',
    status: user.status || 'offline',
    isAdmin: user.isAdmin !== undefined ? user.isAdmin : (index === 0),
    handleHistory: user.handleHistory || [{ handle: handle, from: user.createdAt || now, to: null }],
    lastHandleChange: user.lastHandleChange || null,  // NEW: for handle change cooldown
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
    lastPasswordChange: user.lastPasswordChange || user.createdAt || now,
    lastSeen: user.lastSeen || now,
  };
});

writeJSON(path.join(destDir, 'users.json'), {
  users: newUsers,
  contacts: oldContacts,
});

// ============ Migrate Waves ============
console.log('\n📋 Migrating waves...');
const wavesData = readJSON(path.join(sourceDir, 'waves.json')) ||
                  readJSON(path.join(sourceDir, 'threads.json'));

let oldWaves, oldParticipants;
if (Array.isArray(wavesData)) {
  // Old format: array with embedded participants
  oldWaves = wavesData;
  oldParticipants = [];

  // Extract participants from embedded arrays
  oldWaves.forEach(wave => {
    if (wave.participants && Array.isArray(wave.participants)) {
      wave.participants.forEach(userId => {
        oldParticipants.push({
          waveId: wave.id,
          userId: userId,
          joinedAt: wave.createdAt || now,
          archived: wave.archivedBy?.includes(userId) || false,
        });
      });
    }
    // Add creator if not in participants
    if (wave.createdBy && !oldParticipants.some(p => p.waveId === wave.id && p.userId === wave.createdBy)) {
      oldParticipants.push({
        waveId: wave.id,
        userId: wave.createdBy,
        joinedAt: wave.createdAt || now,
        archived: false,
      });
    }
  });
} else if (wavesData && (wavesData.waves || wavesData.threads)) {
  // v1.3 format: { waves: [], participants: [] }
  // v1.2 format: { threads: [], participants: [] }
  oldWaves = wavesData.waves || wavesData.threads || [];
  oldParticipants = wavesData.participants || [];

  // Convert threadId to waveId in participants if needed
  oldParticipants = oldParticipants.map(p => ({
    waveId: p.waveId || p.threadId,
    userId: p.userId,
    joinedAt: p.joinedAt || now,
    archived: p.archived || false,
  }));
} else {
  oldWaves = [];
  oldParticipants = [];
}

console.log(`   • Found ${oldWaves.length} waves`);
console.log(`   • Found ${oldParticipants.length} participants`);

// Clean waves (remove embedded data)
const newWaves = oldWaves.map(wave => ({
  id: wave.id,
  title: wave.title,
  privacy: wave.privacy || 'private',
  createdBy: wave.createdBy,
  groupId: wave.groupId || null,
  createdAt: wave.createdAt || now,
  updatedAt: wave.updatedAt || now,
}));

// Add lastRead field for unread notifications (NEW in v1.3.1)
const newParticipants = oldParticipants.map(p => ({
  waveId: p.waveId,
  userId: p.userId,
  joinedAt: p.joinedAt || now,
  archived: p.archived || false,
  lastRead: p.lastRead || null,  // NEW: null means all messages are unread initially
}));

writeJSON(path.join(destDir, 'waves.json'), {
  waves: newWaves,
  participants: newParticipants,
});

// ============ Migrate Messages ============
console.log('\n📋 Migrating messages...');
const messagesData = readJSON(path.join(sourceDir, 'messages.json'));

let oldMessages, oldHistory;
if (Array.isArray(messagesData)) {
  // Old format: array with embedded versions
  oldMessages = messagesData;
  oldHistory = [];

  // Extract history from embedded versions
  oldMessages.forEach(msg => {
    if (msg.versions && Array.isArray(msg.versions)) {
      msg.versions.forEach(v => {
        oldHistory.push({
          messageId: msg.id,
          content: v.content,
          editedAt: v.editedAt,
        });
      });
    }
  });
} else if (messagesData && messagesData.messages) {
  oldMessages = messagesData.messages;
  oldHistory = messagesData.history || [];
} else {
  oldMessages = [];
  oldHistory = [];
}

console.log(`   • Found ${oldMessages.length} messages`);
console.log(`   • Found ${oldHistory.length} history records`);

const newMessages = oldMessages.map(msg => ({
  id: msg.id,
  waveId: msg.waveId || msg.threadId,
  authorId: msg.authorId,
  content: msg.content,
  parentId: msg.parentId || null,
  privacy: msg.privacy || 'private',
  version: msg.version || 1,
  createdAt: msg.createdAt || now,
  editedAt: msg.editedAt || null,
}));

writeJSON(path.join(destDir, 'messages.json'), {
  messages: newMessages,
  history: oldHistory,
});

// ============ Migrate Groups ============
console.log('\n📋 Migrating groups...');
const groupsData = readJSON(path.join(sourceDir, 'groups.json'));

let oldGroups, oldMembers;
if (Array.isArray(groupsData)) {
  // Old format: array with embedded members
  oldGroups = groupsData;
  oldMembers = [];

  // Extract members from embedded arrays
  oldGroups.forEach(group => {
    if (group.members && Array.isArray(group.members)) {
      group.members.forEach(m => {
        oldMembers.push({
          groupId: group.id,
          userId: m.userId || m,
          role: m.role || 'member',
          joinedAt: m.joinedAt || group.createdAt || now,
        });
      });
    }
    // Add owner as admin if not in members
    const ownerId = group.ownerId || group.createdBy;
    if (ownerId && !oldMembers.some(m => m.groupId === group.id && m.userId === ownerId)) {
      oldMembers.push({
        groupId: group.id,
        userId: ownerId,
        role: 'admin',
        joinedAt: group.createdAt || now,
      });
    }
  });
} else if (groupsData && groupsData.groups) {
  oldGroups = groupsData.groups;
  oldMembers = groupsData.members || [];
} else {
  oldGroups = [];
  oldMembers = [];
}

console.log(`   • Found ${oldGroups.length} groups`);
console.log(`   • Found ${oldMembers.length} members`);

const newGroups = oldGroups.map(group => ({
  id: group.id,
  name: group.name,
  description: group.description || '',
  createdBy: group.createdBy || group.ownerId,
  createdAt: group.createdAt || now,
}));

writeJSON(path.join(destDir, 'groups.json'), {
  groups: newGroups,
  members: oldMembers,
});

// ============ Handle Requests ============
console.log('\n📋 Migrating handle requests...');
const handleRequestsData = readJSON(path.join(sourceDir, 'handle-requests.json'));

let requests;
if (Array.isArray(handleRequestsData)) {
  requests = handleRequestsData;
} else if (handleRequestsData && handleRequestsData.requests) {
  requests = handleRequestsData.requests;
} else {
  requests = [];
}

writeJSON(path.join(destDir, 'handle-requests.json'), {
  requests: requests,
});

console.log(`   • Migrated ${requests.length} handle requests`);

// ============ Summary ============
console.log(`
╔════════════════════════════════════════════════════════════╗
║  ✅ Migration to v1.3.1 Complete!                          ║
╠════════════════════════════════════════════════════════════╣
║  Users:           ${String(newUsers.length).padEnd(6)} (+lastHandleChange field)      ║
║  Contacts:        ${String(oldContacts.length).padEnd(6)}                                 ║
║  Waves:           ${String(newWaves.length).padEnd(6)}                                 ║
║  Participants:    ${String(newParticipants.length).padEnd(6)} (+lastRead for notifications)  ║
║  Messages:        ${String(newMessages.length).padEnd(6)}                                 ║
║  Groups:          ${String(newGroups.length).padEnd(6)}                                 ║
║  Members:         ${String(oldMembers.length).padEnd(6)}                                 ║
║  Handle Requests: ${String(requests.length).padEnd(6)}                                 ║
╠════════════════════════════════════════════════════════════╣
║  NEW in v1.3.1:                                            ║
║  • Unread wave notifications with lastRead tracking       ║
║  • Improved data structure with separated arrays          ║
╠════════════════════════════════════════════════════════════╣
║  Next steps:                                               ║
║  1. Start v1.3.1 server from migrated data directory      ║
║  2. Test login and verify all data is accessible          ║
║  3. Test unread notifications by sending messages         ║
╚════════════════════════════════════════════════════════════╝
`);
