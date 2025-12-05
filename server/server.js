import 'dotenv/config';
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
import multer from 'multer';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ Configuration ============
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET environment variable in production!');
  return 'cortex-default-secret-CHANGE-ME';
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// GIPHY API configuration
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || null;

// Data directory and files
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  waves: path.join(DATA_DIR, 'waves.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  groups: path.join(DATA_DIR, 'groups.json'),
  handleRequests: path.join(DATA_DIR, 'handle-requests.json'),
  reports: path.join(DATA_DIR, 'reports.json'),
  moderation: path.join(DATA_DIR, 'moderation.json'),
  contactRequests: path.join(DATA_DIR, 'contact-requests.json'),
  groupInvitations: path.join(DATA_DIR, 'group-invitations.json'),
};

// Uploads directory for avatars
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

// Ensure uploads directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

// Multer configuration for avatar uploads
const avatarStorage = multer.memoryStorage();
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: jpg, png, gif, webp'), false);
    }
  },
});

// CORS configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;

// ============ Security: Rate Limiting ============
// Configurable via .env - set higher values for development/testing
const RATE_LIMIT_LOGIN_MAX = parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 30;
const RATE_LIMIT_REGISTER_MAX = parseInt(process.env.RATE_LIMIT_REGISTER_MAX) || 15;
const RATE_LIMIT_API_MAX = parseInt(process.env.RATE_LIMIT_API_MAX) || 300;
const RATE_LIMIT_GIF_MAX = parseInt(process.env.RATE_LIMIT_GIF_MAX) || 30;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMIT_LOGIN_MAX,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + ':' + (req.body?.handle || req.body?.username || 'unknown'),
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: RATE_LIMIT_REGISTER_MAX,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_API_MAX,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const gifSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_GIF_MAX,
  message: { error: 'Too many GIF searches. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ Security: Account Lockout ============
// Configurable via .env
const failedAttempts = new Map();
const LOCKOUT_THRESHOLD = parseInt(process.env.LOCKOUT_THRESHOLD) || 15;
const LOCKOUT_DURATION = (parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 15) * 60 * 1000;

function checkAccountLockout(handle) {
  const record = failedAttempts.get(handle);
  if (!record) return { locked: false };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { locked: true, remainingMin };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    failedAttempts.delete(handle);
  }
  return { locked: false };
}

function recordFailedAttempt(handle) {
  const record = failedAttempts.get(handle) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= LOCKOUT_THRESHOLD) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
    console.log(`🔒 Account locked: ${handle}`);
  }
  failedAttempts.set(handle, record);
}

function clearFailedAttempts(handle) {
  failedAttempts.delete(handle);
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

const sanitizeMessageOptions = {
  allowedTags: ['img', 'a', 'br', 'p', 'strong', 'em', 'code', 'pre'],
  allowedAttributes: {
    'img': ['src', 'alt', 'width', 'height', 'class'],
    'a': ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'data'], // Allow data URIs for emojis
  allowedSchemesByTag: {
    img: ['http', 'https', 'data']
  },
  transformTags: {
    'a': (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
    }),
    'img': (tagName, attribs) => {
      // Check if it's a GIF - load eagerly so animation plays immediately
      const src = attribs.src || '';
      const isGif = src.match(/\.gif(\?|$)/i) ||
                    src.match(/(giphy\.com|tenor\.com)/i);

      return {
        tagName: 'img',
        attribs: {
          ...attribs,
          style: 'max-width: 100%; height: auto;',
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
  // First, auto-link plain URLs (that aren't already in HTML tags)
  // This regex avoids matching URLs inside existing HTML tags
  const urlRegex = /(?<!["'>])(https?:\/\/[^\s<]+)(?![^<]*>|[^<>]*<\/)/gi;

  // Track which URLs are images to embed them
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/i;
  const imageHosts = /(media\.giphy\.com|i\.giphy\.com|media\.tenor\.com|c\.tenor\.com)/i;

  content = content.replace(urlRegex, (match) => {
    // Check if this URL should be embedded as an image
    if (imageExtensions.test(match) || imageHosts.test(match)) {
      return `<img src="${match}" alt="Embedded media" />`;
    }
    // Otherwise, make it a clickable link
    return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });

  return content;
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
    this.waves = { waves: [], participants: [] };
    this.messages = { messages: [], history: [] };
    this.groups = { groups: [], members: [] };
    this.handleRequests = { requests: [] };
    this.reports = { reports: [] };
    this.moderation = { blocks: [], mutes: [] };
    this.contactRequests = { requests: [] };
    this.groupInvitations = { invitations: [] };
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
    
    const hasData = fs.existsSync(DATA_FILES.users);
    
    if (hasData) {
      this.users = this.loadFile(DATA_FILES.users, { users: [], contacts: [] });
      this.waves = this.loadFile(DATA_FILES.waves, { waves: [], participants: [] });
      this.messages = this.loadFile(DATA_FILES.messages, { messages: [], history: [] });
      this.groups = this.loadFile(DATA_FILES.groups, { groups: [], members: [] });
      this.handleRequests = this.loadFile(DATA_FILES.handleRequests, { requests: [] });
      this.reports = this.loadFile(DATA_FILES.reports, { reports: [] });
      this.moderation = this.loadFile(DATA_FILES.moderation, { blocks: [], mutes: [] });
      this.contactRequests = this.loadFile(DATA_FILES.contactRequests, { requests: [] });
      this.groupInvitations = this.loadFile(DATA_FILES.groupInvitations, { invitations: [] });
      console.log('📂 Loaded data from separated files');
    } else {
      if (process.env.SEED_DEMO_DATA === 'true') {
        this.seedDemoData();
      } else {
        this.initEmpty();
      }
    }
  }

  saveAll() {
    this.saveFile(DATA_FILES.users, this.users);
    this.saveFile(DATA_FILES.waves, this.waves);
    this.saveFile(DATA_FILES.messages, this.messages);
    this.saveFile(DATA_FILES.groups, this.groups);
    this.saveFile(DATA_FILES.handleRequests, this.handleRequests);
    this.saveFile(DATA_FILES.reports, this.reports);
    this.saveFile(DATA_FILES.moderation, this.moderation);
    this.saveFile(DATA_FILES.contactRequests, this.contactRequests);
    this.saveFile(DATA_FILES.groupInvitations, this.groupInvitations);
  }

  saveUsers() { this.saveFile(DATA_FILES.users, this.users); }
  saveWaves() { this.saveFile(DATA_FILES.waves, this.waves); }
  saveMessages() { this.saveFile(DATA_FILES.messages, this.messages); }
  saveGroups() { this.saveFile(DATA_FILES.groups, this.groups); }
  saveHandleRequests() { this.saveFile(DATA_FILES.handleRequests, this.handleRequests); }
  saveReports() { this.saveFile(DATA_FILES.reports, this.reports); }
  saveContactRequests() { this.saveFile(DATA_FILES.contactRequests, this.contactRequests); }
  saveGroupInvitations() { this.saveFile(DATA_FILES.groupInvitations, this.groupInvitations); }
  saveModeration() { this.saveFile(DATA_FILES.moderation, this.moderation); }

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
      { id: 'user-mal', handle: 'mal', email: 'mal@serenity.ship', displayName: 'Malcolm Reynolds', avatar: 'M', nodeName: 'Serenity', status: 'offline', isAdmin: true },
      { id: 'user-zoe', handle: 'zoe', email: 'zoe@serenity.ship', displayName: 'Zoe Washburne', avatar: 'Z', nodeName: 'Serenity', status: 'offline', isAdmin: false },
      { id: 'user-wash', handle: 'wash', email: 'wash@serenity.ship', displayName: 'Hoban Washburne', avatar: 'W', nodeName: 'Serenity', status: 'offline', isAdmin: false },
      { id: 'user-kaylee', handle: 'kaylee', email: 'kaylee@serenity.ship', displayName: 'Kaylee Frye', avatar: 'K', nodeName: 'Serenity', status: 'offline', isAdmin: false },
      { id: 'user-jayne', handle: 'jayne', email: 'jayne@serenity.ship', displayName: 'Jayne Cobb', avatar: 'J', nodeName: 'Serenity', status: 'offline', isAdmin: false },
    ];

    this.users.users = demoUsers.map(u => ({ 
      ...u, 
      passwordHash, 
      createdAt: now, 
      lastSeen: now,
      handleHistory: [],
      lastHandleChange: null,
    }));
    
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

    // Demo waves with different privacy levels
    this.waves.waves = [
      { id: 'wave-1', title: 'Welcome to Cortex', privacy: 'public', createdBy: 'user-mal', createdAt: now, updatedAt: now },
      { id: 'wave-2', title: 'Private Chat Test', privacy: 'private', createdBy: 'user-mal', createdAt: now, updatedAt: now },
      { id: 'wave-3', title: 'Crew Discussion', privacy: 'group', groupId: 'group-crew', createdBy: 'user-mal', createdAt: now, updatedAt: now },
      { id: 'wave-4', title: 'Zoe Private Wave', privacy: 'private', createdBy: 'user-zoe', createdAt: now, updatedAt: now },
      { id: 'wave-5', title: 'Wash Public Wave', privacy: 'public', createdBy: 'user-wash', createdAt: now, updatedAt: now },
    ];
    this.waves.participants = [
      { waveId: 'wave-1', userId: 'user-mal', joinedAt: now, archived: false },
      { waveId: 'wave-2', userId: 'user-mal', joinedAt: now, archived: false },
      { waveId: 'wave-2', userId: 'user-zoe', joinedAt: now, archived: false },
      { waveId: 'wave-3', userId: 'user-mal', joinedAt: now, archived: false },
      { waveId: 'wave-3', userId: 'user-zoe', joinedAt: now, archived: false },
      { waveId: 'wave-3', userId: 'user-wash', joinedAt: now, archived: false },
      { waveId: 'wave-4', userId: 'user-zoe', joinedAt: now, archived: false },
      { waveId: 'wave-4', userId: 'user-mal', joinedAt: now, archived: false },
      { waveId: 'wave-5', userId: 'user-wash', joinedAt: now, archived: false },
    ];

    this.messages.messages = [
      { id: 'msg-1', waveId: 'wave-1', parentId: null, authorId: 'user-mal', content: 'Welcome to Cortex! This is a public wave visible to everyone.', privacy: 'public', version: 1, createdAt: now, editedAt: null },
      { id: 'msg-2', waveId: 'wave-2', parentId: null, authorId: 'user-mal', content: 'This is a private wave for testing.', privacy: 'private', version: 1, createdAt: now, editedAt: null },
      { id: 'msg-3', waveId: 'wave-3', parentId: null, authorId: 'user-mal', content: 'This is a group wave for the crew.', privacy: 'group', version: 1, createdAt: now, editedAt: null },
      { id: 'msg-4', waveId: 'wave-4', parentId: null, authorId: 'user-zoe', content: 'Zoe\'s private wave.', privacy: 'private', version: 1, createdAt: now, editedAt: null },
      { id: 'msg-5', waveId: 'wave-5', parentId: null, authorId: 'user-wash', content: 'Wash\'s public wave.', privacy: 'public', version: 1, createdAt: now, editedAt: null },
    ];

    this.saveAll();
    console.log('✅ Demo data seeded (password: Demo123!)');
  }

  // === User Methods ===
  findUserByHandle(handle) {
    const sanitized = sanitizeInput(handle)?.toLowerCase();
    return this.users.users.find(u => 
      u.handle.toLowerCase() === sanitized || 
      u.email.toLowerCase() === sanitized
    );
  }

  findUserById(id) {
    return this.users.users.find(u => u.id === id);
  }

  createUser(userData) {
    const user = {
      ...userData,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      handleHistory: [],
      lastHandleChange: null,
      isAdmin: this.users.users.length === 0, // First user is admin
      preferences: { theme: 'firefly', fontSize: 'medium' },
      bio: null, // About me section (max 500 chars)
      avatarUrl: null, // Profile image URL
    };
    this.users.users.push(user);
    this.saveUsers();
    return user;
  }

  updateUser(userId, updates) {
    const user = this.findUserById(userId);
    if (!user) return null;
    Object.assign(user, updates);
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

  async changePassword(userId, currentPassword, newPassword) {
    const user = this.findUserById(userId);
    if (!user) return { success: false, error: 'User not found' };
    
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return { success: false, error: 'Current password is incorrect' };
    
    const errors = validatePassword(newPassword);
    if (errors.length > 0) return { success: false, error: errors.join('. ') };
    
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    this.saveUsers();
    return { success: true };
  }

  requestHandleChange(userId, newHandle) {
    const user = this.findUserById(userId);
    if (!user) return { success: false, error: 'User not found' };
    
    // Check if handle is taken
    const existing = this.users.users.find(u => 
      u.handle.toLowerCase() === newHandle.toLowerCase() && u.id !== userId
    );
    if (existing) return { success: false, error: 'Handle is already taken' };
    
    // Check cooldown (30 days)
    if (user.lastHandleChange) {
      const daysSince = (Date.now() - new Date(user.lastHandleChange).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return { success: false, error: `You can change your handle again in ${Math.ceil(30 - daysSince)} days` };
      }
    }
    
    // Check if handle was recently used by someone else
    const recentlyUsed = this.users.users.some(u => 
      u.handleHistory?.some(h => 
        h.handle.toLowerCase() === newHandle.toLowerCase() &&
        (Date.now() - new Date(h.changedAt).getTime()) < 90 * 24 * 60 * 60 * 1000
      )
    );
    if (recentlyUsed) return { success: false, error: 'This handle was recently used and is reserved for 90 days' };
    
    // Create request
    const request = {
      id: `req-${uuidv4()}`,
      userId,
      currentHandle: user.handle,
      newHandle: sanitizeInput(newHandle),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.handleRequests.requests.push(request);
    this.saveHandleRequests();
    
    return { success: true, request };
  }

  approveHandleChange(requestId, adminId) {
    const admin = this.findUserById(adminId);
    if (!admin?.isAdmin) return { success: false, error: 'Not authorized' };
    
    const request = this.handleRequests.requests.find(r => r.id === requestId);
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Request not found or already processed' };
    }
    
    const user = this.findUserById(request.userId);
    if (!user) return { success: false, error: 'User not found' };
    
    // Store old handle in history
    if (!user.handleHistory) user.handleHistory = [];
    user.handleHistory.push({ handle: user.handle, changedAt: new Date().toISOString() });
    
    // Update handle
    user.handle = request.newHandle;
    user.lastHandleChange = new Date().toISOString();
    
    request.status = 'approved';
    request.processedAt = new Date().toISOString();
    request.processedBy = adminId;
    
    this.saveUsers();
    this.saveHandleRequests();
    
    return { success: true };
  }

  rejectHandleChange(requestId, adminId, reason) {
    const admin = this.findUserById(adminId);
    if (!admin?.isAdmin) return { success: false, error: 'Not authorized' };
    
    const request = this.handleRequests.requests.find(r => r.id === requestId);
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Request not found or already processed' };
    }
    
    request.status = 'rejected';
    request.reason = reason;
    request.processedAt = new Date().toISOString();
    request.processedBy = adminId;
    
    this.saveHandleRequests();
    return { success: true };
  }

  searchUsers(query, excludeUserId) {
    if (!query || query.length < 2) return [];
    const lowerQuery = query.toLowerCase();
    return this.users.users
      .filter(u => u.id !== excludeUserId &&
        (u.handle.toLowerCase().includes(lowerQuery) ||
         u.displayName.toLowerCase().includes(lowerQuery)))
      .slice(0, 10)
      .map(u => ({
        id: u.id, handle: u.handle, displayName: u.displayName,
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
          id: contact.id, handle: contact.handle, name: contact.displayName,
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

  isContact(userId, contactId) {
    return this.users.contacts.some(c => c.userId === userId && c.contactId === contactId);
  }

  // === Contact Request Methods ===
  createContactRequest(fromUserId, toUserId, message = null) {
    // Validate users exist
    const fromUser = this.findUserById(fromUserId);
    const toUser = this.findUserById(toUserId);
    if (!fromUser || !toUser) return { error: 'User not found' };

    // Can't request yourself
    if (fromUserId === toUserId) return { error: 'Cannot add yourself as a contact' };

    // Check if already contacts
    if (this.isContact(fromUserId, toUserId)) return { error: 'Already a contact' };

    // Check if blocked
    if (this.isBlocked(toUserId, fromUserId)) return { error: 'Cannot send request to this user' };

    // Check for existing pending request (either direction)
    const existingRequest = this.contactRequests.requests.find(r =>
      r.status === 'pending' && (
        (r.from_user_id === fromUserId && r.to_user_id === toUserId) ||
        (r.from_user_id === toUserId && r.to_user_id === fromUserId)
      )
    );
    if (existingRequest) {
      if (existingRequest.from_user_id === fromUserId) {
        return { error: 'Request already pending' };
      } else {
        return { error: 'This user has already sent you a request' };
      }
    }

    const request = {
      id: uuidv4(),
      from_user_id: fromUserId,
      to_user_id: toUserId,
      message: message ? sanitizeInput(message) : null,
      status: 'pending',
      created_at: new Date().toISOString(),
      responded_at: null
    };

    this.contactRequests.requests.push(request);
    this.saveContactRequests();

    // Return enriched request with user info
    return {
      ...request,
      from_user: { id: fromUser.id, handle: fromUser.handle, displayName: fromUser.displayName, avatar: fromUser.avatar },
      to_user: { id: toUser.id, handle: toUser.handle, displayName: toUser.displayName, avatar: toUser.avatar }
    };
  }

  getContactRequestsForUser(userId) {
    // Get pending requests received by this user
    return this.contactRequests.requests
      .filter(r => r.to_user_id === userId && r.status === 'pending')
      .map(r => {
        const fromUser = this.findUserById(r.from_user_id);
        return {
          ...r,
          from_user: fromUser ? {
            id: fromUser.id,
            handle: fromUser.handle,
            displayName: fromUser.displayName,
            avatar: fromUser.avatar
          } : null
        };
      });
  }

  getSentContactRequests(userId) {
    // Get pending requests sent by this user
    return this.contactRequests.requests
      .filter(r => r.from_user_id === userId && r.status === 'pending')
      .map(r => {
        const toUser = this.findUserById(r.to_user_id);
        return {
          ...r,
          to_user: toUser ? {
            id: toUser.id,
            handle: toUser.handle,
            displayName: toUser.displayName,
            avatar: toUser.avatar
          } : null
        };
      });
  }

  getContactRequest(requestId) {
    return this.contactRequests.requests.find(r => r.id === requestId);
  }

  acceptContactRequest(requestId, userId) {
    const request = this.getContactRequest(requestId);
    if (!request) return { error: 'Request not found' };
    if (request.to_user_id !== userId) return { error: 'Not authorized' };
    if (request.status !== 'pending') return { error: 'Request already processed' };

    // Update request status
    request.status = 'accepted';
    request.responded_at = new Date().toISOString();

    // Create mutual contact relationship
    this.addContact(request.from_user_id, request.to_user_id);
    this.addContact(request.to_user_id, request.from_user_id);

    this.saveContactRequests();

    return { success: true, request };
  }

  declineContactRequest(requestId, userId) {
    const request = this.getContactRequest(requestId);
    if (!request) return { error: 'Request not found' };
    if (request.to_user_id !== userId) return { error: 'Not authorized' };
    if (request.status !== 'pending') return { error: 'Request already processed' };

    request.status = 'declined';
    request.responded_at = new Date().toISOString();
    this.saveContactRequests();

    return { success: true, request };
  }

  cancelContactRequest(requestId, userId) {
    const request = this.getContactRequest(requestId);
    if (!request) return { error: 'Request not found' };
    if (request.from_user_id !== userId) return { error: 'Not authorized' };
    if (request.status !== 'pending') return { error: 'Request already processed' };

    // Remove the request entirely
    const index = this.contactRequests.requests.findIndex(r => r.id === requestId);
    if (index !== -1) {
      this.contactRequests.requests.splice(index, 1);
      this.saveContactRequests();
    }

    return { success: true };
  }

  // Check if there's a pending request between two users
  getPendingRequestBetween(userId1, userId2) {
    return this.contactRequests.requests.find(r =>
      r.status === 'pending' && (
        (r.from_user_id === userId1 && r.to_user_id === userId2) ||
        (r.from_user_id === userId2 && r.to_user_id === userId1)
      )
    );
  }

  // === Group Invitation Methods ===
  createGroupInvitation(groupId, invitedBy, invitedUserId, message = null) {
    // Validate group exists
    const group = this.getGroup(groupId);
    if (!group) return { error: 'Group not found' };

    // Validate users exist
    const inviter = this.findUserById(invitedBy);
    const invitee = this.findUserById(invitedUserId);
    if (!inviter || !invitee) return { error: 'User not found' };

    // Can't invite yourself
    if (invitedBy === invitedUserId) return { error: 'Cannot invite yourself' };

    // Check if inviter is a group member
    if (!this.isGroupMember(groupId, invitedBy)) {
      return { error: 'Only group members can invite others' };
    }

    // Check if invitee is already a member
    if (this.isGroupMember(groupId, invitedUserId)) {
      return { error: 'User is already a group member' };
    }

    // Check if blocked
    if (this.isBlocked(invitedUserId, invitedBy)) {
      return { error: 'Cannot invite this user' };
    }

    // Check for existing pending invitation
    const existingInvitation = this.groupInvitations.invitations.find(i =>
      i.group_id === groupId &&
      i.invited_user_id === invitedUserId &&
      i.status === 'pending'
    );
    if (existingInvitation) {
      return { error: 'Invitation already pending for this user' };
    }

    const invitation = {
      id: uuidv4(),
      group_id: groupId,
      invited_by: invitedBy,
      invited_user_id: invitedUserId,
      message: message ? sanitizeInput(message) : null,
      status: 'pending',
      created_at: new Date().toISOString(),
      responded_at: null
    };

    this.groupInvitations.invitations.push(invitation);
    this.saveGroupInvitations();

    // Return enriched invitation with group and user info
    return {
      ...invitation,
      group: { id: group.id, name: group.name },
      invited_by_user: { id: inviter.id, handle: inviter.handle, displayName: inviter.displayName, avatar: inviter.avatar },
      invited_user: { id: invitee.id, handle: invitee.handle, displayName: invitee.displayName, avatar: invitee.avatar }
    };
  }

  getGroupInvitationsForUser(userId) {
    // Get pending invitations received by this user
    return this.groupInvitations.invitations
      .filter(i => i.invited_user_id === userId && i.status === 'pending')
      .map(i => {
        const group = this.getGroup(i.group_id);
        const inviter = this.findUserById(i.invited_by);
        return {
          ...i,
          group: group ? { id: group.id, name: group.name, description: group.description } : null,
          invited_by_user: inviter ? {
            id: inviter.id,
            handle: inviter.handle,
            displayName: inviter.displayName,
            avatar: inviter.avatar
          } : null
        };
      });
  }

  getGroupInvitationsSent(groupId, userId) {
    // Get pending invitations sent by this user for a specific group
    return this.groupInvitations.invitations
      .filter(i => i.group_id === groupId && i.invited_by === userId && i.status === 'pending')
      .map(i => {
        const invitee = this.findUserById(i.invited_user_id);
        return {
          ...i,
          invited_user: invitee ? {
            id: invitee.id,
            handle: invitee.handle,
            displayName: invitee.displayName,
            avatar: invitee.avatar
          } : null
        };
      });
  }

  getGroupInvitation(invitationId) {
    return this.groupInvitations.invitations.find(i => i.id === invitationId);
  }

  acceptGroupInvitation(invitationId, userId) {
    const invitation = this.getGroupInvitation(invitationId);
    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.invited_user_id !== userId) return { error: 'Not authorized' };
    if (invitation.status !== 'pending') return { error: 'Invitation already processed' };

    // Double-check user isn't already a member
    if (this.isGroupMember(invitation.group_id, userId)) {
      invitation.status = 'accepted';
      invitation.responded_at = new Date().toISOString();
      this.saveGroupInvitations();
      return { error: 'Already a group member' };
    }

    // Update invitation status
    invitation.status = 'accepted';
    invitation.responded_at = new Date().toISOString();

    // Add user to group as member
    this.addGroupMember(invitation.group_id, userId, 'member');

    this.saveGroupInvitations();

    const group = this.getGroup(invitation.group_id);
    return {
      success: true,
      invitation,
      group: group ? { id: group.id, name: group.name } : null
    };
  }

  declineGroupInvitation(invitationId, userId) {
    const invitation = this.getGroupInvitation(invitationId);
    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.invited_user_id !== userId) return { error: 'Not authorized' };
    if (invitation.status !== 'pending') return { error: 'Invitation already processed' };

    invitation.status = 'declined';
    invitation.responded_at = new Date().toISOString();
    this.saveGroupInvitations();

    return { success: true, invitation };
  }

  cancelGroupInvitation(invitationId, userId) {
    const invitation = this.getGroupInvitation(invitationId);
    if (!invitation) return { error: 'Invitation not found' };
    if (invitation.invited_by !== userId) return { error: 'Not authorized' };
    if (invitation.status !== 'pending') return { error: 'Invitation already processed' };

    // Remove the invitation entirely
    const index = this.groupInvitations.invitations.findIndex(i => i.id === invitationId);
    if (index !== -1) {
      this.groupInvitations.invitations.splice(index, 1);
      this.saveGroupInvitations();
    }

    return { success: true };
  }

  // === Moderation Methods ===
  blockUser(userId, blockedUserId) {
    const user = this.findUserById(userId);
    const blockedUser = this.findUserById(blockedUserId);
    if (!user || !blockedUser) return false;

    const existing = this.moderation.blocks.find(
      b => b.userId === userId && b.blockedUserId === blockedUserId
    );
    if (existing) return false;

    this.moderation.blocks.push({
      id: uuidv4(),
      userId,
      blockedUserId,
      blockedAt: new Date().toISOString()
    });

    this.saveModeration();
    return true;
  }

  unblockUser(userId, blockedUserId) {
    const index = this.moderation.blocks.findIndex(
      b => b.userId === userId && b.blockedUserId === blockedUserId
    );
    if (index === -1) return false;

    this.moderation.blocks.splice(index, 1);
    this.saveModeration();
    return true;
  }

  getBlockedUsers(userId) {
    return this.moderation.blocks
      .filter(b => b.userId === userId)
      .map(b => {
        const user = this.findUserById(b.blockedUserId);
        return {
          ...b,
          handle: user?.handle,
          displayName: user?.displayName
        };
      });
  }

  isBlocked(userId, otherUserId) {
    return this.moderation.blocks.some(
      b => (b.userId === userId && b.blockedUserId === otherUserId) ||
           (b.userId === otherUserId && b.blockedUserId === userId)
    );
  }

  muteUser(userId, mutedUserId) {
    const user = this.findUserById(userId);
    const mutedUser = this.findUserById(mutedUserId);
    if (!user || !mutedUser) return false;

    const existing = this.moderation.mutes.find(
      m => m.userId === userId && m.mutedUserId === mutedUserId
    );
    if (existing) return false;

    this.moderation.mutes.push({
      id: uuidv4(),
      userId,
      mutedUserId,
      mutedAt: new Date().toISOString()
    });

    this.saveModeration();
    return true;
  }

  unmuteUser(userId, mutedUserId) {
    const index = this.moderation.mutes.findIndex(
      m => m.userId === userId && m.mutedUserId === mutedUserId
    );
    if (index === -1) return false;

    this.moderation.mutes.splice(index, 1);
    this.saveModeration();
    return true;
  }

  getMutedUsers(userId) {
    return this.moderation.mutes
      .filter(m => m.userId === userId)
      .map(m => {
        const user = this.findUserById(m.mutedUserId);
        return {
          ...m,
          handle: user?.handle,
          displayName: user?.displayName
        };
      });
  }

  isMuted(userId, otherUserId) {
    return this.moderation.mutes.some(
      m => m.userId === userId && m.mutedUserId === otherUserId
    );
  }

  createReport(data) {
    const report = {
      id: uuidv4(),
      reporterId: data.reporterId,
      type: data.type, // 'message' | 'wave' | 'user'
      targetId: data.targetId,
      reason: data.reason, // 'spam' | 'harassment' | 'inappropriate' | 'other'
      details: data.details || '',
      status: 'pending', // 'pending' | 'resolved' | 'dismissed'
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null
    };

    this.reports.reports.push(report);
    this.saveReports();
    return report;
  }

  getReports(filters = {}) {
    let reports = this.reports.reports;

    if (filters.status) {
      reports = reports.filter(r => r.status === filters.status);
    }

    if (filters.type) {
      reports = reports.filter(r => r.type === filters.type);
    }

    // Enrich with context
    return reports.map(r => {
      const reporter = this.findUserById(r.reporterId);
      let context = {};

      if (r.type === 'message') {
        const msg = this.messages.messages.find(m => m.id === r.targetId);
        if (msg) {
          const author = this.findUserById(msg.authorId);
          context = {
            content: msg.content,
            authorHandle: author?.handle,
            authorName: author?.displayName,
            createdAt: msg.createdAt
          };
        }
      } else if (r.type === 'wave') {
        const wave = this.getWave(r.targetId);
        if (wave) {
          context = {
            title: wave.title,
            privacy: wave.privacy
          };
        }
      } else if (r.type === 'user') {
        const user = this.findUserById(r.targetId);
        if (user) {
          context = {
            handle: user.handle,
            displayName: user.displayName
          };
        }
      }

      return {
        ...r,
        reporterHandle: reporter?.handle,
        reporterName: reporter?.displayName,
        context
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  resolveReport(reportId, resolution, userId) {
    const report = this.reports.reports.find(r => r.id === reportId);
    if (!report) return false;

    report.status = resolution === 'dismiss' ? 'dismissed' : 'resolved';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = userId;
    report.resolution = resolution;

    this.saveReports();
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
          id: user.id, handle: user.handle, name: user.displayName,
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

    // Clean up: remove user from participants of all waves belonging to this group
    const groupWaveIds = this.waves.waves
      .filter(w => w.privacy === 'group' && w.groupId === groupId)
      .map(w => w.id);

    if (groupWaveIds.length > 0) {
      const beforeCount = this.waves.participants.length;
      this.waves.participants = this.waves.participants.filter(
        p => !(groupWaveIds.includes(p.waveId) && p.userId === userId)
      );
      if (this.waves.participants.length < beforeCount) {
        this.saveWaves();
      }
    }

    return true;
  }

  updateGroupMemberRole(groupId, userId, role) {
    const member = this.groups.members.find(m => m.groupId === groupId && m.userId === userId);
    if (!member) return false;
    member.role = role;
    this.saveGroups();
    return true;
  }

  // === Wave Methods ===
  getWavesForUser(userId, includeArchived = false) {
    const participantWaveIds = this.waves.participants
      .filter(p => p.userId === userId && (includeArchived || !p.archived))
      .map(p => p.waveId);

    // Get user's groups
    const userGroupIds = this.groups.members
      .filter(m => m.userId === userId)
      .map(m => m.groupId);

    return this.waves.waves
      .filter(w => {
        // Public waves - always accessible
        if (w.privacy === 'public') return true;

        // Group waves - MUST be a current group member (participant status alone is not enough)
        if (w.privacy === 'group' && w.groupId) {
          return userGroupIds.includes(w.groupId);
        }

        // Private waves - must be an explicit participant
        return participantWaveIds.includes(w.id);
      })
      .map(wave => {
        const creator = this.findUserById(wave.createdBy);
        const participants = this.getWaveParticipants(wave.id);
        const messageCount = this.messages.messages.filter(m => m.waveId === wave.id).length;
        const group = wave.groupId ? this.getGroup(wave.groupId) : null;
        const userParticipant = this.waves.participants.find(p => p.waveId === wave.id && p.userId === userId);

        // Calculate unread count based on messages not read by user
        // Must match visibility logic from getMessagesForWave to prevent phantom unreads
        const blockedIds = this.moderation.blocks
          .filter(b => b.userId === userId)
          .map(b => b.blockedUserId);
        const mutedIds = this.moderation.mutes
          .filter(m => m.userId === userId)
          .map(m => m.mutedUserId);

        const unreadCount = this.messages.messages.filter(m => {
          if (m.waveId !== wave.id) return false;
          if (m.deleted) return false; // Deleted messages have no content to read
          if (m.authorId === userId) return false; // Don't count own messages
          // Exclude blocked/muted users (they won't see these messages)
          if (blockedIds.includes(m.authorId) || mutedIds.includes(m.authorId)) return false;
          // Check if user has read this message
          const readBy = m.readBy || [m.authorId];
          return !readBy.includes(userId);
        }).length;

        return {
          ...wave,
          creator_name: creator?.displayName || 'Unknown',
          creator_avatar: creator?.avatar || '?',
          creator_handle: creator?.handle || 'unknown',
          participants,
          message_count: messageCount,
          unread_count: unreadCount,
          is_participant: participantWaveIds.includes(wave.id),
          is_archived: userParticipant?.archived || false,
          group_name: group?.name,
        };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getWave(waveId) {
    return this.waves.waves.find(w => w.id === waveId);
  }

  getWaveParticipants(waveId) {
    return this.waves.participants
      .filter(p => p.waveId === waveId)
      .map(p => {
        const user = this.findUserById(p.userId);
        return user ? { id: user.id, name: user.displayName, avatar: user.avatar, status: user.status, handle: user.handle } : null;
      })
      .filter(Boolean);
  }

  canAccessWave(waveId, userId) {
    const wave = this.getWave(waveId);
    if (!wave) return false;

    // Public waves are accessible to all
    if (wave.privacy === 'public') return true;

    // Group waves - MUST be a current group member (participant status alone is not enough)
    if (wave.privacy === 'group' && wave.groupId) {
      return this.isGroupMember(wave.groupId, userId);
    }

    // Private waves - check if explicit participant
    if (this.waves.participants.some(p => p.waveId === waveId && p.userId === userId)) {
      return true;
    }
    
    return false;
  }

  createWave(data) {
    const now = new Date().toISOString();
    const wave = {
      id: `wave-${uuidv4()}`,
      title: sanitizeInput(data.title).slice(0, 200),
      privacy: data.privacy || 'private',
      groupId: data.groupId || null,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.waves.waves.push(wave);

    // Add creator as participant
    this.waves.participants.push({ waveId: wave.id, userId: data.createdBy, joinedAt: now, archived: false });

    // Add other participants
    if (data.participants) {
      for (const userId of data.participants) {
        if (userId !== data.createdBy) {
          this.waves.participants.push({ waveId: wave.id, userId, joinedAt: now, archived: false });
        }
      }
    }

    this.saveWaves();
    return wave;
  }

  updateWavePrivacy(waveId, privacy, groupId = null) {
    const wave = this.getWave(waveId);
    if (!wave) return null;
    
    wave.privacy = privacy;
    wave.groupId = privacy === 'group' ? groupId : null;
    wave.updatedAt = new Date().toISOString();
    
    this.saveWaves();
    return wave;
  }

  updateWaveTimestamp(waveId) {
    const wave = this.getWave(waveId);
    if (wave) {
      wave.updatedAt = new Date().toISOString();
      this.saveWaves();
    }
  }

  addWaveParticipant(waveId, userId) {
    const existing = this.waves.participants.find(p => p.waveId === waveId && p.userId === userId);
    if (existing) return false;
    this.waves.participants.push({ waveId, userId, joinedAt: new Date().toISOString(), archived: false });
    this.saveWaves();
    return true;
  }

  archiveWaveForUser(waveId, userId, archived = true) {
    const participant = this.waves.participants.find(p => p.waveId === waveId && p.userId === userId);
    if (!participant) return false;
    participant.archived = archived;
    this.saveWaves();
    return true;
  }

  markWaveAsRead(waveId, userId) {
    let participant = this.waves.participants.find(p => p.waveId === waveId && p.userId === userId);

    // If user is not a participant yet but can access (public/group wave), add them
    if (!participant && this.canAccessWave(waveId, userId)) {
      this.addWaveParticipant(waveId, userId);
      participant = this.waves.participants.find(p => p.waveId === waveId && p.userId === userId);
    }

    if (!participant) return false;

    participant.lastRead = new Date().toISOString();
    this.saveWaves();
    return true;
  }

  deleteWave(waveId, userId) {
    const wave = this.getWave(waveId);
    if (!wave) return { success: false, error: 'Wave not found' };
    if (wave.createdBy !== userId) return { success: false, error: 'Only wave creator can delete' };

    // Get all participants before deletion for notification
    const participants = this.getWaveParticipants(waveId);

    // Delete wave
    this.waves.waves = this.waves.waves.filter(w => w.id !== waveId);

    // Delete participants
    this.waves.participants = this.waves.participants.filter(p => p.waveId !== waveId);

    // Delete messages
    this.messages.messages = this.messages.messages.filter(m => m.waveId !== waveId);

    // Delete message history for this wave
    const messageIds = this.messages.messages.filter(m => m.waveId === waveId).map(m => m.id);
    this.messages.history = this.messages.history.filter(h => !messageIds.includes(h.messageId));

    this.saveWaves();
    this.saveMessages();

    return { success: true, wave, participants };
  }

  // === Message Methods ===
  getMessagesForWave(waveId, userId = null) {
    let messages = this.messages.messages.filter(m => m.waveId === waveId);

    // Filter out messages from blocked or muted users
    if (userId) {
      const blockedIds = this.moderation.blocks
        .filter(b => b.userId === userId)
        .map(b => b.blockedUserId);

      const mutedIds = this.moderation.mutes
        .filter(m => m.userId === userId)
        .map(m => m.mutedUserId);

      messages = messages.filter(m =>
        !blockedIds.includes(m.authorId) && !mutedIds.includes(m.authorId)
      );
    }

    return messages
      .map(m => {
        const author = this.findUserById(m.authorId);
        const readBy = m.readBy || [m.authorId];
        // Deleted messages are never unread (nothing to read)
        const isUnread = m.deleted ? false : (userId ? !readBy.includes(userId) && m.authorId !== userId : false);

        return {
          ...m,
          sender_name: author?.displayName || 'Unknown',
          sender_avatar: author?.avatar || '?',
          sender_avatar_url: author?.avatarUrl || null,
          sender_handle: author?.handle || 'unknown',
          author_id: m.authorId,
          parent_id: m.parentId,
          wave_id: m.waveId,
          created_at: m.createdAt,
          edited_at: m.editedAt,
          deleted_at: m.deletedAt || null,
          is_unread: isUnread,
        };
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  createMessage(data) {
    const now = new Date().toISOString();
    let content = sanitizeMessage(data.content);
    content = detectAndEmbedMedia(content); // Auto-embed media URLs

    const message = {
      id: `msg-${uuidv4()}`,
      waveId: data.waveId,
      parentId: data.parentId || null,
      authorId: data.authorId,
      content: content,
      privacy: data.privacy || 'private',
      version: 1,
      createdAt: now,
      editedAt: null,
      reactions: {}, // { emoji: [userId1, userId2, ...] }
      readBy: [data.authorId], // Author has read their own message
    };
    this.messages.messages.push(message);
    this.updateWaveTimestamp(data.waveId);
    this.saveMessages();

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
    const message = this.messages.messages.find(m => m.id === messageId);
    if (!message) return null;
    if (message.deleted) return null; // Cannot edit deleted messages

    this.messages.history.push({
      id: `hist-${uuidv4()}`,
      messageId,
      content: message.content,
      version: message.version,
      editedAt: new Date().toISOString(),
    });

    // Sanitize and auto-embed media URLs (same as createMessage)
    let processedContent = sanitizeMessage(content);
    processedContent = detectAndEmbedMedia(processedContent);

    message.content = processedContent;
    message.version += 1;
    message.editedAt = new Date().toISOString();
    this.saveMessages();

    const author = this.findUserById(message.authorId);
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

  deleteMessage(messageId, userId) {
    const message = this.messages.messages.find(m => m.id === messageId);
    if (!message) return { success: false, error: 'Message not found' };
    if (message.deleted) return { success: false, error: 'Message already deleted' };
    if (message.authorId !== userId) return { success: false, error: 'Only message author can delete' };

    const waveId = message.waveId;

    // Soft-delete: replace content with placeholder, preserve thread structure
    message.content = '[Message deleted]';
    message.deleted = true;
    message.deletedAt = new Date().toISOString();
    message.reactions = {};  // Clear reactions
    message.readBy = [];     // Clear read status (nothing to read)

    // Remove edit history for this message (no longer relevant)
    this.messages.history = this.messages.history.filter(h => h.messageId !== messageId);

    this.saveMessages();

    return { success: true, messageId, waveId, deleted: true };
  }

  toggleMessageReaction(messageId, userId, emoji) {
    const message = this.messages.messages.find(m => m.id === messageId);
    if (!message) return { success: false, error: 'Message not found' };
    if (message.deleted) return { success: false, error: 'Cannot react to deleted message' };

    // Initialize reactions if not present
    if (!message.reactions) message.reactions = {};

    // Initialize emoji array if not present
    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }

    // Check if user already reacted with this emoji
    const userIndex = message.reactions[emoji].indexOf(userId);
    if (userIndex > -1) {
      // Remove reaction
      message.reactions[emoji].splice(userIndex, 1);
      // Remove emoji key if no reactions left
      if (message.reactions[emoji].length === 0) {
        delete message.reactions[emoji];
      }
    } else {
      // Add reaction
      message.reactions[emoji].push(userId);
    }

    this.saveMessages();

    return { success: true, messageId, reactions: message.reactions, waveId: message.waveId };
  }

  markMessageAsRead(messageId, userId) {
    const message = this.messages.messages.find(m => m.id === messageId);
    if (!message) return false;
    if (message.deleted) return true; // Deleted messages are always "read" (nothing to read)

    // Initialize readBy array if it doesn't exist (for old messages)
    if (!message.readBy) {
      message.readBy = [message.authorId]; // Author always has read their message
    }

    // Add user to readBy if not already there
    if (!message.readBy.includes(userId)) {
      message.readBy.push(userId);
      this.saveMessages();
    }

    return true;
  }

  searchMessages(query, filters = {}) {
    const { waveId, authorId, fromDate, toDate } = filters;
    const searchTerm = query.toLowerCase().trim();

    if (!searchTerm) return [];

    let results = this.messages.messages.filter(message => {
      // Filter by search term in content
      if (!message.content.toLowerCase().includes(searchTerm)) {
        return false;
      }

      // Filter by wave
      if (waveId && message.waveId !== waveId) {
        return false;
      }

      // Filter by author
      if (authorId && message.authorId !== authorId) {
        return false;
      }

      // Filter by date range
      if (fromDate && new Date(message.createdAt) < new Date(fromDate)) {
        return false;
      }
      if (toDate && new Date(message.createdAt) > new Date(toDate)) {
        return false;
      }

      return true;
    });

    // Enrich results with author and wave info
    return results.map(message => {
      const author = this.findUserById(message.authorId);
      const wave = this.getWave(message.waveId);

      return {
        id: message.id,
        content: message.content,
        waveId: message.waveId,
        waveName: wave?.name || 'Unknown Wave',
        authorId: message.authorId,
        authorName: author?.displayName || 'Unknown',
        authorHandle: author?.handle || 'unknown',
        createdAt: message.createdAt,
        parentId: message.parentId,
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Most recent first
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

// Serve uploaded files (avatars, etc.) with cross-origin headers for dev mode
app.use('/uploads', (req, res, next) => {
  // Allow cross-origin access for images (needed when client runs on different port)
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(UPLOADS_DIR));

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
    const handle = sanitizeInput(req.body.handle || req.body.username);
    const email = sanitizeInput(req.body.email);
    const password = req.body.password;
    const displayName = sanitizeInput(req.body.displayName);

    if (!handle || !email || !password) {
      return res.status(400).json({ error: 'Handle, email and password are required' });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
      return res.status(400).json({ error: 'Handle must be 3-20 characters, letters/numbers/underscores only' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: passwordErrors.join('. ') });
    }

    const existing = db.findUserByHandle(handle) || db.findUserByHandle(email);
    if (existing) {
      return res.status(409).json({ error: 'Handle or email already exists' });
    }

    const id = `user-${uuidv4()}`;
    const passwordHash = await bcrypt.hash(password, 12);
    const avatar = (displayName || handle)[0].toUpperCase();

    const user = db.createUser({
      id, handle: handle.toLowerCase(), email: email.toLowerCase(),
      passwordHash, displayName: displayName || handle, avatar,
      nodeName: 'Local', status: 'online',
    });

    const token = jwt.sign({ userId: id, handle: user.handle }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`✅ New user registered: ${handle}`);

    res.status(201).json({
      token,
      user: { id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, bio: user.bio || null, nodeName: user.nodeName, status: user.status, isAdmin: user.isAdmin, preferences: user.preferences || { theme: 'firefly', fontSize: 'medium' } },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const handle = sanitizeInput(req.body.handle || req.body.username);
    const password = req.body.password;

    if (!handle || !password) {
      return res.status(400).json({ error: 'Handle and password are required' });
    }

    const lockout = checkAccountLockout(handle);
    if (lockout.locked) {
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${lockout.remainingMin} minutes.` });
    }

    const user = db.findUserByHandle(handle);
    if (!user) {
      recordFailedAttempt(handle);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      recordFailedAttempt(handle);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearFailedAttempts(handle);
    db.updateUserStatus(user.id, 'online');

    const token = jwt.sign({ userId: user.id, handle: user.handle }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`✅ User logged in: ${handle}`);

    res.json({
      token,
      user: { id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, bio: user.bio || null, nodeName: user.nodeName, status: 'online', isAdmin: user.isAdmin, preferences: user.preferences || { theme: 'firefly', fontSize: 'medium' } },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, bio: user.bio || null, nodeName: user.nodeName, status: user.status, isAdmin: user.isAdmin, preferences: user.preferences || { theme: 'firefly', fontSize: 'medium' } });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  db.updateUserStatus(req.user.userId, 'offline');
  res.json({ success: true });
});

// ============ Profile Routes ============
app.put('/api/profile', authenticateToken, (req, res) => {
  const updates = {};
  if (req.body.displayName) updates.displayName = sanitizeInput(req.body.displayName).slice(0, 50);
  if (req.body.avatar) updates.avatar = sanitizeInput(req.body.avatar).slice(0, 2);
  if (req.body.bio !== undefined) updates.bio = req.body.bio ? sanitizeInput(req.body.bio).slice(0, 500) : null;

  const user = db.updateUser(req.user.userId, updates);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ id: user.id, handle: user.handle, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, preferences: user.preferences, bio: user.bio });
});

// Get public profile for any user
app.get('/api/users/:id/profile', authenticateToken, (req, res) => {
  const user = db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Return only public profile fields (no email, passwordHash, preferences, etc.)
  res.json({
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatar: user.avatar,
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || null,
    createdAt: user.createdAt,
  });
});

// Upload profile avatar image
app.post('/api/profile/avatar', authenticateToken, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      // Handle multer errors (file too large, invalid type, etc.)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 2MB' });
      }
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate unique filename
    const filename = `${user.id}-${Date.now()}.webp`;
    const filepath = path.join(AVATARS_DIR, filename);

    // Process image with sharp: resize to 256x256, convert to webp, strip metadata
    await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toFile(filepath);

    // Delete old avatar if exists
    if (user.avatarUrl) {
      const oldFilename = path.basename(user.avatarUrl);
      const oldFilepath = path.join(AVATARS_DIR, oldFilename);
      if (fs.existsSync(oldFilepath)) {
        fs.unlinkSync(oldFilepath);
      }
    }

    // Update user with new avatar URL
    const avatarUrl = `/uploads/avatars/${filename}`;
    db.updateUser(user.id, { avatarUrl });

    res.json({ success: true, avatarUrl });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Delete profile avatar image
app.delete('/api/profile/avatar', authenticateToken, (req, res) => {
  try {
    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.avatarUrl) {
      // Delete the file
      const filename = path.basename(user.avatarUrl);
      const filepath = path.join(AVATARS_DIR, filename);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      // Update user to remove avatar URL
      db.updateUser(user.id, { avatarUrl: null });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Avatar delete error:', err);
    res.status(500).json({ error: 'Failed to delete avatar' });
  }
});

app.post('/api/profile/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await db.changePassword(req.user.userId, currentPassword, newPassword);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

app.post('/api/profile/handle-request', authenticateToken, (req, res) => {
  const newHandle = sanitizeInput(req.body.newHandle);
  if (!newHandle || !/^[a-zA-Z0-9_]{3,20}$/.test(newHandle)) {
    return res.status(400).json({ error: 'Handle must be 3-20 characters, letters/numbers/underscores only' });
  }

  const result = db.requestHandleChange(req.user.userId, newHandle);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true, message: 'Handle change request submitted for review' });
});

app.put('/api/profile/preferences', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updates = {};
  const validThemes = ['firefly', 'highContrast', 'light'];
  const validFontSizes = ['small', 'medium', 'large', 'xlarge'];

  if (req.body.theme && validThemes.includes(req.body.theme)) {
    updates.theme = req.body.theme;
  }
  if (req.body.fontSize && validFontSizes.includes(req.body.fontSize)) {
    updates.fontSize = req.body.fontSize;
  }
  if (typeof req.body.scanLines === 'boolean') {
    updates.scanLines = req.body.scanLines;
  }

  if (!user.preferences) {
    user.preferences = { theme: 'firefly', fontSize: 'medium', scanLines: true };
  }

  user.preferences = { ...user.preferences, ...updates };
  db.saveUsers();

  res.json({ success: true, preferences: user.preferences });
});

// Admin handle request management
app.get('/api/admin/handle-requests', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user?.isAdmin) return res.status(403).json({ error: 'Not authorized' });
  
  const requests = db.handleRequests.requests
    .filter(r => r.status === 'pending')
    .map(r => {
      const requestUser = db.findUserById(r.userId);
      return { ...r, displayName: requestUser?.displayName };
    });
  res.json(requests);
});

app.post('/api/admin/handle-requests/:id/approve', authenticateToken, (req, res) => {
  const result = db.approveHandleChange(req.params.id, req.user.userId);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

app.post('/api/admin/handle-requests/:id/reject', authenticateToken, (req, res) => {
  const result = db.rejectHandleChange(req.params.id, req.user.userId, req.body.reason);
  if (!result.success) return res.status(400).json({ error: result.error });
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
  const handle = sanitizeInput(req.body.handle || req.body.username);
  const contact = db.findUserByHandle(handle);
  if (!contact) return res.status(404).json({ error: 'User not found' });
  if (contact.id === req.user.userId) return res.status(400).json({ error: 'Cannot add yourself' });
  
  if (!db.addContact(req.user.userId, contact.id)) {
    return res.status(409).json({ error: 'Contact already exists' });
  }
  res.status(201).json({
    success: true,
    contact: { id: contact.id, handle: contact.handle, name: contact.displayName, avatar: contact.avatar, status: contact.status, nodeName: contact.nodeName },
  });
});

app.delete('/api/contacts/:id', authenticateToken, (req, res) => {
  if (!db.removeContact(req.user.userId, sanitizeInput(req.params.id))) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  res.json({ success: true });
});

// ============ Contact Request Routes ============
// Send a contact request
app.post('/api/contacts/request', authenticateToken, (req, res) => {
  const { toUserId, message } = req.body;
  if (!toUserId) {
    return res.status(400).json({ error: 'toUserId is required' });
  }

  const result = db.createContactRequest(req.user.userId, sanitizeInput(toUserId), message);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Broadcast to recipient via WebSocket
  broadcast({
    type: 'contact_request_received',
    request: result
  }, [result.to_user_id]);

  res.status(201).json(result);
});

// Get received pending contact requests
app.get('/api/contacts/requests', authenticateToken, (req, res) => {
  const requests = db.getContactRequestsForUser(req.user.userId);
  res.json(requests);
});

// Get sent pending contact requests
app.get('/api/contacts/requests/sent', authenticateToken, (req, res) => {
  const requests = db.getSentContactRequests(req.user.userId);
  res.json(requests);
});

// Accept a contact request
app.post('/api/contacts/requests/:id/accept', authenticateToken, (req, res) => {
  const requestId = sanitizeInput(req.params.id);
  const result = db.acceptContactRequest(requestId, req.user.userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Notify the sender that their request was accepted
  broadcast({
    type: 'contact_request_accepted',
    requestId: requestId,
    acceptedBy: req.user.userId
  }, [result.request.from_user_id]);

  res.json({ success: true, message: 'Contact request accepted' });
});

// Decline a contact request
app.post('/api/contacts/requests/:id/decline', authenticateToken, (req, res) => {
  const requestId = sanitizeInput(req.params.id);
  const result = db.declineContactRequest(requestId, req.user.userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Optionally notify the sender (some apps don't do this for privacy)
  broadcast({
    type: 'contact_request_declined',
    requestId: requestId
  }, [result.request.from_user_id]);

  res.json({ success: true, message: 'Contact request declined' });
});

// Cancel a sent contact request
app.delete('/api/contacts/requests/:id', authenticateToken, (req, res) => {
  const requestId = sanitizeInput(req.params.id);
  const request = db.getContactRequest(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const result = db.cancelContactRequest(requestId, req.user.userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Notify the recipient that the request was cancelled
  broadcast({
    type: 'contact_request_cancelled',
    requestId: requestId
  }, [request.to_user_id]);

  res.json({ success: true, message: 'Contact request cancelled' });
});

// ============ Group Invitation Routes ============
// Invite user(s) to a group
app.post('/api/groups/:id/invite', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);
  const { userIds, message } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }

  // Check if inviter is a group member
  if (!db.isGroupMember(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Only group members can invite others' });
  }

  const results = [];
  const errors = [];

  for (const userId of userIds) {
    const result = db.createGroupInvitation(groupId, req.user.userId, sanitizeInput(userId), message);

    if (result.error) {
      errors.push({ userId, error: result.error });
    } else {
      results.push(result);

      // Broadcast to invitee via WebSocket
      broadcast({
        type: 'group_invitation_received',
        invitation: result
      }, [result.invited_user_id]);
    }
  }

  res.status(201).json({
    success: results.length > 0,
    invitations: results,
    errors: errors.length > 0 ? errors : undefined
  });
});

// Get pending group invitations for current user
app.get('/api/groups/invitations', authenticateToken, (req, res) => {
  const invitations = db.getGroupInvitationsForUser(req.user.userId);
  res.json(invitations);
});

// Get pending invitations sent for a specific group
app.get('/api/groups/:id/invitations/sent', authenticateToken, (req, res) => {
  const groupId = sanitizeInput(req.params.id);

  // Check if requester is a group member
  if (!db.isGroupMember(groupId, req.user.userId)) {
    return res.status(403).json({ error: 'Not a group member' });
  }

  const invitations = db.getGroupInvitationsSent(groupId, req.user.userId);
  res.json(invitations);
});

// Accept a group invitation
app.post('/api/groups/invitations/:id/accept', authenticateToken, (req, res) => {
  const invitationId = sanitizeInput(req.params.id);
  const result = db.acceptGroupInvitation(invitationId, req.user.userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Notify the inviter that their invitation was accepted
  broadcast({
    type: 'group_invitation_accepted',
    invitationId: invitationId,
    userId: req.user.userId,
    groupId: result.invitation.group_id
  }, [result.invitation.invited_by]);

  res.json({
    success: true,
    message: 'Group invitation accepted',
    group: result.group
  });
});

// Decline a group invitation
app.post('/api/groups/invitations/:id/decline', authenticateToken, (req, res) => {
  const invitationId = sanitizeInput(req.params.id);
  const result = db.declineGroupInvitation(invitationId, req.user.userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Notify the inviter that their invitation was declined
  broadcast({
    type: 'group_invitation_declined',
    invitationId: invitationId
  }, [result.invitation.invited_by]);

  res.json({ success: true, message: 'Group invitation declined' });
});

// Cancel a sent group invitation
app.delete('/api/groups/invitations/:id', authenticateToken, (req, res) => {
  const invitationId = sanitizeInput(req.params.id);
  const invitation = db.getGroupInvitation(invitationId);

  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  const result = db.cancelGroupInvitation(invitationId, req.user.userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  // Notify the invitee that the invitation was cancelled
  broadcast({
    type: 'group_invitation_cancelled',
    invitationId: invitationId
  }, [invitation.invited_user_id]);

  res.json({ success: true, message: 'Group invitation cancelled' });
});

// ============ Moderation Routes ============
// Block user
app.post('/api/users/:id/block', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot block yourself' });
  }

  if (!db.blockUser(userId, targetUserId)) {
    return res.status(400).json({ error: 'User already blocked or not found' });
  }

  res.json({ success: true });
});

// Unblock user
app.delete('/api/users/:id/block', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  if (!db.unblockUser(userId, targetUserId)) {
    return res.status(404).json({ error: 'Block not found' });
  }

  res.json({ success: true });
});

// Get blocked users
app.get('/api/users/blocked', authenticateToken, (req, res) => {
  const blockedUsers = db.getBlockedUsers(req.user.userId);
  res.json({ blockedUsers });
});

// Mute user
app.post('/api/users/:id/mute', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot mute yourself' });
  }

  if (!db.muteUser(userId, targetUserId)) {
    return res.status(400).json({ error: 'User already muted or not found' });
  }

  res.json({ success: true });
});

// Unmute user
app.delete('/api/users/:id/mute', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  if (!db.unmuteUser(userId, targetUserId)) {
    return res.status(404).json({ error: 'Mute not found' });
  }

  res.json({ success: true });
});

// Get muted users
app.get('/api/users/muted', authenticateToken, (req, res) => {
  const mutedUsers = db.getMutedUsers(req.user.userId);
  res.json({ mutedUsers });
});

// ============ GIF Search (GIPHY API Proxy) ============
app.get('/api/gifs/search', authenticateToken, gifSearchLimiter, async (req, res) => {
  const { q, limit = 20, offset = 0 } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  if (!GIPHY_API_KEY) {
    return res.status(503).json({
      error: 'GIF search is not configured. Set GIPHY_API_KEY environment variable.'
    });
  }

  try {
    const searchUrl = new URL('https://api.giphy.com/v1/gifs/search');
    searchUrl.searchParams.set('api_key', GIPHY_API_KEY);
    searchUrl.searchParams.set('q', q.trim());
    searchUrl.searchParams.set('limit', Math.min(parseInt(limit) || 20, 50).toString());
    searchUrl.searchParams.set('offset', (parseInt(offset) || 0).toString());
    searchUrl.searchParams.set('rating', 'pg-13'); // Content rating filter
    searchUrl.searchParams.set('lang', 'en');

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error('GIPHY API error:', response.status, response.statusText);
      const errorText = await response.text().catch(() => '');
      console.error('GIPHY API response:', errorText);
      return res.status(502).json({ error: 'Failed to fetch GIFs from provider' });
    }

    const data = await response.json();

    // Transform response to only include what we need
    const gifs = (data.data || []).map(gif => ({
      id: gif.id,
      title: gif.title,
      url: gif.images?.original?.url || '',
      preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || '',
      width: parseInt(gif.images?.fixed_height_small?.width || gif.images?.fixed_height?.width || 100),
      height: parseInt(gif.images?.fixed_height_small?.height || gif.images?.fixed_height?.height || 100),
    })).filter(gif => gif.url && gif.preview);

    res.json({
      gifs,
      pagination: {
        total_count: data.pagination?.total_count || 0,
        count: data.pagination?.count || gifs.length,
        offset: data.pagination?.offset || 0,
      }
    });
  } catch (err) {
    console.error('GIF search error:', err);
    res.status(500).json({ error: 'Failed to search GIFs' });
  }
});

// Get trending GIFs
app.get('/api/gifs/trending', authenticateToken, gifSearchLimiter, async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  if (!GIPHY_API_KEY) {
    return res.status(503).json({
      error: 'GIF search is not configured. Set GIPHY_API_KEY environment variable.'
    });
  }

  try {
    const trendingUrl = new URL('https://api.giphy.com/v1/gifs/trending');
    trendingUrl.searchParams.set('api_key', GIPHY_API_KEY);
    trendingUrl.searchParams.set('limit', Math.min(parseInt(limit) || 20, 50).toString());
    trendingUrl.searchParams.set('offset', (parseInt(offset) || 0).toString());
    trendingUrl.searchParams.set('rating', 'pg-13');

    const response = await fetch(trendingUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error('GIPHY API error:', response.status, response.statusText);
      const errorText = await response.text().catch(() => '');
      console.error('GIPHY API response:', errorText);
      return res.status(502).json({ error: 'Failed to fetch trending GIFs' });
    }

    const data = await response.json();

    const gifs = (data.data || []).map(gif => ({
      id: gif.id,
      title: gif.title,
      url: gif.images?.original?.url || '',
      preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || '',
      width: parseInt(gif.images?.fixed_height_small?.width || gif.images?.fixed_height?.width || 100),
      height: parseInt(gif.images?.fixed_height_small?.height || gif.images?.fixed_height?.height || 100),
    })).filter(gif => gif.url && gif.preview);

    res.json({
      gifs,
      pagination: {
        total_count: data.pagination?.total_count || 0,
        count: data.pagination?.count || gifs.length,
        offset: data.pagination?.offset || 0,
      }
    });
  } catch (err) {
    console.error('Trending GIFs error:', err);
    res.status(500).json({ error: 'Failed to fetch trending GIFs' });
  }
});

// Create report
app.post('/api/reports', authenticateToken, (req, res) => {
  const { type, targetId, reason, details } = req.body;

  if (!type || !targetId || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['message', 'wave', 'user'].includes(type)) {
    return res.status(400).json({ error: 'Invalid report type' });
  }

  if (!['spam', 'harassment', 'inappropriate', 'other'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason' });
  }

  const report = db.createReport({
    reporterId: req.user.userId,
    type: sanitizeInput(type),
    targetId: sanitizeInput(targetId),
    reason: sanitizeInput(reason),
    details: sanitizeInput(details || '')
  });

  res.json({ success: true, reportId: report.id });
});

// Get reports (admin only)
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const status = req.query.status ? sanitizeInput(req.query.status) : null;
  const type = req.query.type ? sanitizeInput(req.query.type) : null;

  const reports = db.getReports({ status, type });
  res.json({ reports, count: reports.length });
});

// Resolve report (admin only)
app.post('/api/admin/reports/:id/resolve', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const reportId = sanitizeInput(req.params.id);
  const { resolution } = req.body;

  if (!db.resolveReport(reportId, resolution, req.user.userId)) {
    return res.status(404).json({ error: 'Report not found' });
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
    currentUserId: req.user.userId,
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

// ============ Wave Routes (renamed from Thread) ============
app.get('/api/waves', authenticateToken, (req, res) => {
  const includeArchived = req.query.archived === 'true';
  res.json(db.getWavesForUser(req.user.userId, includeArchived));
});

app.get('/api/waves/:id', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (!db.canAccessWave(waveId, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const creator = db.findUserById(wave.createdBy);
  const participants = db.getWaveParticipants(wave.id);
  const allMessages = db.getMessagesForWave(wave.id, req.user.userId);
  const group = wave.groupId ? db.getGroup(wave.groupId) : null;

  function buildMessageTree(messages, parentId = null) {
    return messages
      .filter(m => m.parent_id === parentId)
      .map(m => ({ ...m, children: buildMessageTree(messages, m.id) }));
  }

  res.json({
    ...wave,
    creator_name: creator?.displayName || 'Unknown',
    creator_handle: creator?.handle || 'unknown',
    participants,
    messages: buildMessageTree(allMessages),
    all_messages: allMessages,
    group_name: group?.name,
    can_edit: wave.createdBy === req.user.userId,
  });
});

app.post('/api/waves', authenticateToken, (req, res) => {
  const title = sanitizeInput(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  
  const privacy = ['private', 'group', 'crossServer', 'public'].includes(req.body.privacy) 
    ? req.body.privacy : 'private';
  
  // Validate group access for group waves
  if (privacy === 'group') {
    const groupId = sanitizeInput(req.body.groupId);
    if (!groupId) return res.status(400).json({ error: 'Group ID required for group waves' });
    if (!db.isGroupMember(groupId, req.user.userId)) {
      return res.status(403).json({ error: 'Must be group member' });
    }
  }

  const wave = db.createWave({
    title,
    privacy,
    groupId: privacy === 'group' ? sanitizeInput(req.body.groupId) : null,
    createdBy: req.user.userId,
    participants: req.body.participants,
  });

  const result = {
    ...wave,
    creator_name: db.findUserById(req.user.userId)?.displayName || 'Unknown',
    creator_handle: db.findUserById(req.user.userId)?.handle || 'unknown',
    participants: db.getWaveParticipants(wave.id),
    message_count: 0,
  };

  broadcastToWave(wave.id, { type: 'wave_created', wave: result });
  res.status(201).json(result);
});

app.put('/api/waves/:id', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (wave.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Only wave creator can modify' });
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
    db.updateWavePrivacy(waveId, privacy, groupId);
  }

  if (req.body.title) {
    wave.title = sanitizeInput(req.body.title).slice(0, 200);
    db.saveWaves();
  }

  broadcastToWave(waveId, { type: 'wave_updated', wave });
  res.json(wave);
});

app.post('/api/waves/:id/archive', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const archived = req.body.archived !== false;

  if (!db.archiveWaveForUser(waveId, req.user.userId, archived)) {
    return res.status(404).json({ error: 'Wave not found or not a participant' });
  }
  res.json({ success: true, archived });
});

app.post('/api/waves/:id/read', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  console.log(`📖 Marking wave ${waveId} as read for user ${req.user.userId}`);

  if (!db.markWaveAsRead(waveId, req.user.userId)) {
    console.log(`❌ Failed to mark wave ${waveId} as read`);
    return res.status(404).json({ error: 'Wave not found or access denied' });
  }
  console.log(`✅ Wave ${waveId} marked as read`);
  res.json({ success: true });
});

app.delete('/api/waves/:id', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const wave = db.getWave(waveId);

  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (wave.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Only wave creator can delete' });
  }

  const result = db.deleteWave(waveId, req.user.userId);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Broadcast deletion to all participants
  broadcastToWave(waveId, {
    type: 'wave_deleted',
    waveId,
    deletedBy: req.user.userId,
    wave: result.wave
  });

  res.json({ success: true });
});

// ============ Message Routes ============
app.post('/api/messages', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.body.wave_id || req.body.thread_id);
  const content = req.body.content;
  if (!waveId || !content) return res.status(400).json({ error: 'Wave ID and content required' });

  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });

  const canAccess = db.canAccessWave(waveId, req.user.userId);
  if (!canAccess) return res.status(403).json({ error: 'Access denied' });

  // Auto-join public waves
  const isParticipant = db.waves.participants.some(p => p.waveId === waveId && p.userId === req.user.userId);
  if (!isParticipant && wave.privacy === 'public') {
    db.addWaveParticipant(waveId, req.user.userId);
  }

  if (content.length > 10000) return res.status(400).json({ error: 'Message too long' });

  const message = db.createMessage({
    waveId,
    parentId: req.body.parent_id ? sanitizeInput(req.body.parent_id) : null,
    authorId: req.user.userId,
    content,
    privacy: wave.privacy,
  });

  broadcastToWave(waveId, { type: 'new_message', data: message });
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
  broadcastToWave(message.waveId, { type: 'message_edited', data: updated });
  res.json(updated);
});

app.delete('/api/messages/:id', authenticateToken, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const message = db.messages.messages.find(m => m.id === messageId);

  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.authorId !== req.user.userId) {
    return res.status(403).json({ error: 'Only message author can delete' });
  }

  const result = db.deleteMessage(messageId, req.user.userId);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Broadcast deletion to all participants
  broadcastToWave(result.waveId, {
    type: 'message_deleted',
    messageId: result.messageId,
    waveId: result.waveId
  });

  res.json({ success: true });
});

// Toggle emoji reaction on message
app.post('/api/messages/:id/react', authenticateToken, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const emoji = req.body.emoji;

  if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
    return res.status(400).json({ error: 'Invalid emoji' });
  }

  const result = db.toggleMessageReaction(messageId, req.user.userId, emoji);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Broadcast reaction update to all participants
  broadcastToWave(result.waveId, {
    type: 'message_reaction',
    messageId: result.messageId,
    reactions: result.reactions,
    waveId: result.waveId,
  });

  res.json({ success: true, reactions: result.reactions });
});

// Mark individual message as read
app.post('/api/messages/:id/read', authenticateToken, (req, res) => {
  const messageId = sanitizeInput(req.params.id);

  console.log(`📖 Marking message ${messageId} as read for user ${req.user.userId}`);

  if (!db.markMessageAsRead(messageId, req.user.userId)) {
    console.log(`❌ Failed to mark message ${messageId} as read`);
    return res.status(404).json({ error: 'Message not found' });
  }

  console.log(`✅ Message ${messageId} marked as read`);
  res.json({ success: true });
});

// Search messages
app.get('/api/search', authenticateToken, (req, res) => {
  const query = sanitizeInput(req.query.q || '');
  const waveId = req.query.wave ? sanitizeInput(req.query.wave) : null;
  const authorId = req.query.author ? sanitizeInput(req.query.author) : null;
  const fromDate = req.query.from ? sanitizeInput(req.query.from) : null;
  const toDate = req.query.to ? sanitizeInput(req.query.to) : null;

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const results = db.searchMessages(query, { waveId, authorId, fromDate, toDate });

  // Filter results to only include waves the user has access to
  const accessibleResults = results.filter(result => {
    const wave = db.getWave(result.waveId);
    if (!wave) return false;

    // Public waves are accessible to all
    if (wave.privacy === 'public') return true;

    // Check if user is a participant
    const participants = db.getWaveParticipants(result.waveId);
    return participants.some(p => p.id === req.user.userId);
  });

  res.json({ results: accessibleResults, count: accessibleResults.length });
});

// ============ Health Check ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.3.1', uptime: process.uptime() });
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
          const user = db.findUserById(userId);
          ws.userId = userId;
          ws.userName = user?.displayName || 'Unknown';
          if (!clients.has(userId)) clients.set(userId, new Set());
          clients.get(userId).add(ws);
          db.updateUserStatus(userId, 'online');
          ws.send(JSON.stringify({ type: 'auth_success', userId }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }));
        }
      } else if (message.type === 'user_typing') {
        // Broadcast typing indicator to other users in the wave
        if (!userId) return; // Must be authenticated

        const waveId = sanitizeInput(message.waveId);
        if (!waveId) return;

        // Verify user has access to this wave
        const wave = db.getWave(waveId);
        if (!wave) return;

        const participant = db.getWaveParticipants(waveId).find(p => p.id === userId);
        if (!participant) return; // User not in wave

        // Broadcast to other users in the wave
        broadcastToWave(waveId, {
          type: 'user_typing',
          waveId,
          userId,
          userName: ws.userName,
          timestamp: Date.now()
        }, ws); // Exclude sender
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

// Broadcast to specific users by their IDs
function broadcast(message, userIds = []) {
  for (const userId of userIds) {
    if (clients.has(userId)) {
      for (const ws of clients.get(userId)) {
        if (ws.readyState === 1) ws.send(JSON.stringify(message));
      }
    }
  }
}

function broadcastToWave(waveId, message, excludeWs = null) {
  const wave = db.getWave(waveId);
  if (!wave) return;

  // Get all users who should receive this
  let recipients = new Set();

  // Direct participants
  db.getWaveParticipants(waveId).forEach(p => recipients.add(p.id));

  // For group waves, all group members
  if (wave.privacy === 'group' && wave.groupId) {
    db.getGroupMembers(wave.groupId).forEach(m => recipients.add(m.id));
  }

  // For public waves, all connected users (they can see it in their list)
  if (wave.privacy === 'public') {
    clients.forEach((_, userId) => recipients.add(userId));
  }

  for (const userId of recipients) {
    if (clients.has(userId)) {
      for (const ws of clients.get(userId)) {
        // Skip the excluded WebSocket connection (e.g., the sender)
        if (excludeWs && ws === excludeWs) continue;
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
║  SECURE COMMUNICATIONS SYSTEM v1.6.0                       ║
╠════════════════════════════════════════════════════════════╣
║  🔒 Security: Rate limiting, XSS protection, Helmet        ║
║  📁 Data: Separated files (users, waves, messages, groups) ║
║  👥 Groups: Create groups, manage members, group waves     ║
║  🆔 Identity: UUID-based with changeable handles           ║
║  📝 Profiles: Change password, display name, avatar        ║
║  📦 Archives: Personal wave archiving                      ║
╠════════════════════════════════════════════════════════════╣
║  PORT=${PORT} | JWT=${JWT_SECRET === 'cortex-default-secret-CHANGE-ME' ? '⚠️ DEFAULT' : '✅ Custom'} | CORS=${ALLOWED_ORIGINS ? '✅' : '⚠️ All'}
║  DEMO_DATA=${demoEnabled ? '✅' : '❌'} | Server: http://localhost:${PORT}
╚════════════════════════════════════════════════════════════╝
`);
});
