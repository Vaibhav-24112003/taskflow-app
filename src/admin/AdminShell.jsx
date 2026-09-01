import { useState, useEffect, Suspense, lazy } from 'react'
import { supabase } from '../lib/supabase.js'

const UsersAdmin         = lazy(() => import('./UsersAdmin.jsx'))
const OrgsAdmin          = lazy(() => import('./OrgsAdmin.jsx'))
const SupportAdminView   = lazy(() => import('../SupportAdminView.jsx'))
const AnnouncementsAdmin = lazy(() => import('../AnnouncementsAdmin.jsx'))
const BillingAdmin       = lazy(() => import('./BillingAdmin.jsx'))

const NAV = [
  { id: 'overview',       label: 'Overview',       icon: '◈',  color: '#6b8cad' },
  { id: 'users',          label: 'Users',           icon: '🛡',  color: '#ef4444' },
  { id: 'orgs',           label: 'Organisations',   icon: '🏢',  color: '#f59e0b' },
  { id: 'demoreqs',       label: 'Demo Requests',   icon: '📋',  color: '#10b981' },
  { id: 'support',        label: 'Support Tickets', icon: '🆘',  color: '#6366f1' },
  { id: 'announcements',  label: 'Announcements',   icon: '📣',  color: '#0e2a47' },
  { id: 'billing',        label: 'Billing & Plans',  icon: '💳',  color: '#10b981' },
]

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--tf-panel)', border: '1px solid var(--tf-border)', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tf-text-sub)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', color: color || 'var(--tf-text)', fontFamily: "'JetBrains Mono',monospace" }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--tf-text-sub)' }}>{sub}</div>}
    </div>
  )
}

function Overview({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [demos, setDemos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('admin_user_overview').select('id', { count: 'exact', head: true }),
        supabase.from('admin_org_overview').select('id', { count: 'exact', head: true }),
        supabase.from('demo_requests').select('id, status', { count: 'exact' }).eq('status', 'new'),
        supabase.from('demo_requests').select('id, name, email, firm_name, team_size, created_at, status').order('created_at', { ascending: false }).limit(8),
      ])
      setStats({
        users: r1.count ?? 0,
        orgs: r2.count ?? 0,
        newDemos: r3.count ?? 0,
      })
      setDemos(r4.data ?? [])
      setLoading(false)
    }
    load()
    const chan = supabase.channel('overview-demo-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_requests' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(chan) }
  }, [])

  const STATUS_COL = { new: '#6366f1', contacted: '#f59e0b', converted: '#10b981', declined: '#94a3b8' }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em', color: 'var(--tf-text)', marginBottom: 4 }}>Platform Overview</div>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', animation: 'pulse 2s infinite', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>LIVE</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--tf-text-sub)' }}>All organisations, users and leads across taskflowco.in</div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--tf-text-sub)', fontSize: 13 }}>Loading stats…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          <StatCard icon="🛡" label="Total Users" value={stats?.users} sub="All signed-up accounts" color="#ef4444" />
          <StatCard icon="🏢" label="Organisations" value={stats?.orgs} sub="Active orgs on platform" color="#f59e0b" />
          <StatCard icon="📋" label="New Demo Requests" value={stats?.newDemos} sub="Awaiting follow-up" color="#10b981" />
        </div>
      )}

      {/* Quick access cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {NAV.filter(n => n.id !== 'overview').map(n => (
          <button key={n.id} onClick={() => onNavigate(n.id)}
            style={{ background: 'var(--tf-panel)', border: '1px solid var(--tf-border)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 12 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = n.color; e.currentTarget.style.background = 'var(--tf-surface-hov)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--tf-border)'; e.currentTarget.style.background = 'var(--tf-panel)' }}>
            <span style={{ fontSize: 22, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${n.color}18`, borderRadius: 8 }}>{n.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tf-text)' }}>{n.label}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--tf-text-mut)', fontSize: 16 }}>→</span>
          </button>
        ))}
      </div>

      {/* Recent demo requests */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tf-text)' }}>Recent Demo Requests</div>
          <button onClick={() => onNavigate('demoreqs')} style={{ background: 'none', border: 'none', color: '#6b8cad', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>View all →</button>
        </div>
        {demos.length === 0 ? (
          <div style={{ color: 'var(--tf-text-sub)', fontSize: 13 }}>No demo requests yet.</div>
        ) : (
          <div style={{ background: 'var(--tf-panel)', border: '1px solid var(--tf-border)', borderRadius: 12, overflow: 'hidden' }}>
            {demos.map((d, i) => (
              <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr 80px 120px', gap: 12, alignItems: 'center', padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--tf-border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tf-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.email}</div>
                <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.firm_name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--tf-text-sub)' }}>{d.team_size || '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COL[d.status] || '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COL[d.status] || '#94a3b8' }}>{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DemoRequestsAdmin() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const STATUS_COL = { new: '#6366f1', contacted: '#f59e0b', converted: '#10b981', declined: '#94a3b8' }

  async function load() {
    setLoading(true)
    let q = supabase.from('demo_requests').select('*').order('created_at', { ascending: false })
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [filter])
  useEffect(() => {
    const chan = supabase.channel('demoreqs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demo_requests' }, (payload) => {
        setRows(prev => [payload.new, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(chan) }
  }, [])

  async function updateStatus(id, status) {
    await supabase.from('demo_requests').update({ status }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tf-text)' }}>Demo Requests</div>
          <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', marginTop: 2 }}>Leads from the landing page "Book a demo" form</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {['all', 'new', 'contacted', 'converted', 'declined'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', fontFamily: 'inherit',
                background: filter === s ? (STATUS_COL[s] || '#0e2a47') : 'var(--tf-surface)',
                borderColor: filter === s ? (STATUS_COL[s] || '#0e2a47') : 'var(--tf-border)',
                color: filter === s ? '#fff' : 'var(--tf-text-sub)' }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button onClick={load} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--tf-border)', background: 'var(--tf-surface)', color: 'var(--tf-text-sub)', fontFamily: 'inherit' }}>↻ Refresh</button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--tf-text-sub)', fontSize: 13 }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tf-text-sub)', fontSize: 13 }}>No demo requests {filter !== 'all' ? `with status "${filter}"` : 'yet'}.</div>
      )}
      {!loading && rows.length > 0 && (
        <div style={{ background: 'var(--tf-panel)', border: '1px solid var(--tf-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr .8fr .8fr .7fr 2fr 100px 110px', gap: 10, padding: '8px 16px', borderBottom: '2px solid var(--tf-border)' }}>
            {['Name', 'Email', 'Phone', 'Firm', 'Team', 'Message', 'Status', 'Date'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--tf-text-sub)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</div>
            ))}
          </div>
          {rows.map(r => {
            const col = STATUS_COL[r.status] || '#94a3b8'
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr .8fr .8fr .7fr 2fr 100px 110px', gap: 10, alignItems: 'center', padding: '11px 16px', borderTop: '1px solid var(--tf-border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tf-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                <a href={`mailto:${r.email}`} style={{ fontSize: 12, color: '#6b8cad', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.email}</a>
                <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.phone || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.firm_name || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--tf-text-sub)' }}>{r.team_size || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.message || ''}>{r.message || '—'}</div>
                <select value={r.status} onChange={e => updateStatus(r.id, e.target.value)}
                  style={{ background: `${col}18`, border: `1px solid ${col}`, borderRadius: 20, padding: '3px 8px', color: col, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                  {['new', 'contacted', 'converted', 'declined'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--tf-text-sub)', fontFamily: "'JetBrains Mono',monospace" }}>
                  {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AdminShell({ cu, onClose }) {
  const [section, setSection] = useState('overview')
  const current = NAV.find(n => n.id === section)

  function renderContent() {
    switch (section) {
      case 'overview':      return <Overview onNavigate={setSection} />
      case 'users':         return <Suspense fallback={<Loader />}><UsersAdmin /></Suspense>
      case 'orgs':          return <Suspense fallback={<Loader />}><OrgsAdmin /></Suspense>
      case 'demoreqs':      return <DemoRequestsAdmin />
      case 'support':       return <Suspense fallback={<Loader />}><SupportAdminView onClose={() => setSection('overview')} embedded /></Suspense>
      case 'billing':       return <Suspense fallback={<Loader />}><BillingAdmin /></Suspense>
      case 'announcements': return <Suspense fallback={<Loader />}><AnnouncementsAdmin cu={cu} onClose={() => setSection('overview')} embedded /></Suspense>
      default:              return null
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: 'var(--tf-bg)' }}>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .4 } }`}</style>
      {/* Top bar */}
      <div style={{ height: 48, flexShrink: 0, background: '#0e1929', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', letterSpacing: '-.01em' }}>🛡 Admin</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', padding: '2px 8px', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 20 }}>taskflowco.in</span>
        </div>
        {current && current.id !== 'overview' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,.45)', fontSize: 12 }}>
            <span>/</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{current.label}</span>
          </div>
        )}
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 14px', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>← Exit Admin</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left sidebar */}
        <div style={{ width: 220, flexShrink: 0, background: '#0e1929', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: 2 }}>
          {NAV.map(n => {
            const active = section === n.id
            return (
              <button key={n.id} onClick={() => setSection(n.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%', transition: 'all .12s',
                  background: active ? 'rgba(255,255,255,.1)' : 'transparent',
                  color: active ? '#fff' : '#c7d2e3' }}>
                <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{n.icon}</span>
                <span style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{n.label}</span>
                {active && <span style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: n.color, flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

function Loader() {
  return <div style={{ padding: 32, color: 'var(--tf-text-sub)', fontSize: 13 }}>Loading…</div>
}
