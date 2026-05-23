// ITRTour.jsx — ITR Season 2025-26 animated demo (light mode, 50s)
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import TaskflowLogo from './components/TaskflowLogo.jsx'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const Easing = {
  out3:  t => 1 - Math.pow(1-t, 3),
  out2:  t => 1 - (1-t)*(1-t),
  io3:   t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2,
}

const FM = "'JetBrains Mono',ui-monospace,monospace"
const FS = "'Inter',system-ui,sans-serif"
const FD = "'Geist','Inter',system-ui,sans-serif"
const DURATION = 50

const C = {
  bg:'#f5f7fa', panel:'#ffffff', sidebar:'#0e1929', nav:'#0e2a47',
  border:'rgba(0,0,0,0.07)', borderM:'rgba(0,0,0,0.13)',
  text:'#0a1929', sub:'#475569', mut:'#94a3b8',
  indigo:'#6366f1', pink:'#ec4899', cyan:'#06b6d4',
  amber:'#f59e0b', green:'#10b981',
}

const STAGES = [
  { name:'Not Started',      col:'#6b7280', bg:'#f1f5f9', fg:'#374151' },
  { name:'Data Requested',   col:'#38bdf8', bg:'#f0f9ff', fg:'#0369a1' },
  { name:'Data Received',    col:'#3b82f6', bg:'#eff6ff', fg:'#1d4ed8' },
  { name:'Temp Working',     col:'#8b5cf6', bg:'#f5f3ff', fg:'#7c3aed' },
  { name:'Data Recheck',     col:'#f59e0b', bg:'#fffbeb', fg:'#b45309' },
  { name:'Full Working',     col:'#f97316', bg:'#fff7ed', fg:'#c2410c' },
  { name:'Review',           col:'#ec4899', bg:'#fdf2f8', fg:'#be185d' },
  { name:'Partner Approval', col:'#7c3aed', bg:'#faf5ff', fg:'#6d28d9' },
  { name:'Filed',            col:'#22c55e', bg:'#f0fdf4', fg:'#15803d' },
  { name:'Ack Received',     col:'#14b8a6', bg:'#f0fdfa', fg:'#0f766e' },
]

const CLIENTS = [
  { name:'Mehta & Sons',       grp:'M&S', start:'10 Jun', av:{i:'PM',c:C.indigo},  stage:'Filed',            si:8 },
  { name:'Sharma Trading Co',  grp:'STC', start:'15 Jun', av:{i:'NK',c:C.pink},    stage:'Partner Approval', si:7 },
  { name:'Gupta Enterprises',  grp:'GE',  start:'18 Jun', av:{i:'AS',c:C.cyan},    stage:'Review',           si:6 },
  { name:'Patel Holdings',     grp:'PHL', start:'22 Jun', av:{i:'PM',c:C.indigo},  stage:'Full Working',     si:5 },
  { name:'Kapoor & Co',        grp:'K&C', start:'25 Jun', av:{i:'RV',c:C.amber},   stage:'Temp Working',     si:3 },
  { name:'Singh Pvt Ltd',      grp:'SPL', start:'30 Jun', av:{i:'NK',c:C.pink},    stage:'Data Received',    si:2 },
  { name:'Agarwal Industries', grp:'AGL', start:'5 Jul',  av:{i:'AS',c:C.cyan},    stage:'Data Requested',   si:1 },
  { name:'Reliance Advisory',  grp:'RA',  start:'10 Jul', av:{i:'KP',c:C.green},   stage:'Not Started',      si:0 },
  { name:'Tata Consultants',   grp:'TC',  start:'15 Jul', av:{i:'RV',c:C.amber},   stage:'Not Started',      si:0 },
  { name:'Birla Associates',   grp:'BA',  start:'20 Jul', av:{i:'KP',c:C.green},   stage:'Not Started',      si:0 },
]

const TimeCtx = React.createContext({ time: 0 })
const useTime = () => React.useContext(TimeCtx).time

function Sprite({ start, end, children }) {
  const { time } = React.useContext(TimeCtx)
  if (time < start || time > end) return null
  const t = time - start
  return typeof children === 'function' ? children({ t, p: clamp(t/(end-start),0,1) }) : children
}

function Av({ i, c, size=26 }) {
  return <div style={{ width:size, height:size, borderRadius:size, background:c, flexShrink:0,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:FS, fontWeight:700, fontSize:size*0.4, color:'#fff' }}>{i}</div>
}

function StagePill({ stage }) {
  const s = STAGES.find(x=>x.name===stage)||STAGES[0]
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
      background:s.bg, border:`1px solid ${s.col}55`, borderRadius:100,
      fontFamily:FM, fontSize:10, fontWeight:700, color:s.fg, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:5, background:s.col, flexShrink:0 }}/>
      {stage}
    </span>
  )
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell({ view, children }) {
  return (
    <div style={{ position:'absolute', inset:0, display:'flex', background:C.bg, fontFamily:FS, overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:216, background:C.sidebar, flexShrink:0, display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'17px 18px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <TaskflowLogo size={15} inkColor="#fff" coColor="#7fa3c7" />
        </div>
        <div style={{ padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
          {[
            { l:'← WorkZone',   small:true },
            { l:'Your Diary' },
            { l:'WorkZone',     bold:true },
            { l:'Worksheets',   indent:true, active:true },
            { l:'Board',        indent:true },
            { l:'Big Clients',  indent:true },
            { l:'Team Workload',indent:true },
            { l:'Library' }, { l:'Team' }, { l:'Analytics' },
            { l:'Communication' }, { l:'Billing' }, { l:'Master Data' }, { l:'Set-up' },
          ].map((item,i) => (
            <div key={i} style={{
              padding:`6px ${item.indent?22:10}px`, borderRadius:6,
              background:item.active?'rgba(255,255,255,0.1)':'transparent',
              fontSize:item.small?11:13, fontWeight:item.active||item.bold?600:400,
              color:item.active?'#fff':'rgba(255,255,255,0.42)',
            }}>{item.l}</div>
          ))}
        </div>
      </div>
      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Top nav */}
        <div style={{ height:48, background:'#fff', borderBottom:`1px solid ${C.border}`,
          display:'flex', alignItems:'center', padding:'0 26px', gap:12, flexShrink:0 }}>
          <span style={{ fontSize:13, color:C.sub }}>Home</span>
          <span style={{ color:C.mut }}>/</span>
          <span style={{ fontSize:13, fontWeight:700, color:C.text }}>ABC & Associates</span>
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 14px',
            background:C.bg, border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, color:C.sub }}>
            Search... <span style={{ fontFamily:FM, fontSize:10, color:C.mut }}>⌘K</span>
          </div>
          {['🔔','📢','⚙'].map(e => (
            <div key={e} style={{ width:32, height:32, borderRadius:6, background:C.bg,
              border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{e}</div>
          ))}
          <div style={{ width:34, height:34, borderRadius:17, background:C.indigo,
            display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14 }}>R</div>
        </div>
        {/* Page header */}
        <div style={{ padding:'16px 26px 0', background:'#fff', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:21, fontWeight:800, color:C.text, letterSpacing:'-0.02em' }}>Worksheets</div>
              <div style={{ fontSize:12, color:C.sub, marginTop:1 }}>ITR 2025-26 · All clients</div>
            </div>
            <div style={{ flex:1 }}/>
            {['↻ Recalc Dates','Archive','↓ Export'].map((b,i) => (
              <div key={b} style={{ padding:'6px 14px', marginLeft:8, borderRadius:7, fontSize:12, fontWeight:600,
                background:i===2?C.nav:'#fff', border:`1px solid ${i===2?C.nav:C.borderM}`, color:i===2?'#fff':C.sub }}>{b}</div>
            ))}
          </div>
          <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${C.border}` }}>
            {['GST Returns','TDS','ITR','⊕ Unclassified'].map((t,i) => (
              <div key={t} style={{ padding:'8px 18px', fontSize:13, fontWeight:i===2?700:500,
                color:i===2?C.nav:i===3?C.amber:C.sub,
                borderBottom:i===2?`2px solid ${C.nav}`:'2px solid transparent' }}>{t}</div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, marginBottom:10 }}>
            <span style={{ fontSize:11, fontWeight:600, color:C.sub }}>PERIOD:</span>
            <div style={{ padding:'4px 10px', background:'#f8fafc', border:`1px solid ${C.borderM}`, borderRadius:6, fontSize:12, color:C.sub }}>FY 2025-26 ▼</div>
            <div style={{ padding:'4px 12px', background:C.nav, border:`1px solid ${C.nav}`, borderRadius:6, fontSize:12, fontWeight:700, color:'#fff' }}>FY 2025-26</div>
            <div style={{ width:1, height:18, background:C.border, margin:'0 4px' }}/>
            {['Grid','Pipeline','Funnel'].map(v => (
              <div key={v} style={{ padding:'4px 14px', borderRadius:6, fontSize:12, fontWeight:600,
                background:v===view?C.nav:'#fff', border:`1px solid ${v===view?C.nav:C.borderM}`,
                color:v===view?'#fff':C.sub, transition:'all 0.2s' }}>{v}</div>
            ))}
            <div style={{ flex:1 }}/>
            {['↩ Copy from','⊞ Columns','Mine Only'].map(b => (
              <div key={b} style={{ padding:'4px 12px', background:'#fff', border:`1px solid ${C.borderM}`,
                borderRadius:6, fontSize:12, color:C.sub }}>{b}</div>
            ))}
          </div>
        </div>
        {/* Content */}
        <div style={{ flex:1, overflow:'hidden', padding:'8px 26px 20px', position:'relative' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Grid View ─────────────────────────────────────────────────────────────────
function GridView({ t }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 148px 1.4fr 1fr 120px',
        padding:'9px 18px', borderBottom:`1px solid ${C.border}`, background:'#f8fafc',
        fontFamily:FM, fontSize:10, fontWeight:700, color:C.mut,
        textTransform:'uppercase', letterSpacing:'0.12em', gap:14 }}>
        {['CLIENT ↑↓','ASSIGNEE ↑↓','START BY ↑↓','STAGE ↑↓','COMMENTS','TASK CARD'].map((h,i) => (
          <span key={h} style={{ color:i===2?C.nav:C.mut, fontWeight:i===2?800:700 }}>{h}</span>
        ))}
      </div>
      {CLIENTS.map((c,i) => {
        const p = Easing.out3(clamp((t - i*0.22)/0.55, 0, 1))
        const s = STAGES[c.si]
        return (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 148px 1.4fr 1fr 120px', gap:14,
            alignItems:'center', padding:'11px 18px', borderBottom:`1px solid ${C.border}`,
            background:i%2===0?'#fff':'#fafbfc', opacity:p, transform:`translateX(${(1-p)*18}px)` }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                <span style={{ width:7, height:7, borderRadius:7, background:C.indigo, flexShrink:0 }}/>
                <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.name}</span>
                <span style={{ fontFamily:FM, fontSize:9, padding:'1px 5px', borderRadius:3,
                  background:'#f1f5f9', color:C.mut }}>{c.grp}</span>
              </div>
              <div style={{ fontFamily:FM, fontSize:10, color:C.mut, paddingLeft:15 }}>Due: 31 Jul 2026</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Av i={c.av.i} c={c.av.c} size={24}/>
              <div style={{ padding:'4px 9px', background:'#f8fafc', border:`1px solid ${C.border}`,
                borderRadius:6, fontSize:12, color:C.sub }}>{c.av.i} ▼</div>
            </div>
            <div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 10px',
                background:'rgba(14,42,71,0.06)', border:'1.5px solid rgba(14,42,71,0.22)',
                borderRadius:7, fontFamily:FM, fontSize:12, fontWeight:700, color:C.nav }}>
                📅 {c.start}
              </div>
              <div style={{ fontFamily:FM, fontSize:9, color:C.mut, marginTop:2 }}>always show</div>
            </div>
            <StagePill stage={c.stage}/>
            <span style={{ fontSize:12, color:C.mut, fontStyle:'italic' }}>Quick note…</span>
            <div style={{ padding:'5px 10px', background:'#fff', border:`1px solid ${C.borderM}`,
              borderRadius:6, fontSize:12, fontWeight:600, color:C.sub, textAlign:'center' }}>
              {c.si===8?'✓ Filed':'+ Create'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Task Card Panel (Comments) ────────────────────────────────────────────────
const THREAD = [
  { who:'Priya M',  i:'PM', c:C.indigo,  time:'10:14', txt:'Documents received. P&L and balance sheet both attached. Starting computation now.' },
  { who:'Naveen K', i:'NK', c:C.pink,    time:'10:22', txt:'@Priya — capital gains from share sale needs attention. Client mentioned MF redemptions too.', mention:true },
  { who:'Priya M',  i:'PM', c:C.indigo,  time:'10:31', txt:'On it. Reconciling AIS with broker statement. Capital gains schedule almost done.' },
  { who:'Partner',  i:'RP', c:'#7c3aed', time:'11:05', txt:'Review done. Interest income discrepancy ₹4,200 — confirm with client before filing.' },
]

function CommentPanel({ slideP, commP }) {
  return (
    <div style={{ position:'absolute', top:0, right:0, bottom:0, width:480,
      background:'#fff', borderLeft:`1px solid ${C.border}`, zIndex:10,
      boxShadow:'-8px 0 32px rgba(0,0,0,0.09)',
      transform:`translateX(${(1-slideP)*100}%)`,
      display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'18px 22px 14px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center' }}>
          <span style={{ fontSize:17, fontWeight:800, color:C.text }}>Patel Holdings</span>
          <div style={{ flex:1 }}/>
          <span style={{ fontSize:20, color:C.mut }}>×</span>
        </div>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'18px 22px' }}>
        {/* Stage pills */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontFamily:FM, fontSize:9, fontWeight:700, color:C.mut,
            letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:9 }}>STAGE</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {STAGES.map((s,i) => (
              <div key={s.name} style={{ padding:'4px 11px', borderRadius:100,
                background:i===5?C.nav:s.bg, border:`1px solid ${i===5?C.nav:s.col+'55'}`,
                fontFamily:FM, fontSize:10, fontWeight:700, color:i===5?'#fff':s.fg }}>
                {s.name}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }}>
            <span style={{ padding:'3px 9px', background:'#f1f5f9', border:`1px solid ${C.border}`,
              borderRadius:6, fontFamily:FM, fontSize:11, fontWeight:700, color:C.sub }}>MEDIUM</span>
            <span style={{ fontFamily:FM, fontSize:11, color:C.sub }}>Due: 31 Jul 2026</span>
          </div>
        </div>
        {/* Quick note */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontFamily:FM, fontSize:9, fontWeight:700, color:C.mut,
            letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:8 }}>QUICK NOTE</div>
          <div style={{ padding:'9px 12px', background:'#fafafa', border:`1px solid ${C.border}`,
            borderRadius:8, fontSize:13, color:C.sub }}>Capital gains + MF redemptions — confirm AIS</div>
        </div>
        {/* Comments */}
        <div>
          <div style={{ fontFamily:FM, fontSize:9, fontWeight:700, color:C.mut,
            letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:12 }}>COMMENTS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {THREAD.map((msg,i) => {
              const cp = Easing.out3(clamp((commP - i*0.22)/0.38, 0, 1))
              return (
                <div key={i} style={{ display:'flex', gap:9, opacity:cp, transform:`translateY(${(1-cp)*8}px)` }}>
                  <Av i={msg.i} c={msg.c} size={28}/>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'baseline', marginBottom:3 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{msg.who}</span>
                      <span style={{ fontFamily:FM, fontSize:10, color:C.mut }}>{msg.time}</span>
                    </div>
                    <div style={{ fontSize:12.5, lineHeight:1.55, color:C.text,
                      padding:'9px 12px', background:'#f8fafc', borderRadius:8, border:`1px solid ${C.border}` }}>
                      {msg.mention
                        ? <><span style={{ background:'rgba(99,102,241,0.12)', color:C.indigo,
                            padding:'1px 6px', borderRadius:4, fontWeight:700 }}>@Priya</span>
                          {' — capital gains from share sale needs attention. Client mentioned MF redemptions too.'}</>
                        : msg.txt}
                    </div>
                  </div>
                </div>
              )
            })}
            <div style={{ display:'flex', gap:9, marginTop:4 }}>
              <Av i='R' c={C.indigo} size={28}/>
              <div style={{ flex:1, padding:'9px 12px', background:'#fafafa', border:`1px solid ${C.border}`,
                borderRadius:8, fontSize:12.5, color:C.mut }}>
                Add a comment… (Enter to post, Shift+Enter new line)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Pipeline View ─────────────────────────────────────────────────────────────
const PIPE = ['Not Started','Data Requested','Data Received','Temp Working','Full Working','Review','Partner Approval','Filed']

function PipelineView({ t }) {
  const byStage = {}
  PIPE.forEach(s => { byStage[s] = [] })
  CLIENTS.forEach(c => { if (byStage[c.stage] !== undefined) byStage[c.stage].push(c) })
  return (
    <div style={{ display:'flex', gap:10, height:'100%', overflowX:'auto', paddingBottom:4 }}>
      {PIPE.map((name,si) => {
        const s = STAGES.find(x=>x.name===name)||STAGES[0]
        const cards = byStage[name]||[]
        const cp = Easing.out3(clamp((t - si*0.13)/0.5, 0, 1))
        return (
          <div key={name} style={{ minWidth:188, flex:1, display:'flex', flexDirection:'column', gap:7,
            opacity:cp, transform:`translateY(${(1-cp)*12}px)` }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, paddingBottom:6,
              borderBottom:`2px solid ${s.col}` }}>
              <span style={{ width:8, height:8, borderRadius:8, background:s.col, flexShrink:0 }}/>
              <span style={{ fontFamily:FM, fontSize:10, fontWeight:700, color:s.fg,
                letterSpacing:'0.08em', textTransform:'uppercase', flex:1 }}>{name}</span>
              <span style={{ fontFamily:FM, fontSize:10, color:C.mut,
                background:'#f1f5f9', padding:'1px 8px', borderRadius:10 }}>{cards.length}</span>
            </div>
            {cards.map((c,ci) => {
              const cardP = Easing.out3(clamp((t-(si*0.13+ci*0.14+0.28))/0.38, 0, 1))
              return (
                <div key={ci} style={{ padding:'11px 13px', background:'#fff',
                  border:`1px solid ${s.col}33`, borderLeft:`3px solid ${s.col}`, borderRadius:9,
                  boxShadow:'0 2px 6px rgba(0,0,0,0.05)',
                  opacity:cardP, transform:`translateY(${(1-cardP)*8}px)` }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4 }}>
                    <span style={{ width:5, height:5, borderRadius:5, background:C.indigo, flexShrink:0 }}/>
                    <span style={{ fontSize:12.5, fontWeight:700, color:C.text }}>{c.name}</span>
                  </div>
                  <div style={{ fontFamily:FM, fontSize:10, color:C.mut, marginBottom:7 }}>Due: 31 Jul</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Av i={c.av.i} c={c.av.c} size={19}/>
                    <span style={{ fontFamily:FM, fontSize:10, color:C.sub }}>Start: {c.start}</span>
                  </div>
                </div>
              )
            })}
            {cards.length===0 && (
              <div style={{ padding:'16px', border:`1.5px dashed ${C.border}`, borderRadius:9,
                fontFamily:FM, fontSize:10, color:C.mut, textAlign:'center' }}>Drop here</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Funnel View ───────────────────────────────────────────────────────────────
function FunnelView({ t }) {
  const counts = {}
  STAGES.forEach(s => { counts[s.name] = 0 })
  CLIENTS.forEach(c => { counts[c.stage]++ })
  return (
    <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:10,
      padding:'22px 26px', display:'flex', flexDirection:'column', gap:9 }}>
      {STAGES.map((s,i) => {
        const count = counts[s.name]||0
        const pct = Math.round((count/CLIENTS.length)*100)
        const bp = Easing.out3(clamp((t - i*0.11)/0.65, 0, 1))
        return (
          <div key={s.name} style={{ display:'flex', alignItems:'center', gap:14,
            opacity:bp, transform:`translateX(${(1-bp)*-12}px)` }}>
            <div style={{ width:168, fontFamily:FS, fontSize:13, fontWeight:600,
              color:C.text, textAlign:'right', flexShrink:0 }}>{s.name}</div>
            <div style={{ flex:1, height:36, background:'#f1f5f9', borderRadius:6, overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:6, background:s.col,
                width:`${bp * (count>0 ? Math.max(pct,8) : 4)}%`,
                display:'flex', alignItems:'center', paddingLeft:12 }}>
                <span style={{ fontFamily:FM, fontSize:11, fontWeight:700,
                  color:count>0?'#fff':'rgba(255,255,255,0.6)', whiteSpace:'nowrap' }}>
                  {count} client{count!==1?'s':''}
                </span>
              </div>
            </div>
            <div style={{ width:42, fontFamily:FM, fontSize:12, fontWeight:700,
              color:count>0?s.col:C.mut, textAlign:'right', flexShrink:0 }}>{pct}%</div>
          </div>
        )
      })}
      <div style={{ marginTop:4, paddingTop:10, borderTop:`1px solid ${C.border}`,
        fontFamily:FM, fontSize:11, color:C.sub, textAlign:'center' }}>
        All clients across all stages · Deadline: 31 Jul 2026
      </div>
    </div>
  )
}

// ── Callout box ───────────────────────────────────────────────────────────────
function Callout({ op, side='right', title, body, children }) {
  const pos = side==='right' ? { right:70, bottom:70 } : { left:270, bottom:70 }
  return (
    <div style={{ position:'absolute', ...pos, width:360,
      padding:'20px 24px', background:C.nav, borderRadius:14,
      boxShadow:'0 20px 50px rgba(14,42,71,0.38)',
      opacity:op, transform:`translateY(${(1-op)*10}px)`, zIndex:20 }}>
      <div style={{ fontFamily:FD, fontSize:20, fontWeight:800, color:'#fff', marginBottom:8 }}>{title}</div>
      <div style={{ fontFamily:FS, fontSize:13.5, color:'rgba(255,255,255,0.72)', lineHeight:1.6 }}>{body}</div>
      {children}
    </div>
  )
}

// ── Scenes ────────────────────────────────────────────────────────────────────

function SceneIntro() {
  return (
    <Sprite start={0} end={5}>
      {({ t }) => {
        const logo  = Easing.out3(clamp(t/0.8,0,1))
        const h1    = Easing.out3(clamp((t-0.7)/0.9,0,1))
        const badge = Easing.out3(clamp((t-1.4)/0.6,0,1))
        const chips = Easing.out3(clamp((t-2.0)/0.8,0,1))
        const exit  = clamp((t-4.2)/0.6,0,1)
        return (
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(135deg,#0b1322,#132040,#0e2a47)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            opacity:1-exit }}>
            <div style={{ position:'absolute', inset:0,
              backgroundImage:`linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)`,
              backgroundSize:'80px 80px', opacity:0.7,
              maskImage:'radial-gradient(ellipse at center,black,transparent 70%)' }}/>
            <div style={{ opacity:logo, transform:`scale(${0.9+0.1*logo})`, marginBottom:36 }}>
              <TaskflowLogo size={40} inkColor="#fff" coColor="#7fa3c7" />
            </div>
            <div style={{ textAlign:'center', opacity:h1, transform:`translateY(${(1-h1)*22}px)`, marginBottom:24 }}>
              <div style={{ fontFamily:FD, fontSize:92, fontWeight:800, color:'#fff',
                letterSpacing:'-0.04em', lineHeight:0.95 }}>ITR Season</div>
              <div style={{ fontFamily:FD, fontSize:92, fontWeight:800, color:'#7fa3c7',
                letterSpacing:'-0.04em', lineHeight:1.1 }}>2025-26</div>
            </div>
            <div style={{ opacity:badge, transform:`translateY(${(1-badge)*12}px)`, marginBottom:32 }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 24px',
                background:'rgba(239,68,68,0.14)', border:'1px solid rgba(239,68,68,0.36)', borderRadius:100,
                fontFamily:FM, fontSize:14, color:'#fca5a5', fontWeight:700, letterSpacing:'0.07em' }}>
                <span style={{ width:8, height:8, borderRadius:8, background:'#ef4444',
                  boxShadow:'0 0 0 4px rgba(239,68,68,0.22)' }}/>
                Deadline: 31 July 2026 · ITR filings
              </div>
            </div>
            <div style={{ display:'flex', gap:10, opacity:chips, transform:`translateY(${(1-chips)*10}px)` }}>
              {['Grid + Start By','Pipeline','Funnel','Comments'].map((l,i) => (
                <div key={i} style={{ padding:'8px 18px', background:'rgba(255,255,255,0.06)',
                  border:'1px solid rgba(255,255,255,0.1)', borderRadius:100,
                  fontFamily:FM, fontSize:11, color:'rgba(255,255,255,0.55)',
                  letterSpacing:'0.1em', textTransform:'uppercase' }}>{l}</div>
              ))}
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneGrid() {
  return (
    <Sprite start={5} end={20}>
      {({ t }) => {
        const enter   = Easing.out3(clamp(t/0.6,0,1))
        const callout = clamp((t-4.0)/0.6,0,1) - clamp((t-12)/0.5,0,1)
        const exit    = clamp((t-13.5)/0.6,0,1)
        return (
          <div style={{ position:'absolute', inset:0, opacity:enter*(1-exit) }}>
            <AppShell view="Grid">
              <GridView t={clamp((t-0.4)/2.2,0,1)*12}/>
            </AppShell>
            <Callout op={callout} title="★ Plan with Start By dates" body="Set a start date per client — spread ITR work across June and July. No last-minute July crunch, no team overload.">
              <div style={{ marginTop:14, display:'flex', gap:8 }}>
                {[['Mehta','10 Jun',C.indigo],['Kapoor','25 Jun',C.cyan],['Tata','15 Jul',C.amber]].map(([n,d,c]) => (
                  <div key={n} style={{ flex:1, padding:'8px 10px', background:'rgba(255,255,255,0.08)',
                    border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, textAlign:'center' }}>
                    <div style={{ fontFamily:FM, fontSize:10, color:'rgba(255,255,255,0.5)' }}>{n}</div>
                    <div style={{ fontFamily:FM, fontSize:12, fontWeight:700, color:'#fff', marginTop:2 }}>📅 {d}</div>
                  </div>
                ))}
              </div>
            </Callout>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneComments() {
  return (
    <Sprite start={20} end={34}>
      {({ t }) => {
        const enter   = Easing.out3(clamp(t/0.5,0,1))
        const slideP  = Easing.out3(clamp((t-0.5)/0.7,0,1))
        const commP   = clamp((t-1.4)/5.5,0,1) * (THREAD.length + 0.5)
        const callout = clamp((t-7.0)/0.6,0,1) - clamp((t-12)/0.5,0,1)
        const exit    = clamp((t-12.5)/0.6,0,1)
        return (
          <div style={{ position:'absolute', inset:0, opacity:enter*(1-exit) }}>
            <AppShell view="Pipeline">
              <PipelineView t={clamp((t-0.2)/1.8,0,1)*10}/>
              {slideP>0 && <CommentPanel slideP={slideP} commP={commP}/>}
            </AppShell>
            <Callout op={callout} side="left" title="💬 Comments on every task"
              body="Discuss capital gains, MF redemptions, AIS discrepancies — all in context, attached to the client's ITR task. No WhatsApp needed." />
          </div>
        )
      }}
    </Sprite>
  )
}

function ScenePipeline() {
  return (
    <Sprite start={34} end={43}>
      {({ t }) => {
        const enter   = Easing.out3(clamp(t/0.5,0,1))
        const callout = clamp((t-3.5)/0.6,0,1) - clamp((t-7.5)/0.5,0,1)
        const exit    = clamp((t-7.5)/0.5,0,1)
        return (
          <div style={{ position:'absolute', inset:0, opacity:enter*(1-exit) }}>
            <AppShell view="Pipeline">
              <PipelineView t={clamp((t-0.3)/2.5,0,1)*10}/>
            </AppShell>
            <Callout op={callout} title="⊞ Pipeline — drag to move"
              body="See every client's stage at a glance. Drag cards to update status — your whole team stays in sync without a single message." />
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneFunnel() {
  return (
    <Sprite start={43} end={50}>
      {({ t }) => {
        const enter   = Easing.out3(clamp(t/0.5,0,1))
        const callout = clamp((t-4.2)/0.6,0,1)
        return (
          <div style={{ position:'absolute', inset:0, opacity:enter }}>
            <AppShell view="Funnel">
              <FunnelView t={clamp((t-0.3)/3.5,0,1)*10}/>
            </AppShell>
            <Callout op={callout} title="◇ Funnel — partner's view"
              body="Spot bottlenecks before July 31. How many in Review? Partner Approval? Filed? One screen answers everything." />
          </div>
        )
      }}
    </Sprite>
  )
}

// ── Stage engine ──────────────────────────────────────────────────────────────
const BB = {
  width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
  background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)',
  borderRadius:6, color:'#eef0f8', cursor:'pointer', padding:0, flexShrink:0,
}

function Stage({ children }) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const rafRef = useRef(), lastRef = useRef(), trackRef = useRef(), wrapRef = useRef()
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!wrapRef.current) return
    const measure = () => {
      const s = Math.min(wrapRef.current.clientWidth/1920, wrapRef.current.clientHeight/1080)
      setScale(Math.max(0.05,s))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) { lastRef.current = null; return }
    const step = ts => {
      if (!lastRef.current) lastRef.current = ts
      const dt = (ts - lastRef.current)/1000
      lastRef.current = ts
      setTime(t => { const n=t+dt; return n>=DURATION?0:n })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(rafRef.current); lastRef.current=null }
  }, [playing])

  useEffect(() => {
    const k = e => {
      if (e.code==='Space') { e.preventDefault(); setPlaying(p=>!p) }
      if (e.code==='ArrowLeft')  setTime(t=>clamp(t-1,0,DURATION))
      if (e.code==='ArrowRight') setTime(t=>clamp(t+1,0,DURATION))
    }
    window.addEventListener('keydown',k)
    return () => window.removeEventListener('keydown',k)
  }, [])

  const pct = (time/DURATION)*100
  const fmt = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`
  const seek = useCallback(e => {
    if (!trackRef.current) return
    const r = trackRef.current.getBoundingClientRect()
    setTime(clamp(((e.clientX-r.left)/r.width)*DURATION,0,DURATION))
  },[])
  const ctx = useMemo(()=>({time,duration:DURATION}),[time])

  return (
    <div ref={wrapRef} style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:'#050810' }}>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', minHeight:0 }}>
        <div style={{ width:1920, height:1080, position:'relative',
          transform:`scale(${scale})`, transformOrigin:'center', flexShrink:0, overflow:'hidden' }}>
          <TimeCtx.Provider value={ctx}>{children}</TimeCtx.Provider>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
        background:'rgba(10,14,24,0.96)', borderTop:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
        <button onClick={()=>setTime(0)} style={BB}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 2v10M12 2L5 7l7 5V2z" stroke="#eef0f8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button onClick={()=>setPlaying(p=>!p)} style={BB}>
          {playing
            ? <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="3" y="2" width="3" height="10" fill="#eef0f8"/><rect x="8" y="2" width="3" height="10" fill="#eef0f8"/></svg>
            : <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 2l9 5-9 5V2z" fill="#eef0f8"/></svg>}
        </button>
        <span style={{ fontFamily:FM, fontSize:12, color:'#eef0f8', width:50, textAlign:'right', flexShrink:0 }}>{fmt(time)}</span>
        <div ref={trackRef} onMouseDown={e=>{seek(e);setPlaying(false)}}
          style={{ flex:1, height:22, position:'relative', cursor:'pointer', display:'flex', alignItems:'center' }}>
          <div style={{ position:'absolute', left:0, right:0, height:4, background:'rgba(255,255,255,0.1)', borderRadius:2 }}/>
          <div style={{ position:'absolute', left:0, width:`${pct}%`, height:4, background:'#7fa3c7', borderRadius:2 }}/>
          <div style={{ position:'absolute', left:`${pct}%`, top:'50%', width:12, height:12,
            marginLeft:-6, marginTop:-6, background:'#fff', borderRadius:6 }}/>
        </div>
        <span style={{ fontFamily:FM, fontSize:12, color:'#8693b0', width:50, flexShrink:0 }}>{fmt(DURATION)}</span>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────
export default function ITRTour({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const k = e => { if (e.key==='Escape') onClose() }
    document.addEventListener('keydown',k)
    return () => document.removeEventListener('keydown',k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(5,8,18,0.95)',
      display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'11px 20px',
        borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0, background:'rgba(10,14,24,0.95)' }}>
        <span style={{ fontFamily:FM, fontSize:11, color:'#7fa3c7', letterSpacing:'0.18em',
          textTransform:'uppercase', fontWeight:700 }}>ITR Season 2025-26 · Product tour · 50s</span>
        <span style={{ fontFamily:FM, fontSize:10, color:'rgba(134,147,176,0.5)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
          space = play/pause · ← → seek · esc = close
        </span>
        <button onClick={onClose} style={{ marginLeft:'auto', padding:'6px 14px', borderRadius:7,
          background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
          color:'rgba(238,240,248,0.7)', fontSize:13, fontWeight:600, cursor:'pointer',
          fontFamily:FS, display:'flex', alignItems:'center', gap:8 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Close
        </button>
      </div>
      <Stage>
        <SceneIntro/>
        <SceneGrid/>
        <SceneComments/>
        <ScenePipeline/>
        <SceneFunnel/>
      </Stage>
    </div>
  )
}
