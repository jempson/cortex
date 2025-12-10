-- Cortex SQLite Database Schema
-- Version 1.10.0

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
CREATE TABLE IF NOT EXISTS contacts (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    updated_at TEXT NOT NULL
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
    reactions TEXT DEFAULT '{}'
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
