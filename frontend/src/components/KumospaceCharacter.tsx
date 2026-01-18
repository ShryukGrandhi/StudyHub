/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KUMOSPACE-STYLE PIXEL CHARACTER
 * Top-down view with better shadows and animations
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useRef, useState } from 'react';

interface KumospaceCharacterProps {
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  isWalking: boolean;
  color?: string;
  size?: number;
  name?: string;
  className?: string;
}

export const KumospaceCharacter: React.FC<KumospaceCharacterProps> = ({
  x,
  y,
  facing = 'down',
  isWalking = false,
  color = '#4a90d9',
  size = 48,
  name,
  className = '',
}) => {
  const [mounted, setMounted] = useState(false);
  const frameRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return; // SSR safety
    
    if (!isWalking) {
      frameRef.current = 0;
      return;
    }

    let animationId: number;
    const animate = () => {
      frameRef.current = (frameRef.current + 1) % 20;
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isWalking]);

  // Simple frame calculation - works for both SSR and client
  const frame = mounted && isWalking ? Math.floor(frameRef.current / 10) % 2 : 0;
  const pixelSize = size / 16;

  // Character sprite in top-down view
  return (
    <div
      className={`kumospace-character ${className}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        width: size,
        height: size,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
      }}
    >
      {/* Shadow circle on ground */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '85%',
          transform: 'translateX(-50%)',
          width: size * 0.6,
          height: size * 0.2,
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '50%',
          zIndex: 0,
        }}
      />

      {/* Character body (top-down view) */}
      <svg
        width={size}
        height={size}
        style={{
          imageRendering: 'pixelated',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Body/Torso - top-down oval */}
        <ellipse
          cx={size / 2}
          cy={size * 0.55}
          rx={size * 0.18}
          ry={size * 0.12}
          fill={color}
          stroke="#000"
          strokeWidth="1"
        />

        {/* Head - smaller circle at top */}
        <circle
          cx={size / 2}
          cy={size * 0.35}
          r={size * 0.12}
          fill="#ffdbac"
          stroke="#000"
          strokeWidth="1"
        />

        {/* Hair */}
        <ellipse
          cx={size / 2}
          cy={size * 0.28}
          rx={size * 0.14}
          ry={size * 0.08}
          fill={color}
        />

        {/* Arms (sides) - shown as ovals on sides when walking */}
        {isWalking && frame === 1 ? (
          <>
            {/* Left arm swinging */}
            <ellipse
              cx={size * 0.25}
              cy={size * 0.55}
              rx={size * 0.06}
              ry={size * 0.12}
              fill={color}
              stroke="#000"
              strokeWidth="1"
            />
            {/* Right arm swinging */}
            <ellipse
              cx={size * 0.75}
              cy={size * 0.65}
              rx={size * 0.06}
              ry={size * 0.12}
              fill={color}
              stroke="#000"
              strokeWidth="1"
            />
          </>
        ) : (
          <>
            {/* Arms at rest */}
            <ellipse
              cx={size * 0.3}
              cy={size * 0.6}
              rx={size * 0.05}
              ry={size * 0.1}
              fill={color}
              stroke="#000"
              strokeWidth="1"
            />
            <ellipse
              cx={size * 0.7}
              cy={size * 0.6}
              rx={size * 0.05}
              ry={size * 0.1}
              fill={color}
              stroke="#000"
              strokeWidth="1"
            />
          </>
        )}

        {/* Legs - shown when walking */}
        {isWalking ? (
          <>
            <ellipse
              cx={size * 0.4}
              cy={size * 0.75}
              rx={size * 0.05}
              ry={size * 0.12}
              fill="#2a2a4a"
              stroke="#000"
              strokeWidth="1"
            />
            <ellipse
              cx={size * 0.6}
              cy={size * 0.75 + (frame === 1 ? size * 0.05 : 0)}
              rx={size * 0.05}
              ry={size * 0.12}
              fill="#2a2a4a"
              stroke="#000"
              strokeWidth="1"
            />
          </>
        ) : (
          <>
            <ellipse
              cx={size * 0.45}
              cy={size * 0.75}
              rx={size * 0.04}
              ry={size * 0.1}
              fill="#2a2a4a"
              stroke="#000"
              strokeWidth="1"
            />
            <ellipse
              cx={size * 0.55}
              cy={size * 0.75}
              rx={size * 0.04}
              ry={size * 0.1}
              fill="#2a2a4a"
              stroke="#000"
              strokeWidth="1"
            />
          </>
        )}

        {/* Face - simple eyes */}
        <circle cx={size * 0.45} cy={size * 0.32} r={size * 0.015} fill="#000" />
        <circle cx={size * 0.55} cy={size * 0.32} r={size * 0.015} fill="#000" />

        {/* Direction indicator (small triangle) */}
        {(facing === 'up' || facing === 'down') && (
          <polygon
            points={`${size / 2},${size * 0.2} ${size * 0.45},${size * 0.28} ${size * 0.55},${size * 0.28}`}
            fill={color}
            stroke="#000"
            strokeWidth="1"
            opacity={facing === 'up' ? 1 : 0.5}
          />
        )}
      </svg>

      {/* Name tag */}
      {name && (
        <div
          style={{
            position: 'absolute',
            top: -24,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            fontFamily: "'Press Start 2P', monospace",
            color: '#fff',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '4px 8px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: `2px solid ${color}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            zIndex: 20,
          }}
        >
          {name}
        </div>
      )}
    </div>
  );
};

export default KumospaceCharacter;
