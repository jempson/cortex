import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import sanitizeHtml from 'sanitize-html';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ Configuration ============
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET environment variable in production!');
  return 'cortex-default-secret-CHANGE-ME';
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Data directory and files
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  threads: path.join(DATA_DIR, 'threads.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  groups: path.join(DATA_DIR, 'groups.json'),
};
const LEGACY_DATA_FILE = path.join(__dirname, 'cortex-data.json');

// CORS configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;

// ============ Security: Rate Limiting ============
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + ':' + (req.body?.username || 'unknown'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ Security: Account Lockout ============
const failedAttempts = new Map();
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

function checkAccountLockout(username) {
  const record = failedAttempts.get(username);
  if (!record) return { locked: false };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { locked: true, remainingMin };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    failedAttempts.delete(username);
  }
  return { locked: false };
}

function recordFailedAttempt(username) {
  const record = failedAttempts.get(username) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= LOCKOUT_THRESHOLD) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
    console.log(`🔒 Account locked: ${username}`);
  }
  failedAttempts.set(username, record);
}

function clearFailedAttempts(username) {
  failedAttempts.delete(username);
}

// ============ Security: Input Sanitization ============
const sanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  textFilter: (text) => text,
};

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input, sanitizeOptions).trim();
}

function sanitizeMessage(content) {
  if (typeof content !== 'string') return '';
  return sanitizeHtml(content, sanitizeOptions).trim().slice(0, 10000);
}

// ============ Security: Password Validation ============
function validatePassword(password) {
  const errors = [];
  if (!password || typeof password !== 'string') {
    return ['Password is required'];
  }
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (password.length > 128) errors.push('Password must be less than 128 characters');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
  return errors;
}

// ============ Database with Separated Files ============
class Database {
  constructor() {
    this.users = { users: [], contacts: [] };
    this.threads = { threads: [], participants: [] };
    this.messages = { messages: [], history: [] };
    this.groups = { groups: [], members: [] };
    this.load();
  }

  // === File Operations ===
  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log('📁 Created data directory');
    }
  }

  loadFile(filepath, defaultData) {
    try {
      if (fs.existsSync(filepath)) {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      }
    } catch (err) {
      console.error(`Failed to load ${filepath}:`, err);
    }
    return defaultData;
  }

  saveFile(filepath, data) {
    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Failed to save ${filepath}:`, err);
    }
  }

  load() {
    this.ensureDataDir();
    
    // Check for legacy single-file data and migrate
    if (fs.existsSync(LEGACY_DATA_FILE) && !fs.existsSync(DATA_FILES.users)) {
      this.migrateLegacyData();
      return;
    }

    // Load separated files
    const hasData = fs.existsSync(DATA_FILES.users);
    
    if (hasData) {
      this.users = this.loadFile(DATA_FILES.users, { users: [], contacts: [] });
      this.threads = this.loadFile(DATA_FILES.threads, { threads: [], participants: [] });
      this.messages = this.loadFile(DATA_FILES.messages, { messages: [], history: [] });
      this.groups = this.loadFile(DATA_FILES.groups, { groups: [], members: [] });
      console.log('📂 Loaded data from separated files');
    } else {
      if (process.env.SEED_DEMO_DATA === 'true') {
        this.seedDemoData();
      } else {
        this.initEmpty();
      }
    }
  }

  migrateLegacyData() {
    console.log('🔄 Migrating legacy data to separated files...');
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_DATA_FILE, 'utf-8'));
      
      this.users = {
        users: legacy.users || [],
        contacts: legacy.contacts || [],
      };
      this.threads = {
        threads: legacy.threads || [],
        participants: legacy.threadParticipants || [],
      };
      this.messages = {
        messages: legacy.messages || [],
        history: legacy.messageHistory || [],
      };
      this.groups = { groups: [], members: [] };
      
      this.saveAll();
      
      // Rename legacy file as backup
      fs.renameSync(LEGACY_DATA_FILE, LEGACY_DATA_FILE + '.backup');
      console.log('✅ Migration complete. Legacy file backed up.');
    } catch (err) {
      console.error('Migration failed:', err);
      this.initEmpty();
    }
  }

  saveAll() {
    this.saveFile(DATA_FILES.users, this.users);
    this.saveFile(DATA_FILES.threads, this.threads);
    this.saveFile(DATA_FILES.messages, this.messages);
    this.saveFile(DATA_FILES.groups, this.groups);
  }

  saveUsers() { this.saveFile(DATA_FILES.users, this.users); }
  saveThreads() { this.saveFile(DATA_FILES.threads, this.threads); }
  saveMessages() { this.saveFile(DATA_FILES.messages, this.messages); }
  saveGroups() { this.saveFile(DATA_FILES.groups, this.groups); }

  initEmpty() {
    console.log('📝 Initializing empty database');
    this.saveAll();
    console.log('✅ Database initialized');
  }

  seedDemoData() {
    console.log('🌱 Seeding demo data...');
    const passwordHash = bcrypt.hashSync('Demo123!', 12);
    const now = new Date().toISOString();

    const demoUsers = [
      { id: 'user-mal', username: 'mal', email: 'mal@serenity.ship', displayName: 'Malcolm Reynolds', avatar: 'M', nodeName: 'Serenity', status: 'offline' },
      { id: 'user-zoe', username: 'zoe', email: 'zoe@serenity.ship', displayName: 'Zoe Washburne', avatar: 'Z', nodeName: 'Serenity', status: 'offline' },
      { id: 'user-wash', username: 'wash', email: 'wash@serenity.ship', displayName: 'Hoban Washburne', avatar: 'W', nodeName: 'Serenity', status: 'offline' },
      { id: 'user-kaylee', username: 'kaylee', email: 'kaylee@serenity.ship', displayName: 'Kaylee Frye', avatar: 'K', nodeName: 'Serenity', status: 'offline' },
      { id: 'user-jayne', username: 'jayne', email: 'jayne@serenity.ship', displayName: 'Jayne Cobb', avatar: 'J', nodeName: 'Serenity', status: 'offline' },
    ];

    this.users.users = demoUsers.map(u => ({ ...u, passwordHash, createdAt: now, lastSeen: now }));
    
    // Create a demo group
    this.groups.groups = [
      { id: 'group-crew', name: 'Serenity Crew', description: 'The crew of Serenity', createdBy: 'user-mal', createdAt: now },
    ];
    this.groups.members = demoUsers.map(u => ({
      groupId: 'group-crew',
      userId: u.id,
      role: u.id === 'user-mal' ? 'admin' : 'member',
      joinedAt: now,
    }));

    // Demo thread
    this.threads.threads = [
      { id: 'thread-1', title: 'Welcome to Cortex', privacy: 'public', createdBy: 'user-mal', createdAt: now, updatedAt: now },
    ];
    this.threads.participants = [
      { threadId: 'thread-1', userId: 'user-mal', joinedAt: now },
    ];

    this.messages.messages = [
      { id: 'msg-1', threadId: 'thread-1', parentId: null, authorId: 'user-mal', content: 'Welcome to Cortex! This is a public thread visible to everyone.', privacy: 'public', version: 1, createdAt: now, editedAt: null },
    ];

    this.saveAll();
    console.log('✅ Demo data seeded (password: Demo123!)');
  }

  // === User Methods ===
  findUserByUsername(username) {
    const sanitized = sanitizeInput(username)?.toLowerCase();
    return this.users.users.find(u => 
      u.username.toLowerCase() === sanitized || 
      u.email.toLowerCase() === sanitized
    );
  }

  findUserById(id) {
    return this.users.users.find(u => u.id === id);
  }

  createUser(userData) {
    const user = { ...userData, createdAt: new Date().toISOString(), lastSeen: new Date().toISOString() };
    this.users.users.push(user);
    this.saveUsers();
    return user;
  }

  updateUserStatus(userId, status) {
    const user = this.findUserById(userId);
    if (user) {
      user.status = status;
      user.lastSeen = new Date().toISOString();
      this.saveUsers();
    }
  }

  searchUsers(query, excludeUserId) {
    if (!query || query.length < 2) return [];
    const lowerQuery = query.toLowerCase();
    return this.users.users
      .filter(u => u.id !== excludeUserId &&
        (u.username.toLowerCase().includes(lowerQuery) ||
         u.displayName.toLowerCase().includes(lowerQuery)))
      .slice(0, 10)
      .map(u => ({
        id: u.id, username: u.username, displayName: u.displayName,
        avatar: u.avatar, status: u.status, nodeName: u.nodeName,
      }));
  }

  // === Contact Methods ===
  getContactsForUser(userId) {
    return this.users.contacts
      .filter(c => c.userId === userId)
      .map(c => {
        const contact = this.findUserById(c.contactId);
        return contact ? {
          id: contact.id, username: contact.username, name: contact.displayName,
          avatar: contact.avatar, status: contact.status, nodeName: contact.nodeName,
        } : null;
      })
      .filter(Boolean);
  }

  addContact(userId, contactId) {
    const existing = this.users.contacts.find(c => c.userId === userId && c.contactId === contactId);
    if (existing) return false;
    this.users.contacts.push({ userId, contactId, addedAt: new Date().toISOString() });
    this.saveUsers();
    return true;
  }

  removeContact(userId, contactId) {
    const index = this.users.contacts.findIndex(c => c.userId === userId && c.contactId === contactId);
    if (index === -1) return false;
    this.users.contacts.splice(index, 1);
    this.saveUsers();
    return true;
  }

  // === Group Methods ===
  getGroupsForUser(userId) {
    const memberGroupIds = this.groups.members
      .filter(m => m.userId === userId)
      .map(m => m.groupId);
    
    return this.groups.groups
      .filter(g => memberGroupIds.includes(g.id))
      .map(g => ({
        ...g,
        memberCount: this.groups.members.filter(m => m.groupId === g.id).length,
        role: this.groups.members.find(m => m.groupId === g.id && m.userId === userId)?.role,
      }));
  }

  getGroup(groupId) {
    return this.groups.groups.find(g => g.id === groupId);
  }

  getGroupMembers(groupId) {
    return this.groups.members
      .filter(m => m.groupId === groupId)
      .map(m => {
        const user = this.findUserById(m.userId);
        return user ? {
          id: user.id, username: user.username, name: user.displayName,
          avatar: user.avatar, status: user.status, role: m.role, joinedAt: m.joinedAt,
        } : null;
      })
      .filter(Boolean);
  }

  isGroupMember(groupId, userId) {
    return this.groups.members.some(m => m.groupId === groupId && m.userId === userId);
  }

  isGroupAdmin(groupId, userId) {
    return this.groups.members.some(m => m.groupId === groupId && m.userId === userId && m.role === 'admin');
  }

  createGroup(data) {
    const now = new Date().toISOString();
    const group = {
      id: `group-${uuidv4()}`,
      name: sanitizeInput(data.name).slice(0, 100),
      description: sanitizeInput(data.description || '').slice(0, 500),
      createdBy: data.createdBy,
      createdAt: now,
    };
    this.groups.groups.push(group);
    
    // Add creator as admin
    this.groups.members.push({
      groupId: group.id,
      userId: data.createdBy,
      role: 'admin',
      joinedAt: now,
    });
    
    this.saveGroups();
    return group;
  }

  updateGroup(groupId, data) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    if (data.name) group.name = sanitizeInput(data.name).slice(0, 100);
    if (data.description !== undefined) group.description = sanitizeInput(data.description).slice(0, 500);
    this.saveGroups();
    return group;
  }

  deleteGroup(groupId) {
    const index = this.groups.groups.findIndex(g => g.id === groupId);
    if (index === -1) return false;
    this.groups.groups.splice(index, 1);
    this.groups.members = this.groups.members.filter(m => m.groupId !== groupId);
    this.saveGroups();
    return true;
  }

  addGroupMember(groupId, userId, role = 'member') {
    if (this.isGroupMember(groupId, userId)) return false;
    this.groups.members.push({
      groupId, userId, role,
      joinedAt: new Date().toISOString(),
    });
    this.saveGroups();
    return true;
  }

  removeGroupMember(groupId, userId) {
    const index = this.groups.members.findIndex(m => m.groupId === groupId && m.userId === userId);
    if (index === -1) return false;
    this.groups.members.splice(index, 1);
    this.saveGroups();
    return true;
  }

  updateGroupMemberRole(groupId, userId, role) {
    const member = this.groups.members.find(m => m.groupId === groupId && m.userId === userId);
    if (!member) return false;
    member.role = role;
    this.saveGroups();
    return true;
  }

  // === Thread Methods ===
  getThreadsForUser(userId) {
    const participantThreadIds = this.threads.participants
      .filter(p => p.userId === userId)
      .map(p => p.threadId);

    // Get user's groups
    const userGroupIds = this.groups.members
      .filter(m => m.userId === userId)
      .map(m => m.groupId);

    return this.threads.threads
      .filter(t => 
        participantThreadIds.includes(t.id) || 
        t.privacy === 'public' ||
        (t.privacy === 'group' && t.groupId && userGroupIds.includes(t.groupId))
      )
      .map(thread => {
        const creator = this.findUserById(thread.createdBy);
        const participants = this.getThreadParticipants(thread.id);
        const messageCount = this.messages.messages.filter(m => m.threadId === thread.id).length;
        const group = thread.groupId ? this.getGroup(thread.groupId) : null;

        return {
          ...thread,
          creator_name: creator?.displayName || 'Unknown',
          creator_avatar: creator?.avatar || '?',
          participants,
          message_count: messageCount,
          is_participant: participantThreadIds.includes(thread.id),
          group_name: group?.name,
        };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getThread(threadId) {
    return this.threads.threads.find(t => t.id === threadId);
  }

  getThreadParticipants(threadId) {
    return this.threads.participants
      .filter(p => p.threadId === threadId)
      .map(p => {
        const user = this.findUserById(p.userId);
        return user ? { id: user.id, name: user.displayName, avatar: user.avatar, status: user.status } : null;
      })
      .filter(Boolean);
  }

  canAccessThread(threadId, userId) {
    const thread = this.getThread(threadId);
    if (!thread) return false;
    
    // Public threads are accessible to all
    if (thread.privacy === 'public') return true;
    
    // Check if participant
    if (this.threads.participants.some(p => p.threadId === threadId && p.userId === userId)) {
      return true;
    }
    
    // Group threads - check group membership
    if (thread.privacy === 'group' && thread.groupId) {
      return this.isGroupMember(thread.groupId, userId);
    }
    
    return false;
  }

  createThread(data) {
    const now = new Date().toISOString();
    const thread = {
      id: `thread-${uuidv4()}`,
      title: sanitizeInput(data.title).slice(0, 200),
      privacy: data.privacy || 'private',
      groupId: data.groupId || null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.threads.threads.push(thread);

    // Add creator as participant
    this.threads.participants.push({ threadId: thread.id, userId: data.createdBy, joinedAt: now });

    // Add other participants
    if (data.participants) {
      for (const userId of data.participants) {
        if (userId !== data.createdBy) {
          this.threads.participants.push({ threadId: thread.id, userId, joinedAt: now });
        }
      }
    }

    this.saveThreads();
    return thread;
  }

  updateThreadPrivacy(threadId, privacy, groupId = null) {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    
    thread.privacy = privacy;
    thread.groupId = privacy === 'group' ? groupId : null;
    thread.updatedAt = new Date().toISOString();
    
    this.saveThreads();
    return thread;
  }

  updateThreadTimestamp(threadId) {
    const thread = this.getThread(threadId);
    if (thread) {
      thread.updatedAt = new Date().toISOString();
      this.saveThreads();
    }
  }

  addThreadParticipant(threadId, userId) {
    const existing = this.threads.participants.find(p => p.threadId === threadId && p.userId === userId);
    if (existing) return false;
    this.threads.participants.push({ threadId, userId, joinedAt: new Date().toISOString() });
    this.saveThreads();
    return true;
  }

  // === Message Methods ===
  getMessagesForThread(threadId) {
    return this.messages.messages
      .filter(m => m.threadId === threadId)
      .map(m => {
        const author = this.findUserById(m.authorId);
        return {
          ...m,
          sender_name: author?.displayName || 'Unknown',
          sender_avatar: author?.avatar || '?',
          sender_handle: author?.username || 'unknown',
          author_id: m.authorId,
          parent_id: m.parentId,
          thread_id: m.threadId,
          created_at: m.createdAt,
          edited_at: m.editedAt,
        };
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  createMessage(data) {
    const now = new Date().toISOString();
    const message = {
      id: `msg-${uuidv4()}`,
      threadId: data.threadId,
      parentId: data.parentId || null,
      authorId: data.authorId,
      content: sanitizeMessage(data.content),
      privacy: data.privacy || 'private',
      version: 1,
      createdAt: now,
      editedAt: null,
    };
    this.messages.messages.push(message);
    this.updateThreadTimestamp(data.threadId);
    this.saveMessages();

    const author = this.findUserById(data.authorId);
    return {
      ...message,
      sender_name: author?.displayName || 'Unknown',
      sender_avatar: author?.avatar || '?',
      sender_handle: author?.username || 'unknown',
      author_id: message.authorId,
      parent_id: message.parentId,
      thread_id: message.threadId,
      created_at: message.createdAt,
      edited_at: message.editedAt,
    };
  }

  updateMessage(messageId, content) {
    const message = this.messages.messages.find(m => m.id === messageId);
    if (!message) return null;

    this.messages.history.push({
      id: `hist-${uuidv4()}`,
      messageId,
      content: message.content,
      version: message.version,
      editedAt: new Date().toISOString(),
    });

    message.content = sanitizeMessage(content);
    message.version += 1;
    message.editedAt = new Date().toISOString();
    this.saveMessages();

    const author = this.findUserById(message.authorId);
    return {
      ...message,
      sender_name: author?.displayName || 'Unknown',
      sender_avatar: author?.avatar || '?',
      sender_handle: author?.username || 'unknown',
      author_id: message.authorId,
      parent_id: message.parentId,
      thread_id: message.threadId,
      created_at: message.createdAt,
      edited_at: message.editedAt,
    };
  }
}

const db = new Database();

// ============ Express App ============
const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: ALLOWED_ORIGINS ? (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('CORS not allowed'));
  } : true,
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api/', apiLimiter);
app.set('trust proxy', 1);

// ============ Auth Middleware ============
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
}

// ============ Auth Routes ============
app.post('/api/auth/register', registerLimiter, async (req, res) => {
  try {
    const username = sanitizeInput(req.body.username);
    const email = sanitizeInput(req.body.email);
    const password = req.body.password;
    const displayName = sanitizeInput(req.body.displayName);

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters, letters/numbers/underscores only' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: passwordErrors.join('. ') });
    }

    const existing = db.findUserByUsername(username) || db.findUserByUsername(email);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const id = `user-${uuidv4()}`;
    const passwordHash = await bcrypt.hash(password, 12);
    const avatar = (displayName || username)[0].toUpperCase();

    const user = db.createUser({
      id, username: username.toLowerCase(), email: email.toLowerCase(),
      passwordHash, displayName: displayName || username, avatar,
      nodeName: 'Local', status: 'online',
    });

    const token = jwt.sign({ userId: id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`✅ New user registered: ${username}`);

    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName, avatar: user.avatar, nodeName: user.nodeName, status: user.status },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const username = sanitizeInput(req.body.username);
    const password = req.body.password;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const lockout = checkAccountLockout(username);
    if (lockout.locked) {
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${lockout.remainingMin} minutes.` });
    }

    const user = db.findUserByUsername(username);
    if (!user) {
      recordFailedAttempt(username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      recordFailedAttempt(username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearFailedAttempts(username);
    db.updateUserStatus(user.id, 'online');

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`✅ User logged in: ${username}`);

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName, avatar: user.avatar, nodeName: user.nodeName, status: 'online' },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName, avatar: user.avatar, nodeName: user.nodeName, status: user.status });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  db.updateUserStatus(req.user.userId, 'offline');
  res.json({ success: true });
});

// ============ User Routes ============
app.get('/api/users/search', authenticateToken, (req, res) => {
  const query = sanitizeInput(req.query.q);
  if (!query || query.length < 2) return res.json([]);
  
  const users = db.searchUsers(query, req.user.userId);
  const contactIds = db.getContactsForUser(req.user.userId).map(c => c.id);
  const results = users.map(u => ({ ...u, isContact: contactIds.includes(u.id) }));
  res.json(results);
});

// ============ Contact Routes ============
app.get('/api/contacts', authenticateToken, (req, res) => {
  res.json(db.getContactsForUser(req.user.userId));
});

app.post('/api/contacts', authenticateToken, (req, res) => {
  const username = sanitizeInput(req.body.username);
  const contact = db.findUserByUsername(username);
  if (!contact) return res.status(404).json({ error: 'User not found' });
  if (contact.id === req.user.userId) return res.status(400).json({ error: 'Cannot add yourself' });
  
  if (!db.addContact(req.user.userId, contact.id)) {
    return res.status(409).json({ error: 'Contact already exists' });
  }
  res.status(201).json({
    success: true,
    contact: { id: contact.id, username: contact.username, name: contact.displayName, avatar: contact.avatar, status: contact.status, nodeName: contact.nodeName },
  });
});

app.delete('/api/contacts/:id', authenticateToken, (req, res) => {
  if (!db.removeContact(req.user.userId, sanitizeInput(req.params.id))) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  res.json({ success: true });
});

// ============ Group Routes ============
app.get('/api/groups', authenticateToken, (req, res) => {
  res.json(db.getGroupsForUser(req.user.userId));
});

app.get('/api/groups/:id', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  const group = db.getGroup(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (!db.isGroupMember(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json({
    ...group,
    members: db.getGroupMembers(groupId),
    isAdmin: db.isGroupAdmin(groupId, req.user.userId),
  });
});

app.post('/api/groups', authenticateToken, (req, res) => {
  const name = sanitizeInput(req.body.name);
  if (!name || name.length < 1) return res.status(400).json({ error: 'Name is required' });
  
  const group = db.createGroup({
    name,
    description: req.body.description,
    createdBy: req.user.userId,
  });
  
  res.status(201).json({ ...group, memberCount: 1, role: 'admin' });
});

app.put('/api/groups/:id', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  if (!db.isGroupAdmin(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const group = db.updateGroup(groupId, req.body);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json(group);
});

app.delete('/api/groups/:id', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  if (!db.isGroupAdmin(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (!db.deleteGroup(groupId)) {
    return res.status(404).json({ error: 'Group not found' });
  }
  res.json({ success: true });
});

app.post('/api/groups/:id/members', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  if (!db.isGroupAdmin(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const userId = sanitizeInput(req.body.userId);
  const user = db.findUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  if (!db.addGroupMember(groupId, userId, req.body.role || 'member')) {
    return res.status(409).json({ error: 'User already in group' });
  }
  res.status(201).json({ success: true });
});

app.delete('/api/groups/:id/members/:userId', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  const userId = sanitizeInput(req.params.userId);
  
  // Allow self-removal or admin removal
  if (userId !== req.user.userId && !db.isGroupAdmin(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  if (!db.removeGroupMember(groupId, userId)) {
    return res.status(404).json({ error: 'Member not found' });
  }
  res.json({ success: true });
});

app.put('/api/groups/:id/members/:userId', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  if (!db.isGroupAdmin(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const userId = sanitizeInput(req.params.userId);
  const role = req.body.role;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  if (!db.updateGroupMemberRole(groupId, userId, role)) {
    return res.status(404).json({ error: 'Member not found' });
  }
  res.json({ success: true });
});

// ============ Thread Routes ============
app.get('/api/threads', authenticateToken, (req, res) => {
  res.json(db.getThreadsForUser(req.user.userId));
});

app.get('/api/threads/:id', authenticateToken, (req, res) => {
  const threadId = sanitizeInput(req.params.id);
  const thread = db.getThread(threadId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (!db.canAccessThread(threadId, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const creator = db.findUserById(thread.createdBy);
  const participants = db.getThreadParticipants(thread.id);
  const allMessages = db.getMessagesForThread(thread.id);
  const group = thread.groupId ? db.getGroup(thread.groupId) : null;

  function buildMessageTree(messages, parentId = null) {
    return messages
      .filter(m => m.parent_id === parentId)
      .map(m => ({ ...m, children: buildMessageTree(messages, m.id) }));
  }

  res.json({
    ...thread,
    creator_name: creator?.displayName || 'Unknown',
    participants,
    messages: buildMessageTree(allMessages),
    all_messages: allMessages,
    group_name: group?.name,
    can_edit: thread.createdBy === req.user.userId,
  });
});

app.post('/api/threads', authenticateToken, (req, res) => {
  const title = sanitizeInput(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  
  const privacy = ['private', 'group', 'crossServer', 'public'].includes(req.body.privacy) 
    ? req.body.privacy : 'private';
  
  // Validate group access for group threads
  if (privacy === 'group') {
    const groupId = sanitizeInput(req.body.groupId);
    if (!groupId) return res.status(400).json({ error: 'Group ID required for group threads' });
    if (!db.isGroupMember(groupId, req.user.userId)) {
      return res.status(403).json({ error: 'Must be group member' });
    }
  }

  const thread = db.createThread({
    title,
    privacy,
    groupId: privacy === 'group' ? sanitizeInput(req.body.groupId) : null,
    createdBy: req.user.userId,
    participants: req.body.participants,
  });

  const result = {
    ...thread,
    creator_name: db.findUserById(req.user.userId)?.displayName || 'Unknown',
    participants: db.getThreadParticipants(thread.id),
    message_count: 0,
  };

  broadcastToThread(thread.id, { type: 'thread_created', thread: result });
  res.status(201).json(result);
});

app.put('/api/threads/:id', authenticateToken, (req, res) => {
  const threadId = sanitizeInput(req.params.id);
  const thread = db.getThread(threadId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (thread.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Only thread creator can modify' });
  }

  const privacy = req.body.privacy;
  if (privacy && ['private', 'group', 'crossServer', 'public'].includes(privacy)) {
    let groupId = null;
    if (privacy === 'group') {
      groupId = sanitizeInput(req.body.groupId);
      if (!groupId) return res.status(400).json({ error: 'Group ID required' });
      if (!db.isGroupMember(groupId, req.user.userId)) {
        return res.status(403).json({ error: 'Must be group member' });
      }
    }
    db.updateThreadPrivacy(threadId, privacy, groupId);
  }

  if (req.body.title) {
    thread.title = sanitizeInput(req.body.title).slice(0, 200);
    db.saveThreads();
  }

  broadcastToThread(threadId, { type: 'thread_updated', thread });
  res.json(thread);
});

// ============ Message Routes ============
app.post('/api/messages', authenticateToken, (req, res) => {
  const threadId = sanitizeInput(req.body.thread_id);
  const content = req.body.content;
  if (!threadId || !content) return res.status(400).json({ error: 'Thread ID and content required' });

  const thread = db.getThread(threadId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const canAccess = db.canAccessThread(threadId, req.user.userId);
  if (!canAccess) return res.status(403).json({ error: 'Access denied' });

  // Auto-join public threads
  const isParticipant = db.threads.participants.some(p => p.threadId === threadId && p.userId === req.user.userId);
  if (!isParticipant && thread.privacy === 'public') {
    db.addThreadParticipant(threadId, req.user.userId);
  }

  if (content.length > 10000) return res.status(400).json({ error: 'Message too long' });

  const message = db.createMessage({
    threadId,
    parentId: req.body.parent_id ? sanitizeInput(req.body.parent_id) : null,
    authorId: req.user.userId,
    content,
    privacy: thread.privacy,
  });

  broadcastToThread(threadId, { type: 'new_message', data: message });
  res.status(201).json(message);
});

app.put('/api/messages/:id', authenticateToken, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const message = db.messages.messages.find(m => m.id === messageId);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.authorId !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

  const content = req.body.content;
  if (content.length > 10000) return res.status(400).json({ error: 'Message too long' });

  const updated = db.updateMessage(messageId, content);
  broadcastToThread(message.threadId, { type: 'message_edited', data: updated });
  res.json(updated);
});

// ============ Health Check ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.0', uptime: process.uptime() });
});

// ============ WebSocket Setup ============
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map();

const wsConnectionAttempts = new Map();
const WS_RATE_LIMIT = 10;
const WS_RATE_WINDOW = 60 * 1000;

wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const now = Date.now();
  const attempts = wsConnectionAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => t > now - WS_RATE_WINDOW);
  
  if (recentAttempts.length >= WS_RATE_LIMIT) {
    ws.close(1008, 'Rate limit exceeded');
    return;
  }
  recentAttempts.push(now);
  wsConnectionAttempts.set(ip, recentAttempts);
  
  let userId = null;

  ws.on('message', (data) => {
    try {
      if (data.length > 10000) { ws.close(1009, 'Message too large'); return; }
      const message = JSON.parse(data.toString());

      if (message.type === 'auth') {
        try {
          const decoded = jwt.verify(message.token, JWT_SECRET);
          userId = decoded.userId;
          if (!clients.has(userId)) clients.set(userId, new Set());
          clients.get(userId).add(ws);
          db.updateUserStatus(userId, 'online');
          ws.send(JSON.stringify({ type: 'auth_success', userId }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }));
        }
      }
    } catch (err) {
      console.error('WebSocket error:', err);
    }
  });

  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId).delete(ws);
      if (clients.get(userId).size === 0) {
        clients.delete(userId);
        db.updateUserStatus(userId, 'offline');
      }
    }
  });
});

function broadcastToThread(threadId, message) {
  const thread = db.getThread(threadId);
  if (!thread) return;

  // Get all users who should receive this
  let recipients = new Set();
  
  // Direct participants
  db.getThreadParticipants(threadId).forEach(p => recipients.add(p.id));
  
  // For group threads, all group members
  if (thread.privacy === 'group' && thread.groupId) {
    db.getGroupMembers(thread.groupId).forEach(m => recipients.add(m.id));
  }
  
  // For public threads, all connected users (they can see it in their list)
  if (thread.privacy === 'public') {
    clients.forEach((_, oderId) => recipients.add(oderId));
  }

  for (const oderId of recipients) {
    if (clients.has(oderId)) {
      for (const ws of clients.get(oderId)) {
        if (ws.readyState === 1) ws.send(JSON.stringify(message));
      }
    }
  }
}

// ============ Start Server ============
const demoEnabled = process.env.SEED_DEMO_DATA === 'true';
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗        ║
║  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝        ║
║  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝         ║
║  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗         ║
║  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗        ║
║   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝        ║
║  SECURE COMMUNICATIONS SYSTEM v1.2.0                       ║
╠════════════════════════════════════════════════════════════╣
║  🔒 Security: Rate limiting, XSS protection, Helmet        ║
║  📁 Data: Separated files (users, threads, messages, groups)║
║  👥 Groups: Create groups, manage members, group threads   ║
║  🔄 Thread Privacy: Change visibility level anytime        ║
╠════════════════════════════════════════════════════════════╣
║  PORT=${PORT} | JWT=${JWT_SECRET === 'cortex-default-secret-CHANGE-ME' ? '⚠️ DEFAULT' : '✅ Custom'} | CORS=${ALLOWED_ORIGINS ? '✅' : '⚠️ All'}
║  DEMO_DATA=${demoEnabled ? '✅' : '❌'} | Server: http://localhost:${PORT}
╚════════════════════════════════════════════════════════════╝
`);
});
