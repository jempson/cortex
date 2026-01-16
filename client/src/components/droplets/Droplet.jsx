import React, { useState } from 'react';
import { PRIVACY_LEVELS, THREAD_DEPTH_LIMIT } from '../../config/constants.js';
import { Avatar, PrivacyBadge } from '../ui/SimpleComponents.jsx';
import ImageLightbox from '../ui/ImageLightbox.jsx';
import RippledLinkCard from './RippledLinkCard.jsx';
import DropletWithEmbeds from './DropletWithEmbeds.jsx';
import AudioPlayer from '../media/AudioPlayer.jsx';
import VideoPlayer from '../media/VideoPlayer.jsx';

const Droplet = ({ message, depth = 0, onReply, onDelete, onEdit, onSaveEdit, onCancelEdit, editingMessageId, editContent, setEditContent, currentUserId, highlightId, playbackIndex, collapsed, onToggleCollapse, isMobile, onReact, onMessageClick, participants = [], contacts = [], onShowProfile, onReport, onFocus, onRipple, onShare, wave, onNavigateToWave, currentWaveId, unreadCountsByWave = {}, autoFocusDroplets = false, fetchAPI }) => {
  const config = PRIVACY_LEVELS[message.privacy] || PRIVACY_LEVELS.private;
  const isHighlighted = highlightId === message.id;
  const isVisible = playbackIndex === null || message._index <= playbackIndex;

  // Check if there are any visible children (non-deleted or deleted with visible descendants)
  const hasVisibleChildren = (children) => {
    if (!children || children.length === 0) return false;
    return children.some(child => !child.deleted || hasVisibleChildren(child.children));
  };
  const hasChildren = hasVisibleChildren(message.children);
  const isCollapsed = collapsed[message.id];
  const isDeleted = message.deleted;
  const canDelete = !isDeleted && message.author_id === currentUserId;
  const isEditing = !isDeleted && editingMessageId === message.id;
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showPingMenu, setShowPingMenu] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const isUnread = !isDeleted && message.is_unread && message.author_id !== currentUserId;
  const isReply = depth > 0 && message.parentId;
  const isAtDepthLimit = depth >= THREAD_DEPTH_LIMIT;

  // Count all droplets in children (recursive) - for collapsed thread indicator
  const countAllChildren = (children) => {
    if (!children) return 0;
    return children.reduce((count, child) => {
      return count + 1 + countAllChildren(child.children);
    }, 0);
  };
  const totalChildCount = hasChildren ? countAllChildren(message.children) : 0;

  // Count unread droplets in children (recursive) - for collapsed thread indicator
  const countUnreadChildren = (children) => {
    if (!children) return 0;
    return children.reduce((count, child) => {
      const childUnread = !child.deleted && child.is_unread && child.author_id !== currentUserId ? 1 : 0;
      return count + childUnread + countUnreadChildren(child.children);
    }, 0);
  };
  const unreadChildCount = isCollapsed && hasChildren ? countUnreadChildren(message.children) : 0;

  const quickReactions = ['👍', '❤️', '😂', '🎉', '🤔', '👏', '😢', '😭'];

  if (!isVisible) return null;

  // Don't render deleted messages unless they have children (replies)
  // Deleted messages with children show placeholder to preserve thread context
  if (isDeleted && !hasChildren) return null;

  // If this droplet has been rippled out, show a link card instead
  // But NOT when viewing from the ripple wave itself (where rippledTo === currentWaveId)
  const isRippled = !!(message.brokenOutTo || message.rippledTo) && (message.brokenOutTo || message.rippledTo) !== currentWaveId;

  const handleMessageClick = (e) => {
    e.stopPropagation(); // Prevent click from bubbling to parent droplets
    if (isUnread && onMessageClick) {
      onMessageClick(message.id);
    }
    // Auto-focus if preference enabled and droplet has children (replies)
    if (autoFocusDroplets && hasChildren && onFocus && !isDeleted) {
      onFocus(message);
    }
  };

  // Render rippled droplet as a link card
  if (isRippled) {
    const rippledToId = message.brokenOutTo || message.rippledTo;
    const rippledToTitle = message.brokenOutToTitle || message.rippledToTitle || 'New Wave';
    return (
      <div data-message-id={message.id}>
        <RippledLinkCard
          droplet={message}
          waveTitle={rippledToTitle}
          onClick={() => onNavigateToWave && onNavigateToWave({
            id: rippledToId,
            title: rippledToTitle,
          })}
          isMobile={isMobile}
          unreadCount={unreadCountsByWave[rippledToId] || 0}
        />
      </div>
    );
  }

  // Compact styling
  const avatarSize = isMobile ? 24 : 20;

  return (
    <div data-message-id={message.id}>
      <div
        onClick={handleMessageClick}
        style={{
          padding: '0px 12px',
          marginTop: isMobile ? '8px' : '6px',
          background: isHighlighted ? `${config.color}15` : isUnread ? 'var(--accent-amber)08' : 'transparent',
          borderLeft: isUnread ? '2px solid var(--accent-amber)' : '2px solid transparent',
          cursor: (isUnread || (autoFocusDroplets && hasChildren && !isDeleted)) ? 'pointer' : 'default',
          transition: 'background 0.15s ease',
          opacity: isDeleted ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isHighlighted && !isUnread) {
            e.currentTarget.style.background = 'var(--bg-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isHighlighted && !isUnread) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Header row with author info (left) and actions (right) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{ cursor: onShowProfile ? 'pointer' : 'default', flexShrink: 0 }}
              onClick={onShowProfile && message.author_id ? (e) => { e.stopPropagation(); onShowProfile(message.author_id); } : undefined}
            >
              <Avatar letter={message.sender_avatar || '?'} color={config.color} size={avatarSize} imageUrl={message.sender_avatar_url} />
            </div>
            <span
              style={{ color: config.color, fontSize: isMobile ? '0.85rem' : '0.8rem', fontWeight: 600, cursor: onShowProfile ? 'pointer' : 'default' }}
              onClick={onShowProfile && message.author_id ? (e) => { e.stopPropagation(); onShowProfile(message.author_id); } : undefined}
            >
              {message.sender_name}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.7rem' : '0.65rem' }}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {wave?.privacy !== message.privacy && <PrivacyBadge level={message.privacy} compact />}
          </div>

          {/* Compact inline actions */}
          {!isDeleted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.6, transition: 'opacity 0.15s', position: 'relative' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              {/* Reply / Focus to Reply */}
              {isAtDepthLimit && onFocus ? (
                <button onClick={() => onFocus(message)} title="Focus to reply" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-teal)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>⤢</button>
              ) : (
                <button onClick={() => onReply(message)} title="Reply" style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--text-dim)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
                }}>↵</button>
              )}
              {/* Collapse/Expand */}
              {hasChildren && (
                <button onClick={() => onToggleCollapse(message.id)} title={isCollapsed ? 'Expand' : 'Collapse'} style={{
                  padding: isMobile ? '8px 10px' : '2px 4px', background: 'transparent', border: 'none',
                  color: 'var(--accent-amber)', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.65rem',
                }}>{isCollapsed ? `▶${totalChildCount}` : '▼'}</button>
              )}

              {/* Three-dot menu for additional actions */}
              {!isEditing && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPingMenu(!showPingMenu);
                    }}
                    title="More actions"
                    style={{
                      padding: isMobile ? '8px 10px' : '2px 4px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: isMobile ? '0.85rem' : '0.7rem',
                    }}
                  >
                    ⋮
                  </button>
                  {/* Ping actions dropdown */}
                  {showPingMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: '4px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        minWidth: '140px',
                        zIndex: 1000,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ padding: '4px 0' }}>
                        {/* Focus */}
                        {hasChildren && !isAtDepthLimit && onFocus && (
                          <div
                            onClick={() => {
                              onFocus(message);
                              setShowPingMenu(false);
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              color: 'var(--text-primary)',
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span>⤢</span>
                            <span>Focus</span>
                          </div>
                        )}
                        {/* Share */}
                        {wave?.privacy === 'public' && onShare && (
                          <div
                            onClick={() => {
                              onShare(message);
                              setShowPingMenu(false);
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              color: 'var(--text-primary)',
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span>⤴</span>
                            <span>Share</span>
                          </div>
                        )}
                        {/* Burst */}
                        {onRipple && (
                          <div
                            onClick={() => {
                              onRipple(message);
                              setShowPingMenu(false);
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              color: 'var(--accent-teal)',
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span>◈</span>
                            <span>Burst</span>
                          </div>
                        )}
                        {/* Edit (author only) */}
                        {canDelete && (
                          <div
                            onClick={() => {
                              onEdit(message);
                              setShowPingMenu(false);
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              color: 'var(--accent-amber)',
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              borderTop: '1px solid var(--border-subtle)',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span>✏</span>
                            <span>Edit</span>
                          </div>
                        )}
                        {/* Delete (author only) */}
                        {canDelete && (
                          <div
                            onClick={() => {
                              onDelete(message);
                              setShowPingMenu(false);
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              color: 'var(--accent-orange)',
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span>✕</span>
                            <span>Delete</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reaction */}
              <button onClick={() => setShowReactionPicker(!showReactionPicker)} title="React" style={{
                padding: isMobile ? '8px 10px' : '2px 4px', background: showReactionPicker ? 'var(--bg-hover)' : 'transparent', border: 'none',
                color: 'var(--text-dim)', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : '0.7rem',
              }}>{showReactionPicker ? '✕' : '😀'}</button>
              {/* Reaction picker dropdown */}
              {showReactionPicker && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 10,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '4px',
                  display: 'flex', gap: '2px',
                }}>
                  {quickReactions.map(emoji => (
                    <button key={emoji} onClick={() => { onReact(message.id, emoji); setShowReactionPicker(false); }}
                      style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                    >{emoji}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Depth indicator for deep threads */}
        {isAtDepthLimit && (
          <div style={{
            marginBottom: '8px',
            padding: '6px 10px',
            background: 'var(--accent-teal)10',
            border: '1px solid var(--accent-teal)40',
            borderLeft: '3px solid var(--accent-teal)',
            fontSize: isMobile ? '0.7rem' : '0.65rem',
            color: 'var(--accent-teal)',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>⬡</span>
            <span>Thread depth limit reached</span>
            <span style={{ color: 'var(--text-dim)' }}>•</span>
            <span style={{ color: 'var(--text-dim)' }}>Use Focus to continue deeper</span>
          </div>
        )}
        {depth > THREAD_DEPTH_LIMIT && (
          <div style={{
            marginBottom: '8px',
            padding: '4px 8px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '2px solid var(--text-dim)',
            fontSize: isMobile ? '0.65rem' : '0.6rem',
            color: 'var(--text-dim)',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span>⬡</span>
            <span>Depth: {depth} levels</span>
          </div>
        )}
        {isEditing ? (
          <div style={{ marginBottom: '10px' }}>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  onSaveEdit(message.id);
                } else if (e.key === 'Escape') {
                  onCancelEdit();
                }
              }}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent-amber)',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.95rem' : '0.85rem',
                resize: 'vertical',
              }}
              placeholder="Edit your ping..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => onSaveEdit(message.id)} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-green)20',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>💾 SAVE (Ctrl+Enter)</button>
              <button onClick={onCancelEdit} style={{
                padding: isMobile ? '10px 14px' : '6px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent',
                border: '1px solid var(--text-dim)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: isMobile ? '0.85rem' : '0.75rem',
              }}>✕ CANCEL (Esc)</button>
            </div>
          </div>
        ) : isDeleted ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: isMobile ? '0.95rem' : '0.85rem',
              lineHeight: 1.6,
              marginBottom: '10px',
              fontStyle: 'italic',
            }}
          >
            [Ping deleted]
          </div>
        ) : (
          <div
            onClick={(e) => {
              // Handle image clicks for lightbox
              if (e.target.tagName === 'IMG' && e.target.classList.contains('zoomable-image')) {
                e.stopPropagation();
                setLightboxImage(e.target.src);
                return;
              }
            }}
            style={{
              color: 'var(--text-primary)',
              fontSize: isMobile ? '0.95rem' : '0.85rem',
              lineHeight: 1.6,
              marginBottom: '10px',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
            }}
          >
            {/* Text content (if any) */}
            {message.content && (
              <DropletWithEmbeds
                content={message.content}
                participants={participants}
                contacts={contacts}
                onMentionClick={onShowProfile}
                fetchAPI={fetchAPI}
              />
            )}
            {/* Media content (v2.7.0) */}
            {message.media_type === 'audio' && message.media_url && (
              <div style={{ marginTop: message.content ? '8px' : 0 }}>
                <AudioPlayer
                  src={message.media_url}
                  duration={message.media_duration}
                  isMobile={isMobile}
                />
              </div>
            )}
            {message.media_type === 'video' && message.media_url && (
              <div style={{ marginTop: message.content ? '8px' : 0 }}>
                <VideoPlayer
                  src={message.media_url}
                  duration={message.media_duration}
                  isMobile={isMobile}
                />
              </div>
            )}
          </div>
        )}
        {/* Reactions and Read Receipts Row */}
        {!isDeleted && message.reactions && Object.keys(message.reactions).length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginTop: '2px' }}>
            {Object.entries(message.reactions).map(([emoji, userIds]) => {
              const hasReacted = userIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  style={{
                    padding: '1px 4px',
                    background: hasReacted ? 'var(--accent-amber)20' : 'var(--bg-hover)',
                    border: 'none',
                    color: hasReacted ? 'var(--accent-amber)' : 'var(--text-dim)',
                    cursor: 'pointer',
                    fontSize: isMobile ? '0.8rem' : '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    borderRadius: '2px',
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: '0.6rem', fontFamily: 'monospace' }}>{userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Read Receipts - compact display */}
        {!isDeleted && message.readBy && message.readBy.length > 0 && (
          <details style={{ marginTop: '6px', cursor: 'pointer' }}>
            <summary style={{
              color: 'var(--text-muted)',
              fontSize: isMobile ? '0.65rem' : '0.6rem',
              userSelect: 'none',
              fontFamily: 'monospace',
              listStyle: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              <span style={{ color: 'var(--accent-green)' }}>✓</span>
              {message.readBy.length}
            </summary>
            <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {message.readBy.map(userId => {
                const participant = participants.find(p => p.id === userId);
                return (
                  <span key={userId} title={participant?.handle || ''} style={{
                    padding: '1px 4px', background: 'var(--accent-green)15', border: '1px solid var(--accent-green)40',
                    color: 'var(--accent-green)', fontSize: isMobile ? '0.6rem' : '0.55rem', fontFamily: 'monospace'
                  }}>
                    {participant ? participant.name : userId}
                  </span>
                );
              })}
            </div>
          </details>
        )}

        {/* Nested replies rendered INSIDE parent droplet */}
        {hasChildren && !isCollapsed && (
          <div style={{
            marginTop: '2px',
            marginLeft: '0px',
            paddingLeft: isMobile ? '4px' : '6px',
            borderLeft: '1px solid var(--border-subtle)',
          }}>
            {message.children.map((child) => (
              <Droplet key={child.id} message={child} depth={depth + 1} onReply={onReply} onDelete={onDelete}
                onEdit={onEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit}
                editingMessageId={editingMessageId} editContent={editContent} setEditContent={setEditContent}
                currentUserId={currentUserId} highlightId={highlightId} playbackIndex={playbackIndex} collapsed={collapsed}
                onToggleCollapse={onToggleCollapse} isMobile={isMobile} onReact={onReact} onMessageClick={onMessageClick}
                participants={participants} contacts={contacts} onShowProfile={onShowProfile} onReport={onReport}
                onFocus={onFocus} onRipple={onRipple} onShare={onShare} wave={wave} onNavigateToWave={onNavigateToWave} currentWaveId={currentWaveId}
                unreadCountsByWave={unreadCountsByWave} autoFocusDroplets={autoFocusDroplets} fetchAPI={fetchAPI} />
            ))}
          </div>
        )}
      </div>
      {lightboxImage && (
        <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
};

export default Droplet;
