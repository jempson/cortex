-- Cortex SQLite Database Schema
-- Version 1.19.0

-- ============ Users ============
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '?',
    avatar_url TEXT,
    bio TEXT,
    node_name TEXT DEFAULT 'Local',
    status TEXT DEFAULT 'offline',
    is_admin INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen TEXT,
    last_handle_change TEXT,
    -- Security flags
    require_password_change INTEGER DEFAULT 0,
    -- Preferences stored as JSON
    preferences TEXT DEFAULT '{"theme":"firefly","fontSize":"medium"}'
);

-- Handle history for tracking username changes
CREATE TABLE IF NOT EXISTS handle_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_handle TEXT NOT NULL,
    changed_at TEXT NOT NULL
);

-- Contacts relationship (one-directional, need two rows for mutual)
-- Note: contact_id has no FK to allow federated user follows
CREATE TABLE IF NOT EXISTS contacts (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, contact_id)
);

-- ============ Waves ============
CREATE TABLE IF NOT EXISTS waves (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    privacy TEXT NOT NULL DEFAULT 'private',
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- Break-out tracking fields
    root_droplet_id TEXT REFERENCES droplets(id) ON DELETE SET NULL,
    broken_out_from TEXT REFERENCES waves(id) ON DELETE SET NULL,
    -- JSON array storing the lineage: [{"wave_id":"...", "droplet_id":"...", "title":"..."}]
    breakout_chain TEXT,
    -- Federation fields (v1.13.0)
    federation_state TEXT DEFAULT 'local',  -- local, origin, participant
    origin_node TEXT,                        -- node name if participant wave
    origin_wave_id TEXT,                     -- original wave id on origin server
    -- E2EE field (v1.19.0)
    encrypted INTEGER DEFAULT 0             -- 1 if wave uses E2EE (all new waves)
);

-- Wave participants
CREATE TABLE IF NOT EXISTS wave_participants (
    wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    archived INTEGER DEFAULT 0,
    last_read TEXT,
    PRIMARY KEY (wave_id, user_id)
);

-- ============ Droplets (formerly Messages) ============
CREATE TABLE IF NOT EXISTS droplets (
    id TEXT PRIMARY KEY,
    wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES droplets(id) ON DELETE SET NULL,
    author_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    privacy TEXT DEFAULT 'private',
    version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    edited_at TEXT,
    deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    -- Reactions stored as JSON: {"emoji": ["userId1", "userId2"]}
    reactions TEXT DEFAULT '{}',
    -- Break-out tracking fields
    broken_out_to TEXT REFERENCES waves(id) ON DELETE SET NULL,
    original_wave_id TEXT REFERENCES waves(id) ON DELETE SET NULL,
    -- E2EE fields (v1.19.0)
    encrypted INTEGER DEFAULT 0,           -- 1 if content is encrypted
    nonce TEXT,                            -- Base64 AES-GCM nonce (12 bytes)
    key_version INTEGER DEFAULT 1          -- Wave key version used for encryption
);

-- Droplet read tracking (many-to-many)
CREATE TABLE IF NOT EXISTS droplet_read_by (
    droplet_id TEXT NOT NULL REFERENCES droplets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL,
    PRIMARY KEY (droplet_id, user_id)
);

-- Droplet edit history
CREATE TABLE IF NOT EXISTS droplet_history (
    id TEXT PRIMARY KEY,
    droplet_id TEXT NOT NULL REFERENCES droplets(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    edited_at TEXT NOT NULL
);

-- ============ Groups ============
CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);

-- Group members
CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
);

-- ============ Requests & Invitations ============

-- Handle change requests
CREATE TABLE IF NOT EXISTS handle_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_handle TEXT NOT NULL,
    new_handle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    created_at TEXT NOT NULL,
    processed_at TEXT,
    processed_by TEXT REFERENCES users(id)
);

-- Contact requests
CREATE TABLE IF NOT EXISTS contact_requests (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    responded_at TEXT
);

-- Group invitations
CREATE TABLE IF NOT EXISTS group_invitations (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    responded_at TEXT
);

-- ============ Moderation ============

-- User blocks
CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_at TEXT NOT NULL,
    UNIQUE (user_id, blocked_user_id)
);

-- User mutes
CREATE TABLE IF NOT EXISTS mutes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_at TEXT NOT NULL,
    UNIQUE (user_id, muted_user_id)
);

-- Content reports
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

-- User warnings (issued by moderators)
CREATE TABLE IF NOT EXISTS warnings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_by TEXT NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

-- Moderation audit log
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

-- ============ Account Security ============

-- Account lockouts (persisted across restarts)
CREATE TABLE IF NOT EXISTS account_lockouts (
    handle TEXT PRIMARY KEY COLLATE NOCASE,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    last_attempt TEXT
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ============ Multi-Factor Authentication ============

-- User MFA settings
CREATE TABLE IF NOT EXISTS user_mfa (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    totp_secret TEXT,                    -- Encrypted TOTP secret
    totp_enabled INTEGER DEFAULT 0,
    email_mfa_enabled INTEGER DEFAULT 0,
    recovery_codes TEXT,                 -- JSON array of hashed codes
    recovery_codes_generated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- MFA challenge tokens (for login flow)
CREATE TABLE IF NOT EXISTS mfa_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_type TEXT NOT NULL,        -- totp, email, recovery
    code_hash TEXT,                      -- For email codes (hashed)
    expires_at TEXT NOT NULL,
    verified_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user ON mfa_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON mfa_challenges(expires_at);

-- ============ Activity Log (v1.14.0) ============

-- Activity log for security auditing
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,           -- login, logout, password_change, etc.
    resource_type TEXT,                  -- user, wave, droplet, etc.
    resource_id TEXT,                    -- ID of the affected resource
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT,                       -- JSON for additional context
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_resource ON activity_log(resource_type, resource_id);

-- ============ Session Management (v1.18.0) ============

-- Server-side session tracking for token revocation
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL,
    last_active TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0,
    revoked_at TEXT,
    UNIQUE(token_hash)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON user_sessions(revoked);

-- ============ End-to-End Encryption (v1.19.0) ============

-- User encryption keypairs (ECDH P-384)
-- Private key is encrypted with user's passphrase-derived key (PBKDF2)
CREATE TABLE IF NOT EXISTS user_encryption_keys (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,              -- Base64 SPKI-encoded ECDH public key
    encrypted_private_key TEXT NOT NULL,   -- Base64 AES-KW encrypted JWK private key
    key_derivation_salt TEXT NOT NULL,     -- Base64 PBKDF2 salt (16 bytes)
    key_version INTEGER DEFAULT 1,         -- Incremented on key rotation
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Wave encryption keys (per-participant)
-- Each participant has the wave key encrypted with their public key
CREATE TABLE IF NOT EXISTS wave_encryption_keys (
    id TEXT PRIMARY KEY,
    wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_wave_key TEXT NOT NULL,      -- Base64 encrypted AES-256-GCM key
    sender_public_key TEXT NOT NULL,       -- Base64 SPKI of key used to encrypt
    key_version INTEGER DEFAULT 1,         -- Version of wave key
    created_at TEXT NOT NULL,
    UNIQUE(wave_id, user_id, key_version)
);

-- Wave key metadata
-- Tracks current key version and rotation history
CREATE TABLE IF NOT EXISTS wave_key_metadata (
    wave_id TEXT PRIMARY KEY REFERENCES waves(id) ON DELETE CASCADE,
    current_key_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    last_rotated_at TEXT
);

-- E2EE Recovery (optional passphrase recovery)
CREATE TABLE IF NOT EXISTS user_recovery_keys (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    encrypted_private_key TEXT NOT NULL,   -- Private key encrypted with recovery passphrase
    recovery_salt TEXT NOT NULL,           -- Separate salt for recovery key derivation
    hint TEXT,                             -- User-provided hint for recovery passphrase
    created_at TEXT NOT NULL
);

-- E2EE indexes
CREATE INDEX IF NOT EXISTS idx_wave_encryption_keys_wave ON wave_encryption_keys(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_encryption_keys_user ON wave_encryption_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_wave_encryption_keys_version ON wave_encryption_keys(wave_id, key_version);

-- ============ Indexes ============

-- User lookups
CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Handle history lookup
CREATE INDEX IF NOT EXISTS idx_handle_history_user ON handle_history(user_id);

-- Contact lookups
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contact ON contacts(contact_id);

-- Wave lookups
CREATE INDEX IF NOT EXISTS idx_waves_created_by ON waves(created_by);
CREATE INDEX IF NOT EXISTS idx_waves_privacy ON waves(privacy);
CREATE INDEX IF NOT EXISTS idx_waves_group ON waves(group_id);
CREATE INDEX IF NOT EXISTS idx_waves_updated ON waves(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_waves_root_droplet ON waves(root_droplet_id);
CREATE INDEX IF NOT EXISTS idx_waves_broken_out_from ON waves(broken_out_from);

-- Wave participant lookups
CREATE INDEX IF NOT EXISTS idx_wave_participants_user ON wave_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_wave_participants_wave ON wave_participants(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_participants_archived ON wave_participants(user_id, archived);

-- Droplet lookups
CREATE INDEX IF NOT EXISTS idx_droplets_wave ON droplets(wave_id);
CREATE INDEX IF NOT EXISTS idx_droplets_author ON droplets(author_id);
CREATE INDEX IF NOT EXISTS idx_droplets_parent ON droplets(parent_id);
CREATE INDEX IF NOT EXISTS idx_droplets_created ON droplets(wave_id, created_at);
CREATE INDEX IF NOT EXISTS idx_droplets_deleted ON droplets(deleted);
CREATE INDEX IF NOT EXISTS idx_droplets_broken_out ON droplets(broken_out_to);
CREATE INDEX IF NOT EXISTS idx_droplets_original_wave ON droplets(original_wave_id);

-- Droplet read tracking
CREATE INDEX IF NOT EXISTS idx_droplet_read_user ON droplet_read_by(user_id);
CREATE INDEX IF NOT EXISTS idx_droplet_read_droplet ON droplet_read_by(droplet_id);

-- Droplet history
CREATE INDEX IF NOT EXISTS idx_droplet_history_droplet ON droplet_history(droplet_id);

-- Group lookups
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);

-- Group member lookups
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

-- Handle request lookups
CREATE INDEX IF NOT EXISTS idx_handle_requests_user ON handle_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_handle_requests_status ON handle_requests(status);

-- Contact request lookups
CREATE INDEX IF NOT EXISTS idx_contact_requests_from ON contact_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_to ON contact_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(status);

-- Group invitation lookups
CREATE INDEX IF NOT EXISTS idx_group_invitations_group ON group_invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invitations_inviter ON group_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_group_invitations_invitee ON group_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_group_invitations_status ON group_invitations(status);

-- Moderation lookups
CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_mutes_user ON mutes(user_id);
CREATE INDEX IF NOT EXISTS idx_mutes_muted ON mutes(muted_user_id);

-- Report lookups
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

-- Warning lookups
CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_warnings_issued_by ON warnings(issued_by);
CREATE INDEX IF NOT EXISTS idx_warnings_report ON warnings(report_id);

-- Moderation log lookups
CREATE INDEX IF NOT EXISTS idx_moderation_log_admin ON moderation_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_target ON moderation_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log(created_at DESC);

-- ============ Notifications ============

-- User notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,  -- direct_mention, reply, wave_activity, ripple, system
    wave_id TEXT REFERENCES waves(id) ON DELETE SET NULL,
    droplet_id TEXT REFERENCES droplets(id) ON DELETE SET NULL,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT,
    preview TEXT,  -- Truncated content preview
    read INTEGER DEFAULT 0,
    dismissed INTEGER DEFAULT 0,
    push_sent INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    read_at TEXT,
    group_key TEXT  -- For collapsing similar notifications
);

-- Notification preferences per wave
CREATE TABLE IF NOT EXISTS wave_notification_settings (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
    enabled INTEGER DEFAULT 1,
    level TEXT DEFAULT 'all',  -- all, mentions, none
    sound INTEGER DEFAULT 1,
    push INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, wave_id)
);

-- ============ Push Subscriptions ============

-- Web Push API subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    -- Keys stored as JSON: {"p256dh": "...", "auth": "..."}
    keys TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, endpoint)
);

-- Push subscription lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = 0;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_wave ON notifications(wave_id);
CREATE INDEX IF NOT EXISTS idx_notifications_droplet ON notifications(droplet_id);
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON notifications(group_key);

-- Wave notification settings lookups
CREATE INDEX IF NOT EXISTS idx_wave_notification_settings_user ON wave_notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_wave_notification_settings_wave ON wave_notification_settings(wave_id);

-- ============ Federation ============

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
    status TEXT DEFAULT 'pending',  -- pending, outbound_pending, active, suspended, blocked, declined
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
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, declined
    created_at TEXT NOT NULL,
    responded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_federation_requests_status ON federation_requests(status);
CREATE INDEX IF NOT EXISTS idx_federation_requests_to_node ON federation_requests(to_node_name);

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
    status TEXT DEFAULT 'active',  -- active, pending, removed
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
    message_type TEXT NOT NULL,  -- wave_invite, new_droplet, droplet_edited, etc.
    payload TEXT NOT NULL,       -- JSON payload
    status TEXT DEFAULT 'pending',  -- pending, processing, delivered, failed
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
    status TEXT DEFAULT 'received'  -- received, processed, rejected
);

-- Federation indexes
CREATE INDEX IF NOT EXISTS idx_federation_nodes_status ON federation_nodes(status);
CREATE INDEX IF NOT EXISTS idx_federation_nodes_name ON federation_nodes(node_name);
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

-- ============ Crawl Bar (v1.15.0) ============

-- Server-wide crawl bar configuration (singleton)
CREATE TABLE IF NOT EXISTS crawl_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    -- Stock symbols to display (JSON array)
    stock_symbols TEXT DEFAULT '["AAPL","GOOGL","MSFT","AMZN","TSLA"]',
    -- News sources configuration (JSON array of {type, url, name})
    news_sources TEXT DEFAULT '[]',
    -- Default location for weather (JSON: {lat, lon, name})
    default_location TEXT DEFAULT '{"lat":40.7128,"lon":-74.0060,"name":"New York, NY"}',
    -- Refresh intervals in seconds
    stock_refresh_interval INTEGER DEFAULT 60,
    weather_refresh_interval INTEGER DEFAULT 300,
    news_refresh_interval INTEGER DEFAULT 180,
    -- Feature toggles
    stocks_enabled INTEGER DEFAULT 1,
    weather_enabled INTEGER DEFAULT 1,
    news_enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Cache for external API responses
CREATE TABLE IF NOT EXISTS crawl_cache (
    id TEXT PRIMARY KEY,
    cache_type TEXT NOT NULL,  -- 'stocks', 'weather', 'news'
    cache_key TEXT NOT NULL,   -- Symbol, location hash, or source URL
    data TEXT NOT NULL,        -- JSON cached response
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (cache_type, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_crawl_cache_type ON crawl_cache(cache_type);
CREATE INDEX IF NOT EXISTS idx_crawl_cache_expires ON crawl_cache(expires_at);

-- ============ Alert Droplets (v1.16.0) ============

-- Admin-created alerts that display in crawl bar
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'info',    -- info, warning, critical
    category TEXT NOT NULL DEFAULT 'system',  -- system, announcement, emergency
    scope TEXT NOT NULL DEFAULT 'local',      -- local, federated
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT,
    -- Federation tracking (NULL if local, populated if received from federated server)
    origin_node TEXT,
    origin_alert_id TEXT,
    UNIQUE (origin_node, origin_alert_id)
);

-- Subscriptions: what alert categories we subscribe to from other servers
CREATE TABLE IF NOT EXISTS alert_subscriptions (
    id TEXT PRIMARY KEY,
    source_node TEXT NOT NULL UNIQUE,         -- Node we're subscribing to
    categories TEXT NOT NULL DEFAULT '[]',    -- JSON array: ["system","emergency"]
    status TEXT NOT NULL DEFAULT 'active',    -- active, paused
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Subscribers: who subscribes to our alerts (populated by federation inbox)
CREATE TABLE IF NOT EXISTS alert_subscribers (
    id TEXT PRIMARY KEY,
    subscriber_node TEXT NOT NULL UNIQUE,     -- Node subscribing to us
    categories TEXT NOT NULL DEFAULT '[]',    -- JSON array
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- Per-user alert dismissals
CREATE TABLE IF NOT EXISTS alert_dismissals (
    alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (alert_id, user_id)
);

-- Alert indexes
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);
CREATE INDEX IF NOT EXISTS idx_alerts_scope ON alerts(scope);
CREATE INDEX IF NOT EXISTS idx_alerts_origin ON alerts(origin_node);
CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_source ON alert_subscriptions(source_node);
CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_status ON alert_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_alert_subscribers_node ON alert_subscribers(subscriber_node);
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user ON alert_dismissals(user_id);

-- ============ Full-Text Search ============

-- FTS5 virtual table for droplet content search
CREATE VIRTUAL TABLE IF NOT EXISTS droplets_fts USING fts5(
    id UNINDEXED,
    content,
    content='droplets',
    content_rowid='rowid'
);

-- Triggers to keep FTS table in sync with droplets table
-- Note: These triggers use external content table, so we need to handle inserts/updates/deletes

-- After INSERT trigger
CREATE TRIGGER IF NOT EXISTS droplets_fts_insert AFTER INSERT ON droplets BEGIN
    INSERT INTO droplets_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
END;

-- After DELETE trigger
CREATE TRIGGER IF NOT EXISTS droplets_fts_delete AFTER DELETE ON droplets BEGIN
    INSERT INTO droplets_fts(droplets_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
END;

-- After UPDATE trigger
CREATE TRIGGER IF NOT EXISTS droplets_fts_update AFTER UPDATE ON droplets BEGIN
    INSERT INTO droplets_fts(droplets_fts, rowid, id, content) VALUES ('delete', OLD.rowid, OLD.id, OLD.content);
    INSERT INTO droplets_fts(rowid, id, content) VALUES (NEW.rowid, NEW.id, NEW.content);
END;
