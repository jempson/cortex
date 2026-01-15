import React from 'react';

const EmojiPicker = ({ onSelect, isMobile }) => {
  const emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '💯', '❤️', '😎', '🚀', '✨', '💪', '👏', '🙌'];
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      padding: isMobile ? '10px' : '6px', display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(8, 1fr)',
      gap: isMobile ? '6px' : '2px',
      zIndex: 10,
    }}>
      {emojis.map(emoji => (
        <button key={emoji} onClick={() => onSelect(emoji)} style={{
          width: isMobile ? '44px' : '32px',
          height: isMobile ? '44px' : '32px',
          padding: 0,
          background: 'transparent', border: '1px solid var(--border-subtle)',
          cursor: 'pointer', fontSize: isMobile ? '1.3rem' : '1.1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>{emoji}</button>
      ))}
    </div>
  );
};

export default EmojiPicker;
