import { useState, useRef, useEffect, useCallback } from 'react';
import { BASE_URL } from '../config/constants.js';
import { useAuth } from './useAPI.js'; // Temporary import from useAPI

// ============ LIVEKIT VOICE CALL HOOK (v2.4.0) ============
export function useVoiceCall(waveId) {
  const { token } = useAuth();
  const [connectionState, setConnectionState] = useState('disconnected');
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true); // Camera off by default
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState(null);
  const [livekitToken, setLivekitToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [serverParticipantCount, setServerParticipantCount] = useState(0);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState(localStorage.getItem('farhold_mic_device') || 'default');
  const [selectedCamera, setSelectedCamera] = useState(localStorage.getItem('farhold_camera_device') || 'default');
  const [selectedSpeaker, setSelectedSpeaker] = useState(localStorage.getItem('farhold_speaker_device') || 'default');

  const roomRef = useRef(null);
  const audioLevelIntervalRef = useRef(null);
  const statusPollIntervalRef = useRef(null);

  // Fetch LiveKit token from server
  const fetchToken = useCallback(async () => {
    if (!token || !waveId) {
      setError('Authentication required');
      return null;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/waves/${waveId}/call/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Failed to get call token');
      }

      const data = await response.json();
      console.log('🎤 Received LiveKit token:', { url: data.url, roomName: data.roomName });
      return data;
    } catch (err) {
      console.error('Error fetching LiveKit token:', err);
      setError(err.message || 'Failed to connect to call');
      return null;
    }
  }, [waveId, token]);

  // Start call
  const startCall = useCallback(async (withVideo = false) => {
    if (connectionState !== 'disconnected') {
      console.warn('Already in a call');
      return;
    }

    setConnectionState('connecting');
    setError(null);

    // Set camera state before connecting
    if (withVideo) {
      console.log('🎥 Starting video call - camera will be enabled');
      setIsCameraOff(false);
    } else {
      console.log('🎤 Starting voice call - camera will be disabled');
      setIsCameraOff(true);
    }

    const tokenData = await fetchToken();
    if (!tokenData) {
      setConnectionState('disconnected');
      return;
    }

    setLivekitToken(tokenData.token);
    setLivekitUrl(tokenData.url);
    console.log(`🎤 Starting ${withVideo ? 'video' : 'voice'} call...`);
  }, [connectionState, fetchToken]);

  // Leave call
  const leaveCall = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    setConnectionState('disconnected');
    setLivekitToken(null);
    setLivekitUrl(null);
    setParticipants([]);
    setAudioLevel(0);
    setError(null);
    console.log('🎤 Left call');
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    setIsCameraOff(prev => {
      console.log(`🎥 toggleCamera: ${prev ? 'OFF' : 'ON'} -> ${prev ? 'ON' : 'OFF'}`);
      return !prev;
    });
  }, []);

  // Check call status from server
  const checkCallStatus = useCallback(async () => {
    if (!token || !waveId) return;

    try {
      const response = await fetch(`${BASE_URL}/api/waves/${waveId}/call/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCallActive(data.active);
        setServerParticipantCount(data.participantCount || 0);
      }
    } catch (err) {
      console.error('Error checking call status:', err);
    }
  }, [waveId, token]);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      setAudioDevices([...audioInputs, ...audioOutputs]);
      setVideoDevices(videoInputs);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }, []);

  // Device change handlers
  const changeMic = useCallback((deviceId) => {
    setSelectedMic(deviceId);
    localStorage.setItem('farhold_mic_device', deviceId);
  }, []);

  const changeCamera = useCallback((deviceId) => {
    setSelectedCamera(deviceId);
    localStorage.setItem('farhold_camera_device', deviceId);
  }, []);

  const changeSpeaker = useCallback((deviceId) => {
    setSelectedSpeaker(deviceId);
    localStorage.setItem('farhold_speaker_device', deviceId);
  }, []);

  // Enumerate devices on mount
  useEffect(() => {
    enumerateDevices();
    // Re-enumerate when devices change
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  // Poll call status - check more frequently when not in call
  useEffect(() => {
    if (!waveId) return;

    // Initial check
    checkCallStatus();

    // Poll every 5 seconds
    statusPollIntervalRef.current = setInterval(checkCallStatus, 5000);

    return () => {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
      }
    };
  }, [waveId, checkCallStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
      }
    };
  }, []);

  return {
    connectionState,
    participants,
    isMuted,
    isCameraOff,
    audioLevel,
    error,
    livekitToken,
    livekitUrl,
    roomName: waveId,
    callActive,
    serverParticipantCount,
    startCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    checkCallStatus,
    setConnectionState,
    setParticipants,
    setAudioLevel,
    roomRef,
    // Device management
    audioDevices,
    videoDevices,
    selectedMic,
    selectedCamera,
    selectedSpeaker,
    changeMic,
    changeCamera,
    changeSpeaker,
    enumerateDevices
  };
}
