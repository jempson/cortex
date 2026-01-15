import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config/constants.js';
import { storage } from '../utils/storage.js';
import { AuthContext } from '../hooks/useAPI.js';
import { LoadingSpinner } from '../components/ui/SimpleComponents.jsx';

function AuthProvider({ children }) {
  const [user, setUser] = useState(storage.getUser());
  const [token, setToken] = useState(storage.getToken());
  const [loading, setLoading] = useState(true);
  // Temporary password storage for E2EE unlock (cleared after use)
  const pendingPasswordRef = useRef(null);

  useEffect(() => {
    // Check for browser session timeout (24 hours for non-PWA browser tabs)
    if (token && storage.isSessionExpired()) {
      console.log('⏰ Browser session expired (24 hour limit for non-PWA). Logging out...');
      storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
      setToken(null); setUser(null);
      setLoading(false);
      return;
    }

    if (token) {
      fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
          if (res.ok) return res.json();
          // Clear session on 401 (invalid) or 403 (expired token/session)
          if (res.status === 401 || res.status === 403) {
            storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
            setToken(null); setUser(null);
          }
          // For other errors (network, 500, etc.), keep existing user data from localStorage
          return Promise.reject(new Error(`Auth check failed: ${res.status}`));
        })
        .then(userData => {
          setUser(userData);
          storage.setUser(userData); // Save to localStorage
        })
        .catch(err => {
          // Network errors - don't clear session, user may still have valid token
          // They can retry or the periodic check will handle it
          console.warn('Auth check failed, keeping cached session:', err.message);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  // Periodic session expiry check (every 5 minutes) for long-running tabs
  useEffect(() => {
    if (!token) return;

    const checkExpiry = () => {
      if (storage.isSessionExpired()) {
        console.log('⏰ Browser session expired during use. Logging out...');
        storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
        setToken(null); setUser(null);
      }
    };

    const interval = setInterval(checkExpiry, 5 * 60 * 1000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [token]);

  // Get pending password for E2EE unlock (one-time read, clears after access)
  const getPendingPassword = () => {
    const pwd = pendingPasswordRef.current;
    return pwd;
  };

  // Clear pending password after E2EE has used it
  const clearPendingPassword = () => {
    pendingPasswordRef.current = null;
  };

  const login = async (handle, password, sessionDuration = '24h') => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, password, sessionDuration }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    // Check if MFA is required
    if (data.mfaRequired) {
      // Store password for later E2EE unlock after MFA
      pendingPasswordRef.current = password;
      return { mfaRequired: true, mfaChallenge: data.mfaChallenge, mfaMethods: data.mfaMethods };
    }
    // Store password for E2EE unlock
    pendingPasswordRef.current = password;
    storage.setToken(data.token); storage.setUser(data.user);
    storage.setSessionStart(sessionDuration); // Start browser session timer with user's selected duration
    setToken(data.token); setUser(data.user);
    return { success: true };
  };

  const completeMfaLogin = async (challengeId, method, code) => {
    const res = await fetch(`${API_URL}/auth/mfa/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, method, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'MFA verification failed');
    // Note: MFA completion should use the duration from the original login attempt
    // For now, we'll use a safe default since the duration isn't passed through MFA flow
    const duration = storage.getSessionDuration() || '24h';
    storage.setToken(data.token); storage.setUser(data.user);
    storage.setSessionStart(duration); // Start browser session timer
    setToken(data.token); setUser(data.user);
    return { success: true };
  };

  const register = async (handle, email, password, displayName, sessionDuration = '24h') => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, email, password, displayName, sessionDuration }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    // Store password for E2EE setup
    pendingPasswordRef.current = password;
    storage.setToken(data.token); storage.setUser(data.user);
    storage.setSessionStart(sessionDuration); // Start browser session timer with user's selected duration
    setToken(data.token); setUser(data.user);
  };

  const logout = async () => {
    // Revoke session on server
    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout API error:', err);
      }
    }
    // Clear password and local storage
    pendingPasswordRef.current = null;
    storage.removeToken(); storage.removeUser(); storage.removeSessionStart();
    setToken(null); setUser(null);
  };

  const updateUser = (updates) => {
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    storage.setUser(updatedUser);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <AuthContext.Provider value={{ user, token, login, completeMfaLogin, register, logout, updateUser, getPendingPassword, clearPendingPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
