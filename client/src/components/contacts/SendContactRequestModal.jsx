import React, { useState } from 'react';
import { formatError } from '../../../messages.js';
import { GlowText, Avatar } from '../ui/SimpleComponents.jsx';

const SendContactRequestModal = ({ isOpen, onClose, toUser, fetchAPI, showToast, onRequestSent, isMobile }) => {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen || !toUser) return null;

  const handleSend = async () => {
    setSending(true);
    try {
      await fetchAPI('/contacts/request', {
        method: 'POST',
        body: { toUserId: toUser.id, message: message.trim() || undefined }
      });
      showToast(`Contact request sent to ${toUser.displayName || toUser.handle}`, 'success');
      onRequestSent();
      setMessage('');
      onClose();
    } catch (err) {
      showToast(err.message || formatError('Failed to send request'), 'error');
    }
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: isMobile ? '16px' : '0',
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '1px solid var(--accent-teal)', padding: isMobile ? '20px' : '24px',
        width: '100%', maxWidth: '400px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size="1rem">SEND CONTACT REQUEST</GlowText>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
          }}>×</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <Avatar user={toUser} size="48px" />
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {toUser.displayName || toUser.handle}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              @{toUser.handle}
            </div>
          </div>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add an optional message..."
          maxLength={500}
          style={{
            width: '100%', padding: '12px', background: 'var(--bg-base)',
            border: '1px solid var(--border-primary)', color: 'var(--text-primary)',
            fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical',
            minHeight: '80px', marginBottom: '16px',
          }}
        />

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              flex: 1, padding: '12px', background: 'var(--accent-teal)30',
              border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)',
              cursor: sending ? 'wait' : 'pointer', fontFamily: 'monospace',
              fontWeight: 'bold', fontSize: '0.9rem',
            }}
          >
            {sending ? 'SENDING...' : 'SEND REQUEST'}
          </button>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              padding: '12px 20px', background: 'transparent',
              border: '1px solid var(--border-primary)', color: 'var(--text-muted)',
              cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
              fontSize: '0.9rem',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendContactRequestModal;
