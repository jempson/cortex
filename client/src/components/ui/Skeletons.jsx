// Low-Bandwidth Mode: Skeleton UI Components (v2.10.0)
// Provides visual placeholders while content loads

import React from 'react';

// Base skeleton styles with shimmer animation
const skeletonStyle = {
  background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-surface) 50%, var(--bg-hover) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '4px',
};

// Shimmer animation keyframes - added to global styles
export const skeletonKeyframes = `
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

// Single skeleton line/block
export function SkeletonBlock({ width = '100%', height = '1rem', style = {} }) {
  return (
    <div
      style={{
        ...skeletonStyle,
        width,
        height,
        ...style,
      }}
    />
  );
}

// Skeleton for a wave list item
export function WaveListSkeleton({ count = 5 }) {
  return (
    <div style={{ padding: '8px' }}>
      <style>{skeletonKeyframes}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '12px',
            marginBottom: '8px',
            background: 'var(--bg-surface)',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Title */}
          <SkeletonBlock width="60%" height="1rem" style={{ marginBottom: '8px' }} />
          {/* Meta line */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <SkeletonBlock width="80px" height="0.75rem" />
            <SkeletonBlock width="40px" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Skeleton for wave view header
export function WaveViewHeaderSkeleton() {
  return (
    <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <style>{skeletonKeyframes}</style>
      {/* Title */}
      <SkeletonBlock width="50%" height="1.5rem" style={{ marginBottom: '8px' }} />
      {/* Participants */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} width="24px" height="24px" style={{ borderRadius: '50%' }} />
        ))}
      </div>
    </div>
  );
}

// Skeleton for a single droplet/message
export function DropletSkeleton() {
  return (
    <div style={{ padding: '12px', marginBottom: '4px' }}>
      <style>{skeletonKeyframes}</style>
      {/* Avatar + sender name */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <SkeletonBlock width="32px" height="32px" style={{ borderRadius: '50%' }} />
        <SkeletonBlock width="100px" height="0.875rem" />
        <SkeletonBlock width="60px" height="0.625rem" />
      </div>
      {/* Message content */}
      <div style={{ marginLeft: '40px' }}>
        <SkeletonBlock width="80%" height="1rem" style={{ marginBottom: '4px' }} />
        <SkeletonBlock width="60%" height="1rem" />
      </div>
    </div>
  );
}

// Skeleton for wave view content (multiple droplets)
export function WaveViewSkeleton({ dropletCount = 5 }) {
  return (
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <style>{skeletonKeyframes}</style>
      <WaveViewHeaderSkeleton />
      <div style={{ padding: '8px' }}>
        {Array.from({ length: dropletCount }).map((_, i) => (
          <DropletSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Inline skeleton text (for inline loading)
export function SkeletonText({ width = '4rem' }) {
  return (
    <span
      style={{
        ...skeletonStyle,
        display: 'inline-block',
        width,
        height: '1em',
        verticalAlign: 'middle',
      }}
    />
  );
}

// Loading indicator for low-bandwidth mode
export function LowBandwidthIndicator({ show = false }) {
  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--accent-amber)',
        color: '#000',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '0.7rem',
        fontFamily: 'monospace',
        zIndex: 1000,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      LOW BANDWIDTH MODE
    </div>
  );
}

export default {
  SkeletonBlock,
  WaveListSkeleton,
  WaveViewHeaderSkeleton,
  DropletSkeleton,
  WaveViewSkeleton,
  SkeletonText,
  LowBandwidthIndicator,
  skeletonKeyframes,
};
