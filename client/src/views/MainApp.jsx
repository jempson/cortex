import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth, useAPI } from '../hooks/useAPI.js';
import { useE2EE } from '../../e2ee-context.jsx';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { VERSION, API_URL, BASE_URL, canAccess, FONT_SIZES } from '../config/constants.js';
import { getRandomTagline } from '../../messages.js';
import { storage } from '../utils/storage.js';
import { updateAppBadge, subscribeToPush } from '../utils/pwa.js';
import { updateDocumentTitle, startFaviconFlash, stopFaviconFlash } from '../utils/favicon.js';
import { getCachedWaveList, cacheWaveList } from '../utils/waveCache.js';
import BottomNav from '../components/ui/BottomNav.jsx';
import { Toast, OfflineIndicator, ScanLines, GlowText } from '../components/ui/SimpleComponents.jsx';
import NotificationBell from '../components/notifications/NotificationBell.jsx';
import CrawlBar from '../components/crawl/CrawlBar.jsx';
import WaveList from '../components/waves/WaveList.jsx';
import NewWaveModal from '../components/waves/NewWaveModal.jsx';
import CategoryManagementModal from '../components/categories/CategoryManagementModal.jsx';
import UserProfileModal from '../components/profile/UserProfileModal.jsx';
import AlertDetailModal from '../components/modals/AlertDetailModal.jsx';
import SearchModal from '../components/search/SearchModal.jsx';
import ContactsView from '../components/contacts/ContactsView.jsx';
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx';
import InstallPrompt from '../components/ui/InstallPrompt.jsx';
import WaveView from '../components/waves/WaveView.jsx';
import FocusView from '../components/focus/FocusView.jsx';
import GroupsView from '../components/groups/GroupsView.jsx';
import ProfileSettings from '../components/profile/ProfileSettings.jsx';
import VideoFeedView from '../components/feed/VideoFeedView.jsx';
import { useVoiceCall } from '../hooks/useVoiceCall.js';
import { initializeCustomTheme, applyCustomTheme, removeCustomTheme, getCurrentCustomTheme } from '../hooks/useTheme.js';
import DockedCallWindow from '../components/calls/DockedCallWindow.jsx';
import WatchPartyPlayer from '../components/media/WatchPartyPlayer.jsx';

function MainApp({ sharePingId }) {
  const { user, token, logout, updateUser } = useAuth();
  const { fetchAPI, isSlowConnection } = useAPI();
  const e2ee = useE2EE();
  const [toast, setToast] = useState(null);

  // Global voice call hook for docked call window (v2.6.1)
  const globalVoiceCall = useVoiceCall(null);

  // Check if this is a pop-out call window
  const urlParams = new URLSearchParams(window.location.search);
  const isPopoutWindow = urlParams.get('popout') === 'true';
  const popoutCallWaveId = urlParams.get('call');

  const [activeView, setActiveView] = useState('waves');
  const [apiConnected, setApiConnected] = useState(false);
  const [waves, setWaves] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedWave, setSelectedWave] = useState(null);
  const [scrollToMessageId, setScrollToMessageId] = useState(null); // Ping to scroll to after wave loads
  const [focusStack, setFocusStack] = useState([]); // Array of { waveId, pingId, ping } for Focus View navigation
  const [showNewWave, setShowNewWave] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [waveReloadTrigger, setWaveReloadTrigger] = useState(0); // Increment to trigger WaveView reload
  const [typingUsers, setTypingUsers] = useState({}); // { waveId: { userId: { name, timestamp } } }
  const [contactRequests, setContactRequests] = useState([]); // Received contact requests
  const [sentContactRequests, setSentContactRequests] = useState([]); // Sent contact requests
  const [groupInvitations, setGroupInvitations] = useState([]); // Received group invitations
  const [blockedUsers, setBlockedUsers] = useState([]); // Users blocked by current user
  const [mutedUsers, setMutedUsers] = useState([]); // Users muted by current user
  const [profileUserId, setProfileUserId] = useState(null); // User ID for profile modal
  const [federationEnabled, setFederationEnabled] = useState(false); // Whether federation is enabled on server
  const [federationRequestsRefresh, setFederationRequestsRefresh] = useState(0); // Increment to refresh federation requests
  const [notificationRefreshTrigger, setNotificationRefreshTrigger] = useState(0); // Increment to refresh notifications
  const [waveNotifications, setWaveNotifications] = useState({}); // Notification counts/types by wave ID
  const [activeCalls, setActiveCalls] = useState({}); // Active calls by wave ID: { waveId: { participantCount, participants } }
  const [selectedAlert, setSelectedAlert] = useState(null); // Alert to show in detail modal
  const [footerTagline, setFooterTagline] = useState(getRandomTagline()); // Rotating Firefly tagline
  const [waveCategories, setWaveCategories] = useState([]); // User's wave categories (v2.2.0)
  const [categoryManagementOpen, setCategoryManagementOpen] = useState(false); // Category management modal (v2.2.0)
  const [activeWatchParties, setActiveWatchParties] = useState({}); // Active watch parties by wave ID (v2.14.0)
  const [watchPartyPlayer, setWatchPartyPlayer] = useState(null); // { waveId, partyId } for open player (v2.14.0)
  const typingTimeoutsRef = useRef({});
  const { width, isMobile, isTablet, isDesktop, hasMeasured } = useWindowSize();

  // Calculate font scale from user preferences
  const fontSizePreference = user?.preferences?.fontSize || 'medium';
  const fontScale = FONT_SIZES[fontSizePreference]?.multiplier || 1;

  // Apply font scaling to the root HTML element so rem units scale properly
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
    return () => {
      document.documentElement.style.fontSize = '100%';
    };
  }, [fontScale]);

  // Apply theme to document root and persist to localStorage
  // v2.11.0: Added custom theme support
  useEffect(() => {
    const theme = user?.preferences?.theme || 'serenity';

    // Check if it's a custom theme (preference starts with "custom-")
    const isCustom = theme.startsWith('custom-');

    if (isCustom) {
      // Extract raw theme ID (remove "custom-" prefix)
      const rawThemeId = theme.replace('custom-', '');

      // Try to get custom theme from localStorage first
      const cachedTheme = getCurrentCustomTheme();
      if (cachedTheme && cachedTheme.id === rawThemeId) {
        applyCustomTheme(cachedTheme);
      } else {
        // Fetch from server if not cached
        fetchAPI(`/themes/${rawThemeId}`).then(themeData => {
          if (themeData && !themeData.error) {
            applyCustomTheme(themeData);
          } else {
            // Fallback to serenity if custom theme not found
            removeCustomTheme('serenity');
          }
        }).catch(() => {
          removeCustomTheme('serenity');
        });
      }
      // Note: applyCustomTheme handles storage.setTheme internally
    } else {
      // Built-in theme - just set the data-theme attribute
      removeCustomTheme(theme); // This clears any custom theme styles and sets the built-in theme
      // Only save to dedicated storage when we have actual user data
      if (user?.preferences?.theme) {
        storage.setTheme(theme);
      }
    }
  }, [user?.preferences?.theme, fetchAPI]);

  // PWA Badge and Tab Notifications - update based on unread count
  useEffect(() => {
    const totalUnread = waves.reduce((sum, w) => sum + (w.unread_count || 0), 0);

    // Debug: Log unread counts per wave
    if (waves.length > 0) {
      const wavesWithUnread = waves.filter(w => w.unread_count > 0);
      console.log(`[Badge] Total unread: ${totalUnread} across ${waves.length} waves (${wavesWithUnread.length} with unread)`);
      if (wavesWithUnread.length > 0 && wavesWithUnread.length <= 5) {
        wavesWithUnread.forEach(w => console.log(`  - "${w.title}": ${w.unread_count} unread`));
      }
    }

    // Update PWA app badge (shows on installed app icon)
    updateAppBadge(totalUnread);

    // Update document title with unread count
    updateDocumentTitle(totalUnread);

    // Handle favicon flashing based on visibility
    const handleVisibilityChange = () => {
      if (document.hidden && totalUnread > 0) {
        startFaviconFlash();
      } else {
        stopFaviconFlash();
      }
    };

    // Initial check
    handleVisibilityChange();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopFaviconFlash();
    };
  }, [waves]);

  // Handle shared ping URL parameter - navigate to the wave containing the ping
  const shareHandledRef = useRef(false);
  useEffect(() => {
    if (sharePingId && user && !shareHandledRef.current) {
      shareHandledRef.current = true; // Prevent duplicate handling
      console.log('[Share] Handling shared ping:', sharePingId);

      fetch(`${API_URL}/share/${sharePingId}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log('[Share] API response:', data);
          if (data.wave?.id) {
            // Navigate to the wave and scroll to the ping
            console.log('[Share] Navigating to wave:', data.wave.id);
            setSelectedWave({ id: data.wave.id, title: data.wave.title });
            setScrollToMessageId(sharePingId);
            setActiveView('waves');
            // Clear the URL (works for both /?share=x and /share/x formats)
            if (window.location.pathname !== '/' || window.location.search) {
              window.history.replaceState({}, '', '/');
            }
          } else if (data.error) {
            setToast({ message: data.error, type: 'error' });
          } else {
            setToast({ message: 'Could not load shared ping', type: 'error' });
          }
        })
        .catch((err) => {
          console.error('[Share] Error:', err);
          setToast({ message: 'Could not find shared ping', type: 'error' });
        });
    }
  }, [sharePingId, user]);

  const showToastMsg = useCallback((message, type) => setToast({ message, type }), []);

  // Debounced loadWaves to prevent multiple simultaneous API calls
  const loadWavesTimerRef = useRef(null);
  const loadWavesInProgressRef = useRef(false);

  // Auto-select wave for popout call windows
  useEffect(() => {
    if (isPopoutWindow && popoutCallWaveId && waves.length > 0 && !selectedWave) {
      const targetWave = waves.find(w => w.id === popoutCallWaveId);
      if (targetWave) {
        console.log('📞 Pop-out call window: Auto-selecting wave', targetWave.title);
        setSelectedWave(targetWave);
      }
    }
  }, [isPopoutWindow, popoutCallWaveId, waves, selectedWave]);

  const loadWaves = useCallback(async () => {
    // Clear any pending debounced call
    if (loadWavesTimerRef.current) {
      clearTimeout(loadWavesTimerRef.current);
      loadWavesTimerRef.current = null;
    }

    // If already loading, debounce this call
    if (loadWavesInProgressRef.current) {
      console.log('🔄 loadWaves already in progress, debouncing...');
      loadWavesTimerRef.current = setTimeout(loadWaves, 300);
      return;
    }

    console.log('🔄 loadWaves called, fetching waves...');
    loadWavesInProgressRef.current = true;

    // Low-bandwidth mode (v2.10.0): Show cached data immediately for faster perceived load
    if (isSlowConnection) {
      try {
        const cachedWaves = await getCachedWaveList(showArchived);
        if (cachedWaves && cachedWaves.length > 0) {
          console.log('🔄 [Cache] Showing cached waves while fetching fresh data...');
          setWaves(cachedWaves);
          setApiConnected(true);
        }
      } catch (cacheError) {
        console.warn('🔄 [Cache] Failed to load cached waves:', cacheError);
      }
    }

    try {
      const data = await fetchAPI(`/waves?archived=${showArchived}`);
      console.log('🔄 loadWaves received', data.length, 'waves');
      // Log unread counts for debugging
      const wavesWithUnread = data.filter(w => w.unread_count > 0);
      if (wavesWithUnread.length > 0) {
        console.log('🔄 Waves with unread:', wavesWithUnread.map(w => `"${w.title}": ${w.unread_count}`).join(', '));
      }
      setWaves(data);
      setApiConnected(true);

      // Cache the fresh data for next time (v2.10.0)
      try {
        cacheWaveList(data, showArchived);
      } catch (cacheError) {
        console.warn('🔄 [Cache] Failed to cache waves:', cacheError);
      }
    } catch (err) {
      console.error('loadWaves failed:', err);
      setApiConnected(false);
    } finally {
      loadWavesInProgressRef.current = false;
    }
  }, [fetchAPI, showArchived, isSlowConnection]);

  // Load wave categories (v2.2.0)
  const loadCategories = useCallback(async () => {
    console.log('📁 loadCategories called');
    try {
      const data = await fetchAPI('/wave-categories');
      console.log('📁 loadCategories received', data.length, 'categories');
      setWaveCategories(data);
    } catch (err) {
      console.error('loadCategories failed:', err);
    }
  }, [fetchAPI]);

  // Handle category toggle (collapse/expand)
  const handleCategoryToggle = useCallback(async (categoryId, collapsed) => {
    try {
      await fetchAPI(`/wave-categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: { collapsed },
      });
      // Update local state immediately for responsiveness
      setWaveCategories(prev => prev.map(cat =>
        cat.id === categoryId ? { ...cat, collapsed } : cat
      ));
    } catch (err) {
      console.error('Failed to toggle category:', err);
    }
  }, [fetchAPI]);

  // Handle wave move between categories (drag-and-drop)
  const handleWaveMove = useCallback(async (waveId, categoryId) => {
    try {
      await fetchAPI(`/waves/${waveId}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: { category_id: categoryId },
      });
      // Reload waves to reflect new category
      loadWaves();
      loadCategories();
    } catch (err) {
      console.error('Failed to move wave:', err);
      showToastMsg('Failed to move wave', 'error');
    }
  }, [fetchAPI, loadWaves, loadCategories, showToastMsg]);

  // Handle wave pin/unpin
  const handleWavePin = useCallback(async (waveId, pinned) => {
    try {
      await fetchAPI(`/waves/${waveId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: { pinned },
      });
      // Update local state immediately
      setWaves(prev => prev.map(w =>
        w.id === waveId ? { ...w, pinned } : w
      ));
    } catch (err) {
      console.error('Failed to pin/unpin wave:', err);
      showToastMsg('Failed to update wave', 'error');
    }
  }, [fetchAPI, showToastMsg]);

  const handleWSMessage = useCallback((data) => {
    // Log ALL incoming WebSocket messages (for debugging)
    if (data.type?.startsWith('call_')) {
      console.log('🔌 [WS] Received message:', data.type, data);
    }

    // Handle ping/wave read events - these are always followed by unread_count_update event
    // Don't call loadWaves() here to avoid duplicate API calls and race conditions
    if (data.type === 'ping_read' || data.type === 'message_read' || data.type === 'wave_read') {
      console.log(`📖 ${data.type} event received, waiting for unread_count_update...`);
      return;
    }

    // Handle both legacy (new_message) and new (new_ping) event names
    if (data.type === 'new_message' || data.type === 'new_ping' || data.type === 'message_edited' || data.type === 'ping_edited' || data.type === 'message_deleted' || data.type === 'ping_deleted' || data.type === 'wave_created' || data.type === 'wave_updated' || data.type === 'message_reaction' || data.type === 'ping_reaction' || data.type === 'wave_invite_received' || data.type === 'wave_broadcast_received') {
      loadWaves();
      // If the event is for the currently viewed wave, trigger a reload
      // Extract waveId from different event structures
      const eventWaveId = data.waveId || data.data?.wave_id || data.data?.waveId;
      if (selectedWave && eventWaveId === selectedWave.id) {
        console.log(`🔄 Reloading wave ${selectedWave.id} due to ${data.type} event`);
        setWaveReloadTrigger(prev => prev + 1);
      }

      // Desktop notifications for new messages/pings
      if ((data.type === 'new_message' || data.type === 'new_ping') && (data.data || data.ping)) {
        // Handle both local (data.data) and federated (data.ping) message structures
        const msgData = data.data || data.ping;
        const authorId = msgData.author_id || msgData.authorId;
        const senderName = msgData.sender_name || msgData.senderName || 'Unknown';
        const content = msgData.content || '';

        const isViewingDifferentWave = !selectedWave || eventWaveId !== selectedWave.id;
        const isBackgrounded = document.visibilityState === 'hidden';
        const isOwnMessage = authorId === user?.id;

        // Show notification if viewing different wave or tab is in background
        if ((isViewingDifferentWave || isBackgrounded) && !isOwnMessage) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const waveName = waves.find(w => w.id === eventWaveId)?.name || 'Unknown Wave';
            const notification = new Notification(`New ping in ${waveName}`, {
              body: `${senderName}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
              icon: '/favicon.ico',
              tag: eventWaveId, // Group notifications by wave
              requireInteraction: false,
            });

            notification.onclick = () => {
              window.focus();
              const wave = waves.find(w => w.id === eventWaveId);
              if (wave) {
                setSelectedWave(wave);
                setActiveView('waves');
              }
              notification.close();
            };
          }
        }
      }
    } else if (data.type === 'wave_deleted') {
      showToastMsg(`Wave "${data.wave?.title || 'Unknown'}" was deleted`, 'info');
      if (selectedWave?.id === data.waveId) {
        setSelectedWave(null);
        setActiveView('waves');
      }
      loadWaves();
    } else if (data.type === 'wave_key_rotated') {
      // E2EE: Wave key was rotated, invalidate cached key
      if (e2ee.isUnlocked && data.waveId) {
        e2ee.invalidateWaveKey(data.waveId);
        // Reload wave if currently viewing it to re-fetch and re-decrypt with new key
        if (selectedWave?.id === data.waveId) {
          setWaveReloadTrigger(prev => prev + 1);
        }
        showToastMsg('Wave encryption key was rotated', 'info');
      }
    } else if (data.type === 'participant_added') {
      // Someone was added to a wave we're in
      if (selectedWave?.id === data.waveId) {
        setWaveReloadTrigger(prev => prev + 1);
      }
      showToastMsg(`${data.participant?.name || 'Someone'} was added to the wave`, 'info');
    } else if (data.type === 'participant_removed') {
      // Someone was removed from a wave we're in
      if (data.userId === user?.id) {
        // We were removed
        if (selectedWave?.id === data.waveId) {
          setSelectedWave(null);
          setActiveView('waves');
        }
        showToastMsg('You were removed from the wave', 'info');
        loadWaves();
      } else {
        // Someone else was removed
        if (selectedWave?.id === data.waveId) {
          setWaveReloadTrigger(prev => prev + 1);
        }
        showToastMsg(data.wasSelf ? 'A participant left the wave' : 'A participant was removed from the wave', 'info');
      }
    } else if (data.type === 'added_to_wave') {
      // We were added to a wave
      showToastMsg(`You were added to "${data.wave?.title || 'a wave'}"`, 'success');
      loadWaves();
    } else if (data.type === 'category_created' || data.type === 'category_updated' || data.type === 'category_deleted' || data.type === 'categories_reordered') {
      // Category management events (v2.2.0)
      console.log(`📁 Category event: ${data.type}`);
      loadCategories();
    } else if (data.type === 'wave_category_changed' || data.type === 'wave_pinned_changed') {
      // Wave organization events (v2.2.0)
      console.log(`📌 Wave organization event: ${data.type}`);
      loadWaves();
      loadCategories();
    } else if (data.type === 'removed_from_wave') {
      // We were removed from a wave (by someone else)
      showToastMsg(`You were removed from "${data.wave?.title || 'a wave'}"`, 'info');
      if (selectedWave?.id === data.wave?.id) {
        setSelectedWave(null);
        setActiveView('waves');
      }
      loadWaves();
    } else if (data.type === 'user_typing') {
      // Handle typing indicator
      const { waveId, userId, userName } = data;

      // Clear existing timeout for this user in this wave
      const timeoutKey = `${waveId}-${userId}`;
      if (typingTimeoutsRef.current[timeoutKey]) {
        clearTimeout(typingTimeoutsRef.current[timeoutKey]);
      }

      // Add user to typing list
      setTypingUsers(prev => ({
        ...prev,
        [waveId]: {
          ...(prev[waveId] || {}),
          [userId]: { name: userName, timestamp: Date.now() }
        }
      }));

      // Remove user after 5 seconds
      typingTimeoutsRef.current[timeoutKey] = setTimeout(() => {
        setTypingUsers(prev => {
          const waveTyping = { ...(prev[waveId] || {}) };
          delete waveTyping[userId];
          return {
            ...prev,
            [waveId]: waveTyping
          };
        });
        delete typingTimeoutsRef.current[timeoutKey];
      }, 5000);
    } else if (data.type === 'contact_request_received') {
      // Someone sent us a contact request
      setContactRequests(prev => [data.request, ...prev]);
      showToastMsg(`${data.request.from_user?.displayName || 'Someone'} sent you a contact request`, 'info');
    } else if (data.type === 'contact_request_accepted') {
      // Our request was accepted
      setSentContactRequests(prev => prev.filter(r => r.id !== data.requestId));
      showToastMsg('Your contact request was accepted!', 'success');
      // Reload contacts since we have a new one
      fetchAPI('/contacts').then(setContacts).catch(console.error);
    } else if (data.type === 'contact_request_declined') {
      // Our request was declined
      setSentContactRequests(prev => prev.filter(r => r.id !== data.requestId));
      showToastMsg('Your contact request was declined', 'info');
    } else if (data.type === 'contact_request_cancelled') {
      // Request to us was cancelled
      setContactRequests(prev => prev.filter(r => r.id !== data.requestId));
    } else if (data.type === 'group_invitation_received') {
      // Someone invited us to a crew
      setGroupInvitations(prev => [data.invitation, ...prev]);
      const crewName = data.invitation.group?.name || 'a crew';
      const inviterName = data.invitation.invited_by_user?.displayName || 'Someone';
      showToastMsg(`${inviterName} invited you to join ${crewName}`, 'info');
    } else if (data.type === 'group_invitation_accepted') {
      // Our invitation was accepted - reload crews since someone joined
      showToastMsg('Your crew invitation was accepted!', 'success');
      fetchAPI('/groups').then(setGroups).catch(console.error);
    } else if (data.type === 'group_invitation_declined') {
      // Our invitation was declined
      showToastMsg('Your crew invitation was declined', 'info');
    } else if (data.type === 'group_invitation_cancelled') {
      // Invitation to us was cancelled
      setGroupInvitations(prev => prev.filter(i => i.id !== data.invitationId));
    } else if (data.type === 'notification') {
      // New notification received - refresh wave notification badges
      console.log('🔔 New notification:', data.notification?.type);
      setNotificationRefreshTrigger(prev => prev + 1);
      // Reload wave notifications for updated badges
      fetchAPI('/notifications/by-wave').then(result => {
        setWaveNotifications(result.countsByWave || {});
      }).catch(e => console.error('Failed to update wave notifications:', e));
    } else if (data.type === 'unread_count_update') {
      // Notification count changed - refresh wave notification badges and wave list
      console.log('🔔 Notification count updated');
      setNotificationRefreshTrigger(prev => prev + 1);
      // Reload wave notifications for updated badges
      fetchAPI('/notifications/by-wave').then(result => {
        setWaveNotifications(result.countsByWave || {});
      }).catch(e => console.error('Failed to update wave notifications:', e));
      // Also refresh wave list to update unread counts
      loadWaves();
    } else if (data.type === 'federation_request_received') {
      // New federation request received (admin only)
      console.log('📨 Federation request received:', data.request?.fromNodeName);
      setFederationRequestsRefresh(prev => prev + 1);
      if (user?.isAdmin) {
        showToastMsg(`Federation request from ${data.request?.fromNodeName || 'unknown server'}`, 'info');
      }
    } else if (data.type === 'watch_party_created' || data.type === 'watch_party_started') {
      // Watch party started in a wave (v2.14.0)
      const party = data.party || data;
      console.log('🎬 Watch party created/started:', party);
      setActiveWatchParties(prev => ({
        ...prev,
        [party.waveId]: party
      }));
      if (party.hostId !== user?.id) {
        showToastMsg(`${party.hostName || 'Someone'} started a watch party`, 'info');
      }
    } else if (data.type === 'watch_party_ended') {
      // Watch party ended (v2.14.0)
      const { waveId, partyId } = data;
      console.log('🎬 Watch party ended:', partyId);
      setActiveWatchParties(prev => {
        const next = { ...prev };
        delete next[waveId];
        return next;
      });
      // Close player if it was open for this party
      if (watchPartyPlayer?.partyId === partyId) {
        setWatchPartyPlayer(null);
        showToastMsg('Watch party ended', 'info');
      }
    } else if (data.type === 'watch_party_sync') {
      // Watch party playback state sync (v2.14.0)
      const { waveId, state, position, timestamp } = data;
      console.log('🎬 Watch party sync:', state, position);
      setActiveWatchParties(prev => ({
        ...prev,
        [waveId]: prev[waveId] ? { ...prev[waveId], state, position, lastSync: timestamp } : prev[waveId]
      }));
    } else if (data.type === 'watch_party_participant_joined' || data.type === 'watch_party_participant_left') {
      // Watch party participant change (v2.14.0)
      const { waveId, participants, userName } = data;
      console.log(`🎬 Watch party participant ${data.type === 'watch_party_participant_joined' ? 'joined' : 'left'}:`, userName);
      setActiveWatchParties(prev => ({
        ...prev,
        [waveId]: prev[waveId] ? { ...prev[waveId], participants } : prev[waveId]
      }));
    }
  }, [loadWaves, selectedWave, showToastMsg, user, waves, setSelectedWave, setActiveView, fetchAPI, watchPartyPlayer]);

  const { connected: wsConnected, sendMessage: sendWSMessage } = useWebSocket(token, handleWSMessage);

  const loadContacts = useCallback(async () => {
    try { setContacts(await fetchAPI('/contacts')); } catch (e) { console.error(e); }
  }, [fetchAPI]);

  const loadGroups = useCallback(async () => {
    try { setGroups(await fetchAPI('/groups')); } catch (e) { console.error(e); }
  }, [fetchAPI]);

  const loadContactRequests = useCallback(async () => {
    try {
      const [received, sent] = await Promise.all([
        fetchAPI('/contacts/requests'),
        fetchAPI('/contacts/requests/sent')
      ]);
      setContactRequests(received);
      setSentContactRequests(sent);
    } catch (e) { console.error('Failed to load contact requests:', e); }
  }, [fetchAPI]);

  const loadGroupInvitations = useCallback(async () => {
    try {
      const invitations = await fetchAPI('/groups/invitations');
      setGroupInvitations(invitations);
    } catch (e) { console.error('Failed to load group invitations:', e); }
  }, [fetchAPI]);

  const loadWaveNotifications = useCallback(async () => {
    try {
      const data = await fetchAPI('/notifications/by-wave');
      setWaveNotifications(data.countsByWave || {});
    } catch (e) { console.error('Failed to load wave notifications:', e); }
  }, [fetchAPI]);

  const loadActiveCalls = useCallback(async () => {
    try {
      const data = await fetchAPI('/waves/active-calls');
      const callsMap = {};
      (data.calls || []).forEach(call => {
        callsMap[call.waveId] = {
          participantCount: call.participantCount,
          participants: call.participants
        };
      });
      setActiveCalls(callsMap);
    } catch (e) { console.error('Failed to load active calls:', e); }
  }, [fetchAPI]);

  const loadBlockedMutedUsers = useCallback(async () => {
    try {
      const [blockedData, mutedData] = await Promise.all([
        fetchAPI('/users/blocked'),
        fetchAPI('/users/muted')
      ]);
      setBlockedUsers(blockedData.blockedUsers || []);
      setMutedUsers(mutedData.mutedUsers || []);
    } catch (e) { console.error('Failed to load blocked/muted users:', e); }
  }, [fetchAPI]);

  const handleBlockUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/block`, { method: 'POST' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to block user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  const handleUnblockUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/block`, { method: 'DELETE' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to unblock user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  const handleMuteUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/mute`, { method: 'POST' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to mute user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  const handleUnmuteUser = useCallback(async (userId) => {
    try {
      await fetchAPI(`/users/${userId}/mute`, { method: 'DELETE' });
      loadBlockedMutedUsers();
      return true;
    } catch (e) {
      console.error('Failed to unmute user:', e);
      return false;
    }
  }, [fetchAPI, loadBlockedMutedUsers]);

  // Watch party handlers (v2.14.0)
  const loadActiveWatchParties = useCallback(async () => {
    try {
      const data = await fetchAPI('/jellyfin/watch-parties/active');
      const partiesMap = {};
      (data.parties || []).forEach(party => {
        partiesMap[party.waveId] = party;
      });
      setActiveWatchParties(partiesMap);
    } catch (e) {
      // Jellyfin might not be configured - ignore
      console.log('Watch parties not available:', e.message);
    }
  }, [fetchAPI]);

  const handleJoinWatchParty = useCallback(async (waveId, partyId) => {
    try {
      await fetchAPI(`/jellyfin/watch-parties/${partyId}/join`, { method: 'POST' });
      // Open the player after joining
      setWatchPartyPlayer({ waveId, partyId });
    } catch (e) {
      console.error('Failed to join watch party:', e);
      showToastMsg(e.message || 'Failed to join watch party', 'error');
    }
  }, [fetchAPI, showToastMsg]);

  const handleLeaveWatchParty = useCallback(async (partyId) => {
    try {
      await fetchAPI(`/jellyfin/watch-parties/${partyId}/leave`, { method: 'POST' });
      setWatchPartyPlayer(null);
    } catch (e) {
      console.error('Failed to leave watch party:', e);
      showToastMsg(e.message || 'Failed to leave watch party', 'error');
    }
  }, [fetchAPI, showToastMsg]);

  const handleOpenWatchParty = useCallback((waveId, partyId) => {
    setWatchPartyPlayer({ waveId, partyId });
  }, []);

  const handleCloseWatchPartyPlayer = useCallback(() => {
    setWatchPartyPlayer(null);
  }, []);

  // Dismiss alert handler
  const handleDismissAlert = useCallback(async (alertId) => {
    try {
      await fetchAPI(`/alerts/${alertId}/dismiss`, { method: 'POST' });
      // The crawl bar will refresh on its own interval, but we can show a toast
      showToastMsg('Alert dismissed', 'success');
    } catch (e) {
      console.error('Failed to dismiss alert:', e);
      showToastMsg('Failed to dismiss alert', 'error');
    }
  }, [fetchAPI, showToastMsg]);

  // Focus View handlers
  const handleFocusPing = useCallback((waveId, ping) => {
    // Prevent focusing on the same ping that's already on the stack
    setFocusStack(prev => {
      const lastFocused = prev[prev.length - 1];
      if (lastFocused?.pingId === ping.id) {
        return prev; // Already focused on this ping
      }
      return [...prev, { waveId, pingId: ping.id, ping }];
    });
  }, []);

  const handleFocusBack = useCallback(() => {
    // Pop the last item from the focus stack
    setFocusStack(prev => prev.slice(0, -1));
  }, []);

  const handleFocusClose = useCallback(() => {
    // When closing focus view, scroll WaveView to the originally focused ping
    setFocusStack(prev => {
      if (prev.length > 0) {
        // Set scroll target to the first focused ping so WaveView scrolls to it
        setScrollToMessageId(prev[0].pingId);
      }
      return [];
    });
  }, []);

  const handleFocusDeeper = useCallback((ping) => {
    // Focus on a child ping within the current focus view
    setFocusStack(prev => {
      if (prev.length === 0) return prev;

      // Prevent focusing on the same ping that's already focused
      const lastFocused = prev[prev.length - 1];
      if (lastFocused?.pingId === ping.id) {
        return prev; // Already focused on this ping
      }

      const currentWaveId = lastFocused.waveId;
      return [...prev, { waveId: currentWaveId, pingId: ping.id, ping }];
    });
  }, []);

  // Navigate to a different wave (used after breakout)
  const handleNavigateToWave = useCallback((wave) => {
    // Clear focus stack and navigate to the new wave
    setFocusStack([]);
    setSelectedWave(wave);
    setActiveView('waves');
    // Reload waves to include the new one
    loadWaves();
  }, [loadWaves]);

  // Navigate to a wave by ID (used by notifications)
  const handleNavigateToWaveById = useCallback(async (waveId, pingId) => {
    try {
      // Fetch the wave if we don't have it
      let wave = waves.find(w => w.id === waveId);
      if (!wave) {
        wave = await fetchAPI(`/waves/${waveId}`);
      }
      if (wave) {
        setFocusStack([]);
        setSelectedWave(wave);
        setActiveView('waves');

        // If pingId provided, mark it as read and set it for WaveView to scroll to
        if (pingId) {
          // Mark the ping as read since user is navigating to it
          try {
            await fetchAPI(`/pings/${pingId}/read`, { method: 'POST' });
            // Refresh wave list to update unread counts
            loadWaves();
          } catch (e) {
            // Ignore errors - ping might not exist or already read
          }

          // Set the target ping for WaveView to scroll to after loading
          setScrollToMessageId(pingId);
        }
      }
    } catch (err) {
      console.error('Failed to navigate to wave:', err);
    }
  }, [waves, fetchAPI, loadWaves]);

  useEffect(() => {
    loadWaves();
    loadCategories();
    loadContacts();
    loadGroups();
    loadContactRequests();
    loadGroupInvitations();
    loadBlockedMutedUsers();
    loadWaveNotifications();
    loadActiveCalls();
    loadActiveWatchParties();
    // Check if federation is enabled (public endpoint returns 404 if disabled)
    fetch(`${API_URL}/federation/identity`)
      .then(res => setFederationEnabled(res.ok))
      .catch(() => setFederationEnabled(false));
  }, [loadWaves, loadCategories, loadContacts, loadGroups, loadContactRequests, loadGroupInvitations, loadBlockedMutedUsers, loadWaveNotifications, loadActiveCalls, loadActiveWatchParties]);

  // Poll active calls every 10 seconds (v2.5.0 - call indicators in wave list)
  useEffect(() => {
    const interval = setInterval(() => {
      loadActiveCalls();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadActiveCalls]);

  // Rotate footer tagline every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFooterTagline(getRandomTagline());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Listen for service worker messages (push notification clicks)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event) => {
      if (event.data?.type === 'navigate-to-wave') {
        console.log('[SW] Received navigate-to-wave:', event.data);
        const { waveId, pingId } = event.data;
        if (waveId) {
          handleNavigateToWaveById(waveId, pingId);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [handleNavigateToWaveById]);

  // Request notification permission and set up push on first load
  useEffect(() => {
    const token = storage.getToken();
    if (!token) return;

    const setupPushNotifications = async () => {
      // Check if user has push enabled
      if (!storage.getPushEnabled()) {
        console.log('[Push] Push notifications disabled by user');
        return;
      }

      // Request notification permission if not yet granted
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('❌ Desktop notifications denied');
          return;
        }
        console.log('✅ Desktop notifications enabled');
      }

      // If permission granted, subscribe to push (silently fail on startup)
      if ('Notification' in window && Notification.permission === 'granted') {
        const result = await subscribeToPush(token);
        if (!result.success) {
          // Don't show error toast on auto-subscribe - user didn't initiate it
          console.log('[Push] Auto-subscribe failed (this is ok):', result.reason);
        }
      }
    };

    // Delay to avoid interrupting initial page load
    const timer = setTimeout(setupPushNotifications, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleCreateWave = async (data) => {
    try {
      // E2EE disabled for new waves - always create unencrypted
      // Previous behavior: if (e2ee.isUnlocked && e2ee.isE2EEEnabled) { create encrypted }
      // New default: all waves are unencrypted
      await fetchAPI('/waves', { method: 'POST', body: data });
      showToastMsg('Wave created', 'success');
      loadWaves();
    } catch (err) {
      console.error('Failed to create wave:', err);
      showToastMsg(err.message || 'Failed to create wave', 'error');
    }
  };

  const handleSearchResultClick = (result) => {
    // Find the wave and open it
    const wave = waves.find(w => w.id === result.waveId);
    if (wave) {
      setSelectedWave(wave);
      setScrollToMessageId(result.id);
      setActiveView('waves');
      setShowSearch(false);
    } else {
      showToastMsg('Wave not found or not accessible', 'error');
    }
  };

  const navItems = ['waves', 'feed', 'contacts', 'groups', 'profile'];
  const navLabels = { waves: 'WAVES', feed: 'FEED', groups: 'CREWS', contacts: 'CONTACTS', profile: 'PROFILE' };

  const scanLinesEnabled = user?.preferences?.scanLines !== false; // Default to true

  if (!hasMeasured) {
    return (
      <div style={{ height: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: "'Courier New', monospace" }}>
        Initializing...
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh', background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
      fontFamily: "'Courier New', monospace", color: 'var(--text-primary)',
      display: 'flex', flexDirection: 'column',
    }}>
      <ScanLines enabled={scanLinesEnabled} />
      <style>{`
        .message-media {
          max-width: 100%;
          max-height: 400px;
          height: auto;
          border: 1px solid var(--border-subtle);
          border-radius: 2px;
          margin: 8px 0;
          display: block;
        }
        /* Search result highlighting */
        mark {
          background: var(--accent-amber)40;
          color: var(--accent-amber);
          font-weight: bold;
          padding: 0 2px;
          border-radius: 2px;
        }
        /* Thread navigation highlight animation */
        @keyframes highlight-pulse {
          0%, 100% { border-color: var(--accent-amber); box-shadow: 0 0 0 0 rgba(255, 210, 63, 0.7); }
          50% { border-color: #ffed4e; box-shadow: 0 0 20px 4px rgba(255, 210, 63, 0.4); }
        }
        .highlight-flash > div {
          animation: highlight-pulse 1.5s ease-out;
          border-left-width: 4px !important;
        }
        /* Thread visual connectors */
        .thread-connector {
          position: relative;
        }
        .thread-connector::before {
          content: '';
          position: absolute;
          left: -12px;
          top: 0;
          bottom: 0;
          width: 1px;
          border-left: 1px dashed var(--border-subtle);
        }
        .thread-connector::after {
          content: '';
          position: absolute;
          left: -12px;
          top: 20px;
          width: 12px;
          height: 1px;
          border-top: 1px dashed var(--border-subtle);
        }
        /* Mobile thread connectors - thinner lines and smaller indent */
        @media (max-width: 768px) {
          .thread-connector::before {
            left: -8px;
          }
          .thread-connector::after {
            left: -8px;
            width: 8px;
          }
        }
        /* Font scaling: base font size is set on root div and scales all content */
        /* Elements with explicit fontSize will maintain their relative proportions */
      `}</style>

      {/* Header */}
      <header style={{
        padding: isMobile ? '8px 10px' : '12px 24px',
        paddingTop: isMobile ? 'calc(8px + env(safe-area-inset-top, 0px))' : '12px',
        borderBottom: '2px solid var(--accent-amber)40',
        background: 'linear-gradient(90deg, var(--bg-surface), var(--bg-hover), var(--bg-surface))',
        display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px',
      }}>
        {/* Logo and Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <GlowText color="var(--accent-amber)" size={isMobile ? '1.2rem' : '1.5rem'} weight={700}>CORTEX</GlowText>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>v{VERSION}</span>
          </div>
          {/* Status indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', fontSize: '0.55rem', fontFamily: 'monospace' }}>
            <span style={{ color: 'var(--text-muted)' }}><span style={{ color: 'var(--accent-green)' }}>●</span> ENC</span>
            <span style={{ color: 'var(--text-muted)' }}><span style={{ color: apiConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> API</span>
            <span style={{ color: 'var(--text-muted)' }}><span style={{ color: wsConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> WS</span>
          </div>
        </div>

        {/* Mobile: Spacer + Notifications + Search */}
        {isMobile && (
          <>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <NotificationBell
                fetchAPI={fetchAPI}
                onNavigateToWave={handleNavigateToWaveById}
                isMobile={true}
                refreshTrigger={notificationRefreshTrigger}
              />
              <button
                onClick={() => setShowSearch(true)}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  border: '1px solid var(--accent-teal)',
                  color: 'var(--accent-teal)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                }}
                title="Search messages"
              >
                🔍
              </button>
            </div>
          </>
        )}

        {/* Nav Items - grows to fill space - hidden on mobile (using bottom nav instead) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
            {navItems.map(view => {
              const totalUnread = view === 'waves' ? waves.reduce((sum, w) => sum + (w.unread_count || 0), 0) : 0;
              const pendingRequests = view === 'contacts' ? contactRequests.length : 0;
              const pendingInvitations = view === 'groups' ? groupInvitations.length : 0;
              const badgeCount = totalUnread || pendingRequests || pendingInvitations;
              return (
                <button key={view} onClick={() => { setActiveView(view); setSelectedWave(null); loadWaves(); loadWaveNotifications(); }} style={{
                  padding: '8px 16px',
                  background: activeView === view ? 'var(--accent-amber)15' : 'transparent',
                  border: `1px solid ${activeView === view ? 'var(--accent-amber)50' : 'var(--border-primary)'}`,
                  color: activeView === view ? 'var(--accent-amber)' : 'var(--text-dim)',
                  cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem', textTransform: 'uppercase',
                  position: 'relative',
                }}>
                  {navLabels[view] || view}
                  {badgeCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: pendingRequests > 0 ? 'var(--accent-teal)' : pendingInvitations > 0 ? 'var(--accent-amber)' : 'var(--accent-orange)',
                      color: pendingInvitations > 0 && !pendingRequests ? '#000' : '#fff',
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      padding: '2px 4px',
                      borderRadius: '10px',
                      minWidth: '16px',
                      textAlign: 'center',
                      boxShadow: pendingRequests > 0 ? '0 0 8px rgba(59, 206, 172, 0.8)' : pendingInvitations > 0 ? '0 0 8px rgba(255, 210, 63, 0.8)' : '0 0 8px rgba(255, 107, 53, 0.8)',
                    }}>{badgeCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Notifications, Search and User - desktop only */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <NotificationBell
              fetchAPI={fetchAPI}
              onNavigateToWave={handleNavigateToWaveById}
              isMobile={false}
              refreshTrigger={notificationRefreshTrigger}
            />
            <button
              onClick={() => setShowSearch(true)}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid var(--accent-teal)',
                color: 'var(--accent-teal)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
              }}
              title="Search messages"
            >
              🔍
            </button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem' }}>{user?.displayName}</div>
            </div>
          </div>
        )}
      </header>

      {/* Crawl Bar */}
      {user && (
        <CrawlBar
          fetchAPI={fetchAPI}
          enabled={user?.preferences?.crawlBar?.enabled !== false}
          userPrefs={user?.preferences?.crawlBar || {}}
          isMobile={isMobile}
          onAlertClick={setSelectedAlert}
        />
      )}

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: isMobile && selectedWave ? 'column' : 'row', paddingBottom: isMobile ? '60px' : '0' }}>
        {activeView === 'waves' && (
          <>
            {(!isMobile || !selectedWave) && (
              <WaveList
                waves={waves}
                categories={waveCategories}
                selectedWave={selectedWave}
                onSelectWave={setSelectedWave}
                onNewWave={() => setShowNewWave(true)}
                showArchived={showArchived}
                onToggleArchived={() => { setShowArchived(!showArchived); loadWaves(); }}
                isMobile={isMobile}
                waveNotifications={waveNotifications}
                activeCalls={activeCalls}
                onCategoryToggle={handleCategoryToggle}
                onWaveMove={handleWaveMove}
                onWavePin={handleWavePin}
                onManageCategories={() => setCategoryManagementOpen(true)}
              />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
              {selectedWave && focusStack.length > 0 ? (
                // Focus View - showing focused ping and its replies
                <ErrorBoundary key={`focus-${focusStack[focusStack.length - 1]?.pingId}`}>
                  <FocusView
                    wave={selectedWave}
                    focusStack={focusStack}
                    onBack={handleFocusBack}
                    onClose={handleFocusClose}
                    onFocusDeeper={handleFocusDeeper}
                    fetchAPI={fetchAPI}
                    showToast={showToastMsg}
                    currentUser={user}
                    isMobile={isMobile}
                    sendWSMessage={sendWSMessage}
                    typingUsers={typingUsers[selectedWave?.id] || {}}
                    reloadTrigger={waveReloadTrigger}
                    onShowProfile={setProfileUserId}
                    blockedUsers={blockedUsers}
                    mutedUsers={mutedUsers}
                    contacts={contacts}
                    onWaveUpdate={loadWaves}
                  />
                </ErrorBoundary>
              ) : selectedWave ? (
                // Normal Wave View
                <ErrorBoundary key={selectedWave.id}>
                  <WaveView wave={selectedWave} onBack={() => { setSelectedWave(null); setFocusStack([]); loadWaves(); loadWaveNotifications(); }}
                    fetchAPI={fetchAPI} showToast={showToastMsg} currentUser={user}
                    groups={groups} onWaveUpdate={loadWaves} isMobile={isMobile}
                    sendWSMessage={sendWSMessage}
                    typingUsers={typingUsers[selectedWave?.id] || {}}
                    reloadTrigger={waveReloadTrigger}
                    contacts={contacts}
                    contactRequests={contactRequests}
                    sentContactRequests={sentContactRequests}
                    onRequestsChange={loadContactRequests}
                    onContactsChange={loadContacts}
                    blockedUsers={blockedUsers}
                    mutedUsers={mutedUsers}
                    onBlockUser={handleBlockUser}
                    onUnblockUser={handleUnblockUser}
                    onMuteUser={handleMuteUser}
                    onUnmuteUser={handleUnmuteUser}
                    onBlockedMutedChange={loadBlockedMutedUsers}
                    onShowProfile={setProfileUserId}
                    onFocusPing={handleFocusPing}
                    onNavigateToWave={handleNavigateToWave}
                    scrollToMessageId={scrollToMessageId}
                    onScrollToMessageComplete={() => setScrollToMessageId(null)}
                    federationEnabled={federationEnabled}
                    activeWatchParty={activeWatchParties[selectedWave?.id]}
                    onJoinWatchParty={(partyId) => handleJoinWatchParty(selectedWave?.id, partyId)}
                    onLeaveWatchParty={handleLeaveWatchParty}
                    onOpenWatchParty={(partyId) => handleOpenWatchParty(selectedWave?.id, partyId)}
                    onWatchPartiesChange={loadActiveWatchParties} />
                </ErrorBoundary>
              ) : !isMobile && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--border-primary)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '16px' }}>◎</div>
                    <div>Select a wave or create a new one</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeView === 'feed' && (
          <VideoFeedView
            fetchAPI={fetchAPI}
            showToast={showToastMsg}
            onNavigateToWave={(wave) => {
              setSelectedWave(wave);
              setActiveView('waves');
            }}
            onShowProfile={setProfileUserId}
            isMobile={isMobile}
            currentUser={user}
          />
        )}

        {activeView === 'groups' && (
          <GroupsView
            groups={groups}
            fetchAPI={fetchAPI}
            showToast={showToastMsg}
            onGroupsChange={loadGroups}
            groupInvitations={groupInvitations}
            onInvitationsChange={loadGroupInvitations}
            contacts={contacts}
          />
        )}

        {activeView === 'contacts' && (
          <ContactsView
            contacts={contacts}
            fetchAPI={fetchAPI}
            showToast={showToastMsg}
            onContactsChange={loadContacts}
            contactRequests={contactRequests}
            sentContactRequests={sentContactRequests}
            onRequestsChange={loadContactRequests}
            onShowProfile={setProfileUserId}
          />
        )}

        {activeView === 'profile' && (
          <ProfileSettings user={user} fetchAPI={fetchAPI} showToast={showToastMsg} onUserUpdate={updateUser} onLogout={logout} federationRequestsRefresh={federationRequestsRefresh} />
        )}
      </main>

      {/* Footer - hidden on mobile (using bottom nav instead) */}
      {!isMobile && (
        <footer style={{
          padding: '8px 8px', background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', fontFamily: 'monospace', flexWrap: 'wrap', gap: '4px',
        }}>
          <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--border-primary)' }}>v{VERSION}</span>
            <span><span style={{ color: 'var(--accent-green)' }}>●</span> ENCRYPTED</span>
            <span><span style={{ color: apiConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> API</span>
            <span><span style={{ color: wsConnected ? 'var(--accent-green)' : 'var(--accent-orange)' }}>●</span> LIVE</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{footerTagline}</div>
        </footer>
      )}

      {/* Bottom Navigation - mobile only */}
      {isMobile && (
        <BottomNav
          activeView={activeView}
          onNavigate={(view) => {
            if (view === 'search') {
              setShowSearch(true);
            } else {
              setActiveView(view);
              setSelectedWave(null);
              loadWaves();
              loadWaveNotifications();
            }
          }}
          unreadCount={waves.reduce((sum, w) => sum + (w.unread_count || 0), 0)}
          pendingContacts={contactRequests.length}
          pendingGroups={groupInvitations.length}
        />
      )}

      <NewWaveModal isOpen={showNewWave} onClose={() => setShowNewWave(false)}
        onCreate={handleCreateWave} contacts={contacts} groups={groups} federationEnabled={federationEnabled} />

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          fetchAPI={fetchAPI}
          showToast={showToastMsg}
          onSelectMessage={handleSearchResultClick}
          isMobile={isMobile}
        />
      )}

      <CategoryManagementModal
        isOpen={categoryManagementOpen}
        onClose={() => setCategoryManagementOpen(false)}
        categories={waveCategories}
        fetchAPI={fetchAPI}
        showToast={showToastMsg}
        onCategoriesChange={loadCategories}
        isMobile={isMobile}
      />

      <UserProfileModal
        isOpen={!!profileUserId}
        onClose={() => setProfileUserId(null)}
        userId={profileUserId}
        currentUser={user}
        fetchAPI={fetchAPI}
        showToast={showToastMsg}
        contacts={contacts}
        blockedUsers={blockedUsers}
        mutedUsers={mutedUsers}
        onAddContact={async (userId, name) => {
          try {
            await fetchAPI('/contacts/request', { method: 'POST', body: { toUserId: userId } });
            showToastMsg(`Contact request sent to ${name}`, 'success');
            loadContactRequests();
          } catch (e) {
            showToastMsg(e.message || 'Failed to send contact request', 'error');
          }
        }}
        onBlock={async (userId, name) => {
          if (await handleBlockUser(userId)) {
            showToastMsg(`Blocked ${name}`, 'success');
          }
        }}
        onMute={async (userId, name) => {
          if (await handleMuteUser(userId)) {
            showToastMsg(`Muted ${name}`, 'success');
          }
        }}
        onFollow={async (userId, name) => {
          try {
            await fetchAPI('/contacts/follow', { method: 'POST', body: { userId } });
            showToastMsg(`Now following ${name}`, 'success');
            loadContacts();
          } catch (e) {
            showToastMsg(e.message || 'Failed to follow user', 'error');
          }
        }}
        onUnfollow={async (userId, name) => {
          try {
            await fetchAPI(`/contacts/follow/${userId}`, { method: 'DELETE' });
            showToastMsg(`Unfollowed ${name}`, 'success');
            loadContacts();
          } catch (e) {
            showToastMsg(e.message || 'Failed to unfollow user', 'error');
          }
        }}
        isMobile={isMobile}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Alert Detail Modal */}
      <AlertDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onDismiss={handleDismissAlert}
        isMobile={isMobile}
      />

      {/* PWA Components */}
      <OfflineIndicator />
      <InstallPrompt isMobile={isMobile} />

      {/* Docked Call Window - persists across navigation (v2.6.1) */}
      {globalVoiceCall.connectionState !== 'disconnected' && (
        <DockedCallWindow
          voiceCall={globalVoiceCall}
          isMobile={isMobile}
          user={user}
        />
      )}

      {/* Watch Party Player Modal (v2.14.0) */}
      {watchPartyPlayer && (
        <WatchPartyPlayer
          partyId={watchPartyPlayer.partyId}
          waveId={watchPartyPlayer.waveId}
          fetchAPI={fetchAPI}
          sendWSMessage={sendWSMessage}
          currentUser={user}
          onClose={handleCloseWatchPartyPlayer}
          onLeave={() => handleLeaveWatchParty(watchPartyPlayer.partyId)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

// ============ PUBLIC DROPLET VIEW (for shared links) ============
export default MainApp;
