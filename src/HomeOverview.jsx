import React, { useEffect, useMemo, useState } from 'react'

// ── Practice Home (1B) — command center layout ──────────────────────
// Recreated from the Claude Design handoff "Practice Home (1B)".
// Real data: practices, workspaces, week calendar (from tasks), team, announcements.

const palette = ['#2F6BFF', '#7C3AED', '#F59E0B', '#14B8A6', '#EC4899', '#0EA5E9']

function pad(n) { return String(n).padStart(2, '0') }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function todayISO() { return iso(new Date()) }
function initials(name = 'Practice') {
  return name.trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?'
}
function startOfWeek(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7          // Monday = 0
  d.setDate(d.getDate() - dow + offset * 7)
  return d
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const FULLDOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── inline icons (match the design; independent of lucide version) ──
const svg = (children, size = 13, sw = 1.8) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flex: '0 0 auto' }}>{children}</svg>
)
const IcSearch = (s) => svg(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>, s)
const IcBrief = (s) => svg(<><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /></>, s)
const IcKanban = (s) => svg(<><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>, s)
const IcCal = (s) => svg(<><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" /></>, s)
const IcUsers = (s) => svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, s)
const IcMega = (s) => svg(<><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>, s)
const IcPlus = (s) => svg(<><path d="M5 12h14" /><path d="M12 5v14" /></>, s, 2)
const IcArrowOut = (s) => svg(<><path d="M7 7h10v10" /><path d="M7 17 17 7" /></>, s, 2)
const IcChevR = (s) => svg(<path d="m9 18 6-6-6-6" />, s, 2)
const IcChevL = (s) => svg(<path d="m15 18-6-6 6-6" />, s, 2)

const ANN_COLOR = { info: '#2F6BFF', update: '#2F6BFF', warning: '#F59E0B', alert: '#EF4444', success: '#14B8A6', event: '#7C3AED' }

export default function HomeOverview({ orgs, workspaces, allProfiles = [], supabase, cu, onOpenOrg, onOpenWorkspace, onCreateOrg, onNewWorkspace }) {
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(true)
  const [anns, setAnns] = useState([])
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    document.body.classList.add('tf-home-active')
    return () => document.body.classList.remove('tf-home-active')
  }, [])

  // Per-practice metrics + tasks (tasks power the week calendar)
  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      const today = todayISO(), next = {}
      await Promise.all((orgs || []).map(async (org, oi) => {
        const ws = (workspaces || []).filter(w => w.org_id === org.id)
        const wsIds = ws.map(w => w.id)
        let clients = 0, tasks = [], memberIds = []
        try { const r = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', org.id); clients = r.count || 0 } catch {}
        if (wsIds.length) try { const r = await supabase.from('tasks').select('id,title,status,due_date,created_at,updated_at,workspace_id').in('workspace_id', wsIds).limit(500); tasks = r.data || [] } catch {}
        try { const r = await supabase.from('organization_members').select('user_id').eq('org_id', org.id).limit(50); memberIds = (r.data || []).map(x => x.user_id) } catch {}
        const active = tasks.filter(t => (t.status || 'Todo') !== 'Done')
        const dueToday = active.filter(t => t.due_date === today)
        const overdue = active.filter(t => t.due_date && t.due_date < today)
        const review = active.filter(t => ['review', 'under_review'].includes(String(t.status || '').toLowerCase()))
        next[org.id] = { clients, tasks: active, active: active.length, dueToday: dueToday.length, overdue: overdue.length, review: review.length, memberIds, color: palette[oi % palette.length], name: org.name }
      }))
      if (alive) { setMeta(next); setLoading(false) }
    }
    if (orgs?.length) load()
    else { setMeta({}); setLoading(false) }
    return () => { alive = false }
  }, [orgs, workspaces, supabase])

  // Active announcements
  useEffect(() => {
    let alive = true
    supabase.from('announcements').select('*').eq('active', true).order('published_at', { ascending: false }).limit(4)
      .then(({ data }) => { if (alive) setAnns(data || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [supabase])

  const summary = useMemo(() => {
    const vals = Object.values(meta)
    return {
      clients: vals.reduce((n, v) => n + (v.clients || 0), 0),
      active: vals.reduce((n, v) => n + (v.active || 0), 0),
      dueToday: vals.reduce((n, v) => n + (v.dueToday || 0), 0),
      overdue: vals.reduce((n, v) => n + (v.overdue || 0), 0),
      review: vals.reduce((n, v) => n + (v.review || 0), 0),
    }
  }, [meta])

  // All dated tasks, coloured by practice — powers the calendar
  const datedTasks = useMemo(() => {
    const out = []
    Object.values(meta).forEach(m => (m.tasks || []).forEach(t => { if (t.due_date) out.push({ ...t, color: m.color, practice: m.name }) }))
    return out
  }, [meta])

  const name = cu?.user_metadata?.full_name || cu?.name || (cu?.email || '').split('@')[0] || 'there'
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()
  const now = new Date()
  const dateLine = `${FULLDOW[now.getDay()]} · ${now.getDate()} ${['January','February','March','April','May','June','July','August','September','October','November','December'][now.getMonth()]} ${now.getFullYear()}`

  // Week model
  const weekStart = startOfWeek(weekOffset)
  const days = [...Array(7)].map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const weekEnd = days[6]
  const todayIso = todayISO()
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${MON[weekStart.getMonth()]} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    : `${MON[weekStart.getMonth()]} ${weekStart.getDate()} – ${MON[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`

  const weekEndIso = iso(weekEnd)
  const laterHorizon = (() => { const d = new Date(weekEnd); d.setDate(d.getDate() + 45); return iso(d) })()
  const later = useMemo(() => {
    const seen = new Set(), out = []
    datedTasks.filter(t => t.due_date > weekEndIso && t.due_date <= laterHorizon)
      .sort((a, b) => a.due_date < b.due_date ? -1 : 1)
      .forEach(t => { const k = t.due_date + t.title; if (!seen.has(k)) { seen.add(k); out.push(t) } })
    return out.slice(0, 4)
  }, [datedTasks, weekEndIso, laterHorizon])

  const team = (allProfiles || []).slice(0, 5)
  const firstWs = (workspaces || [])[0]

  const openCommand = () => {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, ctrlKey: true, bubbles: true })) } catch {}
  }

  return (
    <div className="tf-home-overview">
      <div className="tf-home-shell tf1b">

        {/* ── Hero + command bar ── */}
        <section className="tf1b-card tf1b-hero">
          <div className="tf1b-hero-top">
            <div className="tf1b-hero-copy">
              <div className="tf1b-eyebrow tf1b-eyebrow-plain">{dateLine}</div>
              <h1>{greeting}, {name} <span className="tf1b-wave">👋</span></h1>
            </div>
            <div className="tf1b-hero-stats">
              <div><b>{loading ? '—' : summary.clients}</b><span>Clients</span></div>
              <i />
              <div><b>{(orgs || []).length}</b><span>Practices</span></div>
              <i />
              <div><b className={summary.dueToday > 0 ? 'tf1b-amber' : ''}>{loading ? '—' : summary.dueToday}</b><span>Due today</span></div>
            </div>
          </div>
          <button className="tf1b-cmd" onClick={openCommand}>
            <span className="tf1b-cmd-ic">{IcSearch(17)}</span>
            <span className="tf1b-cmd-ph">Search clients, tasks, or type a command — try “new task”, “GSTR-3B”…</span>
            <span className="tf1b-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
          </button>
        </section>

        {/* ── Jump into a practice + Kanban workspaces ── */}
        <section className="tf1b-card tf1b-block">
          <div className="tf1b-head">
            <div>
              <div className="tf1b-eyebrow">{IcBrief(13)} Workspace of choice</div>
              <h2 className="tf1b-h2">Jump into a practice</h2>
            </div>
            <div className="tf1b-head-actions">
              <button className="tf1b-pill" onClick={onCreateOrg}>{IcPlus(13)} New Practice</button>
            </div>
          </div>

          <div className="tf1b-split tf1b-split-340">
            {/* practices */}
            {(orgs || []).length === 0
              ? <div className="tf1b-empty"><b>No practices yet</b><span>Create your first practice to begin.</span><button onClick={onCreateOrg}>Create Practice</button></div>
              : <div className="tf1b-prac-grid">
                  {(orgs || []).map((org, i) => {
                    const m = meta[org.id] || {}
                    const c = m.color || palette[i % palette.length]
                    return (
                      <button key={org.id} className="tf1b-prac" onClick={() => onOpenOrg(org)}>
                        <span className="tf1b-av" style={{ background: `color-mix(in srgb, ${c} 12%, white)`, color: c }}>{initials(org.name)}</span>
                        <span className="tf1b-prac-copy">
                          <b>{org.name}</b>
                          <span>{loading ? '…' : `${m.clients ?? 0} clients · ${m.dueToday ?? 0} due`}</span>
                        </span>
                        <span className="tf1b-prac-arrow">{IcArrowOut(15)}</span>
                      </button>
                    )
                  })}
                </div>
            }

            {/* kanban workspaces sidebar */}
            <div className="tf1b-card tf1b-kanban">
              <div className="tf1b-kanban-head">
                <div className="tf1b-eyebrow" style={{ margin: 0 }}>{IcKanban(13)} Kanban Workspaces</div>
                <button className="tf1b-pill tf1b-pill-sm" onClick={onNewWorkspace}>{IcPlus(12)} New Workspace</button>
              </div>
              {(workspaces || []).length === 0
                ? <div className="tf1b-kanban-empty">No workspaces yet</div>
                : (workspaces || []).slice(0, 4).map(ws => (
                    <button key={ws.id} className="tf1b-ws" onClick={() => onOpenWorkspace(ws)}>
                      <span className="tf1b-av tf1b-av-sq">#</span>
                      <span className="tf1b-prac-copy">
                        <b>{ws.name}</b>
                        <span>{meta[ws.org_id]?.active || 0} active tasks</span>
                      </span>
                      {IcChevR(15)}
                    </button>
                  ))
              }
              {firstWs && <div className="tf1b-kanban-foot"><button className="tf1b-link" onClick={() => onOpenWorkspace(firstWs)}>View all →</button></div>}
            </div>
          </div>
        </section>

        {/* ── Week + right rail ── */}
        <section className="tf1b-split tf1b-split-320">
          {/* week calendar */}
          <div className="tf1b-card tf1b-week">
            <div className="tf1b-week-head">
              <div>
                <div className="tf1b-eyebrow">{IcCal(13)} Your week</div>
                <h2 className="tf1b-h2">{weekLabel}</h2>
              </div>
              <div className="tf1b-week-nav">
                <button onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week">{IcChevL(15)}</button>
                <button className="tf1b-today-btn" onClick={() => setWeekOffset(0)}>Today</button>
                <button onClick={() => setWeekOffset(w => w + 1)} aria-label="Next week">{IcChevR(15)}</button>
              </div>
            </div>
            <div className="tf1b-week-grid">
              {days.map((d, i) => {
                const di = iso(d)
                const isToday = di === todayIso
                const dayTasks = datedTasks.filter(t => t.due_date === di).slice(0, 3)
                return (
                  <div key={i} className="tf1b-daycol">
                    <div className={`tf1b-dayhdr${isToday ? ' is-today' : ''}`}>
                      <div className="tf1b-dow">{DOW[i]}</div>
                      {isToday ? <div className="tf1b-daynum-today">{d.getDate()}</div> : <div className="tf1b-daynum">{d.getDate()}</div>}
                    </div>
                    {dayTasks.map((t, j) => (
                      <div key={j} className="tf1b-chip" style={{ background: `color-mix(in srgb, ${t.color} 12%, white)` }} title={`${t.title} · ${t.practice || ''}`}>
                        <b style={{ color: t.color }}>{t.title}</b>
                        <span>{t.status || 'Task'}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="tf1b-later">
              <div className="tf1b-eyebrow" style={{ marginBottom: 9 }}>Later</div>
              {later.length === 0
                ? <span className="tf1b-later-empty">No upcoming deadlines in the next 6 weeks.</span>
                : <div className="tf1b-later-chips">
                    {later.map((t, i) => {
                      const d = new Date(t.due_date)
                      return (
                        <span key={i} className="tf1b-later-chip" style={{ background: `color-mix(in srgb, ${t.color} 8%, white)`, borderColor: `color-mix(in srgb, ${t.color} 22%, white)` }}>
                          <b style={{ color: t.color }}>{d.getDate()} {MON[d.getMonth()]}</b>
                          <span>{t.title}</span>
                        </span>
                      )
                    })}
                  </div>
              }
            </div>
          </div>

          {/* right rail */}
          <div className="tf1b-rail">
            {/* team */}
            <div className="tf1b-card tf1b-railcard">
              <div className="tf1b-railcard-head">
                <div className="tf1b-eyebrow" style={{ margin: 0 }}>{IcUsers(13)} Your team</div>
                <span className="tf1b-count">{team.length} member{team.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="tf1b-team-list">
                {team.length === 0
                  ? <span className="tf1b-later-empty">No teammates yet.</span>
                  : team.map((p, i) => {
                      const you = p.id === cu?.id
                      const label = p.name || p.email || 'Member'
                      return (
                        <div key={p.id || i} className="tf1b-team-row">
                          <span className="tf1b-team-av" style={{ background: `linear-gradient(135deg, ${palette[i % palette.length]}, ${palette[(i + 2) % palette.length]})` }}>
                            {initials(label)}
                            {you && <em className="tf1b-dot-online" />}
                          </span>
                          <span className="tf1b-prac-copy">
                            <b>{label}{you && <span className="tf1b-you"> · you</span>}</b>
                            <span>{(p.email || '').toLowerCase() || 'Team member'}</span>
                          </span>
                        </div>
                      )
                    })
                }
              </div>
              {orgs?.length > 0 && (
                <button className="tf1b-invite" onClick={() => onOpenOrg(orgs[0])}>{IcPlus(13)} Invite teammates</button>
              )}
            </div>

            {/* announcements */}
            <div className="tf1b-card tf1b-railcard">
              <div className="tf1b-eyebrow" style={{ marginBottom: 12 }}>{IcMega(13)} Announcements</div>
              <div className="tf1b-ann-list">
                {anns.length === 0
                  ? <span className="tf1b-later-empty">No announcements right now.</span>
                  : anns.map((a, i) => (
                      <div key={a.id || i} className="tf1b-ann-row">
                        <span className="tf1b-ann-dot" style={{ background: ANN_COLOR[String(a.kind || '').toLowerCase()] || '#2F6BFF' }} />
                        <div className="tf1b-prac-copy">
                          <b style={{ whiteSpace: 'normal' }}>{a.title}</b>
                          <span style={{ whiteSpace: 'normal' }}>{a.body || (a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '')}</span>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
