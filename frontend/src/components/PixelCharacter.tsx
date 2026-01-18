/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PIXEL CHARACTER COMPONENT
 * Renders pixelated human sprites with walking/idle animations
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useRef } from 'react';

interface PixelCharacterProps {
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  isWalking: boolean;
  color?: string;
  size?: number;
  name?: string;
  className?: string;
}

export const PixelCharacter: React.FC<PixelCharacterProps> = ({
  x,
  y,
  facing = 'down',
  isWalking = false,
  color = '#4a90d9',
  size = 32,
  name,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;

    const drawPixel = (px: number, py: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(px, py, 1, 1);
    };

    const pixelSize = size / 16; // 16x16 sprite

    const clear = () => {
      ctx.clearRect(0, 0, size, size);
    };

    const drawFrame = () => {
      clear();
      
      // Animation frame (for walking)
      const animFrame = isWalking ? Math.floor(frameRef.current / 8) % 2 : 0;

      // Head (top center)
      const headY = 3;
      ctx.fillStyle = '#ffdbac'; // Skin tone
      ctx.fillRect(6 * pixelSize, headY * pixelSize, 4 * pixelSize, 4 * pixelSize);

      // Hair
      ctx.fillStyle = color;
      ctx.fillRect(5 * pixelSize, headY * pixelSize, 6 * pixelSize, 2 * pixelSize);
      if (animFrame === 1 && isWalking) {
        ctx.fillRect(4 * pixelSize, (headY + 1) * pixelSize, pixelSize, pixelSize);
        ctx.fillRect(11 * pixelSize, (headY + 1) * pixelSize, pixelSize, pixelSize);
      }

      // Body (torso)
      const bodyY = 8;
      ctx.fillStyle = color;
      ctx.fillRect(6 * pixelSize, bodyY * pixelSize, 4 * pixelSize, 5 * pixelSize);

      // Arms
      const armOffset = animFrame === 1 && isWalking ? (facing === 'left' ? -1 : facing === 'right' ? 1 : 0) : 0;
      ctx.fillStyle = color;
      // Left arm
      ctx.fillRect((4 + armOffset) * pixelSize, bodyY * pixelSize, 2 * pixelSize, 3 * pixelSize);
      // Right arm
      ctx.fillRect((10 + armOffset) * pixelSize, bodyY * pixelSize, 2 * pixelSize, 3 * pixelSize);

      // Legs
      const legOffset = animFrame === 1 && isWalking ? 1 : 0;
      const legY = 13;
      ctx.fillStyle = '#2a2a4a'; // Pants color
      
      // Left leg
      const leftLegX = facing === 'left' ? 6 - legOffset : 6 + legOffset;
      ctx.fillRect(leftLegX * pixelSize, legY * pixelSize, 2 * pixelSize, 3 * pixelSize);
      
      // Right leg
      const rightLegX = facing === 'right' ? 8 + legOffset : 8 - legOffset;
      ctx.fillRect(rightLegX * pixelSize, legY * pixelSize, 2 * pixelSize, 3 * pixelSize);

      // Face (simple eyes)
      ctx.fillStyle = '#000';
      ctx.fillRect(7 * pixelSize, (headY + 2) * pixelSize, pixelSize, pixelSize);
      ctx.fillRect(8 * pixelSize, (headY + 2) * pixelSize, pixelSize, pixelSize);

      // Facing direction adjustments
      if (facing === 'left') {
        // Flip horizontally by scaling
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-size, 0);
        // Redraw with flipped context (simplified: just mirror the sprite logic)
      } else if (facing === 'right') {
        // Default facing right
      } else if (facing === 'up') {
        // Slight adjustments for up/down
      }

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(5 * pixelSize, (size - 2 * pixelSize), 6 * pixelSize, 2 * pixelSize);
    };

    const animate = () => {
      if (isWalking) {
        frameRef.current++;
      }
      drawFrame();
      animationRef.current = requestAnimationFrame(animate);
    };

    drawFrame();
    if (isWalking) {
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [facing, isWalking, color, size]);

  return (
    <div
      className={`pixel-character ${className}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      {name && (
        <div className="character-name-tag" style={{ color }}>
          {name}
        </div>
      )}
      <style jsx>{`
        .pixel-character {
          pointer-events: none;
        }
        .character-name-tag {
          position: absolute;
          top: -20px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 8px;
          font-family: 'Press Start 2P', monospace;
          white-space: nowrap;
          background: rgba(0, 0, 0, 0.7);
          padding: 2px 4px;
          border-radius: 2px;
          text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.8);
        }
      `}</style>
    </div>
  );
};

/**
 * Simple SVG-based pixel character (fallback/alternative)
 */
export const PixelCharacterSVG: React.FC<PixelCharacterProps> = ({
  x,
  y,
  facing = 'down',
  isWalking = false,
  color = '#4a90d9',
  size = 32,
  name,
  className = '',
}) => {
  const frame = isWalking ? Math.floor(Date.now() / 200) % 2 : 0;
  const pixelSize = size / 16;

  return (
    <div
      className={`pixel-character-svg ${className}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) ${facing === 'left' ? 'scaleX(-1)' : ''}`,
        zIndex: 10,
        width: size,
        height: size,
      }}
    >
      <svg width={size} height={size} style={{ imageRendering: 'pixelated' }}>
        {/* Shadow */}
        <rect x={5 * pixelSize} y={14 * pixelSize} width={6 * pixelSize} height={2 * pixelSize} fill="rgba(0,0,0,0.3)" />
        
        {/* Legs */}
        <rect
          x={(6 - (frame && facing !== 'right' ? 1 : 0)) * pixelSize}
          y={13 * pixelSize}
          width={2 * pixelSize}
          height={3 * pixelSize}
          fill="#2a2a4a"
        />
        <rect
          x={(8 + (frame && facing === 'right' ? 1 : 0)) * pixelSize}
          y={13 * pixelSize}
          width={2 * pixelSize}
          height={3 * pixelSize}
          fill="#2a2a4a"
        />
        
        {/* Body */}
        <rect x={6 * pixelSize} y={8 * pixelSize} width={4 * pixelSize} height={5 * pixelSize} fill={color} />
        
        {/* Arms */}
        <rect
          x={(4 - (frame && facing === 'left' ? 1 : 0)) * pixelSize}
          y={8 * pixelSize}
          width={2 * pixelSize}
          height={3 * pixelSize}
          fill={color}
        />
        <rect
          x={(10 + (frame && facing === 'right' ? 1 : 0)) * pixelSize}
          y={8 * pixelSize}
          width={2 * pixelSize}
          height={3 * pixelSize}
          fill={color}
        />
        
        {/* Head */}
        <rect x={6 * pixelSize} y={3 * pixelSize} width={4 * pixelSize} height={4 * pixelSize} fill="#ffdbac" />
        
        {/* Hair */}
        <rect x={5 * pixelSize} y={3 * pixelSize} width={6 * pixelSize} height={2 * pixelSize} fill={color} />
        {frame === 1 && isWalking && (
          <>
            <rect x={4 * pixelSize} y={4 * pixelSize} width={pixelSize} height={pixelSize} fill={color} />
            <rect x={11 * pixelSize} y={4 * pixelSize} width={pixelSize} height={pixelSize} fill={color} />
          </>
        )}
        
        {/* Eyes */}
        <rect x={7 * pixelSize} y={5 * pixelSize} width={pixelSize} height={pixelSize} fill="#000" />
        <rect x={8 * pixelSize} y={5 * pixelSize} width={pixelSize} height={pixelSize} fill="#000" />
      </svg>
      
      {name && (
        <div
          style={{
            position: 'absolute',
            top: -18,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '8px',
            fontFamily: "'Press Start 2P', monospace",
            color: color,
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '2px 4px',
            borderRadius: '2px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {name}
        </div>
      )}
    </div>
  );
};

export default PixelCharacter;

