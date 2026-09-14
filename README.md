# PONG AI - Robert Philippe Gerong

## Overview

This project is an AI-assisted resource allocation system for software projects. It combines a React frontend with a FastAPI backend and uses Google Gemini (via the `google-genai` client) to analyze uploaded project documents and generate structured role/task allocations.

The system accepts project scope files (`PDF`, `DOCX`, `TXT`), extracts text, sends it to Gemini with a custom prompt, and returns a JSON-based team plan. Project history is stored in MongoDB, including the uploaded document via GridFS.

## System Architecture

- `frontend/`
  - React application built with Vite.
  - Provides a drag-and-drop file upload UI.
  - Sends requests to the backend via `fetch`.
  - Displays analysis results, project history, and file previews.

- `backend/`
  - FastAPI server in `backend/main.py`.
  - Accepts multipart form data for file uploads and a team size.
  - Extracts text from `TXT`, `PDF`, and `DOCX` uploads.
  - Calls Google Gemini to generate a structured JSON resource plan.
  - Saves project metadata and uploaded files in MongoDB/GridFS.

- Database
  - MongoDB stores project metadata in `pong_ai.projects`.
  - GridFS stores uploaded project files, allowing downloads and preview restoration.

## Libraries Used

### Backend

- `fastapi` — API framework for building the backend.
- `uvicorn` — ASGI server used to run the FastAPI app.
- `python-multipart` — Handles file upload parsing.
- `google-genai` — Google Gemini client library.
- `pypdf` — Extracts text from PDF files.
- `pymongo` — MongoDB driver for Python.
- `gridfs` — MongoDB GridFS utility for file storage.

### Frontend

- `react` — UI library.
- `react-dom` — React DOM renderer.
- `vite` — Development build tool.
- `tailwindcss` — Styling utility framework.
- `@tailwindcss/vite` and `@tailwindcss/postcss` — Tailwind integration for Vite.
- `lucide-react` — Optional icon support (if used by the UI).

## AI Libraries

This project uses
- `google-genai` to interact with Google Gemini.
- A custom prompt template in `backend/main.py` to generate structured JSON output.

## Setup Instructions

### Prerequisites

- Python 3.10+ or newer
- Node.js 18+ / npm
- MongoDB running locally on `mongodb://localhost:27017`

### Backend Setup

1. Open a terminal and navigate to `backend/`.
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start MongoDB if it is not already running.
4. Run the backend:
   ```bash
   python main.py
   ```

The backend will listen on `http://localhost:8000` by default.

### Frontend Setup

1. Open a terminal and navigate to `frontend/`.
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```

The frontend should open on a Vite URL, typically `http://localhost:5173`.

### Using the App

1. Upload a project document (`PDF`, `DOCX`, or `TXT`).
2. Set the desired team size.
3. Click the analyze button.
4. The backend will call Gemini and return a structured project plan.
5. Saved projects appear in the sidebar and can be loaded, renamed, or deleted.

## Notes

- The backend currently uses a hardcoded Google API key in `backend/main.py` solely for the presentation.
- For a production setup, move API keys and secrets into environment variables and do not store them in source.
- Ensure MongoDB is available before starting the backend.

## Folder Layout

- `/frontend` — React + Vite UI.
- `/backend` — FastAPI server and AI/document-processing logic.
- `/backend/requirements.txt` — Python dependencies.
- `/frontend/package.json` — JavaScript dependencies.

## Main Files

For questions or further improvements, inspect:
- `backend/main.py` for API and AI logic
- `frontend/src/App.jsx` for UI and backend integration
