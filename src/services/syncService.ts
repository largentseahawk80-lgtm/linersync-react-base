import { supabase, isCloudConfigured } from './supabaseClient'
import { getCurrentUser } from './authService'

const LS_KEYS = {
  project: 'linersync_project_v4',
  db: 'linersync_db_v4',
} as const

export type SyncStatus =
  | { kind: 'idle'; lastOk?: number }
  | { kind: 'syncing' }
  | { kind: 'error'; message: string; at: number }
  | { kind: 'offline' }
  | { kind: 'not-configured' }
  | { kind: 'not-signed-in' }

let listeners: Array<(s: SyncStatus) => void> = []
let current: SyncStatus = { kind: 'idle' }
let timer: number | null = null

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.push(cb)
  cb(current)
  return () => { listeners = listeners.filter(l => l !== cb) }
}
function setStatus(s: SyncStatus) {
  current = s
  for (const l of listeners) l(s)
}

async function getUserId() {
  const user = await getCurrentUser()
  return user?.id ?? null
}

function payloadFromLocal() {
  return {
    project: JSON.parse(localStorage.getItem(LS_KEYS.project) || '{}'),
    db: JSON.parse(localStorage.getItem(LS_KEYS.db) || '{"repairs":[],"rolls":[],"panels":[],"seams":[]}'),
    savedAt: new Date().toISOString(),
  }
}

export async function pushAll(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!isCloudConfigured()) {
      setStatus({ kind: 'not-configured' })
      return { ok: false, error: 'Cloud backup not configured.' }
    }
    if (!navigator.onLine) {
      setStatus({ kind: 'offline' })
      return { ok: false, error: 'Offline.' }
    }
    const userId = await getUserId()
    if (!userId) {
      setStatus({ kind: 'not-signed-in' })
      return { ok: false, error: 'Not signed in.' }
    }
    setStatus({ kind: 'syncing' })
    const payload = payloadFromLocal()
    const { error } = await supabase!
      .from('app_snapshots')
      .upsert({ user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw error
    setStatus({ kind: 'idle', lastOk: Date.now() })
    return { ok: true }
  } catch (err: any) {
    setStatus({ kind: 'error', message: err?.message || 'Sync failed.', at: Date.now() })
    return { ok: false, error: err?.message || 'Sync failed.' }
  }
}

export async function pullAllAndReplaceLocal(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!isCloudConfigured()) return { ok: false, error: 'Cloud backup not configured.' }
    const userId = await getUserId()
    if (!userId) return { ok: false, error: 'Not signed in.' }

    setStatus({ kind: 'syncing' })
    const { data, error } = await supabase!
      .from('app_snapshots')
      .select('payload')
      .eq('user_id', userId)
      .single()
    if (error) throw error

    const payload = data?.payload || {}
    localStorage.setItem(LS_KEYS.project, JSON.stringify(payload.project || {}))
    localStorage.setItem(LS_KEYS.db, JSON.stringify(payload.db || { repairs: [], rolls: [], panels: [], seams: [] }))
    setStatus({ kind: 'idle', lastOk: Date.now() })
    return { ok: true }
  } catch (err: any) {
    setStatus({ kind: 'error', message: err?.message || 'Restore failed.', at: Date.now() })
    return { ok: false, error: err?.message || 'Restore failed.' }
  }
}

export function schedulePush() {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    pushAll()
  }, 2500)
}
