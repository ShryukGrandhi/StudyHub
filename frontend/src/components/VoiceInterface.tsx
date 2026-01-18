/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * OFFICEMATES - VOICE INTERFACE COMPONENT
 * Real-time voice interaction with AI agents
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useVoiceSession, useWebSocket } from '../hooks/useVoiceSession';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface VoiceInterfaceProps {
  userId: string;
  onTranscript?: (transcript: string) => void;
  onAgentResponse?: (response: any) => void;
  className?: string;
}

interface AgentMessage {
  id: string;
  type: 'user' | 'agent';
  text: string;
  agent?: string;
  emotion?: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const VoiceInterface: React.FC<VoiceInterfaceProps> = ({
  userId,
  onTranscript,
  onAgentResponse,
  className = '',
}) => {
  const {
    isConnected,
    isRecording,
    isMuted,
    currentTranscript,
    finalTranscripts,
    agentResponses,
    error,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    toggleMute,
    clearTranscripts,
  } = useVoiceSession(userId);

  const { lastMessage } = useWebSocket(userId);

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle new final transcripts
  useEffect(() => {
    if (finalTranscripts.length > 0) {
      const latest = finalTranscripts[finalTranscripts.length - 1];
      addMessage('user', latest);
      onTranscript?.(latest);
    }
  }, [finalTranscripts, onTranscript]);

  // Handle agent responses
  useEffect(() => {
    if (agentResponses.length > 0) {
      const latest = agentResponses[agentResponses.length - 1];
      addMessage('agent', latest.text, latest.agent, latest.emotion);
      onAgentResponse?.(latest);
    }
  }, [agentResponses, onAgentResponse]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'voice_response':
        addMessage('agent', lastMessage.text, lastMessage.agent, lastMessage.emotion);
        break;
      case 'task_progress':
        setIsProcessing(true);
        break;
      case 'task_completed':
        setIsProcessing(false);
        break;
    }
  }, [lastMessage]);

  // Add message to list
  const addMessage = useCallback((
    type: 'user' | 'agent',
    text: string,
    agent?: string,
    emotion?: string
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        type,
        text,
        agent,
        emotion,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Handle connect/disconnect
  const handleToggleConnection = async () => {
    if (isConnected) {
      await disconnect();
    } else {
      await connect();
    }
  };

  // Handle recording toggle
  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <div className={`voice-interface ${className}`}>
      {/* Header */}
      <div className="voice-header">
        <h3>Voice Assistant</h3>
        <div className="status-indicator">
          <span className={`dot ${isConnected ? 'connected' : 'disconnected'}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.type}`}>
            {msg.type === 'agent' && msg.agent && (
              <div className="agent-name">{msg.agent}</div>
            )}
            <div className="message-text">{msg.text}</div>
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {/* Current transcript (interim) */}
        {currentTranscript && (
          <div className="message user interim">
            <div className="message-text">{currentTranscript}...</div>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="processing-indicator">
            <div className="spinner" />
            Processing your request...
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="error-banner">
          {error.message}
          <button onClick={() => connect()}>Retry</button>
        </div>
      )}

      {/* Controls */}
      <div className="voice-controls">
        {/* Connect/Disconnect */}
        <button
          onClick={handleToggleConnection}
          className={`control-btn ${isConnected ? 'disconnect' : 'connect'}`}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>

        {/* Record button */}
        <button
          onClick={handleToggleRecording}
          disabled={!isConnected}
          className={`control-btn record ${isRecording ? 'recording' : ''}`}
        >
          {isRecording ? (
            <>
              <span className="record-dot" />
              Stop
            </>
          ) : (
            'Start Recording'
          )}
        </button>

        {/* Mute button */}
        <button
          onClick={toggleMute}
          disabled={!isConnected}
          className={`control-btn mute ${isMuted ? 'muted' : ''}`}
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>

        {/* Clear button */}
        <button
          onClick={clearTranscripts}
          className="control-btn clear"
        >
          Clear
        </button>
      </div>

      {/* Styles */}
      <style jsx>{`
        .voice-interface {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a2e;
          border-radius: 12px;
          overflow: hidden;
          font-family: 'Press Start 2P', monospace;
        }

        .voice-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: #16213e;
          border-bottom: 2px solid #0f3460;
        }

        .voice-header h3 {
          margin: 0;
          color: #e94560;
          font-size: 14px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-size: 10px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .dot.connected {
          background: #5cb85c;
          box-shadow: 0 0 8px #5cb85c;
        }

        .dot.disconnected {
          background: #e94560;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          max-width: 80%;
          padding: 12px;
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.6;
        }

        .message.user {
          align-self: flex-end;
          background: #0f3460;
          color: #fff;
        }

        .message.agent {
          align-self: flex-start;
          background: #16213e;
          color: #fff;
          border: 1px solid #e94560;
        }

        .message.interim {
          opacity: 0.6;
          font-style: italic;
        }

        .agent-name {
          color: #e94560;
          font-size: 9px;
          margin-bottom: 4px;
        }

        .message-time {
          font-size: 8px;
          color: #888;
          margin-top: 4px;
          text-align: right;
        }

        .processing-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #f0ad4e;
          font-size: 10px;
          padding: 8px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #f0ad4e;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-banner {
          background: #e94560;
          color: #fff;
          padding: 8px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10px;
        }

        .error-banner button {
          background: #fff;
          color: #e94560;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-family: inherit;
          font-size: 9px;
        }

        .voice-controls {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: #16213e;
          border-top: 2px solid #0f3460;
          flex-wrap: wrap;
        }

        .control-btn {
          flex: 1;
          min-width: 80px;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .control-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .control-btn.connect {
          background: #5cb85c;
          color: #fff;
        }

        .control-btn.disconnect {
          background: #e94560;
          color: #fff;
        }

        .control-btn.record {
          background: #0f3460;
          color: #fff;
          border: 2px solid #4a90d9;
        }

        .control-btn.record.recording {
          background: #e94560;
          border-color: #e94560;
          animation: pulse 1s ease-in-out infinite;
        }

        .record-dot {
          width: 8px;
          height: 8px;
          background: #fff;
          border-radius: 50%;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .control-btn.mute {
          background: #f0ad4e;
          color: #000;
        }

        .control-btn.mute.muted {
          background: #888;
          color: #fff;
        }

        .control-btn.clear {
          background: #333;
          color: #fff;
        }

        .control-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE BUTTON COMPONENT (Compact version)
// ═══════════════════════════════════════════════════════════════════════════════

interface VoiceButtonProps {
  userId: string;
  onTranscript?: (transcript: string) => void;
  className?: string;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  userId,
  onTranscript,
  className = '',
}) => {
  const {
    isConnected,
    isRecording,
    connect,
    disconnect,
    startRecording,
    stopRecording,
  } = useVoiceSession(userId);

  const [isHolding, setIsHolding] = useState(false);

  const handleMouseDown = async () => {
    if (!isConnected) {
      await connect();
    }
    await startRecording();
    setIsHolding(true);
  };

  const handleMouseUp = () => {
    stopRecording();
    setIsHolding(false);
  };

  return (
    <button
      className={`voice-button ${isHolding ? 'recording' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>

      <style jsx>{`
        .voice-button {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #4a90d9;
          border: none;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(74, 144, 217, 0.3);
        }

        .voice-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(74, 144, 217, 0.4);
        }

        .voice-button.recording {
          background: #e94560;
          animation: pulse 1s ease-in-out infinite;
          box-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </button>
  );
};

export default VoiceInterface;
