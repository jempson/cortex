import { useState } from 'react';
import { Avatar, GlowText } from '../ui/SimpleComponents.jsx';

const InviteToGroupModal = ({ isOpen, onClose, group, contacts, fetchAPI, showToast, isMobile }) => {
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen || !group) return null;

  // Filter contacts that aren't already group members
  const availableContacts = contacts.filter(c => {
    // Check if contact matches search
    const matchesSearch = !searchQuery ||
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const toggleContact = (contactId) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSendInvites = async () => {
    if (selectedContacts.length === 0) return;
    setSending(true);
    try {
      const result = await fetchAPI(`/groups/${group.id}/invite`, {
        method: 'POST',
        body: { userIds: selectedContacts, message: message.trim() || undefined }
      });
      const successCount = result.invitations?.length || 0;
      const errorCount = result.errors?.length || 0;
      if (successCount > 0) {
        showToast(`Sent ${successCount} invitation${successCount > 1 ? 's' : ''}`, 'success');
      }
      if (errorCount > 0) {
        showToast(`${errorCount} invitation${errorCount > 1 ? 's' : ''} failed`, 'error');
      }
      setSelectedContacts([]);
      setMessage('');
      setSearchQuery('');
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to send invitations', 'error');
    }
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: isMobile ? '16px' : '0',
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
        border: '2px solid var(--accent-amber)40', padding: isMobile ? '20px' : '24px',
        width: '100%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <GlowText color="var(--accent-amber)" size="1rem">INVITE TO {group.name?.toUpperCase()}</GlowText>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.2rem', padding: '4px',
          }}>×</button>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          style={{
            width: '100%', padding: '10px', boxSizing: 'border-box', marginBottom: '12px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit',
          }}
        />

        <div style={{
          flex: 1, overflowY: 'auto', marginBottom: '16px',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
          maxHeight: '250px', minHeight: '150px',
        }}>
          {availableContacts.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {contacts.length === 0 ? 'No contacts to invite' : 'No matching contacts'}
            </div>
          ) : availableContacts.map(contact => {
            const isSelected = selectedContacts.includes(contact.id);
            return (
              <div
                key={contact.id}
                onClick={() => toggleContact(contact.id)}
                style={{
                  padding: '10px 12px', cursor: 'pointer',
                  background: isSelected ? 'var(--accent-amber)15' : 'transparent',
                  borderBottom: '1px solid var(--bg-hover)',
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                <div style={{
                  width: '20px', height: '20px', border: `2px solid ${isSelected ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
                  background: isSelected ? 'var(--accent-amber)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#000', fontSize: '0.8rem', fontWeight: 'bold',
                }}>
                  {isSelected && '✓'}
                </div>
                <Avatar letter={contact.avatar || contact.name?.[0] || '?'} color={isSelected ? 'var(--accent-amber)' : 'var(--text-dim)'} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {contact.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>
            Message (optional)
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message to your invitation..."
            maxLength={200}
            style={{
              width: '100%', padding: '10px', boxSizing: 'border-box',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
            {selectedContacts.length} selected
          </span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{
              padding: isMobile ? '12px 20px' : '10px 16px',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'transparent', border: '1px solid var(--border-primary)',
              color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace',
            }}>CANCEL</button>
            <button
              onClick={handleSendInvites}
              disabled={sending || selectedContacts.length === 0}
              style={{
                padding: isMobile ? '12px 20px' : '10px 16px',
                minHeight: isMobile ? '44px' : 'auto',
                background: selectedContacts.length > 0 ? 'var(--accent-amber)20' : 'transparent',
                border: `1px solid ${selectedContacts.length > 0 ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
                color: selectedContacts.length > 0 ? 'var(--accent-amber)' : 'var(--text-muted)',
                cursor: sending || selectedContacts.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace', opacity: sending ? 0.6 : 1,
              }}>
              {sending ? 'SENDING...' : 'SEND INVITES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteToGroupModal;
