/**
 * Simple character component for debugging - no animation
 */

import React from 'react';

interface SimpleCharacterProps {
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  isWalking: boolean;
  color?: string;
  size?: number;
  name?: string;
  className?: string;
}

export const SimpleCharacter: React.FC<SimpleCharacterProps> = ({
  x,
  y,
  facing = 'down',
  isWalking = false,
  color = '#4a90d9',
  size = 48,
  name,
  className = '',
}) => {
  return (
    <div
      className={`simple-character ${className}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        width: size,
        height: size,
      }}
    >
      {/* Shadow */}
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

      {/* Simple character circle */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.7,
          height: size * 0.7,
          background: color,
          borderRadius: '50%',
          border: '2px solid #000',
          zIndex: 1,
        }}
      />

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
            zIndex: 20,
          }}
        >
          {name}
        </div>
      )}
    </div>
  );
};

export default SimpleCharacter;


