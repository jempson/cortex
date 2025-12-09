# Cortex v1.3.2 Deployment Guide

**Version:** 1.3.2-final
**Release Date:** December 4, 2025
**Deployment Type:** Rolling update (no downtime required)

---

## 📋 Pre-Deployment Checklist

### 1. Backup Current System

**Critical: Backup before any changes**

```bash
# Backup data directory
cd /path/to/cortex/server
tar -czf ../backup-$(date +%Y%m%d-%H%M%S).tar.gz data/

# Verify backup
tar -tzf ../backup-*.tar.gz

# Optional: Backup to remote location
# scp ../backup-*.tar.gz user@backup-server:/backups/cortex/
```

**What's backed up:**
- `data/users.json` - User accounts
- `data/waves.json` - Waves and participants
- `data/messages.json` - Messages and content
- `data/groups.json` - Groups and membership
- `data/handle-requests.json` - Handle change requests

### 2. Verify Current Version

```bash
# Check current version
cd /path/to/cortex
git describe --tags
git log -1 --oneline

# Check running processes
ps aux | grep node
```

### 3. Review System Requirements

**No new requirements for v1.3.2**
- Node.js 18+ (unchanged)
- npm 9+ (unchanged)
- 512MB RAM minimum (unchanged)
- 1GB disk space recommended

### 4. Schedule Maintenance Window

**Recommended but optional:**
- v1.3.2 supports rolling updates
- No database migration required
- Estimated deployment time: 5-10 minutes
- Users may experience brief WebSocket reconnect

**Best Practices:**
- Deploy during low-traffic period
- Notify users of upcoming update
- Have rollback plan ready

---

## 🚀 Deployment Steps

### Step 1: Pull Latest Code

```bash
cd /path/to/cortex

# Fetch latest changes
git fetch --all --tags

# Checkout v1.3.2-final tag
git checkout v1.3.2-final

# Verify checkout
git describe --tags
# Should show: v1.3.2-final
```

### Step 2: Update Server Dependencies

```bash
cd server

# Install/update dependencies
npm install

# Verify installation
npm list --depth=0
```

**Expected dependencies (no changes from v1.3.1):**
- bcryptjs: ^2.4.3
- cors: ^2.8.5
- express: ^4.21.0
- express-rate-limit: ^7.4.0
- helmet: ^8.0.0
- jsonwebtoken: ^9.0.2
- sanitize-html: ^2.13.0 (unchanged)
- uuid: ^10.0.0
- ws: ^8.18.0

### Step 3: Update Client Dependencies

```bash
cd ../client

# Install/update dependencies
npm install

# Verify installation
npm list --depth=0
```

**Expected dependencies (no changes from v1.3.1):**
- react: ^18.3.1
- react-dom: ^18.3.1
- @vitejs/plugin-react: ^4.3.2 (dev)
- vite: ^5.4.8 (dev)

### Step 4: Build Client for Production

```bash
# Still in client directory
npm run build

# Verify build
ls -lh dist/
# Should see: index.html, assets/ directory
```

**Build output should show:**
```
✓ built in ~5s
dist/index.html                   X.XX kB
dist/assets/index-XXXXX.js      XXX.XX kB │ gzip: ~60 kB
```

### Step 5: Restart Server (Production)

**Option A: With systemd (Recommended)**

```bash
# Restart service
sudo systemctl restart cortex-server

# Check status
sudo systemctl status cortex-server

# View logs
sudo journalctl -u cortex-server -f
```

**Option B: Manual restart with PM2**

```bash
# If using PM2
pm2 restart cortex-server

# Check status
pm2 status

# View logs
pm2 logs cortex-server --lines 50
```

**Option C: Manual restart (Development)**

```bash
# Stop current server (Ctrl+C or kill process)
# Then start server
cd server
npm start

# Or for development
npm run dev
```

### Step 6: Verify Server is Running

```bash
# Check if server is listening
curl http://localhost:3001/api/auth/me
# Should return 401 (expected without auth token)

# Check WebSocket
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Host: localhost:3001" -H "Origin: http://localhost:3001" \
  http://localhost:3001/ws
# Should return 101 Switching Protocols

# Check logs for errors
tail -f server/logs/*.log  # If using log files
# or
pm2 logs cortex-server  # If using PM2
# or
sudo journalctl -u cortex-server -f  # If using systemd
```

### Step 7: Deploy Client (Production)

**If using Nginx:**

```bash
# Copy built files to web root
sudo cp -r client/dist/* /var/www/cortex/

# Verify files
ls -lh /var/www/cortex/

# Reload Nginx (optional, not required for static files)
sudo nginx -t
sudo systemctl reload nginx
```

**If using separate development server:**

```bash
cd client
npm run preview  # Preview production build locally
# or
npm run dev  # Start development server
```

### Step 8: Smoke Tests

**Test critical functionality:**

```bash
# Test 1: Server health
curl http://localhost:3001/api/auth/me
# Expected: 401 Unauthorized (OK)

# Test 2: Login (use demo account)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"handle":"mal","password":"demo123"}'
# Expected: JSON with token

# Test 3: Access client
curl -I http://localhost:3000/
# Expected: 200 OK with text/html
```

**Manual UI Tests:**
1. ✅ Open browser to http://localhost:3000
2. ✅ Login with demo account (mal / demo123)
3. ✅ Test emoji picker (click 😀 button)
4. ✅ Test media input (click 🖼️ button)
5. ✅ Check profile settings → preferences
6. ✅ Verify theme selection works
7. ✅ Verify font size adjustment works
8. ✅ Check admin panel (if admin user)
9. ✅ Send a multi-line message (Shift+Enter)
10. ✅ Try wave deletion (create test wave)

### Step 9: Monitor for Issues

**First Hour:**
```bash
# Watch server logs
tail -f /var/log/cortex/server.log
# or
pm2 logs cortex-server --lines 100

# Monitor errors
grep -i "error" /var/log/cortex/server.log

# Check memory usage
free -h
ps aux | grep node

# Check CPU usage
top -p $(pgrep -f "node.*server.js")
```

**Look for:**
- ✅ No uncaught exceptions
- ✅ WebSocket connections successful
- ✅ No authentication errors
- ✅ Memory usage stable (~235MB typical)
- ✅ CPU usage normal (<5% idle)

### Step 10: Notify Users

**Announcement Template:**

```
🎉 Cortex v1.3.2 is now live!

New features:
✨ Emoji picker and image embedding
🗑️ Wave deletion (for creators)
⚙️ Theme and font size customization
📱 Improved mobile experience

Check out the new emoji picker (😀) and media button (🖼️) in the message input!

Visit Profile Settings to customize your theme and font size.

See full release notes: [link to RELEASE_NOTES-v1.3.2.md]
```

---

## ⚠️ Rollback Procedure

**If issues occur, rollback immediately**

### Quick Rollback

```bash
# Stop current server
pm2 stop cortex-server  # or sudo systemctl stop cortex-server

# Restore previous version
cd /path/to/cortex
git checkout v1.3.1  # or previous version tag

# Restore data from backup (only if data corruption)
cd server
rm -rf data/
tar -xzf ../../backup-YYYYMMDD-HHMMSS.tar.gz

# Restart server
pm2 start cortex-server  # or sudo systemctl start cortex-server

# Verify rollback
curl http://localhost:3001/api/auth/me
```

### When to Rollback

**Rollback if:**
- ❌ Server fails to start
- ❌ Authentication broken
- ❌ Data corruption detected
- ❌ Critical feature not working
- ❌ Performance degradation >50%

**Don't rollback for:**
- ✅ Minor UI glitches (can be fixed with hotfix)
- ✅ Single user issues (may be client-side)
- ✅ Cosmetic problems

---

## 🔍 Post-Deployment Verification

### 24-Hour Monitoring Checklist

**Hour 1-2: Critical Period**
- [ ] Server running stable
- [ ] No error spikes in logs
- [ ] Users can login
- [ ] Messages sending/receiving
- [ ] WebSocket connections stable
- [ ] New features accessible

**Hour 2-8: Stabilization**
- [ ] Memory usage stable
- [ ] No memory leaks detected
- [ ] CPU usage normal
- [ ] Response times acceptable
- [ ] No user complaints

**Hour 8-24: Validation**
- [ ] All features working as expected
- [ ] Performance metrics normal
- [ ] No rollback required
- [ ] User feedback positive
- [ ] Analytics showing feature usage

### Performance Metrics

**Monitor these values:**

| Metric | Target | Acceptable | Action Needed |
|--------|--------|------------|---------------|
| Memory Usage | 235MB | <400MB | >500MB |
| CPU Usage (idle) | <5% | <15% | >30% |
| Response Time | <100ms | <300ms | >500ms |
| WebSocket Latency | <50ms | <150ms | >300ms |
| Error Rate | 0% | <0.1% | >1% |

### Log Analysis

```bash
# Count errors in last hour
grep -c "ERROR" /var/log/cortex/server.log | tail -60

# Check for specific issues
grep -i "wave_deleted" /var/log/cortex/server.log
grep -i "preferences" /var/log/cortex/server.log
grep -i "sanitize" /var/log/cortex/server.log

# Monitor WebSocket connections
grep -c "WebSocket connection established" /var/log/cortex/server.log
```

---

## 🐛 Troubleshooting Common Issues

### Issue 1: Server Won't Start

**Symptoms:** Server crashes on startup
**Check:**
```bash
# Check for syntax errors
node --check server/server.js

# Check dependencies
cd server && npm install

# Check port availability
lsof -i :3001
```

**Solution:**
```bash
# Kill process using port
kill $(lsof -t -i :3001)

# Restart server
npm start
```

### Issue 2: Preferences Not Saving

**Symptoms:** Theme/font size changes don't persist
**Check:**
```bash
# Verify data file permissions
ls -la server/data/users.json

# Check logs for write errors
grep -i "saveUsers" /var/log/cortex/server.log
```

**Solution:**
```bash
# Fix permissions
chmod 644 server/data/users.json
chmod 755 server/data/
```

### Issue 3: Media Not Embedding

**Symptoms:** Images not showing in messages
**Check:**
```bash
# Test sanitization
curl -X POST http://localhost:3001/api/waves/TEST/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"https://example.com/image.jpg"}'

# Check response for <img> tag
```

**Solution:**
- Verify image URL is valid HTTPS
- Check sanitize-html configuration
- Review browser console for CSP errors

### Issue 4: WebSocket Disconnects

**Symptoms:** Frequent reconnections
**Check:**
```bash
# Check WebSocket logs
grep "WebSocket" /var/log/cortex/server.log | tail -50

# Monitor connections
watch 'lsof -i :3001 | grep ESTABLISHED | wc -l'
```

**Solution:**
- Check nginx WebSocket proxy settings
- Verify timeout configurations
- Review client reconnection logic

---

## 📊 Success Criteria

**Deployment is successful when:**

✅ **Technical Checks**
- Server running without errors for 24 hours
- Memory usage stable
- All API endpoints responding
- WebSocket connections stable
- No data corruption

✅ **Functional Checks**
- Users can login
- Messages send/receive correctly
- Emoji picker works
- Media embedding works
- Preferences save/load correctly
- Wave deletion works
- Admin panel accessible to admins

✅ **Performance Checks**
- Response times <300ms
- Memory usage <400MB
- CPU usage <15%
- Error rate <0.1%

✅ **User Validation**
- No critical bug reports
- Feature adoption starting
- Positive user feedback
- No rollback requests

---

## 📝 Post-Deployment Tasks

### Immediate (Day 1)
- [ ] Mark v1.3.2 as stable in documentation
- [ ] Close v1.3.2 milestone in project tracker
- [ ] Archive deployment logs
- [ ] Update monitoring dashboards

### Short-term (Week 1)
- [ ] Collect user feedback on new features
- [ ] Monitor feature usage analytics
- [ ] Address minor bugs with hotfixes
- [ ] Update FAQ with common questions

### Medium-term (Month 1)
- [ ] Review performance metrics
- [ ] Plan v1.3.3 based on feedback
- [ ] Document lessons learned
- [ ] Optimize features based on usage

---

## 🆘 Emergency Contacts

**If critical issues occur:**

1. **Rollback immediately** (see Rollback Procedure above)
2. **Notify team** via designated channels
3. **Document issue** for post-mortem
4. **Create hotfix** if needed

**Hotfix Process:**
```bash
# Create hotfix branch
git checkout -b hotfix/v1.3.2.1 v1.3.2-final

# Make fix
# ... edit files ...

# Test fix
npm test

# Commit and tag
git commit -am "Hotfix: description"
git tag v1.3.2.1
git push origin hotfix/v1.3.2.1 --tags

# Deploy hotfix (follow deployment steps above)
```

---

## ✅ Final Checklist

**Before marking deployment complete:**

- [ ] Backup created and verified
- [ ] Code deployed (v1.3.2-final)
- [ ] Dependencies installed (server & client)
- [ ] Client built for production
- [ ] Server restarted successfully
- [ ] Smoke tests passed
- [ ] Monitoring in place
- [ ] Users notified
- [ ] Documentation updated
- [ ] Team debriefed
- [ ] Success criteria met

---

**Deployment completed successfully! 🎉**

Next: Monitor for 24 hours, collect feedback, plan v1.3.3.
