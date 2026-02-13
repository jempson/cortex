import React, { useState, useEffect, useMemo } from 'react';

/**
 * Candle Glow Effect - Golden flickering glow
 * Used for Hanukkah (8 days, variable dates)
 */
const CandleGlow = ({ colors = ['#0000FF', '#FFFFFF', '#FFD700'] }) => {
  const [particles, setParticles] = useState([]);

  // Generate glow particles
  useEffect(() => {
    const glows = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 2 + Math.random() * 3, // 2-5 seconds
      size: 4 + Math.random() * 12, // 4-16px
      baseOpacity: 0.1 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    setParticles(glows);
  }, [colors]);

  const keyframes = useMemo(() => `
    @keyframes candle-flicker {
      0%, 100% {
        opacity: var(--base-opacity);
        transform: scale(1);
        filter: blur(var(--blur-size));
      }
      25% {
        opacity: calc(var(--base-opacity) * 1.5);
        transform: scale(1.1);
      }
      50% {
        opacity: calc(var(--base-opacity) * 0.7);
        transform: scale(0.95);
      }
      75% {
        opacity: calc(var(--base-opacity) * 1.3);
        transform: scale(1.05);
      }
    }
    @keyframes gentle-rise {
      0% {
        transform: translateY(0);
      }
      100% {
        transform: translateY(-20px);
        opacity: 0;
      }
    }
  `, []);

  return (
    <>
      <style>{keyframes}</style>
      {/* Warm ambient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 100%, ${colors[2]}15 0%, transparent 60%)`,
          pointerEvents: 'none'
        }}
      />
      {/* Flickering glow particles */}
      {particles.map((glow) => (
        <div
          key={glow.id}
          style={{
            position: 'absolute',
            left: `${glow.left}%`,
            top: `${glow.top}%`,
            width: `${glow.size}px`,
            height: `${glow.size}px`,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glow.color}, transparent)`,
            boxShadow: `0 0 ${glow.size * 2}px ${glow.color}`,
            animation: `candle-flicker ${glow.duration}s ease-in-out infinite`,
            animationDelay: `${glow.delay}s`,
            '--base-opacity': glow.baseOpacity,
            '--blur-size': `${glow.size / 4}px`,
            willChange: 'transform, opacity'
          }}
        />
      ))}
      {/* Rising spark particles */}
      {Array.from({ length: 15 }, (_, i) => ({
        id: `spark-${i}`,
        left: 30 + Math.random() * 40, // Concentrated in middle
        delay: i * 0.8 + Math.random() * 2,
        duration: 4 + Math.random() * 3,
        size: 2 + Math.random() * 3
      })).map((spark) => (
        <div
          key={spark.id}
          style={{
            position: 'absolute',
            left: `${spark.left}%`,
            bottom: '10%',
            width: `${spark.size}px`,
            height: `${spark.size}px`,
            borderRadius: '50%',
            background: colors[2],
            boxShadow: `0 0 ${spark.size * 3}px ${colors[2]}`,
            animation: `gentle-rise ${spark.duration}s ease-out infinite`,
            animationDelay: `${spark.delay}s`,
            opacity: 0.6,
            willChange: 'transform, opacity'
          }}
        />
      ))}
    </>
  );
};

export default CandleGlow;
