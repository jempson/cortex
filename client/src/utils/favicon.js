// ============ FAVICON UTILITIES ============

// Tab notification state
let originalTitle = 'Cortex';
let originalFaviconHref = '/icons/favicon-32x32.png';
let notificationFaviconDataUrl = null;
let faviconFlashInterval = null;
let isFlashing = false;

// Generate notification favicon with red dot overlay
export const generateNotificationFavicon = () => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');

      // Draw original favicon
      ctx.drawImage(img, 0, 0, 32, 32);

      // Draw notification dot (red circle in top-right)
      ctx.beginPath();
      ctx.arc(24, 8, 7, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff6b35'; // Orange accent color
      ctx.fill();
      ctx.strokeStyle = '#050805'; // Dark border
      ctx.lineWidth = 1;
      ctx.stroke();

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = originalFaviconHref;
  });
};

// Initialize notification favicon on load
generateNotificationFavicon().then(dataUrl => {
  notificationFaviconDataUrl = dataUrl;
});

// Update document title with unread count
export const updateDocumentTitle = (count) => {
  if (count > 0) {
    document.title = `(${count}) ${originalTitle}`;
  } else {
    document.title = originalTitle;
  }
};

// Set favicon
export const setFavicon = (href) => {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
};

// Start flashing favicon between normal and notification versions
export const startFaviconFlash = () => {
  if (isFlashing || !notificationFaviconDataUrl) return;
  isFlashing = true;
  let showNotification = true;
  faviconFlashInterval = setInterval(() => {
    setFavicon(showNotification ? notificationFaviconDataUrl : originalFaviconHref);
    showNotification = !showNotification;
  }, 1000);
};

// Stop flashing favicon
export const stopFaviconFlash = () => {
  if (faviconFlashInterval) {
    clearInterval(faviconFlashInterval);
    faviconFlashInterval = null;
  }
  isFlashing = false;
  setFavicon(originalFaviconHref);
};
