import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '../ui/SimpleComponents.jsx';
import { formatError } from '../../../messages.js';

const HandleRequestsList = ({ fetchAPI, showToast, isMobile, isOpen: controlledIsOpen, onToggle }) => {
  // Support both controlled (isOpen/onToggle props) and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const handleToggle = isControlled ? onToggle : () => setInternalIsOpen(!internalIsOpen);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/admin/handle-requests');
      setRequests(data);
    } catch (err) {
      showToast(err.message || formatError('Failed to load requests'), 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadRequests();
    }
  }, [isOpen]);

  const handleApprove = async (requestId) => {
    try {
      await fetchAPI(`/admin/handle-requests/${requestId}/approve`, { method: 'POST' });
      showToast('Handle change approved', 'success');
      loadRequests();
    } catch (err) {
      showToast(err.message || formatError('Failed to approve'), 'error');
    }
  };

  const handleReject = async (requestId) => {
    const reason = prompt('Rejection reason (optional):');
    try {
      await fetchAPI(`/admin/handle-requests/${requestId}/reject`, {
        method: 'POST',
        body: { reason }
      });
      showToast('Handle change rejected', 'success');
      loadRequests();
    } catch (err) {
      showToast(err.message || formatError('Failed to reject'), 'error');
    }
  };

  return (
    <div style={{ marginTop: '20px', padding: isMobile ? '16px' : '20px', background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))', border: '1px solid var(--accent-amber)40' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 500 }}>HANDLE REQUESTS</div>
        <button
          onClick={handleToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-amber)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-amber)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
          }}
        >
          {isOpen ? '▼ HIDE' : '▶ SHOW'}
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <LoadingSpinner />
          ) : requests.length === 0 ? (
            <div style={{
              padding: '20px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: isMobile ? '0.9rem' : '0.85rem',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            }}>
              No pending handle change requests
            </div>
          ) : (
            <div>
      {requests.map(req => (
        <div key={req.id} style={{
          padding: isMobile ? '14px' : '16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '12px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: isMobile ? '1rem' : '0.9rem', marginBottom: '4px' }}>
                {req.displayName}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: isMobile ? '0.85rem' : '0.75rem', fontFamily: 'monospace' }}>
                @{req.currentHandle} → @{req.newHandle}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: isMobile ? '0.8rem' : '0.7rem', marginTop: '4px' }}>
                Requested: {new Date(req.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => handleApprove(req.id)} style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--accent-green)20',
              border: '1px solid var(--accent-green)', color: 'var(--accent-green)',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}>APPROVE</button>

            <button onClick={() => handleReject(req.id)} style={{
              padding: isMobile ? '10px 16px' : '8px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'var(--accent-orange)20',
              border: '1px solid var(--accent-orange)', color: 'var(--accent-orange)',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: isMobile ? '0.85rem' : '0.75rem',
            }}>REJECT</button>
          </div>
        </div>
      ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ BOTS ADMIN PANEL (v2.1.0) ============

export default HandleRequestsList;
