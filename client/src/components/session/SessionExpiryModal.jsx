import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAPI.js';
import { SESSION } from '../../../messages.js';

function SessionExpiryModal() {
  const { sessionExpiresAt, refreshSession, dismissSessionWarning, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [sessionDuration, setSessionDuration] = useState('24h');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const inputRef = useRef(null);

  const isExpired = sessionExpiresAt && Date.now() >= sessionExpiresAt;

  // Auto-focus password input
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!sessionExpiresAt) return;

    const updateCountdown = () => {
      const remaining = sessionExpiresAt - Date.now();
      if (remaining <= 0) {
        setTimeRemaining('0:00');
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [sessionExpiresAt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await refreshSession(password, sessionDuration);
      setPassword('');
    } catch (err) {
      setError(err.message || 'Failed to extend session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleDismiss = () => {
    if (!isExpired) dismissSessionWarning();
  };

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
  };

  const contentStyle = {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--accent-amber, var(--accent-orange))',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 0 30px rgba(255, 210, 63, 0.15)'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--border-secondary)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: '14px',
    marginBottom: '12px',
    boxSizing: 'border-box'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: 'var(--accent-amber, var(--accent-orange))',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--bg-base)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: isLoading ? 'wait' : 'pointer',
    opacity: isLoading ? 0.7 : 1,
    letterSpacing: '0.5px'
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23888\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '36px',
    cursor: 'pointer'
  };

  return (
    <div style={modalStyle} onClick={!isExpired ? handleDismiss : undefined}>
      <div style={contentStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ color: 'var(--accent-amber, var(--accent-orange))', marginBottom: '4px', fontSize: '20px', marginTop: 0 }}>
          {isExpired ? SESSION.expired : SESSION.expiring}
        </h2>

        {!isExpired && timeRemaining && (
          <div style={{
            color: 'var(--accent-amber, var(--accent-orange))',
            fontSize: '24px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            marginBottom: '12px',
            letterSpacing: '2px'
          }}>
            {timeRemaining} remaining
          </div>
        )}

        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
          {isExpired ? SESSION.expiredMessage : SESSION.expiringMessage}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            style={inputStyle}
            autoComplete="current-password"
            disabled={isLoading}
          />

          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '6px', letterSpacing: '1px' }}>
            {SESSION.selectDuration}
          </label>
          <select
            value={sessionDuration}
            onChange={e => setSessionDuration(e.target.value)}
            style={selectStyle}
            disabled={isLoading}
          >
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>

          {error && (
            <div style={{
              backgroundColor: 'var(--overlay-red, rgba(255,0,0,0.1))',
              padding: '10px 12px',
              borderRadius: '4px',
              marginBottom: '12px',
              border: '1px solid var(--accent-red, #ff4444)'
            }}>
              <p style={{ color: 'var(--accent-red, #ff4444)', fontSize: '13px', margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <button type="submit" style={buttonStyle} disabled={isLoading || !password}>
            {isLoading ? SESSION.extending : SESSION.extendSession}
          </button>
        </form>

        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
            fontSize: '13px',
            cursor: 'pointer',
            marginTop: '12px'
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

export default SessionExpiryModal;
