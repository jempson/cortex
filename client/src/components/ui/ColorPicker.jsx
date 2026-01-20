/**
 * ColorPicker Component (v2.11.0)
 *
 * Simple color picker for theme editing.
 * Uses native color input with custom styling.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

const ColorPicker = ({
  value,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '#000000');
  const colorInputRef = useRef(null);
  const containerRef = useRef(null);

  // Normalize color to hex format for the input
  const normalizeToHex = (color) => {
    if (!color) return '#000000';

    // Already hex
    if (color.startsWith('#')) {
      // Expand 3-char hex to 6-char
      if (color.length === 4) {
        return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      }
      return color.slice(0, 7); // Remove alpha if present
    }

    // Parse rgb/rgba
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    return '#000000';
  };

  // Update input value when prop changes
  useEffect(() => {
    if (value) {
      setInputValue(normalizeToHex(value));
    }
  }, [value]);

  // Handle color input change
  const handleColorChange = useCallback((e) => {
    const newColor = e.target.value;
    setInputValue(newColor);
    onChange(newColor);
  }, [onChange]);

  // Handle text input change
  const handleTextChange = useCallback((e) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Validate and apply if it's a valid hex color
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(newValue)) {
      onChange(newValue);
    }
  }, [onChange]);

  // Handle text input blur - validate and normalize
  const handleTextBlur = useCallback(() => {
    // If input is valid hex, normalize it
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(inputValue)) {
      const normalized = normalizeToHex(inputValue);
      setInputValue(normalized);
      onChange(normalized);
    } else {
      // Reset to current value if invalid
      setInputValue(normalizeToHex(value));
    }
  }, [inputValue, value, onChange]);

  // Open color picker when clicking swatch
  const handleSwatchClick = useCallback(() => {
    if (!disabled && colorInputRef.current) {
      colorInputRef.current.click();
    }
  }, [disabled]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    label: {
      display: 'block',
      color: 'var(--text-secondary)',
      fontSize: '0.7rem',
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    description: {
      color: 'var(--text-muted)',
      fontSize: '0.6rem',
      marginTop: '2px',
    },
    inputRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    swatch: {
      width: '32px',
      height: '32px',
      borderRadius: '4px',
      border: '2px solid var(--border-primary)',
      backgroundColor: inputValue,
      cursor: disabled ? 'not-allowed' : 'pointer',
      flexShrink: 0,
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: isOpen ? `0 0 0 2px var(--accent-amber)` : 'none',
      opacity: disabled ? 0.5 : 1,
    },
    textInput: {
      flex: 1,
      padding: '6px 10px',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
      color: 'var(--text-primary)',
      fontSize: '0.75rem',
      fontFamily: 'monospace',
      outline: 'none',
      transition: 'border-color 0.15s',
      width: '100%',
      maxWidth: '100px',
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      width: 0,
      height: 0,
      pointerEvents: 'none',
    },
  };

  return (
    <div ref={containerRef} style={styles.container}>
      {label && <label style={styles.label}>{label}</label>}
      <div style={styles.inputRow}>
        <div
          style={styles.swatch}
          onClick={handleSwatchClick}
          title="Click to open color picker"
        />
        <input
          type="color"
          ref={colorInputRef}
          value={normalizeToHex(inputValue)}
          onChange={handleColorChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          disabled={disabled}
          style={styles.hiddenInput}
        />
        <input
          type="text"
          value={inputValue}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          placeholder="#000000"
          disabled={disabled}
          style={styles.textInput}
        />
      </div>
      {description && <span style={styles.description}>{description}</span>}
    </div>
  );
};

export default ColorPicker;
