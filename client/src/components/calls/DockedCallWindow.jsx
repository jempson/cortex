import React, { useRef, useCallback } from 'react';
import { LiveKitRoom, useParticipants, useLocalParticipant, RoomAudioRenderer, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useDraggable } from '../../hooks/useDraggable.js';
import { Avatar } from '../ui/SimpleComponents.jsx';

// Reuse LiveKitCallRoom from CallModal
const LiveKitCallRoom = React.memo(({ token, url, roomName, voiceCall, children }) => {
  const handleConnected = useCallback(() => {
    console.log('🎤 Connected to LiveKit room:', roomName);
    voiceCall.setConnectionState('connected');
  }, [roomName, voiceCall]);

  const handleDisconnected = useCallback(() => {
    console.log('🎤 Disconnected from LiveKit room');
    voiceCall.setConnectionState('disconnected');
  }, [voiceCall]);

  const handleError = useCallback((error) => {
    console.error('🎤 LiveKit error:', error);
    voiceCall.setConnectionState('disconnected');
  }, [voiceCall]);

  if (!token || !url) return null;

  const audioDeviceId = voiceCall.selectedMic !== 'default' ? voiceCall.selectedMic : undefined;
  const videoDeviceId = voiceCall.selectedCamera !== 'default' ? voiceCall.selectedCamera : undefined;

  return (
    <LiveKitRoom
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
        setParticipants={voiceCall.setParticipants}
        setAudioLevel={voiceCall.setAudioLevel}
        setRoom={voiceCall.setRoom}
      />
      {children}
    </LiveKitRoom>
  );
});

// Call controls that sync with LiveKit
const CallControls = ({ isMuted, isCameraOff, setParticipants, setAudioLevel, setRoom }) => {
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

  return null;
};

// Main DockedCallWindow component
const DockedCallWindow = ({ voiceCall, isMobile, user }) => {
  const windowRef = useRef(null);

  const handlePositionChange = useCallback((newPos) => {
    voiceCall.setDockPosition(newPos);
  }, [voiceCall]);

  const { position, isDragging, handleMouseDown } = useDraggable(windowRef, {
    onPositionChange: handlePositionChange,
    initialPosition: voiceCall.dockPosition,
    disabled: isMobile
  });

  const handleClose = useCallback(() => {
    voiceCall.hideDock();
  }, [voiceCall]);

  const handleToggleSize = useCallback(() => {
    voiceCall.toggleDockSize();
  }, [voiceCall]);

  const handleToggleMute = useCallback(() => {
    voiceCall.toggleMute();
  }, [voiceCall]);

  const handleToggleCamera = useCallback(() => {
    voiceCall.toggleCamera();
  }, [voiceCall]);

  const handleLeaveCall = useCallback(() => {
    voiceCall.leaveCall();
  }, [voiceCall]);

  // Mobile: fixed bottom position
  const containerStyle = isMobile ? {
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
  };

  const headerStyle = {
    padding: isMobile ? '8px 12px' : '10px 14px',
    background: 'var(--bg-hover)',
    borderBottom: '1px solid var(--accent-teal)',
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

  // Minimized state
  if (voiceCall.dockMinimized) {
    return (
      <div ref={windowRef} style={containerStyle}>
        <div
          style={headerStyle}
          onMouseDown={isMobile ? undefined : handleMouseDown}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ color: 'var(--accent-teal)', fontSize: isMobile ? '0.9rem' : '0.85rem' }}>
              🎤 In Call • {voiceCall.participants.length || 0} participant{voiceCall.participants.length !== 1 ? 's' : ''}
            </span>
            {voiceCall.audioLevel > 0.3 && (
              <span style={{ color: 'var(--accent-green)', fontSize: '0.7rem' }}>●</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
            <button
              style={buttonStyle}
              onClick={handleToggleSize}
              data-draggable="false"
              title="Maximize"
            >
              □
            </button>
            <button
              style={buttonStyle}
              onClick={handleClose}
              data-draggable="false"
              title="Close dock"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Maximized state
  const participants = useParticipants();

  return (
    <div ref={windowRef} style={containerStyle}>
      {/* Header */}
      <div
        style={headerStyle}
        onMouseDown={isMobile ? undefined : handleMouseDown}
      >
        <div style={{ color: 'var(--accent-teal)', fontSize: isMobile ? '0.9rem' : '0.85rem', fontWeight: 500 }}>
          📞 Call • {voiceCall.participants.length || 0} participant{voiceCall.participants.length !== 1 ? 's' : ''}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            style={buttonStyle}
            onClick={handleToggleSize}
            data-draggable="false"
            title="Minimize"
          >
            _
          </button>
          <button
            style={buttonStyle}
            onClick={handleClose}
            data-draggable="false"
            title="Close dock"
          >
            ×
          </button>
        </div>
      </div>

      {/* Video tiles area */}
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
        {voiceCall.livekitToken && voiceCall.livekitUrl ? (
          <LiveKitCallRoom
            token={voiceCall.livekitToken}
            url={voiceCall.livekitUrl}
            roomName={voiceCall.roomName}
            voiceCall={voiceCall}
          >
            <VideoTiles />
          </LiveKitCallRoom>
        ) : (
          <div style={{ padding: '20px', color: 'var(--text-dim)', textAlign: 'center', width: '100%' }}>
            {voiceCall.connectionState === 'connecting' ? 'Connecting...' : 'No active call'}
          </div>
        )}
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
            background: 'var(--accent-red)',
            borderColor: 'var(--accent-red)',
            color: 'var(--text-primary)',
          }}
          onClick={handleLeaveCall}
        >
          📞 Leave
        </button>
      </div>
    </div>
  );
};

// Video tiles component
const VideoTiles = () => {
  const participants = useParticipants();

  if (participants.length === 0) {
    return (
      <div style={{ padding: '20px', color: 'var(--text-dim)', textAlign: 'center', width: '100%' }}>
        No participants yet
      </div>
    );
  }

  return (
    <>
      {participants.map((participant) => (
        <div
          key={participant.identity}
          style={{
            width: participants.length === 1 ? '100%' : 'calc(50% - 4px)',
            minHeight: '150px',
            position: 'relative',
          }}
        >
          <ParticipantTile
            participant={participant}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        </div>
      ))}
    </>
  );
};

export default DockedCallWindow;
