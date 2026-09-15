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

// ── WorkZone (ERP worksheet_rows) status — derived from stage position ────────
const WR_STATUS = {
  pending: { key: 'pending', label: 'Pending', color: '#6b7c93' },
  in_progress: { key: 'in_progress', label: 'In Progress', color: '#D97706' },
  completed: { key: 'completed', label: 'Completed', color: '#0d9488' },
}
const WR_ORDER = ['pending', 'in_progress', 'completed']
function wrEffectiveStatus(row, wshMap, cfgMap) {
  if (row.completed) return 'completed'
  const wsh = wshMap[row.worksheet_id]
  const cfg = wsh ? cfgMap[wsh.work_type] : null
  const stages = cfg && Array.isArray(cfg.stages) && cfg.stages.length ? cfg.stages : null
  if (!stages) {
    const s = String(row.status || 'pending').toLowerCase()
    if (DONE_RE.test(s)) return 'completed'
    if (PROG_RE.test(s)) return 'in_progress'
    return 'pending'
  }
  if (!row.current_stage) return 'pending'
  const idx = stages.findIndex(s => s.key === row.current_stage)
  if (idx < 0) return 'pending'
  if (idx === stages.length - 1) return 'completed'
  if (idx === 0) return 'pending'
  return 'in_progress'
}
function wrStageLabel(row, wshMap, cfgMap) {
  const wsh = wshMap[row.worksheet_id]
  const cfg = wsh ? cfgMap[wsh.work_type] : null
  const stages = cfg && Array.isArray(cfg.stages) ? cfg.stages : []
  const st = stages.find(s => s.key === row.current_stage)
  return st ? (st.label || st.name || st.key) : ''
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
  const [taskWs, setTaskWs] = useState('')          // Kanban workspace id (wstasks sub-screen)
  const [tasksView, setTasksView] = useState('list') // 'list' | 'board' (Kanban)
  const [workDetailId, setWorkDetailId] = useState(null) // open WorkZone (worksheet_row) id
  const [workFilter, setWorkFilter] = useState('')  // '' = all work types
  const [workView, setWorkView] = useState('list')  // 'list' | 'board' (WorkZone)
  const [teamTab, setTeamTab] = useState('members') // 'members' | 'attendance' | 'time'
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })

  // data
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState(() => { try { return localStorage.getItem('tf_mobile_orgId') || '' } catch { return '' } })
  const [d, setD] = useState({ workspaces: [], tasks: [], members: [], profiles: {}, clients: 0, clientMap: {}, anns: [], channels: [], worksheets: [], cfgs: [], rows: [], logs: [], punches: [], leave: [] })
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
      let clientMap = {}
      try {
        const cl = await supabase.from('clients').select('id,name,display_name').eq('org_id', orgId).limit(4000)
        ;(cl.data || []).forEach(c => { clientMap[c.id] = c.display_name || c.name })
        clients = (cl.data || []).length
      } catch {}
      try { const ar = await supabase.from('announcements').select('*').eq('active', true).order('published_at', { ascending: false }).limit(6); anns = ar.data || [] } catch {}
      try { const chr = await supabase.from('team_chat_channels').select('id,name,kind,dm_key,sort_order').eq('org_id', orgId).order('sort_order'); channels = chr.data || [] } catch {}

      // WorkZone (ERP) — the firm's real compliance work
      let worksheets = [], cfgs = [], rows = []
      try {
        const [wsh, cf] = await Promise.all([
          supabase.from('worksheets').select('id,work_type,period_label,period_year,period_month,frequency').eq('org_id', orgId).limit(3000),
          supabase.from('work_type_configs').select('name,stages,is_itr_worktype,sort_order').eq('org_id', orgId).order('sort_order'),
        ])
        worksheets = wsh.data || []; cfgs = cf.data || []
        const rr = await supabase.from('worksheet_rows')
          .select('id,worksheet_id,client_id,data,status,due_date,current_stage,completed,completed_at,created_at')
          .eq('org_id', orgId).is('archived_at', null).limit(4000)
        rows = rr.data || []
      } catch {}

      // Practice Hub — attendance, time logs, leave (current user)
      let logs = [], punches = [], leave = []
      try { const lg = await supabase.from('attendance_time_logs').select('id,date,client_id,work_type,hours,minutes,notes,worksheet_row_id,created_at').eq('org_id', orgId).eq('user_id', uid).order('date', { ascending: false }).limit(100); logs = lg.data || [] } catch {}
      try { const pu = await supabase.from('attendance_punches').select('id,punch_type,punched_at,address,note').eq('org_id', orgId).eq('user_id', uid).order('punched_at', { ascending: false }).limit(50); punches = pu.data || [] } catch {}
      try { const lv = await supabase.from('leave_requests').select('id,leave_type,start_date,end_date,days,reason,status,created_at').eq('org_id', orgId).eq('user_id', uid).order('created_at', { ascending: false }).limit(20); leave = lv.data || [] } catch {}

      const next = { workspaces, tasks, members, profiles, clients, clientMap, anns, channels, worksheets, cfgs, rows, logs, punches, leave }
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

  // ── WorkZone (ERP) derived ─────────────────────────────────────────────────
  const wshById = useMemo(() => Object.fromEntries((d.worksheets || []).map(w => [w.id, w])), [d.worksheets])
  const cfgByType = useMemo(() => Object.fromEntries((d.cfgs || []).map(c => [c.name, c])), [d.cfgs])
  const workTypeColor = useMemo(() => { const m = {}; (d.cfgs || []).forEach((c, i) => { m[c.name] = PALETTE[i % PALETTE.length] }); return m }, [d.cfgs])
  const wrViews = useMemo(() => (d.rows || []).map(row => {
    const wsh = wshById[row.worksheet_id]
    const workType = wsh?.work_type || 'Work'
    const data = row.data && typeof row.data === 'object' ? row.data : {}
    const key = wrEffectiveStatus(row, wshById, cfgByType)
    const done = key === 'completed'
    const di = dueInfo(row.due_date)
    const cl = checklistOf({ checklist: Array.isArray(data.__checklist) ? data.__checklist : [] })
    const clientName = d.clientMap?.[row.client_id] || ''
    const assignee = data.__assignee || ''
    return {
      id: row.id, row, workType, period: wsh?.period_label || '',
      title: data.__title || clientName || workType,
      client: clientName, clientId: row.client_id,
      statusKey: key, statusMeta: WR_STATUS[key], stage: wrStageLabel(row, wshById, cfgByType),
      pri: normPriority(data.__priority), assignee, mine: !!assignee && assignee === uid,
      description: data.__description || '',
      steps: cl.total, doneSteps: cl.done, checkItems: cl.items,
      due: di.text, dueLine: di.line, overdue: di.overdue && !done, today: di.today && !done, done,
      due_date: row.due_date, color: workTypeColor[workType] || ACCENT,
      dueColor: (di.overdue && !done) ? '#DC2626' : (di.today ? ACCENT : t.sub2),
    }
  }), [d.rows, wshById, cfgByType, workTypeColor, d.clientMap, uid, t.sub2])

  const wrStats = useMemo(() => {
    const active = wrViews.filter(v => !v.done)
    return { active: active.length, dueToday: active.filter(v => v.today).length, overdue: active.filter(v => v.overdue).length, done: wrViews.filter(v => v.done).length }
  }, [wrViews])
  const workTypes = useMemo(() => { const s = []; wrViews.forEach(v => { if (!s.includes(v.workType)) s.push(v.workType) }); return s }, [wrViews])

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
      setAddOpen(false); setScreen('wstasks'); setDetailId(null); flash('Task created')
    } catch { flash('Could not create task') }
  }

  // WorkZone checklist toggle (writes back into data.__checklist)
  async function wrToggleStep(v, idx) {
    const data = (v.row.data && typeof v.row.data === 'object') ? { ...v.row.data } : {}
    const cur = Array.isArray(data.__checklist) ? data.__checklist : []
    data.__checklist = cur.map((it, i) => {
      if (i !== idx) return it
      if (typeof it === 'string') return { text: it, done: true }
      const done = !(it.done ?? it.checked ?? it.completed)
      return { ...it, done, checked: done, completed: done }
    })
    setD(prev => { const nx = { ...prev, rows: prev.rows.map(r => r.id === v.id ? { ...r, data } : r) }; _mCache[orgId] = nx; return nx })
    try { await supabase.from('worksheet_rows').update({ data }).eq('id', v.id) } catch { flash('Could not update'); loadOrg() }
  }
  async function wrToggleComplete(v) {
    const done = !v.done
    const completed_at = done ? new Date().toISOString() : null
    setD(prev => { const nx = { ...prev, rows: prev.rows.map(r => r.id === v.id ? { ...r, completed: done, completed_at } : r) }; _mCache[orgId] = nx; return nx })
    try { await supabase.from('worksheet_rows').update({ completed: done, completed_at }).eq('id', v.id) } catch { flash('Could not update'); loadOrg() }
  }

  // Attendance punch (optionally with geolocation)
  async function punch(type) {
    const base = { org_id: orgId, user_id: uid, punch_type: type, punched_at: new Date().toISOString() }
    const insert = async (extra) => {
      try {
        const { data, error } = await supabase.from('attendance_punches').insert({ ...base, ...extra }).select().single()
        if (error) throw error
        setD(prev => { const nx = { ...prev, punches: [data, ...prev.punches] }; _mCache[orgId] = nx; return nx })
        flash(type === 'in' ? 'Punched in' : 'Punched out')
      } catch { flash('Punch failed') }
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => insert({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => insert({}), { timeout: 6000 })
    } else insert({})
  }

  async function addTimeLog({ work_type, hours, minutes, notes, client_id }) {
    const payload = { org_id: orgId, user_id: uid, date: todayISO(), work_type: work_type || null, hours: Number(hours) || 0, minutes: Number(minutes) || 0, notes: notes || null, client_id: client_id || null }
    try {
      const { data, error } = await supabase.from('attendance_time_logs').insert(payload).select().single()
      if (error) throw error
      setD(prev => { const nx = { ...prev, logs: [data, ...prev.logs] }; _mCache[orgId] = nx; return nx })
      flash('Time logged')
    } catch { flash('Could not log time') }
  }

  async function doSignOut() { try { await signOut() } catch {} window.location.reload() }
  function openFullApp() { try { sessionStorage.setItem('tf_mobile_off', '1') } catch {} window.location.reload() }
  function toggleDark() {
    const nv = !dark; setDark(nv)
    try { localStorage.setItem('tfc-theme', nv ? 'dark' : 'light'); document.documentElement.setAttribute('data-theme', nv ? 'dark' : 'light') } catch {}
  }

  const detail = detailId ? views.find(v => v.id === detailId) : null
  const workDetail = workDetailId ? wrViews.find(v => v.id === workDetailId) : null
  const curScreen = workDetail ? 'workdetail' : detail ? 'detail' : screen

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
            title={curScreen === 'wstasks' ? (wsById[taskWs]?.name || 'Workspace')
              : { work: 'Work', workdetail: 'Work', detail: 'Task', calendar: 'Calendar', team: 'Team', chat: 'Messages', notifs: 'Notifications', profile: 'Profile' }[curScreen] || ''}
            showBack={['workdetail', 'detail', 'wstasks', 'notifs', 'profile'].includes(curScreen)}
            onBack={() => { if (workDetail) setWorkDetailId(null); else if (detail) setDetailId(null); else setScreen('home') }}
            showBell={['work', 'calendar', 'team', 'chat', 'wstasks'].includes(curScreen)}
            onBell={() => setScreen('notifs')} />}

      {/* body */}
      <main className="tfm-scroll" style={{ flex: 1, overflow: 'auto', padding: chatChannel ? 0 : '0 0 96px' }}>
        {loading && !d.rows.length && !d.workspaces.length
          ? <Loading t={t} />
          : orgs.length === 0
            ? <Empty t={t} title="No practice found" sub="You're not a member of any organisation yet." />
            : <>
                {curScreen === 'home' && <HomeScreen {...{ t, wrViews, wrStats, d, wsColor, loading, setScreen, setWorkDetailId, setTaskWs }} />}
                {curScreen === 'work' && <WorkScreen {...{ t, wrViews, workTypes, workFilter, setWorkFilter, workView, setWorkView, setWorkDetailId }} />}
                {curScreen === 'workdetail' && workDetail && <WorkDetailScreen {...{ t, v: workDetail, profiles: d.profiles, wrToggleStep, wrToggleComplete }} />}
                {curScreen === 'wstasks' && <TasksScreen {...{ t, views, workspaces: d.workspaces, wsById, wsColor, taskWs, setTaskWs, tasksView, setTasksView, filter, setFilter, setDetailId, toggleDone }} />}
                {curScreen === 'detail' && detail && <DetailScreen {...{ t, v: detail, profiles: d.profiles, toggleStep }} />}
                {curScreen === 'calendar' && <CalendarScreen {...{ t, views: wrViews, calMonth, setCalMonth, openDetail: setWorkDetailId }} />}
                {curScreen === 'team' && <TeamScreen {...{ t, teamTab, setTeamTab, members: d.members, profiles: d.profiles, wrViews, uid, org, punches: d.punches, logs: d.logs, leave: d.leave, clientMap: d.clientMap, workTypes, punch, addTimeLog }} />}
                {curScreen === 'chat' && <ChatScreen {...{ t, orgId, channels: d.channels, profiles: d.profiles, uid, uname, chatChannel, setChatChannel, flash }} />}
                {curScreen === 'notifs' && <NotifsScreen {...{ t, views: wrViews, anns: d.anns, uid }} />}
                {curScreen === 'profile' && <ProfileScreen {...{ t, uname, uemail, org, dark, toggleDark, doSignOut, openFullApp }} />}
              </>}
      </main>

      {/* FAB — add a Kanban task inside a workspace board */}
      {curScreen === 'wstasks' && (
        <button onClick={() => setAddOpen(true)} style={{
          position: 'absolute', right: 18, bottom: 84, width: 56, height: 56, borderRadius: 19, border: 'none',
          background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', boxShadow: `0 14px 30px ${ACCENT}66`, zIndex: 20,
        }}><Ic d={D.plus} size={26} sw={2.4} /></button>
      )}

      {/* bottom nav */}
      {!chatChannel && <BottomNav t={t} screen={curScreen} go={(s) => { setDetailId(null); setWorkDetailId(null); setChatChannel(null); setScreen(s) }} />}

      {/* switcher sheet */}
      {switcherOpen && (
        <Sheet t={t} title="Switch practice" onClose={() => setSwitcherOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {orgs.map((o, i) => (
              <button key={o.id} onClick={() => { setOrgId(o.id); setSwitcherOpen(false); setScreen('home'); setFilter('All'); setTaskWs(''); setWorkFilter(''); setWorkDetailId(null); setDetailId(null) }}
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
    { key: 'work', label: 'Work', d: D.brief },
    { key: 'calendar', label: 'Plan', d: D.cal },
    { key: 'team', label: 'Team', d: D.team },
    { key: 'chat', label: 'Chat', d: D.chat },
  ]
  return (
    <nav style={{ flex: '0 0 auto', display: 'flex', alignItems: 'stretch', padding: '8px 6px 10px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', background: t.navBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: `1px solid ${t.navBd}`, boxShadow: '0 -6px 22px rgba(20,42,70,.05)' }}>
      {items.map(n => {
        const active = n.key === 'work' ? (screen === 'work' || screen === 'workdetail') : screen === n.key
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

// ── HOME (practice overview — WorkZone stats + Kanban workspaces) ─────────────
function HomeScreen({ t, wrViews, wrStats, d, wsColor, setScreen, setWorkDetailId, setTaskWs, loading }) {
  const focus = wrViews.find(v => v.overdue) || wrViews.find(v => v.today) || wrViews.find(v => !v.done) || null
  const statCards = [
    { label: 'Active', value: wrStats.active, ink: ACCENT, bg: 'rgba(47,107,255,.10)', d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
    { label: 'Due today', value: wrStats.dueToday, ink: '#7C3AED', bg: 'rgba(124,58,237,.10)', d: D.clock },
    { label: 'Overdue', value: wrStats.overdue, ink: '#DC2626', bg: 'rgba(220,38,38,.10)', d: D.warn },
    { label: 'Completed', value: wrStats.done, ink: '#0d9488', bg: 'rgba(20,184,166,.12)', d: D.checkCircle },
  ]
  const openByWs = {}; d.tasks.forEach(tk => { if (!isDone(tk)) openByWs[tk.workspace_id] = (openByWs[tk.workspace_id] || 0) + 1 })
  // recent WorkZone activity (most recent rows)
  const activity = [...wrViews].sort((a, b) => (a.row.created_at < b.row.created_at ? 1 : -1)).slice(0, 4)

  return (
    <section style={{ padding: '4px 18px 8px', animation: 'tfmIn .5s cubic-bezier(.2,.8,.2,1) both' }}>
      {focus && (
        <button onClick={() => setWorkDetailId(focus.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 18, border: `1px solid ${t.glassBd}`, background: t === DARK ? 'linear-gradient(135deg,rgba(30,48,74,.9),rgba(24,40,64,.7))' : 'linear-gradient(135deg,rgba(255,255,255,.9),rgba(239,244,255,.72))', cursor: 'pointer', boxShadow: '0 16px 40px rgba(40,68,108,.09)', fontFamily: 'inherit' }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb,${ACCENT} 13%,white)`, color: ACCENT }}><Ic d={D.bolt} size={21} /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: t.faint }}>Next up · {focus.workType}</span>
            <b style={{ fontSize: 14, fontWeight: 750, color: t.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focus.title}</b>
            <span style={{ fontSize: 11.5, color: focus.dueColor, fontWeight: 700 }}>{focus.dueLine}</span>
          </span>
          <Ic d={D.chevR} size={18} sw={2} stroke={t.sub2} />
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 14 }}>
        {statCards.map((s, i) => (
          <button key={i} onClick={() => setScreen('work')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, background: t.card, border: `1px solid ${t.cardBd}`, boxShadow: '0 10px 26px rgba(32,59,93,.05)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg, color: s.ink }}><Ic d={s.d} size={18} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <strong style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1, color: t.ink }}>{loading ? '—' : s.value}</strong>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.sub, marginTop: 4 }}>{s.label}</span>
            </span>
          </button>
        ))}
      </div>

      <button onClick={() => setScreen('work')} style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 14, border: `1px solid ${t.glassBd}`, background: t.glass, color: ACCENT, fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}><Ic d={D.brief} size={17} sw={1.9} />Open WorkZone</button>

      <SectionHead t={t} eyebrow="Kanban" title="Workspaces" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.workspaces.length === 0
          ? <div style={{ padding: 20, borderRadius: 16, background: t.glass, border: `1px solid ${t.glassBd}`, fontSize: 12.5, color: t.sub2, textAlign: 'center' }}>No workspaces in this practice yet.</div>
          : d.workspaces.map(w => {
              const c = wsColor[w.id]
              return (
                <button key={w.id} onClick={() => { setTaskWs(w.id); setScreen('wstasks') }} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderRadius: 16, border: `1px solid ${t.glassBd}`, background: t.glass, cursor: 'pointer', boxShadow: '0 10px 26px rgba(35,65,100,.05)', fontFamily: 'inherit' }}>
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

      <SectionHead t={t} eyebrow="Live" title="Recent work" />
      <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}`, boxShadow: '0 10px 26px rgba(35,65,100,.045)' }}>
        {activity.length === 0
          ? <div style={{ padding: 16, fontSize: 12, color: t.sub2, textAlign: 'center' }}>No recent work.</div>
          : activity.map((a, i) => (
              <div key={a.id} onClick={() => setWorkDetailId(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: i < activity.length - 1 ? `1px solid ${t.line}` : 'none', cursor: 'pointer' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto', background: a.statusMeta.color, boxShadow: `0 0 0 4px color-mix(in srgb,${a.statusMeta.color} 14%,transparent)` }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <b style={{ fontSize: 12, fontWeight: 700, color: t.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</b>
                  <small style={{ fontSize: 10.5, color: t.sub2 }}>{a.workType} · {a.statusMeta.label}</small>
                </span>
                <span style={{ fontSize: 9.5, color: t.sub2, fontWeight: 600, flex: '0 0 auto' }}>{a.done ? '' : a.due}</span>
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

// ── WORK (WorkZone / ERP worksheet_rows — the firm's real compliance work) ────
function WorkScreen({ t, wrViews, workTypes, workFilter, setWorkFilter, workView, setWorkView, setWorkDetailId }) {
  const scoped = workFilter ? wrViews.filter(v => v.workType === workFilter) : wrViews
  const chip = (on, color) => ({ flex: '0 0 auto', padding: '9px 15px', borderRadius: 12, border: `1px solid ${on ? (color || ACCENT) : (t === DARK ? 'rgba(140,165,200,.18)' : 'rgba(20,42,70,.1)')}`, background: on ? (color || ACCENT) : t.glass, color: on ? '#fff' : t.sub, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 750, cursor: 'pointer', whiteSpace: 'nowrap' })
  return (
    <section style={{ padding: '2px 0 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <div className="tfm-x" style={{ display: 'flex', gap: 8, padding: '0 18px 12px', overflowX: 'auto' }}>
        <button onClick={() => setWorkFilter('')} style={chip(!workFilter)}>All work types</button>
        {workTypes.map(wt => <button key={wt} onClick={() => setWorkFilter(wt)} style={chip(workFilter === wt)}>{wt}</button>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px 14px' }}>
        <div style={{ display: 'flex', flex: '0 0 auto', padding: 3, borderRadius: 11, background: t.glass, border: `1px solid ${t.glassBd}` }}>
          {[['list', D.list], ['board', 'M4 4h6v16H4zM14 4h6v10h-6z']].map(([mode, dd]) => {
            const on = workView === mode
            return <button key={mode} onClick={() => setWorkView(mode)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: 'none', background: on ? (t === DARK ? '#22344e' : '#fff') : 'transparent', color: on ? ACCENT : t.sub2, fontFamily: 'inherit', fontSize: 12, fontWeight: 750, cursor: 'pointer', boxShadow: on ? '0 2px 6px rgba(20,42,70,.08)' : 'none', textTransform: 'capitalize' }}><Ic d={dd} size={15} sw={2} />{mode}</button>
          })}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: t.sub2 }}>{scoped.filter(v => !v.done).length} open</span>
      </div>

      {workView === 'board'
        ? <WorkBoard t={t} rows={scoped} showType={!workFilter} setWorkDetailId={setWorkDetailId} />
        : scoped.length === 0
          ? <Empty t={t} title="No work here" sub={workFilter ? `No ${workFilter} work yet.` : 'No WorkZone tasks for this practice yet.'} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 18px' }}>
              {scoped.map(v => <WorkCard key={v.id} t={t} v={v} showType={!workFilter} onOpen={() => setWorkDetailId(v.id)} />)}
            </div>}
    </section>
  )
}
function WorkCard({ t, v, showType, onOpen }) {
  const priColor = PRI[v.pri]
  return (
    <div onClick={onOpen} style={{ display: 'flex', gap: 12, padding: 15, borderRadius: 16, border: `1px solid ${t.glassBd}`, background: t.card, boxShadow: '0 12px 28px rgba(35,65,100,.055)', cursor: 'pointer', borderLeft: `3px solid ${v.color}`, animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
          {showType && <span style={{ padding: '3px 8px', borderRadius: 7, background: `color-mix(in srgb,${v.color} 13%,white)`, color: v.color, fontSize: 9.5, fontWeight: 800, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.workType}</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: v.statusMeta.color + '16', color: v.statusMeta.color, fontSize: 9.5, fontWeight: 800 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: v.statusMeta.color }} />{v.stage || v.statusMeta.label}</span>
          {v.pri === 'High' && <span style={{ padding: '3px 8px', borderRadius: 7, background: 'rgba(220,38,38,.09)', color: priColor, fontSize: 9.5, fontWeight: 800 }}>High</span>}
        </div>
        <b style={{ fontSize: 14, fontWeight: 750, color: v.done ? '#9aa8b8' : t.ink2, lineHeight: 1.3, textDecoration: v.done ? 'line-through' : 'none', display: 'block' }}>{v.title}</b>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
          <span style={{ fontSize: 11, color: t.sub2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{v.client || v.period || v.workType}</span>
          {v.due_date && !v.done && <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}><Ic d={D.clock} size={13} sw={2} stroke={v.dueColor} /><span style={{ fontSize: 10.5, fontWeight: 750, color: v.dueColor }}>{v.due}</span></span>}
        </div>
      </div>
      <Ic d={D.chevR} size={16} sw={2} stroke={t.sub2} />
    </div>
  )
}
function WorkBoard({ t, rows, showType, setWorkDetailId }) {
  if (rows.length === 0) return <Empty t={t} title="Empty board" sub="No WorkZone tasks yet." />
  return (
    <div className="tfm-x" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 18px 4px', alignItems: 'flex-start', scrollSnapType: 'x proximity' }}>
      {WR_ORDER.map(key => {
        const meta = WR_STATUS[key]
        const items = rows.filter(v => v.statusKey === key)
        return (
          <div key={key} style={{ flex: '0 0 auto', width: 268, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
              <b style={{ fontSize: 12.5, fontWeight: 800, color: t.ink2 }}>{meta.label}</b>
              <span style={{ fontSize: 11, fontWeight: 800, color: t.sub2, background: t.glass, border: `1px solid ${t.glassBd}`, borderRadius: 999, padding: '1px 8px' }}>{items.length}</span>
            </div>
            {items.length === 0
              ? <div style={{ padding: 16, borderRadius: 14, border: `1px dashed ${t.cardBd}`, fontSize: 11.5, color: t.sub2, textAlign: 'center' }}>No tasks</div>
              : items.map(v => (
                  <div key={v.id} onClick={() => setWorkDetailId(v.id)} style={{ padding: 13, borderRadius: 14, border: `1px solid ${t.glassBd}`, background: t.card, boxShadow: '0 8px 20px rgba(35,65,100,.05)', cursor: 'pointer', borderLeft: `3px solid ${v.color}` }}>
                    {showType && <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 6, background: `color-mix(in srgb,${v.color} 13%,white)`, color: v.color, fontSize: 9, fontWeight: 800, marginBottom: 7, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.workType}</span>}
                    <b style={{ fontSize: 13, fontWeight: 750, color: t.ink2, lineHeight: 1.32, display: 'block' }}>{v.title}</b>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                      <span style={{ fontSize: 10.5, color: t.sub2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.client || v.period}</span>
                      {v.due_date && !v.done && <span style={{ fontSize: 10, fontWeight: 750, color: v.dueColor }}>{v.due}</span>}
                    </div>
                  </div>
                ))}
          </div>
        )
      })}
    </div>
  )
}

function WorkDetailScreen({ t, v, profiles, wrToggleStep, wrToggleComplete }) {
  const priColor = PRI[v.pri]
  const pct = v.steps ? Math.round((v.doneSteps / v.steps) * 100) : 0
  const assigneeName = profiles[v.assignee]?.name || (typeof v.assignee === 'string' && v.assignee && !/^[0-9a-f-]{20,}$/i.test(v.assignee) ? v.assignee : '')
  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .4s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: `color-mix(in srgb,${v.color} 13%,white)`, color: v.color, fontSize: 10, fontWeight: 800 }}>{v.workType}</span>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: v.statusMeta.color + '18', color: v.statusMeta.color, fontSize: 10, fontWeight: 800 }}>{v.stage || v.statusMeta.label}</span>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: priColor + '18', color: priColor, fontSize: 10, fontWeight: 800 }}>{v.pri} priority</span>
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: 23, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.2, color: t.ink }}>{v.title}</h1>
      {v.due_date && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}><Ic d={D.clock} size={15} sw={2} stroke={v.dueColor} /><span style={{ fontSize: 13, fontWeight: 750, color: v.dueColor }}>{v.dueLine}</span></div>}

      {v.description && <p style={{ margin: '0 0 18px', fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>{v.description}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div style={{ padding: 14, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 6 }}>Client</div>
          <b style={{ fontSize: 13, fontWeight: 750, color: t.ink2 }}>{v.client || '—'}</b>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}` }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 6 }}>Period</div>
          <b style={{ fontSize: 13, fontWeight: 750, color: t.ink2 }}>{v.period || '—'}</b>
        </div>
      </div>

      {assigneeName && <div style={{ padding: 14, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 18 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 6 }}>Assigned</div>
        <b style={{ fontSize: 13, fontWeight: 750, color: t.ink2 }}>{assigneeName}</b>
      </div>}

      {v.steps > 0 && <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint }}>Checklist · {v.doneSteps}/{v.steps}</div>
          <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT }}>{pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(20,42,70,.08)', overflow: 'hidden', marginBottom: 14 }}><div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg,${ACCENT},${ACCENT2})` }} /></div>
        <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 18 }}>
          {v.checkItems.map((st, i) => (
            <button key={i} onClick={() => wrToggleStep(v, st.i)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', border: 'none', borderBottom: i < v.checkItems.length - 1 ? `1px solid ${t.line}` : 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 22, height: 22, flex: '0 0 auto', borderRadius: 7, border: `2px solid ${st.done ? ACCENT : 'rgba(93,120,150,.3)'}`, background: st.done ? ACCENT : (t === DARK ? 'transparent' : '#fff'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{st.done && <Ic d={D.check2} size={12} sw={3.4} stroke="#fff" />}</span>
              <span style={{ fontSize: 12.5, color: st.done ? '#9aa8b8' : t.ink2, fontWeight: st.done ? 500 : 600, textDecoration: st.done ? 'line-through' : 'none' }}>{st.label}</span>
            </button>
          ))}
        </div>
      </>}

      <button onClick={() => wrToggleComplete(v)} style={{ width: '100%', padding: 14, borderRadius: 14, border: v.done ? `1px solid ${t.cardBd}` : 'none', background: v.done ? t.card : `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: v.done ? t.sub : '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ic d={D.check2} size={17} sw={2.6} stroke={v.done ? t.sub : '#fff'} />{v.done ? 'Mark as not done' : 'Mark completed'}
      </button>
    </section>
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
function CalendarScreen({ t, views, calMonth, setCalMonth, openDetail }) {
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
            <div key={i} onClick={() => has && openDetail(has[0].id)} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 11, cursor: has ? 'pointer' : 'default', background: isToday ? `color-mix(in srgb,${ACCENT} 12%,white)` : (has ? t.card : 'transparent'), border: isToday ? `1px solid color-mix(in srgb,${ACCENT} 30%,white)` : `1px solid ${has ? t.cardBd : 'transparent'}` }}>
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
                <div key={v.id} onClick={() => openDetail(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', borderRadius: 15, background: t.card, border: `1px solid ${t.cardBd}`, boxShadow: '0 10px 24px rgba(35,65,100,.05)', cursor: 'pointer' }}>
                  <div style={{ width: 46, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 0', borderRadius: 12, background: `color-mix(in srgb,${v.color} 12%,white)` }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: v.color, textTransform: 'uppercase' }}>{MON[dt.getMonth()]}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em', color: v.color, lineHeight: 1 }}>{dt.getDate()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13, fontWeight: 760, color: t.ink2, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</b><div style={{ fontSize: 11, color: t.sub2, marginTop: 3 }}>{v.workType || v.wsName || ''}</div></div>
                  <span style={{ padding: '4px 9px', borderRadius: 8, background: `color-mix(in srgb,${v.color} 12%,white)`, color: v.color, fontSize: 10, fontWeight: 800, flex: '0 0 auto' }}>{v.due}</span>
                </div>
              )
            })}
          </div>}
    </section>
  )
}

// ── TEAM + PRACTICE HUB (Members · Attendance · Time) ─────────────────────────
function TeamScreen({ t, teamTab, setTeamTab, members, profiles, wrViews, uid, org, punches, logs, leave, clientMap, workTypes, punch, addTimeLog }) {
  const tabs = [['members', 'Team'], ['attendance', 'Attendance'], ['time', 'Time']]
  const chip = on => ({ flex: 1, padding: '8px 6px', borderRadius: 9, border: 'none', background: on ? (t === DARK ? '#22344e' : '#fff') : 'transparent', color: on ? ACCENT : t.sub2, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 750, cursor: 'pointer', boxShadow: on ? '0 2px 6px rgba(20,42,70,.08)' : 'none' })
  return (
    <section style={{ padding: '2px 18px 8px', animation: 'tfmIn .45s cubic-bezier(.2,.8,.2,1) both' }}>
      <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 12, background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 16 }}>
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTeamTab(k)} style={chip(teamTab === k)}>{l}</button>)}
      </div>
      {teamTab === 'members' && <TeamMembers t={t} members={members} profiles={profiles} wrViews={wrViews} uid={uid} />}
      {teamTab === 'attendance' && <AttendanceTab t={t} punches={punches} leave={leave} punch={punch} />}
      {teamTab === 'time' && <TimeTab t={t} logs={logs} clientMap={clientMap} workTypes={workTypes} addTimeLog={addTimeLog} />}
    </section>
  )
}
function TeamMembers({ t, members, profiles, wrViews, uid }) {
  const loadByUser = {}; wrViews.forEach(v => { if (!v.done && v.assignee) loadByUser[v.assignee] = (loadByUser[v.assignee] || 0) + 1 })
  const list = members.map((m, i) => {
    const p = profiles[m.user_id] || {}
    return { id: m.user_id, name: p.name || (p.email || '').split('@')[0] || 'Member', role: m.role || 'Member', color: PALETTE[i % PALETTE.length], load: loadByUser[m.user_id] || 0, you: m.user_id === uid }
  })
  if (list.length === 0) return <Empty t={t} title="No teammates yet" sub="Invite people to this practice from the desktop app." />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {list.map((m, idx) => {
        const loadInk = m.load > 6 ? '#DC2626' : m.load > 4 ? '#D97706' : '#0d9488'
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', borderRadius: 16, background: t.card, border: `1px solid ${t.cardBd}`, boxShadow: '0 10px 24px rgba(35,65,100,.05)' }}>
            <span style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: '50%', background: `linear-gradient(135deg,${m.color},${PALETTE[(idx + 2) % PALETTE.length]})`, color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(m.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14, fontWeight: 760, color: t.ink2 }}>{m.name}{m.you && <span style={{ color: t.sub2, fontWeight: 600 }}> · you</span>}</b><div style={{ fontSize: 11, color: t.sub2, marginTop: 2, textTransform: 'capitalize' }}>{m.role}</div></div>
            <div style={{ textAlign: 'right', flex: '0 0 auto' }}><b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.03em', color: loadInk }}>{m.load}</b><div style={{ fontSize: 9, color: t.sub2, fontWeight: 600 }}>open</div></div>
          </div>
        )
      })}
    </div>
  )
}
function fmtTime(isoStr) { try { return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
function fmtDate(dStr) { try { const d = new Date((dStr.length <= 10 ? dStr + 'T00:00:00' : dStr)); return `${d.getDate()} ${MON[d.getMonth()]}` } catch { return dStr } }
function AttendanceTab({ t, punches, leave, punch }) {
  const today = todayISO()
  const todays = punches.filter(p => (p.punched_at || '').slice(0, 10) === today)
  const last = todays[0] // punches sorted desc
  const isIn = last && last.punch_type === 'in'
  const LEAVE_C = { approved: '#0d9488', pending: '#D97706', rejected: '#DC2626', declined: '#DC2626' }
  return (
    <div>
      <div style={{ padding: 18, borderRadius: 18, background: t === DARK ? 'linear-gradient(135deg,rgba(30,48,74,.9),rgba(24,40,64,.7))' : 'linear-gradient(135deg,rgba(255,255,255,.9),rgba(239,244,255,.72))', border: `1px solid ${t.glassBd}`, boxShadow: '0 16px 40px rgba(40,68,108,.08)', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: t.faint, marginBottom: 6 }}>Today · {fmtDate(today)}</div>
        <b style={{ fontSize: 20, fontWeight: 800, color: isIn ? '#0d9488' : t.ink2 }}>{isIn ? `Punched in · ${fmtTime(last.punched_at)}` : (last ? `Punched out · ${fmtTime(last.punched_at)}` : 'Not punched in')}</b>
        <button onClick={() => punch(isIn ? 'out' : 'in')} style={{ width: '100%', marginTop: 14, padding: 14, borderRadius: 14, border: 'none', background: isIn ? 'linear-gradient(135deg,#DC2626,#f0736f)' : `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>{isIn ? 'Punch Out' : 'Punch In'}</button>
      </div>

      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 10 }}>Recent punches</div>
      {punches.length === 0
        ? <div style={{ padding: 16, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}`, fontSize: 12, color: t.sub2, textAlign: 'center' }}>No punches yet.</div>
        : <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 18 }}>
            {punches.slice(0, 10).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 15px', borderBottom: i < Math.min(punches.length, 10) - 1 ? `1px solid ${t.line}` : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto', background: p.punch_type === 'in' ? '#0d9488' : '#DC2626' }} />
                <b style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: t.ink2, textTransform: 'capitalize' }}>Punch {p.punch_type}</b>
                <span style={{ fontSize: 11, color: t.sub2, fontWeight: 600 }}>{fmtDate((p.punched_at || '').slice(0, 10))} · {fmtTime(p.punched_at)}</span>
              </div>
            ))}
          </div>}

      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 10 }}>My leave</div>
      {leave.length === 0
        ? <div style={{ padding: 16, borderRadius: 14, background: t.glass, border: `1px solid ${t.glassBd}`, fontSize: 12, color: t.sub2, textAlign: 'center' }}>No leave requests.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {leave.map(lv => (
              <div key={lv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderRadius: 14, background: t.card, border: `1px solid ${t.cardBd}` }}>
                <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13, fontWeight: 750, color: t.ink2, textTransform: 'capitalize' }}>{lv.leave_type || 'Leave'}</b><div style={{ fontSize: 11, color: t.sub2, marginTop: 2 }}>{fmtDate(lv.start_date)}{lv.end_date && lv.end_date !== lv.start_date ? ` – ${fmtDate(lv.end_date)}` : ''}{lv.days ? ` · ${lv.days}d` : ''}</div></div>
                <span style={{ padding: '3px 9px', borderRadius: 8, background: (LEAVE_C[String(lv.status || '').toLowerCase()] || t.sub2) + '18', color: LEAVE_C[String(lv.status || '').toLowerCase()] || t.sub2, fontSize: 10, fontWeight: 800, textTransform: 'capitalize' }}>{lv.status || 'pending'}</span>
              </div>
            ))}
          </div>}
    </div>
  )
}
function TimeTab({ t, logs, clientMap, workTypes, addTimeLog }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ work_type: '', hours: '', minutes: '', notes: '' })
  const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return iso(d) })()
  const weekMins = logs.filter(l => l.date >= weekAgo).reduce((n, l) => n + (l.hours || 0) * 60 + (l.minutes || 0), 0)
  const weekH = Math.floor(weekMins / 60), weekM = weekMins % 60
  function submit() {
    if (!(Number(form.hours) || Number(form.minutes))) return
    addTimeLog(form); setForm({ work_type: '', hours: '', minutes: '', notes: '' }); setOpen(false)
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, background: t.card, border: `1px solid ${t.cardBd}`, marginBottom: 14 }}>
        <span style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: 12, background: `color-mix(in srgb,${ACCENT} 12%,white)`, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic d={D.clock} size={20} /></span>
        <div style={{ flex: 1 }}><b style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.03em', color: t.ink }}>{weekH}h {weekM}m</b><div style={{ fontSize: 11, fontWeight: 700, color: t.sub2 }}>Logged this week</div></div>
        <button onClick={() => setOpen(o => !o)} style={{ padding: '9px 13px', borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Ic d={D.plus} size={14} sw={2.4} />Log</button>
      </div>

      {open && (
        <div style={{ padding: 15, borderRadius: 16, background: t.glass, border: `1px solid ${t.glassBd}`, marginBottom: 14 }}>
          <div className="tfm-x" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 11 }}>
            {workTypes.length === 0 ? <span style={{ fontSize: 12, color: t.sub2 }}>No work types</span>
              : workTypes.map(wt => <button key={wt} onClick={() => setForm(f => ({ ...f, work_type: wt }))} style={{ flex: '0 0 auto', padding: '7px 12px', borderRadius: 10, border: `1px solid ${form.work_type === wt ? ACCENT : (t === DARK ? 'rgba(140,165,200,.18)' : 'rgba(20,42,70,.1)')}`, background: form.work_type === wt ? ACCENT : t.input, color: form.work_type === wt ? '#fff' : t.sub, fontFamily: 'inherit', fontSize: 12, fontWeight: 750, cursor: 'pointer', whiteSpace: 'nowrap' }}>{wt}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 9, marginBottom: 11 }}>
            <input value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric" placeholder="Hours" style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.cardBd}`, background: t.input, fontFamily: 'inherit', fontSize: 14, color: t.ink2, outline: 'none' }} />
            <input value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="numeric" placeholder="Mins" style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.cardBd}`, background: t.input, fontFamily: 'inherit', fontSize: 14, color: t.ink2, outline: 'none' }} />
          </div>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.cardBd}`, background: t.input, fontFamily: 'inherit', fontSize: 14, color: t.ink2, outline: 'none', marginBottom: 11 }} />
          <button onClick={submit} style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: '#fff', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>Save time log</button>
        </div>
      )}

      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: t.faint, marginBottom: 10 }}>Recent logs</div>
      {logs.length === 0
        ? <Empty t={t} title="No time logged" sub="Log time against your work from here." />
        : <div style={{ borderRadius: 16, overflow: 'hidden', background: t.glass, border: `1px solid ${t.glassBd}` }}>
            {logs.slice(0, 30).map((l, i) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderBottom: i < Math.min(logs.length, 30) - 1 ? `1px solid ${t.line}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 12.5, fontWeight: 700, color: t.ink2 }}>{l.work_type || 'Work'}{l.client_id && clientMap[l.client_id] ? ` · ${clientMap[l.client_id]}` : ''}</b>
                  <div style={{ fontSize: 10.5, color: t.sub2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDate(l.date)}{l.notes ? ` · ${l.notes}` : ''}</div>
                </div>
                <b style={{ fontSize: 13, fontWeight: 800, color: ACCENT, flex: '0 0 auto', fontFamily: "'JetBrains Mono',monospace" }}>{l.hours || 0}h {l.minutes || 0}m</b>
              </div>
            ))}
          </div>}
    </div>
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
  views.filter(v => v.overdue).slice(0, 8).forEach(v => today.push({ d: D.warn, iconBg: 'rgba(220,38,38,.1)', iconInk: '#DC2626', title: `Overdue: ${v.title}`, sub: `${v.workType} · ${v.dueLine}`, age: v.due }))
  views.filter(v => v.today && !v.overdue && !v.done).slice(0, 8).forEach(v => today.push({ d: D.clock, iconBg: 'rgba(47,107,255,.1)', iconInk: ACCENT, title: `Due today: ${v.title}`, sub: v.workType, age: 'Today' }))
  views.filter(v => v.mine && !v.done && !v.today && !v.overdue).slice(0, 5).forEach(v => earlier.push({ d: D.at, iconBg: 'rgba(124,58,237,.1)', iconInk: '#7C3AED', title: `Assigned to you: ${v.title}`, sub: v.workType, age: v.due }))
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
