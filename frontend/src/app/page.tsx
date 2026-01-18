'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FocusTracker } from '../components/FocusTracker';
import { CodeViewer } from '../components/CodeViewer';
import { ChatFlashcards } from '../components/ChatFlashcards';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  currentRoom: string | null;
  isLocal: boolean;
  role: 'student' | 'teacher';
}

interface Specialist {
  id: string;
  name: string;
  role: string;
  thinkingStyle: string;
  sprite: string;
  department: string;
  x: number;
  y: number;
  color: string;
  isAvailable: boolean;
}

interface Room {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doorX: number;
  doorY: number;
  specialists: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'hint';
  content: string;
  specialist?: string;
  timestamp: Date;
  isCorrect?: boolean;
  videoUrl?: string;
  visualType?: 'none' | 'video' | 'flashcards' | 'practice';
  visual?: any;
  sources?: { title: string; url: string }[];
}

interface Problem {
  id: string;
  question: string;
  type: 'math' | 'science' | 'english' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  hints: string[];
  hintsUsed: number;
  correctAnswer?: string;
  studentAnswer?: string;
  isCorrect?: boolean;
  feedback?: string;
}

interface Flashcard {
  id: string;
  front: string;
  back: string;
  confidence: number;
  nextReview: Date;
  interval: number;
  easeFactor: number;
  repetitions: number;
}

interface StudentProgress {
  totalProblems: number;
  correctProblems: number;
  hintsUsed: number;
  timeSpent: number;
  streakDays: number;
  masteryByTopic: Record<string, number>;
  recentActivity: Array<{
    timestamp: Date;
    action: string;
    topic: string;
    correct?: boolean;
  }>;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  department: string;
  dueDate: Date;
  problems: Problem[];
  submissions: Array<{
    studentId: string;
    studentName: string;
    submittedAt: Date;
    score: number;
    feedback: string;
  }>;
}

interface SmartTask {
  id: string;
  title: string;
  description: string;
  department: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: Date;
  estimatedMinutes: number;
  recommendedAgent: string;
  recommendedAgentReason: string;
  recommendedFocusTime: number;
  relatedAssignment?: string;
  tags: string[];
  createdAt: Date;
  completedAt?: Date;
  notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 800;
const PLAYER_SIZE = 32;
const PLAYER_SPEED = 4;

const ROOMS: Room[] = [
  {
    id: 'math',
    name: 'Mathematics Lab',
    color: '#4a90d9',
    x: 50,
    y: 50,
    width: 300,
    height: 250,
    doorX: 200,
    doorY: 300,
    specialists: ['calvin', 'alyx', 'geo']
  },
  {
    id: 'science',
    name: 'Science Lab',
    color: '#5cb85c',
    x: 450,
    y: 50,
    width: 300,
    height: 250,
    doorX: 600,
    doorY: 300,
    specialists: ['nova', 'helix', 'quanta']
  },
  {
    id: 'english',
    name: 'English Wing',
    color: '#f0ad4e',
    x: 850,
    y: 50,
    width: 300,
    height: 250,
    doorX: 1000,
    doorY: 300,
    specialists: ['iris', 'lex', 'rhet']
  },
  {
    id: 'focus',
    name: 'FocusRoom',
    color: '#9b59b6',
    x: 450,
    y: 450,
    width: 300,
    height: 250,
    doorX: 600,
    doorY: 450,
    specialists: ['coach', 'recall', 'proof']
  },
];

const SPECIALISTS: Record<string, Omit<Specialist, 'x' | 'y' | 'isAvailable'>> = {
  calvin: { id: 'calvin', name: 'Calvin', role: 'Calculus', thinkingStyle: 'Change & Motion', sprite: '👨‍🏫', department: 'math', color: '#4a90d9' },
  alyx: { id: 'alyx', name: 'Alyx', role: 'Algebra', thinkingStyle: 'Symbolic Structure', sprite: '👩‍💻', department: 'math', color: '#6ba3e0' },
  geo: { id: 'geo', name: 'Geo', role: 'Geometry', thinkingStyle: 'Spatial Reasoning', sprite: '📐', department: 'math', color: '#3a7fc9' },
  nova: { id: 'nova', name: 'Nova', role: 'Physics', thinkingStyle: 'Causal Intuition', sprite: '🔭', department: 'science', color: '#5cb85c' },
  helix: { id: 'helix', name: 'Helix', role: 'Biology', thinkingStyle: 'Systems Thinking', sprite: '🧬', department: 'science', color: '#7bc97b' },
  quanta: { id: 'quanta', name: 'Quanta', role: 'Chemistry', thinkingStyle: 'Micro→Macro', sprite: '⚗️', department: 'science', color: '#4ca84c' },
  iris: { id: 'iris', name: 'Iris', role: 'Writing', thinkingStyle: 'Argument & Clarity', sprite: '✍️', department: 'english', color: '#f0ad4e' },
  lex: { id: 'lex', name: 'Lex', role: 'Literature', thinkingStyle: 'Interpretation', sprite: '📖', department: 'english', color: '#e09d3e' },
  rhet: { id: 'rhet', name: 'Rhet', role: 'Rhetoric', thinkingStyle: 'Persuasion', sprite: '🎭', department: 'english', color: '#d08d2e' },
  coach: { id: 'coach', name: 'Coach', role: 'Focus', thinkingStyle: 'Behavioral', sprite: '🎯', department: 'focus', color: '#9b59b6' },
  recall: { id: 'recall', name: 'Recall', role: 'Memory', thinkingStyle: 'Spaced Repetition', sprite: '🧠', department: 'focus', color: '#8b49a6' },
  proof: { id: 'proof', name: 'Proof', role: 'Logic', thinkingStyle: 'Verification', sprite: '✓', department: 'focus', color: '#7b3996' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// OPENNOTE CONTEXT LAYER
// ═══════════════════════════════════════════════════════════════════════════════

const sendToOpenNote = async (userId: string, eventType: string, data: any) => {
  try {
    await fetch('http://localhost:8000/api/opennote/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        event_type: eventType,
        data: data,
        timestamp: new Date().toISOString()
      })
    });
  } catch (e: any) {
    // Silently fail if backend is not available (connection refused)
    if (!e.message?.includes('Failed to fetch') && !e.message?.includes('ERR_CONNECTION_REFUSED')) {
      console.warn('OpenNote log failed:', e);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function StudyWorld() {
  // Core state
  const [userId] = useState(() => 'user_' + Math.random().toString(36).slice(2, 10));
  const [playerName, setPlayerName] = useState('');
  const [playerRole, setPlayerRole] = useState<'student' | 'teacher'>('student');
  const [isJoined, setIsJoined] = useState(false);

  // Player state
  const [localPlayer, setLocalPlayer] = useState<Player>({
    id: userId,
    name: '',
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT - 100,
    color: '#e94560',
    currentRoom: null,
    isLocal: true,
    role: 'student'
  });
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  // UI state
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState<Specialist | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Interactive features state
  const [activeMode, setActiveMode] = useState<'chat' | 'problem' | 'canvas' | 'flashcards' | 'focus' | 'dashboard' | null>(null);

  // Problem-solving state
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(null);
  const [problemAnswer, setProblemAnswer] = useState('');

  // Canvas/Handwriting state
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasHistory, setCanvasHistory] = useState<ImageData[]>([]);

  // Flashcard state with spaced repetition
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [showFlashcardBack, setShowFlashcardBack] = useState(false);

  // Focus mode state
  const [focusTimer, setFocusTimer] = useState(0);
  const [focusActive, setFocusActive] = useState(false);
  const [focusGoalMinutes, setFocusGoalMinutes] = useState(25);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [distractionLevel, setDistractionLevel] = useState(0);
  const [distractionWarning, setDistractionWarning] = useState('');
  const [showDebugOverlay, setShowDebugOverlay] = useState(true); // Default ON to show CV visualization
  const [debugImage, setDebugImage] = useState('');

  // Auto-engagement video generation state (for distraction response)
  const [lastContext, setLastContext] = useState<{ topic: string; response: string; timestamp: number } | null>(null);
  const lastContextRef = useRef<{ topic: string; response: string; timestamp: number } | null>(null);
  const [isAutoGeneratingVideo, setIsAutoGeneratingVideo] = useState(false);

  // Keep ref in sync with state (for use in intervals/callbacks)
  useEffect(() => {
    lastContextRef.current = lastContext;
  }, [lastContext]);

  // Code Viewer state
  const [codeViewerData, setCodeViewerData] = useState<{ code: string, isVisual: boolean } | null>(null);

  // Progress tracking
  const [studentProgress, setStudentProgress] = useState<StudentProgress>({
    totalProblems: 0,
    correctProblems: 0,
    hintsUsed: 0,
    timeSpent: 0,
    streakDays: 1,
    masteryByTopic: {},
    recentActivity: []
  });

  // Teacher Dashboard state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classStudents, setClassStudents] = useState<Player[]>([]);
  const [classAnalytics, setClassAnalytics] = useState<any>(null);

  // XP/Progress
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [notification, setNotification] = useState('');

  // Focus Room Orchestrator State (AntiGravity)
  const [decisionLogs, setDecisionLogs] = useState<any[]>([]);
  const [focusPlan, setFocusPlan] = useState<any>(null);
  const [learningEvents, setLearningEvents] = useState<any[]>([]);
  const [teachingReady, setTeachingReady] = useState(false);
  const [currentLearningEvent, setCurrentLearningEvent] = useState<string | null>(null);

  // Debug state for AntiGravity
  const [analysisCount, setAnalysisCount] = useState(0);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [facesDetected, setFacesDetected] = useState(0);

  // Smart Task List State
  const [smartTasks, setSmartTasks] = useState<SmartTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskRecommendations, setTaskRecommendations] = useState<any>(null);
  const [showTaskPanel, setShowTaskPanel] = useState(true);

  // Refs
  const keysPressed = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const focusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const distractionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameLoopRef = useRef<number>();

  // ═══════════════════════════════════════════════════════════════════════════════
  // INITIALIZE SPECIALISTS IN ROOMS
  // ═══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const initialSpecialists: Specialist[] = [];

    ROOMS.forEach(room => {
      room.specialists.forEach((specId, index) => {
        const config = SPECIALISTS[specId];
        if (config) {
          initialSpecialists.push({
            ...config,
            x: room.x + 50 + (index % 2) * 120,
            y: room.y + 80 + Math.floor(index / 2) * 80,
            isAvailable: true
          });
        }
      });
    });

    setSpecialists(initialSpecialists);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // KEYBOARD INPUT
  // ═══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle movement if in input/canvas mode
      if (activeMode === 'canvas' || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          setSelectedSpecialist(null);
          setActiveMode(null);
        }
        return;
      }

      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        keysPressed.current.add(e.key.toLowerCase());
      }
      if (e.key === 'Escape') {
        setSelectedSpecialist(null);
        setActiveMode(null);
      }
      if (e.key === 'e' || e.key === 'E') {
        const nearby = findNearbySpecialist();
        if (nearby) {
          setSelectedSpecialist(nearby);
          setActiveMode('chat');
          logActivity('specialist_interaction', nearby.department, { specialist: nearby.name });
        }
      }
      // Teacher dashboard shortcut
      if ((e.key === 't' || e.key === 'T') && playerRole === 'teacher') {
        setActiveMode(activeMode === 'dashboard' ? null : 'dashboard');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [specialists, localPlayer, activeMode, playerRole]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME LOOP - PLAYER MOVEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isJoined) return;

    const gameLoop = () => {
      setLocalPlayer(prev => {
        let newX = prev.x;
        let newY = prev.y;

        if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) newY -= PLAYER_SPEED;
        if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) newY += PLAYER_SPEED;
        if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) newX -= PLAYER_SPEED;
        if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) newX += PLAYER_SPEED;

        newX = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_WIDTH - PLAYER_SIZE / 2, newX));
        newY = Math.max(PLAYER_SIZE / 2, Math.min(WORLD_HEIGHT - PLAYER_SIZE / 2, newY));

        let enteredRoom: Room | null = null;
        for (const room of ROOMS) {
          const inRoom = newX >= room.x && newX <= room.x + room.width &&
            newY >= room.y && newY <= room.y + room.height;
          if (inRoom) {
            enteredRoom = room;
            break;
          }
        }

        if (enteredRoom?.id !== prev.currentRoom) {
          if (enteredRoom) {
            showNotification(`Entered ${enteredRoom.name}`);
            setCurrentRoom(enteredRoom);
            logActivity('room_enter', enteredRoom.id, { room_name: enteredRoom.name });

            // Auto-open Focus Room page when entering focus room
            if (enteredRoom.id === 'focus') {
              setActiveMode('focus');
            }
          } else {
            setCurrentRoom(null);
          }
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          if (newX !== prev.x || newY !== prev.y) {
            wsRef.current.send(JSON.stringify({
              type: 'player_move',
              player: { ...prev, x: newX, y: newY, currentRoom: enteredRoom?.id || null }
            }));
          }
        }

        return { ...prev, x: newX, y: newY, currentRoom: enteredRoom?.id || null };
      });

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [isJoined]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // WEBSOCKET FOR MULTIPLAYER
  // ═══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!isJoined) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/world/${userId}`;

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          showNotification('Connected to study world!');
          ws.send(JSON.stringify({
            type: 'player_join',
            player: localPlayer
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };

        ws.onclose = () => {
          // Silently retry connection if backend is not available
          setTimeout(connect, 3000);
        };

        ws.onerror = (e) => {
          // Suppress WebSocket errors when backend is unavailable
          // They'll automatically retry on close
        };
      } catch (e: any) {
        // Only log non-connection errors
        if (!e.message?.includes('Failed to fetch') && !e.message?.includes('ERR_CONNECTION_REFUSED')) {
          console.warn('WebSocket error:', e);
        }
      }
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'player_leave', playerId: userId }));
        wsRef.current.close();
      }
    };
  }, [isJoined, userId]);

  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'player_join':
        if (data.player.id !== userId) {
          setOtherPlayers(prev => {
            const exists = prev.find(p => p.id === data.player.id);
            if (exists) return prev;
            return [...prev, { ...data.player, isLocal: false }];
          });
          showNotification(`${data.player.name} joined!`);
          // Update class students for teacher
          if (playerRole === 'teacher') {
            setClassStudents(prev => [...prev, data.player]);
          }
        }
        break;

      case 'player_move':
        if (data.player.id !== userId) {
          setOtherPlayers(prev =>
            prev.map(p => p.id === data.player.id ? { ...p, ...data.player } : p)
          );
        }
        break;

      case 'player_leave':
        setOtherPlayers(prev => prev.filter(p => p.id !== data.playerId));
        break;

      case 'players_list':
        setOtherPlayers(data.players.filter((p: Player) => p.id !== userId));
        if (playerRole === 'teacher') {
          setClassStudents(data.players.filter((p: Player) => p.role === 'student'));
        }
        break;

      case 'xp_update':
        setXp(data.total_xp);
        if (data.level_up) {
          setLevel(data.new_level);
          showNotification(`Level Up! Now Level ${data.new_level}!`);
        }
        break;
    }
  }, [userId, playerRole]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  };

  const logActivity = (action: string, topic: string, extraData: any = {}) => {
    const activity = {
      timestamp: new Date(),
      action,
      topic,
      ...extraData
    };
    setStudentProgress(prev => ({
      ...prev,
      recentActivity: [activity, ...prev.recentActivity.slice(0, 49)]
    }));
    sendToOpenNote(userId, action, { topic, ...extraData });
  };

  const findNearbySpecialist = (): Specialist | null => {
    const interactionRange = 60;
    for (const spec of specialists) {
      const dx = localPlayer.x - spec.x;
      const dy = localPlayer.y - spec.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < interactionRange) {
        return spec;
      }
    }
    return null;
  };

  const handleSpecialistClick = (specialist: Specialist) => {
    const specRoom = ROOMS.find(r => r.id === specialist.department);
    if (specRoom && localPlayer.currentRoom === specRoom.id) {
      setSelectedSpecialist(specialist);
      setActiveMode('chat');
      setChatMessages([{
        id: Date.now().toString(),
        role: 'system',
        content: `You're now talking with ${specialist.name}, the ${specialist.role} specialist. ${specialist.thinkingStyle} is their approach.`,
        timestamp: new Date()
      }]);
      logActivity('specialist_click', specialist.department, { specialist: specialist.name });
    } else {
      showNotification(`Walk into the ${specRoom?.name || 'room'} to talk to ${specialist.name}`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHAT WITH SPECIALISTS (with contextual hints)
  // ═══════════════════════════════════════════════════════════════════════════════

  const sendMessage = async () => {
    if (!inputText.trim() || !selectedSpecialist || isProcessing) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    logActivity('message_sent', selectedSpecialist.department, {
      specialist: selectedSpecialist.name,
      message_preview: inputText.slice(0, 100)
    });

    try {
      // Use Smart Chat API to support explicit commands and force execution
      const response = await fetch('http://localhost:8000/api/focus/smart-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          message: inputText,
          current_topic: selectedSpecialist.department,
          behavior_state: 'focused', // Force focused state to bypass refusal logic
          // Pass extra context if needed, though mostly handled by backend now
          session_id: null
        })
      });

      const data = await response.json();

      const responseId = data.response_id || Date.now().toString();

      setChatMessages(prev => [...prev, {
        id: responseId,
        role: 'assistant',
        content: data.response || 'I encountered an issue. Please try again.',
        specialist: selectedSpecialist.id,
        timestamp: new Date(),
        visual: data.visual_generated,
        sources: data.sources
      }]);

      // Save context for distraction-based auto video generation
      // Use the question topic if available, otherwise fall back to department
      const questionTopic = userMessage.content.slice(0, 100).replace(/[?!.,]/g, '').trim();
      const contextToSet = {
        topic: questionTopic || selectedSpecialist.department || 'the current topic',
        response: data.response || '',
        timestamp: Date.now()
      };
      console.log('📝 [Context] Setting lastContext for distraction video:', contextToSet.topic);
      setLastContext(contextToSet);

      // If a video was generated, poll for the actual s3_url
      if (data.visual_generated?.type === 'video' && data.visual_generated?.id) {
        const videoId = data.visual_generated.id;
        const pollVideoForUrl = async () => {
          try {
            const statusResponse = await fetch(`http://localhost:8000/api/opennote/video/status/${videoId}`);
            const statusData = await statusResponse.json();

            if (statusData.status === 'completed' && statusData.response?.s3_url) {
              // Update the chat message with the actual video URL
              setChatMessages(prev => prev.map(msg => {
                if (msg.id === responseId && msg.visual?.id === videoId) {
                  return {
                    ...msg,
                    visual: {
                      ...msg.visual,
                      status: 'ready',
                      videoUrl: statusData.response.s3_url
                    }
                  };
                }
                return msg;
              }));
            } else if (statusData.status === 'failed') {
              // Mark video as failed
              setChatMessages(prev => prev.map(msg => {
                if (msg.id === responseId && msg.visual?.id === videoId) {
                  return {
                    ...msg,
                    visual: {
                      ...msg.visual,
                      status: 'error',
                      errorMessage: statusData.message || 'Video generation failed'
                    }
                  };
                }
                return msg;
              }));
            } else if (statusData.status === 'pending') {
              // Still processing, poll again in 5 seconds
              setTimeout(pollVideoForUrl, 5000);
            }
          } catch (err) {
            console.error('Failed to poll video status:', err);
          }
        };
        // Start polling after a short delay
        setTimeout(pollVideoForUrl, 3000);
      }

      if (data.decision_log) {
        setDecisionLogs(prev => [data.decision_log, ...prev]);
      }

      // If adaptation was applied, log it
      if (data.adaptation_applied) {
        setDecisionLogs(prev => [{
          timestamp: new Date().toISOString(),
          action: 'adaptation_applied',
          reason: data.adaptation_applied.reason,
          triggering_evidence: data.adaptation_applied.strategy,
          alternatives_considered: ['Continue as normal', 'Wait for more data']
        }, ...prev]);
      }

      if (data.xp_awarded) {
        setXp(prev => prev + data.xp_awarded);
      }

      // Start tracking reaction to this response
      if (data.track_reaction) {
        trackReactionToResponse(responseId, selectedSpecialist.department);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Connection error. Make sure the backend is running!',
        specialist: selectedSpecialist.id,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // REACTION TRACKING & OPENNOTE CORRELATION
  // ═══════════════════════════════════════════════════════════════════════════════

  const [currentResponseId, setCurrentResponseId] = useState<string | null>(null);
  const [reactionStartTime, setReactionStartTime] = useState<number>(0);
  const [openNoteCorrelations, setOpenNoteCorrelations] = useState<any[]>([]);
  const [learningInsights, setLearningInsights] = useState<string[]>([]);

  const trackReactionToResponse = (responseId: string, topic: string) => {
    setCurrentResponseId(responseId);
    setReactionStartTime(Date.now());

    // After 5 seconds, analyze the reaction
    setTimeout(() => {
      analyzeAndReportReaction(responseId, topic);
    }, 5000);
  };

  const analyzeAndReportReaction = async (responseId: string, topic: string) => {
    if (!currentResponseId) return;

    const timeSpent = (Date.now() - reactionStartTime) / 1000;

    // Get CV signals from last analysis
    const cvSignals = {
      face_detected: facesDetected > 0,
      eyes_open: lastAnalysisResult?.learning_event?.evidence?.eyes_open || false,
      looking_away: lastAnalysisResult?.distraction_type === 'looking_away',
      distraction_type: lastAnalysisResult?.distraction_type || null
    };

    // Engagement signals
    const engagementSignals = {
      time_on_response: timeSpent,
      scroll_speed: 0,  // Would track scroll in real implementation
      typing_started: inputText.length > 0,
      took_notes: false  // Would integrate with notes feature
    };

    try {
      const response = await fetch('http://localhost:8000/api/opennote/analyze-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          ai_response_id: responseId,
          cv_signals: cvSignals,
          engagement_signals: engagementSignals,
          context: {
            current_task: smartTasks.find(t => t.status === 'in_progress')?.title || 'General study',
            topic: topic,
            specialist: selectedSpecialist?.name || 'Unknown'
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        // Add correlation to display
        setOpenNoteCorrelations(prev => [data.correlation, ...prev].slice(0, 10));

        // Log the reaction detection
        setDecisionLogs(prev => [{
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          action: `reaction_detected: ${data.correlation.reaction_type}`,
          reason: data.reasoning,
          triggering_evidence: cvSignals,
          alternatives_considered: data.adaptation?.suggestions || []
        }, ...prev]);

        // If user is confused or distracted, show adaptive message AND call reprompt API
        if (data.correlation.reaction_type === 'CONFUSED' || data.correlation.reaction_type === 'DISTRACTED') {
          showNotification(data.correlation.reaction_type === 'CONFUSED'
            ? '🤔 Noticed you might be confused - let me try explaining differently'
            : '📱 Seems like you got distracted - ready to refocus?');

          // Get the last AI message from current state using a workaround for stale closure
          // We use setChatMessages with a function to access current state, then return unchanged
          let lastAIMsgContent = '';
          setChatMessages(currentMessages => {
            const lastAI = currentMessages.filter(m => m.role === 'assistant').pop();
            if (lastAI) {
              lastAIMsgContent = lastAI.content;
            }
            return currentMessages; // Return unchanged
          });

          // Small delay to ensure state access completed
          await new Promise(resolve => setTimeout(resolve, 10));

          if (lastAIMsgContent) {
            try {
              console.log('[Adaptive Reprompt] Calling API with reaction:', data.correlation.reaction_type);
              const repromptResponse = await fetch('http://localhost:8000/api/chat/adaptive-reprompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  original_response: lastAIMsgContent,
                  original_response_id: responseId,
                  reaction_type: data.correlation.reaction_type,
                  specialist_id: selectedSpecialist?.id || 'general',
                  topic: topic
                })
              });
              const repromptData = await repromptResponse.json();
              console.log('[Adaptive Reprompt] Response:', repromptData);

              if (repromptData.reprompt_needed) {
                // Add re-explanation to chat
                setChatMessages(prev => [...prev, {
                  id: `reprompt-${Date.now()}`,
                  role: 'assistant' as const,
                  content: `${repromptData.intro}\n\n${repromptData.new_explanation}`,
                  specialist: selectedSpecialist?.name || 'AI',
                  timestamp: new Date().toISOString()
                }]);
                console.log('[Adaptive Reprompt] Added to chat!');
              }
            } catch (repromptError) {
              console.log('Adaptive reprompt error:', repromptError);
            }
          } else {
            console.log('[Adaptive Reprompt] No AI message found to re-explain');
          }
        } else if (data.correlation.reaction_type === 'MOTIVATED') {
          showNotification('🔥 Great focus! Extending your session...');
          setFocusGoalMinutes(prev => Math.min(prev + 5, 60));
        }

        // Sync to-do list with focus mode based on reaction
        if (data.adaptation?.focus_time_modifier) {
          const newFocusTime = Math.round(focusGoalMinutes * data.adaptation.focus_time_modifier);
          setFocusGoalMinutes(newFocusTime);
        }
      }
    } catch (error) {
      console.log('Reaction analysis unavailable');
    }

    setCurrentResponseId(null);
  };

  // Session tracking state
  const [sessionCount, setSessionCount] = useState(0);
  const [totalDistractions, setTotalDistractions] = useState(0);
  const lastReactionTimeRef = useRef<number>(0);

  // Load OpenNote correlations and insights
  const loadOpenNoteData = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/opennote/correlations?user_id=${userId}`);
      const data = await response.json();

      if (data.correlations) {
        setOpenNoteCorrelations(data.correlations);
      }
      if (data.insights) {
        setLearningInsights(data.insights);
      }
      if (data.learning_patterns) {
        setSessionCount(data.learning_patterns.total_interactions || 0);
        const counts = data.learning_patterns.reaction_counts || {};
        setTotalDistractions((counts.DISTRACTED || 0) + (counts.CONFUSED || 0));
      }
    } catch (error) {
      console.log('OpenNote data unavailable');
    }
  };

  // Track focus session to OpenNote (called during CV analysis)
  const trackFocusSessionToOpenNote = async (cvData: any) => {
    // Only track every 10 seconds to avoid spam
    const now = Date.now();
    if (now - lastReactionTimeRef.current < 10000) return;
    lastReactionTimeRef.current = now;

    const cvSignals = {
      face_detected: (cvData.faces_detected || 0) > 0,
      eyes_open: cvData.learning_event?.evidence?.eyes_open || !cvData.distraction_detected,
      looking_away: cvData.distraction_type === 'looking_away',
      distraction_type: cvData.distraction_type || null
    };

    const engagementSignals = {
      time_on_response: focusTimer,
      scroll_speed: 0,
      typing_started: false,
      took_notes: false,
      focus_session: true
    };

    try {
      const response = await fetch('http://localhost:8000/api/opennote/analyze-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          ai_response_id: `focus-${Date.now()}`,
          cv_signals: cvSignals,
          engagement_signals: engagementSignals,
          context: {
            current_task: smartTasks.find(t => t.status !== 'completed')?.title || 'Focus session',
            topic: currentRoom?.id || 'focus',
            specialist: 'Focus Coach'
          }
        })
      });

      const data = await response.json();

      if (data.success && data.correlation) {
        // Update local state
        setOpenNoteCorrelations(prev => {
          const updated = [data.correlation, ...prev].slice(0, 10);
          return updated;
        });

        // Update session count
        setSessionCount(prev => prev + 1);

        // Track distractions
        if (data.correlation.reaction_type === 'DISTRACTED' || data.correlation.reaction_type === 'CONFUSED') {
          setTotalDistractions(prev => prev + 1);
        }

        // Update insights
        if (data.correlation.adaptation) {
          const insight = `${data.correlation.reaction_type}: ${data.correlation.adaptation.suggestions?.[0] || 'Continue focus'}`;
          setLearningInsights(prev => [insight, ...prev].slice(0, 5));
        }
      }
    } catch (error) {
      // Silent fail during focus mode
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadOpenNoteData();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // SMART TASK LIST MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  const [taskInput, setTaskInput] = useState('');

  // Load tasks on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadSmartTasks();
  }, []);

  // Mock tasks for demo - integrated with specialists and departments
  const MOCK_TASKS: SmartTask[] = [
    {
      id: 'mock-1',
      title: 'Review Derivatives Ch. 5',
      description: 'Practice chain rule and product rule problems',
      department: 'math',
      priority: 'high',
      status: 'pending',
      estimatedMinutes: 45,
      recommendedAgent: 'calvin',
      recommendedAgentReason: 'Calvin specializes in calculus concepts',
      recommendedFocusTime: 25,
      tags: ['calculus', 'derivatives'],
      createdAt: new Date(),
      notes: ''
    },
    {
      id: 'mock-2',
      title: 'Physics Lab Report',
      description: 'Write up results from momentum experiment',
      department: 'science',
      priority: 'high',
      status: 'pending',
      dueDate: new Date(Date.now() + 86400000),
      estimatedMinutes: 60,
      recommendedAgent: 'nova',
      recommendedAgentReason: 'Nova can help explain physics concepts',
      recommendedFocusTime: 30,
      tags: ['physics', 'lab'],
      createdAt: new Date(),
      notes: ''
    },
    {
      id: 'mock-3',
      title: 'Essay Outline: Theme Analysis',
      description: 'Create outline for Great Gatsby symbolism essay',
      department: 'english',
      priority: 'medium',
      status: 'pending',
      estimatedMinutes: 30,
      recommendedAgent: 'lex',
      recommendedAgentReason: 'Lex specializes in literary analysis',
      recommendedFocusTime: 25,
      tags: ['essay', 'literature'],
      createdAt: new Date(),
      notes: ''
    },
    {
      id: 'mock-4',
      title: 'Algebra Practice Set',
      description: 'Complete problems 1-20 on quadratic equations',
      department: 'math',
      priority: 'medium',
      status: 'pending',
      estimatedMinutes: 40,
      recommendedAgent: 'alyx',
      recommendedAgentReason: 'Alyx is the algebra specialist',
      recommendedFocusTime: 20,
      tags: ['algebra', 'practice'],
      createdAt: new Date(),
      notes: ''
    },
    {
      id: 'mock-5',
      title: 'Study for Bio Quiz',
      description: 'Review cell division and mitosis',
      department: 'science',
      priority: 'low',
      status: 'pending',
      dueDate: new Date(Date.now() + 172800000),
      estimatedMinutes: 35,
      recommendedAgent: 'helix',
      recommendedAgentReason: 'Helix specializes in biology concepts',
      recommendedFocusTime: 25,
      tags: ['biology', 'quiz'],
      createdAt: new Date(),
      notes: ''
    }
  ];

  const loadSmartTasks = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/smart-tasks?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const backendTasks = data.tasks.map((t: any) => ({
          ...t,
          dueDate: t.due_date ? new Date(t.due_date) : undefined,
          createdAt: new Date(t.created_at),
          completedAt: t.completed_at ? new Date(t.completed_at) : undefined,
          recommendedAgent: t.recommended_agent,
          recommendedAgentReason: t.recommended_agent_reason,
          recommendedFocusTime: t.recommended_focus_time,
          relatedAssignment: t.related_assignment_id
        }));
        // Merge mock tasks with any from backend
        const existingIds = backendTasks.map((t: SmartTask) => t.id);
        const newMockTasks = MOCK_TASKS.filter(t => !existingIds.includes(t.id));
        setSmartTasks([...backendTasks, ...newMockTasks]);
      } else {
        // Use mock data if backend unavailable
        setSmartTasks(MOCK_TASKS);
      }
    } catch (error) {
      console.log('Using mock tasks - backend unavailable');
      setSmartTasks(MOCK_TASKS);
    }
  };

  const handleTaskChatCommand = async (message: string) => {
    if (!message.trim()) return;

    setIsLoadingTasks(true);
    try {
      const response = await fetch('http://localhost:8000/api/smart-tasks/chat-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          command: 'auto',
          message: message
        })
      });

      const data = await response.json();

      // Show result in chat
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: data.message || 'Task updated!',
        timestamp: new Date()
      }]);

      // Reload tasks
      await loadSmartTasks();

      // If there are recommendations, store them
      if (data.recommendations) {
        setTaskRecommendations(data.recommendations);
      }

      showNotification(data.message);

    } catch (error) {
      console.error('Task command failed:', error);
      showNotification('Could not process task command');
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const completeTask = async (taskId: string) => {
    try {
      await fetch(`http://localhost:8000/api/smart-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      await loadSmartTasks();
      showNotification('Task completed! 🎉');
      setXp(prev => prev + 10);
    } catch (error) {
      console.error('Complete task failed:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`http://localhost:8000/api/smart-tasks/${taskId}`, {
        method: 'DELETE'
      });
      await loadSmartTasks();
      showNotification('Task deleted');
    } catch (error) {
      console.error('Delete task failed:', error);
    }
  };

  const getRecommendations = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/smart-tasks/recommendations?user_id=${userId}`);
      const data = await response.json();
      setTaskRecommendations(data.recommendations);

      // Show recommendations in chat
      if (data.recommendations) {
        setChatMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'system',
          content: `📚 **Study Recommendations**\n\n${data.recommendations.summary}\n\n**Next:** ${data.recommendations.next_task}\n\n**Strategy:** ${data.recommendations.focus_strategy}`,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Get recommendations failed:', error);
    }
  };

  const goToRecommendedAgent = (agentId: string) => {
    const spec = Object.values(SPECIALISTS).find(s => s.id === agentId);
    if (spec) {
      const room = ROOMS.find(r => r.id === spec.department);
      if (room) {
        // Navigate player to agent
        setLocalPlayer(prev => ({
          ...prev,
          x: room.doorX,
          y: room.doorY + 50,
          currentRoom: room.id
        }));
        showNotification(`Walking to ${spec.name} in ${room.name}`);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // MANIM VISUAL GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  const generateVisual = async () => {
    if (!inputText.trim()) return;

    setIsProcessing(true);
    try {
      const response = await fetch('http://localhost:8000/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_type: 'concept',
          content: inputText,
          department: currentRoom?.id || 'study_hub'
        })
      });

      const data = await response.json();

      // Add video message nicely to chat
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        specialist: selectedSpecialist?.id,
        content: `Here is a visual explanation of "${inputText}":`,
        videoUrl: data.video_url || "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", // Fallback gif
        timestamp: new Date()
      }]);

      setInputText('');
    } catch (e) {
      console.error("Visual generation failed:", e);
      showNotification('Could not generate visual');
    } finally {
      setIsProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROBLEM SOLVING WITH AI GRADING
  // ═══════════════════════════════════════════════════════════════════════════════

  const getProblem = async () => {
    if (!selectedSpecialist) return;
    setIsProcessing(true);

    try {
      const response = await fetch('http://localhost:8000/api/problem/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          specialist_id: selectedSpecialist.id,
          topic: selectedSpecialist.role,
          difficulty: 'medium',
          student_mastery: studentProgress.masteryByTopic[selectedSpecialist.role] || 0
        })
      });

      const data = await response.json();
      setCurrentProblem({
        id: data.problem_id || Date.now().toString(),
        question: data.question,
        type: selectedSpecialist.department as Problem['type'],
        difficulty: data.difficulty || 'medium',
        hints: data.hints || [],
        hintsUsed: 0,
        correctAnswer: data.correct_answer
      });
      setActiveMode('problem');
      logActivity('problem_started', selectedSpecialist.role, { problem_id: data.problem_id });
    } catch (error) {
      showNotification('Could not generate problem');
    } finally {
      setIsProcessing(false);
    }
  };

  const getHint = () => {
    if (!currentProblem || currentProblem.hintsUsed >= currentProblem.hints.length) return;

    const hintIndex = currentProblem.hintsUsed;
    const hint = currentProblem.hints[hintIndex];

    setChatMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'hint',
      content: `💡 Hint ${hintIndex + 1}: ${hint}`,
      timestamp: new Date()
    }]);

    setCurrentProblem(prev => prev ? { ...prev, hintsUsed: prev.hintsUsed + 1 } : null);
    setStudentProgress(prev => ({ ...prev, hintsUsed: prev.hintsUsed + 1 }));
    logActivity('hint_used', currentProblem.type, { hint_number: hintIndex + 1 });
  };

  const submitAnswer = async () => {
    if (!currentProblem || !problemAnswer.trim() || !selectedSpecialist) return;
    setIsProcessing(true);

    try {
      const response = await fetch('http://localhost:8000/api/problem/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          problem_id: currentProblem.id,
          student_answer: problemAnswer,
          correct_answer: currentProblem.correctAnswer,
          specialist_id: selectedSpecialist.id,
          hints_used: currentProblem.hintsUsed
        })
      });

      const data = await response.json();

      const isCorrect = data.is_correct;
      setCurrentProblem(prev => prev ? {
        ...prev,
        studentAnswer: problemAnswer,
        isCorrect,
        feedback: data.feedback
      } : null);

      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.feedback || (isCorrect ? '✅ Correct!' : '❌ Not quite. Let me explain...'),
        isCorrect,
        timestamp: new Date()
      }]);

      // Update progress
      setStudentProgress(prev => ({
        ...prev,
        totalProblems: prev.totalProblems + 1,
        correctProblems: prev.correctProblems + (isCorrect ? 1 : 0),
        masteryByTopic: {
          ...prev.masteryByTopic,
          [selectedSpecialist.role]: Math.min(100, (prev.masteryByTopic[selectedSpecialist.role] || 0) + (isCorrect ? 10 : 2))
        }
      }));

      if (isCorrect) {
        const xpGain = Math.max(5, 20 - currentProblem.hintsUsed * 5);
        setXp(prev => prev + xpGain);
        showNotification(`+${xpGain} XP!`);
      }

      logActivity('answer_submitted', selectedSpecialist.role, {
        correct: isCorrect,
        hints_used: currentProblem.hintsUsed
      });

      setProblemAnswer('');
    } catch (error) {
      showNotification('Could not check answer');
    } finally {
      setIsProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // CANVAS / HANDWRITING INPUT
  // ═══════════════════════════════════════════════════════════════════════════════

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const submitCanvasWork = async () => {
    if (!selectedSpecialist || !drawingCanvasRef.current) return;
    setIsProcessing(true);

    const imageData = drawingCanvasRef.current.toDataURL('image/png');

    try {
      const response = await fetch('http://localhost:8000/api/canvas/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          specialist_id: selectedSpecialist.id,
          image: imageData,
          problem_context: currentProblem?.question || ''
        })
      });

      const data = await response.json();

      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.feedback || 'I analyzed your work. ' + (data.is_correct ? 'Great job!' : 'Let me help you improve.'),
        isCorrect: data.is_correct,
        timestamp: new Date()
      }]);

      logActivity('canvas_submitted', selectedSpecialist.role, { analyzed: true });
    } catch (error) {
      showNotification('Could not analyze canvas');
    } finally {
      setIsProcessing(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // SPACED REPETITION FLASHCARDS (SM-2 Algorithm)
  // ═══════════════════════════════════════════════════════════════════════════════

  const generateFlashcards = async () => {
    if (!selectedSpecialist) return;
    setIsProcessing(true);

    try {
      const response = await fetch('http://localhost:8000/api/flashcards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          specialist_id: selectedSpecialist.id,
          content: chatMessages.slice(-10).map(m => m.content).join(' '),
          existing_cards: flashcards.length
        })
      });

      const data = await response.json();
      if (data.flashcards) {
        const newCards: Flashcard[] = data.flashcards.map((f: any, i: number) => ({
          id: `${Date.now()}_${i}`,
          front: f.front,
          back: f.back,
          confidence: 0.5,
          nextReview: new Date(),
          interval: 1,
          easeFactor: 2.5,
          repetitions: 0
        }));
        setFlashcards(prev => [...prev, ...newCards]);
        setCurrentFlashcardIndex(0);
        setShowFlashcardBack(false);
        setActiveMode('flashcards');
        logActivity('flashcards_generated', selectedSpecialist.role, { count: newCards.length });
      }
    } catch (error) {
      showNotification('Could not generate flashcards');
    } finally {
      setIsProcessing(false);
    }
  };

  const rateFlashcard = (quality: number) => {
    // SM-2 Algorithm implementation
    const card = flashcards[currentFlashcardIndex];
    if (!card) return;

    let { easeFactor, interval, repetitions } = card;

    if (quality >= 3) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions += 1;
    } else {
      repetitions = 0;
      interval = 1;
    }

    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    setFlashcards(prev => prev.map((f, i) =>
      i === currentFlashcardIndex ? { ...f, easeFactor, interval, repetitions, nextReview, confidence: quality / 5 } : f
    ));

    const xpGain = Math.floor(quality * 2);
    setXp(prev => prev + xpGain);

    logActivity('flashcard_reviewed', 'memory', { quality, interval });

    if (currentFlashcardIndex < flashcards.filter(f => f.nextReview <= new Date()).length - 1) {
      setCurrentFlashcardIndex(prev => prev + 1);
      setShowFlashcardBack(false);
    } else {
      showNotification('Review session complete!');
      setActiveMode('chat');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // FOCUS MODE WITH DISTRACTION DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════

  const startFocusMode = async () => {
    setFocusActive(true);
    setFocusTimer(0);
    setActiveMode('focus');
    setAnalysisCount(0);
    setAnalysisError(null);
    logActivity('focus_started', 'focus', { goal_minutes: focusGoalMinutes });

    // Fetch personalized focus plan from AntiGravity
    try {
      const planResponse = await fetch('http://localhost:8000/api/antigravity/focus-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          goal_minutes: focusGoalMinutes
        })
      });
      const planData = await planResponse.json();
      if (planData.success) {
        setFocusPlan(planData.plan);
        showNotification(`Focus plan generated: ${planData.plan.recommended_duration_minutes} min recommended`);
      }
    } catch (e) {
      console.log('Could not fetch focus plan, using defaults');
    }

    // Fetch existing decision logs
    try {
      const logsResponse = await fetch(`http://localhost:8000/api/antigravity/decisions/${userId}`);
      const logsData = await logsResponse.json();
      setDecisionLogs(logsData.decisions || []);
    } catch (e) {
      console.log('Could not fetch decision logs');
    }

    focusIntervalRef.current = setInterval(() => {
      setFocusTimer(prev => {
        const newTime = prev + 1;
        if (newTime >= focusGoalMinutes * 60) {
          endFocusMode(true);
        }
        return newTime;
      });
    }, 1000);

    // Start camera with explicit constraints
    try {
      console.log('[AntiGravity] Requesting camera access...');

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported. Make sure you are using HTTPS or localhost.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      console.log('[AntiGravity] Camera stream obtained:', stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        let metadataTimeout: NodeJS.Timeout;
        let started = false;

        // Helper function to start video playback
        const startVideo = async () => {
          if (!videoRef.current || started) return;
          started = true;
          clearTimeout(metadataTimeout);

          try {
            console.log('[AntiGravity] Attempting to play video, readyState:', videoRef.current.readyState);

            // Wait a bit for video to be ready if needed (max 3 seconds)
            let attempts = 0;
            while (videoRef.current.readyState < 2 && attempts < 30) {
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }

            if (!videoRef.current) return;

            await videoRef.current.play();
            console.log('[AntiGravity] Video playing successfully, starting detection...');
            setCameraEnabled(true);
            setAnalysisError(null);

            // Start detection after a small delay to ensure video is fully ready
            setTimeout(() => {
              startDistractionDetection();
            }, 500);
          } catch (err: any) {
            console.error('[AntiGravity] Video play failed:', err);
            const errorMsg = `Video play failed: ${err.name} - ${err.message}. Please check browser console.`;
            setAnalysisError(errorMsg);
            showNotification(errorMsg);
          }
        };

        // Try onloadedmetadata first (preferred)
        videoRef.current.onloadedmetadata = () => {
          console.log('[AntiGravity] Video metadata loaded, readyState:', videoRef.current?.readyState);
          startVideo();
        };

        // Fallback: If metadata doesn't load within 3 seconds, try anyway
        metadataTimeout = setTimeout(() => {
          if (!cameraEnabled && !started && videoRef.current) {
            console.warn('[AntiGravity] onloadedmetadata timeout, attempting to start video anyway');
            startVideo();
          }
        }, 3000);

        // Handle video load errors
        videoRef.current.onerror = (e) => {
          clearTimeout(metadataTimeout);
          console.error('[AntiGravity] Video element error:', e);
          setAnalysisError('Video element error. Please refresh the page and allow camera access.');
        };
      } else {
        throw new Error('Video element not found');
      }
    } catch (err: any) {
      console.error('[AntiGravity] Camera error:', err);
      let errorMsg = 'Camera error: ';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera found. Please connect a camera and refresh the page.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera is already in use by another application. Please close other apps using the camera.';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        errorMsg = 'Camera constraints not satisfied. Trying with default settings...';
        // Could retry with default constraints here
      } else {
        errorMsg = `Camera error (${err.name}): ${err.message || 'Unknown error'}. Check browser console for details.`;
      }

      setAnalysisError(errorMsg);
      showNotification(errorMsg);
      setCameraEnabled(false);
    }
  };

  const startDistractionDetection = () => {
    // Clear any existing interval first
    if (distractionIntervalRef.current) {
      clearInterval(distractionIntervalRef.current);
    }

    console.log('[AntiGravity] Starting distraction detection...');
    setAnalysisError(null);

    distractionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !cameraCanvasRef.current) {
        console.log('[AntiGravity] Video or canvas ref not ready');
        return;
      }

      // Check if video is actually playing
      if (videoRef.current.readyState < 2) {
        console.log('[AntiGravity] Video not ready yet, readyState:', videoRef.current.readyState);
        return;
      }

      const ctx = cameraCanvasRef.current.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0, 640, 480);

      try {
        const imageData = cameraCanvasRef.current.toDataURL('image/jpeg', 0.5);
        // console.log('[AntiGravity] Sending frame for analysis');

        const response = await fetch('http://localhost:8000/api/focus/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, image: imageData })
        });

        const data = await response.json();

        // Update debug state
        setAnalysisCount(prev => prev + 1);
        setLastAnalysisResult(data);
        setAnalysisError(null);
        setFacesDetected(data.faces_detected || 0);

        if (data.debug_image) {
          setDebugImage(data.debug_image);
        }

        // Handle AntiGravity learning event
        if (data.learning_event) {
          setCurrentLearningEvent(data.learning_event.event_type);
          setLearningEvents(prev => [...prev.slice(-20), data.learning_event]);
          setTeachingReady(data.teaching_ready || false);
        }

        // Track to OpenNote for correlation analysis
        await trackFocusSessionToOpenNote(data);

        // Only refresh logs if something actually happened to reduce network load
        if (data.distraction_detected || data.learning_event) {
          try {
            const logsResponse = await fetch(`http://localhost:8000/api/antigravity/decisions/${userId}`);
            const logsData = await logsResponse.json();
            setDecisionLogs(logsData.decisions || []);
          } catch (e) { /* ignore */ }
        }

        // Smooth distraction level updates with exponential smoothing
        if (data.distraction_detected) {
          // Exponential smoothing: new = 0.3 * old + 0.7 * new
          setDistractionLevel(prev => 0.3 * prev + 0.7 * (data.distraction_level || 1.0));

          // Only update intervention if it's actually present (backend handles cooldown)
          if (data.intervention) {
            setDistractionWarning(prev => {
              // Only update if different to prevent flickering
              if (prev !== data.intervention) {
                logActivity('distraction_detected', 'focus', {
                  type: data.distraction_type,
                  learning_event: data.learning_event?.event_type
                });
                return data.intervention;
              }
              return prev;
            });

            // AUTO-GENERATE VIDEO when distraction is detected with intervention
            // ONLY trigger if we have context from a recent AI response (within 2 minutes)
            // This prevents spam - video only generates ONCE after each answer
            // NOTE: Using ref instead of state to avoid stale closure in interval
            const currentContext = lastContextRef.current;
            const contextAge = currentContext ? (Date.now() - currentContext.timestamp) / 1000 : Infinity;
            const recentEnough = contextAge < 120; // Within 2 minutes

            console.log('👁️ [AntiGravity] Distraction detected:', {
              hasLastContext: !!currentContext,
              lastContextTopic: currentContext?.topic,
              contextAgeSeconds: Math.round(contextAge),
              recentEnough,
              willTriggerVideo: !!(currentContext && recentEnough)
            });

            // ONLY generate video if we have recent context from an AI answer
            if (currentContext && recentEnough) {
              console.log('🎬 [AntiGravity] Auto-generating video for distracted student:', currentContext.topic);

              // Clear context IMMEDIATELY to prevent re-triggers
              const topicToUse = currentContext.topic;
              const responseToUse = currentContext.response;
              setLastContext(null);
              lastContextRef.current = null;

              // Call behavior-trigger API
              fetch('http://localhost:8000/api/focus/behavior-trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  session_id: null,
                  behavior: 'distracted',
                  last_topic: topicToUse,
                  last_response: responseToUse.slice(0, 500),
                  trigger_source: 'antigravity'
                })
              })
                .then(res => res.json())
                .then(result => {
                  console.log('🎬 [AntiGravity] Video generation result:', result);
                  if (result.success && result.visual_generated) {
                    const videoMessage: ChatMessage = {
                      id: `auto-video-${Date.now()}`,
                      role: 'system',
                      content: result.message || `👋 I noticed you got distracted! Here's a video to help you stay engaged with ${topicToUse}.`,
                      timestamp: new Date(),
                      visual: result.visual_generated
                    };
                    setChatMessages(prev => [...prev, videoMessage]);
                  }
                })
                .catch(err => console.error('Failed to auto-generate video:', err));
            }
          }
        } else {
          // Smooth decay: decrease gradually when not distracted
          setDistractionLevel(prev => Math.max(0, prev * 0.85));
          // Clear warning when no longer distracted (after a delay to avoid flicker)
          if (!data.distraction_detected) {
            setTimeout(() => {
              setDistractionWarning(prev => {
                // Clear if we're still not distracted
                return prev;
              });
            }, 3000);
          }
        }
      } catch (err: any) {
        // Only show errors if they're not connection-related
        if (err.message?.includes('Failed to fetch') || err.message?.includes('ERR_CONNECTION_REFUSED')) {
          setAnalysisError('Backend unavailable - CV analysis disabled');
        } else {
          console.error('[AntiGravity] Analysis error:', err);
          setAnalysisError(err.message || 'Analysis failed');
        }
      }
    }, 500); // Fast interval (500ms = 2 FPS) for smooth live detection
  };

  const endFocusMode = (completed: boolean) => {
    if (focusIntervalRef.current) clearInterval(focusIntervalRef.current);
    if (distractionIntervalRef.current) clearInterval(distractionIntervalRef.current);

    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }

    const minutesStudied = Math.floor(focusTimer / 60);
    const xpEarned = minutesStudied * 5;
    setXp(prev => prev + xpEarned);
    setStudentProgress(prev => ({ ...prev, timeSpent: prev.timeSpent + minutesStudied }));

    logActivity('focus_ended', 'focus', { completed, duration_minutes: minutesStudied });
    showNotification(`Focus session ${completed ? 'complete' : 'ended'}! +${xpEarned} XP`);

    setFocusActive(false);
    setCameraEnabled(false);
    setActiveMode(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEACHER DASHBOARD FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  const loadClassAnalytics = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/teacher/analytics?teacher_id=${userId}`);
      const data = await response.json();
      setClassAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const createAssignment = async (title: string, description: string, department: string) => {
    try {
      const response = await fetch('http://localhost:8000/api/teacher/assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_id: userId,
          title,
          description,
          department,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
      });
      const data = await response.json();
      setAssignments(prev => [...prev, data.assignment]);

      // Also add to smart to-do list for students
      const agentMap: Record<string, string> = {
        'math': 'calvin',
        'science': 'nova',
        'english': 'iris'
      };
      const newTask: SmartTask = {
        id: `assignment-${data.assignment?.id || Date.now()}`,
        title: `📚 ${title}`,
        description: description,
        department: department,
        priority: 'high',
        status: 'pending',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        estimatedMinutes: 45,
        recommendedAgent: agentMap[department] || 'coach',
        recommendedAgentReason: 'Assigned by teacher',
        recommendedFocusTime: 30,
        tags: ['assignment', department],
        createdAt: new Date(),
        notes: '',
        relatedAssignment: data.assignment?.id
      };
      setSmartTasks(prev => [newTask, ...prev]);

      showNotification('Assignment created & added to student to-do lists!');
    } catch (error) {
      // Still add to local to-do even if backend fails
      const agentMap: Record<string, string> = {
        'math': 'calvin',
        'science': 'nova',
        'english': 'iris'
      };
      const newTask: SmartTask = {
        id: `assignment-${Date.now()}`,
        title: `📚 ${title}`,
        description: description,
        department: department,
        priority: 'high',
        status: 'pending',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        estimatedMinutes: 45,
        recommendedAgent: agentMap[department] || 'coach',
        recommendedAgentReason: 'Assigned by teacher',
        recommendedFocusTime: 30,
        tags: ['assignment', department],
        createdAt: new Date(),
        notes: ''
      };
      setSmartTasks(prev => [newTask, ...prev]);
      showNotification('Assignment added to to-do list!');
    }
  };

  useEffect(() => {
    if (playerRole === 'teacher' && activeMode === 'dashboard') {
      loadClassAnalytics();
    }
  }, [activeMode, playerRole]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // LEVEL CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════════

  const levelProgress = () => {
    const levels = [0, 100, 300, 600, 1000, 2000, 5000];
    const currentLevelXp = levels[level - 1] || 0;
    const nextLevelXp = levels[level] || levels[levels.length - 1];
    return Math.min(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100, 100);
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // JOIN SCREEN
  // ═══════════════════════════════════════════════════════════════════════════════

  if (!isJoined) {
    return (
      <div className="join-screen">
        <div className="join-box">
          <h1>🎓 Study World</h1>
          <p>AI-Powered Collaborative Learning</p>

          <input
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            autoFocus
          />

          <div className="role-selector">
            <button
              className={playerRole === 'student' ? 'selected' : ''}
              onClick={() => setPlayerRole('student')}
            >
              📚 Student
            </button>
            <button
              className={playerRole === 'teacher' ? 'selected' : ''}
              onClick={() => setPlayerRole('teacher')}
            >
              👨‍🏫 Teacher
            </button>
          </div>

          <button
            className="join-button"
            onClick={() => {
              if (playerName.trim()) {
                setLocalPlayer(prev => ({ ...prev, name: playerName, role: playerRole }));
                setIsJoined(true);
                sendToOpenNote(userId, 'session_start', { name: playerName, role: playerRole });
              }
            }}
            disabled={!playerName.trim()}
          >
            Enter Study World
          </button>

          <div className="controls-hint">
            <h3>Controls</h3>
            <p><strong>WASD</strong> - Move around</p>
            <p><strong>E</strong> - Interact with specialist</p>
            <p><strong>Click</strong> - Select specialist in room</p>
            {playerRole === 'teacher' && <p><strong>T</strong> - Open Teacher Dashboard</p>}
            <p><strong>ESC</strong> - Close panels</p>
          </div>

          <div className="features-list">
            <h3>Features</h3>
            <p>✏️ Handwriting Canvas</p>
            <p>🧠 AI Tutoring with Hints</p>
            <p>🎴 Spaced Repetition Flashcards</p>
            <p>📊 Progress Tracking</p>
            <p>🎯 Focus Mode with Distraction Detection</p>
          </div>
        </div>

        <style jsx>{`
          .join-screen {
            min-height: 100vh;
            background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Press Start 2P', monospace;
            color: #fff;
          }

          .join-box {
            background: rgba(30, 30, 50, 0.95);
            border: 4px solid #4a90d9;
            border-radius: 16px;
            padding: 40px;
            text-align: center;
            max-width: 450px;
          }

          .join-box h1 {
            font-size: 24px;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #e94560, #f0ad4e, #4a90d9);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .join-box > p {
            font-size: 10px;
            color: #888;
            margin-bottom: 30px;
          }

          .join-box input {
            width: 100%;
            padding: 15px;
            background: #0a0a1a;
            border: 3px solid #3a3a5a;
            border-radius: 8px;
            color: #fff;
            font-family: inherit;
            font-size: 12px;
            margin-bottom: 15px;
          }

          .join-box input:focus {
            outline: none;
            border-color: #4a90d9;
          }

          .role-selector {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
          }

          .role-selector button {
            flex: 1;
            padding: 12px;
            background: #1a1a2e;
            border: 3px solid #3a3a5a;
            border-radius: 8px;
            color: #888;
            font-family: inherit;
            font-size: 10px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .role-selector button.selected {
            border-color: #4a90d9;
            color: #fff;
            background: rgba(74, 144, 217, 0.2);
          }

          .join-button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #e94560, #d93550);
            border: none;
            border-radius: 8px;
            color: #fff;
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
            transition: transform 0.2s;
          }

          .join-button:hover:not(:disabled) {
            transform: scale(1.02);
          }

          .join-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .controls-hint, .features-list {
            margin-top: 20px;
            text-align: left;
            padding: 15px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
          }

          .controls-hint h3, .features-list h3 {
            font-size: 10px;
            color: #4a90d9;
            margin-bottom: 10px;
          }

          .controls-hint p, .features-list p {
            font-size: 8px;
            color: #aaa;
            margin: 5px 0;
          }
        `}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEDICATED FOCUS ROOM PAGE
  // ═══════════════════════════════════════════════════════════════════════════════

  if (activeMode === 'focus') {
    return (
      <div className="focus-room-page">
        {/* Header */}
        <div className="focus-room-header">
          <div className="focus-room-title">
            <span className="focus-icon">🎯</span>
            <h1>FocusRoom</h1>
            <span className="focus-subtitle">Behavior-Aware Learning Environment</span>
          </div>
          <div className="focus-room-stats">
            <div className="fr-stat">
              <span className="fr-stat-value">{sessionCount}</span>
              <span className="fr-stat-label">Sessions</span>
            </div>
            <div className="fr-stat">
              <span className="fr-stat-value">{totalDistractions}</span>
              <span className="fr-stat-label">Distractions</span>
            </div>
            <div className="fr-stat">
              <span className="fr-stat-value">{Math.floor(focusTimer / 60)}m</span>
              <span className="fr-stat-label">Focus Time</span>
            </div>
          </div>
          <button className="exit-focus-room" onClick={() => { endFocusMode(false); setActiveMode(null); }}>
            ← Exit FocusRoom
          </button>
        </div>

        <div className="focus-room-content">
          {/* Left Panel - To-Do List */}
          <div className="focus-room-left">
            <div className="fr-panel">
              <div className="fr-panel-header">
                <h3>📋 Task List</h3>
                <button onClick={() => handleTaskChatCommand('recommend')} className="fr-ai-btn">🧠 AI</button>
              </div>

              {/* Quick Add */}
              <div className="fr-task-input">
                <input
                  type="text"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder="+ Add task..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && taskInput.trim()) {
                      handleTaskChatCommand(taskInput);
                      setTaskInput('');
                    }
                  }}
                />
              </div>

              {/* AI Recommendations */}
              {taskRecommendations && (
                <div className="fr-recommendations">
                  <div className="fr-rec-header">✨ AI Suggests</div>
                  <p>{taskRecommendations.summary}</p>
                  {taskRecommendations.focus_strategy && (
                    <div className="fr-rec-strategy">⏱️ {taskRecommendations.focus_strategy}</div>
                  )}
                </div>
              )}

              {/* Task List */}
              <div className="fr-tasks">
                {smartTasks.filter(t => t.status !== 'completed').map(task => (
                  <div
                    key={task.id}
                    className={`fr-task-item ${task.priority}`}
                    onClick={() => {
                      // Set this as current task
                      showNotification(`Working on: ${task.title}`);
                    }}
                  >
                    <button
                      className="fr-task-check"
                      onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                    >○</button>
                    <div className="fr-task-content">
                      <div className="fr-task-name">{task.title}</div>
                      <div className="fr-task-meta">
                        <span className="fr-dept" style={{ background: ROOMS.find(r => r.id === task.department)?.color }}>
                          {task.department}
                        </span>
                        <span className="fr-time">⏱️ {task.recommendedFocusTime || task.estimatedMinutes}m</span>
                      </div>
                    </div>
                  </div>
                ))}
                {smartTasks.filter(t => t.status !== 'completed').length === 0 && (
                  <div className="fr-no-tasks">🎉 All done! Add a task above.</div>
                )}
              </div>

              {/* Completed */}
              {smartTasks.filter(t => t.status === 'completed').length > 0 && (
                <details className="fr-completed">
                  <summary>✅ Completed ({smartTasks.filter(t => t.status === 'completed').length})</summary>
                  {smartTasks.filter(t => t.status === 'completed').map(task => (
                    <div key={task.id} className="fr-task-done">{task.title}</div>
                  ))}
                </details>
              )}
            </div>
          </div>

          {/* Center - Chat (Main Focus) */}
          <div className="focus-room-center fr-chat-main">
            {/* Chat Panel - Now Primary */}
            <div className="fr-panel fr-chat-panel-large">
              <div className="fr-panel-header">
                <h3>💬 Ask Specialists</h3>
                <select
                  value={selectedSpecialist?.id || ''}
                  onChange={(e) => {
                    const spec = Object.values(SPECIALISTS).find(s => s.id === e.target.value);
                    if (spec) {
                      setSelectedSpecialist({
                        ...spec,
                        x: 0, y: 0, isAvailable: true
                      } as Specialist);
                    }
                  }}
                  className="fr-specialist-select"
                >
                  <option value="">Choose specialist...</option>
                  {Object.values(SPECIALISTS).map(s => (
                    <option key={s.id} value={s.id}>{s.name} - {s.role}</option>
                  ))}
                </select>
              </div>

              <div className="fr-chat-messages-large">
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`fr-chat-msg ${msg.role}`}>
                    <span className="fr-msg-role">
                      {msg.role === 'user' ? '👤 You' : msg.role === 'assistant' ? `🤖 ${msg.specialist || 'AI'}` : '📢'}
                    </span>
                    <p>{msg.content}</p>
                    {msg.visual && (
                      <div className="fr-visual-widget" style={{
                        marginTop: '10px',
                        background: 'rgba(255,255,255,0.1)',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)'
                      }}>
                        {msg.visual.type === 'video' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '24px' }}>🎥</span>
                            <div>
                              <strong style={{ color: '#fff' }}>
                                {msg.visual.status === 'ready' ? 'Video Ready' :
                                  msg.visual.status === 'error' ? 'Video Failed' :
                                    'Video Generating...'}
                              </strong>
                              <div style={{ fontSize: '0.9em', opacity: 0.8 }}>{msg.visual.topic || 'Concept Explanation'}</div>
                              {msg.visual.videoUrl ? (
                                <button
                                  onClick={() => window.open(msg.visual.videoUrl, '_blank')}
                                  style={{
                                    marginTop: '5px',
                                    background: '#e94560',
                                    border: 'none',
                                    color: 'white',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}>Watch Video ↗</button>
                              ) : msg.visual.status === 'error' ? (
                                <div style={{ marginTop: '5px', color: '#ff6b6b', fontSize: '0.85em' }}>
                                  {msg.visual.errorMessage || 'Video generation failed'}
                                </div>
                              ) : (
                                <div style={{ marginTop: '5px', color: '#ffd93d', fontSize: '0.85em' }}>
                                  ⏳ Processing... (usually takes 30-60 seconds)
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '24px' }}>🃏</span>
                              <div>
                                <strong style={{ color: '#fff' }}>
                                  {msg.visual.type === 'flashcards' ? 'Flashcards Created' : 'Practice Set Ready'}
                                </strong>
                                <div style={{ fontSize: '0.9em', opacity: 0.8 }}>{msg.visual.message}</div>
                              </div>
                            </div>

                            {/* Render Preview */}
                            {/* Render Interactive Flashcards */}
                            {msg.visual.preview && Object.keys(msg.visual.preview).length > 0 && (
                              <ChatFlashcards
                                data={msg.visual.preview}
                                topic={msg.visual.topic || msg.visual.message || 'Key Concepts'}
                              />
                            )}

                            {msg.visual.id && <div style={{
                              marginTop: '2px',
                              fontSize: '0.8em',
                              color: '#4cc9f0',
                              textAlign: 'right'
                            }}>Successfully saved to OpenNote ✅</div>}
                          </div>
                        )}

                        {/* Source Citations */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div style={{
                            marginTop: '10px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            fontSize: '0.75em',
                            opacity: 0.8
                          }}>
                            {msg.sources.map((s, i) => (
                              <div key={i} style={{ marginBottom: '2px' }}>
                                🔗 Source: <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#4cc9f0', textDecoration: 'underline' }}>{s.title}</a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {chatMessages.length === 0 && (
                  <div className="fr-chat-empty">Select a specialist and ask a question!</div>
                )}
              </div>

              <div className="fr-chat-input-large">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={selectedSpecialist ? `Ask ${selectedSpecialist.name}...` : 'Select a specialist first'}
                  disabled={!selectedSpecialist}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputText.trim() && selectedSpecialist) {
                      sendMessage();
                    }
                  }}
                />
                <button onClick={sendMessage} disabled={!selectedSpecialist || !inputText.trim() || isProcessing}>
                  {isProcessing ? '...' : '→'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Camera & Focus Status */}
          <div className="focus-room-right fr-camera-sidebar">
            {/* Session Start / Camera View */}
            {!focusActive ? (
              <div className="fr-start-panel-compact">
                <h3>🎯 Focus Session</h3>
                <div className="fr-goal-buttons-compact">
                  {[15, 25, 45, 60].map(mins => (
                    <button
                      key={mins}
                      className={`fr-goal-btn-sm ${focusGoalMinutes === mins ? 'selected' : ''}`}
                      onClick={() => setFocusGoalMinutes(mins)}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                <button className="fr-start-btn-compact" onClick={startFocusMode}>
                  🚀 Start
                </button>
                <p className="fr-camera-note-sm">📷 Camera tracks focus</p>
              </div>
            ) : (
              <div className="fr-active-panel-compact">
                {/* Compact Timer */}
                <div className="fr-timer-compact">
                  <span className="fr-timer-sm">{formatTime(focusTimer)}</span>
                  <span className="fr-timer-goal-sm">/ {focusGoalMinutes}m</span>
                </div>
                <div className="fr-progress-bar-sm">
                  <div className="fr-progress-fill" style={{ width: `${Math.min((focusTimer / (focusGoalMinutes * 60)) * 100, 100)}%` }} />
                </div>

                {/* Camera View - Compact */}
                <div className="fr-camera-container-compact">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    style={{ display: (showDebugOverlay && debugImage) ? 'none' : 'block' }}
                  />
                  {showDebugOverlay && debugImage && (
                    <img src={debugImage} alt="CV Debug" />
                  )}
                  <canvas ref={cameraCanvasRef} style={{ display: 'none' }} width={640} height={480} />

                  <div className={`fr-face-indicator-sm ${facesDetected > 0 ? 'detected' : 'not-detected'}`}>
                    {facesDetected > 0 ? '👤' : '❌'}
                  </div>

                  <button className="fr-debug-toggle-sm" onClick={() => setShowDebugOverlay(!showDebugOverlay)}>
                    {showDebugOverlay ? '🔍' : '👁️'}
                  </button>
                </div>

                {/* Focus Level */}
                <div className="fr-focus-meter-compact">
                  <div className="fr-meter-bar-sm">
                    <div className="fr-meter-fill" style={{ width: `${(1 - distractionLevel) * 100}%`, background: distractionLevel > 0.5 ? '#e94560' : '#5cb85c' }} />
                  </div>
                  <span className="fr-meter-pct">{Math.round((1 - distractionLevel) * 100)}%</span>
                </div>

                {/* Warning */}
                {distractionWarning && <div className="fr-warning-compact">{distractionWarning}</div>}

                {/* Learning State */}
                {currentLearningEvent && (
                  <div className={`fr-learning-badge ${currentLearningEvent}`}>
                    {currentLearningEvent === 'sustained_focus' ? '🟢' : currentLearningEvent === 'fatigue' ? '🔴' : '🟡'}
                    {currentLearningEvent.replace(/_/g, ' ')}
                  </div>
                )}

                <button className="fr-end-btn-compact" onClick={() => endFocusMode(false)}>
                  End
                </button>
              </div>
            )}

            {/* OpenNote Panel */}
            <div className="fr-panel fr-opennote-panel">
              <div className="fr-panel-header">
                <h3>📊 OpenNote Insights</h3>
                <button onClick={loadOpenNoteData} className="fr-refresh-btn">🔄</button>
              </div>

              {/* Stats */}
              <div className="fr-insight-stats">
                <div className="fr-is">
                  <span className="fr-is-num">{sessionCount}</span>
                  <span className="fr-is-label">Sessions</span>
                </div>
                <div className="fr-is">
                  <span className="fr-is-num">{totalDistractions}</span>
                  <span className="fr-is-label">Distractions</span>
                </div>
              </div>

              {/* Insights */}
              {learningInsights.length > 0 ? (
                <div className="fr-insights-list">
                  {learningInsights.slice(0, 5).map((insight, i) => (
                    <div key={i} className="fr-insight-item">{insight}</div>
                  ))}
                </div>
              ) : (
                <div className="fr-no-insights">Start a focus session to generate insights...</div>
              )}

              {/* Recent Correlations */}
              {openNoteCorrelations.length > 0 && (
                <div className="fr-correlations">
                  <div className="fr-corr-header">Recent Reactions</div>
                  {openNoteCorrelations.slice(0, 3).map((corr, i) => (
                    <div key={i} className={`fr-corr-item ${corr.reaction_type?.toLowerCase()}`}>
                      <span className="fr-corr-badge">
                        {corr.reaction_type === 'MOTIVATED' ? '🔥' :
                          corr.reaction_type === 'ENGAGED' ? '✅' :
                            corr.reaction_type === 'CONFUSED' ? '🤔' : '📱'}
                        {corr.reaction_type}
                      </span>
                      <span className="fr-corr-score">{Math.round((corr.engagement_score || 0) * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Decision Logs */}
              {decisionLogs.length > 0 && (
                <div className="fr-decisions">
                  <div className="fr-dec-header">🧠 AI Decisions</div>
                  {decisionLogs.slice(0, 3).map((log, i) => (
                    <div key={i} className="fr-dec-item">
                      <span className="fr-dec-action">{log.action}</span>
                      <span className="fr-dec-reason">{log.reason?.slice(0, 50)}...</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <style jsx>{`
          .focus-room-page {
            width: 100vw;
            height: 100vh;
            background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%);
            display: flex;
            flex-direction: column;
            font-family: 'Press Start 2P', monospace;
            color: #fff;
            overflow: hidden;
          }

          .focus-room-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 25px;
            background: linear-gradient(180deg, rgba(155, 89, 182, 0.3) 0%, rgba(155, 89, 182, 0.1) 100%);
            border-bottom: 3px solid #9b59b6;
          }

          .focus-room-title {
            display: flex;
            align-items: center;
            gap: 15px;
          }

          .focus-icon { font-size: 28px; }
          .focus-room-title h1 { font-size: 16px; margin: 0; color: #9b59b6; }
          .focus-subtitle { font-size: 8px; color: #888; }

          .focus-room-stats {
            display: flex;
            gap: 30px;
          }

          .fr-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .fr-stat-value { font-size: 18px; color: #5cb85c; }
          .fr-stat-label { font-size: 7px; color: #888; }

          .exit-focus-room {
            background: linear-gradient(135deg, #e94560 0%, #d93550 100%);
            border: 2px solid #b92840;
            border-radius: 8px;
            padding: 10px 20px;
            color: #fff;
            font-family: inherit;
            font-size: 9px;
            cursor: pointer;
          }

          .focus-room-content {
            flex: 1;
            display: grid;
            grid-template-columns: 280px 1fr 400px;
            gap: 20px;
            padding: 20px;
            overflow: hidden;
          }

          .focus-room-left, .focus-room-right {
            display: flex;
            flex-direction: column;
            gap: 15px;
            overflow-y: auto;
          }

          .fr-panel {
            background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
            border: 3px solid #4a4a6a;
            border-radius: 12px;
            padding: 15px;
          }

          .fr-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #3a3a5a;
          }

          .fr-panel-header h3 { font-size: 10px; margin: 0; color: #f0ad4e; }

          .fr-ai-btn {
            background: #9b59b6;
            border: none;
            border-radius: 4px;
            padding: 5px 10px;
            color: #fff;
            font-size: 8px;
            cursor: pointer;
          }

          .fr-task-input input {
            width: 100%;
            background: #0a0a1a;
            border: 2px solid #4a4a6a;
            border-radius: 6px;
            padding: 10px;
            color: #fff;
            font-family: inherit;
            font-size: 8px;
            margin-bottom: 10px;
          }

          .fr-recommendations {
            background: rgba(155, 89, 182, 0.2);
            border: 1px solid #9b59b6;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 10px;
            font-size: 8px;
          }
          .fr-rec-header { color: #9b59b6; font-weight: bold; margin-bottom: 5px; }
          .fr-recommendations p { color: #ccc; margin: 0 0 5px 0; }
          .fr-rec-strategy { color: #5cb85c; }

          .fr-tasks { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }

          .fr-task-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background: rgba(255,255,255,0.05);
            border: 2px solid #3a3a5a;
            border-radius: 6px;
            cursor: pointer;
          }
          .fr-task-item.high { border-left: 4px solid #e94560; }
          .fr-task-item.medium { border-left: 4px solid #f0ad4e; }
          .fr-task-item.low { border-left: 4px solid #5cb85c; }

          .fr-task-check {
            background: transparent;
            border: 2px solid #4a4a6a;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            color: #888;
            cursor: pointer;
          }
          .fr-task-check:hover { border-color: #5cb85c; color: #5cb85c; }

          .fr-task-name { font-size: 8px; color: #fff; margin-bottom: 4px; }
          .fr-task-meta { display: flex; gap: 8px; }
          .fr-dept { font-size: 6px; padding: 2px 6px; border-radius: 4px; color: #fff; }
          .fr-time { font-size: 6px; color: #888; }

          .fr-no-tasks { text-align: center; color: #888; font-size: 8px; padding: 20px; }

          .fr-completed { margin-top: 10px; }
          .fr-completed summary { font-size: 8px; color: #5cb85c; cursor: pointer; }
          .fr-task-done { font-size: 7px; color: #666; text-decoration: line-through; padding: 4px 0; }

          /* Center Panel */
          .focus-room-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }

          .fr-start-panel {
            text-align: center;
            background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
            border: 4px solid #9b59b6;
            border-radius: 16px;
            padding: 40px;
          }
          .fr-start-panel h2 { font-size: 18px; color: #9b59b6; margin-bottom: 10px; }
          .fr-start-panel p { font-size: 9px; color: #888; margin-bottom: 20px; }

          .fr-goal-buttons { display: flex; gap: 10px; justify-content: center; margin-bottom: 25px; }
          .fr-goal-btn {
            padding: 15px 25px;
            background: #2a2a4a;
            border: 3px solid #4a4a6a;
            border-radius: 8px;
            color: #fff;
            font-family: inherit;
            font-size: 11px;
            cursor: pointer;
          }
          .fr-goal-btn.selected { border-color: #9b59b6; background: rgba(155, 89, 182, 0.3); }

          .fr-start-btn {
            background: linear-gradient(135deg, #9b59b6 0%, #8b49a6 100%);
            border: 3px solid #6c3483;
            border-radius: 10px;
            padding: 18px 40px;
            color: #fff;
            font-family: inherit;
            font-size: 12px;
            cursor: pointer;
          }
          .fr-camera-note { font-size: 8px; color: #666; margin-top: 15px; }

          /* Active Focus */
          .fr-active-panel {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 15px;
          }

          .fr-timer-display { text-align: center; margin-bottom: 10px; }
          .fr-timer { font-size: 48px; color: #5cb85c; }
          .fr-timer-goal { font-size: 10px; color: #888; }

          .fr-progress-bar {
            width: 300px;
            height: 8px;
            background: #2a2a4a;
            border-radius: 4px;
            margin-top: 10px;
            overflow: hidden;
          }
          .fr-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #5cb85c, #9b59b6);
            transition: width 1s;
          }

          .fr-focus-plan {
            font-size: 8px;
            color: #9b59b6;
            background: rgba(155, 89, 182, 0.2);
            padding: 8px 15px;
            border-radius: 6px;
          }

          .fr-learning-state {
            font-size: 10px;
            padding: 8px 20px;
            border-radius: 20px;
            background: rgba(255,255,255,0.1);
          }
          .fr-learning-state.sustained_focus { background: rgba(92, 184, 92, 0.3); color: #5cb85c; }
          .fr-learning-state.fatigue { background: rgba(233, 69, 96, 0.3); color: #e94560; }
          .fr-ready-badge { margin-left: 10px; color: #f0ad4e; }

          .fr-camera-container {
            position: relative;
            width: 100%;
            max-width: 640px;
            height: 360px;
            background: #000;
            border: 4px solid #9b59b6;
            border-radius: 12px;
            overflow: hidden;
          }
          .fr-camera-container video, .fr-camera-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .fr-face-indicator {
            position: absolute;
            top: 10px;
            left: 10px;
            font-size: 8px;
            padding: 5px 10px;
            border-radius: 4px;
          }
          .fr-face-indicator.detected { background: rgba(92, 184, 92, 0.8); }
          .fr-face-indicator.not-detected { background: rgba(233, 69, 96, 0.8); }

          .fr-debug-toggle {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            border: 1px solid #9b59b6;
            border-radius: 4px;
            padding: 5px 10px;
            color: #fff;
            font-size: 8px;
            cursor: pointer;
          }

          .fr-focus-meter {
            display: flex;
            align-items: center;
            gap: 15px;
            font-size: 9px;
          }
          .fr-meter-bar {
            width: 200px;
            height: 12px;
            background: #2a2a4a;
            border-radius: 6px;
            overflow: hidden;
          }
          .fr-meter-fill { height: 100%; transition: width 0.5s, background 0.5s; }

          .fr-warning {
            background: rgba(233, 69, 96, 0.3);
            border: 2px solid #e94560;
            border-radius: 8px;
            padding: 12px 20px;
            font-size: 9px;
            color: #e94560;
            text-align: center;
          }

          .fr-end-btn {
            background: linear-gradient(135deg, #e94560 0%, #d93550 100%);
            border: 2px solid #b92840;
            border-radius: 8px;
            padding: 12px 30px;
            color: #fff;
            font-family: inherit;
            font-size: 10px;
            cursor: pointer;
          }

          /* Right Panel - Chat */
          .fr-chat-panel { flex: 1; display: flex; flex-direction: column; }

          .fr-specialist-select {
            background: #0a0a1a;
            border: 1px solid #4a4a6a;
            border-radius: 4px;
            padding: 5px;
            color: #fff;
            font-size: 7px;
          }

          .fr-chat-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 200px;
            margin-bottom: 10px;
          }

          .fr-chat-msg {
            padding: 8px;
            border-radius: 6px;
            font-size: 8px;
          }
          .fr-chat-msg.user { background: rgba(74, 144, 217, 0.2); margin-left: 20px; }
          .fr-chat-msg.assistant { background: rgba(155, 89, 182, 0.2); margin-right: 20px; }
          .fr-chat-msg.system { background: rgba(240, 173, 78, 0.2); text-align: center; }
          .fr-msg-role { font-size: 7px; color: #888; display: block; margin-bottom: 4px; }
          .fr-chat-msg p { margin: 0; line-height: 1.4; }

          .fr-chat-empty { text-align: center; color: #666; font-size: 8px; padding: 20px; }

          .fr-chat-input {
            display: flex;
            gap: 8px;
          }
          .fr-chat-input input {
            flex: 1;
            background: #0a0a1a;
            border: 2px solid #4a4a6a;
            border-radius: 6px;
            padding: 10px;
            color: #fff;
            font-family: inherit;
            font-size: 8px;
          }
          .fr-chat-input button {
            background: linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%);
            border: 2px solid #3d8b3d;
            border-radius: 6px;
            padding: 10px 15px;
            color: #fff;
            font-size: 12px;
            cursor: pointer;
          }
          .fr-chat-input button:disabled { opacity: 0.5; }

          /* OpenNote Panel */
          .fr-opennote-panel { border-color: #4a90d9; }
          .fr-opennote-panel h3 { color: #4a90d9; }

          .fr-refresh-btn {
            background: transparent;
            border: 1px solid #4a90d9;
            border-radius: 4px;
            padding: 4px 8px;
            color: #4a90d9;
            font-size: 10px;
            cursor: pointer;
          }

          .fr-insight-stats {
            display: flex;
            justify-content: space-around;
            margin-bottom: 12px;
            padding: 10px;
            background: rgba(0,0,0,0.3);
            border-radius: 6px;
          }
          .fr-is { text-align: center; }
          .fr-is-num { display: block; font-size: 16px; color: #5cb85c; }
          .fr-is-label { font-size: 7px; color: #888; }

          .fr-insights-list { margin-bottom: 12px; }
          .fr-insight-item {
            font-size: 7px;
            padding: 6px;
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
            margin-bottom: 4px;
            color: #ccc;
          }

          .fr-no-insights { font-size: 8px; color: #666; text-align: center; padding: 15px; }

          .fr-correlations { margin-bottom: 12px; }
          .fr-corr-header { font-size: 8px; color: #4a90d9; margin-bottom: 8px; }
          .fr-corr-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px;
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
            margin-bottom: 4px;
            font-size: 8px;
          }
          .fr-corr-badge { }
          .fr-corr-score { color: #5cb85c; }

          .fr-decisions { }
          .fr-dec-header { font-size: 8px; color: #9b59b6; margin-bottom: 8px; }
          .fr-dec-item {
            padding: 6px;
            background: rgba(155, 89, 182, 0.1);
            border-radius: 4px;
            margin-bottom: 4px;
            font-size: 7px;
          }
          .fr-dec-action { color: #9b59b6; display: block; }
          .fr-dec-reason { color: #888; }

          /* ═══ COMPACT STYLES FOR RIGHT SIDEBAR ═══ */
          .fr-chat-main { justify-content: flex-start; padding: 10px; }
          
          .fr-chat-panel-large {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
            border: 3px solid #9b59b6;
            border-radius: 12px;
            padding: 15px;
            width: 100%;
            height: calc(100vh - 150px);
          }
          .fr-chat-messages-large {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
          }
          .fr-chat-input-large {
            display: flex;
            gap: 10px;
          }
          .fr-chat-input-large input {
            flex: 1;
            background: #0a0a1a;
            border: 2px solid #4a4a6a;
            border-radius: 8px;
            padding: 15px;
            color: #fff;
            font-family: inherit;
            font-size: 10px;
          }
          .fr-chat-input-large button {
            background: linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%);
            border: 2px solid #3d8b3d;
            border-radius: 8px;
            padding: 15px 25px;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
          }

          /* Compact Start Panel */
          .fr-start-panel-compact {
            background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
            border: 3px solid #9b59b6;
            border-radius: 12px;
            padding: 15px;
            text-align: center;
          }
          .fr-start-panel-compact h3 { font-size: 12px; color: #9b59b6; margin: 0 0 12px 0; }
          .fr-goal-buttons-compact { display: flex; gap: 5px; justify-content: center; margin-bottom: 12px; }
          .fr-goal-btn-sm {
            padding: 8px 12px;
            background: #2a2a4a;
            border: 2px solid #4a4a6a;
            border-radius: 6px;
            color: #fff;
            font-family: inherit;
            font-size: 9px;
            cursor: pointer;
          }
          .fr-goal-btn-sm.selected { border-color: #9b59b6; background: rgba(155, 89, 182, 0.3); }
          .fr-start-btn-compact {
            background: linear-gradient(135deg, #9b59b6 0%, #8b49a6 100%);
            border: 2px solid #6c3483;
            border-radius: 8px;
            padding: 12px 20px;
            color: #fff;
            font-family: inherit;
            font-size: 10px;
            cursor: pointer;
            width: 100%;
          }
          .fr-camera-note-sm { font-size: 7px; color: #666; margin-top: 10px; }

          /* Compact Active Panel */
          .fr-active-panel-compact {
            background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
            border: 3px solid #9b59b6;
            border-radius: 12px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .fr-timer-compact { display: flex; align-items: baseline; justify-content: center; gap: 5px; }
          .fr-timer-sm { font-size: 24px; color: #5cb85c; }
          .fr-timer-goal-sm { font-size: 10px; color: #888; }
          .fr-progress-bar-sm {
            height: 6px;
            background: #2a2a4a;
            border-radius: 3px;
            overflow: hidden;
          }

          /* Compact Camera */
          .fr-camera-container-compact {
            position: relative;
            width: 100%;
            height: 200px;
            background: #000;
            border: 2px solid #9b59b6;
            border-radius: 8px;
            overflow: hidden;
          }
          .fr-camera-container-compact video, .fr-camera-container-compact img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .fr-face-indicator-sm {
            position: absolute;
            top: 5px;
            left: 5px;
            font-size: 12px;
            padding: 3px 6px;
            border-radius: 4px;
          }
          .fr-face-indicator-sm.detected { background: rgba(92, 184, 92, 0.8); }
          .fr-face-indicator-sm.not-detected { background: rgba(233, 69, 96, 0.8); }
          .fr-debug-toggle-sm {
            position: absolute;
            top: 5px;
            right: 5px;
            background: rgba(0,0,0,0.7);
            border: none;
            border-radius: 4px;
            padding: 5px;
            color: #fff;
            font-size: 10px;
            cursor: pointer;
          }

          /* Compact Focus Meter */
          .fr-focus-meter-compact { display: flex; align-items: center; gap: 8px; }
          .fr-meter-bar-sm {
            flex: 1;
            height: 8px;
            background: #2a2a4a;
            border-radius: 4px;
            overflow: hidden;
          }
          .fr-meter-pct { font-size: 10px; color: #5cb85c; min-width: 30px; }

          .fr-warning-compact {
            background: rgba(233, 69, 96, 0.3);
            border: 1px solid #e94560;
            border-radius: 6px;
            padding: 8px;
            font-size: 8px;
            color: #e94560;
            text-align: center;
          }
          .fr-learning-badge {
            font-size: 8px;
            padding: 5px 10px;
            border-radius: 12px;
            background: rgba(255,255,255,0.1);
            text-align: center;
          }
          .fr-learning-badge.sustained_focus { background: rgba(92, 184, 92, 0.3); color: #5cb85c; }
          .fr-learning-badge.fatigue { background: rgba(233, 69, 96, 0.3); color: #e94560; }
          
          .fr-end-btn-compact {
            background: linear-gradient(135deg, #e94560 0%, #d93550 100%);
            border: 2px solid #b92840;
            border-radius: 6px;
            padding: 8px;
            color: #fff;
            font-family: inherit;
            font-size: 9px;
            cursor: pointer;
          }
        `}</style>
      </div >
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEACHER DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════════════════════════

  if (activeMode === 'dashboard' && playerRole === 'teacher') {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>👨‍🏫 Teacher Dashboard</h1>
          <button onClick={() => setActiveMode(null)}>Back to World</button>
        </div>

        <div className="dashboard-grid">
          {/* Class Overview */}
          <div className="dashboard-card">
            <h3>📊 Class Overview</h3>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-value">{classStudents.length}</span>
                <span className="stat-label">Students Online</span>
              </div>
              <div className="stat">
                <span className="stat-value">{classAnalytics?.totalSessions || 0}</span>
                <span className="stat-label">Sessions Today</span>
              </div>
              <div className="stat">
                <span className="stat-value">{classAnalytics?.avgAccuracy || 0}%</span>
                <span className="stat-label">Avg Accuracy</span>
              </div>
              <div className="stat">
                <span className="stat-value">{classAnalytics?.avgTimeSpent || 0}m</span>
                <span className="stat-label">Avg Study Time</span>
              </div>
            </div>
          </div>

          {/* Active Students */}
          <div className="dashboard-card">
            <h3>👥 Active Students</h3>
            <div className="students-list">
              {classStudents.map(student => (
                <div key={student.id} className="student-item">
                  <div className="student-avatar" style={{ background: student.color }} />
                  <span>{student.name}</span>
                  <span className="student-location">{student.currentRoom || 'Hallway'}</span>
                </div>
              ))}
              {classStudents.length === 0 && <p>No students online</p>}
            </div>
          </div>

          {/* Common Misconceptions */}
          <div className="dashboard-card">
            <h3>🚨 Common Misconceptions</h3>
            <div className="misconceptions-list">
              {(classAnalytics?.commonMisconceptions || []).map((m: any, i: number) => (
                <div key={i} className="misconception-item">
                  <span className="topic">{m.topic}</span>
                  <span className="count">{m.count} students</span>
                  <p>{m.description}</p>
                </div>
              ))}
              {(!classAnalytics?.commonMisconceptions?.length) && <p>No data yet</p>}
            </div>
          </div>

          {/* Create Assignment */}
          <div className="dashboard-card">
            <h3>📝 Create Assignment</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const title = (form.elements.namedItem('title') as HTMLInputElement).value;
              const desc = (form.elements.namedItem('desc') as HTMLInputElement).value;
              const dept = (form.elements.namedItem('dept') as HTMLSelectElement).value;
              createAssignment(title, desc, dept);
              form.reset();
            }}>
              <input name="title" placeholder="Assignment Title" required />
              <textarea name="desc" placeholder="Description" required />
              <select name="dept">
                <option value="math">Mathematics</option>
                <option value="science">Science</option>
                <option value="english">English</option>
              </select>
              <button type="submit">Create Assignment</button>
            </form>
          </div>

          {/* Assignments */}
          <div className="dashboard-card wide">
            <h3>📋 Assignments</h3>
            <div className="assignments-list">
              {assignments.map(a => (
                <div key={a.id} className="assignment-item">
                  <div className="assignment-header">
                    <span className="assignment-title">{a.title}</span>
                    <span className="assignment-dept">{a.department}</span>
                  </div>
                  <p>{a.description}</p>
                  <div className="assignment-stats">
                    <span>{a.submissions?.length || 0} submissions</span>
                    <span>Due: {new Date(a.dueDate).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {assignments.length === 0 && <p>No assignments created</p>}
            </div>
          </div>
        </div>

        <style jsx>{`
          .dashboard-container {
            min-height: 100vh;
            background: linear-gradient(135deg, #0d1b2a 0%, #1b263b 100%);
            padding: 20px;
            font-family: 'Press Start 2P', monospace;
            color: #fff;
          }

          .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
          }

          .dashboard-header h1 {
            font-size: 18px;
          }

          .dashboard-header button {
            padding: 10px 20px;
            background: #4a90d9;
            border: none;
            border-radius: 8px;
            color: #fff;
            font-family: inherit;
            font-size: 10px;
            cursor: pointer;
          }

          .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
          }

          .dashboard-card {
            background: rgba(30, 30, 50, 0.9);
            border: 3px solid #3a3a5a;
            border-radius: 12px;
            padding: 20px;
          }

          .dashboard-card.wide {
            grid-column: span 3;
          }

          .dashboard-card h3 {
            font-size: 12px;
            margin-bottom: 15px;
            color: #4a90d9;
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }

          .stat {
            text-align: center;
            padding: 10px;
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
          }

          .stat-value {
            display: block;
            font-size: 20px;
            color: #5cb85c;
          }

          .stat-label {
            font-size: 8px;
            color: #888;
          }

          .students-list {
            max-height: 200px;
            overflow-y: auto;
          }

          .student-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px;
            background: rgba(0,0,0,0.2);
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 9px;
          }

          .student-avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
          }

          .student-location {
            margin-left: auto;
            color: #888;
            font-size: 8px;
          }

          .misconceptions-list, .assignments-list {
            max-height: 200px;
            overflow-y: auto;
          }

          .misconception-item, .assignment-item {
            padding: 10px;
            background: rgba(0,0,0,0.2);
            border-radius: 6px;
            margin-bottom: 10px;
          }

          .misconception-item .topic {
            color: #f0ad4e;
            font-size: 10px;
          }

          .misconception-item .count {
            float: right;
            color: #e94560;
            font-size: 8px;
          }

          .misconception-item p {
            font-size: 8px;
            color: #aaa;
            margin-top: 5px;
            font-family: Arial, sans-serif;
          }

          .dashboard-card form {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .dashboard-card input, .dashboard-card textarea, .dashboard-card select {
            padding: 10px;
            background: #0a0a1a;
            border: 2px solid #3a3a5a;
            border-radius: 6px;
            color: #fff;
            font-family: Arial, sans-serif;
            font-size: 11px;
          }

          .dashboard-card textarea {
            height: 60px;
            resize: none;
          }

          .dashboard-card form button {
            padding: 10px;
            background: #5cb85c;
            border: none;
            border-radius: 6px;
            color: #fff;
            font-family: inherit;
            font-size: 9px;
            cursor: pointer;
          }

          .assignment-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }

          .assignment-title {
            font-size: 10px;
            color: #4a90d9;
          }

          .assignment-dept {
            font-size: 8px;
            color: #888;
          }

          .assignment-item p {
            font-size: 9px;
            color: #aaa;
            font-family: Arial, sans-serif;
            margin-bottom: 5px;
          }

          .assignment-stats {
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #666;
          }
        `}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN GAME VIEW
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="game-container">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="player-info">
          <span className="player-name">{playerRole === 'teacher' ? '👨‍🏫' : '🎓'} {localPlayer.name}</span>
          <span className="player-room">{currentRoom ? `📍 ${currentRoom.name}` : '📍 Hallway'}</span>
        </div>

        <div className="progress-display">
          <div className="xp-section">
            <span className="level">LVL {level}</span>
            <div className="xp-bar">
              <div className="xp-fill" style={{ width: `${levelProgress()}%` }} />
            </div>
            <span className="xp-text">{xp} XP</span>
          </div>
          <div className="mastery-mini">
            <span title="Problems solved">📝 {studentProgress.totalProblems}</span>
            <span title="Accuracy">{studentProgress.totalProblems > 0 ? Math.round((studentProgress.correctProblems / studentProgress.totalProblems) * 100) : 0}%</span>
            <span title="Streak">🔥 {studentProgress.streakDays}d</span>
          </div>
        </div>

        <div className="online-players">
          <span>👥 {otherPlayers.length + 1} online</span>
          {playerRole === 'teacher' && (
            <button className="dashboard-btn" onClick={() => setActiveMode('dashboard')}>
              📊 Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Game World */}
      <div className="world-viewport">
        <div
          className="world"
          style={{
            transform: `translate(${-localPlayer.x + 500}px, ${-localPlayer.y + 350}px)`
          }}
        >
          <div className="floor" />

          {/* Rooms */}
          {ROOMS.map(room => (
            <div
              key={room.id}
              className={`room ${localPlayer.currentRoom === room.id ? 'active' : ''}`}
              style={{
                left: room.x,
                top: room.y,
                width: room.width,
                height: room.height,
                borderColor: room.color
              }}
            >
              <div className="room-label" style={{ background: room.color }}>
                {room.name}
              </div>
              <div className="room-floor" style={{ background: `${room.color}20` }} />
            </div>
          ))}

          {/* Specialists */}
          {specialists.map(spec => (
            <div
              key={spec.id}
              className={`specialist ${selectedSpecialist?.id === spec.id ? 'selected' : ''}`}
              style={{ left: spec.x, top: spec.y }}
              onClick={() => handleSpecialistClick(spec)}
            >
              <span className="specialist-sprite">{spec.sprite}</span>
              <div className="specialist-name">{spec.name}</div>
              {localPlayer.currentRoom === spec.department && (
                <div className="interact-hint">E</div>
              )}
            </div>
          ))}

          {/* Other Players */}
          {otherPlayers.map(player => (
            <div
              key={player.id}
              className="other-player"
              style={{ left: player.x, top: player.y }}
            >
              <div className="player-avatar" style={{ background: player.color }} />
              <div className="player-label">{player.name}</div>
            </div>
          ))}

          {/* Local Player */}
          <div
            className="local-player"
            style={{ left: localPlayer.x, top: localPlayer.y }}
          >
            <div className="player-avatar" style={{ background: localPlayer.color }} />
            <div className="player-label">You</div>
          </div>
        </div>
      </div>

      {/* Interaction Panel */}
      {selectedSpecialist && (
        <div className="interaction-panel" style={{ borderColor: selectedSpecialist.color }}>
          <div className="panel-header" style={{ background: selectedSpecialist.color }}>
            <span>{selectedSpecialist.sprite} {selectedSpecialist.name} - {selectedSpecialist.role}</span>
            <button onClick={() => { setSelectedSpecialist(null); setActiveMode(null); setCurrentProblem(null); }}>×</button>
          </div>

          {/* Mode Tabs */}
          <div className="mode-tabs">
            <button className={activeMode === 'chat' ? 'active' : ''} onClick={() => setActiveMode('chat')}>
              💬 Chat
            </button>
            <button className={activeMode === 'problem' ? 'active' : ''} onClick={getProblem} disabled={isProcessing}>
              📝 Problem
            </button>
            <button className={activeMode === 'canvas' ? 'active' : ''} onClick={() => setActiveMode('canvas')}>
              ✏️ Canvas
            </button>
            <button className={activeMode === 'flashcards' ? 'active' : ''} onClick={generateFlashcards} disabled={isProcessing}>
              🎴 Cards
            </button>
          </div>

          {/* Chat Mode */}
          {activeMode === 'chat' && (
            <div className="chat-content">
              <div className="messages">
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`message ${msg.role} ${msg.isCorrect !== undefined ? (msg.isCorrect ? 'correct' : 'incorrect') : ''}`}>
                    {msg.role === 'assistant' && <span className="specialist-tag">{selectedSpecialist.sprite}</span>}
                    {msg.role === 'hint' && <span className="hint-tag">💡</span>}
                    {msg.role === 'hint' && <span className="hint-tag">💡</span>}
                    <div className="message-text">{msg.content}</div>

                    {/* Widget: Video Player */}
                    {msg.videoUrl && (
                      <div className="chat-widget video-widget">
                        <video src={msg.videoUrl} controls autoPlay loop muted playsInline />
                      </div>
                    )}
                  </div>
                ))}
                {isProcessing && (
                  <div className="message assistant">
                    <div className="typing"><span></span><span></span><span></span></div>
                  </div>
                )}
              </div>
              <div className="chat-input">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask a question..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button onClick={sendMessage} disabled={!inputText.trim() || isProcessing}>Send</button>
                <button onClick={generateVisual} disabled={!inputText.trim() || isProcessing} style={{ background: '#9b59b6' }}>🎬 Visual</button>
              </div>
            </div>
          )}

          {/* Problem Mode */}
          {activeMode === 'problem' && currentProblem && (
            <div className="problem-content">
              <div className="problem-header">
                <span className="difficulty">{currentProblem.difficulty}</span>
                <span className="hints-left">💡 {currentProblem.hints.length - currentProblem.hintsUsed} hints left</span>
              </div>
              <div className="problem-question">{currentProblem.question}</div>

              {currentProblem.feedback && (
                <div className={`feedback ${currentProblem.isCorrect ? 'correct' : 'incorrect'}`}>
                  {currentProblem.feedback}
                </div>
              )}

              <div className="answer-section">
                <textarea
                  value={problemAnswer}
                  onChange={(e) => setProblemAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  disabled={!!currentProblem.isCorrect}
                />
                <div className="problem-actions">
                  <button onClick={getHint} disabled={currentProblem.hintsUsed >= currentProblem.hints.length || !!currentProblem.isCorrect}>
                    💡 Hint
                  </button>
                  <button onClick={submitAnswer} disabled={!problemAnswer.trim() || isProcessing || !!currentProblem.isCorrect}>
                    Submit
                  </button>
                  <button onClick={getProblem} disabled={isProcessing}>Next Problem</button>
                </div>
              </div>
            </div>
          )}

          {/* Canvas Mode */}
          {activeMode === 'canvas' && (
            <div className="canvas-content">
              <canvas
                ref={drawingCanvasRef}
                width={340}
                height={300}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <div className="canvas-tools">
                <button onClick={clearCanvas}>🗑️ Clear</button>
                <button onClick={submitCanvasWork} disabled={isProcessing}>📤 Submit for Review</button>
              </div>
              <p className="canvas-hint">Draw your work, then submit for AI feedback!</p>
            </div>
          )}

          {/* Flashcards Mode */}
          {activeMode === 'flashcards' && flashcards.length > 0 && (
            <div className="flashcard-content">
              <div className="flashcard-progress">
                Card {currentFlashcardIndex + 1} of {flashcards.filter(f => f.nextReview <= new Date()).length}
              </div>
              <div
                className={`flashcard ${showFlashcardBack ? 'flipped' : ''}`}
                onClick={() => setShowFlashcardBack(!showFlashcardBack)}
              >
                <div className="flashcard-inner">
                  <div className="flashcard-front">{flashcards[currentFlashcardIndex]?.front}</div>
                  <div className="flashcard-back">{flashcards[currentFlashcardIndex]?.back}</div>
                </div>
              </div>
              {showFlashcardBack && (
                <div className="flashcard-rating">
                  <span>How well did you know it?</span>
                  <div className="rating-buttons">
                    <button onClick={() => rateFlashcard(1)}>😕 Again</button>
                    <button onClick={() => rateFlashcard(2)}>😐 Hard</button>
                    <button onClick={() => rateFlashcard(3)}>🙂 Good</button>
                    <button onClick={() => rateFlashcard(4)}>😊 Easy</button>
                    <button onClick={() => rateFlashcard(5)}>🎉 Perfect</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Focus Room Panel - AntiGravity Orchestration */}
      {currentRoom?.id === 'focus' && !selectedSpecialist && (
        <div className="focus-panel">
          <h3>🎯 FocusRoom</h3>
          <p style={{ fontSize: '8px', color: '#9b59b6', marginBottom: '10px' }}>Behavior-Aware Learning Environment</p>

          {!focusActive ? (
            <div className="focus-setup">
              <p>Set your focus goal:</p>
              <div className="goal-selector">
                {[15, 25, 45, 60].map(mins => (
                  <button
                    key={mins}
                    className={focusGoalMinutes === mins ? 'selected' : ''}
                    onClick={() => setFocusGoalMinutes(mins)}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <button className="start-focus" onClick={startFocusMode}>Start Focus Session</button>
              <p className="camera-note">📷 Camera will track focus (no video stored)</p>
            </div>
          ) : (
            <div className="focus-active">
              <div className="focus-timer">{formatTime(focusTimer)}</div>
              <div className="focus-goal">Goal: {focusGoalMinutes} minutes</div>

              {/* AntiGravity Focus Plan Display */}
              {focusPlan && (
                <div style={{ background: 'rgba(155, 89, 182, 0.2)', padding: '8px', borderRadius: '6px', marginBottom: '10px', fontSize: '8px' }}>
                  <div style={{ color: '#9b59b6', fontWeight: 'bold', marginBottom: '4px' }}>Focus Plan</div>
                  <div>Recommended: {focusPlan.recommended_duration_minutes} min</div>
                  <div>Break every: {focusPlan.break_interval_minutes} min</div>
                  <div style={{ color: '#888', marginTop: '4px' }}>{focusPlan.rationale}</div>
                </div>
              )}

              {/* Current Learning State */}
              {currentLearningEvent && (
                <div style={{
                  background: currentLearningEvent === 'sustained_focus' ? 'rgba(92, 184, 92, 0.2)' :
                    currentLearningEvent === 'fatigue' ? 'rgba(233, 69, 96, 0.2)' :
                      'rgba(240, 173, 78, 0.2)',
                  padding: '6px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  fontSize: '8px',
                  textAlign: 'center'
                }}>
                  State: {currentLearningEvent.replace(/_/g, ' ')}
                  {teachingReady && <span style={{ color: '#5cb85c', marginLeft: '8px' }}>Ready to Learn</span>}
                </div>
              )}

              {/* Camera Feed with CV Overlay - LARGE VIEW */}
              <div className="camera-preview" style={{
                position: 'relative',
                width: '100%',
                minHeight: '300px',
                background: '#000',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '3px solid #9b59b6',
                boxShadow: '0 0 20px rgba(155, 89, 182, 0.3)'
              }}>
                {/* Video element always needed for capture */}
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  style={{
                    width: '100%',
                    height: '300px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    display: (showDebugOverlay && debugImage) ? 'none' : 'block'
                  }}
                />
                {/* Show CV debug overlay with face/eye boxes when available */}
                {showDebugOverlay && debugImage && (
                  <img
                    src={debugImage}
                    style={{
                      width: '100%',
                      height: '300px',
                      objectFit: 'cover',
                      borderRadius: '8px'
                    }}
                    alt="CV Debug - Face/Eye Detection"
                  />
                )}
                {/* Waiting for camera or showing error */}
                {!cameraEnabled && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0,0,0,0.9)',
                    padding: '20px 30px',
                    borderRadius: '8px',
                    fontSize: analysisError ? '10px' : '12px',
                    color: analysisError ? '#e94560' : '#9b59b6',
                    textAlign: 'center',
                    maxWidth: '90%',
                    border: analysisError ? '2px solid #e94560' : 'none'
                  }}>
                    {analysisError ? (
                      <>
                        <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>⚠️ Camera Error</div>
                        <div style={{ fontSize: '9px', lineHeight: '1.4', color: '#ddd' }}>{analysisError}</div>
                        <button
                          onClick={() => {
                            setAnalysisError(null);
                            startFocusMode();
                          }}
                          style={{
                            marginTop: '15px',
                            padding: '8px 16px',
                            background: '#9b59b6',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '9px',
                            cursor: 'pointer'
                          }}
                        >
                          Try Again
                        </button>
                      </>
                    ) : (
                      'Starting Camera...'
                    )}
                  </div>
                )}
                {/* Waiting for first analysis */}
                {cameraEnabled && showDebugOverlay && !debugImage && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(0,0,0,0.8)',
                    padding: '15px 25px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#9b59b6',
                    textAlign: 'center'
                  }}>
                    Initializing CV Analysis...<br />
                    <span style={{ fontSize: '10px', color: '#666' }}>Analyses: {analysisCount}</span>
                  </div>
                )}
                <canvas ref={cameraCanvasRef} width={640} height={480} style={{ display: 'none' }} />

                <button
                  onClick={() => setShowDebugOverlay(!showDebugOverlay)}
                  style={{
                    position: 'absolute',
                    bottom: '5px',
                    right: '5px',
                    fontSize: '8px',
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    border: '1px solid #fff',
                    borderRadius: '4px',
                    padding: '2px 5px',
                    cursor: 'pointer'
                  }}
                >
                  {showDebugOverlay ? 'Show Live' : 'Show CV Debug'}
                </button>

                {/* Face detection indicator */}
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  left: '5px',
                  fontSize: '8px',
                  background: facesDetected > 0 ? 'rgba(92, 184, 92, 0.8)' : 'rgba(233, 69, 96, 0.8)',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  {facesDetected > 0 ? `Face Detected` : `No Face`}
                </div>
              </div>

              {/* AntiGravity Debug Panel */}
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '8px',
                borderRadius: '6px',
                marginTop: '8px',
                fontSize: '8px',
                fontFamily: 'monospace'
              }}>
                <div style={{ color: '#9b59b6', fontWeight: 'bold', marginBottom: '4px' }}>AntiGravity Debug</div>
                <div>Analyses: {analysisCount}</div>
                <div>Faces: {facesDetected} | Eyes: {lastAnalysisResult?.learning_event?.evidence?.eyes_open ? 'Open' : 'Closed/Unknown'}</div>
                <div>Distraction: {lastAnalysisResult?.distraction_type || 'None'} ({(distractionLevel * 100).toFixed(0)}%)</div>
                <div style={{ color: currentLearningEvent === 'sustained_focus' ? '#5cb85c' : currentLearningEvent === 'fatigue' ? '#e94560' : '#f0ad4e' }}>
                  Event: {currentLearningEvent || 'Waiting...'}
                </div>
                {analysisError && <div style={{ color: '#e94560' }}>Error: {analysisError}</div>}
                {lastAnalysisResult?.intervention && (
                  <div style={{ color: '#f0ad4e', marginTop: '4px' }}>Intervention: {lastAnalysisResult.intervention}</div>
                )}
              </div>
              <div className="distraction-meter">
                <span>Focus Level</span>
                <div className="meter-bar">
                  <div
                    className="meter-fill"
                    style={{
                      width: `${(1 - distractionLevel) * 100}%`,
                      background: distractionLevel > 0.5 ? '#e94560' : '#5cb85c'
                    }}
                  />
                </div>
              </div>
              {distractionWarning && <div className="distraction-warning">{distractionWarning}</div>}

              <button className="end-focus" onClick={() => endFocusMode(false)}>End Session</button>
            </div>
          )}

          <div style={{ marginTop: '20px', borderTop: '1px solid #3a3a5a', paddingTop: '15px' }}>
            <button
              className="consult-coach"
              onClick={() => {
                const coach = specialists.find(s => s.id === 'coach');
                if (coach) {
                  setSelectedSpecialist(coach);
                  setActiveMode('chat');
                }
              }}
            >
              🧠 Consult Orchestrator
            </button>

            {/* AntiGravity Decision Logs - Explainability */}
            {decisionLogs.length > 0 ? (
              <div className="decision-logs-preview">
                <h4>🧠 Decision Logs (Click to explain)</h4>
                <p style={{ fontSize: '7px', color: '#888', marginBottom: '8px' }}>Every action is logged and explainable</p>
                <div className="logs-scroll">
                  {decisionLogs.slice(-5).reverse().map((log, i) => (
                    <div key={log.id || i} className="log-entry" style={{ cursor: 'pointer' }} title={`Why? ${log.reason}`}>
                      <div className="log-header">
                        <span className="log-time">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span className="log-badge">{log.action}</span>
                      </div>
                      <div className="log-reason">{log.reason}</div>
                      <div className="log-evidence">
                        👁️ Evidence: {typeof log.triggering_evidence === 'object' ?
                          Object.entries(log.triggering_evidence).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ') :
                          String(log.triggering_evidence)}
                      </div>
                      {log.alternatives_considered && (
                        <div style={{ fontSize: '7px', color: '#666', marginTop: '2px' }}>
                          Alternatives: {log.alternatives_considered.slice(0, 2).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '9px', color: '#666', textAlign: 'center' }}>
                System awaiting behavioral signals...
              </div>
            )}

            {/* OpenNote Correlations - Learning Insights */}
            <div className="opennote-panel">
              <h4>📊 OpenNote Insights</h4>
              <p style={{ fontSize: '7px', color: '#888', marginBottom: '8px' }}>AI reaction tracking & correlations</p>

              {/* Learning Insights */}
              {learningInsights.length > 0 && (
                <div className="insights-box">
                  {learningInsights.map((insight, i) => (
                    <div key={i} className="insight-item">{insight}</div>
                  ))}
                </div>
              )}

              {/* Recent Correlations */}
              {openNoteCorrelations.length > 0 ? (
                <div className="correlations-list">
                  {openNoteCorrelations.slice(0, 3).map((corr, i) => (
                    <div key={corr.id || i} className={`correlation-item ${corr.reaction_type?.toLowerCase()}`}>
                      <div className="corr-header">
                        <span className={`reaction-badge ${corr.reaction_type?.toLowerCase()}`}>
                          {corr.reaction_type === 'MOTIVATED' ? '🔥' :
                            corr.reaction_type === 'ENGAGED' ? '✅' :
                              corr.reaction_type === 'CONFUSED' ? '🤔' :
                                corr.reaction_type === 'DISTRACTED' ? '📱' : '😐'}
                          {corr.reaction_type}
                        </span>
                        <span className="corr-score">{Math.round((corr.engagement_score || 0) * 100)}%</span>
                      </div>
                      <div className="corr-reasoning">{corr.reasoning?.split('|')[0]}</div>
                      {corr.adaptation && (
                        <div className="corr-adaptation">
                          → {corr.adaptation.action}: {corr.adaptation.suggestions?.[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-correlations">
                  Waiting for interaction data...
                </div>
              )}

              {/* Current Task from To-Do */}
              {smartTasks.filter(t => t.status !== 'completed').length > 0 && (
                <div className="current-focus-task">
                  <div className="focus-task-label">📋 Current Task:</div>
                  <div className="focus-task-name">
                    {smartTasks.filter(t => t.status !== 'completed')[0]?.title}
                  </div>
                  <div className="focus-task-agent">
                    💡 {SPECIALISTS[smartTasks.filter(t => t.status !== 'completed')[0]?.recommendedAgent]?.name || 'Coach'}
                  </div>
                </div>
              )}

              <button
                className="refresh-insights-btn"
                onClick={loadOpenNoteData}
              >
                🔄 Refresh Insights
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && <div className="notification">{notification}</div>}

      {/* Smart To-Do List - Left Side */}
      {showTaskPanel && (
        <div className="todo-panel">
          <div className="todo-header">
            <div className="todo-title">
              <span className="todo-icon">📝</span>
              <h3>SMART TO-DO</h3>
            </div>
            <button onClick={() => setShowTaskPanel(false)} className="todo-close">×</button>
          </div>

          {/* Stats Bar */}
          <div className="todo-stats">
            <div className="stat">
              <span className="stat-num">{smartTasks.filter(t => t.status !== 'completed').length}</span>
              <span className="stat-label">Pending</span>
            </div>
            <div className="stat">
              <span className="stat-num">{smartTasks.filter(t => t.priority === 'high' && t.status !== 'completed').length}</span>
              <span className="stat-label">Urgent</span>
            </div>
            <div className="stat">
              <span className="stat-num">{smartTasks.filter(t => t.status === 'completed').length}</span>
              <span className="stat-label">Done</span>
            </div>
          </div>

          {/* Quick Add Input */}
          <div className="todo-input-wrap">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="+ Add task or ask AI..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && taskInput.trim()) {
                  handleTaskChatCommand(taskInput);
                  setTaskInput('');
                }
              }}
              className="todo-input"
            />
            <button
              onClick={() => {
                if (taskInput.trim()) {
                  handleTaskChatCommand(taskInput);
                  setTaskInput('');
                }
              }}
              disabled={isLoadingTasks}
              className="todo-add-btn"
            >
              {isLoadingTasks ? '⏳' : '✓'}
            </button>
          </div>

          {/* AI Actions */}
          <div className="todo-actions">
            <button onClick={() => handleTaskChatCommand('recommend')} className="ai-btn">
              🧠 AI Suggest
            </button>
            <button onClick={() => {
              const focusRoom = ROOMS.find(r => r.id === 'focus');
              if (focusRoom) {
                setLocalPlayer(prev => ({ ...prev, x: focusRoom.doorX, y: focusRoom.doorY + 50, currentRoom: 'focus' }));
                setActiveMode('focus');
              }
            }} className="focus-btn">
              🎯 Focus Mode
            </button>
          </div>

          {/* AI Recommendations */}
          {taskRecommendations && (
            <div className="ai-rec-box">
              <div className="ai-rec-header">✨ AI SAYS</div>
              <p className="ai-rec-text">{taskRecommendations.summary}</p>
              {taskRecommendations.recommended_specialist && (
                <button
                  className="go-specialist-btn"
                  onClick={() => goToRecommendedAgent(taskRecommendations.recommended_specialist)}
                >
                  → Visit {SPECIALISTS[taskRecommendations.recommended_specialist]?.name}
                </button>
              )}
            </div>
          )}

          {/* Task List by Priority */}
          <div className="todo-list">
            {/* High Priority */}
            {smartTasks.filter(t => t.priority === 'high' && t.status !== 'completed').length > 0 && (
              <div className="priority-group">
                <div className="priority-label urgent">🔥 URGENT</div>
                {smartTasks.filter(t => t.priority === 'high' && t.status !== 'completed').map(task => (
                  <div key={task.id} className="todo-item urgent" onClick={() => goToRecommendedAgent(task.recommendedAgent)}>
                    <button
                      className="todo-check"
                      onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                    >○</button>
                    <div className="todo-content">
                      <div className="todo-name">{task.title}</div>
                      <div className="todo-meta">
                        <span className="dept-tag" style={{ background: ROOMS.find(r => r.id === task.department)?.color || '#4a4a6a' }}>
                          {task.department}
                        </span>
                        <span className="time-tag">⏱ {task.recommendedFocusTime || task.estimatedMinutes}m</span>
                        {task.recommendedAgent && (
                          <span className="agent-tag">💡 {SPECIALISTS[task.recommendedAgent]?.name}</span>
                        )}
                      </div>
                    </div>
                    <button className="todo-delete" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Medium Priority */}
            {smartTasks.filter(t => t.priority === 'medium' && t.status !== 'completed').length > 0 && (
              <div className="priority-group">
                <div className="priority-label medium">📋 TODAY</div>
                {smartTasks.filter(t => t.priority === 'medium' && t.status !== 'completed').map(task => (
                  <div key={task.id} className="todo-item medium" onClick={() => goToRecommendedAgent(task.recommendedAgent)}>
                    <button
                      className="todo-check"
                      onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                    >○</button>
                    <div className="todo-content">
                      <div className="todo-name">{task.title}</div>
                      <div className="todo-meta">
                        <span className="dept-tag" style={{ background: ROOMS.find(r => r.id === task.department)?.color || '#4a4a6a' }}>
                          {task.department}
                        </span>
                        <span className="time-tag">⏱ {task.recommendedFocusTime || task.estimatedMinutes}m</span>
                      </div>
                    </div>
                    <button className="todo-delete" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Low Priority */}
            {smartTasks.filter(t => t.priority === 'low' && t.status !== 'completed').length > 0 && (
              <div className="priority-group">
                <div className="priority-label low">📚 LATER</div>
                {smartTasks.filter(t => t.priority === 'low' && t.status !== 'completed').map(task => (
                  <div key={task.id} className="todo-item low" onClick={() => goToRecommendedAgent(task.recommendedAgent)}>
                    <button
                      className="todo-check"
                      onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                    >○</button>
                    <div className="todo-content">
                      <div className="todo-name">{task.title}</div>
                      <div className="todo-meta">
                        <span className="dept-tag" style={{ background: ROOMS.find(r => r.id === task.department)?.color || '#4a4a6a' }}>
                          {task.department}
                        </span>
                        <span className="time-tag">⏱ {task.recommendedFocusTime || task.estimatedMinutes}m</span>
                      </div>
                    </div>
                    <button className="todo-delete" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {smartTasks.filter(t => t.status !== 'completed').length === 0 && (
              <div className="todo-empty">
                <span>🎉</span>
                <p>All caught up!</p>
                <small>Add a task above or ask AI for suggestions</small>
              </div>
            )}
          </div>

          {/* Completed Section */}
          {smartTasks.filter(t => t.status === 'completed').length > 0 && (
            <details className="todo-completed">
              <summary>✅ Completed ({smartTasks.filter(t => t.status === 'completed').length})</summary>
              <div className="completed-list">
                {smartTasks.filter(t => t.status === 'completed').map(task => (
                  <div key={task.id} className="todo-item done">
                    <span className="done-check">✓</span>
                    <span className="done-name">{task.title}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Teacher Integration Button */}
          {playerRole === 'teacher' && (
            <button
              className="teacher-assign-btn"
              onClick={() => setActiveMode('dashboard')}
            >
              📊 Assign to Students
            </button>
          )}
        </div>
      )}

      {/* Toggle To-Do Panel Button */}
      {!showTaskPanel && (
        <button
          className="toggle-todo-btn"
          onClick={() => setShowTaskPanel(true)}
        >
          📝
        </button>
      )}

      {/* Controls Hint */}
      <div className="controls-overlay">
        <span>WASD to move</span>
        <span>E to interact</span>
        <span>Click specialists</span>
        {playerRole === 'teacher' && <span>T for Dashboard</span>}
      </div>

      <style jsx>{`
        .game-container {
          width: 100vw;
          height: 100vh;
          background: #0a0a1a;
          overflow: hidden;
          font-family: 'Press Start 2P', monospace;
          color: #fff;
        }

        .top-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 70px;
          background: linear-gradient(180deg, rgba(20,20,40,0.95) 0%, rgba(10,10,30,0.9) 100%);
          border-bottom: 3px solid #4a4a6a;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          z-index: 100;
        }

        .player-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .player-name { font-size: 12px; }
        .player-room { font-size: 8px; color: #888; }

        .progress-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .xp-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .level {
          background: linear-gradient(135deg, #f0ad4e, #ec971f);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 10px;
          color: #000;
        }

        .xp-bar {
          width: 150px;
          height: 16px;
          background: #1a1a2e;
          border: 3px solid #4a90d9;
          border-radius: 8px;
          overflow: hidden;
        }

        .xp-fill {
          height: 100%;
          background: linear-gradient(90deg, #4a90d9, #e94560);
          transition: width 0.3s;
        }

        .xp-text { font-size: 10px; color: #4a90d9; }

        .mastery-mini {
          display: flex;
          gap: 15px;
          font-size: 8px;
          color: #888;
        }

        .online-players {
          display: flex;
          align-items: center;
          gap: 15px;
          font-size: 10px;
          color: #5cb85c;
        }

        .dashboard-btn {
          padding: 8px 12px;
          background: #9b59b6;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 8px;
          cursor: pointer;
        }

        .world-viewport {
          position: fixed;
          top: 70px;
          left: 0;
          width: 100%;
          height: calc(100% - 70px);
          overflow: hidden;
        }

        .world {
          position: absolute;
          width: ${WORLD_WIDTH}px;
          height: ${WORLD_HEIGHT}px;
          transition: transform 0.1s linear;
        }

        .floor {
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, #1a1a2e 0px, #1a1a2e 39px, #151525 39px, #151525 40px),
            repeating-linear-gradient(0deg, #1a1a2e 0px, #1a1a2e 39px, #151525 39px, #151525 40px);
          background-size: 40px 40px;
        }

        .room {
          position: absolute;
          border: 4px solid;
          border-radius: 8px;
          background: rgba(15, 15, 35, 0.9);
          transition: box-shadow 0.3s;
        }

        .room.active { box-shadow: 0 0 30px currentColor; }

        .room-label {
          position: absolute;
          top: -12px;
          left: 10px;
          padding: 4px 12px;
          font-size: 9px;
          border-radius: 4px;
        }

        .room-floor {
          position: absolute;
          inset: 0;
          border-radius: 4px;
        }

        .specialist {
          position: absolute;
          transform: translate(-50%, -50%);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: transform 0.2s;
          z-index: 10;
        }

        .specialist:hover { transform: translate(-50%, -50%) scale(1.1); }
        .specialist.selected { transform: translate(-50%, -50%) scale(1.15); }

        .specialist-sprite {
          font-size: 36px;
          filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5));
        }

        .specialist-name {
          margin-top: 4px;
          font-size: 7px;
          background: rgba(0,0,0,0.8);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .interact-hint {
          position: absolute;
          top: -20px;
          background: #4a90d9;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 8px;
          animation: bounce 0.5s ease-in-out infinite;
        }

        .local-player, .other-player {
          position: absolute;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 20;
        }

        .player-avatar {
          width: ${PLAYER_SIZE}px;
          height: ${PLAYER_SIZE}px;
          border-radius: 50%;
          border: 3px solid #fff;
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }

        .player-label {
          margin-top: 4px;
          font-size: 7px;
          background: rgba(0,0,0,0.8);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .interaction-panel {
          position: fixed;
          right: 20px;
          top: 90px;
          bottom: 20px;
          width: 380px;
          background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
          border: 4px solid;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 200;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          font-size: 11px;
        }

        .panel-header button {
          background: none;
          border: none;
          color: #fff;
          font-size: 20px;
          cursor: pointer;
        }

        .mode-tabs {
          display: flex;
          border-bottom: 2px solid #3a3a5a;
        }

        .mode-tabs button {
          flex: 1;
          padding: 10px 5px;
          background: transparent;
          border: none;
          color: #888;
          font-family: inherit;
          font-size: 8px;
          cursor: pointer;
        }

        .mode-tabs button:hover { background: rgba(255,255,255,0.1); }
        .mode-tabs button.active {
          background: rgba(74, 144, 217, 0.2);
          color: #4a90d9;
          border-bottom: 2px solid #4a90d9;
        }
        .mode-tabs button:disabled { opacity: 0.5; cursor: not-allowed; }

        .chat-content, .problem-content, .canvas-content, .flashcard-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 10px;
          line-height: 1.6;
          font-family: Arial, sans-serif;
        }

        .message.user {
          align-self: flex-end;
          background: #4a90d9;
        }

        .message.assistant {
          align-self: flex-start;
          background: #2a2a4a;
          border: 1px solid #4a4a6a;
        }

        .message.hint {
          align-self: flex-start;
          background: rgba(240, 173, 78, 0.2);
          border: 1px solid #f0ad4e;
        }

        .message.system {
          align-self: center;
          background: transparent;
          color: #888;
          font-size: 9px;
          font-style: italic;
        }

        .message.correct { border-left: 3px solid #5cb85c; }
        .message.incorrect { border-left: 3px solid #e94560; }

        .specialist-tag, .hint-tag {
          font-size: 16px;
          margin-right: 8px;
        }

        .typing {
          display: flex;
          gap: 4px;
        }

        .typing span {
          width: 8px;
          height: 8px;
          background: #888;
          border-radius: 50%;
          animation: bounce 0.6s ease-in-out infinite;
        }

        .typing span:nth-child(2) { animation-delay: 0.15s; }
        .typing span:nth-child(3) { animation-delay: 0.3s; }

        .chat-input {
          display: flex;
          gap: 10px;
          padding: 12px;
          border-top: 2px solid #3a3a5a;
        }

        .chat-input textarea, .answer-section textarea {
          flex: 1;
          background: #0a0a1a;
          border: 2px solid #3a3a5a;
          border-radius: 8px;
          color: #fff;
          padding: 10px;
          font-family: Arial, sans-serif;
          font-size: 11px;
          resize: none;
          height: 50px;
        }

        .chat-input textarea:focus, .answer-section textarea:focus {
          outline: none;
          border-color: #4a90d9;
        }

        .chat-input button, .problem-actions button {
          padding: 10px 15px;
          background: #4a90d9;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          font-size: 9px;
          cursor: pointer;
        }

        .chat-input button:disabled, .problem-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .problem-content {
          padding: 15px;
          gap: 15px;
        }

        .problem-header {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
        }

        .difficulty {
          padding: 4px 10px;
          background: #f0ad4e;
          color: #000;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .hints-left { color: #f0ad4e; }

        .problem-question {
          background: rgba(0,0,0,0.3);
          padding: 15px;
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.6;
          font-family: Arial, sans-serif;
        }

        .feedback {
          padding: 12px;
          border-radius: 8px;
          font-size: 10px;
          font-family: Arial, sans-serif;
        }

        .feedback.correct {
          background: rgba(92, 184, 92, 0.2);
          border: 1px solid #5cb85c;
        }

        .feedback.incorrect {
          background: rgba(233, 69, 96, 0.2);
          border: 1px solid #e94560;
        }

        .answer-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .problem-actions {
          display: flex;
          gap: 10px;
        }

        .problem-actions button:first-child {
          background: #f0ad4e;
        }

        .problem-actions button:last-child {
          background: #5cb85c;
        }

        .canvas-content {
          padding: 15px;
          align-items: center;
        }

        .canvas-content canvas {
          background: #1a1a2e;
          border: 2px solid #3a3a5a;
          border-radius: 8px;
          cursor: crosshair;
          touch-action: none;
        }

        .canvas-tools {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .canvas-tools button {
          padding: 10px 20px;
          background: #4a90d9;
          border: none;
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 9px;
          cursor: pointer;
        }

        .canvas-tools button:first-child { background: #e94560; }

        .canvas-hint {
          font-size: 8px;
          color: #888;
          margin-top: 10px;
        }

        .flashcard-content {
          padding: 20px;
          gap: 15px;
          align-items: center;
        }

        .flashcard-progress {
          font-size: 9px;
          color: #888;
        }

        .flashcard {
          width: 100%;
          height: 200px;
          perspective: 1000px;
          cursor: pointer;
        }

        .flashcard-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s;
          transform-style: preserve-3d;
        }

        .flashcard.flipped .flashcard-inner {
          transform: rotateY(180deg);
        }

        .flashcard-front, .flashcard-back {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: #2a2a4a;
          border: 2px solid #4a4a6a;
          border-radius: 12px;
          font-size: 12px;
          line-height: 1.6;
          text-align: center;
          font-family: Arial, sans-serif;
        }

        .flashcard-back {
          transform: rotateY(180deg);
          background: #1a3a2a;
          border-color: #5cb85c;
        }

        .flashcard-rating {
          text-align: center;
          width: 100%;
        }

        .flashcard-rating > span {
          font-size: 9px;
          color: #888;
        }

        .rating-buttons {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .rating-buttons button {
          padding: 8px 10px;
          background: #2a2a4a;
          border: 2px solid #4a4a6a;
          border-radius: 6px;
          color: #fff;
          font-size: 8px;
          cursor: pointer;
        }

        .rating-buttons button:hover { border-color: #5cb85c; }

        .focus-panel {
          position: fixed;
          right: 20px;
          top: 90px;
          width: 300px;
          background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
          border: 4px solid #9b59b6;
          border-radius: 12px;
          padding: 20px;
          z-index: 200;
        }

        .focus-panel h3 {
          font-size: 14px;
          margin-bottom: 20px;
          text-align: center;
        }

        .focus-setup p {
          font-size: 9px;
          color: #888;
          margin-bottom: 10px;
          text-align: center;
        }

        .goal-selector {
          display: flex;
          gap: 8px;
          justify-content: center;
          margin-bottom: 15px;
        }

        .goal-selector button {
          padding: 10px 15px;
          background: #2a2a4a;
          border: 2px solid #4a4a6a;
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 9px;
          cursor: pointer;
        }

        .goal-selector button.selected {
          border-color: #9b59b6;
          background: rgba(155, 89, 182, 0.2);
        }

        .start-focus {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #9b59b6, #8b49a6);
          border: none;
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
        }

        .camera-note { font-size: 8px; color: #666; margin-top: 10px; }

        .focus-active { text-align: center; }

        .focus-timer {
          font-size: 36px;
          color: #5cb85c;
          margin-bottom: 10px;
        }

        .focus-goal {
          font-size: 9px;
          color: #888;
          margin-bottom: 15px;
        }

        .camera-preview video {
          width: 100%;
          border-radius: 8px;
          margin-bottom: 15px;
        }

        .distraction-meter { margin-bottom: 15px; }
        .distraction-meter span { font-size: 8px; color: #888; }

        .meter-bar {
          height: 12px;
          background: #1a1a2e;
          border: 2px solid #3a3a5a;
          border-radius: 6px;
          overflow: hidden;
          margin-top: 5px;
        }

        .meter-fill {
          height: 100%;
          transition: width 0.3s, background 0.3s;
        }

        .distraction-warning {
          background: rgba(233, 69, 96, 0.2);
          border: 2px solid #e94560;
          border-radius: 8px;
          padding: 10px;
          font-size: 9px;
          color: #e94560;
          margin-bottom: 15px;
        }

        .end-focus {
          width: 100%;
          padding: 12px;
          background: #e94560;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
        }

        .notification {
          position: fixed;
          top: 90px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%);
          color: #fff;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 10px;
          z-index: 300;
          animation: slideDown 0.3s ease;
        }

        .controls-overlay {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 20px;
          background: rgba(0,0,0,0.8);
          padding: 10px 20px;
          border-radius: 20px;
          font-size: 8px;
          color: #888;
        }

        /* Smart To-Do Panel - Left Side - Pixel Art Style */
        .todo-panel {
          position: fixed;
          left: 20px;
          top: 90px;
          width: 280px;
          max-height: calc(100vh - 110px);
          background: linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%);
          border: 4px solid #f0ad4e;
          border-radius: 12px;
          padding: 0;
          z-index: 200;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: 'Press Start 2P', monospace;
        }

        .todo-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 15px;
          background: linear-gradient(135deg, #f0ad4e 0%, #ec971f 100%);
          border-bottom: 4px solid #c9880f;
        }

        .todo-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .todo-icon {
          font-size: 16px;
        }

        .todo-header h3 {
          margin: 0;
          font-size: 10px;
          color: #000;
          letter-spacing: 1px;
        }

        .todo-close {
          background: rgba(0,0,0,0.2);
          border: 2px solid #000;
          border-radius: 4px;
          width: 24px;
          height: 24px;
          color: #000;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .todo-close:hover {
          background: rgba(0,0,0,0.4);
        }

        .todo-stats {
          display: flex;
          justify-content: space-around;
          padding: 10px;
          background: rgba(0,0,0,0.3);
          border-bottom: 2px solid #3a3a5a;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .stat-num {
          font-size: 14px;
          color: #f0ad4e;
        }

        .stat-label {
          font-size: 6px;
          color: #888;
          text-transform: uppercase;
        }

        .todo-input-wrap {
          display: flex;
          gap: 6px;
          padding: 10px 12px;
          background: rgba(0,0,0,0.2);
          border-bottom: 2px solid #3a3a5a;
        }

        .todo-input {
          flex: 1;
          background: #0a0a1a;
          border: 2px solid #4a4a6a;
          border-radius: 6px;
          padding: 10px;
          color: #fff;
          font-family: inherit;
          font-size: 7px;
        }

        .todo-input::placeholder {
          color: #555;
        }

        .todo-input:focus {
          outline: none;
          border-color: #f0ad4e;
        }

        .todo-add-btn {
          background: linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%);
          border: 2px solid #3d8b3d;
          border-radius: 6px;
          width: 40px;
          color: #fff;
          font-size: 12px;
          cursor: pointer;
        }

        .todo-add-btn:hover {
          background: linear-gradient(135deg, #6dc86d 0%, #5cb85c 100%);
        }

        .todo-actions {
          display: flex;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 2px solid #3a3a5a;
        }

        .ai-btn, .focus-btn {
          flex: 1;
          padding: 8px;
          border-radius: 6px;
          font-family: inherit;
          font-size: 6px;
          cursor: pointer;
          border: 2px solid;
        }

        .ai-btn {
          background: linear-gradient(135deg, #9b59b6 0%, #8b49a6 100%);
          border-color: #6c3483;
          color: #fff;
        }

        .focus-btn {
          background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
          border-color: #2a5f8f;
          color: #fff;
        }

        .ai-btn:hover, .focus-btn:hover {
          filter: brightness(1.1);
        }

        .ai-rec-box {
          margin: 8px 12px;
          padding: 10px;
          background: rgba(155, 89, 182, 0.15);
          border: 2px solid #9b59b6;
          border-radius: 8px;
        }

        .ai-rec-header {
          font-size: 7px;
          color: #9b59b6;
          margin-bottom: 6px;
        }

        .ai-rec-text {
          font-size: 6px;
          color: #ccc;
          margin: 0 0 8px 0;
          line-height: 1.6;
        }

        .go-specialist-btn {
          width: 100%;
          padding: 8px;
          background: linear-gradient(135deg, #5cb85c 0%, #4cae4c 100%);
          border: 2px solid #3d8b3d;
          border-radius: 4px;
          color: #fff;
          font-family: inherit;
          font-size: 6px;
          cursor: pointer;
        }

        .todo-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 12px;
        }

        .priority-group {
          margin-bottom: 12px;
        }

        .priority-label {
          font-size: 7px;
          padding: 4px 8px;
          border-radius: 4px;
          margin-bottom: 6px;
          display: inline-block;
        }

        .priority-label.urgent {
          background: rgba(233, 69, 96, 0.3);
          color: #e94560;
          border: 1px solid #e94560;
        }

        .priority-label.medium {
          background: rgba(240, 173, 78, 0.3);
          color: #f0ad4e;
          border: 1px solid #f0ad4e;
        }

        .priority-label.low {
          background: rgba(92, 184, 92, 0.3);
          color: #5cb85c;
          border: 1px solid #5cb85c;
        }

        .todo-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px;
          background: rgba(255,255,255,0.03);
          border: 2px solid #3a3a5a;
          border-radius: 6px;
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .todo-item:hover {
          background: rgba(255,255,255,0.08);
          border-color: #5a5a7a;
        }

        .todo-item.urgent {
          border-left: 4px solid #e94560;
        }

        .todo-item.medium {
          border-left: 4px solid #f0ad4e;
        }

        .todo-item.low {
          border-left: 4px solid #5cb85c;
        }

        .todo-check {
          background: transparent;
          border: 2px solid #4a4a6a;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          color: #888;
          font-size: 10px;
          cursor: pointer;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .todo-check:hover {
          border-color: #5cb85c;
          color: #5cb85c;
        }

        .todo-content {
          flex: 1;
          min-width: 0;
        }

        .todo-name {
          font-size: 7px;
          color: #fff;
          margin-bottom: 4px;
          word-wrap: break-word;
        }

        .todo-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .dept-tag, .time-tag, .agent-tag {
          font-size: 5px;
          padding: 2px 4px;
          border-radius: 3px;
        }

        .dept-tag {
          color: #fff;
        }

        .time-tag {
          background: rgba(255,255,255,0.1);
          color: #888;
        }

        .agent-tag {
          background: rgba(155, 89, 182, 0.3);
          color: #9b59b6;
        }

        .todo-delete {
          background: transparent;
          border: none;
          color: #666;
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          width: 18px;
          height: 18px;
        }

        .todo-delete:hover {
          color: #e94560;
        }

        .todo-empty {
          text-align: center;
          padding: 20px;
          color: #888;
        }

        .todo-empty span {
          font-size: 24px;
          display: block;
          margin-bottom: 8px;
        }

        .todo-empty p {
          font-size: 8px;
          margin: 0 0 4px 0;
          color: #5cb85c;
        }

        .todo-empty small {
          font-size: 6px;
          color: #666;
        }

        .todo-completed {
          margin: 8px 12px 12px;
          padding: 8px;
          background: rgba(0,0,0,0.3);
          border-radius: 6px;
          border: 2px solid #3a3a5a;
        }

        .todo-completed summary {
          font-size: 7px;
          color: #5cb85c;
          cursor: pointer;
        }

        .completed-list {
          margin-top: 8px;
        }

        .todo-item.done {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          opacity: 0.6;
          border: none;
          background: none;
        }

        .done-check {
          color: #5cb85c;
          font-size: 10px;
        }

        .done-name {
          font-size: 6px;
          color: #888;
          text-decoration: line-through;
        }

        .teacher-assign-btn {
          margin: 8px 12px 12px;
          padding: 10px;
          background: linear-gradient(135deg, #e94560 0%, #d93550 100%);
          border: 2px solid #b92840;
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 7px;
          cursor: pointer;
        }

        .teacher-assign-btn:hover {
          filter: brightness(1.1);
        }

        .toggle-todo-btn {
          position: fixed;
          left: 20px;
          top: 90px;
          background: linear-gradient(135deg, #f0ad4e 0%, #ec971f 100%);
          border: 4px solid #c9880f;
          border-radius: 8px;
          width: 44px;
          height: 44px;
          color: #000;
          font-size: 18px;
          cursor: pointer;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toggle-todo-btn:hover {
          filter: brightness(1.1);
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        .chat-widget.video-widget {
          margin-top: 10px;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #9b59b6;
          background: #000;
        }

        .video-widget video {
          width: 100%;
          display: block;
        }

        /* Focus Room Enhancements */
        .consult-coach {
          width: 100%;
          padding: 12px;
          background: #9b59b6;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          font-size: 10px;
          cursor: pointer;
          margin-bottom: 15px;
        }
        
        .consult-coach:hover { background: #8e44ad; }

        .decision-logs-preview {
          margin-bottom: 15px;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          padding: 10px;
          border: 1px solid #3a3a5a;
        }

        .decision-logs-preview h4 {
          font-size: 10px;
          color: #888;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .logs-scroll {
          max-height: 120px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .log-entry {
          background: rgba(255,255,255,0.05);
          padding: 8px;
          border-radius: 6px;
          font-size: 9px;
          border-left: 2px solid #9b59b6;
        }

        .log-header {
           display: flex;
           justify-content: space-between;
           margin-bottom: 4px;
           align-items: center;
        }

        .log-time { color: #666; font-size: 8px; }
        .log-badge { 
           background: #9b59b6; 
           color: #fff; 
           padding: 1px 4px; 
           border-radius: 3px; 
           font-size: 7px;
           text-transform: uppercase;
        }

        .log-reason { color: #ddd; margin-bottom: 4px; line-height: 1.3; }
        .log-evidence { color: #f0ad4e; font-size: 8px; font-style: italic; }

        /* OpenNote Correlation Panel */
        .opennote-panel {
          margin-top: 15px;
          background: linear-gradient(135deg, rgba(74, 144, 217, 0.1) 0%, rgba(92, 184, 92, 0.1) 100%);
          border: 2px solid #4a90d9;
          border-radius: 8px;
          padding: 12px;
        }

        .opennote-panel h4 {
          font-size: 10px;
          color: #4a90d9;
          margin: 0 0 6px 0;
        }

        .insights-box {
          background: rgba(0,0,0,0.3);
          border-radius: 6px;
          padding: 8px;
          margin-bottom: 10px;
        }

        .insight-item {
          font-size: 8px;
          color: #ccc;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .insight-item:last-child {
          border-bottom: none;
        }

        .correlations-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 10px;
        }

        .correlation-item {
          background: rgba(255,255,255,0.05);
          border-radius: 6px;
          padding: 8px;
          border-left: 3px solid #666;
        }

        .correlation-item.motivated { border-left-color: #e94560; }
        .correlation-item.engaged { border-left-color: #5cb85c; }
        .correlation-item.confused { border-left-color: #f0ad4e; }
        .correlation-item.distracted { border-left-color: #e94560; }
        .correlation-item.bored { border-left-color: #9b59b6; }

        .corr-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .reaction-badge {
          font-size: 8px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255,255,255,0.1);
        }

        .reaction-badge.motivated { background: rgba(233, 69, 96, 0.3); color: #e94560; }
        .reaction-badge.engaged { background: rgba(92, 184, 92, 0.3); color: #5cb85c; }
        .reaction-badge.confused { background: rgba(240, 173, 78, 0.3); color: #f0ad4e; }
        .reaction-badge.distracted { background: rgba(233, 69, 96, 0.3); color: #e94560; }

        .corr-score {
          font-size: 10px;
          color: #5cb85c;
          font-weight: bold;
        }

        .corr-reasoning {
          font-size: 7px;
          color: #888;
          margin-bottom: 4px;
        }

        .corr-adaptation {
          font-size: 8px;
          color: #9b59b6;
          font-style: italic;
        }

        .no-correlations {
          font-size: 8px;
          color: #666;
          text-align: center;
          padding: 10px;
        }

        .current-focus-task {
          background: rgba(240, 173, 78, 0.1);
          border: 1px solid #f0ad4e;
          border-radius: 6px;
          padding: 8px;
          margin: 10px 0;
        }

        .focus-task-label {
          font-size: 7px;
          color: #f0ad4e;
          text-transform: uppercase;
        }

        .focus-task-name {
          font-size: 9px;
          color: #fff;
          margin: 4px 0;
        }

        .focus-task-agent {
          font-size: 8px;
          color: #9b59b6;
        }

        .refresh-insights-btn {
          width: 100%;
          padding: 8px;
          background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
          border: 2px solid #2a5f8f;
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 8px;
          cursor: pointer;
          margin-top: 8px;
        }

        .refresh-insights-btn:hover {
          filter: brightness(1.1);
        }
      `}</style>
      <FocusTracker
        userId={userId}
        isActive={currentRoom?.id === 'focus'}
        onDistraction={async (type, msg) => {
          setDistractionWarning(msg);
          setTimeout(() => setDistractionWarning(''), 5000);

          // Auto-generate video to re-engage distracted student
          // Only trigger if:
          // 1. We have context from a recent response (within last 2 minutes)
          // 2. We're not already generating a video
          // 3. The type indicates real distraction (not just brief glances)
          const contextAge = lastContext ? (Date.now() - lastContext.timestamp) / 1000 : Infinity;
          const recentEnough = contextAge < 120; // Within 2 minutes

          // Debug logging to diagnose distraction-to-video pipeline
          console.log('👁️ Distraction detected:', {
            type,
            msg,
            hasLastContext: !!lastContext,
            lastContextTopic: lastContext?.topic,
            contextAgeSeconds: contextAge,
            recentEnough,
            isAutoGeneratingVideo
          });

          if (lastContext && recentEnough && !isAutoGeneratingVideo) {
            // Note: removed type !== 'brief_glance' check since backend never returns that type
            setIsAutoGeneratingVideo(true);

            try {
              console.log('🎬 Auto-generating video for distracted student:', lastContext.topic);

              const response = await fetch('http://localhost:8000/api/focus/behavior-trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  session_id: null,
                  behavior: 'distracted',
                  last_topic: lastContext.topic,
                  last_response: lastContext.response.slice(0, 500), // Truncate for API
                  trigger_source: 'focus_tracker'
                })
              });

              const data = await response.json();

              if (data.success && data.visual_generated) {
                // Add system message with the auto-generated video
                const videoMessage: ChatMessage = {
                  id: `auto-video-${Date.now()}`,
                  role: 'system',
                  content: data.message || `👋 I noticed you got distracted! Here's a video to help you stay engaged with ${lastContext.topic}.`,
                  timestamp: new Date(),
                  visual: data.visual_generated
                };

                setChatMessages(prev => [...prev, videoMessage]);

                // Poll for video URL if it's processing
                if (data.visual_generated.type === 'video' && data.visual_generated.id) {
                  const pollVideoUrl = async () => {
                    try {
                      const statusRes = await fetch(`http://localhost:8000/api/opennote/video/status/${data.visual_generated.id}`);
                      const statusData = await statusRes.json();

                      if (statusData.status === 'completed' && statusData.response?.s3_url) {
                        setChatMessages(prev => prev.map(msg =>
                          msg.id === videoMessage.id
                            ? { ...msg, visual: { ...msg.visual, status: 'ready', videoUrl: statusData.response.s3_url } }
                            : msg
                        ));
                      } else if (statusData.status === 'pending') {
                        setTimeout(pollVideoUrl, 5000);
                      }
                    } catch (e) {
                      console.error('Failed to poll video status:', e);
                    }
                  };
                  setTimeout(pollVideoUrl, 3000);
                }

                // Clear the context so we don't re-trigger on same answer
                setLastContext(null);
              }
            } catch (error) {
              console.error('Failed to auto-generate video:', error);
            } finally {
              // Cooldown to prevent rapid re-triggers
              setTimeout(() => setIsAutoGeneratingVideo(false), 30000);
            }
          }
        }}
      />


    </div>
  );
}
