import React, { useState } from 'react';
import { SUCCESS } from '../../../messages.js';
import { Avatar } from '../ui/SimpleComponents.jsx';

const ContactRequestsPanel = ({ requests, fetchAPI, showToast, onRequestsChange, onContactsChange, isMobile }) => {
  const [processing, setProcessing] = useState({});

  const handleAccept = async (requestId) => {
    setProcessing(prev => ({ ...prev, [requestId]: 'accept' }));
    try {
      await fetchAPI(`/contacts/requests/${requestId}/accept`, { method: 'POST' });
      showToast(SUCCESS.contactRequestAccepted, 'success');
      onRequestsChange();
      onContactsChange();
    } catch (err) {
      showToast(err.message || 'Failed to accept request', 'error');
    }
    setProcessing(prev => ({ ...prev, [requestId]: null }));
  };

  const handleDecline = async (requestId) => {
    setProcessing(prev => ({ ...prev, [requestId]: 'decline' }));
    try {
      await fetchAPI(`/contacts/requests/${requestId}/decline`, { method: 'POST' });
      showToast('Contact request declined', 'info');
      onRequestsChange();
    } catch (err) {
      showToast(err.message || 'Failed to decline request', 'error');
    }
    setProcessing(prev => ({ ...prev, [requestId]: null }));
  };

  if (requests.length === 0) return null;

  return (
    <div style={{
      marginBottom: '24px', padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-green)40',
    }}>
      <div style={{ color: 'var(--accent-green)', marginBottom: '16px', fontSize: '0.8rem', fontWeight: 500 }}>
        CONTACT REQUESTS ({requests.length})
      </div>
      {requests.map((req) => (
        <div key={req.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: isMobile ? '12px' : '16px', background: 'var(--bg-hover)',
          marginBottom: '8px', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <Avatar user={req.from} size={isMobile ? '36px' : '40px'} />
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.9rem' }}>
                {req.from.displayName || req.from.handle}
              </div>
              {req.message && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>
                  "{req.message}"
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleAccept(req.id)}
              disabled={processing[req.id]}
              style={{
                padding: '8px 16px', background: 'var(--accent-green)30', border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)', cursor: processing[req.id] ? 'wait' : 'pointer',
                fontSize: '0.75rem', fontFamily: 'monospace',
              }}
            >
              {processing[req.id] === 'accept' ? 'ACCEPTING...' : 'ACCEPT'}
            </button>
            <button
              onClick={() => handleDecline(req.id)}
              disabled={processing[req.id]}
              style={{
                padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)',
                color: 'var(--text-muted)', cursor: processing[req.id] ? 'wait' : 'pointer',
                fontSize: '0.75rem', fontFamily: 'monospace',
              }}
            >
              {processing[req.id] === 'decline' ? 'DECLINING...' : 'DECLINE'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ContactRequestsPanel;
