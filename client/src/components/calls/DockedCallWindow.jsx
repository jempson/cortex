import React, { useRef, useCallback, useState } from 'react';
import { LiveKitRoom, useParticipants, useLocalParticipant, RoomAudioRenderer, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useDraggable } from '../../hooks/useDraggable.js';
import { Avatar } from '../ui/SimpleComponents.jsx';

// Reuse LiveKitCallRoom from CallModal
// Use refs to prevent callback recreation and avoid unnecessary LiveKit reconnection attempts
const LiveKitCallRoom = React.memo(({ token, url, roomName, voiceCall, children }) => {
  // Store voiceCall in ref to avoid recreating callbacks
  const voiceCallRef = useRef(voiceCall);
  voiceCallRef.current = voiceCall;

  // Stable callbacks that don't change on every render
  const handleConnected = useCallback(() => {
    console.log('🎤 Connected to LiveKit room:', roomName);
    voiceCallRef.current.setConnectionState('connected');
  }, [roomName]);

  const handleDisconnected = useCallback(() => {
    console.log('🎤 Disconnected from LiveKit room');
    voiceCallRef.current.setConnectionState('disconnected');
  }, []);

  const handleError = useCallback((error) => {
    console.error('🎤 LiveKit error:', error);
    voiceCallRef.current.setConnectionState('disconnected');
  }, []);

  if (!token || !url) return null;

  const audioDeviceId = voiceCall.selectedMic !== 'default' ? voiceCall.selectedMic : undefined;
  const videoDeviceId = voiceCall.selectedCamera !== 'default' ? voiceCall.selectedCamera : undefined;

  return (
    <LiveKitRoom
      key={token} // Only remount when token changes, not on every voiceCall state update
      token={token}
      serverUrl={url}
      connect={true}
      audio={true}
      video={!voiceCall.isCameraOff}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
      options={{
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: audioDeviceId
        },
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720, frameRate: 30 },
          deviceId: videoDeviceId
        }
      }}
    >
      <RoomAudioRenderer />
      <CallControls
        isMuted={voiceCall.isMuted}
        isCameraOff={voiceCall.isCameraOff}
        isScreenSharing={voiceCall.isScreenSharing}
        setParticipants={voiceCall.setParticipants}
        setAudioLevel={voiceCall.setAudioLevel}
        setRoom={voiceCall.setRoom}
        setScreenSharing={voiceCall.setScreenSharing}
      />
      {children}
    </LiveKitRoom>
  );
});

// Call controls that sync with LiveKit
const CallControls = ({ isMuted, isCameraOff, isScreenSharing, setParticipants, setAudioLevel, setRoom, setScreenSharing }) => {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  React.useEffect(() => {
    const participantIds = participants.map(p => p.identity);
    setParticipants(participantIds);
  }, [participants, setParticipants]);

  React.useEffect(() => {
    if (!localParticipant) return;

    const interval = setInterval(() => {
      const audioTrack = localParticipant.getTrackPublication(Track.Source.Microphone);
      if (audioTrack?.track) {
        const level = audioTrack.isSpeaking ? 0.7 : 0.1;
        setAudioLevel(level);
      } else {
        setAudioLevel(0);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [localParticipant, setAudioLevel]);

  React.useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMuted);
    }
  }, [isMuted, localParticipant]);

  React.useEffect(() => {
    if (!localParticipant) return;

    const updateCamera = async () => {
      try {
        const shouldEnable = !isCameraOff;
        if (shouldEnable) {
          const cameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
          if (cameraPub && cameraPub.isMuted) {
            await cameraPub.unmute();
          } else {
            await localParticipant.setCameraEnabled(true);
          }
        } else {
          const cameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
          if (cameraPub) {
            await cameraPub.mute();
          }
        }
      } catch (err) {
        console.error('🎥 Failed to change camera state:', err);
      }
    };

    updateCamera();
  }, [isCameraOff, localParticipant]);

  // Sync screen share state with LiveKit
  React.useEffect(() => {
    if (!localParticipant) return;

    const updateScreenShare = async () => {
      try {
        const screenPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const isCurrentlySharing = screenPub && !screenPub.isMuted;

        if (isScreenSharing && !isCurrentlySharing) {
          console.log('🖥️ Enabling screen share...');
          await localParticipant.setScreenShareEnabled(true);
          console.log('🖥️ Screen share enabled');
        } else if (!isScreenSharing && isCurrentlySharing) {
          console.log('🖥️ Disabling screen share...');
          await localParticipant.setScreenShareEnabled(false);
          console.log('🖥️ Screen share disabled');
        }
      } catch (err) {
        console.error('🖥️ Failed to change screen share state:', err);
        // If user cancelled or error occurred, reset the state
        if (setScreenSharing) {
          setScreenSharing(false);
        }
      }
    };

    updateScreenShare();
  }, [isScreenSharing, localParticipant, setScreenSharing]);

  return null;
};

// Main DockedCallWindow component
const DockedCallWindow = ({ voiceCall, isMobile, user }) => {
  const windowRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // All hooks must be called unconditionally before any early returns
  const handlePositionChange = useCallback((newPos) => {
    voiceCall.setDockPosition(newPos);
  }, [voiceCall]);

  const { position, isDragging, handleMouseDown } = useDraggable(windowRef, {
    onPositionChange: handlePositionChange,
    initialPosition: voiceCall.dockPosition,
    disabled: isMobile || isFullscreen
  });

  const handleClose = useCallback(() => {
    voiceCall.hideDock();
  }, [voiceCall]);

  const handleToggleSize = useCallback(() => {
    voiceCall.toggleDockSize();
  }, [voiceCall]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const handleToggleMute = useCallback(() => {
    voiceCall.toggleMute();
  }, [voiceCall]);

  const handleToggleCamera = useCallback(() => {
    voiceCall.toggleCamera();
  }, [voiceCall]);

  const handleToggleScreenShare = useCallback(() => {
    voiceCall.setScreenSharing(!voiceCall.isScreenSharing);
  }, [voiceCall]);

  const handleLeaveCall = useCallback(() => {
    voiceCall.leaveCall();
  }, [voiceCall]);

  // No token means no active call - don't render anything
  // Also don't render if dock is hidden - CallModal will handle the LiveKitRoom when !isDocked
  if (!voiceCall.livekitToken || !voiceCall.livekitUrl || !voiceCall.isDocked) {
    return null;
  }

  // Fullscreen style
  const fullscreenStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 2000,
    background: 'var(--bg-base)',
    border: 'none',
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column',
  };

  // Mobile: fixed bottom position
  const containerStyle = isFullscreen ? fullscreenStyle : (isMobile ? {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: voiceCall.dockMinimized ? '60px' : '70vh',
    zIndex: 1500,
    background: 'var(--bg-surface)',
    border: '1px solid var(--accent-teal)',
    borderBottom: 'none',
    boxShadow: '0 -4px 12px rgba(0, 255, 170, 0.2)',
    display: 'flex',
    flexDirection: 'column',
  } : {
    // Desktop: draggable position
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${position.width}px`,
    height: voiceCall.dockMinimized ? '80px' : `${position.height}px`,
    zIndex: 1500,
    background: 'var(--bg-surface)',
    border: '1px solid var(--accent-teal)',
    boxShadow: '0 4px 12px rgba(0, 255, 170, 0.3)',
    cursor: isDragging ? 'grabbing' : 'default',
    display: 'flex',
    flexDirection: 'column',
  });

  const headerStyle = {
    padding: isMobile ? '8px 12px' : '10px 14px',
    background: 'var(--bg-hover)',
    borderBottom: voiceCall.dockMinimized ? 'none' : '1px solid var(--accent-teal)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: isMobile ? 'default' : 'grab',
    userSelect: 'none',
  };

  const buttonStyle = {
    background: 'transparent',
    border: '1px solid var(--accent-teal)',
    color: 'var(--accent-teal)',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '0.9rem',
    marginLeft: '4px',
  };

  const controlButtonStyle = {
    ...buttonStyle,
    fontSize: isMobile ? '1rem' : '0.85rem',
    padding: isMobile ? '8px 12px' : '6px 12px',
  };

  // Single LiveKitRoom instance that persists across minimize/maximize/hide states
  // Wrap everything in LiveKitRoom so we have ONE connection only
  return (
    <LiveKitCallRoom
      token={voiceCall.livekitToken}
      url={voiceCall.livekitUrl}
      roomName={voiceCall.roomName}
      voiceCall={voiceCall}
    >
      {/* Dock window UI */}
      <div ref={windowRef} style={containerStyle}>
        {/* Header */}
        <div
          style={headerStyle}
          onMouseDown={isMobile ? undefined : handleMouseDown}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ color: 'var(--accent-teal)', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
              {voiceCall.dockMinimized ? '🎤 In Call' : '📞 Call'} • {voiceCall.participants.length || 0} participant{voiceCall.participants.length !== 1 ? 's' : ''}
            </span>
            {voiceCall.audioLevel > 0.3 && (
              <span style={{ color: 'var(--accent-green)', fontSize: '0.7rem' }}>●</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: voiceCall.dockMinimized ? '6px' : '4px', alignItems: 'center' }}>
            {voiceCall.dockMinimized && (
              <>
                <button
                  style={controlButtonStyle}
                  onClick={handleToggleMute}
                  data-draggable="false"
                  title={voiceCall.isMuted ? 'Unmute' : 'Mute'}
                >
                  {voiceCall.isMuted ? '🔇' : '🎤'}
                </button>
                <button
                  style={controlButtonStyle}
                  onClick={handleToggleCamera}
                  data-draggable="false"
                  title={voiceCall.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {voiceCall.isCameraOff ? '📹' : '📷'}
                </button>
                <button
                  style={controlButtonStyle}
                  onClick={handleLeaveCall}
                  data-draggable="false"
                  title="Leave call"
                >
                  📞
                </button>
              </>
            )}
            {!voiceCall.dockMinimized && (
              <button
                style={buttonStyle}
                onClick={handleToggleFullscreen}
                data-draggable="false"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? '⊡' : '⛶'}
              </button>
            )}
            {!isFullscreen && (
              <button
                style={buttonStyle}
                onClick={handleToggleSize}
                data-draggable="false"
                title={voiceCall.dockMinimized ? 'Maximize' : 'Minimize'}
              >
                {voiceCall.dockMinimized ? '□' : '_'}
              </button>
            )}
            <button
              style={buttonStyle}
              onClick={isFullscreen ? handleToggleFullscreen : handleClose}
              data-draggable="false"
              title={isFullscreen ? 'Exit fullscreen' : 'Close dock'}
            >
              ×
            </button>
          </div>
        </div>

        {/* Video tiles area - only shown when maximized or fullscreen */}
        {(isFullscreen || !voiceCall.dockMinimized) && (
          <>
            <div style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--bg-primary)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '8px',
              alignContent: 'flex-start',
            }}>
              <VideoTiles />
            </div>

            {/* Controls footer */}
            <div style={{
              padding: isMobile ? '12px' : '10px',
              background: 'var(--bg-hover)',
              borderTop: '1px solid var(--accent-teal)',
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
            }}>
              <button
                style={{
                  ...controlButtonStyle,
                  background: voiceCall.isMuted ? 'var(--accent-red)' : 'transparent',
                  borderColor: voiceCall.isMuted ? 'var(--accent-red)' : 'var(--accent-teal)',
                  color: voiceCall.isMuted ? 'var(--text-primary)' : 'var(--accent-teal)',
                }}
                onClick={handleToggleMute}
              >
                {voiceCall.isMuted ? '🔇 Muted' : '🎤 Mute'}
              </button>
              <button
                style={{
                  ...controlButtonStyle,
                  background: voiceCall.isCameraOff ? 'var(--accent-amber)' : 'transparent',
                  borderColor: voiceCall.isCameraOff ? 'var(--accent-amber)' : 'var(--accent-teal)',
                  color: voiceCall.isCameraOff ? 'var(--text-primary)' : 'var(--accent-teal)',
                }}
                onClick={handleToggleCamera}
              >
                {voiceCall.isCameraOff ? '📹 Camera Off' : '📷 Camera On'}
              </button>
              <button
                style={{
                  ...controlButtonStyle,
                  background: voiceCall.isScreenSharing ? 'var(--accent-green)' : 'transparent',
                  borderColor: voiceCall.isScreenSharing ? 'var(--accent-green)' : 'var(--accent-teal)',
                  color: voiceCall.isScreenSharing ? 'var(--text-primary)' : 'var(--accent-teal)',
                }}
                onClick={handleToggleScreenShare}
              >
                {voiceCall.isScreenSharing ? '🖥️ Stop Share' : '🖥️ Share'}
              </button>
              <button
                style={{
                  ...controlButtonStyle,
                  background: 'var(--accent-red)',
                  borderColor: 'var(--accent-red)',
                  color: 'var(--text-primary)',
                }}
                onClick={handleLeaveCall}
              >
                📞 Leave
              </button>
            </div>
          </>
        )}
      </div>
    </LiveKitCallRoom>
  );
};

// Video tiles component with focus capability
const VideoTiles = () => {
  const [focusedTrackId, setFocusedTrackId] = useState(null);

  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  // Filter for tracks that are actually enabled and publishing
  const activeTracks = tracks.filter(trackRef => {
    const track = trackRef.publication?.track;
    return track && !track.isMuted && trackRef.publication?.isSubscribed;
  });

  // Handle click to focus/unfocus
  const handleTrackClick = (trackId) => {
    setFocusedTrackId(prev => prev === trackId ? null : trackId);
  };

  if (activeTracks.length === 0) {
    return (
      <div style={{ padding: '20px', color: 'var(--text-dim)', textAlign: 'center', width: '100%' }}>
        No video tracks yet
      </div>
    );
  }

  // Find focused track
  const focusedTrack = focusedTrackId
    ? activeTracks.find(t => t.publication.trackSid === focusedTrackId)
    : null;
  const otherTracks = focusedTrack
    ? activeTracks.filter(t => t.publication.trackSid !== focusedTrackId)
    : activeTracks;

  // If there's a focused track, show it large with thumbnails
  if (focusedTrack) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
        {/* Focused video - main area */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: 'var(--bg-base)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: '2px solid var(--accent-teal)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
          onClick={() => handleTrackClick(focusedTrackId)}
          title="Click to unfocus"
        >
          <ParticipantTile
            trackRef={focusedTrack}
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
            }}
          />
          {/* Unfocus hint */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(0,0,0,0.6)',
            color: 'var(--accent-teal)',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.7rem',
            fontFamily: 'monospace',
          }}>
            Click to unfocus
          </div>
        </div>

        {/* Thumbnail strip */}
        {otherTracks.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            height: '100px',
            flexShrink: 0,
          }}>
            {otherTracks.map((trackRef) => (
              <div
                key={trackRef.publication.trackSid}
                style={{
                  width: '140px',
                  height: '100%',
                  position: 'relative',
                  cursor: 'pointer',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  background: 'var(--bg-surface)',
                }}
                onClick={() => handleTrackClick(trackRef.publication.trackSid)}
                title="Click to focus"
              >
                <ParticipantTile
                  trackRef={trackRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'transparent',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // No focused track - show grid layout
  // Calculate grid based on number of tracks
  const getGridStyle = (count) => {
    if (count === 1) {
      return { gridTemplateColumns: '1fr' };
    } else if (count === 2) {
      return { gridTemplateColumns: '1fr 1fr' };
    } else if (count <= 4) {
      return { gridTemplateColumns: '1fr 1fr' };
    } else {
      return { gridTemplateColumns: 'repeat(3, 1fr)' };
    }
  };

  return (
    <div style={{
      display: 'grid',
      ...getGridStyle(activeTracks.length),
      gap: '8px',
      height: '100%',
      alignContent: 'center',
    }}>
      {activeTracks.map((trackRef) => {
        const isScreenShare = trackRef.source === Track.Source.ScreenShare;
        return (
          <div
            key={trackRef.publication.trackSid}
            style={{
              position: 'relative',
              aspectRatio: isScreenShare ? '16/9' : '4/3',
              minHeight: '120px',
              maxHeight: activeTracks.length === 1 ? '100%' : '300px',
              cursor: 'pointer',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              overflow: 'hidden',
              background: 'var(--bg-surface)',
            }}
            onClick={() => handleTrackClick(trackRef.publication.trackSid)}
            title="Click to focus"
          >
            <ParticipantTile
              trackRef={trackRef}
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
              }}
            />
            {/* Source label */}
            <div style={{
              position: 'absolute',
              bottom: '4px',
              left: '4px',
              background: 'rgba(0,0,0,0.6)',
              color: 'var(--text-secondary)',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '0.65rem',
              fontFamily: 'monospace',
            }}>
              {isScreenShare ? '🖥️ Screen' : '📷 Camera'} • {trackRef.participant?.name || trackRef.participant?.identity || 'Unknown'}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DockedCallWindow;
