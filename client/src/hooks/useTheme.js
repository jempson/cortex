/**
 * useTheme Hook (v2.11.0)
 *
 * Manages custom theme application and storage.
 * Handles dynamic CSS variable injection for custom themes.
 */

import { useState, useCallback, useEffect } from 'react';
import { storage } from '../utils/storage.js';

// CSS variables that can be customized in themes
export const THEME_VARIABLE_GROUPS = {
  backgrounds: [
    { key: '--bg-base', label: 'Base', description: 'Main background' },
    { key: '--bg-surface', label: 'Surface', description: 'Card/panel backgrounds' },
    { key: '--bg-elevated', label: 'Elevated', description: 'Modals and elevated surfaces' },
    { key: '--bg-hover', label: 'Hover', description: 'Hover state backgrounds' },
    { key: '--bg-active', label: 'Active', description: 'Active/selected state' },
  ],
  text: [
    { key: '--text-primary', label: 'Primary', description: 'Main text color' },
    { key: '--text-secondary', label: 'Secondary', description: 'Secondary text' },
    { key: '--text-dim', label: 'Dim', description: 'Dimmed/subtle text' },
    { key: '--text-muted', label: 'Muted', description: 'Very subtle text' },
  ],
  borders: [
    { key: '--border-primary', label: 'Primary', description: 'Main borders' },
    { key: '--border-secondary', label: 'Secondary', description: 'Subtle borders' },
    { key: '--border-subtle', label: 'Subtle', description: 'Very subtle borders' },
  ],
  accents: [
    { key: '--accent-amber', label: 'Amber', description: 'Primary accent (links, highlights)' },
    { key: '--accent-teal', label: 'Teal', description: 'Secondary accent' },
    { key: '--accent-green', label: 'Green', description: 'Success/positive accent' },
    { key: '--accent-orange', label: 'Orange', description: 'Warning accent' },
    { key: '--accent-purple', label: 'Purple', description: 'Special accent' },
  ],
  status: [
    { key: '--status-success', label: 'Success', description: 'Success states' },
    { key: '--status-warning', label: 'Warning', description: 'Warning states' },
    { key: '--status-error', label: 'Error', description: 'Error states' },
    { key: '--status-info', label: 'Info', description: 'Info states' },
  ],
  glows: [
    { key: '--glow-amber', label: 'Amber Glow', description: 'Amber glow effect' },
    { key: '--glow-teal', label: 'Teal Glow', description: 'Teal glow effect' },
    { key: '--glow-green', label: 'Green Glow', description: 'Green glow effect' },
  ],
};

// Flatten all variables for easy iteration
export const ALL_THEME_VARIABLES = Object.values(THEME_VARIABLE_GROUPS).flat();

// Default theme values (serenity theme)
export const DEFAULT_THEME_VARIABLES = {
  '--bg-base': '#050805',
  '--bg-elevated': '#0a100a',
  '--bg-surface': '#0d150d',
  '--bg-hover': '#1a2a1a',
  '--bg-active': '#243424',
  '--text-primary': '#d5e5d5',
  '--text-secondary': '#a5b5a5',
  '--text-dim': '#7a8a7a',
  '--text-muted': '#5a6a5a',
  '--border-primary': '#3a4a3a',
  '--border-secondary': '#4a5a4a',
  '--border-subtle': '#2a3a2a',
  '--accent-amber': '#ffd23f',
  '--accent-teal': '#3bceac',
  '--accent-green': '#0ead69',
  '--accent-orange': '#ff6b35',
  '--accent-purple': '#a855f7',
  '--status-success': '#0ead69',
  '--status-warning': '#ffd23f',
  '--status-error': '#ff6b35',
  '--status-info': '#3bceac',
  '--glow-amber': 'rgba(255, 210, 63, 0.4)',
  '--glow-teal': 'rgba(59, 206, 172, 0.4)',
  '--glow-green': 'rgba(14, 173, 105, 0.4)',
};

// Custom theme style element ID
const CUSTOM_THEME_STYLE_ID = 'custom-theme-style';

/**
 * Apply a custom theme by injecting CSS variables
 * @param {Object} themeData - Theme object with variables property
 */
export const applyCustomTheme = (themeData) => {
  // Remove any existing custom theme style
  const existingStyle = document.getElementById(CUSTOM_THEME_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }

  if (!themeData || !themeData.variables) {
    return;
  }

  // Create style element with CSS variables
  const style = document.createElement('style');
  style.id = CUSTOM_THEME_STYLE_ID;

  // Build CSS variable declarations
  const cssVars = Object.entries(themeData.variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  style.textContent = `:root[data-theme="custom-${themeData.id}"] {\n${cssVars}\n}`;
  document.head.appendChild(style);

  // Set data-theme to custom theme ID
  document.documentElement.setAttribute('data-theme', `custom-${themeData.id}`);

  // Store in localStorage for persistence
  storage.setTheme(`custom-${themeData.id}`);
  localStorage.setItem('farhold_custom_theme', JSON.stringify(themeData));
};

/**
 * Remove custom theme and revert to built-in theme
 * @param {string} fallbackTheme - Built-in theme ID to fall back to
 */
export const removeCustomTheme = (fallbackTheme = 'serenity') => {
  // Remove custom theme style
  const existingStyle = document.getElementById(CUSTOM_THEME_STYLE_ID);
  if (existingStyle) {
    existingStyle.remove();
  }

  // Apply fallback theme
  document.documentElement.setAttribute('data-theme', fallbackTheme);
  storage.setTheme(fallbackTheme);
  localStorage.removeItem('farhold_custom_theme');
};

/**
 * Check if current theme is a custom theme
 * @returns {boolean}
 */
export const isCustomTheme = () => {
  const theme = storage.getTheme();
  return theme && theme.startsWith('custom-');
};

/**
 * Get current custom theme data from localStorage
 * @returns {Object|null}
 */
export const getCurrentCustomTheme = () => {
  try {
    const stored = localStorage.getItem('farhold_custom_theme');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

/**
 * Initialize custom theme on page load
 * Call this early in the app initialization
 */
export const initializeCustomTheme = () => {
  const theme = storage.getTheme();
  if (theme && theme.startsWith('custom-')) {
    const customTheme = getCurrentCustomTheme();
    if (customTheme) {
      applyCustomTheme(customTheme);
    }
  }
};

/**
 * Get computed CSS variable value from the current theme
 * @param {string} variable - CSS variable name (e.g., '--bg-base')
 * @returns {string}
 */
export const getComputedThemeVariable = (variable) => {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

/**
 * Get all current theme variable values
 * @returns {Object} Map of variable names to values
 */
export const getCurrentThemeVariables = () => {
  const variables = {};
  ALL_THEME_VARIABLES.forEach(({ key }) => {
    variables[key] = getComputedThemeVariable(key);
  });
  return variables;
};

/**
 * Hook for managing custom themes
 */
export const useTheme = () => {
  const [activeCustomTheme, setActiveCustomTheme] = useState(getCurrentCustomTheme());

  // Apply custom theme
  const applyTheme = useCallback((themeData) => {
    applyCustomTheme(themeData);
    setActiveCustomTheme(themeData);
  }, []);

  // Remove custom theme
  const clearTheme = useCallback((fallbackTheme = 'serenity') => {
    removeCustomTheme(fallbackTheme);
    setActiveCustomTheme(null);
  }, []);

  // Check if a specific theme is active
  const isThemeActive = useCallback((themeId) => {
    const currentTheme = storage.getTheme();
    if (themeId.startsWith('custom-')) {
      return currentTheme === themeId;
    }
    // For custom themes stored by their ID
    return currentTheme === `custom-${themeId}`;
  }, []);

  // Preview a theme temporarily (without saving)
  const previewTheme = useCallback((themeData) => {
    if (!themeData || !themeData.variables) return;

    // Remove any existing preview style
    const existingStyle = document.getElementById('theme-preview-style');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create preview style element
    const style = document.createElement('style');
    style.id = 'theme-preview-style';

    const cssVars = Object.entries(themeData.variables)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');

    style.textContent = `:root {\n${cssVars}\n}`;
    document.head.appendChild(style);
  }, []);

  // Stop previewing (remove preview styles)
  const stopPreview = useCallback(() => {
    const previewStyle = document.getElementById('theme-preview-style');
    if (previewStyle) {
      previewStyle.remove();
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeCustomTheme();
  }, []);

  return {
    activeCustomTheme,
    applyTheme,
    clearTheme,
    isThemeActive,
    previewTheme,
    stopPreview,
    isCustomTheme: isCustomTheme(),
    getCurrentVariables: getCurrentThemeVariables,
    defaultVariables: DEFAULT_THEME_VARIABLES,
  };
};

export default useTheme;
