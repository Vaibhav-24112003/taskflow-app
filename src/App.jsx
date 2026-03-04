import { useState, useEffect, useRef, useCallback } from 'react'
import * as supabaseApi from './lib/supabase.js'

const { supabase, signInWithGoogle, signOut, submitAccessRequest, checkAccessStatus,
  getAccessRequests, approveRequest, denyRequest, removeUserFromAllWorkspaces, upsertProfile,
  getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace,
  getTasks, createTask, updateTask, deleteTask,
  logActivity = async () => ({ error: null }) } = supabaseApi

const DEFAULT_STATUSES = ['Todo','In Progress','Review','Done']
const PRIORITIES = ['Low','Medium','High','Critical']
const RECURRENCE_TYPES = ['none','daily','weekly','monthly','custom']
const PC = {'Low':'#64748b','Medium':'#38bdf8','High':'#fb923c','Critical':'#f87171'}
const PI = {'Low':'↓','Medium':'→','High':'↑','Critical':'⚡'}
const WS_COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#06b6d4','#8b5cf6','#ef4444','#3b82f6']
const WS_ICONS  = ['⬡','◈','◉','⊛','◆','▲','●','■']
const SCPAL = ['#64748b','#6366f1','#f59e0b','#10b981','#ec4899','#06b6d4','#8b5cf6','#ef4444']

function hexToRgb(hex) {
  if(!hex||hex.length<7) return '99,102,241'
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

const G = {
  bg:'#040912', panel:'rgba(4,9,20,0.94)', overlay:'rgba(2,5,14,0.86)',
  surface:'rgba(255,255,255,0.025)', surfaceHov:'rgba(255,255,255,0.045)',
  border:'rgba(255,255,255,0.07)', borderHov:'rgba(255,255,255,0.14)',
  text:'#e8edf5', textSub:'#5a6a85', textMut:'#2a3448',
  blur:'blur(24px)', blurXs:'blur(6px)',
  radius:'18px', radiusMd:'12px', radiusSm:'8px', radiusXs:'5px',
  trans:'all 0.2s cubic-bezier(0.4,0,0.2,1)', transSnap:'all 0.1s ease',
  font:"'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif",
  shadowLg:'0 24px 80px rgba(0,0,0,0.8)',
}

const mkColor = e=>{let n=0;for(let c of e)n+=c.charCodeAt(0);return WS_COLORS[n%WS_COLORS.length]}
const mkInit  = n=>n.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
const isOvd   = d=>d&&new Date(d)<new Date()
const fmtDate = d=>{if(!d)return'—';const dt=new Date(d),now=new Date(),diff=Math.round((dt-now)/(864e5));if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff===-1)return'Yesterday';return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
const fmtFull = d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'
const enrich  = u=>u?{...u,initials:mkInit(u.name||u.email||'?'),color:mkColor(u.email||'')}:null
const getUser = (id,list=[])=>enrich(list.find(u=>u.id===id))||null
const scMap   = ss=>{const d={'Todo':'#64748b','In Progress':'#6366f1','Review':'#f59e0b','Done':'#10b981'};let i=0;return Object.fromEntries(ss.map(s=>[s,d[s]||SCPAL[4+(i++%4)]]))}
const getAssignees  = t=>(t.assignees&&t.assignees.length>0)?t.assignees:(t.assigned_to?[t.assigned_to]:[])
const isOnMyBoard  = (t,uid)=>t.created_by===uid||getAssignees(t).includes(uid)
const isMirrored   = (t,uid)=>getAssignees(t).includes(uid)&&t.created_by!==uid
const nextDate=(due,type,n=1)=>{if(!due||type==='none')return null;const dt=new Date(`${due}T00:00:00`),v=Math.max(1,Number(n)||1);if(type==='daily'||type==='custom')dt.setDate(dt.getDate()+v);else if(type==='weekly')dt.setDate(dt.getDate()+7*v);else if(type==='monthly')dt.setMonth(dt.getMonth()+v);return dt.toISOString().slice(0,10)}
const rrLabel =(type,n=1)=>{if(!type||type==='none')return null;const v=Number(n)||1;if(type==='daily')return v===1?'Daily':`${v}d`;if(type==='weekly')return v===1?'Weekly':`${v}w`;if(type==='monthly')return v===1?'Monthly':`${v}mo`;return`${v}d`}

// ── Inject global scrollbar style ────────────────────────────────────────────
function GlobalStyle({ lightMode }) {
  useEffect(() => {
    // Apply filter to <html> NOT to root div — avoids breaking position:fixed stacking context
    document.documentElement.style.filter = lightMode ? 'invert(1) hue-rotate(180deg)' : ''
    document.documentElement.style.transition = 'filter 0.2s'
    return () => { document.documentElement.style.filter = '' }
  }, [lightMode])

  useEffect(() => {
    const id = 'tf-scrollbar-style'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
      .tf-board::-webkit-scrollbar { height: 5px; }
      .tf-board::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 3px; }
      .tf-board::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.11); border-radius: 3px; }
      .tf-board::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
      .tf-board { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.11) transparent; }
      .tf-col-scroll { overflow-y: auto; }
      .tf-col-scroll::-webkit-scrollbar { width: 3px; }
      .tf-col-scroll::-webkit-scrollbar-track { background: transparent; }
      .tf-col-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      .tf-col-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      .tf-col-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
    `
    document.head.appendChild(s)
  }, [])
  return null
}

// ── KanbanBoard — fills viewport height, scrollbar always visible ─────────────
function KanbanBoard({ children, isDragging }) {
  const scrollRef = useRef()
  const dragXRef  = useRef(null)
  const rafRef    = useRef()
  const [canLeft,  setCanLeft]  = useState(false)
  const [canRight, setCanRight] = useState(false)

  const checkEdges = useCallback(() => {
    const el = scrollRef.current; if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    checkEdges()
    el.addEventListener('scroll', checkEdges, { passive: true })
    const ro = new ResizeObserver(checkEdges); ro.observe(el)
    return () => { el.removeEventListener('scroll', checkEdges); ro.disconnect() }
  }, [checkEdges])

  // RAF auto-scroll when dragging near left/right edges
  useEffect(() => {
    const loop = () => {
      const el = scrollRef.current
      const x  = dragXRef.current
      if (el && x !== null && isDragging) {
        const rect = el.getBoundingClientRect()
        const lx = x - rect.left
        const ZONE = 160, MAX_SPEED = 22
        if (lx < ZONE && lx >= 0) {
          // Smooth ease-in: slow start, accelerates near edge
          const t = 1 - lx / ZONE
          el.scrollLeft -= MAX_SPEED * t * t * t
          checkEdges()
        } else if (lx > rect.width - ZONE && lx <= rect.width) {
          const t = 1 - (rect.width - lx) / ZONE
          el.scrollLeft += MAX_SPEED * t * t * t
          checkEdges()
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isDragging, checkEdges])

  // Always track pointer X (works during native drag)
  useEffect(() => {
    const onMove = e => { dragXRef.current = e.clientX }
    const onEnd  = () => { dragXRef.current = null }
    window.addEventListener('dragover', onMove)
    window.addEventListener('dragend',  onEnd)
    return () => { window.removeEventListener('dragover', onMove); window.removeEventListener('dragend', onEnd) }
  }, [])

  const scrollBy = dir => scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })

  return (
    <div style={{ position:'relative', flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
      {/* Arrow: left */}
      {canLeft && (
        <button onClick={() => scrollBy(-1)} style={{
          position:'absolute', left:0, top:'50%', transform:'translate(-50%,-50%)',
          zIndex:30, width:36, height:36, borderRadius:'50%',
          background:'rgba(10,14,28,0.95)', border:'1px solid rgba(255,255,255,0.16)',
          color:'#e8edf5', cursor:'pointer', display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:20, boxShadow:'0 4px 20px rgba(0,0,0,0.7)',
          transition:G.trans, fontFamily:G.font, lineHeight:1 }}
          onMouseEnter={e=>{ e.currentTarget.style.background='rgba(99,102,241,0.3)'; e.currentTarget.style.borderColor='rgba(99,102,241,0.5)' }}
          onMouseLeave={e=>{ e.currentTarget.style.background='rgba(10,14,28,0.95)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.16)' }}>
          ‹
        </button>
      )}
      {/* Arrow: right */}
      {canRight && (
        <button onClick={() => scrollBy(1)} style={{
          position:'absolute', right:0, top:'50%', transform:'translate(50%,-50%)',
          zIndex:30, width:36, height:36, borderRadius:'50%',
          background:'rgba(10,14,28,0.95)', border:'1px solid rgba(255,255,255,0.16)',
          color:'#e8edf5', cursor:'pointer', display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:20, boxShadow:'0 4px 20px rgba(0,0,0,0.7)',
          transition:G.trans, fontFamily:G.font, lineHeight:1 }}
          onMouseEnter={e=>{ e.currentTarget.style.background='rgba(99,102,241,0.3)'; e.currentTarget.style.borderColor='rgba(99,102,241,0.5)' }}
          onMouseLeave={e=>{ e.currentTarget.style.background='rgba(10,14,28,0.95)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.16)' }}>
          ›
        </button>
      )}
      {/* Gradient fade edges */}
      {canLeft  && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:48, background:'linear-gradient(to right,rgba(4,9,18,0.6),transparent)', pointerEvents:'none', zIndex:10 }}/>}
      {canRight && <div style={{ position:'absolute', right:0, top:0, bottom:0, width:48, background:'linear-gradient(to left,rgba(4,9,18,0.6),transparent)', pointerEvents:'none', zIndex:10 }}/>}

      {/* The actual scroll container — fills height so scrollbar stays at screen bottom */}
      <div ref={scrollRef} className="tf-board"
        style={{ flex:1, overflowX:'auto', overflowY:'hidden', display:'flex', gap:12, alignItems:'stretch', paddingBottom:4 }}>
        {children}
      </div>
    </div>
  )
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function Avatar({user,size=32}){
  if(!user)return<div style={{width:size,height:size,borderRadius:'50%',background:G.surface,flexShrink:0}}/>
  if(user.avatar_url)return<img src={user.avatar_url} alt={user.name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0,border:'1.5px solid rgba(255,255,255,0.08)'}}/>
  return<div title={user.name} style={{width:size,height:size,borderRadius:'50%',background:`linear-gradient(135deg,${user.color}cc,${user.color}66)`,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.36,fontWeight:700,flexShrink:0,userSelect:'none'}}>{user.initials}</div>
}
function Tag({label,color}){
  const rgb=hexToRgb(color)
  return<span style={{display:'inline-flex',alignItems:'center',gap:3,background:`rgba(${rgb},0.1)`,color,border:`1px solid rgba(${rgb},0.22)`,borderRadius:'100px',padding:'2px 9px',fontSize:10,fontWeight:600,whiteSpace:'nowrap'}}><span style={{width:4,height:4,borderRadius:'50%',background:color,flexShrink:0}}/>{label}</span>
}
function Btn({children,onClick,color='#6366f1',outline,sm,full,style={}}){
  const rgb=hexToRgb(color)
  const base={display:'flex',alignItems:'center',justifyContent:'center',gap:6,cursor:'pointer',fontFamily:G.font,fontWeight:700,fontSize:sm?11:13,borderRadius:G.radiusMd,padding:sm?'5px 12px':'9px 20px',width:full?'100%':undefined,transition:G.trans,border:'none',...style}
  if(outline)return<button onClick={onClick} style={{...base,background:`rgba(${rgb},0.08)`,border:`1px solid rgba(${rgb},0.25)`,color}}>{children}</button>
  return<button onClick={onClick} style={{...base,background:`linear-gradient(135deg,${color},${color}cc)`,color:'#fff',boxShadow:`0 4px 18px rgba(${rgb},0.35)`}}>{children}</button>
}
function Modal({open,onClose,title,width=600,children}){
  if(!open)return null
  return<div onClick={onClose} style={{position:'fixed',inset:0,background:G.overlay,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:'rgba(4,9,22,0.97)',border:`1px solid ${G.border}`,borderRadius:'20px',width:'100%',maxWidth:width,maxHeight:'92vh',overflow:'auto',boxShadow:G.shadowLg}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:`1px solid ${G.border}`}}>
        <span style={{fontSize:15,fontWeight:700,color:G.text,letterSpacing:'-0.02em'}}>{title}</span>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:G.radiusSm,background:G.surface,border:`1px solid ${G.border}`,color:G.textSub,cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background=G.surfaceHov} onMouseLeave={e=>e.currentTarget.style.background=G.surface}>✕</button>
      </div>
      <div style={{padding:'22px 24px'}}>{children}</div>
    </div>
  </div>
}
function Confirm({open,icon,title,body,confirmLabel,confirmColor='#ef4444',onConfirm,onCancel}){
  if(!open)return null
  const rgb=hexToRgb(confirmColor)
  return<div onClick={onCancel} style={{position:'fixed',inset:0,background:G.overlay,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:'rgba(4,9,22,0.98)',border:`1px solid rgba(${rgb},0.2)`,borderRadius:'20px',width:'100%',maxWidth:370,padding:30,boxShadow:G.shadowLg}}>
      <div style={{fontSize:40,textAlign:'center',marginBottom:14}}>{icon}</div>
      <div style={{fontSize:16,fontWeight:700,color:G.text,textAlign:'center',marginBottom:8,letterSpacing:'-0.02em'}}>{title}</div>
      <div style={{fontSize:13,color:G.textSub,textAlign:'center',marginBottom:26,lineHeight:1.7}}>{body}</div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={onCancel} style={{flex:1,background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:'10px',color:G.textSub,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:G.font}}>Cancel</button>
        <button onClick={onConfirm} style={{flex:1,background:confirmColor,border:'none',borderRadius:G.radiusMd,padding:'10px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,boxShadow:`0 4px 18px rgba(${rgb},0.4)`,fontFamily:G.font}}>{confirmLabel}</button>
      </div>
    </div>
  </div>
}
const INP={display:'block',width:'100%',boxSizing:'border-box',background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:'10px 14px',color:G.text,fontSize:14,outline:'none',fontFamily:G.font,lineHeight:1.5,transition:G.trans}
const LBL={display:'block',fontSize:10,color:G.textSub,fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em'}

// ── Auth Screens ──────────────────────────────────────────────────────────────
function AuthScreen(){
  const [loading,setLoading]=useState(false)
  return<div style={{minHeight:'100vh',background:G.bg,fontFamily:G.font,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',top:'5%',left:'20%',width:600,height:600,background:'radial-gradient(ellipse,rgba(99,102,241,0.06) 0%,transparent 65%)',pointerEvents:'none'}}/>
    <div style={{position:'absolute',bottom:'10%',right:'15%',width:400,height:400,background:'radial-gradient(ellipse,rgba(16,185,129,0.04) 0%,transparent 65%)',pointerEvents:'none'}}/>
    <div style={{maxWidth:420,width:'100%',padding:40,textAlign:'center',position:'relative'}}>
      <div style={{width:64,height:64,borderRadius:'18px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,margin:'0 auto 22px',boxShadow:'0 12px 40px rgba(99,102,241,0.35)'}}>✦</div>
      <h1 style={{fontSize:36,fontWeight:800,color:G.text,margin:'0 0 10px',letterSpacing:'-0.04em'}}>TaskFlow</h1>
      <p style={{fontSize:14,color:G.textSub,lineHeight:1.7,margin:'0 0 36px'}}>A private workspace for focused teams.<br/>Sign in to request access.</p>
      <button onClick={async()=>{setLoading(true);await signInWithGoogle()}} disabled={loading}
        style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:14,padding:'16px 24px',background:'rgba(255,255,255,0.96)',borderRadius:G.radiusMd,border:'none',cursor:'pointer',fontSize:15,fontWeight:600,color:'#111',boxShadow:'0 4px 28px rgba(0,0,0,0.45)',opacity:loading?0.7:1,transition:G.trans,fontFamily:G.font}}>
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        {loading?'Redirecting…':'Continue with Google'}
      </button>
      <div style={{marginTop:36,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,textAlign:'left'}}>
        {[['👤','Private Board','Your tasks stay yours'],['📤','Delegate','Assign to teammates'],['🔁','Recurring','Auto-creates next'],['📊','CSV I/O','Import and export']].map(([ic,t,d])=>(
          <div key={t} style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:'12px 14px'}}>
            <div style={{fontSize:18,marginBottom:6}}>{ic}</div>
            <div style={{fontSize:12,fontWeight:700,color:G.text,marginBottom:2}}>{t}</div>
            <div style={{fontSize:11,color:G.textSub}}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
}
function PendingScreen({user,onSignOut}){return<div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:G.font}}><div style={{textAlign:'center',maxWidth:380,padding:40}}><div style={{fontSize:52,marginBottom:20}}>⏳</div><h2 style={{fontSize:20,fontWeight:800,color:G.text,margin:'0 0 8px',letterSpacing:'-0.03em'}}>Access Requested</h2><p style={{fontSize:13,color:'#818cf8',margin:'0 0 4px'}}>{user.email}</p><p style={{fontSize:12,color:G.textSub,background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:16,margin:'20px 0',lineHeight:1.7}}>The admin will review your request shortly.</p><Btn onClick={onSignOut} outline color="#64748b">Sign Out</Btn></div></div>}
function DeniedScreen({onSignOut}){return<div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:G.font}}><div style={{textAlign:'center',maxWidth:360,padding:40}}><div style={{fontSize:52,marginBottom:20}}>🚫</div><h2 style={{fontSize:20,fontWeight:800,color:G.text,margin:'0 0 10px',letterSpacing:'-0.03em'}}>Access Denied</h2><p style={{fontSize:13,color:G.textSub,margin:'0 0 24px'}}>Contact the admin if this is a mistake.</p><Btn onClick={onSignOut} outline color="#ef4444">Sign Out</Btn></div></div>}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({open,onClose,onAccessChanged}){
  const [reqs,setReqs]=useState([]);const [loading,setLoading]=useState(true)
  const load=async()=>{setLoading(true);const{data}=await getAccessRequests();setReqs(data||[]);setLoading(false)}
  useEffect(()=>{if(open)load()},[open])
  const act=async(uid,a)=>{
    if(a==='approve')await approveRequest(uid)
    else if(a==='remove'){if(!window.confirm('Remove this person?'))return;await denyRequest(uid);await removeUserFromAllWorkspaces(uid)}
    else await denyRequest(uid)
    await load();await onAccessChanged?.()
  }
  const sc={pending:'#f59e0b',approved:'#10b981',denied:'#ef4444'}
  return<Modal open={open} onClose={onClose} title="Access Management" width={500}>
    {loading?<div style={{textAlign:'center',padding:40,color:G.textSub}}>Loading…</div>
    :reqs.length===0?<div style={{textAlign:'center',padding:40,color:G.textSub}}>No requests yet.</div>
    :reqs.map(r=>{
      const st=(r.status||'').trim().toLowerCase();const c=sc[st]||G.textSub;const rgb=hexToRgb(c)
      return<div key={r.user_id} style={{display:'flex',alignItems:'center',gap:12,background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:'12px 16px',marginBottom:9}}>
        <div style={{width:38,height:38,borderRadius:'50%',background:`linear-gradient(135deg,${mkColor(r.email)},${mkColor(r.email)}66)`,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,flexShrink:0}}>{mkInit(r.name||r.email)}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:G.text}}>{r.name}</div><div style={{fontSize:11,color:G.textSub,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.email}</div></div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
          <span style={{fontSize:10,fontWeight:700,color:c,background:`rgba(${rgb},0.1)`,border:`1px solid rgba(${rgb},0.22)`,borderRadius:'100px',padding:'2px 9px'}}>{st.toUpperCase()}</span>
          {st==='pending'&&<div style={{display:'flex',gap:6}}><Btn onClick={()=>act(r.user_id,'approve')} outline color="#10b981" sm>✓ Approve</Btn><Btn onClick={()=>act(r.user_id,'deny')} outline color="#ef4444" sm>✕ Deny</Btn></div>}
          {st==='denied'&&<Btn onClick={()=>act(r.user_id,'approve')} outline color="#10b981" sm>Approve</Btn>}
          {st==='approved'&&<Btn onClick={()=>act(r.user_id,'remove')} outline color="#ef4444" sm>Remove</Btn>}
        </div>
      </div>
    })}
  </Modal>
}

// ── Status Manager ────────────────────────────────────────────────────────────
function StatusManager({open,onClose,statuses,wsColor,onSave}){
  const [list,setList]=useState([...statuses]);const ref=useRef()
  useEffect(()=>{if(open)setList([...statuses])},[open,statuses])
  const SC=scMap(list)
  const add=()=>{const v=ref.current?.value?.trim();if(!v||list.includes(v))return;setList(p=>[...p,v]);ref.current.value=''}
  const del=s=>{if(list.length<=1)return;setList(p=>p.filter(x=>x!==s))}
  const mv=(i,d)=>{const a=[...list],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setList(a)}
  return<Modal open={open} onClose={onClose} title="Manage Columns" width={420}>
    <p style={{fontSize:12,color:G.textSub,marginBottom:16,lineHeight:1.6}}>Reorder or add status columns.</p>
    {list.map((s,i)=>{const col=SC[s];const rgb=hexToRgb(col);return<div key={s} style={{display:'flex',alignItems:'center',gap:10,background:G.surface,border:`1px solid rgba(${rgb},0.2)`,borderRadius:G.radiusMd,padding:'9px 14px',marginBottom:8}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:col,flexShrink:0,boxShadow:`0 0 8px ${col}99`}}/>
      <span style={{flex:1,fontSize:13,fontWeight:600,color:G.text}}>{s}</span>
      <button onClick={()=>mv(i,-1)} disabled={i===0} style={{background:'none',border:'none',color:i===0?G.textMut:G.textSub,cursor:i===0?'default':'pointer',fontSize:14,padding:'0 4px'}}>↑</button>
      <button onClick={()=>mv(i,1)} disabled={i===list.length-1} style={{background:'none',border:'none',color:i===list.length-1?G.textMut:G.textSub,cursor:i===list.length-1?'default':'pointer',fontSize:14,padding:'0 4px'}}>↓</button>
      <Btn onClick={()=>del(s)} outline color="#ef4444" sm>✕</Btn>
    </div>})}
    <div style={{display:'flex',gap:8,margin:'16px 0'}}><input ref={ref} placeholder="New status…" style={{...INP,flex:1}} onKeyDown={e=>e.key==='Enter'&&add()}/><Btn onClick={add} color={wsColor}>Add</Btn></div>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn onClick={onClose} outline color="#64748b">Cancel</Btn><Btn onClick={()=>{onSave(list);onClose()}} color={wsColor}>Save</Btn></div>
  </Modal>
}

// ── Import/Export ─────────────────────────────────────────────────────────────
function ImportExportModal({open,onClose,tasks,wsMembers,statuses,wsName,onImport}){
  const [tab,setTab]=useState('export');const [drag,setDrag]=useState(false);const [preview,setPreview]=useState(null);const fileRef=useRef()
  const esc=v=>{const s=String(v??'');return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s}
  const doExport=()=>{
    const nm=id=>wsMembers.find(m=>m.id===id)?.name||id||''
    const h=['Title','Description','Status','Priority','Assigned To','Created By','Project','Tags','Due Date','Recurrence','Interval']
    const rows=tasks.map(t=>[t.title,t.description||'',t.status,t.priority,nm(t.assigned_to),nm(t.created_by),t.project||'',(t.tags||[]).join(';'),t.due_date||'',t.recurrence_type||'none',t.recurrence_interval||1].map(esc))
    const csv=[h,...rows].map(r=>r.join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${wsName}_${new Date().toISOString().slice(0,10)}.csv`;a.click()
  }
  const parseCSV=text=>{
    const pr=row=>{const c=[];let cur='',q=false;for(const ch of row){if(ch==='"'&&!q)q=true;else if(ch==='"'&&q)q=false;else if(ch===','&&!q){c.push(cur.trim());cur=''}else cur+=ch}c.push(cur.trim());return c}
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);if(lines.length<2)return null
    const hd=pr(lines[0]).map(h=>h.toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z_]/g,''));const gi=k=>hd.indexOf(k)
    return lines.slice(1).map(line=>{const c=pr(line);return{title:(c[gi('title')]||'').trim(),description:(c[gi('description')]||'').trim(),status:(c[gi('status')]||'').trim(),priority:(c[gi('priority')]||'').trim(),assigned_to_name:(c[gi('assigned_to')]||'').trim(),project:(c[gi('project')]||'').trim(),tags:(c[gi('tags')]||'').split(';').map(t=>t.trim()).filter(Boolean),due_date:(c[gi('due_date')]||'').trim()||null,recurrence_type:(c[gi('recurrence')]||'none').trim(),recurrence_interval:Math.max(1,parseInt(c[gi('interval')])||1)}}).filter(r=>r.title)
  }
  const handleFile=async f=>{if(!f)return;const rows=parseCSV(await f.text());if(!rows?.length){alert('Could not parse CSV.');return};setPreview(rows)}
  return<Modal open={open} onClose={()=>{onClose();setPreview(null);setTab('export')}} title="Import / Export Tasks" width={620}>
    <div style={{display:'flex',gap:4,background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:4,marginBottom:20}}>
      {[{id:'export',lb:'⬇ Export CSV'},{id:'import',lb:'⬆ Import CSV'}].map(t=><button key={t.id} onClick={()=>{setTab(t.id);setPreview(null)}} style={{flex:1,padding:'8px',borderRadius:G.radiusSm,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:tab===t.id?'rgba(99,102,241,0.85)':'transparent',color:tab===t.id?'#fff':G.textSub,transition:G.trans,fontFamily:G.font}}>{t.lb}</button>)}
    </div>
    {tab==='export'&&<div><div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:16,marginBottom:16,fontSize:13,color:G.textSub,lineHeight:1.7}}>Export all <strong style={{color:G.text}}>{tasks.length} tasks</strong> as CSV.</div><Btn onClick={doExport} color="#10b981" full>⬇ Download {tasks.length} Tasks as CSV</Btn></div>}
    {tab==='import'&&!preview&&<div>
      <div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:14,marginBottom:16,fontSize:12,color:G.textSub,lineHeight:1.8}}><strong style={{color:G.text,display:'block',marginBottom:4}}>Format:</strong>Required: Title · Optional: Description, Status, Priority, Assigned To, Tags (;), Due Date, Recurrence, Interval</div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}} onClick={()=>fileRef.current?.click()}
        style={{border:`2px dashed ${drag?'#6366f1':G.border}`,borderRadius:G.radiusMd,padding:'48px 20px',textAlign:'center',cursor:'pointer',background:drag?'rgba(99,102,241,0.04)':'transparent',transition:G.trans}}>
        <div style={{fontSize:36,marginBottom:10}}>📂</div>
        <p style={{fontSize:13,fontWeight:600,color:G.textSub,margin:'0 0 4px'}}>Drop CSV here or click to browse</p>
        <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
      </div>
    </div>}
    {tab==='import'&&preview&&<div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}><strong style={{fontSize:14,color:G.text}}>{preview.length} rows ready</strong><button onClick={()=>setPreview(null)} style={{background:'none',border:'none',color:G.textSub,cursor:'pointer',fontSize:12,fontFamily:G.font}}>← Back</button></div>
      <div style={{maxHeight:260,overflow:'auto',border:`1px solid ${G.border}`,borderRadius:G.radiusMd,marginBottom:16}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr>{['Title','Status','Priority','Assigned','Due'].map(h=><th key={h} style={{padding:'9px 14px',textAlign:'left',color:G.textSub,fontWeight:700,borderBottom:`1px solid ${G.border}`,background:'rgba(4,9,20,0.9)',position:'sticky',top:0}}>{h}</th>)}</tr></thead>
        <tbody>{preview.map((r,i)=><tr key={i} style={{borderBottom:`1px solid ${G.border}`}}><td style={{padding:'8px 14px',color:G.text,fontWeight:600}}>{r.title}</td><td style={{padding:'8px 10px',color:G.textSub}}>{r.status||'—'}</td><td style={{padding:'8px 10px',color:G.textSub}}>{r.priority||'—'}</td><td style={{padding:'8px 10px',color:G.textSub}}>{r.assigned_to_name||'—'}</td><td style={{padding:'8px 10px',color:G.textSub}}>{r.due_date||'—'}</td></tr>)}</tbody></table>
      </div>
      <div style={{display:'flex',gap:10}}><Btn onClick={()=>setPreview(null)} outline color="#64748b" full>Back</Btn><Btn onClick={()=>{onImport(preview);onClose();setPreview(null)}} color="#6366f1" full>Import {preview.length} Tasks</Btn></div>
    </div>}
  </Modal>
}

// ── Recurrence Picker ─────────────────────────────────────────────────────────
function RecurrencePicker({recurrenceType,recurrenceInterval,onTypeChange,onIntervalChange}){
  const show=recurrenceType!=='none'
  return<div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusMd,padding:'14px 16px',marginTop:2}}>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:show?12:0}}>
      {RECURRENCE_TYPES.map(rt=><button key={rt} onClick={()=>onTypeChange(rt)} style={{padding:'5px 13px',borderRadius:'100px',border:`1.5px solid ${recurrenceType===rt?'#6366f1':G.border}`,background:recurrenceType===rt?'rgba(99,102,241,0.15)':'transparent',color:recurrenceType===rt?'#818cf8':G.textSub,cursor:'pointer',fontSize:11,fontWeight:recurrenceType===rt?700:500,transition:G.trans,fontFamily:G.font}}>
        {rt==='none'?'No repeat':rt.charAt(0).toUpperCase()+rt.slice(1)}
      </button>)}
    </div>
    {show&&<div style={{display:'flex',alignItems:'center',gap:12,background:'rgba(0,0,0,0.2)',borderRadius:G.radiusSm,padding:'10px 14px',border:`1px solid ${G.border}`}}>
      <span style={{fontSize:12,color:G.textSub,flexShrink:0}}>Every</span>
      <input type="number" min={1} max={365} value={recurrenceInterval} onChange={e=>onIntervalChange(Math.max(1,parseInt(e.target.value)||1))} style={{...INP,width:62,padding:'5px 10px',fontSize:13,flex:'none'}}/>
      <span style={{fontSize:12,color:G.textSub,flexShrink:0}}>{recurrenceType==='weekly'?'week(s)':recurrenceType==='monthly'?'month(s)':'day(s)'}</span>
      <Tag label={`🔁 ${rrLabel(recurrenceType,recurrenceInterval)}`} color="#6366f1"/>
    </div>}
    {show&&<p style={{margin:'10px 0 0',fontSize:11,color:G.textSub,lineHeight:1.6}}>Mark Done → next occurrence auto-creates.</p>}
  </div>
}

// ── Checklist component ───────────────────────────────────────────────────────
function ChecklistEditor({ items, onChange, wsColor }) {
  const [newText, setNewText] = useState('')
  const [hideChecked, setHideChecked] = useState(false)
  const inputRef = useRef()
  const rgb = hexToRgb(wsColor)
  const done = items.filter(i => i.done).length
  const pct  = items.length ? Math.round((done / items.length) * 100) : 0

  const addItem = () => {
    const t = newText.trim(); if (!t) return
    onChange([...items, { id: Date.now() + Math.random(), text: t, done: false }])
    setNewText(''); inputRef.current?.focus()
  }
  const toggle = id => onChange(items.map(i => i.id === id ? { ...i, done: !i.done } : i))
  const edit   = (id, text) => onChange(items.map(i => i.id === id ? { ...i, text } : i))
  const remove = id => onChange(items.filter(i => i.id !== id))
  const visible = hideChecked ? items.filter(i => !i.done) : items

  return (
    <div style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radiusMd, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: G.text }}>Checklist</span>
          {items.length > 0 && <span style={{ fontSize: 11, color: pct===100?'#10b981':wsColor, fontWeight: 700 }}>{done}/{items.length}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {items.some(i => i.done) && <button onClick={() => setHideChecked(h => !h)} style={{ background: 'none', border: `1px solid ${G.border}`, borderRadius: G.radiusXs, padding: '3px 9px', color: G.textSub, cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: G.font }}>{hideChecked ? 'Show all' : 'Hide done'}</button>}
          {items.length > 0 && <button onClick={() => { if (window.confirm('Clear all checklist items?')) onChange([]) }} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.25)', borderRadius: G.radiusXs, padding: '3px 9px', color: '#f87171', cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: G.font }}>Clear all</button>}
        </div>
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: G.textSub, fontWeight: 700, width: 28, flexShrink: 0 }}>{pct}%</span>
          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: pct===100?'#10b981':wsColor, borderRadius: 3, boxShadow: `0 0 8px rgba(${rgb},0.4)`, transition: 'width 0.35s ease' }} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {visible.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: item.done ? 'rgba(16,185,129,0.04)' : 'transparent', borderRadius: G.radiusXs, padding: '5px 6px', transition: G.trans }} className="cl-item">
            <div onClick={() => toggle(item.id)} style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${item.done ? '#10b981' : G.textMut}`, background: item.done ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: G.trans, boxShadow: item.done ? '0 2px 6px rgba(16,185,129,0.35)' : 'none' }}>
              {item.done && <span style={{ color: '#fff', fontSize: 10, fontWeight: 800, lineHeight: 1 }}>✓</span>}
            </div>
            <input value={item.text} onChange={e => edit(item.id, e.target.value)} onKeyDown={e => e.key === 'Enter' && inputRef.current?.focus()}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: item.done ? G.textSub : G.text, fontSize: 12, fontFamily: G.font, textDecoration: item.done ? 'line-through' : 'none', lineHeight: 1.5 }} />
            <button onClick={() => remove(item.id)} style={{ background: 'none', border: 'none', color: G.textMut, cursor: 'pointer', fontSize: 13, padding: '0 3px', lineHeight: 1, fontFamily: G.font }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = G.textMut}>✕</button>
          </div>
        ))}
        {hideChecked && items.some(i => i.done) && <div style={{ fontSize: 11, color: G.textMut, fontStyle: 'italic', padding: '3px 6px' }}>{items.filter(i => i.done).length} done items hidden</div>}
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add item… press Enter to add" style={{ ...INP, flex: 1, padding: '7px 12px', fontSize: 12 }} />
        <button onClick={addItem} style={{ background: `rgba(${rgb},0.15)`, border: `1px solid rgba(${rgb},0.3)`, borderRadius: G.radiusMd, padding: '7px 14px', color: wsColor, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: G.font, transition: G.trans, whiteSpace: 'nowrap' }}>+ Add</button>
      </div>
    </div>
  )
}

// ── Task Form ─────────────────────────────────────────────────────────────────
function TaskFormModal({open,onClose,task,ws,wsMembers,cu,statuses,defaultStatus,onSave,onDelete}){
  const titleRef=useRef(),descRef=useRef(),projRef=useRef(),tagsRef=useRef(),dateRef=useRef()
  const [status,setStatus]=useState(defaultStatus||statuses[0]||'Todo')
  const [priority,setPriority]=useState('Medium')
  const [assignees,setAssignees]=useState([cu?.id].filter(Boolean))
  const [checklist,setChecklist]=useState([])
  const [rt,setRt]=useState('none');const [ri,setRi]=useState(1)
  const [cdel,setCdel]=useState(false);const isEdit=!!task

  useEffect(()=>{
    if(!open||!cu)return
    setStatus(task?.status||defaultStatus||statuses[0]||'Todo')
    setPriority(task?.priority||'Medium')
    setRt(task?.recurrence_type||'none');setRi(task?.recurrence_interval||1)
    setChecklist(task?.checklist||[])
    if(task){
      const asgn=task.assignees&&task.assignees.length>0?task.assignees:task.assigned_to?[task.assigned_to]:[cu.id]
      setAssignees(asgn)
    } else { setAssignees([cu.id]) }
  },[open,task,defaultStatus,statuses,cu])

  if(!open||!ws||!cu)return null
  const rgb=hexToRgb(ws.color)

  const toggleAssignee=id=>setAssignees(prev=>{
    if(prev.includes(id)){if(prev.length===1)return prev;return prev.filter(x=>x!==id)}
    return [...prev,id]
  })

  const save=async()=>{
    const title=titleRef.current?.value?.trim();if(!title)return
    const finalAssignees=assignees.length>0?assignees:[cu.id]
    const payload={title,description:descRef.current?.value?.trim()||'',project:projRef.current?.value?.trim()||'',
      tags:(tagsRef.current?.value||'').split(',').map(t=>t.trim()).filter(Boolean),
      due_date:dateRef.current?.value||null,recurrence_type:rt,recurrence_interval:Math.max(1,Number(ri)||1),
      status,priority,assignees:finalAssignees,assigned_to:finalAssignees[0],
      workspace_id:ws.id,created_by:task?.created_by||cu.id,checklist}
    await onSave(isEdit?{...task,...payload}:payload);onClose()
  }
  const F=({label,children,full})=><div style={{marginBottom:16,gridColumn:full?'1/-1':undefined}}><label style={LBL}>{label}</label>{children}</div>

  return<><Modal open={open} onClose={onClose} title={isEdit?'Edit Task':'New Task'} width={660}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 18px'}}>
      <F full label="Title *"><input ref={titleRef} autoFocus defaultValue={task?.title||''} placeholder="What needs to be done?" style={{...INP,fontSize:15,fontWeight:600}} onKeyDown={e=>e.key==='Enter'&&save()}/></F>
      <F full label="Description"><textarea ref={descRef} defaultValue={task?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="Optional details…"/></F>
      <F label="Status"><select value={status} onChange={e=>setStatus(e.target.value)} style={{...INP,cursor:'pointer'}}>{statuses.map(s=><option key={s}>{s}</option>)}</select></F>
      <F label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value)} style={{...INP,cursor:'pointer'}}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></F>
      <F full label={`Assignees — ${assignees.length} selected (click to toggle)`}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {wsMembers.map(m=>{
            const eu=enrich(m);const sel=assignees.includes(m.id)
            return<div key={m.id} onClick={()=>toggleAssignee(m.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:G.radiusMd,cursor:'pointer',border:`1.5px solid ${sel?`rgba(${rgb},0.55)`:G.border}`,background:sel?`rgba(${rgb},0.09)`:G.surface,transition:G.trans}}>
              <Avatar user={eu} size={28}/>
              <div><div style={{fontSize:12,fontWeight:700,color:sel?ws.color:G.text}}>{m.name||m.email.split('@')[0]}{m.id===cu.id?' (You)':''}</div><div style={{fontSize:10,color:G.textSub}}>{m.email}</div></div>
              <div style={{width:16,height:16,borderRadius:5,border:`2px solid ${sel?ws.color:G.textMut}`,background:sel?ws.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:G.trans,marginLeft:4,boxShadow:sel?`0 2px 8px rgba(${rgb},0.4)`:'none'}}>
                {sel&&<span style={{color:'#fff',fontSize:10,fontWeight:800,lineHeight:1}}>✓</span>}
              </div>
            </div>
          })}
        </div>
        {assignees.length>1&&<div style={{marginTop:8,fontSize:11,color:'#818cf8',display:'flex',alignItems:'center',gap:4}}>ℹ All selected members will see this task on their board</div>}
      </F>
      <F full label="Due Date"><input ref={dateRef} type="date" defaultValue={task?.due_date||''} style={INP}/></F>
      <F full label="🔁 Recurrence"><RecurrencePicker recurrenceType={rt} recurrenceInterval={ri} onTypeChange={setRt} onIntervalChange={setRi}/></F>
      <F label="Project"><input ref={projRef} defaultValue={task?.project||''} style={INP} placeholder="e.g. Q4 Launch"/></F>
      <F label="Tags (comma separated)"><input ref={tagsRef} defaultValue={(task?.tags||[]).join(', ')} style={INP} placeholder="Urgent, Finance"/></F>
      <F full label="☑ Checklist"><ChecklistEditor items={checklist} onChange={setChecklist} wsColor={ws.color}/></F>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:8,paddingTop:16,borderTop:`1px solid ${G.border}`}}>
      {isEdit?<Btn onClick={()=>setCdel(true)} outline color="#ef4444">Delete</Btn>:<div/>}
      <div style={{display:'flex',gap:8}}><Btn onClick={onClose} outline color="#64748b">Cancel</Btn><Btn onClick={save} color={ws.color}>{isEdit?'Save Changes':'Create Task'}</Btn></div>
    </div>
  </Modal>
  <Confirm open={cdel} icon="🗑️" title="Delete task?" body={`"${task?.title}" will be removed.`} confirmLabel="Delete" onConfirm={async()=>{setCdel(false);await onDelete(task.id);onClose()}} onCancel={()=>setCdel(false)}/>
  </>
}
// ── Workspace Form ────────────────────────────────────────────────────────────
function WorkspaceFormModal({open,onClose,ws,allProfiles,cu,onSave,currentMemberIds}){
  const nameRef=useRef(),descRef=useRef()
  const [color,setColor]=useState(WS_COLORS[0]);const [icon,setIcon]=useState(WS_ICONS[0]);const [members,setMembers]=useState([])
  useEffect(()=>{if(open){setColor(ws?.color||WS_COLORS[0]);setIcon(ws?.icon||WS_ICONS[0]);setMembers(ws?(currentMemberIds?.length>0?currentMemberIds:[cu?.id]):[cu?.id])}},[open,ws,cu,currentMemberIds])
  if(!open||!cu)return null
  const toggle=id=>{if(id===cu.id)return;setMembers(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])};const rgb=hexToRgb(color)
  return<Modal open={open} onClose={onClose} title={ws?'Edit Workspace':'New Workspace'} width={500}>
    <div style={{marginBottom:16}}><label style={LBL}>Name *</label><input ref={nameRef} defaultValue={ws?.name||''} placeholder="e.g. Daily Tasks" style={INP}/></div>
    <div style={{marginBottom:16}}><label style={LBL}>Description</label><textarea ref={descRef} defaultValue={ws?.description||''} rows={2} style={{...INP,resize:'vertical'}}/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 18px',marginBottom:16}}>
      <div><label style={LBL}>Color</label><div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{WS_COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:'9px',background:c,cursor:'pointer',border:`2.5px solid ${color===c?'rgba(255,255,255,0.9)':'transparent'}`,boxShadow:color===c?`0 0 0 3px rgba(${hexToRgb(c)},0.35)`:'none',transition:G.trans}}/>)}</div></div>
      <div><label style={LBL}>Icon</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{WS_ICONS.map(ic=><div key={ic} onClick={()=>setIcon(ic)} style={{width:34,height:34,borderRadius:'9px',background:icon===ic?`rgba(${rgb},0.15)`:G.surface,border:`1.5px solid ${icon===ic?color:G.border}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,transition:G.trans}}>{ic}</div>)}</div></div>
    </div>
    <div style={{marginBottom:20}}>
      <label style={LBL}>Members — {members.length} selected</label>
      {allProfiles.length===0&&<div style={{fontSize:12,color:'#f59e0b',background:'rgba(245,158,11,0.08)',borderRadius:G.radiusMd,padding:12,lineHeight:1.6,border:'1px solid rgba(245,158,11,0.2)',marginBottom:8}}>No approved members yet.</div>}
      {allProfiles.map(u=>{const ch=members.includes(u.id),self=u.id===cu.id;return<div key={u.id} onClick={()=>toggle(u.id)} style={{display:'flex',alignItems:'center',gap:12,background:ch?`rgba(${rgb},0.06)`:G.surface,border:`1px solid ${ch?`rgba(${rgb},0.28)`:G.border}`,borderRadius:G.radiusMd,padding:'9px 14px',cursor:self?'default':'pointer',marginBottom:8,transition:G.trans}}>
        <Avatar user={enrich(u)} size={30}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:G.text}}>{u.name||u.email}{self?' (You)':''}</div><div style={{fontSize:11,color:G.textSub}}>{u.email}</div></div>
        <div style={{width:18,height:18,borderRadius:'6px',border:`2px solid ${ch?color:G.textMut}`,background:ch?color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:G.trans}}>{ch&&<span style={{color:'#fff',fontSize:11,fontWeight:800}}>✓</span>}</div>
      </div>})}
    </div>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn onClick={onClose} outline color="#64748b">Cancel</Btn><Btn onClick={async()=>{const name=nameRef.current?.value?.trim();if(!name)return;await onSave({id:ws?.id,name,description:descRef.current?.value?.trim()||'',color,icon,memberIds:members.includes(cu.id)?members:[...members,cu.id]});onClose()}} color={color}>{ws?'Save':'Create'}</Btn></div>
  </Modal>
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({task,wsColor,SC,wsMembers,cu,onEdit,onDelete,onDragStart,isDragging}){
  const taskAssignees=getAssignees(task)
  const assigneeUsers=taskAssignees.map(id=>getUser(id,wsMembers)).filter(Boolean)
  const creator=getUser(task.created_by,wsMembers)
  const ovd=isOvd(task.due_date);const mir=isMirrored(task,cu?.id)
  const del=task.created_by===cu?.id&&taskAssignees.length>0&&!taskAssignees.includes(cu?.id)
  const rec=task.recurrence_type&&task.recurrence_type!=='none'
  const cl=task.checklist||[];const clDone=cl.filter(i=>i.done).length;const clPct=cl.length?Math.round(clDone/cl.length*100):0
  const [hov,setHov]=useState(false);const [cdel,setCdel]=useState(false)
  const acc=mir?'#818cf8':del?'#f59e0b':wsColor;const rgb=hexToRgb(acc)
  return<>
    <div draggable={!mir}
      onDragStart={e=>{if(mir)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',task.id);onDragStart(task.id)}}
      onClick={()=>onEdit(task)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:hov?`rgba(${rgb},0.06)`:G.surface,border:`1px solid ${hov?`rgba(${rgb},0.28)`:G.border}`,borderRadius:G.radiusMd,padding:'14px 16px',cursor:mir?'default':'grab',transition:G.trans,opacity:isDragging?0.25:1,transform:hov&&!isDragging?'translateY(-2px)':'none',boxShadow:hov&&!isDragging?`0 10px 28px rgba(0,0,0,0.35),0 0 0 1px rgba(${rgb},0.12)`:'none',userSelect:'none',borderLeft:`3px solid rgba(${rgb},${hov?0.8:0.35})`}}>
      {/* Badges row */}
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
        {(task.tags||[]).slice(0,2).map(t=><span key={t} style={{fontSize:9,color:G.textSub,background:G.surface,border:`1px solid ${G.border}`,borderRadius:'100px',padding:'1px 7px',fontWeight:600}}>{t}</span>)}
        {rec&&<span style={{fontSize:9,color:'#818cf8',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:'100px',padding:'1px 7px',fontWeight:700}}>🔁 {rrLabel(task.recurrence_type,task.recurrence_interval)}</span>}
        {cl.length>0&&<span style={{fontSize:9,color:clPct===100?'#10b981':'#f59e0b',background:clPct===100?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.1)',border:`1px solid ${clPct===100?'rgba(16,185,129,0.25)':'rgba(245,158,11,0.25)'}`,borderRadius:'100px',padding:'1px 7px',fontWeight:700}}>☑ {clDone}/{cl.length}</span>}
        {mir&&<span style={{marginLeft:'auto',fontSize:9,color:'#818cf8',background:'rgba(129,140,248,0.1)',border:'1px solid rgba(129,140,248,0.2)',borderRadius:'100px',padding:'1px 7px',fontWeight:700}}>ASSIGNED</span>}
        {del&&!mir&&<span style={{marginLeft:'auto',fontSize:9,color:'#f59e0b',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'100px',padding:'1px 7px',fontWeight:700}}>DELEGATED</span>}
      </div>
      {/* Title */}
      <div style={{fontSize:13,fontWeight:600,color:G.text,marginBottom:task.description?6:10,lineHeight:1.4,letterSpacing:'-0.01em'}}>{task.title}</div>
      {task.description&&<div style={{fontSize:11,color:G.textSub,marginBottom:10,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{task.description}</div>}
      {/* Checklist mini-bar */}
      {cl.length>0&&<div style={{marginBottom:10}}>
        <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',width:clPct+'%',background:clPct===100?'#10b981':wsColor,borderRadius:2,transition:'width 0.3s ease'}}/>
        </div>
      </div>}
      {/* Bottom row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
          <Tag label={`${PI[task.priority]} ${task.priority}`} color={PC[task.priority]}/>
          {ovd&&<Tag label="Overdue" color="#ef4444"/>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
          {task.due_date&&<span style={{fontSize:10,color:ovd?'#f87171':G.textSub,fontWeight:ovd?700:400}}>{fmtDate(task.due_date)}</span>}
          {/* Stacked assignee avatars */}
          <div style={{display:'flex',alignItems:'center'}}>
            {mir
              ?<Avatar user={creator} size={18}/>
              :assigneeUsers.slice(0,3).map((u,i)=><div key={u.id} style={{marginLeft:i?-5:0,zIndex:10-i}}><Avatar user={u} size={18}/></div>)}
            {!mir&&assigneeUsers.length>3&&<div style={{marginLeft:-5,width:18,height:18,borderRadius:'50%',background:G.surface,border:`1px solid ${G.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,color:G.textSub,fontWeight:700}}>+{assigneeUsers.length-3}</div>}
          </div>
        </div>
      </div>
      {!mir&&<div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:`1px solid ${G.border}`,opacity:hov?1:0,transform:hov?'none':'translateY(3px)',transition:G.trans,pointerEvents:hov?'auto':'none'}}>
        <Btn onClick={e=>{e.stopPropagation();onEdit(task)}} outline color={acc} sm full>Edit</Btn>
        <Btn onClick={e=>{e.stopPropagation();setCdel(true)}} outline color="#ef4444" sm full>Delete</Btn>
      </div>}
    </div>
    <Confirm open={cdel} icon="🗑️" title="Delete task?" body={`"${task.title}"`} confirmLabel="Delete" onConfirm={()=>{setCdel(false);onDelete(task.id)}} onCancel={()=>setCdel(false)}/>
  </>
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanCol({status,tasks,wsColor,SC,wsMembers,cu,onEdit,onDelete,dragId,onDragStart,onDrop,onAdd}){
  const [over,setOver]=useState(false);const col=SC[status]||wsColor;const rgb=hexToRgb(col)
  const handleDragOver=e=>{e.preventDefault();e.stopPropagation();setOver(true)}
  const handleDrop=e=>{e.preventDefault();e.stopPropagation();setOver(false);onDrop(status)}
  return(
    <div
      onDragOver={handleDragOver} onDragEnter={handleDragOver}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOver(false)}}
      onDrop={handleDrop}
      style={{ minWidth:272, flex:'0 0 272px', display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Sticky column header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'10px 14px',
        background:over?`rgba(${rgb},0.08)`:G.surface, border:`1px solid ${over?`rgba(${rgb},0.4)`:G.border}`,
        borderRadius:G.radiusMd, borderTop:`3px solid ${col}`, transition:G.trans, flexShrink:0 }}>
        <span style={{ fontSize:12, fontWeight:700, color:G.text, flex:1, letterSpacing:'-0.01em' }}>{status}</span>
        <span style={{ fontSize:11, fontWeight:700, color:col, background:`rgba(${rgb},0.12)`,
          border:`1px solid rgba(${rgb},0.22)`, borderRadius:'100px', padding:'2px 9px' }}>{tasks.length}</span>
        <button onClick={()=>onAdd(status)} style={{ width:24, height:24, borderRadius:'7px',
          background:`rgba(${rgb},0.12)`, border:`1px solid rgba(${rgb},0.22)`, color:col, cursor:'pointer',
          fontSize:17, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700,
          flexShrink:0, padding:0, lineHeight:1, transition:G.transSnap }}
          onMouseEnter={e=>e.currentTarget.style.background=`rgba(${rgb},0.25)`}
          onMouseLeave={e=>e.currentTarget.style.background=`rgba(${rgb},0.12)`}>+</button>
      </div>
      {/* Scrollable cards area */}
      <div className="tf-col-scroll" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8,
        padding: over ? '8px' : '4px 0 4px',
        background: over ? `rgba(${rgb},0.03)` : 'transparent',
        border:`2px dashed ${over?`rgba(${rgb},0.4)`:'transparent'}`,
        borderRadius:G.radiusMd, transition:G.trans,
        minHeight:120 }}>
        {tasks.map(t=><TaskCard key={t.id} task={t} wsColor={wsColor} SC={SC} wsMembers={wsMembers}
          cu={cu} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} isDragging={dragId===t.id}/>)}
        {tasks.length===0&&!over&&<div style={{ border:`1px dashed ${G.border}`, borderRadius:G.radiusMd,
          padding:'22px 16px', textAlign:'center', color:G.textMut, fontSize:12 }}>Drop tasks here</div>}
        {over&&tasks.length===0&&<div style={{ display:'flex', alignItems:'center', justifyContent:'center',
          height:60, color:col, fontSize:12, fontWeight:700, letterSpacing:'0.05em' }}>↓ DROP</div>}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
function TaskFlowApp({cu,isAdmin,allProfiles,onSignOut,onAccessChanged}){
  const [workspaces,setWorkspaces]=useState([]);const [activeWsId,setActiveWsId]=useState(null);const [wsMembers,setWsMembers]=useState([]);const [tasks,setTasks]=useState([])
  const [view,setView]=useState('board');const [teamMemberId,setTeamMemberId]=useState(null)
  const [editTask,setEditTask]=useState(null);const [createStatus,setCreateStatus]=useState(null)
  const [wsForm,setWsForm]=useState(null);const [delWs,setDelWs]=useState(null);const [statusMgr,setStatusMgr]=useState(false);const [showImEx,setShowImEx]=useState(false)
  const [dragId,setDragId]=useState(null);const [adminOpen,setAdminOpen]=useState(false)
  const [fPriority,setFPriority]=useState('');const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true);const [toast,setToast]=useState(null)
  const [showUserMenu,setShowUserMenu]=useState(false);const [showWsMenu,setShowWsMenu]=useState(false)
  const [lightMode,setLightMode]=useState(false)
  const userMenuRef=useRef();const wsMenuRef=useRef()

  useEffect(()=>{const v=localStorage.getItem('tf-light');if(v)setLightMode(v==='1')},[])
  useEffect(()=>{localStorage.setItem('tf-light',lightMode?'1':'0')},[lightMode])

  const showToast=useCallback((msg,type='ok')=>{setToast({msg,type});setTimeout(()=>setToast(null),4000)},[])
  const activeWs=workspaces.find(w=>w.id===activeWsId)||null
  const wsColor=activeWs?.color||'#6366f1';const statuses=activeWs?.custom_statuses||DEFAULT_STATUSES;const SC=scMap(statuses)
  const wsRgb=hexToRgb(wsColor)

  useEffect(()=>{setTeamMemberId(null)},[activeWsId])
  useEffect(()=>{if(view==='team'&&!teamMemberId&&wsMembers.length>0){const o=wsMembers.find(m=>m.id!==cu.id);setTeamMemberId(o?.id||wsMembers[0]?.id||null)}},[view,wsMembers,teamMemberId,cu.id])
  useEffect(()=>{const h=e=>{if(userMenuRef.current&&!userMenuRef.current.contains(e.target))setShowUserMenu(false);if(wsMenuRef.current&&!wsMenuRef.current.contains(e.target))setShowWsMenu(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])

  const loadWS=useCallback(async()=>{try{const{data}=await getMyWorkspaces(cu.id);setWorkspaces(data||[]);if(data?.length>0&&!activeWsId)setActiveWsId(data[0].id)}catch(e){console.error(e)}finally{setLoading(false)}},[cu.id,activeWsId])
  useEffect(()=>{loadWS()},[cu.id])
  useEffect(()=>{if(!activeWsId)return;Promise.all([getWorkspaceMembers(activeWsId),getTasks(activeWsId)]).then(([{data:m},{data:t}])=>{setWsMembers(m||[]);setTasks(t||[])})},[activeWsId])

  const saveWS=async({id,name,description,color,icon,memberIds})=>{
    if(id){const{error}=await updateWorkspace(id,{name,description,color,icon});if(error){showToast('Failed','err');return};const cur=wsMembers.map(m=>m.id);for(const uid of memberIds){if(!cur.includes(uid))await addMemberToWorkspace(id,uid)};for(const uid of cur){if(!memberIds.includes(uid)&&uid!==cu.id)await removeMemberFromWorkspace(id,uid)};const{data:mems}=await getWorkspaceMembers(id);setWsMembers(mems||[]);showToast('Updated ✓')}
    else{const{data:ws,error}=await createWorkspace({name,description,color,icon,owner_id:cu.id});if(error||!ws){showToast('Failed','err');return};for(const uid of [...new Set([cu.id,...memberIds])])await addMemberToWorkspace(ws.id,uid,uid===cu.id?'owner':'member');setActiveWsId(ws.id);showToast('Created ✓')}
    await loadWS()
  }
  const saveStatuses=async ss=>{if(!activeWsId)return;const{error}=await updateWorkspace(activeWsId,{custom_statuses:ss});if(error){showToast('Failed','err');return};setWorkspaces(p=>p.map(w=>w.id===activeWsId?{...w,custom_statuses:ss}:w));showToast('Saved ✓')}
  const delWsHandler=async id=>{await deleteWorkspace(id);setActiveWsId(null);setDelWs(null);await loadWS()}

  const saveTask=async td=>{
    if(td.id){
      const prev=tasks.find(t=>t.id===td.id)
      const{data,error}=await updateTask(td.id,td);if(error){showToast('Failed','err');return}
      if(data)setTasks(p=>p.map(t=>t.id===data.id?data:t));await logActivity(td.id,cu.id,'Updated')
      const becameDone=prev&&prev.status!==statuses[statuses.length-1]&&td.status===statuses[statuses.length-1]
      if(becameDone&&td.recurrence_type&&td.recurrence_type!=='none'&&td.due_date){
        const nd=nextDate(td.due_date,td.recurrence_type,td.recurrence_interval)
        if(nd){const clone={title:td.title,description:td.description||'',project:td.project||'',tags:td.tags||[],due_date:nd,recurrence_type:td.recurrence_type,recurrence_interval:td.recurrence_interval||1,status:statuses[0],priority:td.priority,assigned_to:td.assigned_to,assignees:td.assignees||[td.assigned_to].filter(Boolean),checklist:[],workspace_id:td.workspace_id,created_by:cu.id};const{data:nt,error:ne}=await createTask(clone);if(!ne&&nt){setTasks(p=>[...p,nt]);await logActivity(nt.id,cu.id,'Auto-created recurring');showToast(`Next task created → ${fmtFull(nd)} 🔁`);return}}
      }
      showToast('Saved ✓')
    } else {
      const{data,error}=await createTask(td);if(error){showToast('Failed','err');return}
      if(data){setTasks(p=>[...p,data]);await logActivity(data.id,cu.id,'Created')}
      showToast(rrLabel(td.recurrence_type,td.recurrence_interval)?`Created — repeats ${rrLabel(td.recurrence_type,td.recurrence_interval)} 🔁`:'Created ✓')
    }
  }
  const delTask=async id=>{await deleteTask(id);setTasks(p=>p.filter(t=>t.id!==id));setEditTask(null);setCreateStatus(null)}
  const drop=useCallback(async st=>{if(!dragId)return;const task=tasks.find(t=>t.id===dragId);if(!task||task.status===st){setDragId(null);return};const{data}=await updateTask(dragId,{status:st});if(data)setTasks(p=>p.map(t=>t.id===dragId?data:t));await logActivity(dragId,cu.id,`→${st}`);setDragId(null)},[dragId,tasks,cu.id])
  const importTasks=async rows=>{const byName=n=>wsMembers.find(m=>m.name?.toLowerCase()===n?.toLowerCase()||m.email?.toLowerCase()===n?.toLowerCase());let a=0,s=0;for(const r of rows){const{data,error}=await createTask({title:r.title,description:r.description,status:statuses.includes(r.status)?r.status:statuses[0],priority:PRIORITIES.includes(r.priority)?r.priority:'Medium',assigned_to:byName(r.assigned_to_name)?.id||cu.id,assignees:[byName(r.assigned_to_name)?.id||cu.id],created_by:cu.id,workspace_id:activeWsId,project:r.project,tags:r.tags,due_date:r.due_date,recurrence_type:RECURRENCE_TYPES.includes(r.recurrence_type)?r.recurrence_type:'none',recurrence_interval:r.recurrence_interval||1});if(data){setTasks(p=>[...p,data]);a++}else{s++;console.warn(error?.message)}};showToast(`Imported ${a}${s?`, ${s} skipped`:''}`,a>0?'ok':'err')}

  const openNew=s=>{setCreateStatus(s||statuses[0]);setEditTask(null)}
  const bf=t=>{if(fPriority&&t.priority!==fPriority)return false;if(search&&!t.title.toLowerCase().includes(search.toLowerCase()))return false;return true}
  const myTasks=tasks.filter(t=>bf(t)&&isOnMyBoard(t,cu.id));const allT=tasks.filter(bf)
  const selMem=wsMembers.find(m=>m.id===teamMemberId)||null
  const teamT=allT.filter(t=>getAssignees(t).includes(teamMemberId)&&t.created_by!==teamMemberId)
  const recT=tasks.filter(t=>t.recurrence_type&&t.recurrence_type!=='none')
  const curUser=enrich(cu)
  const views=[{id:'board',label:'My Board',icon:'⊞'},{id:'team',label:'Team',icon:'⊛'},{id:'recurring',label:'Recurring',icon:'🔁'},{id:'list',label:'All Tasks',icon:'☰'},{id:'dashboard',label:'Dashboard',icon:'⬡'}]

  if(loading)return<div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center',color:G.textSub,fontFamily:G.font}}><div style={{textAlign:'center'}}><div style={{width:48,height:48,borderRadius:'14px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,margin:'0 auto 16px',boxShadow:'0 8px 28px rgba(99,102,241,0.4)'}}>✦</div><div>Loading…</div></div></div>

  return<div style={{minHeight:'100vh',background:G.bg,fontFamily:G.font,color:G.text,display:'flex',flexDirection:'column',WebkitFontSmoothing:'antialiased',position:'relative'}} onDragEnd={()=>setDragId(null)}>
    <GlobalStyle lightMode={lightMode}/>
    {activeWs&&<div style={{position:'fixed',top:0,left:'25%',right:0,height:'35vh',background:`radial-gradient(ellipse at 65% 0%,rgba(${wsRgb},0.055) 0%,transparent 70%)`,pointerEvents:'none',zIndex:0}}/>}
    {toast&&<div style={{position:'fixed',bottom:32,left:'50%',transform:'translateX(-50%)',zIndex:9999,background:toast.type==='ok'?'rgba(16,185,129,0.92)':'rgba(239,68,68,0.92)',color:'#fff',borderRadius:'100px',padding:'10px 22px',fontSize:13,fontWeight:600,backdropFilter:G.blur,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',whiteSpace:'nowrap'}}>{toast.type==='ok'?'✓':'⚠'} {toast.msg}</div>}

    {/* TOP NAV */}
    <nav style={{height:54,background:G.panel,borderBottom:`1px solid ${G.border}`,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,display:'flex',alignItems:'center',padding:'0 18px',gap:6,flexShrink:0,position:'sticky',top:0,zIndex:100}}>
      <div style={{width:32,height:32,borderRadius:'9px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,boxShadow:'0 3px 12px rgba(99,102,241,0.35)',flexShrink:0,cursor:'pointer'}} onClick={()=>setActiveWsId(null)}>✦</div>
      <span style={{fontSize:14,fontWeight:800,color:G.text,letterSpacing:'-0.03em',marginRight:8}}>TaskFlow</span>
      <div style={{width:1,height:18,background:G.border,marginRight:4}}/>
      <div style={{display:'flex',alignItems:'center',gap:3,overflow:'auto'}}>
        {workspaces.map(ws=>{const active=ws.id===activeWsId;const wrgb=hexToRgb(ws.color);return<button key={ws.id} onClick={()=>{setActiveWsId(ws.id);setView('board');setSearch('');setFPriority('')}} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 11px',borderRadius:G.radiusSm,border:`1px solid ${active?`rgba(${wrgb},0.35)`:G.border}`,background:active?`rgba(${wrgb},0.12)`:'transparent',color:active?ws.color:G.textSub,cursor:'pointer',fontSize:12,fontWeight:active?700:500,transition:G.trans,whiteSpace:'nowrap',fontFamily:G.font}} onMouseEnter={e=>{if(!active){e.currentTarget.style.background=G.surface;e.currentTarget.style.color=G.text}}} onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color=G.textSub}}}><span style={{fontSize:13}}>{ws.icon}</span>{ws.name}</button>})}
        <button onClick={()=>setWsForm('new')} style={{width:26,height:26,borderRadius:G.radiusSm,border:`1px dashed ${G.border}`,background:'transparent',color:G.textMut,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:G.trans,fontFamily:G.font}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.color='#6366f1'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=G.border;e.currentTarget.style.color=G.textMut}}>+</button>
      </div>
      <div style={{flex:1}}/>
      {activeWs&&<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:'100px',padding:'5px 13px',color:G.text,fontSize:12,outline:'none',width:140,fontFamily:G.font}}/>}
      {activeWs&&<select value={fPriority} onChange={e=>setFPriority(e.target.value)} style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radiusSm,padding:'5px 9px',color:G.textSub,fontSize:11,cursor:'pointer',outline:'none',fontFamily:G.font}}><option value="">Priority</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>}
      {(search||fPriority)&&<button onClick={()=>{setSearch('');setFPriority('')}} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'100px',padding:'3px 9px',color:'#f87171',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:G.font}}>✕</button>}
      {activeWs&&<div ref={wsMenuRef} style={{position:'relative'}}>
        <button onClick={()=>setShowWsMenu(v=>!v)} style={{width:28,height:28,borderRadius:G.radiusSm,background:G.surface,border:`1px solid ${G.border}`,color:G.textSub,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background=G.surfaceHov} onMouseLeave={e=>e.currentTarget.style.background=G.surface}>⚙</button>
        {showWsMenu&&<div style={{position:'absolute',top:'calc(100% + 8px)',right:0,background:'rgba(4,9,22,0.98)',border:`1px solid ${G.border}`,borderRadius:G.radiusMd,minWidth:200,boxShadow:G.shadowLg,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,overflow:'hidden',zIndex:300}}>
          {[{label:'✏️ Edit workspace',action:()=>{setWsForm({...activeWs,memberIds:wsMembers.map(m=>m.id)});setShowWsMenu(false)}},{label:'⚙️ Manage columns',action:()=>{setStatusMgr(true);setShowWsMenu(false)}},{label:'📊 Import / Export',action:()=>{setShowImEx(true);setShowWsMenu(false)}},...(activeWs.owner_id===cu.id?[{label:'🗑 Delete workspace',action:()=>{setDelWs(activeWs);setShowWsMenu(false)},danger:true}]:[])].map((item,i)=><button key={i} onClick={item.action} style={{display:'block',width:'100%',padding:'10px 16px',background:'none',border:'none',cursor:'pointer',color:item.danger?'#f87171':G.text,fontSize:13,textAlign:'left',fontFamily:G.font,transition:G.transSnap}} onMouseEnter={e=>e.currentTarget.style.background=G.surface} onMouseLeave={e=>e.currentTarget.style.background='none'}>{item.label}</button>)}
        </div>}
      </div>}
      {isAdmin&&<button title="Admin" onClick={()=>setAdminOpen(true)} style={{width:28,height:28,borderRadius:G.radiusSm,background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',color:'#f59e0b',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>🛡</button>}
      <button onClick={()=>setLightMode(v=>!v)} style={{width:28,height:28,borderRadius:G.radiusSm,background:G.surface,border:`1px solid ${G.border}`,color:G.textSub,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background=G.surfaceHov} onMouseLeave={e=>e.currentTarget.style.background=G.surface}>{lightMode?'🌙':'☀️'}</button>
      <div ref={userMenuRef} style={{position:'relative'}}>
        <div onClick={()=>setShowUserMenu(v=>!v)} style={{cursor:'pointer',borderRadius:'50%',border:`1.5px solid ${G.border}`}}><Avatar user={curUser} size={30}/></div>
        {showUserMenu&&<div style={{position:'absolute',top:'calc(100% + 8px)',right:0,background:'rgba(4,9,22,0.98)',border:`1px solid ${G.border}`,borderRadius:G.radiusMd,minWidth:220,boxShadow:G.shadowLg,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,overflow:'hidden',zIndex:300}}>
          <div style={{padding:'14px 16px',borderBottom:`1px solid ${G.border}`,display:'flex',gap:10,alignItems:'center'}}><Avatar user={curUser} size={34}/><div><div style={{fontSize:13,fontWeight:700,color:G.text}}>{cu.user_metadata?.full_name||cu.email}</div><div style={{fontSize:11,color:G.textSub}}>{cu.email}</div><div style={{fontSize:10,color:'#10b981',marginTop:2,fontWeight:600}}>● Active{isAdmin?' · Admin':''}</div></div></div>
          {isAdmin&&<button onClick={()=>{setAdminOpen(true);setShowUserMenu(false)}} style={{display:'block',width:'100%',padding:'10px 16px',background:'none',border:'none',cursor:'pointer',color:'#f59e0b',fontSize:13,textAlign:'left',fontFamily:G.font}} onMouseEnter={e=>e.currentTarget.style.background=G.surface} onMouseLeave={e=>e.currentTarget.style.background='none'}>🛡️ Admin Panel</button>}
          <button onClick={()=>{setShowUserMenu(false);onSignOut()}} style={{display:'block',width:'100%',padding:'10px 16px',background:'none',border:'none',cursor:'pointer',color:'#f87171',fontSize:13,textAlign:'left',fontFamily:G.font}} onMouseEnter={e=>e.currentTarget.style.background=G.surface} onMouseLeave={e=>e.currentTarget.style.background='none'}>⎋ Sign out</button>
        </div>}
      </div>
    </nav>

    {/* CONTENT */}
    {!activeWs
      ?<div style={{flex:1,padding:'36px 32px',position:'relative',zIndex:1}}>
        <h1 style={{fontSize:22,fontWeight:800,color:G.text,margin:'0 0 6px',letterSpacing:'-0.04em'}}>Workspaces</h1>
        <p style={{fontSize:13,color:G.textSub,margin:'0 0 26px'}}>Select a workspace or create a new one.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
          {workspaces.map(ws=>{const wrgb=hexToRgb(ws.color);return<div key={ws.id} onClick={()=>setActiveWsId(ws.id)} style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radius,padding:20,cursor:'pointer',transition:G.trans,position:'relative',overflow:'hidden'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`rgba(${wrgb},0.4)`;e.currentTarget.style.background=G.surfaceHov;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=G.border;e.currentTarget.style.background=G.surface;e.currentTarget.style.transform='none'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${ws.color},${ws.color}44)`}}/>
            <div style={{position:'absolute',top:0,right:0,width:'50%',height:'100%',background:`radial-gradient(ellipse at top right,rgba(${wrgb},0.06) 0%,transparent 70%)`,pointerEvents:'none'}}/>
            <div style={{display:'flex',gap:12,alignItems:'center',marginTop:4}}>
              <div style={{width:42,height:42,borderRadius:'12px',background:`rgba(${wrgb},0.14)`,border:`1px solid rgba(${wrgb},0.22)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{ws.icon}</div>
              <div><div style={{fontSize:14,fontWeight:700,color:G.text,letterSpacing:'-0.02em'}}>{ws.name}</div><div style={{fontSize:11,color:G.textSub,marginTop:2}}>{ws.description||'No description'}</div></div>
            </div>
          </div>})}
          <div onClick={()=>setWsForm('new')} style={{background:G.surface,border:`1px dashed ${G.border}`,borderRadius:G.radius,padding:'26px 20px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:10,transition:G.trans}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.background=G.surfaceHov;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=G.border;e.currentTarget.style.background=G.surface;e.currentTarget.style.transform='none'}}>
            <div style={{width:42,height:42,borderRadius:'12px',border:`2px dashed ${G.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:G.textMut}}>+</div>
            <span style={{fontSize:13,fontWeight:600,color:G.textMut}}>New Workspace</span>
          </div>
        </div>
      </div>
      :<div style={{flex:1,display:'flex',flexDirection:'column',position:'relative',zIndex:1,minHeight:0}}>
        {/* View tab bar */}
        <div style={{background:G.panel,borderBottom:`1px solid ${G.border}`,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,padding:'0 24px',display:'flex',alignItems:'center',gap:2,flexShrink:0}}>
          {views.map(v=><button key={v.id} onClick={()=>setView(v.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'11px 14px',border:'none',borderBottom:`2px solid ${view===v.id?wsColor:'transparent'}`,background:'none',color:view===v.id?wsColor:G.textSub,cursor:'pointer',fontSize:12,fontWeight:view===v.id?700:500,transition:G.trans,whiteSpace:'nowrap',fontFamily:G.font,position:'relative',top:1}}>
            <span>{v.icon}</span>{v.label}
            {v.id==='recurring'&&recT.length>0&&<span style={{fontSize:10,fontWeight:700,color:wsColor,background:`rgba(${wsRgb},0.14)`,borderRadius:'100px',padding:'1px 7px'}}>{recT.length}</span>}
          </button>)}
          <div style={{flex:1}}/>
          <div style={{display:'flex',alignItems:'center',marginRight:12}}>
            {wsMembers.slice(0,5).map((m,i)=><div key={m.id} style={{marginLeft:i?-7:0,zIndex:wsMembers.length-i}}><Avatar user={enrich(m)} size={22}/></div>)}
            {wsMembers.length>5&&<div style={{width:22,height:22,borderRadius:'50%',background:G.surface,border:`1px solid ${G.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:G.textSub,fontWeight:700,marginLeft:-7}}>+{wsMembers.length-5}</div>}
          </div>
          <Btn onClick={()=>openNew()} color={wsColor} style={{margin:'7px 0',fontSize:12,padding:'7px 16px'}}>+ New Task</Btn>
        </div>

        {/* BOARD — explicit height so scrollbar stays at screen bottom always */}
        {view==='board'&&<div style={{height:'calc(100vh - 54px - 46px)',display:'flex',flexDirection:'column',overflow:'hidden',padding:'20px 24px 8px',boxSizing:'border-box'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexShrink:0}}>
            <div><h2 style={{fontSize:18,fontWeight:800,color:G.text,margin:0,letterSpacing:'-0.03em'}}>My Board</h2><p style={{margin:'4px 0 0',fontSize:12,color:G.textSub}}>{myTasks.length} tasks · <span style={{color:'#818cf8'}}>📥 assigned</span> · <span style={{color:'#f59e0b'}}>📤 delegated</span></p></div>
          </div>
          <KanbanBoard isDragging={!!dragId}>
            {statuses.map(st=><KanbanCol key={st} status={st} tasks={myTasks.filter(t=>t.status===st)} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={setEditTask} onDelete={delTask} dragId={dragId} onDragStart={setDragId} onDrop={drop} onAdd={s=>openNew(s)}/>)}
          </KanbanBoard>
        </div>}

        {/* ALL OTHER VIEWS — normal scroll */}
        <div style={{display:view==='board'?'none':'block',flex:1,overflow:'auto',padding:'22px 24px 60px'}}>

          {/* TEAM */}
          {view==='team'&&<div>
            <div style={{marginBottom:20}}><h2 style={{fontSize:18,fontWeight:800,color:G.text,margin:'0 0 4px',letterSpacing:'-0.03em'}}>Team View</h2><p style={{fontSize:12,color:G.textSub,margin:0}}>Tasks delegated to a specific member</p></div>
            {wsMembers.filter(m=>m.id!==cu.id).length===0
              ?<div style={{textAlign:'center',padding:44,border:`1px dashed ${G.border}`,borderRadius:G.radius,color:G.textMut,fontSize:13}}>No other members yet. Edit the workspace to add teammates.</div>
              :<>
                <div style={{display:'flex',gap:8,marginBottom:22,flexWrap:'wrap'}}>
                  {wsMembers.filter(m=>m.id!==cu.id).map(m=>{const eu=enrich(m);const sel=m.id===teamMemberId;const rgb=hexToRgb(wsColor);const ct=allT.filter(t=>getAssignees(t).includes(m.id)&&t.created_by!==m.id).length;return<div key={m.id} onClick={()=>setTeamMemberId(m.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderRadius:G.radiusMd,cursor:'pointer',border:`1.5px solid ${sel?`rgba(${rgb},0.4)`:G.border}`,background:sel?`rgba(${rgb},0.08)`:G.surface,transition:G.trans,minWidth:150}}>
                    <Avatar user={eu} size={32}/><div><div style={{fontSize:13,fontWeight:700,color:sel?wsColor:G.text}}>{m.name||m.email.split('@')[0]}</div><div style={{fontSize:11,color:G.textSub}}>{ct} assigned</div></div>
                    {sel&&<div style={{width:7,height:7,borderRadius:'50%',background:wsColor,marginLeft:'auto',boxShadow:`0 0 8px ${wsColor}`}}/>}
                  </div>})}
                </div>
                {selMem&&<div style={{background:G.surface,border:`1px solid rgba(${wsRgb},0.25)`,borderRadius:G.radius,padding:20}}>
                  <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${G.border}`}}>
                    <Avatar user={enrich(selMem)} size={48}/><div style={{flex:1}}><div style={{fontSize:17,fontWeight:800,color:G.text,letterSpacing:'-0.03em'}}>{selMem.name||selMem.email}</div><div style={{fontSize:12,color:G.textSub}}>{selMem.email}</div></div>
                    <div style={{display:'flex',gap:16}}>{[{l:'Assigned',v:teamT.length,c:wsColor},{l:'Done',v:teamT.filter(t=>t.status===statuses[statuses.length-1]).length,c:'#10b981'},{l:'Overdue',v:teamT.filter(t=>isOvd(t.due_date)).length,c:'#ef4444'}].map(x=><div key={x.l} style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:x.c}}>{x.v}</div><div style={{fontSize:10,color:G.textSub,marginTop:2,fontWeight:600}}>{x.l}</div></div>)}</div>
                  </div>
                  {teamT.length===0?<div style={{textAlign:'center',padding:32,border:`1px dashed ${G.border}`,borderRadius:G.radiusMd,color:G.textMut,fontSize:13}}>No delegated tasks yet.</div>
                  :<div style={{display:'flex',flexDirection:'column',minHeight:400}}><KanbanBoard isDragging={!!dragId}>{statuses.map(st=><KanbanCol key={st} status={st} tasks={teamT.filter(t=>t.status===st)} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={setEditTask} onDelete={delTask} dragId={dragId} onDragStart={setDragId} onDrop={drop} onAdd={s=>openNew(s)}/>)}</KanbanBoard></div>}
                </div>}
              </>}
          </div>}

          {/* RECURRING */}
          {view==='recurring'&&<div>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
              <div><h2 style={{fontSize:18,fontWeight:800,color:G.text,margin:'0 0 4px',letterSpacing:'-0.03em'}}>🔁 Recurring Tasks</h2><p style={{fontSize:12,color:G.textSub,margin:0}}>{recT.length} recurring — marks Done to create next</p></div>
              <Btn onClick={()=>openNew()} color="#6366f1">+ New Recurring</Btn>
            </div>
            {recT.length===0
              ?<div style={{textAlign:'center',padding:56,border:`1px dashed ${G.border}`,borderRadius:G.radius,color:G.textMut}}><div style={{fontSize:36,marginBottom:12}}>🔁</div><div style={{fontSize:14,fontWeight:700,color:G.textSub,marginBottom:8}}>No recurring tasks yet</div><div style={{fontSize:12,marginBottom:20}}>Create a task with a recurrence schedule.</div><Btn onClick={()=>openNew()} color="#6366f1">Create First</Btn></div>
              :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
                {recT.map(t=>{const assignee=getUser(t.assigned_to,wsMembers);const ovd=isOvd(t.due_date);const rl=rrLabel(t.recurrence_type,t.recurrence_interval);const nd=nextDate(t.due_date,t.recurrence_type,t.recurrence_interval);const col=SC[t.status]||wsColor;return<div key={t.id} onClick={()=>setEditTask(t)} style={{background:G.surface,border:'1px solid rgba(99,102,241,0.2)',borderRadius:G.radius,padding:16,cursor:'pointer',transition:G.trans,position:'relative',overflow:'hidden'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(99,102,241,0.4)';e.currentTarget.style.background=G.surfaceHov;e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(99,102,241,0.2)';e.currentTarget.style.background=G.surface;e.currentTarget.style.transform='none'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:8}}><div style={{fontSize:14,fontWeight:700,color:G.text,flex:1,lineHeight:1.4}}>{t.title}</div><Tag label={`🔁 ${rl}`} color="#6366f1"/></div>
                  {t.description&&<div style={{fontSize:12,color:G.textSub,marginBottom:10,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{t.description}</div>}
                  <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}><Tag label={t.status} color={col}/><Tag label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]}/>{ovd&&<Tag label="⚠ Overdue" color="#ef4444"/>}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,background:'rgba(0,0,0,0.2)',borderRadius:G.radiusSm,padding:'10px 12px'}}>
                    <div><div style={{fontSize:10,color:G.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Current Due</div><div style={{fontSize:12,color:ovd?'#f87171':G.textSub,fontWeight:600}}>{t.due_date?fmtFull(t.due_date):'Not set'}</div></div>
                    <div><div style={{fontSize:10,color:G.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Next After Done</div><div style={{fontSize:12,color:'#10b981',fontWeight:600}}>{nd?fmtFull(nd):'—'}</div></div>
                    <div><div style={{fontSize:10,color:G.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Assigned</div><div style={{display:'flex',alignItems:'center',gap:4}}><Avatar user={assignee} size={16}/><span style={{fontSize:12,color:G.textSub}}>{assignee?.id===cu?.id?'Me':assignee?.name?.split(' ')[0]||'—'}</span></div></div>
                    <div><div style={{fontSize:10,color:G.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Trigger</div><div style={{fontSize:11,color:'#818cf8'}}>Mark Done → next created</div></div>
                  </div>
                </div>})}
              </div>}
          </div>}

          {/* ALL TASKS LIST */}
          {view==='list'&&<div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div><h2 style={{fontSize:18,fontWeight:800,color:G.text,margin:'0 0 4px',letterSpacing:'-0.03em'}}>All Tasks</h2><p style={{fontSize:12,color:G.textSub,margin:0}}>{allT.length} tasks in this workspace</p></div>
              <Btn onClick={()=>setShowImEx(true)} outline color="#64748b">📊 Import / Export</Btn>
            </div>
            <div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radius,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{borderBottom:`1px solid ${G.border}`}}>{['Task','Status','Priority','Creator','Assignee','Due','Recurrence',''].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,color:G.textSub,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {allT.map(t=>{const asgn=getUser(t.assigned_to,wsMembers);const crea=getUser(t.created_by,wsMembers);const ovd=isOvd(t.due_date);const col=SC[t.status]||wsColor;const rl=rrLabel(t.recurrence_type,t.recurrence_interval);return<tr key={t.id} style={{borderBottom:`1px solid ${G.border}`,transition:G.transSnap}} onMouseEnter={e=>e.currentTarget.style.background=G.surfaceHov} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'10px 14px'}}><div style={{display:'flex',alignItems:'center',gap:9}}><div style={{width:3,height:26,borderRadius:2,background:PC[t.priority],flexShrink:0}}/><span style={{fontSize:13,fontWeight:600,color:G.text}}>{t.title}</span></div></td>
                    <td style={{padding:'10px 10px'}}><Tag label={t.status} color={col}/></td>
                    <td style={{padding:'10px 10px'}}><Tag label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]}/></td>
                    <td style={{padding:'10px 10px'}}><div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={crea} size={18}/><span style={{fontSize:11,color:G.textSub}}>{crea?.name?.split(' ')[0]||'?'}</span></div></td>
                    <td style={{padding:'10px 10px'}}>{asgn&&asgn.id!==t.created_by?<div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={asgn} size={18}/><span style={{fontSize:11,color:'#818cf8'}}>{asgn.name?.split(' ')[0]}</span></div>:<span style={{fontSize:11,color:G.textMut}}>—</span>}</td>
                    <td style={{padding:'10px 10px'}}><span style={{fontSize:11,color:ovd?'#f87171':G.textSub,fontWeight:ovd?700:400}}>{t.due_date?fmtDate(t.due_date):'—'}</span></td>
                    <td style={{padding:'10px 10px'}}>{rl?<Tag label={`🔁 ${rl}`} color="#6366f1"/>:<span style={{fontSize:11,color:G.textMut}}>—</span>}</td>
                    <td style={{padding:'10px 10px'}}><Btn onClick={()=>setEditTask(t)} outline color={wsColor} sm>Edit</Btn></td>
                  </tr>})}
                  {allT.length===0&&<tr><td colSpan={8} style={{padding:40,textAlign:'center',color:G.textMut,fontSize:13}}>No tasks yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>}

          {/* DASHBOARD */}
          {view==='dashboard'&&<div>
            <h2 style={{fontSize:18,fontWeight:800,color:G.text,margin:'0 0 20px',letterSpacing:'-0.03em'}}>Dashboard</h2>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:16}}>
              {[{l:'Total',v:tasks.length,c:wsColor},{l:'On My Board',v:myTasks.length,c:'#818cf8'},{l:'Recurring',v:recT.length,c:'#6366f1'},{l:'Delegated',v:tasks.filter(t=>t.created_by===cu.id&&getAssignees(t).some(id=>id!==cu.id)).length,c:'#f59e0b'},{l:'Overdue',v:tasks.filter(t=>isOvd(t.due_date)).length,c:'#ef4444'}].map(x=>{const rgb=hexToRgb(x.c);return<div key={x.l} style={{background:G.surface,border:`1px solid rgba(${rgb},0.15)`,borderRadius:G.radius,padding:'16px 18px',transition:G.trans}} onMouseEnter={e=>e.currentTarget.style.background=G.surfaceHov} onMouseLeave={e=>e.currentTarget.style.background=G.surface}><div style={{fontSize:28,fontWeight:800,color:x.c,marginBottom:2}}>{x.v}</div><div style={{fontSize:12,fontWeight:600,color:G.text}}>{x.l}</div></div>})}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radius,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:G.text,marginBottom:14}}>Status Breakdown</div>
                {statuses.map(s=>{const c=tasks.filter(t=>t.status===s).length;const p=tasks.length?Math.round((c/tasks.length)*100):0;const col=SC[s];const rgb=hexToRgb(col);return<div key={s} style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:G.textSub}}>{s}</span><span style={{fontSize:12,color:col,fontWeight:700}}>{c}</span></div><div style={{height:4,background:G.surfaceHov,borderRadius:2,overflow:'hidden'}}><div style={{width:p+'%',height:'100%',background:col,borderRadius:2,boxShadow:`0 0 8px rgba(${rgb},0.5)`,transition:'width 0.5s ease'}}/></div></div>})}
              </div>
              <div style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:G.radius,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:G.text,marginBottom:14}}>Team Workload</div>
                {wsMembers.map(m=>{const a=tasks.filter(t=>getAssignees(t).includes(m.id)&&t.created_by!==m.id).length;const o=tasks.filter(t=>t.created_by===m.id&&!getAssignees(t).some(id=>id!==m.id)).length;return<div key={m.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><Avatar user={enrich(m)} size={26}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:G.text}}>{m.name?.split(' ')[0]||m.email}</div><div style={{display:'flex',gap:8}}><span style={{fontSize:10,color:'#818cf8'}}>{a} assigned</span><span style={{fontSize:10,color:G.textMut}}>·</span><span style={{fontSize:10,color:G.textSub}}>{o} own</span></div></div></div>})}
              </div>
            </div>
          </div>}

        </div>{/* end other-views scroll */}
      </div>}

    {/* MODALS */}
    {(createStatus!==null||editTask!==null)&&activeWs&&<TaskFormModal open onClose={()=>{setCreateStatus(null);setEditTask(null)}} task={editTask} ws={activeWs} wsMembers={wsMembers} cu={cu} statuses={statuses} defaultStatus={createStatus||statuses[0]} onSave={saveTask} onDelete={delTask}/>}
    {wsForm&&<WorkspaceFormModal open onClose={()=>setWsForm(null)} ws={wsForm==='new'?null:wsForm} allProfiles={allProfiles} cu={cu} onSave={saveWS} currentMemberIds={wsMembers.map(m=>m.id)}/>}
    <StatusManager open={statusMgr} onClose={()=>setStatusMgr(false)} statuses={statuses} wsColor={wsColor} onSave={saveStatuses}/>
    {showImEx&&activeWs&&<ImportExportModal open onClose={()=>setShowImEx(false)} tasks={tasks} wsMembers={wsMembers} statuses={statuses} wsName={activeWs.name} onImport={importTasks}/>}
    <Confirm open={!!delWs} icon="⚠️" title="Delete workspace?" body={`Delete "${delWs?.name}" and all its tasks?`} confirmLabel="Delete" onConfirm={()=>delWsHandler(delWs?.id)} onCancel={()=>setDelWs(null)}/>
    <AdminPanel open={adminOpen} onClose={()=>setAdminOpen(false)} onAccessChanged={onAccessChanged}/>
  </div>
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(null);const [accessStatus,setAccessStatus]=useState(null);const [allProfiles,setAllProfiles]=useState([]);const [loading,setLoading]=useState(true)
  const initRef=useRef(false);const authIdRef=useRef(null)
  const ADMIN_EMAIL=import.meta.env.VITE_ADMIN_EMAIL||'';const isAdmin=session?.user?.email===ADMIN_EMAIL
  useEffect(()=>{const id='tf-font';if(!document.getElementById(id)){const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';document.head.appendChild(l)}},[])
  const handleAuth=async user=>{
    authIdRef.current=user.id
    try{
      await upsertProfile({id:user.id,email:user.email,name:user.user_metadata?.full_name||user.email.split('@')[0],avatar_url:user.user_metadata?.avatar_url||null})
      if(user.email===ADMIN_EMAIL){await submitAccessRequest(user.id,user.email,user.user_metadata?.full_name||'');await approveRequest(user.id);setAccessStatus('approved')}
      else{const{data}=await checkAccessStatus(user.id);if(!data){await submitAccessRequest(user.id,user.email,user.user_metadata?.full_name||'');setAccessStatus('pending')}else{setAccessStatus(data.status?.trim()||'pending')}}
      const{data:reqList}=await getAccessRequests();const approvedIds=(reqList||[]).filter(r=>r.status==='approved').map(r=>r.user_id)
      if(approvedIds.length>0){const{data:profiles}=await supabase.from('profiles').select('*').in('id',approvedIds);setAllProfiles(profiles||[])}else setAllProfiles([])
    }catch(e){console.error(e)}finally{setLoading(false);initRef.current=true}
  }
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);if(session)handleAuth(session.user);else{setLoading(false);initRef.current=true}})
    const{data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      setSession(session)
      if(!session){authIdRef.current=null;setAccessStatus(null);setLoading(false);initRef.current=true;return}
      const isNew=authIdRef.current!==session.user.id
      if(!initRef.current||event==='USER_UPDATED'||(event==='SIGNED_IN'&&isNew))handleAuth(session.user)
    })
    return()=>subscription.unsubscribe()
  },[])
  const onSignOut=async()=>{await signOut();setSession(null);setAccessStatus(null);authIdRef.current=null}
  const onAccessChanged=async()=>{if(!session?.user)return;const{data:reqList}=await getAccessRequests();const ids=(reqList||[]).filter(r=>r.status==='approved').map(r=>r.user_id);if(ids.length>0){const{data:p}=await supabase.from('profiles').select('*').in('id',ids);setAllProfiles(p||[])}}
  if(loading)return<div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center',color:G.textSub,fontFamily:G.font}}><div style={{textAlign:'center'}}><div style={{width:48,height:48,borderRadius:'14px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,margin:'0 auto 14px',boxShadow:'0 8px 28px rgba(99,102,241,0.4)'}}>✦</div><div>Loading…</div></div></div>
  if(!session)return<AuthScreen/>
  if(accessStatus==='pending')return<PendingScreen user={session.user} onSignOut={onSignOut}/>
  if(accessStatus==='denied')return<DeniedScreen onSignOut={onSignOut}/>
  if(!accessStatus)return<div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center',color:G.textSub,fontFamily:G.font}}>Checking access…</div>
  return<TaskFlowApp cu={session.user} isAdmin={isAdmin} allProfiles={allProfiles} onSignOut={onSignOut} onAccessChanged={onAccessChanged}/>
}
