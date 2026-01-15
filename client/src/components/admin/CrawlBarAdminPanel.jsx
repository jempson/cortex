import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '../ui/SimpleComponents.jsx';

const CrawlBarAdminPanel = ({ fetchAPI, showToast, isMobile, isOpen, onToggle }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stockSymbols, setStockSymbols] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAPI('/admin/crawl/config');
      setConfig(data.config);
      setStockSymbols((data.config?.stock_symbols || []).join(', '));
      setDefaultLocation(data.config?.default_location?.name || '');
    } catch (err) {
      if (!err.message?.includes('401')) {
        showToast(err.message || 'Failed to load crawl config', 'error');
      }
    }
    setLoading(false);
  }, [fetchAPI, showToast]);

  useEffect(() => {
    if (isOpen && !config) {
      loadConfig();
    }
  }, [isOpen, config, loadConfig]);

  const handleSave = async (updates) => {
    setSaving(true);
    try {
      const data = await fetchAPI('/admin/crawl/config', {
        method: 'PUT',
        body: updates
      });
      setConfig(data.config);
      showToast('Crawl bar configuration updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update config', 'error');
    }
    setSaving(false);
  };

  const handleSaveSymbols = async () => {
    const symbols = stockSymbols
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);
    await handleSave({ stock_symbols: symbols });
    setStockSymbols(symbols.join(', '));
  };

  const handleSaveLocation = async () => {
    // Simple location parsing - just store the name and let backend resolve coordinates
    if (defaultLocation.trim()) {
      await handleSave({
        default_location: { name: defaultLocation.trim(), lat: null, lon: null }
      });
    } else {
      await handleSave({
        default_location: { name: 'New York, NY', lat: 40.7128, lon: -74.0060 }
      });
      setDefaultLocation('New York, NY');
    }
  };

  return (
    <div style={{
      marginTop: '20px',
      padding: isMobile ? '16px' : '20px',
      background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-hover))',
      border: '1px solid var(--accent-teal)40',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ color: 'var(--accent-teal)', fontSize: '0.8rem', fontWeight: 500 }}>📊 CRAWL BAR CONFIG</div>
        <button
          onClick={onToggle}
          style={{
            padding: isMobile ? '8px 12px' : '6px 10px',
            background: isOpen ? 'var(--accent-teal)20' : 'transparent',
            border: `1px solid ${isOpen ? 'var(--accent-teal)' : 'var(--border-primary)'}`,
            color: isOpen ? 'var(--accent-teal)' : 'var(--text-dim)',
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
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Loading...</div>
          ) : (
            <>
              {/* Feature Toggles */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>ENABLED FEATURES</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleSave({ stocks_enabled: !config?.stocks_enabled })}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: config?.stocks_enabled ? 'var(--accent-green)20' : 'transparent',
                      border: `1px solid ${config?.stocks_enabled ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
                      color: config?.stocks_enabled ? 'var(--accent-green)' : 'var(--text-dim)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    📈 STOCKS
                  </button>
                  <button
                    onClick={() => handleSave({ weather_enabled: !config?.weather_enabled })}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: config?.weather_enabled ? 'var(--accent-teal)20' : 'transparent',
                      border: `1px solid ${config?.weather_enabled ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                      color: config?.weather_enabled ? 'var(--accent-teal)' : 'var(--text-dim)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    🌡️ WEATHER
                  </button>
                  <button
                    onClick={() => handleSave({ news_enabled: !config?.news_enabled })}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '10px 16px' : '8px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: config?.news_enabled ? 'var(--accent-purple)20' : 'transparent',
                      border: `1px solid ${config?.news_enabled ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                      color: config?.news_enabled ? 'var(--accent-purple)' : 'var(--text-dim)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    ◆ NEWS
                  </button>
                </div>
              </div>

              {/* Stock Symbols */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>STOCK SYMBOLS</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="AAPL, GOOGL, MSFT, AMZN, TSLA"
                    value={stockSymbols}
                    onChange={(e) => setStockSymbols(e.target.value)}
                    style={{
                      flex: 1,
                      padding: isMobile ? '12px' : '10px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  />
                  <button
                    onClick={handleSaveSymbols}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '12px 16px' : '10px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--accent-amber)20',
                      border: '1px solid var(--accent-amber)',
                      color: 'var(--accent-amber)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    SAVE
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                  Comma-separated list of stock ticker symbols
                </div>
              </div>

              {/* Default Location */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>DEFAULT LOCATION</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="New York, NY"
                    value={defaultLocation}
                    onChange={(e) => setDefaultLocation(e.target.value)}
                    style={{
                      flex: 1,
                      padding: isMobile ? '12px' : '10px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                    }}
                  />
                  <button
                    onClick={handleSaveLocation}
                    disabled={saving}
                    style={{
                      padding: isMobile ? '12px 16px' : '10px 16px',
                      minHeight: isMobile ? '44px' : 'auto',
                      background: 'var(--accent-amber)20',
                      border: '1px solid var(--accent-amber)',
                      color: 'var(--accent-amber)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontFamily: 'monospace',
                      fontSize: isMobile ? '0.9rem' : '0.85rem',
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    SAVE
                  </button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '6px' }}>
                  Default location for weather when user location is unavailable
                </div>
              </div>

              {/* Refresh Intervals */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>REFRESH INTERVALS (SECONDS)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>Stocks</div>
                    <input
                      type="number"
                      min="30"
                      max="600"
                      value={config?.stock_refresh_interval || 60}
                      onChange={(e) => handleSave({ stock_refresh_interval: parseInt(e.target.value, 10) || 60 })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>Weather</div>
                    <input
                      type="number"
                      min="60"
                      max="1800"
                      value={config?.weather_refresh_interval || 300}
                      onChange={(e) => handleSave({ weather_refresh_interval: parseInt(e.target.value, 10) || 300 })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '4px' }}>News</div>
                    <input
                      type="number"
                      min="60"
                      max="1800"
                      value={config?.news_refresh_interval || 180}
                      onChange={(e) => handleSave({ news_refresh_interval: parseInt(e.target.value, 10) || 180 })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* API Key Status */}
              <div style={{ padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginTop: '12px' }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '8px' }}>API KEY STATUS</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                  <span style={{ color: config?.apiKeys?.finnhub ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.finnhub ? '✓' : '✗'} Finnhub
                  </span>
                  <span style={{ color: config?.apiKeys?.openweathermap ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.openweathermap ? '✓' : '✗'} OpenWeather
                  </span>
                  <span style={{ color: config?.apiKeys?.newsapi ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.newsapi ? '✓' : '✗'} NewsAPI
                  </span>
                  <span style={{ color: config?.apiKeys?.gnews ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {config?.apiKeys?.gnews ? '✓' : '✗'} GNews
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '8px' }}>
                  Configure API keys in server/.env file
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============ ALERTS ADMIN PANEL ============
export default CrawlBarAdminPanel;
