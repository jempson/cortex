// ============ LIVEKIT VOICE CALL SERVICE (v2.6.0) ============
// Singleton service for managing LiveKit voice/video calls
// This lives outside React's component lifecycle, enabling persistent calls across navigation

import { BASE_URL } from '../config/constants.js';

class VoiceCallService {
  constructor() {
    // LiveKit connection
    this.room = null;
    this.livekitToken = null;
    this.livekitUrl = null;
    this.currentWaveId = null;

    // Connection state
    this.connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.participants = [];
    this.error = null;

    // Audio/Video state
    this.isMuted = false;
    this.isCameraOff = true; // Camera off by default
    this.audioLevel = 0;

    // Server call status
    this.callActive = false;
    this.serverParticipantCount = 0;
    this.activeCallWaveId = null; // Track which wave has an active call

    // Device management
    this.audioDevices = [];
    this.videoDevices = [];
    this.selectedMic = localStorage.getItem('farhold_mic_device') || 'default';
    this.selectedCamera = localStorage.getItem('farhold_camera_device') || 'default';
    this.selectedSpeaker = localStorage.getItem('farhold_speaker_device') || 'default';

    // Subscriber pattern for React components
    this.subscribers = new Set();

    // Intervals
    this.audioLevelInterval = null;
    this.statusPollInterval = null;

    // Auth token (set by React component)
    this.authToken = null;

    // Dock state (v2.6.1)
    this.isDocked = false;
    this.dockMinimized = true;
    this.dockPosition = this.loadDockPosition();

    // Enumerate devices on initialization
    this.enumerateDevices();

    // Listen for device changes
    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () => this.enumerateDevices());
    }
  }

  // ============ SUBSCRIBER PATTERN ============
  subscribe(callback) {
    this.subscribers.add(callback);
    // Immediately notify new subscriber of current state
    callback(this.getState());
    // Return unsubscribe function
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    const state = this.getState();
    this.subscribers.forEach(callback => callback(state));
  }

  getState() {
    return {
      connectionState: this.connectionState,
      participants: this.participants,
      isMuted: this.isMuted,
      isCameraOff: this.isCameraOff,
      audioLevel: this.audioLevel,
      error: this.error,
      livekitToken: this.livekitToken,
      livekitUrl: this.livekitUrl,
      roomName: this.currentWaveId,
      callActive: this.callActive,
      serverParticipantCount: this.serverParticipantCount,
      activeCallWaveId: this.activeCallWaveId,
      audioDevices: this.audioDevices,
      videoDevices: this.videoDevices,
      selectedMic: this.selectedMic,
      selectedCamera: this.selectedCamera,
      selectedSpeaker: this.selectedSpeaker,
      isDocked: this.isDocked,
      dockMinimized: this.dockMinimized,
      dockPosition: this.dockPosition,
    };
  }

  // ============ DEVICE MANAGEMENT ============
  async enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      this.audioDevices = [...audioInputs, ...audioOutputs];
      this.videoDevices = videoInputs;
      this.notifySubscribers();
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }

  changeMic(deviceId) {
    this.selectedMic = deviceId;
    localStorage.setItem('farhold_mic_device', deviceId);
    this.notifySubscribers();
    // TODO: If in call, update the active track
  }

  changeCamera(deviceId) {
    this.selectedCamera = deviceId;
    localStorage.setItem('farhold_camera_device', deviceId);
    this.notifySubscribers();
    // TODO: If in call, update the active track
  }

  changeSpeaker(deviceId) {
    this.selectedSpeaker = deviceId;
    localStorage.setItem('farhold_speaker_device', deviceId);
    this.notifySubscribers();
    // TODO: If in call, update the audio output
  }

  // ============ AUTHENTICATION ============
  setAuthToken(token) {
    this.authToken = token;
  }

  // ============ SERVER API CALLS ============
  async fetchToken(waveId) {
    if (!this.authToken || !waveId) {
      this.error = 'Authentication required';
      this.notifySubscribers();
      return null;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/waves/${waveId}/call/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Failed to get call token');
      }

      const data = await response.json();
      console.log('🎤 [Service] Received LiveKit token:', { url: data.url, roomName: data.roomName });
      return data;
    } catch (err) {
      console.error('Error fetching LiveKit token:', err);
      this.error = err.message || 'Failed to connect to call';
      this.notifySubscribers();
      return null;
    }
  }

  async checkCallStatus(waveId) {
    if (!this.authToken || !waveId) return;

    try {
      const response = await fetch(`${BASE_URL}/api/waves/${waveId}/call/status`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.callActive = data.active;
        this.serverParticipantCount = data.participantCount || 0;
        this.activeCallWaveId = data.active ? waveId : null; // Track which wave has the call
        this.notifySubscribers();
      }
    } catch (err) {
      console.error('Error checking call status:', err);
    }
  }

  // ============ CALL MANAGEMENT ============
  async startCall(waveId, withVideo = false) {
    // Disconnect from any existing call first
    if (this.connectionState !== 'disconnected') {
      console.warn('🎤 [Service] Already in a call, disconnecting first...');
      await this.leaveCall();
    }

    this.connectionState = 'connecting';
    this.currentWaveId = waveId;
    this.error = null;

    // Set camera state before connecting
    if (withVideo) {
      console.log('🎥 [Service] Starting video call - camera will be enabled');
      this.isCameraOff = false;
    } else {
      console.log('🎤 [Service] Starting voice call - camera will be disabled');
      this.isCameraOff = true;
    }

    this.notifySubscribers();

    const tokenData = await this.fetchToken(waveId);
    if (!tokenData) {
      this.connectionState = 'disconnected';
      this.notifySubscribers();
      return;
    }

    this.livekitToken = tokenData.token;
    this.livekitUrl = tokenData.url;
    this.notifySubscribers();

    console.log(`🎤 [Service] Starting ${withVideo ? 'video' : 'voice'} call...`);

    // Auto-dock call (v2.6.1) - calls start in docked mode by default
    this.showDock();

    // Start polling call status
    this.startStatusPolling(waveId);
  }

  async leaveCall() {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    this.connectionState = 'disconnected';
    this.livekitToken = null;
    this.livekitUrl = null;
    this.currentWaveId = null;
    this.participants = [];
    this.audioLevel = 0;
    this.error = null;

    // Hide dock when leaving call
    this.hideDock();

    this.stopStatusPolling();
    this.notifySubscribers();

    console.log('🎤 [Service] Left call');
  }

  // ============ AUDIO/VIDEO CONTROLS ============
  toggleMute() {
    this.isMuted = !this.isMuted;
    this.notifySubscribers();
    console.log(`🎤 [Service] Mute toggled: ${this.isMuted ? 'MUTED' : 'UNMUTED'}`);
    // Note: Actual mute/unmute happens in LiveKitCallRoom component via LiveKit API
  }

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    this.notifySubscribers();
    console.log(`🎥 [Service] Camera toggled: ${this.isCameraOff ? 'OFF' : 'ON'}`);
    // Note: Actual camera on/off happens in LiveKitCallRoom component via LiveKit API
  }

  // ============ LIVEKIT ROOM CALLBACKS ============
  // These are called by the LiveKitCallRoom component
  setConnectionState(state) {
    this.connectionState = state;
    this.notifySubscribers();
  }

  setParticipants(participants) {
    this.participants = participants;
    this.notifySubscribers();
  }

  setAudioLevel(level) {
    this.audioLevel = level;
    this.notifySubscribers();
  }

  setRoom(room) {
    this.room = room;
  }

  // ============ STATUS POLLING ============
  startStatusPolling(waveId) {
    // Initial check
    this.checkCallStatus(waveId);

    // Poll every 5 seconds
    this.statusPollInterval = setInterval(() => {
      if (this.currentWaveId) {
        this.checkCallStatus(this.currentWaveId);
      }
    }, 5000);
  }

  stopStatusPolling() {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
    }
  }

  // ============ DOCK MANAGEMENT (v2.6.1) ============
  showDock() {
    this.isDocked = true;
    this.notifySubscribers();
    console.log('🪟 [Service] Dock shown');
  }

  hideDock() {
    this.isDocked = false;
    this.notifySubscribers();
    console.log('🪟 [Service] Dock hidden');
  }

  toggleDockSize() {
    this.dockMinimized = !this.dockMinimized;
    this.notifySubscribers();
    console.log(`🪟 [Service] Dock ${this.dockMinimized ? 'minimized' : 'maximized'}`);
  }

  setDockPosition(pos) {
    this.dockPosition = pos;
    localStorage.setItem('farhold_dock_position', JSON.stringify(pos));
    this.notifySubscribers();
  }

  loadDockPosition() {
    try {
      const saved = localStorage.getItem('farhold_dock_position');
      if (saved) {
        const pos = JSON.parse(saved);
        // Validate position is on-screen
        if (pos.x >= 0 && pos.y >= 0 && pos.x < window.innerWidth && pos.y < window.innerHeight) {
          return pos;
        }
      }
    } catch (e) {
      console.warn('Failed to load dock position from localStorage:', e);
    }

    // Default: bottom-right corner
    return {
      x: Math.max(0, window.innerWidth - 420),
      y: Math.max(0, window.innerHeight - 620),
      width: 400,
      height: 600
    };
  }

  // ============ CLEANUP ============
  cleanup() {
    if (this.room) {
      this.room.disconnect();
    }
    this.stopStatusPolling();
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
    }
  }
}

// Export singleton instance
export const voiceCallService = new VoiceCallService();
