import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VERSION, API_URL, BASE_URL, PRIVACY_LEVELS } from '../config/constants.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { LoadingSpinner, Toast, Avatar, GlowText } from '../components/ui/SimpleComponents.jsx';

const ResetPasswordPage = ({ onBack }) => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState({ loading: true, valid: null, error: '', success: false });
  const { isMobile } = useWindowSize();

  // Extract token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (!urlToken) {
      setStatus({ loading: false, valid: false, error: 'No reset token provided', success: false });
      return;
    }
    setToken(urlToken);

    // Verify token with server
    fetch(`${API_URL}/auth/reset-password/${urlToken}`)
      .then(res => res.json())
      .then(data => {
        setStatus({ loading: false, valid: data.valid, error: data.error || '', success: false });
      })
      .catch(() => {
        setStatus({ loading: false, valid: false, error: 'Failed to verify token', success: false });
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus(s => ({ ...s, error: 'Passwords do not match' }));
      return;
    }
    if (newPassword.length < 8) {
      setStatus(s => ({ ...s, error: 'Password must be at least 8 characters' }));
      return;
    }

    setStatus(s => ({ ...s, loading: true, error: '' }));
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({ loading: false, valid: true, error: '', success: true });
      } else {
        setStatus(s => ({ ...s, loading: false, error: data.error || 'Failed to reset password' }));
      }
    } catch (err) {
      setStatus(s => ({ ...s, loading: false, error: 'Network error. Please try again.' }));
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-base))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace", padding: isMobile ? '20px' : '0',
    }}>
      <ScanLines />
      <div style={{
        width: '100%', maxWidth: '400px', padding: isMobile ? '24px' : '40px',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-amber)40',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <GlowText color="var(--accent-amber)" size={isMobile ? '2rem' : '2.5rem'} weight={700}>FARHOLD</GlowText>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '8px' }}>PASSWORD RESET</div>
        </div>

        {status.loading && !status.success && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Verifying reset token...</div>
        )}

        {!status.loading && !status.valid && !status.success && (
          <div>
            <div style={{ color: 'var(--accent-orange)', fontSize: '0.9rem', marginBottom: '24px', padding: '12px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30', textAlign: 'center' }}>
              {status.error || 'Invalid or expired reset link'}
            </div>
            <button onClick={onBack} style={{
              width: '100%', padding: '12px',
              background: 'var(--accent-teal)20', border: '1px solid var(--accent-teal)',
              color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.9rem',
            }}>
              BACK TO LOGIN
            </button>
          </div>
        )}

        {!status.loading && status.valid && !status.success && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>NEW PASSWORD</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, upper, lower, number" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>CONFIRM PASSWORD</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password" style={inputStyle} />
            </div>
            {status.error && (
              <div style={{ color: 'var(--accent-orange)', fontSize: '0.85rem', marginBottom: '16px', padding: '10px', background: 'var(--accent-orange)10', border: '1px solid var(--accent-orange)30' }}>
                {status.error}
              </div>
            )}
            <button type="submit" disabled={status.loading} style={{
              width: '100%', padding: '14px',
              background: status.loading ? 'var(--border-subtle)' : 'var(--accent-amber)20',
              border: `1px solid ${status.loading ? 'var(--border-primary)' : 'var(--accent-amber)'}`,
              color: status.loading ? 'var(--text-muted)' : 'var(--accent-amber)',
              cursor: status.loading ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace', fontSize: '0.9rem',
            }}>
              {status.loading ? 'RESETTING...' : 'RESET PASSWORD'}
            </button>
          </form>
        )}

        {status.success && (
          <div>
            <div style={{ color: 'var(--accent-green)', fontSize: '0.9rem', marginBottom: '24px', padding: '12px', background: 'var(--accent-green)10', border: '1px solid var(--accent-green)30', textAlign: 'center' }}>
              Password reset successfully! You can now login with your new password.
            </div>
            <button onClick={onBack} style={{
              width: '100%', padding: '14px',
              background: 'var(--accent-green)20', border: '1px solid var(--accent-green)',
              color: 'var(--accent-green)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.9rem',
            }}>
              GO TO LOGIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ WAVE LIST (Mobile Responsive) ============
// Badge colors by notification type (priority order: mention > reply > burst > activity)
export default ResetPasswordPage;
