import React, { useState, useEffect } from 'react'

// Lazy-loaded tour content for the landing page (only fetched when user opens the tour).

const hex2rgb = hex => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(f, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

const HM_DATA = [
  [1,3,2,4,2,1,3,2,4,3,2,1,3,2,4,2,3,1,2,3],
  [2,4,1,3,4,2,1,3,2,4,3,2,4,1,3,2,4,3,1,2],
  [3,2,4,1,2,3,4,2,1,3,4,2,1,3,2,4,1,3,2,4],
  [1,3,2,4,3,1,2,4,3,2,1,4,2,3,1,4,2,3,4,1],
  [4,1,3,2,1,4,3,1,2,4,2,3,1,4,2,3,1,4,2,3],
]
const HM_COLS = ['#1a2035','#2d4a6b','#4a7a9b','#6b8cad','#a5c4de']

const SIDEBAR_NAV = [
  { label: 'Diary',         glyph: '◐', color: '#6366f1' },
  { label: 'WorkZone',      glyph: '◧', color: '#6b8cad' },
  { label: 'Team',          glyph: '◔', color: '#f59e0b' },
  { label: 'Master Data',   glyph: '◓', color: '#8b5cf6' },
  { label: 'Communication', glyph: '◑', color: '#06b6d4' },
  { label: 'Billing',       glyph: '◒', color: '#ec4899' },
  { label: 'Library',       glyph: '◇', color: '#0ea5e9' },
  { label: 'Analytics',     glyph: '◰', color: '#10b981' },
]

function AppChrome({ module, topContent, children, noContentPad }) {
  return (
    <div style={{ display: 'flex', height: '100%', background: '#080b18', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ width: 44, background: '#0a0d1a', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 3, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#6b8cad,#4a7a9b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', marginBottom: 10 }}>✦</div>
        {SIDEBAR_NAV.map(n => {
          const active = n.label === module
          return (
            <div key={n.label} title={n.label} style={{ width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: active ? `rgba(${hex2rgb(n.color)},.18)` : 'transparent', color: active ? n.color : '#2a3350' }}>{n.glyph}</div>
          )
        })}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 40, borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0, background: '#0a0d1a' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#eef0f8' }}>{module}</span>
          <div style={{ flex: 1 }}>{topContent}</div>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#6b8cad,#4a7a9b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>PM</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: noContentPad ? 0 : '14px 16px' }}>{children}</div>
      </div>
    </div>
  )
}

function ScrnWorkZone() {
  const cols = [
    { label: 'Backlog',     color: '#3a4663', tasks: ['GSTR-1 · Patel Trading', 'Audit · Sharma Ltd'] },
    { label: 'In Progress', color: '#6b8cad', tasks: ['GSTR-3B · Acme', 'TDS Q4 · Singh & Co', 'ITR · Mehta'] },
    { label: 'Review',      color: '#f59e0b', tasks: ['Payroll Jun · Acme', 'ROC Filing · Tata'] },
    { label: 'Filed',       color: '#10b981', tasks: ['GSTR-3B · Reliance', 'TDS Apr · Acme', 'ITR FY26 · Patel'] },
  ]
  const topContent = (
    <div style={{ display: 'flex', gap: 3, marginLeft: 14 }}>
      {['Stage', 'Board', 'Calendar', 'List'].map((v, i) => (
        <span key={v} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: i === 1 ? 'rgba(107,140,173,.22)' : 'transparent', color: i === 1 ? '#6b8cad' : '#3a4663', fontWeight: 600 }}>{v}</span>
      ))}
    </div>
  )
  return (
    <AppChrome module="WorkZone" topContent={topContent}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, alignItems: 'start' }}>
        {cols.map(col => (
          <div key={col.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '.07em' }}>{col.label}</span>
              <span style={{ fontSize: 9, color: '#3a4663', marginLeft: 'auto' }}>{col.tasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {col.tasks.map(t => (
                <div key={t} style={{ padding: '8px 9px', background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6, fontSize: 11, color: '#b8c4d8', lineHeight: 1.4 }}>{t}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppChrome>
  )
}

function ScrnTeam() {
  const members = [
    { name: 'Priya Mehta',  role: 'Senior CA', tasks: 14, hrs: 38, color: '#6b8cad' },
    { name: 'Rahul Singh',  role: 'Article',    tasks: 9,  hrs: 42, color: '#f59e0b' },
    { name: 'Sneha Patel',  role: 'Staff',      tasks: 11, hrs: 36, color: '#10b981' },
    { name: 'Amit Joshi',   role: 'Manager',    tasks: 7,  hrs: 29, color: '#8b5cf6' },
  ]
  return (
    <AppChrome module="Team">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8693b0', marginBottom: 8 }}>Workload · last 4 weeks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {HM_DATA.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 3 }}>
                {row.map((v, ci) => (
                  <div key={ci} style={{ flex: 1, height: 10, borderRadius: 2, background: HM_COLS[v - 1] }} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: '#3a4663' }}>
            <span>4 weeks ago</span><span>Today</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {members.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${m.color},${m.color}88)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{m.name.split(' ').map(n => n[0]).join('')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 10, color: '#8693b0' }}>{m.role}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.tasks} tasks</div>
                <div style={{ fontSize: 9, color: '#8693b0' }}>{m.hrs}h</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppChrome>
  )
}

function ScrnComms() {
  const clients = ['Acme Pvt Ltd', 'Singh & Co', 'Mehta Industries', 'Patel Trading', 'Reliance Holdings']
  const msgs = [
    { text: 'Please share the bank statements for April.', time: '10:02', out: true },
    { text: 'Sure, attaching now.', time: '10:18', out: false },
    { text: '📎 BankStmt_Apr26.pdf · 1.2 MB', time: '10:18', out: false },
    { text: 'Got it, will update the worksheet.', time: '10:22', out: true },
  ]
  return (
    <AppChrome module="Communication" noContentPad>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', height: '100%' }}>
        <div style={{ borderRight: '1px solid rgba(255,255,255,.06)', overflow: 'auto' }}>
          {clients.map((c, i) => (
            <div key={c} style={{ padding: '9px 11px', borderBottom: '1px solid rgba(255,255,255,.03)', background: i === 0 ? 'rgba(107,140,173,.12)' : 'transparent', cursor: 'pointer' }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{c}</div>
              <div style={{ fontSize: 9, color: '#8693b0', marginTop: 2 }}>via Client Portal</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '9px 13px', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 11, fontWeight: 700 }}>Acme Pvt Ltd</div>
          <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, overflow: 'auto' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.out ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '72%', padding: '7px 11px', borderRadius: 9, background: m.out ? 'rgba(107,140,173,.22)' : '#0a0d1a', border: `1px solid ${m.out ? 'rgba(107,140,173,.3)' : 'rgba(255,255,255,.06)'}`, fontSize: 11 }}>
                  {m.text}
                  <div style={{ fontSize: 9, color: '#3a4663', marginTop: 3, textAlign: 'right' }}>{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 7 }}>
            <div style={{ flex: 1, height: 30, background: '#0a0d1a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '0 9px', fontSize: 11, color: '#3a4663', display: 'flex', alignItems: 'center' }}>Type a message…</div>
            <div style={{ width: 30, height: 30, background: '#6b8cad', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>↑</div>
          </div>
        </div>
      </div>
    </AppChrome>
  )
}

function ScrnLibrary() {
  const sections = [
    { label: 'SOPs',        color: '#6366f1', items: ['GSTR-3B filing SOP', 'TDS payment checklist', 'ITR data prep guide', 'Audit planning SOP'] },
    { label: 'Credentials', color: '#ec4899', items: ['Income Tax portal', 'GST portal', 'MCA21 login', 'Traces – TDS'] },
    { label: 'Resources',   color: '#0ea5e9', items: ['ICAI guidance notes', 'Budget 2026 summary', 'GST circulars FY26', 'Ind AS reference'] },
  ]
  return (
    <AppChrome module="Library">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {sections.map(sec => (
          <div key={sec.label} style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: sec.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 9 }}>{sec.label}</div>
            {sec.items.map(it => (
              <div key={it} style={{ padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.03)', fontSize: 11, color: '#b8c4d8', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgba(${hex2rgb(sec.color)},.16)`, color: sec.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0 }}>◇</span>
                {it}
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppChrome>
  )
}

function ScrnAnalytics() {
  const kpis = [['147', 'Works filed', '#10b981'], ['₹4.2L', 'Billed MTD', '#6b8cad'], ['92h', 'Hours logged', '#f59e0b'], ['8', 'Overdue', '#ef4444']]
  const bars = [['Priya M', 95], ['Rahul S', 72], ['Sneha P', 83], ['Amit J', 61]]
  return (
    <AppChrome module="Analytics">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9 }}>
          {kpis.map(([v, l, c]) => (
            <div key={l} style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 8, padding: '11px 13px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, letterSpacing: '-.02em' }}>{v}</div>
              <div style={{ fontSize: 10, color: '#8693b0', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: '11px 13px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8693b0', marginBottom: 10 }}>Staff performance · this month</div>
          {bars.map(([n, p]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#b8c4d8', width: 56, flexShrink: 0 }}>{n}</span>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p}%`, background: 'linear-gradient(90deg,#6b8cad,#a5b4fc)', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: '#6b8cad', width: 28, textAlign: 'right', fontWeight: 700 }}>{p}%</span>
            </div>
          ))}
        </div>
      </div>
    </AppChrome>
  )
}

function ScrnBilling() {
  const invoices = [
    { client: 'Acme Pvt Ltd',     num: 'INV-142', amt: '₹20,500', status: 'Paid',    col: '#10b981' },
    { client: 'Singh & Co',       num: 'INV-143', amt: '₹8,000',  status: 'Sent',    col: '#6b8cad' },
    { client: 'Mehta Industries', num: 'INV-144', amt: '₹15,000', status: 'Draft',   col: '#f59e0b' },
    { client: 'Patel Trading',    num: 'INV-145', amt: '₹5,500',  status: 'Overdue', col: '#ef4444' },
  ]
  return (
    <AppChrome module="Billing" noContentPad>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
        <div style={{ borderRight: '1px solid rgba(255,255,255,.06)', overflow: 'auto' }}>
          {invoices.map(inv => (
            <div key={inv.num} style={{ padding: '9px 11px', borderBottom: '1px solid rgba(255,255,255,.03)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{inv.client}</span>
                <span style={{ fontSize: 11, color: inv.col, fontWeight: 700 }}>{inv.amt}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#8693b0' }}>{inv.num}</span>
                <span style={{ fontSize: 9, color: inv.col }}>{inv.status}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>INV-142 · Acme Pvt Ltd</span>
            <span style={{ padding: '2px 9px', background: 'rgba(16,185,129,.16)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 100, fontSize: 10, color: '#10b981', fontWeight: 700 }}>Paid</span>
          </div>
          {[['GSTR-3B · April 2026', '5,000'], ['TDS Q4 payment', '3,500'], ['ITR data preparation', '12,000']].map(([l, a]) => (
            <div key={l} style={{ display: 'flex', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.04)', fontSize: 11 }}>
              <span style={{ flex: 1 }}>{l}</span><span style={{ fontWeight: 700 }}>₹{a}</span>
            </div>
          ))}
          <div style={{ display: 'flex', padding: '9px 0', borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 12, fontWeight: 800 }}>
            <span style={{ flex: 1 }}>Total</span><span>₹20,500</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['Tally XML', 'Zoho', 'Email', 'Print'].map(b => (
              <div key={b} style={{ padding: '4px 9px', background: '#0a0d1a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, fontSize: 10, color: '#8693b0', cursor: 'pointer' }}>{b}</div>
            ))}
          </div>
        </div>
      </div>
    </AppChrome>
  )
}

const TOUR_SLIDES = [
  { img: '/tour/slide-00.png', module: 'Your Diary',         color: '#6366f1', title: 'Personal Dashboard & Plan My Day',
    bullets: ["Today's tasks at a glance — across every workspace", 'Plan My Day side panel for focused execution', 'Overdue, today, this-week filters built-in'],
    desc: 'Open TaskFlowCo and your Diary greets you with a personalised dashboard. Every task you own, sorted by status, work type, or due date. The Plan My Day sidebar lets you batch tasks for focused execution.' },
  { img: '/tour/slide-01.png', module: 'Your Diary',         color: '#6366f1', title: 'Kanban Board by Status',
    bullets: ['Pending · In Progress · Under Review · Done columns', 'Client + work type stamped on every card', 'Drag any card to update its status'],
    desc: 'The Board view brings classic Kanban organisation to compliance work. See every task as a card, organised by status. Drag cards across columns to update progress — never lose track of where a return stands.' },
  { img: '/tour/slide-02.png', module: 'Your Diary',         color: '#6366f1', title: 'Group by Work Type',
    bullets: ['GSTR 1 · GSTR 3B · ITR · TDS columns', 'Same data, completely different lens', 'One toggle switches the entire view'],
    desc: 'Switch from status grouping to work-type grouping with a single toggle. Now you see all GSTR 1 tasks together, all TDS returns together — perfect for week-end compliance reviews and capacity planning.' },
  { img: '/tour/slide-03.png', module: 'Your Diary',         color: '#6366f1', title: 'Monthly Deadline Calendar',
    bullets: ['Every due date mapped onto the month', 'Click any date to see what is due', 'Spot crunch days before they arrive'],
    desc: 'The Calendar view maps every compliance deadline across the month. Hover or click any date to see exactly what is due. Plan the next week, anticipate the GSTR-3B crunch, and never miss filing dates.' },
  { img: '/tour/slide-04.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Master Worksheets Grid',
    bullets: ['Every client × every work type in one grid', 'Status, assignee, due date per cell', 'Grid · Pipeline · Funnel views — one click'],
    desc: 'WorkZone Worksheets are your master compliance grid. Every client across every work type, one period at a time. Switch between Grid (table), Pipeline (kanban) and Funnel (stages) views without losing context.' },
  { img: '/tour/slide-05.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Stage-by-Stage Pipeline',
    bullets: ['Not Started → Data Collection → Working → Done', 'Drag cards to advance the stage', 'Filter by period, assignee, or work type'],
    desc: 'The Pipeline view turns compliance work into a visual progress board. Drag client cards through stages: Not Started, Data Collection, Working, Review, Done. See bottlenecks at a glance and re-assign work in seconds.' },
  { img: '/tour/slide-06.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Funnel View — Spot Bottlenecks',
    bullets: ['Total clients at every stage', 'Colour-coded completion percentage', 'Identify stuck clients before deadlines'],
    desc: 'The Funnel view shows completion rates at each stage. Spot where work is piling up before it becomes a deadline crisis. Drill into any stage to see which clients are stuck and why.' },
  { img: '/tour/slide-07.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Big Clients — Monthly Checklist',
    bullets: ['Accounting · Reconciliation · Finalisation', 'Per-client structured monthly checklist', 'Every recurring deliverable, tracked'],
    desc: 'For your major retainer clients — those needing monthly accounting, reconciliation, and finalisation — Big Clients provides a dedicated structured checklist. Never miss a recurring deliverable again.' },
  { img: '/tour/slide-08.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Team Workload Heatmap',
    bullets: ['Active tasks per team member', '7d · 14d · 30d capacity views', 'Spot overloaded and idle members fast'],
    desc: "Team Workload shows every member's active tasks, overdue count, and capacity utilisation. Delegate smartly — see who has room, redistribute before bottlenecks become missed deadlines." },
  { img: '/tour/slide-09.png', module: 'Team',               color: '#f59e0b', title: 'Daily Logs — Attendance & Hours',
    bullets: ['Auto-tracked working days per member', 'Leaves and overtime captured', 'Per-member time entries on tasks'],
    desc: 'Daily Logs automatically track attendance, leaves, and time entries. Useful for billing, payroll calculations, and understanding which work types consume the most team hours.' },
  { img: '/tour/slide-10.png', module: 'Library',            color: '#10b981', title: 'Credentials Vault',
    bullets: ['GST · Income Tax · MCA · Banking', 'Searchable by client name or PAN', 'Encrypted at rest, audit-logged access'],
    desc: 'The Credentials Library stores every portal password — GST portal, Income Tax, MCA, banking — encrypted and instant to retrieve. Stop the WhatsApp scramble when a client asks for a download.' },
  { img: '/tour/slide-11.png', module: 'Analytics',          color: '#10b981', title: 'Org-Wide Performance Dashboard',
    bullets: ['Tasks completed · pending · overdue', 'Breakdown by work type', 'Drill into any segment for details'],
    desc: 'Analytics gives owners and partners an org-wide compliance dashboard. See total tasks completed this FY, pending breakdown by work type, and overdue heatmap — all in real-time, all auto-computed.' },
  { img: '/tour/slide-12.png', module: 'Communication',      color: '#06b6d4', title: 'Client Connect — Document Requests',
    bullets: ['Raise GST / IT data requests directly', 'Track per-client request status', 'Reminders auto-sent on schedule'],
    desc: 'Client Connect lets you raise document requests directly to clients. No more WhatsApp follow-ups — track every request status and let TaskFlowCo auto-send reminders on a schedule you define.' },
  { img: '/tour/slide-13.png', module: 'Communication',      color: '#06b6d4', title: 'Shareable Client Portal',
    bullets: ['One simple shareable link per client', 'Upload without login or signup', 'No app download required'],
    desc: 'Clients receive a simple shareable link. They upload documents directly — no login, no app, no friction. Documents land in your TaskFlowCo workspace, automatically tagged to the right task.' },
  { img: '/tour/slide-14.png', module: 'Communication',      color: '#06b6d4', title: 'Bulk Email to Clients',
    bullets: ['Filter clients by work type', 'Templates for common messages', 'BCC by default for client privacy'],
    desc: 'Bulk Email lets you compose once and send to all your clients — filter by work type, use templates for common messages, BCC by default for privacy. Perfect for filing-deadline reminders.' },
  { img: '/tour/slide-15.png', module: 'Billing',            color: '#ec4899', title: 'GST-Compliant Tax Invoice',
    bullets: ['Auto-calculated GST + TDS deductions', 'Partial payments tracked per invoice', 'Send · Share · Mark Paid — all in one panel'],
    desc: 'Generate GST-compliant tax invoices in seconds with automatic TDS deduction and GST rate selection. Track partial payments, send via email, and share secure PDF links — all from one panel.' },
  { img: '/tour/slide-16.png', module: 'Billing',            color: '#ec4899', title: 'Complete Client Statement',
    bullets: ['Invoiced · Paid · TDS Credit · Balance', 'Outstanding amount calculated automatically', 'Generate & print in a single click'],
    desc: 'Pull a full client statement in one click — total invoiced, amounts paid, TDS credit available, and outstanding balance. Useful for year-end reconciliation, dispute resolution, and client review meetings.' },
  { img: '/tour/slide-17.png', module: 'Billing',            color: '#ec4899', title: 'Export to Tally · Zoho · Excel',
    bullets: ['Tally JSON · Zoho Books CSV · Excel XLSX', 'Import-ready format, no clean-up needed', 'All formats always current'],
    desc: 'Export all your TaskFlowCo billing data to Tally, Zoho Books, or Excel — import-ready, with one click. Stop the manual data entry between systems. Save 2-3 hours per month, every month.' },
  { img: '/tour/slide-18.png', module: 'TaskFlowCo',         color: '#6366f1', title: 'One Platform, Zero Chaos',
    bullets: ['Work · Clients · Team · Billing in one platform', 'Built specifically for Indian CAs', 'Setup in under 10 minutes'],
    desc: 'TaskFlowCo is the operating system for your accounting practice — work, clients, team, and billing in one platform. Built specifically for the way Indian chartered accountants actually work.' },
]

export default function TourModal({ open, onClose }) {
  const [idx, setIdx] = useState(0)
  const total = TOUR_SLIDES.length

  const goPrev = () => setIdx(i => Math.max(0, i - 1))
  const goNext = () => setIdx(i => Math.min(total - 1, i + 1))

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight')  goNext()
      if (e.key === 'ArrowLeft')   goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, idx, onClose])

  useEffect(() => { if (open) setIdx(0) }, [open])

  if (!open) return null
  const s = TOUR_SLIDES[idx]

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div
        className="lp-tour-shell"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1280, height: 'min(740px, 92vh)',
          borderRadius: 16, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 50px 120px rgba(0,0,0,.4)',
          animation: 'lp-modal-in .22s ease',
        }}
      >
        <div className="lp-tour-bar" style={{padding:'14px 18px',borderBottom:'1px solid',display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <div style={{width:24,height:24,borderRadius:7,background:'linear-gradient(135deg,#6366f1,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#fff'}}>✦</div>
            <span style={{fontSize:13,fontWeight:700,color:'var(--lp-text)',letterSpacing:'-0.01em'}}>Product Tour</span>
            <span style={{fontSize:11,color:'var(--lp-text-mut)',fontFamily:"'JetBrains Mono',monospace"}}>· 19 slides</span>
          </div>

          <div style={{display:'flex',gap:3,flex:1,alignItems:'center'}}>
            {TOUR_SLIDES.map((t, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                title={`${t.module} — ${t.title}`}
                className={i === idx ? '' : i < idx ? 'lp-tour-seg-done' : 'lp-tour-seg-empty'}
                style={{
                  height: 4, flex: i === idx ? 3 : 1, border: 'none', borderRadius: 2, padding: 0,
                  background: i === idx ? s.color : undefined,
                  cursor: 'pointer', transition: 'flex .3s ease, background .2s ease',
                }}
              />
            ))}
          </div>

          <button onClick={onClose} className="lp-tour-close" style={{borderRadius:6,cursor:'pointer',padding:'5px 10px',fontSize:11,fontFamily:'inherit',flexShrink:0}}>✕ Esc</button>
        </div>

        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
          <div
            key={`left-${idx}`}
            className="lp-tour-text lp-tour-left-bg"
            style={{
              flex:'0 0 420px',padding:'34px 32px 28px',display:'flex',flexDirection:'column',
              borderRight:'1px solid var(--lp-border)',
              backgroundImage:`linear-gradient(160deg, ${s.color}14 0%, transparent 55%)`,
              overflowY:'auto',minWidth:0,
            }}
          >
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
              <span style={{
                fontSize:10, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase',
                color:s.color, background:`${s.color}26`, padding:'4px 10px', borderRadius:4,
                fontFamily:"'JetBrains Mono',monospace",
              }}>{s.module}</span>
              <span style={{fontSize:11,color:'var(--lp-text-mut)',fontFamily:"'JetBrains Mono',monospace"}}>
                Step {String(idx+1).padStart(2,'0')} / {total}
              </span>
            </div>

            <h2 style={{fontSize:26,fontWeight:800,color:'var(--lp-text)',letterSpacing:'-0.025em',lineHeight:1.18,margin:'0 0 14px'}}>
              {s.title}
            </h2>

            <p style={{fontSize:14,color:'var(--lp-text-sub)',lineHeight:1.62,margin:'0 0 22px'}}>
              {s.desc}
            </p>

            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              {s.bullets.map((b, i) => (
                <div key={i} className="lp-tour-bullet" style={{display:'flex',alignItems:'flex-start',gap:11,padding:'9px 10px',borderRadius:7,transition:'background .15s ease'}}>
                  <span style={{color:s.color,fontSize:12,fontWeight:700,marginTop:2,flexShrink:0,width:14,height:14,borderRadius:4,background:`${s.color}26`,display:'flex',alignItems:'center',justifyContent:'center'}}>✓</span>
                  <span style={{fontSize:13,color:'var(--lp-text)',lineHeight:1.5,opacity:.92}}>{b}</span>
                </div>
              ))}
            </div>

            <div style={{flex:1,minHeight:18}}/>

            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:'var(--lp-text-mut)',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.04em'}}>
              <kbd className="lp-tour-kbd" style={{borderRadius:3,padding:'2px 6px',fontSize:9}}>←</kbd>
              <kbd className="lp-tour-kbd" style={{borderRadius:3,padding:'2px 6px',fontSize:9}}>→</kbd>
              <span style={{marginLeft:4}}>to navigate</span>
              <span style={{marginLeft:12}}>·</span>
              <kbd className="lp-tour-kbd" style={{borderRadius:3,padding:'2px 6px',fontSize:9}}>Esc</kbd>
              <span>to close</span>
            </div>
          </div>

          <div className="lp-tour-img-bg" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24,position:'relative',minWidth:0,overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse at 50% 50%, ${s.color}1A 0%, transparent 60%)`,pointerEvents:'none'}}/>
            <img
              key={`img-${idx}`}
              className="lp-tour-img"
              src={s.img}
              alt={s.title}
              style={{
                maxWidth:'100%',maxHeight:'100%',objectFit:'contain',
                borderRadius:10,
                boxShadow:`0 24px 60px rgba(0,0,0,.28), 0 0 0 1px var(--lp-border), 0 0 80px ${s.color}1A`,
                display:'block',
              }}
              draggable={false}
            />
          </div>
        </div>

        <div className="lp-tour-bar" style={{padding:'12px 18px',borderTop:'1px solid',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <button onClick={goPrev} disabled={idx === 0} className="lp-tour-nav-btn">‹  Prev</button>

          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontSize:11,color:'var(--lp-text-mut)',fontFamily:"'JetBrains Mono',monospace"}}>
              {String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')}
            </span>
          </div>

          {idx === total - 1
            ? <button onClick={onClose} className="lp-tour-nav-btn primary">Finish ✓</button>
            : <button onClick={goNext} className="lp-tour-nav-btn primary">Next  ›</button>
          }
        </div>
      </div>
    </div>
  )
}
