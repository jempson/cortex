import { useState, useEffect } from 'react';

// ============ RESPONSIVE HOOK ============
export function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', handleResize);
    handleResize(); // Set initial size
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Multiple breakpoints for better responsive design
  const isMobile = size.width < 600;      // Phone screens
  const isTablet = size.width >= 600 && size.width < 1024;  // Tablet screens
  const isDesktop = size.width >= 1024;   // Desktop screens
  const hasMeasured = size.width !== 0;

  return { ...size, isMobile, isTablet, isDesktop, hasMeasured };
}
