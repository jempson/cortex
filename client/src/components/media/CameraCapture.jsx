import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * CameraCapture Component (v2.7.3)
 *
 * Captures photos from the camera for image upload.
 * Uses fixed overlay for expanded mode to ensure controls visibility on all screens.
 *
 * Props:
 * - onCapture: (file) => void - Callback with captured image file
 * - onCancel: () => void - Cancel callback
 * - isMobile: boolean
 */
const CameraCapture = ({ onCapture, onCancel, isMobile }) => {
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('default');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Enumerate available video devices
  const enumerateDevices = useCallback(async () => {
    try {
      // First request permission to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(track => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setError('Camera permission denied. Please allow camera access.');
      }
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    setError(null);
    setPermissionDenied(false);

    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const videoConstraints = selectedCamera === 'default'
        ? { facingMode: isMobile ? 'environment' : 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { deviceId: { exact: selectedCamera }, width: { ideal: 1920 }, height: { ideal: 1080 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsStreamActive(true);
    } catch (err) {
      console.error('Failed to start camera:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setError('Camera permission denied. Please allow camera access.');
      } else {
        setError(err.message || 'Failed to access camera');
      }
    }
  }, [selectedCamera, isMobile]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamActive(false);
  }, []);

  // Initialize camera on mount
  useEffect(() => {
    enumerateDevices();
    startCamera();
    return () => stopCamera();
  }, []);

  // Restart camera when device changes
  useEffect(() => {
    if (isStreamActive && !previewUrl) {
      startCamera();
    }
  }, [selectedCamera]);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  }, [stopCamera]);

  // Retake photo
  const retakePhoto = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setCapturedBlob(null);
    startCamera();
  }, [previewUrl, startCamera]);

  // Use captured photo
  const usePhoto = useCallback(() => {
    if (capturedBlob && onCapture) {
      // Create a File object from the blob
      const file = new File([capturedBlob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
    }
  }, [capturedBlob, onCapture]);

  // Cancel and close
  const handleCancel = useCallback(() => {
    stopCamera();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (onCancel) onCancel();
  }, [stopCamera, previewUrl, onCancel]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  // Toggle expanded mode (fixed overlay instead of browser fullscreen)
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

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

  const viewfinderContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: isExpanded ? 1 : 'none',
    minHeight: isExpanded ? 0 : 'auto', // Allow shrinking in flex
    overflow: 'hidden',
    marginBottom: isExpanded ? 0 : '12px',
    padding: isExpanded ? '8px' : 0,
  };

  const viewfinderStyle = {
    width: '100%',
    height: isExpanded ? '100%' : 'auto',
    maxWidth: isExpanded ? '100%' : '400px',
    maxHeight: isExpanded ? '100%' : (isMobile ? '50vh' : '400px'),
    borderRadius: isExpanded ? '4px' : '8px',
    background: '#000',
    objectFit: 'contain', // Show full image without cropping
    display: 'block',
    cursor: 'pointer',
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

  const captureButtonStyle = {
    ...buttonStyle,
    background: 'var(--accent-green)',
    color: '#fff',
    border: '1px solid var(--accent-green)',
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
  };

  const useButtonStyle = {
    ...buttonStyle,
    background: 'var(--accent-amber)20',
    color: 'var(--accent-amber)',
    border: '1px solid var(--accent-amber)',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ color: isExpanded ? '#fff' : 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>
          Take Photo
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
              title="Camera Settings"
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
            Camera Settings
          </div>

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
              disabled={!!previewUrl}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                cursor: previewUrl ? 'not-allowed' : 'pointer',
                opacity: previewUrl ? 0.6 : 1,
              }}
            >
              <option value="default">{isMobile ? 'Back Camera' : 'Default Camera'}</option>
              {videoDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
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
              Please check your browser settings to allow camera access.
            </div>
          )}
        </div>
      )}

      {/* Viewfinder / Preview */}
      <div style={viewfinderContainerStyle}>
        {!previewUrl ? (
          <video
            ref={videoRef}
            style={viewfinderStyle}
            onClick={toggleExpanded}
            muted
            playsInline
            autoPlay
          />
        ) : (
          <img
            src={previewUrl}
            style={viewfinderStyle}
            onClick={toggleExpanded}
            alt="Captured photo"
          />
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Controls */}
      <div style={controlsStyle}>
        {!previewUrl ? (
          <>
            <button
              style={captureButtonStyle}
              onClick={capturePhoto}
              disabled={!isStreamActive}
            >
              📷 Capture
            </button>
            <button style={secondaryButtonStyle} onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button style={secondaryButtonStyle} onClick={retakePhoto}>
              🔄 Retake
            </button>
            <button style={useButtonStyle} onClick={usePhoto}>
              📤 Use Photo
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
