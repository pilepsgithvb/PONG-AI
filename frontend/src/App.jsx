import { useState, useRef } from "react";
import "./App.css";

// ── Icons (inline SVG, no extra deps) ────────────────────────────────────────
const UploadIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const SpinnerIcon = () => (
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function App() {
  const [file, setFile] = useState(null);
  const [teamSize, setTeamSize] = useState(4);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  // ── File handling ───────────────────────────────────────────────────────────
  const handleFile = (f) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!f) return;
    if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|docx|txt)$/i)) {
      setError("Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!file) { setError("Please upload a project document first."); return; }
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("team_size", teamSize);

    try {
      const res = await fetch("http://localhost:8000/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error: ${res.status}`);
      setResult(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err.message.includes("fetch") ? "Cannot reach the backend. Is the FastAPI server running on port 8000?" : err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-dot" />
            <span className="logo-text">PONG AI</span>
          </div>
          
          <div className="status-badge">
            <span className="status-dot" />
            System Online
          </div>
        </div>
      </header>

      <main className="main">
        {/* ── Hero ── */}
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

        {/* ── Control Panel ── */}
        <section className="panel">
          <div className="panel-grid">

            {/* Drop Zone */}
            <div className="panel-col">
              <label className="panel-label">Project Document</label>
              <div
                className={`dropzone ${dragging ? "drag-over" : ""} ${file ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                {file ? (
                  <div className="file-info">
                    <div className="file-icon">📄</div>
                    <div>
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{(file.size / 1024).toFixed(1)} KB — Ready to analyze</div>
                    </div>
                    <button className="file-clear" onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}>✕</button>
                  </div>
                ) : (
                  <div className="drop-content">
                    <UploadIcon />
                    <span className="drop-primary">Drop your document here</span>
                    <span className="drop-secondary">PDF, DOCX, or TXT — click to browse</span>
                  </div>
                )}
              </div>
            </div>

            {/* Team Size */}
            <div className="panel-col panel-col-narrow">
              <label className="panel-label">Team Size Constraint</label>
              <div className="counter-card">
                <div className="counter-label">Active Headcount</div>
                <div className="counter-row">
                  <button className="counter-btn" onClick={() => setTeamSize(Math.max(1, teamSize - 1))}>−</button>
                  <div className="counter-value">{teamSize}</div>
                  <button className="counter-btn" onClick={() => setTeamSize(Math.min(12, teamSize + 1))}>+</button>
                </div>
                <div className="counter-mode">
                  {teamSize <= 1 ? "Solo Mode — maximum overlap" :
                   teamSize <= 2 ? "Minimal — hybrid roles" :
                   teamSize <= 4 ? "Standard — balanced split" :
                   "Extended — full specialization"}
                </div>
                <div className="counter-track">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className={`track-dot ${i < teamSize ? "track-dot-active" : ""}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && <div className="error-bar">⚠ {error}</div>}

          <button className="analyze-btn" onClick={handleAnalyze} disabled={loading || !file}>
            {loading ? <><SpinnerIcon /> Analyzing…</> : <>Run Allocation Engine →</>}
          </button>
        </section>

        {/* ── Results ── */}
        {result && (
          <section className="results" ref={resultsRef}>
            {/* Summary bar */}
            <div className="results-header">
              <div>
                <div className="results-project">{result.project_name}</div>
                <div className="results-meta">
                  {result.total_roles} roles · {result.team_size} engineers · {result.tech_signals.join(", ")}
                </div>
              </div>
              <div className="results-count">{result.total_roles} <span>Roles</span></div>
            </div>

            {/* Role cards grid */}
            <div className="roles-grid">
              {result.roles.map((role, i) => (
                <RoleCard key={i} role={role} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Agentic Resource Allocation Engine</span>
        <span className="footer-sep">·</span>
        <span>FastAPI + React + Vite</span>
      </footer>
    </div>
  );
}

// ── Role Card ─────────────────────────────────────────────────────────────────
function RoleCard({ role, index }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="role-card"
      style={{ "--card-color": role.color, animationDelay: `${index * 80}ms` }}
    >
      <div className="role-card-header" onClick={() => setOpen(!open)}>
        <div className="role-icon">{role.icon}</div>
        <div className="role-info">
          <div className="role-name">{role.role}</div>
          <div className="role-badge" style={{ background: role.color + "22", color: role.color }}>{role.badge}</div>
        </div>
        <div className={`role-chevron ${open ? "open" : ""}`}>›</div>
      </div>
      {open && (
        <ul className="role-tasks">
          {role.tasks.map((task, j) => (
            <li key={j} className="role-task">
              <span className="task-bullet" style={{ background: role.color }} />
              {task}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
