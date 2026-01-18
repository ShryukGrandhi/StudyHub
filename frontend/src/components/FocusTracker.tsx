
import React, { useEffect, useRef, useState } from 'react';

interface FocusTrackerProps {
    userId: string;
    onDistraction?: (type: string, message: string) => void;
    isActive: boolean;
}

export const FocusTracker: React.FC<FocusTrackerProps> = ({
    userId,
    onDistraction,
    isActive
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isTracking, setIsTracking] = useState(false);
    const [status, setStatus] = useState<string>("Initializing...");

    // Start Camera
    useEffect(() => {
        if (!isActive) return;

        let stream: MediaStream | null = null;

        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setIsTracking(true);
                    setStatus("Tracking Face");
                }
            } catch (err) {
                console.error("Camera access denied:", err);
                setStatus("Camera Error - Allow Access");
            }
        };

        startCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            setIsTracking(false);
        };
    }, [isActive]);

    // Analyze Loop
    useEffect(() => {
        if (!isActive || !isTracking) return;

        const intervalId = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current) return;

            // Draw frame to canvas
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(videoRef.current, 0, 0, 320, 240);

            // Get Base64
            const imageData = canvasRef.current.toDataURL('image/jpeg', 0.7);

            try {
                const response = await fetch('http://localhost:8000/api/focus/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        image: imageData
                    })
                });

                const result = await response.json();

                if (result.distraction_detected) {
                    setStatus(`Distracted: ${result.intervention || "Focus!"}`);
                    if (onDistraction && result.intervention) {
                        onDistraction(result.distraction_type, result.intervention);
                    }
                } else {
                    setStatus("Focused ✅");
                }
            } catch (e) {
                console.error("Focus analysis failed:", e);
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(intervalId);
    }, [isActive, isTracking, userId, onDistraction]);

    if (!isActive) return null;

    return (
        <div className="focus-tracker">
            <div className="camera-preview">
                <video ref={videoRef} autoPlay playsInline muted className="video-feed" />
                <canvas ref={canvasRef} width="320" height="240" style={{ display: 'none' }} />
                <div className="status-overlay">
                    <span className="dot pulse"></span>
                    {status}
                </div>
            </div>

            <style jsx>{`
        .focus-tracker {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 160px;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #9b59b6; /* Focus room color */
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          z-index: 1000;
        }

        .video-feed {
          width: 100%;
          display: block;
          opacity: 0.8;
        }

        .status-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0,0,0,0.7);
          color: #fff;
          font-size: 10px;
          padding: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: center;
          font-family: monospace;
        }

        .dot {
          width: 6px;
          height: 6px;
          background: #2ecc71;
          border-radius: 50%;
        }

        .dot.pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
        </div>
    );
};
