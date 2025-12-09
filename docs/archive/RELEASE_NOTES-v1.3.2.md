# Cortex v1.3.2 Release Notes

**Release Date:** December 4, 2025
**Release Type:** Stable
**Codename:** Rich Content & UX Improvements

---

## 🎉 Welcome to Cortex v1.3.2!

This release brings significant improvements to content creation, user customization, and mobile experience. You can now share images and GIFs, customize your interface, and enjoy a smoother experience across all devices.

---

## ✨ What's New

### 🎨 Rich Content Support

**Share Visual Content**
- **Emoji Picker**: Click the 😀 button to insert emojis from a popup picker
- **Image & GIF Embedding**: Click the 🖼️ button to paste image or GIF URLs
- **Auto-Detection**: Just paste an image URL and it automatically embeds
- **Multi-line Messages**: Use Shift+Enter to create new lines, Enter to send

**How to Use:**
1. Start typing a message
2. Click 😀 to add emojis or 🖼️ to add images
3. For multi-line messages, hold Shift and press Enter
4. Press Enter alone to send your message

### 🗑️ Wave Management

**Delete Waves You Created**
- Wave creators can now delete waves entirely
- All participants are notified when a wave is deleted
- Deleted waves are permanently removed (not just archived)
- Confirmation required before deletion

**How to Delete:**
1. Open the wave you created
2. Click the "DELETE WAVE" button
3. Confirm deletion in the popup
4. Wave and all messages are removed

### ⚙️ Personalize Your Experience

**Choose Your Theme**
- **Firefly** (Default): Classic dark green terminal aesthetic
- **High Contrast**: Maximum contrast for better visibility
- **Light Mode**: Bright background for daytime use

**Adjust Text Size**
- Small, Medium, Large, or X-Large
- Perfect for accessibility or personal preference

**How to Customize:**
1. Go to Profile Settings (click your avatar)
2. Scroll to "Display Preferences"
3. Select your preferred theme and font size
4. Changes apply instantly

### 👨‍💼 Admin Features

**For Administrators Only**
- New Admin Panel in Profile Settings
- Review pending handle change requests
- Approve or reject with optional feedback
- Real-time notifications

---

## 📱 Improved Mobile Experience

### Better Touch Support
- All buttons now 44px minimum size for easy tapping
- Improved layouts for phones, tablets, and desktops
- Better font rendering across all browsers

### Optimized Breakpoints
- **Phone** (<600px): Full mobile layout
- **Tablet** (600-1024px): Optimized medium screens
- **Desktop** (≥1024px): Full sidebar layout

### Browser Compatibility
- Enhanced support for Chrome, Firefox, and Safari
- Better mobile keyboard handling
- Improved font smoothing and contrast
- Fixed input positioning on mobile devices

---

## 🔒 Security Enhancements

### Safe Content Handling
- All HTML content strictly sanitized
- Only safe image URLs allowed (no scripts)
- Links automatically open in new tabs
- Images load lazily for better performance

### Authorization
- Wave deletion restricted to creators
- Admin actions require admin role
- All preferences validated server-side

---

## 🚀 Getting Started with New Features

### First Time Setup

1. **Update Your Preferences**
   - Visit Profile Settings
   - Try different themes and font sizes
   - Find what works best for you

2. **Try Rich Content**
   - Create a new wave or message
   - Add an emoji using the 😀 button
   - Share an image by pasting a URL

3. **Mobile Users**
   - The app now works better on phones
   - Try the emoji picker with touch
   - Enjoy larger, easier-to-tap buttons

---

## 📊 Technical Details

### Performance
- **Bundle Size**: 60.43 KB gzipped (excellent)
- **Memory Usage**: ~235MB (healthy)
- **Load Time**: No regression from v1.3.1

### Compatibility
- ✅ Chrome (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari (Desktop & Mobile)
- ✅ Edge (Chromium-based)

### API Changes
- **New Endpoints**:
  - `DELETE /api/waves/:id` - Delete a wave
  - `PUT /api/profile/preferences` - Update user preferences
- **New WebSocket Events**:
  - `wave_deleted` - Broadcast when wave is deleted

### Database Schema
- Added `preferences` field to users
  - Default values applied automatically
  - No migration required

---

## 🔄 Upgrading from v1.3.1

### Server Upgrade

```bash
cd server
git pull
npm install  # (if dependencies changed)
npm start
```

### Client Upgrade

```bash
cd client
git pull
npm install  # (if dependencies changed)
npm run build  # For production
npm run dev    # For development
```

### No Breaking Changes
- Existing data fully compatible
- Old clients continue to work
- No database migration needed
- Preferences added automatically

---

## 🐛 Known Issues & Limitations

### Current Limitations
1. **Theme System**: Basic infrastructure in place, full CSS refactoring in v1.3.3
2. **Media Upload**: Only URL embedding supported (file upload in v1.5)
3. **Image Proxy**: Images loaded directly from source (proxy in future version)
4. **GIF Search**: No built-in GIF search (must paste URLs)

### Upcoming in v1.3.3
- Complete theme system implementation
- Additional accessibility themes
- Theme preview feature
- Custom color selection

---

## 📚 Documentation

### Updated Documentation
- **CLAUDE.md**: Complete technical documentation
- **README.md**: User guide and API reference
- **CHANGELOG.md**: Detailed change log

### API Documentation
See README.md for complete API endpoint documentation.

---

## 💬 Support & Feedback

### Getting Help
- **Issues**: Report bugs on GitHub
- **Questions**: Check documentation first
- **Feature Requests**: Submit via GitHub Issues

### Community
- Share your customized themes
- Report compatibility issues
- Suggest new features

---

## 🎯 What's Next

### v1.3.3 - Theme System Polish (Next)
- Full CSS variable refactoring
- Color-blind friendly themes
- Theme creator interface

### v1.4 - Advanced Features (Q1 2026)
- Message reactions
- Typing indicators
- Read receipts
- Wave starring/pinning

### v1.5 - Scale & Organization (Q2 2026)
- Image upload support
- Message search
- Wave filtering
- Virtual scrolling

---

## 🙏 Thank You

Thank you to everyone who provided feedback and helped test v1.3.2!

Special thanks to:
- The Firefly-inspired design community
- Beta testers who reported mobile issues
- Contributors who suggested features

---

## 📋 Quick Reference

### New Keyboard Shortcuts
- **Shift+Enter**: New line in message
- **Enter**: Send message
- **Emoji**: Click 😀 button
- **Media**: Click 🖼️ button

### New UI Elements
- Emoji picker popup
- Media URL input panel
- Delete wave button (creators only)
- Admin panel (admins only)
- Theme selector
- Font size controls

---

**Enjoy Cortex v1.3.2!** 🚀

For technical details, see [CHANGELOG.md](CHANGELOG.md)
For development guide, see [CLAUDE.md](CLAUDE.md)
For user guide, see [README.md](README.md)
