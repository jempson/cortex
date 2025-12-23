/**
 * E2EE UI Components (v1.19.0)
 *
 * Modal components for E2EE setup and passphrase unlock.
 */

import { useState } from 'react';

// ============ E2EE Setup Modal ============
// Shown to new users or users who haven't set up E2EE
export function E2EESetupModal({ onSetup, onSkip, isLoading }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [recoveryHint, setRecoveryHint] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);  // 1: main passphrase, 2: recovery (optional)

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (step === 1) {
      // Validate passphrase
      if (passphrase.length < 8) {
        setError('Passphrase must be at least 8 characters');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match');
        return;
      }
      // Move to recovery step
      setStep(2);
      return;
    }

    // Step 2: Setup with optional recovery
    try {
      const recovery = showRecovery && recoveryPassphrase.length >= 8 ? {
        passphrase: recoveryPassphrase,
        hint: recoveryHint
      } : null;

      await onSetup(passphrase, recovery?.passphrase, recovery?.hint);
    } catch (err) {
      setError(err.message || 'Setup failed');
    }
  };

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
  };

  const contentStyle = {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '450px',
    width: '100%',
    boxShadow: '0 0 30px var(--glow-green)'
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
    marginBottom: '12px'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: 'var(--accent-green)',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--bg-base)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '8px'
  };

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <h2 style={{ color: 'var(--accent-green)', marginBottom: '8px', fontSize: '20px' }}>
          End-to-End Encryption
        </h2>

        {step === 1 ? (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
              Create an encryption passphrase to secure your messages. This passphrase is different from your login password
              and is used to encrypt your private key.
            </p>

            <div style={{ backgroundColor: 'var(--overlay-amber)', padding: '12px', borderRadius: '4px', marginBottom: '16px', border: '1px solid var(--accent-amber)' }}>
              <p style={{ color: 'var(--accent-amber)', fontSize: '12px', margin: 0 }}>
                <strong>Important:</strong> You will need this passphrase every time you log in. If you forget it, you will need your recovery passphrase to regain access to your encrypted messages.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Encryption Passphrase
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your encryption passphrase"
                style={inputStyle}
                autoComplete="new-password"
                required
              />

              <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Confirm Passphrase
              </label>
              <input
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Confirm your passphrase"
                style={inputStyle}
                autoComplete="new-password"
                required
              />

              {error && (
                <p style={{ color: 'var(--accent-orange)', fontSize: '12px', marginBottom: '8px' }}>{error}</p>
              )}

              <button type="submit" style={buttonStyle} disabled={isLoading}>
                {isLoading ? 'Setting up...' : 'Continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
              Set up a recovery passphrase in case you forget your main passphrase.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showRecovery}
                    onChange={(e) => setShowRecovery(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Set up recovery passphrase (recommended)
                </label>
              </div>

              {showRecovery && (
                <>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                    Recovery Passphrase
                  </label>
                  <input
                    type="password"
                    value={recoveryPassphrase}
                    onChange={(e) => setRecoveryPassphrase(e.target.value)}
                    placeholder="Different from your main passphrase"
                    style={inputStyle}
                    autoComplete="new-password"
                  />

                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                    Recovery Hint (optional)
                  </label>
                  <input
                    type="text"
                    value={recoveryHint}
                    onChange={(e) => setRecoveryHint(e.target.value)}
                    placeholder="A hint to remember your recovery passphrase"
                    style={inputStyle}
                    maxLength={100}
                  />
                </>
              )}

              {error && (
                <p style={{ color: 'var(--accent-orange)', fontSize: '12px', marginBottom: '8px' }}>{error}</p>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{ ...buttonStyle, backgroundColor: 'transparent', border: '1px solid var(--border-secondary)', color: 'var(--text-secondary)', flex: 1 }}
                >
                  Back
                </button>
                <button type="submit" style={{ ...buttonStyle, flex: 2 }} disabled={isLoading}>
                  {isLoading ? 'Setting up...' : 'Complete Setup'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ============ Passphrase Unlock Modal ============
// Shown on login when user has E2EE set up
export function PassphraseUnlockModal({ onUnlock, onRecover, onLogout, isLoading, error: propError, recoveryHint }) {
  const [passphrase, setPassphrase] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [error, setError] = useState(propError);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await onUnlock(passphrase);
    } catch (err) {
      setError(err.message || 'Incorrect passphrase');
    }
  };

  const handleRecover = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      await onRecover(recoveryPassphrase);
    } catch (err) {
      setError(err.message || 'Recovery failed');
    }
  };

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
  };

  const contentStyle = {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 0 30px var(--glow-green)'
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
    marginBottom: '12px'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: 'var(--accent-green)',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--bg-base)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer'
  };

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <h2 style={{ color: 'var(--accent-green)', marginBottom: '8px', fontSize: '20px' }}>
          Unlock Encryption
        </h2>

        {!showRecovery ? (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
              Enter your encryption passphrase to decrypt your messages.
            </p>

            <form onSubmit={handleUnlock}>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Encryption passphrase"
                style={inputStyle}
                autoComplete="current-password"
                autoFocus
                required
              />

              {(error || propError) && (
                <p style={{ color: 'var(--accent-orange)', fontSize: '12px', marginBottom: '8px' }}>
                  {error || propError}
                </p>
              )}

              <button type="submit" style={buttonStyle} disabled={isLoading}>
                {isLoading ? 'Unlocking...' : 'Unlock'}
              </button>
            </form>

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                onClick={() => setShowRecovery(true)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', cursor: 'pointer', fontSize: '13px' }}
              >
                Forgot passphrase? Use recovery
              </button>
            </div>

            <div style={{ marginTop: '8px', textAlign: 'center' }}>
              <button
                onClick={onLogout}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
              Enter your recovery passphrase to regain access.
            </p>

            {recoveryHint && (
              <div style={{ backgroundColor: 'var(--overlay-teal)', padding: '10px', borderRadius: '4px', marginBottom: '16px' }}>
                <p style={{ color: 'var(--accent-teal)', fontSize: '12px', margin: 0 }}>
                  <strong>Hint:</strong> {recoveryHint}
                </p>
              </div>
            )}

            <form onSubmit={handleRecover}>
              <input
                type="password"
                value={recoveryPassphrase}
                onChange={(e) => setRecoveryPassphrase(e.target.value)}
                placeholder="Recovery passphrase"
                style={inputStyle}
                autoComplete="off"
                autoFocus
                required
              />

              {error && (
                <p style={{ color: 'var(--accent-orange)', fontSize: '12px', marginBottom: '8px' }}>{error}</p>
              )}

              <button type="submit" style={buttonStyle} disabled={isLoading}>
                {isLoading ? 'Recovering...' : 'Recover Access'}
              </button>
            </form>

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                onClick={() => setShowRecovery(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}
              >
                Back to passphrase
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ E2EE Status Indicator ============
// Small indicator showing encryption status
export function E2EEStatusIndicator({ isUnlocked, onClick }) {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: onClick ? 'pointer' : 'default',
    backgroundColor: isUnlocked ? 'var(--overlay-green)' : 'var(--overlay-amber)',
    color: isUnlocked ? 'var(--accent-green)' : 'var(--accent-amber)',
    border: `1px solid ${isUnlocked ? 'var(--accent-green)' : 'var(--accent-amber)'}`
  };

  return (
    <span style={style} onClick={onClick} title={isUnlocked ? 'End-to-end encrypted' : 'Encryption locked'}>
      {isUnlocked ? '🔐' : '🔒'} E2EE
    </span>
  );
}

// ============ Encrypted Wave Badge ============
// Badge shown on encrypted waves
export function EncryptedWaveBadge({ small }) {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: small ? '2px 4px' : '3px 6px',
    borderRadius: '3px',
    fontSize: small ? '10px' : '11px',
    backgroundColor: 'var(--overlay-green)',
    color: 'var(--accent-green)',
    border: '1px solid var(--accent-green)'
  };

  return (
    <span style={style} title="This wave is end-to-end encrypted">
      🔐 {!small && 'Encrypted'}
    </span>
  );
}

// ============ Legacy Wave Notice ============
// Shown on waves that predate E2EE
export function LegacyWaveNotice() {
  const style = {
    backgroundColor: 'var(--overlay-amber)',
    border: '1px solid var(--accent-amber)',
    borderRadius: '4px',
    padding: '8px 12px',
    marginBottom: '12px',
    fontSize: '12px',
    color: 'var(--accent-amber)',
    textAlign: 'center'
  };

  return (
    <div style={style}>
      This wave predates end-to-end encryption. New droplets are not encrypted.
    </div>
  );
}

export default {
  E2EESetupModal,
  PassphraseUnlockModal,
  E2EEStatusIndicator,
  EncryptedWaveBadge,
  LegacyWaveNotice
};
