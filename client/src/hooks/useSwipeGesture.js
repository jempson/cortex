import { useRef, useEffect } from 'react';

// ============ SWIPE GESTURE HOOK ============
export function useSwipeGesture(ref, { onSwipeLeft, onSwipeRight, threshold = 100 }) {
  const touchStart = useRef({ x: 0, y: 0 });
  const touchEnd = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const handleTouchEnd = (e) => {
      touchEnd.current = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      const deltaX = touchEnd.current.x - touchStart.current.x;
      const deltaY = Math.abs(touchEnd.current.y - touchStart.current.y);

      // Only trigger if horizontal swipe and not too much vertical movement
      if (Math.abs(deltaX) > threshold && deltaY < 100) {
        if (deltaX > 0 && onSwipeRight) onSwipeRight();
        if (deltaX < 0 && onSwipeLeft) onSwipeLeft();
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold]);
}
