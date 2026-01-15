import React, { useState, useEffect } from 'react';
import { LOADING } from '../../../messages.js';
import { GlowText, Avatar } from '../ui/SimpleComponents.jsx';

const UserProfileModal = ({ isOpen, onClose, userId, currentUser, fetchAPI, showToast, contacts, blockedUsers, mutedUsers, onAddContact, onBlock, onMute, onFollow, onUnfollow, isMobile }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      setLoading(true);
      fetchAPI(`/users/${userId}/profile`)
        .then(data => setProfile(data))
        .catch(err => {
          console.error('Failed to load profile:', err);
          showToast('Failed to load profile', 'error');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, userId, fetchAPI, showToast]);

  if (!isOpen) return null;

  const isCurrentUser = userId === currentUser?.id;
  const isContact = contacts?.some(c => c.id === userId);
  const isFollowing = contacts?.some(c => c.id === userId && c.isRemote);
  const isBlocked = blockedUsers?.some(u => u.blockedUserId === userId);
  const isMuted = mutedUsers?.some(u => u.mutedUserId === userId);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '1px solid var(--border-subtle)', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>{LOADING.generic}</div>
        ) : profile ? (
          <>
            {/* Header with close button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <GlowText color="var(--accent-amber)" size={isMobile ? '1rem' : '1.1rem'}>User Profile</GlowText>
              <button onClick={onClose} style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
              }}>✕</button>
            </div>

            {/* Federated user indicator */}
            {profile.isRemote && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                marginBottom: '16px', padding: '8px 12px',
                background: 'var(--accent-purple)15', border: '1px solid var(--accent-purple)50',
                fontSize: '0.75rem', color: 'var(--accent-purple)',
              }}>
                <span>◇</span>
                <span>Federated User from <strong>{profile.nodeName}</strong></span>
              </div>
            )}

            {/* Avatar and basic info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <Avatar letter={profile.avatar || profile.displayName?.[0] || '?'} color={profile.isRemote ? 'var(--accent-purple)' : 'var(--accent-amber)'} size={80} imageUrl={profile.avatarUrl} />
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 600 }}>{profile.displayName}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  @{profile.handle}{profile.isRemote && <span style={{ color: 'var(--accent-purple)' }}>@{profile.nodeName}</span>}
                </div>
                <div style={{ color: 'var(--border-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>
                  {profile.isRemote ? `Cached ${formatDate(profile.createdAt)}` : `Joined ${formatDate(profile.createdAt)}`}
                </div>
              </div>
            </div>

            {/* Bio section */}
            {profile.bio && (
              <div style={{
                marginBottom: '20px', padding: '16px',
                background: 'var(--bg-elevated)', border: '1px solid var(--bg-hover)',
              }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginBottom: '8px' }}>ABOUT</div>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {profile.bio}
                </div>
              </div>
            )}

            {/* Action buttons (not shown for current user or federated users) */}
            {!isCurrentUser && !profile.isRemote && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!isContact && !isBlocked && onAddContact && (
                  <button onClick={() => { onAddContact(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-green)20', border: '1px solid var(--accent-green)',
                    color: 'var(--accent-green)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>+ ADD CONTACT</button>
                )}
                {isContact && (
                  <div style={{ color: 'var(--accent-green)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-green)10', border: '1px solid var(--accent-green)40' }}>
                    ✓ Contact
                  </div>
                )}
                {!isBlocked && onBlock && (
                  <button onClick={() => { onBlock(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-orange)',
                    color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>BLOCK</button>
                )}
                {isBlocked && (
                  <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)40' }}>
                    Blocked
                  </div>
                )}
                {!isMuted && !isBlocked && onMute && (
                  <button onClick={() => { onMute(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-amber)',
                    color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>MUTE</button>
                )}
                {isMuted && (
                  <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-amber)10', border: '1px solid var(--accent-amber)40' }}>
                    Muted
                  </div>
                )}
              </div>
            )}

            {/* Action buttons for federated users */}
            {!isCurrentUser && profile.isRemote && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!isFollowing && !isBlocked && onFollow && (
                  <button onClick={() => { onFollow(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-purple)20', border: '1px solid var(--accent-purple)',
                    color: 'var(--accent-purple)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>◇ FOLLOW</button>
                )}
                {isFollowing && onUnfollow && (
                  <button onClick={() => { onUnfollow(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'var(--accent-purple)10', border: '1px solid var(--accent-purple)40',
                    color: 'var(--accent-purple)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>✓ FOLLOWING</button>
                )}
                {!isBlocked && onBlock && (
                  <button onClick={() => { onBlock(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-orange)',
                    color: 'var(--accent-orange)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>BLOCK</button>
                )}
                {isBlocked && (
                  <div style={{ color: 'var(--accent-orange)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)40' }}>
                    Blocked
                  </div>
                )}
                {!isMuted && !isBlocked && onMute && (
                  <button onClick={() => { onMute(userId, profile.displayName); onClose(); }} style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    background: 'transparent', border: '1px solid var(--accent-amber)',
                    color: 'var(--accent-amber)', cursor: 'pointer', fontFamily: 'monospace',
                    fontSize: isMobile ? '0.85rem' : '0.8rem',
                  }}>MUTE</button>
                )}
                {isMuted && (
                  <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', padding: '8px 14px', background: 'var(--accent-amber)10', border: '1px solid var(--accent-amber)40' }}>
                    Muted
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--accent-orange)', textAlign: 'center', padding: '40px' }}>Profile not found</div>
        )}
      </div>
    </div>
  );
};

export default UserProfileModal;
