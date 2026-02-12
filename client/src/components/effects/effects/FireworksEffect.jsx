import React, { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Fireworks Effect - Burst animations with colored particles
 * Used for New Year's (Dec 31 - Jan 2) and Independence Day (Jul 3-5)
 */
const FireworksEffect = ({ colors = ['#FFD700', '#FFFFFF', '#C0C0C0'] }) => {
  const [bursts, setBursts] = useState([]);

  // Create a new firework burst
  const createBurst = useCallback(() => {
    const id = Date.now() + Math.random();
    const x = 10 + Math.random() * 80; // 10-90% from left
    const y = 10 + Math.random() * 50; // 10-60% from top
    const color = colors[Math.floor(Math.random() * colors.length)];
    const particleCount = 12 + Math.floor(Math.random() * 8); // 12-20 particles

    const particles = Array.from({ length: particleCount }, (_, i) => ({
      id: `${id}-${i}`,
      angle: (360 / particleCount) * i + Math.random() * 20,
      distance: 40 + Math.random() * 60, // 40-100px
      size: 3 + Math.random() * 4, // 3-7px
      duration: 1 + Math.random() * 0.5 // 1-1.5s
    }));

    return { id, x, y, color, particles, created: Date.now() };
  }, [colors]);

  // Spawn bursts periodically
  useEffect(() => {
    // Initial burst
    setBursts([createBurst()]);

    const interval = setInterval(() => {
      setBursts(prev => {
        // Remove old bursts (older than 2 seconds)
        const now = Date.now();
        const filtered = prev.filter(b => now - b.created < 2000);

        // Add new burst (1-2 at a time, max 4 on screen)
        if (filtered.length < 4) {
          const newBursts = [createBurst()];
          if (Math.random() > 0.6) {
            newBursts.push(createBurst());
          }
          return [...filtered, ...newBursts];
        }
        return filtered;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [createBurst]);

  const keyframes = useMemo(() => `
    @keyframes firework-particle {
      0% {
        transform: translate(0, 0) scale(1);
        opacity: 1;
      }
      100% {
        transform: translate(
          calc(cos(var(--angle)) * var(--distance)),
          calc(sin(var(--angle)) * var(--distance) + 30px)
        ) scale(0);
        opacity: 0;
      }
    }
    @keyframes firework-glow {
      0% {
        transform: scale(0);
        opacity: 1;
      }
      50% {
        transform: scale(1);
        opacity: 0.8;
      }
      100% {
        transform: scale(2);
        opacity: 0;
      }
    }
  `, []);

  return (
    <>
      <style>{keyframes}</style>
      {bursts.map((burst) => (
        <div
          key={burst.id}
          style={{
            position: 'absolute',
            left: `${burst.x}%`,
            top: `${burst.y}%`,
          }}
        >
          {/* Center glow */}
          <div
            style={{
              position: 'absolute',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${burst.color}, transparent)`,
              transform: 'translate(-50%, -50%)',
              animation: 'firework-glow 0.8s ease-out forwards'
            }}
          />
          {/* Particles */}
          {burst.particles.map((particle) => {
            const angleRad = (particle.angle * Math.PI) / 180;
            const endX = Math.cos(angleRad) * particle.distance;
            const endY = Math.sin(angleRad) * particle.distance + 30;

            return (
              <div
                key={particle.id}
                style={{
                  position: 'absolute',
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  borderRadius: '50%',
                  background: burst.color,
                  boxShadow: `0 0 ${particle.size * 2}px ${burst.color}`,
                  transform: 'translate(-50%, -50%)',
                  animation: `firework-particle ${particle.duration}s ease-out forwards`,
                  '--angle': `${angleRad}rad`,
                  '--distance': `${particle.distance}px`,
                  willChange: 'transform, opacity'
                }}
              />
            );
          })}
        </div>
      ))}
    </>
  );
};

export default FireworksEffect;
