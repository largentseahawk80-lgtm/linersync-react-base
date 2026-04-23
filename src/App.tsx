import { useEffect, useMemo, useState } from 'react'

type Screen = 'home' | 'newProject' | 'projectHome' | 'chooser' | 'module' | 'detail'
type ModuleKey = 'repairs' | 'rolls' | 'panels' | 'seams'

type Project = {
  name: string
  site: string
  date: string
  notes: string
}

type RecordMap = Record<string, string>

type DB = {
  repairs: RecordMap[]
  rolls: RecordMap[]
  panels: RecordMap[]
  seams: RecordMap[]
}

const PROJECT_KEY = 'linersync_project_v2'
const DB_KEY = 'linersync_db_v2'

const emptyProject: Project = {
  name: '',
  site: '',
  date: '',
  notes: '',
}

const emptyDb: DB = {
  repairs: [],
  rolls: [],
  panels: [],
  seams: [],
}

const moduleConfig: Record<ModuleKey, { title: string; action: string; firstField: string; visible: string[]; fields: string[] }> = {
  repairs: {
    title: 'REPAIR',
    action: 'ADD REPAIR',
    firstField: 'Repair#',
    visible: ['Repair#', 'Panel', 'Type', 'Status', 'Date'],
    fields: ['Repair#', 'Panel', 'Type', 'Location', 'Reason', 'Welder', 'Status', 'Date', 'Comments'],
  },
  rolls: {
    title: 'ROLL',
    action: 'ADD ROLL',
    firstField: 'Roll#',
    visible: ['Roll#', 'Lot#', 'Manufacturer', 'Status', 'Date'],
    fields: ['Roll#', 'Lot#', 'Manufacturer', 'Width', 'Length', 'Status', 'Date', 'Comments'],
  },
  panels: {
    title: 'PANEL',
    action: 'ADD PANEL',
    firstField: 'Panel#',
    visible: ['Panel#', 'Roll#', 'Area', 'Status', 'Date'],
    fields: ['Panel#', 'Roll#', 'Length', 'Width', 'Area', 'Status', 'Date', 'Comments'],
  },
  seams: {
    title: 'SEAM',
    action: 'ADD SEAM',
    firstField: 'Seam#',
    visible: ['Seam#', 'Panel1', 'Panel2', 'Status', 'Date'],
    fields: ['Seam#', 'Panel1', 'Panel2', 'Weld Type', 'Length', 'Welder', 'Status', 'Date', 'Comments'],
  },
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [project, setProject] = useState<Project>(emptyProject)
  const [draftProject, setDraftProject] = useState<Project>(emptyProject)
  const [db, setDb] = useState<DB>(emptyDb)
  const [helpOpen, setHelpOpen] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [activeModule, setActiveModule] = useState<ModuleKey>('repairs')
  const [recordDraft, setRecordDraft] = useState<RecordMap>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const savedProject = localStorage.getItem(PROJECT_KEY)
      if (savedProject) {
        const parsed = JSON.parse(savedProject) as Project
        if (parsed?.name) setProject(parsed)
      }
    } catch {}
    try {
      const savedDb = localStorage.getItem(DB_KEY)
      if (savedDb) {
        const parsed = JSON.parse(savedDb) as DB
        setDb({
          repairs: parsed.repairs || [],
          rolls: parsed.rolls || [],
          panels: parsed.panels || [],
          seams: parsed.seams || [],
        })
      }
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  }, [db])

  const hasProject = Boolean(project.name.trim())
  const cfg = moduleConfig[activeModule]
  const totalSaved = useMemo(
    () => db.repairs.length + db.rolls.length + db.panels.length + db.seams.length,
    [db]
  )
  const activeRows = db[activeModule]
  const detailRecord = activeRows.find((row) => row.id === detailId) || null

  function openCurrentProject() {
    if (!hasProject) {
      setStatus('No current project saved yet')
      return
    }
    setScreen('projectHome')
    setStatus('Current project opened')
  }

  function openNewProject() {
    setDraftProject(emptyProject)
    setScreen('newProject')
    setStatus('New project form ready')
  }

  function saveProject() {
    if (!draftProject.name.trim()) {
      setStatus('Project name is required')
      return
    }
    localStorage.setItem(PROJECT_KEY, JSON.stringify(draftProject))
    setProject(draftProject)
    setScreen('projectHome')
    setStatus('Project saved locally')
  }

  function nextId(prefix: string, module: ModuleKey, field: string) {
    let max = 0
    db[module].forEach((row) => {
      const value = row[field] || ''
      const match = value.match(/(\d+)/)
      if (match) max = Math.max(max, Number(match[1]))
    })
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  function today() {
    const d = new Date()
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
  }

  function getDefaultDraft(module: ModuleKey): RecordMap {
    if (module === 'repairs') return { 'Repair#': nextId('R-', module, 'Repair#'), Date: today(), Type: 'Patch', Status: 'Open' }
    if (module === 'rolls') return { 'Roll#': nextId('RL-', module, 'Roll#'), Date: today(), Status: 'Available' }
    if (module === 'panels') return { 'Panel#': nextId('P-', module, 'Panel#'), Date: today(), Status: 'Open' }
    return { 'Seam#': nextId('S-', module, 'Seam#'), Date: today(), 'Weld Type': 'Fusion', Status: 'Open' }
  }

  function openModule(module: ModuleKey) {
    setActiveModule(module)
    setScreen('module')
    setRecordDraft({})
    setStatus(`${moduleConfig[module].title} module open`)
  }

  function startNewRecord() {
    setEditingId(null)
    setRecordDraft(getDefaultDraft(activeModule))
    setStatus(`${cfg.title} form ready`)
  }

  function openEdit(row: RecordMap) {
    setEditingId(row.id || null)
    setRecordDraft({ ...row })
    setStatus(`Editing ${cfg.title}`)
  }

  function saveRecord() {
    const firstField = cfg.firstField
    if (!(recordDraft[firstField] || '').trim()) {
      setStatus(`${firstField} is required`)
      return
    }

    const finalRecord: RecordMap = {
      ...recordDraft,
      id: editingId || crypto.randomUUID(),
      _savedAt: new Date().toISOString(),
    }

    if (activeModule === 'panels' && !finalRecord.Area && finalRecord.Length && finalRecord.Width) {
      const length = Number(finalRecord.Length)
      const width = Number(finalRecord.Width)
      if (!Number.isNaN(length) && !Number.isNaN(width)) {
        finalRecord.Area = String((length * width).toFixed(1))
      }
    }

    setDb((prev) => {
      const rows = [...prev[activeModule]]
      const existingIndex = rows.findIndex((row) => row.id === finalRecord.id)
      if (existingIndex >= 0) rows[existingIndex] = finalRecord
      else rows.unshift(finalRecord)
      return { ...prev, [activeModule]: rows }
    })

    setEditingId(null)
    setRecordDraft({})
    setStatus(`${cfg.title} saved`)
  }

  function deleteRecord(id: string) {
    setDb((prev) => ({
      ...prev,
      [activeModule]: prev[activeModule].filter((row) => row.id !== id),
    }))
    setDetailId(null)
    setScreen('module')
    setStatus(`${cfg.title} deleted`)
  }

  function fieldInput(field: string, value: string) {
    setRecordDraft((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        {screen === 'home' && (
          <section className="panel hero">
            <div className="brand-row">
              <div className="logo"><span>LS</span></div>
              <div>
                <h1 className="title">LinerSync</h1>
                <p className="subtitle">Chunk 2 — Core field capture</p>
              </div>
            </div>

            <div className="accent-line" />

            <div className="stack">
              <button className="btn big" onClick={openCurrentProject}>OPEN CURRENT PROJECT</button>
              <button className="btn big" onClick={openNewProject}>NEW PROJECT</button>
              <button className="btn big primary" onClick={() => hasProject ? setScreen('chooser') : setStatus('Create or open a project first')}>
                TAP TO CAPTURE
              </button>
            </div>

            <div className="stats">
              <div className="stat-card">
                <strong>Project</strong>
                <span>{project.name || 'None'}</span>
              </div>
              <div className="stat-card">
                <strong>Total Saved</strong>
                <span>{String(totalSaved)}</span>
              </div>
            </div>
          </section>
        )}

        {screen === 'newProject' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('home')}>← BACK</button>
            <h2 className="section-title">NEW PROJECT</h2>
            <div className="form-stack">
              <label className="field">
                <span>Project Name</span>
                <input value={draftProject.name} onChange={(e) => setDraftProject((p) => ({ ...p, name: e.target.value }))} placeholder="Enter project name" />
              </label>
              <label className="field">
                <span>Site / Location</span>
                <input value={draftProject.site} onChange={(e) => setDraftProject((p) => ({ ...p, site: e.target.value }))} placeholder="Enter site or location" />
              </label>
              <label className="field">
                <span>Date</span>
                <input value={draftProject.date} onChange={(e) => setDraftProject((p) => ({ ...p, date: e.target.value }))} placeholder="MM/DD/YYYY" />
              </label>
              <label className="field">
                <span>Notes</span>
                <textarea value={draftProject.notes} onChange={(e) => setDraftProject((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
              </label>
              <button className="btn primary" onClick={saveProject}>SAVE PROJECT</button>
            </div>
          </section>
        )}

        {screen === 'projectHome' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('home')}>← BACK</button>
            <div className="project-head">
              <div>
                <h2 className="section-title">{project.name || 'PROJECT'}</h2>
                <p className="subtitle">{project.site || 'No site set'}{project.date ? ` • ${project.date}` : ''}</p>
              </div>
              <div className="pill">Current Project</div>
            </div>
            <div className="stack">
              <button className="btn big primary" onClick={() => setScreen('chooser')}>TAP TO CAPTURE</button>
              <div className="grid-two">
                <button className="btn small" onClick={() => setStatus('Map comes later')}>MAP</button>
                <button className="btn small" onClick={() => setStatus('Reports comes later')}>REPORTS</button>
              </div>
            </div>
          </section>
        )}

        {screen === 'chooser' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen(hasProject ? 'projectHome' : 'home')}>← BACK</button>
            <h2 className="section-title">TAP TO CAPTURE</h2>
            <div className="form-stack">
              <button className="btn primary" onClick={() => openModule('repairs')}>REPAIR</button>
              <button className="btn" onClick={() => openModule('rolls')}>ROLL</button>
              <button className="btn" onClick={() => openModule('panels')}>PANEL</button>
              <button className="btn" onClick={() => openModule('seams')}>SEAM</button>
            </div>
          </section>
        )}

        {screen === 'module' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('chooser')}>← BACK</button>
            <div className="project-head">
              <div>
                <h2 className="section-title">{cfg.title}</h2>
                <p className="subtitle">{project.name || 'No project open'}</p>
              </div>
              <div className="pill">{activeRows.length} saved</div>
            </div>

            <div className="stack">
              <button className="btn big primary" onClick={startNewRecord}>{cfg.action}</button>

              <div className="form-stack">
                {cfg.fields.map((field) => (
                  <label className="field" key={field}>
                    <span>{field}</span>
                    {field === 'Comments' ? (
                      <textarea value={recordDraft[field] || ''} onChange={(e) => fieldInput(field, e.target.value)} placeholder={field} />
                    ) : field === 'Type' && activeModule === 'repairs' ? (
                      <select value={recordDraft[field] || ''} onChange={(e) => fieldInput(field, e.target.value)}>
                        <option value="Patch">Patch</option>
                        <option value="Bead">Bead</option>
                      </select>
                    ) : field === 'Status' ? (
                      <select value={recordDraft[field] || ''} onChange={(e) => fieldInput(field, e.target.value)}>
                        <option value="Open">Open</option>
                        <option value="Accepted">Accepted</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Available">Available</option>
                      </select>
                    ) : field === 'Weld Type' ? (
                      <select value={recordDraft[field] || ''} onChange={(e) => fieldInput(field, e.target.value)}>
                        <option value="Fusion">Fusion</option>
                        <option value="Extrusion">Extrusion</option>
                      </select>
                    ) : (
                      <input value={recordDraft[field] || ''} onChange={(e) => fieldInput(field, e.target.value)} placeholder={field} />
                    )}
                  </label>
                ))}
                <div className="grid-two">
                  <button className="btn primary" onClick={saveRecord}>{editingId ? 'UPDATE RECORD' : 'SAVE RECORD'}</button>
                  <button className="btn" onClick={() => { setEditingId(null); setRecordDraft({}) }}>CLEAR FORM</button>
                </div>
              </div>

              <div className="list">
                {activeRows.length === 0 && <div className="empty-box">No records yet in this module.</div>}
                {activeRows.map((row) => (
                  <button className="record-card" key={row.id} onClick={() => { setDetailId(row.id || null); setScreen('detail') }}>
                    <strong>{row[cfg.firstField] || cfg.title}</strong>
                    <div className="record-meta">
                      {cfg.visible.slice(1).map((field) => (
                        <span key={field}>{field}: {row[field] || '—'}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {screen === 'detail' && detailRecord && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('module')}>← BACK</button>
            <h2 className="section-title">{cfg.title} DETAIL</h2>
            <div className="form-stack">
              {Object.entries(detailRecord).filter(([key]) => key !== 'id').map(([key, value]) => (
                <div className="detail-box" key={key}>
                  <strong>{key}</strong>
                  <div>{value || '—'}</div>
                </div>
              ))}
            </div>
            <div className="grid-two" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => { openEdit(detailRecord); setScreen('module') }}>EDIT</button>
              <button className="btn danger" onClick={() => deleteRecord(detailRecord.id || '')}>DELETE</button>
            </div>
          </section>
        )}
      </div>

      <button className="help-fab" onClick={() => setHelpOpen(true)}>HELP</button>

      {helpOpen && (
        <div className="modal-wrap" onClick={() => setHelpOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>HELP</h3>
            <div className="detail-box">
              <strong>Chunk 2 scope</strong>
              Repair, Roll, Panel, Seam, local saved lists, record detail, edit, and delete.
            </div>
            <div className="detail-box">
              <strong>Next chunk</strong>
              Smart panel logic with GPS start and stop, orientation, voice keyword fill, and future geometry hooks.
            </div>
            <button className="btn primary" onClick={() => setHelpOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}

      <div className="status-bar">{status}</div>
    </div>
  )
}
