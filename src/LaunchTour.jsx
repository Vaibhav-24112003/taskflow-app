// LaunchTour.jsx — Taskflow animated product tour (design: Taskflow Launch.html)
// Self-contained: animation engine + UI primitives + all 11 scenes.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { TOUR_NARRATION, narrationSrc } from './tourNarration'

// ── Easing ───────────────────────────────────────────────────────────────────
const Easing = {
  easeOutCubic:   (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic:    (t) => t * t * t,
  easeInOutCubic: (t) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2,
  easeOutBack:    (t) => { const c = 1.70158+1; return 1 + c*Math.pow(t-1,3) + 1.70158*Math.pow(t-1,2) },
  easeInQuad:     (t) => t*t,
  easeOutQuad:    (t) => 1-(1-t)*(1-t),
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── Brand ────────────────────────────────────────────────────────────────────
const TF = {
  bg:'#0B2237', bg2:'#0E2A47', panel:'#0F2C49', surface:'#143A5E',
  border:'rgba(255,255,255,0.08)', borderHov:'rgba(255,255,255,0.18)',
  text:'#EAF1F8', sub:'#9FB6D4', mut:'#4A6485',
  accent:'#2F6BFF', accentBright:'#5B9BFF',
  good:'#1FA971', warn:'#F4A52A', bad:'#EF4444',
  violet:'#2F6BFF', cyan:'#14C7C0', pink:'#ec4899', amber:'#F4A52A',
}
const FD = "'Geist','Inter',system-ui,sans-serif"
const FS = "'Inter',system-ui,sans-serif"
const FM = "'JetBrains Mono',ui-monospace,monospace"

// ── Animation context ─────────────────────────────────────────────────────────
const TimeCtx = React.createContext({ time: 0, duration: 80 })
const useTime = () => React.useContext(TimeCtx).time

function Sprite({ start, end, children }) {
  const { time } = React.useContext(TimeCtx)
  if (time < start || time > end) return null
  const localTime = time - start
  const progress = clamp(localTime / (end - start), 0, 1)
  return typeof children === 'function' ? children({ localTime, progress }) : children
}

// ── UI primitives ─────────────────────────────────────────────────────────────
// Self-drawing gradient checkmark (the "w" leg) — matches the app/landing logo.
var _tourGradSeq = 0
function CheckLeg({ draw=1, gradId }) {
  const off = 64 * (1 - clamp(draw, 0, 1))
  return (
    <svg viewBox="0 0 72 92" style={{ height:'100%', width:'auto', display:'block', overflow:'visible' }} aria-hidden="true">
      <defs><linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#5B9BFF"/><stop offset="1" stopColor="#14C7C0"/></linearGradient></defs>
      <path d="M4 56 24 78 68 8" fill="none" stroke={`url(#${gradId})`} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round"
        pathLength={64} strokeDasharray={64} strokeDashoffset={off}/>
    </svg>
  )
}

function Wordmark({ size=64, draw=1, reveal=1, coColor, color=TF.text }) {
  const gid = 'twm' + (++_tourGradSeq)
  return (
    <span style={{ fontFamily:FD, fontSize:size, fontWeight:800, letterSpacing:'-0.04em',
      lineHeight:1, color, opacity:reveal, whiteSpace:'nowrap', display:'inline-flex', alignItems:'baseline' }}>
      <span>Taskflo</span>
      <span style={{ position:'relative', display:'inline-block' }}>v
        <span style={{ position:'absolute', left:'0.30em', bottom:'0.02em', height:'1.12em', width:'auto', display:'inline-flex', pointerEvents:'none' }}>
          <CheckLeg draw={draw} gradId={gid}/>
        </span>
      </span>
      <span style={{ marginLeft:'0.5em', color:coColor||color }}>co</span>
    </span>
  )
}

function MarkTile({ size=32 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:size*0.28,
      background:'linear-gradient(135deg,#2F6BFF,#14C7C0)',
      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <svg width={size*0.58} height={size*0.58} viewBox="0 0 24 24" fill="none">
        <path d="M5 12.5 10 17.5 19.5 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function WatermarkLogo({ show, x=80, y=80 }) {
  return (
    <div style={{ position:'absolute', left:x, top:y, display:'flex', alignItems:'center', gap:12,
      opacity:show?1:0, transition:'opacity 0.4s' }}>
      <MarkTile size={32}/>
      <Wordmark size={22}/>
    </div>
  )
}

function ModuleBadge({ tier }) {
  const conf = {
    free6:       { dot:TF.good,  label:'Practice Hub · free for 6 months' },
    paid:        { dot:TF.amber, label:'Practice Hub · paid module' },
    freeForever: { dot:TF.good,  label:'Workspaces · free forever' },
  }[tier]
  if (!conf) return null
  return (
    <div style={{ position:'absolute', right:80, top:110,
      display:'inline-flex', alignItems:'center', gap:10,
      padding:'8px 14px', background:'rgba(255,255,255,0.03)',
      border:`1px solid ${TF.border}`, borderRadius:100,
      fontFamily:FM, fontSize:11, color:TF.text, fontWeight:700,
      letterSpacing:'0.14em', textTransform:'uppercase' }}>
      <span style={{ width:7, height:7, borderRadius:7, background:conf.dot, boxShadow:`0 0 0 3px ${conf.dot}22` }}/>
      <span>{conf.label}</span>
    </div>
  )
}

function SceneLabel({ index, label, x=80, y=80, progress=1 }) {
  const op = clamp(progress*2,0,1), ty = (1-clamp(progress*1.6,0,1))*16
  return (
    <div style={{ position:'absolute', left:x, top:y, opacity:op, transform:`translateY(${ty}px)`,
      display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontFamily:FM, fontSize:13, fontWeight:600, color:TF.accentBright,
        letterSpacing:'0.18em', textTransform:'uppercase', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ color:TF.mut }}>{String(index).padStart(2,'0')}</span>
        <span style={{ width:24, height:1, background:TF.accentBright, opacity:0.5 }}/>
        <span>{label}</span>
      </div>
    </div>
  )
}

function AppFrame({ width=960, height=820, title='taskflowco', children }) {
  return (
    <div style={{ width, height, background:TF.bg, border:`1px solid ${TF.border}`, borderRadius:14,
      overflow:'hidden', boxShadow:'0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, height:40, padding:'0 16px',
        borderBottom:`1px solid ${TF.border}`, background:TF.bg2 }}>
        <div style={{ display:'flex', gap:6 }}>
          <div style={{ width:11, height:11, borderRadius:6, background:'#ff5f57' }}/>
          <div style={{ width:11, height:11, borderRadius:6, background:'#febc2e' }}/>
          <div style={{ width:11, height:11, borderRadius:6, background:'#28c840' }}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:14 }}>
          <MarkTile size={20}/>
          <span style={{ fontFamily:FM, fontSize:11, color:TF.sub, letterSpacing:'0.06em' }}>{title}</span>
        </div>
        <div style={{ marginLeft:'auto', fontFamily:FM, fontSize:10, color:TF.mut, letterSpacing:'0.1em', textTransform:'uppercase' }}>⌘K · v 2.5</div>
      </div>
      <div style={{ position:'relative', width:'100%', height:height-40, overflow:'hidden' }}>{children}</div>
    </div>
  )
}

function Avatar({ initials='AS', size=24, color=TF.violet }) {
  return (
    <div style={{ width:size, height:size, borderRadius:size,
      background:color, display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:FS, fontWeight:700, fontSize:size*0.42, color:'#fff',
      border:`1.5px solid ${TF.bg}`, flexShrink:0 }}>{initials}</div>
  )
}

function StatusPill({ status }) {
  const m = { todo:{bg:'rgba(134,147,176,0.12)',fg:TF.sub,l:'To do'},
    wip:{bg:'rgba(99,102,241,0.16)',fg:TF.violet,l:'In progress'},
    review:{bg:'rgba(245,158,11,0.16)',fg:TF.warn,l:'Review'},
    blocked:{bg:'rgba(239,68,68,0.16)',fg:TF.bad,l:'Blocked'},
    filed:{bg:'rgba(16,185,129,0.16)',fg:TF.good,l:'Filed'},
    done:{bg:'rgba(16,185,129,0.16)',fg:TF.good,l:'Done'} }[status] || {bg:'rgba(134,147,176,0.12)',fg:TF.sub,l:status}
  return <span style={{ fontFamily:FM, fontSize:10, fontWeight:700, padding:'4px 8px', borderRadius:4,
    background:m.bg, color:m.fg, textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>{m.l}</span>
}

function TaskRow({ code, title, client, status, due, owner, hi=false }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'64px 1fr 140px 110px 90px 40px', gap:16,
      alignItems:'center', padding:'14px 18px',
      background:hi?'rgba(127,163,199,0.06)':'transparent',
      borderBottom:`1px solid ${TF.border}` }}>
      <span style={{ fontFamily:FM, fontSize:11, color:TF.mut, fontWeight:600 }}>{code}</span>
      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
        <span style={{ fontFamily:FS, fontSize:14, fontWeight:600, color:TF.text }}>{title}</span>
        <span style={{ fontFamily:FM, fontSize:10, color:TF.sub, letterSpacing:'0.06em' }}>{client}</span>
      </div>
      <StatusPill status={status}/>
      <span style={{ fontFamily:FM, fontSize:11, color:TF.sub }}>{due}</span>
      <Avatar initials={owner.initials} color={owner.color} size={26}/>
      <span style={{ color:TF.mut, fontSize:14 }}>···</span>
    </div>
  )
}

function Icon({ name, size=16, color=TF.sub, sw=1.6 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth:sw, strokeLinecap:'round', strokeLinejoin:'round' }
  switch(name) {
    case 'list':   return <svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
    case 'board':  return <svg {...p}><rect x="3" y="3" width="6" height="18" rx="1.5"/><rect x="11" y="3" width="6" height="11" rx="1.5"/></svg>
    case 'cal':    return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
    case 'check':  return <svg {...p}><path d="M5 12l4 4L19 7"/></svg>
    case 'plus':   return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>
    case 'doc':    return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
    case 'lock':   return <svg {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    case 'arrow':  return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    case 'users':  return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    case 'book':   return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    case 'rupee':  return <svg {...p}><path d="M6 3h12M6 8h12M6 13c5 0 5-5 0-5M6 13h6l8 8"/></svg>
    case 'wallet': return <svg {...p}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/></svg>
    case 'chat':   return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case 'chart':  return <svg {...p}><path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6"/></svg>
    case 'play':   return <svg {...p} fill={color} stroke="none"><path d="M5 3l16 9-16 9z"/></svg>
    case 'inbox':  return <svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6L5.5 5z"/></svg>
    default: return null
  }
}

function HeatCell({ intensity=0, size=24 }) {
  const c = ['rgba(127,163,199,0.06)','rgba(127,163,199,0.18)','rgba(127,163,199,0.32)','rgba(245,158,11,0.4)','rgba(245,158,11,0.7)','rgba(239,68,68,0.85)']
  const i = Math.min(c.length-1, Math.floor(intensity*(c.length-0.001)))
  return <div style={{ width:size, height:size, borderRadius:4, background:c[i], border:`1px solid ${intensity>0.7?'rgba(239,68,68,0.5)':TF.border}` }}/>
}

// ── Scenes ────────────────────────────────────────────────────────────────────

function SceneIntro() {
  return (
    <Sprite start={0} end={5.2}>
      {({ localTime: t }) => {
        const draw = clamp((t-0.2)/1.4,0,1)
        const wm   = clamp((t-1.4)/1.0,0,1)
        const coOp = clamp((t-2.2)/0.6,0,1)
        const tag  = clamp((t-2.6)/1.0,0,1)
        const free = clamp((t-3.4)/0.6,0,1)
        const exit = clamp((t-4.6)/0.5,0,1)
        return (
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 45%,#131a2e,#0a0e18 60%)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            opacity:1-exit, transform:`scale(${1+exit*0.04})` }}>
            <div style={{ position:'absolute', inset:0,
              backgroundImage:`linear-gradient(${TF.border} 1px,transparent 1px),linear-gradient(90deg,${TF.border} 1px,transparent 1px)`,
              backgroundSize:'64px 64px', opacity:0.4,
              maskImage:'radial-gradient(ellipse at center,black 0%,transparent 70%)' }}/>
            <div style={{ transform:`scale(${0.94+0.06*Easing.easeOutCubic(wm)})`, opacity:clamp(wm+0.1,0,1) }}>
              <Wordmark size={132} draw={Easing.easeOutCubic(draw)} reveal={wm}/>
            </div>
            <div style={{ marginTop:36, fontFamily:FM, fontSize:16, color:TF.sub,
              letterSpacing:'0.22em', textTransform:'uppercase', opacity:tag, fontWeight:600,
              transform:`translateY(${(1-tag)*12}px)` }}>
              The operating system for Indian CA firms
            </div>
            <div style={{ marginTop:72, display:'flex', alignItems:'center', gap:14,
              opacity:free, transform:`translateY(${(1-free)*16}px)` }}>
              {[{c:TF.good,l:'Practice Hub · free for 6 months'},{c:TF.accentBright,l:'Workspaces · free forever'}].map((b,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 22px',
                  background:`${b.c}1a`, border:`1px solid ${b.c}66`, borderRadius:100 }}>
                  <div style={{ width:8, height:8, borderRadius:8, background:b.c,
                    boxShadow:`0 0 0 ${4+Math.sin(t*6+i*1.2)*2}px ${b.c}33` }}/>
                  <span style={{ fontFamily:FM, fontSize:12, color:b.c, fontWeight:700, letterSpacing:'0.16em', textTransform:'uppercase' }}>{b.l}</span>
                </div>
              ))}
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneHook() {
  const items = [
    {l:'WhatsApp: GST due tomorrow', x:120,y:200,c:'#25D366',rot:-4},
    {l:'Excel — clients_2026.xlsx',  x:1480,y:220,c:'#22c55e',rot:3},
    {l:'Sticky: Sharma TDS',         x:240,y:720,c:'#facc15',rot:-5},
    {l:'Email: Tally export?',        x:1520,y:700,c:TF.violet,rot:6},
    {l:'Sheet: Audit checklist',      x:1300,y:420,c:TF.cyan,rot:-2},
    {l:'SMS: Payment received',       x:180,y:480,c:TF.pink,rot:4},
    {l:'Drive: ROC filings',          x:760,y:160,c:'#fb923c',rot:-3},
    {l:'Notion: SOP draft',           x:940,y:800,c:'#a78bfa',rot:5},
  ]
  return (
    <Sprite start={5.0} end={12.2}>
      {({ localTime: t }) => {
        const suck  = clamp((t-3.6)/1.2,0,1)
        const order = clamp((t-4.8)/1.4,0,1)
        const exit  = clamp((t-6.6)/0.6,0,1)
        const cx=960, cy=540
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show={t>0.4}/>
            {items.map((c,i) => {
              const entry = clamp((t-i*0.08)/0.6,0,1)
              const eE = Easing.easeOutCubic(entry)
              const offX=c.x<960?-300:300, offY=c.y<540?-200:200
              const tx = c.x+(1-eE)*offX + Math.sin(t*1.6+i)*6*(1-suck)
              const ty = c.y+(1-eE)*offY
              const sx = tx+(cx-tx)*Easing.easeInQuad(suck)
              const sy = ty+(cy-ty)*Easing.easeInQuad(suck)
              return (
                <div key={i} style={{ position:'absolute', left:sx, top:sy,
                  transform:`translate(-50%,-50%) rotate(${c.rot*(1-suck)}deg) scale(${(0.4+0.6*eE)*(1-suck*0.85)})`,
                  opacity:entry*(1-suck), display:'flex', alignItems:'center', gap:10,
                  padding:'12px 18px', background:TF.panel, border:`1px solid ${TF.border}`,
                  borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
                  fontFamily:FS, fontSize:14, fontWeight:500, color:TF.text, whiteSpace:'nowrap' }}>
                  <div style={{ width:8,height:8,borderRadius:8,background:c.c }}/>
                  <span>{c.l}</span>
                </div>
              )
            })}
            {order>0 && (
              <div style={{ position:'absolute', left:cx, top:cy-60,
                transform:`translate(-50%,-50%) scale(${0.8+0.2*Easing.easeOutBack(order)})`, opacity:order }}>
                <Wordmark size={120} draw={Easing.easeOutCubic(clamp((order-0.1)/0.6,0,1))}/>
              </div>
            )}
            {order>0.2 && (
              <div style={{ position:'absolute', left:0, right:0, top:cy+90, textAlign:'center',
                opacity:clamp((order-0.2)/0.5,0,1), transform:`translateY(${(1-clamp((order-0.2)/0.5,0,1))*16}px)` }}>
                <div style={{ fontFamily:FD, fontSize:88, fontWeight:800, letterSpacing:'-0.04em', color:TF.text }}>
                  Stop juggling. <span style={{ color:TF.accentBright }}>Start flowing.</span>
                </div>
                <div style={{ marginTop:22, fontFamily:FS, fontSize:22, color:TF.sub }}>
                  One workspace for your firm's tasks, team, library &amp; billing.
                </div>
              </div>
            )}
          </div>
        )
      }}
    </Sprite>
  )
}

const TASKS = [
  {code:'TF-1042',title:'GSTR-3B · April 2026',client:'Apex Industries Pvt Ltd',status:'wip',due:'20 May',owner:{initials:'PR',color:TF.violet}},
  {code:'TF-1041',title:'TDS return Q4 FY25-26',client:'Sharma & Associates',status:'review',due:'21 May',owner:{initials:'NK',color:TF.pink}},
  {code:'TF-1040',title:'Statutory audit · field work',client:'Greenfield Logistics',status:'wip',due:'24 May',owner:{initials:'AS',color:TF.cyan}},
  {code:'TF-1039',title:'ITR-6 filing preparation',client:'Banyan Realty Ltd',status:'todo',due:'28 May',owner:{initials:'RV',color:TF.warn}},
  {code:'TF-1038',title:'ROC · DPT-3 deposit return',client:'Mehta Capital',status:'blocked',due:'30 May',owner:{initials:'KP',color:TF.good}},
  {code:'TF-1037',title:'Form 26AS reconciliation',client:'Apex Industries Pvt Ltd',status:'filed',due:'12 May',owner:{initials:'PR',color:TF.violet}},
]

function SceneTasks() {
  return (
    <Sprite start={12.0} end={22.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.6,0,1)
        const titleP = clamp((t-0.4)/1.0,0,1)
        const frameP = clamp((t-1.0)/0.5,0,1)
        const exit   = clamp((t-9.6)/0.5,0,1)
        const hi1    = clamp((t-2.4)/0.4,0,1)-clamp((t-4.4)/0.4,0,1)
        const flipT  = clamp((t-6.2)/0.9,0,1)
        const addRowP= clamp((t-7.6)/1.0,0,1)
        const dynTasks = TASKS.map((k,i) => i===4&&flipT>0.5?{...k,status:'wip'}:k)
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/>
            <ModuleBadge tier="free6"/>
            <SceneLabel index={1} label="Tasks & Worksheets" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:700,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              Every filing,<br/>every deadline,<br/><span style={{ color:TF.accentBright }}>one worklist.</span>
            </div>
            <div style={{ position:'absolute', left:80, top:530, fontFamily:FS, fontSize:18, color:TF.sub,
              maxWidth:480, lineHeight:1.55, opacity:clamp((t-1.0)/0.8,0,1) }}>
              GST, TDS, ITR, ROC, audit — every recurring statutory worksheet pre-loaded. Assign, comment, attach, mark filed.
            </div>
            <div style={{ position:'absolute', left:880, top:130, opacity:frameP, transform:`translateY(${(1-frameP)*24}px)` }}>
              <AppFrame width={960} height={820} title="taskflowco · diary · worklist">
                <div style={{ display:'grid', gridTemplateColumns:'64px 1fr 140px 110px 90px 40px', gap:16,
                  padding:'10px 18px', borderBottom:`1px solid ${TF.border}`,
                  fontFamily:FM, fontSize:10, fontWeight:700, color:TF.mut, textTransform:'uppercase', letterSpacing:'0.14em' }}>
                  <span>ID</span><span>Task / Client</span><span>Status</span><span>Due</span><span>Owner</span><span/>
                </div>
                {dynTasks.map((task,i) => {
                  const rp = Easing.easeOutCubic(clamp((t-(1.4+i*0.12))/0.5,0,1))
                  return (
                    <div key={task.code} style={{ opacity:rp, transform:`translateX(${(1-rp)*20}px)` }}>
                      <TaskRow {...task} hi={i===0&&hi1>0}/>
                    </div>
                  )
                })}
                {addRowP>0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px',
                    background:'rgba(127,163,199,0.06)', borderTop:`1px dashed ${TF.accent}`,
                    opacity:addRowP, transform:`translateY(${(1-addRowP)*8}px)` }}>
                    <Icon name="plus" size={16} color={TF.accentBright}/>
                    <span style={{ fontFamily:FS, fontSize:14, color:TF.accentBright, fontWeight:600 }}>New worksheet from template…</span>
                    {['GSTR-3B','TDS Q1','ROC AOC-4'].map(s => (
                      <span key={s} style={{ fontFamily:FM, fontSize:10, padding:'3px 7px', borderRadius:4,
                        background:'rgba(255,255,255,0.04)', border:`1px solid ${TF.border}`, color:TF.sub }}>{s}</span>
                    ))}
                  </div>
                )}
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneViews() {
  return (
    <Sprite start={22.0} end={32.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.6,0,1), titleP = clamp((t-0.4)/0.9,0,1)
        const exit   = clamp((t-9.6)/0.5,0,1)
        const stageOp = clamp((t-0.8)/0.4,0,1)-clamp((t-3.3)/0.4,0,1)
        const boardOp = clamp((t-3.3)/0.4,0,1)-clamp((t-6.0)/0.4,0,1)
        const calOp   = clamp((t-6.0)/0.4,0,1)-clamp((t-9.2)/0.4,0,1)
        const views = [{n:'Stages',icon:'list',a:t<3.3},{n:'Board',icon:'board',a:t>=3.3&&t<6.0},{n:'Calendar',icon:'cal',a:t>=6.0}]
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/><ModuleBadge tier="free6"/>
            <SceneLabel index={2} label="Views" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:700,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              One worklist.<br/><span style={{ color:TF.accentBright }}>Every view.</span>
            </div>
            <div style={{ position:'absolute', left:80, top:620, display:'flex', gap:10, opacity:clamp((t-1.2)/0.6,0,1) }}>
              {views.map(p => (
                <div key={p.n} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:8,
                  background:p.a?'rgba(127,163,199,0.16)':'rgba(255,255,255,0.03)',
                  border:`1px solid ${p.a?TF.accent:TF.border}`, color:p.a?TF.accentBright:TF.sub,
                  fontFamily:FS, fontSize:13, fontWeight:600, transition:'all 0.3s' }}>
                  <Icon name={p.icon} size={14} color={p.a?TF.accentBright:TF.sub}/><span>{p.n}</span>
                </div>
              ))}
            </div>
            <div style={{ position:'absolute', left:880, top:130 }}>
              <AppFrame width={960} height={820} title="taskflowco · diary">
                <div style={{ position:'absolute', inset:0, opacity:stageOp, padding:'20px 22px' }}><StagesView t={clamp((t-0.8)/2.7,0,1)}/></div>
                <div style={{ position:'absolute', inset:0, opacity:boardOp, padding:'20px 22px' }}><BoardView t={clamp((t-3.3)/2.7,0,1)}/></div>
                <div style={{ position:'absolute', inset:0, opacity:calOp, padding:'20px 22px' }}><CalView t={clamp((t-6.0)/3.2,0,1)}/></div>
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function StagesView({ t }) {
  const groups = [
    {l:'Active · 3',c:TF.violet,items:['GSTR-3B · April','Statutory audit · field work','Form 26AS recon']},
    {l:'Review · 2',c:TF.warn,items:['TDS return Q4','ITR-6 preparation']},
    {l:'Filed · 12',c:TF.good,items:['GSTR-1 April','AOC-4 · FY24-25','Form 26AS · client list']},
  ]
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {groups.map((g,gi) => {
        const gp = clamp(t*3-gi*0.4,0,1)
        return (
          <div key={gi} style={{ opacity:gp, transform:`translateY(${(1-gp)*8}px)` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:8,height:8,borderRadius:8,background:g.c }}/>
              <span style={{ fontFamily:FM, fontSize:11, fontWeight:700, color:TF.text, letterSpacing:'0.12em', textTransform:'uppercase' }}>{g.l}</span>
              <div style={{ flex:1, height:1, background:TF.border, marginLeft:8 }}/>
            </div>
            {g.items.map((it,ii) => (
              <div key={ii} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', marginBottom:6,
                background:TF.panel, border:`1px solid ${TF.border}`, borderRadius:8,
                fontFamily:FS, fontSize:13, color:TF.text }}>
                <div style={{ width:14,height:14,borderRadius:14,border:`1.5px solid ${g.c}`,opacity:0.7 }}/>
                <span>{it}</span>
                <span style={{ marginLeft:'auto', fontFamily:FM, fontSize:10, color:TF.mut }}>{20+gi+ii} May</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function BoardView({ t }) {
  const cols = [
    {l:'To do',c:TF.sub,items:[{t:'ITR-6 · Banyan'},{t:'GSTR-9 review'},{t:'Audit scope · Sept'}]},
    {l:'In progress',c:TF.violet,items:[{t:'GSTR-3B · Apex',hi:true},{t:'Field work · Greenfield'}]},
    {l:'Review',c:TF.warn,items:[{t:'TDS Q4 · Sharma'}]},
    {l:'Filed',c:TF.good,items:[{t:'26AS · Apex'},{t:'GSTR-1 · April'},{t:'AOC-4 FY24'}]},
  ]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, height:'100%' }}>
      {cols.map((c,ci) => {
        const cp = clamp(t*2.5-ci*0.25,0,1)
        return (
          <div key={ci} style={{ display:'flex', flexDirection:'column', gap:8, opacity:cp, transform:`translateY(${(1-cp)*10}px)` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 4px' }}>
              <div style={{ width:6,height:6,borderRadius:6,background:c.c }}/>
              <span style={{ fontFamily:FM, fontSize:10, fontWeight:700, color:TF.text, letterSpacing:'0.12em', textTransform:'uppercase' }}>{c.l}</span>
            </div>
            {c.items.map((it,ii) => (
              <div key={ii} style={{ padding:'12px', background:it.hi?'rgba(127,163,199,0.1)':TF.panel,
                border:`1px solid ${it.hi?TF.accent:TF.border}`, borderRadius:8,
                fontFamily:FS, fontSize:12.5, color:TF.text, fontWeight:500, lineHeight:1.35 }}>{it.t}</div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function CalView({ t }) {
  const events = { 20:[{tag:'GST',c:TF.violet}], 21:[{tag:'TDS',c:TF.warn}], 24:[{tag:'AUD',c:TF.cyan}], 30:[{tag:'ROC',c:TF.bad}] }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, height:'100%' }}>
      <div style={{ fontFamily:FD, fontSize:22, fontWeight:700, color:TF.text, letterSpacing:'-0.02em' }}>May 2026</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, fontFamily:FM, fontSize:10, color:TF.mut, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>
        {['M','T','W','T','F','S','S'].map((d,i) => <div key={i} style={{ padding:'3px 6px' }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, flex:1 }}>
        {Array.from({length:35},(_,i) => {
          const d = i-3, inM = d>=1&&d<=31
          const evts = inM?events[d]:null
          const cp = Easing.easeOutCubic(clamp(t*2.5-i*0.012,0,1))
          return (
            <div key={i} style={{ padding:5, background:inM?TF.panel:'transparent',
              border:`1px solid ${inM?TF.border:'transparent'}`, borderRadius:5,
              display:'flex', flexDirection:'column', gap:2, opacity:cp, minHeight:0 }}>
              <span style={{ fontFamily:FM, fontSize:10, color:inM?TF.text:TF.mut, fontWeight:600 }}>{inM?d:''}</span>
              {evts&&evts.map((e,ei) => (
                <div key={ei} style={{ padding:'2px 4px', background:`${e.c}26`, border:`1px solid ${e.c}55`,
                  borderRadius:3, fontFamily:FM, fontSize:8, color:e.c, fontWeight:700 }}>{e.tag}</div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SceneHeatmap() {
  const team = [
    {name:'Priya Rao',role:'Sr. Associate',initials:'PR',color:TF.violet,load:0.92},
    {name:'Naveen Krishnan',role:'Audit Manager',initials:'NK',color:TF.pink,load:0.78},
    {name:'Anish Saxena',role:'Associate',initials:'AS',color:TF.cyan,load:0.45},
    {name:'Riya Verma',role:'Associate',initials:'RV',color:TF.warn,load:0.62},
    {name:'Kunal Patel',role:'Articled CA',initials:'KP',color:TF.good,load:0.30},
    {name:'Meera Iyer',role:'Sr. Associate',initials:'MI',color:'#a78bfa',load:0.88},
  ]
  const heat = [[0.7,0.9,0.95,0.85,0.92],[0.5,0.7,0.85,0.6,0.78],[0.3,0.4,0.5,0.35,0.45],[0.4,0.55,0.7,0.6,0.62],[0.2,0.3,0.4,0.25,0.3],[0.6,0.85,0.9,0.8,0.88]]
  const after = [[0.7,0.9,0.95,0.55,0.55],[0.5,0.7,0.85,0.6,0.78],[0.3,0.4,0.5,0.6,0.7],[0.4,0.55,0.7,0.6,0.62],[0.2,0.3,0.4,0.55,0.65],[0.6,0.85,0.9,0.55,0.55]]
  const days = ['Mon 18','Tue 19','Wed 20','Thu 21','Fri 22']
  return (
    <Sprite start={32.0} end={40.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.6,0,1), titleP = clamp((t-0.4)/0.9,0,1)
        const gridP  = clamp((t-1.2)/1.0,0,1)
        const rebT   = clamp((t-4.4)/2.2,0,1)
        const eReb   = Easing.easeInOutCubic(rebT)
        const exit   = clamp((t-7.6)/0.5,0,1)
        const lived  = heat.map((row,i) => row.map((v,j) => v+(after[i][j]-v)*eReb))
        const livedLoad = team.map((p,i) => ({...p, load:lived[i].reduce((a,b)=>a+b,0)/5}))
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/><ModuleBadge tier="free6"/>
            <SceneLabel index={3} label="Team & Workload" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:720,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              See who's <span style={{ color:TF.bad }}>drowning</span>.<br/>
              Rebalance <span style={{ color:TF.good }}>instantly</span>.
            </div>
            <div style={{ position:'absolute', left:880, top:130, opacity:gridP, transform:`translateY(${(1-gridP)*24}px)` }}>
              <AppFrame width={960} height={820} title="taskflowco · team · workload">
                <div style={{ padding:'20px 24px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
                    <span style={{ fontFamily:FD, fontSize:18, fontWeight:700, color:TF.text }}>Workload · Week of 18 May</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'200px repeat(5,1fr) 110px', gap:8, marginBottom:10 }}>
                    <span/>
                    {days.map(d => <span key={d} style={{ fontFamily:FM, fontSize:10, color:TF.mut, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', textAlign:'center' }}>{d}</span>)}
                    <span style={{ fontFamily:FM, fontSize:10, color:TF.mut, fontWeight:700, textAlign:'right', textTransform:'uppercase', letterSpacing:'0.1em' }}>Load</span>
                  </div>
                  {livedLoad.map((p,i) => (
                    <div key={p.initials} style={{ display:'grid', gridTemplateColumns:'200px repeat(5,1fr) 110px',
                      gap:8, alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${TF.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar initials={p.initials} color={p.color} size={32}/>
                        <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                          <span style={{ fontFamily:FS, fontSize:13, fontWeight:600, color:TF.text }}>{p.name}</span>
                          <span style={{ fontFamily:FM, fontSize:10, color:TF.sub }}>{p.role}</span>
                        </div>
                      </div>
                      {lived[i].map((v,j) => <div key={j} style={{ display:'flex', justifyContent:'center' }}><HeatCell intensity={v} size={34}/></div>)}
                      <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end' }}>
                        <div style={{ width:60, height:6, borderRadius:3, background:TF.surface, overflow:'hidden' }}>
                          <div style={{ width:`${Math.min(100,p.load*100)}%`, height:'100%',
                            background:p.load>0.85?TF.bad:p.load>0.7?TF.warn:TF.good, transition:'width 0.4s' }}/>
                        </div>
                        <span style={{ fontFamily:FM, fontSize:11, fontWeight:700, width:32,
                          color:p.load>0.85?TF.bad:p.load>0.7?TF.warn:TF.good }}>{Math.round(p.load*100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

const THREAD_MSGS = [
  {who:'Priya',role:'PR',color:TF.violet,txt:'Apex GSTR-3B numbers ready — ITC mismatch ₹14,200 with 2A.',time:'10:14',side:'L'},
  {who:'Naveen',role:'NK',color:TF.pink,txt:'@Priya post the reconciliation worksheet here?',time:'10:16',side:'R',mention:true},
  {who:'Priya',role:'PR',color:TF.violet,txt:'Attached. Vendor Maverick Logistics — 3 invoices not in 2A yet.',time:'10:18',side:'L',attach:true},
  {who:'Naveen',role:'NK',color:TF.pink,txt:'Got it. Approving for filing. ✓',time:'10:22',side:'R'},
]

function SceneComms() {
  return (
    <Sprite start={40.0} end={46.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.5,0,1), titleP = clamp((t-0.4)/0.8,0,1)
        const frameP = clamp((t-0.8)/0.5,0,1), exit = clamp((t-5.6)/0.5,0,1)
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/><ModuleBadge tier="paid"/>
            <SceneLabel index={4} label="Communication" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:720,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              Conversations,<br/><span style={{ color:TF.accentBright }}>attached to context.</span>
            </div>
            <div style={{ position:'absolute', left:880, top:150, opacity:frameP, transform:`translateY(${(1-frameP)*20}px)` }}>
              <AppFrame width={920} height={780} title="taskflowco · thread · TF-1042">
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 22px', borderBottom:`1px solid ${TF.border}` }}>
                  <span style={{ fontFamily:FM, fontSize:11, color:TF.mut }}>TF-1042</span>
                  <span style={{ fontFamily:FS, fontSize:14, fontWeight:600, color:TF.text }}>GSTR-3B · April 2026</span>
                  <StatusPill status="wip"/>
                </div>
                <div style={{ padding:24, display:'flex', flexDirection:'column', gap:18 }}>
                  {THREAD_MSGS.map((m,i) => {
                    const mp = Easing.easeOutCubic(clamp((t-(1.0+i*0.7))/0.4,0,1))
                    if (mp<=0) return null
                    return (
                      <div key={i} style={{ display:'flex', gap:10, opacity:mp, transform:`translateY(${(1-mp)*12}px)`,
                        justifyContent:m.side==='R'?'flex-end':'flex-start' }}>
                        {m.side==='L' && <Avatar initials={m.role} color={m.color} size={32}/>}
                        <div style={{ maxWidth:520, display:'flex', flexDirection:'column', gap:4, alignItems:m.side==='R'?'flex-end':'flex-start' }}>
                          <div style={{ display:'flex', gap:8 }}>
                            <span style={{ fontFamily:FS, fontSize:13, fontWeight:700, color:TF.text }}>{m.who}</span>
                            <span style={{ fontFamily:FM, fontSize:10, color:TF.mut }}>{m.time}</span>
                          </div>
                          <div style={{ padding:'11px 14px', background:m.side==='R'?'rgba(127,163,199,0.14)':TF.panel,
                            border:`1px solid ${m.side==='R'?TF.accent:TF.border}`, borderRadius:10,
                            fontFamily:FS, fontSize:13.5, lineHeight:1.5, color:TF.text }}>
                            {m.mention
                              ? <span><span style={{ background:'rgba(99,102,241,0.18)',color:TF.violet,padding:'1px 6px',borderRadius:4,fontWeight:700 }}>@Priya</span>{' '+m.txt.replace('@Priya ','')}</span>
                              : m.txt}
                          </div>
                          {m.attach && (
                            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 12px',
                              background:TF.panel, border:`1px solid ${TF.border}`, borderRadius:8,
                              fontFamily:FM, fontSize:11, color:TF.sub }}>
                              <Icon name="doc" size={13} color={TF.accentBright}/>
                              <span>ITC_recon_Apex_Apr26.xlsx</span>
                            </div>
                          )}
                        </div>
                        {m.side==='R' && <Avatar initials={m.role} color={m.color} size={32}/>}
                      </div>
                    )
                  })}
                </div>
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

const LIB_CARDS = [
  {kind:'SOP',title:'GSTR-3B filing checklist',meta:'14 steps · 6 templates',color:TF.violet,icon:'list'},
  {kind:'Credential',title:'GST portal · Apex',meta:'Vault-encrypted · 2FA',color:TF.warn,icon:'lock',locked:true},
  {kind:'SOP',title:'Statutory audit · field SOP',meta:'32 steps · 11 templates',color:TF.violet,icon:'list'},
  {kind:'Resource',title:'CBDT Circular 6/2026',meta:'PDF · 3 pages · pinned',color:TF.cyan,icon:'doc'},
  {kind:'Credential',title:'MCA portal · Mehta',meta:'Vault-encrypted · 2FA',color:TF.warn,icon:'lock',locked:true},
  {kind:'SOP',title:'TDS Q1 workflow',meta:'18 steps · 4 templates',color:TF.violet,icon:'list'},
]

function SceneLibrary() {
  return (
    <Sprite start={46.0} end={52.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.5,0,1), titleP = clamp((t-0.4)/0.8,0,1)
        const exit = clamp((t-5.6)/0.5,0,1)
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/><ModuleBadge tier="free6"/>
            <SceneLabel index={5} label="Library" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:720,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              Every SOP,<br/>every credential,<br/><span style={{ color:TF.accentBright }}>one search.</span>
            </div>
            <div style={{ position:'absolute', left:880, top:130 }}>
              <AppFrame width={960} height={820} title="taskflowco · library">
                <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  {LIB_CARDS.map((c,i) => {
                    const cp = Easing.easeOutCubic(clamp((t-(0.6+i*0.1))/0.4,0,1))
                    return (
                      <div key={i} style={{ opacity:cp, transform:`translateY(${(1-cp)*14}px)`,
                        padding:16, background:TF.panel, border:`1px solid ${TF.border}`, borderRadius:12,
                        display:'flex', flexDirection:'column', gap:10, position:'relative', overflow:'hidden' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:8, background:`${c.color}22`, border:`1px solid ${c.color}55`,
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Icon name={c.icon} size={14} color={c.color}/>
                          </div>
                          <span style={{ fontFamily:FM, fontSize:9.5, fontWeight:700, color:c.color, letterSpacing:'0.14em', textTransform:'uppercase' }}>{c.kind}</span>
                          {c.locked && <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, fontFamily:FM, fontSize:10, color:TF.warn }}><Icon name="lock" size={11} color={TF.warn}/> Locked</span>}
                        </div>
                        <span style={{ fontFamily:FS, fontSize:14, fontWeight:600, color:TF.text }}>{c.title}</span>
                        <span style={{ fontFamily:FM, fontSize:10.5, color:TF.sub }}>{c.meta}</span>
                      </div>
                    )
                  })}
                </div>
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneAnalytics() {
  const monthly = [62,71,84,79,96,108,122,118,137,145,162,178]
  const months = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May']
  return (
    <Sprite start={52.0} end={58.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.5,0,1), titleP = clamp((t-0.4)/0.8,0,1)
        const chartsP= clamp((t-1.0)/1.0,0,1), exit = clamp((t-5.6)/0.5,0,1)
        const barT   = Easing.easeOutCubic(clamp((t-1.4)/1.8,0,1))
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/><ModuleBadge tier="free6"/>
            <SceneLabel index={6} label="Analytics" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:720,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              Know your firm.<br/><span style={{ color:TF.accentBright }}>By the number.</span>
            </div>
            <div style={{ position:'absolute', left:80, top:640, display:'flex', gap:14, opacity:clamp((t-1.6)/0.6,0,1) }}>
              {[{k:'Realisation',v:'87%'},{k:'On-time filings',v:'98.4%'},{k:'Avg cycle',v:'4.2d'}].map(k => (
                <div key={k.k} style={{ padding:'14px 18px', background:TF.panel, border:`1px solid ${TF.border}`, borderRadius:10, minWidth:130 }}>
                  <div style={{ fontFamily:FM, fontSize:10, color:TF.mut, letterSpacing:'0.12em', textTransform:'uppercase', fontWeight:700, marginBottom:4 }}>{k.k}</div>
                  <div style={{ fontFamily:FD, fontSize:28, fontWeight:800, color:TF.text }}>{k.v}</div>
                  <div style={{ fontFamily:FM, fontSize:11, color:TF.good, fontWeight:600, marginTop:2 }}>↑ vs last qtr</div>
                </div>
              ))}
            </div>
            <div style={{ position:'absolute', left:880, top:130, opacity:chartsP, transform:`translateY(${(1-chartsP)*20}px)` }}>
              <AppFrame width={960} height={820} title="taskflowco · analytics">
                <div style={{ padding:24 }}>
                  <div style={{ padding:18, background:TF.panel, border:`1px solid ${TF.border}`, borderRadius:12 }}>
                    <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:14 }}>
                      <span style={{ fontFamily:FS, fontSize:13, fontWeight:700, color:TF.text }}>Worksheets filed · last 12 months</span>
                      <span style={{ marginLeft:'auto', fontFamily:FD, fontSize:32, fontWeight:800, color:TF.text }}>{Math.round(monthly[11]*barT)}</span>
                      <span style={{ fontFamily:FM, fontSize:11, color:TF.good, fontWeight:700 }}>↑ 22%</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:200 }}>
                      {monthly.map((v,i) => {
                        const max = Math.max(...monthly)
                        const grow = Easing.easeOutCubic(clamp((barT-i*0.04)*2,0,1))
                        return (
                          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                            <div style={{ width:'100%', height:(v/max)*200*grow,
                              background:i===11?TF.accentBright:TF.accent, opacity:0.5+0.5*(v/max),
                              borderRadius:'3px 3px 0 0' }}/>
                            <span style={{ fontFamily:FM, fontSize:9, color:i===11?TF.accentBright:TF.mut }}>{months[i]}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneBilling() {
  return (
    <Sprite start={58.0} end={66.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.5,0,1), titleP = clamp((t-0.4)/0.9,0,1)
        const exit   = clamp((t-5.6)/0.5,0,1)
        const propP  = Easing.easeOutCubic(clamp((t-1.2)/0.8,0,1))
        const billP  = Easing.easeOutCubic(clamp((t-2.2)/0.8,0,1))
        const payP   = Easing.easeOutCubic(clamp((t-3.2)/0.8,0,1))
        const arrowP = clamp((t-4.0)/0.6,0,1)
        const exportP= clamp((t-5.0)/0.6,0,1)
        const cards = [
          {step:'01',label:'Proposal',title:'Scope · Statutory Audit FY25-26',body:'6 worksheets · ₹1,85,000',color:TF.violet,icon:'doc',progress:propP},
          {step:'02',label:'Bill',title:'INV-2026-0142',body:'₹1,85,000 · GST 18%',color:TF.accentBright,icon:'rupee',progress:billP,hi:true},
          {step:'03',label:'Payment',title:'UPI · received',body:'₹2,18,300 incl GST',color:TF.good,icon:'wallet',progress:payP},
        ]
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/><ModuleBadge tier="paid"/>
            <SceneLabel index={7} label="Billing" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:64, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:760,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              Propose. Bill. Collect.<br/><span style={{ color:TF.accentBright }}>Push to Tally.</span>
            </div>
            <div style={{ position:'absolute', left:920, top:160, width:940, display:'flex', flexDirection:'column', gap:18 }}>
              <div style={{ display:'flex', alignItems:'stretch', gap:0, position:'relative' }}>
                {arrowP>0 && <div style={{ position:'absolute', left:30, right:30, top:76, height:2,
                  background:`linear-gradient(to right,${TF.accent}00,${TF.accent},${TF.accent}00)`, opacity:arrowP }}/>}
                {cards.map((c,i) => (
                  <div key={i} style={{ flex:1, margin:'0 6px', padding:20,
                    background:c.hi?'rgba(127,163,199,0.08)':TF.panel,
                    border:`1px solid ${c.hi?c.color:TF.border}`, borderRadius:14,
                    display:'flex', flexDirection:'column', gap:10,
                    opacity:c.progress, transform:`translateY(${(1-c.progress)*16}px)`,
                    boxShadow:c.hi?`0 8px 24px ${c.color}22`:'none', minHeight:200 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontFamily:FM, fontSize:10, color:TF.mut, fontWeight:700 }}>{c.step}</span>
                      <span style={{ fontFamily:FM, fontSize:11, color:c.color, textTransform:'uppercase', fontWeight:700 }}>{c.label}</span>
                      <div style={{ marginLeft:'auto', width:32, height:32, borderRadius:8,
                        background:`${c.color}1f`, border:`1px solid ${c.color}55`,
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Icon name={c.icon} size={15} color={c.color}/>
                      </div>
                    </div>
                    <span style={{ fontFamily:FS, fontSize:15, fontWeight:700, color:TF.text }}>{c.title}</span>
                    <span style={{ fontFamily:FD, fontSize:22, fontWeight:800, color:c.color }}>{c.body}</span>
                  </div>
                ))}
              </div>
              {exportP>0 && (
                <div style={{ padding:'16px 22px', background:'rgba(16,185,129,0.08)',
                  border:'1px solid rgba(16,185,129,0.32)', borderRadius:12,
                  display:'flex', alignItems:'center', gap:18,
                  opacity:exportP, transform:`translateX(${(1-exportP)*-12}px)` }}>
                  <Icon name="check" size={22} color={TF.good}/>
                  <div>
                    <div style={{ fontFamily:FS, fontSize:14, fontWeight:700, color:TF.good }}>247 invoices · ₹46,82,400 pushed to Tally</div>
                    <div style={{ fontFamily:FM, fontSize:10.5, color:TF.sub, marginTop:2 }}>XML · GST-mapped · TDS deducted · zero reconciliation</div>
                  </div>
                  <span style={{ marginLeft:'auto', fontFamily:FM, fontSize:10, color:TF.good, padding:'4px 10px',
                    background:'rgba(16,185,129,0.16)', borderRadius:100, fontWeight:700, textTransform:'uppercase' }}>Q4 closed</span>
                </div>
              )}
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

const WS_COLS = [
  {label:'Backlog',color:TF.sub,items:[{t:'Renew office Wi-Fi plan'},{t:'Hire 2 article assistants'},{t:'Client referral program v2'}]},
  {label:'This week',color:TF.violet,items:[{t:'ICAI seminar booking · 28 May',hi:true},{t:"Diwali bonus list — partners"},{t:'Onboard Anish — paperwork'}]},
  {label:'In progress',color:TF.amber,items:[{t:'New laptop · articleship batch'},{t:'Knowledge wiki rollout'}]},
  {label:'Done',color:TF.good,items:[{t:'Q1 partner review deck',done:true},{t:'Health insurance renewal',done:true}]},
]

function SceneWorkspace() {
  return (
    <Sprite start={66.0} end={72.2}>
      {({ localTime: t }) => {
        const labelP = clamp(t/0.5,0,1), titleP = clamp((t-0.4)/1.0,0,1)
        const boardP = clamp((t-0.8)/0.6,0,1), exit = clamp((t-5.6)/0.5,0,1)
        return (
          <div style={{ position:'absolute', inset:0, background:TF.bg, opacity:1-exit }}>
            <WatermarkLogo show/>
            <div style={{ position:'absolute', right:80, top:110, display:'inline-flex', alignItems:'center', gap:10,
              padding:'8px 14px', background:'rgba(255,255,255,0.03)', border:`1px solid ${TF.border}`,
              borderRadius:100, fontFamily:FM, fontSize:11, color:TF.good, fontWeight:700,
              letterSpacing:'0.14em', textTransform:'uppercase' }}>
              <span style={{ width:7, height:7, borderRadius:7, background:TF.good, boxShadow:`0 0 0 3px ${TF.good}22` }}/>
              Workspaces · free forever
            </div>
            <SceneLabel index={8} label="Workspaces" x={80} y={170} progress={labelP}/>
            <div style={{ position:'absolute', left:80, top:220, fontFamily:FD, fontSize:60, fontWeight:800,
              letterSpacing:'-0.035em', lineHeight:1.04, color:TF.text, maxWidth:760,
              opacity:titleP, transform:`translateY(${(1-titleP)*18}px)` }}>
              A separate Kanban<br/>for everything <span style={{ color:TF.accentBright }}>else.</span>
            </div>
            <div style={{ position:'absolute', left:80, top:520, opacity:clamp((t-2.0)/0.8,0,1) }}>
              <div style={{ padding:'14px 22px', border:`3px solid ${TF.good}`, borderRadius:14, display:'inline-block', transform:'rotate(-3deg)' }}>
                <div style={{ fontFamily:FD, fontSize:72, fontWeight:900, color:TF.good, lineHeight:0.9, letterSpacing:'-0.04em' }}>FREE</div>
                <div style={{ fontFamily:FM, fontSize:14, color:TF.good, letterSpacing:'0.28em', textTransform:'uppercase', fontWeight:700, marginTop:4 }}>forever</div>
              </div>
            </div>
            <div style={{ position:'absolute', left:880, top:130, opacity:boardP, transform:`translateY(${(1-boardP)*20}px)` }}>
              <AppFrame width={960} height={820} title="taskflowco · workspaces · firm ops">
                <div style={{ padding:'0 22px 16px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, paddingTop:16 }}>
                    {WS_COLS.map((col,ci) => {
                      const cp = Easing.easeOutCubic(clamp((t-(1.0+ci*0.15))/0.5,0,1))
                      return (
                        <div key={ci} style={{ opacity:cp, transform:`translateY(${(1-cp)*12}px)`, display:'flex', flexDirection:'column', gap:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:6, height:6, borderRadius:6, background:col.color }}/>
                            <span style={{ fontFamily:FM, fontSize:10, fontWeight:700, color:TF.text, letterSpacing:'0.12em', textTransform:'uppercase' }}>{col.label}</span>
                          </div>
                          {col.items.map((card,idx) => (
                            <div key={idx} style={{ padding:'10px 11px',
                              background:card.done?'rgba(16,185,129,0.04)':TF.panel,
                              border:`1px solid ${card.hi?TF.accent:TF.border}`, borderRadius:8,
                              fontFamily:FS, fontSize:12, color:TF.text, fontWeight:500, lineHeight:1.4,
                              opacity:card.done?0.62:1,
                              textDecoration:card.done?'line-through':'none' }}>{card.t}</div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </AppFrame>
            </div>
          </div>
        )
      }}
    </Sprite>
  )
}

function SceneEnd() {
  return (
    <Sprite start={72.0} end={80.2}>
      {({ localTime: t }) => {
        const s1 = Easing.easeOutCubic(clamp(t/0.8,0,1))
        const s2 = clamp((t-0.6)/1.0,0,1)
        const s3 = clamp((t-1.4)/0.8,0,1)
        const s4 = clamp((t-2.2)/0.8,0,1)
        const s5 = clamp((t-3.0)/1.0,0,1)
        const features = ['Tasks','Worksheets','Stages','Boards','Calendar','Heatmap','Library','Analytics','Tally export','Kanban']
        return (
          <div style={{ position:'absolute', inset:0,
            background:'radial-gradient(ellipse at 50% 45%,#131a2e,#0a0e18 70%)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <div style={{ position:'absolute', inset:0,
              backgroundImage:`linear-gradient(${TF.border} 1px,transparent 1px),linear-gradient(90deg,${TF.border} 1px,transparent 1px)`,
              backgroundSize:'80px 80px', opacity:0.4,
              maskImage:'radial-gradient(ellipse at center,black 0%,transparent 75%)' }}/>
            <div style={{ opacity:s1, transform:`translateY(${(1-s1)*20}px) scale(${0.94+0.06*s1})` }}>
              <Wordmark size={120} draw={Easing.easeOutCubic(clamp((t-0.1)/1.0,0,1))} reveal={s1}/>
            </div>
            <div style={{ marginTop:56, fontFamily:FD, fontSize:86, fontWeight:800, letterSpacing:'-0.04em',
              lineHeight:1.02, color:TF.text, textAlign:'center', opacity:s2, transform:`translateY(${(1-s2)*18}px)` }}>
              Run your CA firm <span style={{ color:TF.accentBright }}>from one place.</span>
            </div>
            <div style={{ marginTop:42, display:'flex', gap:14, opacity:s3, transform:`translateY(${(1-s3)*16}px)` }}>
              {[
                {c:TF.good,  l:'Practice Hub — free for 6 months',    sub:'Tasks · Views · Team · Library · Analytics'},
                {c:TF.accentBright, l:'Workspaces — free forever', sub:'Kanban · unlimited boards · cards · members'},
              ].map((b,i) => (
                <div key={i} style={{ padding:'16px 28px', background:`${b.c}15`,
                  border:`1px solid ${b.c}70`, borderRadius:14,
                  display:'flex', alignItems:'center', gap:14,
                  boxShadow:`0 12px 32px ${b.c}1f` }}>
                  <div style={{ width:10, height:10, borderRadius:10, background:b.c,
                    boxShadow:`0 0 0 ${5+Math.sin(t*5+i*1.2)*3}px ${b.c}33` }}/>
                  <div>
                    <div style={{ fontFamily:FD, fontSize:20, color:b.c, fontWeight:800 }}>{b.l}</div>
                    <div style={{ fontFamily:FM, fontSize:10.5, color:TF.sub, marginTop:2, letterSpacing:'0.1em', textTransform:'uppercase' }}>{b.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:18, fontFamily:FM, fontSize:11, color:TF.mut, letterSpacing:'0.16em', textTransform:'uppercase',
              opacity:clamp((t-1.8)/0.6,0,1) }}>
              Communication &amp; Billing modules priced separately
            </div>
            {s5>0 && (
              <div style={{ marginTop:48, display:'flex', alignItems:'center', gap:18, flexWrap:'wrap',
                justifyContent:'center', maxWidth:1200, opacity:s5,
                fontFamily:FM, fontSize:12, color:TF.sub, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:700 }}>
                {features.map((f,i) => (
                  <React.Fragment key={f}>
                    <span style={{ color:i<Math.floor(t*1.6)?TF.accentBright:TF.sub, transition:'color 0.3s' }}>
                      <Icon name="check" size={11} color={i<Math.floor(t*1.6)?TF.good:TF.mut}/> {f}
                    </span>
                    {i<features.length-1 && <span style={{ color:TF.mut, opacity:0.4 }}>·</span>}
                  </React.Fragment>
                ))}
              </div>
            )}
            {s4>0 && (
              <div style={{ marginTop:56, display:'flex', alignItems:'center', gap:16, opacity:s4, transform:`translateY(${(1-s4)*14}px)` }}>
                <div style={{ padding:'18px 32px', background:TF.accentBright, color:TF.bg, borderRadius:12,
                  fontFamily:FD, fontSize:19, fontWeight:800, display:'flex', alignItems:'center', gap:10,
                  boxShadow:'0 12px 32px rgba(127,163,199,0.4)' }}>
                  Start free at taskflowco.in
                  <Icon name="arrow" size={18} color={TF.bg} sw={2.4}/>
                </div>
                <div style={{ padding:'18px 26px', background:'transparent', border:`1px solid ${TF.border}`,
                  borderRadius:12, fontFamily:FD, fontSize:17, fontWeight:600, color:TF.text,
                  display:'flex', alignItems:'center', gap:8 }}>
                  <Icon name="play" size={14} color={TF.text}/>
                  Book a 20-min demo
                </div>
              </div>
            )}
          </div>
        )
      }}
    </Sprite>
  )
}

// ── Chapter ticker ────────────────────────────────────────────────────────────
const CHAPTERS = [
  {start:0,end:5,label:'Intro'},{start:5,end:12,label:'Why'},
  {start:12,end:22,label:'Tasks'},{start:22,end:32,label:'Views'},
  {start:32,end:40,label:'Team'},{start:40,end:46,label:'Comms'},
  {start:46,end:52,label:'Library'},{start:52,end:58,label:'Analytics'},
  {start:58,end:66,label:'Billing'},{start:66,end:72,label:'Workspace'},
  {start:72,end:80,label:'Finish'},
]

function Ticker({ time }) {
  return (
    <div style={{ position:'absolute', left:80, right:80, bottom:36,
      display:'flex', alignItems:'center', gap:14,
      fontFamily:FM, fontSize:11, color:TF.mut, letterSpacing:'0.14em', textTransform:'uppercase' }}>
      {CHAPTERS.map((c,i) => {
        const active = time>=c.start&&time<c.end, past = time>=c.end
        return (
          <React.Fragment key={i}>
            <span style={{ color:active?TF.accentBright:past?TF.sub:TF.mut, fontWeight:active?700:500, transition:'color 0.3s' }}>
              {String(i+1).padStart(2,'0')} {c.label}
            </span>
            {i<CHAPTERS.length-1 && <span style={{ color:TF.mut, opacity:0.4 }}>·</span>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Stage (animation engine) ──────────────────────────────────────────────────
const DURATION = 80

function Stage({ children }) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)   // narration voiceover on by default
  const rafRef  = useRef(null)
  const lastRef = useRef(null)
  const trackRef= useRef(null)
  const [scale, setScale] = useState(1)
  const wrapRef = useRef(null)

  // ── Narration audio: play each line's clip when the timeline enters its scene.
  // Clips live at public/tour-vo/<id>.mp3 (generated once via scripts/gen-narration.mjs).
  // Missing files just fail silently, so this is safe before the audio exists.
  const audioRef = useRef({})   // id -> HTMLAudioElement
  const prevSegRef = useRef(-1)
  const getAudio = useCallback((seg) => {
    if (typeof Audio === 'undefined') return null
    if (!audioRef.current[seg.id]) {
      const a = new Audio(narrationSrc(seg.id))
      a.preload = 'auto'
      // Fall back to .wav if the .mp3 isn't there (e.g. generated without ffmpeg).
      a.addEventListener('error', function onerr() {
        if (!a.dataset.triedWav) { a.dataset.triedWav = '1'; a.src = narrationSrc(seg.id).replace(/\.mp3$/, '.wav'); a.load() }
      })
      audioRef.current[seg.id] = a
    }
    return audioRef.current[seg.id]
  }, [])
  // Current narration segment = last line whose start time has passed.
  let curSeg = -1
  for (let i = 0; i < TOUR_NARRATION.length; i++) { if (TOUR_NARRATION[i].at <= time) curSeg = i; else break }
  useEffect(() => {
    const seg = TOUR_NARRATION[curSeg]
    // Pause every other clip.
    TOUR_NARRATION.forEach(s => { if (!seg || s.id !== seg.id) { const a = audioRef.current[s.id]; if (a) a.pause() } })
    const segChanged = prevSegRef.current !== curSeg
    prevSegRef.current = curSeg
    if (!seg) return
    const a = getAudio(seg); if (!a) return
    if (playing && !muted) {
      if (segChanged) { try { a.currentTime = 0 } catch (_) {} }
      a.play().catch(() => {})
    } else {
      a.pause()
    }
  }, [curSeg, playing, muted, getAudio])
  // Stop all audio when the tour unmounts (closed).
  useEffect(() => () => { Object.values(audioRef.current).forEach(a => { if (a) { a.pause(); a.src = '' } }) }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const measure = () => {
      const s = Math.min(el.clientWidth/1920, el.clientHeight/1080)
      setScale(Math.max(0.05, s))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) { lastRef.current = null; return }
    const step = (ts) => {
      if (lastRef.current == null) lastRef.current = ts
      const dt = (ts - lastRef.current) / 1000
      lastRef.current = ts
      setTime(t => { const n = t+dt; return n>=DURATION ? 0 : n })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); lastRef.current = null }
  }, [playing])

  useEffect(() => {
    const onKey = e => {
      if (e.code==='Space') { e.preventDefault(); setPlaying(p=>!p) }
      else if (e.code==='ArrowLeft') setTime(t=>clamp(t-(e.shiftKey?5:1),0,DURATION))
      else if (e.code==='ArrowRight') setTime(t=>clamp(t+(e.shiftKey?5:1),0,DURATION))
      else if (e.key==='0') setTime(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pct = (time/DURATION)*100
  const fmt = t => { const m=Math.floor(t/60),s=Math.floor(t%60); return `${m}:${String(s).padStart(2,'0')}` }

  const seekFromEvent = useCallback(e => {
    if (!trackRef.current) return
    const r = trackRef.current.getBoundingClientRect()
    setTime(clamp(((e.clientX-r.left)/r.width)*DURATION,0,DURATION))
  }, [])

  const ctx = useMemo(() => ({ time, duration:DURATION }), [time])

  return (
    <div ref={wrapRef} style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:'#050810' }}>
      {/* Canvas */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', minHeight:0 }}>
        <div style={{ width:1920, height:1080, position:'relative', background:TF.bg,
          transform:`scale(${scale})`, transformOrigin:'center', flexShrink:0,
          boxShadow:'0 20px 60px rgba(0,0,0,0.6)', overflow:'hidden' }}>
          <TimeCtx.Provider value={ctx}>
            {children}
            {time>4.8&&time<71.8 && <Ticker time={time}/>}
          </TimeCtx.Provider>
        </div>
      </div>
      {/* Playback bar */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
        background:'rgba(10,14,24,0.95)', borderTop:'1px solid rgba(255,255,255,0.06)',
        flexShrink:0 }}>
        <button onClick={() => setTime(0)} style={barBtn} title="Back to start">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 2v10M12 2L5 7l7 5V2z" stroke="#eef0f8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
        </button>
        <button onClick={() => setPlaying(p=>!p)} style={barBtn}>
          {playing
            ? <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="3" y="2" width="3" height="10" fill="#eef0f8"/><rect x="8" y="2" width="3" height="10" fill="#eef0f8"/></svg>
            : <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 2l9 5-9 5V2z" fill="#eef0f8"/></svg>}
        </button>
        <span style={{ fontFamily:FM, fontSize:12, color:TF.text, width:52, textAlign:'right', flexShrink:0 }}>{fmt(time)}</span>
        <div ref={trackRef} onMouseDown={e=>{seekFromEvent(e); setPlaying(false)}}
          style={{ flex:1, height:22, position:'relative', cursor:'pointer', display:'flex', alignItems:'center' }}>
          <div style={{ position:'absolute', left:0, right:0, height:4, background:'rgba(255,255,255,0.1)', borderRadius:2 }}/>
          <div style={{ position:'absolute', left:0, width:`${pct}%`, height:4, background:TF.accentBright, borderRadius:2 }}/>
          <div style={{ position:'absolute', left:`${pct}%`, top:'50%', width:12, height:12,
            marginLeft:-6, marginTop:-6, background:'#fff', borderRadius:6, boxShadow:'0 2px 4px rgba(0,0,0,0.4)' }}/>
        </div>
        <span style={{ fontFamily:FM, fontSize:12, color:TF.sub, width:52, flexShrink:0 }}>{fmt(DURATION)}</span>
        <button onClick={() => setMuted(m=>!m)} style={barBtn} title={muted?'Unmute narration':'Mute narration'}>
          {muted
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="#eef0f8"/><path d="M17 9l4 6M21 9l-4 6" stroke="#eef0f8" strokeWidth="1.8" strokeLinecap="round"/></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="#eef0f8"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="#5B9BFF" strokeWidth="1.8" strokeLinecap="round"/></svg>}
        </button>
      </div>
    </div>
  )
}

const barBtn = {
  width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center',
  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
  borderRadius:6, color:'#eef0f8', cursor:'pointer', padding:0, flexShrink:0,
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
export default function LaunchTour({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key==='Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(5,8,18,0.94)',
      display:'flex', flexDirection:'column', fontFamily:FS }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'12px 20px',
        borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0, background:'rgba(10,14,24,0.95)' }}>
        <span style={{ fontFamily:FM, fontSize:11, color:'#5B9BFF', letterSpacing:'0.18em',
          textTransform:'uppercase', fontWeight:700 }}>Launch tour · 80s</span>
        <span style={{ fontFamily:FM, fontSize:10, color:'rgba(134,147,176,0.6)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
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
      {/* Stage */}
      <Stage>
        <SceneIntro/>
        <SceneHook/>
        <SceneTasks/>
        <SceneViews/>
        <SceneHeatmap/>
        <SceneComms/>
        <SceneLibrary/>
        <SceneAnalytics/>
        <SceneBilling/>
        <SceneWorkspace/>
        <SceneEnd/>
      </Stage>
    </div>
  )
}
