import { useState, useCallback, useEffect } from 'react';

export function useDraggable(ref, { onPositionChange, initialPosition, disabled = false }) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e) => {
    if (disabled || e.button !== 0) return;
    if (e.target.dataset.draggable === 'false') return; // Skip buttons

    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (e) => {
      const newX = e.clientX - startX;
      const newY = e.clientY - startY;

      // Boundary check
      const maxX = window.innerWidth - position.width;
      const maxY = window.innerHeight - position.height;

      const clampedX = Math.max(0, Math.min(newX, maxX));
      const clampedY = Math.max(0, Math.min(newY, maxY));

      setPosition(prev => ({ ...prev, x: clampedX, y: clampedY }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      setIsDragging(false);

      // Snap to edge if close
      setPosition(prev => {
        const snapped = { ...prev };
        const snapDistance = 20;

        if (prev.x < snapDistance) snapped.x = 0;
        if (prev.y < snapDistance) snapped.y = 0;
        if (window.innerWidth - (prev.x + prev.width) < snapDistance) {
          snapped.x = window.innerWidth - prev.width;
        }
        if (window.innerHeight - (prev.y + prev.height) < snapDistance) {
          snapped.y = window.innerHeight - prev.height;
        }

        onPositionChange?.(snapped);
        return snapped;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp, { once: true });
  }, [disabled, position, onPositionChange]);

  // Update position when initialPosition changes
  useEffect(() => {
    setPosition(initialPosition);
  }, [initialPosition.x, initialPosition.y, initialPosition.width, initialPosition.height]);

  return { position, isDragging, handleMouseDown };
}
