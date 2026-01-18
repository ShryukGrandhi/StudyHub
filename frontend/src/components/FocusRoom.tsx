/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * FOCUS ROOM - THE PRODUCTIVITY HACK COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * This is the KEY component for the OpenNote hackathon track:
 *
 * PRODUCTIVITY FEATURES:
 * 1. Pick Up Where You Left Off - Auto-loads previous session context on start
 * 2. Zero Context-Switching - Confusion triggers auto-video generation in-place
 * 3. Zero-Friction Review - Auto-generates flashcards & practice on session end
 *
 * Uses OpenNote APIs:
 * - Journals API for session memory (long-term context)
 * - Video API for confusion intervention
 * - Flashcards API for auto-review
 * - Practice API for auto-practice problems
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FocusTracker } from './FocusTracker';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface FocusRoomProps {
    userId: string;
    initialTopic?: string;
    onSessionEnd?: (results: SessionEndResults) => void;
}

interface SessionState {
    sessionId: string | null;
    topic: string;
    status: 'idle' | 'starting' | 'active' | 'ending' | 'completed';
    previousContext: PreviousContext | null;
    continuationPoint: string | null;
    interactions: Interaction[];
    conceptsCovered: string[];
}

interface PreviousContext {
    journalId: string;
    lastConcept: string;
    lastSessionDate: string;
    summary: string | null;
}

interface Interaction {
    id: string;
    timestamp: string;
    question: string;
    response: string;
    confidence: number;
}

interface SessionEndResults {
    sessionId: string;
    durationMinutes: number;
    interactionsCount: number;
    conceptsCovered: string[];
    journalId: string | null;
    flashcardSetId: string | null;
    practiceSetId: string | null;
    message: string;
}

interface VideoGeneration {
    videoId: string;
    status: 'processing' | 'ready' | 'error';
    topic: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const FocusRoom: React.FC<FocusRoomProps> = ({
    userId,
    initialTopic = '',
    onSessionEnd
}) => {
    // Session state
    const [session, setSession] = useState<SessionState>({
        sessionId: null,
        topic: initialTopic,
        status: 'idle',
        previousContext: null,
        continuationPoint: null,
        interactions: [],
        conceptsCovered: []
    });

    // UI state
    const [topicInput, setTopicInput] = useState(initialTopic);
    const [questionInput, setQuestionInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingVideo, setPendingVideo] = useState<VideoGeneration | null>(null);
    const [endResults, setEndResults] = useState<SessionEndResults | null>(null);
    const [showFocusTracker, setShowFocusTracker] = useState(true);

    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session.interactions]);

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    const startSession = useCallback(async () => {
        if (!topicInput.trim()) {
            setError('Please enter a topic to study');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSession(prev => ({ ...prev, status: 'starting' }));

        try {
            const response = await fetch('/api/focus/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    topic: topicInput.trim()
                })
            });

            const data = await response.json();

            if (data.success) {
                setSession({
                    sessionId: data.session_id,
                    topic: data.topic,
                    status: 'active',
                    previousContext: data.previous_context,
                    continuationPoint: data.continuation_point,
                    interactions: [],
                    conceptsCovered: []
                });
            } else {
                setError(data.error || 'Failed to start session');
                setSession(prev => ({ ...prev, status: 'idle' }));
            }
        } catch (err) {
            setError('Network error - please try again');
            setSession(prev => ({ ...prev, status: 'idle' }));
        } finally {
            setIsLoading(false);
        }
    }, [userId, topicInput]);

    const endSession = useCallback(async () => {
        if (!session.sessionId) return;

        setIsLoading(true);
        setSession(prev => ({ ...prev, status: 'ending' }));

        try {
            const response = await fetch('/api/focus/session/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: session.sessionId,
                    generate_review: true
                })
            });

            const data = await response.json();

            if (data.success) {
                const results: SessionEndResults = {
                    sessionId: data.session_id,
                    durationMinutes: data.duration_minutes,
                    interactionsCount: data.interactions_count,
                    conceptsCovered: data.concepts_covered,
                    journalId: data.journal_id,
                    flashcardSetId: data.flashcard_set_id,
                    practiceSetId: data.practice_set_id,
                    message: data.message
                };
                setEndResults(results);
                setSession(prev => ({ ...prev, status: 'completed' }));
                onSessionEnd?.(results);
            } else {
                setError(data.error || 'Failed to end session');
            }
        } catch (err) {
            setError('Network error - please try again');
        } finally {
            setIsLoading(false);
        }
    }, [session.sessionId, onSessionEnd]);

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERACTION HANDLING
    // ═══════════════════════════════════════════════════════════════════════════

    const submitQuestion = useCallback(async () => {
        if (!questionInput.trim() || !session.sessionId) return;

        const question = questionInput.trim();
        setQuestionInput('');
        setIsLoading(true);

        // Add optimistic user message
        const tempId = `temp-${Date.now()}`;
        setSession(prev => ({
            ...prev,
            interactions: [...prev.interactions, {
                id: tempId,
                timestamp: new Date().toISOString(),
                question,
                response: '',
                confidence: 1.0
            }]
        }));

        try {
            // First, get AI response (using existing chat endpoint)
            const chatResponse = await fetch('/api/chat/adaptive-reprompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    input_text: question,
                    current_topic: session.topic,
                    specialist_id: 'study_hub'
                })
            });

            const chatData = await chatResponse.json();
            const aiResponse = chatData.response || chatData.message || 'I understand. Let me help you with that.';
            const confidence = chatData.confidence || 1.0;
            const concepts = chatData.concepts || [];

            // Record interaction in session
            await fetch('/api/focus/session/interaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: session.sessionId,
                    question,
                    response: aiResponse,
                    confidence,
                    concepts
                })
            });

            // Update UI with real response
            setSession(prev => ({
                ...prev,
                interactions: prev.interactions.map(i =>
                    i.id === tempId
                        ? { ...i, response: aiResponse, confidence }
                        : i
                ),
                conceptsCovered: [...new Set([...prev.conceptsCovered, ...concepts])]
            }));

            // Check for confusion (low confidence triggers video)
            if (confidence < 0.6) {
                handleConfusion('low_confidence', aiResponse, session.topic);
            }

        } catch (err) {
            setError('Failed to get response');
            // Remove optimistic message on error
            setSession(prev => ({
                ...prev,
                interactions: prev.interactions.filter(i => i.id !== tempId)
            }));
        } finally {
            setIsLoading(false);
        }
    }, [questionInput, session.sessionId, session.topic, userId]);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFUSION HANDLING - AUTO VIDEO GENERATION
    // ═══════════════════════════════════════════════════════════════════════════

    const handleConfusion = useCallback(async (trigger: string, context: string, topic: string) => {
        if (!session.sessionId) return;

        try {
            const response = await fetch('/api/focus/session/confusion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: session.sessionId,
                    trigger,
                    context,
                    current_topic: topic
                })
            });

            const data = await response.json();

            if (data.video_triggered && data.video_id) {
                setPendingVideo({
                    videoId: data.video_id,
                    status: 'processing',
                    topic
                });

                // Poll for video status
                pollVideoStatus(data.video_id);
            }
        } catch (err) {
            console.error('Failed to trigger confusion video:', err);
        }
    }, [session.sessionId]);

    const pollVideoStatus = useCallback(async (videoId: string) => {
        const checkStatus = async () => {
            try {
                const response = await fetch(`/api/opennote/video/status/${videoId}`);
                const data = await response.json();

                if (data.status === 'completed' || data.status === 'ready') {
                    setPendingVideo(prev => prev ? { ...prev, status: 'ready' } : null);
                } else if (data.status === 'error') {
                    setPendingVideo(prev => prev ? { ...prev, status: 'error' } : null);
                } else {
                    // Still processing, check again in 5 seconds
                    setTimeout(checkStatus, 5000);
                }
            } catch (err) {
                setPendingVideo(prev => prev ? { ...prev, status: 'error' } : null);
            }
        };

        checkStatus();
    }, []);

    // Manual confusion button
    const reportConfusion = useCallback(() => {
        const lastInteraction = session.interactions[session.interactions.length - 1];
        if (lastInteraction) {
            handleConfusion('explicit', lastInteraction.response, session.topic);
        }
    }, [session.interactions, session.topic, handleConfusion]);

    // ═══════════════════════════════════════════════════════════════════════════
    // FOCUS TRACKER INTEGRATION
    // ═══════════════════════════════════════════════════════════════════════════

    const handleDistraction = useCallback(async (type: string, message: string) => {
        if (!session.sessionId) return;

        // Log behavior to session
        await fetch('/api/focus/session/behavior', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: session.sessionId,
                behavior_type: 'distracted',
                data: { type, message }
            })
        });
    }, [session.sessionId]);

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    // IDLE STATE - Show topic input
    if (session.status === 'idle') {
        return (
            <div className="focus-room focus-room--idle">
                <div className="focus-room__header">
                    <h1>Focus Room</h1>
                    <p className="focus-room__subtitle">
                        Start a learning session. We'll remember where you left off.
                    </p>
                </div>

                <div className="focus-room__start">
                    <label htmlFor="topic">What would you like to study?</label>
                    <input
                        id="topic"
                        type="text"
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        placeholder="e.g., Linear Algebra, Organic Chemistry, JavaScript..."
                        onKeyDown={(e) => e.key === 'Enter' && startSession()}
                        disabled={isLoading}
                    />
                    <button
                        onClick={startSession}
                        disabled={isLoading || !topicInput.trim()}
                        className="btn btn--primary"
                    >
                        {isLoading ? 'Starting...' : 'Start Session'}
                    </button>
                </div>

                {error && <div className="focus-room__error">{error}</div>}

                <style jsx>{`
                    .focus-room--idle {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 60vh;
                        padding: 2rem;
                    }
                    .focus-room__header {
                        text-align: center;
                        margin-bottom: 2rem;
                    }
                    .focus-room__header h1 {
                        font-size: 2.5rem;
                        color: #9b59b6;
                        margin-bottom: 0.5rem;
                    }
                    .focus-room__subtitle {
                        color: #666;
                        font-size: 1.1rem;
                    }
                    .focus-room__start {
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                        width: 100%;
                        max-width: 400px;
                    }
                    .focus-room__start label {
                        font-weight: 600;
                    }
                    .focus-room__start input {
                        padding: 1rem;
                        border: 2px solid #ddd;
                        border-radius: 8px;
                        font-size: 1rem;
                        transition: border-color 0.2s;
                    }
                    .focus-room__start input:focus {
                        outline: none;
                        border-color: #9b59b6;
                    }
                    .btn--primary {
                        background: linear-gradient(135deg, #9b59b6, #8e44ad);
                        color: white;
                        padding: 1rem 2rem;
                        border: none;
                        border-radius: 8px;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: transform 0.2s, opacity 0.2s;
                    }
                    .btn--primary:hover:not(:disabled) {
                        transform: translateY(-2px);
                    }
                    .btn--primary:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }
                    .focus-room__error {
                        color: #e74c3c;
                        margin-top: 1rem;
                        padding: 0.5rem 1rem;
                        background: #fde8e8;
                        border-radius: 4px;
                    }
                `}</style>
            </div>
        );
    }

    // ACTIVE SESSION
    if (session.status === 'active' || session.status === 'starting' || session.status === 'ending') {
        return (
            <div className="focus-room focus-room--active">
                {/* Header with session info */}
                <div className="focus-room__session-header">
                    <div className="session-info">
                        <h2>Studying: {session.topic}</h2>
                        {session.previousContext && (
                            <div className="continuation-badge">
                                Continuing from: {session.continuationPoint}
                            </div>
                        )}
                    </div>
                    <div className="session-controls">
                        <button
                            onClick={() => setShowFocusTracker(!showFocusTracker)}
                            className="btn btn--secondary btn--small"
                        >
                            {showFocusTracker ? 'Hide' : 'Show'} Focus Tracker
                        </button>
                        <button
                            onClick={endSession}
                            disabled={isLoading}
                            className="btn btn--danger btn--small"
                        >
                            End Session
                        </button>
                    </div>
                </div>

                {/* Previous context banner */}
                {session.previousContext && (
                    <div className="focus-room__context-banner">
                        <span className="context-icon">🧠</span>
                        <div className="context-text">
                            <strong>Welcome back!</strong> Last session you covered "{session.continuationPoint}".
                            Ready to continue?
                        </div>
                    </div>
                )}

                {/* Chat interface */}
                <div className="focus-room__chat">
                    {session.interactions.length === 0 ? (
                        <div className="chat-empty">
                            <p>Ask a question to start learning!</p>
                            {session.previousContext && (
                                <p className="chat-suggestion">
                                    Suggestion: "Can you recap {session.continuationPoint}?"
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="chat-messages">
                            {session.interactions.map((interaction) => (
                                <div key={interaction.id} className="chat-exchange">
                                    <div className="message message--user">
                                        <div className="message-content">{interaction.question}</div>
                                    </div>
                                    {interaction.response && (
                                        <div className="message message--assistant">
                                            <div className="message-content">{interaction.response}</div>
                                            {interaction.confidence < 0.7 && (
                                                <div className="message-confidence low">
                                                    Confidence: {Math.round(interaction.confidence * 100)}%
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                    )}
                </div>

                {/* Video generation notification */}
                {pendingVideo && (
                    <div className={`video-notification video-notification--${pendingVideo.status}`}>
                        {pendingVideo.status === 'processing' && (
                            <>
                                <span className="spinner" />
                                Creating simplified video for "{pendingVideo.topic}"...
                            </>
                        )}
                        {pendingVideo.status === 'ready' && (
                            <>
                                Video ready! <a href="#">Watch now</a>
                            </>
                        )}
                        {pendingVideo.status === 'error' && (
                            <>Video generation failed. Try again later.</>
                        )}
                    </div>
                )}

                {/* Input area */}
                <div className="focus-room__input">
                    <input
                        type="text"
                        value={questionInput}
                        onChange={(e) => setQuestionInput(e.target.value)}
                        placeholder="Ask a question..."
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submitQuestion()}
                        disabled={isLoading}
                    />
                    <button
                        onClick={submitQuestion}
                        disabled={isLoading || !questionInput.trim()}
                        className="btn btn--primary"
                    >
                        {isLoading ? '...' : 'Ask'}
                    </button>
                    <button
                        onClick={reportConfusion}
                        className="btn btn--confusion"
                        title="Click if you're confused - we'll generate a video explanation!"
                    >
                        😕 I'm Confused
                    </button>
                </div>

                {/* Focus Tracker */}
                {showFocusTracker && (
                    <FocusTracker
                        userId={userId}
                        isActive={session.status === 'active'}
                        onDistraction={handleDistraction}
                    />
                )}

                {error && <div className="focus-room__error">{error}</div>}

                <style jsx>{`
                    .focus-room--active {
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        max-height: 100vh;
                    }
                    .focus-room__session-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 1rem;
                        background: linear-gradient(135deg, #9b59b6, #8e44ad);
                        color: white;
                    }
                    .session-info h2 {
                        margin: 0;
                        font-size: 1.25rem;
                    }
                    .continuation-badge {
                        font-size: 0.85rem;
                        opacity: 0.9;
                        margin-top: 0.25rem;
                    }
                    .session-controls {
                        display: flex;
                        gap: 0.5rem;
                    }
                    .btn--secondary {
                        background: rgba(255,255,255,0.2);
                        color: white;
                        border: 1px solid rgba(255,255,255,0.3);
                    }
                    .btn--danger {
                        background: #e74c3c;
                        color: white;
                        border: none;
                    }
                    .btn--small {
                        padding: 0.5rem 1rem;
                        font-size: 0.85rem;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .focus-room__context-banner {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                        padding: 1rem;
                        background: linear-gradient(90deg, #f8f4ff, #fff);
                        border-bottom: 1px solid #e0d4f0;
                    }
                    .context-icon {
                        font-size: 1.5rem;
                    }
                    .focus-room__chat {
                        flex: 1;
                        overflow-y: auto;
                        padding: 1rem;
                        background: #f5f5f5;
                    }
                    .chat-empty {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        color: #666;
                    }
                    .chat-suggestion {
                        font-style: italic;
                        color: #9b59b6;
                    }
                    .chat-messages {
                        display: flex;
                        flex-direction: column;
                        gap: 1rem;
                    }
                    .message {
                        max-width: 80%;
                        padding: 1rem;
                        border-radius: 12px;
                    }
                    .message--user {
                        align-self: flex-end;
                        background: #9b59b6;
                        color: white;
                    }
                    .message--assistant {
                        align-self: flex-start;
                        background: white;
                        border: 1px solid #ddd;
                    }
                    .message-confidence.low {
                        font-size: 0.75rem;
                        color: #e67e22;
                        margin-top: 0.5rem;
                    }
                    .video-notification {
                        padding: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                    }
                    .video-notification--processing {
                        background: #fff3cd;
                        color: #856404;
                    }
                    .video-notification--ready {
                        background: #d4edda;
                        color: #155724;
                    }
                    .video-notification--error {
                        background: #f8d7da;
                        color: #721c24;
                    }
                    .spinner {
                        width: 16px;
                        height: 16px;
                        border: 2px solid #856404;
                        border-top-color: transparent;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .focus-room__input {
                        display: flex;
                        gap: 0.5rem;
                        padding: 1rem;
                        background: white;
                        border-top: 1px solid #ddd;
                    }
                    .focus-room__input input {
                        flex: 1;
                        padding: 1rem;
                        border: 2px solid #ddd;
                        border-radius: 8px;
                        font-size: 1rem;
                    }
                    .focus-room__input input:focus {
                        outline: none;
                        border-color: #9b59b6;
                    }
                    .btn--primary {
                        background: linear-gradient(135deg, #9b59b6, #8e44ad);
                        color: white;
                        padding: 1rem 1.5rem;
                        border: none;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    .btn--confusion {
                        background: #f39c12;
                        color: white;
                        padding: 1rem;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    }
                    .focus-room__error {
                        color: #e74c3c;
                        padding: 0.5rem 1rem;
                        background: #fde8e8;
                    }
                `}</style>
            </div>
        );
    }

    // COMPLETED STATE - Show results
    if (session.status === 'completed' && endResults) {
        return (
            <div className="focus-room focus-room--completed">
                <div className="results-card">
                    <div className="results-icon">🎉</div>
                    <h2>Session Complete!</h2>
                    <p className="results-message">{endResults.message}</p>

                    <div className="results-stats">
                        <div className="stat">
                            <span className="stat-value">{endResults.durationMinutes}</span>
                            <span className="stat-label">Minutes</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{endResults.interactionsCount}</span>
                            <span className="stat-label">Questions</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{endResults.conceptsCovered.length}</span>
                            <span className="stat-label">Concepts</span>
                        </div>
                    </div>

                    <div className="auto-generated">
                        <h3>Auto-Generated for You:</h3>
                        <div className="generated-items">
                            {endResults.journalId && (
                                <div className="generated-item">
                                    📝 Session Journal saved to OpenNote
                                </div>
                            )}
                            {endResults.flashcardSetId && (
                                <div className="generated-item">
                                    🃏 5 Flashcards ready for review
                                </div>
                            )}
                            {endResults.practiceSetId && (
                                <div className="generated-item">
                                    ✏️ 3 Practice problems generated
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="results-actions">
                        <button
                            onClick={() => {
                                setSession({
                                    sessionId: null,
                                    topic: '',
                                    status: 'idle',
                                    previousContext: null,
                                    continuationPoint: null,
                                    interactions: [],
                                    conceptsCovered: []
                                });
                                setTopicInput('');
                                setEndResults(null);
                            }}
                            className="btn btn--primary"
                        >
                            Start New Session
                        </button>
                        <button
                            onClick={() => {
                                setTopicInput(session.topic);
                                setSession({
                                    sessionId: null,
                                    topic: '',
                                    status: 'idle',
                                    previousContext: null,
                                    continuationPoint: null,
                                    interactions: [],
                                    conceptsCovered: []
                                });
                                setEndResults(null);
                            }}
                            className="btn btn--secondary"
                        >
                            Continue {session.topic}
                        </button>
                    </div>
                </div>

                <style jsx>{`
                    .focus-room--completed {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 80vh;
                        padding: 2rem;
                    }
                    .results-card {
                        background: white;
                        border-radius: 16px;
                        padding: 2rem;
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                    }
                    .results-icon {
                        font-size: 4rem;
                        margin-bottom: 1rem;
                    }
                    .results-card h2 {
                        color: #9b59b6;
                        margin-bottom: 0.5rem;
                    }
                    .results-message {
                        color: #666;
                        margin-bottom: 1.5rem;
                    }
                    .results-stats {
                        display: flex;
                        justify-content: center;
                        gap: 2rem;
                        margin-bottom: 2rem;
                    }
                    .stat {
                        display: flex;
                        flex-direction: column;
                    }
                    .stat-value {
                        font-size: 2rem;
                        font-weight: bold;
                        color: #9b59b6;
                    }
                    .stat-label {
                        font-size: 0.85rem;
                        color: #666;
                    }
                    .auto-generated {
                        background: #f8f4ff;
                        padding: 1rem;
                        border-radius: 8px;
                        margin-bottom: 1.5rem;
                    }
                    .auto-generated h3 {
                        margin-bottom: 0.75rem;
                        color: #8e44ad;
                        font-size: 1rem;
                    }
                    .generated-items {
                        display: flex;
                        flex-direction: column;
                        gap: 0.5rem;
                    }
                    .generated-item {
                        padding: 0.5rem;
                        background: white;
                        border-radius: 4px;
                        font-size: 0.9rem;
                    }
                    .results-actions {
                        display: flex;
                        gap: 1rem;
                        justify-content: center;
                    }
                    .btn--primary {
                        background: linear-gradient(135deg, #9b59b6, #8e44ad);
                        color: white;
                        padding: 1rem 2rem;
                        border: none;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    .btn--secondary {
                        background: white;
                        color: #9b59b6;
                        padding: 1rem 2rem;
                        border: 2px solid #9b59b6;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                `}</style>
            </div>
        );
    }

    return null;
};

export default FocusRoom;
