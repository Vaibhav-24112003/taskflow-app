// ── TaskFlowCo — native mobile app (installed / phone-width experience) ──────
// Full-screen overlay mounted in main.jsx alongside <App/> and <HomeSkin/>.
// Renders ONLY when signed in AND (standalone PWA OR viewport < 820px), covering
// the desktop app underneath. A "Full app" escape hatch (Profile) drops back to
// the desktop UI for the session.
//
// Faithful build of the Claude Design handoff "TaskFlowCo Mobile.dc.html"
// (9 screens: Home, Tasks, Task detail, Add/FAB, Calendar, Team, Chat,
// Notifications, Profile) wired to real Supabase data.
//
// Data model (see CLAUDE.md):
//   organizations  → firms / "practices" (header + switcher)
//   workspaces     → practice-area boards within an org (home "Your practices")
//   tasks          → workspace-scoped tasks (priority, due_date, checklist jsonb)
//   organization_members + profiles → team
//   team_chat_channels / team_chat_messages → chat
//   announcements  → notifications feed

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, signOut } from './lib/supabase.js'

// ── module-scope cache (survives screen switches; keyed by org id) ──────────
const _mCache = {}

// ── theme tokens ────────────────────────────────────────────────────────────
const LIGHT = {
  bg: 'radial-gradient(700px 340px at 6% -4%,rgba(47,107,255,.10),transparent 60%),radial-gradient(620px 340px at 98% 4%,rgba(124,92,255,.07),transparent 60%),linear-gradient(180deg,#f8fbff 0%,#f2f6fa 55%,#edf2f7 100%)',
  ink: '#0b1c2f', ink2: '#12263d', sub: '#5d7189', sub2: '#73849a', faint: '#7b8da2',
  card: 'rgba(255,255,255,.7)', cardBd: 'rgba(255,255,255,.84)',
  glass: 'rgba(255,255,255,.66)', glassBd: 'rgba(255,255,255,.86)',
  navBg: 'rgba(255,255,255,.86)', navBd: 'rgba(20,42,70,.07)',
  sheet: '#f7fafd', line: 'rgba(89,112,139,.08)', input: '#fff',
}
const DARK = {
  bg: 'radial-gradient(700px 340px at 6% -4%,rgba(47,107,255,.16),transparent 60%),radial-gradient(620px 340px at 98% 4%,rgba(124,92,255,.12),transparent 60%),linear-gradient(180deg,#0b1626 0%,#0c1a2e 55%,#0a1524 100%)',
  ink: '#eaf1fb', ink2: '#dbe6f4', sub: '#9fb0c6', sub2: '#8496ad', faint: '#7d90aa',
  card: 'rgba(24,40,62,.66)', cardBd: 'rgba(120,150,190,.14)',
  glass: 'rgba(22,37,58,.6)', glassBd: 'rgba(120,150,190,.14)',
  navBg: 'rgba(12,24,40,.9)', navBd: 'rgba(120,150,190,.12)',
  sheet: '#0f1c2e', line: 'rgba(140,165,200,.1)', input: 'rgba(15,28,46,.9)',
}

const ACCENT = '#2F6BFF', ACCENT2 = '#14C7C0'
const PALETTE = ['#2F6BFF', '#7C3AED', '#0d9488', '#D97706', '#EC4899', '#0EA5E9']
const PRI = { High: '#DC2626', Medium: '#D97706', Low: '#0d9488' }

// ── date helpers ────────────────────────────────────────────────────────────
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function pad(n) { return String(n).padStart(2, '0') }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function todayISO() { return iso(new Date()) }
function initials(name = '') {
  const t = String(name || '').trim()
  if (!t) return '?'
  return t.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()
}
function daysBetween(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00'), b = new Date(bIso + 'T00:00:00')
  return Math.round((a - b) / 86400000)
}
function dueInfo(dateStr) {
  if (!dateStr) return { text: 'No date', line: 'No due date', overdue: false, today: false }
  const t = todayISO()
  const diff = daysBetween(dateStr, t)
  const d = new Date(dateStr + 'T00:00:00')
  const nice = `${d.getDate()} ${MON[d.getMonth()]}`
  if (diff < 0) { const n = -diff; return { text: `Overdue · ${n}d`, line: `Overdue by ${n} day${n > 1 ? 's' : ''}`, overdue: true, today: false } }
  if (diff === 0) return { text: 'Today', line: 'Due today', overdue: false, today: true }
  if (diff === 1) return { text: 'Tomorrow', line: 'Due tomorrow', overdue: false, today: false }
  return { text: nice, line: `Due ${nice}`, overdue: false, today: false }
}

// ── task field normalisers ──────────────────────────────────────────────────
const DONE_RE = /done|complete|closed|finished/i
function normPriority(p) {
  const s = String(p || '').toLowerCase()
  if (s === 'urgent' || s === 'high') return 'High'
  if (s === 'low') return 'Low'
  if (s === 'medium' || s === 'med' || s === 'normal') return 'Medium'
  return 'Medium'
}
function checklistOf(t) {
  const cl = t.checklist
  if (!Array.isArray(cl)) return { total: 0, done: 0, items: [] }
  const items = cl.map((it, i) => {
    if (typeof it === 'string') return { label: it, done: false, i }
    return { label: it.text || it.label || it.title || `Step ${i + 1}`, done: !!(it.done ?? it.checked ?? it.completed), i }
  })
  return { total: items.length, done: items.filter(x => x.done).length, items }
}
function isDone(t) { return DONE_RE.test(String(t.status || '')) }
function doneStatus(ws) {
  const cs = ws && Array.isArray(ws.custom_statuses) ? ws.custom_statuses : null
  if (cs && cs.length) {
    const hit = cs.find(s => DONE_RE.test(String(s.name || s.label || s)))
    if (hit) return hit.name || hit.label || hit
    return cs[cs.length - 1].name || cs[cs.length - 1].label || cs[cs.length - 1]
  }
  return 'Done'
}
function todoStatus(ws) {
  const cs = ws && Array.isArray(ws.custom_statuses) ? ws.custom_statuses : null
  if (cs && cs.length) return cs[0].name || cs[0].label || cs[0]
  return 'Todo'
}

const PROG_RE = /progress|doing|review|ongoing|wip/i
function statusMeta(status) {
  const s = String(status || 'Todo')
  if (DONE_RE.test(s)) return { label: s, color: '#0d9488' }
  if (PROG_RE.test(s)) return { label: s, color: '#D97706' }
  return { label: s || 'Todo', color: '#6b7c93' }
}
// Ordered, de-duplicated status columns for a board.
function boardColumns(tasks, ws) {
  const order = []
  const push = n => { if (n && !order.includes(n)) order.push(n) }
  if (ws && Array.isArray(ws.custom_statuses)) ws.custom_statuses.forEach(s => push(s.name || s.label || s))
  tasks.forEach(t => push(t.status || 'Todo'))
  if (!order.length) order.push('Todo')
  return order
}

// ── inline icon ─────────────────────────────────────────────────────────────
function Ic({ d, size = 20, sw = 1.9, stroke = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {String(d).split('|').map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}
const D = {
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9|M10.3 21a1.94 1.94 0 0 0 3.4 0',
  chevD: 'M6 9l6 6 6-6', chevR: 'M9 18l6-6-6-6', chevL: 'M15 18l-6-6 6-6',
  bolt: 'M13 2 3 14h7l-1 8 10-12h-7l1-8Z', plus: 'M12 5v14M5 12h14',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  check2: 'M20 6 9 17l-5-5',
  home: 'M3 10.6 12 4l9 6.6V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  cal: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4',
  team: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-2a4 4 0 0 0-3-3.87M16 4.1a4 4 0 0 1 0 7.75',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  brief: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  shield: 'M12 2 4 5v6c0 6 8 10 8 10s8-4 8-10V5l-8-3ZM9 12l2 2 4-4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  at: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  mega: 'M3 11 21 6v12L3 13v-2z|M11.6 16.8a3 3 0 1 1-5.8-1.6',
  warn: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
}

function shouldShowMobile() {
  if (typeof window === 'undefined') return false
  try { if (sessionStorage.getItem('tf_mobile_off') === '1') return false } catch {}
  // Phone form-factor only. Gate on viewport width, NOT display-mode:standalone —
  // a *desktop* PWA install also reports standalone, and must keep the full
  // desktop app. An installed phone PWA has a narrow viewport, so it still gets
  // the mobile UI here.
  return window.innerWidth < 820
}

export default function MobileApp() {
  const [user, setUser] = useState(undefined) // undefined = unknown, null = signed out
  const [show, setShow] = useState(shouldShowMobile())

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => { if (alive) setUser(data?.user || null) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setUser(session?.user || null)
    })
    const onR = () => setShow(shouldShowMobile())
    window.addEventListener('resize', onR)
    return () => { alive = false; sub?.subscription?.unsubscribe?.(); window.removeEventListener('resize', onR) }
  }, [])

  const active = show && !!user
  useEffect(() => {
    if (active) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.body.classList.add('tf-mobile-active')
      return () => { document.body.style.overflow = prev; document.body.classList.remove('tf-mobile-active') }
    }
  }, [active])

  if (!active) return null
  return <Shell user={user} />
}

// ── main shell (all screens live here) ──────────────────────────────────────
function Shell({ user }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tfc-theme') === 'dark' } catch { return false }
  })
  const t = dark ? DARK : LIGHT

  // navigation
  const [screen, setScreen] = useState('home')     // home|tasks|calendar|team|chat|notifs|profile
  const [detailId, setDetailId] = useState(null)
  const [chatChannel, setChatChannel] = useState(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [filter, setFilter] = useState('All')
  const [taskWs, setTaskWs] = useState('')          // '' = all workspaces in the practice
  const [tasksView, setTasksView] = useState('list') // 'list' | 'board'
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })

  // data
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState(() => { try { return localStorage.getItem('tf_mobile_orgId') || '' } catch { return '' } })
  const [d, setD] = useState({ workspaces: [], tasks: [], members: [], profiles: {}, clients: 0, anns: [], channels: [] })
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const loadingRef = useRef(false)

  const uid = user?.id
  const uname = user?.user_metadata?.full_name || user?.user_metadata?.name || (user?.email || '').split('@')[0] || 'You'
  const uemail = user?.email || ''

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2200) }

  // load orgs once
  useEffect(() => {
    let alive = true
    supabase.from('organizations').select('id,name,subscription_status,paid_modules,trial_expires_at').order('name').limit(100)
      .then(({ data }) => {
        if (!alive) return
        const list = data || []
        setOrgs(list)
        setOrgId(prev => (prev && list.some(o => o.id === prev)) ? prev : (list[0]?.id || ''))
        if (!list.length) setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => { if (orgId) { try { localStorage.setItem('tf_mobile_orgId', orgId) } catch {} } }, [orgId])

  // load active-org data
  async function loadOrg() {
    if (!orgId || !uid) return
    if (loadingRef.current) return
    loadingRef.current = true
    if (!_mCache[orgId]) setLoading(true)
    try {
      const wsRes = await supabase.from('workspaces')
        .select('id,name,color,icon,custom_statuses,org_id,created_at').eq('org_id', orgId).order('created_at')
      const workspaces = wsRes.data || []
      const wsIds = workspaces.map(w => w.id)
      let tasks = [], members = [], profiles = {}, clients = 0, anns = [], channels = []
      if (wsIds.length) {
        const tr = await supabase.from('tasks')
          .select('id,title,description,status,priority,due_date,assigned_to,assignees,project,tags,checklist,workspace_id,created_at,updated_at')
          .in('workspace_id', wsIds).is('archived_at', null).limit(1000)
        tasks = tr.data || []
      }
      try {
        const mr = await supabase.from('organization_members').select('user_id,role').eq('org_id', orgId).limit(200)
        members = mr.data || []
        const ids = [...new Set(members.map(m => m.user_id).filter(Boolean))]
        if (ids.length) {
          const pr = await supabase.from('profiles').select('id,name,email,avatar_url').in('id', ids).limit(200)
          ;(pr.data || []).forEach(p => { profiles[p.id] = p })
        }
      } catch {}
      try { const cr = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId); clients = cr.count || 0 } catch {}
      try { const ar = await supabase.from('announcements').select('*').eq('active', true).order('published_at', { ascending: false }).limit(6); anns = ar.data || [] } catch {}
      try { const chr = await supabase.from('team_chat_channels').select('id,name,kind,dm_key,sort_order').eq('org_id', orgId).order('sort_order'); channels = chr.data || [] } catch {}
      const next = { workspaces, tasks, members, profiles, clients, anns, channels }
      _mCache[orgId] = next
      setD(next)
    } catch (e) {
      if (_mCache[orgId]) setD(_mCache[orgId])
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }
  useEffect(() => {
    if (orgId && _mCache[orgId]) { setD(_mCache[orgId]); setLoading(false) }
    loadOrg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, uid])

  // ── derived ──────────────────────────────────────────────────────────────
  const wsById = useMemo(() => Object.fromEntries(d.workspaces.map(w => [w.id, w])), [d.workspaces])
  const wsColor = useMemo(() => {
    const m = {}; d.workspaces.forEach((w, i) => { m[w.id] = w.color && /^#/.test(w.color) ? w.color : PALETTE[i % PALETTE.length] }); return m
  }, [d.workspaces])

  const views = useMemo(() => d.tasks.map(task => {
    const ws = wsById[task.workspace_id]
    const color = wsColor[task.workspace_id] || ACCENT
    const done = isDone(task)
    const cl = checklistOf(task)
    const di = dueInfo(task.due_date)
    const pr = normPriority(task.priority)
    const aIds = (Array.isArray(task.assignees) && task.assignees.length ? task.assignees : (task.assigned_to ? [task.assigned_to] : []))
    return {
      ...task, ws, wsName: ws?.name || 'Workspace', color, done, pri: pr,
      steps: cl.total, doneSteps: cl.done, checkItems: cl.items,
      due: di.text, dueLine: di.line, overdue: di.overdue && !done, today: di.today,
      mine: aIds.includes(uid),
      assigneeIds: aIds,
      client: task.project || '',
      dueColor: (di.overdue && !done) ? '#DC2626' : (di.today ? ACCENT : t.sub2),
    }
  }), [d.tasks, wsById, wsColor, uid, t.sub2])

  const stats = useMemo(() => {
    const active = views.filter(v => !v.done)
    const wkAgo = (() => { const x = new Date(); x.setDate(x.getDate() - 7); return x.toISOString() })()
    return {
      active: active.length,
      dueToday: active.filter(v => v.today).length,
      overdue: active.filter(v => v.overdue).length,
      done: views.filter(v => v.done && v.updated_at && v.updated_at >= wkAgo).length,
    }
  }, [views])

  const org = orgs.find(o => o.id === orgId) || null
  const orgName = org?.name || 'Your practice'

  // ── mutations ──────────────────────────────────────────────────────────────
  async function toggleDone(v) {
    const ws = wsById[v.workspace_id]
    const next = v.done ? todoStatus(ws) : doneStatus(ws)
    // optimistic
    setD(prev => {
      const nx = { ...prev, tasks: prev.tasks.map(x => x.id === v.id ? { ...x, status: next, updated_at: new Date().toISOString() } : x) }
      _mCache[orgId] = nx; return nx
    })
    try { await supabase.from('tasks').update({ status: next, updated_at: new Date().toISOString() }).eq('id', v.id) }
    catch { flash('Could not update'); loadOrg() }
  }

  async function toggleStep(v, idx) {
    const cur = Array.isArray(v.checklist) ? v.checklist : []
    const nextCl = cur.map((it, i) => {
      if (i !== idx) return it
      if (typeof it === 'string') return { text: it, done: true }
      const done = !(it.done ?? it.checked ?? it.completed)
      return { ...it, done, checked: done, completed: done }
    })
    setD(prev => {
      const nx = { ...prev, tasks: prev.tasks.map(x => x.id === v.id ? { ...x, checklist: nextCl } : x) }
      _mCache[orgId] = nx; return nx
    })
    try { await supabase.from('tasks').update({ checklist: nextCl, updated_at: new Date().toISOString() }).eq('id', v.id) }
    catch { flash('Could not update'); loadOrg() }
  }

  async function createTask({ title, wsId, priority }) {
    if (!wsId) { flash('Pick a practice first'); return }
    const ws = wsById[wsId]
    const payload = {
      title: title || 'Untitled task', workspace_id: wsId, org_id: orgId,
      status: todoStatus(ws), priority: (priority || 'Medium').toLowerCase(),
      due_date: todayISO(), created_by: uid,
      assignees: uid ? [uid] : [],
    }
    try {
      const { data, error } = await supabase.from('tasks').insert(payload).select().single()
      if (error) throw error
      setD(prev => { const nx = { ...prev, tasks: [data, ...prev.tasks] }; _mCache[orgId] = nx; return nx })
      setAddOpen(false); setScreen('tasks'); setDetailId(null); flash('Task created')
    } catch { flash('Could not create task') }
  }

  async function doSignOut() { try { await signOut() } catch {} window.location.reload() }
  function openFullApp() { try { sessionStorage.setItem('tf_mobile_off', '1') } catch {} window.location.reload() }
  function toggleDark() {
    const nv = !dark; setDark(nv)
    try { localStorage.setItem('tfc-theme', nv ? 'dark' : 'light'); document.documentElement.setAttribute('data-theme', nv ? 'dark' : 'light') } catch {}
  }

  const detail = detailId ? views.find(v => v.id === detailId) : null
  const curScreen = detail ? 'detail' : screen

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99990, display: 'flex', flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans',system-ui,-apple-system,sans-serif", color: t.ink,
      background: t.bg, overflow: 'hidden',
    }}>
      <style>{`
        @keyframes tfmIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes tfmSheet{from{transform:translateY(100%)}to{transform:none}}
        @keyframes tfmFade{from{opacity:0}to{opacity:1}}
        .tfm-scroll::-webkit-scrollbar{width:0;height:0}
        .tfm-x::-webkit-scrollbar{height:0}
      `}</style>

      {/* header (a chat thread supplies its own header) */}
      {curScreen === 'chat' && chatChannel ? null
        : curScreen === 'home'
        ? <HomeHeader t={t} orgName={orgName} initials2={initials(orgName)} userInit={initials(uname)}
            hasOrgs={orgs.length > 1} onSwitch={() => setSwitcherOpen(true)}
            onBell={() => setScreen('notifs')} onProfile={() => setScreen('profile')} />
        : <TopBar t={t}
            title={{ tasks: 'Tasks', detail: 'Task', calendar: 'Calendar', team: 'Team', chat: 'Messages', notifs: 'Notifications', profile: 'Profile' }[curScreen] || ''}
            showBack={curScreen === 'detail' || curScreen === 'notifs' || curScreen === 'profile'}
            onBack={() => { if (detail) setDetailId(null); else setScreen('home') }}
            showBell={['tasks', 'calendar', 'team', 'chat'].includes(curScreen)}
            onBell={() => setScreen('notifs')} />}

      {/* body */}
      <main className="tfm-scroll" style={{ flex: 1, overflow: 'auto', padding: chatChannel ? 0 : '0 0 96px' }}>
        {loading && !d.workspaces.length
          ? <Loading t={t} />
          : orgs.length === 0
            ? <Empty t={t} title="No practice found" sub="You're not a member of any organisation yet." />
            : <>
                {curScreen === 'home' && <HomeScreen {...{ t, views, stats, d, wsColor, orgName, loading, setScreen, setDetailId, setTaskWs }} />}
                {curScreen === 'tasks' && <TasksScreen {...{ t, views, workspaces: d.workspaces, wsById, wsColor, taskWs, setTaskWs, tasksView, setTasksView, filter, setFilter, setDetailId, toggleDone }} />}
                {curScreen === 'detail' && detail && <DetailScreen {...{ t, v: detail, profiles: d.profiles, toggleStep }} />}
                {curScreen === 'calendar' && <CalendarScreen {...{ t, views, calMonth, setCalMonth, setDetailId, setScreen }} />}
                {curScreen === 'team' && <TeamScreen {...{ t, members: d.members, profiles: d.profiles, views, uid, org }} />}
                {curScreen === 'chat' && <ChatScreen {...{ t, orgId, channels: d.channels, profiles: d.profiles, uid, uname, chatChannel, setChatChannel, flash }} />}
                {curScreen === 'notifs' && <NotifsScreen {...{ t, views, anns: d.anns, uid }} />}
                {curScreen === 'profile' && <ProfileScreen {...{ t, uname, uemail, org, dark, toggleDark, doSignOut, openFullApp }} />}
              </>}
      </main>

      {/* FAB */}
      {['home', 'tasks', 'calendar'].includes(curScreen) && (
        <button onClick={() => setAddOpen(true)} style={{
          position: 'absolute', right: 18, bottom: 84, width: 56, height: 56, borderRadius: 19, border: 'none',
          background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', boxShadow: `0 14px 30px ${ACCENT}66`, zIndex: 20,
        }}><Ic d={D.plus} size={26} sw={2.4} /></button>
      )}

      {/* bottom nav */}
      {!chatChannel && <BottomNav t={t} screen={curScreen} go={(s) => { setDetailId(null); setChatChannel(null); setScreen(s) }} />}

      {/* switcher sheet */}
      {switcherOpen && (
        <Sheet t={t} title="Switch practice" onClose={() => setSwitcherOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {orgs.map((o, i) => (
              <button key={o.id} onClick={() => { setOrgId(o.id); setSwitcherOpen(false); setScreen('home'); setFilter('All'); setTaskWs('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', borderRadius: 15, border: `1px solid ${t.glassBd}`, background: t.glass, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <span style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,${PALETTE[i % PALETTE.length]} 14%,white)`, color: PALETTE[i % PALETTE.length], fontWeight: 800, fontSize: 14 }}>{initials(o.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 14, fontWeight: 760, color: t.ink2 }}>{o.name}</b><small style={{ fontSize: 11, color: t.sub2 }}>{o.subscription_status || 'Practice'}</small></span>
                {o.id === orgId && <span style={{ width: 24, height: 24, flex: '0 0 auto', borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.check2} size={14} sw={3.4} stroke="#fff" /></span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {/* add-task sheet */}
      {addOpen && <AddSheet t={t} workspaces={d.workspaces} wsColor={wsColor} onClose={() => setAddOpen(false)} onCreate={createTask} />}

      {toast && (
        <div style={{ position: 'absolute', left: '50%', bottom: 150, transform: 'translateX(-50%)', zIndex: 60, background: '#0b1c2f', color: '#fff', padding: '10px 18px', borderRadius: 12, fontSize: 12.5, fontWeight: 700, boxShadow: '0 12px 30px rgba(11,28,47,.3)', animation: 'tfmFade .2s ease both' }}>{toast}</div>
      )}
    </div>
  )
}

// ── shared chrome ────────────────────────────────────────────────────────────
function HomeHeader({ t, orgName, userInit, onSwitch, onBell, onProfile, hasOrgs }) {
  return (
    <header style={{ padding: '10px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <button onClick={hasOrgs ? onSwitch : undefined} style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, border: 'none', background: 'transparent', cursor: hasOrgs ? 'pointer' : 'default', fontFamily: 'inherit', padding: 0, textAlign: 'left' }}>
        <span style={{ width: 42, height: 42, flex: '0 0 auto', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,${ACCENT} 13%,white)`, color: ACCENT }}><Ic d={D.brief} size={21} sw={1.8} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: t.faint }}>Your practice</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 16.5, fontWeight: 800, letterSpacing: '-.02em', color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>{orgName}{hasOrgs && <Ic d={D.chevD} size={15} sw={2.4} stroke={t.sub2} />}</span>
        </span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <button onClick={onBell} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${t.glassBd}`, background: t.glass, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic d={D.bell} size={19} stroke={t.sub} /></button>
        <button onClick={onProfile} style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,.9)', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: `0 6px 16px ${ACCENT}38` }}>{userInit}</button>
      </div>
    </header>
  )
}

function TopBar({ t, title, showBack, onBack, showBell, onBell }) {
  return (
    <header style={{ padding: '10px 12px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
      {showBack && <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.ink }}><Ic d={D.chevL} size={22} sw={2} /></button>}
      <h1 style={{ flex: 1, margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-.03em', color: t.ink, paddingLeft: 6 }}>{title}</h1>
      {showBell && <button onClick={onBell} style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${t.glassBd}`, background: t.glass, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic d={D.bell} size={19} stroke={t.sub} /></button>}
    </header>
  )
}

function BottomNav({ t, screen, go }) {
  const items = [
    { key: 'home', label: 'Home', d: D.home },
    { key: 'tasks', label: 'Tasks', d: D.list },
    { key: 'calendar', label: 'Plan', d: D.cal },
    { key: 'team', label: 'Team', d: D.team },
    { key: 'chat', label: 'Chat', d: D.chat },
  ]
  return (
    <nav style={{ flex: '0 0 auto', display: 'flex', alignItems: 'stretch', padding: '8px 6px 10px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', background: t.navBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: `1px solid ${t.navBd}`, boxShadow: '0 -6px 22px rgba(20,42,70,.05)' }}>
      {items.map(n => {
        const active = n.key === 'tasks' ? (screen === 'tasks' || screen === 'detail') : screen === n.key
        const stroke = active ? ACCENT : (t === DARK ? '#7d92ad' : '#8ea0b3')
        return (
          <button key={n.key} onClick={() => go(n.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 30, borderRadius: 16, background: active ? `color-mix(in srgb,${ACCENT} 14%,${t === DARK ? '#0e1c30' : 'white'})` : 'transparent' }}><Ic d={n.d} size={22} stroke={stroke} /></span>
            <span style={{ fontSize: 10.5, fontWeight: 750, color: stroke }}>{n.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function Sheet({ t, title, onClose, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(11,28,47,.34)', animation: 'tfmFade .2s ease both' }} />
      <div className="tfm-scroll" style={{ position: 'relative', background: t.sheet, borderRadius: '26px 26px 0 0', padding: '8px 18px 24px', boxShadow: '0 -18px 50px rgba(20,42,70,.24)', animation: 'tfmSheet .32s cubic-bezier(.2,.8,.2,1) both', maxHeight: '86%', overflow: 'auto' }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: t === DARK ? '#2c405a' : '#cdd7e2', margin: '6px auto 16px' }} />
        {title && <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 800, letterSpacing: '-.03em', color: t.ink }}>{title}</h2>}
        {children}
      </div>
    </div>
  )
}

function Loading({ t }) {
  return <div style={{ padding: 60, textAlign: 'center', color: t.sub2, fontSize: 13, fontWeight: 600, animation: 'tfmFade .4s ease both' }}>Loading…</div>
}
function Empty({ t, title, sub }) {
  return <div style={{ padding: '60px 24px', textAlign: 'center' }}><b style={{ display: 'block', fontSize: 15, color: t.ink2, marginBottom: 6 }}>{title}</b><span style={{ fontSize: 12.5, color: t.sub2 }}>{sub}</span></div>
}

// ── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({ t, views, stats, d, wsColor, setScreen, setDetailId, setTaskWs, loading }) {
  const focus = views.find(v => v.overdue) || views.find(v => v.today && !v.done) || views.find(v => !v.done) || null
  const statCards = [
    { label: 'Active', value: stats.active, ink: ACCENT, bg: 'rgba(47,107,255,.10)', d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
    { label: 'Due today', value: stats.dueToday, ink: '#7C3AED', bg: 'rgba(124,58,237,.10)', d: D.clock },
    { label: 'Overdue', value: stats.overdue, ink: '#DC2626', bg: 'rgba(220,38,38,.10)', d: D.warn },
    { label: 'Done this week', value: stats.done, ink: '#0d9488', bg: 'rgba(20,184,166,.12)', d: D.checkCircle },
  ]
  const openByWs = {}; views.forEach(v => { if (!v.done) openByWs[v.workspace_id] = (openByWs[v.workspace_id] || 0) + 1 })
  // recent activity from most recently updated tasks
  const activity = [...views].filter(v => v.updated_at).sort((a, b) => a.updated_at < b.updated_at ? 1 : -1).slice(0, 4)

  return (
    <section style={{ padding: '4px 18px 8px', animation: 'tfmIn .5s cubic-bezier(.2,.8,.2,1) both' }}>
      {focus && (
        <button onClick={() => setDetailId(focus.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 18, border: `1px solid ${t.glassBd}`, background: t === DARK ? 'linear-gradient(135deg,rgba(30,48,74,.9),rgba(24,40,64,.7))' : 'linear-gradient(135deg,rgba(255,255,255,.9),rgba(239,244,255,.72))', cursor: 'pointer', boxShadow: '0 16px 40px rgba(40,68,108,.09)', fontFamily: 'inherit' }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,${ACCENT} 13%,white)`, color: ACCENT }}><Ic d={D.bolt} size={21} /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: t.faint }}>Next up</span>
            <b style={{ fontSize: 14, fontWeight: 750, color: t.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focus.title}</b>
            <span style={{ fontSize: 11.5, color: focus.dueColor, fontWeight: 700 }}>{focus.dueLine}</span>
          </span>
          <Ic d={D.chevR} size={18} sw={2} stroke={t.sub2} />
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 14 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, background: t.card, border: `1px solid ${t.cardBd}`, boxShadow: '0 10px 26px rgba(32,59,93,.05)' }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg, color: s.ink }}><Ic d={s.d} size={18} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <strong style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1, color: t.ink }}>{loading ? '—' : s.value}</strong>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.sub, marginTop: 4 }}>{s.label}</span>
            </span>
          </div>
        ))}
      </div>

      <SectionHead t={t} eyebrow="In this practice" title="Workspaces" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.workspaces.length === 0
          ? <div style={{ padding: 20, borderRadius: 16, background: t.glass, border: `1px solid ${t.glassBd}`, fontSize: 12.5, color: t.sub2, textAlign: 'center' }}>No workspaces in this practice yet.</div>
          : d.workspaces.map(w => {
              const c = wsColor[w.id]
              return (
                <button key={w.id} onClick={() => { setTaskWs(w.id); setScreen('tasks') }} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderRadius: 16, border: `1px solid ${t.glassBd}`, background: t.glass, cursor: 'pointer', boxShadow: '0 10px 26px rgba(35,65,100,.05)', fontFamily: 'inherit' }}>
                  <span style={{ width: 44, height: 44, borderRadius: 13, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,${c} 13%,white)`, color: c, border: `1px solid color-mix(in srgb,${c} 24%,white)`, fontWeight: 800 }}>{initials(w.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <b style={{ fontSize: 14, fontWeight: 760, color: t.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</b>
                    <span style={{ fontSize: 11, color: t.sub2 }}>{w.description || 'Workspace'}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flex: '0 0 auto' }}>
                    <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.03em', color: c }}>{openByWs[w.id] || 0}</b>
                    <span style={{ fontSize: 9.5, color: t.sub2, fontWeight: 600 }}>open</span>
                  </span>
                </button>
              )
            })}
      </div>

      <SectionHead t={t} eyebrow="Live" title="Recent activity" />
      <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}`, boxShadow: '0 10px 26px rgba(35,65,100,.045)' }}>
        {activity.length === 0
          ? <div style={{ padding: 16, fontSize: 12, color: t.sub2, textAlign: 'center' }}>No recent activity.</div>
          : activity.map((a, i) => (
              <div key={a.id} onClick={() => setDetailId(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: i < activity.length - 1 ? `1px solid ${t.line}` : 'none', cursor: 'pointer' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto', background: a.color, boxShadow: `0 0 0 4px color-mix(in srgb,${a.color} 12%,transparent)` }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b style={{ fontSize: 12, fontWeight: 700, color: t.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</b>
                  <small style={{ fontSize: 10.5, color: t.sub2 }}>{a.wsName}{a.done ? ' · done' : ''}</small>
                </span>
                <span style={{ fontSize: 9.5, color: t.sub2, fontWeight: 600, flex: '0 0 auto' }}>{a.due}</span>
              </div>
            ))}
      </div>
    </section>
  )
}
function SectionHead({ t, eyebrow, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '24px 2px 12px' }}>
      <div>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: t.faint, marginBottom: 3 }}>{eyebrow}</div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-.03em', color: t.ink }}>{title}</h2>
      </div>
    </div>
  )
}

// ── TASKS (workspace-scoped, List + Board views) ─────────────────────────────
function TasksScreen({ t, views, workspaces, wsById, wsColor, taskWs, setTaskWs, tasksView, setTasksView, filter, setFilter, setDetailId, toggleDone }) {
  const filters = ['All', 'Today', 'Overdue', 'Mine']
  // 1) scope to the chosen workspace within the practice
  const scoped = taskWs ? views.filter(v => v.workspace_id === taskWs) : views
  // 2) apply the quick filter (list view only; board shows the full workspace)
  const vis = scoped.filter(v => filter === 'All' ? true : filter === 'Today' ? v.today : filter === 'Overdue' ? v.overdue : v.mine)
  const scopeWs = taskWs ? wsById[taskWs] : null
  const showWsChip = !taskWs

  const chip = (on, color) => ({ flex: '0 0 auto', padding: '9px 15px', borderRadius: 12, border: `1px solid ${on ? (color || ACCENT) : (t === DARK ? 'rgba(140,165,200,.18)' : 'rgba(20,42,70,.1)')}`, background: on ? (color || ACCENT) : t.glass, color: on ? '#fff' : t.sub, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 750, cursor: 'pointer', whiteSpace: 'nowrap' })

  return (
    <section style={{ padding: '2px 0 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      {/* workspace scope — separates the practice's boards */}
      <div className="tfm-x" style={{ display: 'flex', gap: 8, padding: '0 18px 12px', overflowX: 'auto' }}>
        <button onClick={() => setTaskWs('')} style={chip(!taskWs)}>All workspaces</button>
        {workspaces.map(w => <button key={w.id} onClick={() => setTaskWs(w.id)} style={chip(taskWs === w.id, wsColor[w.id])}>{w.name}</button>)}
      </div>

      {/* view toggle + (list) filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px 14px' }}>
        <div style={{ display: 'flex', flex: '0 0 auto', padding: 3, borderRadius: 11, background: t.glass, border: `1px solid ${t.glassBd}` }}>
          {[['list', D.list], ['board', 'M4 4h6v16H4zM14 4h6v10h-6z']].map(([mode, d]) => {
            const on = tasksView === mode
            return <button key={mode} onClick={() => setTasksView(mode)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: 'none', background: on ? (t === DARK ? '#22344e' : '#fff') : 'transparent', color: on ? ACCENT : t.sub2, fontFamily: 'inherit', fontSize: 12, fontWeight: 750, cursor: 'pointer', boxShadow: on ? '0 2px 6px rgba(20,42,70,.08)' : 'none', textTransform: 'capitalize' }}><Ic d={d} size={15} sw={2} />{mode}</button>
          })}
        </div>
        {tasksView === 'list' && (
          <div className="tfm-x" style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1, minWidth: 0 }}>
            {filters.map(name => <button key={name} onClick={() => setFilter(name)} style={chip(filter === name)}>{name}</button>)}
          </div>
        )}
      </div>

      {tasksView === 'board'
        ? <BoardView t={t} tasks={scoped} ws={scopeWs} showWsChip={showWsChip} setDetailId={setDetailId} toggleDone={toggleDone} />
        : vis.length === 0
          ? <Empty t={t} title="Nothing here" sub={filter === 'All' ? 'No tasks in this workspace yet.' : `No ${filter.toLowerCase()} tasks.`} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 18px' }}>
              {vis.map(v => <TaskCard key={v.id} t={t} v={v} showWsChip={showWsChip} onOpen={() => setDetailId(v.id)} onToggle={() => toggleDone(v)} />)}
            </div>}
    </section>
  )
}

function BoardView({ t, tasks, ws, showWsChip, setDetailId, toggleDone }) {
  const cols = boardColumns(tasks, ws)
  if (tasks.length === 0) return <Empty t={t} title="Empty board" sub="No tasks in this workspace yet." />
  return (
    <div className="tfm-x" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 18px 4px', alignItems: 'flex-start', scrollSnapType: 'x proximity' }}>
      {cols.map(col => {
        const meta = statusMeta(col)
        const items = tasks.filter(v => (v.status || 'Todo') === col)
        return (
          <div key={col} style={{ flex: '0 0 auto', width: 268, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
              <b style={{ fontSize: 12.5, fontWeight: 800, color: t.ink2, letterSpacing: '-.01em', textTransform: 'capitalize' }}>{meta.label}</b>
              <span style={{ fontSize: 11, fontWeight: 800, color: t.sub2, background: t.glass, border: `1px solid ${t.glassBd}`, borderRadius: 999, padding: '1px 8px' }}>{items.length}</span>
            </div>
            {items.length === 0
              ? <div style={{ padding: 16, borderRadius: 14, border: `1px dashed ${t.cardBd}`, background: 'transparent', fontSize: 11.5, color: t.sub2, textAlign: 'center' }}>No tasks</div>
              : items.map(v => <BoardCard key={v.id} t={t} v={v} meta={meta} showWsChip={showWsChip} onOpen={() => setDetailId(v.id)} onToggle={() => toggleDone(v)} />)}
          </div>
        )
      })}
    </div>
  )
}

function BoardCard({ t, v, meta, showWsChip, onOpen, onToggle }) {
  const priColor = PRI[v.pri]
  return (
    <div onClick={onOpen} style={{ padding: 13, borderRadius: 14, border: `1px solid ${t.glassBd}`, background: t.card, boxShadow: '0 8px 20px rgba(35,65,100,.05)', cursor: 'pointer', borderLeft: `3px solid ${v.color}` }}>
      {showWsChip && <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 6, background: `color-mix(in srgb,${v.color} 13%,white)`, color: v.color, fontSize: 9, fontWeight: 800, marginBottom: 7, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.wsName}</span>}
      <b style={{ fontSize: 13, fontWeight: 750, color: v.done ? '#9aa8b8' : t.ink2, lineHeight: 1.32, textDecoration: v.done ? 'line-through' : 'none', display: 'block' }}>{v.title}</b>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
        <span style={{ padding: '2px 7px', borderRadius: 6, background: priColor + '18', color: priColor, fontSize: 9, fontWeight: 800 }}>{v.pri}</span>
        {v.steps > 0 && <span style={{ fontSize: 10, color: t.sub2, fontWeight: 700 }}>{v.doneSteps}/{v.steps}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, fontWeight: 750, color: v.dueColor }}>{v.due}</span>
      </div>
    </div>
  )
}

function TaskCard({ t, v, showWsChip, onOpen, onToggle }) {
  const priColor = PRI[v.pri]
  const priBg = v.pri === 'High' ? 'rgba(220,38,38,.09)' : v.pri === 'Medium' ? 'rgba(217,119,6,.11)' : 'rgba(13,148,136,.11)'
  const sm = statusMeta(v.status)
  return (
    <div onClick={onOpen} style={{ display: 'flex', gap: 12, padding: 15, borderRadius: 16, border: `1px solid ${t.glassBd}`, background: t.card, boxShadow: '0 12px 28px rgba(35,65,100,.055)', cursor: 'pointer', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <button onClick={(e) => { e.stopPropagation(); onToggle() }} style={{ width: 24, height: 24, flex: '0 0 auto', marginTop: 1, borderRadius: 8, border: `2px solid ${v.done ? ACCENT : 'rgba(93,120,150,.35)'}`, background: v.done ? ACCENT : (t === DARK ? 'transparent' : '#fff'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
        {v.done && <Ic d={D.check2} size={14} sw={3.4} stroke="#fff" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
          {showWsChip && <span style={{ padding: '3px 8px', borderRadius: 7, background: `color-mix(in srgb,${v.color} 13%,white)`, color: v.color, fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.wsName}</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: sm.color + '16', color: sm.color, fontSize: 9.5, fontWeight: 800, textTransform: 'capitalize' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color }} />{sm.label}</span>
          <span style={{ padding: '3px 8px', borderRadius: 7, background: priBg, color: priColor, fontSize: 9.5, fontWeight: 800 }}>{v.pri}</span>
        </div>
        <b style={{ fontSize: 14, fontWeight: 750, color: v.done ? '#9aa8b8' : t.ink2, lineHeight: 1.3, textDecoration: v.done ? 'line-through' : 'none', display: 'block' }}>{v.title}</b>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
          <span style={{ fontSize: 11, color: t.sub2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{v.client || (v.steps ? `${v.doneSteps}/${v.steps} checklist` : v.wsName)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}><Ic d={D.clock} size={13} sw={2} stroke={v.dueColor} /><span style={{ fontSize: 10.5, fontWeight: 750, color: v.dueColor }}>{v.due}</span></span>
        </div>
      </div>
    </div>
  )
}

// ── DETAIL ───────────────────────────────────────────────────────────────────
function DetailScreen({ t, v, profiles, toggleStep }) {
  const priColor = PRI[v.pri]
  const priBg = v.pri === 'High' ? 'rgba(220,38,38,.09)' : v.pri === 'Medium' ? 'rgba(217,119,6,.11)' : 'rgba(13,148,136,.11)'
  const pct = v.steps ? Math.round((v.doneSteps / v.steps) * 100) : 0
  const assignees = v.assigneeIds.map((id, i) => ({ id, i: initials(profiles[id]?.name || profiles[id]?.email || '?'), c: PALETTE[i % PALETTE.length] }))
  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .4s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: `color-mix(in srgb,${v.color} 13%,white)`, color: v.color, fontSize: 10, fontWeight: 800 }}>{v.wsName}</span>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: priBg, color: priColor, fontSize: 10, fontWeight: 800 }}>{v.pri} priority</span>
        {v.done && <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(13,148,136,.12)', color: '#0d9488', fontSize: 10, fontWeight: 800 }}>Done</span>}
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.2, color: t.ink }}>{v.title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}><Ic d={D.clock} size={15} sw={2} stroke={v.dueColor} /><span style={{ fontSize: 13, fontWeight: 750, color: v.dueColor }}>{v.dueLine}</span></div>

      {v.description && <p style={{ margin: '0 0 18px', fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>{v.description}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div style={{ padding: 14, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 6 }}>Client</div>
          <b style={{ fontSize: 13, fontWeight: 750, color: t.ink2 }}>{v.client || '—'}</b>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 6 }}>Assigned</div>
          {assignees.length === 0 ? <b style={{ fontSize: 13, color: t.sub2 }}>Unassigned</b>
            : <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>{assignees.map(a => <span key={a.id} style={{ width: 26, height: 26, borderRadius: '50%', marginLeft: -6, border: '2px solid #fff', background: a.c, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.i}</span>)}</div>}
        </div>
      </div>

      {v.steps > 0 && <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint }}>Checklist · {v.doneSteps}/{v.steps}</div>
          <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(20,42,70,.08)', overflow: 'hidden', marginBottom: 14 }}><div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg,${ACCENT},${ACCENT2})` }} /></div>
        <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 18 }}>
          {v.checkItems.map((st, i) => (
            <button key={i} onClick={() => toggleStep(v, st.i)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', border: 'none', borderBottom: i < v.checkItems.length - 1 ? `1px solid ${t.line}` : 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 22, height: 22, flex: '0 0 auto', borderRadius: 7, border: `2px solid ${st.done ? ACCENT : 'rgba(93,120,150,.3)'}`, background: st.done ? ACCENT : (t === DARK ? 'transparent' : '#fff'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{st.done && <Ic d={D.check2} size={12} sw={3.4} stroke="#fff" />}</span>
              <span style={{ fontSize: 12.5, color: st.done ? '#9aa8b8' : t.ink2, fontWeight: st.done ? 500 : 600, textDecoration: st.done ? 'line-through' : 'none' }}>{st.label}</span>
            </button>
          ))}
        </div>
      </>}
    </section>
  )
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────
function CalendarScreen({ t, views, calMonth, setCalMonth, setDetailId }) {
  const { y, m } = calMonth
  const first = new Date(y, m, 1)
  const startDow = (first.getDay() + 6) % 7 // Mon=0
  const daysIn = new Date(y, m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let dnum = 1; dnum <= daysIn; dnum++) cells.push(dnum)
  const byDate = {}; views.forEach(v => { if (v.due_date && !v.done) (byDate[v.due_date] = byDate[v.due_date] || []).push(v) })
  const tIso = todayISO()
  function cellIso(dnum) { return `${y}-${pad(m + 1)}-${pad(dnum)}` }
  const upcoming = views.filter(v => v.due_date && !v.done && v.due_date >= tIso).sort((a, b) => a.due_date < b.due_date ? -1 : 1).slice(0, 6)

  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <b style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', color: t.ink }}>{MONF[m]} {y}</b>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setCalMonth(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${t.cardBd}`, background: t.card, color: t.sub2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.chevL} size={16} sw={2.2} /></button>
          <button onClick={() => setCalMonth(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${t.cardBd}`, background: t.card, color: t.sub2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.chevR} size={16} sw={2.2} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
        {DOW.map(dn => <div key={dn} style={{ textAlign: 'center', fontSize: 9, fontWeight: 800, color: t.faint, letterSpacing: '.05em' }}>{dn[0]}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 20 }}>
        {cells.map((dnum, i) => {
          if (dnum === null) return <div key={i} />
          const di = cellIso(dnum)
          const has = byDate[di]
          const isToday = di === tIso
          const overdue = has && di < tIso
          return (
            <div key={i} onClick={() => has && setDetailId(has[0].id)} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 11, cursor: has ? 'pointer' : 'default', background: isToday ? `color-mix(in srgb,${ACCENT} 12%,white)` : (has ? t.card : 'transparent'), border: isToday ? `1px solid color-mix(in srgb,${ACCENT} 30%,white)` : `1px solid ${has ? t.cardBd : 'transparent'}` }}>
              <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 700, color: isToday ? ACCENT : t.ink2 }}>{dnum}</span>
              {has && <span style={{ display: 'flex', gap: 2 }}>{has.slice(0, 3).map((v, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: overdue ? '#DC2626' : v.color }} />)}</span>}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 11 }}>Upcoming deadlines</div>
      {upcoming.length === 0
        ? <Empty t={t} title="Nothing scheduled" sub="No upcoming task deadlines." />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map(v => {
              const dt = new Date(v.due_date + 'T00:00:00')
              return (
                <div key={v.id} onClick={() => setDetailId(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', borderRadius: 15, background: t.card, border: `1px solid ${t.cardBd}`, boxShadow: '0 10px 24px rgba(35,65,100,.05)', cursor: 'pointer' }}>
                  <div style={{ width: 46, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 0', borderRadius: 12, background: `color-mix(in srgb,${v.color} 12%,white)` }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: v.color, textTransform: 'uppercase' }}>{MON[dt.getMonth()]}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em', color: v.color, lineHeight: 1 }}>{dt.getDate()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13, fontWeight: 760, color: t.ink2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</b><div style={{ fontSize: 11, color: t.sub2, marginTop: 3 }}>{v.wsName}</div></div>
                  <span style={{ padding: '4px 9px', borderRadius: 8, background: `color-mix(in srgb,${v.color} 12%,white)`, color: v.color, fontSize: 10, fontWeight: 800, flex: '0 0 auto' }}>{v.due}</span>
                </div>
              )
            })}
          </div>}
    </section>
  )
}

// ── TEAM ─────────────────────────────────────────────────────────────────────
function TeamScreen({ t, members, profiles, views, uid }) {
  const loadByUser = {}; views.forEach(v => { if (!v.done) (v.assigneeIds || []).forEach(id => { loadByUser[id] = (loadByUser[id] || 0) + 1 }) })
  const list = members.map((m, i) => {
    const p = profiles[m.user_id] || {}
    return { id: m.user_id, name: p.name || (p.email || '').split('@')[0] || 'Member', role: m.role || 'Member', email: p.email || '', color: PALETTE[i % PALETTE.length], load: loadByUser[m.user_id] || 0, you: m.user_id === uid }
  })
  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <b style={{ fontSize: 13, color: t.sub }}><span style={{ color: t.ink, fontWeight: 800, fontSize: 15 }}>{list.length}</span> member{list.length !== 1 ? 's' : ''}</b>
      </div>
      {list.length === 0
        ? <Empty t={t} title="No teammates yet" sub="Invite people to this practice from the desktop app." />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map(m => {
              const loadInk = m.load > 6 ? '#DC2626' : m.load > 4 ? '#D97706' : '#0d9488'
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', borderRadius: 16, background: t.card, border: `1px solid ${t.cardBd}`, boxShadow: '0 10px 24px rgba(35,65,100,.05)' }}>
                  <span style={{ position: 'relative', width: 44, height: 44, flex: '0 0 auto', borderRadius: '50%', background: `linear-gradient(135deg,${m.color},${PALETTE[(list.indexOf(m) + 2) % PALETTE.length]})`, color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(m.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14, fontWeight: 760, color: t.ink2 }}>{m.name}{m.you && <span style={{ color: t.sub2, fontWeight: 600 }}> · you</span>}</b><div style={{ fontSize: 11, color: t.sub2, marginTop: 2, textTransform: 'capitalize' }}>{m.role}</div></div>
                  <div style={{ textAlign: 'right', flex: '0 0 auto' }}><b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.03em', color: loadInk }}>{m.load}</b><div style={{ fontSize: 9, color: t.sub2, fontWeight: 600 }}>active</div></div>
                </div>
              )
            })}
          </div>}
    </section>
  )
}

// ── CHAT ─────────────────────────────────────────────────────────────────────
function ChatScreen({ t, orgId, channels, profiles, uid, uname, chatChannel, setChatChannel, flash }) {
  if (chatChannel) return <ChatThread t={t} orgId={orgId} channel={chatChannel} profiles={profiles} uid={uid} uname={uname} onBack={() => setChatChannel(null)} flash={flash} />
  const named = channels.filter(c => (c.kind || 'channel') !== 'dm')
  return (
    <section style={{ padding: '2px 12px 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      {named.length === 0
        ? <Empty t={t} title="No channels yet" sub="Create team channels from the desktop app." />
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {named.map(c => (
              <div key={c.id} onClick={() => setChatChannel(c)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 12px', borderRadius: 15, cursor: 'pointer' }}>
                <span style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 14, background: `color-mix(in srgb,${ACCENT} 10%,white)`, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.hash} size={20} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13.5, fontWeight: 750, color: t.ink2 }}>{c.name || 'channel'}</b><div style={{ fontSize: 11.5, color: t.sub2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description || 'Tap to open'}</div></div>
                <Ic d={D.chevR} size={16} sw={2} stroke={t.sub2} />
              </div>
            ))}
          </div>}
    </section>
  )
}
function ChatThread({ t, orgId, channel, profiles, uid, uname, onBack, flash }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const endRef = useRef(null)

  async function load() {
    try {
      const { data } = await supabase.from('team_chat_messages').select('id,sender_id,sender_name,text,created_at').eq('channel_id', channel.id).order('created_at', { ascending: true }).limit(200)
      setMsgs(data || [])
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => {
    load()
    const ch = supabase.channel('tfm_chat_' + channel.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_chat_messages', filter: 'channel_id=eq.' + channel.id }, (p) => {
        setMsgs(prev => prev.some(m => m.id === p.new.id) ? prev : [...prev, p.new])
      }).subscribe()
    return () => { try { supabase.removeChannel(ch) } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  async function send() {
    const body = text.trim(); if (!body) return
    setText('')
    const tmp = { id: 'tmp' + Date.now(), sender_id: uid, sender_name: uname, text: body, created_at: new Date().toISOString() }
    setMsgs(prev => [...prev, tmp])
    try {
      const { error } = await supabase.from('team_chat_messages').insert({ org_id: orgId, channel_id: channel.id, sender_id: uid, sender_name: uname, text: body })
      if (error) throw error
    } catch { flash('Message failed'); setMsgs(prev => prev.filter(m => m.id !== tmp.id)) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 10px', borderBottom: `1px solid ${t.line}` }}>
        <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.ink }}><Ic d={D.chevL} size={22} sw={2} /></button>
        <span style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 11, background: `color-mix(in srgb,${ACCENT} 10%,white)`, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.hash} size={17} /></span>
        <b style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>{channel.name || 'channel'}</b>
      </div>
      <div className="tfm-scroll" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? <Loading t={t} /> : msgs.length === 0 ? <Empty t={t} title="No messages yet" sub="Say hello 👋" /> : msgs.map(mm => {
          const mine = mm.sender_id === uid
          const nm = mm.sender_name || profiles[mm.sender_id]?.name || 'Member'
          return (
            <div key={mm.id} style={{ display: 'flex', gap: 9, flexDirection: mine ? 'row-reverse' : 'row' }}>
              {!mine && <span style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: '50%', background: PALETTE[(nm.charCodeAt(0) || 0) % PALETTE.length], color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(nm)}</span>}
              <div style={{ maxWidth: '74%' }}>
                {!mine && <div style={{ fontSize: 10.5, fontWeight: 700, color: t.sub2, margin: '0 0 3px 3px' }}>{nm}</div>}
                <div style={{ padding: '9px 13px', borderRadius: mine ? '15px 15px 4px 15px' : '15px 15px 15px 4px', background: mine ? ACCENT : t.card, color: mine ? '#fff' : t.ink2, fontSize: 13, lineHeight: 1.45, border: mine ? 'none' : `1px solid ${t.cardBd}` }}>{mm.text}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', gap: 9, padding: '10px 12px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${t.line}`, background: t.navBg }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Message" style={{ flex: 1, padding: '12px 15px', borderRadius: 14, border: `1px solid ${t.cardBd}`, background: t.input, fontFamily: 'inherit', fontSize: 14, color: t.ink2, outline: 'none' }} />
        <button onClick={send} style={{ width: 46, height: 46, flex: '0 0 auto', borderRadius: 14, border: 'none', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic d={D.send} size={20} sw={2} /></button>
      </div>
    </div>
  )
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function NotifsScreen({ t, views, anns, uid }) {
  const today = []
  const earlier = []
  views.filter(v => v.overdue).slice(0, 8).forEach(v => today.push({ d: D.warn, iconBg: 'rgba(220,38,38,.1)', iconInk: '#DC2626', title: `Overdue: ${v.title}`, sub: `${v.wsName} · ${v.dueLine}`, age: v.due }))
  views.filter(v => v.today && !v.overdue && !v.done).slice(0, 8).forEach(v => today.push({ d: D.clock, iconBg: 'rgba(47,107,255,.1)', iconInk: ACCENT, title: `Due today: ${v.title}`, sub: v.wsName, age: 'Today' }))
  views.filter(v => v.mine && !v.done && !v.today && !v.overdue).slice(0, 5).forEach(v => earlier.push({ d: D.at, iconBg: 'rgba(124,58,237,.1)', iconInk: '#7C3AED', title: `Assigned to you: ${v.title}`, sub: v.wsName, age: v.due }))
  ;(anns || []).forEach(a => earlier.push({ d: D.mega, iconBg: 'rgba(217,119,6,.12)', iconInk: '#D97706', title: a.title, sub: a.body || '', age: a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '' }))

  const groups = [{ label: 'Today', items: today }, { label: 'Earlier', items: earlier }].filter(g => g.items.length)
  if (!groups.length) return <Empty t={t} title="You're all caught up" sub="No new notifications." />
  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      {groups.map(g => (
        <div key={g.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 10 }}>{g.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {g.items.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 15, background: t.card, border: `1px solid ${t.cardBd}` }}>
                <span style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: 11, background: n.iconBg, color: n.iconInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={n.d} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 12.5, fontWeight: 750, color: t.ink2, lineHeight: 1.35, display: 'block' }}>{n.title}</b>{n.sub && <div style={{ fontSize: 11, color: t.sub2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.sub}</div>}</div>
                {n.age && <span style={{ fontSize: 9.5, color: t.sub2, fontWeight: 600, flex: '0 0 auto' }}>{n.age}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

// ── PROFILE ──────────────────────────────────────────────────────────────────
function ProfileScreen({ t, uname, uemail, org, dark, toggleDark, doSignOut, openFullApp }) {
  const [prefs, setPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('tf_mobile_prefs') || '{}') } catch { return {} } })
  function setPref(k, v) { const nx = { ...prefs, [k]: v }; setPrefs(nx); try { localStorage.setItem('tf_mobile_prefs', JSON.stringify(nx)) } catch {} }
  const plan = org?.subscription_status || 'Free'
  const toggles = [
    { key: 'notif', label: 'Push notifications', sub: 'Deadlines, mentions, approvals', d: D.bell, on: prefs.notif !== false, set: v => setPref('notif', v) },
    { key: 'biometric', label: 'Biometric lock', sub: 'Require fingerprint to open', d: D.lock, on: !!prefs.biometric, set: v => setPref('biometric', v) },
    { key: 'dark', label: 'Dark mode', sub: 'Match the app theme', d: D.moon, on: dark, set: toggleDark },
  ]
  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: 20, borderRadius: 20, background: t === DARK ? 'linear-gradient(135deg,rgba(30,48,74,.9),rgba(24,40,64,.7))' : 'linear-gradient(135deg,rgba(255,255,255,.9),rgba(239,244,255,.72))', border: `1px solid ${t.glassBd}`, boxShadow: '0 16px 40px rgba(40,68,108,.08)', marginBottom: 16 }}>
        <span style={{ width: 60, height: 60, flex: '0 0 auto', borderRadius: '50%', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 24px ${ACCENT}3d` }}>{initials(uname)}</span>
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: t.ink }}>{uname}</b><div style={{ fontSize: 12, color: t.sub, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uemail}</div>{org && <div style={{ fontSize: 11, color: t.sub2, marginTop: 4 }}>{org.name}</div>}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 16, background: `linear-gradient(135deg,rgba(47,107,255,.1),rgba(20,199,192,.08))`, border: '1px solid rgba(47,107,255,.16)', marginBottom: 18 }}>
        <span style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: 12, background: '#fff', color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.shield} size={20} sw={1.8} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13.5, fontWeight: 800, color: t.ink2, textTransform: 'capitalize' }}>{plan} plan</b><div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{org ? org.name : 'Your subscription'}</div></div>
      </div>

      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 10 }}>Preferences</div>
      <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 18 }}>
        {toggles.map((o, i) => (
          <button key={o.key} onClick={() => o.set(!o.on)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: 15, border: 'none', borderBottom: i < toggles.length - 1 ? `1px solid ${t.line}` : 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ width: 36, height: 36, flex: '0 0 auto', borderRadius: 11, background: 'rgba(47,107,255,.08)', color: t.sub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={o.d} size={18} sw={1.8} /></span>
            <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 13, fontWeight: 750, color: t.ink2 }}>{o.label}</b><small style={{ fontSize: 10.5, color: t.sub2 }}>{o.sub}</small></span>
            <span style={{ width: 44, height: 26, flex: '0 0 auto', borderRadius: 13, background: o.on ? ACCENT : (t === DARK ? '#2c405a' : '#d4dde6'), position: 'relative', transition: 'background .2s' }}><span style={{ position: 'absolute', top: 3, left: o.on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,.2)', transition: 'left .2s' }} /></span>
          </button>
        ))}
      </div>

      <button onClick={openFullApp} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, border: `1px solid ${t.cardBd}`, background: t.card, color: t.ink2, fontFamily: 'inherit', fontSize: 13, fontWeight: 750, cursor: 'pointer', marginBottom: 12 }}><Ic d={D.external} size={17} sw={1.9} />Open full desktop app</button>
      <button onClick={doSignOut} style={{ width: '100%', padding: 14, borderRadius: 14, border: '1px solid rgba(220,38,38,.2)', background: 'rgba(220,38,38,.05)', color: '#DC2626', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Ic d={D.logout} size={17} sw={1.9} />Sign out</button>
    </section>
  )
}

// ── ADD-TASK SHEET ────────────────────────────────────────────────────────────
function AddSheet({ t, workspaces, wsColor, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [wsId, setWsId] = useState(workspaces[0]?.id || '')
  const [priority, setPriority] = useState('Medium')
  return (
    <Sheet t={t} title="New task" onClose={onClose}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, marginBottom: 7 }}>Title</label>
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="e.g. File GSTR-3B — September" style={{ width: '100%', padding: '14px 15px', borderRadius: 13, border: '1px solid rgba(47,107,255,.2)', background: t.input, fontFamily: 'inherit', fontSize: 14, color: t.ink2, outline: 'none', boxSizing: 'border-box' }} />

      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, margin: '16px 0 7px' }}>Practice</label>
      {workspaces.length === 0
        ? <div style={{ fontSize: 12.5, color: t.sub2 }}>No workspaces available. Create one in the desktop app first.</div>
        : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {workspaces.map(w => { const c = wsColor[w.id]; const on = wsId === w.id; return (
              <button key={w.id} onClick={() => setWsId(w.id)} style={{ padding: '9px 14px', borderRadius: 11, border: `1px solid ${on ? c : `color-mix(in srgb,${c} 24%,white)`}`, background: on ? c : `color-mix(in srgb,${c} 12%,white)`, color: on ? '#fff' : c, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}>{w.name}</button>
            )})}
          </div>}

      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, margin: '16px 0 7px' }}>Priority</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {['High', 'Medium', 'Low'].map(name => { const c = PRI[name]; const on = priority === name; return (
          <button key={name} onClick={() => setPriority(name)} style={{ flex: 1, padding: 10, borderRadius: 11, border: `1px solid ${on ? c : (t === DARK ? 'rgba(140,165,200,.18)' : 'rgba(20,42,70,.12)')}`, background: on ? c : t.glass, color: on ? '#fff' : c, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}>{name}</button>
        )})}
      </div>

      <div style={{ display: 'flex', gap: 11, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: '0 0 auto', padding: '14px 20px', borderRadius: 14, border: `1px solid ${t.cardBd}`, background: t.input, color: t.sub, fontFamily: 'inherit', fontSize: 14, fontWeight: 750, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onCreate({ title, wsId, priority })} disabled={!wsId} style={{ flex: 1, padding: 14, borderRadius: 14, border: 'none', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: wsId ? 'pointer' : 'not-allowed', opacity: wsId ? 1 : 0.6, boxShadow: `0 12px 26px ${ACCENT}30` }}>Create task</button>
      </div>
    </Sheet>
  )
}
