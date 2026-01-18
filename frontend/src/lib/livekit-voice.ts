/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * OFFICEMATES - LIVEKIT VOICE INTEGRATION
 * Real-time voice communication with AI agents
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  Room,
  RoomEvent,
  LocalParticipant,
  RemoteParticipant,
  Track,
  TrackPublication,
  LocalAudioTrack,
  createLocalAudioTrack,
  ConnectionState,
} from 'livekit-client';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VoiceSessionConfig {
  livekitUrl: string;
  token: string;
  roomName: string;
  userId: string;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onAgentResponse?: (response: AgentVoiceResponse) => void;
  onConnectionChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
}

export interface AgentVoiceResponse {
  text: string;
  agent: string;
  emotion: 'neutral' | 'encouraging' | 'excited' | 'thoughtful';
  audioUrl?: string;
}

export interface DeepgramConfig {
  apiKey: string;
  sampleRate: number;
  channels: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE SESSION MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export class VoiceSessionManager {
  private room: Room | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private deepgramSocket: WebSocket | null = null;
  private config: VoiceSessionConfig | null = null;
  private isRecording = false;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;

  /**
   * Initialize and connect to LiveKit room
   */
  async connect(config: VoiceSessionConfig): Promise<void> {
    this.config = config;

    try {
      // Create room
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Set up event handlers
      this.setupRoomEvents();

      // Connect to room
      await this.room.connect(config.livekitUrl, config.token);

      console.log('Connected to LiveKit room:', config.roomName);

      // Publish local audio
      await this.publishAudio();

    } catch (error) {
      console.error('LiveKit connection failed:', error);
      config.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Set up LiveKit room event handlers
   */
  private setupRoomEvents(): void {
    if (!this.room || !this.config) return;

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state:', state);
      this.config?.onConnectionChange?.(state);
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('Participant connected:', participant.identity);
    });

    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        // Attach remote audio (agent responses)
        const audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        track.attach(audioElement);
      }
    });

    this.room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));

        if (data.type === 'transcript') {
          this.config?.onTranscript?.(data.text, data.isFinal);
        } else if (data.type === 'agent_response') {
          this.config?.onAgentResponse?.(data);
        }
      } catch (e) {
        console.error('Failed to parse data:', e);
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from room');
      this.cleanup();
    });
  }

  /**
   * Publish local audio track
   */
  private async publishAudio(): Promise<void> {
    if (!this.room) return;

    try {
      this.localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });

      await this.room.localParticipant.publishTrack(this.localAudioTrack);
      console.log('Published local audio track');

    } catch (error) {
      console.error('Failed to publish audio:', error);
      throw error;
    }
  }

  /**
   * Start Deepgram transcription
   */
  async startTranscription(deepgramApiKey: string): Promise<void> {
    if (this.deepgramSocket?.readyState === WebSocket.OPEN) return;

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en-US',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300',
    });

    this.deepgramSocket = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params}`,
      ['token', deepgramApiKey]
    );

    this.deepgramSocket.onopen = () => {
      console.log('Deepgram connected');
      this.startAudioCapture();
    };

    this.deepgramSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;

        if (transcript) {
          this.config?.onTranscript?.(transcript, isFinal);
        }
      } catch (e) {
        console.error('Deepgram parse error:', e);
      }
    };

    this.deepgramSocket.onerror = (error) => {
      console.error('Deepgram error:', error);
    };

    this.deepgramSocket.onclose = () => {
      console.log('Deepgram disconnected');
    };
  }

  /**
   * Start capturing audio for Deepgram
   */
  private async startAudioCapture(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(stream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      processor.onaudioprocess = (event) => {
        if (this.deepgramSocket?.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = this.convertFloat32ToInt16(inputData);
        this.deepgramSocket.send(pcmData.buffer);
      };

      this.isRecording = true;

    } catch (error) {
      console.error('Audio capture failed:', error);
      throw error;
    }
  }

  /**
   * Convert Float32 audio data to Int16 PCM
   */
  private convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Stop transcription
   */
  stopTranscription(): void {
    if (this.deepgramSocket) {
      this.deepgramSocket.close();
      this.deepgramSocket = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isRecording = false;
  }

  /**
   * Send data to room participants
   */
  async sendData(data: object): Promise<void> {
    if (!this.room) return;

    const encoded = new TextEncoder().encode(JSON.stringify(data));
    await this.room.localParticipant.publishData(encoded, { reliable: true });
  }

  /**
   * Mute/unmute local audio
   */
  async setMuted(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      if (muted) {
        this.localAudioTrack.mute();
      } else {
        this.localAudioTrack.unmute();
      }
    }
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get room connection state
   */
  getConnectionState(): ConnectionState | null {
    return this.room?.state || null;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.stopTranscription();
    this.cleanup();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const voiceSession = new VoiceSessionManager();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch voice session token from backend
 */
export async function getVoiceSessionToken(
  userId: string,
  roomName: string = 'officemates_main'
): Promise<{ token: string; url: string; room: string }> {
  const response = await fetch(
    `/api/voice/session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, room_name: roomName }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get voice session token');
  }

  const data = await response.json();
  return {
    token: data.livekit_token,
    url: data.livekit_url,
    room: data.room_name,
  };
}

/**
 * Create and connect a voice session
 */
export async function createVoiceSession(
  userId: string,
  callbacks: {
    onTranscript?: (transcript: string, isFinal: boolean) => void;
    onAgentResponse?: (response: AgentVoiceResponse) => void;
    onConnectionChange?: (state: ConnectionState) => void;
    onError?: (error: Error) => void;
  }
): Promise<VoiceSessionManager> {
  const { token, url, room } = await getVoiceSessionToken(userId);

  const session = new VoiceSessionManager();

  await session.connect({
    livekitUrl: url,
    token,
    roomName: room,
    userId,
    ...callbacks,
  });

  return session;
}
