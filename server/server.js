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
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { DatabaseSQLite } from './database-sqlite.js';
import { getEmailService } from './email-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const VERSION = packageJson.version;

// ============ Configuration ============
const PORT = process.env.PORT || 3001;

// JWT_SECRET is REQUIRED in production - fail fast if not configured
const JWT_SECRET_ENV = process.env.JWT_SECRET;
if (!JWT_SECRET_ENV) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is required in production');
    console.error('Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }
  console.warn('⚠️  WARNING: JWT_SECRET not set, using insecure default for development only');
}
const JWT_SECRET = JWT_SECRET_ENV || 'cortex-dev-secret-DO-NOT-USE-IN-PROD';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Session management configuration (v1.18.0)
const SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const SESSION_TRACKING_ENABLED = process.env.SESSION_TRACKING_ENABLED !== 'false'; // Default true

// GIF API configuration (GIPHY and/or Tenor)
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || null;
const TENOR_API_KEY = process.env.TENOR_API_KEY || null;
const GIF_PROVIDER = process.env.GIF_PROVIDER || 'giphy'; // 'giphy', 'tenor', or 'both'

// Crawl Bar API configuration (v1.15.0)
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || null;
// Weather providers (tried in order: OpenWeatherMap → WeatherAPI → Tomorrow.io)
const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY || null;
const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY || null;
const TOMORROWIO_API_KEY = process.env.TOMORROWIO_API_KEY || null;
// News providers (tried in order, results combined)
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || null;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || null;
const MEDIASTACK_API_KEY = process.env.MEDIASTACK_API_KEY || null;
const NEWS_RSS_FEEDS = process.env.NEWS_RSS_FEEDS ? process.env.NEWS_RSS_FEEDS.split(',').map(s => s.trim()).filter(Boolean) : [];
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || null;

// Log crawl bar configuration status
if (FINNHUB_API_KEY) console.log('📈 Stock data enabled (Finnhub)');
const weatherProviders = [OPENWEATHERMAP_API_KEY && 'OpenWeatherMap', WEATHERAPI_KEY && 'WeatherAPI', TOMORROWIO_API_KEY && 'Tomorrow.io'].filter(Boolean);
if (weatherProviders.length > 0) console.log(`🌤️  Weather data enabled (${weatherProviders.join(', ')})`);
const newsProviders = [NEWSAPI_KEY && 'NewsAPI', GNEWS_API_KEY && 'GNews', MEDIASTACK_API_KEY && 'MediaStack', NEWS_RSS_FEEDS.length > 0 && `${NEWS_RSS_FEEDS.length} RSS feeds`].filter(Boolean);
if (newsProviders.length > 0) console.log(`📰 News data enabled (${newsProviders.join(', ')})`);

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

// HTTPS enforcement configuration (v1.18.0)
const ENFORCE_HTTPS = process.env.ENFORCE_HTTPS === 'true';
const CORS_STRICT_MODE = process.env.CORS_STRICT_MODE !== 'false'; // Default true

// ============ Role-Based Authorization (v1.20.0) ============
const ROLES = { ADMIN: 'admin', MODERATOR: 'moderator', USER: 'user' };
const ROLE_HIERARCHY = { admin: 3, moderator: 2, user: 1 };

/**
 * Get user's role (backward compatible with isAdmin boolean)
 */
function getUserRole(user) {
  if (!user) return null;
  if (user.role) return user.role;
  return user.isAdmin ? ROLES.ADMIN : ROLES.USER;
}

/**
 * Check if user has at least the specified role level
 */
function hasRole(user, requiredRole) {
  const userRole = getUserRole(user);
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Authorization check with 403 response - returns false if unauthorized
 * Usage: if (!requireRole(user, ROLES.ADMIN, res)) return;
 */
function requireRole(user, role, res) {
  if (!hasRole(user, role)) {
    const roleName = role.charAt(0).toUpperCase() + role.slice(1);
    res.status(403).json({ error: `${roleName} access required` });
    return false;
  }
  return true;
}

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

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour per email
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + ':' + (req.body?.email || 'unknown'),
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

const RATE_LIMIT_CRAWL_MAX = parseInt(process.env.RATE_LIMIT_CRAWL_MAX) || 60;
const crawlLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_CRAWL_MAX,
  message: { error: 'Too many crawl bar requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// WebSocket message rate limits (per user, per minute)
const WS_RATE_LIMIT_MESSAGES = parseInt(process.env.WS_RATE_LIMIT_MESSAGES) || 60;
const WS_RATE_LIMIT_TYPING = parseInt(process.env.WS_RATE_LIMIT_TYPING) || 20;
const WS_RATE_WINDOW_MS = 60 * 1000; // 1 minute window

// ============ Security: Account Lockout ============
// Now uses database persistence (see database-sqlite.js account lockout methods)
// These wrapper functions are called after db is initialized

function checkAccountLockout(handle) {
  // db is initialized at runtime before these are called
  if (typeof db !== 'undefined' && db.isAccountLocked) {
    const result = db.isAccountLocked(handle);
    if (result.locked) {
      const remainingMs = new Date(result.lockedUntil).getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return { locked: true, remainingMin };
    }
    return { locked: false };
  }
  return { locked: false }; // Fallback if db not ready
}

function recordFailedAttempt(handle) {
  if (typeof db !== 'undefined' && db.recordFailedLogin) {
    const result = db.recordFailedLogin(handle);
    if (result.locked) {
      console.log(`🔒 Account locked: ${handle}`);
    }
    return result;
  }
}

function clearFailedAttempts(handle) {
  if (typeof db !== 'undefined' && db.clearFailedLogins) {
    db.clearFailedLogins(handle);
  }
}

// ============ Security: Session Management (v1.18.0) ============

// Hash token for storage (don't store raw JWTs in database)
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Create a session record for a token
function createSession(userId, token, req) {
  if (!SESSION_TRACKING_ENABLED || !db.hasSessionTable || !db.hasSessionTable()) {
    return null;
  }
  try {
    const tokenHash = hashToken(token);
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'Unknown';

    return db.createSession({
      userId,
      tokenHash,
      deviceInfo: req.headers['user-agent'] || 'Unknown',
      ipAddress,
      expiresAt
    });
  } catch (err) {
    console.error('[Session] Failed to create session:', err.message);
    return null;
  }
}

// Validate that a session exists and is not revoked
function validateSession(token) {
  if (!SESSION_TRACKING_ENABLED || !db.hasSessionTable || !db.hasSessionTable()) {
    return { valid: true, session: null }; // Graceful degradation
  }
  try {
    const tokenHash = hashToken(token);
    const session = db.getSessionByTokenHash(tokenHash);

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }
    if (session.revoked) {
      return { valid: false, reason: 'Session revoked' };
    }
    if (new Date(session.expiresAt) < new Date()) {
      return { valid: false, reason: 'Session expired' };
    }

    // Update last_active timestamp (async, don't block)
    try {
      db.updateSessionActivity(tokenHash);
    } catch (e) { /* Ignore update errors */ }

    return { valid: true, session };
  } catch (err) {
    console.error('[Session] Validation error:', err.message);
    return { valid: true, session: null }; // Fail open if database error
  }
}

// Revoke a session by token
function revokeSessionByToken(token) {
  if (!SESSION_TRACKING_ENABLED) {
    console.log('[Session] Revocation skipped: SESSION_TRACKING_ENABLED is false');
    return false;
  }
  if (!db.hasSessionTable || !db.hasSessionTable()) {
    console.log('[Session] Revocation skipped: session table not available');
    return false;
  }
  try {
    const tokenHash = hashToken(token);
    const result = db.revokeSessionByTokenHash(tokenHash);
    console.log(`[Session] Revocation result for hash ${tokenHash.substring(0, 8)}...: ${result ? 'success' : 'not found'}`);
    return result;
  } catch (err) {
    console.error('[Session] Revocation error:', err.message);
    return false;
  }
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

// Validate avatar filename format to prevent path traversal attacks
// Expected format: UUID-timestamp.webp (or .gif for animated avatars)
function isValidAvatarFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  // UUID is 36 chars (with dashes), followed by dash, timestamp (13 digits), extension
  const validPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-\d{13}\.(webp|gif)$/i;
  return validPattern.test(filename);
}

// Escape HTML for safe embedding in meta tags and HTML attributes
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Get request metadata for activity logging
function getRequestMeta(req) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'] || 'Unknown'
  };
}

function detectAndEmbedMedia(content) {
  // First, auto-link plain URLs (that aren't already in HTML tags)
  // This regex avoids matching URLs inside existing HTML tags
  const urlRegex = /(?<!["'>])(https?:\/\/[^\s<]+)(?![^<]*>|[^<>]*<\/)/gi;

  // Track which URLs are images to embed them
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|webm|mp4)(\?[^\s]*)?$/i;

  // Extended GIF/image CDN hosts - includes GIPHY, Tenor, Imgur, Discord, etc.
  const imageHosts = new RegExp(
    '(' +
    // GIPHY CDN hosts
    'media[0-9]?\\.giphy\\.com|i\\.giphy\\.com|' +
    // Tenor CDN hosts
    'media[0-9]?\\.tenor\\.com|c\\.tenor\\.com|' +
    // Imgur
    'i\\.imgur\\.com|' +
    // Discord CDN
    'cdn\\.discordapp\\.com/attachments|media\\.discordapp\\.net|' +
    // Other common image CDNs
    'pbs\\.twimg\\.com|' +
    // Gfycat
    'giant\\.gfycat\\.com|thumbs\\.gfycat\\.com' +
    ')', 'i'
  );

  // Shared image style - thumbnails by default, click to view full size
  const imgStyle = 'max-width:200px;max-height:150px;border-radius:4px;cursor:pointer;object-fit:cover;display:block;border:1px solid #3a4a3a;';

  // Non-CDN hosts that use image extensions but aren't direct image URLs (redirect pages)
  const nonImageHosts = /(^https?:\/\/)(www\.)?(tenor\.com|giphy\.com|gfycat\.com)\/(?!media)/i;

  content = content.replace(urlRegex, (match) => {
    // Clean up URL (remove trailing punctuation that might have been included)
    let cleanUrl = match.replace(/[.,;:!?)\]]+$/, '');

    // Skip non-CDN hosts even if they have image extensions (they're redirect pages, not images)
    if (nonImageHosts.test(cleanUrl)) {
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>`;
    }

    // Check if this URL should be embedded as an image
    if (imageExtensions.test(cleanUrl) || imageHosts.test(cleanUrl)) {
      return `<img src="${cleanUrl}" alt="Embedded media" style="${imgStyle}" class="zoomable-image" />`;
    }
    // Otherwise, make it a clickable link
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>`;
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
  tenor: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?tenor\.com\/view\/[\w-]+-(\d+)/i,
      /(?:https?:\/\/)?tenor\.com\/([a-zA-Z0-9]+)\.gif/i,
    ],
    oembedUrl: (url) => `https://tenor.com/oembed?url=${encodeURIComponent(url)}`,
  },
  giphy: {
    patterns: [
      /(?:https?:\/\/)?(?:www\.)?giphy\.com\/gifs\/(?:[\w-]+-)*([a-zA-Z0-9]+)/i,
      /(?:https?:\/\/)?gph\.is\/([a-zA-Z0-9]+)/i,
    ],
    oembedUrl: (url) => `https://giphy.com/services/oembed?url=${encodeURIComponent(url)}`,
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

// ============ Crawl Bar Caching & External API Functions ============
const crawlCache = {
  stocks: new Map(),    // key: symbol, value: {data, timestamp}
  weather: new Map(),   // key: lat,lon, value: {data, timestamp}
  news: new Map(),      // key: source, value: {data, timestamp}
  geolocation: new Map(), // key: ip, value: {data, timestamp}
};

const CRAWL_CACHE_TTL = {
  stocks: 60 * 1000,           // 1 minute
  weather: 5 * 60 * 1000,      // 5 minutes
  news: 3 * 60 * 1000,         // 3 minutes
  geolocation: 24 * 60 * 60 * 1000, // 24 hours (IP location rarely changes)
};

function getCrawlCache(type, key) {
  const cache = crawlCache[type];
  if (!cache) return null;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CRAWL_CACHE_TTL[type]) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCrawlCache(type, key, data) {
  const cache = crawlCache[type];
  if (!cache) return;
  // Limit cache size
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// Fetch stock quote from Finnhub
async function fetchStockQuote(symbol) {
  if (!FINNHUB_API_KEY) return null;

  const cached = getCrawlCache('stocks', symbol);
  if (cached) return cached;

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Finnhub API error for ${symbol}:`, response.status);
      return null;
    }

    const data = await response.json();

    // Check if we got valid data
    if (data.c === 0 && data.d === null) {
      console.warn(`No data available for symbol ${symbol}`);
      return null;
    }

    const result = {
      symbol,
      price: data.c,           // Current price
      change: data.d,          // Change
      changePercent: data.dp,  // Change percent
      high: data.h,            // Day high
      low: data.l,             // Day low
      previousClose: data.pc,  // Previous close
      timestamp: Date.now(),
    };

    setCrawlCache('stocks', symbol, result);
    return result;
  } catch (err) {
    console.error(`Stock fetch error for ${symbol}:`, err.message);
    return null;
  }
}

// Geocode location name to coordinates using OpenWeatherMap
async function geocodeLocation(locationName) {
  if (!OPENWEATHERMAP_API_KEY || !locationName) return null;

  const cacheKey = locationName.toLowerCase().trim();
  const cached = getCrawlCache('geocode', cacheKey);
  if (cached) return cached;

  try {
    // OpenWeatherMap Geocoding API - supports "City, Country" format
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(locationName)}&limit=1&appid=${OPENWEATHERMAP_API_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Geocoding API error:`, response.status);
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      console.error(`Geocoding: No results for "${locationName}"`);
      return null;
    }

    const result = {
      lat: data[0].lat,
      lon: data[0].lon,
      name: data[0].name + (data[0].state ? `, ${data[0].state}` : '') + (data[0].country ? `, ${data[0].country}` : ''),
    };

    setCrawlCache('geocode', cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Geocoding error for "${locationName}":`, err.message);
    return null;
  }
}

// Fetch weather from OpenWeatherMap
async function fetchWeatherFromOpenWeatherMap(lat, lon) {
  if (!OPENWEATHERMAP_API_KEY) return null;

  try {
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${OPENWEATHERMAP_API_KEY}`;
    const currentResponse = await fetch(currentUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (!currentResponse.ok) {
      console.error(`OpenWeatherMap API error:`, currentResponse.status);
      return null;
    }

    const currentData = await currentResponse.json();

    // Try to get alerts from One Call API if available (may require subscription)
    let alerts = [];
    try {
      const alertsUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${OPENWEATHERMAP_API_KEY}`;
      const alertsResponse = await fetch(alertsUrl, {
        signal: AbortSignal.timeout(3000),
      });
      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        alerts = (alertsData.alerts || []).map(a => ({
          event: a.event,
          description: a.description?.substring(0, 200),
          start: a.start,
          end: a.end,
        }));
      }
    } catch (alertErr) {
      // Alerts API may not be available on free tier, continue without
    }

    return {
      temp: Math.round(currentData.main.temp),
      feelsLike: Math.round(currentData.main.feels_like),
      description: currentData.weather[0]?.description || '',
      icon: currentData.weather[0]?.icon || '',
      humidity: currentData.main.humidity,
      windSpeed: Math.round(currentData.wind?.speed || 0),
      alerts,
      provider: 'OpenWeatherMap',
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error(`OpenWeatherMap fetch error:`, err.message);
    return null;
  }
}

// Fetch weather from WeatherAPI.com
async function fetchWeatherFromWeatherAPI(lat, lon) {
  if (!WEATHERAPI_KEY) return null;

  try {
    const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&aqi=no`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`WeatherAPI error:`, response.status);
      return null;
    }

    const data = await response.json();
    const current = data.current;

    return {
      temp: Math.round(current.temp_f),
      feelsLike: Math.round(current.feelslike_f),
      description: current.condition?.text || '',
      icon: current.condition?.icon || '',
      humidity: current.humidity,
      windSpeed: Math.round(current.wind_mph),
      alerts: [], // WeatherAPI alerts require paid tier
      provider: 'WeatherAPI',
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error(`WeatherAPI fetch error:`, err.message);
    return null;
  }
}

// Fetch weather from Tomorrow.io
async function fetchWeatherFromTomorrowIO(lat, lon) {
  if (!TOMORROWIO_API_KEY) return null;

  try {
    const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&units=imperial&apikey=${TOMORROWIO_API_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Tomorrow.io API error:`, response.status);
      return null;
    }

    const data = await response.json();
    const values = data.data?.values;

    if (!values) return null;

    // Map weather code to description
    const weatherCodes = {
      0: 'Unknown', 1000: 'Clear', 1100: 'Mostly Clear', 1101: 'Partly Cloudy',
      1102: 'Mostly Cloudy', 1001: 'Cloudy', 2000: 'Fog', 2100: 'Light Fog',
      4000: 'Drizzle', 4001: 'Rain', 4200: 'Light Rain', 4201: 'Heavy Rain',
      5000: 'Snow', 5001: 'Flurries', 5100: 'Light Snow', 5101: 'Heavy Snow',
      6000: 'Freezing Drizzle', 6001: 'Freezing Rain', 6200: 'Light Freezing Rain',
      6201: 'Heavy Freezing Rain', 7000: 'Ice Pellets', 7101: 'Heavy Ice Pellets',
      7102: 'Light Ice Pellets', 8000: 'Thunderstorm',
    };

    return {
      temp: Math.round(values.temperature),
      feelsLike: Math.round(values.temperatureApparent),
      description: weatherCodes[values.weatherCode] || 'Unknown',
      icon: '', // Tomorrow.io uses weather codes, not icons
      humidity: Math.round(values.humidity),
      windSpeed: Math.round(values.windSpeed),
      alerts: [], // Alerts require separate API call
      provider: 'Tomorrow.io',
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error(`Tomorrow.io fetch error:`, err.message);
    return null;
  }
}

// Main weather fetch - tries providers in order with fallback
async function fetchWeather(lat, lon) {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCrawlCache('weather', cacheKey);
  if (cached) return cached;

  // Try providers in order
  let result = await fetchWeatherFromOpenWeatherMap(lat, lon);
  if (!result) result = await fetchWeatherFromWeatherAPI(lat, lon);
  if (!result) result = await fetchWeatherFromTomorrowIO(lat, lon);

  if (result) {
    setCrawlCache('weather', cacheKey, result);
  }
  return result;
}

// Fetch news from NewsAPI
async function fetchNewsFromNewsAPI() {
  if (!NEWSAPI_KEY) return [];

  try {
    const url = `https://newsapi.org/v2/top-headlines?country=us&apiKey=${NEWSAPI_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      return (data.articles || []).slice(0, 10).map(a => ({
        title: a.title,
        source: a.source?.name || 'NewsAPI',
        url: a.url,
        publishedAt: a.publishedAt,
        provider: 'NewsAPI',
      }));
    }
  } catch (err) {
    console.error('NewsAPI error:', err.message);
  }
  return [];
}

// Fetch news from GNews
async function fetchNewsFromGNews() {
  if (!GNEWS_API_KEY) return [];

  try {
    const url = `https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=us&max=10&apikey=${GNEWS_API_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      return (data.articles || []).map(a => ({
        title: a.title,
        source: a.source?.name || 'GNews',
        url: a.url,
        publishedAt: a.publishedAt,
        provider: 'GNews',
      }));
    }
  } catch (err) {
    console.error('GNews error:', err.message);
  }
  return [];
}

// Fetch news from MediaStack
async function fetchNewsFromMediaStack() {
  if (!MEDIASTACK_API_KEY) return [];

  try {
    const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_API_KEY}&languages=en&limit=10`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      return (data.data || []).map(a => ({
        title: a.title,
        source: a.source || 'MediaStack',
        url: a.url,
        publishedAt: a.published_at,
        provider: 'MediaStack',
      }));
    }
  } catch (err) {
    console.error('MediaStack error:', err.message);
  }
  return [];
}

// Fetch news from RSS feeds (simple XML parsing without external deps)
async function fetchNewsFromRSS() {
  if (NEWS_RSS_FEEDS.length === 0) return [];

  const headlines = [];

  for (const feedUrl of NEWS_RSS_FEEDS.slice(0, 5)) { // Limit to 5 feeds
    try {
      const response = await fetch(feedUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Farhold/2.0.0' },
      });

      if (!response.ok) continue;

      const xml = await response.text();

      // Simple regex-based RSS parsing (handles most common RSS/Atom formats)
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
      const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
      const linkRegex = /<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>|<link[^>]*href=["']([^"']+)["']/i;
      const pubDateRegex = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>|<published[^>]*>([\s\S]*?)<\/published>/i;

      // Get feed title for source name
      const feedTitleMatch = xml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const feedTitle = feedTitleMatch ? feedTitleMatch[1].trim() : 'RSS';

      let match;
      let count = 0;
      while ((match = itemRegex.exec(xml)) !== null && count < 5) {
        const itemXml = match[1] || match[2];
        const titleMatch = itemXml.match(titleRegex);
        const linkMatch = itemXml.match(linkRegex);
        const pubDateMatch = itemXml.match(pubDateRegex);

        if (titleMatch) {
          headlines.push({
            title: titleMatch[1].trim().replace(/<[^>]+>/g, ''), // Strip any HTML
            source: feedTitle,
            url: linkMatch ? (linkMatch[1] || linkMatch[2]).trim() : feedUrl,
            publishedAt: pubDateMatch ? (pubDateMatch[1] || pubDateMatch[2]).trim() : null,
            provider: 'RSS',
          });
          count++;
        }
      }
    } catch (err) {
      console.error(`RSS feed error (${feedUrl}):`, err.message);
    }
  }

  return headlines;
}

// Main news fetch - combines results from all configured providers
async function fetchNews() {
  const cached = getCrawlCache('news', 'headlines');
  if (cached) return cached;

  // Fetch from all providers in parallel
  const [newsAPI, gNews, mediaStack, rss] = await Promise.all([
    fetchNewsFromNewsAPI(),
    fetchNewsFromGNews(),
    fetchNewsFromMediaStack(),
    fetchNewsFromRSS(),
  ]);

  // Combine and deduplicate by title similarity
  const allHeadlines = [...newsAPI, ...gNews, ...mediaStack, ...rss];
  const seen = new Set();
  const headlines = allHeadlines.filter(h => {
    if (!h.title) return false;
    const normalized = h.title.toLowerCase().substring(0, 50);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 15); // Limit total headlines

  const result = { headlines, timestamp: Date.now() };
  if (headlines.length > 0) {
    setCrawlCache('news', 'headlines', result);
  }
  return result;
}

// IP Geolocation (using ip-api.com free service)
async function getLocationFromIP(ip) {
  // Skip for localhost/private IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null;
  }

  const cached = getCrawlCache('geolocation', ip);
  if (cached) return cached;

  try {
    // Using ip-api.com (free, no key required, 45 requests/min)
    const url = `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,lat,lon`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'success') return null;

    const result = {
      lat: data.lat,
      lon: data.lon,
      name: `${data.city}, ${data.regionName}`,
    };

    setCrawlCache('geolocation', ip, result);
    return result;
  } catch (err) {
    console.error('IP geolocation error:', err.message);
    return null;
  }
}

// Get client IP from request (handles proxies)
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
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
      { id: 'wave-1', title: 'Welcome to Farhold', privacy: 'public', createdBy: 'user-mal', createdAt: now, updatedAt: now },
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
      { id: 'droplet-1', waveId: 'wave-1', parentId: null, authorId: 'user-mal', content: 'Welcome to Farhold! This is a public wave visible to everyone.', privacy: 'public', version: 1, createdAt: now, editedAt: null, readBy: ['user-mal'] },
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
  getWavesForUser(userId, showArchived = false) {
    // When showArchived=true, return ONLY archived waves
    // When showArchived=false, return ONLY non-archived waves
    const participantWaveIds = this.waves.participants
      .filter(p => p.userId === userId && (showArchived ? p.archived : !p.archived))
      .map(p => p.waveId);

    // Get user's groups
    const userGroupIds = this.groups.members
      .filter(m => m.userId === userId)
      .map(m => m.groupId);

    return this.waves.waves
      .filter(w => {
        // Public waves - always accessible
        if (w.privacy === 'public') return true;

        // Crew/Group waves - MUST be a current member (participant status alone is not enough)
        // Support both 'group' (legacy) and 'crew' (v2.0.0) privacy values
        if ((w.privacy === 'group' || w.privacy === 'crew') && w.groupId) {
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

  isWaveArchivedForUser(waveId, userId) {
    const participant = this.waves.participants.find(p => p.waveId === waveId && p.userId === userId);
    return participant?.archived || false;
  }

  canAccessWave(waveId, userId) {
    const wave = this.getWave(waveId);
    if (!wave) return false;

    // Public waves are accessible to all
    if (wave.privacy === 'public') return true;

    // Crew/Group waves - MUST be a current member (participant status alone is not enough)
    // Support both 'group' (legacy) and 'crew' (v2.0.0) privacy values
    if ((wave.privacy === 'group' || wave.privacy === 'crew') && wave.groupId) {
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

  updateWaveTitle(waveId, title) {
    const wave = this.getWave(waveId);
    if (!wave) return null;

    wave.title = title;
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

// HTTPS redirect middleware (v1.18.0)
if (ENFORCE_HTTPS) {
  app.use((req, res, next) => {
    // Check x-forwarded-proto header (set by reverse proxies like nginx)
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

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
  // HSTS configuration (v1.18.0)
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
}));

// Restrictive CORS (v1.18.0)
app.use(cors({
  origin: (origin, callback) => {
    // In development with CORS_STRICT_MODE=false, allow all
    if (!CORS_STRICT_MODE && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // In production or strict mode, require ALLOWED_ORIGINS
    if (!ALLOWED_ORIGINS || ALLOWED_ORIGINS.length === 0) {
      if (process.env.NODE_ENV === 'production') {
        // In production without ALLOWED_ORIGINS, only allow same-origin
        if (!origin) return callback(null, true);
        return callback(new Error('CORS not allowed - set ALLOWED_ORIGINS'));
      }
      // Development without strict mode - allow same-origin only
      if (!origin) return callback(null, true);
      return callback(null, true); // Allow in development
    }

    // Check against allowed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));

// Warn about permissive CORS in production
if (!ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
  console.error('========================================');
  console.error('⚠️  SECURITY WARNING: ALLOWED_ORIGINS not set');
  console.error('   Set ALLOWED_ORIGINS=https://your-domain.com');
  console.error('   for proper CORS security in production');
  console.error('========================================');
}

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

    // Validate session if session tracking is enabled
    const validation = validateSession(token);
    if (!validation.valid) {
      return res.status(403).json({ error: validation.reason });
    }

    req.user = decoded;
    req.sessionId = validation.session?.id || null;
    req.token = token; // Store token for logout/session operations
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

    // Create session for the new user
    const session = createSession(user.id, token, req);
    if (session) {
      console.log(`📱 Session created for new user: ${handle}`);
    }

    // Log registration
    if (db.logActivity) db.logActivity(user.id, 'register', 'user', user.id, getRequestMeta(req));

    res.status(201).json({
      token,
      user: { id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, bio: user.bio || null, nodeName: user.nodeName, status: user.status, isAdmin: user.isAdmin, role: user.role || (user.isAdmin ? 'admin' : 'user'), preferences: user.preferences || { theme: 'firefly', fontSize: 'medium' } },
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
    const meta = getRequestMeta(req);
    if (!user) {
      recordFailedAttempt(handle);
      // Log failed login attempt (unknown user)
      if (db.logActivity) db.logActivity(null, 'login_failed', 'user', null, { ...meta, reason: 'unknown_user', attemptedHandle: handle });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      recordFailedAttempt(handle);
      // Log failed login attempt (wrong password)
      if (db.logActivity) db.logActivity(user.id, 'login_failed', 'user', user.id, { ...meta, reason: 'invalid_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if MFA is enabled
    const hasMfa = db.hasMfaEnabled && db.hasMfaEnabled(user.id);
    if (hasMfa) {
      // Create MFA challenge (5 minute expiry)
      const mfaMethods = db.getEnabledMfaMethods(user.id);
      const challenge = db.createMfaChallenge(user.id, 'login', null);

      console.log(`🔐 MFA required for user: ${handle}`);

      return res.json({
        mfaRequired: true,
        mfaChallenge: challenge.id,
        mfaMethods // ['totp', 'email', 'recovery']
      });
    }

    clearFailedAttempts(handle);
    db.updateUserStatus(user.id, 'online');

    // Check if user needs to change password (set by admin reset)
    const requirePasswordChange = db.requiresPasswordChange ? db.requiresPasswordChange(user.id) : false;

    const token = jwt.sign({ userId: user.id, handle: user.handle }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log(`✅ User logged in: ${handle}`);

    // Create session for the login
    const session = createSession(user.id, token, req);
    if (session) {
      console.log(`📱 Session created for: ${handle}`);
    }

    // Log successful login
    if (db.logActivity) db.logActivity(user.id, 'login', 'user', user.id, meta);

    res.json({
      token,
      requirePasswordChange,
      user: { id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, bio: user.bio || null, nodeName: user.nodeName, status: 'online', isAdmin: user.isAdmin, role: user.role || (user.isAdmin ? 'admin' : 'user'), preferences: user.preferences || { theme: 'firefly', fontSize: 'medium' } },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, bio: user.bio || null, nodeName: user.nodeName, status: user.status, isAdmin: user.isAdmin, role: user.role || (user.isAdmin ? 'admin' : 'user'), preferences: user.preferences || { theme: 'firefly', fontSize: 'medium' } });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  db.updateUserStatus(req.user.userId, 'offline');

  // Revoke the current session
  if (req.token) {
    const revoked = revokeSessionByToken(req.token);
    if (revoked) {
      console.log(`📱 Session revoked for: ${req.user.handle}`);
    } else {
      console.log(`📱 Session revocation skipped for: ${req.user.handle} (no session found or tracking disabled)`);
    }
  } else {
    console.log(`📱 Logout without token for: ${req.user.handle}`);
  }

  // Log logout
  if (db.logActivity) db.logActivity(req.user.userId, 'logout', 'user', req.user.userId, getRequestMeta(req));
  res.json({ success: true });
});

// ============ Session Management Routes (v1.18.0) ============

// Get user's active sessions
app.get('/api/auth/sessions', authenticateToken, (req, res) => {
  if (!SESSION_TRACKING_ENABLED || !db.getSessionsByUser) {
    return res.json({ sessions: [], enabled: false });
  }

  try {
    const sessions = db.getSessionsByUser(req.user.userId);

    // Mark current session
    const currentTokenHash = hashToken(req.token);
    const sessionsWithCurrent = sessions.map(session => ({
      id: session.id,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastActive: session.lastActive,
      isCurrent: session.tokenHash === currentTokenHash
    }));

    res.json({ sessions: sessionsWithCurrent, enabled: true });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Revoke a specific session
app.post('/api/auth/sessions/:id/revoke', authenticateToken, (req, res) => {
  if (!SESSION_TRACKING_ENABLED || !db.revokeSession) {
    return res.status(400).json({ error: 'Session management not enabled' });
  }

  try {
    const sessionId = req.params.id;

    // Verify the session belongs to this user
    const sessions = db.getSessionsByUser(req.user.userId);
    const session = sessions.find(s => s.id === sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Don't allow revoking the current session via this endpoint
    const currentTokenHash = hashToken(req.token);
    if (session.tokenHash === currentTokenHash) {
      return res.status(400).json({ error: 'Use logout to revoke current session' });
    }

    const revoked = db.revokeSession(sessionId);
    if (revoked) {
      console.log(`📱 Session ${sessionId} revoked by user: ${req.user.handle}`);
      if (db.logActivity) db.logActivity(req.user.userId, 'session_revoked', 'session', sessionId, getRequestMeta(req));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// Revoke all sessions except current
app.post('/api/auth/sessions/revoke-all', authenticateToken, (req, res) => {
  if (!SESSION_TRACKING_ENABLED || !db.revokeAllUserSessions) {
    return res.status(400).json({ error: 'Session management not enabled' });
  }

  try {
    const currentTokenHash = hashToken(req.token);
    const currentSession = db.getSessionByTokenHash(currentTokenHash);
    const currentSessionId = currentSession?.id || null;

    const revoked = db.revokeAllUserSessions(req.user.userId, currentSessionId);
    console.log(`📱 ${revoked} sessions revoked for user: ${req.user.handle}`);

    if (db.logActivity) db.logActivity(req.user.userId, 'all_sessions_revoked', 'user', req.user.userId, { ...getRequestMeta(req), count: revoked });

    res.json({ success: true, revoked });
  } catch (err) {
    console.error('Revoke all sessions error:', err);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// ============ Account Management Routes (v1.18.0 GDPR) ============

// Rate limiter for account operations
const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: { error: 'Too many account operations. Please try again later.' }
});

// Export user data (GDPR data portability)
app.get('/api/account/export', authenticateToken, accountLimiter, (req, res) => {
  try {
    if (!db.exportUserData) {
      return res.status(501).json({ error: 'Data export not available' });
    }

    const exportData = db.exportUserData(req.user.userId);
    if (!exportData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log the export
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'data_export', 'user', req.user.userId, getRequestMeta(req));
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cortex-data-export-${req.user.handle}-${new Date().toISOString().split('T')[0]}.json"`);

    res.json(exportData);
  } catch (err) {
    console.error('Data export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Delete account (requires password confirmation)
app.post('/api/account/delete', authenticateToken, accountLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password confirmation required' });
    }

    // Verify password
    const user = db.findUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Prevent admin from deleting themselves if they're the only admin
    if (user.isAdmin) {
      const adminCount = db.db?.prepare?.('SELECT COUNT(*) as count FROM users WHERE is_admin = 1')?.get()?.count || 1;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only admin account. Transfer admin rights first.' });
      }
    }

    // Perform account deletion
    if (!db.deleteUserAccount) {
      return res.status(501).json({ error: 'Account deletion not available' });
    }

    // Log before deletion (since we're about to delete the user)
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'account_deleted', 'user', req.user.userId, getRequestMeta(req));
    }

    const result = db.deleteUserAccount(req.user.userId);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to delete account' });
    }

    console.log(`🗑️ Account deleted: ${result.handle} (${result.deletedUserId})`);

    // Revoke current session if tracking is enabled
    if (req.token) {
      revokeSessionByToken(req.token);
    }

    res.json({
      success: true,
      message: 'Your account has been permanently deleted.'
    });
  } catch (err) {
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============ Password Reset Routes ============

// Request password reset (public, rate-limited)
// Always returns success to prevent email enumeration
app.post('/api/auth/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const email = sanitizeInput(req.body.email || '').toLowerCase().trim();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }

    // Always return success to prevent email enumeration
    const successResponse = () => {
      res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    };

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      console.warn('Password reset requested but email service not configured');
      return successResponse();
    }

    const user = db.findUserByEmail ? db.findUserByEmail(email) : null;
    if (!user) {
      return successResponse();
    }

    // Generate secure random token (64 bytes = 128 hex chars)
    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Store hashed token in database
    db.createPasswordResetToken(user.id, tokenHash, 60); // 60 minutes expiry

    // Build reset URL - use client origin or configured base URL
    const origin = req.headers.origin || process.env.CLIENT_URL || `http://localhost:${process.env.CLIENT_PORT || 3000}`;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Send email
    const result = await emailService.sendPasswordResetEmail(user.email, token, resetUrl);
    if (!result.success) {
      console.error(`Failed to send password reset email to ${user.email}:`, result.error);
    } else {
      console.log(`Password reset email sent to ${user.email}`);
    }

    return successResponse();
  } catch (err) {
    console.error('Password reset request error:', err);
    // Still return success to prevent information leakage
    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });
  }
});

// Verify password reset token (public)
app.get('/api/auth/reset-password/:token', (req, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length < 64) {
      return res.status(400).json({ valid: false, error: 'Invalid token format' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = db.verifyPasswordResetToken(tokenHash);

    res.json({ valid: result.valid, error: result.error });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

// Complete password reset (public)
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || token.length < 64) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    if (!newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    // Validate password requirements
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one lowercase letter' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenResult = db.verifyPasswordResetToken(tokenHash);

    if (!tokenResult.valid) {
      return res.status(400).json({ error: tokenResult.error || 'Invalid or expired token' });
    }

    // Set new password
    const setResult = await db.setPassword(tokenResult.userId, newPassword, false);
    if (!setResult.success) {
      return res.status(500).json({ error: setResult.error || 'Failed to reset password' });
    }

    // Mark token as used
    db.markPasswordResetTokenUsed(tokenHash);

    // Clear any account lockouts for this user
    const user = db.findUserById(tokenResult.userId);
    if (user) {
      db.clearFailedLogins(user.handle);
      if (user.email) db.clearFailedLogins(user.email);
    }

    console.log(`Password reset completed for user ${tokenResult.userId}`);

    // Log password reset
    if (db.logActivity) db.logActivity(tokenResult.userId, 'password_reset_complete', 'user', tokenResult.userId, getRequestMeta(req));

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Clear password change requirement after changing password (authenticated)
app.post('/api/auth/clear-password-change', authenticateToken, (req, res) => {
  try {
    if (db.clearPasswordChangeRequirement) {
      db.clearPasswordChangeRequirement(req.user.userId);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Clear password change requirement error:', err);
    res.status(500).json({ error: 'Failed to clear password change requirement' });
  }
});

// ============ MFA Routes ============

// Rate limiter for MFA operations
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many MFA attempts, please try again later' }
});

// Get MFA status for current user
app.get('/api/auth/mfa/status', authenticateToken, (req, res) => {
  try {
    const settings = db.getMfaSettings(req.user.userId);
    const methods = db.getEnabledMfaMethods(req.user.userId);
    res.json({
      totpEnabled: settings?.totpEnabled || false,
      emailMfaEnabled: settings?.emailMfaEnabled || false,
      hasRecoveryCodes: settings?.hasRecoveryCodes || false,
      enabledMethods: methods
    });
  } catch (err) {
    console.error('MFA status error:', err);
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
});

// Begin TOTP setup - generate secret and QR code
app.post('/api/auth/mfa/totp/setup', authenticateToken, async (req, res) => {
  try {
    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if TOTP is already enabled
    const settings = db.getMfaSettings(req.user.userId);
    if (settings?.totp_enabled === 1) {
      return res.status(400).json({ error: 'TOTP is already enabled' });
    }

    // Generate new TOTP secret
    const secret = authenticator.generateSecret();

    // Store pending secret (not enabled yet)
    db.storePendingTotpSecret(req.user.userId, secret);

    // Generate otpauth URI for authenticator apps
    const appName = 'Farhold';
    const otpauthUrl = authenticator.keyuri(user.handle, appName, secret);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({
      secret,
      qrCodeDataUrl,
      manualEntryKey: secret,
      otpauthUrl
    });
  } catch (err) {
    console.error('TOTP setup error:', err);
    res.status(500).json({ error: 'Failed to setup TOTP' });
  }
});

// Verify TOTP code and enable
app.post('/api/auth/mfa/totp/verify', authenticateToken, mfaLimiter, (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get pending secret
    const secret = db.getTotpSecret(req.user.userId);
    if (!secret) {
      return res.status(400).json({ error: 'No TOTP setup in progress. Please start setup first.' });
    }

    // Verify the code
    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    // Enable TOTP
    db.enableTotp(req.user.userId, secret);

    // Generate recovery codes (10 codes)
    const recoveryCodes = [];
    const hashedCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      recoveryCodes.push(code);
      hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }

    // Store hashed recovery codes
    db.storeRecoveryCodes(req.user.userId, hashedCodes);

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'mfa_enable', 'user', req.user.userId, { ...getRequestMeta(req), method: 'totp' });

    res.json({
      success: true,
      message: 'TOTP enabled successfully',
      recoveryCodes // Return plaintext codes once (user must save them)
    });
  } catch (err) {
    console.error('TOTP verify error:', err);
    res.status(500).json({ error: 'Failed to verify TOTP' });
  }
});

// Disable TOTP (requires password and current TOTP code)
app.post('/api/auth/mfa/totp/disable', authenticateToken, mfaLimiter, async (req, res) => {
  try {
    const { password, code } = req.body;
    if (!password || !code) {
      return res.status(400).json({ error: 'Password and code are required' });
    }

    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify TOTP code
    const secret = db.getTotpSecret(req.user.userId);
    if (!secret) {
      return res.status(400).json({ error: 'TOTP is not enabled' });
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid TOTP code' });
    }

    // Disable TOTP
    db.disableTotp(req.user.userId);

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'mfa_disable', 'user', req.user.userId, { ...getRequestMeta(req), method: 'totp' });

    res.json({ success: true, message: 'TOTP disabled successfully' });
  } catch (err) {
    console.error('TOTP disable error:', err);
    res.status(500).json({ error: 'Failed to disable TOTP' });
  }
});

// Enable email MFA
app.post('/api/auth/mfa/email/enable', authenticateToken, async (req, res) => {
  try {
    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.email) {
      return res.status(400).json({ error: 'No email address on file. Please add an email first.' });
    }

    // Check if email MFA is already enabled
    const settings = db.getMfaSettings(req.user.userId);
    if (settings?.email_mfa_enabled === 1) {
      return res.status(400).json({ error: 'Email MFA is already enabled' });
    }

    // Send test code to verify email works
    const testCode = Math.floor(100000 + Math.random() * 900000).toString();
    const emailService = getEmailService();

    if (!emailService.configured) {
      return res.status(400).json({ error: 'Email service is not configured. Contact administrator.' });
    }

    await emailService.sendMFACode(user.email, testCode);

    // Create MFA challenge for verification (store hashed code)
    const codeHash = crypto.createHash('sha256').update(testCode).digest('hex');
    const challenge = db.createMfaChallenge(req.user.userId, 'email_enable', codeHash);

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      challengeId: challenge.id
    });
  } catch (err) {
    console.error('Email MFA enable error:', err);
    res.status(500).json({ error: 'Failed to enable email MFA' });
  }
});

// Verify email MFA setup
app.post('/api/auth/mfa/email/verify-setup', authenticateToken, mfaLimiter, (req, res) => {
  try {
    const { challengeId, code } = req.body;
    if (!challengeId || !code) {
      return res.status(400).json({ error: 'Challenge ID and code are required' });
    }

    // Validate challengeId is a string
    if (typeof challengeId !== 'string') {
      return res.status(400).json({ error: 'Invalid challenge ID format' });
    }

    // Verify the challenge
    const challenge = db.getMfaChallenge(challengeId);
    if (!challenge || challenge.userId !== req.user.userId) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }

    if (challenge.challengeType !== 'email_enable') {
      return res.status(400).json({ error: 'Invalid challenge type' });
    }

    // Check expiration
    if (new Date(challenge.expiresAt) < new Date()) {
      db.deleteMfaChallenge(challengeId);
      return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    }

    // Verify code (stored as hash)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    if (challenge.codeHash !== codeHash) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Enable email MFA
    db.enableEmailMfa(req.user.userId);
    db.markMfaChallengeVerified(challengeId);

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'mfa_enable', 'user', req.user.userId, { ...getRequestMeta(req), method: 'email' });

    // Generate recovery codes if not already present
    const settings = db.getMfaSettings(req.user.userId);
    let recoveryCodes = null;
    if (!settings?.recovery_codes || JSON.parse(settings.recovery_codes).length === 0) {
      recoveryCodes = [];
      const hashedCodes = [];
      for (let i = 0; i < 10; i++) {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        recoveryCodes.push(code);
        hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
      }
      db.storeRecoveryCodes(req.user.userId, hashedCodes);
    }

    res.json({
      success: true,
      message: 'Email MFA enabled successfully',
      recoveryCodes // Only returned if newly generated
    });
  } catch (err) {
    console.error('Email MFA verify setup error:', err);
    res.status(500).json({ error: 'Failed to verify email MFA setup' });
  }
});

// Request email MFA disable - sends verification code (step 1)
app.post('/api/auth/mfa/email/disable/request', authenticateToken, mfaLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check email MFA is enabled
    const settings = db.getMfaSettings(req.user.userId);
    if (!settings?.emailMfaEnabled) {
      return res.status(400).json({ error: 'Email MFA is not enabled' });
    }

    // Check email service
    const emailService = getEmailService();
    if (!emailService.configured) {
      return res.status(400).json({ error: 'Email service is not configured. Contact administrator.' });
    }

    // Generate and send verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // Create challenge for verification
    const challenge = db.createMfaChallenge(req.user.userId, 'email_disable', codeHash);

    await emailService.sendMFACode(user.email, code, 'To disable Email MFA, enter this verification code');

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      challengeId: challenge.id
    });
  } catch (err) {
    console.error('Email MFA disable request error:', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Disable email MFA - verify code and disable (step 2)
app.post('/api/auth/mfa/email/disable', authenticateToken, mfaLimiter, async (req, res) => {
  try {
    const { challengeId, code } = req.body;
    if (!challengeId || !code) {
      return res.status(400).json({ error: 'Challenge ID and verification code are required' });
    }

    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get and validate challenge
    const challenge = db.getMfaChallenge(challengeId);
    if (!challenge || challenge.userId !== req.user.userId) {
      return res.status(400).json({ error: 'Invalid or expired verification' });
    }

    if (challenge.method !== 'email_disable') {
      return res.status(400).json({ error: 'Invalid challenge type' });
    }

    // Verify code
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    if (codeHash !== challenge.codeHash) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Delete the challenge
    db.deleteMfaChallenge(challengeId);

    // Disable email MFA
    db.disableEmailMfa(req.user.userId);

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'mfa_disable', 'user', req.user.userId, { ...getRequestMeta(req), method: 'email' });

    res.json({ success: true, message: 'Email MFA disabled successfully' });
  } catch (err) {
    console.error('Email MFA disable error:', err);
    res.status(500).json({ error: 'Failed to disable email MFA' });
  }
});

// Regenerate recovery codes (requires password + one MFA method)
app.post('/api/auth/mfa/recovery/regenerate', authenticateToken, mfaLimiter, async (req, res) => {
  try {
    const { password, mfaCode, mfaMethod } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = db.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify MFA if enabled
    const hasMfa = db.hasMfaEnabled(req.user.userId);
    if (hasMfa) {
      if (!mfaCode || !mfaMethod) {
        return res.status(400).json({ error: 'MFA verification required' });
      }

      if (mfaMethod === 'totp') {
        const secret = db.getTotpSecret(req.user.userId);
        const isValid = authenticator.verify({ token: mfaCode, secret });
        if (!isValid) {
          return res.status(400).json({ error: 'Invalid TOTP code' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid MFA method for this operation' });
      }
    }

    // Generate new recovery codes
    const recoveryCodes = [];
    const hashedCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      recoveryCodes.push(code);
      hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }

    // Store new hashed codes (replaces old ones)
    db.storeRecoveryCodes(req.user.userId, hashedCodes);

    res.json({
      success: true,
      message: 'Recovery codes regenerated',
      recoveryCodes // Return plaintext codes once (user must save them)
    });
  } catch (err) {
    console.error('Recovery codes regenerate error:', err);
    res.status(500).json({ error: 'Failed to regenerate recovery codes' });
  }
});

// Send email MFA code for login
app.post('/api/auth/mfa/send-email-code', mfaLimiter, async (req, res) => {
  try {
    const { challengeId } = req.body;
    if (!challengeId) {
      return res.status(400).json({ error: 'Challenge ID is required' });
    }

    // Validate challengeId is a string
    if (typeof challengeId !== 'string') {
      return res.status(400).json({ error: 'Invalid challenge ID format' });
    }

    // Get the challenge to find user
    const challenge = db.getMfaChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: 'Invalid challenge' });
    }

    const user = db.findUserById(challenge.userId);
    if (!user || !user.email) {
      return res.status(400).json({ error: 'Cannot send email code' });
    }

    // Generate and send code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const emailService = getEmailService();
    if (!emailService.configured) {
      return res.status(400).json({ error: 'Email service is not configured. Contact administrator.' });
    }

    // Update challenge with new code (store hashed)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const newChallenge = db.createMfaChallenge(challenge.userId, 'email', codeHash);

    await emailService.sendMFACode(user.email, code);

    res.json({
      success: true,
      message: 'Code sent to your email',
      challengeId: newChallenge.id
    });
  } catch (err) {
    console.error('Send email MFA code error:', err);
    res.status(500).json({ error: 'Failed to send email code' });
  }
});

// Verify MFA during login
app.post('/api/auth/mfa/verify', mfaLimiter, (req, res) => {
  try {
    const { challengeId, method, code } = req.body;
    if (!challengeId || !method || !code) {
      return res.status(400).json({ error: 'Challenge ID, method, and code are required' });
    }

    // Validate challengeId is a string
    if (typeof challengeId !== 'string') {
      return res.status(400).json({ error: 'Invalid challenge ID format' });
    }

    // Get the challenge
    const challenge = db.getMfaChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }

    // Check expiration
    if (new Date(challenge.expiresAt) < new Date()) {
      db.deleteMfaChallenge(challengeId);
      return res.status(400).json({ error: 'Challenge has expired. Please log in again.' });
    }

    const user = db.findUserById(challenge.userId);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    let verified = false;

    if (method === 'totp') {
      const secret = db.getTotpSecret(challenge.userId);
      if (secret) {
        verified = authenticator.verify({ token: code, secret });
      }
    } else if (method === 'email') {
      // For email, we need to check the codeHash on the challenge
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      if (challenge.codeHash === codeHash) {
        verified = true;
      }
    } else if (method === 'recovery') {
      // Verify recovery code (stored as array of hashed codes)
      const hashedCodes = db.getRecoveryCodes(challenge.userId);
      if (hashedCodes && hashedCodes.length > 0) {
        const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
        const codeIndex = hashedCodes.findIndex(hash => hash === codeHash);
        if (codeIndex !== -1) {
          db.markRecoveryCodeUsed(challenge.userId, codeIndex);
          verified = true;
        }
      }
    }

    if (!verified) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Mark challenge as verified
    db.markMfaChallengeVerified(challengeId);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, handle: user.handle },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Create session for the MFA login
    const session = createSession(user.id, token, req);
    if (session) {
      console.log(`📱 Session created for MFA login: ${user.handle}`);
    }

    // Clear any failed login attempts
    if (db.clearFailedLogins) {
      db.clearFailedLogins(user.handle);
    }

    // Log successful MFA login
    if (db.logActivity) db.logActivity(user.id, 'login', 'user', user.id, { ...getRequestMeta(req), mfaMethod: method });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl || null,
        role: user.role,
        preferences: user.preferences,
        bio: user.bio,
        email: user.email,
        requirePasswordChange: user.require_password_change === 1
      }
    });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'Failed to verify MFA' });
  }
});

// ============ E2EE Routes (v1.19.0) ============

// Register user's encryption keys (E2EE setup)
app.post('/api/e2ee/keys/register', authenticateToken, (req, res) => {
  try {
    const { publicKey, encryptedPrivateKey, salt } = req.body;

    if (!publicKey || !encryptedPrivateKey || !salt) {
      return res.status(400).json({ error: 'Missing required fields: publicKey, encryptedPrivateKey, salt' });
    }

    // Validate Base64 format (basic check)
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    if (!base64Regex.test(publicKey) || !base64Regex.test(encryptedPrivateKey) || !base64Regex.test(salt)) {
      return res.status(400).json({ error: 'Invalid key format (must be Base64)' });
    }

    const result = db.createUserEncryptionKeys(req.user.userId, publicKey, encryptedPrivateKey, salt);

    // Log E2EE setup activity
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'e2ee_setup', 'user', req.user.userId, {
        ...getRequestMeta(req),
        keyVersion: result.keyVersion
      });
    }

    res.json({
      success: true,
      message: 'Encryption keys registered',
      keyVersion: result.keyVersion
    });
  } catch (err) {
    console.error('E2EE key registration error:', err);
    res.status(500).json({ error: 'Failed to register encryption keys' });
  }
});

// Get own encryption keys (for device sync / passphrase unlock)
app.get('/api/e2ee/keys/me', authenticateToken, (req, res) => {
  try {
    const keys = db.getUserEncryptionKeys(req.user.userId);

    if (!keys) {
      return res.status(404).json({ error: 'No encryption keys found', needsSetup: true });
    }

    res.json({
      publicKey: keys.publicKey,
      encryptedPrivateKey: keys.encryptedPrivateKey,
      keyDerivationSalt: keys.keyDerivationSalt,
      keyVersion: keys.keyVersion,
      createdAt: keys.createdAt
    });
  } catch (err) {
    console.error('E2EE key fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch encryption keys' });
  }
});

// Get another user's public key (for encrypting wave keys)
app.get('/api/e2ee/keys/user/:id', authenticateToken, (req, res) => {
  try {
    const publicKey = db.getUserPublicKey(req.params.id);

    if (!publicKey) {
      return res.status(404).json({ error: 'User has not set up E2EE' });
    }

    res.json({ publicKey });
  } catch (err) {
    console.error('E2EE public key fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch public key' });
  }
});

// Check if user has E2EE set up
app.get('/api/e2ee/status', authenticateToken, (req, res) => {
  try {
    const hasKeys = db.hasUserEncryptionKeys(req.user.userId);
    const keys = hasKeys ? db.getUserEncryptionKeys(req.user.userId) : null;

    res.json({
      e2eeEnabled: hasKeys,
      keyVersion: keys?.keyVersion || null,
      createdAt: keys?.createdAt || null
    });
  } catch (err) {
    console.error('E2EE status check error:', err);
    res.status(500).json({ error: 'Failed to check E2EE status' });
  }
});

// Rotate user keypair (generate new keys with new passphrase)
app.post('/api/e2ee/keys/rotate', authenticateToken, (req, res) => {
  try {
    const { publicKey, encryptedPrivateKey, salt } = req.body;

    if (!publicKey || !encryptedPrivateKey || !salt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user already has keys
    if (!db.hasUserEncryptionKeys(req.user.userId)) {
      return res.status(400).json({ error: 'No existing keys to rotate. Use /api/e2ee/keys/register instead.' });
    }

    const result = db.createUserEncryptionKeys(req.user.userId, publicKey, encryptedPrivateKey, salt);

    // Log key rotation
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'e2ee_key_rotation', 'user', req.user.userId, {
        ...getRequestMeta(req),
        newKeyVersion: result.keyVersion
      });
    }

    res.json({
      success: true,
      message: 'Keys rotated successfully',
      keyVersion: result.keyVersion
    });
  } catch (err) {
    console.error('E2EE key rotation error:', err);
    res.status(500).json({ error: 'Failed to rotate keys' });
  }
});

// Update encrypted private key (for password changes)
// This keeps the same public key but re-encrypts the private key with a new password
app.post('/api/e2ee/keys/update', authenticateToken, (req, res) => {
  try {
    const { encryptedPrivateKey, salt } = req.body;

    if (!encryptedPrivateKey || !salt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user has keys
    if (!db.hasUserEncryptionKeys(req.user.userId)) {
      return res.status(400).json({ error: 'No encryption keys found. Use /api/e2ee/keys/register first.' });
    }

    // Update only the encrypted private key and salt (not the public key)
    db.updateEncryptedPrivateKey(req.user.userId, encryptedPrivateKey, salt);

    // Log the update
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'e2ee_key_reencrypt', 'user', req.user.userId, {
        ...getRequestMeta(req)
      });
    }

    res.json({
      success: true,
      message: 'Encryption keys updated successfully'
    });
  } catch (err) {
    console.error('E2EE key update error:', err);
    res.status(500).json({ error: 'Failed to update keys' });
  }
});

// Setup recovery key
app.post('/api/e2ee/recovery/setup', authenticateToken, (req, res) => {
  try {
    const { encryptedPrivateKey, recoverySalt, hint } = req.body;

    if (!encryptedPrivateKey || !recoverySalt) {
      return res.status(400).json({ error: 'Missing required fields: encryptedPrivateKey, recoverySalt' });
    }

    // Validate hint length if provided
    const sanitizedHint = hint ? sanitizeInput(hint).slice(0, 100) : null;

    const result = db.createRecoveryKey(req.user.userId, encryptedPrivateKey, recoverySalt, sanitizedHint);

    // Log recovery setup
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'e2ee_recovery_setup', 'user', req.user.userId, getRequestMeta(req));
    }

    res.json({
      success: true,
      message: 'Recovery key configured',
      hasHint: result.hasHint
    });
  } catch (err) {
    console.error('E2EE recovery setup error:', err);
    res.status(500).json({ error: 'Failed to setup recovery key' });
  }
});

// Get recovery hint (without revealing the key)
app.get('/api/e2ee/recovery/hint', authenticateToken, (req, res) => {
  try {
    const hint = db.getRecoveryHint(req.user.userId);

    if (hint === null) {
      // Check if recovery is set up at all
      const recoveryInfo = db.getRecoveryKeyInfo(req.user.userId);
      if (!recoveryInfo) {
        return res.status(404).json({ error: 'No recovery key configured' });
      }
      return res.json({ hint: null, hasRecovery: true });
    }

    res.json({ hint, hasRecovery: true });
  } catch (err) {
    console.error('E2EE recovery hint error:', err);
    res.status(500).json({ error: 'Failed to get recovery hint' });
  }
});

// Regenerate recovery key (requires passphrase verification)
app.post('/api/e2ee/recovery/regenerate', authenticateToken, (req, res) => {
  try {
    const { encryptedPrivateKey, recoverySalt } = req.body;

    if (!encryptedPrivateKey || !recoverySalt) {
      return res.status(400).json({ error: 'Missing required fields: encryptedPrivateKey, recoverySalt' });
    }

    // Update the recovery key info
    const result = db.updateRecoveryKey(req.user.userId, encryptedPrivateKey, recoverySalt);

    if (!result) {
      return res.status(404).json({ error: 'No existing recovery key to regenerate' });
    }

    // Log recovery regeneration
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'e2ee_recovery_regenerated', 'user', req.user.userId, getRequestMeta(req));
    }

    res.json({
      success: true,
      message: 'Recovery key regenerated'
    });
  } catch (err) {
    console.error('E2EE recovery regenerate error:', err);
    res.status(500).json({ error: 'Failed to regenerate recovery key' });
  }
});

// Get full recovery key info (for account recovery)
app.get('/api/e2ee/recovery', authenticateToken, (req, res) => {
  try {
    const recoveryInfo = db.getRecoveryKeyInfo(req.user.userId);

    if (!recoveryInfo) {
      return res.status(404).json({ error: 'No recovery key configured' });
    }

    res.json({
      encryptedPrivateKey: recoveryInfo.encryptedPrivateKey,
      recoverySalt: recoveryInfo.recoverySalt,
      hint: recoveryInfo.hint,
      createdAt: recoveryInfo.createdAt
    });
  } catch (err) {
    console.error('E2EE recovery fetch error:', err);
    res.status(500).json({ error: 'Failed to get recovery key' });
  }
});

// ============ Profile Routes ============
app.put('/api/profile', authenticateToken, (req, res) => {
  const updates = {};
  if (req.body.displayName) updates.displayName = sanitizeInput(req.body.displayName).slice(0, 50);
  if (req.body.avatar) updates.avatar = sanitizeInput(req.body.avatar).slice(0, 2);
  if (req.body.bio !== undefined) updates.bio = req.body.bio ? sanitizeInput(req.body.bio).slice(0, 500) : null;

  // Email update with validation
  if (req.body.email !== undefined) {
    const email = req.body.email ? sanitizeInput(req.body.email).trim().toLowerCase() : null;
    if (email) {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      // Check if email is already taken by another user
      const existingUser = db.findUserByEmail ? db.findUserByEmail(email) : db.findUserByHandle(email);
      if (existingUser && existingUser.id !== req.user.userId) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }
    updates.email = email;
  }

  const user = db.updateUser(req.user.userId, updates);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ id: user.id, handle: user.handle, email: user.email, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl || null, preferences: user.preferences, bio: user.bio });
});

// Get public profile for any user (local or federated)
app.get('/api/users/:id/profile', authenticateToken, (req, res) => {
  // First try to find local user
  const user = db.findUserById(req.params.id);
  if (user) {
    // Return only public profile fields (no email, passwordHash, preferences, etc.)
    return res.json({
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl || null,
      bio: user.bio || null,
      createdAt: user.createdAt,
      isRemote: false,
    });
  }

  // Try to find remote/federated user
  const remoteUser = db.getRemoteUser(req.params.id);
  if (remoteUser) {
    return res.json({
      id: remoteUser.id,
      handle: remoteUser.handle,
      displayName: remoteUser.displayName,
      avatar: remoteUser.avatar,
      avatarUrl: remoteUser.avatarUrl || null,
      bio: remoteUser.bio || null,
      createdAt: remoteUser.cachedAt, // Use cache time as we don't know their actual join date
      isRemote: true,
      nodeName: remoteUser.nodeName,
    });
  }

  return res.status(404).json({ error: 'User not found' });
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

    // Delete old avatar if exists (with path traversal protection)
    if (user.avatarUrl) {
      const oldFilename = path.basename(user.avatarUrl);
      if (isValidAvatarFilename(oldFilename)) {
        const oldFilepath = path.join(AVATARS_DIR, oldFilename);
        if (fs.existsSync(oldFilepath)) {
          fs.unlinkSync(oldFilepath);
        }
      } else {
        console.warn(`Invalid avatar filename format, skipping deletion: ${oldFilename}`);
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
      // Delete the file (with path traversal protection)
      const filename = path.basename(user.avatarUrl);
      if (isValidAvatarFilename(filename)) {
        const filepath = path.join(AVATARS_DIR, filename);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      } else {
        console.warn(`Invalid avatar filename format, skipping deletion: ${filename}`);
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

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'password_change', 'user', req.user.userId, getRequestMeta(req));

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
  // Handle crawlBar preferences
  if (req.body.crawlBar && typeof req.body.crawlBar === 'object') {
    const existingCrawlBar = user.preferences?.crawlBar || {};
    const validScrollSpeeds = ['slow', 'normal', 'fast'];
    updates.crawlBar = {
      enabled: typeof req.body.crawlBar.enabled === 'boolean' ? req.body.crawlBar.enabled : (existingCrawlBar.enabled ?? true),
      location: req.body.crawlBar.location !== undefined ? req.body.crawlBar.location : (existingCrawlBar.location ?? null),
      locationName: req.body.crawlBar.locationName !== undefined ? req.body.crawlBar.locationName : (existingCrawlBar.locationName ?? null),
      showStocks: typeof req.body.crawlBar.showStocks === 'boolean' ? req.body.crawlBar.showStocks : (existingCrawlBar.showStocks ?? true),
      showWeather: typeof req.body.crawlBar.showWeather === 'boolean' ? req.body.crawlBar.showWeather : (existingCrawlBar.showWeather ?? true),
      showNews: typeof req.body.crawlBar.showNews === 'boolean' ? req.body.crawlBar.showNews : (existingCrawlBar.showNews ?? true),
      scrollSpeed: validScrollSpeeds.includes(req.body.crawlBar.scrollSpeed) ? req.body.crawlBar.scrollSpeed : (existingCrawlBar.scrollSpeed || 'normal'),
    };
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
    title: 'Farhold Test',
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

// Admin handle request management (admin only)
app.get('/api/admin/handle-requests', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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

// Follow a federated user (direct add, no request flow)
app.post('/api/contacts/follow', authenticateToken, (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Verify the target is a remote user
  const remoteUser = db.getRemoteUser(userId);
  if (!remoteUser) {
    return res.status(400).json({ error: 'User not found or not a federated user' });
  }

  // Add as contact directly (one-way follow)
  const success = db.addContact(req.user.userId, userId);
  if (!success) {
    return res.status(400).json({ error: 'Already following this user' });
  }

  res.json({
    success: true,
    contact: {
      id: remoteUser.id,
      handle: remoteUser.handle,
      name: remoteUser.displayName,
      avatar: remoteUser.avatar,
      avatarUrl: remoteUser.avatarUrl,
      nodeName: remoteUser.nodeName,
      isRemote: true,
    }
  });
});

// Unfollow a federated user
app.delete('/api/contacts/follow/:userId', authenticateToken, (req, res) => {
  const targetUserId = sanitizeInput(req.params.userId);

  // Verify the target is a remote user
  const remoteUser = db.getRemoteUser(targetUserId);
  if (!remoteUser) {
    return res.status(400).json({ error: 'User not found or not a federated user' });
  }

  const success = db.removeContact(req.user.userId, targetUserId);
  if (!success) {
    return res.status(400).json({ error: 'Not following this user' });
  }

  res.json({ success: true });
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

// ============ GIF Search (GIPHY and Tenor API Proxy) ============

// Helper: Search GIFs from GIPHY
async function searchGiphy(query, limit, offset) {
  if (!GIPHY_API_KEY) return null;

  const searchUrl = new URL('https://api.giphy.com/v1/gifs/search');
  searchUrl.searchParams.set('api_key', GIPHY_API_KEY);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('limit', limit.toString());
  searchUrl.searchParams.set('offset', offset.toString());
  searchUrl.searchParams.set('rating', 'pg-13');
  searchUrl.searchParams.set('lang', 'en');

  const response = await fetch(searchUrl.toString(), {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    console.error('GIPHY API error:', response.status);
    return null;
  }

  const data = await response.json();
  return (data.data || []).map(gif => ({
    id: gif.id,
    title: gif.title,
    url: gif.images?.original?.url || '',
    preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || '',
    width: parseInt(gif.images?.fixed_height_small?.width || gif.images?.fixed_height?.width || 100),
    height: parseInt(gif.images?.fixed_height_small?.height || gif.images?.fixed_height?.height || 100),
    provider: 'giphy'
  })).filter(gif => gif.url && gif.preview);
}

// Helper: Search GIFs from Tenor
async function searchTenor(query, limit, offset) {
  if (!TENOR_API_KEY) return null;

  const searchUrl = new URL('https://tenor.googleapis.com/v2/search');
  searchUrl.searchParams.set('key', TENOR_API_KEY);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('limit', limit.toString());
  searchUrl.searchParams.set('pos', offset.toString());
  searchUrl.searchParams.set('contentfilter', 'medium'); // PG-13 equivalent
  searchUrl.searchParams.set('media_filter', 'gif,tinygif');

  const response = await fetch(searchUrl.toString(), {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    console.error('Tenor API error:', response.status);
    return null;
  }

  const data = await response.json();
  return (data.results || []).map(gif => ({
    id: gif.id,
    title: gif.title || gif.content_description || '',
    url: gif.media_formats?.gif?.url || '',
    preview: gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url || '',
    width: gif.media_formats?.tinygif?.dims?.[0] || 100,
    height: gif.media_formats?.tinygif?.dims?.[1] || 100,
    provider: 'tenor'
  })).filter(gif => gif.url && gif.preview);
}

// Helper: Get trending GIFs from GIPHY
async function trendingGiphy(limit, offset) {
  if (!GIPHY_API_KEY) return null;

  const trendingUrl = new URL('https://api.giphy.com/v1/gifs/trending');
  trendingUrl.searchParams.set('api_key', GIPHY_API_KEY);
  trendingUrl.searchParams.set('limit', limit.toString());
  trendingUrl.searchParams.set('offset', offset.toString());
  trendingUrl.searchParams.set('rating', 'pg-13');

  const response = await fetch(trendingUrl.toString(), {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) return null;

  const data = await response.json();
  return (data.data || []).map(gif => ({
    id: gif.id,
    title: gif.title,
    url: gif.images?.original?.url || '',
    preview: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || '',
    width: parseInt(gif.images?.fixed_height_small?.width || gif.images?.fixed_height?.width || 100),
    height: parseInt(gif.images?.fixed_height_small?.height || gif.images?.fixed_height?.height || 100),
    provider: 'giphy'
  })).filter(gif => gif.url && gif.preview);
}

// Helper: Get trending/featured GIFs from Tenor
async function trendingTenor(limit, offset) {
  if (!TENOR_API_KEY) {
    console.log('🎬 Tenor trending: No API key');
    return null;
  }

  const featuredUrl = new URL('https://tenor.googleapis.com/v2/featured');
  featuredUrl.searchParams.set('key', TENOR_API_KEY);
  featuredUrl.searchParams.set('limit', limit.toString());
  featuredUrl.searchParams.set('pos', offset.toString());
  featuredUrl.searchParams.set('contentfilter', 'medium');
  featuredUrl.searchParams.set('media_filter', 'gif,tinygif');

  console.log(`🎬 Tenor trending: Fetching ${limit} GIFs...`);
  const response = await fetch(featuredUrl.toString(), {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    console.error(`🎬 Tenor trending: API error ${response.status}`);
    return null;
  }

  const data = await response.json();
  return (data.results || []).map(gif => ({
    id: gif.id,
    title: gif.title || gif.content_description || '',
    url: gif.media_formats?.gif?.url || '',
    preview: gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url || '',
    width: gif.media_formats?.tinygif?.dims?.[0] || 100,
    height: gif.media_formats?.tinygif?.dims?.[1] || 100,
    provider: 'tenor'
  })).filter(gif => gif.url && gif.preview);
}

// Get GIF provider configuration
app.get('/api/gifs/config', authenticateToken, (req, res) => {
  const providers = [];
  if (GIPHY_API_KEY && (GIF_PROVIDER === 'giphy' || GIF_PROVIDER === 'both')) {
    providers.push('giphy');
  }
  if (TENOR_API_KEY && (GIF_PROVIDER === 'tenor' || GIF_PROVIDER === 'both')) {
    providers.push('tenor');
  }
  res.json({
    providers,
    defaultProvider: GIF_PROVIDER,
    enabled: providers.length > 0
  });
});

// Search GIFs
app.get('/api/gifs/search', authenticateToken, gifSearchLimiter, async (req, res) => {
  const { q, limit = 20, offset = 0, provider } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const maxLimit = Math.min(parseInt(limit) || 20, 50);
  const startOffset = parseInt(offset) || 0;
  const query = q.trim();

  // Determine which provider(s) to use
  const useProvider = provider || GIF_PROVIDER;
  const hasGiphy = GIPHY_API_KEY && (useProvider === 'giphy' || useProvider === 'both');
  const hasTenor = TENOR_API_KEY && (useProvider === 'tenor' || useProvider === 'both');

  if (!hasGiphy && !hasTenor) {
    return res.status(503).json({
      error: 'GIF search is not configured. Set GIPHY_API_KEY or TENOR_API_KEY environment variable.'
    });
  }

  try {
    let gifs = [];

    if (useProvider === 'both' && hasGiphy && hasTenor) {
      // Fetch from both and interleave results
      const halfLimit = Math.ceil(maxLimit / 2);
      const [giphyGifs, tenorGifs] = await Promise.all([
        searchGiphy(query, halfLimit, Math.floor(startOffset / 2)),
        searchTenor(query, halfLimit, Math.floor(startOffset / 2))
      ]);

      // Interleave results
      const g = giphyGifs || [];
      const t = tenorGifs || [];
      for (let i = 0; i < Math.max(g.length, t.length); i++) {
        if (i < g.length) gifs.push(g[i]);
        if (i < t.length) gifs.push(t[i]);
      }
    } else if (hasGiphy) {
      gifs = await searchGiphy(query, maxLimit, startOffset) || [];
    } else if (hasTenor) {
      gifs = await searchTenor(query, maxLimit, startOffset) || [];
    }

    res.json({
      gifs,
      pagination: {
        total_count: gifs.length * 10, // Estimate
        count: gifs.length,
        offset: startOffset,
      },
      provider: useProvider
    });
  } catch (err) {
    console.error('GIF search error:', err);
    res.status(500).json({ error: 'Failed to search GIFs' });
  }
});

// Get trending GIFs
app.get('/api/gifs/trending', authenticateToken, gifSearchLimiter, async (req, res) => {
  const { limit = 20, offset = 0, provider } = req.query;

  const maxLimit = Math.min(parseInt(limit) || 20, 50);
  const startOffset = parseInt(offset) || 0;

  // Determine which provider(s) to use
  const useProvider = provider || GIF_PROVIDER;
  const hasGiphy = GIPHY_API_KEY && (useProvider === 'giphy' || useProvider === 'both');
  const hasTenor = TENOR_API_KEY && (useProvider === 'tenor' || useProvider === 'both');

  console.log(`🎬 GIF trending: provider=${useProvider}, hasGiphy=${hasGiphy}, hasTenor=${hasTenor}`);

  if (!hasGiphy && !hasTenor) {
    return res.status(503).json({
      error: 'GIF search is not configured. Set GIPHY_API_KEY or TENOR_API_KEY environment variable.'
    });
  }

  try {
    let gifs = [];

    if (useProvider === 'both' && hasGiphy && hasTenor) {
      const halfLimit = Math.ceil(maxLimit / 2);
      const [giphyGifs, tenorGifs] = await Promise.all([
        trendingGiphy(halfLimit, Math.floor(startOffset / 2)),
        trendingTenor(halfLimit, Math.floor(startOffset / 2))
      ]);

      const g = giphyGifs || [];
      const t = tenorGifs || [];
      for (let i = 0; i < Math.max(g.length, t.length); i++) {
        if (i < g.length) gifs.push(g[i]);
        if (i < t.length) gifs.push(t[i]);
      }
    } else if (hasGiphy) {
      gifs = await trendingGiphy(maxLimit, startOffset) || [];
    } else if (hasTenor) {
      gifs = await trendingTenor(maxLimit, startOffset) || [];
    }

    res.json({
      gifs,
      pagination: {
        total_count: gifs.length * 10,
        count: gifs.length,
        offset: startOffset,
      },
      provider: useProvider
    });
  } catch (err) {
    console.error('Trending GIFs error:', err);
    res.status(500).json({ error: 'Failed to fetch trending GIFs' });
  }
});

// ============ Crawl Bar Endpoints (v1.15.0) ============

// Get crawl bar configuration (admin only)
app.get('/api/admin/crawl/config', authenticateToken, (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const config = db.getCrawlConfig();
  // Return config in snake_case format for client compatibility
  res.json({
    config: {
      stock_symbols: config.stockSymbols,
      news_sources: config.newsSources,
      default_location: config.defaultLocation,
      stock_refresh_interval: config.stockRefreshInterval,
      weather_refresh_interval: config.weatherRefreshInterval,
      news_refresh_interval: config.newsRefreshInterval,
      stocks_enabled: config.stocksEnabled,
      weather_enabled: config.weatherEnabled,
      news_enabled: config.newsEnabled,
      apiKeys: {
        finnhub: !!FINNHUB_API_KEY,
        openweathermap: !!OPENWEATHERMAP_API_KEY,
        weatherapi: !!WEATHERAPI_KEY,
        tomorrowio: !!TOMORROWIO_API_KEY,
        newsapi: !!NEWSAPI_KEY,
        gnews: !!GNEWS_API_KEY,
        mediastack: !!MEDIASTACK_API_KEY,
        rss_feeds: NEWS_RSS_FEEDS.length,
      }
    }
  });
});

// Update crawl bar configuration (admin only)
app.put('/api/admin/crawl/config', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  // Accept both snake_case and camelCase for flexibility
  const {
    stock_symbols, stockSymbols,
    news_sources, newsSources,
    default_location, defaultLocation,
    stock_refresh_interval, stockRefreshInterval,
    weather_refresh_interval, weatherRefreshInterval,
    news_refresh_interval, newsRefreshInterval,
    stocks_enabled, stocksEnabled,
    weather_enabled, weatherEnabled,
    news_enabled, newsEnabled
  } = req.body;

  // Handle location - geocode if only name provided
  let locationInput = default_location || defaultLocation;
  if (locationInput) {
    // If location has name but no valid coordinates, try to geocode
    if (locationInput.name && (typeof locationInput.lat !== 'number' || typeof locationInput.lon !== 'number')) {
      const geocoded = await geocodeLocation(locationInput.name);
      if (geocoded) {
        locationInput = geocoded;
      } else {
        return res.status(400).json({ error: `Could not find coordinates for "${locationInput.name}". Try "City, Country" format (e.g., "Coudersport, US")` });
      }
    }
  }

  const config = db.updateCrawlConfig({
    stockSymbols: stock_symbols || stockSymbols,
    newsSources: news_sources || newsSources,
    defaultLocation: locationInput,
    stockRefreshInterval: stock_refresh_interval ?? stockRefreshInterval,
    weatherRefreshInterval: weather_refresh_interval ?? weatherRefreshInterval,
    newsRefreshInterval: news_refresh_interval ?? newsRefreshInterval,
    stocksEnabled: stocks_enabled !== undefined ? stocks_enabled : stocksEnabled,
    weatherEnabled: weather_enabled !== undefined ? weather_enabled : weatherEnabled,
    newsEnabled: news_enabled !== undefined ? news_enabled : newsEnabled
  });

  // Return config in snake_case format for client compatibility
  res.json({
    config: {
      stock_symbols: config.stockSymbols,
      news_sources: config.newsSources,
      default_location: config.defaultLocation,
      stock_refresh_interval: config.stockRefreshInterval,
      weather_refresh_interval: config.weatherRefreshInterval,
      news_refresh_interval: config.newsRefreshInterval,
      stocks_enabled: config.stocksEnabled,
      weather_enabled: config.weatherEnabled,
      news_enabled: config.newsEnabled,
      apiKeys: {
        finnhub: !!FINNHUB_API_KEY,
        openweathermap: !!OPENWEATHERMAP_API_KEY,
        weatherapi: !!WEATHERAPI_KEY,
        tomorrowio: !!TOMORROWIO_API_KEY,
        newsapi: !!NEWSAPI_KEY,
        gnews: !!GNEWS_API_KEY,
        mediastack: !!MEDIASTACK_API_KEY,
        rss_feeds: NEWS_RSS_FEEDS.length,
      }
    }
  });
});

// Get stock quotes
app.get('/api/crawl/stocks', authenticateToken, crawlLimiter, async (req, res) => {
  if (!FINNHUB_API_KEY) {
    return res.json({
      enabled: false,
      stocks: [],
      error: 'Stock data not configured'
    });
  }

  const config = db.getCrawlConfig();
  if (!config.stocksEnabled) {
    return res.json({ enabled: false, stocks: [] });
  }

  const symbols = config.stockSymbols || [];

  // Fetch quotes in parallel (limited to 10 to respect rate limits)
  const quotes = await Promise.all(
    symbols.slice(0, 10).map(s => fetchStockQuote(s))
  );

  res.json({
    enabled: true,
    stocks: quotes.filter(Boolean),
    timestamp: Date.now(),
  });
});

// Get weather data
app.get('/api/crawl/weather', authenticateToken, crawlLimiter, async (req, res) => {
  if (!OPENWEATHERMAP_API_KEY && !WEATHERAPI_KEY && !TOMORROWIO_API_KEY) {
    return res.json({
      enabled: false,
      weather: null,
      error: 'Weather data not configured'
    });
  }

  const config = db.getCrawlConfig();
  if (!config.weatherEnabled) {
    return res.json({ enabled: false, weather: null });
  }

  const userId = req.user.userId;
  const user = db.findUserById(userId);
  const prefs = user?.preferences || {};
  const crawlPrefs = prefs.crawlBar || {};

  // Priority: user location > user locationName (geocoded) > IP geolocation > server default
  let location = crawlPrefs.location;

  // If user has a locationName but no geocoded location, geocode it now
  if (!location && crawlPrefs.locationName) {
    location = await geocodeLocation(crawlPrefs.locationName);
  }

  // Try IP geolocation if no user location
  if (!location) {
    const clientIP = getClientIP(req);
    location = await getLocationFromIP(clientIP);
  }

  // Fall back to server default
  if (!location) {
    location = config.defaultLocation;
  }

  // If stored default location has invalid coordinates, use hardcoded fallback
  if (!location?.lat || !location?.lon) {
    location = { lat: 40.7128, lon: -74.006, name: 'New York, NY' };
  }

  const weather = await fetchWeather(location.lat, location.lon);

  res.json({
    enabled: true,
    weather,
    location: { name: location.name, lat: location.lat, lon: location.lon },
    timestamp: Date.now(),
  });
});

// Get news headlines
app.get('/api/crawl/news', authenticateToken, crawlLimiter, async (req, res) => {
  if (!NEWSAPI_KEY && !GNEWS_API_KEY && !MEDIASTACK_API_KEY && NEWS_RSS_FEEDS.length === 0) {
    return res.json({
      enabled: false,
      headlines: [],
      error: 'News data not configured'
    });
  }

  const config = db.getCrawlConfig();
  if (!config.newsEnabled) {
    return res.json({ enabled: false, headlines: [] });
  }

  const news = await fetchNews();

  res.json({
    enabled: true,
    headlines: news?.headlines || [],
    timestamp: Date.now(),
  });
});

// Combined endpoint for efficiency (preferred by client)
app.get('/api/crawl/all', authenticateToken, crawlLimiter, async (req, res) => {
  const config = db.getCrawlConfig();
  const userId = req.user.userId;
  const user = db.findUserById(userId);
  const prefs = user?.preferences || {};
  const crawlPrefs = prefs.crawlBar || {};

  const result = {
    timestamp: Date.now(),
    stocks: { enabled: false, data: [] },
    weather: { enabled: false, data: null, location: null },
    news: { enabled: false, data: [] },
    alerts: { enabled: true, data: [] },
  };

  // Fetch active alerts for this user (synchronous, no API call)
  try {
    const alerts = db.getActiveAlerts(userId);
    // getActiveAlerts already returns camelCase properties
    result.alerts.data = alerts.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      priority: a.priority,
      category: a.category,
      startTime: a.startTime,
      endTime: a.endTime,
      originNode: a.originNode
    }));
  } catch (err) {
    console.error('Crawl alerts error:', err.message);
  }

  const promises = [];

  // Stocks
  if (FINNHUB_API_KEY && config.stocksEnabled && crawlPrefs.showStocks !== false) {
    const symbols = config.stockSymbols || [];
    promises.push(
      Promise.all(symbols.slice(0, 10).map(s => fetchStockQuote(s)))
        .then(quotes => {
          result.stocks = { enabled: true, data: quotes.filter(Boolean) };
        })
        .catch(err => {
          console.error('Crawl stocks error:', err.message);
        })
    );
  }

  // Weather (any provider)
  const hasWeatherProvider = OPENWEATHERMAP_API_KEY || WEATHERAPI_KEY || TOMORROWIO_API_KEY;
  if (hasWeatherProvider && config.weatherEnabled && crawlPrefs.showWeather !== false) {
    promises.push(
      (async () => {
        let location = crawlPrefs.location;

        // If user has a locationName but no geocoded location, geocode it now
        if (!location && crawlPrefs.locationName) {
          location = await geocodeLocation(crawlPrefs.locationName);
        }

        // Try IP geolocation if no user location
        if (!location) {
          const clientIP = getClientIP(req);
          location = await getLocationFromIP(clientIP);
        }

        // Fall back to server default
        if (!location) {
          location = config.defaultLocation;
        }

        // Hardcoded fallback if stored location has invalid coordinates
        if (!location?.lat || !location?.lon) {
          location = { lat: 40.7128, lon: -74.006, name: 'New York, NY' };
        }

        const weather = await fetchWeather(location.lat, location.lon);
        result.weather = {
          enabled: true,
          data: weather,
          location: { name: location.name, lat: location.lat, lon: location.lon }
        };
      })().catch(err => {
        console.error('Crawl weather error:', err.message);
      })
    );
  }

  // News (any provider)
  const hasNewsProvider = NEWSAPI_KEY || GNEWS_API_KEY || MEDIASTACK_API_KEY || NEWS_RSS_FEEDS.length > 0;
  if (hasNewsProvider && config.newsEnabled && crawlPrefs.showNews !== false) {
    promises.push(
      fetchNews()
        .then(news => {
          result.news = { enabled: true, data: news?.headlines || [] };
        })
        .catch(err => {
          console.error('Crawl news error:', err.message);
        })
    );
  }

  await Promise.all(promises);

  res.json(result);
});

// Update user's crawl bar preferences
app.put('/api/profile/crawl-preferences', authenticateToken, (req, res) => {
  // Support both nested crawlBar object and flat properties
  const input = req.body.crawlBar || req.body;
  const { enabled, location, showStocks, showWeather, showNews, scrollSpeed } = input;

  const userId = req.user.userId;
  const user = db.findUserById(userId);
  const prefs = user?.preferences || {};

  const crawlBar = {
    enabled: enabled !== undefined ? enabled : (prefs.crawlBar?.enabled ?? true),
    location: location !== undefined ? location : (prefs.crawlBar?.location ?? null),
    showStocks: showStocks !== undefined ? showStocks : (prefs.crawlBar?.showStocks ?? true),
    showWeather: showWeather !== undefined ? showWeather : (prefs.crawlBar?.showWeather ?? true),
    showNews: showNews !== undefined ? showNews : (prefs.crawlBar?.showNews ?? true),
    scrollSpeed: scrollSpeed || prefs.crawlBar?.scrollSpeed || 'normal',
  };

  const updatedPrefs = { ...prefs, crawlBar };
  db.updateUserPreferences(userId, updatedPrefs);

  res.json({ success: true, crawlBar });
});

// ============ Alert Endpoints (v1.16.0) ============

// Get all alerts (admin only)
app.get('/api/admin/alerts', authenticateToken, (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const { limit = 50, offset = 0, status = 'all' } = req.query;
  const alerts = db.getAllAlerts({
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    status
  });

  res.json({ alerts });
});

// Create alert (admin only)
app.post('/api/admin/alerts', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const { title, content, priority, category, scope, startTime, endTime } = req.body;

  // Validation
  if (!title || title.length > 100) {
    return res.status(400).json({ error: 'Title is required (max 100 characters)' });
  }
  if (!content || content.length > 1000) {
    return res.status(400).json({ error: 'Content is required (max 1000 characters)' });
  }
  if (!['info', 'warning', 'critical'].includes(priority)) {
    return res.status(400).json({ error: 'Priority must be info, warning, or critical' });
  }
  if (!['system', 'announcement', 'emergency'].includes(category)) {
    return res.status(400).json({ error: 'Category must be system, announcement, or emergency' });
  }
  if (!['local', 'federated'].includes(scope)) {
    return res.status(400).json({ error: 'Scope must be local or federated' });
  }
  if (!startTime || !endTime) {
    return res.status(400).json({ error: 'Start time and end time are required' });
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (end <= start) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  // Sanitize content
  const sanitizedContent = sanitizeHtml(content, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br'],
    allowedAttributes: { a: ['href', 'target'] }
  });

  const alert = db.createAlert({
    title: title.trim(),
    content: sanitizedContent,
    priority,
    category,
    scope,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    createdBy: admin.id
  });

  console.log(`📢 Alert created: "${alert.title}" by ${admin.handle} (${scope}, ${priority})`);

  // If federated, broadcast to subscribers
  if (scope === 'federated' && FEDERATION_ENABLED) {
    const subscribers = db.getSubscribersForCategory(category);
    console.log(`📡 Broadcasting alert to ${subscribers.length} subscribers`);

    for (const sub of subscribers) {
      const node = db.getFederationNodeByName(sub.subscriberNode);
      if (node?.status === 'active') {
        const messageId = `alert-broadcast-${alert.id}-${Date.now()}`;
        const payload = {
          id: messageId,
          type: 'alert_broadcast',
          payload: {
            alertId: alert.id,
            title: alert.title,
            content: alert.content,
            priority: alert.priority,
            category: alert.category,
            startTime: alert.startTime,
            endTime: alert.endTime,
            originNode: db.getServerIdentity()?.nodeName
          }
        };

        try {
          await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', payload);
          console.log(`✅ Alert broadcast to ${sub.subscriberNode}`);
        } catch (err) {
          console.error(`❌ Failed to broadcast alert to ${sub.subscriberNode}:`, err.message);
          // Queue for retry
          db.queueFederationMessage({
            targetNode: sub.subscriberNode,
            messageType: 'alert_broadcast',
            payload
          });
        }
      }
    }
  }

  res.json({ success: true, alert });
});

// Update alert (admin only)
app.put('/api/admin/alerts/:id', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const alertId = req.params.id;
  const existingAlert = db.getAlert(alertId);
  if (!existingAlert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  const { title, content, priority, category, scope, startTime, endTime } = req.body;
  const updates = {};

  if (title !== undefined) {
    if (title.length > 100) {
      return res.status(400).json({ error: 'Title max 100 characters' });
    }
    updates.title = title.trim();
  }
  if (content !== undefined) {
    if (content.length > 1000) {
      return res.status(400).json({ error: 'Content max 1000 characters' });
    }
    updates.content = sanitizeHtml(content, {
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br'],
      allowedAttributes: { a: ['href', 'target'] }
    });
  }
  if (priority !== undefined) {
    if (!['info', 'warning', 'critical'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }
    updates.priority = priority;
  }
  if (category !== undefined) {
    if (!['system', 'announcement', 'emergency'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    updates.category = category;
  }
  if (scope !== undefined) {
    if (!['local', 'federated'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid scope' });
    }
    updates.scope = scope;
  }
  if (startTime !== undefined) {
    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid start time' });
    }
    updates.startTime = start.toISOString();
  }
  if (endTime !== undefined) {
    const end = new Date(endTime);
    if (isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid end time' });
    }
    updates.endTime = end.toISOString();
  }

  const alert = db.updateAlert(alertId, updates);
  console.log(`📝 Alert updated: "${alert.title}" by ${admin.handle}`);

  // If federated, broadcast update to subscribers
  if (alert.scope === 'federated' && FEDERATION_ENABLED) {
    const subscribers = db.getSubscribersForCategory(alert.category);
    for (const sub of subscribers) {
      const node = db.getFederationNodeByName(sub.subscriberNode);
      if (node?.status === 'active') {
        const messageId = `alert-update-${alert.id}-${Date.now()}`;
        const payload = {
          id: messageId,
          type: 'alert_update',
          payload: {
            alertId: alert.id,
            originNode: db.getServerIdentity()?.nodeName,
            updates: {
              title: alert.title,
              content: alert.content,
              priority: alert.priority,
              category: alert.category,
              startTime: alert.startTime,
              endTime: alert.endTime
            }
          }
        };

        try {
          await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', payload);
        } catch (err) {
          db.queueFederationMessage({
            targetNode: sub.subscriberNode,
            messageType: 'alert_update',
            payload
          });
        }
      }
    }
  }

  res.json({ success: true, alert });
});

// Delete alert (admin only)
app.delete('/api/admin/alerts/:id', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const alertId = req.params.id;
  const alert = db.getAlert(alertId);
  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  // If federated, notify subscribers before deletion
  if (alert.scope === 'federated' && FEDERATION_ENABLED) {
    const subscribers = db.getSubscribersForCategory(alert.category);
    for (const sub of subscribers) {
      const node = db.getFederationNodeByName(sub.subscriberNode);
      if (node?.status === 'active') {
        const messageId = `alert-delete-${alert.id}-${Date.now()}`;
        const payload = {
          id: messageId,
          type: 'alert_delete',
          payload: {
            alertId: alert.id,
            originNode: db.getServerIdentity()?.nodeName
          }
        };

        try {
          await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', payload);
        } catch (err) {
          // Don't queue delete messages - if they fail, the alert will expire naturally
          console.error(`Failed to send alert deletion to ${sub.subscriberNode}:`, err.message);
        }
      }
    }
  }

  db.deleteAlert(alertId);
  console.log(`🗑️ Alert deleted: "${alert.title}" by ${admin.handle}`);

  res.json({ success: true });
});

// Get active alerts for current user (for crawl bar)
app.get('/api/alerts/active', authenticateToken, (req, res) => {
  const alerts = db.getActiveAlerts(req.user.userId);
  res.json({ alerts });
});

// Dismiss an alert for current user
app.post('/api/alerts/:id/dismiss', authenticateToken, (req, res) => {
  const alertId = req.params.id;
  const alert = db.getAlert(alertId);

  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  db.dismissAlert(alertId, req.user.userId);
  res.json({ success: true });
});

// ============ Alert Subscription Endpoints (v1.16.0) ============

// Get all alert subscriptions (admin only)
app.get('/api/admin/alert-subscriptions', authenticateToken, (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const subscriptions = db.getAllAlertSubscriptions();
  res.json({ subscriptions });
});

// Subscribe to alerts from a federated node (admin only)
app.post('/api/admin/alert-subscriptions', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const { sourceNode, categories } = req.body;

  if (!sourceNode) {
    return res.status(400).json({ error: 'Source node is required' });
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'At least one category is required' });
  }

  // Validate categories
  const validCategories = ['system', 'announcement', 'emergency'];
  for (const cat of categories) {
    if (!validCategories.includes(cat)) {
      return res.status(400).json({ error: `Invalid category: ${cat}` });
    }
  }

  // Check if already subscribed
  const existing = db.getAlertSubscriptionByNode(sourceNode);
  if (existing) {
    return res.status(400).json({ error: 'Already subscribed to this node' });
  }

  // Verify node exists in federation
  const node = db.getFederationNodeByName(sourceNode);
  if (!node || node.status !== 'active') {
    return res.status(400).json({ error: 'Node is not an active federation partner' });
  }

  const subscription = db.createAlertSubscription({
    sourceNode,
    categories,
    createdBy: admin.id
  });

  // Notify the source node that we're subscribing
  if (FEDERATION_ENABLED) {
    const messageId = `alert-subscribe-${Date.now()}`;
    const payload = {
      id: messageId,
      type: 'alert_subscribe',
      payload: {
        subscriberNode: db.getServerIdentity()?.nodeName,
        categories
      }
    };

    try {
      await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', payload);
      console.log(`📡 Subscribed to alerts from ${sourceNode}: ${categories.join(', ')}`);
    } catch (err) {
      console.error(`Failed to notify ${sourceNode} of subscription:`, err.message);
      // Continue anyway - subscription is local, notifications are best-effort
    }
  }

  res.json({ success: true, subscription });
});

// Update alert subscription (admin only)
app.put('/api/admin/alert-subscriptions/:id', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const subscriptionId = req.params.id;
  const existing = db.getAlertSubscription(subscriptionId);
  if (!existing) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  const { categories, status } = req.body;
  const updates = {};

  if (categories !== undefined) {
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'At least one category is required' });
    }
    const validCategories = ['system', 'announcement', 'emergency'];
    for (const cat of categories) {
      if (!validCategories.includes(cat)) {
        return res.status(400).json({ error: `Invalid category: ${cat}` });
      }
    }
    updates.categories = categories;
  }

  if (status !== undefined) {
    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or paused' });
    }
    updates.status = status;
  }

  const subscription = db.updateAlertSubscription(subscriptionId, updates);
  res.json({ success: true, subscription });
});

// Delete alert subscription (admin only)
app.delete('/api/admin/alert-subscriptions/:id', authenticateToken, async (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.ADMIN, res)) return;

  const subscriptionId = req.params.id;
  const subscription = db.getAlertSubscription(subscriptionId);
  if (!subscription) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  // Notify the source node that we're unsubscribing
  if (FEDERATION_ENABLED) {
    const node = db.getFederationNodeByName(subscription.sourceNode);
    if (node?.status === 'active') {
      const messageId = `alert-unsubscribe-${Date.now()}`;
      const payload = {
        id: messageId,
        type: 'alert_unsubscribe',
        payload: {
          subscriberNode: db.getServerIdentity()?.nodeName
        }
      };

      try {
        await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', payload);
        console.log(`📡 Unsubscribed from alerts from ${subscription.sourceNode}`);
      } catch (err) {
        console.error(`Failed to notify ${subscription.sourceNode} of unsubscription:`, err.message);
      }
    }
  }

  db.deleteAlertSubscription(subscriptionId);
  res.json({ success: true });
});

// ============ Share Routes (v1.17.0) ============

// GET /share/:dropletId - HTML page with Open Graph meta tags for social sharing
// This is a PUBLIC endpoint (no auth required) to allow social media crawlers to fetch previews
app.get('/share/:dropletId', async (req, res) => {
  const dropletId = sanitizeInput(req.params.dropletId);

  const droplet = db.getDroplet(dropletId);
  const wave = droplet ? db.getWave(droplet.wave_id) : null;
  const author = droplet ? db.findUserById(droplet.author_id) : null;
  const isPublic = wave?.privacy === 'public';

  // Strip HTML tags from content for meta description
  const plainContent = (droplet?.content || '')
    .replace(/<[^>]*>/g, '')
    .substring(0, 200);

  const title = wave?.title || 'Farhold';
  const authorName = author?.displayName || author?.display_name || 'Someone';
  const description = isPublic && plainContent
    ? `${authorName}: "${plainContent}${plainContent.length >= 200 ? '...' : ''}"`
    : 'Join Farhold to view this ping';

  // Server base URL for absolute paths
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
  const shareUrl = `${baseUrl}/share/${dropletId}`;
  const logoUrl = `${baseUrl}/icons/icon-512.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Farhold</title>

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)} - Farhold">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:image" content="${logoUrl}">
  <meta property="og:site_name" content="Farhold">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)} - Farhold">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${logoUrl}">

  <!-- Redirect to app -->
  <script>
    window.location.href = '/?share=${dropletId}';
  </script>
  <style>
    body {
      font-family: 'Courier New', monospace;
      background: #050805;
      color: #0ead69;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    a {
      color: #ffd23f;
    }
  </style>
</head>
<body>
  <div class="container">
    <p>Redirecting to Farhold...</p>
    <p><a href="/?share=${dropletId}">Click here if not redirected</a></p>
  </div>
</body>
</html>`;

  res.type('html').send(html);
});

// GET /api/share/:dropletId - JSON endpoint for shared droplet data
// This is a PUBLIC endpoint (no auth required for public waves)
app.get('/api/share/:dropletId', async (req, res) => {
  const dropletId = sanitizeInput(req.params.dropletId);

  // Get droplet
  const droplet = db.getDroplet(dropletId);
  if (!droplet) {
    return res.status(404).json({ error: 'Droplet not found' });
  }

  // Get wave info (use wave_id from database)
  const wave = db.getWave(droplet.wave_id);
  if (!wave) {
    return res.status(404).json({ error: 'Wave not found' });
  }

  // Check if wave is public
  const isPublic = wave.privacy === 'public';

  // Get author info (use author_id from database)
  const author = db.findUserById(droplet.author_id);

  // Return share data (limited info for privacy)
  res.json({
    droplet: {
      id: droplet.id,
      content: isPublic ? droplet.content : null,
      createdAt: droplet.created_at,
    },
    wave: {
      id: wave.id,
      title: wave.title,
      privacy: wave.privacy,
    },
    author: {
      displayName: author?.displayName || author?.display_name || 'Unknown',
      handle: author?.handle,
      avatarUrl: isPublic ? (author?.avatarUrl || author?.avatar_url) : null,
    },
    isPublic,
    requiresLogin: !isPublic,
  });
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

// oEmbed proxy endpoint with caching (public - no auth required, just rate limited)
// This is safe because it only proxies public oEmbed APIs and doesn't expose user data
app.get('/api/embeds/oembed', oembedLimiter, async (req, res) => {
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

// Get reports (moderator+)
app.get('/api/admin/reports', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

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

// Resolve report (moderator+)
app.post('/api/admin/reports/:id/resolve', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

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

// Dismiss report (moderator+)
app.post('/api/admin/reports/:id/dismiss', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

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

// Issue warning to user (moderator+)
app.post('/api/admin/users/:id/warn', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

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

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'admin_warn', 'user', targetUserId, { ...getRequestMeta(req), reason: sanitizeInput(reason), reportId });

  // Notify user via WebSocket
  broadcast({
    type: 'warning_received',
    warning,
    targetUserId
  });

  res.json({ success: true, warning });
});

// Get warnings for a user (moderator+)
app.get('/api/admin/users/:id/warnings', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

  const targetUserId = sanitizeInput(req.params.id);
  const warnings = db.getWarningsByUser(targetUserId);

  res.json({ warnings, count: warnings.length });
});

// Admin user search (moderator+)
// Returns users with admin-level details including email, isAdmin, and MFA status
app.get('/api/admin/users/search', authenticateToken, (req, res) => {
  const admin = db.findUserById(req.user.userId);
  if (!requireRole(admin, ROLES.MODERATOR, res)) return;

  const query = sanitizeInput(req.query.q);
  if (!query || query.length < 1) {
    return res.json({ users: [] });
  }

  const users = db.adminSearchUsers(query);
  res.json({ users });
});

// Admin password reset (moderator+)
// Allows moderators/admins to reset a user's password and optionally send them a temporary password
app.post('/api/admin/users/:id/reset-password', authenticateToken, async (req, res) => {
  try {
    const admin = db.findUserById(req.user.userId);
    if (!requireRole(admin, ROLES.MODERATOR, res)) return;

    const targetUserId = sanitizeInput(req.params.id);
    const { temporaryPassword, sendEmail: shouldSendEmail } = req.body;

    const targetUser = db.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow resetting your own password this way
    if (targetUserId === admin.id) {
      return res.status(400).json({ error: 'Cannot reset your own password via admin panel' });
    }

    // Generate temporary password if not provided
    const tempPassword = temporaryPassword || crypto.randomBytes(12).toString('base64').slice(0, 16);

    // Validate temporary password
    if (tempPassword.length < 8) {
      return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
    }

    // Set new password with requireChange flag
    const result = await db.setPassword(targetUserId, tempPassword, true);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to reset password' });
    }

    // Clear account lockouts
    db.clearFailedLogins(targetUser.handle);
    if (targetUser.email) db.clearFailedLogins(targetUser.email);

    // Log the action
    if (db.logModerationAction) {
      db.logModerationAction(admin.id, 'password_reset', 'user', targetUserId, 'Admin password reset');
    }

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'admin_password_reset', 'user', targetUserId, { ...getRequestMeta(req), emailSent: shouldSendEmail && targetUser.email });

    // Optionally send email with temporary password
    let emailSent = false;
    if (shouldSendEmail && targetUser.email) {
      const emailService = getEmailService();
      if (emailService.isConfigured()) {
        const emailResult = await emailService.sendTempPasswordEmail(targetUser.email, tempPassword, admin.displayName || admin.handle);
        emailSent = emailResult.success;
        if (!emailSent) {
          console.warn(`Failed to send temp password email to ${targetUser.email}: ${emailResult.error}`);
        }
      }
    }

    console.log(`Admin ${admin.handle} reset password for user ${targetUser.handle}`);

    res.json({
      success: true,
      temporaryPassword: shouldSendEmail ? undefined : tempPassword, // Only return password if not emailed
      emailSent,
      message: emailSent
        ? 'Password reset. User will receive an email with their temporary password.'
        : 'Password reset. User will be required to change password on next login.'
    });
  } catch (err) {
    console.error('Admin password reset error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Force logout all sessions for a user (moderator+)
app.post('/api/admin/users/:id/force-logout', authenticateToken, (req, res) => {
  try {
    const admin = db.findUserById(req.user.userId);
    if (!requireRole(admin, ROLES.MODERATOR, res)) return;

    const targetUserId = sanitizeInput(req.params.id);
    const targetUser = db.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user status to offline
    db.updateUserStatus(targetUserId, 'offline');

    // Note: True session invalidation would require token version tracking or token blacklisting
    // For now, we just update status. The user's existing tokens remain valid until expiry.
    // Full implementation would need a tokenVersion field in users table that gets checked on every request.

    // Log the action
    if (db.logModerationAction) {
      db.logModerationAction(admin.id, 'force_logout', 'user', targetUserId, 'Admin forced logout');
    }

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'admin_force_logout', 'user', targetUserId, getRequestMeta(req));

    console.log(`Admin ${admin.handle} forced logout for user ${targetUser.handle}`);

    res.json({
      success: true,
      message: 'User status set to offline. Note: Existing tokens remain valid until expiry.'
    });
  } catch (err) {
    console.error('Force logout error:', err);
    res.status(500).json({ error: 'Failed to force logout' });
  }
});

// Disable MFA for a user (moderator+ - emergency lockout recovery)
app.post('/api/admin/users/:id/disable-mfa', authenticateToken, (req, res) => {
  try {
    const admin = db.findUserById(req.user.userId);
    if (!requireRole(admin, ROLES.MODERATOR, res)) return;

    const targetUserId = sanitizeInput(req.params.id);
    const targetUser = db.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow disabling your own MFA this way
    if (targetUserId === admin.id) {
      return res.status(400).json({ error: 'Cannot disable your own MFA via admin panel' });
    }

    // Disable all MFA methods
    if (db.disableTotp) db.disableTotp(targetUserId);
    if (db.disableEmailMfa) db.disableEmailMfa(targetUserId);

    // Clear recovery codes
    if (db.storeRecoveryCodes) db.storeRecoveryCodes(targetUserId, []);

    // Log the action
    if (db.logModerationAction) {
      db.logModerationAction(admin.id, 'disable_mfa', 'user', targetUserId, 'Admin disabled MFA for lockout recovery');
    }

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'admin_disable_mfa', 'user', targetUserId, getRequestMeta(req));

    console.log(`Admin ${admin.handle} disabled MFA for user ${targetUser.handle}`);

    res.json({
      success: true,
      message: 'MFA disabled for user. They can now log in with just their password.'
    });
  } catch (err) {
    console.error('Admin disable MFA error:', err);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

// Update user role (admin only) - v1.20.0
app.put('/api/admin/users/:id/role', authenticateToken, (req, res) => {
  try {
    const admin = db.findUserById(req.user.userId);
    if (!requireRole(admin, ROLES.ADMIN, res)) return;

    const targetUserId = sanitizeInput(req.params.id);
    const { role } = req.body;

    // Validate role
    const validRoles = ['admin', 'moderator', 'user'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be: admin, moderator, or user' });
    }

    // Cannot change your own role
    if (targetUserId === admin.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const result = db.updateUserRole(targetUserId, role);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Log the action
    if (db.logModerationAction) {
      db.logModerationAction(admin.id, 'change_role', 'user', targetUserId, `Changed role to ${role}`);
    }

    // Log activity
    if (db.logActivity) db.logActivity(req.user.userId, 'admin_change_role', 'user', targetUserId, getRequestMeta(req));

    console.log(`Admin ${admin.handle} changed role of user ${result.user.handle} to ${role}`);

    res.json({
      success: true,
      user: {
        id: result.user.id,
        handle: result.user.handle,
        displayName: result.user.displayName,
        role: result.user.role,
        isAdmin: result.user.isAdmin
      }
    });
  } catch (err) {
    console.error('Admin change role error:', err);
    res.status(500).json({ error: 'Failed to change user role' });
  }
});

// Get moderation log (moderator+)
app.get('/api/admin/moderation-log', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  const logs = db.getModerationLog(limit, offset);

  res.json({ logs, count: logs.length });
});

// Get moderation log for specific target (moderator+)
app.get('/api/admin/moderation-log/:targetType/:targetId', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

  const targetType = sanitizeInput(req.params.targetType);
  const targetId = sanitizeInput(req.params.targetId);

  if (!['user', 'message', 'wave'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid target type' });
  }

  const logs = db.getModerationLogForTarget(targetType, targetId);

  res.json({ logs, count: logs.length });
});

// Get activity log (moderator+)
app.get('/api/admin/activity-log', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

  if (!db.getActivityLog) {
    return res.status(501).json({ error: 'Activity logging not available in this database mode' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId ? sanitizeInput(req.query.userId) : null;
  const actionType = req.query.actionType ? sanitizeInput(req.query.actionType) : null;
  const startDate = req.query.startDate ? sanitizeInput(req.query.startDate) : null;
  const endDate = req.query.endDate ? sanitizeInput(req.query.endDate) : null;

  try {
    const result = db.getActivityLog({
      userId,
      actionType,
      startDate,
      endDate,
      limit,
      offset
    });

    res.json(result);
  } catch (err) {
    console.error('Activity log error:', err);
    res.status(500).json({ error: 'Failed to retrieve activity log' });
  }
});

// Get activity stats (moderator+)
app.get('/api/admin/activity-stats', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

  if (!db.getActivityStats) {
    return res.status(501).json({ error: 'Activity logging not available in this database mode' });
  }

  const days = Math.min(parseInt(req.query.days) || 7, 90);

  try {
    const stats = db.getActivityStats(days);
    res.json(stats);
  } catch (err) {
    console.error('Activity stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve activity stats' });
  }
});

// Get activity log for a specific user (moderator+)
app.get('/api/admin/activity-log/user/:userId', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.MODERATOR, res)) return;

  if (!db.getUserActivityLog) {
    return res.status(501).json({ error: 'Activity logging not available in this database mode' });
  }

  const targetUserId = sanitizeInput(req.params.userId);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  try {
    const activities = db.getUserActivityLog(targetUserId, limit);
    res.json({ activities, count: activities.length });
  } catch (err) {
    console.error('User activity log error:', err);
    res.status(500).json({ error: 'Failed to retrieve user activity log' });
  }
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
  // For backward compatibility, stringify the body if it's an object
  const bodyString = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  return createHttpSignatureFromString(method, url, bodyString || null, privateKey, nodeName);
}

// Create HTTP signature from an already-stringified body
function createHttpSignatureFromString(method, url, bodyString, privateKey, nodeName) {
  const parsedUrl = new URL(url);
  const date = new Date().toUTCString();
  const requestTarget = `${method.toLowerCase()} ${parsedUrl.pathname}`;

  // Create digest of body (SHA-256)
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
// Factory function to create auth middleware with allowed statuses
function createFederationAuthMiddleware(allowedStatuses = ['active']) {
  return function(req, res, next) {
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

    if (!allowedStatuses.includes(node.status)) {
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

    // Record successful contact (only for active nodes)
    if (node.status === 'active') {
      db.recordFederationContact(node.id, true);
    }

    next();
  };
}

// Default middleware for active nodes only
const authenticateFederationRequest = createFederationAuthMiddleware(['active']);

// Middleware that also allows outbound_pending (for accept/decline responses)
const authenticateFederationResponse = createFederationAuthMiddleware(['active', 'outbound_pending']);

// Helper to send signed federation requests
async function sendSignedFederationRequest(targetNode, method, path, body = null) {
  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    throw new Error('Server identity not configured');
  }

  const url = `${targetNode.baseUrl}${path}`;

  // Stringify body once and use the same string for both signature and request
  // Guard against double-stringify: if body is already a string, don't stringify again
  let bodyString = null;
  if (body) {
    if (typeof body === 'string') {
      bodyString = body;
    } else {
      bodyString = JSON.stringify(body);
    }
  }

  // Pass the stringified body to createHttpSignature for consistent digest calculation
  const headers = createHttpSignatureFromString(method, url, bodyString, ourIdentity.privateKey, ourIdentity.nodeName);

  // Remove undefined headers
  Object.keys(headers).forEach(key => headers[key] === undefined && delete headers[key]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
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
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
// TODO: UUID collision risk when cloning databases
// If a production database is cloned to set up a new server, all UUIDs (users, waves,
// droplets) will be identical on both servers. The federation design assumes UUIDs are
// globally unique - collisions would cause:
// - User ID conflicts (same UUID = different people on different servers)
// - Wave ID conflicts (federation state confusion)
// - Droplet deduplication failures or incorrect message merging
// Potential safeguards:
// 1. Document: "Don't clone databases between federated servers"
// 2. Add validation: refuse to federate if remote has matching origin_wave_ids
// 3. Provide ID regeneration script for setting up new servers from backups
// 4. Include node name in UUID generation (would require migration)
app.post('/api/admin/federation/identity', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
  if (!requireRole(user, ROLES.ADMIN, res)) return;

  const status = req.query.status ? sanitizeInput(req.query.status) : null;
  const nodes = db.getFederationNodes({ status });

  res.json({ nodes, count: nodes.length });
});

// Add a trusted federation node (admin only)
app.post('/api/admin/federation/nodes', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
  if (!requireRole(user, ROLES.ADMIN, res)) return;

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
        'User-Agent': `Farhold/${ourIdentity.nodeName}`
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

// ============ Federation Request System ============

// Rate limiter for federation request endpoint (stricter than general inbox)
const federationRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour per IP
  message: { error: 'Too many federation requests. Try again later.' }
});

// Send a federation request to another server (admin only)
app.post('/api/admin/federation/request', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled on this server' });
  }

  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    return res.status(400).json({ error: 'Server identity not configured. Set up federation identity first.' });
  }

  const { baseUrl, message } = req.body;
  if (!baseUrl) {
    return res.status(400).json({ error: 'baseUrl is required' });
  }

  // Normalize base URL (remove trailing slash)
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  try {
    // Step 1: Fetch the remote server's identity
    const identityUrl = `${normalizedBaseUrl}/api/federation/identity`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const identityResponse = await fetch(identityUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `Farhold/${ourIdentity.nodeName}`
      }
    });
    clearTimeout(timeout);

    if (!identityResponse.ok) {
      const errorText = await identityResponse.text();
      return res.status(502).json({
        error: 'Failed to reach remote server',
        details: `HTTP ${identityResponse.status}: ${errorText.substring(0, 100)}`
      });
    }

    const remoteIdentity = await identityResponse.json();
    if (!remoteIdentity.nodeName || !remoteIdentity.publicKey) {
      return res.status(502).json({ error: 'Invalid response from remote server - missing identity' });
    }

    // Check if we already have a relationship with this server
    const existingNode = db.getFederationNodeByName(remoteIdentity.nodeName);
    if (existingNode) {
      if (existingNode.status === 'active') {
        return res.status(400).json({ error: 'Already federated with this server' });
      }
      if (existingNode.status === 'outbound_pending') {
        return res.status(400).json({ error: 'Federation request already pending for this server' });
      }
    }

    // Check if they have a pending request to us (auto-accept scenario)
    const incomingRequest = db.getPendingRequestFromNode(remoteIdentity.nodeName);
    if (incomingRequest) {
      // They already requested us - auto-accept their request instead
      const accepted = db.acceptFederationRequest(incomingRequest.id);
      if (accepted) {
        // Send acceptance notification back to them
        try {
          const acceptBody = {
            type: 'federation_accepted',
            requestId: incomingRequest.id,
            acceptorNodeName: ourIdentity.nodeName,
            acceptorPublicKey: ourIdentity.publicKey
          };
          const targetNode = { baseUrl: incomingRequest.fromBaseUrl, nodeName: incomingRequest.fromNodeName };
          await sendSignedFederationRequest(targetNode, 'POST', '/api/federation/inbox/accept', acceptBody);
        } catch (notifyErr) {
          console.error('Failed to notify acceptance:', notifyErr.message);
        }
        return res.json({
          success: true,
          message: 'They had a pending request to us - auto-accepted and federation is now active',
          node: db.getFederationNodeByName(remoteIdentity.nodeName)
        });
      }
    }

    // Step 2: Send signed federation request to remote server
    const requestBody = {
      type: 'federation_request',
      fromNodeName: ourIdentity.nodeName,
      fromBaseUrl: `${req.protocol}://${req.get('host')}`, // Our server's URL
      fromPublicKey: ourIdentity.publicKey,
      message: message || null
    };

    // Build signature for the request using our private key
    const requestUrl = `${normalizedBaseUrl}/api/federation/inbox/request`;
    const bodyString = JSON.stringify(requestBody);
    const headers = createHttpSignatureFromString('POST', requestUrl, bodyString, ourIdentity.privateKey, ourIdentity.nodeName);

    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 15000);

    const requestResponse = await fetch(requestUrl, {
      method: 'POST',
      signal: controller2.signal,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: bodyString
    });
    clearTimeout(timeout2);

    if (!requestResponse.ok) {
      const errorText = await requestResponse.text();
      return res.status(502).json({
        error: 'Remote server rejected our request',
        details: `HTTP ${requestResponse.status}: ${errorText.substring(0, 200)}`
      });
    }

    // Step 3: Create local node entry with outbound_pending status
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    db.addFederationNode({
      nodeName: remoteIdentity.nodeName,
      baseUrl: normalizedBaseUrl,
      addedBy: user.id
    });
    // Update to outbound_pending and store their public key
    const node = db.getFederationNodeByName(remoteIdentity.nodeName);
    if (node) {
      db.updateFederationNode(node.id, {
        status: 'outbound_pending',
        publicKey: remoteIdentity.publicKey
      });
    }

    res.json({
      success: true,
      message: 'Federation request sent successfully',
      remoteNode: {
        nodeName: remoteIdentity.nodeName,
        status: 'outbound_pending'
      }
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Connection timed out' });
    }
    console.error('Federation request failed:', error.message);
    res.status(502).json({
      error: 'Failed to send federation request',
      details: error.message
    });
  }
});

// Receive a federation request from another server (public, but signed)
app.post('/api/federation/inbox/request', federationRequestLimiter, async (req, res) => {
  if (!FEDERATION_ENABLED) {
    return res.status(404).json({ error: 'Federation is not enabled on this server' });
  }

  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    return res.status(404).json({ error: 'Server identity not configured' });
  }

  const { type, fromNodeName, fromBaseUrl, fromPublicKey, message } = req.body;

  if (type !== 'federation_request') {
    return res.status(400).json({ error: 'Invalid request type' });
  }

  if (!fromNodeName || !fromBaseUrl || !fromPublicKey) {
    return res.status(400).json({ error: 'Missing required fields: fromNodeName, fromBaseUrl, fromPublicKey' });
  }

  // Verify the HTTP signature using the provided public key (bootstrap trust)
  const signatureHeader = req.headers['signature'];
  if (!signatureHeader) {
    return res.status(401).json({ error: 'Missing Signature header' });
  }

  // Parse and verify signature
  const parsed = parseHttpSignature(signatureHeader);
  if (!parsed || !parsed.signature) {
    return res.status(401).json({ error: 'Invalid Signature header format' });
  }

  // Verify keyId matches the claimed node name
  const keyIdMatch = parsed.keyId?.match(/https?:\/\/([^\/]+)\//);
  if (!keyIdMatch || keyIdMatch[1] !== fromNodeName) {
    return res.status(401).json({ error: 'Signature keyId does not match fromNodeName' });
  }

  // Verify the signature using the provided public key
  try {
    const isValid = verifyHttpSignature(req, fromPublicKey);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    console.error('Signature verification error:', err.message);
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // Check if we're already federated with this node
  const existingNode = db.getFederationNodeByName(fromNodeName);
  if (existingNode && existingNode.status === 'active') {
    return res.json({ success: true, message: 'Already federated', alreadyFederated: true });
  }

  // Check if we have an outbound_pending request to them (mutual request scenario)
  if (existingNode && existingNode.status === 'outbound_pending') {
    // They're requesting us while we're waiting for them - auto-accept!
    db.updateFederationNode(existingNode.id, {
      status: 'active',
      publicKey: fromPublicKey
    });

    // Send acceptance notification back
    try {
      const acceptBody = {
        type: 'federation_accepted',
        acceptorNodeName: ourIdentity.nodeName,
        acceptorPublicKey: ourIdentity.publicKey
      };
      const targetNode = { baseUrl: fromBaseUrl, nodeName: fromNodeName };
      await sendSignedFederationRequest(targetNode, 'POST', '/api/federation/inbox/accept', acceptBody);
    } catch (notifyErr) {
      console.error('Failed to send acceptance notification:', notifyErr.message);
    }

    return res.json({ success: true, message: 'Mutual request - auto-accepted', autoAccepted: true });
  }

  // Check for existing pending request from this node
  const existingRequest = db.getPendingRequestFromNode(fromNodeName);
  if (existingRequest) {
    return res.json({ success: true, message: 'Request already pending', duplicate: true });
  }

  // Create the federation request
  const request = db.createFederationRequest(
    fromNodeName,
    fromBaseUrl,
    fromPublicKey,
    ourIdentity.nodeName,
    message
  );

  console.log(`📨 Received federation request from ${fromNodeName}`);

  // Notify admin users
  broadcastToAdmins({
    type: 'federation_request_received',
    request: {
      id: request.id,
      fromNodeName,
      message,
      createdAt: request.createdAt
    }
  });

  res.json({ success: true, message: 'Federation request received', requestId: request.id });
});

// Get pending federation requests (admin only)
app.get('/api/admin/federation/requests', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled on this server' });
  }

  const requests = db.getPendingFederationRequests();
  res.json({ requests, count: requests.length });
});

// Accept a federation request (admin only)
app.post('/api/admin/federation/requests/:id/accept', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled on this server' });
  }

  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    return res.status(400).json({ error: 'Server identity not configured' });
  }

  const requestId = sanitizeInput(req.params.id);
  const request = db.getFederationRequest(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Federation request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request already ${request.status}` });
  }

  try {
    // Verify the requesting server's identity by fetching their current public key
    const identityUrl = `${request.fromBaseUrl}/api/federation/identity`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const identityResponse = await fetch(identityUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `Farhold/${ourIdentity.nodeName}`
      }
    });
    clearTimeout(timeout);

    if (!identityResponse.ok) {
      return res.status(502).json({ error: 'Could not verify remote server identity' });
    }

    const remoteIdentity = await identityResponse.json();

    // Verify public key matches what was in the request (prevent bait-and-switch)
    if (remoteIdentity.publicKey !== request.fromPublicKey) {
      return res.status(400).json({
        error: 'Public key mismatch',
        details: 'The remote server\'s public key has changed since the request was made. Please decline and have them re-request.'
      });
    }

    // Accept the request (creates federation_nodes entry)
    const accepted = db.acceptFederationRequest(requestId);
    if (!accepted) {
      return res.status(500).json({ error: 'Failed to accept request' });
    }

    // Send acceptance notification to the requesting server
    const acceptBody = {
      type: 'federation_accepted',
      requestId: requestId,
      acceptorNodeName: ourIdentity.nodeName,
      acceptorPublicKey: ourIdentity.publicKey
    };

    const targetNode = { baseUrl: request.fromBaseUrl, nodeName: request.fromNodeName };

    try {
      await sendSignedFederationRequest(targetNode, 'POST', '/api/federation/inbox/accept', acceptBody);
    } catch (notifyErr) {
      console.error('Failed to notify requesting server of acceptance:', notifyErr.message);
      // Continue anyway - they can retry their handshake
    }

    const node = db.getFederationNodeByName(request.fromNodeName);
    console.log(`✅ Accepted federation request from ${request.fromNodeName}`);

    res.json({
      success: true,
      message: 'Federation request accepted',
      node
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Connection timed out while verifying remote server' });
    }
    console.error('Accept federation request failed:', error.message);
    res.status(500).json({ error: 'Failed to accept federation request', details: error.message });
  }
});

// Decline a federation request (admin only)
app.post('/api/admin/federation/requests/:id/decline', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.userId);
  if (!requireRole(user, ROLES.ADMIN, res)) return;

  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled on this server' });
  }

  const ourIdentity = db.getServerIdentity();

  const requestId = sanitizeInput(req.params.id);
  const request = db.getFederationRequest(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Federation request not found' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request already ${request.status}` });
  }

  // Decline the request
  const declined = db.declineFederationRequest(requestId);
  if (!declined) {
    return res.status(500).json({ error: 'Failed to decline request' });
  }

  // Notify the requesting server (best effort)
  if (ourIdentity) {
    try {
      const declineBody = {
        type: 'federation_declined',
        fromNodeName: request.fromNodeName
      };
      const targetNode = { baseUrl: request.fromBaseUrl, nodeName: request.fromNodeName };
      await sendSignedFederationRequest(targetNode, 'POST', '/api/federation/inbox/decline', declineBody);
    } catch (notifyErr) {
      console.error('Failed to notify requesting server of decline:', notifyErr.message);
      // Continue anyway
    }
  }

  console.log(`❌ Declined federation request from ${request.fromNodeName}`);
  res.json({ success: true, message: 'Federation request declined' });
});

// Receive acceptance notification from a server we requested
app.post('/api/federation/inbox/accept', federationRequestLimiter, authenticateFederationResponse, (req, res) => {
  const { type, acceptorNodeName, acceptorPublicKey } = req.body;
  const sourceNode = req.federationNode;

  if (type !== 'federation_accepted') {
    return res.status(400).json({ error: 'Invalid message type' });
  }

  // Find our outbound pending node for this server
  const node = db.getFederationNodeByName(sourceNode.nodeName);
  if (!node) {
    return res.status(404).json({ error: 'No pending request found for this server' });
  }

  if (node.status !== 'outbound_pending') {
    return res.json({ success: true, message: 'Already processed' });
  }

  // Update to active status
  db.updateFederationNode(node.id, {
    status: 'active',
    publicKey: acceptorPublicKey || node.publicKey
  });
  db.recordFederationContact(node.id, true);

  // TODO: Federation catch-up/backfill mechanism
  // When federation is re-established after a disconnection, droplets created during
  // the downtime are not synced. For robustness (e.g., server failure recovery), consider:
  // 1. Sync on reconnection - request droplets newer than last sync point for shared waves
  // 2. Admin resync button - manual option to request full wave resync
  // 3. Version vectors - track last-seen droplet timestamps per wave per node
  // This would require a new endpoint like GET /api/federation/waves/:id/sync?since=timestamp

  console.log(`✅ Federation request to ${sourceNode.nodeName} was accepted`);
  res.json({ success: true, message: 'Acceptance acknowledged' });
});

// Receive decline notification from a server we requested
app.post('/api/federation/inbox/decline', federationRequestLimiter, authenticateFederationResponse, (req, res) => {
  const { type, fromNodeName } = req.body;
  const sourceNode = req.federationNode;

  if (type !== 'federation_declined') {
    return res.status(400).json({ error: 'Invalid message type' });
  }

  // Find our outbound pending node for this server
  const node = db.getFederationNodeByName(sourceNode.nodeName);
  if (!node) {
    return res.status(404).json({ error: 'No pending request found for this server' });
  }

  if (node.status !== 'outbound_pending') {
    return res.json({ success: true, message: 'Already processed' });
  }

  // Update to declined status or delete the node entry
  db.updateFederationNode(node.id, { status: 'declined' });

  console.log(`❌ Federation request to ${sourceNode.nodeName} was declined`);
  res.json({ success: true, message: 'Decline acknowledged' });
});

// ============ End Federation Request System ============

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
        const wsClients = clients.get(invitedUser.id);
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

      case 'wave_broadcast': {
        // Handle public/cross-server wave broadcast from origin server
        // This creates a participant wave visible to all users on this server
        // payload: { wave, participants, droplets }
        console.log(`📢 Received wave_broadcast from ${sourceNode.nodeName}`);

        const { wave, participants, droplets } = payload;
        if (!wave) {
          console.error('Invalid wave_broadcast payload');
          break;
        }

        // Check if we already have this wave as a participant
        let localWave = db.getWaveByOrigin(sourceNode.nodeName, wave.id);

        if (!localWave) {
          // Create participant wave with privacy set to crossServer
          // This allows any local user to see it
          const participantWaveId = `wave-${uuidv4()}`;

          // We need a local user to be the "reference" creator
          // Use the first admin or fall back to first active user
          const adminUser = db.getAllUsers().find(u => u.role === 'admin');
          const fallbackUser = db.getAllUsers()[0];
          const referenceUser = adminUser || fallbackUser;

          if (!referenceUser) {
            console.error('wave_broadcast: No local users to reference as participant wave owner');
            break;
          }

          localWave = db.createParticipantWave({
            id: participantWaveId,
            title: wave.title,
            privacy: 'crossServer',
            createdBy: referenceUser.id,
            originNode: sourceNode.nodeName,
            originWaveId: wave.id,
          });

          // Cache any remote participants
          if (participants) {
            for (const p of participants) {
              if (p.nodeName && p.nodeName !== db.getServerIdentity()?.nodeName) {
                db.cacheRemoteUser({
                  id: p.id,
                  nodeName: p.nodeName,
                  handle: p.handle,
                  displayName: p.displayName,
                  avatar: p.avatar,
                  avatarUrl: p.avatarUrl,
                });
              }
            }
          }

          // Cache existing droplets from the broadcast
          if (droplets && Array.isArray(droplets)) {
            console.log(`📥 Caching ${droplets.length} existing droplets from wave broadcast`);
            for (const d of droplets) {
              // Cache the droplet author if remote
              if (d.author && d.author.nodeName) {
                db.cacheRemoteUser({
                  id: d.author.id,
                  nodeName: d.author.nodeName,
                  handle: d.author.handle,
                  displayName: d.author.displayName,
                  avatar: d.author.avatar,
                  avatarUrl: d.author.avatarUrl,
                });
              }

              // Ensure reactions is an object (may be string if corrupted)
              let reactions = d.reactions || {};
              if (typeof reactions === 'string') {
                try { reactions = JSON.parse(reactions); } catch { reactions = {}; }
              }

              // Cache the droplet
              db.cacheRemoteDroplet({
                id: d.id,
                waveId: localWave.id,
                originWaveId: wave.id,
                originNode: d.author?.nodeName || sourceNode.nodeName,
                authorId: d.author?.id || d.authorId,
                authorNode: d.author?.nodeName || sourceNode.nodeName,
                parentId: d.parentId,
                content: d.content,
                createdAt: d.createdAt,
                editedAt: d.editedAt,
                reactions,
              });
            }
          }

          // Broadcast to all connected local users
          const allUsers = db.getAllUsers();
          for (const user of allUsers) {
            const wsClients = clients.get(user.id);
            if (wsClients) {
              const notification = {
                type: 'wave_broadcast_received',
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
          }

          console.log(`✅ Created public participant wave ${localWave.id} from broadcast`);
        } else {
          console.log(`ℹ️ Wave broadcast already exists as ${localWave.id}`);
        }
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

        // Find the local wave - could be participant wave OR origin wave
        // First try: this server is participant, sourceNode is origin
        let localWave = db.getWaveByOrigin(sourceNode.nodeName, originWaveId);
        let isOriginServer = false;

        // Second try: this server is origin, sourceNode is participant
        if (!localWave) {
          const maybeOriginWave = db.getWave(originWaveId);
          if (maybeOriginWave && maybeOriginWave.federationState === 'origin') {
            localWave = maybeOriginWave;
            isOriginServer = true;
          }
        }

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
          originNode: author?.nodeName || sourceNode.nodeName,
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

        console.log(`✅ Cached remote droplet ${droplet.id} in wave ${localWave.id} (origin=${isOriginServer})`);

        // If this is the origin server, relay the droplet to other participant nodes
        if (isOriginServer) {
          const federationNodes = db.getWaveFederationNodes(localWave.id);
          for (const fed of federationNodes) {
            // Don't send back to the node that sent it
            if (fed.nodeName === sourceNode.nodeName) continue;

            const node = db.getFederationNodeByName(fed.nodeName);
            if (!node || node.status !== 'active') continue;

            const relayPayload = {
              id: `relay-${droplet.id}-${Date.now()}`,
              type: 'new_droplet',
              payload: { droplet, originWaveId, author },
            };

            sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', relayPayload)
              .then(res => {
                if (res.ok) console.log(`✅ Relayed droplet to ${node.nodeName}`);
                else console.error(`❌ Relay to ${node.nodeName} failed: ${res.status}`);
              })
              .catch(err => console.error(`❌ Relay error to ${node.nodeName}:`, err.message));
          }
        }

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

      case 'alert_subscribe': {
        // Remote server wants to subscribe to our alerts
        // payload: { categories: ['system', 'emergency'] }
        console.log(`📨 Alert subscription request from ${sourceNode.nodeName}`);
        const { categories } = payload;
        if (!Array.isArray(categories) || categories.length === 0) {
          console.error('Invalid alert_subscribe payload: missing categories');
          break;
        }
        // Add or update subscriber
        db.addAlertSubscriber(sourceNode.nodeName, categories);
        console.log(`✅ ${sourceNode.nodeName} subscribed to alert categories: ${categories.join(', ')}`);
        break;
      }

      case 'alert_unsubscribe': {
        // Remote server wants to unsubscribe from our alerts
        console.log(`📨 Alert unsubscription from ${sourceNode.nodeName}`);
        db.removeAlertSubscriber(sourceNode.nodeName);
        console.log(`✅ ${sourceNode.nodeName} unsubscribed from alerts`);
        break;
      }

      case 'alert_broadcast': {
        // Receiving an alert from a server we're subscribed to
        // payload: { alertId, title, content, priority, category, startTime, endTime, originNode }
        console.log(`📨 Alert broadcast from ${sourceNode.nodeName}`);
        const { alertId, title, content, priority, category, startTime, endTime, originNode } = payload;

        // Verify we're subscribed to this category from this node
        const subscription = db.getAlertSubscriptionByNode(sourceNode.nodeName);
        if (!subscription || subscription.status !== 'active') {
          console.error(`Received alert from ${sourceNode.nodeName} but not subscribed`);
          break;
        }
        const subscribedCategories = JSON.parse(subscription.categories || '[]');
        if (!subscribedCategories.includes(category)) {
          console.error(`Received alert category '${category}' but not subscribed to it`);
          break;
        }

        // Check if we already have this alert
        const existing = db.getAlertByOrigin(originNode || sourceNode.nodeName, alertId);
        if (existing) {
          console.log(`Alert ${alertId} from ${originNode || sourceNode.nodeName} already exists`);
          break;
        }

        // Create the federated alert locally
        const sanitizedContent = sanitizeHtml(content || '', sanitizeOptions);
        db.createAlert({
          title: sanitizeHtml(title || '', { allowedTags: [], allowedAttributes: {} }),
          content: sanitizedContent,
          priority: ['info', 'warning', 'critical'].includes(priority) ? priority : 'info',
          category: ['system', 'announcement', 'emergency'].includes(category) ? category : 'system',
          scope: 'local', // Don't re-federate
          startTime: startTime || new Date().toISOString(),
          endTime: endTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdBy: null, // No local creator for federated alerts
          originNode: originNode || sourceNode.nodeName,
          originAlertId: alertId,
        });
        console.log(`✅ Created federated alert '${title}' from ${originNode || sourceNode.nodeName}`);
        break;
      }

      case 'alert_update': {
        // Receiving an alert update from a server we're subscribed to
        console.log(`📨 Alert update from ${sourceNode.nodeName}`);
        const { alertId, title, content, priority, startTime, endTime, originNode } = payload;

        // Find the local copy of this alert
        const existing = db.getAlertByOrigin(originNode || sourceNode.nodeName, alertId);
        if (!existing) {
          console.error(`Alert update for unknown alert ${alertId} from ${originNode || sourceNode.nodeName}`);
          break;
        }

        // Update it
        const updates = {};
        if (title) updates.title = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
        if (content) updates.content = sanitizeHtml(content, sanitizeOptions);
        if (priority && ['info', 'warning', 'critical'].includes(priority)) updates.priority = priority;
        if (startTime) updates.startTime = startTime;
        if (endTime) updates.endTime = endTime;

        if (Object.keys(updates).length > 0) {
          db.updateAlert(existing.id, updates);
          console.log(`✅ Updated federated alert '${existing.title}'`);
        }
        break;
      }

      case 'alert_delete': {
        // Receiving an alert deletion from a server we're subscribed to
        console.log(`📨 Alert deletion from ${sourceNode.nodeName}`);
        const { alertId, originNode } = payload;

        // Find and delete the local copy
        const existing = db.getAlertByOrigin(originNode || sourceNode.nodeName, alertId);
        if (existing) {
          db.deleteAlert(existing.id);
          console.log(`✅ Deleted federated alert '${existing.title}'`);
        } else {
          console.log(`Alert ${alertId} from ${originNode || sourceNode.nodeName} not found locally`);
        }
        break;
      }

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

// ============ Crew Routes (v2.0.0 aliases) ============
// These are the preferred v2.0.0 endpoints (crews = groups)
// Rewrites /api/crews/* to /api/groups/* and re-invokes routing

app.all('/api/crews', (req, res, next) => {
  req.url = '/api/groups';
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/invitations', (req, res, next) => {
  req.url = '/api/groups/invitations';
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/invitations/:id', (req, res, next) => {
  req.url = `/api/groups/invitations/${req.params.id}`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/invitations/:id/accept', (req, res, next) => {
  req.url = `/api/groups/invitations/${req.params.id}/accept`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/invitations/:id/decline', (req, res, next) => {
  req.url = `/api/groups/invitations/${req.params.id}/decline`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/:id', (req, res, next) => {
  req.url = `/api/groups/${req.params.id}`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/:id/members', (req, res, next) => {
  req.url = `/api/groups/${req.params.id}/members`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/:id/members/:userId', (req, res, next) => {
  req.url = `/api/groups/${req.params.id}/members/${req.params.userId}`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/:id/invite', (req, res, next) => {
  req.url = `/api/groups/${req.params.id}/invite`;
  req.app._router.handle(req, res, next);
});

app.all('/api/crews/:id/invitations/sent', (req, res, next) => {
  req.url = `/api/groups/${req.params.id}/invitations/sent`;
  req.app._router.handle(req, res, next);
});

// ============ Group Routes ============
// Note: /api/crews/* aliases above rewrite to these routes

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
  const waves = db.getWavesForUser(req.user.userId, includeArchived);
  // Log unread counts for debugging
  const wavesWithUnread = waves.filter(w => w.unread_count > 0);
  if (wavesWithUnread.length > 0) {
    console.log(`📬 GET /api/waves - Waves with unread for user ${req.user.userId}:`, wavesWithUnread.map(w => `"${w.title}": ${w.unread_count}`).join(', '));
  }
  res.json(waves);
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

  // Get user's archive status for this wave (uses method that works for both JSON and SQLite)
  const isArchived = db.isWaveArchivedForUser(waveId, req.user.userId);

  // For breakout waves, use special method that fetches from original wave's droplet tree
  const allMessages = (wave.rootPingId || wave.rootDropletId) && db.getDropletsForBreakoutWave
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
    is_archived: isArchived,
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
  let allDroplets = (wave.rootPingId || wave.rootDropletId) && db.getDropletsForBreakoutWave
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
  const totalDroplets = (wave.rootPingId || wave.rootDropletId) && db.getDropletsForBreakoutWave
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
  let allMessages = (wave.rootPingId || wave.rootDropletId) && db.getDropletsForBreakoutWave
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
  const totalMessages = (wave.rootPingId || wave.rootDropletId) && db.getDropletsForBreakoutWave
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

  // E2EE: Check if wave should be encrypted
  const encrypted = !!req.body.encrypted;
  const keyDistribution = req.body.keyDistribution;

  const wave = db.createWave({
    title,
    privacy: hasFederatedParticipants ? 'crossServer' : privacy, // Force cross-server if federated
    groupId: privacy === 'group' ? sanitizeInput(req.body.groupId) : null,
    createdBy: req.user.userId,
    participants: localParticipantIds,
    encrypted,
  });

  // E2EE: Store wave keys if encrypted
  if (encrypted && keyDistribution && Array.isArray(keyDistribution)) {
    // Create key metadata
    db.createWaveKeyMetadata(wave.id);

    // Store encrypted keys for each participant
    for (const { userId, encryptedWaveKey, senderPublicKey } of keyDistribution) {
      if (encryptedWaveKey && senderPublicKey) {
        // If userId is null, it's the creator's own key
        const targetUserId = userId || req.user.userId;
        db.createWaveEncryptionKey(wave.id, targetUserId, encryptedWaveKey, senderPublicKey, 1);
      }
    }
  }

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

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'create_wave', 'wave', wave.id, { ...getRequestMeta(req), privacy, title });

  res.status(201).json(result);
});

app.put('/api/waves/:id', authenticateToken, async (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  let wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (wave.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Only wave creator can modify' });
  }

  const privacy = req.body.privacy;
  const wasLocal = wave.federationState === 'local' || !wave.federationState;
  const changingToCrossServer = privacy === 'crossServer' && wave.privacy !== 'crossServer';

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
    const sanitizedTitle = sanitizeInput(req.body.title).slice(0, 200);
    db.updateWaveTitle(waveId, sanitizedTitle);
    wave.title = sanitizedTitle;
  }

  // If wave is being promoted to crossServer and federation is enabled, broadcast to all trusted nodes
  if (FEDERATION_ENABLED && changingToCrossServer && wasLocal) {
    // Mark wave as origin
    db.setWaveAsOrigin(waveId);

    // Get all active trusted nodes
    const trustedNodes = db.getFederationNodes().filter(n => n.status === 'active');

    if (trustedNodes.length > 0) {
      // Get current participants for the wave invite
      const localParticipants = db.getWaveParticipants(waveId);

      // Get existing droplets to include in broadcast
      const existingDroplets = db.getDropletsForWave(waveId);
      const ourNodeName = db.getServerIdentity()?.nodeName;

      // Broadcast wave to all trusted nodes
      // We use a special "broadcast" flag indicating this is a public wave broadcast
      for (const node of trustedNodes) {
        // Track federation relationship
        db.addWaveFederationNode(waveId, node.nodeName);

        // Send wave broadcast (invites all users on the remote node)
        const broadcastPayload = {
          id: `wave-broadcast-${uuidv4()}`,
          type: 'wave_broadcast',
          payload: {
            wave: {
              id: wave.id,
              title: wave.title,
              privacy: 'crossServer',
              createdBy: wave.createdBy,
              createdAt: wave.createdAt,
            },
            participants: localParticipants.map(p => ({
              id: p.id,
              handle: p.handle,
              displayName: p.name,
              avatar: p.avatar,
              nodeName: ourNodeName,
            })),
            // Include existing droplets so federated servers have history
            droplets: existingDroplets.map(d => {
              // Ensure reactions is an object (may be string from DB)
              let reactions = d.reactions || {};
              if (typeof reactions === 'string') {
                try { reactions = JSON.parse(reactions); } catch { reactions = {}; }
              }
              return {
                id: d.id,
                parentId: d.parentId || d.parent_id,
                content: d.content,
                createdAt: d.createdAt || d.created_at,
                editedAt: d.editedAt || d.edited_at,
                reactions,
                author: {
                  id: d.authorId || d.author_id,
                  handle: d.sender_handle,
                  displayName: d.sender_name,
                  avatar: d.sender_avatar,
                  avatarUrl: d.sender_avatar_url,
                  nodeName: ourNodeName,
                },
              };
            }),
          },
        };

        sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', broadcastPayload)
          .then(response => {
            if (response.ok) {
              console.log(`✅ Wave broadcast sent to ${node.nodeName}`);
            } else {
              console.error(`❌ Wave broadcast to ${node.nodeName} failed: ${response.status}`);
            }
          })
          .catch(err => {
            console.error(`❌ Wave broadcast to ${node.nodeName} error:`, err.message);
          });
      }

      console.log(`📢 Broadcasting wave ${waveId} to ${trustedNodes.length} federated nodes`);
    }
  }

  // Re-fetch wave to get updated state
  wave = db.getWave(waveId);

  broadcastToWave(waveId, { type: 'wave_updated', wave });
  res.json(wave);
});

// Invite federated participants to an existing wave
app.post('/api/waves/:id/invite-federated', authenticateToken, async (req, res) => {
  if (!FEDERATION_ENABLED) {
    return res.status(501).json({ error: 'Federation not enabled' });
  }

  const waveId = sanitizeInput(req.params.id);
  const wave = db.getWave(waveId);
  if (!wave) return res.status(404).json({ error: 'Wave not found' });
  if (wave.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Only wave creator can invite federated participants' });
  }

  const { participants } = req.body;
  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ error: 'participants array required' });
  }

  // Parse federated identifiers
  const federatedParticipants = [];
  for (const participant of participants) {
    const federated = parseFederatedIdentifier(participant);
    if (federated) {
      const node = db.getFederationNodeByName(federated.nodeName);
      if (node && node.status === 'active') {
        federatedParticipants.push({ ...federated, node });
      } else {
        console.warn(`Skipping federated participant @${federated.handle}@${federated.nodeName}: node not found or not active`);
      }
    }
  }

  if (federatedParticipants.length === 0) {
    return res.status(400).json({ error: 'No valid federated participants found' });
  }

  // Update wave to crossServer if not already federated
  if (wave.privacy !== 'crossServer' && wave.privacy !== 'cross-server') {
    db.updateWavePrivacy(waveId, 'crossServer', null);
    wave.privacy = 'crossServer';
  }

  // Mark wave as origin if not already
  if (wave.federationState !== 'origin') {
    db.setWaveAsOrigin(waveId);
    wave.federationState = 'origin';
  }

  // Get current local participants for the invite
  const localParticipants = db.getWaveParticipants(waveId);

  // Group invites by node
  const nodeInvites = new Map();
  for (const fp of federatedParticipants) {
    const nodeKey = fp.nodeName;
    if (!nodeInvites.has(nodeKey)) {
      nodeInvites.set(nodeKey, { node: fp.node, handles: [] });
    }
    nodeInvites.get(nodeKey).handles.push(fp.handle);
  }

  // Send invites and track federation relationships
  const results = { invited: [], failed: [] };
  for (const [nodeName, { node, handles }] of nodeInvites) {
    // Track federation relationship if not already
    db.addWaveFederationNode(waveId, nodeName);

    for (const handle of handles) {
      try {
        const success = await sendWaveInvite(node, wave, localParticipants, handle);
        if (success) {
          results.invited.push(`@${handle}@${nodeName}`);
        } else {
          results.failed.push(`@${handle}@${nodeName}`);
        }
      } catch (err) {
        console.error(`Failed to send wave invite to ${nodeName}:`, err.message);
        results.failed.push(`@${handle}@${nodeName}`);
      }
    }
  }

  // Broadcast update to local users
  broadcastToWave(waveId, { type: 'wave_updated', wave });

  res.json({
    success: true,
    wave: {
      id: wave.id,
      title: wave.title,
      privacy: wave.privacy,
      federationState: wave.federationState,
    },
    results,
  });
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

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'delete_wave', 'wave', waveId, getRequestMeta(req));

  res.json({ success: true });
});

// ============ Wave Participant Management ============

// Add participant to wave
app.post('/api/waves/:id/participants', authenticateToken, async (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  const wave = db.getWave(waveId);
  if (!wave) {
    return res.status(404).json({ error: 'Wave not found' });
  }

  // Only wave creator can add participants to private waves
  if (wave.privacy === 'private' && wave.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'Only wave creator can add participants to private waves' });
  }

  // Check if requester is a participant
  if (!db.isWaveParticipant(waveId, req.user.userId)) {
    return res.status(403).json({ error: 'You must be a participant to add others' });
  }

  // Check if user exists
  const userToAdd = db.findUserById(userId);
  if (!userToAdd) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if already a participant
  if (db.isWaveParticipant(waveId, userId)) {
    return res.status(400).json({ error: 'User is already a participant' });
  }

  // Add participant
  const added = db.addWaveParticipant(waveId, userId);
  if (!added) {
    return res.status(500).json({ error: 'Failed to add participant' });
  }

  // Get updated participant list
  const participants = db.getWaveParticipants(waveId);

  // Broadcast to wave
  broadcastToWave(waveId, {
    type: 'participant_added',
    waveId,
    participant: {
      id: userToAdd.id,
      handle: userToAdd.handle,
      name: userToAdd.displayName || userToAdd.handle,
      avatar: userToAdd.avatar,
      avatarUrl: userToAdd.avatarUrl
    },
    addedBy: req.user.userId
  });

  // Notify the added user
  broadcastToUser(userId, {
    type: 'added_to_wave',
    wave: {
      id: wave.id,
      title: wave.title,
      privacy: wave.privacy
    },
    addedBy: req.user.userId
  });

  if (db.logActivity) db.logActivity(req.user.userId, 'add_participant', 'wave', waveId, getRequestMeta(req), { addedUserId: userId });

  res.json({ success: true, participants });
});

// Remove participant from wave
app.delete('/api/waves/:id/participants/:userId', authenticateToken, async (req, res) => {
  const waveId = sanitizeInput(req.params.id);
  const userId = sanitizeInput(req.params.userId);

  const wave = db.getWave(waveId);
  if (!wave) {
    return res.status(404).json({ error: 'Wave not found' });
  }

  // Check permissions:
  // - Wave creator can remove anyone (except themselves)
  // - Users can remove themselves (leave wave)
  const isCreator = wave.createdBy === req.user.userId;
  const isSelf = userId === req.user.userId;

  if (!isCreator && !isSelf) {
    return res.status(403).json({ error: 'Only wave creator can remove other participants' });
  }

  // Creator cannot remove themselves
  if (isCreator && isSelf) {
    return res.status(400).json({ error: 'Wave creator cannot leave. Delete the wave instead.' });
  }

  // Check if target is a participant
  if (!db.isWaveParticipant(waveId, userId)) {
    return res.status(400).json({ error: 'User is not a participant' });
  }

  // Remove participant
  const removed = db.removeWaveParticipant(waveId, userId);
  if (!removed) {
    return res.status(500).json({ error: 'Failed to remove participant' });
  }

  // Get user info for broadcast
  const removedUser = db.findUserById(userId);

  // Get updated participant list
  const participants = db.getWaveParticipants(waveId);

  // Broadcast to wave
  broadcastToWave(waveId, {
    type: 'participant_removed',
    waveId,
    userId,
    removedBy: req.user.userId,
    wasSelf: isSelf
  });

  // Notify the removed user if they were removed by someone else
  if (!isSelf) {
    broadcastToUser(userId, {
      type: 'removed_from_wave',
      wave: {
        id: wave.id,
        title: wave.title
      },
      removedBy: req.user.userId
    });
  }

  if (db.logActivity) db.logActivity(req.user.userId, isSelf ? 'leave_wave' : 'remove_participant', 'wave', waveId, getRequestMeta(req), { removedUserId: userId });

  res.json({ success: true, participants });
});

// ============ Wave E2EE Key Routes (v1.19.0) ============

// Get wave key for current user
app.get('/api/waves/:id/key', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;
    const wave = db.getWave(waveId);

    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Check wave access
    const canAccess = db.canAccessWave(waveId, req.user.userId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if wave is encrypted
    if (!db.isWaveEncrypted(waveId)) {
      return res.json({ encrypted: false, message: 'Wave is not encrypted' });
    }

    // Get encrypted wave key for this user
    const keyData = db.getWaveKeyForUser(waveId, req.user.userId);

    if (!keyData) {
      return res.status(404).json({ error: 'No encryption key found for this user' });
    }

    res.json({
      encrypted: true,
      encryptedWaveKey: keyData.encryptedWaveKey,
      senderPublicKey: keyData.senderPublicKey,
      keyVersion: keyData.keyVersion,
      currentKeyVersion: keyData.currentKeyVersion
    });
  } catch (err) {
    console.error('Wave key fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch wave key' });
  }
});

// Get all wave keys for a user (for decrypting old messages after key rotation)
app.get('/api/waves/:id/keys/all', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;

    // Check wave access
    const canAccess = db.canAccessWave(waveId, req.user.userId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const keys = db.getAllWaveKeysForUser(waveId, req.user.userId);
    const currentVersion = db.getWaveKeyVersion(waveId);

    res.json({
      keys,
      currentKeyVersion: currentVersion
    });
  } catch (err) {
    console.error('Wave keys fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch wave keys' });
  }
});

// Distribute wave key to a new participant
app.post('/api/waves/:id/key/distribute', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;
    const { userId, encryptedWaveKey, senderPublicKey } = req.body;

    if (!userId || !encryptedWaveKey || !senderPublicKey) {
      return res.status(400).json({ error: 'Missing required fields: userId, encryptedWaveKey, senderPublicKey' });
    }

    const wave = db.getWave(waveId);
    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Only existing participants can distribute keys
    const canAccess = db.canAccessWave(waveId, req.user.userId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Only wave participants can distribute keys' });
    }

    // Check if the new participant exists
    const newParticipant = db.findUserById(userId);
    if (!newParticipant) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get current key version
    const currentVersion = db.getWaveKeyVersion(waveId);

    // Store the encrypted key for the new participant
    db.createWaveEncryptionKey(waveId, userId, encryptedWaveKey, senderPublicKey, currentVersion);

    res.json({
      success: true,
      message: 'Wave key distributed to participant',
      keyVersion: currentVersion
    });
  } catch (err) {
    console.error('Wave key distribution error:', err);
    res.status(500).json({ error: 'Failed to distribute wave key' });
  }
});

// Rotate wave key (when participant is removed)
app.post('/api/waves/:id/key/rotate', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;
    const { keyDistribution } = req.body;

    if (!keyDistribution || !Array.isArray(keyDistribution)) {
      return res.status(400).json({ error: 'Missing keyDistribution array' });
    }

    const wave = db.getWave(waveId);
    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Only wave creator or admin can rotate keys
    if (wave.createdBy !== req.user.userId) {
      const user = db.findUserById(req.user.userId);
      if (!hasRole(user, ROLES.ADMIN)) {
        return res.status(403).json({ error: 'Only wave creator can rotate keys' });
      }
    }

    // Validate distribution data
    for (const { userId, encryptedWaveKey, senderPublicKey } of keyDistribution) {
      if (!userId || !encryptedWaveKey || !senderPublicKey) {
        return res.status(400).json({ error: 'Invalid key distribution data' });
      }
    }

    // Rotate the wave key
    const result = db.rotateWaveKey(waveId, keyDistribution);

    // Broadcast key rotation to all participants
    broadcastToWave(waveId, {
      type: 'wave_key_rotated',
      waveId,
      newKeyVersion: result.newKeyVersion
    });

    // Log activity
    if (db.logActivity) {
      db.logActivity(req.user.userId, 'wave_key_rotation', 'wave', waveId, {
        ...getRequestMeta(req),
        newKeyVersion: result.newKeyVersion
      });
    }

    res.json({
      success: true,
      newKeyVersion: result.newKeyVersion
    });
  } catch (err) {
    console.error('Wave key rotation error:', err);
    res.status(500).json({ error: 'Failed to rotate wave key' });
  }
});

// Get participant public keys for a wave (for key distribution)
app.get('/api/waves/:id/participants/keys', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;

    // Check wave access
    const canAccess = db.canAccessWave(waveId, req.user.userId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const participantKeys = db.getWaveParticipantPublicKeys(waveId);

    res.json({
      participants: participantKeys
    });
  } catch (err) {
    console.error('Participant keys fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch participant keys' });
  }
});

// Initialize wave encryption (set wave as encrypted and create metadata)
app.post('/api/waves/:id/encrypt', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;
    const { keyDistribution } = req.body;

    if (!keyDistribution || !Array.isArray(keyDistribution)) {
      return res.status(400).json({ error: 'Missing keyDistribution array' });
    }

    const wave = db.getWave(waveId);
    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Only wave creator can enable encryption
    if (wave.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only wave creator can enable encryption' });
    }

    // Check if already encrypted
    if (db.isWaveEncrypted(waveId)) {
      return res.status(400).json({ error: 'Wave is already encrypted' });
    }

    // Create wave key metadata
    db.createWaveKeyMetadata(waveId);

    // Store encrypted keys for each participant
    for (const { userId, encryptedWaveKey, senderPublicKey } of keyDistribution) {
      db.createWaveEncryptionKey(waveId, userId, encryptedWaveKey, senderPublicKey, 1);
    }

    // Check if there are existing droplets that need encryption
    const encryptionStatus = db.getWaveEncryptionStatus(waveId);
    if (encryptionStatus.totalDroplets > 0) {
      // Has existing droplets - set to partial (2) until they're encrypted
      db.setWaveEncryptionState(waveId, 2);
    } else {
      // No droplets - fully encrypted (1)
      db.setWaveEncryptionState(waveId, 1);
    }

    // Broadcast encryption enabled
    broadcastToWave(waveId, {
      type: 'wave_encrypted',
      waveId,
      encryptionState: encryptionStatus.totalDroplets > 0 ? 2 : 1
    });

    res.json({
      success: true,
      message: 'Wave encryption enabled',
      keyVersion: 1,
      encryptionState: encryptionStatus.totalDroplets > 0 ? 2 : 1,
      dropletsToEncrypt: encryptionStatus.totalDroplets
    });
  } catch (err) {
    console.error('Wave encryption error:', err);
    res.status(500).json({ error: 'Failed to enable wave encryption' });
  }
});

// Get wave encryption status (for legacy wave migration)
app.get('/api/waves/:id/encryption-status', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;

    const wave = db.getWave(waveId);
    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Check access
    const canAccess = db.canAccessWave(waveId, req.user.userId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get encryption status
    const status = db.getWaveEncryptionStatus(waveId);

    // Get participant E2EE status
    const participants = db.getParticipantsE2EEStatus(waveId);
    const allHaveE2EE = participants.every(p => p.hasE2EE);
    const readyCount = participants.filter(p => p.hasE2EE).length;

    res.json({
      waveId,
      encryptionState: status.state, // 0=legacy, 1=encrypted, 2=partial
      totalDroplets: status.totalDroplets,
      encryptedDroplets: status.encryptedDroplets,
      progress: status.progress,
      participants: participants,
      allParticipantsReady: allHaveE2EE,
      readyCount,
      totalParticipants: participants.length,
      canEnableEncryption: wave.created_by === req.user.userId && allHaveE2EE
    });
  } catch (err) {
    console.error('Wave encryption status error:', err);
    res.status(500).json({ error: 'Failed to get encryption status' });
  }
});

// Get unencrypted droplets for batch encryption (legacy wave migration)
app.get('/api/waves/:id/unencrypted-droplets', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const wave = db.getWave(waveId);
    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Only wave creator can migrate encryption
    if (wave.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only wave creator can migrate encryption' });
    }

    const droplets = db.getUnencryptedDroplets(waveId, limit);
    const status = db.getWaveEncryptionStatus(waveId);

    res.json({
      droplets,
      remaining: status.totalDroplets - status.encryptedDroplets,
      progress: status.progress
    });
  } catch (err) {
    console.error('Get unencrypted droplets error:', err);
    res.status(500).json({ error: 'Failed to get unencrypted droplets' });
  }
});

// Batch encrypt droplets (legacy wave migration)
app.post('/api/waves/:id/encrypt-droplets', authenticateToken, (req, res) => {
  try {
    const waveId = req.params.id;
    const { droplets } = req.body;

    if (!droplets || !Array.isArray(droplets)) {
      return res.status(400).json({ error: 'Missing droplets array' });
    }

    const wave = db.getWave(waveId);
    if (!wave) {
      return res.status(404).json({ error: 'Wave not found' });
    }

    // Only wave creator can migrate encryption
    if (wave.created_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only wave creator can migrate encryption' });
    }

    // Check wave is in encryption state (1 or 2)
    const status = db.getWaveEncryptionStatus(waveId);
    if (status.state === 0) {
      return res.status(400).json({ error: 'Wave encryption not enabled. Call /api/waves/:id/encrypt first.' });
    }

    // Get current key version
    const keyVersion = db.getWaveKeyVersion(waveId);

    // Update each droplet with encrypted content
    let encryptedCount = 0;
    for (const { id, content, nonce } of droplets) {
      try {
        db.encryptDropletContent(id, content, nonce, keyVersion);
        encryptedCount++;
      } catch (err) {
        console.error(`Failed to encrypt droplet ${id}:`, err);
      }
    }

    // Check if all droplets are now encrypted
    const updatedStatus = db.getWaveEncryptionStatus(waveId);
    let newState = status.state;
    if (updatedStatus.encryptedDroplets === updatedStatus.totalDroplets) {
      // All done - mark as fully encrypted
      db.setWaveEncryptionState(waveId, 1);
      newState = 1;
    } else if (status.state !== 2) {
      // Still have unencrypted droplets - mark as partial
      db.setWaveEncryptionState(waveId, 2);
      newState = 2;
    }

    const remaining = updatedStatus.totalDroplets - updatedStatus.encryptedDroplets;
    res.json({
      success: true,
      encryptedCount,
      totalDroplets: updatedStatus.totalDroplets,
      encryptedDroplets: updatedStatus.encryptedDroplets,
      progress: updatedStatus.progress,
      hasMore: remaining > 0,
      remaining,
      encryptionState: newState,
      complete: remaining === 0
    });
  } catch (err) {
    console.error('Encrypt droplets error:', err);
    res.status(500).json({ error: 'Failed to encrypt droplets' });
  }
});

// ============ Ping Routes (v2.0.0 aliases) ============
// These are the preferred v2.0.0 endpoints (pings = droplets)
// Rewrites /api/pings/* to /api/droplets/* and re-invokes routing

app.all('/api/pings', (req, res, next) => {
  req.url = '/api/droplets';
  req.app._router.handle(req, res, next);
});

app.all('/api/pings/:id', (req, res, next) => {
  req.url = `/api/droplets/${req.params.id}`;
  req.app._router.handle(req, res, next);
});

app.all('/api/pings/:id/react', (req, res, next) => {
  req.url = `/api/droplets/${req.params.id}/react`;
  req.app._router.handle(req, res, next);
});

app.all('/api/pings/:id/read', (req, res, next) => {
  req.url = `/api/droplets/${req.params.id}/read`;
  req.app._router.handle(req, res, next);
});

// /api/pings/:id/burst -> /api/droplets/:id/ripple
app.all('/api/pings/:id/burst', (req, res, next) => {
  req.url = `/api/droplets/${req.params.id}/ripple`;
  req.app._router.handle(req, res, next);
});

// ============ Droplet Routes (v1.10.0) ============
// Note: /api/messages endpoints below are backward-compatible aliases
// Note: /api/pings/* aliases above rewrite to these routes

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

  // E2EE: encrypted content is base64 and may be longer than plaintext
  const maxLength = req.body.encrypted ? 20000 : 10000;
  if (content.length > maxLength) return res.status(400).json({ error: 'Droplet too long' });

  // For burst waves, default parent to root ping if no parent specified
  let parentId = req.body.parent_id ? sanitizeInput(req.body.parent_id) : null;
  const rootId = wave.rootPingId || wave.rootDropletId;
  if (!parentId && rootId) {
    parentId = rootId;
  }

  const droplet = db.createMessage({
    waveId,
    parentId,
    authorId: req.user.userId,
    content,
    privacy: wave.privacy,
    encrypted: !!req.body.encrypted,
    nonce: req.body.nonce || null,
    keyVersion: req.body.keyVersion || null,
  });

  // Create in-app notifications for mentions, replies, and wave activity
  const author = db.findUserById(req.user.userId);
  if (author) {
    createDropletNotifications(droplet, wave, author);
  }

  // Create push notification payload
  const senderName = droplet.sender_name || db.findUserById(req.user.userId)?.displayName || 'Someone';
  // For encrypted droplets, don't reveal content in push notification
  const contentPreview = req.body.encrypted
    ? 'Encrypted message'
    : content.replace(/<[^>]*>/g, '').substring(0, 100);
  const pushPayload = {
    title: `New droplet in ${wave.title}`,
    body: `${senderName}: ${contentPreview}${!req.body.encrypted && content.length > 100 ? '...' : ''}`,
    url: `/?wave=${waveId}`,
    waveId,
    dropletId: droplet.id,
    encrypted: !!req.body.encrypted
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

  // Federation: Send droplet to federated nodes
  if (FEDERATION_ENABLED && (wave.federationState === 'origin' || wave.federationState === 'participant')) {
    const ourIdentity = db.getServerIdentity();
    const dropletPayload = {
      droplet: {
        id: droplet.id,
        parentId: droplet.parentId,
        content: droplet.content,
        createdAt: droplet.createdAt,
        editedAt: droplet.editedAt,
        reactions: droplet.reactions,
      },
      originWaveId: wave.federationState === 'origin' ? waveId : wave.originWaveId,
      author: author ? {
        id: author.id,
        handle: author.handle,
        displayName: author.displayName,
        avatar: author.avatar,
        avatarUrl: author.avatarUrl,
        bio: author.bio,
        nodeName: ourIdentity?.nodeName,
      } : null,
    };

    if (wave.federationState === 'origin') {
      // Origin server: send to all participant nodes
      sendDropletToFederatedNodes(waveId, 'new_droplet', dropletPayload).catch(err => {
        console.error('Federation droplet delivery error:', err.message);
      });
    } else if (wave.federationState === 'participant' && wave.originNode) {
      // Participant server: send back to origin node
      const originNode = db.getFederationNodeByName(wave.originNode);
      if (originNode && originNode.status === 'active') {
        const messageId = `new_droplet-${droplet.id}-${Date.now()}`;
        const fullPayload = { id: messageId, type: 'new_droplet', payload: dropletPayload };
        sendSignedFederationRequest(originNode, 'POST', '/api/federation/inbox', fullPayload)
          .then(response => {
            if (response.ok) {
              console.log(`✅ new_droplet sent to origin ${originNode.nodeName}`);
            } else {
              console.error(`❌ new_droplet to origin failed: ${response.status}`);
              db.queueFederationMessage({ targetNode: originNode.nodeName, messageType: 'new_droplet', payload: fullPayload });
            }
          })
          .catch(err => {
            console.error(`❌ new_droplet to origin error:`, err.message);
            db.queueFederationMessage({ targetNode: originNode.nodeName, messageType: 'new_droplet', payload: fullPayload });
          });
      }
    }
  }

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'create_droplet', 'droplet', droplet.id, { ...getRequestMeta(req), waveId });

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

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'edit_droplet', 'droplet', dropletId, { ...getRequestMeta(req), waveId: droplet.waveId });

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

  // Log activity
  if (db.logActivity) db.logActivity(req.user.userId, 'delete_droplet', 'droplet', dropletId, { ...getRequestMeta(req), waveId });

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

  // Get the droplet first to find the waveId
  const droplet = db.getDroplet ? db.getDroplet(dropletId) : db.getMessage?.(dropletId);
  const waveId = droplet?.wave_id || droplet?.waveId;

  if (!db.markMessageAsRead(dropletId, userId)) {
    console.log(`❌ Failed to mark droplet ${dropletId} as read`);
    return res.status(404).json({ error: 'Droplet not found' });
  }

  // Also mark any notifications for this droplet as read
  const notificationsMarked = db.markNotificationsReadByDroplet(dropletId, userId);
  if (notificationsMarked > 0) {
    console.log(`🔔 Marked ${notificationsMarked} notification(s) as read for droplet ${dropletId}`);
    // Broadcast notification count update to user
    broadcast({ type: 'unread_count_update', userId }, [userId]);
  }

  // Broadcast droplet read event so all clients (including this user) can update wave list
  broadcast({ type: 'droplet_read', dropletId, waveId, userId }, [userId]);

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

// ============ Message Routes (deprecated) ============

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

  // For burst waves, default parent to root ping if no parent specified
  let parentId = req.body.parent_id ? sanitizeInput(req.body.parent_id) : null;
  const rootId = wave.rootPingId || wave.rootDropletId;
  if (!parentId && rootId) {
    parentId = rootId;
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

  // Get the message first to find the waveId
  const message = db.getDroplet ? db.getDroplet(messageId) : db.getMessage?.(messageId);
  const waveId = message?.wave_id || message?.waveId;

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

  // Broadcast message read event so all clients can update wave list
  broadcast({ type: 'message_read', messageId, waveId, userId });

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
  res.json({ status: 'ok', version: VERSION, uptime: process.uptime() });
});

// ============ Public Server Info ============

// Get public server information (no auth required)
app.get('/api/server/info', (req, res) => {
  const stats = db.getPublicStats();
  const identity = FEDERATION_ENABLED ? db.getServerIdentity() : null;

  // Get active federation partners (names only)
  let partners = [];
  let partnerCount = 0;
  if (FEDERATION_ENABLED) {
    const nodes = db.getFederationNodes({ status: 'active' });
    partners = nodes.map(n => n.nodeName);
    partnerCount = partners.length;
  }

  res.json({
    name: identity?.nodeName || null,
    version: VERSION,
    federationEnabled: FEDERATION_ENABLED,
    stats: {
      users: stats.userCount,
      waves: stats.waveCount,
      uptime: Math.floor(process.uptime())
    },
    federation: FEDERATION_ENABLED ? {
      configured: !!identity,
      partners,
      partnerCount
    } : null
  });
});

// Rate limiter for public federation requests
const publicFederationRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour per IP
  message: { error: 'Too many federation requests. Try again later.' }
});

// Public endpoint to request federation from this server
app.post('/api/server/federation-request', publicFederationRequestLimiter, async (req, res) => {
  if (!FEDERATION_ENABLED) {
    return res.status(400).json({ error: 'Federation is not enabled on this server' });
  }

  const ourIdentity = db.getServerIdentity();
  if (!ourIdentity) {
    return res.status(400).json({ error: 'This server has not configured federation yet' });
  }

  const { serverUrl, message } = req.body;
  if (!serverUrl) {
    return res.status(400).json({ error: 'serverUrl is required' });
  }

  // Normalize URL
  const normalizedUrl = serverUrl.replace(/\/+$/, '');

  try {
    // Fetch the requesting server's identity
    const identityUrl = `${normalizedUrl}/api/federation/identity`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(identityUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `Farhold/${ourIdentity.nodeName}`
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({
        error: 'Could not reach the specified server',
        details: `HTTP ${response.status}`
      });
    }

    const remoteIdentity = await response.json();
    if (!remoteIdentity.nodeName || !remoteIdentity.publicKey) {
      return res.status(400).json({ error: 'Invalid response from remote server - is it a Farhold server?' });
    }

    // Check if already federated
    const existingNode = db.getFederationNodeByName(remoteIdentity.nodeName);
    if (existingNode && existingNode.status === 'active') {
      return res.json({ success: true, message: 'Already federated with this server', alreadyFederated: true });
    }

    // Check for existing pending request
    const existingRequest = db.getPendingRequestFromNode(remoteIdentity.nodeName);
    if (existingRequest) {
      return res.json({ success: true, message: 'Request already pending', duplicate: true });
    }

    // Create the federation request (as if they sent it to us)
    const request = db.createFederationRequest(
      remoteIdentity.nodeName,
      normalizedUrl,
      remoteIdentity.publicKey,
      ourIdentity.nodeName,
      message || null
    );

    console.log(`📨 Public federation request from ${remoteIdentity.nodeName} via web form`);
    res.json({
      success: true,
      message: 'Federation request submitted. The server admin will need to accept your request.',
      requestId: request.id
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(400).json({ error: 'Connection timed out - is the server URL correct?' });
    }
    console.error('Public federation request error:', error.message);
    res.status(400).json({ error: 'Could not connect to the specified server', details: error.message });
  }
});

// ============ Farhold v2.0.0 API Aliases ============
// These aliases allow clients to use the new Farhold terminology while maintaining backward compatibility

// /api/pings/* -> /api/droplets/* (pings = new name for droplets)
app.use('/api/pings', (req, res, next) => {
  req.url = req.originalUrl.replace('/api/pings', '/api/droplets');
  next('route');
});
app.all('/api/pings', (req, res, next) => { req.url = '/api/droplets'; next('route'); });
app.all('/api/pings/:id', (req, res, next) => { req.url = `/api/droplets/${req.params.id}`; next('route'); });
app.all('/api/pings/:id/react', (req, res, next) => { req.url = `/api/droplets/${req.params.id}/react`; next('route'); });
app.all('/api/pings/:id/read', (req, res, next) => { req.url = `/api/droplets/${req.params.id}/read`; next('route'); });
app.all('/api/pings/:id/burst', (req, res, next) => { req.url = `/api/droplets/${req.params.id}/ripple`; next('route'); }); // burst = new name for ripple
app.all('/api/pings/:id/ripple', (req, res, next) => { req.url = `/api/droplets/${req.params.id}/ripple`; next('route'); });

// /api/crews/* -> /api/groups/* (crews = new name for groups)
app.all('/api/crews', (req, res, next) => { req.url = '/api/groups'; next('route'); });
app.all('/api/crews/invitations', (req, res, next) => { req.url = '/api/groups/invitations'; next('route'); });
app.all('/api/crews/invitations/:id', (req, res, next) => { req.url = `/api/groups/invitations/${req.params.id}`; next('route'); });
app.all('/api/crews/invitations/:id/accept', (req, res, next) => { req.url = `/api/groups/invitations/${req.params.id}/accept`; next('route'); });
app.all('/api/crews/invitations/:id/decline', (req, res, next) => { req.url = `/api/groups/invitations/${req.params.id}/decline`; next('route'); });
app.all('/api/crews/:id', (req, res, next) => { req.url = `/api/groups/${req.params.id}`; next('route'); });
app.all('/api/crews/:id/invite', (req, res, next) => { req.url = `/api/groups/${req.params.id}/invite`; next('route'); });
app.all('/api/crews/:id/invitations/sent', (req, res, next) => { req.url = `/api/groups/${req.params.id}/invitations/sent`; next('route'); });
app.all('/api/crews/:id/members', (req, res, next) => { req.url = `/api/groups/${req.params.id}/members`; next('route'); });
app.all('/api/crews/:id/members/:userId', (req, res, next) => { req.url = `/api/groups/${req.params.id}/members/${req.params.userId}`; next('route'); });

// ============ WebSocket Setup ============
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Map();
const userViewingState = new Map(); // Track which wave each user is viewing { userId: { waveId, timestamp } }

// Connection rate limiting (per IP)
const wsConnectionAttempts = new Map();
const WS_RATE_LIMIT = 10;
const WS_RATE_WINDOW = 60 * 1000;

// Per-user message rate limiting
const wsUserMessageCounts = new Map(); // { odUserId: { messages: [], typing: [] } }

function checkWsRateLimit(userId, type = 'messages') {
  const now = Date.now();
  if (!wsUserMessageCounts.has(userId)) {
    wsUserMessageCounts.set(userId, { messages: [], typing: [] });
  }
  const userCounts = wsUserMessageCounts.get(userId);

  // Clean old entries
  userCounts.messages = userCounts.messages.filter(t => t > now - WS_RATE_WINDOW_MS);
  userCounts.typing = userCounts.typing.filter(t => t > now - WS_RATE_WINDOW_MS);

  const limit = type === 'typing' ? WS_RATE_LIMIT_TYPING : WS_RATE_LIMIT_MESSAGES;
  const counts = type === 'typing' ? userCounts.typing : userCounts.messages;

  if (counts.length >= limit) {
    return false; // Rate limit exceeded
  }

  counts.push(now);
  return true; // Allowed
}

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

      // Rate limit all messages (except auth and ping which are essential)
      if (userId && message.type !== 'auth' && message.type !== 'ping') {
        if (!checkWsRateLimit(userId, 'messages')) {
          ws.send(JSON.stringify({ type: 'rate_limit', message: 'WebSocket message rate limit exceeded' }));
          return;
        }
      }

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

        // Rate limit typing indicators (more restrictive since they broadcast)
        if (!checkWsRateLimit(userId, 'typing')) {
          ws.send(JSON.stringify({ type: 'rate_limit', message: 'Typing indicator rate limit exceeded' }));
          return;
        }

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
        wsUserMessageCounts.delete(userId); // Clean up rate limit tracking
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

    // Handle corrupted queue entries where payload might be a string
    let payload = msg.payload;
    if (typeof payload === 'string') {
      console.warn(`⚠️  Queue message ${msg.id} has string payload, attempting to parse`);
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        console.error(`❌ Failed to parse queue message ${msg.id}, marking as failed`);
        db.markFederationMessageFailed(msg.id, 'Corrupted payload');
        continue;
      }
    }

    try {
      const response = await sendSignedFederationRequest(node, 'POST', '/api/federation/inbox', payload);

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

// Activity log cleanup (90-day retention)
const ACTIVITY_LOG_RETENTION_DAYS = parseInt(process.env.ACTIVITY_LOG_RETENTION_DAYS) || 90;
if (db.cleanupOldActivityLogs) {
  // Run cleanup daily
  setInterval(() => {
    try {
      const deleted = db.cleanupOldActivityLogs(ACTIVITY_LOG_RETENTION_DAYS);
      if (deleted > 0) {
        console.log(`🧹 Cleaned ${deleted} old activity log entries (>${ACTIVITY_LOG_RETENTION_DAYS} days)`);
      }
    } catch (err) {
      console.error('Activity log cleanup error:', err);
    }
  }, 24 * 60 * 60 * 1000); // Daily

  // Also run once on startup after a delay
  setTimeout(() => {
    try {
      const deleted = db.cleanupOldActivityLogs(ACTIVITY_LOG_RETENTION_DAYS);
      if (deleted > 0) {
        console.log(`🧹 Startup cleanup: removed ${deleted} old activity log entries`);
      }
    } catch (err) {
      console.error('Activity log startup cleanup error:', err);
    }
  }, 60000); // 1 minute after startup
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

// Farhold v2.0.0 event name mappings (old -> new)
const EVENT_ALIASES = {
  'new_droplet': 'new_ping',
  'droplet_edited': 'ping_edited',
  'droplet_deleted': 'ping_deleted',
  'droplet_read': 'ping_read',
  'droplet_rippled': 'ping_burst',
  'group_invitation_received': 'crew_invitation_received',
  'group_invitation_accepted': 'crew_invitation_accepted',
  'group_invitation_declined': 'crew_invitation_declined',
  'group_invitation_cancelled': 'crew_invitation_cancelled'
};

// Broadcast to specific users by their IDs
// Automatically sends both old and new event names for backward compatibility
function broadcast(message, userIds = []) {
  for (const userId of userIds) {
    if (clients.has(userId)) {
      for (const ws of clients.get(userId)) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(message));
          // Also send with new event name if applicable
          if (message.type && EVENT_ALIASES[message.type]) {
            ws.send(JSON.stringify({ ...message, type: EVENT_ALIASES[message.type] }));
          }
        }
      }
    }
  }
}

function broadcastToUser(userId, message) {
  broadcast(message, [userId]);
}

function broadcastToAdmins(message) {
  const admins = db.getAdminUsers();
  const adminIds = admins.map(a => a.id);
  broadcast(message, adminIds);
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
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(message));
          // Also send with new event name if applicable
          if (message.type && EVENT_ALIASES[message.type]) {
            ws.send(JSON.stringify({ ...message, type: EVENT_ALIASES[message.type] }));
          }
        }
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
║  ███████╗ █████╗ ██████╗ ██╗  ██╗ ██████╗ ██╗     ██████╗  ║
║  ██╔════╝██╔══██╗██╔══██╗██║  ██║██╔═══██╗██║     ██╔══██╗ ║
║  █████╗  ███████║██████╔╝███████║██║   ██║██║     ██║  ██║ ║
║  ██╔══╝  ██╔══██║██╔══██╗██╔══██║██║   ██║██║     ██║  ██║ ║
║  ██║     ██║  ██║██║  ██║██║  ██║╚██████╔╝███████╗██████╔╝ ║
║  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═════╝  ║
║  SECURE COMMUNICATIONS SYSTEM v${VERSION.padEnd(24)}║
╠════════════════════════════════════════════════════════════╣
║  🔒 Security: Rate limiting, XSS protection, Helmet        ║
║  🌐 Federation: Server-to-server communication             ║
║  👥 Groups: Create groups, manage members, group waves     ║
║  🆔 Identity: UUID-based with changeable handles           ║
║  📝 Profiles: Change password, display name, avatar        ║
║  📦 Archives: Personal wave archiving                      ║
╠════════════════════════════════════════════════════════════╣
║  PORT=${PORT} | JWT=${JWT_SECRET === 'cortex-default-secret-CHANGE-ME' ? '⚠️ DEFAULT' : '✅ Custom'} | CORS=${ALLOWED_ORIGINS ? '✅' : '⚠️ All'}
║  FEDERATION=${process.env.FEDERATION_ENABLED === 'true' ? '✅' : '❌'} | SESSIONS=${SESSION_TRACKING_ENABLED ? '✅' : '❌'}
║  Server: http://localhost:${PORT}
╚════════════════════════════════════════════════════════════╝
`);

  // Start session cleanup job if session tracking is enabled
  if (SESSION_TRACKING_ENABLED && db.cleanupExpiredSessions) {
    setInterval(() => {
      try {
        const cleaned = db.cleanupExpiredSessions();
        if (cleaned > 0) {
          console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
        }
      } catch (err) {
        console.error('Session cleanup error:', err.message);
      }
    }, SESSION_CLEANUP_INTERVAL);
    console.log('📱 Session management enabled (cleanup every hour)');
  }
});
