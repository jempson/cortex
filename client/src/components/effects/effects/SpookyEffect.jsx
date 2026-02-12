import React, { useState, useEffect, useMemo } from 'react';

/**
 * Spooky Effect - Flying bats and ghosts
 * Used for Halloween (Oct 28 - Nov 1)
 */
const SpookyEffect = ({ colors = ['#FF6600', '#800080', '#000000'] }) => {
  const [particles, setParticles] = useState([]);

  // Generate spooky elements
  useEffect(() => {
    const elements = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: -10 + Math.random() * 120, // Can start off-screen
      top: Math.random() * 80,
      delay: Math.random() * 15,
      duration: 8 + Math.random() * 10, // 8-18 seconds
      size: 16 + Math.random() * 20, // 16-36px
      opacity: 0.4 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      type: Math.random() > 0.5 ? 'bat' : 'ghost',
      verticalDrift: -50 + Math.random() * 100
    }));
    setParticles(elements);
  }, [colors]);

  const keyframes = useMemo(() => `
    @keyframes fly-across {
      0% {
        transform: translateX(-50px) translateY(0);
        opacity: 0;
      }
      10% {
        opacity: 1;
      }
      25% {
        transform: translateX(25vw) translateY(calc(var(--vdrift) * 0.5));
      }
      50% {
        transform: translateX(50vw) translateY(calc(var(--vdrift) * -0.3));
      }
      75% {
        transform: translateX(75vw) translateY(calc(var(--vdrift) * 0.4));
      }
      90% {
        opacity: 1;
      }
      100% {
        transform: translateX(110vw) translateY(0);
        opacity: 0;
      }
    }
    @keyframes bat-flap {
      0%, 100% { transform: scaleY(1) scaleX(1); }
      50% { transform: scaleY(0.8) scaleX(0.7); }
    }
    @keyframes ghost-wobble {
      0%, 100% { transform: rotate(-3deg); }
      50% { transform: rotate(3deg); }
    }
  `, []);

  return (
    <>
      <style>{keyframes}</style>
      {/* Subtle dark overlay for atmosphere */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.15) 100%)',
          pointerEvents: 'none'
        }}
      />
      {/* Flying creatures */}
      {particles.map((particle) => (
        <div
          key={particle.id}
          style={{
            position: 'absolute',
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            fontSize: `${particle.size}px`,
            opacity: particle.opacity,
            animation: `fly-across ${particle.duration}s linear infinite`,
            animationDelay: `${particle.delay}s`,
            '--vdrift': `${particle.verticalDrift}px`,
            willChange: 'transform, opacity'
          }}
        >
          <span style={{
            display: 'inline-block',
            animation: particle.type === 'bat'
              ? 'bat-flap 0.15s ease-in-out infinite'
              : 'ghost-wobble 2s ease-in-out infinite',
            filter: particle.type === 'ghost'
              ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))'
              : `drop-shadow(0 0 4px ${particle.color})`
          }}>
            {particle.type === 'bat' ? String.fromCharCode(0x1F987) : String.fromCharCode(0x1F47B)}
          </span>
        </div>
      ))}
    </>
  );
};

export default SpookyEffect;
