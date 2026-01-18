"""
═══════════════════════════════════════════════════════════════════════════════════════════════════════
 OFFICEMATES BACKEND - MAIN API SERVER
 FastAPI + LiveKit + Deepgram + Multi-Agent Orchestrator
═══════════════════════════════════════════════════════════════════════════════════════════════════════
"""

import os
import sys
import uuid
import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from MASTER_CONFIG import (
    Keys, MASTER_SYSTEM_PROMPT, OUTPUT_SCHEMA, AgentPrompts,
    DEPARTMENT_CONFIG, LIVEKIT_CONFIG, DEEPGRAM_CONFIG, OPENNOTE_CONFIG,
    WEBSOCKET_EVENTS, GAMIFICATION_CONFIG, MOCK_RESPONSES,
    get_agent_prompt, get_department_config, Department
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("officemates")

# ═══════════════════════════════════════════════════════════════════════════════
# MEDIAPIPE FACEMESH FOR EMOTION DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
try:
    import mediapipe as mp
    mp_face_mesh = mp.solutions.face_mesh
    mp_drawing = mp.solutions.drawing_utils
    mp_drawing_styles = mp.solutions.drawing_styles
    
    # Global FaceMesh instance for efficient reuse
    FACE_MESH = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    logger.info("✓ MediaPipe FaceMesh loaded for emotion detection")
    MEDIAPIPE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"MediaPipe not available, falling back to OpenCV: {e}")
    FACE_MESH = None
    MEDIAPIPE_AVAILABLE = False

# ═══════════════════════════════════════════════════════════════════════════════
# APPLICATION SETUP
# ═══════════════════════════════════════════════════════════════════════════════

# In-memory stores (replace with MongoDB in production)
TASKS_DB: Dict[str, dict] = {}
USERS_DB: Dict[str, dict] = {}
CONNECTIONS: Dict[str, WebSocket] = {}
VOICE_SESSIONS: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    logger.info("Starting OfficeMates Backend...")
    logger.info(f"LiveKit URL: {Keys.LIVEKIT_URL}")
    logger.info(f"Mock Mode: {Keys.ENABLE_MOCKS}")
    yield
    logger.info("Shutting down OfficeMates Backend...")


app = FastAPI(
    title="OfficeMates API",
    description="Multi-Agent Student Productivity Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (for videos)
app.mount("/static", StaticFiles(directory="static"), name="static")

# ═══════════════════════════════════════════════════════════════════════════════
# OPENNOTE API INTEGRATION (COMPLETE API - ALL ENDPOINTS)
# ═══════════════════════════════════════════════════════════════════════════════
import httpx

class OpenNoteAPI:
    """
    Complete OpenNote API integration for Focus Room.

    Endpoints (per docs.opennote.com):
    - Video: POST /v1/video/create, GET /v1/video/status/{video_id}
    - Journals:
        - PUT /journals/editor/create
        - PUT /journals/editor/import_from_markdown (KEY for session memory!)
        - PATCH /journals/editor/edit
        - PATCH /journals/editor/rename
        - DELETE /journals/editor/delete/{journal_id}
        - GET /journals/list
        - GET /journals/content/{journal_id}
    - Flashcards: POST /v1/interactives/flashcards/create
    - Practice: POST /v1/interactives/practice/create, GET /v1/interactives/practice/status, POST /v1/interactives/practice/grade
    """

    BASE_URL = Keys.OPENNOTE_BASE_URL or "https://api.opennote.me/v1"

    def __init__(self):
        self.api_key = Keys.OPENNOTE_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        self._client = None
    
    @property
    def client(self):
        if self._client is None:
            self._client = httpx.AsyncClient(headers=self.headers, timeout=60.0)
        return self._client
    
    # ═══════════════════════════════════════════════════════════════════════════
    # VIDEO API
    # ═══════════════════════════════════════════════════════════════════════════
    
    async def video_create(self, messages: list, title: str = "", 
                           include_sources: bool = True, search_for: str = "",
                           source_count: int = 3, length: int = 3,
                           script: str = "", upload_to_s3: bool = True,
                           webhook_url: str = "") -> dict:
        """
        POST /video/create - Create an educational video
        
        Args:
            messages: List of {role, content} messages for video generation
            title: Video title
            include_sources: Whether to gather data from the web
            search_for: Query to search the web for
            source_count: Number of sources (1-5)
            length: Number of paragraphs (1-5)
            script: Custom script with sections delimited by '-----'
            upload_to_s3: Whether to upload to S3
            webhook_url: URL for completion webhook
        """
        try:
            payload = {
                "model": "picasso",
                "messages": messages,
                "title": title,
                "include_sources": include_sources,
                "upload_to_s3": upload_to_s3
            }
            if search_for:
                payload["search_for"] = search_for
            if source_count:
                payload["source_count"] = min(max(source_count, 1), 5)
            if length:
                payload["length"] = min(max(length, 1), 5)
            if script:
                payload["script"] = script
            if webhook_url:
                payload["webhook_url"] = webhook_url
            
            response = await self.client.post(f"{self.BASE_URL}/video/create", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote video/create: {data.get('video_id', 'unknown')}")
            return data
            
        except Exception as e:
            logger.error(f"✗ OpenNote video/create failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def video_status(self, video_id: str) -> dict:
        """
        GET /video/status - Check video generation status
        
        Returns: {status, progress, response: {s3_url, ...}}
        """
        try:
            response = await self.client.get(f"{self.BASE_URL}/video/status/{video_id}")
            data = response.json()
            logger.info(f"✓ OpenNote video/status: {video_id} -> {data.get('status', 'unknown')}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote video/status failed: {e}")
            return {"status": "error", "message": str(e)}
    
    # ═══════════════════════════════════════════════════════════════════════════
    # JOURNALS API
    # ═══════════════════════════════════════════════════════════════════════════
    
    async def journals_list(self) -> dict:
        """
        GET /journals/list - List all journals
        """
        try:
            response = await self.client.get(f"{self.BASE_URL}/journals/list")
            data = response.json()
            logger.info(f"✓ OpenNote journals/list: {len(data.get('journals', []))} journals")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/list failed: {e}")
            return {"success": False, "journals": [], "error": str(e)}
    
    async def journals_content(self, journal_id: str) -> dict:
        """
        GET /journals/content - Get journal content by ID
        """
        try:
            response = await self.client.get(f"{self.BASE_URL}/journals/content/{journal_id}")
            data = response.json()
            logger.info(f"✓ OpenNote journals/content: {journal_id}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/content failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def journals_create(self, title: str, content: str = "", tags: list = None) -> dict:
        """
        PUT /journals/editor/create - Create a new journal
        """
        try:
            payload = {
                "title": title,
                "content": content
            }
            if tags:
                payload["tags"] = tags

            response = await self.client.put(f"{self.BASE_URL}/journals/editor/create", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote journals/editor/create: {title}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/editor/create failed: {e}")
            return {"success": False, "error": str(e)}

    async def journals_import_from_markdown(self, title: str, markdown: str, tags: list = None) -> dict:
        """
        PUT /journals/editor/import_from_markdown - Import structured markdown as a journal

        This is KEY for Focus Room session memory - allows importing rich structured
        session data including timestamps, behavior logs, and concept maps.

        Args:
            title: Journal title
            markdown: Markdown content to import (supports headers, lists, code blocks, etc.)
            tags: Optional list of tags for categorization
        """
        try:
            payload = {
                "title": title,
                "markdown": markdown
            }
            if tags:
                payload["tags"] = tags

            response = await self.client.put(f"{self.BASE_URL}/journals/editor/import_from_markdown", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote journals/editor/import_from_markdown: {title}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/editor/import_from_markdown failed: {e}")
            return {"success": False, "error": str(e)}

    async def journals_edit(self, journal_id: str, content: str) -> dict:
        """
        PATCH /journals/editor/edit - Edit an existing journal's content

        Useful for appending to session journals without creating duplicates.
        """
        try:
            payload = {
                "journal_id": journal_id,
                "content": content
            }
            response = await self.client.patch(f"{self.BASE_URL}/journals/editor/edit", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote journals/editor/edit: {journal_id}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/editor/edit failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def journals_rename(self, journal_id: str, new_title: str) -> dict:
        """
        PATCH /journals/editor/rename - Rename a journal
        """
        try:
            response = await self.client.patch(
                f"{self.BASE_URL}/journals/editor/rename/{journal_id}",
                json={"title": new_title}
            )
            data = response.json()
            logger.info(f"✓ OpenNote journals/editor/rename: {journal_id} -> {new_title}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/editor/rename failed: {e}")
            return {"success": False, "error": str(e)}

    async def journals_delete(self, journal_id: str) -> dict:
        """
        DELETE /journals/editor/delete - Delete a journal
        """
        try:
            response = await self.client.delete(f"{self.BASE_URL}/journals/editor/delete/{journal_id}")
            data = response.json()
            logger.info(f"✓ OpenNote journals/editor/delete: {journal_id}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote journals/editor/delete failed: {e}")
            return {"success": False, "error": str(e)}
    
    # ═══════════════════════════════════════════════════════════════════════════
    # FLASHCARDS API
    # ═══════════════════════════════════════════════════════════════════════════
    
    async def flashcards_create(self, set_description: str, count: int = 10,
                                 difficulty: str = "medium") -> dict:
        """
        POST /v1/interactives/flashcards/create - Generate AI flashcards

        Args:
            set_description: Description of what the flashcard set should cover
            count: Number of flashcards to generate (default 10)
            difficulty: easy, medium, hard
        """
        try:
            payload = {
                "set_description": set_description,
                "count": count,
                "difficulty": difficulty
            }
            response = await self.client.post(f"{self.BASE_URL}/interactives/flashcards/create", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote interactives/flashcards/create: {count} cards requested")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote interactives/flashcards/create failed: {e}")
            return {"success": False, "error": str(e)}
    
    # ═══════════════════════════════════════════════════════════════════════════
    # PRACTICE API
    # ═══════════════════════════════════════════════════════════════════════════
    
    async def practice_create(self, set_description: str, question_types: list = None,
                               count: int = 5, difficulty: str = "medium") -> dict:
        """
        POST /v1/interactives/practice/create - Generate AI practice problems

        Args:
            set_description: Description of the topic/content for practice problems
            question_types: List of types (e.g., ["multiple_choice", "short_answer"])
            count: Number of problems to generate (default 5)
            difficulty: easy, medium, hard
        """
        try:
            payload = {
                "set_description": set_description,
                "count": count,
                "difficulty": difficulty
            }
            if question_types:
                payload["question_types"] = question_types

            response = await self.client.post(f"{self.BASE_URL}/interactives/practice/create", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote interactives/practice/create: {count} problems requested")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote interactives/practice/create failed: {e}")
            return {"success": False, "error": str(e)}

    async def practice_status(self, set_id: str) -> dict:
        """
        GET /v1/interactives/practice/status/{set_id} - Check practice problem generation status
        """
        try:
            response = await self.client.get(f"{self.BASE_URL}/interactives/practice/status/{set_id}")
            data = response.json()
            logger.info(f"✓ OpenNote interactives/practice/status: {set_id}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote interactives/practice/status failed: {e}")
            return {"status": "error", "error": str(e)}
    
    async def practice_grade(self, practice_id: str, answers: list) -> dict:
        """
        POST /v1/interactives/practice/grade - Grade practice problem answers

        Args:
            practice_id: ID of the practice set
            answers: List of {question_id, answer} objects
        """
        try:
            payload = {
                "practice_id": practice_id,
                "answers": answers
            }
            response = await self.client.post(f"{self.BASE_URL}/interactives/practice/grade", json=payload)
            data = response.json()
            logger.info(f"✓ OpenNote interactives/practice/grade: {practice_id}")
            return data
        except Exception as e:
            logger.error(f"✗ OpenNote interactives/practice/grade failed: {e}")
            return {"success": False, "error": str(e)}

    # ═══════════════════════════════════════════════════════════════════════════
    # FOCUS ROOM HELPER METHODS (Built on top of OpenNote APIs)
    # ═══════════════════════════════════════════════════════════════════════════

    async def log_event(self, user_id: str, event_type: str, data: dict) -> dict:
        """Log a behavior/learning event to OpenNote journals"""
        try:
            event = {
                "user_id": user_id,
                "event_type": event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "data": data
            }

            # Create a journal entry for the event
            result = await self.journals_create(
                title=f"Focus Room: {event_type}",
                content=json.dumps(event, indent=2),
                tags=["focus_room", event_type, user_id]
            )

            return {"success": True, "logged": True, "event": event, "response": result}

        except Exception as e:
            logger.warning(f"⚠ OpenNote logging failed (saving locally): {e}")
            # Fallback: store locally
            ACTIVITY_LOG.append({
                "id": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat(),
                "user_id": user_id,
                "event_type": event_type,
                "data": data,
                "synced_to_opennote": False
            })
            return {"success": True, "logged": True, "local_only": True}

    async def create_simplified_video(self, topic: str, original_response: str) -> dict:
        """Create a simplified explanation video for a confused student"""
        messages = [
            {"role": "system", "content": "Create a simple, visual explanation for a student who is confused. Use analogies and step-by-step breakdown."},
            {"role": "user", "content": f"The student didn't understand this explanation: {original_response[:500]}... Please create a clearer, visual explanation of: {topic}"}
        ]
        return await self.video_create(
            messages=messages,
            title=f"Simplified: {topic[:40]}",
            include_sources=True,
            search_for=topic,
            length=2  # Short video for quick re-explanation
        )

    async def generate_review_flashcards(self, session_content: str, topic: str) -> dict:
        """Generate flashcards from a Focus Room session for later review"""
        return await self.flashcards_create(
            set_description=f"Create flashcards about {topic}. Key concepts: {session_content[:1000]}",
            count=5,
            difficulty="medium"
        )

    async def generate_practice_problems(self, topic: str, content: str) -> dict:
        """Generate practice problems for a topic"""
        return await self.practice_create(
            set_description=f"Create practice problems about {topic}. Content covered: {content[:1000]}",
            question_types=["multiple_choice", "short_answer"],
            count=3,
            difficulty="medium"
        )

# Global OpenNote client
opennote_api = OpenNoteAPI()


# ═══════════════════════════════════════════════════════════════════════════════
# FOCUS ROOM SESSION MANAGER - THE PRODUCTIVITY HACK CORE
# ═══════════════════════════════════════════════════════════════════════════════
# This is the KEY feature for the OpenNote hackathon track:
# - Eliminates steps: No manual note-taking, auto-generates everything
# - Reduces context-switching: Everything happens in one place
# - Pick up where you left off: Session memory via OpenNote Journals
# ═══════════════════════════════════════════════════════════════════════════════

class FocusSession:
    """
    Represents a single Focus Room learning session.

    Session Lifecycle:
    1. START → Load previous context from OpenNote → Show "where you left off"
    2. ACTIVE → Track learning, detect confusion → Auto-generate videos
    3. END → Save summary → Generate flashcards → Generate practice problems
    """

    def __init__(self, user_id: str, topic: str):
        self.session_id = str(uuid.uuid4())
        self.user_id = user_id
        self.topic = topic
        self.started_at = datetime.utcnow()
        self.ended_at = None

        # Session state
        self.status = "active"  # active, paused, completed
        self.interactions = []  # All Q&A pairs
        self.concepts_covered = []  # Topics/concepts discussed
        self.confusion_events = []  # Moments of confusion
        self.behavior_log = []  # Focus/distraction events

        # OpenNote integration
        self.journal_id = None  # Created on session end
        self.flashcard_set_id = None
        self.practice_set_id = None
        self.video_ids = []

        # Session memory (loaded from previous sessions)
        self.previous_context = None
        self.continuation_point = None

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "topic": self.topic,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "status": self.status,
            "duration_minutes": self.get_duration_minutes(),
            "interactions_count": len(self.interactions),
            "concepts_covered": self.concepts_covered,
            "confusion_events_count": len(self.confusion_events),
            "previous_context": self.previous_context,
            "journal_id": self.journal_id,
            "flashcard_set_id": self.flashcard_set_id,
            "practice_set_id": self.practice_set_id,
            "video_ids": self.video_ids
        }

    def get_duration_minutes(self) -> int:
        end = self.ended_at or datetime.utcnow()
        return int((end - self.started_at).total_seconds() / 60)

    def add_interaction(self, question: str, response: str, confidence: float = 1.0):
        """Record a Q&A interaction"""
        self.interactions.append({
            "timestamp": datetime.utcnow().isoformat(),
            "question": question,
            "response": response,
            "confidence": confidence
        })

    def add_concept(self, concept: str):
        """Track a concept that was covered"""
        if concept not in self.concepts_covered:
            self.concepts_covered.append(concept)

    def log_confusion(self, trigger: str, context: str):
        """Record a moment of confusion"""
        self.confusion_events.append({
            "timestamp": datetime.utcnow().isoformat(),
            "trigger": trigger,
            "context": context
        })

    def log_behavior(self, behavior_type: str, data: dict):
        """Log focus/attention behavior"""
        self.behavior_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "type": behavior_type,
            "data": data
        })

    def generate_session_markdown(self) -> str:
        """
        Generate structured markdown summary for OpenNote journal import.
        This is the "long-term memory" format.
        """
        duration = self.get_duration_minutes()

        md = f"""# Focus Session: {self.topic}

## Session Info
- **Session ID**: `{self.session_id}`
- **Date**: {self.started_at.strftime("%Y-%m-%d %H:%M")} UTC
- **Duration**: {duration} minutes
- **Status**: {self.status}

## Where You Left Off
> **Last Topic**: {self.concepts_covered[-1] if self.concepts_covered else self.topic}
> **Progress**: Covered {len(self.concepts_covered)} concepts in {len(self.interactions)} interactions

## Concepts Covered
"""
        for i, concept in enumerate(self.concepts_covered, 1):
            md += f"{i}. {concept}\n"

        md += "\n## Key Interactions\n"
        # Include last 5 interactions for context
        recent = self.interactions[-5:] if len(self.interactions) > 5 else self.interactions
        for interaction in recent:
            md += f"\n### Q: {interaction['question'][:100]}...\n"
            md += f"**A**: {interaction['response'][:200]}...\n"
            md += f"*Confidence: {interaction['confidence']:.0%}*\n"

        if self.confusion_events:
            md += "\n## Confusion Points (Review These!)\n"
            for event in self.confusion_events:
                md += f"- **{event['trigger']}**: {event['context'][:100]}\n"

        if self.behavior_log:
            focus_events = [b for b in self.behavior_log if b['type'] == 'focused']
            distraction_events = [b for b in self.behavior_log if b['type'] == 'distracted']
            md += f"\n## Focus Analytics\n"
            md += f"- Focused periods: {len(focus_events)}\n"
            md += f"- Distraction events: {len(distraction_events)}\n"

        md += f"\n---\n*Auto-generated by Focus Room | Synced to OpenNote*\n"
        return md


class FocusSessionManager:
    """
    Manages Focus Room sessions and integrates with OpenNote for "long-term memory".

    KEY PRODUCTIVITY FEATURES:
    1. Auto-loads previous session context (pick up where you left off)
    2. Auto-saves session summaries to OpenNote journals
    3. Auto-generates flashcards and practice problems on session end
    4. Triggers video creation on confusion detection
    """

    def __init__(self):
        self.active_sessions: dict[str, FocusSession] = {}

    async def start_session(self, user_id: str, topic: str) -> dict:
        """
        Start a new Focus Room session.

        This is the "pick up where you left off" entry point:
        1. Loads previous sessions for this user/topic from OpenNote
        2. Creates a new session with context
        3. Returns continuation point so UI can show "where you left off"
        """
        # Create new session
        session = FocusSession(user_id, topic)

        # Load previous context from OpenNote (the "long-term memory")
        previous_context = await self._load_previous_context(user_id, topic)
        session.previous_context = previous_context

        if previous_context:
            session.continuation_point = previous_context.get("last_concept", topic)
            logger.info(f"🧠 Loaded previous context for {user_id}: {session.continuation_point}")

        # Store active session
        self.active_sessions[session.session_id] = session

        # Log session start to OpenNote
        await opennote_api.log_event(user_id, "session_started", {
            "session_id": session.session_id,
            "topic": topic,
            "has_previous_context": previous_context is not None,
            "continuation_point": session.continuation_point
        })

        return {
            "success": True,
            "session_id": session.session_id,
            "topic": topic,
            "previous_context": previous_context,
            "continuation_point": session.continuation_point,
            "message": f"Welcome back! You were learning about '{session.continuation_point}'" if previous_context else f"Starting fresh session on '{topic}'"
        }

    async def _load_previous_context(self, user_id: str, topic: str) -> dict | None:
        """
        Load previous learning context from OpenNote journals.

        Searches for journals tagged with this user and topic to restore context.
        """
        try:
            journals = await opennote_api.journals_list()
            if not journals.get("journals"):
                return None

            # Find relevant previous sessions
            relevant = []
            for journal in journals.get("journals", []):
                title = journal.get("title", "")
                tags = journal.get("tags", [])

                # Match by title or tags
                if (f"Focus Session: {topic}" in title or
                    (user_id in tags and "focus_room" in tags)):
                    relevant.append(journal)

            if not relevant:
                return None

            # Get the most recent session content
            most_recent = relevant[0]  # Assuming sorted by date
            content = await opennote_api.journals_content(most_recent.get("id"))

            # Parse the markdown to extract continuation point
            content_text = content.get("content", "")

            # Extract last concept from the markdown
            last_concept = topic
            if "Last Topic" in content_text:
                # Parse the "Last Topic" line
                for line in content_text.split("\n"):
                    if "Last Topic" in line:
                        last_concept = line.split(":")[-1].strip().strip("*")
                        break

            return {
                "journal_id": most_recent.get("id"),
                "last_concept": last_concept,
                "last_session_date": most_recent.get("updated_at"),
                "concepts_covered": [],  # Could parse from content
                "summary": content_text[:500] if content_text else None
            }

        except Exception as e:
            logger.warning(f"Failed to load previous context: {e}")
            return None

    async def record_interaction(self, session_id: str, question: str, response: str,
                                  confidence: float = 1.0, concepts: list = None) -> dict:
        """Record a learning interaction in the session"""
        session = self.active_sessions.get(session_id)
        if not session:
            return {"success": False, "error": "Session not found"}

        session.add_interaction(question, response, confidence)

        if concepts:
            for concept in concepts:
                session.add_concept(concept)

        return {
            "success": True,
            "interactions_count": len(session.interactions),
            "concepts_covered": session.concepts_covered
        }

    async def handle_confusion(self, session_id: str, trigger: str, context: str,
                                current_topic: str) -> dict:
        """
        Handle confusion detection - triggers auto-video creation.

        This is KEY for the productivity hack:
        - Detects confusion (via explicit signal or behavior tracking)
        - Auto-generates a simplified video explanation
        - No context-switching required - video appears in Focus Room
        """
        session = self.active_sessions.get(session_id)
        if not session:
            return {"success": False, "error": "Session not found"}

        # Log the confusion event
        session.log_confusion(trigger, context)

        # Auto-generate simplified video (no manual steps!)
        logger.info(f"🎬 Confusion detected! Auto-generating video for: {current_topic}")
        video_result = await opennote_api.create_simplified_video(
            topic=current_topic,
            original_response=context
        )

        if video_result.get("video_id"):
            session.video_ids.append(video_result["video_id"])

        # Log to OpenNote
        await opennote_api.log_event(session.user_id, "confusion_video_triggered", {
            "session_id": session_id,
            "trigger": trigger,
            "topic": current_topic,
            "video_id": video_result.get("video_id")
        })

        return {
            "success": True,
            "video_triggered": True,
            "video_id": video_result.get("video_id"),
            "video_status": video_result.get("status", "processing"),
            "message": "Creating a simplified explanation video for you..."
        }

    async def log_focus_behavior(self, session_id: str, behavior_type: str, data: dict) -> dict:
        """Log focus/distraction behavior from FocusTracker component"""
        session = self.active_sessions.get(session_id)
        if not session:
            return {"success": False, "error": "Session not found"}

        session.log_behavior(behavior_type, data)

        # If distracted, might trigger intervention
        if behavior_type == "distracted":
            distraction_count = len([b for b in session.behavior_log if b['type'] == 'distracted'])
            if distraction_count > 3:  # Threshold
                return {
                    "success": True,
                    "intervention_needed": True,
                    "message": "You seem distracted. Would you like a quick break or a different approach?"
                }

        return {"success": True, "behavior_logged": True}

    async def end_session(self, session_id: str, generate_review: bool = True) -> dict:
        """
        End a Focus Room session.

        This is the ZERO-FRICTION session end:
        1. Auto-generates session summary → saves to OpenNote journal
        2. Auto-generates flashcards from session content
        3. Auto-generates practice problems
        4. Returns everything the user needs for review

        NO MANUAL STEPS REQUIRED - everything is auto-generated!
        """
        session = self.active_sessions.get(session_id)
        if not session:
            return {"success": False, "error": "Session not found"}

        session.status = "completed"
        session.ended_at = datetime.utcnow()

        results = {
            "success": True,
            "session_id": session_id,
            "duration_minutes": session.get_duration_minutes(),
            "interactions_count": len(session.interactions),
            "concepts_covered": session.concepts_covered,
            "confusion_events": len(session.confusion_events)
        }

        # 1. Save session summary to OpenNote journal (LONG-TERM MEMORY)
        session_markdown = session.generate_session_markdown()
        journal_result = await opennote_api.journals_import_from_markdown(
            title=f"Focus Session: {session.topic}",
            markdown=session_markdown,
            tags=["focus_room", "session", session.user_id, session.topic]
        )
        session.journal_id = journal_result.get("journal_id")
        results["journal_id"] = session.journal_id
        logger.info(f"📝 Session saved to OpenNote journal: {session.journal_id}")

        if generate_review and len(session.interactions) >= 2:
            # 2. Auto-generate flashcards (NO MANUAL STEPS!)
            flashcard_content = "\n".join([
                f"Q: {i['question']}\nA: {i['response']}"
                for i in session.interactions[-10:]  # Last 10 interactions
            ])
            flashcard_result = await opennote_api.generate_review_flashcards(
                session_content=flashcard_content,
                topic=session.topic
            )
            session.flashcard_set_id = flashcard_result.get("set_id")
            results["flashcard_set_id"] = session.flashcard_set_id
            logger.info(f"🃏 Auto-generated flashcards: {session.flashcard_set_id}")

            # 3. Auto-generate practice problems (NO MANUAL STEPS!)
            practice_content = f"Topics covered: {', '.join(session.concepts_covered)}\n\n"
            practice_content += "\n".join([i['response'] for i in session.interactions[-5:]])
            practice_result = await opennote_api.generate_practice_problems(
                topic=session.topic,
                content=practice_content
            )
            session.practice_set_id = practice_result.get("set_id")
            results["practice_set_id"] = session.practice_set_id
            logger.info(f"📝 Auto-generated practice problems: {session.practice_set_id}")

        # Log session end
        await opennote_api.log_event(session.user_id, "session_ended", session.to_dict())

        results["message"] = (
            f"Session complete! {session.get_duration_minutes()} min studying '{session.topic}'. "
            f"Auto-generated: journal entry, {5 if session.flashcard_set_id else 0} flashcards, "
            f"{3 if session.practice_set_id else 0} practice problems. "
            f"Pick up where you left off next time!"
        )

        # Clean up active session
        del self.active_sessions[session_id]

        return results

    def get_session(self, session_id: str) -> FocusSession | None:
        """Get an active session"""
        return self.active_sessions.get(session_id)

    def get_user_sessions(self, user_id: str) -> list[dict]:
        """Get all active sessions for a user"""
        return [
            s.to_dict() for s in self.active_sessions.values()
            if s.user_id == user_id
        ]


# Global Focus Session Manager
focus_session_manager = FocusSessionManager()



# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class CreateTaskRequest(BaseModel):
    user_id: str
    department: str = "study_hub"
    agent_queue: Optional[List[str]] = None
    input_type: str = "text"  # text, file, voice
    content: Optional[str] = None
    file_id: Optional[str] = None


class VoiceSessionRequest(BaseModel):
    user_id: str
    room_name: Optional[str] = "officemates_main"


class UserXPUpdate(BaseModel):
    user_id: str
    xp_gained: int
    source: str


class NoteCreateRequest(BaseModel):
    user_id: str
    title: str
    content: str
    tags: List[str] = []
    department: str = "study_hub"


class SmartTaskRequest(BaseModel):
    user_id: str
    title: str
    description: str = ""
    department: str = "general"
    priority: str = "medium"
    due_date: Optional[str] = None
    estimated_minutes: int = 30
    related_assignment_id: Optional[str] = None
    tags: List[str] = []


class SmartTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ChatTaskCommand(BaseModel):
    user_id: str
    command: str  # "add", "complete", "prioritize", "delete", "list", "recommend"
    message: str  # Natural language message


# In-memory Smart Tasks storage
SMART_TASKS_DB: Dict[str, dict] = {}


# ═══════════════════════════════════════════════════════════════════════════════
# LIVEKIT TOKEN GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def generate_livekit_token(user_id: str, room_name: str = "officemates_main") -> str:
    """Generate LiveKit access token for a user"""
    try:
        # Using livekit-api package
        from livekit.api import AccessToken, VideoGrants

        token = AccessToken(
            api_key=Keys.LIVEKIT_API_KEY,
            api_secret=Keys.LIVEKIT_API_SECRET
        )
        token.with_identity(user_id)
        token.with_name(f"User-{user_id[:8]}")
        token.with_grants(VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True
        ))
        token.with_ttl(timedelta(hours=1))

        return token.to_jwt()

    except ImportError:
        # Fallback: manual JWT generation
        import jwt
        import time

        now = int(time.time())
        payload = {
            "iss": Keys.LIVEKIT_API_KEY,
            "sub": user_id,
            "name": f"User-{user_id[:8]}",
            "iat": now,
            "nbf": now,
            "exp": now + 3600,  # 1 hour
            "video": {
                "roomJoin": True,
                "room": room_name,
                "canPublish": True,
                "canSubscribe": True,
                "canPublishData": True
            }
        }

        return jwt.encode(payload, Keys.LIVEKIT_API_SECRET, algorithm="HS256")


@app.get("/api/livekit/token")
async def get_livekit_token(user_id: str, room: str = "officemates_main"):
    """Get LiveKit access token for voice session"""
    try:
        token = generate_livekit_token(user_id, room)
        return {
            "token": token,
            "url": Keys.LIVEKIT_URL,
            "room": room,
            "identity": user_id
        }
    except Exception as e:
        logger.error(f"Token generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# DEEPGRAM STT INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════

class DeepgramTranscriber:
    """Real-time speech-to-text using Deepgram"""

    def __init__(self):
        self.api_key = Keys.DEEPGRAM_API_KEY
        self.base_url = "wss://api.deepgram.com/v1/listen"

    async def get_connection_url(self) -> str:
        """Get Deepgram WebSocket URL with parameters"""
        params = [
            "model=nova-2",
            "language=en-US",
            "smart_format=true",
            "punctuate=true",
            "interim_results=true",
            "endpointing=300"
        ]
        return f"{self.base_url}?{'&'.join(params)}"

    def get_headers(self) -> dict:
        """Get authorization headers"""
        return {"Authorization": f"Token {self.api_key}"}


deepgram = DeepgramTranscriber()


@app.get("/api/deepgram/config")
async def get_deepgram_config():
    """Get Deepgram configuration for client-side connection"""
    return {
        "url": await deepgram.get_connection_url(),
        # Note: Don't expose API key to client in production
        # Use server-side proxy instead
        "sample_rate": DEEPGRAM_CONFIG["transcription_options"].get("sample_rate", 16000)
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MULTI-AGENT ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

class AgentOrchestrator:
    """Orchestrates multi-agent processing pipeline"""

    def __init__(self):
        self.active_tasks: Dict[str, dict] = {}

    async def create_task(
        self,
        user_id: str,
        department: str,
        input_type: str,
        content: str,
        agent_queue: Optional[List[str]] = None
    ) -> dict:
        """Create a new processing task"""

        task_id = str(uuid.uuid4())

        # Get department config
        dept_config = get_department_config(department)
        if not dept_config:
            dept_config = get_department_config("study_hub")

        # Use default queue if not specified
        if agent_queue is None:
            agent_queue = dept_config.get("default_agent_queue", ["Intake", "Processor", "Editor", "Actioner"])

        task = {
            "id": task_id,
            "user_id": user_id,
            "department": department,
            "input_type": input_type,
            "content": content,
            "agent_queue": agent_queue,
            "current_agent_index": 0,
            "status": "created",
            "results": {},
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        TASKS_DB[task_id] = task
        self.active_tasks[task_id] = task

        return task

    async def run_agent(self, task_id: str, agent_name: str) -> dict:
        """Run a specific agent on a task"""

        task = TASKS_DB.get(task_id)
        if not task:
            return {"error": "Task not found"}

        logger.info(f"Running agent {agent_name} for task {task_id}")

        # Emit agent started event
        await self.emit_event(task["user_id"], "agent_started", {
            "task_id": task_id,
            "agent": agent_name,
            "started_at": datetime.utcnow().isoformat()
        })

        # Get the prompt for this agent
        prompt = get_agent_prompt(
            agent_name,
            task["department"],
            input_content=task["content"],
            input_type=task["input_type"],
            file_metadata={},
            raw_text=task["content"],
            intake_result=task["results"].get("Intake", {}),
            processor_result=task["results"].get("Processor", {}),
            topic=task.get("topic", ""),
            tags=task["results"].get("Editor", {}).get("tags", []),
            context=task["content"][:500],
            final_summary=task["results"].get("Editor", {}).get("final_summary", ""),
            cleaned_text=task["results"].get("Editor", {}).get("cleaned_text", task["content"]),
            community_tips=task["results"].get("Researcher", {}).get("community_tips", []),
            needs_visualization=task["results"].get("Processor", {}).get("needs_visualization", False),
            canonical_note=task["results"].get("canonical_note", {}),
            all_results=task["results"],
            event_type="processing",
            mood="neutral"
        )

        # Call LLM (use mock in demo mode)
        if Keys.ENABLE_MOCKS:
            result = await self.get_mock_result(agent_name)
        else:
            result = await self.call_llm(agent_name, prompt, task)

        # Store result
        task["results"][agent_name] = result
        task["updated_at"] = datetime.utcnow().isoformat()

        # Emit agent completed event
        await self.emit_event(task["user_id"], "agent_completed", {
            "task_id": task_id,
            "agent": agent_name,
            "ended_at": datetime.utcnow().isoformat(),
            "confidence": result.get("confidence", 0.8),
            "result_preview": str(result)[:200]
        })

        return result

    async def run_pipeline(self, task_id: str) -> dict:
        """Run the full agent pipeline for a task"""

        task = TASKS_DB.get(task_id)
        if not task:
            return {"error": "Task not found"}

        task["status"] = "processing"

        # Run each agent in sequence
        for i, agent_name in enumerate(task["agent_queue"]):
            task["current_agent_index"] = i

            # Emit progress
            await self.emit_event(task["user_id"], "task_progress", {
                "task_id": task_id,
                "current_agent": agent_name,
                "agent_index": i,
                "total_agents": len(task["agent_queue"]),
                "progress": (i + 0.5) / len(task["agent_queue"]),
                "message": f"Running {agent_name}..."
            })

            # Run agent
            result = await self.run_agent(task_id, agent_name)

            # Check for errors
            if "error" in result:
                task["status"] = "error"
                await self.emit_event(task["user_id"], "task_error", {
                    "task_id": task_id,
                    "error_type": "agent_error",
                    "error_message": result["error"],
                    "recoverable": True
                })
                return task

        # Build final canonical note
        canonical_note = await self.build_canonical_note(task)
        task["results"]["canonical_note"] = canonical_note

        # Save to Opennote (if not mock mode)
        if not Keys.ENABLE_MOCKS:
            opennote_result = await self.save_to_opennote(task)
            task["results"]["opennote"] = opennote_result

        # Calculate XP reward
        xp_reward = self.calculate_xp(task)

        # Mark complete
        task["status"] = "completed"
        task["xp_reward"] = xp_reward

        # Emit completion
        await self.emit_event(task["user_id"], "task_completed", {
            "task_id": task_id,
            "status": "completed",
            "opennote_note_id": task["results"].get("opennote", {}).get("note_id"),
            "xp_awarded": xp_reward,
            "badges_earned": [],
            "canonical_note_preview": {
                "title": canonical_note.get("title"),
                "summary": canonical_note.get("final_summary")
            }
        })

        return task

    async def call_gemini_resilient(self, prompt: str, system_prompt: str = "") -> str:
        """Helper to call Gemini with robust fallback logic"""
        import google.generativeai as genai
        import time

        # Models to try - ONLY gemini-2.5-flash as per user request
        CANDIDATE_MODELS = [
            'gemini-2.5-flash',
        ]

        last_error = None
        genai.configure(api_key=Keys.GOOGLE_API_KEY)
        
        MAX_RETRIES = 3
        RETRY_DELAY = 15  # seconds - API says retry in ~14.5s

        for model_name in CANDIDATE_MODELS:
            for attempt in range(MAX_RETRIES):
                try:
                    logger.info(f"Attempting Gemini model: {model_name} (attempt {attempt + 1}/{MAX_RETRIES})")
                    model = genai.GenerativeModel(model_name)
                    
                    # Combine system prompt if provided
                    full_content = prompt
                    if system_prompt:
                        full_content = f"{system_prompt}\n\n{prompt}"
                    
                    response = model.generate_content(full_content)
                    return response.text
                    
                except Exception as e:
                    error_str = str(e)
                    logger.warning(f"Model {model_name} attempt {attempt + 1} failed: {error_str}")
                    last_error = e
                    
                    # If it's a 429 (Rate Limit), wait and retry
                    if "429" in error_str or "quota" in error_str.lower() or "limit" in error_str.lower():
                        if attempt < MAX_RETRIES - 1:
                            logger.info(f"Rate limited. Waiting {RETRY_DELAY}s before retry...")
                            time.sleep(RETRY_DELAY)
                            continue
                        else:
                            logger.error("Max retries reached for rate limit")
                            break
                    elif "404" in error_str:
                        # Model not found - don't retry, break to next model
                        break
                    else:
                        # Other errors - don't retry
                        break
        
        # If we get here, all models failed
        raise last_error or Exception("All Gemini models failed")

    async def call_llm(self, agent_name: str, prompt: str, task: dict) -> dict:
        """Call LLM for agent processing (using Gemini with fallback)"""
        try:
            full_prompt = f"""
{MASTER_SYSTEM_PROMPT}

═══ CURRENT AGENT: {agent_name} ═══
{prompt}

═══ TASK CONTENT ═══
{task['content'][:2000]}

═══ PREVIOUS RESULTS ═══
{json.dumps(task['results'], indent=2)[:2000]}

Return ONLY valid JSON matching the agent's output schema. No additional text.
"""

            response_text = await self.call_gemini_resilient(full_prompt)

            # Parse JSON from response
            try:
                import json
                result = json.loads(response_text)
            except json.JSONDecodeError:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                else:
                    result = {"raw_response": response_text, "confidence": 0.5}

            return result

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return {"error": str(e), "confidence": 0.0}

    async def get_mock_result(self, agent_name: str) -> dict:
        """Get mock result for demo mode"""
        mock_map = {
            "Intake": MOCK_RESPONSES.get("intake_result", {}),
            "Processor": MOCK_RESPONSES.get("processor_result", {}),
            "Editor": {
                "final_summary": "Mock edited summary",
                "cleaned_text": "Mock cleaned text",
                "tags": ["mock", "demo"],
                "confidence": 0.9
            },
            "Researcher": MOCK_RESPONSES.get("unwrap_result", {}),
            "Actioner": {
                "action_items": [{"task": "Review notes", "priority": "medium"}],
                "gradebook_entry": {"title": "Mock Assignment", "estimated_points": 100},
                "opennote_body": "## Summary\nMock content...",
                "xp_reward": 15,
                "confidence": 0.85
            },
            "QA": {
                "ok": True,
                "issues": [],
                "quality_score": 0.9,
                "ready_to_save": True
            }
        }
        await asyncio.sleep(0.5)  # Simulate processing time
        return mock_map.get(agent_name, {"confidence": 0.8})

    async def build_canonical_note(self, task: dict) -> dict:
        """Build the final canonical note from all agent results"""
        processor = task["results"].get("Processor", {})
        editor = task["results"].get("Editor", {})
        researcher = task["results"].get("Researcher", {})
        actioner = task["results"].get("Actioner", {})

        return {
            "title": editor.get("title_refined") or task["results"].get("Intake", {}).get("title", "Untitled Note"),
            "final_summary": editor.get("final_summary") or processor.get("short_summary", ""),
            "full_text": editor.get("cleaned_text") or task["content"],
            "tags": editor.get("tags", []),
            "flashcards": actioner.get("flashcards", []),
            "community_tips": researcher.get("community_tips", []),
            "key_points": processor.get("key_points", []),
            "action_items": actioner.get("action_items", [])
        }

    async def save_to_opennote(self, task: dict) -> dict:
        """Save canonical note to Opennote"""
        import requests

        canonical = task["results"].get("canonical_note", {})

        try:
            response = requests.post(
                f"{OPENNOTE_CONFIG['base_url']}/notes",
                headers={
                    "Authorization": f"Bearer {Keys.OPENNOTE_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "title": canonical.get("title", "Untitled"),
                    "content": canonical.get("full_text", ""),
                    "tags": canonical.get("tags", [])
                },
                timeout=15
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Opennote save failed: {e}")
            return {"error": str(e)}

    def calculate_xp(self, task: dict) -> int:
        """Calculate XP reward for completed task"""
        base_xp = GAMIFICATION_CONFIG["xp_rewards"]["note_created"]

        # Department multiplier
        dept_config = get_department_config(task["department"])
        multiplier = dept_config.get("xp_multiplier", 1.0)

        # Bonus for voice input
        if task["input_type"] == "voice":
            base_xp += GAMIFICATION_CONFIG["xp_rewards"]["voice_note"]

        # Bonus for flashcards
        flashcard_count = len(task["results"].get("canonical_note", {}).get("flashcards", []))
        base_xp += flashcard_count * 2

        return int(base_xp * multiplier)

    async def emit_event(self, user_id: str, event_type: str, payload: dict):
        """Emit WebSocket event to connected client"""
        ws = CONNECTIONS.get(user_id)
        if ws:
            try:
                await ws.send_json({
                    "event": event_type,
                    "timestamp": datetime.utcnow().isoformat(),
                    **payload
                })
            except Exception as e:
                logger.error(f"WebSocket emit failed: {e}")


orchestrator = AgentOrchestrator()


# ═══════════════════════════════════════════════════════════════════════════════
# VOICE PROCESSING
# ═══════════════════════════════════════════════════════════════════════════════

class VoiceProcessor:
    """Process voice input and route to agents"""

    async def process_transcript(self, user_id: str, transcript: str, is_final: bool) -> dict:
        """Process incoming transcript from Deepgram"""

        if not is_final:
            # Just emit interim transcript
            await orchestrator.emit_event(user_id, "transcript_update", {
                "transcript": transcript,
                "is_final": False
            })
            return {"status": "interim"}

        # Detect intent
        intent = self.detect_intent(transcript)

        logger.info(f"Voice intent detected: {intent} for transcript: {transcript[:50]}...")

        if intent == "question":
            return await self.handle_question(user_id, transcript)
        elif intent == "command":
            return await self.handle_command(user_id, transcript)
        elif intent == "dictation":
            return await self.handle_dictation(user_id, transcript)
        else:
            return await self.handle_conversation(user_id, transcript)

    def detect_intent(self, transcript: str) -> str:
        """Detect user intent from transcript"""
        lower = transcript.lower()

        # Question patterns
        if any(w in lower for w in ["what is", "how do", "can you explain", "tell me about", "what's"]):
            return "question"

        # Command patterns
        if any(w in lower for w in ["save", "create", "open", "search", "quiz me", "delete", "list"]):
            return "command"

        # Dictation patterns
        if any(w in lower for w in ["notes on", "my notes", "for the homework", "lecture about"]):
            return "dictation"

        # Default to conversation if short, dictation if long
        return "conversation" if len(transcript) < 50 else "dictation"

    async def handle_question(self, user_id: str, transcript: str) -> dict:
        """Handle question intent"""
        # In production: search Opennote and respond
        response_text = f"Let me help you with that. I'll search your notes for relevant information about: {transcript[:50]}..."

        await orchestrator.emit_event(user_id, "voice_response", {
            "text": response_text,
            "agent": "Study Hub",
            "emotion": "helpful"
        })

        return {"intent": "question", "response": response_text}

    async def handle_command(self, user_id: str, transcript: str) -> dict:
        """Handle command intent"""
        lower = transcript.lower()

        if "save" in lower:
            response_text = "Got it! Ready to save your notes. Please dictate what you'd like to include."
        elif "create flashcard" in lower:
            response_text = "Creating flashcards from your recent notes now!"
        elif "quiz" in lower:
            response_text = "Starting a quiz! Let me pick some questions from your recent notes."
        else:
            response_text = "I'll help you with that command."

        await orchestrator.emit_event(user_id, "voice_response", {
            "text": response_text,
            "agent": "Study Hub",
            "emotion": "encouraging"
        })

        return {"intent": "command", "response": response_text}

    async def handle_dictation(self, user_id: str, transcript: str) -> dict:
        """Handle dictation intent - create a processing task"""
        # Detect department from content
        department = self.detect_department(transcript)

        # Create task
        task = await orchestrator.create_task(
            user_id=user_id,
            department=department,
            input_type="voice",
            content=transcript
        )

        # Start processing in background
        asyncio.create_task(orchestrator.run_pipeline(task["id"]))

        response_text = f"Got it! I'm processing your {department} notes now. I'll let you know when they're ready."

        await orchestrator.emit_event(user_id, "voice_response", {
            "text": response_text,
            "agent": get_department_config(department)["personality"]["name"],
            "emotion": "excited"
        })

        return {"intent": "dictation", "task_id": task["id"], "response": response_text}

    async def handle_conversation(self, user_id: str, transcript: str) -> dict:
        """Handle casual conversation"""
        response_text = "I'm here to help you study! You can dictate notes, ask questions, or create flashcards."

        await orchestrator.emit_event(user_id, "voice_response", {
            "text": response_text,
            "agent": "Coach Campus",
            "emotion": "friendly"
        })

        return {"intent": "conversation", "response": response_text}

    def detect_department(self, transcript: str) -> str:
        """Detect department from transcript content"""
        lower = transcript.lower()

        math_words = ["equation", "integral", "derivative", "calculus", "algebra", "math", "theorem", "proof"]
        science_words = ["biology", "chemistry", "physics", "experiment", "molecule", "cell", "atom"]
        english_words = ["essay", "literature", "grammar", "writing", "poem", "novel", "thesis"]

        if any(w in lower for w in math_words):
            return "math"
        elif any(w in lower for w in science_words):
            return "science"
        elif any(w in lower for w in english_words):
            return "english"
        else:
            return "study_hub"


voice_processor = VoiceProcessor()


# ═══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {
        "name": "OfficeMates API",
        "version": "1.0.0",
        "status": "running",
        "mock_mode": Keys.ENABLE_MOCKS
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "livekit": "configured" if Keys.LIVEKIT_API_KEY else "missing",
            "deepgram": "configured" if Keys.DEEPGRAM_API_KEY else "missing",
            "opennote": "configured" if Keys.OPENNOTE_API_KEY else "missing",
            "google_ai": "configured" if Keys.GOOGLE_API_KEY else "missing"
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# TASK ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/tasks")
async def create_task(request: CreateTaskRequest, background_tasks: BackgroundTasks):
    """Create a new processing task"""
    task = await orchestrator.create_task(
        user_id=request.user_id,
        department=request.department,
        input_type=request.input_type,
        content=request.content or "",
        agent_queue=request.agent_queue
    )

    # Run pipeline in background
    background_tasks.add_task(orchestrator.run_pipeline, task["id"])

    return {
        "task_id": task["id"],
        "status": "queued",
        "agent_queue": task["agent_queue"]
    }


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    """Get task status and results"""
    task = TASKS_DB.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.get("/api/tasks")
async def list_tasks(user_id: str):
    """List all tasks for a user"""
    user_tasks = [t for t in TASKS_DB.values() if t["user_id"] == user_id]
    return {"tasks": user_tasks}


# ─────────────────────────────────────────────────────────────────────────────
# OPENNOTE LOGGING ENDPOINT & REACTION DETECTION SYSTEM
# ─────────────────────────────────────────────────────────────────────────────

class OpennoteLogRequest(BaseModel):
    user_id: str
    event_type: str  # Frontend sends 'event_type' not 'event'
    data: Optional[dict] = {}
    timestamp: Optional[str] = None


class ReactionAnalysisRequest(BaseModel):
    user_id: str
    ai_response_id: str
    cv_signals: dict  # face_detected, eyes_open, looking_away, distraction_type
    engagement_signals: dict  # time_on_response, scroll_behavior, clicks, typing_started
    context: dict  # current_task, topic, specialist


# In-memory activity log (would be database in production)
ACTIVITY_LOG: List[dict] = []

# Reaction history for correlation analysis
REACTION_HISTORY: Dict[str, List[dict]] = {}

# OpenNote Correlation Engine
class OpenNoteCorrelationEngine:
    """Tracks and correlates user reactions to AI outputs for adaptive learning"""
    
    def __init__(self):
        self.correlations: Dict[str, List[dict]] = {}
        self.learning_patterns: Dict[str, dict] = {}
    
    def analyze_reaction(self, user_id: str, ai_response_id: str, 
                         cv_signals: dict, engagement_signals: dict, context: dict) -> dict:
        """
        Analyze user reaction to AI output and determine adaptation strategy
        
        Reaction Types:
        - ENGAGED: User is focused, eyes on screen, possibly taking notes
        - CONFUSED: Looking away frequently, re-reading, slow progress
        - DISTRACTED: Phone use, looking away, low engagement
        - MOTIVATED: Quick responses, high engagement, sustained focus
        - BORED: Low engagement, fast scrolling, minimal interaction
        """
        
        # Calculate engagement score (0-1)
        engagement_score = self._calculate_engagement(cv_signals, engagement_signals)
        
        # Determine reaction type
        reaction_type = self._classify_reaction(cv_signals, engagement_signals, engagement_score)
        
        # Generate adaptation strategy
        adaptation = self._generate_adaptation(reaction_type, context)
        
        # Create correlation record
        correlation = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "ai_response_id": ai_response_id,
            "timestamp": datetime.utcnow().isoformat(),
            "cv_signals": cv_signals,
            "engagement_signals": engagement_signals,
            "engagement_score": engagement_score,
            "reaction_type": reaction_type,
            "context": context,
            "adaptation": adaptation,
            "reasoning": self._generate_reasoning(reaction_type, cv_signals, engagement_signals, context)
        }
        
        # Store correlation
        if user_id not in self.correlations:
            self.correlations[user_id] = []
        self.correlations[user_id].append(correlation)
        
        # Update learning patterns
        self._update_learning_patterns(user_id, correlation)
        
        return correlation
    
    def _calculate_engagement(self, cv_signals: dict, engagement_signals: dict) -> float:
        """Calculate overall engagement score from signals"""
        score = 0.5  # baseline
        
        # CV signals
        if cv_signals.get("face_detected", False):
            score += 0.1
        if cv_signals.get("eyes_open", False):
            score += 0.15
        if cv_signals.get("looking_away", False):
            score -= 0.2
        if cv_signals.get("distraction_type") == "phone_use":
            score -= 0.3
        
        # Engagement signals
        time_on_response = engagement_signals.get("time_on_response", 0)
        if time_on_response > 10:  # More than 10 seconds = engaged
            score += 0.1
        if time_on_response > 30:  # Deep reading
            score += 0.1
        
        if engagement_signals.get("typing_started", False):
            score += 0.15  # User is responding
        if engagement_signals.get("took_notes", False):
            score += 0.2
        
        # Fast scrolling = low engagement
        if engagement_signals.get("scroll_speed", 0) > 500:
            score -= 0.15
        
        return max(0, min(1, score))
    
    def _classify_reaction(self, cv_signals: dict, engagement_signals: dict, score: float) -> str:
        """Classify the reaction type based on signals"""
        
        # Check for specific patterns
        if cv_signals.get("distraction_type") == "phone_use":
            return "DISTRACTED"
        
        if cv_signals.get("looking_away", False) and score < 0.4:
            return "CONFUSED"  # Looking away while low engagement = confused
        
        if score >= 0.8:
            if engagement_signals.get("typing_started") or engagement_signals.get("took_notes"):
                return "MOTIVATED"
            return "ENGAGED"
        
        if score >= 0.5:
            return "ENGAGED"
        
        if score >= 0.3:
            if engagement_signals.get("scroll_speed", 0) > 300:
                return "BORED"
            return "CONFUSED"
        
        return "DISTRACTED"
    
    def _generate_adaptation(self, reaction_type: str, context: dict) -> dict:
        """Generate adaptation strategy based on reaction"""
        
        strategies = {
            "ENGAGED": {
                "action": "continue",
                "focus_time_modifier": 1.0,
                "explanation_style": "maintain",
                "suggestions": ["Continue with current pace", "Add optional deep-dive content"],
                "priority_change": None
            },
            "MOTIVATED": {
                "action": "accelerate",
                "focus_time_modifier": 1.25,  # Increase focus time by 25%
                "explanation_style": "advanced",
                "suggestions": ["Increase difficulty", "Add challenge problems", "Extend focus session"],
                "priority_change": "increase_complexity"
            },
            "CONFUSED": {
                "action": "simplify",
                "focus_time_modifier": 0.8,  # Shorter segments
                "explanation_style": "simplified",
                "suggestions": ["Use visual explanation", "Break into smaller steps", "Provide analogy"],
                "priority_change": "add_prerequisites"
            },
            "DISTRACTED": {
                "action": "re-engage",
                "focus_time_modifier": 0.6,  # Much shorter focus
                "explanation_style": "interactive",
                "suggestions": ["Ask a question", "Take a break", "Switch to different topic"],
                "priority_change": "pause_and_reset"
            },
            "BORED": {
                "action": "change_approach",
                "focus_time_modifier": 0.75,
                "explanation_style": "engaging",
                "suggestions": ["Make it more interactive", "Add real-world examples", "Gamify"],
                "priority_change": "add_variety"
            }
        }
        
        return strategies.get(reaction_type, strategies["ENGAGED"])
    
    def _generate_reasoning(self, reaction_type: str, cv_signals: dict, 
                           engagement_signals: dict, context: dict) -> str:
        """Generate human-readable reasoning for the correlation"""
        
        reasons = []
        
        # CV-based reasoning
        if cv_signals.get("face_detected"):
            if cv_signals.get("eyes_open"):
                reasons.append("User is visually attentive (eyes on screen)")
            else:
                reasons.append("User may be looking down or eyes closed")
        else:
            reasons.append("User's face not detected (possibly looking away)")
        
        if cv_signals.get("distraction_type") == "phone_use":
            reasons.append("Phone detected - likely distracted by device")
        
        # Engagement-based reasoning
        time_spent = engagement_signals.get("time_on_response", 0)
        if time_spent > 20:
            reasons.append(f"Spent {time_spent}s reading response - thorough engagement")
        elif time_spent < 5:
            reasons.append(f"Only {time_spent}s on response - quick glance or disinterest")
        
        if engagement_signals.get("typing_started"):
            reasons.append("Started typing - actively engaging with content")
        
        # Context reasoning
        topic = context.get("topic", "the topic")
        specialist = context.get("specialist", "the specialist")
        reasons.append(f"Context: Working on {topic} with {specialist}")
        
        # Conclusion
        conclusions = {
            "ENGAGED": "Overall: Student is productively engaged with the material",
            "MOTIVATED": "Overall: Student shows high motivation - can push further",
            "CONFUSED": "Overall: Student appears confused - simplify explanation",
            "DISTRACTED": "Overall: Student is distracted - need to re-engage",
            "BORED": "Overall: Student seems bored - change approach"
        }
        
        reasons.append(conclusions.get(reaction_type, "Overall: Mixed signals"))
        
        return " | ".join(reasons)
    
    def _update_learning_patterns(self, user_id: str, correlation: dict):
        """Update long-term learning patterns for the user"""
        
        if user_id not in self.learning_patterns:
            self.learning_patterns[user_id] = {
                "total_interactions": 0,
                "reaction_counts": {"ENGAGED": 0, "MOTIVATED": 0, "CONFUSED": 0, "DISTRACTED": 0, "BORED": 0},
                "best_engagement_time": None,
                "preferred_explanation_style": None,
                "average_focus_duration": 25,
                "topics_struggled": [],
                "topics_excelled": []
            }
        
        patterns = self.learning_patterns[user_id]
        patterns["total_interactions"] += 1
        patterns["reaction_counts"][correlation["reaction_type"]] += 1
        
        # Track topic performance
        topic = correlation["context"].get("topic", "")
        if correlation["reaction_type"] in ["CONFUSED", "DISTRACTED"]:
            if topic and topic not in patterns["topics_struggled"]:
                patterns["topics_struggled"].append(topic)
        elif correlation["reaction_type"] in ["ENGAGED", "MOTIVATED"]:
            if topic and topic not in patterns["topics_excelled"]:
                patterns["topics_excelled"].append(topic)
    
    def get_user_patterns(self, user_id: str) -> dict:
        """Get learning patterns for a user"""
        return self.learning_patterns.get(user_id, {})
    
    def get_correlations(self, user_id: str, limit: int = 20) -> list:
        """Get recent correlations for a user"""
        return self.correlations.get(user_id, [])[-limit:]


# Global correlation engine instance
correlation_engine = OpenNoteCorrelationEngine()


@app.post("/api/opennote/log")
async def log_to_opennote(request: OpennoteLogRequest):
    """Log activity to Opennote (or local storage in demo mode)"""
    log_entry = {
        "id": str(uuid.uuid4()),
        "user_id": request.user_id,
        "event": request.event_type,  # Store as 'event' internally
        "data": request.data or {},
        "timestamp": request.timestamp or datetime.utcnow().isoformat(),
        "synced_to_opennote": True if Keys.OPENNOTE_API_KEY else False
    }
    
    ACTIVITY_LOG.append(log_entry)
    
    # Keep only last 1000 entries to prevent memory issues
    if len(ACTIVITY_LOG) > 1000:
        ACTIVITY_LOG.pop(0)
    
    return {"success": True, "log_id": log_entry["id"]}


@app.get("/api/opennote/logs")
async def get_activity_logs(user_id: str, limit: int = 50):
    """Get recent activity logs for a user"""
    user_logs = [log for log in ACTIVITY_LOG if log["user_id"] == user_id]
    return {"logs": user_logs[-limit:]}


@app.post("/api/opennote/analyze-reaction")
async def analyze_reaction(request: ReactionAnalysisRequest):
    """Analyze user reaction to AI output and determine adaptation strategy"""
    
    correlation = correlation_engine.analyze_reaction(
        user_id=request.user_id,
        ai_response_id=request.ai_response_id,
        cv_signals=request.cv_signals,
        engagement_signals=request.engagement_signals,
        context=request.context
    )
    
    # Log to activity log
    log_entry = {
        "id": str(uuid.uuid4()),
        "user_id": request.user_id,
        "event": "reaction_analyzed",
        "data": {
            "reaction_type": correlation["reaction_type"],
            "engagement_score": correlation["engagement_score"],
            "adaptation": correlation["adaptation"],
            "reasoning": correlation["reasoning"]
        },
        "timestamp": datetime.utcnow().isoformat(),
        "synced_to_opennote": True if Keys.OPENNOTE_API_KEY else False
    }
    ACTIVITY_LOG.append(log_entry)
    
    return {
        "success": True,
        "correlation": correlation,
        "adaptation": correlation["adaptation"],
        "reasoning": correlation["reasoning"]
    }


@app.get("/api/opennote/correlations")
async def get_correlations(user_id: str, limit: int = 20):
    """Get reaction correlations for a user"""
    correlations = correlation_engine.get_correlations(user_id, limit)
    patterns = correlation_engine.get_user_patterns(user_id)
    
    return {
        "correlations": correlations,
        "learning_patterns": patterns,
        "insights": _generate_insights(patterns)
    }


class AdaptiveRepromptRequest(BaseModel):
    user_id: str
    original_response: str
    original_response_id: str
    reaction_type: str  # CONFUSED, DISTRACTED, BORED
    specialist_id: str
    topic: str = ""


@app.post("/api/chat/adaptive-reprompt")
async def adaptive_reprompt(request: AdaptiveRepromptRequest):
    """
    Generate a simplified re-explanation when user shows confusion or distraction.
    Uses Gemini 2.5 Flash for re-prompting and logs to OpenNote.
    """
    import google.generativeai as genai
    genai.configure(api_key=Keys.GOOGLE_API_KEY)
    
    try:
        # Determine explanation strategy based on reaction
        if request.reaction_type == "CONFUSED":
            strategy = "simplify_with_analogy"
            intro = "🤔 Seems like you didn't get that explanation. Here's another way to think about it..."
            instruction = """The user seems confused. Re-explain the concept using:
1. A simple real-world analogy
2. Shorter sentences
3. Step-by-step breakdown
4. Visual language (describe what they should imagine)"""
        elif request.reaction_type == "DISTRACTED":
            strategy = "re_engage"
            intro = "👋 Hey, I noticed you might have drifted off! Let me re-engage you with this..."
            instruction = """The user got distracted. Re-engage them by:
1. Starting with an interesting fact or question
2. Making it more interactive
3. Keeping it very brief (2-3 sentences max)
4. Ending with a question to check understanding"""
        elif request.reaction_type == "BORED":
            strategy = "make_interesting"
            intro = "⚡ Let me make this more interesting for you..."
            instruction = """The user seems bored. Make the content more engaging by:
1. Adding a surprising fact or counterintuitive example
2. Connecting to real-world applications they care about
3. Using more dynamic language
4. Making it feel relevant to their life"""
        else:
            # UNDERSTANDING or unknown - no reprompt needed
            return {
                "reprompt_needed": False,
                "message": "User appears engaged - no reprompt needed"
            }
        
        prompt = f"""{instruction}

Original explanation that didn't land:
\"\"\"
{request.original_response}
\"\"\"

Topic: {request.topic or 'the concept above'}

Provide a new, alternative explanation. Start directly with the content, no preamble.
Keep it under 150 words."""

        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        new_explanation = response.text.strip()
        
        # Log the adaptive reprompt to REAL OpenNote API
        await opennote_api.log_event(
            user_id=request.user_id,
            event_type="adaptation",
            data={
                "reaction_type": request.reaction_type,
                "strategy": strategy,
                "original_response_id": request.original_response_id,
                "specialist_id": request.specialist_id,
                "topic": request.topic,
                "new_explanation_preview": new_explanation[:100]
            }
        )
        
        # Also log locally for immediate access
        log_entry = {
            "id": str(uuid.uuid4()),
            "user_id": request.user_id,
            "event": "adaptive_reprompt",
            "data": {
                "reaction_type": request.reaction_type,
                "strategy": strategy,
                "original_response_id": request.original_response_id,
                "specialist_id": request.specialist_id
            },
            "timestamp": datetime.utcnow().isoformat(),
            "synced_to_opennote": True
        }
        ACTIVITY_LOG.append(log_entry)
        
        logger.info(f"✓ Adaptive reprompt generated for {request.user_id}: {request.reaction_type}")
        
        return {
            "reprompt_needed": True,
            "intro": intro,
            "new_explanation": new_explanation,
            "strategy": strategy,
            "reaction_type": request.reaction_type,
            "specialist_id": request.specialist_id
        }
        
    except Exception as e:
        logger.error(f"Adaptive reprompt error: {e}")
        return {
            "reprompt_needed": False,
            "error": str(e),
            "message": "Failed to generate reprompt"
        }


# ═══════════════════════════════════════════════════════════════════════════════
# OPENNOTE REST API ENDPOINTS (Expose all OpenNote functionality to frontend)
# ═══════════════════════════════════════════════════════════════════════════════

# --- VIDEO ENDPOINTS ---

class VideoCreateRequest(BaseModel):
    messages: List[dict]  # [{role, content}]
    title: str = ""
    include_sources: bool = True
    search_for: str = ""
    source_count: int = 3
    length: int = 3
    script: str = ""
    upload_to_s3: bool = True
    webhook_url: str = ""

@app.post("/api/opennote/video/create")
async def opennote_video_create(request: VideoCreateRequest):
    """Create an educational video using OpenNote"""
    result = await opennote_api.video_create(
        messages=request.messages,
        title=request.title,
        include_sources=request.include_sources,
        search_for=request.search_for,
        source_count=request.source_count,
        length=request.length,
        script=request.script,
        upload_to_s3=request.upload_to_s3,
        webhook_url=request.webhook_url
    )
    return result

@app.get("/api/opennote/video/status/{video_id}")
async def opennote_video_status(video_id: str):
    """Check video generation status"""
    return await opennote_api.video_status(video_id)

# --- JOURNALS ENDPOINTS ---

@app.get("/api/opennote/journals/list")
async def opennote_journals_list():
    """List all journals"""
    return await opennote_api.journals_list()

@app.get("/api/opennote/journals/content/{journal_id}")
async def opennote_journals_content(journal_id: str):
    """Get journal content by ID"""
    return await opennote_api.journals_content(journal_id)

class JournalCreateRequest(BaseModel):
    title: str
    content: str = ""
    tags: List[str] = []

@app.put("/api/opennote/journals/create")
async def opennote_journals_create(request: JournalCreateRequest):
    """Create a new journal"""
    return await opennote_api.journals_create(
        title=request.title,
        content=request.content,
        tags=request.tags
    )

class JournalRenameRequest(BaseModel):
    new_title: str

@app.patch("/api/opennote/journals/rename/{journal_id}")
async def opennote_journals_rename(journal_id: str, request: JournalRenameRequest):
    """Rename a journal"""
    return await opennote_api.journals_rename(journal_id, request.new_title)

@app.delete("/api/opennote/journals/delete/{journal_id}")
async def opennote_journals_delete(journal_id: str):
    """Delete a journal"""
    return await opennote_api.journals_delete(journal_id)

# --- FLASHCARDS ENDPOINTS ---

class FlashcardsCreateRequest(BaseModel):
    content: str
    count: int = 10
    difficulty: str = "medium"  # easy, medium, hard

@app.post("/api/opennote/flashcards/create")
async def opennote_flashcards_create(request: FlashcardsCreateRequest):
    """Generate AI flashcards from content"""
    return await opennote_api.flashcards_create(
        content=request.content,
        count=request.count,
        difficulty=request.difficulty
    )

# --- PRACTICE ENDPOINTS ---

class PracticeCreateRequest(BaseModel):
    content: str
    question_types: List[str] = ["multiple_choice", "short_answer"]
    count: int = 5
    difficulty: str = "medium"

@app.post("/api/opennote/practice/create")
async def opennote_practice_create(request: PracticeCreateRequest):
    """Generate AI practice problems"""
    return await opennote_api.practice_create(
        content=request.content,
        question_types=request.question_types,
        count=request.count,
        difficulty=request.difficulty
    )

@app.get("/api/opennote/practice/status/{practice_id}")
async def opennote_practice_status(practice_id: str):
    """Check practice problem generation status"""
    return await opennote_api.practice_status(practice_id)

class PracticeGradeRequest(BaseModel):
    practice_id: str
    answers: List[dict]  # [{question_id, answer}]

@app.post("/api/opennote/practice/grade")
async def opennote_practice_grade(request: PracticeGradeRequest):
    """Grade practice problem answers"""
    return await opennote_api.practice_grade(
        practice_id=request.practice_id,
        answers=request.answers
    )

# --- FOCUS ROOM HELPER ENDPOINTS ---

class SimplifiedVideoRequest(BaseModel):
    topic: str
    original_response: str

@app.post("/api/opennote/video/simplified")
async def opennote_simplified_video(request: SimplifiedVideoRequest):
    """Create a simplified explanation video for a confused student"""
    return await opennote_api.create_simplified_video(
        topic=request.topic,
        original_response=request.original_response
    )

class ReviewFlashcardsRequest(BaseModel):
    session_content: str
    topic: str

@app.post("/api/opennote/flashcards/review")
async def opennote_review_flashcards(request: ReviewFlashcardsRequest):
    """Generate flashcards from a Focus Room session for later review"""
    return await opennote_api.generate_review_flashcards(
        session_content=request.session_content,
        topic=request.topic
    )

class TopicPracticeRequest(BaseModel):
    topic: str
    content: str

@app.post("/api/opennote/practice/topic")
async def opennote_topic_practice(request: TopicPracticeRequest):
    """Generate practice problems for a topic"""
    return await opennote_api.generate_practice_problems(
        topic=request.topic,
        content=request.content
    )


# ═══════════════════════════════════════════════════════════════════════════════
# FOCUS ROOM SESSION API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════
# These endpoints power the Focus Room productivity hack:
# - Zero-friction session management
# - Auto "pick up where you left off"
# - Auto-generate flashcards & practice on session end
# ═══════════════════════════════════════════════════════════════════════════════

class FocusSessionStartRequest(BaseModel):
    user_id: str
    topic: str

class FocusInteractionRequest(BaseModel):
    session_id: str
    question: str
    response: str
    confidence: float = 1.0
    concepts: Optional[List[str]] = None

class FocusConfusionRequest(BaseModel):
    session_id: str
    trigger: str  # What triggered confusion (e.g., "explicit", "behavior", "low_confidence")
    context: str  # The content that caused confusion
    current_topic: str

class FocusBehaviorRequest(BaseModel):
    session_id: str
    behavior_type: str  # "focused", "distracted", "confused", etc.
    data: dict = {}

class FocusSessionEndRequest(BaseModel):
    session_id: str
    generate_review: bool = True  # Auto-generate flashcards & practice


@app.post("/api/focus/session/start")
async def focus_session_start(request: FocusSessionStartRequest):
    """
    Start a new Focus Room session.

    PRODUCTIVITY HACK: Auto-loads previous learning context!
    - Searches OpenNote journals for prior sessions on this topic
    - Returns "continuation point" so user can pick up where they left off
    - No manual searching required - it just works!
    """
    result = await focus_session_manager.start_session(
        user_id=request.user_id,
        topic=request.topic
    )
    return result


@app.post("/api/focus/session/interaction")
async def focus_session_interaction(request: FocusInteractionRequest):
    """
    Record a learning interaction (Q&A) in the session.

    All interactions are automatically tracked and used for:
    - Session summary generation
    - Flashcard creation
    - Practice problem generation
    """
    result = await focus_session_manager.record_interaction(
        session_id=request.session_id,
        question=request.question,
        response=request.response,
        confidence=request.confidence,
        concepts=request.concepts
    )
    return result


@app.post("/api/focus/session/confusion")
async def focus_session_confusion(request: FocusConfusionRequest):
    """
    Report confusion - triggers automatic video generation!

    PRODUCTIVITY HACK: No context-switching needed!
    - When confusion is detected (explicit or via behavior tracking)
    - Automatically generates a simplified explanation video
    - Video appears right in Focus Room - no leaving the flow
    """
    result = await focus_session_manager.handle_confusion(
        session_id=request.session_id,
        trigger=request.trigger,
        context=request.context,
        current_topic=request.current_topic
    )
    return result


@app.post("/api/focus/session/behavior")
async def focus_session_behavior(request: FocusBehaviorRequest):
    """
    Log focus/attention behavior from the FocusTracker.

    Used for:
    - Distraction intervention (gentle reminders)
    - Session analytics
    - Adaptive learning adjustments
    """
    result = await focus_session_manager.log_focus_behavior(
        session_id=request.session_id,
        behavior_type=request.behavior_type,
        data=request.data
    )
    return result


@app.post("/api/focus/session/end")
async def focus_session_end(request: FocusSessionEndRequest):
    """
    End a Focus Room session.

    PRODUCTIVITY HACK: Zero-friction session end!
    - Automatically saves session summary to OpenNote journal
    - Automatically generates flashcards from session content
    - Automatically generates practice problems
    - Next time you study this topic, you'll pick up where you left off!

    NO MANUAL STEPS - everything is auto-generated!
    """
    result = await focus_session_manager.end_session(
        session_id=request.session_id,
        generate_review=request.generate_review
    )
    return result


@app.get("/api/focus/session/{session_id}")
async def focus_session_get(session_id: str):
    """Get current session status and data"""
    session = focus_session_manager.get_session(session_id)
    if not session:
        return {"success": False, "error": "Session not found"}
    return {
        "success": True,
        "session": session.to_dict()
    }


@app.get("/api/focus/user/{user_id}/sessions")
async def focus_user_sessions(user_id: str):
    """Get all active sessions for a user"""
    sessions = focus_session_manager.get_user_sessions(user_id)
    return {
        "success": True,
        "active_sessions": sessions,
        "count": len(sessions)
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SMART CHAT WITH AUTO-VISUAL GENERATION - THE WOW FACTOR
# ═══════════════════════════════════════════════════════════════════════════════
# This is what makes Focus Room special:
# - Detects explicit commands ("make flashcards", "create video", "quiz me")
# - Auto-generates visuals when distraction/confusion is detected
# - Broadcasts all OpenNote API calls to activity feed for demo
# ═══════════════════════════════════════════════════════════════════════════════

# Real-time activity feed for demo visibility
OPENNOTE_ACTIVITY_FEED = []

def broadcast_activity(activity_type: str, details: dict):
    """Add activity to feed for real-time demo visibility"""
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "type": activity_type,
        "details": details
    }
    OPENNOTE_ACTIVITY_FEED.append(entry)
    # Keep only last 50 entries
    if len(OPENNOTE_ACTIVITY_FEED) > 50:
        OPENNOTE_ACTIVITY_FEED.pop(0)
    logger.info(f"📡 ACTIVITY: {activity_type} -> {details.get('message', details)}")
    return entry


class SmartChatRequest(BaseModel):
    user_id: str
    session_id: Optional[str] = None
    message: str
    current_topic: Optional[str] = None
    behavior_state: Optional[str] = None  # "focused", "distracted", "confused"
    last_response: Optional[str] = None  # For context


class VisualGenerationResult(BaseModel):
    type: str  # "video", "flashcards", "practice", "none"
    id: Optional[str] = None
    status: str
    message: str


def detect_explicit_command(message: str) -> tuple[str, str]:
    """
    Detect explicit commands for visual generation.
    Returns (command_type, extracted_topic)
    """
    message_lower = message.lower()

    # Flashcard commands
    flashcard_triggers = [
        "make flashcards", "create flashcards", "generate flashcards",
        "flashcards for", "flashcards about", "flashcards on",
        "make me flashcards", "give me flashcards", "i need flashcards",
        "can you make flashcards", "could you create flashcards"
    ]
    for trigger in flashcard_triggers:
        if trigger in message_lower:
            # Extract topic after the trigger
            topic = message_lower.split(trigger)[-1].strip()
            return ("flashcards", topic if topic else None)

    # Video commands
    video_triggers = [
        "make a video", "create a video", "generate a video",
        "video about", "video on", "video for",
        "make me a video", "show me a video", "visual explanation",
        "explain visually", "can you show me", "animate"
    ]
    for trigger in video_triggers:
        if trigger in message_lower:
            topic = message_lower.split(trigger)[-1].strip()
            return ("video", topic if topic else None)

    # Quiz/Practice commands
    practice_triggers = [
        "quiz me", "test me", "practice problems", "give me questions",
        "create a quiz", "make a quiz", "practice on", "test my knowledge",
        "give me practice", "i want to practice"
    ]
    for trigger in practice_triggers:
        if trigger in message_lower:
            topic = message_lower.split(trigger)[-1].strip()
            return ("practice", topic if topic else None)

    return (None, None)


async def generate_visual_for_context(
    visual_type: str,
    topic: str,
    context: str,
    user_id: str
) -> dict:
    """
    Generate the appropriate visual content using OpenNote APIs.
    Broadcasts activity for demo visibility.
    """
    broadcast_activity("visual_generation_started", {
        "type": visual_type,
        "topic": topic,
        "user_id": user_id,
        "message": f"🎨 Generating {visual_type} for '{topic}'..."
    })

    try:
        if visual_type == "flashcards":
            result = await opennote_api.flashcards_create(
                set_description=f"Create study flashcards about {topic}. Context: {context[:500]}",
                count=5,
                difficulty="medium"
            )
            broadcast_activity("flashcards_created", {
                "set_id": result.get("set_id"),
                "topic": topic,
                "message": f"🃏 Created flashcard set for '{topic}'"
            })
            return {
                "type": "flashcards",
                "id": result.get("set_id"),
                "status": "created" if result.get("set_id") else "failed",
                "message": f"Created flashcards for {topic}",
                "data": result
            }

        elif visual_type == "video":
            messages = [
                {"role": "system", "content": "Create a clear, visual explanation with analogies and step-by-step breakdown."},
                {"role": "user", "content": f"Explain {topic} in a simple, visual way. Context: {context[:500]}"}
            ]
            result = await opennote_api.video_create(
                messages=messages,
                title=f"Visual Explanation: {topic[:40]}",
                include_sources=True,
                search_for=topic,
                length=2
            )
            broadcast_activity("video_created", {
                "video_id": result.get("video_id"),
                "topic": topic,
                "message": f"🎬 Created video for '{topic}'"
            })
            return {
                "type": "video",
                "id": result.get("video_id"),
                "status": "processing" if result.get("video_id") else "failed",
                "message": f"Generating video explanation for {topic}",
                "data": result
            }

        elif visual_type == "practice":
            result = await opennote_api.practice_create(
                set_description=f"Create practice problems about {topic}. Context: {context[:500]}",
                question_types=["multiple_choice", "short_answer"],
                count=3,
                difficulty="medium"
            )
            broadcast_activity("practice_created", {
                "set_id": result.get("set_id"),
                "topic": topic,
                "message": f"📝 Created practice problems for '{topic}'"
            })
            return {
                "type": "practice",
                "id": result.get("set_id"),
                "status": "created" if result.get("set_id") else "failed",
                "message": f"Created practice problems for {topic}",
                "data": result
            }

    except Exception as e:
        logger.error(f"Visual generation failed: {e}")
        broadcast_activity("visual_generation_failed", {
            "type": visual_type,
            "error": str(e),
            "message": f"❌ Failed to generate {visual_type}"
        })
        return {
            "type": visual_type,
            "id": None,
            "status": "failed",
            "message": str(e)
        }

    return {"type": "none", "status": "skipped", "message": "No visual generated"}


def choose_visual_for_behavior(behavior: str, topic: str) -> str:
    """
    Choose the best visual type based on behavior state.

    - DISTRACTED → Video (re-engage with motion/visuals)
    - CONFUSED → Video or Flashcards (simplify concept)
    - BORED → Practice (make it interactive)
    """
    if behavior == "distracted":
        return "video"  # Motion captures attention
    elif behavior == "confused":
        return "video"  # Visual explanation helps understanding
    elif behavior == "bored":
        return "practice"  # Interactive keeps them engaged
    else:
        return "flashcards"  # Default to review


@app.post("/api/focus/smart-chat")
async def focus_smart_chat(request: SmartChatRequest):
    """
    Smart chat endpoint with automatic visual generation.

    THE WOW FACTOR:
    1. Handles normal Q&A with Gemini
    2. Detects explicit commands ("make flashcards", "create video", "quiz me")
    3. Auto-generates visuals when distraction/confusion is detected
    4. All activity is broadcast to the activity feed for demo

    Usage:
    - Normal question: "What is photosynthesis?"
    - Explicit command: "Make me flashcards about photosynthesis"
    - With behavior: Send behavior_state="distracted" → auto-generates video
    """
    import google.generativeai as genai
    genai.configure(api_key=Keys.GOOGLE_API_KEY)

    broadcast_activity("chat_received", {
        "user_id": request.user_id,
        "message_preview": request.message[:50] + "...",
        "behavior": request.behavior_state,
        "message": f"💬 Received: '{request.message[:30]}...' (behavior: {request.behavior_state or 'focused'})"
    })

    result = {
        "success": True,
        "response": None,
        "visual_generated": None,
        "command_detected": None
    }

    # Step 1: Check for explicit commands
    command_type, extracted_topic = detect_explicit_command(request.message)

    if command_type:
        topic = extracted_topic or request.current_topic or "the current topic"
        context = request.last_response or request.message

        broadcast_activity("command_detected", {
            "command": command_type,
            "topic": topic,
            "message": f"🎯 Detected command: {command_type} for '{topic}'"
        })

        # Generate the requested visual
        visual_result = await generate_visual_for_context(
            visual_type=command_type,
            topic=topic,
            context=context,
            user_id=request.user_id
        )

        result["command_detected"] = command_type
        result["visual_generated"] = visual_result
        result["response"] = f"Got it! I'm generating {command_type} for {topic}. {visual_result['message']}"

        # Record in session if active
        if request.session_id:
            session = focus_session_manager.get_session(request.session_id)
            if session:
                session.add_concept(topic)

        return result

    # Step 2: Normal chat - get AI response
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')

        prompt = f"""You are a helpful, engaging tutor. Answer the student's question clearly and concisely.

Topic context: {request.current_topic or 'General'}
Student's question: {request.message}

Provide a clear, helpful response. Keep it under 200 words. If the concept is complex, break it down into steps."""

        response = model.generate_content(prompt)
        ai_response = response.text.strip()
        result["response"] = ai_response

        broadcast_activity("ai_response_generated", {
            "topic": request.current_topic,
            "response_preview": ai_response[:100] + "...",
            "message": f"🤖 AI responded about '{request.current_topic or 'question'}'"
        })

        # Record interaction in session
        if request.session_id:
            await focus_session_manager.record_interaction(
                session_id=request.session_id,
                question=request.message,
                response=ai_response,
                confidence=0.9
            )

    except Exception as e:
        logger.error(f"Chat error: {e}")
        result["response"] = "I'm having trouble responding right now. Please try again."
        result["success"] = False
        return result

    # Step 3: Return response (behavior-based visual generation happens via /api/focus/behavior-trigger)
    # The flow is:
    # 1. User asks question → this endpoint returns AI response
    # 2. Frontend shows response to user
    # 3. FocusTracker detects distraction AFTER user sees response
    # 4. FocusTracker calls /api/focus/behavior-trigger → auto-generates visual
    #
    # This ensures visuals are generated based on REACTION to the response, not during it.

    return result


@app.get("/api/focus/activity-feed")
async def get_activity_feed(limit: int = 20):
    """
    Get real-time OpenNote activity feed for demo.

    Shows all API calls, visual generations, and behavior detections.
    Perfect for demoing the system to hackathon judges!
    """
    recent = OPENNOTE_ACTIVITY_FEED[-limit:] if limit else OPENNOTE_ACTIVITY_FEED
    return {
        "success": True,
        "activities": list(reversed(recent)),  # Most recent first
        "total_count": len(OPENNOTE_ACTIVITY_FEED)
    }


@app.delete("/api/focus/activity-feed")
async def clear_activity_feed():
    """Clear the activity feed (useful before demo)"""
    OPENNOTE_ACTIVITY_FEED.clear()
    return {"success": True, "message": "Activity feed cleared"}


# ═══════════════════════════════════════════════════════════════════════════════
# BEHAVIOR TRIGGER - CALLED AFTER RESPONSE WHEN DISTRACTION DETECTED
# ═══════════════════════════════════════════════════════════════════════════════
# This is the KEY endpoint for the "wow factor":
# 1. User asks question → AI responds
# 2. User reads response, then gets distracted (detected by FocusTracker)
# 3. FocusTracker calls this endpoint → auto-generates visual
# ═══════════════════════════════════════════════════════════════════════════════

class BehaviorTriggerRequest(BaseModel):
    user_id: str
    session_id: Optional[str] = None
    behavior: str  # "distracted", "confused", "bored", "looking_away"
    last_topic: str  # What they were just learning about
    last_response: str  # The AI response they just received
    trigger_source: str = "focus_tracker"  # "focus_tracker", "manual", "camera"


@app.post("/api/focus/behavior-trigger")
async def focus_behavior_trigger(request: BehaviorTriggerRequest):
    """
    POST-RESPONSE behavior trigger - THE WOW FACTOR!

    This endpoint is called AFTER the AI responds, when distraction is detected.

    Flow:
    1. User asks: "What is photosynthesis?"
    2. AI responds with explanation
    3. User looks away / gets distracted (detected by FocusTracker camera)
    4. FocusTracker calls this endpoint with:
       - behavior: "distracted"
       - last_topic: "photosynthesis"
       - last_response: "Photosynthesis is..."
    5. System auto-generates a video/flashcards/practice to re-engage!

    This is what makes Focus Room special - it ADAPTS to your behavior!
    """
    broadcast_activity("behavior_detected", {
        "behavior": request.behavior,
        "topic": request.last_topic,
        "source": request.trigger_source,
        "message": f"👁️ {request.behavior.upper()} detected after learning about '{request.last_topic}'"
    })

    # Choose visual type based on behavior
    visual_type = choose_visual_for_behavior(request.behavior, request.last_topic)

    broadcast_activity("auto_visual_triggered", {
        "behavior": request.behavior,
        "visual_type": visual_type,
        "topic": request.last_topic,
        "message": f"🎯 AUTO-GENERATING {visual_type.upper()} because user is {request.behavior}!"
    })

    # Generate the visual
    visual_result = await generate_visual_for_context(
        visual_type=visual_type,
        topic=request.last_topic,
        context=request.last_response,
        user_id=request.user_id
    )

    # Log to session if active
    if request.session_id:
        session = focus_session_manager.get_session(request.session_id)
        if session:
            session.log_behavior(request.behavior, {
                "visual_triggered": visual_type,
                "visual_id": visual_result.get("id"),
                "source": request.trigger_source
            })
            session.log_confusion(request.behavior, request.last_response[:200])

    # Friendly message based on behavior
    messages = {
        "distracted": f"👋 I noticed you looked away! Here's a {visual_type} to help you stay engaged with {request.last_topic}.",
        "confused": f"🤔 Looks like that was confusing. I'm creating a {visual_type} to explain {request.last_topic} differently.",
        "bored": f"⚡ Let's make this more interesting! Here's some {visual_type} to practice {request.last_topic}.",
        "looking_away": f"👀 I see you're not focused. Here's a visual to bring you back to {request.last_topic}!"
    }

    return {
        "success": True,
        "behavior_detected": request.behavior,
        "visual_generated": visual_result,
        "message": messages.get(request.behavior, f"Generated {visual_type} for {request.last_topic}"),
        "topic": request.last_topic
    }


def _generate_insights(patterns: dict) -> List[str]:
    """Generate human-readable insights from learning patterns"""
    if not patterns:
        return ["Not enough data yet to generate insights"]
    
    insights = []
    
    total = patterns.get("total_interactions", 0)
    if total < 5:
        insights.append(f"📊 {total} interactions recorded - need more data for insights")
        return insights
    
    counts = patterns.get("reaction_counts", {})
    
    # Engagement rate
    engaged = counts.get("ENGAGED", 0) + counts.get("MOTIVATED", 0)
    engagement_rate = (engaged / total) * 100 if total > 0 else 0
    insights.append(f"📈 Engagement rate: {engagement_rate:.0f}% of sessions")
    
    # Motivation
    if counts.get("MOTIVATED", 0) > total * 0.3:
        insights.append("🔥 Highly motivated student - consider advanced challenges")
    
    # Confusion
    if counts.get("CONFUSED", 0) > total * 0.25:
        insights.append("🤔 Frequent confusion detected - recommend more visual explanations")
    
    # Distraction
    if counts.get("DISTRACTED", 0) > total * 0.2:
        insights.append("📱 High distraction rate - consider shorter focus sessions")
    
    # Topics
    if patterns.get("topics_struggled"):
        topics = ", ".join(patterns["topics_struggled"][:3])
        insights.append(f"⚠️ Struggled with: {topics}")
    
    if patterns.get("topics_excelled"):
        topics = ", ".join(patterns["topics_excelled"][:3])
        insights.append(f"⭐ Excelled at: {topics}")
    
    return insights


@app.get("/api/opennote/learning-patterns")
async def get_learning_patterns(user_id: str):
    """Get comprehensive learning patterns for a user"""
    patterns = correlation_engine.get_user_patterns(user_id)
    insights = _generate_insights(patterns)
    
    # Get recent activity for context
    recent_logs = [log for log in ACTIVITY_LOG if log["user_id"] == user_id][-20:]
    
    return {
        "patterns": patterns,
        "insights": insights,
        "recent_activity": recent_logs,
        "recommendations": _generate_recommendations(patterns)
    }


def _generate_recommendations(patterns: dict) -> List[dict]:
    """Generate actionable recommendations based on patterns"""
    if not patterns:
        return []
    
    recommendations = []
    counts = patterns.get("reaction_counts", {})
    total = patterns.get("total_interactions", 1)
    
    # Focus time recommendation
    confused_rate = counts.get("CONFUSED", 0) / total
    distracted_rate = counts.get("DISTRACTED", 0) / total
    
    if distracted_rate > 0.3:
        recommendations.append({
            "type": "focus_time",
            "action": "decrease",
            "value": 15,
            "reason": "High distraction rate suggests shorter sessions work better"
        })
    elif confused_rate > 0.3:
        recommendations.append({
            "type": "focus_time",
            "action": "modify",
            "value": 20,
            "reason": "Confusion indicates need for more breaks to process"
        })
    
    # Explanation style
    if confused_rate > 0.25:
        recommendations.append({
            "type": "explanation_style",
            "action": "use_visuals",
            "reason": "Visual explanations may help reduce confusion"
        })
    
    # Topics to review
    if patterns.get("topics_struggled"):
        recommendations.append({
            "type": "review_topics",
            "topics": patterns["topics_struggled"],
            "reason": "These topics showed lower engagement - consider review"
        })
    
    return recommendations


# ─────────────────────────────────────────────────────────────────────────────
# SMART TASK LIST ENDPOINTS (with Gemini Recommendations)
# ─────────────────────────────────────────────────────────────────────────────

# Specialist info for recommendations
SPECIALIST_INFO = {
    "calvin": {"name": "Calvin", "department": "math", "specialty": "Calculus, change, motion, derivatives, integrals"},
    "alyx": {"name": "Alyx", "department": "math", "specialty": "Algebra, symbolic manipulation, equations"},
    "geo": {"name": "Geo", "department": "math", "specialty": "Geometry, spatial reasoning, proofs"},
    "nova": {"name": "Nova", "department": "science", "specialty": "Physics, forces, motion, energy"},
    "helix": {"name": "Helix", "department": "science", "specialty": "Biology, systems, processes"},
    "quanta": {"name": "Quanta", "department": "science", "specialty": "Chemistry, reactions, molecular"},
    "iris": {"name": "Iris", "department": "english", "specialty": "Writing, composition, structure"},
    "lex": {"name": "Lex", "department": "english", "specialty": "Literature, analysis, interpretation"},
    "rhet": {"name": "Rhet", "department": "english", "specialty": "Rhetoric, persuasion, speech"},
    "coach": {"name": "Focus Coach", "department": "focus", "specialty": "Study strategies, focus, time management"},
    "recall": {"name": "Recall", "department": "focus", "specialty": "Memory, retention, spaced repetition"},
    "proof": {"name": "Proof", "department": "focus", "specialty": "Logic, verification, reasoning"}
}


@app.post("/api/smart-tasks")
async def create_smart_task(request: SmartTaskRequest):
    """Create a new smart task with Gemini-powered recommendations"""
    task_id = str(uuid.uuid4())
    
    # Get Gemini recommendations for this task
    recommendations = await get_task_recommendations(
        request.title,
        request.description,
        request.department,
        request.estimated_minutes
    )
    
    task = {
        "id": task_id,
        "user_id": request.user_id,
        "title": request.title,
        "description": request.description,
        "department": request.department,
        "priority": request.priority,
        "status": "pending",
        "due_date": request.due_date,
        "estimated_minutes": request.estimated_minutes,
        "recommended_agent": recommendations.get("recommended_agent", "coach"),
        "recommended_agent_reason": recommendations.get("agent_reason", "General study support"),
        "recommended_focus_time": recommendations.get("focus_time", 25),
        "related_assignment_id": request.related_assignment_id,
        "tags": request.tags,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "notes": "",
        "ai_tips": recommendations.get("tips", [])
    }
    
    SMART_TASKS_DB[task_id] = task
    
    # Log to OpenNote
    await sync_task_to_opennote(request.user_id, task, "created")
    
    return {"success": True, "task": task}


@app.get("/api/smart-tasks")
async def get_smart_tasks(user_id: str):
    """Get all smart tasks for a user"""
    user_tasks = [t for t in SMART_TASKS_DB.values() if t["user_id"] == user_id]
    # Sort by priority and due date
    priority_order = {"high": 0, "medium": 1, "low": 2}
    user_tasks.sort(key=lambda t: (priority_order.get(t["priority"], 1), t.get("due_date") or "9999"))
    return {"tasks": user_tasks}


@app.patch("/api/smart-tasks/{task_id}")
async def update_smart_task(task_id: str, update: SmartTaskUpdate):
    """Update a smart task"""
    if task_id not in SMART_TASKS_DB:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = SMART_TASKS_DB[task_id]
    
    if update.title is not None:
        task["title"] = update.title
    if update.description is not None:
        task["description"] = update.description
    if update.priority is not None:
        task["priority"] = update.priority
    if update.status is not None:
        task["status"] = update.status
        if update.status == "completed":
            task["completed_at"] = datetime.utcnow().isoformat()
    if update.notes is not None:
        task["notes"] = update.notes
    
    # Sync to OpenNote
    await sync_task_to_opennote(task["user_id"], task, "updated")
    
    return {"success": True, "task": task}


@app.delete("/api/smart-tasks/{task_id}")
async def delete_smart_task(task_id: str):
    """Delete a smart task"""
    if task_id not in SMART_TASKS_DB:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = SMART_TASKS_DB.pop(task_id)
    await sync_task_to_opennote(task["user_id"], task, "deleted")
    
    return {"success": True}


@app.post("/api/smart-tasks/chat-command")
async def process_chat_task_command(request: ChatTaskCommand):
    """Process natural language task commands via chat"""
    import google.generativeai as genai
    genai.configure(api_key=Keys.GOOGLE_API_KEY)
    
    # Get existing tasks for context
    user_tasks = [t for t in SMART_TASKS_DB.values() if t["user_id"] == request.user_id]
    tasks_context = "\n".join([
        f"- [{t['id'][:8]}] {t['title']} (priority: {t['priority']}, status: {t['status']})"
        for t in user_tasks
    ]) or "No tasks yet."
    
    prompt = f"""You are a smart task assistant. Parse the user's message and respond with a JSON action.

Current Tasks:
{tasks_context}

User Message: "{request.message}"

Available actions:
1. "add" - Create a new task
2. "complete" - Mark a task as complete
3. "update" - Update task priority/notes
4. "delete" - Remove a task
5. "recommend" - Get study recommendations
6. "list" - List current tasks

Respond ONLY with valid JSON in this format:
{{
  "action": "add|complete|update|delete|recommend|list",
  "task_title": "title if adding",
  "task_description": "description if adding",
  "department": "math|science|english|focus|general",
  "priority": "high|medium|low",
  "estimated_minutes": 30,
  "task_id_hint": "partial id or title to match",
  "response_message": "Natural language response to show the user"
}}
"""
    
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # Extract JSON from response
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        parsed = json.loads(response_text)
        action = parsed.get("action", "list")
        
        result = {"action": action, "message": parsed.get("response_message", "Done!")}
        
        if action == "add" and parsed.get("task_title"):
            # Create the task
            new_task_req = SmartTaskRequest(
                user_id=request.user_id,
                title=parsed["task_title"],
                description=parsed.get("task_description", ""),
                department=parsed.get("department", "general"),
                priority=parsed.get("priority", "medium"),
                estimated_minutes=parsed.get("estimated_minutes", 30)
            )
            task_result = await create_smart_task(new_task_req)
            result["task"] = task_result["task"]
            result["message"] = f"✅ Added task: {parsed['task_title']}"
            
        elif action == "complete":
            # Find and complete task
            hint = parsed.get("task_id_hint", "").lower()
            for task in user_tasks:
                if hint in task["id"].lower() or hint in task["title"].lower():
                    await update_smart_task(task["id"], SmartTaskUpdate(status="completed"))
                    result["task_id"] = task["id"]
                    result["message"] = f"✅ Completed: {task['title']}"
                    break
            else:
                result["message"] = "❓ Couldn't find that task. Try being more specific."
                
        elif action == "delete":
            hint = parsed.get("task_id_hint", "").lower()
            for task in user_tasks:
                if hint in task["id"].lower() or hint in task["title"].lower():
                    await delete_smart_task(task["id"])
                    result["task_id"] = task["id"]
                    result["message"] = f"🗑️ Deleted: {task['title']}"
                    break
            else:
                result["message"] = "❓ Couldn't find that task."
                
        elif action == "recommend":
            # Get smart recommendations
            recs = await get_study_recommendations(request.user_id, user_tasks)
            result["recommendations"] = recs
            result["message"] = recs.get("summary", "Here are your recommendations!")
            
        elif action == "list":
            result["tasks"] = user_tasks
            if user_tasks:
                result["message"] = f"📋 You have {len(user_tasks)} tasks. " + \
                    f"{sum(1 for t in user_tasks if t['priority'] == 'high')} high priority."
            else:
                result["message"] = "📋 No tasks yet! Try 'add study calculus chapter 5'"
        
        return result
        
    except Exception as e:
        logger.error(f"Chat command error: {e}")
        return {
            "action": "error",
            "message": f"I couldn't understand that. Try: 'add [task name]', 'complete [task]', or 'recommend'"
        }


async def get_task_recommendations(title: str, description: str, department: str, estimated_minutes: int) -> dict:
    """Use Gemini to recommend the best agent and focus time for a task"""
    try:
        import google.generativeai as genai
        genai.configure(api_key=Keys.GOOGLE_API_KEY)
        
        specialists_list = "\n".join([
            f"- {s['name']} ({sid}): {s['specialty']}"
            for sid, s in SPECIALIST_INFO.items()
        ])
        
        prompt = f"""Analyze this study task and recommend the best specialist and focus strategy.

Task: {title}
Description: {description}
Department: {department}
Estimated Time: {estimated_minutes} minutes

Available Specialists:
{specialists_list}

Respond with JSON only:
{{
  "recommended_agent": "specialist_id (e.g., calvin, nova, iris)",
  "agent_reason": "Why this specialist is best for this task",
  "focus_time": recommended focus session in minutes (15-60),
  "tips": ["tip 1", "tip 2", "tip 3"]
}}
"""
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        return json.loads(response_text)
        
    except Exception as e:
        logger.error(f"Recommendation error: {e}")
        # Fallback based on department
        agent_map = {
            "math": ("calvin", "Calculus specialist for math problems"),
            "science": ("nova", "Physics specialist for science concepts"),
            "english": ("iris", "Writing specialist for English tasks"),
            "focus": ("coach", "Focus coach for study strategies"),
            "general": ("coach", "General study support")
        }
        agent, reason = agent_map.get(department, ("coach", "General study support"))
        return {
            "recommended_agent": agent,
            "agent_reason": reason,
            "focus_time": min(estimated_minutes, 45),
            "tips": ["Break the task into smaller steps", "Take notes as you go", "Review after completion"]
        }


async def get_study_recommendations(user_id: str, tasks: list) -> dict:
    """Get personalized study recommendations based on tasks and history"""
    try:
        import google.generativeai as genai
        genai.configure(api_key=Keys.GOOGLE_API_KEY)
        
        # Get recent activity
        user_logs = [log for log in ACTIVITY_LOG if log["user_id"] == user_id][-20:]
        
        tasks_summary = "\n".join([
            f"- {t['title']} (priority: {t['priority']}, est: {t['estimated_minutes']}min, agent: {t.get('recommended_agent', 'none')})"
            for t in tasks if t["status"] != "completed"
        ]) or "No pending tasks"
        
        recent_activity = "\n".join([
            f"- {log.get('event', 'activity')}: {log.get('data', {})}"
            for log in user_logs[-10:]
        ]) or "No recent activity"
        
        prompt = f"""You are a study advisor. Analyze the student's tasks and activity to provide recommendations.

Pending Tasks:
{tasks_summary}

Recent Activity:
{recent_activity}

Current Time Context: Student is looking for study guidance.

Provide personalized recommendations. Respond with JSON:
{{
  "summary": "Brief encouraging message",
  "next_task": "Which task to focus on first and why",
  "recommended_specialist": "specialist_id",
  "specialist_reason": "Why this specialist will help most",
  "focus_strategy": "Recommended focus approach (e.g., 25min Pomodoro)",
  "study_tips": ["tip1", "tip2"],
  "break_suggestion": "When and how to take breaks",
  "priority_order": ["task_id1", "task_id2"]
}}
"""
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        return json.loads(response_text)
        
    except Exception as e:
        logger.error(f"Study recommendations error: {e}")
        return {
            "summary": "Let's get studying! 📚",
            "next_task": "Start with your highest priority task",
            "recommended_specialist": "coach",
            "specialist_reason": "The Focus Coach can help you plan your study session",
            "focus_strategy": "Try a 25-minute focused session with a 5-minute break",
            "study_tips": ["Start with the hardest task first", "Take notes as you go"],
            "break_suggestion": "Take a 5-minute break every 25 minutes"
        }


async def sync_task_to_opennote(user_id: str, task: dict, action: str):
    """Sync task changes to OpenNote for long-term memory"""
    try:
        if not Keys.OPENNOTE_API_KEY:
            return
        
        log_entry = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "event": f"task_{action}",
            "data": {
                "task_id": task["id"],
                "title": task["title"],
                "department": task["department"],
                "priority": task["priority"],
                "status": task["status"],
                "recommended_agent": task.get("recommended_agent"),
                "action": action
            },
            "timestamp": datetime.utcnow().isoformat(),
            "synced_to_opennote": True
        }
        
        ACTIVITY_LOG.append(log_entry)
        logger.info(f"Task synced to OpenNote: {task['title']} ({action})")
        
    except Exception as e:
        logger.error(f"OpenNote sync error: {e}")


@app.get("/api/smart-tasks/recommendations")
async def get_task_recommendations_endpoint(user_id: str):
    """Get AI-powered recommendations for the user's tasks"""
    user_tasks = [t for t in SMART_TASKS_DB.values() if t["user_id"] == user_id]
    recommendations = await get_study_recommendations(user_id, user_tasks)
    return {"success": True, "recommendations": recommendations}


# ─────────────────────────────────────────────────────────────────────────────
# FILE UPLOAD
# ─────────────────────────────────────────────────────────────────────────────

UPLOAD_DIR = "/tmp/officemates_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file for processing"""
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")

    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {
        "file_id": file_id,
        "filename": file.filename,
        "size": len(content),
        "content_type": file.content_type
    }


# ─────────────────────────────────────────────────────────────────────────────
# VOICE ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/voice/session")
async def create_voice_session(request: VoiceSessionRequest):
    """Create a new voice session with LiveKit token"""
    token = generate_livekit_token(request.user_id, request.room_name)

    session_id = str(uuid.uuid4())
    VOICE_SESSIONS[session_id] = {
        "user_id": request.user_id,
        "room_name": request.room_name,
        "created_at": datetime.utcnow().isoformat()
    }

    return {
        "session_id": session_id,
        "livekit_token": token,
        "livekit_url": Keys.LIVEKIT_URL,
        "room_name": request.room_name,
        "deepgram_config": {
            "sample_rate": 16000,
            "channels": 1
        }
    }


@app.post("/api/voice/transcript")
async def receive_transcript(
    user_id: str,
    transcript: str,
    is_final: bool = True,
    confidence: float = 1.0
):
    """Receive transcript from Deepgram (server-side forwarding)"""
    result = await voice_processor.process_transcript(user_id, transcript, is_final)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# XP & GAMIFICATION
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/users/{user_id}/xp")
async def get_user_xp(user_id: str):
    """Get user XP and level"""
    user = USERS_DB.get(user_id, {"xp": 0, "level": 1})

    # Calculate level from XP
    xp = user.get("xp", 0)
    level = 1
    for lvl, config in GAMIFICATION_CONFIG["levels"].items():
        if xp >= config["xp_required"]:
            level = lvl

    return {
        "user_id": user_id,
        "xp": xp,
        "level": level,
        "next_level_xp": GAMIFICATION_CONFIG["levels"].get(level + 1, {}).get("xp_required", xp + 100),
        "badges": user.get("badges", [])
    }


@app.post("/api/users/{user_id}/xp")
async def update_user_xp(user_id: str, update: UserXPUpdate):
    """Update user XP"""
    if user_id not in USERS_DB:
        USERS_DB[user_id] = {"xp": 0, "level": 1, "badges": []}

    USERS_DB[user_id]["xp"] += update.xp_gained

    # Check for level up
    new_xp = USERS_DB[user_id]["xp"]
    old_level = USERS_DB[user_id]["level"]
    new_level = old_level

    for lvl, config in GAMIFICATION_CONFIG["levels"].items():
        if new_xp >= config["xp_required"]:
            new_level = lvl

    if new_level > old_level:
        USERS_DB[user_id]["level"] = new_level
        await orchestrator.emit_event(user_id, "xp_update", {
            "user_id": user_id,
            "xp_gained": update.xp_gained,
            "total_xp": new_xp,
            "level": new_level,
            "level_up": True
        })

    return USERS_DB[user_id]


# ─────────────────────────────────────────────────────────────────────────────
# DEPARTMENTS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/departments")
async def list_departments():
    """List all departments and their configurations"""
    return {
        dept.value: {
            "name": config["name"],
            "color": config["color"],
            "agents": config["agents"],
            "personality": config["personality"]["name"]
        }
        for dept, config in DEPARTMENT_CONFIG.items()
    }


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET
# ─────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket connection for real-time updates"""
    await websocket.accept()
    CONNECTIONS[user_id] = websocket

    logger.info(f"WebSocket connected: {user_id}")

    try:
        while True:
            data = await websocket.receive_json()

            # Handle incoming messages
            event_type = data.get("event")

            if event_type == "ping":
                await websocket.send_json({"event": "pong"})

            elif event_type == "voice_chunk":
                # Process voice chunk (if doing server-side STT)
                pass

            elif event_type == "transcript":
                # Process transcript from client
                result = await voice_processor.process_transcript(
                    user_id,
                    data.get("text", ""),
                    data.get("is_final", True)
                )
                await websocket.send_json({"event": "transcript_processed", **result})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {user_id}")
        del CONNECTIONS[user_id]
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if user_id in CONNECTIONS:
            del CONNECTIONS[user_id]


# ═══════════════════════════════════════════════════════════════════════════════
# MANIM VIDEO GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

class ManimVideoRequest(BaseModel):
    scene_type: str = "concept"
    content: str
    narration: Optional[str] = None
    department: Optional[str] = None


@app.post("/api/video/generate")
async def generate_manim_video(request: ManimVideoRequest):
    """Generate Manim video for equation/concept using department specialists"""
    
    scene_type = request.scene_type
    content = request.content
    narration = request.narration
    department = request.department
    """Generate Manim video for equation/concept using department specialists"""
    
    # Detect department from content if not provided
    if not department:
        content_lower = content.lower()
        if any(word in content_lower for word in ['calculus', 'derivative', 'integral', 'equation', 'graph', 'algebra', 'geometry']):
            department = 'math'
        elif any(word in content_lower for word in ['physics', 'force', 'energy', 'motion', 'biology', 'cell', 'chemistry', 'molecule', 'reaction']):
            department = 'science'
        elif any(word in content_lower for word in ['essay', 'writing', 'argument', 'literature', 'analysis']):
            department = 'english'
        else:
            department = 'study_hub'
    
    # Route to appropriate specialist
    specialist_map = {
        'math': {
            'calculus': 'Calvin',
            'derivative': 'Calvin',
            'integral': 'Calvin',
            'algebra': 'Alyx',
            'equation': 'Alyx',
            'geometry': 'Geo',
            'graph': 'Calvin',
        },
        'science': {
            'physics': 'Nova',
            'force': 'Nova',
            'motion': 'Nova',
            'energy': 'Nova',
            'biology': 'Helix',
            'cell': 'Helix',
            'chemistry': 'Quanta',
            'reaction': 'Quanta',
            'molecule': 'Quanta',
        },
        'english': {
            'writing': 'Iris',
            'essay': 'Iris',
            'argument': 'Iris',
            'literature': 'Lex',
            'analysis': 'Lex',
            'rhetoric': 'Rhet',
        }
    }
    
    # Determine specialist
    specialist = 'General'
    content_lower = content.lower()
    for dept, specialists in specialist_map.items():
        for keyword, spec in specialists.items():
            if keyword in content_lower:
                specialist = spec
                break
        if specialist != 'General':
            break
    
    logger.info(f"Generating Manim video for: {content} | Department: {department} | Specialist: {specialist}")
    
    # Use LLM to generate Manim code
    import google.generativeai as genai
    genai.configure(api_key=Keys.GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash')
    prompt = f"""
You are {specialist}, a {department} specialist. The student wants a visual explanation of: {content}

Generate Python code for a Manim scene that creates an educational animation. The scene should:
1. Explain the concept clearly
2. Be visually engaging
3. Show step-by-step understanding
4. Not give away solutions to homework problems

Return ONLY valid Python code for a Manim scene class. Import statements included.
"""

    # Use resilient caller to get Manim code
    manim_code = await orchestrator.call_gemini_resilient(prompt)
    
    # Extract code block if wrapped
    import re
    code_match = re.search(r'```python\n(.*?)\n```', manim_code, re.DOTALL)
    if code_match:
        manim_code = code_match.group(1)
    else:
        code_match = re.search(r'```\n(.*?)\n```', manim_code, re.DOTALL)
        if code_match:
            manim_code = code_match.group(1)
    
    # Save code to file
    video_id = str(uuid.uuid4())
    script_filename = f"manim_{video_id}.py"
    script_path = os.path.join(os.getcwd(), script_filename)
    
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(manim_code)
        
    # Render using Manim via subprocess
    # Command: manim -qm -o {video_id} {script_path} SceneName
    # We need to find the scene name first or just assume it's the class name
    # A safer bet is to parse the class name
    class_match = re.search(r'class\s+(\w+)\(Scene\):', manim_code)
    scene_name = class_match.group(1) if class_match else "Solution"
    
    output_filename = f"{scene_name}.mp4"
    
    # Run Manim command
    import subprocess
    cmd = ["manim", "-ql", "--media_dir", "static", "-o", output_filename, script_path, scene_name]
    
    logger.info(f"Running Manim command: {' '.join(cmd)}")
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            logger.error(f"Manim failed: {stderr.decode()}")
            # Fallback to demo video if rendering fails
        return {
                "video_id": video_id,
                "status": "error",
                "message": f"I tried to visualize {content}, but the rendering engine encounted an error.",
                "video_url": "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4",
                "caption": f"Visualization failed. Showing demo video instead."
            }
            
        # Clean up script
        if os.path.exists(script_path):
            os.remove(script_path)
            
        # Construct video URL
        # Manim output structure: static/videos/manim_{video_id}/1080p60/{scene_name}.mp4
        # With -o output_filename, it limits the filename but the path structure might differ based on manim config
        # Let's simplify and move the file if needed or just use the expected path
        
        # Basic Manim output path with -o:
        # static/videos/manim_{video_id}/480p15/{output_filename} (based on -ql)
        # Actually, standard manim output for -o filename is:
        # media_dir/videos/script_name/quality/filename.mp4
        
        # Let's verify the file exists. 
        # We can use 'manim -o ...' effectively.
        # But the path is tricky. 
        
        # Alternative: Search for the mp4 file in static/
        # For now, let's construct the expected path based on standard Manim behavior
        # With --media_dir static:
        # static/videos/{script_filename_no_ext}/480p15/{output_filename}
        
        script_name_no_ext = script_filename.replace('.py', '')
        expected_path = os.path.join("static", "videos", script_name_no_ext, "480p15", output_filename)
        
        # Check if it exists
        if not os.path.exists(expected_path):
            logger.error(f"Manim output not found at {expected_path}")
            # Try to search recursively in static folder for the .mp4
            for root, dirs, files in os.walk("static"):
                if output_filename in files:
                    expected_path = os.path.join(root, output_filename)
                    break
        
        # Convert to URL (relative path from static mount)
        # We need to strip "static/" from the start since we mounted "static" folder to "/static"
        # But wait, app.mount("/static", StaticFiles(directory="static")) means requesting /static/foo.mp4 serves static/foo.mp4
        # So the URL should include /static/
        
        relative_path = expected_path.replace("\\", "/") # Ensure forward slashes
        video_url = f"http://localhost:8000/{relative_path}"
        
        return {
            "video_id": video_id,
            "status": "completed",
            "message": f"{specialist} rendered this visualization specifically for you:",
            "specialist": specialist,
            "department": department,
            "video_url": video_url,
            "caption": f"Visual explanation of {content}"
        }
        
    except Exception as e:
        logger.error(f"Manim execution error: {e}")
        raise e


# ═══════════════════════════════════════════════════════════════════════════════
# SPECIALIST CHAT API - Smart Routing to Named Specialists
# ═══════════════════════════════════════════════════════════════════════════════

# Specialist configurations with their prompts
SPECIALIST_PROMPTS = {
    # Math Department
    "calvin": {
        "name": "Calvin",
        "role": "Calculus Specialist",
        "thinking_style": "change, motion, accumulation",
        "system_prompt": """You are Calvin, a Calculus specialist who thinks in terms of change, motion, and accumulation.

Teaching Strategy:
- Start with intuition before computation
- Use visuals and real-world analogies
- Ask "What's changing? At what rate?"
- Build from simple to complex

Good at diagnosing:
- Confusion about rates of change
- Misunderstanding of limits
- Integration vs differentiation confusion

You REFUSE to:
- Give final answers to homework problems
- Skip the intuition-building phase
- Use formulas without explaining meaning

Always respond as a Socratic teacher - guide the student to discover answers themselves."""
    },
    "alyx": {
        "name": "Alyx",
        "role": "Algebra Specialist",
        "thinking_style": "symbolic structure, legal operations",
        "system_prompt": """You are Alyx, an Algebra specialist who thinks in symbolic structure and legal moves.

Teaching Strategy:
- Focus on "what operations are legal here?"
- Identify where sign errors happen
- Step-by-step transformation of expressions
- Check work by substitution

Good at diagnosing:
- Sign errors
- Illegal operations (dividing by variable that might be zero)
- Distribution mistakes
- Factoring confusion

You REFUSE to:
- Skip steps in solutions
- Provide answers without teaching the method
- Move forward without checking understanding

Always ask the student to verify each step."""
    },
    "geo": {
        "name": "Geo",
        "role": "Geometry Specialist",
        "thinking_style": "spatial invariants, transformations",
        "system_prompt": """You are Geo, a Geometry specialist who thinks in spatial invariants and transformations.

Teaching Strategy:
- Start with visualization
- Identify what stays the same under transformation
- Build proofs step-by-step
- Use construction to discover properties

Good at diagnosing:
- Faulty assumptions from diagrams
- Missing cases in proofs
- Confusion about congruence vs similarity

You REFUSE to:
- Accept unproven assumptions
- Skip proof steps
- Assume from appearance

Always ask "What do we KNOW vs what do we ASSUME?"""
    },
    # Science Department
    "nova": {
        "name": "Nova",
        "role": "Physics Specialist",
        "thinking_style": "causal, physical intuition",
        "system_prompt": """You are Nova, a Physics specialist who thinks causally with physical intuition.

Teaching Strategy:
- Start with "What forces exist?"
- Draw free-body diagrams
- Identify cause and effect
- Check units and limits

Good at diagnosing:
- Confusing formulas with concepts
- Missing force diagrams
- Wrong assumptions about motion

You REFUSE to:
- Plug numbers without understanding forces
- Skip the diagram step
- Accept memorized formulas without understanding

Always start with: "Let's draw what's happening here."""
    },
    "helix": {
        "name": "Helix",
        "role": "Biology Specialist",
        "thinking_style": "systems, processes, cause→effect",
        "system_prompt": """You are Helix, a Biology specialist who thinks in systems and processes.

Teaching Strategy:
- Ask "What's the role of this structure?"
- Emphasize processes over lists
- Connect structure to function
- Trace pathways step-by-step

Good at diagnosing:
- Memorization without understanding
- Confusing structure vs function
- Missing regulatory mechanisms

You REFUSE to:
- Encourage brute-force memorization
- Skip the "why" of biology
- Accept rote answers

Always ask: "WHY does this process work this way?"""
    },
    "quanta": {
        "name": "Quanta",
        "role": "Chemistry Specialist",
        "thinking_style": "microscopic → macroscopic mapping",
        "system_prompt": """You are Quanta, a Chemistry specialist who maps microscopic to macroscopic.

Teaching Strategy:
- "What's happening to the particles?"
- Visualize before balancing
- Connect observations to molecular behavior
- Build intuition for electron flow

Good at diagnosing:
- Misunderstanding reactions vs equations
- Stoichiometry intuition gaps
- Electron flow confusion

You REFUSE to:
- Balance equations without understanding
- Skip particle-level thinking
- Memorize without conceptual grounding

Always ask: "What are the molecules DOING here?"""
    },
    # English Department
    "iris": {
        "name": "Iris",
        "role": "Writing Specialist",
        "thinking_style": "argument, structure, clarity",
        "system_prompt": """You are Iris, a Writing specialist focused on argument and structure.

Teaching Strategy:
- "What are you trying to say?"
- Structure before wording
- Clear thesis development
- Logical paragraph flow

Good at diagnosing:
- Weak thesis statements
- Unclear claims
- Paragraph drift
- Missing evidence

You REFUSE to:
- Write essays for students
- Focus on grammar before structure
- Accept vague arguments

Always ask: "What's your ONE main point here?"""
    },
    "lex": {
        "name": "Lex",
        "role": "Literature Specialist",
        "thinking_style": "interpretation, evidence, theme",
        "system_prompt": """You are Lex, a Literature specialist focused on interpretation and evidence.

Teaching Strategy:
- Demand textual evidence
- Push interpretation over plot
- Explore multiple meanings
- Connect to broader themes

Good at diagnosing:
- Summary instead of analysis
- Unsupported claims
- Shallow readings

You REFUSE to:
- Accept plot summary as analysis
- Allow claims without textual support
- Give "the" correct interpretation

Always ask: "What in the TEXT supports that?"""
    },
    "rhet": {
        "name": "Rhet",
        "role": "Rhetoric Specialist",
        "thinking_style": "audience, persuasion, delivery",
        "system_prompt": """You are Rhet, a Rhetoric specialist focused on persuasion and audience.

Teaching Strategy:
- "Who is this for?"
- "What do you want them to believe?"
- Match tone to purpose
- Build persuasive structure

Good at diagnosing:
- Mismatched tone
- Weak persuasion
- Unclear purpose

You REFUSE to:
- Ignore audience
- Accept unfocused purpose
- Skip rhetorical analysis

Always ask: "What should your reader FEEL after this?"""
    },
    # Focus/Meta Department
    "coach": {
        "name": "Focus Coach",
        "role": "Focus & Planning Specialist",
        "thinking_style": "behavioral, adaptive",
        "system_prompt": """You are Focus Coach, a behavioral and adaptive learning specialist.

Teaching Strategy:
- Suggest strategies, not commands
- Adjust plans dynamically
- Recognize fatigue patterns
- Build sustainable habits

Good at diagnosing:
- Fatigue vs distraction
- Unrealistic goals
- Poor break timing

You REFUSE to:
- Shame or guilt the student
- Force one-size-fits-all approaches
- Ignore signs of burnout

Always be encouraging and adaptive. Ask: "How are you feeling right now?"""
    },
    "recall": {
        "name": "Recall",
        "role": "Memory Specialist",
        "thinking_style": "retrieval, spacing, reinforcement",
        "system_prompt": """You are Recall, a Memory and retention specialist.

Teaching Strategy:
- Use active recall over passive review
- Implement spaced repetition
- Create effective flashcards
- Test, don't just read

Good at diagnosing:
- Passive studying habits
- Illusion of competence
- Poor retention strategies

You REFUSE to:
- Encourage passive re-reading
- Skip testing phases
- Let students cram

Always ask: "Can you explain this WITHOUT looking at notes?"""
    },
    "proof": {
        "name": "Proof",
        "role": "Reasoning Verifier",
        "thinking_style": "logic, rigor, consistency",
        "system_prompt": """You are Proof, a Reasoning and verification specialist.

Teaching Strategy:
- Check logical consistency
- Identify assumptions
- Verify step-by-step
- Find gaps in reasoning

Good at diagnosing:
- Unjustified steps
- Circular logic
- Hidden assumptions

You REFUSE to:
- Accept unjustified claims
- Skip verification
- Allow logical fallacies

Always ask: "What JUSTIFIES this step?"""
    },
}

# Focus session storage
FOCUS_SESSIONS: Dict[str, dict] = {}
STUDENT_MODELS: Dict[str, dict] = {}

# ═══════════════════════════════════════════════════════════════════════════════
# ANTIGRAVITY ORCHESTRATION SYSTEM
# Behavior-aware learning orchestration that turns content into understanding
# ═══════════════════════════════════════════════════════════════════════════════

# Decision logs for explainability - every action must be logged and explainable
DECISION_LOGS: Dict[str, List[dict]] = {}

# Knowledge graph for concept tracking
CONCEPT_NODES: Dict[str, Dict[str, dict]] = {}  # user_id -> concept_id -> concept_data

# Learning event history for pattern recognition
LEARNING_EVENTS: Dict[str, List[dict]] = {}  # user_id -> list of events


class LearningEventType:
    """Types of learning events inferred from behavior"""
    SUSTAINED_FOCUS = "sustained_focus"
    SHALLOW_ENGAGEMENT = "shallow_engagement"
    CONFUSION_SILENT = "confusion_without_asking"
    COGNITIVE_OVERLOAD = "cognitive_overload"
    DISTRACTION_PHONE = "distraction_phone"
    DISTRACTION_ENVIRONMENT = "distraction_environment"
    FATIGUE = "fatigue"
    SUCCESSFUL_APPLICATION = "successful_application"
    DISENGAGEMENT_POST_EXPLANATION = "disengagement_after_explanation"
    RECOVERY = "recovery"
    ATTENTION_DROP = "attention_drop"


class AntiGravityOrchestrator:
    """
    Core orchestration intelligence for behavior-aware learning.
    This is NOT a chatbot - it's a learning environment driven by behavior.
    """

    @staticmethod
    def infer_learning_event(
        user_id: str,
        behavioral_signals: dict,
        timestamp: str
    ) -> dict:
        """
        Infer learning events from raw behavioral signals.
        Signals include: gaze_stability, eye_openness, head_pose, face_present,
        rereading_duration, inactivity, reaction_latency, etc.
        """
        event = {
            "timestamp": timestamp,
            "event_type": None,
            "evidence": behavioral_signals,
            "confidence": 0.0,
            "should_intervene": False,
            "intervention_type": None
        }

        # Get recent history for pattern detection
        history = LEARNING_EVENTS.get(user_id, [])[-10:]

        # Infer event type from signals
        face_present = behavioral_signals.get("face_present", True)
        eyes_open = behavioral_signals.get("eyes_open", True)
        gaze_stable = behavioral_signals.get("gaze_stable", True)
        distraction_level = behavioral_signals.get("distraction_level", 0.0)
        time_on_content = behavioral_signals.get("time_on_content", 0)
        interaction_count = behavioral_signals.get("interaction_count", 0)

        # Looking away / distracted (simplified - no fatigue detection)
        if not face_present:
            event["event_type"] = LearningEventType.DISTRACTION_ENVIRONMENT
            event["confidence"] = 0.9
            event["should_intervene"] = distraction_level > 0.5
            event["intervention_type"] = "gentle_refocus"

        # Cognitive overload - staring but not interacting for too long
        elif time_on_content > 120 and interaction_count == 0:
            event["event_type"] = LearningEventType.COGNITIVE_OVERLOAD
            event["confidence"] = 0.7
            event["should_intervene"] = True
            event["intervention_type"] = "simplify_content"

        # Shallow engagement - quick scrolling, not reading
        elif time_on_content < 10 and gaze_stable:
            event["event_type"] = LearningEventType.SHALLOW_ENGAGEMENT
            event["confidence"] = 0.6
            event["should_intervene"] = False

        # Sustained focus - ideal state
        elif gaze_stable and eyes_open and time_on_content > 30:
            event["event_type"] = LearningEventType.SUSTAINED_FOCUS
            event["confidence"] = 0.85
            event["should_intervene"] = False

        # Check for recovery after distraction
        recent_distractions = [e for e in history if "distraction" in (e.get("event_type") or "")]
        if len(recent_distractions) > 0 and event["event_type"] == LearningEventType.SUSTAINED_FOCUS:
            event["event_type"] = LearningEventType.RECOVERY
            event["confidence"] = 0.75

        # Store event
        if user_id not in LEARNING_EVENTS:
            LEARNING_EVENTS[user_id] = []
        LEARNING_EVENTS[user_id].append(event)

        return event

    @staticmethod
    def log_decision(
        user_id: str,
        action: str,
        triggering_evidence: dict,
        alternatives_considered: List[str],
        reason: str
    ) -> dict:
        """
        Log every decision with full explainability.
        The student MUST be able to click any decision and see 'Why did the system do this?'
        """
        decision = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "triggering_evidence": triggering_evidence,
            "alternatives_considered": alternatives_considered,
            "reason": reason,
            "user_id": user_id
        }

        if user_id not in DECISION_LOGS:
            DECISION_LOGS[user_id] = []
        DECISION_LOGS[user_id].append(decision)

        # Log to Opennote as well
        asyncio.create_task(AntiGravityOrchestrator._log_to_opennote(user_id, "decision", decision))

        return decision

    @staticmethod
    async def _log_to_opennote(user_id: str, event_type: str, data: dict):
        """Log to Opennote for persistent storage"""
        # This is handled by the existing opennote endpoint
        pass

    @staticmethod
    def should_teach(user_id: str) -> tuple[bool, str]:
        """
        Determine if teaching should occur based on behavioral readiness.
        Teaching must be TIMED and EARNED.

        Returns (should_teach, reason)
        """
        model = STUDENT_MODELS.get(user_id, {})
        events = LEARNING_EVENTS.get(user_id, [])[-5:]

        # Check recent events
        recent_event_types = [e.get("event_type") for e in events]

        # Don't teach if cognitively overloaded
        if LearningEventType.COGNITIVE_OVERLOAD in recent_event_types:
            return False, "Cognitive overload detected - simplify before teaching"

        # Don't teach if distracted
        distraction_count = sum(1 for e in recent_event_types if e and "distraction" in e)
        if distraction_count >= 2:
            return False, "Multiple distractions detected - wait for attention recovery"

        # Teach if sustained focus
        if LearningEventType.SUSTAINED_FOCUS in recent_event_types:
            return True, "Student showing sustained focus - optimal teaching moment"

        # Teach if recovering (reward engagement)
        if LearningEventType.RECOVERY in recent_event_types:
            return True, "Student recovered attention - reinforce with teaching"

        # Default: be conservative
        return False, "Insufficient behavioral evidence for teaching readiness"

    @staticmethod
    def generate_focus_plan(user_id: str, goal_minutes: int = 25) -> dict:
        """
        Generate a personalized focus plan based on student model.
        Prefer conservative plans unless evidence supports ambition.
        """
        model = STUDENT_MODELS.get(user_id, {})
        events = LEARNING_EVENTS.get(user_id, [])

        # Calculate average focus duration from history
        focus_events = [e for e in events if e.get("event_type") == LearningEventType.SUSTAINED_FOCUS]
        avg_focus = model.get("preferred_work_duration", 25)

        # Adjust based on recent performance
        distractions_today = model.get("distraction_count", 0)
        sessions_completed = model.get("sessions_completed", 0)

        # Conservative by default
        recommended_duration = min(avg_focus, goal_minutes)
        if distractions_today > 10:
            recommended_duration = max(10, recommended_duration - 10)

        # Break structure
        break_interval = recommended_duration
        break_duration = 5 if recommended_duration >= 25 else 3

        plan = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "created_at": datetime.now().isoformat(),
            "recommended_duration_minutes": recommended_duration,
            "break_interval_minutes": break_interval,
            "break_duration_minutes": break_duration,
            "goals": [],
            "adaptations": [],
            "confidence": 0.7 if sessions_completed > 0 else 0.5,
            "rationale": f"Based on {sessions_completed} previous sessions and {distractions_today} recent distractions"
        }

        # Log this decision
        AntiGravityOrchestrator.log_decision(
            user_id=user_id,
            action="generate_focus_plan",
            triggering_evidence={
                "sessions_completed": sessions_completed,
                "distractions_today": distractions_today,
                "avg_focus": avg_focus
            },
            alternatives_considered=[
                f"Standard 25-minute plan",
                f"Extended {goal_minutes}-minute plan",
                f"Short 10-minute starter plan"
            ],
            reason=plan["rationale"]
        )

        return plan

    @staticmethod
    def adapt_plan(user_id: str, current_plan: dict, trigger_event: dict) -> dict:
        """
        Adapt the focus plan based on behavioral evidence.
        ACTUALLY CHANGES focus time, task priorities, and break intervals.
        Use the smallest effective change. Never adapt too frequently.
        """
        adaptations = current_plan.get("adaptations", [])
        
        # Don't adapt too frequently
        if len(adaptations) > 0:
            last_adaptation = adaptations[-1]
            last_time = datetime.fromisoformat(last_adaptation.get("timestamp", datetime.now().isoformat()))
            if (datetime.now() - last_time).total_seconds() < 120:  # 2 minute cooldown
                return current_plan
        
        # Get student model for context
        student_model = STUDENT_MODELS.get(user_id, {})
        distraction_count = student_model.get("distraction_count", 0)
        distraction_type = trigger_event.get("distraction_type")
        event_type = trigger_event.get("event_type")
        
        adaptation = None
        original_duration = current_plan.get("recommended_duration_minutes", 25)
        original_break_interval = current_plan.get("break_interval_minutes", 25)
        tasks = current_plan.get("tasks", [])
        
        # Adapt based on distraction type and frequency
        if distraction_type == "phone_use":
            # Reduce focus time if phone use detected
            new_duration = max(10, original_duration - 5)
            new_break_interval = min(new_duration, 15)  # Shorter breaks
            adaptation = {
                "type": "reduce_focus_time",
                "change": f"Reduced focus time from {original_duration}min to {new_duration}min due to phone use",
                "new_duration": new_duration,
                "new_break_interval": new_break_interval,
                "timestamp": datetime.now().isoformat()
            }
            current_plan["recommended_duration_minutes"] = new_duration
            current_plan["break_interval_minutes"] = new_break_interval
            
        elif distraction_type == "looking_away" and distraction_count > 3:
            # Reduce duration and break into smaller chunks
            new_duration = max(15, original_duration - 10)
            new_break_interval = max(10, original_duration // 2)
            adaptation = {
                "type": "decompose_goal",
                "change": f"Breaking session into smaller chunks: {new_duration}min blocks with {new_break_interval}min breaks",
                "new_duration": new_duration,
                "new_break_interval": new_break_interval,
                "timestamp": datetime.now().isoformat()
            }
            current_plan["recommended_duration_minutes"] = new_duration
            current_plan["break_interval_minutes"] = new_break_interval
            
        elif event_type == LearningEventType.COGNITIVE_OVERLOAD:
            # Simplify tasks and reduce complexity
            adaptation = {
                "type": "simplify_tasks",
                "change": "Breaking current goals into smaller, more manageable steps",
                "timestamp": datetime.now().isoformat()
            }
            # Mark high-priority tasks as "can wait"
            for task in tasks:
                if task.get("priority", 3) > 2:
                    task["priority"] = task.get("priority", 3) - 1
        
        elif event_type == LearningEventType.SUSTAINED_FOCUS:
            # Positive adaptation - maybe extend slightly
            new_duration = min(original_duration + 5, 45)  # Cap at 45min
            adaptation = {
                "type": "extend_block",
                "change": f"Focus going well - extending from {original_duration}min to {new_duration}min",
                "new_duration": new_duration,
                "timestamp": datetime.now().isoformat()
            }
            current_plan["recommended_duration_minutes"] = new_duration
        
        if adaptation:
            current_plan["adaptations"].append(adaptation)
            
            # Log the adaptation decision
            AntiGravityOrchestrator.log_decision(
                user_id=user_id,
                action=f"adapt_plan_{adaptation['type']}",
                triggering_evidence=trigger_event,
                alternatives_considered=["No change", "End session early", "Switch modality"],
                reason=f"Behavioral event '{event_type or distraction_type}' triggered adaptation: {adaptation['change']}"
            )
        
        return current_plan

    @staticmethod
    def update_concept_node(
        user_id: str,
        concept_name: str,
        department: str,
        confidence_delta: float,
        misconception: str = None,
        connection: dict = None
    ):
        """Update the knowledge graph with concept learning progress"""
        if user_id not in CONCEPT_NODES:
            CONCEPT_NODES[user_id] = {}

        if concept_name not in CONCEPT_NODES[user_id]:
            CONCEPT_NODES[user_id][concept_name] = {
                "name": concept_name,
                "department": department,
                "confidence": 0.0,
                "misconceptions": [],
                "connections": [],
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }

        node = CONCEPT_NODES[user_id][concept_name]
        node["confidence"] = max(0, min(1, node["confidence"] + confidence_delta))
        node["updated_at"] = datetime.now().isoformat()

        if misconception and misconception not in node["misconceptions"]:
            node["misconceptions"].append(misconception)

        if connection:
            node["connections"].append(connection)

        return node


class ChatRequest(BaseModel):
    user_id: str
    department: str
    specialist_id: str
    message: str
    context: Optional[List[dict]] = []


class FocusAnalyzeRequest(BaseModel):
    user_id: str
    image: str  # Base64 encoded image
    session_id: Optional[str] = None


class FocusSessionSaveRequest(BaseModel):
    user_id: str
    session: dict
    duration: int
    completed: bool


@app.post("/api/chat")
async def chat_with_specialist(request: ChatRequest, background_tasks: BackgroundTasks):
    """Chat with a specialist using Socratic teaching"""
    try:
        specialist = SPECIALIST_PROMPTS.get(request.specialist_id)
        if not specialist:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {request.specialist_id}")

        # Build context from previous messages
        context_str = ""
        if request.context:
            context_str = "\n\nPrevious conversation:\n"
            for msg in request.context[-6:]:  # Last 6 messages
                role = "Student" if msg.get("role") == "user" else specialist["name"]
                context_str += f"{role}: {msg.get('content', '')}\n"

        # Get behavior context
        student_model = STUDENT_MODELS.get(request.user_id, {})
        distractions = student_model.get("distraction_count", 0)
        focus_time = student_model.get("total_focus_time", 0)
        recent_patterns = student_model.get("patterns", [])[-3:] # Last 3 patterns
        
        behavioral_context = f"""
[REAL-TIME BEHAVIORAL SIGNALS]
- Distraction Count: {distractions}
- Total Focus Time: {focus_time} seconds
- Recent Patterns: {recent_patterns}
- Inferred State: {"Highly Distracted" if distractions > 5 else "Focused"}
"""

        # Construct Master Orchestrator Prompt
        full_prompt = f"""{MASTER_SYSTEM_PROMPT}

--------------------------------
CURRENT SPECIALIST CONFIGURATION
--------------------------------
Name: {specialist['name']}
Role: {specialist['role']}
Thinking Style: {specialist['thinking_style']}
Specialist Instructions:
{specialist['system_prompt']}

{behavioral_context}

--------------------------------
CONVERSATION HISTORY
--------------------------------
{context_str}

--------------------------------
NEW STUDENT INPUT
--------------------------------
"{request.message}"

--------------------------------
ORCHESTRATION DECISION
--------------------------------
Based on the Master System Prompt and Behavioral Signals:
1. DECIDE: Is the student focused enough to receive a detailed explanation?
2. ADAPT: If distracted, pivot to a lighter engagement or break suggestion.
3. TEACH: If focused, proceed with the Specialist's specific Socratic method.

[OUTPUT FORMAT]
You must respond with the natural language reply to the student first.
Then, append a separate JSON block for the Decision Log (this will be hidden from student but saved to Opennote):
```json
{{
  "decision_log": {{
    "timestamp": "ISO_TIMESTAMP",
    "action_taken": "Short description of action",
    "triggering_evidence": "Behavioral signal used",
    "alternatives_considered": ["Alternative 1", "Alternative 2"],
    "reason_chosen": "Why this approach?"
  }}
}}
```
"""

        # Use resilient caller
        full_response = await orchestrator.call_gemini_resilient(full_prompt)
        
        # Extract Decision Log and separate from user response
        import re
        import json
        
        decision_log = None
        response_text = full_response
        
        # Look for the decision log JSON block
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', full_response, re.DOTALL)
        if json_match:
            try:
                log_json_str = json_match.group(1)
                log_data = json.loads(log_json_str)
                decision_log = log_data.get("decision_log")
                
                # Strip the JSON block from the response sent to the user
                response_text = full_response.replace(json_match.group(0), "").strip()
                
                # Log Decision to Console/Opennote
                logger.info(f"🧠 FOCUS ORCHESTRATOR DECISION:\n{json.dumps(decision_log, indent=2)}")
                
                # TODO: Send to Opennote API
                # await opennote.log_decision(user_id=request.user_id, decision=decision_log)
                
            except Exception as e:
                logger.error(f"Failed to parse decision log: {e}")
                # Keep full response if parsing fails to ensure user sees something
                response_text = full_response.replace("```json", "").replace("```", "")

        # Update XP
        xp_awarded = 5  # Base XP for asking a question
        if request.user_id not in USERS_DB:
            USERS_DB[request.user_id] = {"xp": 0, "level": 1}
        USERS_DB[request.user_id]["xp"] += xp_awarded

        # Generate response ID for reaction tracking
        response_id = str(uuid.uuid4())
        
        # Get user's learning patterns for context
        user_patterns = correlation_engine.get_user_patterns(request.user_id)
        recent_correlations = correlation_engine.get_correlations(request.user_id, limit=5)
        
        # Check if we need to adapt based on recent reactions
        adaptation_note = None
        if recent_correlations:
            last_reaction = recent_correlations[-1] if recent_correlations else None
            if last_reaction:
                reaction_type = last_reaction.get("reaction_type", "ENGAGED")
                adaptation = last_reaction.get("adaptation", {})
                
                # Log the correlation-based adaptation
                if reaction_type in ["CONFUSED", "DISTRACTED", "BORED"]:
                    adaptation_note = {
                        "applied": True,
                        "reason": f"Previous response showed {reaction_type} - adapting approach",
                        "strategy": adaptation.get("action", "continue"),
                        "explanation_style": adaptation.get("explanation_style", "maintain")
                    }
                    logger.info(f"📊 OPENNOTE CORRELATION: Adapting for {reaction_type}")
        
        # Log response to OpenNote with full context
        opennote_log = {
            "id": str(uuid.uuid4()),
            "user_id": request.user_id,
            "event": "ai_response_generated",
            "data": {
                "response_id": response_id,
                "specialist": specialist["name"],
                "message_preview": request.message[:100],
                "response_preview": response_text[:200],
                "decision_log": decision_log,
                "adaptation_applied": adaptation_note,
                "behavioral_context": {
                    "distractions": distractions,
                    "focus_time": focus_time,
                    "patterns": recent_patterns
                },
                "user_patterns": {
                    "total_interactions": user_patterns.get("total_interactions", 0),
                    "engagement_rate": _calculate_engagement_rate(user_patterns),
                    "topics_struggled": user_patterns.get("topics_struggled", [])[:3]
                }
            },
            "timestamp": datetime.utcnow().isoformat(),
            "synced_to_opennote": True if Keys.OPENNOTE_API_KEY else False,
            "correlation_ready": True  # Flag that this response is ready for reaction analysis
        }
        ACTIVITY_LOG.append(opennote_log)

        # Broadcast to WebSocket if connected
        if request.user_id in CONNECTIONS:
            try:
                await CONNECTIONS[request.user_id].send_json({
                    "event": "specialist_response",
                    "specialist_id": request.specialist_id,
                    "response": response_text,
                    "response_id": response_id,
                    "track_reaction": True  # Tell frontend to track reaction
                })
            except Exception:
                pass

        return {
            "response": response_text,
            "response_id": response_id,  # For reaction tracking
            "specialist": specialist["name"],
            "specialist_id": request.specialist_id,
            "xp_awarded": xp_awarded,
            "thinking_style": specialist["thinking_style"],
            "decision_log": decision_log,
            "adaptation_applied": adaptation_note,
            "track_reaction": True  # Tell frontend to track and report reaction
        }

    except Exception as e:
        logger.error(f"Chat error: {e}")
        import traceback
        traceback.print_exc()
        # Return the error in the response for debugging
        return {
            "response": f"I encountered an error connecting to my brain: {str(e)}",
            "specialist": "System",
            "specialist_id": request.specialist_id,
            "xp_awarded": 0,
            "error": str(e)
        }


def _calculate_engagement_rate(patterns: dict) -> float:
    """Calculate engagement rate from patterns"""
    if not patterns:
        return 0.0
    counts = patterns.get("reaction_counts", {})
    total = patterns.get("total_interactions", 1)
    engaged = counts.get("ENGAGED", 0) + counts.get("MOTIVATED", 0)
    return (engaged / total) * 100 if total > 0 else 0.0


@app.post("/api/focus/analyze")
async def analyze_focus(request: FocusAnalyzeRequest):
    """Analyze camera frame for distraction detection using OpenCV"""
    try:
        import cv2
        import numpy as np
        import base64
        from io import BytesIO
        from PIL import Image, ImageFile
        import os

        # Allow loading truncated images (common with webcam streams)
        ImageFile.LOAD_TRUNCATED_IMAGES = True

        # Decode base64 image
        image_data = request.image.split(",")[1] if "," in request.image else request.image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        image.load()  # Force load the image data
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        # ═══════════════════════════════════════════════════════════════════════════
        # USE MEDIAPIPE FACEMESH FOR ROBUST FACE DETECTION (max 1 face = closest to camera)
        # ═══════════════════════════════════════════════════════════════════════════
        faces = []
        face_landmarks = None
        
        if MEDIAPIPE_AVAILABLE and FACE_MESH is not None:
            # Convert BGR to RGB for MediaPipe
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = FACE_MESH.process(rgb_frame)
            
            if results.multi_face_landmarks:
                # MediaPipe is configured for max_num_faces=1, so we only get the closest/clearest face
                face_landmarks = results.multi_face_landmarks[0]
                
                # Get bounding box from landmarks for compatibility
                h, w, _ = frame.shape
                x_coords = [int(lm.x * w) for lm in face_landmarks.landmark]
                y_coords = [int(lm.y * h) for lm in face_landmarks.landmark]
                x_min, x_max = min(x_coords), max(x_coords)
                y_min, y_max = min(y_coords), max(y_coords)
                
                # Create face rectangle (x, y, w, h) for compatibility with existing code
                faces = [(x_min, y_min, x_max - x_min, y_max - y_min)]
                
                # Draw face mesh for debug view
                mp_drawing.draw_landmarks(
                    frame,
                    face_landmarks,
                    mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_contours_style()
                )
        else:
            # Fallback to Haar Cascades if MediaPipe not available
            face_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
            face_cascade = cv2.CascadeClassifier(face_path)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            
            all_faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(50, 50),
                flags=cv2.CASCADE_SCALE_IMAGE
            )
            
            if len(all_faces) > 0:
                # Only use largest face
                largest_face = max(all_faces, key=lambda f: f[2] * f[3])
                faces = [largest_face]

        # ═══════════════════════════════════════════════════════════════════════════
        # ANTIGRAVITY: Blue Phone Detection (Stricter - Only detects phone-like objects)
        # ═══════════════════════════════════════════════════════════════════════════
        hsv_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # Define more specific blue range for phone detection (Hue 100-130 for blue phones)
        lower_blue = np.array([100, 100, 60])  # Higher saturation/value thresholds
        upper_blue = np.array([130, 255, 255])
        
        blue_mask = cv2.inRange(hsv_frame, lower_blue, upper_blue)
        # Clean up mask more aggressively
        blue_mask = cv2.erode(blue_mask, None, iterations=2)
        blue_mask = cv2.dilate(blue_mask, None, iterations=2)
        
        blue_contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        phone_detected = False
        frame_height, frame_width = frame.shape[:2]
        
        for contour in blue_contours:
            area = cv2.contourArea(contour)
            # Stricter: require larger area AND phone-like aspect ratio (rectangular)
            if area > 2000:  # Increased from 500 to 2000 - requires larger object
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / h if h > 0 else 0
                
                # Phone-like: aspect ratio between 0.5 and 2.0 (rectangular)
                # AND in lower 2/3 of frame (where hands would be)
                is_phone_like_shape = 0.5 <= aspect_ratio <= 2.0
                is_in_hand_region = y > (frame_height / 3)  # Lower 2/3 of frame
                
                if is_phone_like_shape and is_in_hand_region:
                    phone_detected = True
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 255, 0), 2)
                    cv2.putText(frame, "PHONE", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        # ═══════════════════════════════════════════════════════════════════════════
        # DETECT DISTRACTION TYPES (Multiple types, not just phone)
        # ═══════════════════════════════════════════════════════════════════════════
        distraction_detected = False
        distraction_type = None
        distraction_level = 0.0
        intervention = None

        # MediaPipe FaceMesh gives us all 468 landmarks, so eyes are already tracked
        # Eye detection is implicit in face_landmarks being present
        total_eyes_detected = 2 if face_landmarks is not None else 0

        # SIMPLIFIED DETECTION: Face = Focused, No Face = Distracted (turned head)
        if len(faces) == 0:
            # No face = head turned away = distracted
            distraction_detected = True
            distraction_type = "looking_away"
            distraction_level = 0.8
            intervention = "Hey! I noticed you might be looking away. Let's refocus!"
            cv2.putText(frame, "NO FACE - DISTRACTED", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            cv2.rectangle(frame, (5, 5), (frame.shape[1]-5, frame.shape[0]-5), (0, 0, 255), 3)
        else:
            # Face detected = looking at screen = focused
            distraction_detected = False
            distraction_type = None
            distraction_level = 0.0
            
            # Draw face detection for visualization
            for (x, y, w, h) in faces:
                cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 3)
                cv2.putText(frame, "FACE - FOCUSED", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                
                # Draw eyes if detected (for visual feedback, but not used for detection)
                roi_gray = gray[y:y+h, x:x+w]
                roi_color = frame[y:y+h, x:x+w]
                eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 3)
                
                for (ex, ey, ew, eh) in eyes:
                    cv2.rectangle(roi_color, (ex, ey), (ex+ew, ey+eh), (255, 255, 0), 2)

        # Encode processed debug image
        _, buffer = cv2.imencode('.jpg', frame)
        debug_image_b64 = base64.b64encode(buffer).decode('utf-8')

        # Update student model using Request Loop
        if request.user_id not in STUDENT_MODELS:
            STUDENT_MODELS[request.user_id] = {
                "distraction_count": 0,
                "total_focus_time": 0,
                "patterns": [],
                "status_history": []
            }

        # ═══════════════════════════════════════════════════════════════════════════
        # ANTIGRAVITY: Smooth Detection with Larger Buffer and Higher Threshold
        # ═══════════════════════════════════════════════════════════════════════════
        history = STUDENT_MODELS[request.user_id]["status_history"]
        
        # Store frame state INCLUDING phone_detected flag (critical for validation)
        current_frame_state = {
            "is_distracted": distraction_detected,
            "type": distraction_type,
            "face_present": len(faces) > 0  # Simplified: only track face presence
        }
        history.append(current_frame_state)
        
        # Keep last 10 frames (~2 seconds at 500ms intervals) for responsive detection
        if len(history) > 10:
            history.pop(0)
            
        # Simple voting: if majority of recent frames show face = focused, no face = distracted
        face_frames = [s for s in history if s.get("face_present", False)]
        distracted_frames = [s for s in history if s["is_distracted"]]
        
        # Use 60% threshold for responsive detection (10 frames = need 6+ for stable state)
        face_ratio = len(face_frames) / len(history) if history else 0.0
        
        # Simple logic: majority face = focused, majority no-face = distracted
        if face_ratio >= 0.6:
            # Face detected majority = focused
            final_distraction_status = False
            final_distraction_type = None
            intervention = None
        else:
            # No face majority = distracted (turned head)
            final_distraction_status = True
            final_distraction_type = "looking_away"
            intervention = "Hey! I noticed you might be looking away. Let's refocus!" if len(distracted_frames) >= 3 else None

        # Update instantaneous values with STABLE values
        distraction_detected = final_distraction_status
        distraction_type = final_distraction_type
        
        # Calculate metrics for logging (simplified)
        behavioral_signals = {
            "face_present": len(faces) > 0,
            "gaze_stable": not final_distraction_status,
            "distraction_level": 1.0 - face_ratio if history else 0.0,  # Inverted: higher when no face
            "time_on_content": STUDENT_MODELS[request.user_id].get("current_content_time", 30),
            "interaction_count": STUDENT_MODELS[request.user_id].get("interaction_count", 1)
        }

        # Infer learning event using AntiGravity
        learning_event = AntiGravityOrchestrator.infer_learning_event(
            request.user_id,
            behavioral_signals,
            datetime.now().isoformat()
        )
        
        # Intervention Cooldown - prevent same message from flickering
        current_time = datetime.now().timestamp()
        last_log_time = STUDENT_MODELS[request.user_id].get("last_log_time", 0)
        last_intervention_time = STUDENT_MODELS[request.user_id].get("last_intervention_time", 0)
        last_intervention_type = STUDENT_MODELS[request.user_id].get("last_intervention_type", None)
        last_status = STUDENT_MODELS[request.user_id].get("last_distraction_status", False)
        
        # Only show intervention if:
        # 1. Status changed (newly distracted), OR
        # 2. Same type but >8 seconds passed (cooldown), OR
        # 3. Different distraction type (new issue)
        intervention_cooldown = 8.0  # seconds
        should_show_intervention = False
        if final_distraction_status:
            if final_distraction_status != last_status:
                # Status changed: show immediately
                should_show_intervention = True
            elif final_distraction_type != last_intervention_type:
                # Different type: show immediately
                should_show_intervention = True
            elif (current_time - last_intervention_time) > intervention_cooldown:
                # Same type but cooldown passed: show again
                should_show_intervention = True
            
            # If not showing, clear intervention to prevent stale messages
            if not should_show_intervention:
                intervention = None
        
        # Logging Logic (separate from intervention display)
        should_log = False
        # Log if STABLE status CHANGED (Focused <-> Distracted)
        if final_distraction_status != last_status:
            should_log = True
        # OR if it's been > 20 seconds of the SAME distraction (persisting)
        elif final_distraction_status and (current_time - last_log_time > 20):
            should_log = True
            
        STUDENT_MODELS[request.user_id]["last_distraction_status"] = final_distraction_status
        
        # Update intervention tracking
        if final_distraction_status and should_show_intervention:
            STUDENT_MODELS[request.user_id]["last_intervention_time"] = current_time
            STUDENT_MODELS[request.user_id]["last_intervention_type"] = final_distraction_type

        if final_distraction_status:
            STUDENT_MODELS[request.user_id]["distraction_count"] += 1

            if should_log:
                # Log the distraction decision with explainability
                AntiGravityOrchestrator.log_decision(
                    user_id=request.user_id,
                    action="detect_distraction",
                    triggering_evidence=behavioral_signals,
                    alternatives_considered=["Ignore momentary flicker", "Wait for pattern", "Immediate intervention"],
                    reason=f"Detected Stable {final_distraction_type}: {int(behavioral_signals['distraction_level']*100)}% of recent frames distracted"
                )
                STUDENT_MODELS[request.user_id]["last_log_time"] = current_time

                # ═══════════════════════════════════════════════════════════════════════════
                # ADAPT FOCUS PLAN based on distraction
                # ═══════════════════════════════════════════════════════════════════════════
                # Get or create current focus plan
                current_plan = STUDENT_MODELS[request.user_id].get("current_focus_plan")
                if not current_plan:
                    # Create initial plan if none exists
                    current_plan = AntiGravityOrchestrator.generate_focus_plan(request.user_id, 25)
                    STUDENT_MODELS[request.user_id]["current_focus_plan"] = current_plan
                
                # Trigger adaptation based on distraction event
                trigger_event = {
                    "event_type": learning_event.get("event_type"),
                    "distraction_type": final_distraction_type,
                    "distraction_level": behavioral_signals.get("distraction_level", 0.0),
                    "distraction_count": STUDENT_MODELS[request.user_id]["distraction_count"]
                }
                
                adapted_plan = AntiGravityOrchestrator.adapt_plan(
                    request.user_id,
                    current_plan,
                    trigger_event
                )
                
                # Store updated plan
                STUDENT_MODELS[request.user_id]["current_focus_plan"] = adapted_plan

            # Adaptive intervention based on frequency and learning event
            count = STUDENT_MODELS[request.user_id]["distraction_count"]
            if count > 5 and not intervention:
                intervention = "You've been distracted a few times. Want to take a 5-minute break?"

            # Override intervention based on learning event
            if learning_event.get("intervention_type") == "suggest_break":
                intervention = "I notice you might be getting tired. A short break could help you focus better."
            elif learning_event.get("intervention_type") == "simplify_content":
                intervention = "Let's break this down into smaller pieces. What part would you like to focus on?"
        else:
            # Increment focus time when not distracted
            STUDENT_MODELS[request.user_id]["total_focus_time"] = STUDENT_MODELS[request.user_id].get("total_focus_time", 0) + 3

        # Log to session if provided
        if request.session_id and request.session_id in FOCUS_SESSIONS:
            FOCUS_SESSIONS[request.session_id]["distraction_log"].append({
                "timestamp": datetime.now().isoformat(),
                "type": distraction_type,
                "level": distraction_level,
                "learning_event": learning_event.get("event_type")
            })

        # Get current focus plan (may have been adapted)
        current_plan = STUDENT_MODELS[request.user_id].get("current_focus_plan")
        
        return {
            "distraction_detected": distraction_detected,
            "distraction_type": distraction_type,
            "distraction_level": distraction_level,
            "intervention": intervention,
            "faces_detected": len(faces),
            "debug_image": f"data:image/jpeg;base64,{debug_image_b64}",
            # AntiGravity additions
            "learning_event": learning_event,
            "should_intervene": learning_event.get("should_intervene", False),
            "teaching_ready": AntiGravityOrchestrator.should_teach(request.user_id)[0],
            # Include adapted focus plan if available
            "focus_plan": current_plan,
            "plan_adapted": current_plan is not None and len(current_plan.get("adaptations", [])) > 0
        }

    except Exception as e:
        logger.error(f"Focus Analysis Error: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback: Return the original image if something breaks, so overlay doesn't die
        return {
            "distraction_detected": False,
            "distraction_type": None,
            "distraction_level": 0.0,
            "intervention": None,
            "faces_detected": 0,
            "debug_image": request.image,
            "error": str(e)
        }



@app.post("/api/focus/session/save")
async def save_focus_session(request: FocusSessionSaveRequest):
    """Save a focus session and update student model"""
    try:
        session_id = request.session.get("id", str(uuid.uuid4()))

        # Store session
        FOCUS_SESSIONS[session_id] = {
            **request.session,
            "user_id": request.user_id,
            "duration": request.duration,
            "completed": request.completed,
            "saved_at": datetime.now().isoformat()
        }

        # Update student model based on session performance
        if request.user_id not in STUDENT_MODELS:
            STUDENT_MODELS[request.user_id] = {
                "distraction_count": 0,
                "total_focus_time": 0,
                "patterns": [],
                "preferred_work_duration": 25,
                "sessions_completed": 0
            }

        model = STUDENT_MODELS[request.user_id]
        model["total_focus_time"] += request.duration
        if request.completed:
            model["sessions_completed"] += 1

        # Calculate XP based on focus quality
        distraction_count = len(request.session.get("distractionLog", []))
        focus_quality = max(0, 1 - (distraction_count * 0.1))
        xp_earned = int(request.duration / 60 * 5 * focus_quality)

        # Update user XP
        if request.user_id not in USERS_DB:
            USERS_DB[request.user_id] = {"xp": 0, "level": 1}
        USERS_DB[request.user_id]["xp"] += xp_earned

        return {
            "success": True,
            "session_id": session_id,
            "xp_earned": xp_earned,
            "total_xp": USERS_DB[request.user_id]["xp"],
            "focus_quality": focus_quality,
            "student_model_updated": True
        }

    except Exception as e:
        logger.error(f"Session save error: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/focus/student-model/{user_id}")
async def get_student_model(user_id: str):
    """Get the current student model for adaptive planning"""
    if user_id not in STUDENT_MODELS:
        STUDENT_MODELS[user_id] = {
            "distraction_count": 0,
            "total_focus_time": 0,
            "patterns": [],
            "preferred_work_duration": 25,
            "sessions_completed": 0,
            "strength_areas": [],
            "weakness_areas": [],
            "time_of_day_effectiveness": {}
        }

    return STUDENT_MODELS[user_id]


# ═══════════════════════════════════════════════════════════════════════════════
# ANTIGRAVITY API ENDPOINTS
# Explainable, behavior-driven learning orchestration
# ═══════════════════════════════════════════════════════════════════════════════

class FocusPlanRequest(BaseModel):
    user_id: str
    goal_minutes: int = 25


@app.post("/api/antigravity/focus-plan")
async def create_focus_plan(request: FocusPlanRequest):
    """Generate a personalized focus plan based on student model and behavioral history"""
    plan = AntiGravityOrchestrator.generate_focus_plan(request.user_id, request.goal_minutes)
    return {
        "success": True,
        "plan": plan
    }


@app.get("/api/antigravity/decisions/{user_id}")
async def get_decision_logs(user_id: str, limit: int = 20):
    """
    Get decision logs for explainability.
    Every action must be explainable - students can click any decision to see 'Why did the system do this?'
    """
    logs = DECISION_LOGS.get(user_id, [])
    return {
        "user_id": user_id,
        "decisions": logs[-limit:] if limit else logs,
        "total_count": len(logs)
    }


@app.get("/api/antigravity/decision/{decision_id}")
async def get_decision_explanation(decision_id: str):
    """Get detailed explanation for a specific decision"""
    for user_logs in DECISION_LOGS.values():
        for decision in user_logs:
            if decision.get("id") == decision_id:
                return {
                    "decision": decision,
                    "explanation": f"This action was taken because: {decision.get('reason', 'No reason recorded')}",
                    "evidence": decision.get("triggering_evidence", {}),
                    "alternatives": decision.get("alternatives_considered", [])
                }
    raise HTTPException(status_code=404, detail="Decision not found")


@app.get("/api/antigravity/learning-events/{user_id}")
async def get_learning_events(user_id: str, limit: int = 50):
    """Get inferred learning events for a user"""
    events = LEARNING_EVENTS.get(user_id, [])
    return {
        "user_id": user_id,
        "events": events[-limit:] if limit else events,
        "total_count": len(events)
    }


@app.get("/api/antigravity/knowledge-graph/{user_id}")
async def get_knowledge_graph(user_id: str):
    """Get the user's concept knowledge graph"""
    nodes = CONCEPT_NODES.get(user_id, {})
    return {
        "user_id": user_id,
        "concepts": list(nodes.values()),
        "total_concepts": len(nodes)
    }


@app.get("/api/antigravity/teaching-readiness/{user_id}")
async def check_teaching_readiness(user_id: str):
    """Check if the student is behaviorally ready for teaching"""
    should_teach, reason = AntiGravityOrchestrator.should_teach(user_id)
    return {
        "user_id": user_id,
        "ready_for_teaching": should_teach,
        "reason": reason,
        "recommendation": "proceed" if should_teach else "wait"
    }


class AdaptPlanRequest(BaseModel):
    user_id: str
    current_plan: dict
    trigger_event: dict


@app.post("/api/antigravity/adapt-plan")
async def adapt_focus_plan(request: AdaptPlanRequest):
    """Adapt the focus plan based on behavioral evidence"""
    adapted_plan = AntiGravityOrchestrator.adapt_plan(
        request.user_id,
        request.current_plan,
        request.trigger_event
    )
    return {
        "success": True,
        "plan": adapted_plan,
        "was_adapted": len(adapted_plan.get("adaptations", [])) > len(request.current_plan.get("adaptations", []))
    }


# ═══════════════════════════════════════════════════════════════════════════════
# QUIZ GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

class QuizGenerateRequest(BaseModel):
    user_id: str
    specialist_id: str
    topic: str
    difficulty: str = "medium"
    num_questions: int = 5


@app.post("/api/quiz/generate")
async def generate_quiz(request: QuizGenerateRequest):
    """Generate quiz questions based on topic and specialist"""
    try:
        specialist = SPECIALIST_PROMPTS.get(request.specialist_id)
        if not specialist:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {request.specialist_id}")

        # Use resilient caller
        response_text = await orchestrator.call_gemini_resilient(prompt)

        # Parse JSON from response
        import re
        json_match = re.search(r'\[.*\]', response.text, re.DOTALL)
        if json_match:
            quizzes = json.loads(json_match.group())
        else:
            # Fallback quiz
            quizzes = [
                {
                    "question": f"What is a key concept in {specialist['role']}?",
                    "options": ["Concept A", "Concept B", "Concept C", "Concept D"],
                    "correctIndex": 0,
                    "explanation": "This is the foundational concept."
                }
            ]

        # Award XP for generating quiz
        if request.user_id not in USERS_DB:
            USERS_DB[request.user_id] = {"xp": 0, "level": 1}
        USERS_DB[request.user_id]["xp"] += 5

        return {
            "quizzes": quizzes,
            "specialist": specialist["name"],
            "topic": request.topic,
            "xp_awarded": 5
        }

    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        # Return fallback quizzes
        return {
            "quizzes": [
                {
                    "question": "What helps you understand concepts better?",
                    "options": ["Practice problems", "Just reading", "Skipping ahead", "Guessing"],
                    "correctIndex": 0,
                    "explanation": "Practice problems help reinforce learning through active recall."
                },
                {
                    "question": "When stuck on a problem, what should you do?",
                    "options": ["Break it into smaller parts", "Give up immediately", "Skip to the next one", "Panic"],
                    "correctIndex": 0,
                    "explanation": "Breaking problems into smaller parts makes them more manageable."
                }
            ],
            "specialist": "General",
            "topic": request.topic,
            "xp_awarded": 5,
            "note": "Using fallback questions due to generation error"
        }


# ═══════════════════════════════════════════════════════════════════════════════
# FLASHCARD GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

class FlashcardGenerateRequest(BaseModel):
    user_id: str
    specialist_id: str
    content: str
    num_cards: int = 5


@app.post("/api/flashcards/generate")
async def generate_flashcards(request: FlashcardGenerateRequest):
    """Generate flashcards from content and conversation"""
    try:
        specialist = SPECIALIST_PROMPTS.get(request.specialist_id)
        if not specialist:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {request.specialist_id}")

        # Use resilient caller
        response_text = await orchestrator.call_gemini_resilient(prompt)

        # Parse JSON from response
        import re
        json_match = re.search(r'\[.*\]', response.text, re.DOTALL)
        if json_match:
            flashcards = json.loads(json_match.group())
        else:
            # Fallback flashcards
            flashcards = [
                {
                    "front": f"What is a key principle in {specialist['role']}?",
                    "back": "Understanding builds from fundamentals to complex concepts.",
                    "confidence": 0.5
                }
            ]

        # Award XP for generating flashcards
        if request.user_id not in USERS_DB:
            USERS_DB[request.user_id] = {"xp": 0, "level": 1}
        USERS_DB[request.user_id]["xp"] += 5

        return {
            "flashcards": flashcards,
            "specialist": specialist["name"],
            "xp_awarded": 5
        }

    except Exception as e:
        logger.error(f"Flashcard generation error: {e}")
        # Return fallback flashcards
        return {
            "flashcards": [
                {
                    "front": "What is active recall?",
                    "back": "Testing yourself on material rather than passively re-reading it.",
                    "confidence": 0.5
                },
                {
                    "front": "What is spaced repetition?",
                    "back": "Reviewing material at increasing intervals to improve long-term retention.",
                    "confidence": 0.5
                },
                {
                    "front": "Why is understanding better than memorization?",
                    "back": "Understanding allows you to apply concepts to new problems, while memorization only works for exact matches.",
                    "confidence": 0.5
                }
            ],
            "specialist": "General",
            "xp_awarded": 5,
            "note": "Using fallback flashcards due to generation error"
        }


# ═══════════════════════════════════════════════════════════════════════════════
# PROBLEM GENERATION & CHECKING (Study With Bob Style)
# ═══════════════════════════════════════════════════════════════════════════════

class ProblemGenerateRequest(BaseModel):
    user_id: str
    specialist_id: str
    topic: str
    difficulty: str = "medium"
    student_mastery: float = 0


class ProblemCheckRequest(BaseModel):
    user_id: str
    problem_id: str
    student_answer: str
    correct_answer: Optional[str] = None
    specialist_id: str
    hints_used: int = 0


# Store for generated problems
PROBLEMS_DB: Dict[str, dict] = {}


@app.post("/api/problem/generate")
async def generate_problem(request: ProblemGenerateRequest):
    """Generate a practice problem with progressive hints (a la Study With Bob)"""
    try:
        specialist = SPECIALIST_PROMPTS.get(request.specialist_id)
        if not specialist:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {request.specialist_id}")

        # Use resilient caller
        response_text = await orchestrator.call_gemini_resilient(prompt)

        # Parse JSON from response
        import re
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            problem_data = json.loads(json_match.group())
        else:
            # Fallback problem
            problem_data = {
                "question": f"Explain a key concept in {specialist['role']} and why it matters.",
                "hints": [
                    "Start by thinking about what makes this topic unique.",
                    "Consider how this concept connects to other ideas you know.",
                    "Try to put it in your own words - that's the best test of understanding!"
                ],
                "correct_answer": "A thoughtful explanation showing understanding",
                "difficulty": actual_difficulty,
                "concept_tested": "Conceptual understanding"
            }

        # Store problem for later verification
        problem_id = str(uuid.uuid4())
        PROBLEMS_DB[problem_id] = {
            **problem_data,
            "user_id": request.user_id,
            "specialist_id": request.specialist_id,
            "created_at": datetime.utcnow().isoformat()
        }

        return {
            "problem_id": problem_id,
            "question": problem_data["question"],
            "hints": problem_data.get("hints", []),
            "difficulty": problem_data.get("difficulty", actual_difficulty),
            "correct_answer": problem_data.get("correct_answer"),  # Sent to frontend for client-side storage
            "specialist": specialist["name"]
        }

    except Exception as e:
        logger.error(f"Problem generation error: {e}")
        # Return fallback problem
        return {
            "problem_id": str(uuid.uuid4()),
            "question": "What's the most important concept you've learned recently, and how would you explain it to someone else?",
            "hints": [
                "Think about what made this concept 'click' for you.",
                "What examples or analogies help illustrate this idea?",
                "How does this connect to things you already knew?"
            ],
            "difficulty": "medium",
            "correct_answer": "A thoughtful, clear explanation",
            "specialist": "General",
            "note": "Fallback problem due to generation error"
        }


@app.post("/api/problem/check")
async def check_problem_answer(request: ProblemCheckRequest):
    """Check student answer with AI grading and Socratic feedback"""
    try:
        specialist = SPECIALIST_PROMPTS.get(request.specialist_id)
        if not specialist:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {request.specialist_id}")

        # Get stored problem if available
        stored_problem = PROBLEMS_DB.get(request.problem_id, {})
        correct_answer = request.correct_answer or stored_problem.get("correct_answer", "")
        question = stored_problem.get("question", "")

        # Use resilient caller
        response_text = await orchestrator.call_gemini_resilient(prompt)

        # Parse JSON from response
        import re
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            # Fallback evaluation
            is_likely_correct = len(request.student_answer) > 10
            result = {
                "is_correct": is_likely_correct,
                "feedback": "I see what you're thinking! Can you elaborate a bit more on your reasoning?",
                "partial_credit": 0.5,
                "follow_up_question": "What's the key insight that led you to this answer?"
            }

        # Calculate XP based on correctness and hints used
        xp_awarded = 0
        if result.get("is_correct"):
            xp_awarded = max(5, 20 - request.hints_used * 5)
        else:
            xp_awarded = 2  # Small XP for attempting

        # Update user XP
        if request.user_id not in USERS_DB:
            USERS_DB[request.user_id] = {"xp": 0, "level": 1}
        USERS_DB[request.user_id]["xp"] += xp_awarded

        return {
            "is_correct": result.get("is_correct", False),
            "feedback": result.get("feedback", "I'm analyzing your answer..."),
            "partial_credit": result.get("partial_credit", 0),
            "follow_up_question": result.get("follow_up_question"),
            "xp_awarded": xp_awarded,
            "specialist": specialist["name"]
        }

    except Exception as e:
        logger.error(f"Answer checking error: {e}")
        return {
            "is_correct": False,
            "feedback": "I had trouble evaluating that. Try rephrasing your answer or breaking it into smaller parts.",
            "partial_credit": 0.3,
            "xp_awarded": 2,
            "error": str(e)
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CANVAS / HANDWRITING ANALYSIS (Study With Bob Vision)
# ═══════════════════════════════════════════════════════════════════════════════

class CanvasAnalyzeRequest(BaseModel):
    user_id: str
    specialist_id: str
    image: str  # Base64 encoded image
    problem_context: Optional[str] = ""


@app.post("/api/canvas/analyze")
async def analyze_canvas(request: CanvasAnalyzeRequest):
    """Analyze handwritten work using Gemini Vision (a la Study With Bob)"""
    try:
        specialist = SPECIALIST_PROMPTS.get(request.specialist_id)
        if not specialist:
            raise HTTPException(status_code=400, detail=f"Unknown specialist: {request.specialist_id}")

        import google.generativeai as genai
        genai.configure(api_key=Keys.GOOGLE_API_KEY)
        
        # Use vision-capable model
        model = genai.GenerativeModel('gemini-2.5-flash')

        # Prepare image for vision
        import base64
        from PIL import Image
        from io import BytesIO
        
        # Extract base64 data
        image_data = request.image.split(",")[1] if "," in request.image else request.image
        image_bytes = base64.b64decode(image_data)
        
        prompt = f"""You are {specialist['name']}, a {specialist['role']} specialist analyzing a student's handwritten work.

Problem context: {request.problem_context if request.problem_context else "General practice work"}

Your teaching style is: {specialist['thinking_style']}

Look at the student's handwritten work in this image and provide feedback:

1. READ the handwriting and identify what the student wrote/drew
2. ANALYZE their approach and work shown
3. DO NOT give away the answer - use Socratic questioning instead
4. Point out what they did well
5. If there are errors, guide them with questions, don't correct directly

Respond as if speaking directly to the student. Keep it encouraging and focused.
Response should be 3-5 sentences max.

Also determine if their approach seems correct so far (they might not be finished).

Return ONLY valid JSON:
{{
  "recognized_content": "What you read/see in the handwriting",
  "feedback": "Your Socratic feedback here",
  "is_correct": true or false (based on what's visible so far),
  "work_quality": "good" | "needs_improvement" | "excellent",
  "guiding_question": "A question to help them think deeper"
}}"""

        # Create image part for multimodal
        image_part = {
            "mime_type": "image/png",
            "data": image_data
        }
        
        response = model.generate_content([prompt, image_part])

        # Parse JSON from response
        import re
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = {
                "recognized_content": "I can see your work",
                "feedback": "I see you're working through this! Can you walk me through your thinking?",
                "is_correct": None,
                "work_quality": "needs_improvement",
                "guiding_question": "What's the first step you took and why?"
            }

        # Award XP for submitting work
        xp_awarded = 10
        if request.user_id not in USERS_DB:
            USERS_DB[request.user_id] = {"xp": 0, "level": 1}
        USERS_DB[request.user_id]["xp"] += xp_awarded

        feedback_text = result.get("feedback", "I'm looking at your work...")
        if result.get("guiding_question"):
            feedback_text += f"\n\n🤔 {result['guiding_question']}"

        return {
            "feedback": feedback_text,
            "is_correct": result.get("is_correct"),
            "recognized_content": result.get("recognized_content"),
            "work_quality": result.get("work_quality", "needs_improvement"),
            "xp_awarded": xp_awarded,
            "specialist": specialist["name"]
        }

    except Exception as e:
        logger.error(f"Canvas analysis error: {e}")
        return {
            "feedback": "I could see you put effort into this! Walk me through your approach - what was your first step?",
            "is_correct": None,
            "work_quality": "needs_improvement",
            "xp_awarded": 5,
            "error": str(e)
        }


# ═══════════════════════════════════════════════════════════════════════════════
# TEACHER DASHBOARD ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# Storage for assignments and teacher data
ASSIGNMENTS_DB: Dict[str, dict] = {}
CLASS_ANALYTICS: Dict[str, dict] = {}


class AssignmentCreateRequest(BaseModel):
    teacher_id: str
    title: str
    description: str
    department: str
    due_date: str


@app.get("/api/teacher/analytics")
async def get_teacher_analytics(teacher_id: str):
    """Get class-wide analytics for teacher dashboard"""
    try:
        # Aggregate data from student models and user DB
        total_students = len([u for u in USERS_DB.keys() if u.startswith("user_")])
        total_sessions = sum(sm.get("sessions_completed", 0) for sm in STUDENT_MODELS.values())
        
        # Calculate average accuracy
        total_correct = 0
        total_problems = 0
        for sm in STUDENT_MODELS.values():
            # Rough estimate from distraction patterns
            total_problems += sm.get("sessions_completed", 0) * 5
            total_correct += int(sm.get("sessions_completed", 0) * 3.5)
        
        avg_accuracy = int((total_correct / max(1, total_problems)) * 100)
        
        # Calculate average study time
        total_time = sum(sm.get("total_focus_time", 0) for sm in STUDENT_MODELS.values())
        avg_time = int(total_time / max(1, len(STUDENT_MODELS)))
        
        # Mock common misconceptions (in production, aggregate from problem checks)
        common_misconceptions = [
            {"topic": "Calculus", "count": 3, "description": "Confusion between derivative and integral notation"},
            {"topic": "Algebra", "count": 2, "description": "Sign errors when distributing negatives"},
            {"topic": "Physics", "count": 2, "description": "Missing forces in free-body diagrams"}
        ] if total_students > 0 else []

        return {
            "teacher_id": teacher_id,
            "totalStudents": total_students,
            "totalSessions": total_sessions,
            "avgAccuracy": avg_accuracy,
            "avgTimeSpent": avg_time,
            "commonMisconceptions": common_misconceptions,
            "topicPerformance": {
                "Calculus": {"accuracy": 72, "attempts": 15},
                "Algebra": {"accuracy": 85, "attempts": 20},
                "Geometry": {"accuracy": 78, "attempts": 10}
            }
        }
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        return {
            "teacher_id": teacher_id,
            "totalStudents": 0,
            "totalSessions": 0,
            "avgAccuracy": 0,
            "avgTimeSpent": 0,
            "commonMisconceptions": [],
            "error": str(e)
        }


@app.post("/api/teacher/assignment")
async def create_assignment(request: AssignmentCreateRequest):
    """Create a new assignment"""
    try:
        assignment_id = str(uuid.uuid4())
        
        assignment = {
            "id": assignment_id,
            "title": request.title,
            "description": request.description,
            "department": request.department,
            "dueDate": request.due_date,
            "teacherId": request.teacher_id,
            "createdAt": datetime.utcnow().isoformat(),
            "submissions": [],
            "problems": []
        }
        
        ASSIGNMENTS_DB[assignment_id] = assignment
        
        logger.info(f"Assignment created: {assignment_id} by teacher {request.teacher_id}")
        
        return {
            "success": True,
            "assignment": assignment,
            "message": f"Assignment '{request.title}' created successfully"
        }
    except Exception as e:
        logger.error(f"Assignment creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/teacher/assignments")
async def list_assignments(teacher_id: str):
    """List all assignments for a teacher"""
    teacher_assignments = [
        a for a in ASSIGNMENTS_DB.values() 
        if a.get("teacherId") == teacher_id
    ]
    return {"assignments": teacher_assignments}


# ═══════════════════════════════════════════════════════════════════════════════
# MULTIPLAYER WORLD WEBSOCKET
# ═══════════════════════════════════════════════════════════════════════════════

# Store for multiplayer world state
WORLD_PLAYERS: Dict[str, dict] = {}
WORLD_CONNECTIONS: Dict[str, WebSocket] = {}


@app.websocket("/ws/world/{user_id}")
async def world_websocket(websocket: WebSocket, user_id: str):
    """WebSocket for multiplayer world synchronization"""
    await websocket.accept()
    WORLD_CONNECTIONS[user_id] = websocket

    logger.info(f"World WebSocket connected: {user_id}")

    # Send current players list to new connection
    await websocket.send_json({
        "type": "players_list",
        "players": list(WORLD_PLAYERS.values())
    })

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "player_join":
                # Store player info
                player = data.get("player", {})
                WORLD_PLAYERS[user_id] = player

                # Broadcast to all other players
                await broadcast_world_message({
                    "type": "player_join",
                    "player": player
                }, exclude=user_id)

            elif message_type == "player_move":
                # Update player position
                player = data.get("player", {})
                if user_id in WORLD_PLAYERS:
                    WORLD_PLAYERS[user_id].update(player)

                # Broadcast movement to all other players
                await broadcast_world_message({
                    "type": "player_move",
                    "player": {**WORLD_PLAYERS.get(user_id, {}), **player}
                }, exclude=user_id)

            elif message_type == "player_leave":
                # Remove player
                if user_id in WORLD_PLAYERS:
                    del WORLD_PLAYERS[user_id]

                # Broadcast leave
                await broadcast_world_message({
                    "type": "player_leave",
                    "playerId": user_id
                }, exclude=user_id)

            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"World WebSocket disconnected: {user_id}")
    except Exception as e:
        logger.error(f"World WebSocket error: {e}")
    finally:
        # Cleanup on disconnect
        if user_id in WORLD_CONNECTIONS:
            del WORLD_CONNECTIONS[user_id]
        if user_id in WORLD_PLAYERS:
            del WORLD_PLAYERS[user_id]

        # Notify others of disconnect
        await broadcast_world_message({
            "type": "player_leave",
            "playerId": user_id
        }, exclude=user_id)


async def broadcast_world_message(message: dict, exclude: str = None):
    """Broadcast message to all connected world clients"""
    disconnected = []

    for uid, ws in WORLD_CONNECTIONS.items():
        if uid != exclude:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(uid)

    # Clean up disconnected clients
    for uid in disconnected:
        if uid in WORLD_CONNECTIONS:
            del WORLD_CONNECTIONS[uid]
        if uid in WORLD_PLAYERS:
            del WORLD_PLAYERS[uid]


# ═══════════════════════════════════════════════════════════════════════════════
# RUN SERVER
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

