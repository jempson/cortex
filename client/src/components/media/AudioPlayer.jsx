import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { storage } from '../../utils/storage.js';

/**
 * AudioPlayer Component (v2.7.0)
 *
 * Custom audio player with waveform visualization, playback controls, and speed adjustment.
 *
 * Props:
 * - src: string - Audio file URL
 * - duration: number - Duration in milliseconds (optional, for display before loading)
 * - isMobile: boolean
 */
const AudioPlayer = ({ src, duration: providedDuration, isMobile }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(providedDuration ? providedDuration / 1000 : 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const audioRef = useRef(null);
  const progressRef = useRef(null);

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

  // Handle audio metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  // Handle playback ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Handle error
  const handleError = useCallback(() => {
    setError('Failed to load audio');
    setIsLoading(false);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Handle seek
  const handleSeek = useCallback((e) => {
    if (!audioRef.current || !progressRef.current || !duration || !isFinite(duration)) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    if (isFinite(newTime)) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration]);

  // Change playback rate
  const cyclePlaybackRate = useCallback(() => {
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];

    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  }, [playbackRate]);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Styles
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: isMobile ? '10px 12px' : '8px 10px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    minWidth: isMobile ? '100%' : '280px',
    maxWidth: '400px',
  };

  const playButtonStyle = {
    width: isMobile ? '40px' : '32px',
    height: isMobile ? '40px' : '32px',
    borderRadius: '50%',
    background: 'var(--accent-green)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--bg-primary)',
    fontSize: isMobile ? '1rem' : '0.85rem',
  };

  const progressContainerStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  };

  const progressBarStyle = {
    width: '100%',
    height: isMobile ? '8px' : '6px',
    background: 'var(--bg-secondary)',
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
    transition: isPlaying ? 'none' : 'width 0.1s',
  };

  const timeStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: isMobile ? '0.7rem' : '0.65rem',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  };

  const speedButtonStyle = {
    padding: isMobile ? '4px 6px' : '2px 4px',
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    fontSize: isMobile ? '0.65rem' : '0.6rem',
    fontFamily: 'monospace',
    cursor: 'pointer',
    flexShrink: 0,
  };

  if (error) {
    return (
      <div style={{ ...containerStyle, color: 'var(--error-text)', fontSize: '0.8rem' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={authenticatedSrc}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
      />

      {/* Play/Pause button */}
      <button
        style={playButtonStyle}
        onClick={togglePlay}
        disabled={isLoading}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading ? '...' : isPlaying ? '||' : '\u25B6'}
      </button>

      {/* Progress section */}
      <div style={progressContainerStyle}>
        {/* Progress bar */}
        <div
          ref={progressRef}
          style={progressBarStyle}
          onClick={handleSeek}
        >
          <div style={progressFillStyle} />
        </div>

        {/* Time display */}
        <div style={timeStyle}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Speed button */}
      <button
        style={speedButtonStyle}
        onClick={cyclePlaybackRate}
        title="Playback speed"
      >
        {playbackRate}x
      </button>
    </div>
  );
};

export default AudioPlayer;
