import React, { useState, useEffect } from 'react';

const InstallPrompt = ({ isMobile }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently (within 7 days)
    const dismissedAt = localStorage.getItem('farhold_install_dismissed');
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return; // Don't show prompt
      }
    }

    // Listen for install prompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Show prompt after second visit or 30 seconds
      const visitCount = parseInt(localStorage.getItem('farhold_visits') || '0') + 1;
      localStorage.setItem('farhold_visits', visitCount.toString());

      if (visitCount >= 2) {
        setShowPrompt(true);
      } else {
        setTimeout(() => setShowPrompt(true), 30000);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('[PWA] User accepted install prompt');
    } else {
      console.log('[PWA] User dismissed install prompt');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('farhold_install_dismissed', Date.now().toString());
  };

  if (isInstalled || !showPrompt || !deferredPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: isMobile ? '70px' : '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '2px solid var(--accent-green)',
      padding: isMobile ? '16px' : '20px',
      zIndex: 1000,
      maxWidth: '400px',
      width: 'calc(100% - 40px)',
      boxShadow: '0 4px 20px rgba(14, 173, 105, 0.3)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '12px'
      }}>
        <div style={{ color: 'var(--accent-green)', fontWeight: 'bold', fontSize: '1rem', fontFamily: 'monospace' }}>
          Install Cortex
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: 0,
            lineHeight: 1
          }}
        >
          x
        </button>
      </div>

      <p style={{
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        marginBottom: '16px',
        lineHeight: 1.4,
        fontFamily: 'monospace'
      }}>
        Install Cortex on your device for quick access and offline support.
      </p>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleInstall}
          style={{
            flex: 1,
            padding: '12px 20px',
            background: 'var(--accent-green)',
            border: 'none',
            color: 'var(--bg-base)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '0.9rem'
          }}
        >
          INSTALL APP
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '12px 20px',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          LATER
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
