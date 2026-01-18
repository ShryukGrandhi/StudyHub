/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * OFFICEMATES - VOICE SESSION REACT HOOK
 * React hook for managing LiveKit voice sessions with agents
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionState } from 'livekit-client';
import {
  VoiceSessionManager,
  AgentVoiceResponse,
  getVoiceSessionToken,
} from '../lib/livekit-voice';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VoiceSessionState {
  isConnected: boolean;
  isRecording: boolean;
  isMuted: boolean;
  connectionState: ConnectionState | null;
  currentTranscript: string;
  finalTranscripts: string[];
  agentResponses: AgentVoiceResponse[];
  error: Error | null;
}

export interface UseVoiceSessionReturn extends VoiceSessionState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  toggleMute: () => Promise<void>;
  clearTranscripts: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════════════════════════════════════════

const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || '';
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useVoiceSession(userId: string): UseVoiceSessionReturn {
  // Session manager ref
  const sessionRef = useRef<VoiceSessionManager | null>(null);

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [finalTranscripts, setFinalTranscripts] = useState<string[]>([]);
  const [agentResponses, setAgentResponses] = useState<AgentVoiceResponse[]>([]);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Handle incoming transcript
   */
  const handleTranscript = useCallback((transcript: string, isFinal: boolean) => {
    if (isFinal) {
      setFinalTranscripts((prev) => [...prev, transcript]);
      setCurrentTranscript('');

      // Send to backend for processing
      sendTranscriptToBackend(userId, transcript);
    } else {
      setCurrentTranscript(transcript);
    }
  }, [userId]);

  /**
   * Handle agent voice response
   */
  const handleAgentResponse = useCallback((response: AgentVoiceResponse) => {
    setAgentResponses((prev) => [...prev, response]);

    // Play audio if available
    if (response.audioUrl) {
      const audio = new Audio(response.audioUrl);
      audio.play().catch(console.error);
    }
  }, []);

  /**
   * Handle connection state change
   */
  const handleConnectionChange = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    setIsConnected(state === ConnectionState.Connected);
  }, []);

  /**
   * Handle error
   */
  const handleError = useCallback((err: Error) => {
    setError(err);
    console.error('Voice session error:', err);
  }, []);

  /**
   * Connect to voice session
   */
  const connect = useCallback(async () => {
    try {
      setError(null);

      // Get token from backend
      const { token, url, room } = await getVoiceSessionToken(userId);

      // Create session manager
      const session = new VoiceSessionManager();
      sessionRef.current = session;

      // Connect
      await session.connect({
        livekitUrl: url,
        token,
        roomName: room,
        userId,
        onTranscript: handleTranscript,
        onAgentResponse: handleAgentResponse,
        onConnectionChange: handleConnectionChange,
        onError: handleError,
      });

      setIsConnected(true);

    } catch (err) {
      handleError(err as Error);
    }
  }, [userId, handleTranscript, handleAgentResponse, handleConnectionChange, handleError]);

  /**
   * Disconnect from voice session
   */
  const disconnect = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.disconnect();
      sessionRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
    setConnectionState(null);
  }, []);

  /**
   * Start recording with Deepgram transcription
   */
  const startRecording = useCallback(async () => {
    if (!sessionRef.current || !isConnected) {
      throw new Error('Not connected to voice session');
    }

    try {
      await sessionRef.current.startTranscription(DEEPGRAM_API_KEY);
      setIsRecording(true);
    } catch (err) {
      handleError(err as Error);
    }
  }, [isConnected, handleError]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.stopTranscription();
      setIsRecording(false);
    }
  }, []);

  /**
   * Toggle mute
   */
  const toggleMute = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.setMuted(!isMuted);
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  /**
   * Clear transcripts
   */
  const clearTranscripts = useCallback(() => {
    setCurrentTranscript('');
    setFinalTranscripts([]);
    setAgentResponses([]);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    isRecording,
    isMuted,
    connectionState,
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
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send transcript to backend for processing
 */
async function sendTranscriptToBackend(userId: string, transcript: string): Promise<void> {
  try {
    await fetch('/api/voice/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        transcript,
        is_final: true,
      }),
    });
  } catch (error) {
    console.error('Failed to send transcript to backend:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET HOOK FOR REAL-TIME UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

export function useWebSocket(userId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${userId}`);

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');

      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [userId]);

  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, lastMessage, sendMessage };
}
