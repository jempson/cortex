import React, { useState, useEffect } from 'react';
import { GlowText } from '../ui/SimpleComponents.jsx';
import { PRIVACY_LEVELS } from '../../config/constants.js';
import { SUCCESS } from '../../../messages.js';
import { useE2EE } from '../../../e2ee-context.jsx';

const WaveSettingsModal = ({ isOpen, onClose, wave, groups, fetchAPI, showToast, onUpdate, participants = [], showParticipants, setShowParticipants, federationEnabled, currentUserId, onFederate, isMobile }) => {
  const e2ee = useE2EE();
  const [privacy, setPrivacy] = useState(wave?.privacy || 'private');
  const [selectedGroup, setSelectedGroup] = useState(wave?.groupId || null);
  const [title, setTitle] = useState(wave?.title || '');
  const [decrypting, setDecrypting] = useState(false);

  useEffect(() => {
    if (wave) {
      setPrivacy(wave.privacy);
      setSelectedGroup(wave.groupId);
      setTitle(wave.title);
    }
  }, [wave]);

  if (!isOpen || !wave) return null;

  const handleSave = async () => {
    try {
      await fetchAPI(`/waves/${wave.id}`, {
        method: 'PUT',
        body: { title, privacy, groupId: privacy === 'group' ? selectedGroup : null },
      });
      showToast(SUCCESS.waveUpdated, 'success');
      onUpdate();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update wave', 'error');
    }
  };

  const handleDecryptWave = async () => {
    if (!wave.encrypted) {
      showToast('Wave is not encrypted', 'error');
      return;
    }

    if (!e2ee.isUnlocked) {
      showToast('Unlock E2EE first to decrypt this wave', 'error');
      return;
    }

    const confirmed = window.confirm(
      'This will permanently decrypt all messages in this wave. Encrypted content will be converted to plain text. This cannot be undone.\n\nContinue?'
    );
    if (!confirmed) return;

    setDecrypting(true);
    try {
      // Fetch all pings in the wave
      const pingsData = await fetchAPI(`/waves/${wave.id}/pings`);
      const pings = pingsData.pings || [];

      console.log(`Decrypting ${pings.length} pings in wave ${wave.id}...`);

      // Decrypt each ping
      const decryptedPings = [];
      for (const ping of pings) {
        try {
          // Check if ping is encrypted (has nonce)
          if (ping.encrypted && ping.nonce) {
            const decryptedContent = await e2ee.decryptPing(ping.content, ping.nonce, wave.id, ping.keyVersion);
            decryptedPings.push({
              id: ping.id,
              content: decryptedContent
            });
          } else {
            // Already decrypted or not encrypted
            decryptedPings.push({
              id: ping.id,
              content: ping.content
            });
          }
        } catch (decryptErr) {
          console.error(`Failed to decrypt ping ${ping.id}:`, decryptErr);
          // If decryption fails, keep original content (might already be decrypted)
          decryptedPings.push({
            id: ping.id,
            content: ping.content
          });
        }
      }

      // Send decrypted pings to server
      await fetchAPI(`/waves/${wave.id}/decrypt`, {
        method: 'POST',
        body: { pings: decryptedPings }
      });

      showToast('Wave decrypted successfully! All messages are now unencrypted.', 'success');
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Wave decryption error:', err);
      showToast(err.message || 'Failed to decrypt wave', 'error');
    } finally {
      setDecrypting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
    }}>
      <div style={{
        width: '100%', maxWidth: '450px', maxHeight: '80vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-teal)40', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <GlowText color="var(--accent-teal)" size="1.1rem">Wave Settings</GlowText>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>TITLE</div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
          }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PRIVACY LEVEL</div>
          {Object.entries(PRIVACY_LEVELS).map(([key, config]) => (
            <button key={key} onClick={() => { setPrivacy(key); if (key !== 'group') setSelectedGroup(null); }}
              style={{
                width: '100%', padding: '12px', marginBottom: '8px', textAlign: 'left',
                background: privacy === key ? config.bgColor : 'var(--bg-elevated)',
                border: `1px solid ${privacy === key ? config.color : 'var(--border-subtle)'}`, cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: config.color, fontSize: '1.1rem' }}>{config.icon}</span>
                <div>
                  <div style={{ color: config.color }}>{config.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{config.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {privacy === 'group' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>SELECT CREW</div>
            {groups.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '10px', background: 'var(--bg-elevated)' }}>No crews available</div>
            ) : groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroup(g.id)} style={{
                width: '100%', padding: '10px', marginBottom: '4px', textAlign: 'left',
                background: selectedGroup === g.id ? 'var(--accent-amber)15' : 'var(--bg-elevated)',
                border: `1px solid ${selectedGroup === g.id ? 'var(--accent-amber)' : 'var(--border-subtle)'}`, cursor: 'pointer',
              }}>
                <div style={{ color: 'var(--text-primary)' }}>{g.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{g.memberCount} members</div>
              </button>
            ))}
          </div>
        )}

        {/* Participants Section */}
        {participants.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>PARTICIPANTS ({participants.length})</div>
            <button
              onClick={() => { setShowParticipants(!showParticipants); onClose(); }}
              style={{
                width: '100%', padding: '12px', textAlign: 'left',
                background: showParticipants ? 'var(--accent-green)15' : 'var(--bg-elevated)',
                border: `1px solid ${showParticipants ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                color: showParticipants ? 'var(--accent-green)' : 'var(--text-primary)',
                cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {showParticipants ? '✓ Participants panel visible' : 'Show participants panel'}
            </button>
          </div>
        )}

        {/* Federation Section */}
        {federationEnabled && wave?.createdBy === currentUserId && wave?.federationState !== 'participant' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>FEDERATION</div>
            <button
              onClick={onFederate}
              style={{
                width: '100%', padding: '12px', textAlign: 'left',
                background: wave?.federationState === 'origin' ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                border: `1px solid ${wave?.federationState === 'origin' ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                color: wave?.federationState === 'origin' ? 'var(--accent-teal)' : 'var(--text-primary)',
                cursor: 'pointer', fontFamily: 'monospace',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span>◇</span>
              {wave?.federationState === 'origin' ? 'Manage federated participants' : 'Federate this wave'}
            </button>
          </div>
        )}

        {/* Decrypt Wave Button - Only show for encrypted waves */}
        {wave.encrypted && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>ENCRYPTION</div>
            <button
              onClick={handleDecryptWave}
              disabled={decrypting}
              style={{
                width: '100%', padding: '12px', textAlign: 'left',
                background: 'var(--accent-orange)15',
                border: '1px solid var(--accent-orange)',
                color: 'var(--accent-orange)',
                cursor: decrypting ? 'wait' : 'pointer',
                fontFamily: 'monospace',
                display: 'flex', alignItems: 'center', gap: '8px',
                opacity: decrypting ? 0.6 : 1,
              }}
            >
              <span>🔓</span>
              <div style={{ flex: 1 }}>
                <div>{decrypting ? 'Decrypting wave...' : 'Decrypt Wave (Remove E2EE)'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Convert all encrypted messages to plain text
                </div>
              </div>
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', background: 'transparent',
            border: '1px solid var(--border-primary)', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
          }}>CANCEL</button>
          <button onClick={handleSave} style={{
            flex: 1, padding: '12px', background: 'var(--accent-teal)20',
            border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)', cursor: 'pointer', fontFamily: 'monospace',
          }}>SAVE</button>
        </div>
      </div>
    </div>
  );
};

export default WaveSettingsModal;
