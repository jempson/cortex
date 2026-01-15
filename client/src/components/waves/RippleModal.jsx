import React, { useState, useEffect } from 'react';
import { GlowText, Avatar } from '../ui/SimpleComponents.jsx';

const RippleModal = ({ isOpen, onClose, droplet, wave, participants, fetchAPI, showToast, isMobile, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Count children recursively
  const countChildren = (msg) => {
    if (!msg.children || msg.children.length === 0) return 0;
    return msg.children.reduce((sum, child) => sum + 1 + countChildren(child), 0);
  };

  useEffect(() => {
    if (isOpen && droplet) {
      // Pre-fill title from droplet content (first 50 chars, strip HTML)
      const cleanContent = (droplet.content || '').replace(/<[^>]*>/g, '').trim();
      setTitle(cleanContent.substring(0, 50) || 'Continued Discussion');
      // Pre-select all current wave participants
      setSelectedParticipants(participants.map(p => p.id));
    }
  }, [isOpen, droplet, participants]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Please enter a title for the new wave', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetchAPI(`/pings/${droplet.id}/burst`, {
        method: 'POST',
        body: { title: title.trim(), participants: selectedParticipants }
      });
      showToast(`Created new wave: ${result.newWave.title}`, 'success');
      onClose();
      if (onSuccess) {
        onSuccess(result.newWave);
      }
    } catch (err) {
      showToast(err.message || 'Failed to burst ping', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleParticipant = (userId) => {
    setSelectedParticipants(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (!isOpen || !droplet) return null;

  const childCount = countChildren(droplet);
  const contentPreview = (droplet.content || '').replace(/<[^>]*>/g, '').substring(0, 100);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: '550px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-elevated))',
        border: '2px solid var(--accent-teal)80', padding: isMobile ? '20px' : '24px',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size={isMobile ? '1rem' : '1.1rem'}>◈ Burst to New Wave</GlowText>
        </div>

        {/* Preview of what's being rippled */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderLeft: '3px solid var(--accent-teal)',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: isMobile ? '0.8rem' : '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>
            Rippling
          </div>
          <div style={{
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            color: 'var(--text-secondary)',
            marginBottom: '8px',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            "{contentPreview}{contentPreview.length >= 100 ? '...' : ''}"
          </div>
          <div style={{ fontSize: isMobile ? '0.75rem' : '0.7rem', color: 'var(--accent-teal)' }}>
            1 ping + {childCount} {childCount === 1 ? 'reply' : 'replies'} will be moved
          </div>
        </div>

        {/* New wave title */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            New Wave Title
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            placeholder="Enter a title for the new wave..."
            maxLength={200}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontSize: isMobile ? '0.95rem' : '0.9rem',
            }}
            autoFocus
          />
          <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', textAlign: 'right', marginTop: '4px' }}>
            {title.length}/200
          </div>
        </div>

        {/* Participants selection */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase' }}>
            Participants ({selectedParticipants.length} selected)
          </div>
          <div style={{
            maxHeight: '150px',
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '8px',
          }}>
            {participants.map(p => (
              <label key={p.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                marginBottom: '4px',
                background: selectedParticipants.includes(p.id) ? 'var(--accent-teal)15' : 'transparent',
                border: `1px solid ${selectedParticipants.includes(p.id) ? 'var(--accent-teal)30' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
                <input
                  type="checkbox"
                  checked={selectedParticipants.includes(p.id)}
                  onChange={() => toggleParticipant(p.id)}
                  style={{ accentColor: 'var(--accent-teal)' }}
                />
                <Avatar letter={p.avatar || '?'} color="var(--accent-teal)" size={24} imageUrl={p.avatarUrl} />
                <span style={{ color: 'var(--text-primary)', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
                  {p.display_name || p.displayName || p.name}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Origin info */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '20px',
          fontSize: isMobile ? '0.75rem' : '0.7rem',
          color: 'var(--text-dim)',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>From:</span> {wave?.title || 'Unknown Wave'}
          <span style={{ margin: '0 8px' }}>•</span>
          <span style={{ color: 'var(--text-muted)' }}>Privacy:</span> {wave?.privacy || 'private'}
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} disabled={submitting} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            opacity: submitting ? 0.5 : 1,
          }}>CANCEL</button>
          <button onClick={handleSubmit} disabled={submitting || !title.trim()} style={{
            padding: isMobile ? '12px 20px' : '10px 20px',
            minHeight: isMobile ? '44px' : 'auto',
            background: title.trim() ? 'var(--accent-teal)' : 'var(--border-primary)',
            border: `1px solid ${title.trim() ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: 'var(--bg-base)',
            cursor: (submitting || !title.trim()) ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            fontSize: isMobile ? '0.9rem' : '0.85rem',
            fontWeight: 600,
            opacity: submitting ? 0.7 : 1,
          }}>{submitting ? 'CREATING...' : '◈ CREATE WAVE'}</button>
        </div>
      </div>
    </div>
  );
};

export default RippleModal;
