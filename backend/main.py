# ── Imports ───────────────────────────────────────────────────────────────────
import re                          # For stripping markdown fences from Gemini response
import json                        # For parsing Gemini's JSON output
import io                          # For reading file bytes in memory
import zipfile                     # For unpacking .docx files (they are ZIP archives)
import xml.etree.ElementTree as ET # For parsing the XML inside .docx files
from datetime import datetime      # For timestamping each saved project
from bson import ObjectId          # For converting string IDs to MongoDB ObjectId format
from bson.errors import InvalidId
import gridfs
from pymongo import MongoClient    # MongoDB Python driver
from google import genai           # Gemini AI client
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Agentic Resource Allocation Engine")

# Allow the React frontend 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Hardcoded API key ─────────────────────────────────────────────────────────
import os
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=GOOGLE_API_KEY)

# ── MongoDB connection ────────────────────────────────────────────────────────
# Connects to local MongoDB running on the default port 27017
# Database: pong_ai | Collection: projects
mongo = MongoClient("mongodb://localhost:27017")
db = mongo["pong_ai"]
projects_col = db["projects"]  # This is the table equivalent in MongoDB
fs = gridfs.GridFS(db)

# ── Role style map ────────────────────────────────────────────────────────────
# Maps role name keywords to an icon and color for the frontend cards
ROLE_STYLE = {
    "project manager":        {"icon": "📋", "color": "#8b5cf6"},
    "backend developer":      {"icon": "⚙️",  "color": "#3b82f6"},
    "backend engineer":       {"icon": "⚙️",  "color": "#3b82f6"},
    "frontend developer":     {"icon": "🖥️", "color": "#06b6d4"},
    "frontend engineer":      {"icon": "🖥️", "color": "#06b6d4"},
    "full-stack engineer":    {"icon": "⚡", "color": "#f59e0b"},
    "full stack engineer":    {"icon": "⚡", "color": "#f59e0b"},
    "qa engineer":            {"icon": "🔍", "color": "#f43f5e"},
    "devops engineer":        {"icon": "☁️",  "color": "#f59e0b"},
    "devops":                 {"icon": "☁️",  "color": "#f59e0b"},
    "tech lead":              {"icon": "🔧", "color": "#6366f1"},
    "tech lead / backend":    {"icon": "🔧", "color": "#6366f1"},
    "tech lead / pm":         {"icon": "🔧", "color": "#6366f1"},
    "frontend engineer / qa": {"icon": "🎨", "color": "#10b981"},
    "ai/ml engineer":         {"icon": "🤖", "color": "#ec4899"},
    "data engineer":          {"icon": "📊", "color": "#14b8a6"},
    "security engineer":      {"icon": "🛡️", "color": "#ef4444"},
}

def style_for_role(role_name: str) -> dict:
    """Look up icon and color for a given role name. Returns a fallback if not found."""
    key = role_name.lower().strip()
    for pattern, style in ROLE_STYLE.items():
        if pattern in key:
            return style
    return {"icon": "🧩", "color": "#6b7099"}  # Default fallback style

# ── Gemini prompt template ────────────────────────────────────────────────────
# This is the instruction sent to Gemini along with the uploaded document.
# Double curly braces {{ }} are used because we call .format() on this string later.
PROMPT_TEMPLATE = """You are an expert software engineering project analyst and resource allocator.

Read the project scope document below and the team size, then output a structured JSON resource allocation plan.

Rules:
- Adapt role composition to the team size. Small teams (1-2) get hybrid roles; larger teams get dedicated specialists.
- Every task must be SPECIFIC to the actual project content — not generic boilerplate.
- Role names must be concise (e.g. "Backend Developer", "Tech Lead / PM", "Frontend Engineer / QA").
- Assign 4-6 tasks per role. Tasks should be concrete action items derived from the document.
- tech_signals: list key technologies or domains mentioned in the document.

Respond ONLY with a valid JSON object — no markdown fences, no explanation, no preamble.

JSON schema:
{{
  "project_name": "string",
  "tech_signals": ["string"],
  "roles": [
    {{
      "role": "string",
      "badge": "Dedicated | Hybrid | Solo Mode",
      "tasks": ["string"]
    }}
  ]
}}

Team size: {team_size}

--- PROJECT DOCUMENT ---
{document}
--- END DOCUMENT ---"""

# ── Text extraction helpers ───────────────────────────────────────────────────

def extract_docx_text(raw_bytes: bytes) -> str:
    """
    Extract plain text from a .docx file.
    .docx files are ZIP archives containing an XML file (word/document.xml).
    We unzip it, parse the XML, and pull out all paragraph text.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
            xml = archive.read("word/document.xml")
        namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        root = ET.fromstring(xml)
        paragraphs = []
        for paragraph in root.findall(".//w:p", namespace):
            # Each paragraph contains multiple text run nodes (w:t)
            parts = [n.text for n in paragraph.findall(".//w:t", namespace) if n.text]
            if parts:
                paragraphs.append("".join(parts))
        return "\n".join(paragraphs)
    except Exception:
        return ""  # Return empty string if extraction fails

def extract_pdf_text(raw_bytes: bytes) -> str:
    """
    Extract plain text from a PDF file using pypdf.
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages)
    except Exception as e:
        print(f"[ERROR] PDF extraction failed: {e}")
        return ""

def extract_text(file: UploadFile, raw_bytes: bytes) -> str:
    """
    Route the file to the correct extractor based on file extension.
    Falls back to plain UTF-8 decode for .txt files.
    """
    filename = (file.filename or "").lower()
    if filename.endswith(".docx"):
        return extract_docx_text(raw_bytes)
    if filename.endswith(".pdf"):
        return extract_pdf_text(raw_bytes)
    # For .txt and other plain text files, just decode the bytes directly
    return raw_bytes.decode("utf-8", errors="ignore")

# ── Gemini API call ───────────────────────────────────────────────────────────

def ask_gemini(document_text: str, team_size: int) -> dict:
    """
    Send the document and team size to Gemini and return the parsed JSON result.
    We limit the document to 12000 characters to stay within token limits.
    """
    prompt = PROMPT_TEMPLATE.format(
        team_size=team_size,
        document=document_text[:12000],  # Truncate to avoid exceeding Gemini token limit
    )
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt,
    )
    raw = response.text.strip()

    # Gemini sometimes wraps the JSON in markdown code fences — strip them if present
    raw = re.sub(r"^```(?:json)?", "", raw).strip()
    raw = re.sub(r"```$", "", raw).strip()

    return json.loads(raw)  # Parse the cleaned JSON string into a Python dict

# ── MongoDB helper ────────────────────────────────────────────────────────────

def serialize(doc: dict) -> dict:
    """
    Convert MongoDB document for JSON transport: copy doc, convert '_id' to 'id'
    and convert GridFS `file_id` to a string when present.
    """
    serialized = doc.copy()
    serialized["id"] = str(serialized.pop("_id"))
    if "file_id" in serialized and serialized["file_id"] is not None:
        serialized["file_id"] = str(serialized["file_id"])
    return serialized

# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    team_size: int = Form(4),
):
    """
    Main endpoint: receives an uploaded file and team size,
    sends it to Gemini, styles the roles, saves to MongoDB, and returns the result.
    """
    # Read the raw file bytes from the upload
    raw_bytes = await file.read()

    # Extract readable text from the file
    content = extract_text(file, raw_bytes)

    # Reject empty files
    if not content.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the uploaded file.")

    # Send to Gemini for analysis
    try:
        gemini_result = ask_gemini(content, team_size)
    except json.JSONDecodeError as e:
        print(f"[ERROR] Malformed JSON from Gemini: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini returned malformed JSON: {e}")
    except Exception as e:
        print(f"[ERROR] Gemini API error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")

    # Apply icon and color styles to each role returned by Gemini
    styled_roles = []
    for role in gemini_result.get("roles", []):
        style = style_for_role(role["role"])
        styled_roles.append({
            "role":  role["role"],
            "icon":  style["icon"],
            "badge": role.get("badge", "Dedicated"),
            "color": style["color"],
            "tasks": role.get("tasks", []),
        })

    # Build the final result object
    result = {
        "project_name": gemini_result.get("project_name", file.filename),
        "team_size":    team_size,
        "tech_signals": gemini_result.get("tech_signals", []),
        "total_roles":  len(styled_roles),
        "roles":        styled_roles,
        "created_at":   datetime.utcnow().isoformat(),  # UTC timestamp for sidebar display
    }

    # Save file into GridFS (if present) and then persist project doc to MongoDB
    try:
        if raw_bytes:
            stored_file_id = fs.put(raw_bytes, filename=file.filename or "upload.bin", contentType=getattr(file, "content_type", None))
            result["file_id"] = stored_file_id
            result["file_name"] = file.filename
            result["file_content_type"] = getattr(file, "content_type", None)

        inserted = projects_col.insert_one(result.copy())
        result["id"] = str(inserted.inserted_id)
    except Exception as e:
        print(f"[ERROR] MongoDB/GridFS save error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save project to database")

    # Ensure file_id is a string in API responses
    if "file_id" in result:
        result["file_id"] = str(result["file_id"])

    return result


@app.get("/api/projects")
def list_projects():
    """
    Returns all past projects sorted by newest first.
    Used by the sidebar to populate the project history list.
    """
    docs = list(projects_col.find().sort("created_at", -1))
    return [serialize(d) for d in docs]


def parse_object_id(project_id: str):
    try:
        return ObjectId(project_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid project ID")


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    """
    Returns a single project by its MongoDB ID.
    Called when the user clicks a project in the sidebar to reload it.
    """
    oid = parse_object_id(project_id)
    doc = projects_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return serialize(doc)


@app.get("/api/projects/{project_id}/file")
def download_project_file(project_id: str):
    """Return the saved uploaded file (PDF/DOCX/TXT) for the project, streamed from GridFS."""
    oid = parse_object_id(project_id)
    doc = projects_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    file_id = doc.get("file_id")
    if not file_id:
        raise HTTPException(status_code=404, detail="No file attached to this project")
    try:
        if isinstance(file_id, str):
            file_id = ObjectId(file_id)
        grid_out = fs.get(file_id)
        return StreamingResponse(grid_out, media_type=getattr(grid_out, "contentType", getattr(grid_out, "content_type", "application/octet-stream")), headers={"Content-Disposition": f"attachment; filename=\"{grid_out.filename}\""})
    except Exception as e:
        print(f"[ERROR] GridFS download error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve file")


@app.patch("/api/projects/{project_id}/rename")
def rename_project(project_id: str, body: dict):
    """
    Updates the project_name field for a given project.
    Called when the user finishes editing a name in the sidebar.
    """
    new_name = body.get("project_name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="project_name is required")
    oid = parse_object_id(project_id)
    result = projects_col.update_one(
        {"_id": oid},
        {"$set": {"project_name": new_name}}  # MongoDB $set updates only this one field
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    """
    Permanently deletes a project from MongoDB.
    Called when the user clicks the trash icon in the sidebar.
    """
    oid = parse_object_id(project_id)
    doc = projects_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    # Remove attached file from GridFS if present
    file_id = doc.get("file_id")
    try:
        if file_id:
            if isinstance(file_id, str):
                file_id = ObjectId(file_id)
            fs.delete(file_id)
    except Exception:
        pass
    result = projects_col.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@app.get("/")
async def root():
    """Health check endpoint — confirms the server is running."""
    return {"status": "Agentic Resource Allocation Engine — online (Gemini + MongoDB)"}


if __name__ == "__main__":
    # Start the server with hot reload enabled for development
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)