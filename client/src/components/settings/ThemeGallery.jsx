/**
 * ThemeGallery Component (v2.11.0)
 *
 * Displays public themes from the gallery and user's custom themes.
 * Allows browsing, searching, installing, and managing themes.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LoadingSpinner } from '../ui/SimpleComponents.jsx';
import { THEMES } from '../../config/themes.js';
import { applyCustomTheme, removeCustomTheme } from '../../hooks/useTheme.js';

const ThemeGallery = ({
  fetchAPI,
  showToast,
  onCreateTheme,
  onEditTheme,
  user,
  onUpdatePreferences,
}) => {
  const [view, setView] = useState('gallery'); // 'gallery' | 'myThemes'
  const [themes, setThemes] = useState([]);
  const [myThemes, setMyThemes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [installedThemeIds, setInstalledThemeIds] = useState(new Set());
  const [previewTheme, setPreviewTheme] = useState(null);
  const [expandedTheme, setExpandedTheme] = useState(null);

  // Fetch gallery themes
  const fetchGalleryThemes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAPI(`/themes/gallery?sort=${sort}&search=${encodeURIComponent(search)}`);
      if (!result.error) {
        setThemes(result.themes || []);
        // Server adds isInstalled and isOwn flags to each theme
        // Treat both installed and own themes as "available" (no need to install)
        const availableIds = (result.themes || [])
          .filter(t => t.isInstalled || t.isOwn)
          .map(t => t.id);
        setInstalledThemeIds(new Set(availableIds));
      }
    } catch (error) {
      console.error('Error fetching gallery themes:', error);
      showToast(error.message || 'Failed to load themes', 'error');
    } finally {
      setLoading(false);
    }
  }, [fetchAPI, sort, search, showToast]);

  // Fetch user's themes
  const fetchMyThemes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAPI('/themes');
      if (!result.error) {
        // Server returns { ownThemes, installedThemes }
        setMyThemes(result.ownThemes || []);
        // Include both own themes and installed themes as "available"
        const ownIds = (result.ownThemes || []).map(t => t.id);
        const installedIds = (result.installedThemes || []).map(t => t.id);
        setInstalledThemeIds(new Set([...ownIds, ...installedIds]));
      }
    } catch (error) {
      console.error('Error fetching my themes:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchAPI]);

  // Initial load
  useEffect(() => {
    if (view === 'gallery') {
      fetchGalleryThemes();
    } else {
      fetchMyThemes();
    }
  }, [view, fetchGalleryThemes, fetchMyThemes]);

  // Install a theme
  const handleInstall = async (theme) => {
    try {
      const result = await fetchAPI(`/themes/${theme.id}/install`, {
        method: 'POST',
      });

      if (result.error) {
        showToast(result.error, 'error');
        return;
      }

      setInstalledThemeIds(prev => new Set([...prev, theme.id]));
      showToast(`${theme.name} installed and applied`, 'success');

      // Apply the theme immediately
      applyCustomTheme({
        id: theme.id,
        name: theme.name,
        variables: theme.variables,
      });

      // Save preference to server with 'custom-' prefix so it persists
      if (onUpdatePreferences) {
        try {
          await onUpdatePreferences({ theme: `custom-${theme.id}` });
        } catch (error) {
          console.error('Error saving theme preference:', error);
        }
      }
    } catch (error) {
      console.error('Error installing theme:', error);
      showToast(error.message || 'Failed to install theme', 'error');
    }
  };

  // Uninstall a theme
  const handleUninstall = async (theme) => {
    try {
      const result = await fetchAPI(`/themes/${theme.id}/install`, {
        method: 'DELETE',
      });

      if (result.error) {
        showToast(result.error, 'error');
        return;
      }

      setInstalledThemeIds(prev => {
        const next = new Set(prev);
        next.delete(theme.id);
        return next;
      });
      showToast(`${theme.name} removed`, 'success');

      // If this was the active theme, revert to default
      const currentTheme = localStorage.getItem('farhold_theme');
      if (currentTheme === `custom-${theme.id}`) {
        removeCustomTheme('serenity');
      }
    } catch (error) {
      console.error('Error uninstalling theme:', error);
      showToast('Failed to remove theme', 'error');
    }
  };

  // Delete a theme (only for owner)
  const handleDelete = async (theme) => {
    if (!confirm(`Delete "${theme.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const result = await fetchAPI(`/themes/${theme.id}`, {
        method: 'DELETE',
      });

      if (result.error) {
        showToast(result.error, 'error');
        return;
      }

      setMyThemes(prev => prev.filter(t => t.id !== theme.id));
      showToast('Theme deleted', 'success');
    } catch (error) {
      console.error('Error deleting theme:', error);
      showToast('Failed to delete theme', 'error');
    }
  };

  // Apply a custom theme
  const handleApply = async (theme) => {
    applyCustomTheme({
      id: theme.id,
      name: theme.name,
      variables: theme.variables,
    });

    // Save preference to server with 'custom-' prefix so it persists across login/logout
    if (onUpdatePreferences) {
      try {
        await onUpdatePreferences({ theme: `custom-${theme.id}` });
      } catch (error) {
        console.error('Error saving theme preference:', error);
      }
    }

    showToast(`Applied ${theme.name}`, 'success');
  };

  // Preview on hover
  const handlePreviewStart = (theme) => {
    setPreviewTheme(theme);
    // Temporarily inject preview styles
    const style = document.createElement('style');
    style.id = 'theme-preview-style';
    style.textContent = `:root { ${Object.entries(theme.variables || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ')} }`;
    document.head.appendChild(style);
  };

  const handlePreviewEnd = () => {
    setPreviewTheme(null);
    const style = document.getElementById('theme-preview-style');
    if (style) style.remove();
  };

  // Filtered/sorted themes for display
  const displayThemes = useMemo(() => {
    if (view === 'gallery') return themes;
    return myThemes;
  }, [view, themes, myThemes]);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px',
      borderBottom: '1px solid var(--border-primary)',
      flexShrink: 0,
    },
    title: {
      margin: 0,
      fontSize: '1.1rem',
      color: 'var(--text-primary)',
    },
    tabs: {
      display: 'flex',
      gap: '8px',
      padding: '0 16px',
      borderBottom: '1px solid var(--border-primary)',
      flexShrink: 0,
    },
    tab: {
      padding: '12px 16px',
      background: 'none',
      border: 'none',
      color: 'var(--text-secondary)',
      fontSize: '0.8rem',
      cursor: 'pointer',
      borderBottom: '2px solid transparent',
      marginBottom: '-1px',
      transition: 'color 0.15s, border-color 0.15s',
    },
    tabActive: {
      color: 'var(--accent-amber)',
      borderBottom: '2px solid var(--accent-amber)',
    },
    controls: {
      display: 'flex',
      gap: '12px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    },
    searchInput: {
      flex: 1,
      padding: '8px 12px',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
      color: 'var(--text-primary)',
      fontSize: '0.8rem',
      outline: 'none',
    },
    select: {
      padding: '8px 12px',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
      color: 'var(--text-primary)',
      fontSize: '0.8rem',
      outline: 'none',
      cursor: 'pointer',
    },
    content: {
      flex: 1,
      overflow: 'auto',
      padding: '16px',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '16px',
    },
    emptyState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      textAlign: 'center',
    },
    emptyText: {
      color: 'var(--text-dim)',
      fontSize: '0.9rem',
      marginBottom: '16px',
    },
    themeCard: {
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    themeCardHover: {
      borderColor: 'var(--accent-amber)',
      boxShadow: '0 0 0 1px var(--accent-amber)',
    },
    themePreview: {
      height: '80px',
      position: 'relative',
      overflow: 'hidden',
    },
    previewRow: {
      height: '20px',
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      gap: '4px',
    },
    previewDot: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
    },
    previewLine: {
      height: '4px',
      borderRadius: '2px',
      flex: 1,
    },
    themeInfo: {
      padding: '12px',
      borderTop: '1px solid var(--border-subtle)',
    },
    themeName: {
      color: 'var(--text-primary)',
      fontSize: '0.9rem',
      fontWeight: '500',
      marginBottom: '4px',
    },
    themeDescription: {
      color: 'var(--text-dim)',
      fontSize: '0.7rem',
      marginBottom: '8px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
    },
    themeMeta: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: 'var(--text-muted)',
      fontSize: '0.65rem',
    },
    themeActions: {
      display: 'flex',
      gap: '6px',
      padding: '8px 12px',
      borderTop: '1px solid var(--border-subtle)',
      backgroundColor: 'var(--bg-elevated)',
    },
    btn: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '0.7rem',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'background-color 0.15s, opacity 0.15s',
    },
    btnPrimary: {
      backgroundColor: 'var(--accent-amber)',
      color: 'var(--bg-base)',
    },
    btnSecondary: {
      backgroundColor: 'var(--bg-surface)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-primary)',
    },
    btnDanger: {
      backgroundColor: 'var(--status-error)',
      color: '#fff',
    },
    btnSuccess: {
      backgroundColor: 'var(--status-success)',
      color: '#fff',
    },
    installedBadge: {
      padding: '2px 8px',
      backgroundColor: 'var(--accent-teal)',
      color: 'var(--bg-base)',
      borderRadius: '10px',
      fontSize: '0.6rem',
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    publicBadge: {
      padding: '2px 8px',
      backgroundColor: 'var(--accent-purple)',
      color: '#fff',
      borderRadius: '10px',
      fontSize: '0.6rem',
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    ownerBadge: {
      padding: '2px 8px',
      backgroundColor: 'var(--accent-amber)',
      color: 'var(--bg-base)',
      borderRadius: '10px',
      fontSize: '0.6rem',
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    createBtn: {
      padding: '10px 16px',
      backgroundColor: 'var(--accent-amber)',
      color: 'var(--bg-base)',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: '500',
    },
    loadingContainer: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px',
    },
    builtInSection: {
      marginBottom: '24px',
    },
    sectionTitle: {
      color: 'var(--accent-amber)',
      fontSize: '0.75rem',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '12px',
      paddingBottom: '4px',
      borderBottom: '1px solid var(--border-subtle)',
    },
  };

  // Render a theme preview based on its variables
  const renderThemePreview = (theme) => {
    const vars = theme.variables || {};
    const bgBase = vars['--bg-base'] || '#050805';
    const bgSurface = vars['--bg-surface'] || '#0d150d';
    const bgElevated = vars['--bg-elevated'] || '#0a100a';
    const accentAmber = vars['--accent-amber'] || '#ffd23f';
    const accentTeal = vars['--accent-teal'] || '#3bceac';
    const textPrimary = vars['--text-primary'] || '#d5e5d5';
    const textDim = vars['--text-dim'] || '#7a8a7a';

    return (
      <div style={{ ...styles.themePreview, backgroundColor: bgBase }}>
        {/* Simulated wave item */}
        <div style={{ ...styles.previewRow, backgroundColor: bgSurface }}>
          <div style={{ ...styles.previewDot, backgroundColor: accentAmber }} />
          <div style={{ ...styles.previewLine, backgroundColor: textPrimary, maxWidth: '60%' }} />
        </div>
        {/* Simulated ping */}
        <div style={{ ...styles.previewRow, backgroundColor: bgElevated }}>
          <div style={{ ...styles.previewDot, backgroundColor: accentTeal }} />
          <div style={{ ...styles.previewLine, backgroundColor: textDim, maxWidth: '80%' }} />
        </div>
        {/* Simulated buttons */}
        <div style={{ ...styles.previewRow, backgroundColor: bgBase, gap: '8px', marginTop: '4px' }}>
          <div style={{ width: '40px', height: '12px', borderRadius: '3px', backgroundColor: accentAmber }} />
          <div style={{ width: '40px', height: '12px', borderRadius: '3px', backgroundColor: bgSurface, border: `1px solid ${textDim}` }} />
        </div>
      </div>
    );
  };

  // Render a single theme card
  const renderThemeCard = (theme, isOwner = false) => {
    const isInstalled = installedThemeIds.has(theme.id);
    const isPreviewing = previewTheme?.id === theme.id;

    return (
      <div
        key={theme.id}
        style={{
          ...styles.themeCard,
          ...(isPreviewing ? styles.themeCardHover : {}),
        }}
        onMouseEnter={() => handlePreviewStart(theme)}
        onMouseLeave={handlePreviewEnd}
      >
        {renderThemePreview(theme)}

        <div style={styles.themeInfo}>
          <div style={styles.themeName}>{theme.name}</div>
          {theme.description && (
            <div style={styles.themeDescription}>{theme.description}</div>
          )}
          <div style={styles.themeMeta}>
            <span>by @{theme.creatorHandle || 'unknown'}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {isOwner && <span style={styles.ownerBadge}>yours</span>}
              {theme.isPublic && <span style={styles.publicBadge}>public</span>}
              {isInstalled && <span style={styles.installedBadge}>installed</span>}
            </div>
          </div>
        </div>

        <div style={styles.themeActions}>
          {isInstalled || isOwner ? (
            <>
              <button
                onClick={() => handleApply(theme)}
                style={{ ...styles.btn, ...styles.btnPrimary }}
              >
                Apply
              </button>
              {/* Only show Remove for installed themes that aren't yours */}
              {!isOwner && isInstalled && (
                <button
                  onClick={() => handleUninstall(theme)}
                  style={{ ...styles.btn, ...styles.btnSecondary }}
                >
                  Remove
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => handleInstall(theme)}
              style={{ ...styles.btn, ...styles.btnSuccess }}
            >
              Install
            </button>
          )}
          {isOwner && (
            <>
              <button
                onClick={() => onEditTheme(theme)}
                style={{ ...styles.btn, ...styles.btnSecondary }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(theme)}
                style={{ ...styles.btn, ...styles.btnDanger }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Render built-in themes section
  const renderBuiltInThemes = () => (
    <div style={styles.builtInSection}>
      <div style={styles.sectionTitle}>Built-in Themes</div>
      <div style={styles.grid}>
        {Object.entries(THEMES).map(([key, config]) => (
          <div key={key} style={styles.themeCard}>
            <div
              style={{
                ...styles.themePreview,
                backgroundColor: config.colors?.bgBase || '#050805',
              }}
            >
              <div style={{
                ...styles.previewRow,
                backgroundColor: config.colors?.bgSurface || '#0d150d',
              }}>
                <div style={{
                  ...styles.previewDot,
                  backgroundColor: config.colors?.accentAmber || '#ffd23f',
                }} />
                <div style={{
                  ...styles.previewLine,
                  backgroundColor: config.colors?.textPrimary || '#d5e5d5',
                  maxWidth: '60%',
                }} />
              </div>
            </div>
            <div style={styles.themeInfo}>
              <div style={styles.themeName}>{config.name}</div>
              <div style={styles.themeDescription}>{config.description}</div>
            </div>
            <div style={styles.themeActions}>
              <button
                onClick={async () => {
                  document.documentElement.setAttribute('data-theme', key);
                  localStorage.setItem('farhold_theme', key);
                  removeCustomTheme(key);
                  // Save preference to server
                  if (onUpdatePreferences) {
                    try {
                      await onUpdatePreferences({ theme: key });
                    } catch (error) {
                      console.error('Error saving theme preference:', error);
                    }
                  }
                  showToast(`Applied ${config.name}`, 'success');
                }}
                style={{ ...styles.btn, ...styles.btnPrimary }}
              >
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>Themes</h3>
        <button onClick={onCreateTheme} style={styles.createBtn}>
          Create Theme
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(view === 'gallery' ? styles.tabActive : {}) }}
          onClick={() => setView('gallery')}
        >
          Gallery
        </button>
        <button
          style={{ ...styles.tab, ...(view === 'myThemes' ? styles.tabActive : {}) }}
          onClick={() => setView('myThemes')}
        >
          My Themes
        </button>
      </div>

      {/* Controls */}
      {view === 'gallery' && (
        <div style={styles.controls}>
          <input
            type="text"
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={styles.select}
          >
            <option value="newest">Newest</option>
            <option value="popular">Popular</option>
            <option value="name">Name</option>
          </select>
        </div>
      )}

      {/* Content */}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.loadingContainer}>
            <LoadingSpinner size={24} />
          </div>
        ) : view === 'gallery' ? (
          <>
            {renderBuiltInThemes()}

            <div style={styles.sectionTitle}>Community Themes</div>
            {displayThemes.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyText}>
                  {search ? 'No themes match your search' : 'No community themes yet'}
                </div>
                <button onClick={onCreateTheme} style={styles.createBtn}>
                  Be the first to share a theme
                </button>
              </div>
            ) : (
              <div style={styles.grid}>
                {displayThemes.map(theme => renderThemeCard(theme, theme.creatorId === user?.userId))}
              </div>
            )}
          </>
        ) : (
          <>
            {myThemes.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyText}>
                  You haven't created any themes yet
                </div>
                <button onClick={onCreateTheme} style={styles.createBtn}>
                  Create your first theme
                </button>
              </div>
            ) : (
              <div style={styles.grid}>
                {myThemes.map(theme => renderThemeCard(theme, true))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ThemeGallery;
