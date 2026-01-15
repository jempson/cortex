import React from 'react';
import { GlowText } from '../ui/SimpleComponents.jsx';

const PlaybackControls = ({ isPlaying, onTogglePlay, currentIndex, totalMessages, onSeek, onReset, playbackSpeed, onSpeedChange, isMobile }) => (
  <div style={{
    flexShrink: 0,
    padding: isMobile ? '8px 12px' : '12px 16px', background: 'linear-gradient(90deg, var(--bg-surface), var(--bg-hover), var(--bg-surface))',
    borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flexWrap: 'wrap',
  }}>
    <GlowText color="var(--accent-teal)" size="0.8rem">PLAYBACK</GlowText>
    <div style={{ display: 'flex', gap: '4px' }}>
      <button onClick={onReset} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem' }}>⟲</button>
      <button onClick={onTogglePlay} style={{
        padding: '4px 12px', background: isPlaying ? 'var(--accent-orange)20' : 'var(--accent-green)20',
        border: `1px solid ${isPlaying ? 'var(--accent-orange)' : 'var(--accent-green)'}`,
        color: isPlaying ? 'var(--accent-orange)' : 'var(--accent-green)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem',
      }}>{isPlaying ? '⏸' : '▶'}</button>
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '100px' }}>
      <input type="range" min={0} max={totalMessages - 1} value={currentIndex ?? totalMessages - 1}
        onChange={(e) => onSeek(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent-teal)', minWidth: '60px' }} />
      <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {(currentIndex ?? totalMessages - 1) + 1}/{totalMessages}
      </span>
    </div>
    {!isMobile && (
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0.5, 1, 2, 4].map(speed => (
          <button key={speed} onClick={() => onSpeedChange(speed)} style={{
            padding: '4px 6px', background: playbackSpeed === speed ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${playbackSpeed === speed ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: playbackSpeed === speed ? 'var(--accent-teal)' : 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.65rem',
          }}>{speed}x</button>
        ))}
      </div>
    )}
  </div>
);

export default PlaybackControls;
