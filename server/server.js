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
import webpush from 'web-push';
import crypto from 'crypto';
import { DatabaseSQLite } from './database-sqlite.js';

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

// Web Push (VAPID) configuration
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@cortex.local';

// Configure web-push if VAPID keys are available
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('🔔 Web Push notifications enabled');
} else {
  console.log('⚠️  Web Push disabled: Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env');
}

// Federation configuration
const FEDERATION_ENABLED = process.env.FEDERATION_ENABLED === 'true';
const FEDERATION_NODE_NAME = process.env.FEDERATION_NODE_NAME || null;

// Database configuration - set USE_SQLITE=true to use SQLite instead of JSON files
const USE_SQLITE = process.env.USE_SQLITE === 'true';

// Data directory and files
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  waves: path.join(DATA_DIR, 'waves.json'),
  droplets: path.join(DATA_DIR, 'droplets.json'),
  messages: path.join(DATA_DIR, 'messages.json'), // Legacy, for migration
  groups: path.join(DATA_DIR, 'groups.json'),
  handleRequests: path.join(DATA_DIR, 'handle-requests.json'),
  reports: path.join(DATA_DIR, 'reports.json'),
  moderation: path.join(DATA_DIR, 'moderation.json'),
  contactRequests: path.join(DATA_DIR, 'contact-requests.json'),
  groupInvitations: path.join(DATA_DIR, 'group-invitations.json'),
  pushSubscriptions: path.join(DATA_DIR, 'push-subscriptions.json'),
  notifications: path.join(DATA_DIR, 'notifications.json'),
  waveNotificationSettings: path.join(DATA_DIR, 'wave-notification-settings.json'),
  federation: path.join(DATA_DIR, 'federation.json'),
};

// Uploads directory for avatars
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
const DROPLETS_DIR = path.join(UPLOADS_DIR, 'droplets');
const MESSAGES_DIR = path.join(UPLOADS_DIR, 'messages'); // Legacy alias

// Ensure uploads directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
if (!fs.existsSync(DROPLETS_DIR)) fs.mkdirSync(DROPLETS_DIR, { recursive: true });
if (!fs.existsSync(MESSAGES_DIR)) fs.mkdirSync(MESSAGES_DIR, { recursive: true }); // Legacy support

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

// Multer configuration for message image uploads
const messageStorage = multer.memoryStorage();
const messageUpload = multer({
  storage: messageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
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

const RATE_LIMIT_OEMBED_MAX = parseInt(process.env.RATE_LIMIT_OEMBED_MAX) || 30;
const oembedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_OEMBED_MAX,
  message: { error: 'Too many embed requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const RATE_LIMIT_REPORT_MAX = parseInt(process.env.RATE_LIMIT_REPORT_MAX) || 10;
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: RATE_LIMIT_REPORT_MAX,
  message: { error: 'Too many reports. Please try again later.' },
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

  // Shared image style - thumbnails by default, click to view full size
  const imgStyle = 'max-width:200px;max-height:150px;border-radius:4px;cursor:pointer;object-fit:cover;display:block;border:1px solid #3a4a3a;';

  content = content.replace(urlRegex, (match) => {
    // Check if this URL should be embedded as an image
    if (imageExtensions.test(match) || imageHosts.test(match)) {
      return `<img src="${match}" alt="Embedded media" style="${imgStyle}" class="zoomable-image" />`;
    }
    // Otherwise, make it a clickable link
    return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`;
  });

  // Also detect and embed relative upload paths (e.g., /uploads/messages/...)
  const uploadPathRegex = /(?<!["'>])(\/uploads\/(?:messages|avatars)\/[^\s<]+)(?![^<]*>|[^<>]*<\/)/gi;
  content = content.replace(uploadPathRegex, (match) => {
    // These are always images from our upload system
    if (imageExtensions.test(match)) {
      return `<img src="${match}" alt="Uploaded image" style="${imgStyle}" class="zoomable-image" />`;
    }
    return match;
  });

  return content;
}

// ============ Rich Media Embed Detection ============
// Patterns for detecting embeddable URLs from supported platforms
const EMBED_PATTERNS = {
  youtube: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
      /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
    ],
    embedUrl: (id) => `https://www.youtube.com/embed/${id}`,
    thumbnail: (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  },
  vimeo: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i,
      /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/i,
    ],
    embedUrl: (id) => `https://player.vimeo.com/video/${id}`,
    oembedUrl: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  },
  spotify: {
    patterns: [
      /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i,
    ],
    embedUrl: (type, id) => `https://open.spotify.com/embed/${type}/${id}`,
  },
  tiktok: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
      /(?:https?:\/\/)?(?:vm\.)?tiktok\.com\/([a-zA-Z0-9]+)/i,
    ],
    oembedUrl: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  },
  twitter: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?(twitter|x)\.com\/\w+\/status\/(\d+)/i,
    ],
    oembedUrl: (url) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
  },
  soundcloud: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[\w-]+\/[\w-]+/i,
    ],
    oembedUrl: (url) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
};

// Simple in-memory cache for oEmbed responses (15 min TTL)
const oembedCache = new Map();
const OEMBED_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCachedOembed(url) {
  const cached = oembedCache.get(url);
  if (cached && Date.now() - cached.timestamp < OEMBED_CACHE_TTL) {
    return cached.data;
  }
  oembedCache.delete(url);
  return null;
}

function setCachedOembed(url, data) {
  // Limit cache size to prevent memory issues
  if (oembedCache.size > 1000) {
    const oldest = oembedCache.keys().next().value;
    oembedCache.delete(oldest);
  }
  oembedCache.set(url, { data, timestamp: Date.now() });
}

// Detect embed URLs in content and return metadata
function detectEmbedUrls(content) {
  const embeds = [];
  const urlRegex = /https?:\/\/[^\s<>"]+/gi;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    for (const [platform, config] of Object.entries(EMBED_PATTERNS)) {
      for (const pattern of config.patterns) {
        const match = url.match(pattern);
        if (match) {
          const embed = {
            platform,
            url,
            contentId: match[1],
          };

          // Handle Spotify's type/id format
          if (platform === 'spotify' && match[2]) {
            embed.contentType = match[1]; // track, album, playlist, etc.
            embed.contentId = match[2];
            embed.embedUrl = config.embedUrl(match[1], match[2]);
          } else if (config.embedUrl && typeof config.embedUrl === 'function') {
            embed.embedUrl = config.embedUrl(match[1]);
          }

          // Add thumbnail for YouTube
          if (platform === 'youtube' && config.thumbnail) {
            embed.thumbnail = config.thumbnail(match[1]);
          }

          // Flag if oEmbed is available
          if (config.oembedUrl) {
            embed.oembedUrl = config.oembedUrl(url);
          }

          embeds.push(embed);
          break;
        }
      }
    }
  }

  return embeds;
}

// Generate embed HTML for a platform (used for server-side rendering if needed)
function generateEmbedHtml(embed) {
  const { platform, embedUrl, contentId } = embed;

  // Common iframe attributes for security
  const sandbox = 'allow-scripts allow-same-origin allow-presentation allow-popups';
  const allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

  switch (platform) {
    case 'youtube':
      return `<iframe
        src="${embedUrl}?rel=0"
        width="560" height="315"
        frameborder="0"
        sandbox="${sandbox}"
        allow="${allow}"
        allowfullscreen
        loading="lazy"
        class="rich-embed youtube-embed"
        data-platform="youtube"
        data-content-id="${contentId}"
      ></iframe>`;

    case 'vimeo':
      return `<iframe
        src="${embedUrl}"
        width="560" height="315"
        frameborder="0"
        sandbox="${sandbox}"
        allow="${allow}"
        allowfullscreen
        loading="lazy"
        class="rich-embed vimeo-embed"
        data-platform="vimeo"
        data-content-id="${contentId}"
      ></iframe>`;

    case 'spotify':
      const height = embed.contentType === 'track' ? '152' : '352';
      return `<iframe
        src="${embedUrl}"
        width="100%" height="${height}"
        frameborder="0"
        sandbox="${sandbox}"
        allow="encrypted-media"
        loading="lazy"
        class="rich-embed spotify-embed"
        data-platform="spotify"
        data-content-id="${contentId}"
      ></iframe>`;

    default:
      return null;
  }
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
    this.droplets = { droplets: [], history: [] };
    this.groups = { groups: [], members: [] };
    this.handleRequests = { requests: [] };
    this.reports = { reports: [] };
    this.moderation = { blocks: [], mutes: [] };
    this.contactRequests = { requests: [] };
    this.groupInvitations = { invitations: [] };
    this.pushSubscriptions = { subscriptions: [] };
    this.notifications = { notifications: [] };
    this.waveNotificationSettings = { settings: [] };
    this.load();
  }

  // Backward compatibility getter for messages
  get messages() {
    return { messages: this.droplets.droplets, history: this.droplets.history };
  }
  set messages(val) {
    this.droplets = { droplets: val.messages || [], history: val.history || [] };
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

      // Migration: messages.json -> droplets.json (v1.10.0)
      if (fs.existsSync(DATA_FILES.droplets)) {
        this.droplets = this.loadFile(DATA_FILES.droplets, { droplets: [], history: [] });
      } else if (fs.existsSync(DATA_FILES.messages)) {
        // Migrate from messages.json to droplets.json
        console.log('📝 Migrating messages.json to droplets.json...');
        const messagesData = this.loadFile(DATA_FILES.messages, { messages: [], history: [] });
        this.droplets = { droplets: messagesData.messages || [], history: messagesData.history || [] };
        this.saveDroplets();
        console.log('✅ Migration complete');
      } else {
        this.droplets = { droplets: [], history: [] };
      }

      this.groups = this.loadFile(DATA_FILES.groups, { groups: [], members: [] });
      this.handleRequests = this.loadFile(DATA_FILES.handleRequests, { requests: [] });
      this.reports = this.loadFile(DATA_FILES.reports, { reports: [] });
      this.moderation = this.loadFile(DATA_FILES.moderation, { blocks: [], mutes: [] });
      this.contactRequests = this.loadFile(DATA_FILES.contactRequests, { requests: [] });
      this.groupInvitations = this.loadFile(DATA_FILES.groupInvitations, { invitations: [] });
      this.pushSubscriptions = this.loadFile(DATA_FILES.pushSubscriptions, { subscriptions: [] });
      this.notifications = this.loadFile(DATA_FILES.notifications, { notifications: [] });
      this.waveNotificationSettings = this.loadFile(DATA_FILES.waveNotificationSettings, { settings: [] });
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
    this.saveFile(DATA_FILES.droplets, this.droplets);
    this.saveFile(DATA_FILES.groups, this.groups);
    this.saveFile(DATA_FILES.handleRequests, this.handleRequests);
    this.saveFile(DATA_FILES.reports, this.reports);
    this.saveFile(DATA_FILES.moderation, this.moderation);
    this.saveFile(DATA_FILES.contactRequests, this.contactRequests);
    this.saveFile(DATA_FILES.groupInvitations, this.groupInvitations);
  }

  saveUsers() { this.saveFile(DATA_FILES.users, this.users); }
  saveWaves() { this.saveFile(DATA_FILES.waves, this.waves); }
  saveDroplets() { this.saveFile(DATA_FILES.droplets, this.droplets); }
  saveMessages() { this.saveDroplets(); } // Backward compatibility alias
  saveGroups() { this.saveFile(DATA_FILES.groups, this.groups); }
  saveHandleRequests() { this.saveFile(DATA_FILES.handleRequests, this.handleRequests); }
  saveReports() { this.saveFile(DATA_FILES.reports, this.reports); }
  saveContactRequests() { this.saveFile(DATA_FILES.contactRequests, this.contactRequests); }
  saveGroupInvitations() { this.saveFile(DATA_FILES.groupInvitations, this.groupInvitations); }
  saveModeration() { this.saveFile(DATA_FILES.moderation, this.moderation); }
  savePushSubscriptions() { this.saveFile(DATA_FILES.pushSubscriptions, this.pushSubscriptions); }
  saveNotifications() { this.saveFile(DATA_FILES.notifications, this.notifications); }
  saveWaveNotificationSettings() { this.saveFile(DATA_FILES.waveNotificationSettings, this.waveNotificationSettings); }

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

    this.droplets.droplets = [
      { id: 'droplet-1', waveId: 'wave-1', parentId: null, authorId: 'user-mal', content: 'Welcome to Cortex! This is a public wave visible to everyone.', privacy: 'public', version: 1, createdAt: now, editedAt: null, readBy: ['user-mal'] },
      { id: 'droplet-2', waveId: 'wave-2', parentId: null, authorId: 'user-mal', content: 'This is a private wave for testing.', privacy: 'private', version: 1, createdAt: now, editedAt: null, readBy: ['user-mal'] },
      { id: 'droplet-3', waveId: 'wave-3', parentId: null, authorId: 'user-mal', content: 'This is a group wave for the crew.', privacy: 'group', version: 1, createdAt: now, editedAt: null, readBy: ['user-mal'] },
      { id: 'droplet-4', waveId: 'wave-4', parentId: null, authorId: 'user-zoe', content: 'Zoe\'s private wave.', privacy: 'private', version: 1, createdAt: now, editedAt: null, readBy: ['user-zoe'] },
      { id: 'droplet-5', waveId: 'wave-5', parentId: null, authorId: 'user-wash', content: 'Wash\'s public wave.', privacy: 'public', version: 1, createdAt: now, editedAt: null, readBy: ['user-wash'] },
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

  updateUserPreferences(userId, preferences) {
    const user = this.findUserById(userId);
    if (!user) return null;

    if (!user.preferences) {
      user.preferences = { theme: 'firefly', fontSize: 'medium' };
    }
    user.preferences = { ...user.preferences, ...preferences };
    this.saveUsers();
    return user.preferences;
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

  getPendingHandleRequests() {
    return this.handleRequests.requests.filter(r => r.status === 'pending');
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

  // === Push Subscription Methods ===
  getPushSubscriptions(userId) {
    return this.pushSubscriptions.subscriptions.filter(s => s.userId === userId);
  }

  addPushSubscription(userId, subscription) {
    // Remove any existing subscription with the same endpoint for this user
    this.pushSubscriptions.subscriptions = this.pushSubscriptions.subscriptions.filter(
      s => !(s.userId === userId && s.endpoint === subscription.endpoint)
    );

    this.pushSubscriptions.subscriptions.push({
      id: uuidv4(),
      userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      createdAt: new Date().toISOString()
    });

    this.savePushSubscriptions();
    return true;
  }

  removePushSubscription(userId, endpoint) {
    const initialLength = this.pushSubscriptions.subscriptions.length;
    this.pushSubscriptions.subscriptions = this.pushSubscriptions.subscriptions.filter(
      s => !(s.userId === userId && s.endpoint === endpoint)
    );

    if (this.pushSubscriptions.subscriptions.length < initialLength) {
      this.savePushSubscriptions();
      return true;
    }
    return false;
  }

  removeAllPushSubscriptions(userId) {
    const initialLength = this.pushSubscriptions.subscriptions.length;
    this.pushSubscriptions.subscriptions = this.pushSubscriptions.subscriptions.filter(
      s => s.userId !== userId
    );

    if (this.pushSubscriptions.subscriptions.length < initialLength) {
      this.savePushSubscriptions();
      return true;
    }
    return false;
  }

  removeExpiredPushSubscription(endpoint) {
    // Called when a push notification fails (subscription expired/invalid)
    this.pushSubscriptions.subscriptions = this.pushSubscriptions.subscriptions.filter(
      s => s.endpoint !== endpoint
    );
    this.savePushSubscriptions();
  }

  // === Notification Methods ===
  createNotification({ userId, type, waveId, dropletId, actorId, title, body, preview, groupKey }) {
    const notification = {
      id: uuidv4(),
      userId,
      type,
      waveId: waveId || null,
      dropletId: dropletId || null,
      actorId: actorId || null,
      title,
      body: body || null,
      preview: preview || null,
      read: false,
      dismissed: false,
      pushSent: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      groupKey: groupKey || null
    };

    this.notifications.notifications.push(notification);
    this.saveNotifications();
    return notification;
  }

  getNotifications(userId, { unread = false, type = null, limit = 50, offset = 0 } = {}) {
    let notifications = this.notifications.notifications
      .filter(n => n.userId === userId && !n.dismissed);

    if (unread) {
      notifications = notifications.filter(n => !n.read);
    }
    if (type) {
      notifications = notifications.filter(n => n.type === type);
    }

    // Sort by createdAt descending
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    notifications = notifications.slice(offset, offset + limit);

    // Enrich with actor and wave info
    return notifications.map(n => {
      const actor = n.actorId ? this.findUserById(n.actorId) : null;
      const wave = n.waveId ? this.waves.waves.find(w => w.id === n.waveId) : null;

      return {
        ...n,
        actorHandle: actor?.handle,
        actorDisplayName: actor?.displayName,
        actorAvatar: actor?.avatar,
        actorAvatarUrl: actor?.avatarUrl,
        waveTitle: wave?.title
      };
    });
  }

  getNotificationCounts(userId) {
    const unread = this.notifications.notifications
      .filter(n => n.userId === userId && !n.read && !n.dismissed);

    const byType = {};
    for (const n of unread) {
      byType[n.type] = (byType[n.type] || 0) + 1;
    }

    return { total: unread.length, byType };
  }

  // Get unread notification counts grouped by wave with priority types
  getUnreadCountsByWave(userId) {
    const unread = this.notifications.notifications
      .filter(n => n.userId === userId && !n.read && !n.dismissed && n.waveId);

    const byWave = {};
    // Priority: direct_mention > reply > ripple > wave_activity
    const typePriority = { direct_mention: 4, reply: 3, ripple: 2, wave_activity: 1 };

    for (const n of unread) {
      if (!byWave[n.waveId]) {
        byWave[n.waveId] = { count: 0, highestType: null, highestPriority: 0 };
      }
      byWave[n.waveId].count++;
      const priority = typePriority[n.type] || 0;
      if (priority > byWave[n.waveId].highestPriority) {
        byWave[n.waveId].highestPriority = priority;
        byWave[n.waveId].highestType = n.type;
      }
    }

    return byWave;
  }

  markNotificationRead(notificationId) {
    const notification = this.notifications.notifications.find(n => n.id === notificationId);
    if (!notification) return false;

    notification.read = true;
    notification.readAt = new Date().toISOString();
    this.saveNotifications();
    return true;
  }

  // Mark all notifications for a specific droplet as read for a user
  markNotificationsReadByDroplet(dropletId, userId) {
    const now = new Date().toISOString();
    let count = 0;

    for (const n of this.notifications.notifications) {
      if (n.dropletId === dropletId && n.userId === userId && !n.read) {
        n.read = true;
        n.readAt = now;
        count++;
      }
    }

    if (count > 0) {
      this.saveNotifications();
    }
    return count;
  }

  markAllNotificationsRead(userId) {
    const now = new Date().toISOString();
    let count = 0;

    for (const n of this.notifications.notifications) {
      if (n.userId === userId && !n.read) {
        n.read = true;
        n.readAt = now;
        count++;
      }
    }

    if (count > 0) {
      this.saveNotifications();
    }
    return count;
  }

  dismissNotification(notificationId) {
    const notification = this.notifications.notifications.find(n => n.id === notificationId);
    if (!notification) return false;

    notification.dismissed = true;
    this.saveNotifications();
    return true;
  }

  markNotificationPushSent(notificationId) {
    const notification = this.notifications.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.pushSent = true;
      this.saveNotifications();
    }
  }

  deleteOldNotifications(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const initialLength = this.notifications.notifications.length;
    this.notifications.notifications = this.notifications.notifications.filter(n => {
      const notificationDate = new Date(n.createdAt);
      // Keep if: recent OR (unread AND not dismissed)
      return notificationDate >= cutoff || (!n.read && !n.dismissed);
    });

    const deleted = initialLength - this.notifications.notifications.length;
    if (deleted > 0) {
      this.saveNotifications();
    }
    return deleted;
  }

  // Wave notification settings
  getWaveNotificationSettings(userId, waveId) {
    const settings = this.waveNotificationSettings.settings.find(
      s => s.userId === userId && s.waveId === waveId
    );

    if (!settings) {
      return { enabled: true, level: 'all', sound: true, push: true };
    }

    return {
      enabled: settings.enabled !== false,
      level: settings.level || 'all',
      sound: settings.sound !== false,
      push: settings.push !== false
    };
  }

  setWaveNotificationSettings(userId, waveId, settings) {
    const existing = this.waveNotificationSettings.settings.find(
      s => s.userId === userId && s.waveId === waveId
    );

    if (existing) {
      existing.enabled = settings.enabled !== false;
      existing.level = settings.level || 'all';
      existing.sound = settings.sound !== false;
      existing.push = settings.push !== false;
    } else {
      this.waveNotificationSettings.settings.push({
        userId,
        waveId,
        enabled: settings.enabled !== false,
        level: settings.level || 'all',
        sound: settings.sound !== false,
        push: settings.push !== false
      });
    }

    this.saveWaveNotificationSettings();
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

  createReport(reporterId, type, targetId, reason, details = '') {
    const report = {
      id: uuidv4(),
      reporterId: reporterId,
      type: type, // 'message' | 'wave' | 'user'
      targetId: targetId,
      reason: reason, // 'spam' | 'harassment' | 'inappropriate' | 'other'
      details: details || '',
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
    let reports = this.reports.reports || [];

    if (filters.status) {
      reports = reports.filter(r => r.status === filters.status);
    }

    if (filters.type) {
      reports = reports.filter(r => r.type === filters.type);
    }

    if (filters.reporterId) {
      reports = reports.filter(r => r.reporterId === filters.reporterId);
    }

    // Enrich with context
    return reports.map(r => {
      const reporter = this.findUserById(r.reporterId);
      let context = {};

      if (r.type === 'message') {
        const msg = this.droplets.droplets.find(m => m.id === r.targetId);
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

  resolveReport(reportId, resolution, userId, notes = null) {
    const report = this.reports.reports.find(r => r.id === reportId);
    if (!report) return false;

    report.status = resolution === 'dismiss' ? 'dismissed' : 'resolved';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = userId;
    report.resolution = resolution;
    if (notes) report.resolutionNotes = notes;

    this.saveReports();
    return report;
  }

  dismissReport(reportId, userId, reason = null) {
    const report = this.reports.reports.find(r => r.id === reportId);
    if (!report) return false;

    report.status = 'dismissed';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = userId;
    report.resolution = 'dismissed';
    if (reason) report.resolutionNotes = reason;

    this.saveReports();
    return report;
  }

  getReportsByUser(userId) {
    return this.getReports({ reporterId: userId });
  }

  getReportsByStatus(status, limit = 50, offset = 0) {
    const reports = this.getReports({ status });
    return reports.slice(offset, offset + limit);
  }

  getPendingReports(limit = 50, offset = 0) {
    return this.getReportsByStatus('pending', limit, offset);
  }

  getReportById(reportId) {
    const report = this.reports.reports.find(r => r.id === reportId);
    if (!report) return null;
    return this.getReports({}).find(r => r.id === reportId);
  }

  // === Warning Methods ===
  createWarning(userId, issuedBy, reason, reportId = null) {
    const warning = {
      id: uuidv4(),
      userId,
      issuedBy,
      reason,
      reportId,
      createdAt: new Date().toISOString()
    };

    if (!this.reports.warnings) this.reports.warnings = [];
    this.reports.warnings.push(warning);
    this.saveReports();
    return warning;
  }

  getWarningsByUser(userId) {
    if (!this.reports.warnings) return [];
    return this.reports.warnings
      .filter(w => w.userId === userId)
      .map(w => {
        const issuer = this.findUserById(w.issuedBy);
        return {
          ...w,
          issuerHandle: issuer?.handle,
          issuerName: issuer?.displayName
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getUserWarningCount(userId) {
    if (!this.reports.warnings) return 0;
    return this.reports.warnings.filter(w => w.userId === userId).length;
  }

  // === Moderation Log Methods ===
  logModerationAction(adminId, actionType, targetType, targetId, reason = null, details = null) {
    const logEntry = {
      id: uuidv4(),
      adminId,
      actionType,
      targetType,
      targetId,
      reason,
      details,
      createdAt: new Date().toISOString()
    };

    if (!this.reports.moderationLog) this.reports.moderationLog = [];
    this.reports.moderationLog.push(logEntry);
    this.saveReports();
    return logEntry;
  }

  getModerationLog(limit = 50, offset = 0) {
    if (!this.reports.moderationLog) return [];
    return this.reports.moderationLog
      .map(entry => {
        const admin = this.findUserById(entry.adminId);
        return {
          ...entry,
          adminHandle: admin?.handle,
          adminName: admin?.displayName
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + limit);
  }

  getModerationLogForTarget(targetType, targetId) {
    if (!this.reports.moderationLog) return [];
    return this.reports.moderationLog
      .filter(entry => entry.targetType === targetType && entry.targetId === targetId)
      .map(entry => {
        const admin = this.findUserById(entry.adminId);
        return {
          ...entry,
          adminHandle: admin?.handle,
          adminName: admin?.displayName
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
        const messageCount = this.droplets.droplets.filter(m => m.waveId === wave.id).length;
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

        const unreadCount = this.droplets.droplets.filter(m => {
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

  isWaveParticipant(waveId, userId) {
    return this.waves.participants.some(p => p.waveId === waveId && p.userId === userId);
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
    this.droplets.droplets = this.droplets.droplets.filter(m => m.waveId !== waveId);

    // Delete message history for this wave
    const messageIds = this.droplets.droplets.filter(m => m.waveId === waveId).map(m => m.id);
    this.droplets.history = this.droplets.history.filter(h => !messageIds.includes(h.messageId));

    this.saveWaves();
    this.saveMessages();

    return { success: true, wave, participants };
  }

  // Break out a droplet and its replies into a new wave
  breakoutDroplet(dropletId, newWaveTitle, participants, userId) {
    const now = new Date().toISOString();

    // Get the original droplet
    const droplet = this.droplets.droplets.find(m => m.id === dropletId);
    if (!droplet) {
      return { success: false, error: 'Droplet not found' };
    }

    // Check if already broken out
    if (droplet.brokenOutTo) {
      return { success: false, error: 'Droplet already broken out' };
    }

    const originalWaveId = droplet.waveId;
    const originalWave = this.getWave(originalWaveId);

    // Get all child droplets recursively
    const getAllChildren = (parentId) => {
      const children = this.droplets.droplets.filter(m => m.parentId === parentId);
      let allIds = children.map(c => c.id);
      for (const child of children) {
        allIds = allIds.concat(getAllChildren(child.id));
      }
      return allIds;
    };

    const childIds = getAllChildren(dropletId);

    // Build breakout chain
    let breakoutChain = originalWave.breakoutChain || [];
    breakoutChain = [...breakoutChain, {
      wave_id: originalWaveId,
      droplet_id: dropletId,
      title: originalWave.title
    }];

    // Create the new wave
    const newWaveId = `wave-${uuidv4()}`;
    const newWave = {
      id: newWaveId,
      title: newWaveTitle.slice(0, 200),
      privacy: originalWave.privacy || 'private',
      groupId: originalWave.groupId || null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      rootDropletId: dropletId,
      brokenOutFrom: originalWaveId,
      breakoutChain: breakoutChain,
    };
    this.waves.waves.push(newWave);

    // Add participants to new wave
    const participantSet = new Set(participants);
    participantSet.add(userId);
    for (const participantId of participantSet) {
      if (!this.waves.participants.some(p => p.waveId === newWaveId && p.userId === participantId)) {
        this.waves.participants.push({ waveId: newWaveId, userId: participantId, joinedAt: now, archived: false });
      }
    }

    // Mark the original droplet as broken out
    droplet.brokenOutTo = newWaveId;

    this.saveWaves();
    this.saveMessages();

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

  // === Message Methods ===
  getMessagesForWave(waveId, userId = null) {
    let messages = this.droplets.droplets.filter(m => m.waveId === waveId);

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

        // Get broken-out wave title if applicable
        let brokenOutToTitle = null;
        if (m.brokenOutTo) {
          const brokenOutWave = this.waves.waves.find(w => w.id === m.brokenOutTo);
          brokenOutToTitle = brokenOutWave?.title || null;
        }

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
          brokenOutToTitle,
        };
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  getMessage(messageId) {
    const m = this.droplets.droplets.find(msg => msg.id === messageId);
    if (!m) return null;

    const author = this.findUserById(m.authorId);

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
    };
  }

  // Get droplets for a breakout wave (includes root droplet and descendants from original wave)
  getDropletsForBreakoutWave(waveId, userId = null) {
    const wave = this.getWave(waveId);
    if (!wave || !wave.rootDropletId) {
      return this.getMessagesForWave(waveId, userId);
    }

    // Get blocked/muted users
    let blockedIds = [];
    let mutedIds = [];
    if (userId) {
      blockedIds = this.moderation.blocks
        .filter(b => b.userId === userId)
        .map(b => b.blockedUserId);
      mutedIds = this.moderation.mutes
        .filter(m => m.userId === userId)
        .map(m => m.mutedUserId);
    }

    // Recursively get droplet and all descendants
    const getAllDescendants = (parentId, results = []) => {
      const droplet = this.droplets.droplets.find(m => m.id === parentId);
      if (!droplet) return results;

      // Skip blocked/muted users
      if (blockedIds.includes(droplet.authorId) || mutedIds.includes(droplet.authorId)) {
        return results;
      }

      results.push(droplet);

      // Get children
      const children = this.droplets.droplets.filter(m => m.parentId === parentId);
      for (const child of children) {
        getAllDescendants(child.id, results);
      }

      return results;
    };

    const droplets = getAllDescendants(wave.rootDropletId);

    return droplets.map(m => {
      const author = this.findUserById(m.authorId);
      const readBy = m.readBy || [m.authorId];
      const isUnread = m.deleted ? false : (userId ? !readBy.includes(userId) && m.authorId !== userId : false);

      // Get broken-out wave title if applicable
      let brokenOutToTitle = null;
      if (m.brokenOutTo) {
        const brokenOutWave = this.waves.waves.find(w => w.id === m.brokenOutTo);
        brokenOutToTitle = brokenOutWave?.title || null;
      }

      return {
        ...m,
        waveId: waveId, // Report as belonging to this wave for UI purposes
        wave_id: waveId,
        sender_name: author?.displayName || 'Unknown',
        sender_avatar: author?.avatar || '?',
        sender_avatar_url: author?.avatarUrl || null,
        sender_handle: author?.handle || 'unknown',
        author_id: m.authorId,
        parent_id: m.parentId,
        created_at: m.createdAt,
        edited_at: m.editedAt,
        deleted_at: m.deletedAt || null,
        is_unread: isUnread,
        brokenOutToTitle,
      };
    }).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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
    this.droplets.droplets.push(message);
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
    const message = this.droplets.droplets.find(m => m.id === messageId);
    if (!message) return null;
    if (message.deleted) return null; // Cannot edit deleted messages

    this.droplets.history.push({
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
    const message = this.droplets.droplets.find(m => m.id === messageId);
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
    this.droplets.history = this.droplets.history.filter(h => h.messageId !== messageId);

    this.saveMessages();

    return { success: true, messageId, waveId, deleted: true };
  }

  toggleMessageReaction(messageId, userId, emoji) {
    const message = this.droplets.droplets.find(m => m.id === messageId);
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
    const message = this.droplets.droplets.find(m => m.id === messageId);
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

    let results = this.droplets.droplets.filter(message => {
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

    // Helper to create highlighted snippet
    const createSnippet = (content, term) => {
      // Strip HTML tags for snippet
      const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const lowerText = plainText.toLowerCase();
      const termIndex = lowerText.indexOf(term);
      if (termIndex === -1) return plainText.substring(0, 128) + (plainText.length > 128 ? '...' : '');

      // Extract context around match (64 chars before and after)
      const start = Math.max(0, termIndex - 64);
      const end = Math.min(plainText.length, termIndex + term.length + 64);
      let snippet = plainText.substring(start, end);

      // Add ellipsis if truncated
      if (start > 0) snippet = '...' + snippet;
      if (end < plainText.length) snippet = snippet + '...';

      // Highlight match with <mark> tags (case-insensitive)
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      snippet = snippet.replace(regex, '<mark>$1</mark>');

      return snippet;
    };

    // Enrich results with author and wave info
    return results.map(message => {
      const author = this.findUserById(message.authorId);
      const wave = this.getWave(message.waveId);

      return {
        id: message.id,
        content: message.content,
        snippet: createSnippet(message.content, searchTerm),
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

  // ============ Federation - Server Identity Methods ============

  getServerIdentity() {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    return data.identity;
  }

  setServerIdentity({ nodeName, publicKey, privateKey }) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    data.identity = {
      nodeName,
      publicKey,
      privateKey,
      createdAt: data.identity?.createdAt || now,
      updatedAt: now
    };

    this.saveFile(DATA_FILES.federation, data);
    return data.identity;
  }

  hasServerIdentity() {
    const identity = this.getServerIdentity();
    return !!identity;
  }

  // ============ Federation - Trusted Nodes Methods ============

  getFederationNodes({ status = null } = {}) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    let nodes = data.nodes || [];

    if (status) {
      nodes = nodes.filter(n => n.status === status);
    }

    return nodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getFederationNode(nodeId) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    return (data.nodes || []).find(n => n.id === nodeId) || null;
  }

  getFederationNodeByName(nodeName) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    return (data.nodes || []).find(n => n.nodeName === nodeName) || null;
  }

  addFederationNode({ nodeName, baseUrl, publicKey = null, status = 'pending', addedBy }) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const node = {
      id: uuidv4(),
      nodeName,
      baseUrl,
      publicKey,
      status,
      addedBy,
      lastContactAt: null,
      failureCount: 0,
      createdAt: now,
      updatedAt: now
    };

    data.nodes = data.nodes || [];
    data.nodes.push(node);
    this.saveFile(DATA_FILES.federation, data);

    return node;
  }

  updateFederationNode(nodeId, updates) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const nodeIndex = (data.nodes || []).findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return null;

    const allowedFields = ['nodeName', 'baseUrl', 'publicKey', 'status', 'lastContactAt', 'failureCount'];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        data.nodes[nodeIndex][key] = value;
      }
    }
    data.nodes[nodeIndex].updatedAt = now;

    this.saveFile(DATA_FILES.federation, data);
    return data.nodes[nodeIndex];
  }

  deleteFederationNode(nodeId) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const originalLength = (data.nodes || []).length;
    data.nodes = (data.nodes || []).filter(n => n.id !== nodeId);

    if (data.nodes.length !== originalLength) {
      this.saveFile(DATA_FILES.federation, data);
      return true;
    }
    return false;
  }

  recordFederationContact(nodeId, success = true) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const nodeIndex = (data.nodes || []).findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) return;

    if (success) {
      data.nodes[nodeIndex].lastContactAt = now;
      data.nodes[nodeIndex].failureCount = 0;
    } else {
      data.nodes[nodeIndex].failureCount = (data.nodes[nodeIndex].failureCount || 0) + 1;
    }
    data.nodes[nodeIndex].updatedAt = now;

    this.saveFile(DATA_FILES.federation, data);
  }

  // ============ Federation - Remote Users Methods ============

  getRemoteUser(id) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    const user = (data.remoteUsers || []).find(u => u.id === id);
    if (!user) return null;
    return { ...user, isRemote: true };
  }

  getRemoteUserByHandle(nodeName, handle) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    const user = (data.remoteUsers || []).find(u => u.nodeName === nodeName && u.handle === handle);
    if (!user) return null;
    return { ...user, isRemote: true };
  }

  cacheRemoteUser({ id, nodeName, handle, displayName, avatar, avatarUrl, bio }) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    data.remoteUsers = data.remoteUsers || [];
    const existingIndex = data.remoteUsers.findIndex(u => u.nodeName === nodeName && u.handle === handle);

    const user = {
      id,
      nodeName,
      handle,
      displayName: displayName || null,
      avatar: avatar || null,
      avatarUrl: avatarUrl || null,
      bio: bio || null,
      cachedAt: existingIndex === -1 ? now : data.remoteUsers[existingIndex].cachedAt,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      data.remoteUsers[existingIndex] = user;
    } else {
      data.remoteUsers.push(user);
    }

    this.saveFile(DATA_FILES.federation, data);
    return { ...user, isRemote: true };
  }

  // ============ Federation - Wave Federation Methods ============

  getWaveFederationNodes(waveId) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const waveNodes = (data.waveFederation || []).filter(wf => wf.waveId === waveId);

    return waveNodes.map(wn => {
      const node = (data.nodes || []).find(n => n.nodeName === wn.nodeName);
      return {
        waveId: wn.waveId,
        nodeName: wn.nodeName,
        status: wn.status,
        addedAt: wn.addedAt,
        baseUrl: node?.baseUrl,
        publicKey: node?.publicKey,
        nodeStatus: node?.status
      };
    });
  }

  addWaveFederationNode(waveId, nodeName) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    data.waveFederation = data.waveFederation || [];

    // Check if already exists
    const exists = data.waveFederation.some(wf => wf.waveId === waveId && wf.nodeName === nodeName);
    if (exists) return true;

    data.waveFederation.push({
      waveId,
      nodeName,
      status: 'active',
      addedAt: now
    });

    this.saveFile(DATA_FILES.federation, data);
    return true;
  }

  removeWaveFederationNode(waveId, nodeName) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const originalLength = (data.waveFederation || []).length;
    data.waveFederation = (data.waveFederation || []).filter(wf => !(wf.waveId === waveId && wf.nodeName === nodeName));

    if (data.waveFederation.length !== originalLength) {
      this.saveFile(DATA_FILES.federation, data);
      return true;
    }
    return false;
  }

  setWaveAsOrigin(waveId) {
    const now = new Date().toISOString();
    const wave = this.waves.waves.find(w => w.id === waveId);
    if (wave) {
      wave.federationState = 'origin';
      wave.updatedAt = now;
      this.saveWaves();
    }
    return wave || null;
  }

  createParticipantWave({ id, title, privacy, createdBy, originNode, originWaveId }) {
    const now = new Date().toISOString();

    const wave = {
      id,
      title,
      privacy,
      createdBy,
      createdAt: now,
      updatedAt: now,
      federationState: 'participant',
      originNode,
      originWaveId
    };

    this.waves.waves.push(wave);
    this.saveWaves();
    return wave;
  }

  getOriginWaves() {
    return this.waves.waves
      .filter(w => w.federationState === 'origin')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getParticipantWaves() {
    return this.waves.waves
      .filter(w => w.federationState === 'participant')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getWaveByOrigin(originNode, originWaveId) {
    return this.waves.waves.find(w => w.originNode === originNode && w.originWaveId === originWaveId) || null;
  }

  // ============ Federation - Remote Droplets Methods ============

  getRemoteDroplet(id) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    const droplet = (data.remoteDroplets || []).find(d => d.id === id);
    if (!droplet) return null;
    return { ...droplet, isRemote: true };
  }

  getRemoteDropletsForWave(waveId) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    return (data.remoteDroplets || [])
      .filter(d => d.waveId === waveId && !d.deleted)
      .map(d => {
        const author = (data.remoteUsers || []).find(u => u.id === d.authorId);
        return {
          ...d,
          authorDisplayName: author?.displayName,
          authorAvatar: author?.avatar,
          authorAvatarUrl: author?.avatarUrl,
          isRemote: true
        };
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  cacheRemoteDroplet({ id, waveId, originWaveId, originNode, authorId, authorNode, parentId, content, createdAt, editedAt, reactions }) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    data.remoteDroplets = data.remoteDroplets || [];
    const existingIndex = data.remoteDroplets.findIndex(d => d.id === id);

    const droplet = {
      id,
      waveId,
      originWaveId,
      originNode,
      authorId,
      authorNode,
      parentId: parentId || null,
      content,
      createdAt,
      editedAt: editedAt || null,
      reactions: reactions || {},
      deleted: false,
      cachedAt: existingIndex === -1 ? now : data.remoteDroplets[existingIndex].cachedAt,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      data.remoteDroplets[existingIndex] = droplet;
    } else {
      data.remoteDroplets.push(droplet);
    }

    this.saveFile(DATA_FILES.federation, data);
    return { ...droplet, isRemote: true };
  }

  markRemoteDropletDeleted(id) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const dropletIndex = (data.remoteDroplets || []).findIndex(d => d.id === id);
    if (dropletIndex === -1) return false;

    data.remoteDroplets[dropletIndex].deleted = true;
    data.remoteDroplets[dropletIndex].updatedAt = now;

    this.saveFile(DATA_FILES.federation, data);
    return true;
  }

  // ============ Federation - Message Queue Methods ============

  queueFederationMessage({ targetNode, messageType, payload }) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    data.queue = data.queue || [];
    data.queue.push({
      id,
      targetNode,
      messageType,
      payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: now,
      createdAt: now,
      deliveredAt: null,
      lastError: null
    });

    this.saveFile(DATA_FILES.federation, data);
    return id;
  }

  getPendingFederationMessages(limit = 10) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    return (data.queue || [])
      .filter(m => m.status === 'pending' && (!m.nextRetryAt || m.nextRetryAt <= now))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, limit);
  }

  markFederationMessageDelivered(messageId) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const msgIndex = (data.queue || []).findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    data.queue[msgIndex].status = 'delivered';
    data.queue[msgIndex].deliveredAt = now;

    this.saveFile(DATA_FILES.federation, data);
  }

  markFederationMessageFailed(messageId, error) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const msgIndex = (data.queue || []).findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = data.queue[msgIndex];
    const newAttempts = msg.attempts + 1;

    if (newAttempts >= msg.maxAttempts) {
      msg.status = 'failed';
      msg.attempts = newAttempts;
      msg.lastError = error;
    } else {
      // Calculate exponential backoff: 1min, 5min, 25min, 2hr, 10hr
      const backoffMinutes = Math.pow(5, newAttempts);
      msg.attempts = newAttempts;
      msg.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
      msg.lastError = error;
    }

    this.saveFile(DATA_FILES.federation, data);
  }

  cleanupOldFederationMessages(daysOld = 7) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const originalLength = (data.queue || []).length;
    data.queue = (data.queue || []).filter(m =>
      !((m.status === 'delivered' || m.status === 'failed') && m.createdAt < cutoff)
    );

    if (data.queue.length !== originalLength) {
      this.saveFile(DATA_FILES.federation, data);
    }
    return originalLength - data.queue.length;
  }

  // ============ Federation - Inbox Log Methods (for idempotency) ============

  hasReceivedFederationMessage(messageId) {
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });
    return (data.inboxLog || []).some(m => m.id === messageId);
  }

  logFederationInbox({ id, sourceNode, messageType }) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    // Check if already logged
    if ((data.inboxLog || []).some(m => m.id === id)) return;

    data.inboxLog = data.inboxLog || [];
    data.inboxLog.push({
      id,
      sourceNode,
      messageType,
      receivedAt: now,
      processedAt: null,
      status: 'received'
    });

    this.saveFile(DATA_FILES.federation, data);
  }

  markFederationInboxProcessed(messageId) {
    const now = new Date().toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const msgIndex = (data.inboxLog || []).findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    data.inboxLog[msgIndex].processedAt = now;
    data.inboxLog[msgIndex].status = 'processed';

    this.saveFile(DATA_FILES.federation, data);
  }

  cleanupOldInboxLog(daysOld = 30) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const data = this.loadFile(DATA_FILES.federation, { identity: null, nodes: [], remoteUsers: [], waveFederation: [], remoteDroplets: [], queue: [], inboxLog: [] });

    const originalLength = (data.inboxLog || []).length;
    data.inboxLog = (data.inboxLog || []).filter(m => m.receivedAt >= cutoff);

    if (data.inboxLog.length !== originalLength) {
      this.saveFile(DATA_FILES.federation, data);
    }
    return originalLength - data.inboxLog.length;
  }
}

// Initialize database - use SQLite or JSON based on USE_SQLITE environment variable
const db = USE_SQLITE ? new DatabaseSQLite() : new Database();
if (USE_SQLITE) {
  console.log('🗄️  Using SQLite database');
} else {
  console.log('📁 Using JSON file storage');
}

// ============ Express App ============
const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:', 'ws:', 'https:'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      frameSrc: [
        "'self'",
        'https://www.youtube.com',
        'https://www.youtube-nocookie.com',
        'https://player.vimeo.com',
        'https://open.spotify.com',
        'https://www.tiktok.com',
        'https://platform.twitter.com',
        'https://w.soundcloud.com',
      ],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
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

// ============ Message Image Upload ============
// Upload image for use in messages
app.post('/api/uploads', authenticateToken, (req, res, next) => {
  messageUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
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

    // Generate unique filename: userId-timestamp.ext
    const timestamp = Date.now();
    const ext = req.file.mimetype === 'image/gif' ? 'gif' : 'webp';
    const filename = `${user.id}-${timestamp}.${ext}`;
    const filepath = path.join(MESSAGES_DIR, filename);

    // Process image with sharp
    // For GIFs, preserve animation; for others, resize and convert to webp
    if (req.file.mimetype === 'image/gif') {
      // Keep GIF as-is to preserve animation, just resize if too large
      const metadata = await sharp(req.file.buffer).metadata();
      if (metadata.width > 1200 || metadata.height > 1200) {
        await sharp(req.file.buffer, { animated: true })
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .toFile(filepath);
      } else {
        // Save as-is
        fs.writeFileSync(filepath, req.file.buffer);
      }
    } else {
      // Convert to webp, resize if needed, strip metadata
      await sharp(req.file.buffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(filepath);
    }

    const imageUrl = `/uploads/messages/${filename}`;
    console.log(`📷 Image uploaded by ${user.handle}: ${imageUrl}`);

    res.json({ success: true, url: imageUrl });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
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
  const validThemes = ['firefly', 'highContrast', 'amoled', 'light', 'ocean'];
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
  if (typeof req.body.autoFocusDroplets === 'boolean') {
    updates.autoFocusDroplets = req.body.autoFocusDroplets;
  }

  // Use the dedicated method that works with both JSON and SQLite
  const updatedPreferences = db.updateUserPreferences(req.user.userId, updates);
  if (!updatedPreferences) {
    return res.status(500).json({ error: 'Failed to update preferences' });
  }

  res.json({ success: true, preferences: updatedPreferences });
});

// Default notification preferences
const DEFAULT_NOTIFICATION_PREFS = {
  enabled: true,
  directMentions: 'always',      // always | app_closed | never
  replies: 'always',
  waveActivity: 'app_closed',
  rippleEvents: 'app_closed',
  soundEnabled: false,
  suppressWhileFocused: true,
};

// Get notification preferences
app.get('/api/notifications/preferences', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const notificationPrefs = user.notificationPreferences || DEFAULT_NOTIFICATION_PREFS;
  res.json({ preferences: notificationPrefs });
});

// Update notification preferences
app.put('/api/notifications/preferences', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const validLevels = ['always', 'app_closed', 'never'];
  const updates = {};

  // Validate and apply updates
  if (typeof req.body.enabled === 'boolean') {
    updates.enabled = req.body.enabled;
  }
  if (req.body.directMentions && validLevels.includes(req.body.directMentions)) {
    updates.directMentions = req.body.directMentions;
  }
  if (req.body.replies && validLevels.includes(req.body.replies)) {
    updates.replies = req.body.replies;
  }
  if (req.body.waveActivity && validLevels.includes(req.body.waveActivity)) {
    updates.waveActivity = req.body.waveActivity;
  }
  if (req.body.rippleEvents && validLevels.includes(req.body.rippleEvents)) {
    updates.rippleEvents = req.body.rippleEvents;
  }
  if (typeof req.body.soundEnabled === 'boolean') {
    updates.soundEnabled = req.body.soundEnabled;
  }
  if (typeof req.body.suppressWhileFocused === 'boolean') {
    updates.suppressWhileFocused = req.body.suppressWhileFocused;
  }

  // Merge with existing preferences
  const currentPrefs = user.notificationPreferences || DEFAULT_NOTIFICATION_PREFS;
  user.notificationPreferences = { ...currentPrefs, ...updates };
  db.saveUsers();

  res.json({ success: true, preferences: user.notificationPreferences });
});

// ============ Notification Routes ============

// Get notifications for current user
app.get('/api/notifications', authenticateToken, (req, res) => {
  const { unread, type, limit = 50, offset = 0 } = req.query;

  const notifications = db.getNotifications(req.user.userId, {
    unread: unread === 'true',
    type: type || null,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10)
  });

  res.json({ notifications });
});

// Get notification counts
app.get('/api/notifications/count', authenticateToken, (req, res) => {
  const counts = db.getNotificationCounts(req.user.userId);
  res.json(counts);
});

// Get unread notification counts by wave (for ripple activity badges)
app.get('/api/notifications/by-wave', authenticateToken, (req, res) => {
  const countsByWave = db.getUnreadCountsByWave(req.user.userId);
  res.json({ countsByWave });
});

// Mark notification as read
app.post('/api/notifications/:id/read', authenticateToken, (req, res) => {
  const success = db.markNotificationRead(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  // Broadcast updated count to user
  broadcastToUser(req.user.userId, {
    type: 'notification_read',
    notificationId: req.params.id
  });

  res.json({ success: true });
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authenticateToken, (req, res) => {
  const count = db.markAllNotificationsRead(req.user.userId);

  // Broadcast updated count to user
  broadcastToUser(req.user.userId, {
    type: 'unread_count_update',
    count: 0
  });

  res.json({ success: true, count });
});

// Dismiss notification
app.delete('/api/notifications/:id', authenticateToken, (req, res) => {
  const success = db.dismissNotification(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json({ success: true });
});

// Get wave notification settings
app.get('/api/waves/:id/notifications', authenticateToken, (req, res) => {
  const wave = db.getWave(req.params.id);
  if (!wave) {
    return res.status(404).json({ error: 'Wave not found' });
  }

  // Verify user is a participant
  if (!db.isWaveParticipant(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: 'Not a participant in this wave' });
  }

  const settings = db.getWaveNotificationSettings(req.user.userId, req.params.id);
  res.json(settings);
});

// Update wave notification settings
app.put('/api/waves/:id/notifications', authenticateToken, (req, res) => {
  const wave = db.getWave(req.params.id);
  if (!wave) {
    return res.status(404).json({ error: 'Wave not found' });
  }

  // Verify user is a participant
  if (!db.isWaveParticipant(req.params.id, req.user.userId)) {
    return res.status(403).json({ error: 'Not a participant in this wave' });
  }

  const { enabled, level, sound, push } = req.body;
  db.setWaveNotificationSettings(req.user.userId, req.params.id, {
    enabled,
    level,
    sound,
    push
  });

  res.json({ success: true });
});

// ============ Push Notification Routes ============

// Get VAPID public key for client subscription
app.get('/api/push/vapid-key', authenticateToken, (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(501).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', authenticateToken, (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(501).json({ error: 'Push notifications not configured' });
  }

  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    console.log('❌ Invalid push subscription object:', JSON.stringify(subscription, null, 2));
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    console.log(`🔔 Adding push subscription for user ${req.user.userId}, endpoint: ${subscription.endpoint.substring(0, 60)}...`);
    db.addPushSubscription(req.user.userId, subscription);
    console.log(`✅ Push subscription added for user ${req.user.userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`❌ Failed to add push subscription for user ${req.user.userId}:`, error.message);
    res.status(500).json({ error: `Database error: ${error.message}` });
  }
});

// Unsubscribe from push notifications
app.delete('/api/push/subscribe', authenticateToken, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    // Remove all subscriptions for this user
    db.removeAllPushSubscriptions(req.user.userId);
    console.log(`🔕 All push subscriptions removed for user ${req.user.userId}`);
  } else {
    // Remove specific subscription
    db.removePushSubscription(req.user.userId, endpoint);
    console.log(`🔕 Push subscription removed for user ${req.user.userId}`);
  }
  res.json({ success: true });
});

// Test push notification (development only)
app.post('/api/push/test', authenticateToken, async (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(501).json({ error: 'Push notifications not configured' });
  }

  const subscriptions = db.getPushSubscriptions(req.user.userId);
  if (subscriptions.length === 0) {
    return res.status(400).json({ error: 'No push subscriptions found' });
  }

  const payload = JSON.stringify({
    title: 'Cortex Test',
    body: 'Push notifications are working!',
    tag: 'test',
    url: '/'
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: sub.keys
      }, payload);
      sent++;
    } catch (error) {
      console.error('Push notification failed:', error.statusCode);
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or invalid
        db.removeExpiredPushSubscription(sub.endpoint);
      }
    }
  }

  res.json({ success: true, sent, total: subscriptions.length });
});

// Admin handle request management
app.get('/api/admin/handle-requests', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user?.isAdmin) return res.status(403).json({ error: 'Not authorized' });

  const requests = db.getPendingHandleRequests().map(r => {
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

// ============ Rich Media Embed Endpoints ============

// Detect embeddable URLs in content
app.post('/api/embeds/detect', authenticateToken, (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  const embeds = detectEmbedUrls(content);
  res.json({ embeds });
});

// oEmbed proxy endpoint with caching
app.get('/api/embeds/oembed', authenticateToken, oembedLimiter, async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL is from a supported platform
  const embeds = detectEmbedUrls(url);
  if (embeds.length === 0) {
    return res.status(400).json({ error: 'URL is not from a supported platform' });
  }

  const embed = embeds[0];
  if (!embed.oembedUrl) {
    // Return what we have if no oEmbed available
    return res.json({
      platform: embed.platform,
      embedUrl: embed.embedUrl,
      contentId: embed.contentId,
      thumbnail: embed.thumbnail,
    });
  }

  // Check cache first
  const cached = getCachedOembed(url);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const response = await fetch(embed.oembedUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      console.error(`oEmbed fetch failed for ${embed.platform}:`, response.status);
      // Return basic embed info without oEmbed data
      return res.json({
        platform: embed.platform,
        embedUrl: embed.embedUrl,
        contentId: embed.contentId,
        thumbnail: embed.thumbnail,
        error: 'oEmbed data unavailable',
      });
    }

    const data = await response.json();

    const result = {
      platform: embed.platform,
      embedUrl: embed.embedUrl,
      contentId: embed.contentId,
      thumbnail: embed.thumbnail || data.thumbnail_url,
      title: data.title,
      author: data.author_name,
      html: data.html, // Some platforms provide embed HTML
      width: data.width,
      height: data.height,
    };

    // Cache the result
    setCachedOembed(url, result);

    res.json(result);
  } catch (err) {
    console.error('oEmbed proxy error:', err);
    // Return basic embed info on error
    res.json({
      platform: embed.platform,
      embedUrl: embed.embedUrl,
      contentId: embed.contentId,
      thumbnail: embed.thumbnail,
      error: 'Failed to fetch oEmbed data',
    });
  }
});

// Get embed info for a URL (lightweight, no oEmbed fetch)
app.get('/api/embeds/info', authenticateToken, (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  const embeds = detectEmbedUrls(url);
  if (embeds.length === 0) {
    return res.json({ embeddable: false });
  }

  const embed = embeds[0];
  res.json({
    embeddable: true,
    platform: embed.platform,
    embedUrl: embed.embedUrl,
    contentId: embed.contentId,
    contentType: embed.contentType,
    thumbnail: embed.thumbnail,
    hasOembed: !!embed.oembedUrl,
  });
});

// ============ Report Routes ============

// Create report (rate limited: 10 per hour)
app.post('/api/reports', authenticateToken, reportLimiter, (req, res) => {
  const { type, targetId, reason, details } = req.body;

  // Validate required fields
  if (!type || !targetId || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate type
  if (!['message', 'wave', 'user'].includes(type)) {
    return res.status(400).json({ error: 'Invalid report type. Must be: message, wave, or user' });
  }

  // Validate reason
  if (!['spam', 'harassment', 'inappropriate', 'other'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason. Must be: spam, harassment, inappropriate, or other' });
  }

  // Create report
  const report = db.createReport(
    req.user.userId,
    sanitizeInput(type),
    sanitizeInput(targetId),
    sanitizeInput(reason),
    sanitizeInput(details || '')
  );

  res.json({ success: true, reportId: report.id });
});

// Get user's own submitted reports
app.get('/api/reports', authenticateToken, (req, res) => {
  const reports = db.getReportsByUser(req.user.userId);
  res.json({ reports, count: reports.length });
});

// Get reports (admin only)
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const status = req.query.status ? sanitizeInput(req.query.status) : null;
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset) : 0;

  // Validate status
  if (status && !['pending', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be: pending, resolved, or dismissed' });
  }

  let reports;
  if (status) {
    reports = db.getReportsByStatus(status, limit, offset);
  } else {
    reports = db.getReports({ limit, offset });
  }

  res.json({ reports, count: reports.length });
});

// Resolve report (admin only)
app.post('/api/admin/reports/:id/resolve', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const reportId = sanitizeInput(req.params.id);
  const { resolution, notes } = req.body;

  if (!resolution || resolution.trim().length === 0) {
    return res.status(400).json({ error: 'Resolution is required' });
  }

  const updatedReport = db.resolveReport(reportId, sanitizeInput(resolution), req.user.userId, notes ? sanitizeInput(notes) : null);

  if (!updatedReport) {
    return res.status(404).json({ error: 'Report not found or already processed' });
  }

  // Notify reporter via WebSocket
  const reporter = db.findUserById(updatedReport.reporterId);
  if (reporter) {
    broadcast({
      type: 'report_resolved',
      reportId: updatedReport.id,
      status: updatedReport.status,
      resolution: updatedReport.resolution,
      targetUserId: updatedReport.reporterId
    });
  }

  res.json({ success: true, report: updatedReport });
});

// Dismiss report (admin only)
app.post('/api/admin/reports/:id/dismiss', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const reportId = sanitizeInput(req.params.id);
  const { reason } = req.body;

  const updatedReport = db.dismissReport(reportId, req.user.userId, reason ? sanitizeInput(reason) : null);

  if (!updatedReport) {
    return res.status(404).json({ error: 'Report not found or already processed' });
  }

  // Notify reporter via WebSocket
  const reporter = db.findUserById(updatedReport.reporterId);
  if (reporter) {
    broadcast({
      type: 'report_resolved',
      reportId: updatedReport.id,
      status: updatedReport.status,
      resolution: updatedReport.resolution,
      targetUserId: updatedReport.reporterId
    });
  }

  res.json({ success: true, report: updatedReport });
});

// Issue warning to user (admin only)
app.post('/api/admin/users/:id/warn', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const targetUserId = sanitizeInput(req.params.id);
  const { reason, reportId } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'Reason is required' });
  }

  const targetUser = db.findUserById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const warning = db.createWarning(
    targetUserId,
    req.user.userId,
    sanitizeInput(reason),
    reportId ? sanitizeInput(reportId) : null
  );

  // Notify user via WebSocket
  broadcast({
    type: 'warning_received',
    warning,
    targetUserId
  });

  res.json({ success: true, warning });
});

// Get warnings for a user (admin only)
app.get('/api/admin/users/:id/warnings', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const targetUserId = sanitizeInput(req.params.id);
  const warnings = db.getWarningsByUser(targetUserId);

  res.json({ warnings, count: warnings.length });
});

// Get moderation log (admin only)
app.get('/api/admin/moderation-log', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  const logs = db.getModerationLog(limit, offset);

  res.json({ logs, count: logs.length });
});

// Get moderation log for specific target (admin only)
app.get('/api/admin/moderation-log/:targetType/:targetId', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const targetType = sanitizeInput(req.params.targetType);
  const targetId = sanitizeInput(req.params.targetId);

  if (!['user', 'message', 'wave'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid target type' });
  }

  const logs = db.getModerationLogForTarget(targetType, targetId);

  res.json({ logs, count: logs.length });
});

// ============ Federation Routes ============

// Helper function to generate RSA keypair for federation
function generateFederationKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  return { publicKey, privateKey };
}

// HTTP Signature utilities for server-to-server authentication
// Format: Signature: keyId="https://server/api/federation/identity#main-key",
//                    algorithm="rsa-sha256",
//                    headers="(request-target) host date digest",
//                    signature="base64sig"

function createHttpSignature(method, url, body, privateKey, nodeName) {
  const parsedUrl = new URL(url);
  const date = new Date().toUTCString();
  const requestTarget = `${method.toLowerCase()} ${parsedUrl.pathname}`;

  // Create digest of body (SHA-256)
  const bodyString = body ? JSON.stringify(body) : '';
  const digest = bodyString
    ? `SHA-256=${crypto.createHash('sha256').update(bodyString).digest('base64')}`
    : '';

  // Build signing string
  const headers = ['(request-target)', 'host', 'date'];
  if (digest) headers.push('digest');

  const signingParts = [
    `(request-target): ${requestTarget}`,
    `host: ${parsedUrl.host}`,
    `date: ${date}`,
  ];
  if (digest) signingParts.push(`digest: ${digest}`);

  const signingString = signingParts.join('\n');

  // Sign with RSA-SHA256
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingString);
  const signature = sign.sign(privateKey, 'base64');

  // Build Signature header
  const keyId = `https://${nodeName}/api/federation/identity#main-key`;
  const signatureHeader = `keyId="${keyId}",algorithm="rsa-sha256",headers="${headers.join(' ')}",signature="${signature}"`;

  return {
    'Date': date,
    'Digest': digest || undefined,
    'Signature': signatureHeader,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function parseHttpSignature(signatureHeader) {
  if (!signatureHeader) return null;

  const parts = {};
  // Parse: keyId="...",algorithm="...",headers="...",signature="..."
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(signatureHeader)) !== null) {
    parts[match[1]] = match[2];
  }

  if (!parts.keyId || !parts.signature || !parts.headers) {
    return null;
  }

  return parts;
}

function verifyHttpSignature(req, publicKey) {
  const signatureParts = parseHttpSignature(req.headers['signature']);
  if (!signatureParts) return false;

  const headersList = signatureParts.headers.split(' ');

  // Reconstruct signing string
  const signingParts = headersList.map(header => {
    if (header === '(request-target)') {
      return `(request-target): ${req.method.toLowerCase()} ${req.path}`;
    }
    const value = req.headers[header.toLowerCase()];
    if (!value) return null;
    return `${header}: ${value}`;
  });

  if (signingParts.some(p => p === null)) return false;

  const signingString = signingParts.join('\n');

  // Verify signature
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signingString);
    return verify.verify(publicKey, signatureParts.signature, 'base64');
  } catch (err) {
    console.error('Signature verification error:', err.message);
    return false;
  }
}

// Middleware to authenticate federation requests (server-to-server)
function authenticateFederationRequest(req, res, next) {
  if (!FEDERATION_ENABLED) {
    return res.status(404).json({ error: 'Federation is not enabled' });
  }

  const signatureHeader = req.headers['signature'];
  if (!signatureHeader) {
    return res.status(401).json({ error: 'Missing Signature header' });
  }

  const signatureParts = parseHttpSignature(signatureHeader);
  if (!signatureParts) {
    return res.status(401).json({ error: 'Invalid Signature header format' });
  }

  // Extract node name from keyId
  // Format: https://nodename/api/federation/identity#main-key
  const keyIdMatch = signatureParts.keyId.match(/https?:\/\/([^\/]+)\//);
  if (!keyIdMatch) {
    return res.status(401).json({ error: 'Invalid keyId format' });
  }

  const nodeName = keyIdMatch[1];

  // Look up the node
  const node = db.getFederationNodeByName(nodeName);
  if (!node) {
    return res.status(403).json({ error: 'Unknown federation node' });
  }

  if (node.status !== 'active') {
    return res.status(403).json({ error: `Federation node is ${node.status}` });
  }

  if (!node.publicKey) {
    return res.status(403).json({ error: 'No public key for this node' });
  }

  // Verify digest if present
  if (req.headers['digest']) {
    const bodyString = JSON.stringify(req.body);
    const expectedDigest = `SHA-256=${crypto.createHash('sha256').update(bodyString).digest('base64')}`;
    if (req.headers['digest'] !== expectedDigest) {
      return res.status(401).json({ error: 'Digest mismatch' });
    }
  }

  // Verify signature
  if (!verifyHttpSignature(req, node.publicKey)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Check date is within acceptable window (5 minutes)
  const requestDate = new Date(req.headers['date']);
  const now = new Date();
  const diffMinutes = Math.abs(now - requestDate) / (1000 * 60);
  if (diffMinutes > 5) {
    return res.status(401).json({ error: 'Request date too old or in future' });
  }

  // Attach node info to request
  req.federationNode = node;

  // Record successful contact
  db.recordFederationContact(node.id, true);

  next();
}

// Helper to send signed federation requests
async function sendSignedFederationRequest(targetNode, method, path, body = null) {
  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    throw new Error('Server identity not configured');
  }

  const url = `${targetNode.baseUrl}${path}`;
  const headers = createHttpSignature(method, url, body, ourIdentity.privateKey, ourIdentity.nodeName);

  // Remove undefined headers
  Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// Helper to send wave invite to a federated server
// Called when creating a wave with federated participants or adding federated participants to an existing wave
// Uses optimistic send (try immediately) with queue fallback on failure
async function sendWaveInvite(targetNode, wave, participants, invitedUserHandle) {
  const messageId = `wave-invite-${uuidv4()}`;
  const ourIdentity = db.getServerIdentity();

  // Build participant list with node info
  const participantList = participants.map(p => ({
    id: p.id,
    handle: p.handle,
    displayName: p.displayName || p.name,
    avatar: p.avatar,
    avatarUrl: p.avatarUrl,
    nodeName: p.nodeName || ourIdentity?.nodeName, // Local users have our node
  }));

  const payload = {
    id: messageId,
    type: 'wave_invite',
    payload: {
      wave: {
        id: wave.id,
        title: wave.title,
        privacy: wave.privacy || 'cross-server',
        createdBy: wave.createdBy,
        createdAt: wave.createdAt,
      },
      participants: participantList,
      invitedUserHandle,
    }
  };

  try {
    // Try to send immediately (optimistic)
    const response = await sendSignedFederationRequest(targetNode, 'POST', '/api/federation/inbox', payload);

    if (response.ok) {
      console.log(`✅ Wave invite sent to ${targetNode.nodeName} for @${invitedUserHandle}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Wave invite to ${targetNode.nodeName} failed: ${response.status} - ${errorText}`);
      // Queue for retry
      db.queueFederationMessage({
        targetNode: targetNode.nodeName,
        messageType: 'wave_invite',
        payload,
      });
      console.log(`📥 Queued wave_invite for retry to ${targetNode.nodeName}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Wave invite to ${targetNode.nodeName} error:`, error.message);
    // Queue for retry
    db.queueFederationMessage({
      targetNode: targetNode.nodeName,
      messageType: 'wave_invite',
      payload,
    });
    console.log(`📥 Queued wave_invite for retry to ${targetNode.nodeName}`);
    return false;
  }
}

// Helper to parse federated user identifier
// Returns { handle, nodeName } or null if not federated
function parseFederatedIdentifier(identifier) {
  const match = identifier.match(/^@?([^@]+)@(.+)$/);
  if (match) {
    return { handle: match[1], nodeName: match[2] };
  }
  return null;
}

// Helper to send a droplet to all federated nodes on a wave
// Called when a droplet is created, edited, or deleted on an origin wave
// Uses optimistic send (try immediately) with queue fallback on failure
async function sendDropletToFederatedNodes(waveId, messageType, payload) {
  if (!FEDERATION_ENABLED) return;

  // Get all federated nodes for this wave
  const federationNodes = db.getWaveFederationNodes(waveId);
  if (!federationNodes || federationNodes.length === 0) return;

  const messageId = `${messageType}-${payload.droplet?.id || payload.dropletId}-${Date.now()}`;

  for (const fed of federationNodes) {
    const node = db.getFederationNodeByName(fed.nodeName);
    if (!node || node.status !== 'active') {
      console.warn(`⚠️ Skipping ${messageType} to ${fed.nodeName}: node not found or not active`);
      continue;
    }

    const fullPayload = {
      id: messageId,
      type: messageType,
      payload,
    };

    try {
      // Try to send immediately (optimistic)
      const response = await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', fullPayload);

      if (response.ok) {
        console.log(`✅ ${messageType} sent to ${node.nodeName}`);
      } else {
        const errorText = await response.text();
        console.error(`❌ ${messageType} to ${node.nodeName} failed: ${response.status} - ${errorText}`);
        // Queue for retry
        db.queueFederationMessage({
          targetNode: fed.nodeName,
          messageType,
          payload: fullPayload,
        });
        console.log(`📥 Queued ${messageType} for retry to ${fed.nodeName}`);
      }
    } catch (error) {
      console.error(`❌ ${messageType} to ${node.nodeName} error:`, error.message);
      // Queue for retry
      db.queueFederationMessage({
        targetNode: fed.nodeName,
        messageType,
        payload: fullPayload,
      });
      console.log(`📥 Queued ${messageType} for retry to ${fed.nodeName}`);
    }
  }
}

// Rate limiter for federation inbox (higher limits for server-to-server)
const federationInboxLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute (for bulk message delivery)
  message: { error: 'Too many federation requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public endpoint: Get this server's federation identity (no auth required)
// Other servers call this to get our public key during handshake
app.get('/api/federation/identity', (req, res) => {
  if (!FEDERATION_ENABLED) {
    return res.status(404).json({ error: 'Federation is not enabled on this server' });
  }

  const identity = db.getServerIdentity();
  if (!identity) {
    return res.status(404).json({ error: 'Server identity not configured' });
  }

  // Return public identity only (never expose private key)
  res.json({
    nodeName: identity.nodeName,
    publicKey: identity.publicKey,
    createdAt: identity.createdAt
  });
});

// Get federation status (admin only)
app.get('/api/admin/federation/status', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const identity = db.getServerIdentity();
  const nodes = db.getFederationNodes();

  res.json({
    enabled: FEDERATION_ENABLED,
    configured: !!identity,
    nodeName: identity?.nodeName || FEDERATION_NODE_NAME || null,
    hasKeypair: !!identity?.publicKey,
    trustedNodes: nodes.length,
    activeNodes: nodes.filter(n => n.status === 'active').length
  });
});

// Initialize or update server identity (admin only)
app.post('/api/admin/federation/identity', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const nodeName = sanitizeInput(req.body.nodeName);
  if (!nodeName || nodeName.length < 3) {
    return res.status(400).json({ error: 'Node name must be at least 3 characters' });
  }

  // Validate node name format (domain-like)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(nodeName)) {
    return res.status(400).json({ error: 'Node name must be a valid domain format (e.g., cortex.example.com)' });
  }

  const existingIdentity = db.getServerIdentity();
  let publicKey, privateKey;

  if (req.body.regenerateKeys || !existingIdentity) {
    // Generate new keypair
    const keypair = generateFederationKeypair();
    publicKey = keypair.publicKey;
    privateKey = keypair.privateKey;
    console.log(`🔑 Generated new federation keypair for ${nodeName}`);
  } else {
    // Keep existing keypair
    publicKey = existingIdentity.publicKey;
    privateKey = existingIdentity.privateKey;
  }

  const identity = db.setServerIdentity({ nodeName, publicKey, privateKey });

  res.json({
    success: true,
    nodeName: identity.nodeName,
    publicKey: identity.publicKey,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt
  });
});

// List trusted federation nodes (admin only)
app.get('/api/admin/federation/nodes', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const status = req.query.status ? sanitizeInput(req.query.status) : null;
  const nodes = db.getFederationNodes({ status });

  res.json({ nodes, count: nodes.length });
});

// Add a trusted federation node (admin only)
app.post('/api/admin/federation/nodes', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const nodeName = sanitizeInput(req.body.nodeName);
  const baseUrl = sanitizeInput(req.body.baseUrl);

  if (!nodeName || nodeName.length < 3) {
    return res.status(400).json({ error: 'Node name must be at least 3 characters' });
  }

  if (!baseUrl || !baseUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid base URL is required (must start with http:// or https://)' });
  }

  // Check if node already exists
  const existingNode = db.getFederationNodeByName(nodeName);
  if (existingNode) {
    return res.status(409).json({ error: 'Node with this name already exists' });
  }

  const node = db.addFederationNode({
    nodeName,
    baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    status: 'pending',
    addedBy: req.user.userId
  });

  res.status(201).json({ success: true, node });
});

// Get a specific federation node (admin only)
app.get('/api/admin/federation/nodes/:id', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const nodeId = sanitizeInput(req.params.id);
  const node = db.getFederationNode(nodeId);

  if (!node) {
    return res.status(404).json({ error: 'Federation node not found' });
  }

  res.json({ node });
});

// Update a federation node (admin only)
app.put('/api/admin/federation/nodes/:id', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const nodeId = sanitizeInput(req.params.id);
  const updates = {};

  if (req.body.baseUrl) {
    updates.baseUrl = sanitizeInput(req.body.baseUrl).replace(/\/$/, '');
  }
  if (req.body.status && ['pending', 'active', 'suspended', 'blocked'].includes(req.body.status)) {
    updates.status = req.body.status;
  }

  const node = db.updateFederationNode(nodeId, updates);
  if (!node) {
    return res.status(404).json({ error: 'Federation node not found' });
  }

  res.json({ success: true, node });
});

// Delete a federation node (admin only)
app.delete('/api/admin/federation/nodes/:id', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const nodeId = sanitizeInput(req.params.id);
  const deleted = db.deleteFederationNode(nodeId);

  if (!deleted) {
    return res.status(404).json({ error: 'Federation node not found' });
  }

  res.json({ success: true });
});

// Initiate handshake with a federation node (admin only)
// Fetches the remote server's public key
app.post('/api/admin/federation/nodes/:id/handshake', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled on this server' });
  }

  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    return res.status(400).json({ error: 'Server identity not configured. Set up federation identity first.' });
  }

  const nodeId = sanitizeInput(req.params.id);
  const node = db.getFederationNode(nodeId);

  if (!node) {
    return res.status(404).json({ error: 'Federation node not found' });
  }

  try {
    // Fetch the remote server's identity
    const identityUrl = `${node.baseUrl}/api/federation/identity`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(identityUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `Cortex/${ourIdentity.nodeName}`
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      db.recordFederationContact(nodeId, false);
      return res.status(502).json({
        error: 'Failed to reach remote server',
        details: `HTTP ${response.status}: ${errorText.substring(0, 100)}`
      });
    }

    const remoteIdentity = await response.json();

    if (!remoteIdentity.nodeName || !remoteIdentity.publicKey) {
      db.recordFederationContact(nodeId, false);
      return res.status(502).json({ error: 'Invalid response from remote server' });
    }

    // Verify the node name matches
    if (remoteIdentity.nodeName !== node.nodeName) {
      db.recordFederationContact(nodeId, false);
      return res.status(400).json({
        error: 'Node name mismatch',
        details: `Expected ${node.nodeName}, got ${remoteIdentity.nodeName}`
      });
    }

    // Update our record with the remote server's public key and mark as active
    const updatedNode = db.updateFederationNode(nodeId, {
      publicKey: remoteIdentity.publicKey,
      status: 'active'
    });
    db.recordFederationContact(nodeId, true);

    res.json({
      success: true,
      message: 'Handshake successful',
      node: updatedNode,
      remoteIdentity: {
        nodeName: remoteIdentity.nodeName,
        publicKey: remoteIdentity.publicKey.substring(0, 100) + '...'
      }
    });
  } catch (error) {
    db.recordFederationContact(nodeId, false);

    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Connection timed out' });
    }

    console.error(`Federation handshake failed for ${node.nodeName}:`, error.message);
    res.status(502).json({
      error: 'Failed to connect to remote server',
      details: error.message
    });
  }
});

// Federation inbox - receives signed messages from other servers
// This is the main entry point for federated content delivery
app.post('/api/federation/inbox', federationInboxLimiter, authenticateFederationRequest, async (req, res) => {
  const { id, type, payload } = req.body;
  const sourceNode = req.federationNode;

  if (!id || !type) {
    return res.status(400).json({ error: 'Missing id or type' });
  }

  // Check for duplicate (idempotency)
  if (db.hasReceivedFederationMessage(id)) {
    // Already processed, return success (idempotent)
    return res.json({ success: true, duplicate: true });
  }

  // Log the incoming message
  db.logFederationInbox({ id, sourceNode: sourceNode.nodeName, messageType: type });

  // Process based on message type
  try {
    switch (type) {
      case 'wave_invite': {
        // Handle wave invitation from origin server
        // payload: { wave, participants, invitedUserHandle }
        console.log(`📨 Received wave_invite from ${sourceNode.nodeName}`);

        const { wave, participants, invitedUserHandle } = payload;
        if (!wave || !invitedUserHandle) {
          console.error('Invalid wave_invite payload');
          break;
        }

        // Find the local user being invited
        const invitedUser = db.findUserByHandle(invitedUserHandle);
        if (!invitedUser) {
          console.error(`wave_invite: User @${invitedUserHandle} not found locally`);
          break;
        }

        // Check if we already have this wave as a participant
        let localWave = db.getWaveByOrigin(sourceNode.nodeName, wave.id);

        if (!localWave) {
          // Create participant wave
          const participantWaveId = uuidv4();
          localWave = db.createParticipantWave({
            id: participantWaveId,
            title: wave.title,
            privacy: wave.privacy || 'cross-server',
            createdBy: invitedUser.id, // Local user as creator reference
            originNode: sourceNode.nodeName,
            originWaveId: wave.id,
          });

          // Cache any remote participants
          if (participants) {
            for (const p of participants) {
              if (p.nodeName && p.nodeName !== db.getServerIdentity()?.nodeName) {
                // Remote user, cache them
                db.cacheRemoteUser({
                  id: p.id,
                  nodeName: p.nodeName,
                  handle: p.handle,
                  displayName: p.displayName,
                  avatar: p.avatar,
                  avatarUrl: p.avatarUrl,
                  bio: p.bio,
                });
              }
            }
          }
        }

        // Add local user as participant
        db.addWaveParticipant(localWave.id, invitedUser.id);

        // Track that this node is participating
        db.addWaveFederationNode(localWave.id, sourceNode.nodeName);

        // Notify the local user via WebSocket
        const wsClients = connectedClients.get(invitedUser.id);
        if (wsClients) {
          const notification = {
            type: 'wave_invite_received',
            wave: {
              id: localWave.id,
              title: localWave.title,
              privacy: localWave.privacy,
              federationState: 'participant',
              originNode: sourceNode.nodeName,
              originWaveId: wave.id,
            },
            fromNode: sourceNode.nodeName,
          };
          wsClients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify(notification));
            }
          });
        }

        console.log(`✅ Created participant wave ${localWave.id} for @${invitedUserHandle}`);
        break;
      }

      case 'new_droplet': {
        // Handle new droplet from federated wave
        // payload: { droplet, originWaveId, author }
        console.log(`📨 Received new_droplet from ${sourceNode.nodeName}`);

        const { droplet, originWaveId, author } = payload;
        if (!droplet || !originWaveId) {
          console.error('Invalid new_droplet payload');
          break;
        }

        // Find the local participant wave for this origin
        const localWave = db.getWaveByOrigin(sourceNode.nodeName, originWaveId);
        if (!localWave) {
          console.error(`new_droplet: No local wave found for origin ${originWaveId} from ${sourceNode.nodeName}`);
          break;
        }

        // Cache the author if remote
        if (author && author.nodeName) {
          db.cacheRemoteUser({
            id: author.id,
            nodeName: author.nodeName,
            handle: author.handle,
            displayName: author.displayName,
            avatar: author.avatar,
            avatarUrl: author.avatarUrl,
            bio: author.bio,
          });
        }

        // Cache the remote droplet
        const cachedDroplet = db.cacheRemoteDroplet({
          id: droplet.id,
          waveId: localWave.id,
          originWaveId,
          originNode: sourceNode.nodeName,
          authorId: author?.id || droplet.authorId,
          authorNode: author?.nodeName || sourceNode.nodeName,
          parentId: droplet.parentId,
          content: droplet.content,
          createdAt: droplet.createdAt,
          editedAt: droplet.editedAt,
          reactions: droplet.reactions,
        });

        // Broadcast to local WebSocket clients on this wave
        broadcastToWave(localWave.id, {
          type: 'new_droplet',
          droplet: {
            ...cachedDroplet,
            sender_name: author?.displayName || 'Unknown',
            sender_handle: author?.handle || 'unknown',
            sender_avatar: author?.avatar || '?',
            sender_avatar_url: author?.avatarUrl,
          },
          isRemote: true,
        });

        console.log(`✅ Cached remote droplet ${droplet.id} in wave ${localWave.id}`);
        break;
      }

      case 'droplet_edited': {
        // Handle droplet edit from origin server
        // payload: { dropletId, originWaveId, content, editedAt, version }
        console.log(`📨 Received droplet_edited from ${sourceNode.nodeName}`);

        const { dropletId, originWaveId: editOriginWaveId, content, editedAt, version } = payload;
        if (!dropletId || !editOriginWaveId) {
          console.error('Invalid droplet_edited payload');
          break;
        }

        // Find the local participant wave
        const editLocalWave = db.getWaveByOrigin(sourceNode.nodeName, editOriginWaveId);
        if (!editLocalWave) {
          console.error(`droplet_edited: No local wave found for origin ${editOriginWaveId}`);
          break;
        }

        // Check if we have this droplet cached
        const existingDroplet = db.getRemoteDroplet(dropletId);
        if (existingDroplet) {
          // Update via cacheRemoteDroplet (upsert)
          db.cacheRemoteDroplet({
            id: dropletId,
            waveId: editLocalWave.id,
            originWaveId: editOriginWaveId,
            originNode: sourceNode.nodeName,
            authorId: existingDroplet.authorId,
            authorNode: existingDroplet.authorNode,
            parentId: existingDroplet.parentId,
            content,
            createdAt: existingDroplet.createdAt,
            editedAt,
            reactions: existingDroplet.reactions,
          });

          // Broadcast to local clients
          broadcastToWave(editLocalWave.id, {
            type: 'droplet_edited',
            dropletId,
            waveId: editLocalWave.id,
            content,
            editedAt,
            version,
            isRemote: true,
          });

          console.log(`✅ Updated remote droplet ${dropletId}`);
        }
        break;
      }

      case 'droplet_deleted': {
        // Handle droplet deletion from origin server
        // payload: { dropletId, originWaveId }
        console.log(`📨 Received droplet_deleted from ${sourceNode.nodeName}`);

        const { dropletId: deleteDropletId, originWaveId: deleteOriginWaveId } = payload;
        if (!deleteDropletId || !deleteOriginWaveId) {
          console.error('Invalid droplet_deleted payload');
          break;
        }

        // Find the local participant wave
        const deleteLocalWave = db.getWaveByOrigin(sourceNode.nodeName, deleteOriginWaveId);
        if (!deleteLocalWave) {
          console.error(`droplet_deleted: No local wave found for origin ${deleteOriginWaveId}`);
          break;
        }

        // Mark as deleted
        if (db.markRemoteDropletDeleted(deleteDropletId)) {
          // Broadcast to local clients
          broadcastToWave(deleteLocalWave.id, {
            type: 'droplet_deleted',
            dropletId: deleteDropletId,
            waveId: deleteLocalWave.id,
            isRemote: true,
          });

          console.log(`✅ Marked remote droplet ${deleteDropletId} as deleted`);
        }
        break;
      }

      case 'user_profile':
        // Handle user profile update/request
        // payload: { user }
        console.log(`📨 Received user_profile from ${sourceNode.nodeName}`);
        if (payload?.user) {
          db.cacheRemoteUser({
            id: payload.user.id,
            nodeName: sourceNode.nodeName,
            handle: payload.user.handle,
            displayName: payload.user.displayName,
            avatar: payload.user.avatar,
            avatarUrl: payload.user.avatarUrl,
            bio: payload.user.bio,
          });
        }
        break;

      case 'ping':
        // Simple connectivity test
        console.log(`📨 Received ping from ${sourceNode.nodeName}`);
        break;

      default:
        console.log(`📨 Unknown federation message type: ${type} from ${sourceNode.nodeName}`);
    }

    // Mark as processed
    db.markFederationInboxProcessed(id);

    res.json({ success: true, processed: true });
  } catch (error) {
    console.error(`Federation inbox error processing ${type}:`, error.message);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Fetch a user's public profile (for remote user resolution)
// Called by other servers to get user info
app.get('/api/federation/users/:handle', federationInboxLimiter, authenticateFederationRequest, (req, res) => {
  const handle = sanitizeInput(req.params.handle);
  const user = db.findUserByHandle(handle);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Return public profile only
  res.json({
    user: {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      createdAt: user.createdAt,
    }
  });
});

// Resolve a user identifier - supports both local and federated users
// Format: "handle" for local, "@handle@server.com" for federated
// Authenticated endpoint for local users to look up federated users
app.get('/api/users/resolve/:identifier', authenticateToken, async (req, res) => {
  const identifier = sanitizeInput(req.params.identifier);

  // Parse federated identifier: @handle@server.com or handle@server.com
  const federatedMatch = identifier.match(/^@?([^@]+)@(.+)$/);

  if (!federatedMatch) {
    // Local user lookup
    const user = db.findUserByHandle(identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isLocal: true,
        nodeName: null,
      }
    });
  }

  // Federated user lookup
  const [, handle, nodeName] = federatedMatch;

  // Check cache first
  const cachedUser = db.getRemoteUserByHandle(nodeName, handle);
  if (cachedUser) {
    // Check if cache is fresh (less than 1 hour old)
    const cacheAge = Date.now() - new Date(cachedUser.cachedAt).getTime();
    if (cacheAge < 60 * 60 * 1000) {
      return res.json({
        user: {
          ...cachedUser,
          isLocal: false,
          federatedHandle: `@${handle}@${nodeName}`,
        }
      });
    }
  }

  // Need to fetch from remote server
  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled' });
  }

  // Find the federation node
  const node = db.getFederationNodeByName(nodeName);
  if (!node) {
    return res.status(404).json({ error: 'Unknown federation server' });
  }

  if (node.status !== 'active') {
    return res.status(400).json({ error: `Federation with ${nodeName} is not active` });
  }

  try {
    const response = await sendSignedFederationRequest(node, 'GET', `/api/federation/users/${encodeURIComponent(handle)}`);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'User not found on remote server' });
      }
      throw new Error(`Remote server returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.user) {
      return res.status(502).json({ error: 'Invalid response from remote server' });
    }

    // Cache the user
    const remoteUser = db.cacheRemoteUser({
      id: data.user.id,
      nodeName,
      handle: data.user.handle,
      displayName: data.user.displayName,
      avatar: data.user.avatar,
      avatarUrl: data.user.avatarUrl,
      bio: data.user.bio,
    });

    res.json({
      user: {
        ...remoteUser,
        isLocal: false,
        federatedHandle: `@${handle}@${nodeName}`,
      }
    });
  } catch (error) {
    console.error(`Failed to resolve federated user @${handle}@${nodeName}:`, error.message);
    db.recordFederationContact(node.id, false);

    // Return cached data if available (even if stale)
    if (cachedUser) {
      return res.json({
        user: {
          ...cachedUser,
          isLocal: false,
          federatedHandle: `@${handle}@${nodeName}`,
          stale: true,
        }
      });
    }

    res.status(502).json({ error: 'Failed to reach remote server' });
  }
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

  // For breakout waves, use special method that fetches from original wave's droplet tree
  const allMessages = wave.rootDropletId && db.getDropletsForBreakoutWave
    ? db.getDropletsForBreakoutWave(wave.id, req.user.userId)
    : db.getMessagesForWave(wave.id, req.user.userId);

  const group = wave.groupId ? db.getGroup(wave.groupId) : null;

  // Pagination: limit initial droplets, return most recent ones
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const totalDroplets = allMessages.length;
  const hasMoreDroplets = totalDroplets > limit;

  // Get the most recent droplets (sorted by created_at, take last N)
  const limitedDroplets = hasMoreDroplets
    ? allMessages.slice(-limit) // Take last 'limit' droplets (most recent)
    : allMessages;

  // Build droplet tree - treat droplets whose parent isn't in the set as root droplets
  function buildDropletTree(droplets, parentId = null) {
    const dropletIds = new Set(droplets.map(d => d.id));
    return droplets
      .filter(d => {
        if (parentId === null) {
          // Root level: include droplets with no parent OR whose parent isn't in current set
          return d.parent_id === null || !dropletIds.has(d.parent_id);
        }
        return d.parent_id === parentId;
      })
      .map(d => ({ ...d, children: buildDropletTree(droplets, d.id) }));
  }

  res.json({
    ...wave,
    creator_name: creator?.displayName || 'Unknown',
    creator_handle: creator?.handle || 'unknown',
    participants,
    // New droplet terminology
    droplets: buildDropletTree(limitedDroplets),
    all_droplets: limitedDroplets,
    total_droplets: totalDroplets,
    hasMoreDroplets,
    // Legacy backward compatibility
    messages: buildDropletTree(limitedDroplets),
    all_messages: limitedDroplets,
    total_messages: totalDroplets,
    hasMoreMessages: hasMoreDroplets,
    group_name: group?.name,
    can_edit: wave.createdBy === req.user.userId,
  });
});

// Paginated droplets endpoint for loading droplets in batches (v1.10.0)
app.get('/api/waves/:id/droplets', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (!db.canAccessWave(waveId, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per request
  const before = req.query.before; // Droplet ID to load droplets before

  // Get all droplets for this wave (filtered for blocked/muted)
  // For breakout waves, use special method that fetches from original wave's droplet tree
  let allDroplets = wave.rootDropletId && db.getDropletsForBreakoutWave
    ? db.getDropletsForBreakoutWave(wave.id, req.user.userId)
    : db.getMessagesForWave(wave.id, req.user.userId);

  // Sort by created_at descending (newest first) for pagination
  allDroplets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // If 'before' is specified, filter to only droplets before that one
  if (before) {
    const beforeIndex = allDroplets.findIndex(d => d.id === before);
    if (beforeIndex !== -1) {
      allDroplets = allDroplets.slice(beforeIndex + 1);
    }
  }

  // Take the requested limit
  const droplets = allDroplets.slice(0, limit);
  const hasMore = allDroplets.length > limit;

  // Reverse to return oldest-first within the batch (natural reading order)
  droplets.reverse();

  // Get total using same method
  const totalDroplets = wave.rootDropletId && db.getDropletsForBreakoutWave
    ? db.getDropletsForBreakoutWave(wave.id, req.user.userId).length
    : db.getMessagesForWave(wave.id, req.user.userId).length;

  res.json({
    droplets,
    hasMore,
    total: totalDroplets,
  });
});

// Paginated messages endpoint for loading messages in batches (Legacy - backward compatibility)
app.get('/api/waves/:id/messages', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (!db.canAccessWave(waveId, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per request
  const before = req.query.before; // Message ID to load messages before

  // Get all messages for this wave (filtered for blocked/muted)
  // For breakout waves, use special method that fetches from original wave's droplet tree
  let allMessages = wave.rootDropletId && db.getDropletsForBreakoutWave
    ? db.getDropletsForBreakoutWave(wave.id, req.user.userId)
    : db.getMessagesForWave(wave.id, req.user.userId);

  // Sort by created_at descending (newest first) for pagination
  allMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // If 'before' is specified, filter to only messages before that one
  if (before) {
    const beforeIndex = allMessages.findIndex(m => m.id === before);
    if (beforeIndex !== -1) {
      allMessages = allMessages.slice(beforeIndex + 1);
    }
  }

  // Take the requested limit
  const messages = allMessages.slice(0, limit);
  const hasMore = allMessages.length > limit;

  // Reverse to return oldest-first within the batch (natural reading order)
  messages.reverse();

  // Get total using same method
  const totalMessages = wave.rootDropletId && db.getDropletsForBreakoutWave
    ? db.getDropletsForBreakoutWave(wave.id, req.user.userId).length
    : db.getMessagesForWave(wave.id, req.user.userId).length;

  res.json({
    messages,
    hasMore,
    total: totalMessages,
  });
});

app.post('/api/waves', authenticateToken, async (req, res) => {
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

  // Separate local and federated participants
  const localParticipantIds = [];
  const federatedParticipants = []; // { handle, nodeName, node }

  if (req.body.participants && Array.isArray(req.body.participants)) {
    for (const participant of req.body.participants) {
      const federated = parseFederatedIdentifier(participant);
      if (federated && FEDERATION_ENABLED) {
        // Federated participant - look up the node
        const node = db.getFederationNodeByName(federated.nodeName);
        if (node && node.status === 'active') {
          federatedParticipants.push({ ...federated, node });
        } else {
          console.warn(`Skipping federated participant @${federated.handle}@${federated.nodeName}: node not found or not active`);
        }
      } else if (!federated) {
        // Local participant - could be user ID or handle
        const user = db.findUserById(participant) || db.findUserByHandle(participant);
        if (user) {
          localParticipantIds.push(user.id);
        }
      }
    }
  }

  // Determine if this is a federated wave
  const hasFederatedParticipants = federatedParticipants.length > 0;

  const wave = db.createWave({
    title,
    privacy: hasFederatedParticipants ? 'crossServer' : privacy, // Force cross-server if federated
    groupId: privacy === 'group' ? sanitizeInput(req.body.groupId) : null,
    createdBy: req.user.userId,
    participants: localParticipantIds,
  });

  // If federated, mark as origin and send invites
  if (hasFederatedParticipants) {
    db.setWaveAsOrigin(wave.id);

    // Get creator info for participant list
    const creator = db.findUserById(req.user.userId);
    const localParticipants = db.getWaveParticipants(wave.id);

    // Send wave invites to each federated node
    // Group by node to send one invite per node
    const nodeInvites = new Map();
    for (const fp of federatedParticipants) {
      const nodeKey = fp.nodeName;
      if (!nodeInvites.has(nodeKey)) {
        nodeInvites.set(nodeKey, { node: fp.node, handles: [] });
      }
      nodeInvites.get(nodeKey).handles.push(fp.handle);
    }

    // Send invites asynchronously (don't block response)
    for (const [nodeName, { node, handles }] of nodeInvites) {
      for (const handle of handles) {
        sendWaveInvite(node, wave, localParticipants, handle).catch(err => {
          console.error(`Failed to send wave invite to ${nodeName}:`, err.message);
        });
      }
      // Track federation relationship
      db.addWaveFederationNode(wave.id, nodeName);
    }
  }

  const result = {
    ...wave,
    creator_name: db.findUserById(req.user.userId)?.displayName || 'Unknown',
    creator_handle: db.findUserById(req.user.userId)?.handle || 'unknown',
    participants: db.getWaveParticipants(wave.id),
    message_count: 0,
    federationState: hasFederatedParticipants ? 'origin' : 'local',
    federatedNodes: hasFederatedParticipants ? federatedParticipants.map(fp => fp.nodeName) : [],
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

// ============ Droplet Routes (v1.10.0) ============
// Note: /api/messages endpoints below are backward-compatible aliases

// Create droplet
app.post('/api/droplets', authenticateToken, (req, res) => {
  const waveId = sanitizeInput(req.body.wave_id || req.body.thread_id);
  const content = req.body.content;
  if (!waveId || !content) return res.status(400).json({ error: 'Wave ID and content required' });

  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });

  const canAccess = db.canAccessWave(waveId, req.user.userId);
  if (!canAccess) return res.status(403).json({ error: 'Access denied' });

  // Auto-join public waves
  const isParticipant = db.isWaveParticipant(waveId, req.user.userId);
  if (!isParticipant && wave.privacy === 'public') {
    db.addWaveParticipant(waveId, req.user.userId);
  }

  if (content.length > 10000) return res.status(400).json({ error: 'Droplet too long' });

  // For rippled waves, default parent to root droplet if no parent specified
  let parentId = req.body.parent_id ? sanitizeInput(req.body.parent_id) : null;
  if (!parentId && wave.rootDropletId) {
    parentId = wave.rootDropletId;
  }

  const droplet = db.createMessage({
    waveId,
    parentId,
    authorId: req.user.userId,
    content,
    privacy: wave.privacy,
  });

  // Create in-app notifications for mentions, replies, and wave activity
  const author = db.findUserById(req.user.userId);
  if (author) {
    createDropletNotifications(droplet, wave, author);
  }

  // Create push notification payload
  const senderName = droplet.sender_name || db.findUserById(req.user.userId)?.displayName || 'Someone';
  const contentPreview = content.replace(/<[^>]*>/g, '').substring(0, 100);
  const pushPayload = {
    title: `New droplet in ${wave.title}`,
    body: `${senderName}: ${contentPreview}${content.length > 100 ? '...' : ''}`,
    url: `/?wave=${waveId}`,
    waveId,
    dropletId: droplet.id
  };

  // Broadcast to connected users and send push to offline users
  broadcastToWaveWithPush(
    waveId,
    { type: 'new_droplet', data: droplet },
    pushPayload,
    null,
    req.user.userId // Exclude sender from push notifications
  );

  // Also broadcast legacy event for backward compatibility
  broadcastToWave(waveId, { type: 'new_message', data: droplet });

  // Federation: If this is an origin wave, send to all federated nodes
  if (FEDERATION_ENABLED && wave.federationState === 'origin') {
    const ourIdentity = db.getServerIdentity();
    sendDropletToFederatedNodes(waveId, 'new_droplet', {
      droplet: {
        id: droplet.id,
        parentId: droplet.parentId,
        content: droplet.content,
        createdAt: droplet.createdAt,
        editedAt: droplet.editedAt,
        reactions: droplet.reactions,
      },
      originWaveId: waveId,
      author: author ? {
        id: author.id,
        handle: author.handle,
        displayName: author.displayName,
        avatar: author.avatar,
        avatarUrl: author.avatarUrl,
        bio: author.bio,
        nodeName: ourIdentity?.nodeName,
      } : null,
    }).catch(err => {
      console.error('Federation droplet delivery error:', err.message);
    });
  }

  res.status(201).json(droplet);
});

// Edit droplet
app.put('/api/droplets/:id', authenticateToken, (req, res) => {
  const dropletId = sanitizeInput(req.params.id);
  const droplet = db.getMessage(dropletId);
  if (!droplet) return res.status(404).json({ error: 'Droplet not found' });
  if (droplet.authorId !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

  const content = req.body.content;
  if (content.length > 10000) return res.status(400).json({ error: 'Droplet too long' });

  const updated = db.updateMessage(dropletId, content);
  broadcastToWave(droplet.waveId, { type: 'droplet_edited', data: updated });
  broadcastToWave(droplet.waveId, { type: 'message_edited', data: updated }); // Legacy

  // Federation: If this is an origin wave, send edit to federated nodes
  const wave = db.getWave(droplet.waveId);
  if (FEDERATION_ENABLED && wave?.federationState === 'origin') {
    sendDropletToFederatedNodes(droplet.waveId, 'droplet_edited', {
      dropletId: dropletId,
      originWaveId: droplet.waveId,
      content: updated.content,
      editedAt: updated.editedAt,
      version: updated.version,
    }).catch(err => {
      console.error('Federation droplet edit delivery error:', err.message);
    });
  }

  res.json(updated);
});

// Delete droplet
app.delete('/api/droplets/:id', authenticateToken, (req, res) => {
  const dropletId = sanitizeInput(req.params.id);
  const droplet = db.getMessage(dropletId);

  if (!droplet) return res.status(404).json({ error: 'Droplet not found' });
  if (droplet.authorId !== req.user.userId) {
    return res.status(403).json({ error: 'Only droplet author can delete' });
  }

  // Save wave ID before deletion for federation
  const waveId = droplet.waveId;
  const wave = db.getWave(waveId);

  const result = db.deleteMessage(dropletId, req.user.userId);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Broadcast deletion to all participants
  broadcastToWave(result.waveId, {
    type: 'droplet_deleted',
    dropletId: result.dropletId || result.messageId,
    waveId: result.waveId
  });
  // Legacy event
  broadcastToWave(result.waveId, {
    type: 'message_deleted',
    messageId: result.dropletId || result.messageId,
    waveId: result.waveId
  });

  // Federation: If this is an origin wave, send deletion to federated nodes
  if (FEDERATION_ENABLED && wave?.federationState === 'origin') {
    sendDropletToFederatedNodes(waveId, 'droplet_deleted', {
      dropletId: dropletId,
      originWaveId: waveId,
    }).catch(err => {
      console.error('Federation droplet delete delivery error:', err.message);
    });
  }

  res.json({ success: true });
});

// Toggle emoji reaction on droplet
app.post('/api/droplets/:id/react', authenticateToken, (req, res) => {
  const dropletId = sanitizeInput(req.params.id);
  const emoji = req.body.emoji;

  if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
    return res.status(400).json({ error: 'Invalid emoji' });
  }

  const result = db.toggleMessageReaction(dropletId, req.user.userId, emoji);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Mark droplet as read since user has seen it (prevents unread indicator after reaction)
  db.markMessageAsRead(dropletId, req.user.userId);

  // Broadcast reaction update to all participants
  broadcastToWave(result.waveId, {
    type: 'droplet_reaction',
    dropletId: result.dropletId || result.messageId,
    reactions: result.reactions,
    waveId: result.waveId,
  });
  // Legacy event
  broadcastToWave(result.waveId, {
    type: 'message_reaction',
    messageId: result.dropletId || result.messageId,
    reactions: result.reactions,
    waveId: result.waveId,
  });

  res.json({ success: true, reactions: result.reactions });
});

// Mark individual droplet as read
app.post('/api/droplets/:id/read', authenticateToken, (req, res) => {
  const dropletId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  console.log(`📖 Marking droplet ${dropletId} as read for user ${userId}`);

  if (!db.markMessageAsRead(dropletId, userId)) {
    console.log(`❌ Failed to mark droplet ${dropletId} as read`);
    return res.status(404).json({ error: 'Droplet not found' });
  }

  // Also mark any notifications for this droplet as read
  const notificationsMarked = db.markNotificationsReadByDroplet(dropletId, userId);
  if (notificationsMarked > 0) {
    console.log(`🔔 Marked ${notificationsMarked} notification(s) as read for droplet ${dropletId}`);
    // Broadcast notification count update to user
    broadcast({ type: 'unread_count_update', userId });
  }

  console.log(`✅ Droplet ${dropletId} marked as read`);
  res.json({ success: true });
});

// Ripple a droplet into a new wave
app.post('/api/droplets/:id/ripple', authenticateToken, (req, res) => {
  const dropletId = sanitizeInput(req.params.id);
  const { title, participants } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Get the droplet to check permissions
  const droplet = db.getMessage ? db.getMessage(dropletId) : null;
  if (!droplet) {
    return res.status(404).json({ error: 'Droplet not found' });
  }

  // Check if user has access to the wave containing this droplet
  const wave = db.getWave(droplet.waveId || droplet.wave_id);
  if (!wave) {
    return res.status(404).json({ error: 'Wave not found' });
  }

  if (!db.canAccessWave(wave.id, req.user.userId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Validate participants array
  let participantIds = [];
  if (Array.isArray(participants)) {
    participantIds = participants.filter(p => typeof p === 'string');
  }

  // Perform the ripple (uses existing breakoutDroplet method internally)
  const result = db.rippleDroplet ? db.rippleDroplet(dropletId, title.trim(), participantIds, req.user.userId)
    : db.breakoutDroplet(dropletId, title.trim(), participantIds, req.user.userId);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Broadcast to original wave that a droplet was rippled
  broadcastToWave(result.originalWaveId, {
    type: 'droplet_rippled',
    dropletId: dropletId,
    newWaveId: result.newWave.id,
    newWaveTitle: result.newWave.title,
    waveId: result.originalWaveId,
  });

  // Broadcast to participants of the new wave
  broadcastToWave(result.newWave.id, {
    type: 'wave_created',
    wave: result.newWave,
  });

  // Create ripple notifications for original wave participants
  const actor = db.findUserById(req.user.userId);
  if (actor) {
    createRippleNotifications(wave, result.newWave, droplet, actor);
  }

  console.log(`🌊 Droplet ${dropletId} rippled to new wave: ${result.newWave.title}`);

  res.json({
    success: true,
    newWave: result.newWave,
    originalWaveId: result.originalWaveId,
    childCount: result.childCount,
  });
});

// Legacy endpoint - backward compatibility
app.post('/api/droplets/:id/breakout', authenticateToken, (req, res) => {
  // Redirect to ripple endpoint
  req.url = `/api/droplets/${req.params.id}/ripple`;
  return app._router.handle(req, res);
});

// ============ Message Routes (Legacy - v1.9.0 backward compatibility) ============
// DEPRECATED: These endpoints are deprecated as of v1.10.0. Use /api/droplets/* instead.
// They will be removed in a future version.

// Middleware to add deprecation headers and log usage
const deprecatedEndpoint = (req, res, next) => {
  res.set('X-Deprecated', 'true');
  res.set('X-Deprecated-Message', 'This endpoint is deprecated. Use /api/droplets/* instead.');
  res.set('Sunset', 'Sat, 01 Mar 2026 00:00:00 GMT');
  console.warn(`⚠️ DEPRECATED: ${req.method} ${req.originalUrl} called by user ${req.user?.userId || 'unknown'}`);
  next();
};

app.post('/api/messages', authenticateToken, deprecatedEndpoint, (req, res) => {
  const waveId = sanitizeInput(req.body.wave_id || req.body.thread_id);
  const content = req.body.content;
  if (!waveId || !content) return res.status(400).json({ error: 'Wave ID and content required' });

  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });

  const canAccess = db.canAccessWave(waveId, req.user.userId);
  if (!canAccess) return res.status(403).json({ error: 'Access denied' });

  // Auto-join public waves
  const isParticipant = db.isWaveParticipant(waveId, req.user.userId);
  if (!isParticipant && wave.privacy === 'public') {
    db.addWaveParticipant(waveId, req.user.userId);
  }

  if (content.length > 10000) return res.status(400).json({ error: 'Message too long' });

  // For rippled waves, default parent to root droplet if no parent specified
  let parentId = req.body.parent_id ? sanitizeInput(req.body.parent_id) : null;
  if (!parentId && wave.rootDropletId) {
    parentId = wave.rootDropletId;
  }

  const message = db.createMessage({
    waveId,
    parentId,
    authorId: req.user.userId,
    content,
    privacy: wave.privacy,
  });

  // Create push notification payload
  const senderName = message.sender_name || db.findUserById(req.user.userId)?.displayName || 'Someone';
  const contentPreview = content.replace(/<[^>]*>/g, '').substring(0, 100);
  const pushPayload = {
    title: `New message in ${wave.title}`,
    body: `${senderName}: ${contentPreview}${content.length > 100 ? '...' : ''}`,
    url: `/?wave=${waveId}`,
    waveId,
    messageId: message.id // Include messageId for unique notification tags
  };

  // Broadcast to connected users and send push to offline users
  broadcastToWaveWithPush(
    waveId,
    { type: 'new_message', data: message },
    pushPayload,
    null,
    req.user.userId // Exclude sender from push notifications
  );
  res.status(201).json(message);
});

app.put('/api/messages/:id', authenticateToken, deprecatedEndpoint, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const message = db.getMessage(messageId);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.authorId !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

  const content = req.body.content;
  if (content.length > 10000) return res.status(400).json({ error: 'Message too long' });

  const updated = db.updateMessage(messageId, content);
  broadcastToWave(message.waveId, { type: 'message_edited', data: updated });
  res.json(updated);
});

app.delete('/api/messages/:id', authenticateToken, deprecatedEndpoint, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const message = db.getMessage(messageId);

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
app.post('/api/messages/:id/react', authenticateToken, deprecatedEndpoint, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const emoji = req.body.emoji;

  if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
    return res.status(400).json({ error: 'Invalid emoji' });
  }

  const result = db.toggleMessageReaction(messageId, req.user.userId, emoji);
  if (!result.success) return res.status(400).json({ error: result.error });

  // Mark message as read since user has seen it (prevents unread indicator after reaction)
  db.markMessageAsRead(messageId, req.user.userId);

  // Broadcast reaction update to all participants
  broadcastToWave(result.waveId, {
    type: 'message_reaction',
    messageId: result.messageId,
    reactions: result.reactions,
    waveId: result.waveId,
  });

  res.json({ success: true, reactions: result.reactions });
});

// Mark individual message as read (legacy endpoint)
app.post('/api/messages/:id/read', authenticateToken, deprecatedEndpoint, (req, res) => {
  const messageId = sanitizeInput(req.params.id);
  const userId = req.user.userId;

  console.log(`📖 Marking message ${messageId} as read for user ${userId}`);

  if (!db.markMessageAsRead(messageId, userId)) {
    console.log(`❌ Failed to mark message ${messageId} as read`);
    return res.status(404).json({ error: 'Message not found' });
  }

  // Also mark any notifications for this droplet as read
  const notificationsMarked = db.markNotificationsReadByDroplet(messageId, userId);
  if (notificationsMarked > 0) {
    console.log(`🔔 Marked ${notificationsMarked} notification(s) as read for message ${messageId}`);
    broadcast({ type: 'unread_count_update', userId });
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
const userViewingState = new Map(); // Track which wave each user is viewing { userId: { waveId, timestamp } }

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
      } else if (message.type === 'ping') {
        // Respond to client heartbeat ping with pong
        ws.send(JSON.stringify({ type: 'pong' }));
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
      } else if (message.type === 'viewing_wave') {
        // Track which wave the user is viewing (for notification suppression)
        if (!userId) return; // Must be authenticated

        const waveId = message.waveId ? sanitizeInput(message.waveId) : null;
        ws.viewingWaveId = waveId;

        // Also track at user level for multiple connections
        if (waveId) {
          userViewingState.set(userId, { waveId, timestamp: Date.now() });
        } else {
          userViewingState.delete(userId);
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
        userViewingState.delete(userId); // Clean up viewing state
      }
    }
  });

  // Mark connection as alive on pong response
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Server-side heartbeat: Send native ping every 30 seconds, terminate dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      // Connection didn't respond to last ping - terminate it
      console.log('💀 Terminating dead WebSocket connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(); // Send native WebSocket ping frame
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ============ Federation Queue Processor ============

// Process federation queue every 30 seconds (when enabled)
let federationQueueInterval = null;

async function processFederationQueue() {
  if (!FEDERATION_ENABLED) return;

  // Get pending messages that are ready for retry
  const pendingMessages = db.getPendingFederationMessages(10);
  if (pendingMessages.length === 0) return;

  console.log(`📤 Processing ${pendingMessages.length} federation queue messages...`);

  for (const msg of pendingMessages) {
    const node = db.getFederationNodeByName(msg.targetNode);
    if (!node || node.status !== 'active') {
      console.warn(`⚠️  Skipping message ${msg.id}: node ${msg.targetNode} not found or not active`);
      db.markFederationMessageFailed(msg.id, 'Target node not found or not active');
      continue;
    }

    try {
      const response = await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', msg.payload);

      if (response.ok) {
        db.markFederationMessageDelivered(msg.id);
        console.log(`✅ Delivered ${msg.messageType} to ${msg.targetNode}`);
      } else {
        const errorText = await response.text();
        const errorMsg = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
        db.markFederationMessageFailed(msg.id, errorMsg);
        console.error(`❌ Failed to deliver ${msg.messageType} to ${msg.targetNode}: ${errorMsg}`);
      }
    } catch (error) {
      db.markFederationMessageFailed(msg.id, error.message);
      console.error(`❌ Error delivering ${msg.messageType} to ${msg.targetNode}:`, error.message);
    }
  }
}

// Queue a message for federation delivery with automatic retries
function queueFederationDelivery(targetNodeName, messageType, payload) {
  if (!FEDERATION_ENABLED) return null;

  // Create a full message payload with ID
  const messageId = `${messageType}-${payload.droplet?.id || payload.dropletId || payload.wave?.id || uuidv4()}-${Date.now()}`;
  const fullPayload = {
    id: messageId,
    type: messageType,
    payload,
  };

  return db.queueFederationMessage({
    targetNode: targetNodeName,
    messageType,
    payload: fullPayload,
  });
}

// Start federation queue processor if enabled
if (FEDERATION_ENABLED) {
  federationQueueInterval = setInterval(processFederationQueue, 30000);
  console.log('📤 Federation queue processor started (30s interval)');

  // Also cleanup old messages daily
  setInterval(() => {
    const cleaned = db.cleanupOldFederationMessages(7);
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old federation messages`);
    }
  }, 24 * 60 * 60 * 1000); // Daily
}

// ============ Notification Creation Helpers ============

// Default notification preferences (must match server endpoint defaults)
const DEFAULT_NOTIF_PREFS = {
  enabled: true,
  directMentions: 'always',
  replies: 'always',
  waveActivity: 'app_closed',
  rippleEvents: 'app_closed',
  soundEnabled: false,
  suppressWhileFocused: true,
};

// Check if a user should receive a notification based on their preferences
function shouldCreateNotification(userId, notificationType) {
  const user = db.findUserById(userId);
  if (!user) return false;

  const prefs = user.notificationPreferences || DEFAULT_NOTIF_PREFS;

  // Global kill switch
  if (!prefs.enabled) return false;

  // Map notification type to preference key
  const prefKeyMap = {
    direct_mention: 'directMentions',
    reply: 'replies',
    wave_activity: 'waveActivity',
    ripple: 'rippleEvents',
  };

  const prefKey = prefKeyMap[notificationType];
  if (!prefKey) return true; // Unknown type, allow by default

  const level = prefs[prefKey] || 'always';

  // 'never' = don't create notification at all
  if (level === 'never') return false;

  // 'always' or 'app_closed' = create notification
  // (app_closed just affects push behavior, not in-app notifications)
  return true;
}

// Extract @mentions from content - matches @handle patterns
function extractMentions(content) {
  // Match @handle patterns (alphanumeric and underscores)
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  return [...new Set(mentions)]; // Remove duplicates
}

// Create notifications for a new droplet
function createDropletNotifications(droplet, wave, author) {
  const notificationsToSend = [];
  const contentPreview = droplet.content.replace(/<[^>]*>/g, '').substring(0, 100);

  // Get wave participants
  const participants = db.getWaveParticipants(wave.id);
  const participantIds = new Set(participants.map(p => p.id));

  // 1. Check for @mentions
  const mentionedHandles = extractMentions(droplet.content);
  const mentionedUsers = new Set();

  for (const handle of mentionedHandles) {
    const mentionedUser = db.findUserByHandle(handle);
    if (mentionedUser && mentionedUser.id !== author.id && participantIds.has(mentionedUser.id)) {
      mentionedUsers.add(mentionedUser.id);

      // Check user's notification preferences
      if (!shouldCreateNotification(mentionedUser.id, 'direct_mention')) continue;

      // Create direct mention notification
      const notification = db.createNotification({
        userId: mentionedUser.id,
        type: 'direct_mention',
        waveId: wave.id,
        dropletId: droplet.id,
        actorId: author.id,
        title: `${author.displayName} mentioned you`,
        body: `in ${wave.title}`,
        preview: contentPreview,
        groupKey: `mention:${wave.id}:${droplet.id}`
      });

      notificationsToSend.push({ userId: mentionedUser.id, notification });
    }
  }

  // 2. Check if this is a reply - notify the parent author
  if (droplet.parentId) {
    const parentDroplet = db.getMessage(droplet.parentId);
    if (parentDroplet && parentDroplet.authorId !== author.id && !mentionedUsers.has(parentDroplet.authorId)) {
      // Check user's notification preferences
      if (shouldCreateNotification(parentDroplet.authorId, 'reply')) {
        const notification = db.createNotification({
          userId: parentDroplet.authorId,
          type: 'reply',
          waveId: wave.id,
          dropletId: droplet.id,
          actorId: author.id,
          title: `${author.displayName} replied to you`,
          body: `in ${wave.title}`,
          preview: contentPreview,
          groupKey: `reply:${wave.id}:${parentDroplet.id}`
        });

        notificationsToSend.push({ userId: parentDroplet.authorId, notification });
      }
      mentionedUsers.add(parentDroplet.authorId); // Don't send wave_activity to them
    }
  }

  // 3. Wave activity notifications for other participants (not author, not mentioned, not replied-to)
  for (const participant of participants) {
    if (participant.id === author.id) continue;
    if (mentionedUsers.has(participant.id)) continue;

    // Check user's notification preferences
    if (!shouldCreateNotification(participant.id, 'wave_activity')) continue;

    // Check wave notification settings
    if (!db.shouldNotifyForWave(participant.id, wave.id, 'wave_activity')) continue;

    // Skip wave_activity if user is currently viewing this wave (focus awareness)
    const viewingState = userViewingState.get(participant.id);
    if (viewingState && viewingState.waveId === wave.id) {
      // User is actively viewing this wave - suppress wave_activity notification
      continue;
    }

    const notification = db.createNotification({
      userId: participant.id,
      type: 'wave_activity',
      waveId: wave.id,
      dropletId: droplet.id,
      actorId: author.id,
      title: `New droplet in ${wave.title}`,
      body: `from ${author.displayName}`,
      preview: contentPreview,
      groupKey: `wave:${wave.id}`
    });

    notificationsToSend.push({ userId: participant.id, notification });
  }

  // Broadcast notifications via WebSocket
  for (const { userId, notification } of notificationsToSend) {
    broadcastToUser(userId, { type: 'notification', notification });
  }

  return notificationsToSend.length;
}

// Create notifications when a droplet is rippled to a new wave
function createRippleNotifications(originalWave, newWave, rippledDroplet, actor) {
  const notificationsToSend = [];

  // Get participants of the original wave (excluding the actor who rippled)
  const originalParticipants = db.getWaveParticipants(originalWave.id);

  for (const participant of originalParticipants) {
    if (participant.id === actor.id) continue;

    // Check user's notification preferences
    if (!shouldCreateNotification(participant.id, 'ripple')) continue;

    // Create ripple notification
    const notification = db.createNotification({
      userId: participant.id,
      type: 'ripple',
      waveId: newWave.id,
      dropletId: rippledDroplet.id,
      actorId: actor.id,
      title: `${actor.displayName} created a ripple`,
      body: `"${newWave.title}" from ${originalWave.title}`,
      preview: rippledDroplet.content?.replace(/<[^>]*>/g, '').substring(0, 100) || '',
      groupKey: `ripple:${newWave.id}`
    });

    notificationsToSend.push({ userId: participant.id, notification });
  }

  // Broadcast notifications via WebSocket
  for (const { userId, notification } of notificationsToSend) {
    broadcastToUser(userId, { type: 'notification', notification });
  }

  return notificationsToSend.length;
}

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

function broadcastToUser(userId, message) {
  broadcast(message, [userId]);
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

// Send push notification to a user who isn't connected via WebSocket
async function sendPushNotification(userId, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = db.getPushSubscriptions(userId);
  if (subscriptions.length === 0) return;

  const payloadString = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: sub.keys
      }, payloadString);
    } catch (error) {
      // Clean up invalid subscriptions (expired, VAPID mismatch, or endpoint issues)
      if (error.statusCode === 410 || error.statusCode === 404 || error.statusCode === 401 ||
          error.message?.includes('unexpected response code')) {
        db.removeExpiredPushSubscription(sub.endpoint);
        console.log(`🔕 Removed invalid push subscription (${error.statusCode || error.message})`);
      } else {
        console.error('Push notification error:', error.statusCode, error.message);
      }
    }
  }
}

// Broadcast to wave with optional push notifications for offline users
function broadcastToWaveWithPush(waveId, message, pushPayload = null, excludeWs = null, excludeUserId = null) {
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

  for (const userId of recipients) {
    // Skip the excluded user (usually the message sender)
    if (excludeUserId && userId === excludeUserId) continue;

    const isConnected = clients.has(userId) && clients.get(userId).size > 0;

    if (isConnected) {
      // User has active WebSocket - send via WebSocket
      for (const ws of clients.get(userId)) {
        if (excludeWs && ws === excludeWs) continue;
        if (ws.readyState === 1) ws.send(JSON.stringify(message));
      }
    }

    // Always send push notification if payload provided (for backgrounded PWAs)
    // The service worker will show the notification even if the app is in background
    // On Android PWA, WebSocket may stay connected but app is not in foreground
    // Push notifications are the only reliable way to alert backgrounded users
    if (pushPayload) {
      sendPushNotification(userId, pushPayload);
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
║  SECURE COMMUNICATIONS SYSTEM v1.13.0                      ║
╠════════════════════════════════════════════════════════════╣
║  🔒 Security: Rate limiting, XSS protection, Helmet        ║
║  🌐 Federation: Server-to-server communication             ║
║  👥 Groups: Create groups, manage members, group waves     ║
║  🆔 Identity: UUID-based with changeable handles           ║
║  📝 Profiles: Change password, display name, avatar        ║
║  📦 Archives: Personal wave archiving                      ║
╠════════════════════════════════════════════════════════════╣
║  PORT=${PORT} | JWT=${JWT_SECRET === 'cortex-default-secret-CHANGE-ME' ? '⚠️ DEFAULT' : '✅ Custom'} | CORS=${ALLOWED_ORIGINS ? '✅' : '⚠️ All'}
║  FEDERATION=${process.env.FEDERATION_ENABLED === 'true' ? '✅' : '❌'} | Server: http://localhost:${PORT}
╚════════════════════════════════════════════════════════════╝
`);
});
