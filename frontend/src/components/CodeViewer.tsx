
import React from 'react';

interface CodeViewerProps {
    code: string;
    title?: string;
    onClose: () => void;
    language?: string;
    isVisual?: boolean;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
    code,
    title = "Code",
    onClose,
    language = "python",
    isVisual = false
}) => {
    return (
        <div className="code-viewer-overlay">
            <div className="code-viewer-window">
                {/* Header */}
                <div className="window-header">
                    <div className="window-title">
                        <span className="icon">{isVisual ? '🎥' : '💻'}</span>
                        {title}
                    </div>
                    <div className="window-controls">
                        <button onClick={onClose} className="close-btn">×</button>
                    </div>
                </div>

                {/* Content */}
                <div className="window-content">
                    <div className="code-editor">
                        <div className="line-numbers">
                            {code.split('\n').map((_, i) => (
                                <div key={i} className="line-number">{i + 1}</div>
                            ))}
                        </div>
                        <pre className="code-content">
                            <code className={`language-${language}`}>{code}</code>
                        </pre>
                    </div>

                    {isVisual && (
                        <div className="visual-preview-stub">
                            <div className="animation-placeholder">
                                <div className="play-icon">▶️</div>
                                <span>Rendering Animation...</span>
                                <small>(Manim Render Engine Connected)</small>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
        .code-viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(5px);
        }

        .code-viewer-window {
          width: 90%;
          max-width: 1000px;
          height: 80vh;
          background: #1e1e1e;
          border-radius: 12px;
          border: 1px solid #333;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
          overflow: hidden;
        }

        .window-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: #252526;
          border-bottom: 1px solid #333;
        }

        .window-title {
          color: #cccccc;
          font-family: 'Segoe UI', sans-serif;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .close-btn {
          background: none;
          border: none;
          color: #888;
          font-size: 24px;
          cursor: pointer;
          line-height: 1;
        }
        .close-btn:hover { color: #fff; }

        .window-content {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .code-editor {
          flex: 1;
          display: flex;
          background: #1e1e1e;
          overflow: auto;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 14px;
        }

        .line-numbers {
          padding: 20px 10px;
          background: #1e1e1e;
          border-right: 1px solid #333;
          color: #858585;
          text-align: right;
          user-select: none;
        }

        .line-number { margin-bottom: 2px; }

        .code-content {
          padding: 20px;
          margin: 0;
          color: #d4d4d4;
          line-height: 1.5;
        }

        .visual-preview-stub {
          width: 300px;
          background: #000;
          border-left: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .animation-placeholder {
          text-align: center;
          color: #4a90d9;
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: center;
        }

        .play-icon { font-size: 40px; }
      `}</style>
        </div>
    );
};
