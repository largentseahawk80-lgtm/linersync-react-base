import { useEffect, useMemo, useState } from 'react'

type Screen = 'home' | 'newProject' | 'projectHome'

type Project = {
  name: string
  site: string
  date: string
  notes: string
}

const PROJECT_KEY = 'linersync_project_v1'

const emptyProject: Project = {
  name: '',
  site: '',
  date: '',
  notes: '',
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [project, setProject] = useState<Project>(emptyProject)
  const [draft, setDraft] = useState<Project>(emptyProject)
  const [helpOpen, setHelpOpen] = useState(false)
  const [status, setStatus] = useState('Ready')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Project
      if (saved?.name) {
        setProject(saved)
        setStatus('Loaded current project')
      }
    } catch {
      setStatus('Project load failed')
    }
  }, [])

  const hasProject = useMemo(() => Boolean(project.name.trim()), [project])

  function openCurrentProject() {
    if (!hasProject) {
      setStatus('No current project saved yet')
      return
    }
    setScreen('projectHome')
    setStatus('Current project opened')
  }

  function openNewProject() {
    setDraft(emptyProject)
    setScreen('newProject')
    setStatus('New project form ready')
  }

  function saveProject() {
    if (!draft.name.trim()) {
      setStatus('Project name is required')
      return
    }
    localStorage.setItem(PROJECT_KEY, JSON.stringify(draft))
    setProject(draft)
    setScreen('projectHome')
    setStatus('Project saved locally')
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        {screen === 'home' && (
          <section className="panel hero">
            <div className="brand-row">
              <div className="logo">
                <span>LS</span>
              </div>
              <div>
                <h1 className="title">LinerSync</h1>
                <p className="subtitle">React base rebuild — Chunk 1</p>
              </div>
            </div>

            <div className="accent-line" />

            <div className="stack">
              <button className="btn big" onClick={openCurrentProject}>
                OPEN CURRENT PROJECT
              </button>
              <button className="btn big" onClick={openNewProject}>
                NEW PROJECT
              </button>
              <button
                className="btn big primary"
                onClick={() => setStatus('Tap to Capture is coming in Chunk 2')}
              >
                TAP TO CAPTURE
              </button>
            </div>

            <div className="stats">
              <div className="stat-card">
                <strong>Project</strong>
                <span>{project.name || 'None'}</span>
              </div>
              <div className="stat-card">
                <strong>Status</strong>
                <span>{status}</span>
              </div>
            </div>
          </section>
        )}

        {screen === 'newProject' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('home')}>
              ← BACK
            </button>

            <h2 className="section-title">NEW PROJECT</h2>

            <div className="form-stack">
              <label className="field">
                <span>Project Name</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Enter project name"
                />
              </label>

              <label className="field">
                <span>Site / Location</span>
                <input
                  value={draft.site}
                  onChange={(e) => setDraft((p) => ({ ...p, site: e.target.value }))}
                  placeholder="Enter site or location"
                />
              </label>

              <label className="field">
                <span>Date</span>
                <input
                  value={draft.date}
                  onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
                  placeholder="MM/DD/YYYY"
                />
              </label>

              <label className="field">
                <span>Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </label>

              <button className="btn primary" onClick={saveProject}>
                SAVE PROJECT
              </button>
            </div>
          </section>
        )}

        {screen === 'projectHome' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('home')}>
              ← BACK
            </button>

            <div className="project-head">
              <div>
                <h2 className="section-title">{project.name || 'PROJECT'}</h2>
                <p className="subtitle">
                  {project.site || 'No site set'}
                  {project.date ? ` • ${project.date}` : ''}
                </p>
              </div>
              <div className="pill">Current Project</div>
            </div>

            <div className="stack">
              <button
                className="btn big primary"
                onClick={() => setStatus('Capture modules start in Chunk 2')}
              >
                TAP TO CAPTURE
              </button>
              <div className="grid-two">
                <button className="btn small" onClick={() => setStatus('Map comes later')}>
                  MAP
                </button>
                <button className="btn small" onClick={() => setStatus('Reports comes later')}>
                  REPORTS
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <button className="help-fab" onClick={() => setHelpOpen(true)}>
        HELP
      </button>

      {helpOpen && (
        <div className="modal-wrap" onClick={() => setHelpOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>HELP</h3>
            <div className="detail-box">
              <strong>Chunk 1 scope</strong>
              Real React/Vite base, S25 Ultra fit, one Help button, clean navigation,
              current project local save.
            </div>
            <div className="detail-box">
              <strong>Next chunk</strong>
              Core field capture: Repair, Roll, basic Panel, Seam, detail, edit, delete.
            </div>
            <button className="btn primary" onClick={() => setHelpOpen(false)}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
