import React, { useState, useRef, useCallback, useMemo } from 'react';
import { storage } from '../../utils/storage.js';

/**
 * VideoPlayer Component (v2.7.0)
 *
 * Custom video player with thumbnail preview, fullscreen support, and playback controls.
 *
 * Props:
 * - src: string - Video file URL
 * - duration: number - Duration in milliseconds (optional, for display before loading)
 * - isMobile: boolean
 */
const VideoPlayer = ({ src, duration: providedDuration, isMobile }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(providedDuration ? providedDuration / 1000 : 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Construct authenticated URL with token for media streaming
  const authenticatedSrc = useMemo(() => {
    if (!src) return '';
    const token = storage.getToken();
    if (!token) return src;
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}token=${encodeURIComponent(token)}`;
  }, [src]);

  // Format time as MM:SS
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Handle playback ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setShowControls(true);
  }, []);

  // Handle error
  const handleError = useCallback(() => {
    setError('Failed to load video');
    setIsLoading(false);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Handle seek
  const handleSeek = useCallback((e) => {
    if (!videoRef.current || !duration || !isFinite(duration)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    if (isFinite(newTime)) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if (containerRef.current.webkitRequestFullscreen) {
        containerRef.current.webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Handle mouse move to show/hide controls
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Handle click on video
  const handleVideoClick = useCallback(() => {
    togglePlay();
  }, [togglePlay]);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Styles
  const containerStyle = {
    position: 'relative',
    width: '100%',
    maxWidth: isFullscreen ? '100%' : '400px',
    background: 'var(--bg-primary)',
    borderRadius: isFullscreen ? 0 : '8px',
    overflow: 'hidden',
    border: isFullscreen ? 'none' : '1px solid var(--border-primary)',
  };

  const videoStyle = {
    width: '100%',
    display: 'block',
    background: '#000',
    cursor: 'pointer',
  };

  const overlayStyle = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    background: showControls ? 'linear-gradient(transparent 60%, rgba(0,0,0,0.7))' : 'transparent',
    opacity: showControls ? 1 : 0,
    transition: 'opacity 0.3s',
    pointerEvents: showControls ? 'auto' : 'none',
  };

  const playOverlayStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: isMobile ? '60px' : '50px',
    height: isMobile ? '60px' : '50px',
    borderRadius: '50%',
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    opacity: showControls && !isPlaying ? 1 : 0,
    transition: 'opacity 0.3s',
    color: 'white',
    fontSize: isMobile ? '1.5rem' : '1.2rem',
  };

  const controlsStyle = {
    padding: isMobile ? '12px' : '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };

  const progressBarStyle = {
    flex: 1,
    height: isMobile ? '8px' : '6px',
    background: 'rgba(255,255,255,0.3)',
    borderRadius: '3px',
    cursor: 'pointer',
    position: 'relative',
    overflow: 'hidden',
  };

  const progressFillStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: `${progressPercent}%`,
    background: 'var(--accent-green)',
    borderRadius: '3px',
  };

  const timeStyle = {
    fontSize: isMobile ? '0.7rem' : '0.65rem',
    color: 'white',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  };

  const buttonStyle = {
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '4px',
    fontSize: isMobile ? '1rem' : '0.85rem',
  };

  if (error) {
    return (
      <div style={{ ...containerStyle, padding: '20px', textAlign: 'center', color: 'var(--error-text)', fontSize: '0.8rem' }}>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={authenticatedSrc}
        style={videoStyle}
        preload="metadata"
        playsInline
        onClick={handleVideoClick}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
        }}>
          Loading...
        </div>
      )}

      {/* Play button overlay */}
      <div style={playOverlayStyle} onClick={togglePlay}>
        {'\u25B6'}
      </div>

      {/* Controls overlay */}
      <div style={overlayStyle}>
        <div style={controlsStyle}>
          {/* Play/Pause */}
          <button style={buttonStyle} onClick={togglePlay}>
            {isPlaying ? '||' : '\u25B6'}
          </button>

          {/* Progress bar */}
          <div style={progressBarStyle} onClick={handleSeek}>
            <div style={progressFillStyle} />
          </div>

          {/* Time */}
          <span style={timeStyle}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Fullscreen */}
          <button style={buttonStyle} onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? '\u2716' : '\u26F6'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
