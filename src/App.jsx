import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, signInWithGoogle, signOut, submitAccessRequest, checkAccessStatus,
         getAccessRequests, approveRequest, denyRequest, upsertProfile, getApprovedProfiles,
         getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
         getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace,
         getTasks, createTask, updateTask, deleteTask, addComment, logTime, logActivity } from './lib/supabase.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES   = ['Todo','In Progress','Review','Done']
const PRIORITIES = ['Low','Medium','High','Critical']
const SC = {'Todo':'#6b7280','In Progress':'#6366f1','Review':'#f59e0b','Done':'#10b981'}
const PC = {'Low':'#6b7280','Medium':'#3b82f6','High':'#f59e0b','Critical':'#ef4444'}
const PI = {'Low':'↓','Medium':'→','High':'↑','Critical':'⚡'}
const WS_COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#06b6d4','#8b5cf6','#ef4444','#3b82f6']
const WS_ICONS  = ['⬡','◈','◉','⊛','◆','▲','●','■']

const mkColor = email => {
  const p = WS_COLORS; let n = 0
  for (let c of email) n += c.charCodeAt(0)
  return p[n % p.length]
}
const mkInitials = name => name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
const isOverdue  = d => d && new Date(d) < new Date()
const fmtDate    = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const sumTime    = (log = []) => log.reduce((s, e) => s + (e.time_logged || 0), 0)
const enrichUser = u => u ? { ...u, initials: mkInitials(u.name || u.email || '?'), color: mkColor(u.email || '') } : null
const getUser    = (id, list = []) => enrichUser(list.find(u => u.id === id)) || null

// ─── Styles ───────────────────────────────────────────────────────────────────
const INP = { display: 'block', width: '100%', boxSizing: 'border-box', background: '#131f35', border: '1px solid #1e2d42', borderRadius: 9, padding: '10px 13px', color: '#f1f5f9', fontSize: 14, outline: 'none', fontFamily: 'system-ui,sans-serif', lineHeight: 1.5 }
const LBL = { display: 'block', fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ user, size = 32 }) {
  if (!user) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#1e2d42', flexShrink: 0 }} />
  if (user.avatar_url) return <img src={user.avatar_url} alt={user.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  const initials = user.initials || mkInitials(user.name || user.email || '?')
  const color    = user.color || mkColor(user.email || '')
  return (
    <div title={user.name} style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, userSelect: 'none', border: '2px solid rgba(255,255,255,0.1)' }}>
      {initials}
    </div>
  )
}

function Pill({ label, color, sm }) {
  return <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 6, padding: sm ? '1px 6px' : '3px 10px', fontSize: sm ? 10 : 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, width = 600, children }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0b1220', border: '1px solid #1e2d42', borderRadius: 20, width: '100%', maxWidth: width, maxHeight: '93vh', overflow: 'auto', boxShadow: '0 40px 120px rgba(0,0,0,0.9)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #1e2d42' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function Confirm({ open, icon, title, body, confirmLabel, confirmColor = '#ef4444', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0b1220', border: `1px solid ${confirmColor}44`, borderRadius: 18, width: '100%', maxWidth: 400, padding: 30 }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>{icon}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', textAlign: 'center', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>{body}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: '#1a2640', border: '1px solid #2a3a54', borderRadius: 10, padding: '10px', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: confirmColor, border: 'none', borderRadius: 10, padding: '10px', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [loading, setLoading] = useState(false)
  const handleGoogle = async () => { setLoading(true); await signInWithGoogle() }
  return (
    <div style={{ minHeight: '100vh', background: '#06090f', display: 'flex', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(ellipse at 30% 40%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(16,185,129,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 400, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✦</div>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>TaskFlow</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.15, marginBottom: 12, letterSpacing: '-0.02em' }}>Private workspace<br /><span style={{ background: 'linear-gradient(90deg,#6366f1,#10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>for your team</span></div>
          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 32 }}>Sign in with Google to request access. Your request will be reviewed by the admin before you can enter.</div>
          <button onClick={handleGoogle} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', background: '#fff', borderRadius: 14, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 15, fontWeight: 600, color: '#1a1a1a', boxShadow: '0 2px 12px rgba(0,0,0,0.4)', opacity: loading ? 0.7 : 1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            {loading ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 16 }}>🔒 Access is invite-only. Sign in to request membership.</div>
        </div>
      </div>
      <div style={{ width: 320, background: '#0a1220', borderLeft: '1px solid #1e2d42', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 40 }}>
        {[{ icon: '🔒', title: 'Private & Invite-Only', desc: 'Only approved members can access this workspace' }, { icon: '⬡', title: 'Multiple Workspaces', desc: 'Separate spaces per project, team or department' }, { icon: '⊞', title: 'Kanban Boards', desc: 'Drag & drop tasks across status columns' }, { icon: '👥', title: 'Team Members', desc: 'Share or separate members per workspace' }, { icon: '✏️', title: 'Full Task CRUD', desc: 'Create, edit, delete with confirmations' }].map(f => (
          <div key={f.title} style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#6366f122', border: '1px solid #6366f144', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{f.icon}</div>
            <div><div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 3 }}>{f.title}</div><div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{f.desc}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pending Screen ───────────────────────────────────────────────────────────
function PendingScreen({ user, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', background: '#06090f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>⏳</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 12 }}>Access Requested</div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>You're signed in as</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#818cf8', marginBottom: 24 }}>{user.email}</div>
        <div style={{ background: '#131f35', border: '1px solid #1e2d42', borderRadius: 14, padding: 20, marginBottom: 24, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          Your access request has been submitted. The admin will review and approve your request. Come back after you've been notified.
        </div>
        <button onClick={onSignOut} style={{ background: '#1a2640', border: '1px solid #2a3a54', borderRadius: 10, padding: '10px 24px', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>Sign Out</button>
      </div>
    </div>
  )
}

// ─── Denied Screen ────────────────────────────────────────────────────────────
function DeniedScreen({ onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', background: '#06090f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 380, padding: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🚫</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 12 }}>Access Denied</div>
        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 24 }}>Your access request was not approved. Contact the workspace admin if you think this is a mistake.</div>
        <button onClick={onSignOut} style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 10, padding: '10px 24px', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Sign Out</button>
      </div>
    </div>
  )
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ open, onClose }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]  = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await getAccessRequests()
    setRequests(data)
    setLoading(false)
  }

  useEffect(() => { if (open) load() }, [open])

  const handle = async (userId, action) => {
    if (action === 'approve') await approveRequest(userId)
    else await denyRequest(userId)
    load()
  }

  const statusColor = { pending: '#f59e0b', approved: '#10b981', denied: '#ef4444' }

  return (
    <Modal open={open} onClose={onClose} title="🛡️ Access Requests — Admin Panel" width={560}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 14 }}>No access requests yet.</div>
      ) : requests.map(r => (
        <div key={r.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#131f35', border: '1px solid #1e2d42', borderRadius: 12, padding: '12px 16px', marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: mkColor(r.email), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{mkInitials(r.name)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{r.name}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{r.email}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{new Date(r.created_at).toLocaleString()}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[r.status], background: statusColor[r.status] + '22', border: `1px solid ${statusColor[r.status]}44`, borderRadius: 6, padding: '2px 8px', marginRight: 4 }}>{r.status.toUpperCase()}</span>
          {r.status === 'pending' && <>
            <button onClick={() => handle(r.user_id, 'approve')} style={{ background: '#10b98122', border: '1px solid #10b98144', borderRadius: 8, padding: '5px 12px', color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓ Approve</button>
            <button onClick={() => handle(r.user_id, 'deny')} style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 8, padding: '5px 12px', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✗ Deny</button>
          </>}
        </div>
      ))}
    </Modal>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, wsColor, wsMembers, cu, onOpen, onEdit, onDelete, onDragStart, isDragging }) {
  const assignee = getUser(task.assigned_to, wsMembers)
  const overdue  = isOverdue(task.due_date) && task.status !== 'Done'
  const isMine   = task.created_by === cu?.id
  const [hov, setHov]   = useState(false)
  const [cdel, setCdel] = useState(false)

  return (
    <>
      <div draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(task.id) }}
        style={{ background: isDragging ? '#1a2a40' : '#0d1627', border: `1px solid ${isDragging ? wsColor : hov ? '#2a3a54' : '#1e2d42'}`, borderRadius: 12, padding: 14, cursor: 'grab', transition: 'all 0.15s', borderLeft: `3px solid ${PC[task.priority]}`, opacity: isDragging ? 0.4 : 1, boxShadow: hov && !isDragging ? '0 8px 24px rgba(0,0,0,0.5)' : 'none', userSelect: 'none' }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {(task.tags || []).slice(0, 2).map(t => <span key={t} style={{ fontSize: 10, color: '#94a3b8', background: '#131f35', borderRadius: 4, padding: '2px 5px', fontWeight: 600 }}>{t}</span>)}
          </div>
          {isMine && <span style={{ fontSize: 9, background: wsColor + '22', color: wsColor, borderRadius: 4, padding: '2px 5px', fontWeight: 700, border: `1px solid ${wsColor}44`, flexShrink: 0, marginLeft: 4 }}>YOU</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 5, lineHeight: 1.4 }}>{task.title}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{task.description}</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <Pill label={`${PI[task.priority]} ${task.priority}`} color={PC[task.priority]} sm />
          {overdue && <Pill label="⚠ Overdue" color="#ef4444" sm />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Avatar user={assignee} size={20} /><span style={{ fontSize: 11, color: '#64748b' }}>{assignee?.name?.split(' ')[0] || '—'}</span></div>
          {task.due_date && <span style={{ fontSize: 10, color: overdue ? '#ef4444' : '#64748b' }}>{fmtDate(task.due_date)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e2d42', opacity: hov ? 1 : 0, transition: 'opacity 0.15s' }}>
          <button onClick={e => { e.stopPropagation(); onOpen(task) }} style={{ flex: 1, background: '#131f35', border: '1px solid #1e2d42', borderRadius: 7, padding: '5px 0', color: '#94a3b8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>👁 View</button>
          <button onClick={e => { e.stopPropagation(); onEdit(task) }} style={{ flex: 1, background: wsColor + '22', border: `1px solid ${wsColor}44`, borderRadius: 7, padding: '5px 0', color: wsColor, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Edit</button>
          <button onClick={e => { e.stopPropagation(); setCdel(true) }} style={{ flex: 1, background: '#ef444418', border: '1px solid #ef444440', borderRadius: 7, padding: '5px 0', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑 Del</button>
        </div>
      </div>
      <Confirm open={cdel} icon="🗑️" title="Delete Task?" body={<>Delete <strong style={{ color: '#f1f5f9' }}>"{task.title}"</strong>?</>} confirmLabel="Delete" onConfirm={() => { setCdel(false); onDelete(task.id) }} onCancel={() => setCdel(false)} />
    </>
  )
}

// ─── Drop Column ──────────────────────────────────────────────────────────────
function DropColumn({ status, tasks, wsColor, wsMembers, cu, onOpen, onEdit, onDelete, dragId, onDragStart, onDrop }) {
  const [over, setOver] = useState(false)
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); onDrop(status) }} style={{ minWidth: 260, flex: '1 1 260px', maxWidth: 310 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, padding: '7px 10px', background: over ? SC[status] + '11' : 'transparent', borderRadius: 10, border: `1px solid ${over ? SC[status] + '55' : 'transparent'}`, transition: 'all 0.15s' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: SC[status] }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{status}</span>
        <span style={{ marginLeft: 'auto', background: '#131f35', color: SC[status], borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{tasks.length}</span>
      </div>
      <div style={{ minHeight: 60, borderRadius: 12, padding: over ? '8px' : '0', background: over ? SC[status] + '0d' : 'transparent', border: over ? `2px dashed ${SC[status]}66` : '2px dashed transparent', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {tasks.map(t => <TaskCard key={t.id} task={t} wsColor={wsColor} wsMembers={wsMembers} cu={cu} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} isDragging={dragId === t.id} />)}
        {tasks.length === 0 && !over && <div style={{ border: '2px dashed #1e2d42', borderRadius: 10, padding: 20, textAlign: 'center', color: '#374151', fontSize: 12 }}>No tasks</div>}
        {over && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, color: SC[status], fontSize: 12, fontWeight: 600 }}>↓ Drop here</div>}
      </div>
    </div>
  )
}

// ─── Task Form Modal ──────────────────────────────────────────────────────────
function TaskFormModal({ open, onClose, task, ws, wsMembers, cu, onSave, onDelete }) {
  const titleRef = useRef(); const descRef = useRef()
  const projRef  = useRef(); const tagsRef = useRef(); const dateRef = useRef()
  const [status,   setStatus]   = useState('Todo')
  const [priority, setPriority] = useState('Medium')
  const [assignTo, setAssignTo] = useState('')
  const [cdel, setCdel] = useState(false)
  const isEdit = !!task

  useEffect(() => {
    if (open) {
      setStatus(task?.status || 'Todo')
      setPriority(task?.priority || 'Medium')
      setAssignTo(task?.assigned_to || cu?.id || '')
    }
  }, [open, task, cu])

  if (!open || !ws || !cu) return null
  const wsColor = ws.color

  const handleSave = async () => {
    const title = titleRef.current?.value?.trim()
    if (!title) return
    const payload = {
      title, description: descRef.current?.value?.trim() || '',
      project: projRef.current?.value?.trim() || '',
      tags: (tagsRef.current?.value || '').split(',').map(t => t.trim()).filter(Boolean),
      due_date: dateRef.current?.value || null,
      status, priority, assigned_to: assignTo || cu.id,
      workspace_id: ws.id, created_by: task?.created_by || cu.id,
    }
    await onSave(isEdit ? { ...task, ...payload } : payload)
    onClose()
  }

  const Lbl = ({ label, children }) => <div style={{ marginBottom: 14 }}><label style={LBL}>{label}</label>{children}</div>

  return (
    <>
      <Modal open={open} onClose={onClose} title={isEdit ? '✏️ Edit Task' : '✦ New Task'} width={560}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={{ gridColumn: '1/-1' }}><Lbl label="Task Title *"><input ref={titleRef} autoFocus defaultValue={task?.title || ''} placeholder="What needs to be done?" style={INP} onKeyDown={e => { if (e.key === 'Enter') handleSave() }} /></Lbl></div>
          <div style={{ gridColumn: '1/-1' }}><Lbl label="Description"><textarea ref={descRef} defaultValue={task?.description || ''} rows={3} style={{ ...INP, resize: 'vertical' }} placeholder="Details…" /></Lbl></div>
          <Lbl label="Status"><select value={status} onChange={e => setStatus(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Lbl>
          <Lbl label="Priority"><select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></Lbl>
          <Lbl label="Assign To"><select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>{wsMembers.map(u => <option key={u.id} value={u.id}>{u.name}{u.id === cu.id ? ' (You)' : ''}</option>)}</select></Lbl>
          <Lbl label="Due Date"><input ref={dateRef} type="date" defaultValue={task?.due_date || ''} style={INP} /></Lbl>
          <Lbl label="Project"><input ref={projRef} defaultValue={task?.project || ''} style={INP} placeholder="e.g. Auth, Infra" /></Lbl>
          <Lbl label="Tags (comma-separated)"><input ref={tagsRef} defaultValue={(task?.tags || []).join(', ')} style={INP} placeholder="Bug, Backend, UX" /></Lbl>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
          {isEdit ? <button onClick={() => setCdel(true)} style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 9, padding: '9px 16px', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🗑️ Delete</button> : <div />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ background: '#1a2640', border: '1px solid #2a3a54', borderRadius: 9, padding: '9px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} style={{ background: `linear-gradient(135deg,${wsColor},${wsColor}bb)`, border: 'none', borderRadius: 9, padding: '9px 26px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{isEdit ? '💾 Save' : 'Create'}</button>
          </div>
        </div>
      </Modal>
      <Confirm open={cdel} icon="🗑️" title="Delete Task?" body={`Delete "${task?.title}"?`} confirmLabel="Delete" onConfirm={async () => { setCdel(false); await onDelete(task.id); onClose() }} onCancel={() => setCdel(false)} />
    </>
  )
}

// ─── Workspace Form Modal ─────────────────────────────────────────────────────
function WorkspaceFormModal({ open, onClose, ws, allProfiles, cu, onSave }) {
  const nameRef = useRef(); const descRef = useRef()
  const [color, setColor]     = useState(ws?.color || WS_COLORS[0])
  const [icon, setIcon]       = useState(ws?.icon || WS_ICONS[0])
  const [members, setMembers] = useState([])

  useEffect(() => {
    if (open) {
      setColor(ws?.color || WS_COLORS[0])
      setIcon(ws?.icon || WS_ICONS[0])
      setMembers(ws?.memberIds || [cu?.id])
    }
  }, [open, ws, cu])

  if (!open || !cu) return null

  const toggle = id => { if (id === cu.id) return; setMembers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]) }

  return (
    <Modal open={open} onClose={onClose} title={ws ? '✏️ Edit Workspace' : '✦ New Workspace'} width={500}>
      <div style={{ marginBottom: 14 }}><label style={LBL}>Workspace Name *</label><input ref={nameRef} defaultValue={ws?.name || ''} placeholder="e.g. Platform Team" style={INP} /></div>
      <div style={{ marginBottom: 14 }}><label style={LBL}>Description</label><textarea ref={descRef} defaultValue={ws?.description || ''} rows={2} style={{ ...INP, resize: 'vertical' }} placeholder="What is this workspace for?" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 14 }}>
        <div><label style={LBL}>Color</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{WS_COLORS.map(c => <div key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: 'pointer', border: `2.5px solid ${color === c ? '#fff' : 'transparent'}`, boxShadow: color === c ? `0 0 0 2px ${c}` : 'none' }} />)}</div></div>
        <div><label style={LBL}>Icon</label><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{WS_ICONS.map(ic => <div key={ic} onClick={() => setIcon(ic)} style={{ width: 34, height: 34, borderRadius: 8, background: icon === ic ? color + '33' : '#131f35', border: `1.5px solid ${icon === ic ? color : '#1e2d42'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{ic}</div>)}</div></div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={LBL}>Members</label>
        {allProfiles.map(u => {
          const checked = members.includes(u.id); const isSelf = u.id === cu.id
          return (
            <div key={u.id} onClick={() => toggle(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: checked ? '#131f35' : 'transparent', border: `1px solid ${checked ? color + '44' : '#1e2d42'}`, borderRadius: 10, padding: '9px 13px', cursor: isSelf ? 'default' : 'pointer', marginBottom: 7, transition: 'all 0.15s' }}>
              <Avatar user={enrichUser(u)} size={30} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{u.name}{isSelf ? ' (You)' : ''}</div><div style={{ fontSize: 11, color: '#64748b' }}>{u.email}</div></div>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checked ? color : '#374151'}`, background: checked ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ background: '#1a2640', border: '1px solid #2a3a54', borderRadius: 9, padding: '9px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
        <button onClick={async () => {
          const name = nameRef.current?.value?.trim(); if (!name) return
          await onSave({ id: ws?.id, name, description: descRef.current?.value?.trim() || '', color, icon, memberIds: members.includes(cu.id) ? members : [...members, cu.id], ownerId: ws?.ownerId || cu.id })
          onClose()
        }} style={{ background: `linear-gradient(135deg,${color},${color}bb)`, border: 'none', borderRadius: 9, padding: '9px 26px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          {ws ? 'Save Changes' : 'Create Workspace'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Main App (after auth + access approved) ──────────────────────────────────
function TaskFlowApp({ cu, isAdmin, allProfiles, onSignOut }) {
  const [workspaces,  setWorkspaces]  = useState([])
  const [activeWsId,  setActiveWsId]  = useState(null)
  const [wsMembers,   setWsMembers]   = useState([])
  const [tasks,       setTasks]       = useState([])
  const [subView,     setSubView]     = useState('board')
  const [viewTask,    setViewTask]    = useState(null)
  const [editTask,    setEditTask]    = useState(null)
  const [creating,    setCreating]    = useState(false)
  const [wsForm,      setWsForm]      = useState(null)
  const [delWs,       setDelWs]       = useState(null)
  const [dragId,      setDragId]      = useState(null)
  const [adminOpen,   setAdminOpen]   = useState(false)
  const [fStatus,     setFStatus]     = useState('')
  const [fPriority,   setFPriority]   = useState('')
  const [search,      setSearch]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [showProf,    setShowProf]    = useState(false)
  const pRef = useRef()

  const activeWs = workspaces.find(w => w.id === activeWsId) || null
  const wsColor  = activeWs?.color || '#6366f1'

  // Load workspaces
  const loadWorkspaces = useCallback(async () => {
    const { data } = await getMyWorkspaces(cu.id)
    setWorkspaces(data)
    setLoading(false)
    if (data.length > 0 && !activeWsId) setActiveWsId(data[0].id)
  }, [cu.id, activeWsId])

  useEffect(() => { loadWorkspaces() }, [cu.id])

  // Load members + tasks when workspace changes
  useEffect(() => {
    if (!activeWsId) return
    getWorkspaceMembers(activeWsId).then(({ data }) => setWsMembers(data || []))
    getTasks(activeWsId).then(({ data }) => setTasks(data || []))
  }, [activeWsId])

  useEffect(() => {
    const h = e => { if (pRef.current && !pRef.current.contains(e.target)) setShowProf(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  // ── Workspace CRUD ────────────────────────────────────────────────────────
  const handleSaveWorkspace = async ({ id, name, description, color, icon, memberIds, ownerId }) => {
    if (id) {
      const { data } = await updateWorkspace(id, { name, description, color, icon })
      // sync members
      const current = wsMembers.map(m => m.id)
      for (const uid of memberIds) { if (!current.includes(uid)) await addMemberToWorkspace(id, uid) }
      for (const uid of current) { if (!memberIds.includes(uid) && uid !== cu.id) await removeMemberFromWorkspace(id, uid) }
    } else {
      const { data: ws } = await createWorkspace({ name, description, color, icon, owner_id: cu.id })
      if (ws) {
        for (const uid of memberIds) await addMemberToWorkspace(ws.id, uid)
        setActiveWsId(ws.id)
      }
    }
    loadWorkspaces()
  }

  const handleDeleteWorkspace = async id => {
    await deleteWorkspace(id)
    setActiveWsId(null)
    loadWorkspaces()
    setDelWs(null)
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  const handleSaveTask = async taskData => {
    if (taskData.id) {
      const { data } = await updateTask(taskData.id, taskData)
      if (data) { setTasks(p => p.map(t => t.id === data.id ? data : t)); setViewTask(data) }
      await logActivity(taskData.id, cu.id, 'Updated task')
    } else {
      const { data } = await createTask(taskData)
      if (data) { setTasks(p => [...p, data]); await logActivity(data.id, cu.id, 'Created task') }
    }
  }

  const handleDeleteTask = async id => {
    await deleteTask(id)
    setTasks(p => p.filter(t => t.id !== id))
    setViewTask(null); setEditTask(null)
  }

  const handleDrop = useCallback(async newStatus => {
    if (!dragId) return
    const task = tasks.find(t => t.id === dragId)
    if (!task || task.status === newStatus) { setDragId(null); return }
    const { data } = await updateTask(dragId, { status: newStatus })
    if (data) setTasks(p => p.map(t => t.id === dragId ? data : t))
    await logActivity(dragId, cu.id, `Moved to ${newStatus}`)
    setDragId(null)
  }, [dragId, tasks, cu.id])

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = tasks.filter(t => {
    if (fStatus   && t.status !== fStatus)     return false
    if (fPriority && t.priority !== fPriority) return false
    if (search    && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) return <div style={{ minHeight: '100vh', background: '#06090f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'system-ui,sans-serif', fontSize: 14 }}>Loading workspaces…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#07101d', fontFamily: 'system-ui,sans-serif', color: '#f1f5f9', display: 'flex' }} onDragEnd={() => setDragId(null)}>

      {/* ── Icon rail ── */}
      <div style={{ width: 64, background: '#060c18', borderRight: '1px solid #1e2d42', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 8, cursor: 'pointer' }} onClick={() => setActiveWsId(null)}>✦</div>
        <div style={{ width: 32, height: 1, background: '#1e2d42', marginBottom: 4 }} />
        {workspaces.map(ws => (
          <div key={ws.id} title={ws.name} onClick={() => { setActiveWsId(ws.id); setSubView('board'); setFStatus(''); setFPriority(''); setSearch('') }}
            style={{ width: 40, height: 40, borderRadius: 12, background: activeWsId === ws.id ? ws.color + '33' : '#0d1627', border: `1.5px solid ${activeWsId === ws.id ? ws.color : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', transition: 'all 0.2s', boxShadow: activeWsId === ws.id ? `0 0 0 3px ${ws.color}33` : undefined }}
            onMouseEnter={e => { if (activeWsId !== ws.id) { e.currentTarget.style.background = '#131f35'; e.currentTarget.style.borderColor = ws.color + '66' } }}
            onMouseLeave={e => { if (activeWsId !== ws.id) { e.currentTarget.style.background = '#0d1627'; e.currentTarget.style.borderColor = 'transparent' } }}>
            {ws.icon}
          </div>
        ))}
        <div title="New Workspace" onClick={() => setWsForm('new')} style={{ width: 40, height: 40, borderRadius: 12, border: '1.5px dashed #1e2d42', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, cursor: 'pointer', color: '#374151', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1'; e.currentTarget.style.background = '#6366f111' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d42'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = 'transparent' }}>+</div>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <div title="Admin Panel" onClick={() => setAdminOpen(true)} style={{ width: 40, height: 40, borderRadius: 12, background: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', marginBottom: 8 }}>🛡️</div>
        )}
        <div ref={pRef} style={{ position: 'relative' }}>
          <div onClick={() => setShowProf(p => !p)} style={{ cursor: 'pointer' }}>
            <Avatar user={enrichUser(cu)} size={36} />
          </div>
          {showProf && (
            <div style={{ position: 'absolute', bottom: 0, left: 52, background: '#0b1220', border: '1px solid #1e2d42', borderRadius: 12, width: 220, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 500, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e2d42', display: 'flex', gap: 9, alignItems: 'center' }}>
                <Avatar user={enrichUser(cu)} size={36} />
                <div><div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{cu.user_metadata?.full_name || cu.email}</div><div style={{ fontSize: 11, color: '#64748b' }}>{cu.email}</div><div style={{ fontSize: 10, color: '#10b981', marginTop: 2, fontWeight: 600 }}>● Google Auth{isAdmin ? ' · Admin' : ''}</div></div>
              </div>
              {isAdmin && <button onClick={() => { setAdminOpen(true); setShowProf(false) }} style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', fontSize: 13, textAlign: 'left', fontWeight: 600 }} onMouseEnter={e => e.currentTarget.style.background = '#1e2937'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>🛡️ Admin Panel</button>}
              <button onClick={() => { setShowProf(false); onSignOut() }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background = '#1e2937'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>⎋ Sign Out</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div style={{ width: 230, background: '#060c18', borderRight: '1px solid #1e2d42', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {activeWs ? (
          <>
            <div style={{ padding: '16px 14px', borderBottom: '1px solid #1e2d42' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: wsColor + '22', border: `1px solid ${wsColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{activeWs.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeWs.name}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{wsMembers.length} members · {tasks.length} tasks</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => setWsForm(activeWs)} style={{ flex: 1, background: wsColor + '18', border: `1px solid ${wsColor}33`, borderRadius: 7, padding: '5px 0', color: wsColor, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Edit</button>
                {activeWs.owner_id === cu.id && <button onClick={() => setDelWs(activeWs)} style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 7, padding: '5px 7px', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>🗑</button>}
              </div>
            </div>
            <div style={{ padding: '10px 8px', flex: 1, overflowY: 'auto' }}>
              {[{ id: 'board', label: 'Board', icon: '⊞' }, { id: 'list', label: 'List', icon: '☰' }, { id: 'team', label: 'Team', icon: '⊛' }, { id: 'dashboard', label: 'Dashboard', icon: '⬡' }].map(n => (
                <button key={n.id} onClick={() => setSubView(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 2, fontSize: 13, textAlign: 'left', fontWeight: subView === n.id ? 700 : 500, background: subView === n.id ? wsColor + '22' : 'transparent', color: subView === n.id ? wsColor : '#64748b', transition: 'all 0.15s' }}
                  onMouseEnter={e => { if (subView !== n.id) e.currentTarget.style.background = '#131f35' }}
                  onMouseLeave={e => { if (subView !== n.id) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ fontSize: 15 }}>{n.icon}</span>{n.label}
                </button>
              ))}
              <div style={{ margin: '16px 0 8px 10px', fontSize: 10, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Members ({wsMembers.length})</div>
              {wsMembers.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 8 }}>
                  <Avatar user={enrichUser(u)} size={20} />
                  <span style={{ fontSize: 12, color: u.id === cu.id ? wsColor : '#64748b', fontWeight: u.id === cu.id ? 700 : 400, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(u.name || u.email).split(' ')[0]}{u.id === cu.id ? ' ✦' : ''}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 8px', borderTop: '1px solid #1e2d42' }}>
              <button onClick={() => setCreating(true)} style={{ width: '100%', background: `linear-gradient(135deg,${wsColor},${wsColor}bb)`, border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontSize: 17 }}>+</span> New Task
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Your Workspaces</div>
            {workspaces.map(ws => {
              const ms = allProfiles.filter(u => ws.memberIds?.includes(u.id))
              return (
                <div key={ws.id} onClick={() => setActiveWsId(ws.id)} style={{ background: '#0d1627', border: `1.5px solid #1e2d42`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', marginBottom: 8, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = ws.color; e.currentTarget.style.background = '#131f35' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d42'; e.currentTarget.style.background = '#0d1627' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: ws.color + '22', border: `1px solid ${ws.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{ws.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{ws.name}</div><div style={{ fontSize: 11, color: '#64748b' }}>{ws.description}</div></div>
                  </div>
                </div>
              )
            })}
            <button onClick={() => setWsForm('new')} style={{ width: '100%', background: 'transparent', border: '1.5px dashed #1e2d42', borderRadius: 12, padding: '12px', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d42'; e.currentTarget.style.color = '#374151' }}>+ Create Workspace</button>
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{ background: '#060c18', borderBottom: '1px solid #1e2d42', padding: '0 18px', height: 54, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {activeWs ? (
            <>
              <button onClick={() => setActiveWsId(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>All Workspaces</button>
              <span style={{ color: '#374151', fontSize: 12 }}>/</span>
              <span style={{ color: wsColor, fontSize: 13 }}>{activeWs.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{activeWs.name}</span>
              <div style={{ width: 1, height: 20, background: '#1e2d42', margin: '0 4px' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search tasks…" style={{ background: '#0d1627', border: '1px solid #1e2d42', borderRadius: 8, padding: '5px 10px', color: '#f1f5f9', fontSize: 12, outline: 'none', width: 180, fontFamily: 'system-ui,sans-serif' }} />
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ background: '#0d1627', border: '1px solid #1e2d42', borderRadius: 8, padding: '4px 7px', color: '#94a3b8', fontSize: 11, cursor: 'pointer', outline: 'none' }}>
                <option value="">All Status</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={{ background: '#0d1627', border: '1px solid #1e2d42', borderRadius: 8, padding: '4px 7px', color: '#94a3b8', fontSize: 11, cursor: 'pointer', outline: 'none' }}>
                <option value="">All Priority</option>{PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
              {(fStatus || fPriority || search) && <button onClick={() => { setFStatus(''); setFPriority(''); setSearch('') }} style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 6, padding: '3px 9px', color: '#ef4444', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Clear ✕</button>}
            </>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>All Workspaces</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => setWsForm('new')} style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New Workspace</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {!activeWs && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', margin: '0 0 20px' }}>Your Workspaces</h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
                {workspaces.map(ws => (
                  <div key={ws.id} onClick={() => setActiveWsId(ws.id)} style={{ background: '#0d1627', border: `1.5px solid #1e2d42`, borderRadius: 14, padding: '18px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = ws.color; e.currentTarget.style.background = '#131f35' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d42'; e.currentTarget.style.background = '#0d1627' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ws.color }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: ws.color + '22', border: `1px solid ${ws.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{ws.icon}</div>
                      <div><div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{ws.name}</div><div style={{ fontSize: 11, color: '#64748b' }}>{ws.description}</div></div>
                    </div>
                  </div>
                ))}
                <div onClick={() => setWsForm('new')} style={{ background: '#0d1627', border: '1.5px dashed #1e2d42', borderRadius: 14, padding: '28px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#131f35' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d42'; e.currentTarget.style.background = '#0d1627' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, border: '2px dashed #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#374151' }}>+</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Create Workspace</div>
                </div>
              </div>
            </div>
          )}

          {activeWs && subView === 'board' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div><h1 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: 0 }}>{activeWs.name} · Board</h1><p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>{filtered.length} tasks · hover cards for Edit/Delete · drag to move</p></div>
              </div>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
                {STATUSES.map(status => <DropColumn key={status} status={status} tasks={filtered.filter(t => t.status === status)} wsColor={wsColor} wsMembers={wsMembers} cu={cu} onOpen={setViewTask} onEdit={setEditTask} onDelete={handleDeleteTask} dragId={dragId} onDragStart={setDragId} onDrop={handleDrop} />)}
              </div>
            </div>
          )}

          {activeWs && subView === 'list' && (
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: '0 0 20px' }}>{activeWs.name} · List</h1>
              <div style={{ background: '#0d1627', border: '1px solid #1e2d42', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ borderBottom: '1px solid #1e2d42' }}>{['Task', 'Status', 'Priority', 'Assignee', 'Due Date', 'Actions'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filtered.map(t => {
                      const asgn = getUser(t.assigned_to, wsMembers); const ov = isOverdue(t.due_date) && t.status !== 'Done'
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid #1e2d42' }} onMouseEnter={e => e.currentTarget.style.background = '#131f35'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '11px 14px', cursor: 'pointer' }} onClick={() => setViewTask(t)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 3, height: 28, borderRadius: 2, background: PC[t.priority], flexShrink: 0 }} />
                              <div><div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{t.title}</div><div style={{ fontSize: 11, color: '#64748b' }}>{t.project}</div></div>
                            </div>
                          </td>
                          <td style={{ padding: '11px 8px' }}><Pill label={t.status} color={SC[t.status]} sm /></td>
                          <td style={{ padding: '11px 8px' }}><Pill label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]} sm /></td>
                          <td style={{ padding: '11px 8px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar user={asgn} size={22} /><span style={{ fontSize: 12, color: '#94a3b8' }}>{asgn?.name || '—'}</span></div></td>
                          <td style={{ padding: '11px 8px' }}><span style={{ fontSize: 12, color: ov ? '#ef4444' : '#94a3b8', fontWeight: ov ? 700 : 400 }}>{t.due_date ? fmtDate(t.due_date) : '—'}</span></td>
                          <td style={{ padding: '11px 8px' }}>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button onClick={() => setEditTask(t)} style={{ background: wsColor + '22', border: `1px solid ${wsColor}44`, borderRadius: 6, padding: '4px 8px', color: wsColor, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️</button>
                              <button onClick={() => setViewTask(t)} style={{ background: '#131f35', border: '1px solid #1e2d42', borderRadius: 6, padding: '4px 8px', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>👁</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#374151', fontSize: 13 }}>No tasks found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeWs && subView === 'team' && (
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: '0 0 20px' }}>{activeWs.name} · Team Boards</h1>
              {wsMembers.map(member => {
                const mTasks = filtered.filter(t => t.assigned_to === member.id)
                const byMe   = mTasks.filter(t => t.created_by === cu.id)
                const enMem  = enrichUser(member)
                return (
                  <div key={member.id} style={{ background: '#0a1525', border: '1px solid #1e2d42', borderRadius: 18, padding: 20, marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #1e2d42' }}>
                      <Avatar user={enMem} size={46} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{member.name}{member.id === cu.id ? ' (You)' : ''}</div><div style={{ fontSize: 12, color: '#64748b' }}>{member.email}</div></div>
                      <div style={{ display: 'flex', gap: 14 }}>
                        {[{ l: 'Active', v: mTasks.filter(t => t.status !== 'Done').length, c: wsColor }, { l: 'Done', v: mTasks.filter(t => t.status === 'Done').length, c: '#10b981' }, { l: 'By Me', v: byMe.length, c: '#818cf8' }].map(x => (
                          <div key={x.l} style={{ textAlign: 'center', minWidth: 36 }}><div style={{ fontSize: 18, fontWeight: 800, color: x.c }}>{x.v}</div><div style={{ fontSize: 9, color: '#64748b', marginTop: 2, fontWeight: 600 }}>{x.l}</div></div>
                        ))}
                      </div>
                    </div>
                    {byMe.length > 0 && (
                      <div style={{ background: wsColor + '0d', border: `1px solid ${wsColor}22`, borderRadius: 10, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>📌</span><span style={{ fontSize: 12, color: wsColor, fontWeight: 700 }}>You assigned {byMe.length} task(s):</span>
                        {byMe.map(t => <span key={t.id} onClick={() => setViewTask(t)} style={{ fontSize: 11, background: SC[t.status] + '22', color: SC[t.status], border: `1px solid ${SC[t.status]}44`, borderRadius: 6, padding: '2px 8px', fontWeight: 600, cursor: 'pointer' }}>{t.title.slice(0, 20)} · {t.status}</span>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                      {STATUSES.map(status => <DropColumn key={status} status={status} tasks={mTasks.filter(t => t.status === status)} wsColor={wsColor} wsMembers={wsMembers} cu={cu} onOpen={setViewTask} onEdit={setEditTask} onDelete={handleDeleteTask} dragId={dragId} onDragStart={setDragId} onDrop={handleDrop} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeWs && subView === 'dashboard' && (
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: '0 0 20px' }}>{activeWs.name} · Dashboard</h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
                {[{ l: 'Total Tasks', v: tasks.length, c: wsColor }, { l: 'In Progress', v: tasks.filter(t => t.status === 'In Progress').length, c: '#6366f1' }, { l: 'Completed', v: tasks.filter(t => t.status === 'Done').length, c: '#10b981' }, { l: 'Overdue', v: tasks.filter(t => isOverdue(t.due_date) && t.status !== 'Done').length, c: '#ef4444' }].map(x => (
                  <div key={x.l} style={{ background: '#0d1627', border: '1px solid #1e2d42', borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: x.c, marginBottom: 2 }}>{x.v}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#0d1627', border: '1px solid #1e2d42', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#f1f5f9' }}>Status Breakdown</div>
                {STATUSES.map(s => { const c = tasks.filter(t => t.status === s).length; const p = tasks.length ? Math.round((c / tasks.length) * 100) : 0; return (<div key={s} style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: 12, color: '#94a3b8' }}>{s}</span><span style={{ fontSize: 12, color: SC[s], fontWeight: 700 }}>{c}</span></div><div style={{ height: 5, background: '#1e2d42', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: p + '%', height: '100%', background: SC[s], borderRadius: 3 }} /></div></div>) })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {(creating || editTask) && activeWs && (
        <TaskFormModal open onClose={() => { setCreating(false); setEditTask(null) }} task={editTask} ws={activeWs} wsMembers={wsMembers} cu={cu} onSave={handleSaveTask} onDelete={handleDeleteTask} />
      )}
      {wsForm && (
        <WorkspaceFormModal open onClose={() => setWsForm(null)} ws={wsForm === 'new' ? null : wsForm} allProfiles={allProfiles} cu={cu} onSave={handleSaveWorkspace} />
      )}
      <Confirm open={!!delWs} icon="⚠️" title="Delete Workspace?" body={`Delete "${delWs?.name}" and all its tasks?`} confirmLabel="Delete Workspace" onConfirm={() => handleDeleteWorkspace(delWs?.id)} onCancel={() => setDelWs(null)} />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
  )
}

// ─── Root App — Auth Gate ─────────────────────────────────────────────────────
export default function App() {
  const [session,     setSession]     = useState(null)
  const [accessStatus,setAccessStatus]= useState(null) // null | pending | approved | denied
  const [allProfiles, setAllProfiles] = useState([])
  const [loading,     setLoading]     = useState(true)

  // YOUR email here — this person is the first admin
  const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''
  const isAdmin = session?.user?.email === ADMIN_EMAIL

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) handleUserAuth(session.user)
      else setLoading(false)
    })

    // Listen for auth changes (OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) handleUserAuth(session.user)
      else { setAccessStatus(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleUserAuth = async user => {
    setLoading(true)
    await upsertProfile(user)

    // Admin is always approved
    if (user.email === ADMIN_EMAIL) {
      // Ensure admin has an approved access request
      await supabase.from('access_requests').upsert({ user_id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email, status: 'approved' }, { onConflict: 'user_id' })
      setAccessStatus('approved')
    } else {
      // Check or create access request
      const status = await checkAccessStatus(user.id)
      if (!status) {
        await submitAccessRequest(user)
        setAccessStatus('pending')
      } else {
        setAccessStatus(status)
      }
    }

    // Load all approved profiles for workspace member selection
    const { data } = await supabase.from('profiles').select('id, email, name, avatar_url').in(
      'id',
      (await supabase.from('access_requests').select('user_id').eq('status', 'approved')).data?.map(r => r.user_id) || []
    )
    setAllProfiles(data || [])
    setLoading(false)
  }

  const handleSignOut = async () => {
    await signOut()
    setSession(null)
    setAccessStatus(null)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#06090f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
        <div style={{ fontSize: 14, color: '#64748b' }}>Loading TaskFlow…</div>
      </div>
    </div>
  )

  if (!session) return <AuthScreen />
  if (accessStatus === 'pending') return <PendingScreen user={session.user} onSignOut={handleSignOut} />
  if (accessStatus === 'denied')  return <DeniedScreen onSignOut={handleSignOut} />
  if (accessStatus === 'approved') return <TaskFlowApp cu={session.user} isAdmin={isAdmin} allProfiles={allProfiles} onSignOut={handleSignOut} />

  return <AuthScreen />
}
