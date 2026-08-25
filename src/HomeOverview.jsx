import React, { useEffect, useMemo, useState } from 'react'
import { UsersRound, CheckCircle2, CalendarClock, AlertTriangle, Target,
         ArrowUpRight, ChevronRight, BriefcaseBusiness, ClipboardList,
         Activity, Plus, Sparkles, LayoutGrid, Clock3, ShieldCheck,
         TrendingUp, Zap } from 'lucide-react'

const palette = ['#2F6BFF','#7C3AED','#F59E0B','#14B8A6','#EC4899','#0EA5E9']

function todayISO() {
  const d = new Date(), p = n => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}
function initials(name = 'Practice') {
  return name.trim().split(/\s+/).map(s => s[0]).join('').slice(0,2).toUpperCase() || '?'
}
function dateLabel(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) } catch { return '' }
}
function relativeTime(d) {
  if (!d) return 'Recent'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return dateLabel(d)
}

const iconProps = { size: 16, strokeWidth: 1.8 }

export default function HomeOverview({ orgs, workspaces, allProfiles=[], supabase, cu, onOpenOrg, onOpenWorkspace, onCreateOrg }) {
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.body.classList.add('tf-home-active')
    return () => document.body.classList.remove('tf-home-active')
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      const today = todayISO(), next = {}
      await Promise.all((orgs || []).map(async (org, oi) => {
        const ws = (workspaces || []).filter(w => w.org_id === org.id)
        const wsIds = ws.map(w => w.id)
        let clients = 0, tasks = [], memberIds = []
        try { const r = await supabase.from('clients').select('id',{count:'exact',head:true}).eq('org_id',org.id); clients = r.count || 0 } catch {}
        if (wsIds.length) try { const r = await supabase.from('tasks').select('id,title,status,due_date,created_at,updated_at,workspace_id').in('workspace_id',wsIds).limit(500); tasks = r.data || [] } catch {}
        try { const r = await supabase.from('organization_members').select('user_id').eq('org_id',org.id).limit(50); memberIds = (r.data || []).map(x => x.user_id) } catch {}
        const active = tasks.filter(t => (t.status || 'Todo') !== 'Done')
        const dueToday = active.filter(t => t.due_date === today)
        const overdue = active.filter(t => t.due_date && t.due_date < today)
        const review = active.filter(t => ['review','under_review'].includes(String(t.status || '').toLowerCase()))
        next[org.id] = { clients, tasks, active: active.length, dueToday: dueToday.length, overdue: overdue.length, review: review.length, memberIds, color: palette[oi % palette.length] }
      }))
      if (alive) { setMeta(next); setLoading(false) }
    }
    if (orgs?.length) load()
    else { setMeta({}); setLoading(false) }
    return () => { alive = false }
  }, [orgs, workspaces, supabase])

  const summary = useMemo(() => {
    const vals = Object.values(meta)
    const tasks = vals.flatMap(v => v.tasks || [])
    return {
      clients: vals.reduce((n,v) => n + (v.clients || 0), 0),
      active: vals.reduce((n,v) => n + (v.active || 0), 0),
      dueToday: vals.reduce((n,v) => n + (v.dueToday || 0), 0),
      overdue: vals.reduce((n,v) => n + (v.overdue || 0), 0),
      review: vals.reduce((n,v) => n + (v.review || 0), 0),
      recent: tasks.sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0,6)
    }
  }, [meta])

  const orgName = cu?.user_metadata?.full_name || cu?.name || (cu?.email || '').split('@')[0] || 'there'
  const topOrgs = [...(orgs || [])].sort((a,b) => (meta[b.id]?.active || 0) - (meta[a.id]?.active || 0))

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const stats = [
    { icon: UsersRound,    label: 'Total Clients', value: summary.clients,  sub: 'Firm-wide', tone: 'blue',   trend: null },
    { icon: CheckCircle2,  label: 'Active Tasks',  value: summary.active,   sub: 'In progress', tone: 'violet', trend: null },
    { icon: CalendarClock, label: 'Due Today',      value: summary.dueToday, sub: 'Need action', tone: 'amber',  trend: summary.dueToday > 0 },
    { icon: AlertTriangle, label: 'Overdue',        value: summary.overdue,  sub: 'Urgent',    tone: 'red',    trend: summary.overdue > 0 },
  ]

  return (
    <div className="tf-home-overview">
      <div className="tf-home-shell">

        {/* ── Hero ── */}
        <section className="tf-home-hero">
          <div className="tf-home-hero-copy">
            <div className="tf-home-kicker">TASKFLOWCO · YOUR PRACTICE HOME</div>
            <h1>{getGreeting()}, {orgName}! <span className="tf-wave-emoji">👋</span></h1>
            <p>
              {summary.overdue > 0
                ? <><span className="tf-hero-alert">⚠ {summary.overdue} overdue</span> — let's clear the backlog.</>
                : summary.dueToday > 0
                  ? <><span className="tf-hero-accent">{summary.dueToday} tasks due today</span> — keep the momentum going.</>
                  : 'Everything looks on track. Choose a practice and keep the day moving.'}
            </p>
          </div>
          <div className="tf-home-hero-actions">
            <button className="tf-home-focus" onClick={() => { const first = (workspaces || [])[0]; if (first) onOpenWorkspace(first) }}>
              <span className="tf-focus-icon"><Target size={18} strokeWidth={2} /></span>
              <span className="tf-focus-copy">
                <b>Today's Focus</b>
                <span>{summary.dueToday || 0} due · {summary.review || 0} in review</span>
              </span>
              <ChevronRight size={17} />
            </button>
            {summary.overdue > 0 && (
              <div className="tf-hero-overdue-badge">
                <AlertTriangle size={12} />
                <span>{summary.overdue} overdue</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="tf-home-stats">
          {stats.map(({ icon: Icon, label, value, sub, tone, trend }) => (
            <div key={label} className={`tf-stat tf-stat-${tone}`}>
              <span className="tf-stat-icon"><Icon {...iconProps} /></span>
              <span className="tf-stat-copy">
                <strong>{loading ? '—' : value}</strong>
                <b>{label}</b>
                <small>{sub}</small>
              </span>
              {trend && <span className="tf-stat-badge"><TrendingUp size={10} /></span>}
            </div>
          ))}
        </section>

        {/* ── Your Practices ── */}
        <section className="tf-home-section">
          <div className="tf-home-section-head">
            <div>
              <div className="tf-section-eyebrow"><BriefcaseBusiness size={13} /> Workspace of choice</div>
              <h2>Your Practices</h2>
              <p>Select a practice to continue</p>
            </div>
            <button className="tf-section-action" onClick={onCreateOrg}><Plus size={14} /><span>New Practice</span></button>
          </div>

          {topOrgs.length === 0
            ? <div className="tf-home-empty">
                <div className="tf-empty-icon"><BriefcaseBusiness size={18} /></div>
                <b>No practices yet</b>
                <span>Create your first practice to begin.</span>
                <button onClick={onCreateOrg}>Create Practice</button>
              </div>
            : <div className="tf-practice-grid">
                {topOrgs.map((org, i) => {
                  const m = meta[org.id] || {}
                  const pc = m.color || palette[i % palette.length]
                  const memberProfiles = (m.memberIds || []).map(id => allProfiles.find(p => p.id === id)).filter(Boolean).slice(0,4)
                  const hasAlert = (m.overdue || 0) > 0
                  return (
                    <button key={org.id} className={`tf-practice-card${hasAlert ? ' tf-practice-card--alert' : ''}`} onClick={() => onOpenOrg(org)} style={{'--accent': pc}}>
                      <span className="tf-card-glow" />
                      <div className="tf-practice-head">
                        <div className="tf-practice-avatar">{initials(org.name)}</div>
                        <div className="tf-practice-title">
                          <b>{org.name}</b>
                          <span>{org.description || 'Practice workspace'}</span>
                        </div>
                        <span className="tf-card-arrow"><ArrowUpRight size={15} /></span>
                      </div>

                      <div className="tf-practice-metrics">
                        <div className="tf-metric-item">
                          <strong>{m.clients ?? 0}</strong>
                          <span>Clients</span>
                        </div>
                        <div className="tf-metric-item">
                          <strong>{m.active ?? 0}</strong>
                          <span>Tasks</span>
                        </div>
                        <div className="tf-metric-item">
                          <strong className={m.dueToday > 0 ? 'tf-metric-amber' : ''}>{m.dueToday ?? 0}</strong>
                          <span>Due Today</span>
                        </div>
                        <div className="tf-metric-item">
                          <strong className={m.overdue > 0 ? 'tf-metric-red' : ''}>{m.overdue ?? 0}</strong>
                          <span>Overdue</span>
                        </div>
                      </div>

                      <div className="tf-practice-foot">
                        <div className="tf-mini-avatars">
                          {memberProfiles.map((p,j) => <span key={p.id || j}>{(p.name || p.email || '?').charAt(0).toUpperCase()}</span>)}
                          {(m.memberIds?.length || 0) > 4 && <em>+{m.memberIds.length - 4}</em>}
                        </div>
                        <span className="tf-open-link">Open Practice <ArrowUpRight size={12} /></span>
                      </div>
                    </button>
                  )
                })}
              </div>
          }
        </section>

        {/* ── Other Workspaces ── */}
        <section className="tf-home-section">
          <div className="tf-home-section-head">
            <div>
              <div className="tf-section-eyebrow"><LayoutGrid size={13} /> Shared spaces</div>
              <h2>Other Workspaces</h2>
              <p>Tasks, boards and team collaboration</p>
            </div>
            <button className="tf-home-section-link-btn">View all <ArrowUpRight size={12} /></button>
          </div>
          <div className="tf-other-grid">
            {(workspaces || []).slice(0,6).map((ws, i) => (
              <button key={ws.id} className="tf-other-card" onClick={() => onOpenWorkspace(ws)} style={{'--accent': ws.color || palette[i % palette.length]}}>
                <span className="tf-other-icon">{ws.icon || <ClipboardList size={16} />}</span>
                <span className="tf-other-copy">
                  <b>{ws.name}</b>
                  <small>{ws.description || 'Workspace'}</small>
                  <em><Activity size={11} /> {meta[ws.org_id]?.active || 0} active tasks</em>
                </span>
                <ChevronRight className="tf-other-arrow" size={16} />
              </button>
            ))}
          </div>
        </section>

        {/* ── Bottom: Activity + Quick Card ── */}
        <section className="tf-home-bottom-grid">
          <div className="tf-home-section">
            <div className="tf-home-section-head">
              <div>
                <div className="tf-section-eyebrow"><Activity size={13} /> Momentum</div>
                <h2>Recent Activity</h2>
                <p>Your latest work across all practices</p>
              </div>
              <button className="tf-home-section-link-btn">View all <ArrowUpRight size={12} /></button>
            </div>
            <div className="tf-activity-list">
              {summary.recent.length
                ? summary.recent.map((t, i) => (
                    <div key={t.id || i} className="tf-activity-row">
                      <span className="tf-activity-dot" />
                      <span className="tf-activity-icon">
                        {i === 0 ? <Clock3 size={13} /> : i === 1 ? <CheckCircle2 size={13} /> : <ClipboardList size={13} />}
                      </span>
                      <div>
                        <b>{t.title || 'Untitled task'}</b>
                        <small>{t.status || 'Todo'} · {dateLabel(t.updated_at || t.created_at)}</small>
                      </div>
                      <span className="tf-activity-age">{relativeTime(t.updated_at || t.created_at)}</span>
                    </div>
                  ))
                : <div className="tf-home-empty small">
                    <div className="tf-empty-icon"><Activity size={16} /></div>
                    <b>No recent activity</b>
                    <span>Tasks will appear here once you start working.</span>
                  </div>
              }
            </div>
          </div>

          <div className="tf-desktop-card">
            <div className="tf-desktop-top">
              <span className="tf-desktop-icon"><Zap size={17} /></span>
              <span className="tf-desktop-badge"><Sparkles size={11} /> Quick access</span>
            </div>
            <h3>Jump into focused work</h3>
            <p>Use <b>My Work</b> for a personal task view, or open any workspace to see the full team board.</p>
            <button onClick={() => { const first = (workspaces || [])[0]; if (first) onOpenWorkspace(first) }}>
              Open Workspace <ArrowUpRight size={13} />
            </button>
            {summary.clients > 0 && (
              <div className="tf-desktop-stat-row">
                <span><UsersRound size={11} /> {summary.clients} clients across {(orgs || []).length} practice{(orgs || []).length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
