import { useState, useRef, useEffect } from 'react';

// ============ PULL TO REFRESH HOOK ============
export function usePullToRefresh(ref, onRefresh) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const threshold = 60;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      // Only activate if scrolled to top
      if (el.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        setPulling(true);
      }
    };

    const handleTouchMove = (e) => {
      if (!pulling && el.scrollTop !== 0) return;

      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - startY.current;

      // Only pull down, and apply resistance
      if (distance > 0 && el.scrollTop === 0) {
        setPullDistance(Math.min(distance * 0.5, threshold + 20)); // Resistance effect
        if (distance > 10) {
          e.preventDefault(); // Prevent scroll bounce
        }
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > threshold && !refreshing) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
      setPulling(false);
      setPullDistance(0);
      startY.current = 0;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, pulling, pullDistance, refreshing, onRefresh]);

  return { pulling, pullDistance, refreshing };
}
