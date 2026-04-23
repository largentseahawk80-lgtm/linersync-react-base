import { useEffect, useState } from 'react'
import { isCloudConfigured } from '../services/supabaseClient'
import { onAuthChange, signIn, signOut, signUp, getCurrentUser } from '../services/authService'
import { onSyncStatus, pushAll, pullAllAndReplaceLocal, type SyncStatus } from '../services/syncService'

export function CloudBackupPanel() {
  const configured = isCloudConfigured()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getCurrentUser().then(u => setUser(u ? { email: u.email } : null))
    const offA = onAuthChange(u => setUser(u ? { email: u.email } : null))
    const offS = onSyncStatus(setStatus)
    return () => { offA(); offS() }
  }, [])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signup') await signUp(email, password)
      else await signIn(email, password)
      setMsg('Signed in.')
    } catch (err: any) {
      setMsg(err?.message || 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleBackup() {
    setBusy(true); setMsg(null)
    const res = await pushAll()
    setMsg(res.ok ? 'Backed up.' : `Backup failed: ${res.error}`)
    setBusy(false)
  }

  async function handleRestore() {
    if (!window.confirm('Replace this phone data with the cloud copy?')) return
    setBusy(true); setMsg(null)
    const res = await pullAllAndReplaceLocal()
    setMsg(res.ok ? 'Restored. Reloading...' : `Restore failed: ${res.error}`)
    if (res.ok) window.setTimeout(() => window.location.reload(), 600)
    setBusy(false)
  }

  const statusText =
    status.kind === 'idle' ? (status.lastOk ? `Backed up ${Math.round((Date.now() - status.lastOk) / 1000)}s ago` : 'Idle') :
    status.kind === 'syncing' ? 'Syncing...' :
    status.kind === 'offline' ? 'Offline' :
    status.kind === 'not-configured' ? 'Not configured' :
    status.kind === 'not-signed-in' ? 'Not signed in' :
    `Error: ${status.message}`

  if (!configured) {
    return (
      <div className="backup-panel error-box">
        <strong>CLOUD BACKUP NOT CONFIGURED</strong>
        <div>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.</div>
      </div>
    )
  }

  return (
    <div className="backup-panel">
      <div className="backup-head">
        <strong>CLOUD BACKUP</strong>
        <span className="backup-status">{statusText}</span>
      </div>

      {!user ? (
        <form onSubmit={handleSignIn} className="backup-form">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="grid-two">
            <button type="submit" className="btn primary" disabled={busy}>{mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>
            <button type="button" className="btn" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'USE SIGN IN' : 'USE SIGN UP'}
            </button>
          </div>
        </form>
      ) : (
        <div className="backup-actions">
          <div className="detail-box"><strong>Signed in</strong><div>{user.email || 'Unknown user'}</div></div>
          <div className="grid-two">
            <button type="button" className="btn primary" onClick={handleBackup} disabled={busy}>BACKUP NOW</button>
            <button type="button" className="btn" onClick={handleRestore} disabled={busy}>RESTORE</button>
          </div>
          <button type="button" className="btn" onClick={() => signOut()}>SIGN OUT</button>
        </div>
      )}

      {msg && <div className="backup-note">{msg}</div>}
    </div>
  )
}
