import React, { useState, useEffect, useMemo } from 'react';

/**
 * Hearts Effect - Floating hearts rising upward
 * Used for Valentine's Day (Feb 12-15)
 */
const HeartsEffect = ({ colors = ['#FF69B4', '#FF1493', '#FFC0CB'] }) => {
  const [particles, setParticles] = useState([]);

  // Generate hearts on mount
  useEffect(() => {
    const hearts = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 12,
      duration: 10 + Math.random() * 8, // 10-18 seconds
      size: 12 + Math.random() * 18, // 12-30px
      opacity: 0.3 + Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      sway: -30 + Math.random() * 60 // horizontal sway
    }));
    setParticles(hearts);
  }, [colors]);

  const keyframes = useMemo(() => `
    @keyframes float-up {
      0% {
        transform: translateY(100vh) translateX(0) scale(0.5);
        opacity: 0;
      }
      10% {
        opacity: 1;
        transform: translateY(90vh) translateX(calc(var(--sway) * 0.3)) scale(0.8);
      }
      50% {
        transform: translateY(50vh) translateX(calc(var(--sway) * -0.5)) scale(1);
      }
      90% {
        opacity: 1;
        transform: translateY(10vh) translateX(calc(var(--sway) * 0.3)) scale(0.9);
      }
      100% {
        transform: translateY(-10vh) translateX(0) scale(0.5);
        opacity: 0;
      }
    }
  `, []);

  return (
    <>
      <style>{keyframes}</style>
      {particles.map((heart) => (
        <div
          key={heart.id}
          style={{
            position: 'absolute',
            left: `${heart.left}%`,
            bottom: '-30px',
            fontSize: `${heart.size}px`,
            color: heart.color,
            opacity: heart.opacity,
            animation: `float-up ${heart.duration}s ease-in-out infinite`,
            animationDelay: `${heart.delay}s`,
            '--sway': `${heart.sway}px`,
            textShadow: `0 0 10px ${heart.color}80`,
            willChange: 'transform, opacity'
          }}
        >
          {String.fromCharCode(0x2665)}
        </div>
      ))}
    </>
  );
};

export default HeartsEffect;
