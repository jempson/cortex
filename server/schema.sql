-- Cortex SQLite Database Schema
-- Version 1.8.0

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

-- ============ Messages ============
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    wave_id TEXT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
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

-- Message read tracking (many-to-many)
CREATE TABLE IF NOT EXISTS message_read_by (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
);

-- Message edit history
CREATE TABLE IF NOT EXISTS message_history (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
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
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT REFERENCES users(id)
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

-- Message lookups
CREATE INDEX IF NOT EXISTS idx_messages_wave ON messages(wave_id);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(wave_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted);

-- Message read tracking
CREATE INDEX IF NOT EXISTS idx_message_read_user ON message_read_by(user_id);
CREATE INDEX IF NOT EXISTS idx_message_read_message ON message_read_by(message_id);

-- Message history
CREATE INDEX IF NOT EXISTS idx_message_history_message ON message_history(message_id);

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
