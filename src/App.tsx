import { useEffect, useMemo, useState } from 'react'
import { CloudBackupPanel } from './components/CloudBackupPanel'
import { schedulePush } from './services/syncService'

type Screen = 'home' | 'project' | 'tap' | 'import' | 'review' | 'logs' | 'map' | 'settings' | 'detail'
type ModuleKey = 'repairs' | 'rolls' | 'panels' | 'seams' | 'airTests' | 'dts'
type Project = { name: string; client: string; site: string; area: string; material: string; qcTech: string; notes: string }
type RecordMap = Record<string, string>
type FieldRecord = RecordMap & { id: string; _type: ModuleKey; _status: string; _savedAt: string; _source?: string; _warnings?: string; _gpsLat?: string; _gpsLng?: string; _gpsAccuracy?: string }
type QueueRecord = FieldRecord

type DB = {
  repairs: FieldRecord[]
  rolls: FieldRecord[]
  panels: FieldRecord[]
  seams: FieldRecord[]
  airTests: FieldRecord[]
  dts: FieldRecord[]
}

const PROJECT_KEY = 'linersync_project_v4'
const DB_KEY = 'linersync_db_v4'
const QUEUE_KEY = 'linersync_review_queue_v1'

const emptyProject: Project = {
  name: 'Mesquite WWTP Cell F',
  client: 'WEE',
  site: 'Mesquite WWTP',
  area: 'Cell F',
  material: '60MIL',
  qcTech: 'SL',
  notes: ''
}

const emptyDb: DB = { repairs: [], rolls: [], panels: [], seams: [], airTests: [], dts: [] }

const moduleConfig: Record<ModuleKey, { title: string; action: string; firstField: string; visible: string[]; fields: string[] }> = {
  repairs: {
    title: 'REPAIR', action: 'ADD REPAIR', firstField: 'Repair#',
    visible: ['Repair#', 'Seam', 'Type', 'Location', 'Status'],
    fields: ['Repair#', 'Seam', 'Type', 'Location', 'Leaks', 'Retest', 'Repaired By', 'Tester', 'Status', 'Date', 'Comments']
  },
  rolls: {
    title: 'ROLL', action: 'ADD ROLL', firstField: 'Roll#',
    visible: ['Roll#', 'Lot#', 'Manufacturer', 'Status', 'Date'],
    fields: ['Roll#', 'Lot#', 'Manufacturer', 'Width', 'Length', 'Material', 'Status', 'Date', 'Comments']
  },
  panels: {
    title: 'PANEL', action: 'START / STOP PANEL', firstField: 'Panel#',
    visible: ['Panel#', 'Roll#', 'Width', 'Length', 'Sq Ft'],
    fields: ['Panel#', 'Roll#', 'Width', 'Length', 'Sq Ft', 'Zone', 'Orientation', 'Start GPS', 'End GPS', 'Status', 'Date', 'Notes']
  },
  seams: {
    title: 'SEAM', action: 'ADD SEAM', firstField: 'Seam#',
    visible: ['Seam#', 'Welder', 'Machine', 'Temp', 'Speed'],
    fields: ['Seam#', 'Time', 'Welder', 'Machine', 'Temp', 'Speed', 'Length', 'Status', 'Date', 'Comments']
  },
  airTests: {
    title: 'AIR TEST', action: 'ADD AIR TEST', firstField: 'Seam#',
    visible: ['Seam#', 'Start PSI', 'End PSI', 'Drop', 'Result'],
    fields: ['Seam#', 'Start Time', 'Start PSI', 'End Time', 'End PSI', 'Drop', 'Result', 'Tester', 'Date', 'Comments']
  },
  dts: {
    title: 'DT', action: 'ADD DT', firstField: 'DT#',
    visible: ['DT#', 'Seam#', 'Welder', 'Machine', 'Result'],
    fields: ['DT#', 'Seam#', 'Welder', 'Machine', 'Temp', 'Speed', 'Repair Location', 'Result', 'Date', 'Comments']
  }
}

const moduleOrder: ModuleKey[] = ['repairs', 'panels', 'seams', 'airTests', 'dts', 'rolls']
const repairButtons = [
  { code: 'P', label: 'Patch', value: 'Patch' },
  { code: 'B', label: 'Bead', value: 'Bead' },
  { code: 'DP', label: 'Detail Patch', value: 'Detail Patch' }
]

function safeId(prefix: string) {
  const nativeId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${nativeId}`
}
function today() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
function nowIso() { return new Date().toISOString() }
function toRad(d: number) { return d * Math.PI / 180 }
function haversineFeet(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c * 3.28084
}
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
function orientationFromBearing(b: number) {
  if ((b >= 45 && b < 135) || (b >= 225 && b < 315)) return 'E-W'
  return 'N-S'
}
function moduleFromSheet(text: string): ModuleKey {
  const first = text.toUpperCase()
  if (first.includes('AIR') || first.includes('PRESSURE')) return 'airTests'
  if (first.includes('DT') || first.includes('DESTRUCT')) return 'dts'
  if (first.includes('REP') || first.includes('REPAIR') || first.includes('LEAKS')) return 'repairs'
  if (first.includes('PANEL') && first.includes('ROLL')) return 'panels'
  if (first.includes('ROLL') && first.includes('LOT')) return 'rolls'
  if (first.includes('SEAM') || first.includes('WELDER') || first.includes('MACHINE')) return 'seams'
  return 'panels'
}
function splitRows(text: string) {
  return text.split(/\r?\n/).map(r => r.split('\t').map(c => c.trim())).filter(r => r.some(Boolean))
}
function hasHeader(row: string[]) {
  return row.some(c => /date|panel|roll|seam|rep|pressure|welder|machine|dt/i.test(c))
}
function normalizeRepairType(value: string) {
  const v = (value || '').trim().toUpperCase()
  if (v === 'P' || v.includes('PATCH')) return 'Patch'
  if (v === 'B' || v.includes('BEAD')) return 'Bead'
  if (v === 'DP' || v.includes('DETAIL')) return 'Detail Patch'
  return value || ''
}
function repairMapCode(value: string) {
  const v = normalizeRepairType(value)
  if (v === 'Patch') return 'P'
  if (v === 'Bead') return 'B'
  if (v === 'Detail Patch') return 'DP'
  return 'R'
}
function parseNumber(value: string) {
  const n = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
function csvEscape(value: string) { return `"${String(value ?? '').replaceAll('"', '""')}"` }
function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function readProject(): Project {
  try {
    const saved = localStorage.getItem(PROJECT_KEY)
    return saved ? { ...emptyProject, ...JSON.parse(saved) } : emptyProject
  } catch { return emptyProject }
}
function readDb(): DB {
  try {
    const saved = localStorage.getItem(DB_KEY)
    const parsed = saved ? JSON.parse(saved) : emptyDb
    return {
      repairs: parsed.repairs || [], rolls: parsed.rolls || [], panels: parsed.panels || [],
      seams: parsed.seams || [], airTests: parsed.airTests || [], dts: parsed.dts || []
    }
  } catch { return emptyDb }
}
function readQueue(): QueueRecord[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || [] } catch { return [] }
}
function getAllLogs(db: DB) { return moduleOrder.flatMap(key => db[key].map(row => ({ ...row, _type: key }))) }

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [project, setProject] = useState<Project>(() => readProject())
  const [db, setDb] = useState<DB>(() => readDb())
  const [queue, setQueue] = useState<QueueRecord[]>(() => readQueue())
  const [status, setStatus] = useState('Ready')
  const [activeModule, setActiveModule] = useState<ModuleKey>('repairs')
  const [recordDraft, setRecordDraft] = useState<RecordMap>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FieldRecord | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [sheetMode, setSheetMode] = useState<'AUTO' | ModuleKey>('AUTO')
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
  }, [project])

  useEffect(() => {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
    schedulePush()
  }, [db])

  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  }, [queue])

  const allLogs = useMemo(() => getAllLogs(db), [db])
  const activeRows = db[activeModule]
  const cfg = moduleConfig[activeModule]
  const audit = useMemo(() => runAudit(db, queue), [db, queue])

  function runAudit(nextDb: DB, nextQueue: QueueRecord[]) {
    let critical = 0
    let warnings = nextQueue.length
    nextDb.repairs.forEach(r => { if (!r.Type) critical++ })
    nextDb.panels.forEach(p => { if (!p['Panel#'] || !p['Roll#']) critical++; if (!p.Width || !p.Length) warnings++ })
    nextDb.airTests.forEach(a => {
      const start = parseNumber(a['Start PSI'])
      const end = parseNumber(a['End PSI'])
      if (start && end && start - end > 3) critical++
      if (!a.Result) warnings++
    })
    return { status: critical ? 'CRITICAL' : warnings ? 'WARNING' : 'PASS', critical, warnings }
  }

  function nextId(prefix: string, module: ModuleKey, field: string) {
    let max = 0
    db[module].forEach(row => {
      const match = (row[field] || '').match(/(\d+)/)
      if (match) max = Math.max(max, Number(match[1]))
    })
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  function defaultDraft(module: ModuleKey): RecordMap {
    if (module === 'repairs') return { 'Repair#': nextId('R-', module, 'Repair#'), Type: 'Patch', Status: 'Open', Date: today(), 'Repaired By': project.qcTech, Tester: project.qcTech }
    if (module === 'rolls') return { 'Roll#': nextId('RL-', module, 'Roll#'), Material: project.material, Status: 'Available', Date: today() }
    if (module === 'panels') return { 'Panel#': nextId('P-', module, 'Panel#'), Width: '24', Status: 'Open', Date: today(), Zone: project.area, Orientation: 'N-S' }
    if (module === 'airTests') return { 'Seam#': '', 'Start PSI': '40', Result: '', Tester: project.qcTech, Date: today() }
    if (module === 'dts') return { 'DT#': nextId('DT-', module, 'DT#'), Result: '', Date: today() }
    return { 'Seam#': nextId('S-', module, 'Seam#'), Date: today(), Status: 'Open' }
  }

  function openModule(module: ModuleKey) {
    setActiveModule(module)
    setRecordDraft({})
    setEditingId(null)
    setScreen('tap')
    setStatus(`${moduleConfig[module].title} module open`)
  }

  function updateDraft(field: string, value: string) {
    setRecordDraft(prev => {
      const next = { ...prev, [field]: value }
      if (activeModule === 'panels') {
        const width = parseNumber(next.Width)
        const length = parseNumber(next.Length || next['Auto Length'])
        if (width && length) next['Sq Ft'] = String(Math.round(width * length))
        return recalcPanel(next)
      }
      if (activeModule === 'airTests') {
        const start = parseNumber(next['Start PSI'])
        const end = parseNumber(next['End PSI'])
        if (start && end) next.Drop = String(start - end)
      }
      return next
    })
  }

  function recalcPanel(next: RecordMap) {
    const s = (next['Start GPS'] || '').split(',').map(x => x.trim())
    const e = (next['End GPS'] || '').split(',').map(x => x.trim())
    if (s.length >= 2 && e.length >= 2) {
      const lat1 = Number(s[0]), lon1 = Number(s[1]), lat2 = Number(e[0]), lon2 = Number(e[1])
      if ([lat1, lon1, lat2, lon2].every(Number.isFinite)) {
        next['Auto Length'] = haversineFeet(lat1, lon1, lat2, lon2).toFixed(1)
        next.Orientation = orientationFromBearing(bearingDeg(lat1, lon1, lat2, lon2))
      }
    }
    return next
  }

  async function getLiveGps() {
    return new Promise<RecordMap>((resolve) => {
      if (!navigator.geolocation) { resolve({ error: 'GPS unavailable' }); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), accuracy: String(Math.round(pos.coords.accuracy)), time: nowIso() }),
        err => resolve({ error: err.message || 'GPS denied', time: nowIso() }),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
      )
    })
  }

  async function quickRepair(type: string) {
    setStatus(`Capturing GPS for ${type}...`)
    const gps = await getLiveGps()
    setActiveModule('repairs')
    setEditingId(null)
    setRecordDraft({
      ...defaultDraft('repairs'),
      Type: type,
      Status: 'Open',
      Date: today(),
      'GPS Lat': gps.lat || '',
      'GPS Lng': gps.lng || '',
      'GPS Accuracy': gps.accuracy || '',
      'GPS Status': gps.error || 'Captured'
    })
    setStatus(gps.error ? `GPS warning: ${gps.error}` : `${type} GPS captured`)
    setScreen('tap')
  }

  async function capturePanelGps(field: 'Start GPS' | 'End GPS') {
    const gps = await getLiveGps()
    if (gps.lat && gps.lng) updateDraft(field, `${gps.lat}, ${gps.lng}`)
    setStatus(gps.error ? `GPS warning: ${gps.error}` : `${field} captured`)
  }

  function saveRecord() {
    if (!(recordDraft[cfg.firstField] || '').trim()) { setStatus(`${cfg.firstField} is required`); return }
    const finalRecord: FieldRecord = {
      ...recordDraft,
      id: editingId || safeId(activeModule.toUpperCase()),
      _type: activeModule,
      _status: 'LOCKED',
      _savedAt: nowIso(),
      _source: editingId ? 'edited' : 'tap-capture'
    }
    setDb(prev => {
      const rows = [...prev[activeModule]]
      const index = rows.findIndex(row => row.id === finalRecord.id)
      if (index >= 0) rows[index] = finalRecord
      else rows.unshift(finalRecord)
      return { ...prev, [activeModule]: rows }
    })
    setRecordDraft({})
    setEditingId(null)
    setStatus(`${cfg.title} saved and queued for cloud backup`)
  }

  function editRecord(row: FieldRecord) {
    setActiveModule(row._type)
    setEditingId(row.id)
    setRecordDraft({ ...row })
    setScreen('tap')
    setStatus(`Editing ${moduleConfig[row._type].title}`)
  }

  function deleteRecord(row: FieldRecord) {
    setDb(prev => ({ ...prev, [row._type]: prev[row._type].filter(item => item.id !== row.id) }))
    setDetail(null)
    setStatus('Deleted record')
    setScreen('logs')
  }

  function parseExcelPaste() {
    const rows = splitRows(pasteText)
    if (!rows.length) { setStatus('Paste Excel rows first'); return }
    const module = sheetMode === 'AUTO' ? moduleFromSheet(rows[0].join(' ')) : sheetMode
    const start = hasHeader(rows[0]) ? 1 : 0
    const parsed: QueueRecord[] = []
    for (let i = start; i < rows.length; i++) {
      const r = rows[i]
      if (!r.some(Boolean)) continue
      const warnings: string[] = []
      let rec: QueueRecord
      if (module === 'panels') {
        const width = r[3] || ''
        const length = r[4] || ''
        rec = makeQueue(module, r[1] || `Panel row ${i + 1}`, { Date: r[0] || '', 'Panel#': r[1] || '', 'Roll#': r[2] || '', Width: width, Length: length, Comments: r[5] || '', 'Sq Ft': r[6] || (parseNumber(width) && parseNumber(length) ? String(parseNumber(width) * parseNumber(length)) : '') })
        if (!rec['Panel#'] || !rec['Roll#']) warnings.push('Missing panel or roll')
      } else if (module === 'repairs') {
        rec = makeQueue(module, r[0] || r[1] || `Repair row ${i + 1}`, { 'Repair#': r[0] || '', Seam: r[1] || '', Date: r[2] || '', 'Repaired By': r[3] || '', Type: normalizeRepairType(r[4] || ''), Leaks: r[5] || '', Retest: r[6] || '', 'Date Accepted': r[7] || '', Tester: r[8] || '', Comments: r.slice(9).join(' ') })
        if (!rec.Type) warnings.push('Missing repair type')
      } else if (module === 'airTests') {
        const startPsi = r[3] || ''
        const endPsi = r[5] || ''
        rec = makeQueue(module, r[1] || `Air test row ${i + 1}`, { Date: r[0] || '', 'Seam#': r[1] || '', 'Start Time': r[2] || '', 'Start PSI': startPsi, 'End Time': r[4] || '', 'End PSI': endPsi, Drop: parseNumber(startPsi) && parseNumber(endPsi) ? String(parseNumber(startPsi) - parseNumber(endPsi)) : '', Result: r[6] || '', Tester: r[7] || '', Comments: r.slice(8).join(' ') })
        if (!rec.Result) warnings.push('Result blank')
      } else if (module === 'dts') {
        rec = makeQueue(module, r[1] || `DT row ${i + 1}`, { Date: r[0] || '', 'DT#': r[1] || '', Welder: r[2] || '', Machine: r[3] || '', Temp: r[4] || '', Speed: r[5] || '', 'Seam#': r[6] || '', 'Repair Location': r[7] || '', Result: r[8] || '', Comments: r.slice(9).join(' ') })
      } else if (module === 'rolls') {
        rec = makeQueue(module, r[0] || `Roll row ${i + 1}`, { 'Roll#': r[0] || '', 'Lot#': r[1] || '', Manufacturer: r[2] || '', Width: r[3] || '', Length: r[4] || '', Material: r[5] || project.material, Status: r[6] || 'Available', Date: r[7] || today(), Comments: r.slice(8).join(' ') })
      } else {
        rec = makeQueue(module, r[2] || r[0] || `Seam row ${i + 1}`, { Date: r[0] || '', Time: r[1] || '', 'Seam#': r[2] || '', Welder: r[3] || '', Machine: r[4] || '', Temp: r[5] || '', Speed: r[6] || '', Comments: r.slice(7).join(' ') })
      }
      rec._warnings = warnings.join('; ')
      parsed.push(rec)
    }
    setQueue(prev => [...parsed, ...prev])
    setPasteText('')
    setStatus(`Parsed ${parsed.length} ${moduleConfig[module].title} rows to review queue`)
    setScreen('review')
  }

  function makeQueue(module: ModuleKey, title: string, fields: RecordMap): QueueRecord {
    return { ...fields, id: safeId('QUEUE'), _type: module, _status: 'REVIEW', _savedAt: nowIso(), _source: 'excel-paste', Title: title }
  }

  function acceptQueue(record: QueueRecord) {
    const finalRecord: FieldRecord = { ...record, id: safeId(record._type.toUpperCase()), _status: 'LOCKED', _savedAt: nowIso() }
    setDb(prev => ({ ...prev, [record._type]: [finalRecord, ...prev[record._type]] }))
    setQueue(prev => prev.filter(item => item.id !== record.id))
    setStatus(`Accepted ${moduleConfig[record._type].title}`)
  }

  function acceptAllQueue(cleanOnly = false) {
    const selected = cleanOnly ? queue.filter(item => !item._warnings) : [...queue]
    if (!selected.length) { setStatus('No review rows matched'); return }
    setDb(prev => {
      const next = { ...prev }
      selected.forEach(item => { next[item._type] = [{ ...item, id: safeId(item._type.toUpperCase()), _status: 'LOCKED', _savedAt: nowIso() }, ...next[item._type]] })
      return next
    })
    setQueue(prev => prev.filter(item => !selected.some(sel => sel.id === item.id)))
    setStatus(`Accepted ${selected.length} rows`)
  }

  function rejectQueue(record: QueueRecord) {
    setQueue(prev => prev.filter(item => item.id !== record.id))
    setStatus('Rejected review row')
  }

  function exportJson() {
    download(`${project.name || 'linersync'}-cloud-lane-backup.json`, JSON.stringify({ project, db, queue, exportedAt: nowIso() }, null, 2), 'application/json')
  }
  function importJson(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'))
        setProject({ ...emptyProject, ...(data.project || {}) })
        const importedDb = data.db || data.logs || emptyDb
        setDb({ ...emptyDb, ...importedDb })
        setQueue(data.queue || [])
        setStatus('Imported JSON backup')
      } catch (err: any) { setStatus(`Import failed: ${err?.message || 'bad JSON'}`) }
    }
    reader.readAsText(file)
  }
  function exportCsv() {
    const headers = ['module', 'status', 'savedAt', 'fields']
    const rows = allLogs.map(row => [moduleConfig[row._type].title, row._status, row._savedAt, JSON.stringify(row)].map(csvEscape).join(','))
    download(`${project.name || 'linersync'}-logs.csv`, [headers.join(','), ...rows].join('\n'), 'text/csv')
  }
  function exportKml() {
    const repairs = db.repairs.filter(r => r['GPS Lat'] && r['GPS Lng'])
    const body = repairs.map(r => `<Placemark><name>${repairMapCode(r.Type)} ${r['Repair#'] || ''}</name><description>${r.Seam || ''} ${r.Location || ''}</description><Point><coordinates>${r['GPS Lng']},${r['GPS Lat']},0</coordinates></Point></Placemark>`).join('')
    download(`${project.name || 'linersync'}-repairs.kml`, `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`, 'application/vnd.google-earth.kml+xml')
  }
  function exportWorkbookHtml() {
    const sheet = moduleOrder.map(key => `<h2>${moduleConfig[key].title}</h2><table border="1"><tr><th>Saved</th><th>Data</th></tr>${db[key].map(row => `<tr><td>${row._savedAt || ''}</td><td><pre>${JSON.stringify(row, null, 2)}</pre></td></tr>`).join('')}</table>`).join('<hr/>')
    download(`${project.name || 'linersync'}-workbook.html`, `<html><body><h1>Southwest Liner Systems Inc.</h1><h2>${project.name}</h2>${sheet}</body></html>`, 'text/html')
  }

  const nav = (
    <div className="grid-two" style={{ marginTop: 12 }}>
      <button className="btn" onClick={() => setScreen('import')}>EXCEL IMPORT</button>
      <button className="btn" onClick={() => setScreen('logs')}>LOGS</button>
      <button className="btn" onClick={() => setScreen('map')}>MAP</button>
      <button className="btn" onClick={() => setScreen('settings')}>SETTINGS</button>
    </div>
  )

  return (
    <div className="app-shell">
      <div className="app-frame">
        {screen === 'home' && (
          <section className="panel hero">
            <div className="brand-row"><div className="logo"><span>LS</span></div><div><h1 className="title">LinerSync</h1><p className="subtitle">AI Excel Tap Lab + Cloud Backup Base</p></div></div>
            <div className="accent-line" />
            <div className="stats">
              <div className="stat-card"><strong>Project</strong><span>{project.name || 'None'}</span></div>
              <div className="stat-card"><strong>Total Logs</strong><span>{allLogs.length}</span></div>
              <div className="stat-card"><strong>Review Queue</strong><span>{queue.length}</span></div>
              <div className="stat-card"><strong>Audit</strong><span>{audit.status}</span></div>
            </div>
            <div className="stack" style={{ marginTop: 14 }}>
              <button className="btn big primary" onClick={() => setScreen('project')}>OPEN FIELD APP</button>
              <CloudBackupPanel />
            </div>
          </section>
        )}

        {screen === 'project' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('home')}>← BACK</button>
            <h2 className="section-title">{project.name}</h2>
            <p className="subtitle">{project.client} · {project.site} · {project.area} · {project.material}</p>
            <div className="stack" style={{ marginTop: 14 }}>
              <div className="grid-two">
                {repairButtons.map(btn => <button key={btn.code} className="btn big primary" onClick={() => quickRepair(btn.value)}>{btn.label}<br />{btn.code}</button>)}
              </div>
              <button className="btn big" onClick={() => openModule('panels')}>PANEL CAPTURE</button>
              <button className="btn big" onClick={() => openModule('seams')}>SEAM / WELD</button>
              <button className="btn big" onClick={() => openModule('airTests')}>AIR TEST</button>
              <button className="btn big" onClick={() => openModule('dts')}>DT</button>
              {nav}
              <CloudBackupPanel />
            </div>
          </section>
        )}

        {screen === 'tap' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('project')}>← BACK</button>
            <h2 className="section-title">{cfg.title}</h2>
            <button className="btn primary" onClick={() => { setEditingId(null); setRecordDraft(defaultDraft(activeModule)); setStatus(`${cfg.title} form ready`) }}>{cfg.action}</button>
            {activeModule === 'panels' && <div className="grid-two" style={{ marginTop: 12 }}><button className="btn" onClick={() => capturePanelGps('Start GPS')}>START GPS</button><button className="btn" onClick={() => capturePanelGps('End GPS')}>END GPS</button></div>}
            <div className="form-stack" style={{ marginTop: 14 }}>
              {cfg.fields.map(field => (
                <label className="field" key={field}><span>{field}</span>
                  {field === 'Comments' || field === 'Notes' ? <textarea value={recordDraft[field] || ''} onChange={e => updateDraft(field, e.target.value)} /> :
                    field === 'Type' ? <select value={recordDraft[field] || ''} onChange={e => updateDraft(field, e.target.value)}><option>Patch</option><option>Bead</option><option>Detail Patch</option></select> :
                    field === 'Result' || field === 'Status' ? <select value={recordDraft[field] || ''} onChange={e => updateDraft(field, e.target.value)}><option value="">Blank</option><option>PASS</option><option>FAIL</option><option>Open</option><option>Accepted</option><option>Rejected</option></select> :
                    <input value={recordDraft[field] || ''} onChange={e => updateDraft(field, e.target.value)} />}
                </label>
              ))}
              {recordDraft['GPS Status'] && <div className="detail-box"><strong>GPS</strong><div>{recordDraft['GPS Status']} {recordDraft['GPS Lat']} {recordDraft['GPS Lng']}</div></div>}
              <div className="grid-two"><button className="btn primary" onClick={saveRecord}>SAVE / LOCK</button><button className="btn" onClick={() => setRecordDraft({})}>CLEAR</button></div>
            </div>
          </section>
        )}

        {screen === 'import' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('project')}>← BACK</button>
            <h2 className="section-title">EXCEL IMPORT</h2>
            <label className="field"><span>Sheet Type</span><select value={sheetMode} onChange={e => setSheetMode(e.target.value as 'AUTO' | ModuleKey)}><option value="AUTO">AUTO DETECT</option>{moduleOrder.map(key => <option value={key} key={key}>{moduleConfig[key].title}</option>)}</select></label>
            <label className="field"><span>Paste copied Excel rows here</span><textarea style={{ minHeight: 190 }} value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste one sheet at a time" /></label>
            <button className="btn primary" onClick={parseExcelPaste}>PARSE TO REVIEW QUEUE</button>
            {nav}
          </section>
        )}

        {screen === 'review' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('project')}>← BACK</button>
            <h2 className="section-title">REVIEW QUEUE</h2>
            <div className="grid-two"><button className="btn primary" onClick={() => acceptAllQueue(false)}>ACCEPT ALL</button><button className="btn" onClick={() => acceptAllQueue(true)}>ACCEPT CLEAN ONLY</button></div>
            <div className="list" style={{ marginTop: 12 }}>{queue.length === 0 && <div className="empty-box">Review queue empty.</div>}{queue.map(item => <div className="record-card" key={item.id}><strong>{moduleConfig[item._type].title}: {item.Title || item[moduleConfig[item._type].firstField]}</strong><div className="record-meta">{item._warnings ? <span style={{ color: '#ffb25a' }}>{item._warnings}</span> : <span>Clean</span>}</div><pre style={{ whiteSpace: 'pre-wrap', color: '#a8b8cf' }}>{JSON.stringify(item, null, 2)}</pre><div className="grid-two"><button className="btn primary" onClick={() => acceptQueue(item)}>ACCEPT</button><button className="btn danger" onClick={() => rejectQueue(item)}>REJECT</button></div></div>)}</div>
          </section>
        )}

        {screen === 'logs' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('project')}>← BACK</button>
            <h2 className="section-title">LOGS</h2>
            <div className="list">{allLogs.length === 0 && <div className="empty-box">No records saved.</div>}{allLogs.map(row => <button className="record-card" key={row.id} onClick={() => { setDetail(row as FieldRecord); setScreen('detail') }}><strong>{moduleConfig[row._type].title}: {row[moduleConfig[row._type].firstField] || row.Title || row.id}</strong><div className="record-meta">{moduleConfig[row._type].visible.map(field => <span key={field}>{field}: {row[field] || '—'}</span>)}</div></button>)}</div>
          </section>
        )}

        {screen === 'detail' && detail && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('logs')}>← BACK</button>
            <h2 className="section-title">DETAIL</h2>
            <div className="form-stack">{Object.entries(detail).map(([k, v]) => <div className="detail-box" key={k}><strong>{k}</strong><div>{String(v || '—')}</div></div>)}</div>
            <div className="grid-two" style={{ marginTop: 12 }}><button className="btn" onClick={() => editRecord(detail)}>EDIT</button><button className="btn danger" onClick={() => deleteRecord(detail)}>DELETE</button></div>
          </section>
        )}

        {screen === 'map' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('project')}>← BACK</button>
            <h2 className="section-title">AS-BUILT MAP</h2>
            <div className="stats"><div className="stat-card"><strong>Patch</strong><span>{db.repairs.filter(r => repairMapCode(r.Type) === 'P').length}</span></div><div className="stat-card"><strong>Bead</strong><span>{db.repairs.filter(r => repairMapCode(r.Type) === 'B').length}</span></div><div className="stat-card"><strong>DP</strong><span>{db.repairs.filter(r => repairMapCode(r.Type) === 'DP').length}</span></div><div className="stat-card"><strong>GPS Repairs</strong><span>{db.repairs.filter(r => r['GPS Lat'] && r['GPS Lng']).length}</span></div></div>
            <div style={{ height: 380, marginTop: 14, position: 'relative', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, background: 'linear-gradient(135deg,#102645,#07111e)', overflow: 'hidden' }}>
              {db.repairs.filter(r => r['GPS Lat'] && r['GPS Lng']).map((r, i) => <div key={r.id} style={{ position: 'absolute', left: `${45 + (i % 5) * 8}%`, top: `${28 + Math.floor(i / 5) * 11}%`, width: 42, height: 42, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#ff8e18', color: '#111', fontWeight: 900, border: '2px solid white' }}>{repairMapCode(r.Type)}</div>)}
            </div>
          </section>
        )}

        {screen === 'settings' && (
          <section className="panel">
            <button className="back" onClick={() => setScreen('project')}>← BACK</button>
            <h2 className="section-title">SETTINGS / EXPORT</h2>
            <div className="form-stack">{(['name', 'client', 'site', 'area', 'material', 'qcTech', 'notes'] as Array<keyof Project>).map(key => <label className="field" key={key}><span>{key}</span>{key === 'notes' ? <textarea value={project[key] || ''} onChange={e => setProject(p => ({ ...p, [key]: e.target.value }))} /> : <input value={project[key] || ''} onChange={e => setProject(p => ({ ...p, [key]: e.target.value }))} />}</label>)}<div className="grid-two"><button className="btn" onClick={exportJson}>JSON BACKUP</button><button className="btn" onClick={exportCsv}>CSV</button><button className="btn" onClick={exportKml}>KML</button><button className="btn" onClick={exportWorkbookHtml}>WORKBOOK HTML</button></div><label className="field"><span>Import JSON Backup</span><input type="file" accept=".json" onChange={e => importJson(e.target.files?.[0])} /></label><CloudBackupPanel /></div>
          </section>
        )}
      </div>

      <button className="help-fab" onClick={() => setHelpOpen(true)}>HELP</button>
      {helpOpen && <div className="modal-wrap" onClick={() => setHelpOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><h3>HELP</h3><div className="detail-box"><strong>What this is</strong><div>Standalone LinerSync cloud lane with Excel paste import, quick repair tap capture, review queue, logs, map, exports, and Supabase backup panel.</div></div><div className="detail-box"><strong>Production safety</strong><div>This app uses the separate linersync-react-base repo and does not modify the original production LinerSync repo.</div></div><button className="btn primary" onClick={() => setHelpOpen(false)}>CLOSE</button></div></div>}
      <div className="status-bar">{status}</div>
    </div>
  )
}
