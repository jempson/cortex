import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { storage } from '../../utils/storage.js';
import { Avatar } from '../ui/SimpleComponents.jsx';

/**
 * VideoFeedItem Component (v2.8.0)
 *
 * Individual video in the feed with full-screen display, author info overlay,
 * and action buttons.
 *
 * Props:
 * - video: Object containing video data from the feed API
 * - isActive: Boolean indicating if this video is currently visible
 * - onNavigateToWave: Function to navigate to the video's wave
 * - onShowProfile: Function to show author's profile
 * - onReact: Function to add a reaction
 * - isMobile: Boolean for mobile-specific styling
 * - showToast: Function to show toast messages
 */
const VideoFeedItem = ({
  video,
  isActive,
  onNavigateToWave,
  onShowProfile,
  onReact,
  isMobile,
  showToast,
  currentUserId,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.media_duration ? video.media_duration / 1000 : 0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(true);

  const videoRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  // Construct authenticated URL with token for media streaming
  const authenticatedSrc = useMemo(() => {
    if (!video.media_url) return '';
    const token = storage.getToken();
    if (!token) return video.media_url;
    const separator = video.media_url.includes('?') ? '&' : '?';
    return `${video.media_url}${separator}token=${encodeURIComponent(token)}`;
  }, [video.media_url]);

  // Auto-play/pause based on visibility
  useEffect(() => {
    if (!videoRef.current) return;

    if (isActive) {
      // Start playing when video becomes active
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked, that's ok
        setIsPlaying(false);
      });
      setIsPlaying(true);
    } else {
      // Pause when not active
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isActive]);

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

  // Handle playback ended - loop the video
  const handleEnded = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Handle error
  const handleError = useCallback(() => {
    setError('Failed to load video');
    setIsLoading(false);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback((e) => {
    e.stopPropagation();
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    } else {
      videoRef.current.play().catch(() => {
        showToast?.('Could not play video', 'error');
      });
      setIsPlaying(true);
    }
  }, [isPlaying, showToast]);

  // Toggle mute
  const toggleMute = useCallback((e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle tap on video - toggle play
  const handleVideoTap = useCallback(() => {
    if (showControls) {
      togglePlay({ stopPropagation: () => {} });
    }
    setShowControls(!showControls);

    // Auto-hide controls after 3 seconds
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [showControls, togglePlay, isPlaying]);

  // Navigate to the wave
  const handleViewWave = useCallback((e) => {
    e.stopPropagation();
    onNavigateToWave?.(video.wave_id, video.wave_title);
  }, [onNavigateToWave, video.wave_id, video.wave_title]);

  // Show author profile
  const handleShowProfile = useCallback((e) => {
    e.stopPropagation();
    onShowProfile?.(video.author_id);
  }, [onShowProfile, video.author_id]);

  // Quick reaction
  const handleReact = useCallback((e) => {
    e.stopPropagation();
    onReact?.(video.id, video.wave_id);
  }, [onReact, video.id, video.wave_id]);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Count total reactions and find user's reaction
  const totalReactions = Object.values(video.reactions || {}).reduce(
    (sum, users) => sum + (Array.isArray(users) ? users.length : 0),
    0
  );

  // Find if current user has reacted and what emoji they used
  const userReaction = Object.entries(video.reactions || {}).find(
    ([emoji, users]) => Array.isArray(users) && users.includes(currentUserId)
  );
  const userReactionEmoji = userReaction ? userReaction[0] : null;

  if (error) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        color: 'var(--text-muted)',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <span style={{ fontSize: '3rem' }}>⚠</span>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={handleVideoTap}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={authenticatedSrc}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
        }}
        preload="metadata"
        playsInline
        muted={isMuted}
        loop
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
          fontSize: '1rem',
        }}>
          Loading...
        </div>
      )}

      {/* Play/Pause indicator */}
      {showControls && !isLoading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '70px',
            height: '70px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            color: 'white',
            opacity: isPlaying ? 0 : 1,
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
          }}
        >
          {'\u25B6'}
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '200px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
          pointerEvents: 'none',
          opacity: showControls ? 1 : 0.5,
          transition: 'opacity 0.3s',
        }}
      />

      {/* Author info - bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: isMobile ? '80px' : '24px',
          left: '16px',
          right: '80px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          color: 'white',
          opacity: showControls ? 1 : 0.7,
          transition: 'opacity 0.3s',
        }}
      >
        {/* Author row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
          }}
          onClick={handleShowProfile}
        >
          <Avatar
            letter={video.author_avatar || video.author_name?.[0] || '?'}
            color="var(--accent-amber)"
            size={36}
            imageUrl={video.author_avatar_url}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {video.author_name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
              @{video.author_handle}
            </div>
          </div>
        </div>

        {/* Wave badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.75rem',
            alignSelf: 'flex-start',
          }}
          onClick={handleViewWave}
        >
          <span style={{ color: 'var(--accent-amber)' }}>◈</span>
          <span style={{ color: 'white' }}>{video.wave_title}</span>
          {video.wave_privacy === 'public' && (
            <span style={{ color: 'var(--accent-green)', fontSize: '0.65rem' }}>PUBLIC</span>
          )}
        </div>

        {/* Caption */}
        {video.content && (
          <div
            style={{
              fontSize: '0.85rem',
              lineHeight: 1.4,
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              maxHeight: '60px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            dangerouslySetInnerHTML={{ __html: video.content }}
          />
        )}
      </div>

      {/* Action buttons - right side */}
      <div
        style={{
          position: 'absolute',
          right: '12px',
          bottom: isMobile ? '120px' : '80px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          alignItems: 'center',
          opacity: showControls ? 1 : 0.7,
          transition: 'opacity 0.3s',
        }}
      >
        {/* React button */}
        <button
          onClick={handleReact}
          style={{
            background: userReactionEmoji ? 'rgba(255,215,63,0.3)' : 'rgba(255,255,255,0.2)',
            border: userReactionEmoji ? '1px solid var(--accent-amber)' : '1px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexDirection: 'column',
            backdropFilter: 'blur(4px)',
          }}
          title={userReactionEmoji ? 'Change reaction' : 'React'}
        >
          <span style={{ fontSize: userReactionEmoji ? '1.4rem' : '1.2rem', color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {userReactionEmoji || '+'}
          </span>
          {totalReactions > 0 && !userReactionEmoji && (
            <span style={{ fontSize: '0.6rem', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{totalReactions}</span>
          )}
        </button>

        {/* View wave button */}
        <button
          onClick={handleViewWave}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          title="View Wave"
        >
          <span style={{ fontSize: '1.3rem', color: 'var(--accent-amber)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>◈</span>
        </button>

        {/* Mute/Unmute button */}
        <button
          onClick={toggleMute}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          <span style={{ fontSize: '1.1rem' }}>{isMuted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      {/* Progress bar at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: isMobile ? '60px' : '0',
          left: 0,
          right: 0,
          height: '3px',
          background: 'rgba(255,255,255,0.3)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: 'var(--accent-amber)',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* Duration badge */}
      {duration > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: '4px',
            fontSize: '0.7rem',
            color: 'white',
            fontFamily: 'monospace',
          }}
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      )}
    </div>
  );
};

export default VideoFeedItem;
