import React, { useState } from 'react';
import { GHOST_PROTOCOL } from '../../../messages.js';

const GhostProtocolModal = ({ isOpen, onClose, onVerified, fetchAPI, showToast, isMobile, hasPin }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(!hasPin);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const hashPin = async (pin) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSetPin = async () => {
    if (pin.length < 4) {
      showToast('PIN must be at least 4 characters', 'error');
      return;
    }
    if (pin !== confirmPin) {
      showToast('PINs do not match', 'error');
      return;
    }

    setLoading(true);
    try {
      const pinHash = await hashPin(pin);
      await fetchAPI('/user/ghost-pin', { method: 'POST', body: { pinHash } });
      showToast(GHOST_PROTOCOL.pinSet, 'success');
      setIsSettingPin(false);
      setPin('');
      setConfirmPin('');
      // Auto-verify after setting
      await fetchAPI('/user/ghost-verify', { method: 'POST', body: { pinHash } });
      onVerified();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to set PIN', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!pin) return;
    setLoading(true);
    try {
      const pinHash = await hashPin(pin);
      const result = await fetchAPI('/user/ghost-verify', { method: 'POST', body: { pinHash } });
      if (result.verified) {
        onVerified();
        onClose();
      }
    } catch (err) {
      showToast(GHOST_PROTOCOL.pinIncorrect, 'error');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (isSettingPin) {
        if (confirmPin) handleSetPin();
      } else {
        handleVerify();
      }
    }
  };

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '14px' : '10px',
    fontSize: isMobile ? '1.1rem' : '1rem',
    fontFamily: 'monospace',
    background: 'var(--bg-surface)',
    border: '1px solid var(--accent-orange)40',
    color: 'var(--text-primary)',
    borderRadius: '4px',
    letterSpacing: '0.3em',
    textAlign: 'center',
    boxSizing: 'border-box',
  };

  const buttonStyle = {
    padding: isMobile ? '14px 20px' : '10px 16px',
    minHeight: isMobile ? '44px' : 'auto',
    background: 'var(--accent-orange)20',
    border: '1px solid var(--accent-orange)',
    color: 'var(--accent-orange)',
    cursor: loading ? 'wait' : 'pointer',
    fontFamily: 'monospace',
    fontSize: isMobile ? '0.9rem' : '0.85rem',
    fontWeight: 600,
    opacity: loading ? 0.6 : 1,
    width: '100%',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.85)', padding: '16px',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--accent-orange)',
        borderRadius: '4px',
        padding: isMobile ? '20px' : '24px',
        maxWidth: '380px', width: '100%',
        boxShadow: '0 0 30px var(--accent-orange)30',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          marginBottom: '20px', padding: '10px 12px',
          background: 'var(--accent-orange)10',
          border: '1px solid var(--accent-orange)30',
          borderRadius: '4px',
        }}>
          <span style={{ fontSize: '1.3rem' }}>👻</span>
          <span style={{
            color: 'var(--accent-orange)', fontWeight: 600,
            fontFamily: 'monospace', fontSize: '0.95rem',
            letterSpacing: '0.1em',
          }}>
            {GHOST_PROTOCOL.modeActive}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          margin: '0 0 16px 0', color: 'var(--text-primary)',
          fontFamily: 'monospace', fontSize: isMobile ? '1rem' : '0.95rem',
          textAlign: 'center',
        }}>
          {isSettingPin ? GHOST_PROTOCOL.setPin : GHOST_PROTOCOL.enterPin}
        </h3>

        {/* PIN Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter PIN"
            autoFocus
            style={inputStyle}
          />
          {isSettingPin && (
            <input
              type="password"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={GHOST_PROTOCOL.confirmPin}
              style={inputStyle}
            />
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={isSettingPin ? handleSetPin : handleVerify}
            disabled={loading || !pin || (isSettingPin && !confirmPin)}
            style={{
              ...buttonStyle,
              opacity: (loading || !pin || (isSettingPin && !confirmPin)) ? 0.5 : 1,
            }}
          >
            {loading ? 'VERIFYING...' : (isSettingPin ? 'ACTIVATE' : 'VERIFY')}
          </button>
          <button
            onClick={onClose}
            style={{
              ...buttonStyle,
              background: 'transparent',
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-dim)',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
};

export default GhostProtocolModal;
