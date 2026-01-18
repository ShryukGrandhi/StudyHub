import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Flashcard {
    front: string;
    back: string;
}

interface ChatFlashcardsProps {
    data: Record<string, string> | Flashcard[];
    topic: string;
}

export const ChatFlashcards: React.FC<ChatFlashcardsProps> = ({ data, topic }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    // Normalize data to array
    const cards: Flashcard[] = Array.isArray(data)
        ? data
        : Object.entries(data).map(([front, back]) => ({ front, back }));

    if (cards.length === 0) return null;

    const currentCard = cards[currentIndex];

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % cards.length);
        }, 200);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
        }, 200);
    };

    // Container styles
    const containerStyle: React.CSSProperties = {
        marginTop: '12px',
        background: 'rgba(30, 30, 40, 0.6)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '16px',
        width: '100%',
        maxWidth: '400px',
        overflow: 'hidden'
    };

    // Header styles
    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        color: '#e0e0e0',
        fontSize: '0.9rem'
    };

    // Card container (fixed size)
    const cardContainerStyle: React.CSSProperties = {
        width: '100%',
        height: '200px',
        cursor: 'pointer',
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden'
    };

    // Card face styles
    const cardFaceStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        boxSizing: 'border-box',
        overflow: 'auto'
    };

    // Front styles
    const frontStyle: React.CSSProperties = {
        ...cardFaceStyle,
        background: 'linear-gradient(135deg, #2c3e50, #34495e)',
        border: '1px solid rgba(255,255,255,0.1)'
    };

    // Back styles  
    const backStyle: React.CSSProperties = {
        ...cardFaceStyle,
        background: 'linear-gradient(135deg, #8e44ad, #9b59b6)'
    };

    // Controls container
    const controlsStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '16px'
    };

    // Button style
    const buttonStyle: React.CSSProperties = {
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#eee',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '0.85rem',
        cursor: 'pointer'
    };

    // Flip animation variants
    const flipVariants = {
        front: { rotateY: 0, opacity: 1 },
        back: { rotateY: 180, opacity: 1 }
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <span>🃏</span>
                <span style={{
                    fontWeight: 600,
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>Flashcards: {topic}</span>
                <span style={{
                    fontSize: '0.8rem',
                    opacity: 0.7,
                    background: 'rgba(255,255,255,0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                }}>
                    {currentIndex + 1} / {cards.length}
                </span>
            </div>

            {/* Flashcard - Simple Show/Hide Approach */}
            <div
                onClick={() => setIsFlipped(!isFlipped)}
                style={cardContainerStyle}
            >
                <AnimatePresence mode="wait">
                    {!isFlipped ? (
                        <motion.div
                            key="front"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            style={frontStyle}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    opacity: 0.6,
                                    color: '#fff'
                                }}>QUESTION</span>
                                <p style={{
                                    fontSize: '1rem',
                                    fontWeight: 500,
                                    color: '#fff',
                                    margin: 0,
                                    lineHeight: 1.4
                                }}>{currentCard.front}</p>
                            </div>
                            <div style={{
                                position: 'absolute',
                                bottom: '12px',
                                fontSize: '0.75rem',
                                opacity: 0.5,
                                color: '#fff'
                            }}>Click to flip 👆</div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="back"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            style={backStyle}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    opacity: 0.6,
                                    color: '#fff'
                                }}>ANSWER</span>
                                <p style={{
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    color: '#fff',
                                    margin: 0,
                                    lineHeight: 1.4
                                }}>{currentCard.back}</p>
                            </div>
                            <div style={{
                                position: 'absolute',
                                bottom: '12px',
                                fontSize: '0.75rem',
                                opacity: 0.5,
                                color: '#fff'
                            }}>Click to flip back 👆</div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Controls */}
            <div style={controlsStyle}>
                <button onClick={handlePrev} style={buttonStyle}>← Prev</button>
                <button onClick={handleNext} style={buttonStyle}>Next →</button>
            </div>
        </div>
    );
};
