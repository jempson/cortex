/**
 * ThemeCustomizationModal Component (v2.11.0)
 *
 * Modal wrapper for theme gallery and editor.
 * Manages the flow between browsing, creating, and editing themes.
 */

import React, { useState, useCallback } from 'react';
import ThemeGallery from './ThemeGallery.jsx';
import ThemeEditor from './ThemeEditor.jsx';

const ThemeCustomizationModal = ({
  isOpen,
  onClose,
  fetchAPI,
  showToast,
  user,
  isMobile,
  onUpdatePreferences,
}) => {
  const [view, setView] = useState('gallery'); // 'gallery' | 'editor'
  const [editingTheme, setEditingTheme] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Trigger gallery refresh

  // Handle creating a new theme
  const handleCreateTheme = useCallback(() => {
    setEditingTheme(null);
    setView('editor');
  }, []);

  // Handle editing an existing theme
  const handleEditTheme = useCallback((theme) => {
    setEditingTheme(theme);
    setView('editor');
  }, []);

  // Handle saving a theme (new or edit)
  const handleSaveTheme = useCallback((savedTheme) => {
    setRefreshKey(k => k + 1); // Trigger gallery refresh
    setView('gallery');
    setEditingTheme(null);
  }, []);

  // Handle canceling theme edit
  const handleCancelEdit = useCallback(() => {
    setView('gallery');
    setEditingTheme(null);
  }, []);

  // Handle closing the modal
  const handleClose = useCallback(() => {
    // Stop any previews
    const previewStyle = document.getElementById('theme-preview-style');
    if (previewStyle) previewStyle.remove();

    setView('gallery');
    setEditingTheme(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const styles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: isMobile ? '0' : '20px',
    },
    modal: {
      width: '100%',
      maxWidth: isMobile ? '100%' : '900px',
      height: isMobile ? '100%' : '85vh',
      maxHeight: isMobile ? '100%' : '700px',
      background: 'linear-gradient(135deg, var(--bg-base), var(--bg-surface))',
      border: isMobile ? 'none' : '2px solid var(--accent-amber)40',
      borderRadius: isMobile ? '0' : '8px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    closeBtn: {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: '32px',
      height: '32px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
      color: 'var(--text-dim)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1.2rem',
      zIndex: 10,
      transition: 'color 0.15s, border-color 0.15s',
    },
    content: {
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
    },
  };

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleClose}
          style={styles.closeBtn}
          title="Close"
        >
          x
        </button>

        <div style={styles.content}>
          {view === 'gallery' ? (
            <ThemeGallery
              key={refreshKey}
              fetchAPI={fetchAPI}
              showToast={showToast}
              onCreateTheme={handleCreateTheme}
              onEditTheme={handleEditTheme}
              user={user}
              onUpdatePreferences={onUpdatePreferences}
            />
          ) : (
            <ThemeEditor
              theme={editingTheme}
              onSave={handleSaveTheme}
              onCancel={handleCancelEdit}
              fetchAPI={fetchAPI}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ThemeCustomizationModal;
