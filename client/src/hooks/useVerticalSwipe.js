import { useRef, useEffect } from 'react';

/**
 * useVerticalSwipe Hook (v2.8.0)
 *
 * Detects vertical swipe gestures for navigating between videos in the feed.
 * Designed to work with CSS scroll-snap for smooth transitions.
 *
 * @param {React.RefObject} ref - Reference to the scrollable container
 * @param {Object} options - Configuration options
 * @param {Function} options.onSwipeUp - Callback when user swipes up (next video)
 * @param {Function} options.onSwipeDown - Callback when user swipes down (previous video)
 * @param {number} options.threshold - Minimum swipe distance to trigger (default: 50px)
 * @param {boolean} options.enabled - Whether swipe detection is enabled (default: true)
 */
export function useVerticalSwipe(ref, { onSwipeUp, onSwipeDown, threshold = 50, enabled = true }) {
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const touchEnd = useRef({ x: 0, y: 0, time: 0 });

  useEffect(() => {
    if (!enabled) return;

    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e) => {
      touchEnd.current = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
        time: Date.now(),
      };

      const deltaY = touchEnd.current.y - touchStart.current.y;
      const deltaX = Math.abs(touchEnd.current.x - touchStart.current.x);
      const deltaTime = touchEnd.current.time - touchStart.current.time;

      // Only trigger if:
      // 1. Vertical movement exceeds threshold
      // 2. Horizontal movement is less than vertical (not a horizontal swipe)
      // 3. Swipe was fast enough (within 300ms) or distance is significant
      const isVerticalSwipe = Math.abs(deltaY) > threshold && Math.abs(deltaY) > deltaX;
      const isFastEnough = deltaTime < 300 || Math.abs(deltaY) > threshold * 2;

      if (isVerticalSwipe && isFastEnough) {
        if (deltaY < 0 && onSwipeUp) {
          // Swiped up - go to next
          onSwipeUp();
        } else if (deltaY > 0 && onSwipeDown) {
          // Swiped down - go to previous
          onSwipeDown();
        }
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeUp, onSwipeDown, threshold, enabled]);
}

export default useVerticalSwipe;
