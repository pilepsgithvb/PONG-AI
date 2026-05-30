import { useState, useRef, useEffect } from "react";
import "./App.css";

// Base URL for all API calls — points to the FastAPI backend
const API = "http://localhost:8000";

// ── Icons (inline SVG — no extra icon library needed) ─────────────────────────

const UploadIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const SpinnerIcon = () => (
  // Animated loading spinner shown while Gemini is processing
  <svg className="spinner" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 2a10 10 0 1 0 10 10" />
  </svg>
);

const ChipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    <rect x="2" y="2" width="20" height="20" rx="3" />
  </svg>
);

// Trash icon for deleting a project from the sidebar
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);

// Pencil icon for renaming a project in the sidebar
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// Hamburger menu icon — shown in header when sidebar is collapsed
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ── Main App Component ────────────────────────────────────────────────────────
export default function App() {
  // File upload state
  const [file, setFile]         = useState(null);
  // Team size counter value
  const [teamSize, setTeamSize] = useState(4);
  // The result object returned from the backend after analysis
  const [result, setResult]     = useState(null);
  // Loading state while waiting for Gemini response
  const [loading, setLoading]   = useState(false);
  // Error message to display in the error bar
  const [error, setError]       = useState("");
  // Whether the user is dragging a file over the dropzone
  const [dragging, setDragging] = useState(false);
  // Controls whether the sidebar is visible
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // List of past projects fetched from MongoDB
  const [projects, setProjects] = useState([]);
  // ID of the project currently being renamed in the sidebar
  const [renamingId, setRenamingId]   = useState(null);
  // Current value of the rename input field
  const [renameVal, setRenameVal]     = useState("");

  const fileInputRef = useRef(null);  // Ref to trigger hidden file input click
  const resultsRef   = useRef(null);  // Ref to scroll to results after analysis
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewText, setPreviewText] = useState(null);

  // Fetch the sidebar project list when the app first loads
  useEffect(() => { fetchProjects(); }, []);
  // On mount, restore last-opened project (if any)
  useEffect(() => {
    const last = localStorage.getItem("pong_last_project");
    if (last) loadProject(last);
  }, []);

  // ── Fetch past projects from MongoDB via backend ──────────────────────────
  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API}/api/projects`);
      const data = await res.json();
      setProjects(data);  // Populate sidebar list
    } catch {
      // Silently fail if backend isn't ready yet on initial load
    }
  };

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return;
    // Accept PDF, DOCX, and TXT files only
    setFile(f);
    setError("");
    setResult(null);
  };

  // Handle file dropped into the dropzone
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // Build a local preview URL or read text when the selected file changes
  useEffect(() => {
    let url = null;
    let reader = null;
    setPreviewUrl(null);
    setPreviewText(null);
    if (!file) return () => {};

    const name = (file.name || "").toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else if (name.endsWith('.txt') || file.type === 'text/plain') {
      reader = new FileReader();
      reader.onload = (e) => setPreviewText(String(e.target.result));
      reader.readAsText(file);
    } else if (name.endsWith('.docx')) {
      // Browsers cannot render DOCX inline; provide a download link
      url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
      if (reader) reader.abort && reader.abort();
    };
  }, [file]);

  // Revoke any preview object URLs when they change or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── Run Analysis ──────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!file) { setError("Please upload a project document first."); return; }
    setLoading(true);
    setError("");
    setResult(null);

    // Send file + team size as multipart form data to the backend
    const formData = new FormData();
    formData.append("file", file);
    formData.append("team_size", teamSize);

    try {
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error: ${res.status}`);
      setResult(data);
      fetchProjects(); // Refresh sidebar to include the newly saved project
      // Persist this project as the last-opened so reloads restore it
      if (data.id) localStorage.setItem("pong_last_project", data.id);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err.message.includes("fetch")
        ? "Cannot reach the backend. Is FastAPI running on port 8000?"
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Load a past project from the sidebar ─────────────────────────────────
  const loadProject = async (id) => {
    try {
      const res = await fetch(`${API}/api/projects/${id}`);
      const data = await res.json();
      setResult(data);   // Display the loaded project in the results section
      setFile(null);     // Clear any currently selected file
      setError("");

      // Persist last-opened project so reloads restore this view
      localStorage.setItem("pong_last_project", id);

      // If the project has a saved file in the DB, fetch it and set preview
      // Revoke any previous object URL before creating a new one
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch {}
        setPreviewUrl(null);
      }
      setPreviewText(null);
      if (data.file_id) {
        try {
          const fres = await fetch(`${API}/api/projects/${id}/file`);
          if (fres.ok) {
            const blob = await fres.blob();
            // Recreate a File object so the existing file-based preview logic runs
            const mime = data.file_content_type || blob.type || "application/octet-stream";
            const restoredFile = new File([blob], data.file_name || "document", { type: mime });
            // setFile will trigger the file-preview useEffect which produces previewUrl/previewText
            setFile(restoredFile);
            // Also set preview directly for immediate display as a fallback
            if (mime.startsWith("text/")) {
              const txt = await blob.text();
              setPreviewText(txt);
            } else {
              const url = URL.createObjectURL(blob);
              setPreviewUrl(url);
            }
          }
        } catch (e) {
          // ignore preview failures, project still loads
        }
      }

      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setError("Failed to load project.");
    }
  };

  // ── Start renaming a project (enters edit mode in sidebar) ───────────────
  const startRename = (p, e) => {
    e.stopPropagation();           // Prevent click from also loading the project
    setRenamingId(p.id);
    setRenameVal(p.project_name);  // Pre-fill input with current name
  };

  // ── Submit the renamed project name to the backend ────────────────────────
  const submitRename = async (id) => {
    if (!renameVal.trim()) return;
    await fetch(`${API}/api/projects/${id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_name: renameVal }),
    });
    setRenamingId(null);  // Exit rename mode
    fetchProjects();      // Refresh sidebar with updated name
    // Also update the displayed result name if this project is currently shown
    if (result?.id === id) setResult({ ...result, project_name: renameVal });
  };

  // ── Delete a project from MongoDB and remove it from the sidebar ──────────
  const deleteProject = async (id, e) => {
    e.stopPropagation();  // Prevent click from also loading the project
    await fetch(`${API}/api/projects/${id}`, { method: "DELETE" });
    fetchProjects();      // Refresh sidebar
    // Clear the result panel if the deleted project was currently displayed
    if (result?.id === id) setResult(null);
    // Clear persisted last-opened if it was the deleted project
    const last = localStorage.getItem("pong_last_project");
    if (last === id) localStorage.removeItem("pong_last_project");
  };

  // Format ISO timestamp into a readable date like "Jan 5, 2025"
  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Sidebar — shows past projects from MongoDB ── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Past Projects</span>
          {/* Close button collapses the sidebar */}
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <div className="sidebar-list">
          {/* Empty state when no projects have been saved yet */}
          {projects.length === 0 && (
            <div className="sidebar-empty">No projects yet. Run an analysis to save one.</div>
          )}

          {/* Render one item per saved project */}
          {projects.map((p) => (
            <div key={p.id} className="sidebar-item" onClick={() => loadProject(p.id)}>

              {/* If this project is being renamed, show an input instead of the name */}
              {renamingId === p.id ? (
                <input
                  className="rename-input"
                  value={renameVal}
                  autoFocus
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => submitRename(p.id)}           // Save on focus loss
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRename(p.id);  // Save on Enter
                    if (e.key === "Escape") setRenamingId(null); // Cancel on Escape
                  }}
                  onClick={(e) => e.stopPropagation()} // Prevent triggering loadProject
                />
              ) : (
                <>
                  <div className="sidebar-item-info">
                    <span className="sidebar-item-name">{p.project_name}</span>
                    {/* Show date and role count as subtitle */}
                    <span className="sidebar-item-date">{formatDate(p.created_at)} · {p.total_roles} roles</span>
                  </div>
                  {/* Action buttons — only visible on hover via CSS */}
                  <div className="sidebar-item-actions">
                    <button className="icon-btn" title="Rename" onClick={(e) => startRename(p, e)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn danger" title="Delete" onClick={(e) => deleteProject(p.id, e)}>
                      <TrashIcon />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main content area — shifts right when sidebar is open ── */}
      <div className={`content ${sidebarOpen ? "with-sidebar" : ""}`}>

        {/* ── Header ── */}
        <header className="header">
          <div className="header-inner">
            <div className="logo">
              {/* Show hamburger menu button only when sidebar is collapsed */}
              {!sidebarOpen && (
                <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
                  <MenuIcon />
                </button>
              )}
              <img src="/icon.png" width="24" height="24" style={{ borderRadius: "4px" }} />
              <span className="logo-text">PONG AI</span>
            </div>
            <div className="status-badge">
              <span className="status-dot" />
              System Online
            </div>
          </div>
        </header>

        <main className="main">

          {/* ── Hero section ── */}
          <section className="hero">
            <div className="hero-tag"><ChipIcon /> Agentic Resource Allocation Engine</div>
            <h1 className="hero-title">
              Intelligent<br />
              <span className="hero-accent">Team Distribution</span>
            </h1>
            <p className="hero-sub">
              Upload a project scope document. Set your team size.<br />
              The engine parses, evaluates, and distributes responsibilities into optimized role matrices.
            </p>
          </section>

          {/* ── Control Panel — file upload + team size ── */}
          <section className="panel">
            <div className="panel-grid">

              {/* File drop zone */}
              <div className="panel-col">
                <label className="panel-label">Project Document</label>
                <div
                  className={`dropzone ${dragging ? "drag-over" : ""} ${file ? "has-file" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  {/* Hidden file input triggered by clicking the dropzone */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                  {file ? (
                    // Show file info when a file is selected
                    <div className="file-info">
                      <div className="file-icon">📄</div>
                      <div>
                        <div className="file-name">{file.name}</div>
                        <div className="file-size">{(file.size / 1024).toFixed(1)} KB — Ready to analyze</div>
                      </div>
                      {/* Clear button removes the selected file */}
                      <button className="file-clear" onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}>✕</button>
                    </div>
                  ) : (
                    // Default empty state of the dropzone
                    <div className="drop-content">
                      <UploadIcon />
                      <span className="drop-primary">Drop your document here</span>
                      <span className="drop-secondary">PDF, DOCX, or TXT — click to browse</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Team size counter */}
              <div className="panel-col panel-col-narrow">
                <label className="panel-label">Team Size Constraint</label>
                <div className="counter-card">
                  <div className="counter-label">Active Headcount</div>
                  <div className="counter-row">
                    {/* Decrement button — minimum value is 1 */}
                    <button className="counter-btn" onClick={() => setTeamSize(Math.max(1, teamSize - 1))}>−</button>
                    <div className="counter-value">{teamSize}</div>
                    {/* Increment button — maximum value is 12 */}
                    <button className="counter-btn" onClick={() => setTeamSize(Math.min(12, teamSize + 1))}>+</button>
                  </div>
                  {/* Dynamic label describing the allocation mode based on team size */}
                  <div className="counter-mode">
                    {teamSize <= 1 ? "Solo Mode — maximum overlap" :
                     teamSize <= 2 ? "Minimal — hybrid roles" :
                     teamSize <= 4 ? "Standard — balanced split" :
                     "Extended — full specialization"}
                  </div>
                  {/* Visual dot track showing how many slots are filled */}
                  <div className="counter-track">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className={`track-dot ${i < teamSize ? "track-dot-active" : ""}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Error message bar — only shown when error state is set */}
            {error && <div className="error-bar">⚠ {error}</div>}

            {/* Submit button — disabled while loading or no file is selected */}
            <button className="analyze-btn" onClick={handleAnalyze} disabled={loading || !file}>
              {loading ? <><SpinnerIcon /> Analyzing…</> : <>Run Allocation Engine →</>}
            </button>
          </section>

          {/* ── Results section — only rendered after a successful analysis ── */}
          {result && (
            <section className="results" ref={resultsRef}>
              {/* Summary header row */}
              <div className="results-header">
                <div>
                  <div className="results-project">{result.project_name}</div>
                  <div className="results-meta">
                    {result.total_roles} roles · {result.team_size} engineers · {result.tech_signals?.join(", ")}
                  </div>
                </div>
                <div className="results-count">{result.total_roles} <span>Roles</span></div>
              </div>

              {/* Grid of role cards */}
              <div className="roles-grid">
                {result.roles.map((role, i) => (
                  <RoleCard key={i} role={role} index={i} />
                ))}
              </div>
            </section>
          )}

          {/* ── Document Viewer — shows uploaded file preview or download link ── */}
          {(file || previewUrl || previewText) && (
            <section className="viewer">
              <div className="viewer-header">Uploaded Document</div>
              {previewUrl && file?.name?.toLowerCase().endsWith('.pdf') && (
                <iframe className="viewer-iframe" title="pdf-preview" src={previewUrl} />
              )}
              {previewText && (
                <pre className="viewer-text">{previewText}</pre>
              )}
              {previewUrl && file?.name?.toLowerCase().endsWith('.docx') && (
                <div className="viewer-docx">
                  <p>Preview not available for DOCX files in-browser.</p>
                  <a className="download-btn" href={previewUrl} download={file.name}>Download {file.name}</a>
                </div>
              )}
            </section>
          )}
        </main>

        <footer className="footer">
          <span>PONG AI</span>
          <span className="footer-sep">·</span>
          <span>FastAPI + React + MongoDB</span>
        </footer>
      </div>
    </div>
  );
}

// ── Role Card Component ───────────────────────────────────────────────────────
// Each role returned by Gemini gets its own collapsible card
function RoleCard({ role, index }) {
  // Controls whether the task list is expanded or collapsed
  const [open, setOpen] = useState(true);

  return (
    <div
      className="role-card"
      // CSS custom property used for the colored top border
      style={{ "--card-color": role.color, animationDelay: `${index * 80}ms` }}
    >
      {/* Card header — click to toggle task list visibility */}
      <div className="role-card-header" onClick={() => setOpen(!open)}>
        <div className="role-icon">{role.icon}</div>
        <div className="role-info">
          <div className="role-name">{role.role}</div>
          {/* Badge shows Dedicated / Hybrid / Solo Mode */}
          <div className="role-badge" style={{ background: role.color + "22", color: role.color }}>
            {role.badge}
          </div>
        </div>
        {/* Chevron rotates 90° when the card is open */}
        <div className={`role-chevron ${open ? "open" : ""}`}>›</div>
      </div>

      {/* Task list — conditionally rendered based on open state */}
      {open && (
        <ul className="role-tasks">
          {role.tasks.map((task, j) => (
            <li key={j} className="role-task">
              {/* Colored bullet dot matching the role's color */}
              <span className="task-bullet" style={{ background: role.color }} />
              {task}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}