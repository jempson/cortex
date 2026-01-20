import React from 'react';

// ============ LINK CARD FOR RIPPLED DROPLETS ============
const BurstLinkCard = ({ message, waveTitle, onClick, isMobile, unreadCount = 0 }) => {
  return (
    <div
      onClick={onClick}
      style={{
        padding: isMobile ? '14px 16px' : '12px 16px',
        marginBottom: '8px',
        background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))',
        border: `2px solid ${unreadCount > 0 ? 'var(--accent-purple)60' : 'var(--accent-teal)40'}`,
        borderLeft: `4px solid ${unreadCount > 0 ? 'var(--accent-purple)' : 'var(--accent-teal)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = unreadCount > 0 ? 'var(--accent-purple)10' : 'var(--accent-teal)10';
        e.currentTarget.style.borderColor = unreadCount > 0 ? 'var(--accent-purple)80' : 'var(--accent-teal)60';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))';
        e.currentTarget.style.borderColor = unreadCount > 0 ? 'var(--accent-purple)60' : 'var(--accent-teal)40';
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '8px',
      }}>
        <span style={{ fontSize: '1.2rem', color: unreadCount > 0 ? 'var(--accent-purple)' : undefined }}>◈</span>
        <span style={{
          color: unreadCount > 0 ? 'var(--accent-purple)' : 'var(--accent-teal)',
          fontSize: isMobile ? '0.8rem' : '0.75rem',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Burst to wave...
        </span>
        {unreadCount > 0 && (
          <span style={{
            background: 'var(--accent-purple)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '10px',
            marginLeft: 'auto',
          }}>
            {unreadCount} new
          </span>
        )}
      </div>
      <div style={{
        color: 'var(--text-primary)',
        fontSize: isMobile ? '1rem' : '0.95rem',
        fontWeight: 500,
        marginBottom: '6px',
      }}>
        "{waveTitle || 'Unknown Wave'}"
      </div>
      <div style={{
        color: 'var(--text-dim)',
        fontSize: isMobile ? '0.8rem' : '0.75rem',
        fontFamily: 'monospace',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span>→</span>
        <span>Click to open</span>
      </div>
    </div>
  );
};

export default BurstLinkCard;
