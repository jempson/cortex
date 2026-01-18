import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * MediaRecorder Component (v2.7.3)
 *
 * Records audio or video messages for pings.
 * Uses fixed overlay for expanded mode to ensure controls visibility on all screens.
 *
 * Props:
 * - type: 'audio' | 'video' - Recording type
 * - onRecordingComplete: (blob, duration) => void - Callback when recording is done
 * - onCancel: () => void - Cancel callback
 * - maxDuration: number - Max duration in seconds (default: 300 for audio, 120 for video)
 * - isMobile: boolean
 */
const MediaRecorder = ({ type = 'audio', onRecordingComplete, onCancel, maxDuration, isMobile }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState('default');
  const [selectedCamera, setSelectedCamera] = useState('default');
  const [isExpanded, setIsExpanded] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const startTimeRef = useRef(null);
  const mimeTypeRef = useRef(null);

  // Enumerate available media devices
  const enumerateDevices = useCallback(async () => {
    try {
      // First request permission to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      // Stop the temp stream immediately
      tempStream.getTracks().forEach(track => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');

      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      }
    }
  }, [type]);

  // Enumerate devices on mount
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Set default max duration based on type
  const maxDur = maxDuration || (type === 'audio' ? 300 : 120); // 5 min audio, 2 min video

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopMediaStream();
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  // Stop media stream
  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);

    try {
      // Build constraints with selected devices
      const audioConstraints = selectedMic === 'default'
        ? true
        : { deviceId: { exact: selectedMic } };

      const videoConstraints = type === 'video'
        ? selectedCamera === 'default'
          ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
          : { deviceId: { exact: selectedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : false;

      const constraints = type === 'video'
        ? { video: videoConstraints, audio: audioConstraints }
        : { audio: audioConstraints };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Show video preview if video recording
      if (type === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }

      // Create MediaRecorder - let browser use its defaults for best compatibility
      // Firefox has known issues with cross-browser video compatibility when we force MIME types
      let recorder;
      let mimeType;

      // For video, don't specify any options - let browser use defaults
      // For audio, we can specify webm which works well
      if (type === 'video') {
        // Try without any MIME type specification first (best Firefox compatibility)
        try {
          recorder = new window.MediaRecorder(stream);
          mimeType = recorder.mimeType || 'video/webm';
        } catch (e) {
          // Fallback to specifying video/webm
          mimeType = 'video/webm';
          recorder = new window.MediaRecorder(stream, { mimeType });
        }
      } else {
        // Audio works fine with explicit type
        mimeType = window.MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        recorder = new window.MediaRecorder(stream, { mimeType });
      }

      console.log(`MediaRecorder using MIME type: ${mimeType} (actual: ${recorder.mimeType})`);
      mimeTypeRef.current = recorder.mimeType || mimeType;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        console.log(`MediaRecorder stopped: chunks=${chunksRef.current.length}, mimeType=${mimeTypeRef.current}`);
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        console.log(`Blob created: type=${blob.type}, size=${blob.size}`);
        setRecordedBlob(blob);

        // Create preview URL
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);

        // Stop the stream
        stopMediaStream();

        // Clear video preview
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
      };

      recorder.start(1000); // Collect data every second
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // Auto-stop at max duration
        if (elapsed >= maxDur) {
          stopRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('MediaRecorder error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setError('Permission denied. Please allow microphone/camera access.');
      } else {
        setError(err.message || 'Failed to start recording');
      }
    }
  }, [type, maxDur, stopMediaStream, selectedMic, selectedCamera]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Pause/resume recording
  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, [isRecording, isPaused]);

  // Discard recording
  const discardRecording = useCallback(() => {
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setDuration(0);
    setError(null);
  }, [previewUrl]);

  // Send recording
  const sendRecording = useCallback(() => {
    if (recordedBlob && onRecordingComplete) {
      onRecordingComplete(recordedBlob, duration);
    }
  }, [recordedBlob, duration, onRecordingComplete]);

  // Cancel and close
  const handleCancel = useCallback(() => {
    stopRecording();
    stopMediaStream();
    discardRecording();
    if (onCancel) onCancel();
  }, [stopRecording, stopMediaStream, discardRecording, onCancel]);

  // Toggle expanded mode (for video only - fixed overlay instead of browser fullscreen)
  const toggleExpanded = useCallback(() => {
    if (type !== 'video') return;
    setIsExpanded(prev => !prev);
  }, [type]);

  // Styles - using fixed overlay for expanded mode to ensure controls visibility
  const expandedContainerStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 2000,
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
  };

  const normalContainerStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    padding: isMobile ? '16px' : '12px',
    marginBottom: '12px',
  };

  const containerStyle = isExpanded ? expandedContainerStyle : normalContainerStyle;

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isExpanded ? 0 : '12px',
    padding: isExpanded ? '12px 16px' : 0,
    background: isExpanded ? 'rgba(0,0,0,0.8)' : 'transparent',
    flexShrink: 0,
  };

  // Timer style - for video, always overlay on video; for audio, show below
  const videoTimerStyle = {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: isMobile ? '1.5rem' : '1.25rem',
    fontFamily: 'monospace',
    color: isRecording ? (isPaused ? 'var(--accent-amber)' : 'var(--accent-red)') : '#fff',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.6)',
    padding: '6px 16px',
    borderRadius: '4px',
    zIndex: 10,
  };

  const audioTimerStyle = {
    fontSize: isMobile ? '2rem' : '1.5rem',
    fontFamily: 'monospace',
    color: isRecording ? (isPaused ? 'var(--accent-amber)' : 'var(--accent-red)') : 'var(--text-primary)',
    textAlign: 'center',
    marginBottom: '12px',
  };

  const controlsStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: isExpanded ? '16px' : 0,
    background: isExpanded ? 'rgba(0,0,0,0.8)' : 'transparent',
    flexShrink: 0,
  };

  const buttonStyle = {
    padding: isMobile ? '12px 24px' : '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: isMobile ? '0.9rem' : '0.8rem',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const recordButtonStyle = {
    ...buttonStyle,
    background: isRecording ? 'var(--accent-red)' : 'var(--accent-green)',
    color: '#fff',
    border: `1px solid ${isRecording ? 'var(--accent-red)' : 'var(--accent-green)'}`,
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
  };

  const sendButtonStyle = {
    ...buttonStyle,
    background: 'var(--accent-amber)20',
    color: 'var(--accent-amber)',
    border: '1px solid var(--accent-amber)',
  };

  const videoPreviewContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: isExpanded ? 1 : 'none',
    minHeight: isExpanded ? 0 : 'auto', // Allow shrinking in flex
    overflow: 'hidden',
    marginBottom: isExpanded ? 0 : '12px',
    padding: isExpanded ? '8px' : 0,
    position: 'relative', // For timer overlay positioning
  };

  const previewStyle = {
    width: '100%',
    height: isExpanded ? '100%' : 'auto',
    maxWidth: isExpanded ? '100%' : (type === 'video' ? '400px' : '100%'),
    maxHeight: isExpanded ? '100%' : (isMobile ? '40vh' : '300px'),
    objectFit: 'contain',
    borderRadius: isExpanded ? '4px' : '4px',
    background: 'var(--bg-primary)',
    cursor: type === 'video' ? 'pointer' : 'default',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ color: isExpanded ? '#fff' : 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>
          {type === 'video' ? 'Record Video' : 'Record Audio'}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {type === 'video' && (
            <button
              onClick={toggleExpanded}
              style={{
                background: 'transparent',
                border: 'none',
                color: isExpanded ? '#fff' : 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '4px 6px',
                borderRadius: '4px',
              }}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '⊡' : '⛶'}
            </button>
          )}
          {!isExpanded && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: showSettings ? 'var(--bg-secondary)' : 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '4px 6px',
                borderRadius: '4px',
              }}
              title="Device Settings"
            >
              ⚙️
            </button>
          )}
          <button
            onClick={isExpanded ? toggleExpanded : handleCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: isExpanded ? '#fff' : 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '1.2rem',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Device Settings Panel */}
      {showSettings && !isExpanded && (
        <div style={{
          padding: '12px',
          background: 'var(--bg-secondary)',
          borderRadius: '6px',
          marginBottom: '12px',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color: 'var(--text-secondary)',
            marginBottom: '8px',
            fontFamily: 'monospace',
          }}>
            Device Settings
          </div>

          {/* Microphone Selection */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{
              display: 'block',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginBottom: '4px',
              fontFamily: 'monospace',
            }}>
              Microphone
            </label>
            <select
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              disabled={isRecording}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                cursor: isRecording ? 'not-allowed' : 'pointer',
                opacity: isRecording ? 0.6 : 1,
              }}
            >
              <option value="default">Default Microphone</option>
              {audioDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Camera Selection (only for video) */}
          {type === 'video' && (
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                marginBottom: '4px',
                fontFamily: 'monospace',
              }}>
                Camera
              </label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                disabled={isRecording}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  cursor: isRecording ? 'not-allowed' : 'pointer',
                  opacity: isRecording ? 0.6 : 1,
                }}
              >
                <option value="default">Default Camera</option>
                {videoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isRecording && (
            <div style={{
              fontSize: '0.65rem',
              color: 'var(--text-dim)',
              fontStyle: 'italic',
              marginTop: '8px',
            }}>
              Stop recording to change devices
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && !isExpanded && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--error-bg)',
          border: '1px solid var(--error-border)',
          borderRadius: '4px',
          color: 'var(--error-text)',
          fontSize: '0.8rem',
          marginBottom: '12px',
        }}>
          {error}
          {permissionDenied && (
            <div style={{ marginTop: '8px' }}>
              Please check your browser settings to allow {type === 'video' ? 'camera and microphone' : 'microphone'} access.
            </div>
          )}
        </div>
      )}

      {/* Video preview (live during recording or playback) */}
      {type === 'video' && (
        <div style={videoPreviewContainerStyle}>
          {!previewUrl ? (
            <video
              ref={videoPreviewRef}
              style={previewStyle}
              onClick={toggleExpanded}
              muted
              playsInline
            />
          ) : (
            <video
              src={previewUrl}
              style={previewStyle}
              onClick={toggleExpanded}
              controls
              playsInline
            />
          )}
          {/* Timer overlay - always positioned inside video container for video */}
          <div style={videoTimerStyle}>
            {isRecording && (
              <span style={{ display: 'inline-block', width: '12px', height: '12px', background: isPaused ? 'var(--accent-amber)' : 'var(--accent-red)', borderRadius: '50%', marginRight: '8px', animation: isPaused ? 'none' : 'pulse 1s infinite' }} />
            )}
            {formatDuration(duration)} / {formatDuration(maxDur)}
          </div>
        </div>
      )}

      {/* Audio preview */}
      {type === 'audio' && previewUrl && (
        <div style={{ marginBottom: '12px' }}>
          <audio src={previewUrl} controls style={{ width: '100%' }} />
        </div>
      )}

      {/* Timer - only shown for audio recordings */}
      {type === 'audio' && (
        <div style={audioTimerStyle}>
          {isRecording && (
            <span style={{ display: 'inline-block', width: '12px', height: '12px', background: isPaused ? 'var(--accent-amber)' : 'var(--accent-red)', borderRadius: '50%', marginRight: '8px', animation: isPaused ? 'none' : 'pulse 1s infinite' }} />
          )}
          {formatDuration(duration)} / {formatDuration(maxDur)}
        </div>
      )}

      {/* Controls */}
      <div style={controlsStyle}>
        {!previewUrl ? (
          // Recording controls
          <>
            {!isRecording ? (
              <button style={recordButtonStyle} onClick={startRecording}>
                {type === 'video' ? '🎥' : '🎤'} Start Recording
              </button>
            ) : (
              <>
                <button style={secondaryButtonStyle} onClick={togglePause}>
                  {isPaused ? '▶️ Resume' : '⏸️ Pause'}
                </button>
                <button style={recordButtonStyle} onClick={stopRecording}>
                  ⏹️ Stop
                </button>
              </>
            )}
            <button style={secondaryButtonStyle} onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : (
          // Preview controls
          <>
            <button style={secondaryButtonStyle} onClick={discardRecording}>
              🗑️ Discard
            </button>
            <button style={sendButtonStyle} onClick={sendRecording}>
              📤 Send {type === 'video' ? 'Video' : 'Audio'}
            </button>
          </>
        )}
      </div>

      {/* Recording indicator animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default MediaRecorder;
