#!/usr/bin/env node

/**
 * PWA Icon Generator for Farhold
 *
 * Run this script to generate all required PWA icons:
 *   node generate-icons.js
 *
 * Requires: npm install canvas
 */

const fs = require('fs');
const path = require('path');

// Try to load canvas, provide instructions if not available
let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.log('Canvas module not found. Installing...');
  console.log('Run: npm install canvas');
  console.log('Then run this script again.');
  process.exit(1);
}

const sizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 180, name: 'icon-180x180.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' },
  { size: 192, name: 'icon-maskable-192x192.png', maskable: true },
  { size: 512, name: 'icon-maskable-512x512.png', maskable: true },
];

function generateIcon(size, maskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#050805';
  ctx.fillRect(0, 0, size, size);

  const center = size / 2;
  const scale = size / 192; // Base scale on 192px

  // For maskable icons, add padding (safe zone is 80% of icon)
  const safeZoneOffset = maskable ? size * 0.1 : 0;
  const effectiveCenter = center;
  const effectiveScale = maskable ? scale * 0.8 : scale;

  // Outer circle (green)
  ctx.beginPath();
  ctx.arc(effectiveCenter, effectiveCenter, 60 * effectiveScale, 0, Math.PI * 2);
  ctx.strokeStyle = '#0ead69';
  ctx.lineWidth = 4 * effectiveScale;
  ctx.stroke();

  // Middle circle (amber)
  ctx.beginPath();
  ctx.arc(effectiveCenter, effectiveCenter, 40 * effectiveScale, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3 * effectiveScale;
  ctx.stroke();

  // Inner circle (filled green)
  ctx.beginPath();
  ctx.arc(effectiveCenter, effectiveCenter, 20 * effectiveScale, 0, Math.PI * 2);
  ctx.fillStyle = '#0ead69';
  ctx.fill();

  // Text "CORTEX" for larger icons
  if (size >= 128 && !maskable) {
    ctx.fillStyle = '#c5d5c5';
    ctx.font = `bold ${12 * effectiveScale}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('CORTEX', center, size - (10 * scale));
  }

  return canvas.toBuffer('image/png');
}

// Generate all icons
const iconsDir = __dirname;

sizes.forEach(({ size, name, maskable }) => {
  const buffer = generateIcon(size, maskable);
  const filePath = path.join(iconsDir, name);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated: ${name}`);
});

console.log('\nAll icons generated successfully!');
console.log('You can now use the PWA features.');
