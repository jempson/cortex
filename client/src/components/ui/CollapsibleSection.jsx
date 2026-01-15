import React, { useState } from 'react';

const CollapsibleSection = ({ title, children, defaultOpen = true, isOpen: controlledIsOpen, onToggle, isMobile, titleColor = 'var(--text-dim)', accentColor, badge }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);

  // Use controlled mode if onToggle is provided, otherwise use internal state
  const isOpen = onToggle ? controlledIsOpen : internalIsOpen;
  const handleToggle = onToggle || (() => setInternalIsOpen(!internalIsOpen));

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: accentColor ? `1px solid ${accentColor}40` : '1px solid var(--border-subtle)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ color: titleColor, fontSize: '0.8rem', fontWeight: 500 }}>{title}</div>
          {badge && (
            <span style={{
              padding: '2px 6px',
              background: 'var(--accent-amber)20',
              border: '1px solid var(--accent-amber)',
              color: 'var(--accent-amber)',
              fontSize: '0.65rem',
              borderRadius: '3px',
            }}>{badge}</span>
          )}
        </div>
        <button
          onClick={handleToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? (accentColor ? `${accentColor}20` : 'var(--accent-amber)20') : 'transparent',
            border: `1px solid ${isOpen ? (accentColor || 'var(--accent-amber)') : 'var(--border-primary)'}`,
            color: isOpen ? (accentColor || 'var(--accent-amber)') : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>
      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
