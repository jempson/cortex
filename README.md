# CORTEX - Secure Communications System

A Wave-inspired, Firefly-themed communication platform with real-time collaboration, threaded conversations, and playback features.

## Features

- **User Authentication**: Secure JWT-based sessions with rate limiting
- **Threaded Conversations**: Nested replies with collapsible threads (Wave-style)
- **Privacy Levels**: Private, Group, Cross-Server, and Public message types
- **Group Management**: Create groups, manage members, assign admin roles
- **Thread Privacy Control**: Change thread visibility anytime (creator only)
- **Public Threads**: Visible to all users, auto-join when posting
- **Playback Mode**: Replay conversations chronologically
- **Real-time Updates**: WebSocket-based live message delivery
- **Contacts Management**: Search users and manage contact list

## What's New in v1.2.0

- **Separated Data Storage**: Users, threads, messages, and groups stored in separate files
- **Group Management**: Create/delete groups, add/remove members, assign admin roles
- **Thread Privacy Editing**: Thread creators can change privacy level anytime
- **Group Threads**: Create threads visible only to group members
- **Auto-migration**: Legacy single-file data automatically migrated

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
npm start
```

### 2. Start the Client

```bash
cd client
npm install
npm run dev
```

### 3. Open http://localhost:3000 and create an account

## Data Storage

Data is stored in separate JSON files in `server/data/`:

```
server/data/
├── users.json      # User accounts and contacts
├── threads.json    # Threads and participants
├── messages.json   # Messages and edit history
└── groups.json     # Groups and memberships
```

### Migration from v1.1.0

If you have an existing `cortex-data.json` file, it will be automatically migrated on first startup.

## Environment Variables

Copy `.env.example` to `.env`:

```bash
PORT=3001                            # Server port
JWT_SECRET=your-secret-key           # CHANGE THIS!
ALLOWED_ORIGINS=https://your.domain  # CORS restriction
SEED_DEMO_DATA=false                 # Set true for demo users
```

## Production Deployment

Update `API_URL` and `WS_URL` in `CortexApp.jsx` before building:

```javascript
const API_URL = 'https://cortex.yourdomain.com/api';
const WS_URL = 'wss://cortex.yourdomain.com';
```

Build frontend:
```bash
cd client && npm run build
```

## API Endpoints

### Authentication
- POST `/api/auth/register` - Create account (3/hour limit)
- POST `/api/auth/login` - Login (5/15min limit)
- GET `/api/auth/me` - Get current user
- POST `/api/auth/logout` - Logout

### Threads
- GET `/api/threads` - List accessible threads
- GET `/api/threads/:id` - Get thread with messages
- POST `/api/threads` - Create thread
- PUT `/api/threads/:id` - Update thread (title, privacy)

### Groups
- GET `/api/groups` - List user's groups
- POST `/api/groups` - Create group
- PUT `/api/groups/:id` - Update group (admin)
- DELETE `/api/groups/:id` - Delete group (admin)
- POST `/api/groups/:id/members` - Add member (admin)
- DELETE `/api/groups/:id/members/:userId` - Remove member
- PUT `/api/groups/:id/members/:userId` - Update role (admin)

### Messages
- POST `/api/messages` - Send message
- PUT `/api/messages/:id` - Edit message

### Contacts
- GET `/api/contacts` - List contacts
- POST `/api/contacts` - Add contact
- DELETE `/api/contacts/:id` - Remove contact
- GET `/api/users/search?q=` - Search users

## License

MIT
