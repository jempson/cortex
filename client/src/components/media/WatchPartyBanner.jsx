import React from 'react';
import { GlowText } from '../ui/SimpleComponents.jsx';

/**
 * WatchPartyBanner Component (v2.14.0)
 *
 * Shows a banner in WaveView when a watch party is active in that wave.
 *
 * Props:
 * - party: { id, name, hostName, participants, state, isParticipant }
 * - isHost: boolean - whether current user is the host
 * - onJoin: () => void - callback to join the party
 * - onLeave: () => void - callback to leave the party
 * - onOpen: () => void - callback to open the player
 * - isMobile: boolean
 */
const WatchPartyBanner = ({ party, isHost, onJoin, onLeave, onOpen, isMobile }) => {
  if (!party) return null;

  const participantCount = party.participants?.length || 1;
  const isPlaying = party.state === 'playing';
  const isParticipant = party.isParticipant;

  const stateLabel = {
    'waiting': 'Waiting',
    'playing': 'Now Playing',
    'paused': 'Paused'
  }[party.state] || party.state;

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(255, 210, 63, 0.15), transparent)',
      borderBottom: '1px solid rgba(255, 210, 63, 0.4)',
      padding: isMobile ? '12px 16px' : '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        {/* Animated indicator */}
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isPlaying ? 'var(--status-color, #0ead69)' : 'var(--accent-color, #ffd23f)',
          boxShadow: isPlaying ? '0 0 8px var(--status-color, #0ead69)' : 'none',
          animation: isPlaying ? 'watchPartyPulse 2s infinite' : 'none',
          flexShrink: 0,
        }} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}>
            <GlowText color="var(--accent-color, #ffd23f)" size="0.75rem">
              🎬 WATCH PARTY
            </GlowText>
            <span style={{
              color: 'var(--text-secondary, rgba(255,255,255,0.6))',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
            }}>
              {stateLabel}
            </span>
          </div>

          <div style={{
            color: 'var(--text-primary, #e0e0e0)',
            fontSize: '0.85rem',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {party.name}
          </div>

          <div style={{
            color: 'var(--text-muted, rgba(255,255,255,0.4))',
            fontSize: '0.7rem',
            marginTop: '2px',
          }}>
            Hosted by {party.hostName} • {participantCount} watching
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {isParticipant ? (
          <>
            <button
              onClick={onLeave}
              style={{
                padding: isMobile ? '10px 14px' : '8px 12px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'transparent',
                border: '1px solid var(--accent-color, #ffd23f)',
                color: 'var(--accent-color, #ffd23f)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
              }}
              title="Leave watch party"
            >
              LEAVE
            </button>
            <button
              onClick={onOpen}
              style={{
                padding: isMobile ? '10px 16px' : '8px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                background: 'var(--accent-color, #ffd23f)',
                border: 'none',
                color: 'var(--bg-color, #050805)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
              }}
              title="Open player"
            >
              <span style={{ fontSize: '0.9rem' }}>▶</span>
              OPEN
            </button>
          </>
        ) : (
          <button
            onClick={onJoin}
            style={{
              padding: isMobile ? '12px 20px' : '10px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--accent-color, #ffd23f)',
              border: 'none',
              color: 'var(--bg-color, #050805)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
            title="Join watch party"
          >
            <span style={{ fontSize: '1rem' }}>▶</span>
            JOIN
          </button>
        )}
      </div>

      {/* Pulse animation styles */}
      <style>{`
        @keyframes watchPartyPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default WatchPartyBanner;
