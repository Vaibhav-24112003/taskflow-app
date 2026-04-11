import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  supabase, signInWithGoogle, signOut, upsertProfile,
  getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace, getMemberRole,
  inviteToWorkspace, getWorkspaceInvitations, getMyInvitations,
  getInvitationByToken, acceptInvitation, acceptInvitationByToken, declineInvitation, cancelInvitation,
  getTasks, createTask, updateTask, deleteTask, logActivity,
  getWorkTypeConfigs, getAllWorkTypeConfigs, insertWorkTypeConfig, updateWorkTypeConfig, deleteWorkTypeConfig,
  getUserWorksheetPrefs, upsertUserWorksheetPref
} from './lib/supabase.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = ['Todo','In Progress','Review','Done']
const PRIORITIES = ['Low','Medium','High','Critical']
const RECURRENCE_TYPES = ['none','daily','weekly','monthly','custom']
const PC = {'Low':'#64748b','Medium':'#38bdf8','High':'#fb923c','Critical':'#f87171'}
const PI = {'Low':'↓','Medium':'→','High':'↑','Critical':'⚡'}
const WS_COLORS = ['#6b8cad','#ec4899','#10b981','#f59e0b','#06b6d4','#4a7a9b','#ef4444','#3b82f6']
const WS_ICONS  = ['*','#','@','&','+','▲','●','■']
const SCPAL = ['#64748b','#6b8cad','#f59e0b','#10b981','#ec4899','#06b6d4','#4a7a9b','#ef4444']

// ── Design tokens — CSS variable based (proper light/dark, no filter hack) ─────
const G = {
  // All color tokens are CSS vars — set by GlobalStyle on :root / [data-theme]
  bg:'var(--tf-bg)', panel:'var(--tf-panel)', overlay:'var(--tf-overlay)',
  surface:'var(--tf-surface)', surfaceHov:'var(--tf-surface-hov)',
  border:'var(--tf-border)', borderHov:'var(--tf-border-hov)',
  text:'var(--tf-text)', textSub:'var(--tf-text-sub)', textMut:'var(--tf-text-mut)',
  input:'var(--tf-input)',
  // Static (same in both modes)
  blur:'blur(18px)', blurSm:'blur(10px)',
  radius:'14px', radiusMd:'10px', radiusSm:'7px', radiusXs:'5px',
  trans:'all 0.18s cubic-bezier(0.4,0,0.2,1)', transSnap:'all 0.09s ease',
  font:"'DM Sans','Helvetica Neue',system-ui,sans-serif",
  fontDisplay:"'Bricolage Grotesque','DM Sans',system-ui,sans-serif",
  shadow:'0 4px 24px var(--tf-shadow)', shadowLg:'0 20px 64px var(--tf-shadow-lg)',
}
// Raw resolved values for hexRgb operations (always dark values for accents)
const GR = {
  bg:'#0b0f1a', surface:'#131825', surfaceHov:'#1a2133',
  border:'rgba(255,255,255,0.07)', text:'#eaecf5', textSub:'#5c6b87', textMut:'#2a3655',
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const hexRgb  = h=>{if(!h||h.length<7)return'107,140,173';return`${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`}
const mkColor = e=>{let n=0;for(let c of e)n+=c.charCodeAt(0);return WS_COLORS[n%WS_COLORS.length]}
const mkInit  = n=>n.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?'
const isOvd   = d=>d&&new Date(d)<new Date()
const fmtDate = d=>{if(!d)return'—';const dt=new Date(d),now=new Date(),diff=Math.round((dt-now)/864e5);if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff===-1)return'Yesterday';return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
const fmtFull = d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'
const fmtAgo  = d=>{if(!d)return'';const s=Math.round((Date.now()-new Date(d))/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`}
const enrich  = u=>u?{...u,initials:mkInit(u.name||u.email||'?'),color:mkColor(u.email||'')}:null
const getUser = (id,list=[])=>enrich(list.find(u=>u.id===id))||null
const scMap   = ss=>{const d={'Todo':'#64748b','In Progress':'#6b8cad','Review':'#f59e0b','Done':'#10b981'};let i=0;return Object.fromEntries(ss.map(s=>[s,d[s]||SCPAL[4+(i++%4)]]))}
const getAssignees = t=>(t.assignees&&t.assignees.length>0)?t.assignees:(t.assigned_to?[t.assigned_to]:[])
const isOnMyBoard  = (t,uid)=>t.created_by===uid||getAssignees(t).includes(uid)||(t.delegator_id&&t.delegator_id===uid)
const isMirrored   = (t,uid)=>getAssignees(t).includes(uid)&&t.created_by!==uid
const nextDate=(due,type,n=1)=>{if(!due||type==='none')return null;const dt=new Date(`${due}T00:00:00`),v=Math.max(1,Number(n)||1);if(type==='daily'||type==='custom')dt.setDate(dt.getDate()+v);else if(type==='weekly')dt.setDate(dt.getDate()+7*v);else if(type==='monthly')dt.setMonth(dt.getMonth()+v);return dt.toISOString().slice(0,10)}
const rrLabel=(type,n=1)=>{if(!type||type==='none')return null;const v=Number(n)||1;if(type==='daily')return v===1?'Daily':`${v}d`;if(type==='weekly')return v===1?'Weekly':`${v}w`;if(type==='monthly')return v===1?'Monthly':`${v}mo`;return`${v}d`}

// ── Global styles — CSS variable theming, crisp DM Sans font ──────────────────
function GlobalStyle({ lightMode }) {
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-theme', lightMode ? 'light' : 'dark')
    html.style.transition = 'background 0.25s, color 0.25s'
    html.style.filter = '' // NEVER use filter:invert — it blurs fonts
  }, [lightMode])
  useEffect(() => {
    // Fonts
    const lf=document.getElementById('tf-font')
    if(!lf){const l=document.createElement('link');l.id='tf-font';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Bricolage+Grotesque:wght@500;600;700;800&display=swap';document.head.appendChild(l)}
    // CSS vars + scrollbars
    const id='tf-gs';if(document.getElementById(id))return
    const s=document.createElement('style');s.id=id
    s.textContent=`
:root,[data-theme="dark"]{
  --tf-bg:#0b0f1a;--tf-panel:rgba(11,15,28,0.94);--tf-overlay:rgba(5,7,18,0.82);
  --tf-surface:#131825;--tf-surface-hov:#1a2133;
  --tf-border:rgba(255,255,255,0.07);--tf-border-hov:rgba(255,255,255,0.14);
  --tf-input:#0e1220;
  --tf-text:#eaecf5;--tf-text-sub:#5c6b87;--tf-text-mut:#26324a;
  --tf-shadow:rgba(0,0,0,0.55);--tf-shadow-lg:rgba(0,0,0,0.75);
}
[data-theme="light"]{
  --tf-bg:#f0f2f7;--tf-panel:rgba(255,255,255,0.97);--tf-overlay:rgba(15,20,40,0.55);
  --tf-surface:#ffffff;--tf-surface-hov:#f5f7fc;
  --tf-border:rgba(0,0,0,0.09);--tf-border-hov:rgba(0,0,0,0.18);
  --tf-input:#f8f9fd;
  --tf-text:#111827;--tf-text-sub:#6b7a99;--tf-text-mut:#c0c9dd;
  --tf-shadow:rgba(0,0,0,0.08);--tf-shadow-lg:rgba(0,0,0,0.15);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
input,textarea,select,button{font-family:inherit;-webkit-font-smoothing:antialiased}
.tf-board::-webkit-scrollbar{height:4px}.tf-board::-webkit-scrollbar-track{background:transparent}.tf-board::-webkit-scrollbar-thumb{background:var(--tf-border-hov);border-radius:2px}.tf-board{scrollbar-width:thin;scrollbar-color:var(--tf-border-hov) transparent}
.tf-col::-webkit-scrollbar{width:3px}.tf-col::-webkit-scrollbar-thumb{background:var(--tf-border);border-radius:2px}.tf-col{scrollbar-width:thin;scrollbar-color:var(--tf-border) transparent}
input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.5);cursor:pointer}
[data-theme="light"] input[type="date"]::-webkit-calendar-picker-indicator{filter:none;opacity:0.5}
`
    document.head.appendChild(s)
  },[])
  return null
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────
function KanbanBoard({ children, isDragging }) {
  const scrollRef=useRef();const dragXRef=useRef(null);const rafRef=useRef()
  const [canLeft,setCanLeft]=useState(false);const [canRight,setCanRight]=useState(false)
  const check=useCallback(()=>{const el=scrollRef.current;if(!el)return;setCanLeft(el.scrollLeft>4);setCanRight(el.scrollLeft+el.clientWidth<el.scrollWidth-4)},[])
  useEffect(()=>{const el=scrollRef.current;if(!el)return;check();el.addEventListener('scroll',check,{passive:true});const ro=new ResizeObserver(check);ro.observe(el);return()=>{el.removeEventListener('scroll',check);ro.disconnect()}},[check])
  useEffect(()=>{const loop=()=>{const el=scrollRef.current,x=dragXRef.current;if(el&&x!==null&&isDragging){const r=el.getBoundingClientRect(),lx=x-r.left,Z=160,S=22;if(lx<Z&&lx>=0){const t=1-lx/Z;el.scrollLeft-=S*t*t*t;check()}else if(lx>r.width-Z&&lx<=r.width){const t=1-(r.width-lx)/Z;el.scrollLeft+=S*t*t*t;check()}};rafRef.current=requestAnimationFrame(loop)};rafRef.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(rafRef.current)},[isDragging,check])
  useEffect(()=>{const m=e=>{dragXRef.current=e.clientX};const u=()=>{dragXRef.current=null};window.addEventListener('dragover',m);window.addEventListener('dragend',u);return()=>{window.removeEventListener('dragover',m);window.removeEventListener('dragend',u)}},[])
  const scrollBy=dir=>scrollRef.current?.scrollBy({left:dir*320,behavior:'smooth'})
  return(
    <div style={{position:'relative',flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
      {canLeft&&<button onClick={()=>scrollBy(-1)} style={{position:'absolute',left:0,top:'50%',transform:'translate(-50%,-50%)',zIndex:30,width:34,height:34,borderRadius:'50%',background:'var(--tf-panel)',border:'1px solid var(--tf-border-hov)',color:'var(--tf-text)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,boxShadow:G.shadow,transition:G.trans,fontFamily:G.font}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(107,140,173,0.2)';e.currentTarget.style.borderColor='rgba(107,140,173,0.4)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--tf-panel)';e.currentTarget.style.borderColor='var(--tf-border-hov)'}}>‹</button>}
      {canRight&&<button onClick={()=>scrollBy(1)} style={{position:'absolute',right:0,top:'50%',transform:'translate(50%,-50%)',zIndex:30,width:34,height:34,borderRadius:'50%',background:'var(--tf-panel)',border:'1px solid var(--tf-border-hov)',color:'var(--tf-text)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,boxShadow:G.shadow,transition:G.trans,fontFamily:G.font}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(107,140,173,0.2)';e.currentTarget.style.borderColor='rgba(107,140,173,0.4)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--tf-panel)';e.currentTarget.style.borderColor='var(--tf-border-hov)'}}>›</button>}
      {canLeft&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:56,background:'linear-gradient(to right,var(--tf-bg),transparent)',pointerEvents:'none',zIndex:10}}/>}
      {canRight&&<div style={{position:'absolute',right:0,top:0,bottom:0,width:56,background:'linear-gradient(to left,var(--tf-bg),transparent)',pointerEvents:'none',zIndex:10}}/>}
      <div ref={scrollRef} className="tf-board" style={{flex:1,overflowX:'auto',overflowY:'hidden',display:'flex',gap:12,alignItems:'stretch',paddingBottom:4}}>
        {children}
      </div>
    </div>
  )
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function Avatar({user,size=32,ring}){
  const s={width:size,height:size,borderRadius:'50%',flexShrink:0,border:ring?`2px solid ${ring}`:'1.5px solid var(--tf-border)'}
  if(!user)return<div style={{...s,background:'var(--tf-surface)'}}/>
  if(user.avatar_url)return<img src={user.avatar_url} alt={user.name} style={{...s,objectFit:'cover'}}/>
  return<div title={user.name||user.email} style={{...s,background:`linear-gradient(135deg,${user.color},${user.color}99)`,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.36,fontWeight:700,userSelect:'none',letterSpacing:'-0.02em'}}>{user.initials}</div>
}
function Tag({label,color}){const rgb=hexRgb(color);return<span style={{display:'inline-flex',alignItems:'center',gap:3,background:`rgba(${rgb},0.1)`,color,border:`1px solid rgba(${rgb},0.22)`,borderRadius:'100px',padding:'2px 9px',fontSize:10,fontWeight:600,whiteSpace:'nowrap'}}><span style={{width:4,height:4,borderRadius:'50%',background:color,flexShrink:0}}/>{label}</span>}
function Btn({children,onClick,color='#6b8cad',outline,sm,full,danger,disabled,style={}}){
  const rgb=hexRgb(danger?'#ef4444':color);const c=danger?'#ef4444':color
  const base={display:'flex',alignItems:'center',justifyContent:'center',gap:5,cursor:disabled?'not-allowed':'pointer',fontFamily:G.font,fontWeight:600,fontSize:sm?11:13,borderRadius:G.radiusMd,padding:sm?'5px 12px':'9px 18px',width:full?'100%':undefined,transition:G.trans,border:'none',opacity:disabled?0.5:1,flexShrink:0,...style}
  if(outline||danger)return<button onClick={disabled?undefined:onClick} style={{...base,background:`rgba(${rgb},0.07)`,border:`1px solid rgba(${rgb},0.22)`,color:c}}>{children}</button>
  return<button onClick={disabled?undefined:onClick} style={{...base,background:c,color:'#fff',boxShadow:`0 2px 12px rgba(${rgb},0.28)`}}>{children}</button>
}
function Modal({open,onClose,title,width=600,children}){
  if(!open)return null
  return<div onClick={onClose} style={{position:'fixed',inset:0,background:'var(--tf-overlay)',backdropFilter:G.blur,WebkitBackdropFilter:G.blur,display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:'var(--tf-panel)',border:'1px solid var(--tf-border)',borderRadius:G.radius,width:'100%',maxWidth:width,maxHeight:'92vh',overflow:'auto',boxShadow:G.shadowLg}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 22px',borderBottom:'1px solid var(--tf-border)',position:'sticky',top:0,background:'var(--tf-panel)',zIndex:1,backdropFilter:G.blurSm,WebkitBackdropFilter:G.blurSm}}>
        <span style={{fontSize:15,fontWeight:700,color:'var(--tf-text)',fontFamily:G.fontDisplay}}>{title}</span>
        <button onClick={onClose} style={{width:28,height:28,borderRadius:G.radiusSm,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='var(--tf-surface)'}>✕</button>
      </div>
      <div style={{padding:'20px 22px'}}>{children}</div>
    </div>
  </div>
}
function Confirm({open,icon,title,body,confirmLabel,confirmColor='#ef4444',onConfirm,onCancel}){
  if(!open)return null;const rgb=hexRgb(confirmColor)
  return<div onClick={onCancel} style={{position:'fixed',inset:0,background:'var(--tf-overlay)',backdropFilter:G.blur,WebkitBackdropFilter:G.blur,display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:'var(--tf-panel)',border:`1px solid rgba(${rgb},0.2)`,borderRadius:G.radius,width:'100%',maxWidth:360,padding:28,boxShadow:G.shadowLg}}>
      <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>{icon}</div>
      <div style={{fontSize:15,fontWeight:700,color:'var(--tf-text)',textAlign:'center',marginBottom:6,fontFamily:G.fontDisplay}}>{title}</div>
      <div style={{fontSize:13,color:'var(--tf-text-sub)',textAlign:'center',marginBottom:24,lineHeight:1.65}}>{body}</div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'10px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:G.font}}>Cancel</button>
        <button onClick={onConfirm} style={{flex:1,background:confirmColor,border:'none',borderRadius:G.radiusMd,padding:'10px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,boxShadow:`0 4px 18px rgba(${rgb},0.4)`,fontFamily:G.font}}>{confirmLabel}</button>
      </div>
    </div>
  </div>
}
const INP={display:'block',width:'100%',boxSizing:'border-box',background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'10px 14px',color:'var(--tf-text)',fontSize:14,outline:'none',fontFamily:G.font,lineHeight:1.5,transition:G.trans}
const LBL={display:'block',fontSize:11,color:'var(--tf-text-sub)',fontWeight:600,marginBottom:6,letterSpacing:'0.01em'}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({toast}){
  if(!toast)return null
  const c=toast.type==='ok'?'#10b981':toast.type==='warn'?'#f59e0b':'#ef4444'
  const ic=toast.type==='ok'?'✓':toast.type==='warn'?'⚠':'✕'
  return<div style={{position:'fixed',bottom:32,left:'50%',transform:'translateX(-50%)',zIndex:9999,background:'var(--tf-panel)',color:'var(--tf-text)',borderRadius:'100px',padding:'10px 22px',fontSize:13,fontWeight:600,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,boxShadow:`0 8px 40px var(--tf-shadow-lg),0 0 0 1px ${c}55`,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:8}}>
    <span style={{color:c,fontSize:14}}>{ic}</span>{toast.msg}
  </div>
}

// ── CustomSelect ─────────────────────────────────────────────────────────────
function CustomSelect({value,onChange,options,style}){
  const [open,setOpen]=useState(false);const ref=useRef()
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])
  return<div ref={ref} style={{position:'relative',...style}}>
    <div onClick={()=>setOpen(p=>!p)} style={{...INP,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',userSelect:'none'}}>
      <span style={{fontWeight:500}}>{value}</span>
      <span style={{color:'var(--tf-text-sub)',fontSize:10,marginLeft:8,transition:G.trans,transform:open?'rotate(180deg)':'none',display:'inline-block',lineHeight:1}}>▾</span>
    </div>
    {open&&<div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'var(--tf-panel)',border:'1px solid var(--tf-border-hov)',borderRadius:G.radiusMd,zIndex:999,overflow:'hidden',boxShadow:G.shadowLg}}>
      {options.map(opt=><div key={opt} onClick={()=>{onChange(opt);setOpen(false)}}
        style={{padding:'9px 13px',fontSize:13,cursor:'pointer',color:opt===value?'#6b8cad':'var(--tf-text)',background:opt===value?'rgba(107,140,173,0.09)':'transparent',fontWeight:opt===value?600:400,transition:G.transSnap,fontFamily:G.font}}
        onMouseEnter={e=>{if(opt!==value)e.currentTarget.style.background='var(--tf-surface-hov)'}}
        onMouseLeave={e=>{if(opt!==value)e.currentTarget.style.background='transparent'}}
      >{opt}</div>)}
    </div>}
  </div>
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ inviteToken }){
  const [loading,setLoading]=useState(false)
  return<div style={{minHeight:'100vh',background:'var(--tf-bg)',fontFamily:G.font,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}>
    <GlobalStyle lightMode={false}/>
    <div style={{position:'absolute',top:'15%',left:'30%',width:500,height:500,background:'radial-gradient(ellipse,rgba(107,140,173,0.08) 0%,transparent 65%)',pointerEvents:'none'}}/>
    <div style={{position:'absolute',bottom:'10%',right:'20%',width:350,height:350,background:'radial-gradient(ellipse,rgba(16,185,129,0.05) 0%,transparent 65%)',pointerEvents:'none'}}/>
    <div style={{maxWidth:420,width:'100%',padding:'44px 40px',textAlign:'center',position:'relative'}}>
      <div style={{width:56,height:56,borderRadius:16,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 20px',boxShadow:'0 8px 32px rgba(107,140,173,0.4)'}}>✦</div>
      <h1 style={{fontSize:32,fontWeight:800,color:'var(--tf-text)',margin:'0 0 8px',letterSpacing:'-0.04em',fontFamily:G.fontDisplay}}>TaskFlow</h1>
      {inviteToken
        ?<div style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.22)',borderRadius:G.radiusMd,padding:'12px 16px',marginBottom:24}}>
          <p style={{fontSize:13,color:'#8fa5be',margin:0,lineHeight:1.6}}>🎉 You've been invited!<br/>Sign in to accept your workspace invitation.</p>
        </div>
        :<p style={{fontSize:13,color:'var(--tf-text-sub)',lineHeight:1.7,margin:'0 0 28px'}}>Organize your team's work in one place.<br/>Free to use, no approval needed.</p>
      }
      <button onClick={async()=>{setLoading(true);await signInWithGoogle()}} disabled={loading}
        style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'14px 22px',background:'rgba(255,255,255,0.97)',borderRadius:G.radiusMd,border:'1px solid rgba(255,255,255,0.2)',cursor:'pointer',fontSize:14,fontWeight:600,color:'#111827',boxShadow:'0 4px 24px rgba(0,0,0,0.35)',opacity:loading?0.7:1,transition:G.trans,fontFamily:G.font}}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        {loading?'Signing in…':'Continue with Google'}
      </button>
      <div style={{marginTop:28,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,textAlign:'left'}}>
        {[['⊞','Kanban boards','Drag & drop tasks'],['👥','Team workspaces','Invite anyone'],['↻','Recurring tasks','Auto-generates next'],['*','Dashboards','Track progress']].map(([ic,t,d])=>(
          <div key={t} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'12px 14px'}}>
            <div style={{fontSize:16,marginBottom:5,color:'var(--tf-text-sub)'}}>{ic}</div>
            <div style={{fontSize:12,fontWeight:600,color:'var(--tf-text)',marginBottom:2}}>{t}</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
}

// ── Pending Invitations Banner ────────────────────────────────────────────────
function InviteBanner({invites,onAccept,onDecline}){
  if(!invites||invites.length===0)return null
  return<div style={{background:'rgba(107,140,173,0.08)',border:'1px solid rgba(107,140,173,0.18)',borderRadius:G.radiusMd,padding:'14px 18px',marginBottom:20}}>
    <div style={{fontSize:13,fontWeight:600,color:'#8fa5be',marginBottom:10}}>Pending workspace invitations ({invites.length})</div>
    {invites.map(inv=>{
      const ws=inv.workspace;const inviter=inv.inviter;const rgb=hexRgb(ws?.color||'#6b8cad')
      return<div key={inv.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--tf-surface)',border:`1px solid rgba(${rgb},0.18)`,borderRadius:G.radiusSm,padding:'10px 14px',marginBottom:8}}>
        <div style={{width:36,height:36,borderRadius:'10px',background:`rgba(${rgb},0.15)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{ws?.icon||'*'}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)'}}>{ws?.name||'Workspace'}</div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>Invited by {inviter?.name||inviter?.email} · {fmtAgo(inv.created_at)}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <Btn onClick={()=>onAccept(inv)} color="#10b981" sm>✓ Accept</Btn>
          <Btn onClick={()=>onDecline(inv)} danger sm>Decline</Btn>
        </div>
      </div>
    })}
  </div>
}

// ── Member Management Modal (invite + manage) ─────────────────────────────────
function MembersModal({open,onClose,ws,wsMembers,cu,myRole,showToast}){
  const [inviteEmail,setInviteEmail]=useState('')
  const [invitations,setInvitations]=useState([])
  const [loading,setLoading]=useState(false)
  const [cdel,setCdel]=useState(null)   // member to remove
  const isOwner=myRole==='owner';const isAdmin=myRole==='admin'||isOwner
  const rgb=hexRgb(ws?.color||'#6b8cad')

  const loadInvites=async()=>{if(!ws)return;const{data}=await getWorkspaceInvitations(ws.id);setInvitations(data?.filter(i=>i.status==='pending')||[])}
  useEffect(()=>{if(open)loadInvites()},[open,ws?.id])

  const sendInvite=async()=>{
    const email=inviteEmail.trim().toLowerCase()
    if(!email||!email.includes('@')){showToast('Enter a valid email','err');return}
    if(wsMembers.find(m=>m.email?.toLowerCase()===email)){showToast('Already a member','warn');return}
    if(invitations.find(i=>i.invitee_email===email)){showToast('Already invited','warn');return}
    setLoading(true)
    const{data,error}=await inviteToWorkspace(ws.id,cu.id,email)
    if(error){showToast('Failed to invite','err')}else{
      setInviteEmail('')
      await loadInvites()
      showToast(`Invite sent to ${email} ✓`)
    }
    setLoading(false)
  }

  const copyLink=inv=>{
    const url=`${window.location.origin}?invite=${inv.token}`
    navigator.clipboard.writeText(url).then(()=>showToast('Invite link copied!')).catch(()=>showToast('Copy failed','err'))
  }
  const cancelInv=async inv=>{await cancelInvitation(inv.id);await loadInvites();showToast('Invitation cancelled')}
  const removeMember=async m=>{
    if(m.id===cu.id){showToast('Use Leave Workspace to leave','warn');return}
    await removeMemberFromWorkspace(ws.id,m.id);onClose();showToast(`${m.name} removed`)
  }

  const roleColors={owner:'#f59e0b',admin:'#8fa5be',member:'#5a6a85'}

  return<Modal open={open} onClose={onClose} title="Members & Invitations" width={560}>
    {/* Invite form */}
    {isAdmin&&<div style={{marginBottom:24}}>
      <label style={LBL}>Invite by email</label>
      <div style={{display:'flex',gap:8}}>
        <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&sendInvite()}
          placeholder="colleague@company.com"
          style={{...INP,flex:1}}/>
        <Btn onClick={sendInvite} color={ws?.color} style={{flexShrink:0}} disabled={loading}>
          {loading?'…':'Send Invite'}
        </Btn>
      </div>
      <p style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:8,lineHeight:1.6}}>They'll see a notification when they sign in, or you can copy the invite link to share directly.</p>
    </div>}

    {/* Pending invitations */}
    {isAdmin&&invitations.length>0&&<div style={{marginBottom:24}}>
      <label style={LBL}>Pending Invitations — {invitations.length}</label>
      {invitations.map(inv=>(
        <div key={inv.id} style={{display:'flex',alignItems:'center',gap:10,background:'var(--tf-surface)',border:`1px solid rgba(${rgb},0.15)`,borderRadius:G.radiusSm,padding:'10px 14px',marginBottom:6}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{inv.invitee_email}</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>Sent {fmtAgo(inv.created_at)}</div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>copyLink(inv)} style={{background:`rgba(${rgb},0.1)`,border:`1px solid rgba(${rgb},0.2)`,borderRadius:G.radiusXs,padding:'5px 10px',color:ws?.color,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:G.font}}>📋 Copy link</button>
            <button onClick={()=>cancelInv(inv)} style={{background:'none',border:`1px solid rgba(239,68,68,0.2)`,borderRadius:G.radiusXs,padding:'5px 8px',color:'#f87171',cursor:'pointer',fontSize:11,fontFamily:G.font}}>✕</button>
          </div>
        </div>
      ))}
    </div>}

    {/* Current members */}
    <div>
      <label style={LBL}>Current Members — {wsMembers.length}</label>
      {wsMembers.map(m=>{
        const eu=enrich(m);const isSelf=m.id===cu.id;const rc=roleColors[m.role]||G.textSub
        return<div key={m.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'10px 14px',marginBottom:8}}>
          <Avatar user={eu} size={36}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{eu.name||m.email}</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{m.email}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:10,fontWeight:700,color:rc,background:`${rc}18`,border:`1px solid ${rc}30`,borderRadius:'100px',padding:'2px 9px'}}>{(m.role||'member').toUpperCase()}</span>
            {isOwner&&!isSelf&&m.role!=='owner'&&<button onClick={()=>setCdel(m)} style={{background:'none',border:`1px solid rgba(239,68,68,0.2)`,borderRadius:G.radiusXs,padding:'4px 8px',color:'#f87171',cursor:'pointer',fontSize:11,fontFamily:G.font}}>Remove</button>}
          </div>
        </div>
      })}
    </div>
    <Confirm open={!!cdel} icon="👤" title="Remove member?" body={`Remove ${cdel?.name} from this workspace?`} confirmLabel="Remove" onConfirm={()=>{removeMember(cdel);setCdel(null)}} onCancel={()=>setCdel(null)}/>
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
    {list.map((s,i)=>{const col=SC[s];const rgb=hexRgb(col);return<div key={s} style={{display:'flex',alignItems:'center',gap:10,background:'var(--tf-surface)',border:`1px solid rgba(${rgb},0.2)`,borderRadius:G.radiusMd,padding:'9px 14px',marginBottom:8}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:col,flexShrink:0,boxShadow:`0 0 8px ${col}99`}}/>
      <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{s}</span>
      <button onClick={()=>mv(i,-1)} disabled={i===0} style={{background:'none',border:'none',color:i===0?G.textMut:'var(--tf-text-sub)',cursor:i===0?'default':'pointer',fontSize:14,padding:'0 4px'}}>↑</button>
      <button onClick={()=>mv(i,1)} disabled={i===list.length-1} style={{background:'none',border:'none',color:i===list.length-1?G.textMut:'var(--tf-text-sub)',cursor:i===list.length-1?'default':'pointer',fontSize:14,padding:'0 4px'}}>↓</button>
      <Btn onClick={()=>del(s)} danger sm>✕</Btn>
    </div>})}
    <div style={{display:'flex',gap:8,margin:'16px 0'}}><input ref={ref} placeholder="New status…" style={{...INP,flex:1}} onKeyDown={e=>e.key==='Enter'&&add()}/><Btn onClick={add} color={wsColor}>Add</Btn></div>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn onClick={onClose} outline color="#64748b">Cancel</Btn><Btn onClick={()=>{onSave(list);onClose()}} color={wsColor}>Save</Btn></div>
  </Modal>
}

// ── Workspace Form ────────────────────────────────────────────────────────────
function WorkspaceFormModal({open,onClose,ws,cu,onSave}){
  const nameRef=useRef(),descRef=useRef()
  const [color,setColor]=useState(WS_COLORS[0]);const [icon,setIcon]=useState(WS_ICONS[0])
  useEffect(()=>{if(open){setColor(ws?.color||WS_COLORS[0]);setIcon(ws?.icon||WS_ICONS[0])}},[open,ws])
  if(!open||!cu)return null;const rgb=hexRgb(color)
  return<Modal open={open} onClose={onClose} title={ws?'Edit Workspace':'New Workspace'} width={460}>
    <div style={{marginBottom:16}}><label style={LBL}>Name *</label><input ref={nameRef} defaultValue={ws?.name||''} placeholder="e.g. Q4 Product Launch" style={INP} autoFocus/></div>
    <div style={{marginBottom:16}}><label style={LBL}>Description</label><textarea ref={descRef} defaultValue={ws?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="What's this workspace for?"/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 18px',marginBottom:20}}>
      <div><label style={LBL}>Color</label><div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{WS_COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:'9px',background:c,cursor:'pointer',border:`2.5px solid ${color===c?'rgba(255,255,255,0.9)':'transparent'}`,boxShadow:color===c?`0 0 0 3px rgba(${hexRgb(c)},0.35)`:'none',transition:G.trans}}/>)}</div></div>
      <div><label style={LBL}>Icon</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{WS_ICONS.map(ic=><div key={ic} onClick={()=>setIcon(ic)} style={{width:34,height:34,borderRadius:'9px',background:icon===ic?`rgba(${rgb},0.15)`:'var(--tf-surface)',border:`1.5px solid ${icon===ic?color:'var(--tf-border)'}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,transition:G.trans}}>{ic}</div>)}</div></div>
    </div>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
      <Btn onClick={onClose} outline color="#64748b">Cancel</Btn>
      <Btn onClick={async()=>{const name=nameRef.current?.value?.trim();if(!name)return;await onSave({id:ws?.id,name,description:descRef.current?.value?.trim()||'',color,icon});onClose()}} color={color}>{ws?'Save':'Create Workspace'}</Btn>
    </div>
  </Modal>
}

// ── Checklist Editor ──────────────────────────────────────────────────────────
// ── Checklist Item — uncontrolled to avoid cursor-jump on every keystroke ────
function ChecklistItem({item,onToggle,onEdit,onRemove,onEnterNext,itemRef}){
  const [text,setText]=useState(item.text)
  const [focused,setFocused]=useState(false)
  useEffect(()=>{setText(item.text)},[item.id])
  // commit is called by onBlur only — never on Enter, to avoid triggering a
  // parent state update that would cause the modal to scroll to top
  const commit=()=>{
    const t=text.trim()
    if(!t){onRemove(item.id);return}
    if(t!==item.text)onEdit(item.id,t)
    setFocused(false)
  }
  return<div style={{display:'flex',alignItems:'center',gap:8,borderRadius:G.radiusXs,padding:'3px 4px',background:focused?'var(--tf-surface-hov)':'transparent',transition:'background 0.15s'}}>
    <div onMouseDown={e=>e.preventDefault()} onClick={()=>onToggle(item.id)}
      style={{width:16,height:16,borderRadius:4,border:`2px solid ${item.done?'#10b981':'var(--tf-text-mut)'}`,background:item.done?'#10b981':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:G.trans,boxShadow:item.done?'0 2px 6px rgba(16,185,129,0.35)':'none'}}>
      {item.done&&<span style={{color:'#fff',fontSize:10,fontWeight:800,lineHeight:1}}>✓</span>}
    </div>
    <input
      ref={itemRef}
      value={text}
      onChange={e=>setText(e.target.value)}
      onFocus={()=>setFocused(true)}
      onBlur={commit}
      onKeyDown={e=>{
        if(e.key==='Enter'){
          // KEY FIX: do NOT call onEdit here — that would trigger setChecklist
          // in the parent, causing a re-render + modal scroll-to-top.
          // Just move focus; onBlur will commit the text automatically.
          e.preventDefault();e.stopPropagation()
          onEnterNext()
        } else if(e.key==='Backspace'&&!text){
          e.preventDefault();e.stopPropagation()
          onRemove(item.id);onEnterNext()
        }
      }}
      style={{flex:1,background:'none',border:'none',borderBottom:focused?'1px solid var(--tf-border-hov)':'1px solid transparent',outline:'none',color:item.done?'var(--tf-text-sub)':'var(--tf-text)',fontSize:13,fontFamily:G.font,textDecoration:item.done?'line-through':'none',lineHeight:1.6,padding:'1px 2px',transition:'border-color 0.15s'}}/>
    <button onMouseDown={e=>e.preventDefault()} onClick={()=>onRemove(item.id)}
      style={{background:'none',border:'none',color:focused?G.textSub:'var(--tf-text-mut)',cursor:'pointer',fontSize:13,padding:'0 4px',lineHeight:1,fontFamily:G.font,opacity:focused?1:0.4,transition:'opacity 0.15s'}}
      onMouseEnter={e=>e.currentTarget.style.color='#f87171'} onMouseLeave={e=>e.currentTarget.style.color=focused?G.textSub:'var(--tf-text-mut)'}>✕</button>
  </div>
}

function ChecklistEditor({items,onChange,wsColor}){
  const [newText,setNewText]=useState('');const [hideChecked,setHideChecked]=useState(false)
  const addInputRef=useRef();const itemRefs=useRef({});const rgb=hexRgb(wsColor)
  const done=items.filter(i=>i.done).length;const pct=items.length?Math.round(done/items.length*100):0

  // No setTimeout needed for Enter — no state update happens so DOM is stable
  const focusAdd=()=>addInputRef.current?.focus()
  const focusItem=(id)=>itemRefs.current[id]?.focus()

  const add=()=>{
    const t=newText.trim();if(!t)return
    onChange([...items,{id:Date.now()+Math.random(),text:t,done:false}])
    setNewText('')
    // add-input loses focus due to state update; restore after render
    setTimeout(()=>addInputRef.current?.focus(),30)
  }
  const toggle=id=>onChange(items.map(i=>i.id===id?{...i,done:!i.done}:i))
  const edit=(id,text)=>onChange(items.map(i=>i.id===id?{...i,text}:i))
  const remove=id=>onChange(items.filter(i=>i.id!==id))
  const visible=hideChecked?items.filter(i=>!i.done):items

  const handleEnterNext=(itemId)=>{
    // find position in visible list so we respect hide-checked filter
    const idx=visible.findIndex(i=>i.id===itemId)
    const next=visible[idx+1]
    if(next) focusItem(next.id)
    else focusAdd()
  }

  return<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'14px 16px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:13,fontWeight:700,color:'var(--tf-text)'}}>Checklist</span>
        {items.length>0&&<span style={{fontSize:11,color:pct===100?'#10b981':wsColor,fontWeight:700}}>{done}/{items.length}</span>}
      </div>
      <div style={{display:'flex',gap:6}}>
        {items.some(i=>i.done)&&<button onClick={()=>setHideChecked(h=>!h)} style={{background:'none',border:'1px solid var(--tf-border)',borderRadius:G.radiusXs,padding:'3px 9px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:G.font}}>{hideChecked?'Show all':'Hide done'}</button>}
        {items.length>0&&<button onClick={()=>{if(window.confirm('Clear all?'))onChange([])}} style={{background:'none',border:'1px solid rgba(239,68,68,0.25)',borderRadius:G.radiusXs,padding:'3px 9px',color:'#f87171',cursor:'pointer',fontSize:10,fontWeight:600,fontFamily:G.font}}>Clear</button>}
      </div>
    </div>
    {items.length>0&&<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
      <span style={{fontSize:10,color:'var(--tf-text-sub)',fontWeight:700,width:28,flexShrink:0}}>{pct}%</span>
      <div style={{flex:1,height:5,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:pct+'%',background:pct===100?'#10b981':wsColor,borderRadius:3,boxShadow:`0 0 8px rgba(${rgb},0.4)`,transition:'width 0.35s ease'}}/>
      </div>
    </div>}
    <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:10}}>
      {visible.map(item=><ChecklistItem
        key={item.id} item={item}
        itemRef={el=>{ itemRefs.current[item.id]=el }}
        onToggle={toggle} onEdit={edit} onRemove={remove}
        onEnterNext={()=>handleEnterNext(item.id)}/>)}
    </div>
    <div style={{display:'flex',gap:7,marginTop:8,paddingTop:10,borderTop:'1px solid var(--tf-border)'}}>
      <input ref={addInputRef} value={newText} onChange={e=>setNewText(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();add()}}}
        placeholder="New item… press Enter to add"
        style={{...INP,flex:1,padding:'7px 12px',fontSize:12}}/>
      <button onClick={add} style={{background:`rgba(${rgb},0.15)`,border:`1px solid rgba(${rgb},0.3)`,borderRadius:G.radiusMd,padding:'7px 14px',color:wsColor,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:G.font,whiteSpace:'nowrap'}}>+ Add</button>
    </div>
  </div>
}

// ── Recurrence Picker ─────────────────────────────────────────────────────────
function RecurrencePicker({recurrenceType,recurrenceInterval,onTypeChange,onIntervalChange}){
  const show=recurrenceType!=='none'
  return<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'14px 16px'}}>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:show?12:0}}>
      {RECURRENCE_TYPES.map(rt=><button key={rt} onClick={()=>onTypeChange(rt)} style={{padding:'5px 13px',borderRadius:'100px',border:`1.5px solid ${recurrenceType===rt?'#6b8cad':'var(--tf-border)'}`,background:recurrenceType===rt?'rgba(107,140,173,0.15)':'transparent',color:recurrenceType===rt?'#8fa5be':'var(--tf-text-sub)',cursor:'pointer',fontSize:11,fontWeight:recurrenceType===rt?700:500,transition:G.trans,fontFamily:G.font}}>
        {rt==='none'?'No repeat':rt.charAt(0).toUpperCase()+rt.slice(1)}
      </button>)}
    </div>
    {show&&<div style={{display:'flex',alignItems:'center',gap:12,background:'var(--tf-surface-hov)',borderRadius:G.radiusSm,padding:'10px 14px',border:'1px solid var(--tf-border)'}}>
      <span style={{fontSize:12,color:'var(--tf-text-sub)',flexShrink:0}}>Every</span>
      <input type="number" min={1} max={365} value={recurrenceInterval} onChange={e=>onIntervalChange(Math.max(1,parseInt(e.target.value)||1))} style={{...INP,width:62,padding:'5px 10px',fontSize:13,flex:'none'}}/>
      <span style={{fontSize:12,color:'var(--tf-text-sub)'}}>{recurrenceType==='weekly'?'week(s)':recurrenceType==='monthly'?'month(s)':'day(s)'}</span>
      <Tag label={`🔁 ${rrLabel(recurrenceType,recurrenceInterval)}`} color="#6b8cad"/>
    </div>}
  </div>
}


// ── Assign Task Modal ─────────────────────────────────────────────────────────
// Handles both: (A) self-assign under a manager, (B) delegate to subordinates
function AssignTaskModal({open,onClose,task,wsMembers,cu,ws,onSave}){
  const [mode,setMode]=useState('self')   // 'self' | 'delegate'
  const [delegatorId,setDelegatorId]=useState(null)
  const [subordinates,setSubordinates]=useState([])
  const rgb=ws?hexRgb(ws.color):'107,140,173'

  useEffect(()=>{
    if(!open||!cu||!task)return
    setMode('self')
    setDelegatorId(task.delegator_id||task.created_by||cu.id)
    setSubordinates([])
  },[open,task,cu])

  if(!open||!task||!cu||!ws)return null

  const others=wsMembers.filter(m=>m.id!==cu.id)
  const toggleSub=id=>setSubordinates(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])

  const save=async()=>{
    const existingAssignees=getAssignees(task)
    if(mode==='self'){
      // Case A: Add self as assignee, set chosen delegator
      const newAssignees=[...new Set([...existingAssignees,cu.id])]
      await onSave(task,{assignees:newAssignees,assigned_to:newAssignees[0],delegator_id:delegatorId})
    } else {
      // Case B: Assign to subordinates, self becomes delegator
      const newAssignees=subordinates.length>0?subordinates:[cu.id]
      await onSave(task,{assignees:newAssignees,assigned_to:newAssignees[0],delegator_id:cu.id})
    }
    onClose()
  }

  const MemberCard=({m,selected,onClick,accent})=>{
    const eu=enrich(m);const isSelf=m.id===cu.id
    const ac=accent||ws.color;const acRgb=hexRgb(ac)
    return<div onClick={onClick} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:G.radiusMd,cursor:'pointer',border:`1.5px solid ${selected?`rgba(${acRgb},0.55)`:'var(--tf-border)'}`,background:selected?`rgba(${acRgb},0.09)`:'var(--tf-surface)',transition:G.trans,flex:'1 1 180px'}}>
      <Avatar user={eu} size={32}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--tf-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isSelf?eu.name+' (You)':eu.name||m.email}</div>
      </div>
      <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${selected?ac:'var(--tf-text-mut)'}`,background:selected?ac:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        {selected&&<span style={{color:'#fff',fontSize:11,fontWeight:900}}>✓</span>}
      </div>
    </div>
  }

  return<Modal open={open} onClose={onClose} title="Assign Task" width={520}>
    {/* Task summary */}
    <div style={{background:'var(--tf-surface-hov)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'10px 14px',marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)',marginBottom:2}}>{task.title}</div>
      {task.project&&<div style={{fontSize:11,color:'var(--tf-text-sub)'}}>📁 {task.project}</div>}
    </div>

    {/* Mode tabs */}
    <div style={{display:'flex',gap:8,marginBottom:20}}>
      <button onClick={()=>setMode('self')} style={{flex:1,padding:'12px',borderRadius:G.radiusMd,border:`2px solid ${mode==='self'?`rgba(${rgb},0.5)`:'var(--tf-border)'}`,background:mode==='self'?`rgba(${rgb},0.08)`:'var(--tf-surface)',cursor:'pointer',fontFamily:G.font,transition:G.trans}}>
        <div style={{fontSize:20,marginBottom:4}}>🙋</div>
        <div style={{fontSize:13,fontWeight:800,color:mode==='self'?ws.color:'var(--tf-text)'}}>I'll take this</div>
        <div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:2}}>Self-assign under a manager</div>
      </button>
      <button onClick={()=>setMode('delegate')} style={{flex:1,padding:'12px',borderRadius:G.radiusMd,border:`2px solid ${mode==='delegate'?'rgba(245,158,11,0.5)':'var(--tf-border)'}`,background:mode==='delegate'?'rgba(245,158,11,0.08)':'var(--tf-surface)',cursor:'pointer',fontFamily:G.font,transition:G.trans}}>
        <div style={{fontSize:20,marginBottom:4}}>➡️</div>
        <div style={{fontSize:13,fontWeight:800,color:mode==='delegate'?'#f59e0b':'var(--tf-text)'}}>Delegate to team</div>
        <div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:2}}>Assign to subordinates</div>
      </button>
    </div>

    {/* CASE A: Self-assign → pick manager */}
    {mode==='self'&&<>
      <div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>
        ⚡ Who is your Manager / Delegator for this task?
      </div>
      <select value={delegatorId||''} onChange={e=>setDelegatorId(e.target.value)} style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'10px 12px',color:'var(--tf-text)',fontSize:13,cursor:'pointer',outline:'none',fontFamily:'inherit',marginBottom:16}}>
        <option value="">— Select Manager —</option>
        {wsMembers.map(m=><option key={m.id} value={m.id}>{(m.name||m.email.split('@')[0])+(m.id===cu.id?' (You)':'')}</option>)}
      </select>
      {delegatorId&&(()=>{const dm=wsMembers.find(m=>m.id===delegatorId);const eu=dm?enrich(dm):null;return eu?<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,padding:'8px 12px',borderRadius:8,border:'1.5px solid rgba(245,158,11,0.4)',background:'rgba(245,158,11,0.06)'}}>
        <Avatar user={eu} size={24}/><span style={{fontSize:12,fontWeight:600,color:'#f59e0b'}}>{dm.name||dm.email.split('@')[0]} — Manager</span>
      </div>:null})()}
      <div style={{background:'rgba(143,165,190,0.06)',border:'1px solid rgba(143,165,190,0.15)',borderRadius:G.radiusMd,padding:'10px 14px',fontSize:11,color:'#8fa5be'}}>
        This task will appear on <strong>your board</strong> as "Assigned by [Manager]". The manager sees it as a delegated task under their watch.
      </div>
    </>}

    {/* CASE B: Delegate → pick subordinates */}
    {mode==='delegate'&&<>
      <div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>
        Select subordinates to assign this task to
      </div>
      <div style={{fontSize:10,color:'var(--tf-text-sub)',marginBottom:10}}>You will be the Manager / Delegator. Selected members will see it on their board.</div>
      {others.length===0
        ?<div style={{padding:20,textAlign:'center',color:'var(--tf-text-mut)',fontSize:12}}>No other members in this workspace</div>
        :<>
          <select value="" onChange={e=>{if(e.target.value)toggleSub(e.target.value);e.target.value='';}} style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'10px 12px',color:'var(--tf-text)',fontSize:13,cursor:'pointer',outline:'none',fontFamily:'inherit',marginBottom:8}}>
            <option value="">— Add Assignee —</option>
            {others.filter(m=>!subordinates.includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name||m.email.split('@')[0]}</option>)}
          </select>
          {subordinates.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
            {subordinates.map(sid=>{const m=others.find(x=>x.id===sid);if(!m)return null;const eu=enrich(m);
              return<div key={sid} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:8,border:'1.5px solid rgba(107,140,173,0.4)',background:'rgba(107,140,173,0.08)'}}>
                <Avatar user={eu} size={20}/>
                <span style={{fontSize:12,fontWeight:600,color:ws.color}}>{m.name||m.email.split('@')[0]}</span>
                <span onClick={()=>toggleSub(sid)} style={{cursor:'pointer',fontSize:14,color:'var(--tf-text-sub)',marginLeft:2,lineHeight:1}}>×</span>
              </div>
            })}
          </div>}
        </>
      }
      <div style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:G.radiusMd,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
        <Avatar user={enrich(wsMembers.find(m=>m.id===cu.id)||{id:cu.id})} size={28}/>
        <div style={{fontSize:11,color:'#f59e0b'}}>
          <strong>You</strong> will be tagged as <strong>Manager / Delegator</strong> on this task.
          {subordinates.length>0&&<span style={{color:'var(--tf-text-sub)'}}> {subordinates.length} member{subordinates.length>1?'s':''} will be assigned.</span>}
        </div>
      </div>
    </>}

    <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18,paddingTop:14,borderTop:'1px solid var(--tf-border)'}}>
      <Btn onClick={onClose} outline color="#64748b">Cancel</Btn>
      <Btn onClick={save} color={mode==='delegate'?'#f59e0b':ws.color}
        disabled={mode==='delegate'&&subordinates.length===0}>
        {mode==='self'?'✋ Take this task':'➡️ Delegate task'}
      </Btn>
    </div>
  </Modal>
}

// ── Task Form Modal ───────────────────────────────────────────────────────────
// Field wrapper — defined OUTSIDE modal to prevent remount on every keystroke
function F({label,children,full}){return<div style={{marginBottom:16,gridColumn:full?'1/-1':undefined}}><label style={LBL}>{label}</label>{children}</div>;}

function TaskFormModal({open,onClose,task,ws,wsMembers,cu,statuses,defaultStatus,onSave,onDelete}){
  const titleRef=useRef(),descRef=useRef(),projRef=useRef(),tagsRef=useRef(),dateRef=useRef()
  const [titleVal,setTitleVal]=useState(task?.title||'')
  const [status,setStatus]=useState(defaultStatus||statuses[0]||'Todo')
  const [priority,setPriority]=useState('Medium')
  const [assignees,setAssignees]=useState([])
  const [delegatorId,setDelegatorId]=useState(null)
  const [checklist,setChecklist]=useState([])
  const [rt,setRt]=useState('none');const [ri,setRi]=useState(1)
  const [cdel,setCdel]=useState(false);const isEdit=!!task

  useEffect(()=>{
    if(!open||!cu)return
    setTitleVal(task?.title||'')
    setStatus(task?.status||defaultStatus||statuses[0]||'Todo')
    setPriority(task?.priority||'Medium')
    setRt(task?.recurrence_type||'none');setRi(task?.recurrence_interval||1)
    setChecklist(task?.checklist||[])
    if(task){const a=task.assignees?.length>0?task.assignees:task.assigned_to?[task.assigned_to]:[cu.id];setAssignees(a);setDelegatorId(task.delegator_id||task.created_by||cu.id)}
    else{setAssignees([cu.id]);setDelegatorId(cu.id)}
    // Focus title only once when modal opens — never on re-renders
    requestAnimationFrame(()=>titleRef.current?.focus())
  },[open])

  if(!open||!ws||!cu)return null
  const rgb=hexRgb(ws.color)

  const toggleA=id=>setAssignees(p=>{if(p.includes(id)){if(p.length===1)return p;return p.filter(x=>x!==id)};return[...p,id]})

  const save=async()=>{
    const title=titleVal?.trim();if(!title)return
    const fa=assignees.length>0?assignees:[cu.id]
    const payload={title,description:descRef.current?.value?.trim()||'',project:projRef.current?.value?.trim()||'',tags:(tagsRef.current?.value||'').split(',').map(t=>t.trim()).filter(Boolean),due_date:dateRef.current?.value||null,recurrence_type:rt,recurrence_interval:Math.max(1,Number(ri)||1),status,priority,assignees:fa,assigned_to:fa[0],delegator_id:delegatorId||cu.id,workspace_id:ws.id,created_by:task?.created_by||cu.id,checklist}
    await onSave(isEdit?{...task,...payload}:payload);onClose()
  }


  return<><Modal open={open} onClose={onClose} title={isEdit?'Edit Task':'New Task'} width={800}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 18px'}}>
      <F full label="Title *"><input value={titleVal} onChange={e=>setTitleVal(e.target.value)} placeholder="What needs to be done?" style={{...INP,fontSize:15,fontWeight:600}} onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();save()}}}/></F>
      <F full label="Description"><textarea ref={descRef} defaultValue={task?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="Optional details..."/></F>
      <F label="Status"><CustomSelect value={status} onChange={setStatus} options={statuses} style={{width:'100%'}}/></F>
      <F label="Priority"><CustomSelect value={priority} onChange={setPriority} options={PRIORITIES} style={{width:'100%'}}/></F>
      {/* ── DELEGATOR / MANAGER ── */}
      <F full label="⚡ Manager / Delegator">
        <select value={delegatorId||''} onChange={e=>setDelegatorId(e.target.value)} style={{...INP,cursor:'pointer'}}>
          <option value="">— Select Manager —</option>
          {wsMembers.map(m=><option key={m.id} value={m.id}>{(m.name||m.email.split('@')[0])+(m.id===cu.id?' (You)':'')}</option>)}
        </select>
        {delegatorId&&(()=>{const dm=wsMembers.find(m=>m.id===delegatorId);const eu=dm?enrich(dm):null;return eu?<div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,padding:'6px 10px',borderRadius:G.radiusMd,border:'1.5px solid rgba(245,158,11,0.4)',background:'rgba(245,158,11,0.06)'}}>
          <Avatar user={eu} size={22}/>
          <span style={{fontSize:12,fontWeight:600,color:'#f59e0b'}}>{dm.name||dm.email.split('@')[0]}</span>
          <span style={{fontSize:10,color:'rgba(245,158,11,0.7)',marginLeft:4}}>Manager</span>
        </div>:null})()}
      </F>
      {/* ── ASSIGNEES ── */}
      <F full label={`✅ Assignee${assignees.length>1?'s':''} (${assignees.length})`}>
        <select value="" onChange={e=>{if(e.target.value)toggleA(e.target.value);e.target.value='';}} style={{...INP,cursor:'pointer'}}>
          <option value="">— Add Assignee —</option>
          {wsMembers.filter(m=>!assignees.includes(m.id)).map(m=><option key={m.id} value={m.id}>{(m.name||m.email.split('@')[0])+(m.id===cu.id?' (You)':'')}</option>)}
        </select>
        {assignees.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>
          {assignees.map(aid=>{const m=wsMembers.find(x=>x.id===aid);if(!m)return null;const eu=enrich(m);
            return<div key={aid} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:G.radiusMd,border:`1.5px solid rgba(${rgb},0.4)`,background:`rgba(${rgb},0.08)`}}>
              <Avatar user={eu} size={20}/>
              <span style={{fontSize:12,fontWeight:600,color:ws.color}}>{m.name||m.email.split('@')[0]}{m.id===cu.id?' (You)':''}</span>
              <span onClick={()=>toggleA(aid)} style={{cursor:'pointer',fontSize:14,color:'var(--tf-text-sub)',marginLeft:2,lineHeight:1}}>×</span>
            </div>
          })}
        </div>}
        {delegatorId&&assignees.length>0&&!assignees.includes(delegatorId)&&
          <div style={{marginTop:8,fontSize:11,color:'#f59e0b',background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:G.radiusSm,padding:'6px 10px'}}>
            ⚡ Delegated via {wsMembers.find(m=>m.id===delegatorId)?.name||'?'}
          </div>
        }
      </F>
      <F full label="Due Date"><input ref={dateRef} type="date" defaultValue={task?.due_date||''} style={INP}/></F>
      <F full label="🔁 Recurrence"><RecurrencePicker recurrenceType={rt} recurrenceInterval={ri} onTypeChange={setRt} onIntervalChange={setRi}/></F>
      <F label="Project"><input ref={projRef} defaultValue={task?.project||''} style={INP} placeholder="e.g. Q4 Launch"/></F>
      <F label="Tags (comma)"><input ref={tagsRef} defaultValue={(task?.tags||[]).join(', ')} style={INP} placeholder="Urgent, Finance"/></F>
      <F full label="☑ Checklist"><ChecklistEditor items={checklist} onChange={setChecklist} wsColor={ws.color}/></F>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:8,paddingTop:16,borderTop:'1px solid var(--tf-border)'}}>
      {isEdit?<Btn onClick={()=>setCdel(true)} danger>Delete</Btn>:<div/>}
      <div style={{display:'flex',gap:8}}><Btn onClick={onClose} outline color="#64748b">Cancel</Btn><Btn onClick={save} color={ws.color}>{isEdit?'Save Changes':'Create Task'}</Btn></div>
    </div>
  </Modal>
  <Confirm open={cdel} icon="🗑️" title="Delete task?" body={`"${task?.title}" will be removed.`} confirmLabel="Delete" onConfirm={async()=>{setCdel(false);await onDelete(task.id);onClose()}} onCancel={()=>setCdel(false)}/></>
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
  const acc=mir?'#8fa5be':del?'#f59e0b':wsColor;const rgb=hexRgb(acc)
  const pColor=PC[task.priority]||'#64748b'
  return<>
    <div draggable={!mir}
      onDragStart={e=>{if(mir)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',task.id);onDragStart(task.id)}}
      onClick={()=>onEdit(task)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:'11px 13px 9px',cursor:mir?'default':'grab',transition:G.trans,opacity:isDragging?0.2:1,transform:hov&&!isDragging?'translateY(-1px)':'none',boxShadow:hov&&!isDragging?`0 8px 24px var(--tf-shadow),0 0 0 1px rgba(${rgb},0.18)`:'none',userSelect:'none',borderLeft:`3px solid ${hov?acc:`rgba(${rgb},0.4)`}`,position:'relative'}}>
      {/* Top meta row */}
      <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:7,flexWrap:'wrap'}}>
        <span style={{fontSize:10,fontWeight:600,color:pColor,background:`rgba(${hexRgb(pColor)},0.1)`,borderRadius:4,padding:'1px 6px'}}>{PI[task.priority]} {task.priority}</span>
        {rec&&<span style={{fontSize:10,color:'#8fa5be',background:'rgba(107,140,173,0.1)',borderRadius:4,padding:'1px 6px',fontWeight:600}}>↻ {rrLabel(task.recurrence_type,task.recurrence_interval)}</span>}
        {cl.length>0&&<span style={{fontSize:10,color:clPct===100?'#10b981':'var(--tf-text-sub)',background:'var(--tf-surface-hov)',borderRadius:4,padding:'1px 6px',fontWeight:600}}>☑ {clDone}/{cl.length}</span>}
        {ovd&&<span style={{fontSize:10,color:'#ef4444',background:'rgba(239,68,68,0.1)',borderRadius:4,padding:'1px 6px',fontWeight:600}}>Overdue</span>}
        {mir&&(()=>{const dlg=getUser(task.delegator_id||task.created_by,wsMembers);return dlg&&dlg.id!==cu.id?<div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:3,background:'rgba(143,165,190,0.1)',borderRadius:4,padding:'1px 6px'}}>
            <Avatar user={dlg} size={12}/><span style={{fontSize:10,color:'#8fa5be',fontWeight:600}}>via {dlg.name?.split(' ')[0]||dlg.email.split('@')[0]}</span>
          </div>:<span style={{marginLeft:'auto',fontSize:10,color:'#8fa5be',background:'rgba(143,165,190,0.1)',borderRadius:4,padding:'1px 6px',fontWeight:600}}>Assigned</span>})()}
        {del&&!mir&&<div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:3}}>
          {assigneeUsers.slice(0,2).map(u=><Avatar key={u.id} user={u} size={14}/>)}
          <span style={{fontSize:10,color:'#f59e0b',fontWeight:600,marginLeft:2}}>→{assigneeUsers.map(u=>u.name?.split(' ')[0]||'?').slice(0,2).join(',')}</span>
        </div>}
      </div>
      {/* Title */}
      <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)',marginBottom:task.description?4:8,lineHeight:1.4,fontFamily:G.font}}>{task.title}</div>
      {task.description&&<div style={{fontSize:11,color:'var(--tf-text-sub)',marginBottom:8,lineHeight:1.45,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{task.description}</div>}
      {/* Checklist progress bar */}
      {cl.length>0&&<div style={{marginBottom:8,height:3,background:'var(--tf-surface-hov)',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:clPct+'%',background:clPct===100?'#10b981':wsColor,borderRadius:2,transition:'width 0.3s ease'}}/></div>}
      {/* Tags */}
      {(task.tags||[]).length>0&&<div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'}}>
        {(task.tags||[]).slice(0,3).map(t=><span key={t} style={{fontSize:10,color:'var(--tf-text-sub)',background:'var(--tf-surface-hov)',border:'1px solid var(--tf-border)',borderRadius:4,padding:'1px 7px',fontWeight:500}}>{t}</span>)}
      </div>}
      {/* Bottom row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
        <span style={{fontSize:10,color:ovd?'#ef4444':'var(--tf-text-sub)',fontWeight:ovd?600:400}}>{task.due_date?fmtDate(task.due_date):''}</span>
        <div style={{display:'flex',alignItems:'center'}}>
          {mir?<Avatar user={creator} size={18}/>:assigneeUsers.slice(0,4).map((u,i)=><div key={u.id} style={{marginLeft:i?-5:0,zIndex:10-i}}><Avatar user={u} size={18}/></div>)}
          {!mir&&assigneeUsers.length>4&&<div style={{marginLeft:-5,width:18,height:18,borderRadius:'50%',background:'var(--tf-surface-hov)',border:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,color:'var(--tf-text-sub)',fontWeight:700}}>+{assigneeUsers.length-4}</div>}
        </div>
      </div>
      {/* Hover actions */}
      {!mir&&<div style={{display:'flex',gap:4,marginTop:8,paddingTop:8,borderTop:'1px solid var(--tf-border)',opacity:hov?1:0,transform:hov?'none':'translateY(2px)',transition:G.trans,pointerEvents:hov?'auto':'none'}}>
        <Btn onClick={e=>{e.stopPropagation();onEdit(task)}} outline color={acc} sm>Edit</Btn>
        <Btn onClick={e=>{e.stopPropagation();setCdel(true)}} danger sm>Delete</Btn>
      </div>}
    </div>
    <Confirm open={cdel} icon="🗑️" title="Delete task?" body={`"${task.title}"`} confirmLabel="Delete" onConfirm={()=>{setCdel(false);onDelete(task.id)}} onCancel={()=>setCdel(false)}/>
  </>
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanCol({status,tasks,wsColor,SC,wsMembers,cu,onEdit,onDelete,dragId,onDragStart,onDrop,onAdd}){
  const [overCol,setOverCol]=useState(false)
  const [insertIdx,setInsertIdx]=useState(null) // index to show insertion line
  const colRef=useRef()
  const col=SC[status]||wsColor;const rgb=hexRgb(col)

  const getInsertIndex=useCallback((clientY)=>{
    if(!colRef.current)return tasks.length
    const cards=[...colRef.current.querySelectorAll('[data-card]')]
    if(cards.length===0)return 0
    for(let i=0;i<cards.length;i++){
      const r=cards[i].getBoundingClientRect()
      if(clientY<r.top+r.height/2)return i
    }
    return cards.length
  },[tasks.length])

  const handleDragOver=useCallback(e=>{
    e.preventDefault();e.stopPropagation()
    setOverCol(true)
    setInsertIdx(getInsertIndex(e.clientY))
  },[getInsertIndex])

  const handleDragLeave=useCallback(e=>{
    if(!colRef.current?.contains(e.relatedTarget)){setOverCol(false);setInsertIdx(null)}
  },[])

  const handleDrop=useCallback(e=>{
    e.preventDefault();e.stopPropagation()
    const idx=getInsertIndex(e.clientY)
    setOverCol(false);setInsertIdx(null)
    onDrop(status,idx)
  },[status,onDrop,getInsertIndex])

  const InsertLine=()=><div style={{height:2,background:col,borderRadius:2,margin:'2px 0',boxShadow:`0 0 8px ${col}88`,transition:'opacity 0.1s'}}/>

  return<div style={{minWidth:252,flex:'0 0 252px',display:'flex',flexDirection:'column',minHeight:0}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'10px 13px',background:overCol?`rgba(${rgb},0.06)`:'var(--tf-surface)',border:`1px solid ${overCol?`rgba(${rgb},0.35)`:'var(--tf-border)'}`,borderRadius:G.radiusMd,borderTop:`3px solid ${col}`,transition:G.trans,flexShrink:0}}>
      <span style={{fontSize:13,fontWeight:600,color:'var(--tf-text)',flex:1,fontFamily:G.fontDisplay}}>{status}</span>
      <span style={{fontSize:11,fontWeight:700,color:col,background:`rgba(${rgb},0.12)`,borderRadius:'20px',padding:'1px 8px',minWidth:20,textAlign:'center'}}>{tasks.length}</span>
      <button onClick={()=>onAdd(status)} style={{width:22,height:22,borderRadius:6,background:`rgba(${rgb},0.12)`,border:`1px solid rgba(${rgb},0.2)`,color:col,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,flexShrink:0,padding:0,lineHeight:1,transition:G.transSnap}} onMouseEnter={e=>e.currentTarget.style.background=`rgba(${rgb},0.24)`} onMouseLeave={e=>e.currentTarget.style.background=`rgba(${rgb},0.12)`}>+</button>
    </div>
    <div ref={colRef} className="tf-col"
      onDragOver={handleDragOver} onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:5,padding:'3px 1px',background:overCol?`rgba(${rgb},0.03)`:'transparent',border:`2px dashed ${overCol?`rgba(${rgb},0.3)`:'transparent'}`,borderRadius:G.radiusMd,transition:G.trans,minHeight:120}}>
      {tasks.length===0&&!overCol&&<div style={{border:'1px dashed var(--tf-border)',borderRadius:G.radiusMd,padding:'24px 16px',textAlign:'center',color:'var(--tf-text-mut)',fontSize:12}}>Drop tasks here</div>}
      {tasks.length===0&&overCol&&insertIdx===0&&<InsertLine/>}
      {tasks.map((t,i)=><div key={t.id} data-card data-id={t.id} style={{display:'flex',flexDirection:'column',gap:0}}>
        {overCol&&insertIdx===i&&<InsertLine/>}
        <TaskCard task={t} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} isDragging={dragId===t.id}/>
      </div>)}
      {overCol&&insertIdx===tasks.length&&<InsertLine/>}
    </div>
  </div>
}

// ── Import/Export Modal ───────────────────────────────────────────────────────
function ImportExportModal({open,onClose,tasks,wsMembers,statuses,wsName,onImport}){
  const [tab,setTab]=useState('export');const [drag,setDrag]=useState(false);const [preview,setPreview]=useState(null);const fileRef=useRef()
  const esc=v=>{const s=String(v??'');return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s}
  const doExport=()=>{
    const nm=id=>wsMembers.find(m=>m.id===id)?.name||id||''
    const h=['Title','Description','Status','Priority','Assigned To','Delegator','Project','Tags','Due Date','Recurrence','Interval','Checklist']
    const rows=tasks.map(t=>[
      t.title,t.description||'',t.status,t.priority,
      nm(t.assigned_to),nm(t.delegator_id||t.created_by),
      t.project||'',(t.tags||[]).join(';'),t.due_date||'',
      t.recurrence_type||'none',t.recurrence_interval||1,
      (t.checklist||[]).map(c=>c.text).join(';')
    ].map(esc))
    const csv=[h,...rows].map(r=>r.join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${wsName}_${new Date().toISOString().slice(0,10)}.csv`;a.click()
  }
  const downloadSample=()=>{
    const members=wsMembers.slice(0,2)
    const name1=members[0]?.name||'Alice'
    const name2=members[1]?.name||'Bob'
    const today=new Date();const fmt=d=>`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`
    const d1=fmt(new Date(today.getTime()+7*864e5))
    const d2=fmt(new Date(today.getTime()+14*864e5))
    const d3=fmt(new Date(today.getTime()+3*864e5))
    const rows=[
      ['Title','Description','Status','Priority','Assigned To','Delegator','Project','Tags','Due Date','Recurrence','Interval','Checklist'],
      ['Design landing page','Create wireframes and mockups for new homepage','Todo','High',name1,name2,'Website Redesign','Design;Frontend',d1,'none',1,'Create wireframes;Design mobile layout;Get stakeholder approval;Final handoff to dev'],
      ['Write API documentation','Document all REST endpoints with examples','In Progress','Medium',name2,name2,'Developer Portal','Docs;Backend',d2,'weekly',1,'List all endpoints;Write request/response examples;Add authentication section;Review with team'],
      ['Fix login bug','Users are unable to login on mobile Safari','Todo','Critical',name1,name1,'Bug Fixes','Bug;Mobile',d3,'none',1,'Reproduce the bug;Identify root cause;Write fix;Test on Safari iOS;Deploy'],
      ['Weekly team sync','Prepare agenda and meeting notes','Todo','Low',name2,name1,'Operations','Meeting',d1,'weekly',1,'Prepare agenda;Send calendar invite;Take notes during meeting'],
      ['Code review PR #42','Review the authentication refactor pull request','Todo','Medium',name1,name2,'Backend','Code Review','','none',1,''],
    ]
    const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return s.includes(',')||s.includes('"')?`"${s.replace(/"/g,'""')}"`  :s}).join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='taskflow_sample_import.csv';a.click()
  }
  const parseCSV=text=>{
    const pr=row=>{const c=[];let cur='',q=false;for(const ch of row){if(ch==='"'&&!q)q=true;else if(ch==='"'&&q)q=false;else if(ch===','&&!q){c.push(cur.trim());cur=''}else cur+=ch}c.push(cur.trim());return c}
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);if(lines.length<2)return null
    const hd=pr(lines[0]).map(h=>h.toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z_]/g,''));const gi=k=>hd.indexOf(k)
    return lines.slice(1).map(line=>{
      const c=pr(line)
      const checklistRaw=(c[gi('checklist')]||'').split(';').map(t=>t.trim()).filter(Boolean)
      const checklist=checklistRaw.map(text=>({id:Date.now()+Math.random(),text,done:false}))
      return{title:(c[gi('title')]||'').trim(),description:(c[gi('description')]||'').trim(),status:(c[gi('status')]||'').trim(),priority:(c[gi('priority')]||'').trim(),assigned_to_name:(c[gi('assigned_to')]||'').trim(),delegator_name:(c[gi('delegator')]||'').trim(),project:(c[gi('project')]||'').trim(),tags:(c[gi('tags')]||'').split(';').map(t=>t.trim()).filter(Boolean),due_date:(c[gi('due_date')]||'').trim()||null,recurrence_type:(c[gi('recurrence')]||'none').trim(),recurrence_interval:Math.max(1,parseInt(c[gi('interval')])||1),checklist}
    }).filter(r=>r.title)
  }
  const handleFile=async f=>{if(!f)return;const rows=parseCSV(await f.text());if(!rows?.length){alert('Could not parse CSV.');return};setPreview(rows)}
  return<Modal open={open} onClose={()=>{onClose();setPreview(null);setTab('export')}} title="Import / Export" width={640}>
    <div style={{display:'flex',gap:4,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:4,marginBottom:20}}>
      {[{id:'export',lb:'⬇ Export CSV'},{id:'import',lb:'⬆ Import CSV'}].map(t=><button key={t.id} onClick={()=>{setTab(t.id);setPreview(null)}} style={{flex:1,padding:'8px',borderRadius:G.radiusSm,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:tab===t.id?'rgba(107,140,173,0.85)':'transparent',color:tab===t.id?'#fff':'var(--tf-text-sub)',transition:G.trans,fontFamily:G.font}}>{t.lb}</button>)}
    </div>
    {tab==='export'&&<div><div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,padding:16,marginBottom:16,fontSize:13,color:'var(--tf-text-sub)'}}>Export <strong style={{color:'var(--tf-text)'}}>{tasks.length} tasks</strong> as CSV — includes Assigned To, Delegator, and Checklist items.</div><Btn onClick={doExport} color="#10b981" full>⬇ Download CSV</Btn></div>}
    {tab==='import'&&!preview&&<div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}} onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${drag?'#6b8cad':'var(--tf-border)'}`,borderRadius:G.radiusMd,padding:'36px 20px',textAlign:'center',cursor:'pointer',background:drag?'rgba(107,140,173,0.04)':'transparent',transition:G.trans,marginBottom:14}}>
        <div style={{fontSize:36,marginBottom:10}}>📂</div>
        <p style={{fontSize:13,fontWeight:600,color:'var(--tf-text-sub)',margin:'0 0 6px'}}>Drop CSV here or click to browse</p>
        <p style={{fontSize:11,color:'var(--tf-text-mut)',margin:0,lineHeight:1.8}}>
          Columns: Title, Description, Status, Priority, Assigned To, Delegator, Project, Tags, Due Date, Recurrence, Interval, <strong style={{color:'#8fa5be'}}>Checklist</strong><br/>
          <span style={{color:'rgba(143,165,190,0.6)'}}>Checklist items separated by semicolons e.g. "Step 1;Step 2;Step 3"</span>
        </p>
        <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
      </div>
      <button onClick={downloadSample} style={{width:'100%',background:'rgba(107,140,173,0.08)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:G.radiusMd,padding:'10px',color:'#8fa5be',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:G.font}}>
        📥 Download Sample CSV — includes checklist items + roles pre-filled
      </button>
    </div>}
    {tab==='import'&&preview&&<div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <strong style={{fontSize:14,color:'var(--tf-text)'}}>{preview.length} rows ready to import</strong>
        <button onClick={()=>setPreview(null)} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontFamily:G.font}}>← Back</button>
      </div>
      <div style={{maxHeight:260,overflow:'auto',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,marginBottom:16}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
          <thead><tr>{['Title','Status','Assigned To','Delegator','Checklist'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--tf-text-sub)',fontWeight:700,borderBottom:'1px solid var(--tf-border)',background:'rgba(4,9,20,0.9)',position:'sticky',top:0,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{preview.map((r,i)=><tr key={i} style={{borderBottom:'1px solid var(--tf-border)'}}>
            <td style={{padding:'7px 12px',color:'var(--tf-text)',fontWeight:600,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.title}</td>
            <td style={{padding:'7px 10px',color:'var(--tf-text-sub)',whiteSpace:'nowrap'}}>{r.status||'—'}</td>
            <td style={{padding:'7px 10px',color:'#10b981',whiteSpace:'nowrap'}}>{r.assigned_to_name||'—'}</td>
            <td style={{padding:'7px 10px',color:'#f59e0b',whiteSpace:'nowrap'}}>{r.delegator_name||'—'}</td>
            <td style={{padding:'7px 10px',color:'#8fa5be'}}>
              {r.checklist?.length>0
                ?<span title={r.checklist.map(c=>c.text).join('\n')}>☑ {r.checklist.length} item{r.checklist.length>1?'s':''}</span>
                :<span style={{color:'var(--tf-text-mut)'}}>—</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{display:'flex',gap:10}}>
        <Btn onClick={()=>setPreview(null)} outline color="#64748b" sm>Back</Btn>
        <Btn onClick={()=>{onImport(preview);onClose();setPreview(null)}} color="#6b8cad" sm>Import {preview.length} Tasks</Btn>
      </div>
    </div>}
  </Modal>
}

// ── Main App ──────────────────────────────────────────────────────────────────
// ── Team View Panel ───────────────────────────────────────────────────────────
function TeamViewPanel({allT,wsMembers,teamMemberId,setTeamMemberId,cu,wsColor,wsRgb,statuses,SC,dragId,setDragId,drop,setEditTask,delTask,openNew,setShowMembers,isOvd}){
  const [filter,setFilter]=useState('all') // 'all' | 'own' | 'assigned'
  const selMem=wsMembers.find(m=>m.id===teamMemberId)||null
  const rgb=hexRgb(wsColor)

  // All tasks visible on this member's board
  const memberAll=allT.filter(t=>isOnMyBoard(t,teamMemberId))
  const memberOwn=allT.filter(t=>t.created_by===teamMemberId)
  const memberAssigned=allT.filter(t=>getAssignees(t).includes(teamMemberId)&&t.created_by!==teamMemberId)
  const memberDone=memberAll.filter(t=>t.status===statuses[statuses.length-1])
  const memberOverdue=memberAll.filter(t=>isOvd(t.due_date))

  const displayTasks = filter==='own'?memberOwn : filter==='assigned'?memberAssigned : memberAll

  if(wsMembers.filter(m=>m.id!==cu.id).length===0)return(
    <div style={{textAlign:'center',padding:56,border:'1px dashed var(--tf-border)',borderRadius:G.radius,color:'var(--tf-text-mut)'}}>
      <div style={{fontSize:36,marginBottom:12}}>👥</div>
      <div style={{fontSize:14,fontWeight:700,color:'var(--tf-text-sub)',marginBottom:8}}>No teammates yet</div>
      <div style={{fontSize:12,marginBottom:20}}>Invite colleagues to collaborate on tasks.</div>
      <Btn onClick={()=>setShowMembers(true)} color={wsColor}>+ Invite Members</Btn>
    </div>
  )

  return<div style={{display:'flex',flexDirection:'column',gap:16}}>
    {/* Member picker + selected info — single compact row */}
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
      <span style={{fontSize:11,color:'var(--tf-text-sub)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Member</span>
      <select value={teamMemberId||''} onChange={e=>setTeamMemberId(e.target.value)} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'6px 12px',color:'var(--tf-text)',fontSize:12,fontWeight:600,cursor:'pointer',outline:'none',fontFamily:'inherit',minWidth:200}}>
        {wsMembers.map(m=>{
          const mAll=allT.filter(t=>isOnMyBoard(t,m.id)).length
          return<option key={m.id} value={m.id}>{(m.name||m.email.split('@')[0])+(m.id===cu.id?' (You)':'')} — {mAll} task{mAll!==1?'s':''}</option>
        })}
      </select>
      {selMem&&<div style={{display:'flex',alignItems:'center',gap:6,background:'var(--tf-surface)',border:`1px solid rgba(${rgb},0.15)`,borderRadius:'100px',padding:'4px 12px 4px 4px',flexShrink:0}}>
        <Avatar user={enrich(selMem)} size={22} ring={wsColor}/>
        <span style={{fontSize:11,fontWeight:600,color:'var(--tf-text)',whiteSpace:'nowrap'}}>{selMem.name||selMem.email.split('@')[0]}{selMem.id===cu.id?' (You)':''}</span>
      </div>}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginLeft:'auto'}}>
          {[
            {l:'Total',v:memberAll.length,c:wsColor,f:'all'},
            {l:'Own',v:memberOwn.length,c:'#8fa5be',f:'own'},
            {l:'Assigned',v:memberAssigned.length,c:'#f59e0b',f:'assigned'},
            {l:'Done',v:memberDone.length,c:'#10b981',f:null},
            {l:'Overdue',v:memberOverdue.length,c:'#ef4444',f:null},
          ].map(x=>{
            const xrgb=hexRgb(x.c);const active=filter===x.f
            return<div key={x.l} onClick={x.f?()=>setFilter(f=>f===x.f?'all':x.f):undefined}
              style={{textAlign:'center',background:active?`rgba(${xrgb},0.15)`:'var(--tf-surface)',border:`1px solid ${active?`rgba(${xrgb},0.4)`:'var(--tf-border)'}`,borderRadius:G.radiusSm,padding:'5px 10px',cursor:x.f?'pointer':'default',transition:G.trans,minWidth:44}}>
              <div style={{fontSize:16,fontWeight:800,color:x.c,lineHeight:1}}>{x.v}</div>
              <div style={{fontSize:9,color:active?x.c:'var(--tf-text-sub)',fontWeight:700,marginTop:2,textTransform:'uppercase',letterSpacing:'0.06em'}}>{x.l}</div>
            </div>
          })}
        </div>
    </div>

    {selMem&&<>
      {/* Filter tabs */}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:11,color:'var(--tf-text-sub)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Showing:</span>
        {[{id:'all',label:`Full Board (${memberAll.length})`},{id:'own',label:`Created by them (${memberOwn.length})`},{id:'assigned',label:`Assigned to them (${memberAssigned.length})`}].map(f=>{
          const active=filter===f.id;const frgb=hexRgb(wsColor)
          return<button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:'6px 14px',borderRadius:'100px',border:`1.5px solid ${active?`rgba(${frgb},0.5)`:'var(--tf-border)'}`,background:active?`rgba(${frgb},0.12)`:'transparent',color:active?wsColor:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:active?700:500,transition:G.trans,fontFamily:G.font}}>{f.label}</button>
        })}
      </div>

      {/* Full Kanban board */}
      {displayTasks.length===0
        ?<div style={{textAlign:'center',padding:40,border:'1px dashed var(--tf-border)',borderRadius:G.radiusMd,color:'var(--tf-text-mut)',fontSize:13}}>
          No tasks{filter==='assigned'?' assigned to ':filter==='own'?' created by ':' on the board for '}{selMem.name?.split(' ')[0]||'this member'} yet.
        </div>
        :<div style={{height:'calc(100vh - 340px)',minHeight:320,display:'flex',flexDirection:'column'}}>
          <KanbanBoard isDragging={!!dragId}>
            {statuses.map(st=><KanbanCol key={st} status={st}
              tasks={displayTasks.filter(t=>t.status===st)}
              wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu}
              onEdit={setEditTask} onDelete={delTask}
              dragId={dragId} onDragStart={setDragId} onDrop={drop}
              onAdd={s=>openNew(s)}/>)}
          </KanbanBoard>
        </div>}
    </>}
  </div>
}

function TaskFlowApp({cu,allProfiles,onSignOut,pendingInvites,refreshInvites}){
  const [workspaces,setWorkspaces]=useState([]);const [activeWsId,setActiveWsId]=useState(null)
  const [orgs,setOrgs]=useState([])
  const [activeOrg,setActiveOrg]=useState(null)
  const [showCreateOrg,setShowCreateOrg]=useState(false)
  const [wsMembers,setWsMembers]=useState([]);const [tasks,setTasks]=useState([])
  const [myRole,setMyRole]=useState('member')
  const [view,setView]=useState('board');const [teamMemberId,setTeamMemberId]=useState(null)
  const [editTask,setEditTask]=useState(null)
  const [assignTask,setAssignTask]=useState(null);const [createStatus,setCreateStatus]=useState(null)
  const [wsForm,setWsForm]=useState(null);const [delWs,setDelWs]=useState(null)
  const [statusMgr,setStatusMgr]=useState(false);const [showImEx,setShowImEx]=useState(false)
  const [showMembers,setShowMembers]=useState(false)
  const [dragId,setDragId]=useState(null)
  const [fPriority,setFPriority]=useState('');const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true);const [toastData,setToastData]=useState(null)
  const [showUserMenu,setShowUserMenu]=useState(false);const [showWsMenu,setShowWsMenu]=useState(false)
  const [showTransferOwner,setShowTransferOwner]=useState(false)
  const [lightMode,setLightMode]=useState(()=>localStorage.getItem('tf-light')==='1')
  // Quick Add One-time Task from Home
  const [showQuickAdd,setShowQuickAdd]=useState(false)
  const [qaOrgId,setQaOrgId]=useState('')
  const [qaWorkType,setQaWorkType]=useState('')
  const [qaClientId,setQaClientId]=useState('')
  const [qaAssignee,setQaAssignee]=useState('')
  const [qaDueDate,setQaDueDate]=useState('')
  const [qaClients,setQaClients]=useState([])
  const [qaMembers,setQaMembers]=useState([])
  const [qaWorkTypes,setQaWorkTypes]=useState([])
  const [qaSaving,setQaSaving]=useState(false)
  const userMenuRef=useRef();const wsMenuRef=useRef();const notifRef=useRef()
  // Notifications
  const [showNotif,setShowNotif]=useState(false)
  const [notifData,setNotifData]=useState({today:[],overdue:[],assigned:[]})
  const [notifLoading,setNotifLoading]=useState(false)
  const notifCountRef=useRef(0)

  useEffect(()=>{localStorage.setItem('tf-light',lightMode?'1':'0')},[lightMode])

  const showToast=useCallback((msg,type='ok')=>{setToastData({msg,type});setTimeout(()=>setToastData(null),4000)},[])
  const activeWs=workspaces.find(w=>w.id===activeWsId)||null
  const wsColor=activeWs?.color||'#6b8cad';const statuses=activeWs?.custom_statuses||DEFAULT_STATUSES;const SC=scMap(statuses)
  const wsRgb=hexRgb(wsColor)

  useEffect(()=>{setTeamMemberId(null);setView('board')},[activeWsId])
  useEffect(()=>{if(view==='team'&&!teamMemberId){const o=wsMembers.find(m=>m.id!==cu.id);setTeamMemberId(o?.id||null)}},[view,wsMembers,teamMemberId,cu.id])
  useEffect(()=>{const h=e=>{if(userMenuRef.current&&!userMenuRef.current.contains(e.target))setShowUserMenu(false);if(wsMenuRef.current&&!wsMenuRef.current.contains(e.target))setShowWsMenu(false);if(notifRef.current&&!notifRef.current.contains(e.target))setShowNotif(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])

  const loadWS=useCallback(async(forceWsId)=>{try{const{data}=await getMyWorkspaces(cu.id);setWorkspaces(data||[]);if(forceWsId){setActiveWsId(forceWsId)}else if(data?.length>0&&!activeWsId){setActiveWsId(data[0].id)}}catch(e){console.error(e)}finally{setLoading(false)}},[cu.id])
  useEffect(()=>{
    loadWS();
    supabase.from('organizations').select('*').order('name').limit(100).then(function(r){if(r.data)setOrgs(r.data);});
  },[cu.id])

  useEffect(()=>{
    if(!activeWsId)return
    Promise.all([getWorkspaceMembers(activeWsId),getTasks(activeWsId),getMemberRole(activeWsId,cu.id)]).then(([{data:m},{data:t},role])=>{
      setWsMembers(m||[]);setTasks(t||[]);setMyRole(role||'member')
    })
  },[activeWsId,cu.id])

  const saveWS=async({id,name,description,color,icon})=>{
    if(id){const{error}=await updateWorkspace(id,{name,description,color,icon});if(error){showToast('Failed','err');return};setWorkspaces(p=>p.map(w=>w.id===id?{...w,name,description,color,icon}:w));showToast('Updated ✓')}
    else{const{data:ws,error}=await createWorkspace({name,description,color,icon,owner_id:cu.id});if(error||!ws){showToast('Failed to create: '+(error?.message||'unknown error'),'err');return};/* trigger auto-adds owner; also add explicitly for safety */await addMemberToWorkspace(ws.id,cu.id,'owner');showToast('Workspace created! Invite members →');await loadWS(ws.id)}
  }
  const saveStatuses=async ss=>{if(!activeWsId)return;const{error}=await updateWorkspace(activeWsId,{custom_statuses:ss});if(error){showToast('Failed','err');return};setWorkspaces(p=>p.map(w=>w.id===activeWsId?{...w,custom_statuses:ss}:w));showToast('Saved ✓')}
  const delWsHandler=async id=>{await deleteWorkspace(id);setActiveWsId(null);setDelWs(null);await loadWS()}
  const leaveWs=async()=>{await removeMemberFromWorkspace(activeWsId,cu.id);setActiveWsId(null);await loadWS();showToast('Left workspace')}

  // Quick Add One-time Task helpers
  const qaLoadOrg=async(orgId)=>{
    setQaOrgId(orgId);setQaWorkType('');setQaClientId('');setQaAssignee('');
    setQaClients([]);setQaWorkTypes([]);setQaMembers([]);
    if(!orgId)return;
    // Load work type configs for this org (only 'once' frequency)
    const rc=await supabase.from('work_type_configs').select('name,frequency,columns,due_dates').eq('org_id',orgId).eq('frequency','once').limit(100);
    setQaWorkTypes((rc.data||[]).map(c=>c.name));
    // Load clients
    const rcl=await supabase.from('clients').select('id,name,pan').eq('org_id',orgId).order('name').limit(500);
    setQaClients(rcl.data||[]);
    // Load org members
    const rm=await supabase.from('organization_members').select('user_id').eq('org_id',orgId).limit(200);
    const ids=(rm.data||[]).map(m=>m.user_id);
    if(ids.length>0){const rp=await supabase.from('profiles').select('id,name,email').in('id',ids).limit(200);setQaMembers(rp.data||[]);}
  }
  const qaSubmit=async()=>{
    if(!qaOrgId||!qaWorkType||!qaClientId)return;
    setQaSaving(true);
    // Find or create the one-time worksheet
    const label='One-time';
    const now=new Date();const fy=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
    let rw=await supabase.from('worksheets').select('id').eq('org_id',qaOrgId).eq('work_type',qaWorkType).eq('period_label',label).maybeSingle();
    let wsId=rw.data?.id;
    if(!wsId){
      const ins=await supabase.from('worksheets').insert({org_id:qaOrgId,work_type:qaWorkType,period_label:label,period_year:fy,frequency:'once',created_by:cu.id}).select('id').single();
      wsId=ins.data?.id;
    }
    if(wsId){
      const rowData={};if(qaAssignee)rowData.__assignee=qaAssignee;
      await supabase.from('worksheet_rows').insert({worksheet_id:wsId,client_id:qaClientId,org_id:qaOrgId,data:rowData,due_date:qaDueDate||null,status:'pending'});
      showToast('One-time task created!');
      setQaClientId('');setQaAssignee('');setQaDueDate('');
    }else{showToast('Failed to create worksheet','err');}
    setQaSaving(false);
  }

  // --- Notifications: load today's due, overdue, and assigned-to-me tasks ---
  const loadNotifications=useCallback(async()=>{
    if(orgs.length===0)return;
    setNotifLoading(true);
    try{
      var today=new Date();
      var todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
      var orgIds=orgs.map(function(o){return o.id;});

      // Fetch all non-completed rows with due_date <= today OR assigned to me
      var rr=await supabase.from('worksheet_rows').select('id,client_id,org_id,due_date,due_label,status,data,worksheet_id,comments').in('org_id',orgIds).neq('status','completed').limit(3000);
      var allRows=rr.data||[];

      // Fetch worksheet info for work_type names
      var wsIds=[...new Set(allRows.map(function(r){return r.worksheet_id;}))];
      var wsMap={};
      if(wsIds.length>0){
        var rw=await supabase.from('worksheets').select('id,work_type,period_label').in('id',wsIds).limit(2000);
        (rw.data||[]).forEach(function(w){wsMap[w.id]=w;});
      }

      // Fetch client names
      var clientIds=[...new Set(allRows.map(function(r){return r.client_id;}))];
      var clientMap={};
      if(clientIds.length>0){
        var rc=await supabase.from('clients').select('id,name,display_name').in('id',clientIds).limit(2000);
        (rc.data||[]).forEach(function(c){clientMap[c.id]=c;});
      }

      // Org name map
      var orgMap={};
      orgs.forEach(function(o){orgMap[o.id]=o.name;});

      // Enrich rows
      var enriched=allRows.map(function(row){
        var ws=wsMap[row.worksheet_id]||{};
        var client=clientMap[row.client_id]||{};
        // Check if this row is assigned to current user via any hierarchy level or legacy __assignee
        var rd=row.data||{};
        var isAssignedToMe=rd.__assignee===cu.id;
        var dataKeys=Object.keys(rd);
        for(var dk=0;dk<dataKeys.length;dk++){if(dataKeys[dk].indexOf('__h_')===0&&rd[dataKeys[dk]]===cu.id){isAssignedToMe=true;break;}}
        return{id:row.id,clientName:client.display_name||client.name||'Unknown',workType:ws.work_type||'',period:ws.period_label||'',orgName:orgMap[row.org_id]||'',dueDate:row.due_date,dueLabel:row.due_label||'',status:row.status||'pending',isAssignedToMe:isAssignedToMe,orgId:row.org_id};
      });

      var todayTasks=enriched.filter(function(r){return r.dueDate===todayStr;});
      var overdueTasks=enriched.filter(function(r){return r.dueDate&&r.dueDate<todayStr;});
      var assignedToMe=enriched.filter(function(r){return r.isAssignedToMe;});

      // Remove duplicates: assigned tasks that are also today/overdue stay in their category
      var todayIds=new Set(todayTasks.map(function(r){return r.id;}));
      var overdueIds=new Set(overdueTasks.map(function(r){return r.id;}));
      var assignedFiltered=assignedToMe.filter(function(r){return !todayIds.has(r.id)&&!overdueIds.has(r.id);});

      setNotifData({today:todayTasks,overdue:overdueTasks,assigned:assignedFiltered});
      notifCountRef.current=todayTasks.length+overdueTasks.length+assignedFiltered.length;
    }catch(e){console.error('Notification load error:',e);}
    setNotifLoading(false);
  },[orgs,cu.id]);

  // Load notifications on mount and every 5 minutes
  useEffect(function(){
    if(orgs.length>0){loadNotifications();}
    var iv=setInterval(function(){if(orgs.length>0)loadNotifications();},300000);
    return function(){clearInterval(iv);};
  },[orgs.length,loadNotifications]);

  const saveTask=async td=>{
    if(td.id){
      const prev=tasks.find(t=>t.id===td.id)
      const{data,error}=await updateTask(td.id,td);if(error){showToast('Failed','err');return}
      if(data)setTasks(p=>p.map(t=>t.id===data.id?data:t));await logActivity(td.id,cu.id,'Updated')
      const becameDone=prev&&prev.status!==statuses[statuses.length-1]&&td.status===statuses[statuses.length-1]
      if(becameDone&&td.recurrence_type&&td.recurrence_type!=='none'&&td.due_date){
        const nd=nextDate(td.due_date,td.recurrence_type,td.recurrence_interval)
        if(nd){const clone={title:td.title,description:td.description||'',project:td.project||'',tags:td.tags||[],due_date:nd,recurrence_type:td.recurrence_type,recurrence_interval:td.recurrence_interval||1,status:statuses[0],priority:td.priority,assigned_to:td.assigned_to,assignees:td.assignees||[td.assigned_to].filter(Boolean),checklist:[],workspace_id:td.workspace_id,created_by:cu.id};const{data:nt}=await createTask(clone);if(nt){setTasks(p=>[...p,nt]);showToast(`Next task created → ${fmtFull(nd)} 🔁`);return}}
      }
      showToast('Saved ✓')
    } else {
      const{data,error}=await createTask(td);if(error){showToast('Failed','err');return}
      if(data){setTasks(p=>[...p,data]);await logActivity(data.id,cu.id,'Created')}
      showToast(rrLabel(td.recurrence_type,td.recurrence_interval)?`Created 🔁 ${rrLabel(td.recurrence_type,td.recurrence_interval)}`:'Created ✓')
    }
  }
  const delTask=async id=>{await deleteTask(id);setTasks(p=>p.filter(t=>t.id!==id));setEditTask(null);setCreateStatus(null)}

  const claimTask=useCallback(async(task)=>{
    const existing=getAssignees(task)
    if(existing.includes(cu.id)){showToast('Already on your board!');return}
    const newAssignees=[...existing,cu.id]
    const delegator=task.delegator_id||task.created_by
    const{data}=await updateTask(task.id,{assignees:newAssignees,assigned_to:newAssignees[0],delegator_id:delegator})
    if(data){
      setTasks(p=>p.map(t=>t.id===task.id?data:t))
      showToast(`✋ Claimed! "${task.title}" added to your board`)
      await logActivity(task.id,cu.id,'Claimed task')
    }else{showToast('Failed to claim task','err')}
  },[cu.id,tasks])

  const handleAssignSave=useCallback(async(task,updates)=>{
    const{data}=await updateTask(task.id,updates)
    if(data){
      setTasks(p=>p.map(t=>t.id===task.id?data:t))
      const isSelf=updates.assignees?.includes(cu.id)&&updates.delegator_id!==cu.id
      const isDel=updates.delegator_id===cu.id&&!updates.assignees?.includes(cu.id)
      if(isSelf) showToast(`✋ Added to your board under manager`)
      else if(isDel) showToast(`➡️ Delegated to ${updates.assignees?.length} member(s)`)
      else showToast('Assignment updated ✓')
      await logActivity(task.id,cu.id,isSelf?'Self-assigned under manager':'Delegated task')
    }else showToast('Failed to update','err')
  },[cu.id])
  const drop=useCallback(async(st,insertIdx)=>{
    if(!dragId)return
    const task=tasks.find(t=>t.id===dragId)
    if(!task){setDragId(null);return}

    const colTasks=tasks.filter(t=>t.status===st&&t.id!==dragId).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
    const idx=insertIdx??colTasks.length
    // Build new order: insert dragged task at idx
    const newOrder=[...colTasks.slice(0,idx),task,...colTasks.slice(idx)]
    // Assign sort_order values spaced by 1000
    const updates=newOrder.map((t,i)=>({id:t.id,sort_order:(i+1)*1000}))

    // Optimistic UI update
    const statusChanged=task.status!==st
    setTasks(p=>{
      const withNew=p.map(t=>{
        const u=updates.find(x=>x.id===t.id)
        return u?{...t,sort_order:u.sort_order,status:st===task.status?t.status:(t.id===dragId?st:t.status)}:t
      })
      if(statusChanged)return withNew.map(t=>t.id===dragId?{...t,status:st}:t)
      return withNew
    })
    setDragId(null)

    // Persist all sort_order changes + status change
    await Promise.all(updates.map(u=>updateTask(u.id,{sort_order:u.sort_order,...(u.id===dragId&&statusChanged?{status:st}:{})})))
    if(statusChanged)await logActivity(dragId,cu.id,`→${st}`)
  },[dragId,tasks,cu.id])
  const importTasks=async rows=>{
    const byName=n=>wsMembers.find(m=>m.name?.toLowerCase()===n?.toLowerCase()||m.email?.toLowerCase()===n?.toLowerCase())
    const normDate=d=>{
      if(!d)return null
      if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d
      const m1=d.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
      if(m1)return`${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
      const parsed=new Date(d)
      if(!isNaN(parsed))return parsed.toISOString().slice(0,10)
      return null
    }
    let a=0,s=0,errs=[]
    for(const r of rows){
      const assignee=byName(r.assigned_to_name)?.id||cu.id
      const delegator=byName(r.delegator_name)?.id||cu.id
      const{data,error}=await createTask({title:r.title,description:r.description,status:statuses.includes(r.status)?r.status:statuses[0],priority:PRIORITIES.includes(r.priority)?r.priority:'Medium',assigned_to:assignee,assignees:[assignee],delegator_id:delegator,created_by:cu.id,workspace_id:activeWsId,project:r.project,tags:r.tags,due_date:normDate(r.due_date),recurrence_type:RECURRENCE_TYPES.includes(r.recurrence_type)?r.recurrence_type:'none',recurrence_interval:r.recurrence_interval||1,checklist:r.checklist||[]})
      if(data){setTasks(p=>[...p,data]);a++}else{s++;if(error)errs.push(r.title+': '+(error.message||'err'))}
    }
    if(errs.length)console.error('Import errors:',errs)
    showToast(a>0?`✅ Imported ${a} task${a>1?'s':''}${s?' · '+s+' skipped':''}`:`❌ Import failed — ${s} row${s>1?'s':''} skipped`,'err')
  }

  const acceptInv=async inv=>{
    const{data,error}=await acceptInvitation(inv.id,inv.invitee_email,inv.workspace_id,cu.id)
    if(error){showToast('Failed to join workspace','err');return}
    await refreshInvites()
    await loadWS(inv.workspace_id)
    showToast(`Joined ${inv.workspace?.name||'workspace'}! 🎉`)
  }
  const declineInv=async inv=>{await declineInvitation(inv.id);await refreshInvites();showToast('Invitation declined')}

  const loadWs=async function(){var r=await supabase.from('workspaces').select('*');if(r.data)setWorkspaces(r.data);};
  const createOrg=function(){setShowCreateOrg(true);};
  const handleOrgBack=async function(){setActiveOrg(null);var r1=await supabase.from('workspaces').select('*').limit(200);var r2=await supabase.from('organizations').select('*').order('name').limit(100);if(r1.data)setWorkspaces(r1.data);if(r2.data)setOrgs(r2.data);};
  const openNew=s=>{setCreateStatus(s||statuses[0]);setEditTask(null)}
  const bf=t=>{if(fPriority&&t.priority!==fPriority)return false;if(search&&!t.title.toLowerCase().includes(search.toLowerCase()))return false;return true}
  const myTasks=tasks.filter(t=>bf(t)&&isOnMyBoard(t,cu.id)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  const allT=tasks.filter(bf).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  const recT=tasks.filter(t=>t.recurrence_type&&t.recurrence_type!=='none')
  const curUser=enrich(cu)
  const views=[{id:'board',label:'My Board',icon:'⊞'},{id:'team',label:'Team',icon:'&'},{id:'recurring',label:'Recurring',icon:'🔁'},{id:'list',label:'All Tasks',icon:'☰'},{id:'dashboard',label:'Dashboard',icon:'*'}]

  if(loading)return<div style={{minHeight:'100vh',background:'var(--tf-bg)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tf-text-sub)',fontFamily:G.font}}><div style={{textAlign:'center'}}><div style={{width:44,height:44,borderRadius:13,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,margin:'0 auto 14px',boxShadow:'0 6px 24px rgba(107,140,173,0.4)'}}>✦</div><div style={{fontSize:13}}>Loading…</div></div></div>

  return<div style={{minHeight:'100vh',background:'var(--tf-bg)',fontFamily:G.font,color:'var(--tf-text)',display:'flex',flexDirection:'column',WebkitFontSmoothing:'antialiased',MozOsxFontSmoothing:'grayscale',position:'relative'}} onDragEnd={()=>setDragId(null)}>
    <GlobalStyle lightMode={lightMode}/>
    {activeWs&&<div style={{position:'fixed',top:0,left:'20%',right:0,height:'32vh',background:`radial-gradient(ellipse at 60% 0%,rgba(${wsRgb},0.06) 0%,transparent 68%)`,pointerEvents:'none',zIndex:0}}/>}
    <Toast toast={toastData}/>

    {/* TOP NAV */}
    <nav style={{height:52,background:'var(--tf-panel)',borderBottom:'1px solid var(--tf-border)',backdropFilter:G.blur,WebkitBackdropFilter:G.blur,display:'flex',alignItems:'center',padding:'0 16px',gap:5,flexShrink:0,position:'sticky',top:0,zIndex:100}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginRight:6,flexShrink:0,cursor:'pointer'}} onClick={()=>setActiveWsId(null)}>
        <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,boxShadow:'0 2px 10px rgba(107,140,173,0.35)'}}>✦</div>
        <span style={{fontSize:14,fontWeight:700,color:'var(--tf-text)',letterSpacing:'-0.03em',fontFamily:G.fontDisplay}}>TaskFlow</span>
      </div>
      <button onClick={()=>{setActiveWsId(null);setActiveOrg(null);}} title="Home — All Modules" style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:G.radiusSm,background:!activeWsId&&!activeOrg?'rgba(107,140,173,0.12)':'var(--tf-surface)',border:'1px solid '+ (!activeWsId&&!activeOrg?'rgba(107,140,173,0.3)':'var(--tf-border)'),color:!activeWsId&&!activeOrg?'#6b8cad':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:!activeWsId&&!activeOrg?700:500,flexShrink:0,fontFamily:G.font,transition:G.trans,whiteSpace:'nowrap'}} onMouseEnter={e=>{if(activeWsId||activeOrg){e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.color='var(--tf-text)'}}} onMouseLeave={e=>{if(activeWsId||activeOrg){e.currentTarget.style.background='var(--tf-surface)';e.currentTarget.style.color='var(--tf-text-sub)'}}}>⌂ Home</button>
      {!activeOrg&&<><div style={{width:1,height:16,background:'var(--tf-border)',marginRight:3,flexShrink:0}}/>
      <div style={{display:'flex',alignItems:'center',gap:2,overflowX:'auto',flex:1,scrollbarWidth:'none'}}>
        {workspaces.map(ws=>{const active=ws.id===activeWsId;const wrgb=hexRgb(ws.color);return<button key={ws.id} onClick={()=>{setActiveWsId(ws.id);setActiveOrg(null);setSearch('');setFPriority('')}} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:G.radiusSm,border:`1px solid ${active?`rgba(${wrgb},0.3)`:'transparent'}`,background:active?`rgba(${wrgb},0.1)`:'transparent',color:active?ws.color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:active?600:400,transition:G.trans,whiteSpace:'nowrap',fontFamily:G.font,flexShrink:0}} onMouseEnter={e=>{if(!active){e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.color='var(--tf-text)'}}} onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--tf-text-sub)'}}}><span>{ws.icon}</span>{ws.name}</button>})}
        <button onClick={()=>setWsForm('new')} style={{width:24,height:24,borderRadius:G.radiusSm,border:'1px dashed var(--tf-border)',background:'transparent',color:'var(--tf-text-mut)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',transition:G.trans,fontFamily:G.font,flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#6b8cad';e.currentTarget.style.color='#6b8cad'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--tf-border)';e.currentTarget.style.color='var(--tf-text-mut)'}}>+</button>
      </div></>}
      {activeOrg&&<div style={{flex:1,display:'flex',alignItems:'center',gap:8,overflow:'hidden'}}>
        <div style={{width:1,height:16,background:'var(--tf-border)',flexShrink:0}}/>
        <span style={{fontSize:12,fontWeight:700,color:'#6b8cad',whiteSpace:'nowrap'}}>{activeOrg.name}</span>
        <span style={{fontSize:11,color:'var(--tf-text-sub)',whiteSpace:'nowrap'}}>Organisation</span>
      </div>}
      {activeWs&&<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks…" style={{background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:G.radiusSm,padding:'5px 11px',color:'var(--tf-text)',fontSize:12,outline:'none',width:140,fontFamily:G.font,flexShrink:0}}/>}
      {(search||fPriority)&&<button onClick={()=>{setSearch('');setFPriority('')}} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'100px',padding:'3px 9px',color:'#f87171',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:G.font,flexShrink:0}}>✕ Clear</button>}
      {/* Workspace settings dropdown */}
      {activeWs&&<div ref={wsMenuRef} style={{position:'relative',flexShrink:0}}>
        <button onClick={()=>setShowWsMenu(v=>!v)} title="Workspace settings" style={{width:28,height:28,borderRadius:G.radiusSm,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',color:'var(--tf-text-sub)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='var(--tf-surface)'}>⚙</button>
        {showWsMenu&&<div style={{position:'absolute',top:'calc(100% + 8px)',right:0,background:'var(--tf-panel)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,minWidth:200,boxShadow:G.shadowLg,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,overflow:'hidden',zIndex:300}}>
          {[
            ...(myRole==='owner'||myRole==='admin'?[{label:'Edit workspace',icon:'✏️',action:()=>{setWsForm({...activeWs});setShowWsMenu(false)}},{label:'Manage columns',icon:'⚙',action:()=>{setStatusMgr(true);setShowWsMenu(false)}}]:[]),
            {label:'Members & Invites',icon:'👥',action:()=>{setShowMembers(true);setShowWsMenu(false)}},
            {label:'Import / Export',icon:'📊',action:()=>{setShowImEx(true);setShowWsMenu(false)}},
            ...(myRole==='owner'?[{label:'Transfer Ownership',icon:'🔑',action:()=>{setShowTransferOwner(true);setShowWsMenu(false)}},{label:'Delete workspace',icon:'🗑',action:()=>{setDelWs(activeWs);setShowWsMenu(false)},danger:true}]:[{label:'Leave workspace',icon:'🚪',action:()=>{if(window.confirm('Leave this workspace?'))leaveWs();setShowWsMenu(false)},danger:true}])
          ].map((item,i)=><button key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',color:item.danger?'#ef4444':'var(--tf-text)',fontSize:13,textAlign:'left',fontFamily:G.font,transition:G.transSnap}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='none'}><span style={{fontSize:14}}>{item.icon}</span>{item.label}</button>)}
        </div>}
      </div>}
      {/* Notifications bell */}
      <div ref={notifRef} style={{position:'relative',flexShrink:0}}>
        <button onClick={()=>{setShowNotif(v=>!v);if(!showNotif)loadNotifications();}} title="Notifications" style={{width:28,height:28,borderRadius:G.radiusSm,background:showNotif?'rgba(107,140,173,0.15)':'var(--tf-surface)',border:'1px solid '+(showNotif?'rgba(107,140,173,0.4)':'var(--tf-border)'),color:showNotif?'#6b8cad':'var(--tf-text-sub)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0,position:'relative'}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>{if(!showNotif)e.currentTarget.style.background='var(--tf-surface)'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {(notifData.today.length+notifData.overdue.length+notifData.assigned.length)>0&&<div style={{position:'absolute',top:-3,right:-3,minWidth:16,height:16,borderRadius:8,background:'#ef4444',color:'#fff',fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px',border:'2px solid var(--tf-panel)'}}>{notifData.today.length+notifData.overdue.length+notifData.assigned.length>99?'99+':notifData.today.length+notifData.overdue.length+notifData.assigned.length}</div>}
        </button>
        {showNotif&&<div style={{position:'absolute',top:'calc(100% + 8px)',right:0,background:'var(--tf-panel)',border:'1px solid var(--tf-border)',borderRadius:12,width:380,maxHeight:'70vh',boxShadow:'0 12px 40px rgba(0,0,0,0.25)',backdropFilter:G.blur,WebkitBackdropFilter:G.blur,overflow:'hidden',zIndex:300,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'14px 16px 10px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:15,fontWeight:800,color:'var(--tf-text)',letterSpacing:'-0.02em'}}>Notifications</div>
            <button onClick={loadNotifications} title="Refresh" style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:13,padding:'2px 6px',borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.color='#6b8cad'} onMouseLeave={e=>e.currentTarget.style.color='var(--tf-text-sub)'}>↻</button>
          </div>
          <div style={{overflowY:'auto',flex:1,maxHeight:'calc(70vh - 50px)'}}>
            {notifLoading&&(notifData.today.length+notifData.overdue.length+notifData.assigned.length)===0?<div style={{padding:'28px 16px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>Loading...</div>:
            (notifData.today.length+notifData.overdue.length+notifData.assigned.length)===0?<div style={{padding:'28px 16px',textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:8}}>&#x2714;&#xFE0F;</div>
              <div style={{fontSize:14,fontWeight:600,color:'var(--tf-text)'}}>All clear!</div>
              <div style={{fontSize:12,color:'var(--tf-text-sub)',marginTop:4}}>No pending due dates or assignments.</div>
            </div>:<>
              {notifData.overdue.length>0&&<div>
                <div style={{padding:'10px 16px 6px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#ef4444',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:3,background:'#ef4444',display:'inline-block'}}></span>
                  Overdue ({notifData.overdue.length})
                </div>
                {notifData.overdue.slice(0,20).map(function(item){return<div key={item.id} style={{padding:'8px 16px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',transition:'background 0.12s'}} onMouseEnter={function(e){e.currentTarget.style.background='var(--tf-surface-hov)';}} onMouseLeave={function(e){e.currentTarget.style.background='transparent';}}>
                  <div style={{width:8,height:8,borderRadius:4,background:'#ef4444',marginTop:5,flexShrink:0}}></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.clientName}</div>
                    <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{item.workType}{item.dueLabel&&item.dueLabel!=='Due'?' · '+item.dueLabel:''}{item.period?' · '+item.period:''}</div>
                    <div style={{fontSize:10,color:'#ef4444',marginTop:2,fontWeight:600}}>Due: {new Date(item.dueDate+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
                  </div>
                  <div style={{fontSize:9,color:'var(--tf-text-mut)',whiteSpace:'nowrap',marginTop:2}}>{item.orgName}</div>
                </div>;})}
                {notifData.overdue.length>20&&<div style={{padding:'6px 16px',fontSize:10,color:'var(--tf-text-sub)',textAlign:'center'}}>+{notifData.overdue.length-20} more</div>}
              </div>}

              {notifData.today.length>0&&<div>
                <div style={{padding:'10px 16px 6px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#f59e0b',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:3,background:'#f59e0b',display:'inline-block'}}></span>
                  Due Today ({notifData.today.length})
                </div>
                {notifData.today.slice(0,20).map(function(item){return<div key={item.id} style={{padding:'8px 16px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',transition:'background 0.12s'}} onMouseEnter={function(e){e.currentTarget.style.background='var(--tf-surface-hov)';}} onMouseLeave={function(e){e.currentTarget.style.background='transparent';}}>
                  <div style={{width:8,height:8,borderRadius:4,background:'#f59e0b',marginTop:5,flexShrink:0}}></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.clientName}</div>
                    <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{item.workType}{item.dueLabel&&item.dueLabel!=='Due'?' · '+item.dueLabel:''}{item.period?' · '+item.period:''}</div>
                    <div style={{fontSize:10,color:'#f59e0b',marginTop:2,fontWeight:600}}>Due today</div>
                  </div>
                  <div style={{fontSize:9,color:'var(--tf-text-mut)',whiteSpace:'nowrap',marginTop:2}}>{item.orgName}</div>
                </div>;})}
                {notifData.today.length>20&&<div style={{padding:'6px 16px',fontSize:10,color:'var(--tf-text-sub)',textAlign:'center'}}>+{notifData.today.length-20} more</div>}
              </div>}

              {notifData.assigned.length>0&&<div>
                <div style={{padding:'10px 16px 6px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#6b8cad',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:6,height:6,borderRadius:3,background:'#6b8cad',display:'inline-block'}}></span>
                  Assigned to You ({notifData.assigned.length})
                </div>
                {notifData.assigned.slice(0,20).map(function(item){return<div key={item.id} style={{padding:'8px 16px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',transition:'background 0.12s'}} onMouseEnter={function(e){e.currentTarget.style.background='var(--tf-surface-hov)';}} onMouseLeave={function(e){e.currentTarget.style.background='transparent';}}>
                  <div style={{width:8,height:8,borderRadius:4,background:'#6b8cad',marginTop:5,flexShrink:0}}></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.clientName}</div>
                    <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{item.workType}{item.dueLabel&&item.dueLabel!=='Due'?' · '+item.dueLabel:''}{item.period?' · '+item.period:''}</div>
                    {item.dueDate&&<div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:2}}>Due: {new Date(item.dueDate+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>}
                  </div>
                  <div style={{fontSize:9,color:'var(--tf-text-mut)',whiteSpace:'nowrap',marginTop:2}}>{item.orgName}</div>
                </div>;})}
                {notifData.assigned.length>20&&<div style={{padding:'6px 16px',fontSize:10,color:'var(--tf-text-sub)',textAlign:'center'}}>+{notifData.assigned.length-20} more</div>}
              </div>}
            </>}
          </div>
        </div>}
      </div>
      {/* Light/dark toggle */}
      <button onClick={()=>setLightMode(v=>!v)} title={lightMode?'Dark mode':'Light mode'} style={{width:28,height:28,borderRadius:G.radiusSm,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',color:'var(--tf-text-sub)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='var(--tf-surface)'}>{lightMode?'🌙':'☀️'}</button>
      {/* User menu */}
      <div ref={userMenuRef} style={{position:'relative',flexShrink:0}}>
        <div onClick={()=>setShowUserMenu(v=>!v)} style={{cursor:'pointer',borderRadius:'50%',border:'1.5px solid var(--tf-border)',position:'relative'}}>
          <Avatar user={curUser} size={28}/>
          {pendingInvites.length>0&&<div style={{position:'absolute',top:-2,right:-2,width:9,height:9,borderRadius:'50%',background:'#6b8cad',border:'2px solid var(--tf-bg)'}}/>}
        </div>
        {showUserMenu&&<div style={{position:'absolute',top:'calc(100% + 8px)',right:0,background:'var(--tf-panel)',border:'1px solid var(--tf-border)',borderRadius:G.radiusMd,minWidth:220,boxShadow:G.shadowLg,backdropFilter:G.blur,WebkitBackdropFilter:G.blur,overflow:'hidden',zIndex:300}}>
          <div style={{padding:'12px 14px',borderBottom:'1px solid var(--tf-border)',display:'flex',gap:10,alignItems:'center'}}>
            <Avatar user={curUser} size={32}/>
            <div><div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{cu.user_metadata?.full_name||cu.email.split('@')[0]}</div><div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{cu.email}</div></div>
          </div>
          {pendingInvites.length>0&&<div style={{borderBottom:'1px solid var(--tf-border)'}}>
            <div style={{padding:'8px 14px 4px',fontSize:10,fontWeight:700,color:'#8fa5be',textTransform:'uppercase',letterSpacing:'0.06em'}}>Pending Invitations</div>
            {pendingInvites.map(inv=>{const ws=inv.workspace;const rgb=hexRgb(ws?.color||'#6b8cad');return<div key={inv.id} style={{padding:'8px 12px',borderTop:`1px solid rgba(${rgb},0.08)`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <div style={{width:26,height:26,borderRadius:'7px',background:`rgba(${rgb},0.15)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0}}>{ws?.icon||'*'}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'var(--tf-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ws?.name||'Workspace'}</div><div style={{fontSize:10,color:'var(--tf-text-sub)'}}>from {inv.inviter?.name||inv.inviter?.email}</div></div>
              </div>
              <div style={{display:'flex',gap:5}}>
                <button onClick={async e=>{e.stopPropagation();setShowUserMenu(false);await acceptInv(inv)}} style={{flex:1,background:`rgba(${rgb},0.15)`,border:`1px solid rgba(${rgb},0.28)`,borderRadius:G.radiusXs,padding:'5px 0',color:ws?.color||'#8fa5be',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:G.font}}>✓ Accept</button>
                <button onClick={async e=>{e.stopPropagation();await declineInv(inv)}} style={{flex:1,background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.18)',borderRadius:G.radiusXs,padding:'5px 0',color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:G.font}}>Decline</button>
              </div>
            </div>})}
          </div>}
          <button onClick={()=>{setShowUserMenu(false);onSignOut()}} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 14px',background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontSize:13,textAlign:'left',fontFamily:G.font}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>⎋ Sign out</button>
        </div>}
      </div>
    </nav>

    {/* CONTENT */}
    {!activeWs
      ?activeOrg?<OrgDashboard org={activeOrg} supabase={supabase} cu={cu} allWorkspaces={workspaces} onBack={handleOrgBack}/>:<div style={{flex:1,padding:'28px 32px',position:'relative',zIndex:1,overflowY:'auto'}}>
        {/* Pending invites banner on home screen */}
        <InviteBanner invites={pendingInvites} onAccept={acceptInv} onDecline={declineInv}/>
        <OrgInviteBanner cu={cu} supabase={supabase} onAccepted={async function(){var r=await supabase.from('organizations').select('*').order('name').limit(100);if(r.data)setOrgs(r.data);}}/>
        <h1 style={{fontSize:22,fontWeight:800,color:'var(--tf-text)',margin:'0 0 6px',letterSpacing:'-0.04em'}}>Your Workspaces</h1>
        <p style={{fontSize:13,color:'var(--tf-text-sub)',margin:'0 0 24px'}}>Select a workspace or create a new one. Invite colleagues to collaborate.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
          {workspaces.map(ws=>{const wrgb=hexRgb(ws.color);return<div key={ws.id} onClick={()=>setActiveWsId(ws.id)} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radius,padding:20,cursor:'pointer',transition:G.trans,position:'relative',overflow:'hidden'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=`rgba(${wrgb},0.4)`;e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--tf-border)';e.currentTarget.style.background='var(--tf-surface)';e.currentTarget.style.transform='none'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${ws.color},${ws.color}44)`}}/>
            <div style={{display:'flex',gap:12,alignItems:'center',marginTop:4}}>
              <div style={{width:42,height:42,borderRadius:'12px',background:`rgba(${wrgb},0.14)`,border:`1px solid rgba(${wrgb},0.22)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{ws.icon}</div>
              <div><div style={{fontSize:14,fontWeight:700,color:'var(--tf-text)'}}>{ws.name}</div><div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:2}}>{ws.description||'No description'}</div></div>
            </div>
          </div>})}
          <div onClick={()=>setWsForm('new')} style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:G.radius,padding:'26px 20px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:10,transition:G.trans}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#6b8cad';e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--tf-border)';e.currentTarget.style.background='var(--tf-surface)';e.currentTarget.style.transform='none'}}>
            <div style={{width:42,height:42,borderRadius:'12px',border:'2px dashed var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'var(--tf-text-mut)'}}>+</div>
            <span style={{fontSize:13,fontWeight:600,color:'var(--tf-text-mut)'}}>New Workspace</span>
          </div>
        </div>

        {/* YOUR ORGANISATIONS */}
        <div style={{marginTop:40,paddingTop:32,borderTop:'1px solid var(--tf-border)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
            <div>
              <h2 style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',margin:0,letterSpacing:'-0.03em'}}>Your Organisations</h2>
              <p style={{fontSize:13,color:'var(--tf-text-sub)',margin:'4px 0 0'}}>Organisation Master Data &middot; Client Data &middot; Billing &middot; Time Tracking</p>
            </div>
            <button onClick={createOrg} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,flexShrink:0}}>+ New Organisation</button>
          </div>
          {orgs.length===0
            ?<div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:G.radius,padding:'32px 20px',textAlign:'center'}}>
              <div style={{fontSize:32,marginBottom:10}}>&#x1F3E2;</div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--tf-text)',marginBottom:6}}>No organisations yet</div>
              <div style={{fontSize:13,color:'var(--tf-text-sub)',marginBottom:16}}>Create an organisation to manage Client Master Data across workspaces.</div>
              <button onClick={createOrg} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'8px 20px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>Create First Organisation</button>
            </div>
            :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
              {orgs.map(org=>{
                const wsCount=workspaces.filter(w=>w.org_id===org.id).length;
                return<div key={org.id} onClick={()=>setActiveOrg(org)} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radius,padding:20,cursor:'pointer',transition:G.trans,position:'relative',overflow:'hidden'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(107,140,173,0.5)';e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--tf-border)';e.currentTarget.style.background='var(--tf-surface)';e.currentTarget.style.transform='none'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,#6b8cad,#4a7a9b)'}}/>
                  <div style={{display:'flex',gap:12,alignItems:'center',marginTop:4}}>
                    <div style={{width:42,height:42,borderRadius:'12px',background:'rgba(107,140,173,0.14)',border:'1px solid rgba(107,140,173,0.22)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'#6b8cad'}}>{org.name.charAt(0).toUpperCase()}</div>
                    <div><div style={{fontSize:14,fontWeight:700,color:'var(--tf-text)'}}>{org.name}</div><div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:2}}>{org.description||wsCount+' workspace'+(wsCount!==1?'s':'')}</div></div>
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:12}}>
                    <span style={{fontSize:10,fontWeight:600,color:'#6b8cad',background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:4,padding:'2px 7px'}}>Clients</span>
                    <span style={{fontSize:10,fontWeight:600,color:'#6b8cad',background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:4,padding:'2px 7px'}}>Orgs</span>
                    <span style={{fontSize:10,color:'var(--tf-text-sub)',background:'rgba(148,163,184,0.08)',border:'1px solid rgba(148,163,184,0.15)',borderRadius:4,padding:'2px 7px'}}>Billing (soon)</span>
                    <span style={{fontSize:10,color:'var(--tf-text-sub)',background:'rgba(148,163,184,0.08)',border:'1px solid rgba(148,163,184,0.15)',borderRadius:4,padding:'2px 7px'}}>Time (soon)</span>
                  </div>
                </div>;
              })}
            </div>
          }
        </div>

        {/* QUICK ADD ONE-TIME TASK */}
        {orgs.length>0&&<div style={{marginTop:40,paddingTop:32,borderTop:'1px solid var(--tf-border)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <h2 style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',margin:0,letterSpacing:'-0.03em'}}>Quick Add Task</h2>
              <p style={{fontSize:13,color:'var(--tf-text-sub)',margin:'4px 0 0'}}>Generate one-time tasks by selecting organisation, work type, client &amp; assignee.</p>
            </div>
            <button onClick={()=>{setShowQuickAdd(v=>!v);if(!showQuickAdd&&orgs.length===1)qaLoadOrg(orgs[0].id);}} style={{background:showQuickAdd?'rgba(34,197,94,0.12)':'#6b8cad',border:showQuickAdd?'1px solid rgba(34,197,94,0.3)':'none',borderRadius:8,padding:'7px 16px',color:showQuickAdd?'#22c55e':'#fff',cursor:'pointer',fontSize:13,fontWeight:700,flexShrink:0}}>{showQuickAdd?'Close':'+ Add Task'}</button>
          </div>
          {showQuickAdd&&<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,padding:'18px 20px'}}>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
              {orgs.length>1&&<div style={{flex:1,minWidth:150}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.06em'}}>Organisation</div>
                <select value={qaOrgId} onChange={e=>qaLoadOrg(e.target.value)} style={{width:'100%',background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'8px 10px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none',fontFamily:'inherit'}}>
                  <option value="">— Select —</option>
                  {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>}
              <div style={{flex:1,minWidth:150}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.06em'}}>Work Type</div>
                <select value={qaWorkType} onChange={e=>setQaWorkType(e.target.value)} disabled={!qaOrgId} style={{width:'100%',background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'8px 10px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none',fontFamily:'inherit',opacity:qaOrgId?1:0.5}}>
                  <option value="">— Select —</option>
                  {qaWorkTypes.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                {qaOrgId&&qaWorkTypes.length===0&&<div style={{fontSize:10,color:'#f59e0b',marginTop:3}}>No one-time work types configured</div>}
              </div>
              <div style={{flex:1,minWidth:160}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.06em'}}>Client</div>
                <select value={qaClientId} onChange={e=>setQaClientId(e.target.value)} disabled={!qaWorkType} style={{width:'100%',background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'8px 10px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none',fontFamily:'inherit',opacity:qaWorkType?1:0.5}}>
                  <option value="">— Select —</option>
                  {qaClients.map(c=><option key={c.id} value={c.id}>{c.name}{c.pan?' ('+c.pan+')':''}</option>)}
                </select>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.06em'}}>Assignee</div>
                <select value={qaAssignee} onChange={e=>setQaAssignee(e.target.value)} disabled={!qaOrgId} style={{width:'100%',background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'8px 10px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none',fontFamily:'inherit',opacity:qaOrgId?1:0.5}}>
                  <option value="">— Optional —</option>
                  {qaMembers.map(m=><option key={m.id} value={m.id}>{m.name||m.email}</option>)}
                </select>
              </div>
              <div style={{minWidth:130}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,letterSpacing:'0.06em'}}>Due Date</div>
                <input type="date" value={qaDueDate} onChange={e=>setQaDueDate(e.target.value)} style={{width:'100%',background:'var(--tf-input)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'7px 10px',color:'var(--tf-text)',fontSize:12,outline:'none',fontFamily:'inherit'}}/>
              </div>
              <button onClick={qaSubmit} disabled={!qaOrgId||!qaWorkType||!qaClientId||qaSaving} style={{background:qaOrgId&&qaWorkType&&qaClientId?'#22c55e':'#64748b',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',fontSize:13,fontWeight:700,cursor:qaOrgId&&qaWorkType&&qaClientId?'pointer':'not-allowed',opacity:qaOrgId&&qaWorkType&&qaClientId?1:0.5,whiteSpace:'nowrap'}}>{qaSaving?'Adding...':'Add Task'}</button>
            </div>
          </div>}
        </div>}

        {/* CALENDAR - Due Dates */}
        {orgs.length>0&&<div style={{marginTop:40,paddingTop:32,borderTop:'1px solid var(--tf-border)'}}>
          <CalendarView orgs={orgs} supabase={supabase} cu={cu} showMineToggle={true}/>
        </div>}

      </div>
      :<div style={{flex:1,display:'flex',flexDirection:'column',position:'relative',zIndex:1,minHeight:0}}>
        {/* Invite banner inside workspace too */}
        {pendingInvites.length>0&&<div style={{padding:'10px 24px 0',flexShrink:0}}><InviteBanner invites={pendingInvites} onAccept={acceptInv} onDecline={declineInv}/></div>}
      {/* View tabs */}
        <div style={{background:'var(--tf-panel)',borderBottom:'1px solid var(--tf-border)',backdropFilter:G.blur,WebkitBackdropFilter:G.blur,padding:'0 24px',display:'flex',alignItems:'center',gap:2,flexShrink:0}}>
          {views.map(v=><button key={v.id} onClick={()=>setView(v.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'11px 14px',border:'none',borderBottom:`2px solid ${view===v.id?wsColor:'transparent'}`,background:'none',color:view===v.id?wsColor:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:view===v.id?700:500,transition:G.trans,whiteSpace:'nowrap',fontFamily:G.font,position:'relative',top:1}}>
            <span>{v.icon}</span>{v.label}
            {v.id==='recurring'&&recT.length>0&&<span style={{fontSize:10,fontWeight:700,color:wsColor,background:`rgba(${wsRgb},0.14)`,borderRadius:'100px',padding:'1px 7px'}}>{recT.length}</span>}
          </button>)}
          <div style={{flex:1}}/>
          {/* Stacked member avatars */}
          <div style={{display:'flex',alignItems:'center',marginRight:8,cursor:'pointer'}} onClick={()=>setShowMembers(true)} title="Manage Members">
            {wsMembers.slice(0,5).map((m,i)=><div key={m.id} style={{marginLeft:i?-7:0,zIndex:wsMembers.length-i}}><Avatar user={enrich(m)} size={24} ring={i===0?wsColor:undefined}/></div>)}
            {wsMembers.length>5&&<div style={{width:24,height:24,borderRadius:'50%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'var(--tf-text-sub)',fontWeight:700,marginLeft:-7}}>+{wsMembers.length-5}</div>}
            <div style={{width:24,height:24,borderRadius:'50%',background:`rgba(${wsRgb},0.12)`,border:`1px dashed rgba(${wsRgb},0.3)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:wsColor,marginLeft:4,cursor:'pointer'}}>+</div>
          </div>
          <Btn onClick={()=>openNew()} color={wsColor} style={{margin:'7px 0',fontSize:12,padding:'7px 16px'}}>+ New Task</Btn>
        </div>

        {/* BOARD */}
        {view==='board'&&<div style={{height:'calc(100vh - 54px - 46px)',display:'flex',flexDirection:'column',overflow:'hidden',padding:'20px 24px 8px',boxSizing:'border-box'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexShrink:0}}>
            <div><h2 style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',margin:0,letterSpacing:'-0.03em'}}>My Board</h2><p style={{margin:'4px 0 0',fontSize:12,color:'var(--tf-text-sub)'}}>{myTasks.length} tasks · <span style={{color:'#8fa5be'}}>📥 assigned</span> · <span style={{color:'#f59e0b'}}>📤 delegated</span></p></div>
          </div>
          <KanbanBoard isDragging={!!dragId}>
            {statuses.map(st=><KanbanCol key={st} status={st} tasks={myTasks.filter(t=>t.status===st)} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={setEditTask} onDelete={delTask} dragId={dragId} onDragStart={setDragId} onDrop={drop} onAdd={s=>openNew(s)}/>)}
          </KanbanBoard>
        </div>}

        {/* OTHER VIEWS */}
        <div style={{display:view==='board'?'none':'block',flex:1,overflow:'auto',padding:'22px 24px 60px'}}>

          {/* TEAM */}
          {view==='team'&&<TeamViewPanel allT={allT} wsMembers={wsMembers} teamMemberId={teamMemberId} setTeamMemberId={setTeamMemberId} cu={cu} wsColor={wsColor} wsRgb={wsRgb} statuses={statuses} SC={SC} dragId={dragId} setDragId={setDragId} drop={drop} setEditTask={setEditTask} delTask={delTask} openNew={openNew} setShowMembers={setShowMembers} isOvd={isOvd}/>}

          {/* RECURRING */}
          {view==='recurring'&&<div>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
              <div><h2 style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',margin:'0 0 4px',letterSpacing:'-0.03em'}}>🔁 Recurring Tasks</h2><p style={{fontSize:12,color:'var(--tf-text-sub)',margin:0}}>{recT.length} recurring — mark Done to create next</p></div>
              <Btn onClick={()=>openNew()} color="#6b8cad">+ New Recurring</Btn>
            </div>
            {recT.length===0
              ?<div style={{textAlign:'center',padding:56,border:'1px dashed var(--tf-border)',borderRadius:G.radius,color:'var(--tf-text-mut)'}}><div style={{fontSize:36,marginBottom:12}}>🔁</div><div style={{fontSize:14,fontWeight:700,color:'var(--tf-text-sub)',marginBottom:8}}>No recurring tasks</div><div style={{fontSize:12,marginBottom:20}}>Create a task with a recurrence schedule.</div><Btn onClick={()=>openNew()} color="#6b8cad">Create First</Btn></div>
              :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
                {recT.map(t=>{const assignee=getUser(t.assigned_to,wsMembers);const ovd=isOvd(t.due_date);const rl=rrLabel(t.recurrence_type,t.recurrence_interval);const nd=nextDate(t.due_date,t.recurrence_type,t.recurrence_interval);const col=SC[t.status]||wsColor;return<div key={t.id} onClick={()=>setEditTask(t)} style={{background:'var(--tf-surface)',border:'1px solid rgba(107,140,173,0.2)',borderRadius:G.radius,padding:16,cursor:'pointer',transition:G.trans,position:'relative',overflow:'hidden'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(107,140,173,0.4)';e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.transform='translateY(-2px)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(107,140,173,0.2)';e.currentTarget.style.background='var(--tf-surface)';e.currentTarget.style.transform='none'}}>
                  <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,#6b8cad,#4a7a9b)'}}/>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:8}}><div style={{fontSize:14,fontWeight:700,color:'var(--tf-text)',flex:1,lineHeight:1.4}}>{t.title}</div><Tag label={`🔁 ${rl}`} color="#6b8cad"/></div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}><Tag label={t.status} color={col}/><Tag label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]}/>{ovd&&<Tag label="⚠ Overdue" color="#ef4444"/>}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,background:'rgba(0,0,0,0.2)',borderRadius:G.radiusSm,padding:'10px 12px'}}>
                    <div><div style={{fontSize:10,color:'var(--tf-text-mut)',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Current Due</div><div style={{fontSize:12,color:ovd?'#f87171':'var(--tf-text-sub)',fontWeight:600}}>{t.due_date?fmtFull(t.due_date):'Not set'}</div></div>
                    <div><div style={{fontSize:10,color:'var(--tf-text-mut)',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Next After Done</div><div style={{fontSize:12,color:'#10b981',fontWeight:600}}>{nd?fmtFull(nd):'—'}</div></div>
                  </div>
                </div>})}
              </div>}
          </div>}

          {/* ALL TASKS */}
          {view==='list'&&<div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div><h2 style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',margin:'0 0 4px',letterSpacing:'-0.03em'}}>All Tasks</h2><p style={{fontSize:12,color:'var(--tf-text-sub)',margin:0}}>{allT.length} tasks</p></div>
              <Btn onClick={()=>setShowImEx(true)} outline color="#64748b">📊 Import / Export</Btn>
            </div>
            <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radius,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{borderBottom:'1px solid var(--tf-border)'}}>{['Task','Status','Priority','Delegator','Assignees','Due','',''].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,color:'var(--tf-text-sub)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {allT.map(t=>{const asgns=getAssignees(t).map(id=>getUser(id,wsMembers)).filter(Boolean);const dlg=getUser(t.delegator_id||t.created_by,wsMembers);const ovd=isOvd(t.due_date);const col=SC[t.status]||wsColor;const isMine=getAssignees(t).includes(cu.id);const canClaim=!isMine;return<tr key={t.id} style={{borderBottom:'1px solid var(--tf-border)',transition:G.transSnap}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'10px 14px'}}><div style={{display:'flex',alignItems:'center',gap:9}}><div style={{width:3,height:26,borderRadius:2,background:PC[t.priority],flexShrink:0}}/><div><div style={{fontSize:12,fontWeight:600,color:'var(--tf-text)'}}>{t.title}</div>{t.project&&<div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:1}}>{t.project}</div>}</div></div></td>
                    <td style={{padding:'10px 10px'}}><Tag label={t.status} color={col}/></td>
                    <td style={{padding:'10px 10px'}}><Tag label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]}/></td>
                    <td style={{padding:'10px 10px'}}><div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={dlg} size={18}/><span style={{fontSize:11,color:'var(--tf-text-sub)'}}>{dlg?.name?.split(' ')[0]||'?'}{dlg?.id===cu.id?' (You)':''}</span></div></td>
                    <td style={{padding:'10px 10px'}}><div style={{display:'flex',alignItems:'center',gap:4}}>{asgns.length===0?<span style={{fontSize:11,color:'var(--tf-text-mut)',fontStyle:'italic'}}>Unassigned</span>:asgns.slice(0,3).map((u,i)=><div key={u.id} style={{marginLeft:i?-5:0}}><Avatar user={u} size={20}/></div>)}{asgns.length>3&&<span style={{fontSize:10,color:'var(--tf-text-sub)',marginLeft:4}}>+{asgns.length-3}</span>}{isMine&&<span style={{fontSize:9,color:'#10b981',fontWeight:700,background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:'100px',padding:'1px 6px',marginLeft:4}}>You</span>}</div></td>
                    <td style={{padding:'10px 10px'}}><span style={{fontSize:11,color:ovd?'#f87171':'var(--tf-text-sub)',fontWeight:ovd?700:400}}>{t.due_date?fmtDate(t.due_date):'—'}</span></td>
                    <td style={{padding:'8px 10px'}}>{canClaim
                      ?<button onClick={e=>{e.stopPropagation();setAssignTask(t)}} style={{background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:G.radiusMd,padding:'5px 11px',color:'#10b981',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:G.font,whiteSpace:'nowrap'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(16,185,129,0.2)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(16,185,129,0.1)'}>🙋 Assign</button>
                      :<span style={{fontSize:10,color:'#10b981',fontWeight:700}}>✓ Mine</span>}
                    </td>
                    <td style={{padding:'8px 10px'}}><Btn onClick={()=>setEditTask(t)} outline color={wsColor} sm>Edit</Btn></td>
                  </tr>})}
                  {allT.length===0&&<tr><td colSpan={8} style={{padding:40,textAlign:'center',color:'var(--tf-text-mut)',fontSize:13}}>No tasks yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>}

          {/* DASHBOARD */}
          {view==='dashboard'&&<div>
            <h2 style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',margin:'0 0 20px',letterSpacing:'-0.03em'}}>Dashboard</h2>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:16}}>
              {[{l:'Total',v:tasks.length,c:wsColor},{l:'On My Board',v:myTasks.length,c:'#8fa5be'},{l:'Recurring',v:recT.length,c:'#6b8cad'},{l:'Delegated',v:tasks.filter(t=>t.created_by===cu.id&&getAssignees(t).some(id=>id!==cu.id)).length,c:'#f59e0b'},{l:'Overdue',v:tasks.filter(t=>isOvd(t.due_date)).length,c:'#ef4444'},{l:'Members',v:wsMembers.length,c:'#10b981'}].map(x=>{const rgb=hexRgb(x.c);return<div key={x.l} style={{background:'var(--tf-surface)',border:`1px solid rgba(${rgb},0.15)`,borderRadius:G.radius,padding:'16px 18px',transition:G.trans,cursor:x.l==='Members'?'pointer':undefined}} onClick={x.l==='Members'?()=>setShowMembers(true):undefined} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='var(--tf-surface)'}><div style={{fontSize:28,fontWeight:800,color:x.c,marginBottom:2}}>{x.v}</div><div style={{fontSize:12,fontWeight:600,color:'var(--tf-text)'}}>{x.l}</div></div>})}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radius,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)',marginBottom:14}}>Status Breakdown</div>
                {statuses.map(s=>{const c=tasks.filter(t=>t.status===s).length;const p=tasks.length?Math.round((c/tasks.length)*100):0;const col=SC[s];const rgb=hexRgb(col);return<div key={s} style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:'var(--tf-text-sub)'}}>{s}</span><span style={{fontSize:12,color:col,fontWeight:700}}>{c}</span></div><div style={{height:4,background:'var(--tf-surface-hov)',borderRadius:2,overflow:'hidden'}}><div style={{width:p+'%',height:'100%',background:col,borderRadius:2,boxShadow:`0 0 8px rgba(${rgb},0.5)`,transition:'width 0.5s ease'}}/></div></div>})}
              </div>
                <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:G.radius,padding:18}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)'}}>Team Workload</div>
                    {(myRole==='owner'||myRole==='admin')&&<button onClick={()=>setShowMembers(true)} style={{background:'none',border:'none',color:'#8fa5be',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:G.font}}>+ Invite</button>}
                  </div>
                  {wsMembers.length===0
                    ?<div style={{textAlign:'center',padding:'20px 0',color:'var(--tf-text-sub)',fontSize:12}}>No members yet. Invite your team.</div>
                    :<div style={{display:'flex',flexDirection:'column',gap:12}}>
                      {wsMembers.map(m=>{
                        const eu=enrich(m);
                        const mTasks=allT.filter(t=>getAssignees(t).includes(m.id));
                        const mDone=mTasks.filter(t=>t.status==='Done'||t.status==='done').length;
                        const mOvd=mTasks.filter(t=>isOvd(t.due_date)).length;
                        const pct=mTasks.length?Math.round(mDone/mTasks.length*100):0;
                        return<div key={m.id} style={{display:'flex',alignItems:'center',gap:10}}>
                          <Avatar user={eu} size={30}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5}}>
                              <span style={{fontSize:12,fontWeight:600,color:'var(--tf-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{eu.name||eu.email}</span>
                              <span style={{fontSize:11,color:'var(--tf-text-sub)',flexShrink:0,marginLeft:8}}>{mTasks.length} tasks{mOvd>0&&<span style={{color:'#ef4444'}}> · {mOvd} overdue</span>}</span>
                            </div>
                            <div style={{height:4,background:'var(--tf-surface-hov)',borderRadius:2,overflow:'hidden'}}>
                              <div style={{width:pct+'%',height:'100%',background:pct===100?'#22c55e':wsColor,borderRadius:2,transition:'width 0.3s'}}/>
                            </div>
                          </div>
                          <span style={{fontSize:11,fontWeight:700,color:pct===100?'#22c55e':'var(--tf-text-sub)',flexShrink:0,minWidth:36,textAlign:'right'}}>{pct}%</span>
                        </div>;
                      })}
                    </div>
                  }
                </div>
                  {wsMembers.length===0
                    ?<div style={{textAlign:'center',padding:'20px 0',color:'var(--tf-text-sub)',fontSize:12}}>No members yet. Invite your team.</div>
                    :<div style={{display:'flex',flexDirection:'column',gap:10}}>
                    </div>
                  }
            </div>
          </div>}

        </div>{/* end other-views scroll */}
      </div>}

    {/* MODALS */}
    {(createStatus!==null||editTask!==null)&&activeWs&&<TaskFormModal open onClose={()=>{setCreateStatus(null);setEditTask(null)}} task={editTask} ws={activeWs} wsMembers={wsMembers} cu={cu} statuses={statuses} defaultStatus={createStatus||statuses[0]} onSave={saveTask} onDelete={delTask}/>}
    {assignTask&&activeWs&&<AssignTaskModal open={!!assignTask} onClose={()=>setAssignTask(null)} task={assignTask} wsMembers={wsMembers} cu={cu} ws={activeWs} onSave={handleAssignSave}/>}
    {wsForm&&<WorkspaceFormModal open onClose={()=>setWsForm(null)} ws={wsForm==='new'?null:wsForm} cu={cu} onSave={saveWS}/>}
    <StatusManager open={statusMgr} onClose={()=>setStatusMgr(false)} statuses={statuses} wsColor={wsColor} onSave={saveStatuses}/>
    {showImEx&&activeWs&&<ImportExportModal open onClose={()=>setShowImEx(false)} tasks={tasks} wsMembers={wsMembers} statuses={statuses} wsName={activeWs.name} onImport={importTasks}/>}
    {showMembers&&activeWs&&<MembersModal open onClose={()=>setShowMembers(false)} ws={activeWs} wsMembers={wsMembers} cu={cu} myRole={myRole} showToast={showToast}/>}
      {showTransferOwner&&<TransferOwnerModal open={showTransferOwner} ws={activeWs} wsMembers={wsMembers} cu={cu} supabase={supabase} onClose={()=>setShowTransferOwner(false)} onTransferred={()=>{setShowTransferOwner(false);showToast('Ownership transferred');loadWs();}}/> }
    <Confirm open={!!delWs} icon="⚠️" title="Delete workspace?" body={`Delete "${delWs?.name}" and all tasks?`} confirmLabel="Delete" onConfirm={()=>delWsHandler(delWs?.id)} onCancel={()=>setDelWs(null)}/>
      {showCreateOrg&&<OrgCreateModal open={showCreateOrg} cu={cu} supabase={supabase} onClose={function(){setShowCreateOrg(false);}} onCreated={async function(){setShowCreateOrg(false);var r=await supabase.from('organizations').select('*').order('name').limit(100);if(r.data)setOrgs(r.data);}}/> }
  </div>
}

// ── Root ──────────────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return{err:e}}
  render(){
    if(this.state.err)return(
      <div style={{minHeight:'100vh',background:'#0b0f1a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui',color:'#e8edf5',padding:24}}>
        <div style={{maxWidth:480,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
          <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Something went wrong</div>
          <div style={{fontSize:13,color:'#5a6a85',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px 18px',marginBottom:20,textAlign:'left',wordBreak:'break-all'}}>{this.state.err?.message||String(this.state.err)}</div>
          <button onClick={()=>window.location.reload()} style={{background:'#6b8cad',border:'none',borderRadius:10,padding:'10px 24px',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'}}>Reload</button>
        </div>
      </div>
    )
    return this.props.children
  }
}
// ── Client Master Data Module ────────────────────────────────────────
var CLIENT_STATUSES=['active','inactive','prospect'];
var WORK_TYPES_DEFAULT=['ITR','GST/GSTR','TDS','Accounts','Audit','MIS','Payroll','Other'];
var DEF_CF=[{key:'file_no',label:'File No.',type:'text'},{key:'engagement_type',label:'Engagement Type',type:'text'}];

function ClientsModule({cu,orgId,supabase,allWorkspaces,workTypeNames,workTypeConfigs}){
  var [clients,setClients]=useState([]);
  var [loading,setLoading]=useState(true);
  var [search,setSearch]=useState('');
  var [filterStatus,setFilterStatus]=useState('all');
  var [showForm,setShowForm]=useState(false);
  var [editClient,setEditClient]=useState(null);
  var [showImport,setShowImport]=useState(false);
  var [toastMsg,setToastMsg]=useState(null);
  useEffect(function(){load();},[ orgId]);
  async function load(){
    setLoading(true);
    if(!orgId){setClients([]);setLoading(false);return;}
    var r=await supabase.from('clients').select('*').eq('org_id',orgId).order('name').limit(500);
    if(!r.error)setClients(r.data||[]);
    setLoading(false);
  }
  function toast(msg,type){setToastMsg({msg,type:type||'ok'});setTimeout(function(){setToastMsg(null);},3000);}
  async function del(id){
    if(!window.confirm('Delete this client?'))return;
    var r=await supabase.from('clients').delete().eq('id',id);
    if(!r.error){setClients(function(c){return c.filter(function(x){return x.id!==id;});});toast('Deleted');}
    else toast(r.error.message,'err');
  }
  function exportCSV(){
    var baseCols=['name','display_name','client_type','email','phone','city','state','pan','gstin','status','notes'];
    var cfKeySet={};
    clients.forEach(function(c){var cf=c.custom_fields||{};Object.keys(cf).forEach(function(k){cfKeySet[k]=1;});});
    var extraCols=['work_types'];
    Object.keys(cfKeySet).forEach(function(k){if(k!=='work_types')extraCols.push(k);});
    var allCols=baseCols.concat(extraCols);
    var esc=function(v){var s=v==null?'':String(v);return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;};
    var rows=clients.map(function(c){return allCols.map(function(col){if(baseCols.indexOf(col)!==-1)return esc(c[col]);return esc((c.custom_fields||{})[col]);}).join(',');});
    var csv=[allCols.join(',')].concat(rows).join('\n');
    var url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    var a=document.createElement('a');a.href=url;a.download='clients.csv';a.click();URL.revokeObjectURL(url);
    toast('Exported '+clients.length+' clients');
  }
  var filtered=clients.filter(function(c){
    var q=search.toLowerCase();
    return(!q||c.name.toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.pan||'').toLowerCase().includes(q))&&(filterStatus==='all'||c.status===filterStatus);
  });
  var SC={active:'#22c55e',inactive:'#94a3b8',prospect:'#f59e0b'};
  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,outline:'none',fontFamily:'inherit'};
  return<div style={{padding:'0 0 40px',maxWidth:1100,margin:'0 auto'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:10}}>
      <div><h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Client Master Data</h2><div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>{clients.length} clients · {clients.filter(function(c){return c.status==='active';}).length} active</div></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button onClick={function(){setShowImport(true);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 14px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>⬆ Import</button>
        <button onClick={exportCSV} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 14px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>⬇ Export</button>
        <button onClick={function(){setEditClient(null);setShowForm(true);}} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>+ New Client</button>
      </div>
    </div>
    <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
      <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search name, email, PAN..." style={Object.assign({},INP,{flex:1,minWidth:200,width:'auto'})}/>
      <select value={filterStatus} onChange={function(e){setFilterStatus(e.target.value);}} style={Object.assign({},INP,{cursor:'pointer'})}>
        <option value="all">All Status</option>
        {CLIENT_STATUSES.map(function(s){return<option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>;})}
      </select>
    </div>
    {loading?<div style={{textAlign:'center',padding:48,color:'var(--tf-text-sub)'}}>Loading...</div>:filtered.length===0?
      <div style={{textAlign:'center',padding:48,color:'var(--tf-text-sub)',background:'var(--tf-surface)',borderRadius:12,border:'1px solid var(--tf-border)'}}>
        {clients.length===0?<span>No clients yet. <button onClick={function(){setEditClient(null);setShowForm(true);}} style={{background:'none',border:'none',color:'#6b8cad',cursor:'pointer',fontWeight:600}}>Add first →</button></span>:'No matches.'}
      </div>:
      <div style={{background:'var(--tf-surface)',borderRadius:12,border:'1px solid var(--tf-border)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'rgba(107,140,173,0.08)'}}>
            {['Client','Type','Contact','Tax IDs','Work Types','Status','Actions'].map(function(h){return<th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap'}}>{h}</th>;})}
          </tr></thead>
          <tbody>
            {filtered.map(function(c,i){
              var cf=c.custom_fields||{};
              var wts=(cf.work_types||'').split(',').filter(Boolean);
              return<tr key={c.id} style={{borderBottom:'1px solid var(--tf-border)',background:i%2?'rgba(107,140,173,0.02)':'transparent'}}>
                <td style={{padding:'9px 12px'}}><div style={{fontWeight:600,color:'var(--tf-text)',fontSize:14}}>{c.name}</div>{c.display_name&&c.display_name!==c.name&&<div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{c.display_name}</div>}</td>
                <td style={{padding:'9px 12px',fontSize:12,color:'var(--tf-text-sub)',textTransform:'capitalize'}}>{c.client_type}</td>
                <td style={{padding:'9px 12px'}}>{c.email&&<div style={{fontSize:12}}>{c.email}</div>}{c.phone&&<div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{c.phone}</div>}</td>
                <td style={{padding:'9px 12px'}}>{c.pan&&<div style={{fontSize:11,fontFamily:'monospace'}}>{c.pan}</div>}{c.gstin&&<div style={{fontSize:10,fontFamily:'monospace',color:'var(--tf-text-sub)'}}>{c.gstin}</div>}</td>
                <td style={{padding:'9px 12px'}}><div style={{display:'flex',flexWrap:'wrap',gap:3}}>{wts.length?wts.map(function(wt){return<span key={wt} style={{fontSize:10,fontWeight:600,color:'#6b8cad',background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:4,padding:'1px 6px'}}>{wt}</span>;}):'-'}</div></td>
                <td style={{padding:'9px 12px'}}><span style={{background:SC[c.status]+'20',color:SC[c.status],border:'1px solid '+SC[c.status]+'40',borderRadius:20,padding:'2px 9px',fontSize:11,fontWeight:600,textTransform:'capitalize'}}>{c.status}</span></td>
                <td style={{padding:'9px 12px'}}><div style={{display:'flex',gap:5}}>
                  <button onClick={function(){setEditClient(c);setShowForm(true);}} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'3px 9px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>Edit</button>
                  <button onClick={function(){del(c.id);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 9px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Del</button>
                </div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    }
    {toastMsg&&<div style={{position:'fixed',bottom:24,right:24,background:toastMsg.type==='err'?'#ef4444':'#22c55e',color:'#fff',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,zIndex:9999}}>{toastMsg.msg}</div>}
    {showForm&&<ClientForm client={editClient} orgId={orgId} supabase={supabase} workTypeNames={workTypeNames} workTypeConfigs={workTypeConfigs} onClose={function(){setShowForm(false);}} onSaved={function(){load();setShowForm(false);toast(editClient?'Updated':'Added');}}/>}
    {showImport&&<ClientImportModal orgId={orgId} supabase={supabase} workTypeConfigs={workTypeConfigs} onClose={function(){setShowImport(false);}} onImported={function(){load();setShowImport(false);toast('Import complete');}}/>}
  </div>;
}

function ClientForm({client,orgId,supabase,onClose,onSaved,workTypeNames,workTypeConfigs}){
  var isEdit=!!client;
  var [tab,setTab]=useState('basic');
  var [saving,setSaving]=useState(false);
  var [errs,setErrs]=useState({});
  var [name,setName]=useState(client?client.name:'');
  var [dispName,setDispName]=useState(client?client.display_name||'':'');
  var [type,setType]=useState(client?client.client_type:'business');
  var [email,setEmail]=useState(client?client.email||'':'');
  var [phone,setPhone]=useState(client?client.phone||'':'');
  var [city,setCity]=useState(client?client.city||'':'');
  var [state,setState]=useState(client?client.state||'':'');
  var [pan,setPan]=useState(client?client.pan||'':'');
  var [gstin,setGstin]=useState(client?client.gstin||'':'');
  var [status,setStatus]=useState(client?client.status:'active');
  var [notes,setNotes]=useState(client?client.notes||'':'');
  var [selWT,setSelWT]=useState(function(){return((client&&client.custom_fields&&client.custom_fields.work_types)||'').split(',').filter(Boolean);});
  var [cfValues,setCfValues]=useState(function(){var cf=client&&client.custom_fields||{};var v={};Object.keys(cf).forEach(function(k){if(k!=='work_types')v[k]=cf[k];});return v;});
  var togWT=function(wt){setSelWT(function(p){return p.includes(wt)?p.filter(function(x){return x!==wt;}):[...p,wt];});};
  function setCfVal(key,val){setCfValues(function(p){var n=Object.assign({},p);n[key]=val;return n;});}
  // Build a lookup of worktype configs by name
  var wtcMap={};
  (workTypeConfigs||[]).forEach(function(c){wtcMap[c.name]=c;});
  async function save(){
    if(!name.trim()){setErrs({name:'Required'});return;}
    setSaving(true);
    var user=(await supabase.auth.getUser()).data.user;
    var cf=Object.assign({},cfValues,{work_types:selWT.join(',')});
    var p={name:name.trim(),display_name:dispName.trim()||null,client_type:type,email:email.trim()||null,phone:phone.trim()||null,city:city.trim()||null,state:state.trim()||null,pan:pan.trim().toUpperCase()||null,gstin:gstin.trim().toUpperCase()||null,status,notes:notes.trim()||null,custom_fields:cf};
    if(orgId)p.org_id=orgId;
    var err;
    if(isEdit){({error:err}=await supabase.from('clients').update(p).eq('id',client.id));}
    else{p.created_by=user?user.id:null;({error:err}=await supabase.from('clients').insert(p));}
    setSaving(false);
    if(!err)onSaved();else setErrs({save:err.message});
  }
  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'};
  var LBL={fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:4,display:'block'};
  var TABS=['basic','tax','worktype','notes'];
  var TL={basic:'Basic Info',tax:'Tax IDs',worktype:'Work Types',notes:'Notes'};
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:16,width:'100%',maxWidth:560,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid var(--tf-border)'}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:'var(--tf-text)'}}>{isEdit?'Edit Client':'New Client'}</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20}}>×</button>
      </div>
      <div style={{display:'flex',gap:2,padding:'8px 20px 0',borderBottom:'1px solid var(--tf-border)'}}>
        {TABS.map(function(t){return<button key={t} onClick={function(){setTab(t);}} style={{background:'none',border:'none',padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:tab===t?700:500,color:tab===t?'#6b8cad':'var(--tf-text-sub)',borderBottom:tab===t?'2px solid #6b8cad':'2px solid transparent',marginBottom:-1}}>{TL[t]}</button>;})}
      </div>
      <div style={{padding:'16px 20px',overflowY:'auto',flex:1}}>
        {tab==='basic'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 14px'}}>
          <div style={{gridColumn:'1/-1',marginBottom:12}}><label style={LBL}>Name *</label><input value={name} onChange={function(e){setName(e.target.value);}} style={Object.assign({},INP,{border:errs.name?'1px solid #ef4444':INP.border})} placeholder="Full legal name"/>{errs.name&&<div style={{color:'#ef4444',fontSize:11,marginTop:2}}>{errs.name}</div>}</div>
          <div style={{marginBottom:12}}><label style={LBL}>Display Name</label><input value={dispName} onChange={function(e){setDispName(e.target.value);}} style={INP}/></div>
          <div style={{marginBottom:12}}><label style={LBL}>Type</label><select value={type} onChange={function(e){setType(e.target.value);}} style={Object.assign({},INP,{cursor:'pointer'})}><option value="business">Business</option><option value="individual">Individual</option></select></div>
          <div style={{marginBottom:12}}><label style={LBL}>Email</label><input value={email} onChange={function(e){setEmail(e.target.value);}} style={INP} type="email"/></div>
          <div style={{marginBottom:12}}><label style={LBL}>Phone</label><input value={phone} onChange={function(e){setPhone(e.target.value);}} style={INP}/></div>
          <div style={{marginBottom:12}}><label style={LBL}>City</label><input value={city} onChange={function(e){setCity(e.target.value);}} style={INP}/></div>
          <div style={{marginBottom:12}}><label style={LBL}>State</label><input value={state} onChange={function(e){setState(e.target.value);}} style={INP}/></div>
          <div style={{gridColumn:'1/-1',marginBottom:12}}><label style={LBL}>Status</label><div style={{display:'flex',gap:6}}>{CLIENT_STATUSES.map(function(s){return<button key={s} onClick={function(){setStatus(s);}} style={{flex:1,padding:'6px',borderRadius:8,border:'1px solid',borderColor:status===s?'#6b8cad':'var(--tf-border)',background:status===s?'rgba(107,140,173,0.12)':'var(--tf-surface)',color:status===s?'#6b8cad':'var(--tf-text-sub)',fontWeight:status===s?700:500,cursor:'pointer',fontSize:12,textTransform:'capitalize'}}>{s}</button>;})}</div></div>
        </div>}
        {tab==='tax'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 14px'}}>
          <div style={{marginBottom:14}}><label style={LBL}>PAN</label><input value={pan} onChange={function(e){setPan(e.target.value.toUpperCase());}} style={Object.assign({},INP,{fontFamily:'monospace'})} placeholder="ABCDE1234F"/></div>
          <div style={{marginBottom:14}}><label style={LBL}>GSTIN</label><input value={gstin} onChange={function(e){setGstin(e.target.value.toUpperCase());}} style={Object.assign({},INP,{fontFamily:'monospace'})} placeholder="22ABCDE1234F1Z5"/></div>
        </div>}
        {tab==='worktype'&&<div>
          <div style={{fontSize:13,color:'var(--tf-text-sub)',marginBottom:14}}>Select work types applicable for this client.</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {(workTypeNames||WORK_TYPES_DEFAULT).map(function(wt){var sel=selWT.includes(wt);return<button key={wt} onClick={function(){togWT(wt);}} style={{padding:'7px 14px',borderRadius:8,border:'1px solid',borderColor:sel?'#6b8cad':'var(--tf-border)',background:sel?'rgba(107,140,173,0.15)':'var(--tf-surface)',color:sel?'#6b8cad':'var(--tf-text-sub)',fontWeight:sel?700:500,cursor:'pointer',fontSize:13}}>{wt}</button>;})}
          </div>
          <div style={{marginTop:12,fontSize:12,color:'var(--tf-text-sub)'}}>Selected: {selWT.length?selWT.join(', '):'None'}</div>
          {/* Custom client fields for selected worktypes */}
          {selWT.map(function(wt){
            var wtc=wtcMap[wt];
            if(!wtc||!(wtc.client_fields||[]).length)return null;
            return<div key={wt} style={{marginTop:16,padding:'12px 14px',background:'rgba(107,140,173,0.04)',border:'1px solid var(--tf-border)',borderRadius:10}}>
              <div style={{fontSize:12,fontWeight:700,color:'#6b8cad',marginBottom:8}}>{wt} Fields</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 12px'}}>
                {(wtc.client_fields||[]).map(function(f){
                  var fieldKey=wt.toLowerCase().replace(/[^a-z0-9]+/g,'_')+'_'+f.key;
                  var val=cfValues[fieldKey]||'';
                  return<div key={fieldKey}>
                    <label style={LBL}>{f.label}</label>
                    {f.type==='select'?<select value={val} onChange={function(e){setCfVal(fieldKey,e.target.value);}} style={Object.assign({},INP,{cursor:'pointer'})}>
                      <option value="">— Select —</option>
                      {(f.options||'').split(',').filter(Boolean).map(function(opt){return<option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>;})}
                    </select>:
                    <input type={f.type==='number'?'number':f.type==='date'?'date':'text'} value={val} onChange={function(e){setCfVal(fieldKey,e.target.value);}} style={INP} placeholder={f.label}/>}
                  </div>;
                })}
              </div>
            </div>;
          })}
        </div>}
        {tab==='notes'&&<div><label style={LBL}>Notes</label><textarea value={notes} onChange={function(e){setNotes(e.target.value);}} rows={7} style={Object.assign({},INP,{resize:'vertical'})} placeholder="Any notes about this client..."/></div>}
        {errs.save&&<div style={{color:'#ef4444',fontSize:12,marginTop:8,background:'rgba(239,68,68,0.08)',padding:'8px 11px',borderRadius:7}}>{errs.save}</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:9,padding:'13px 20px',borderTop:'1px solid var(--tf-border)'}}>
        <button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 16px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>
        <button onClick={save} disabled={saving} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 20px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>{saving?'Saving...':isEdit?'Save Changes':'Add Client'}</button>
      </div>
    </div>
  </div>;
}

function ClientImportModal({orgId,supabase,onClose,onImported,workTypeConfigs}){
  var [step,setStep]=useState('upload');
  var [rows,setRows]=useState([]);
  var [cols,setCols]=useState([]);
  var [mapping,setMapping]=useState({});
  var [progress,setProgress]=useState(0);
  var [results,setResults]=useState(null);
  var fileRef=useRef();
  // Build worktype custom field keys from configs
  var wtFields=[];
  (workTypeConfigs||[]).forEach(function(wtc){
    (wtc.client_fields||[]).forEach(function(f){
      var key=wtc.name.toLowerCase().replace(/[^a-z0-9]+/g,'_')+'_'+f.key;
      wtFields.push({key:key,label:wtc.name+' - '+f.label});
    });
  });
  var BASE_COLS=['name','display_name','client_type','email','phone','city','state','pan','gstin','status','notes'];
  var DB_COLS=BASE_COLS.slice();
  var wtFieldKeys=wtFields.map(function(f){return f.key;});
  var KNOWN=BASE_COLS.concat(['work_types']).concat(wtFieldKeys);
  // Labels for mapping dropdown
  var knownLabels={};
  BASE_COLS.forEach(function(k){knownLabels[k]=k;});
  knownLabels.work_types='work_types';
  wtFields.forEach(function(f){knownLabels[f.key]=f.label;});
  function parseRow(r){var c=[];var cur='';var q=false;for(var i=0;i<r.length;i++){var ch=r[i];if(ch==='"'){if(q&&r[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){c.push(cur);cur='';}else cur+=ch;}c.push(cur);return c;}
  function downloadTemplate(){
    var allHdrs=BASE_COLS.concat(['work_types']).concat(wtFieldKeys);
    var hdr=allHdrs.join(',');
    var sampleVals=BASE_COLS.map(function(k){
      if(k==='name')return'"ABC Corp"';if(k==='display_name')return'"ABC"';if(k==='client_type')return'"business"';
      if(k==='email')return'"abc@email.com"';if(k==='phone')return'"9876543210"';if(k==='city')return'"Mumbai"';
      if(k==='state')return'"Maharashtra"';if(k==='pan')return'"ABCDE1234F"';if(k==='gstin')return'"22ABCDE1234F1Z5"';
      if(k==='status')return'"active"';if(k==='notes')return'"Sample client"';return'""';
    });
    var wtNames=(workTypeConfigs||[]).map(function(w){return w.name;}).join(',');
    sampleVals.push('"'+wtNames+'"');
    wtFieldKeys.forEach(function(){sampleVals.push('""');});
    var csv=hdr+'\n'+sampleVals.join(',');
    var url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    var a=document.createElement('a');a.href=url;a.download='client_import_template.csv';a.click();URL.revokeObjectURL(url);
  }
  function handleFile(e){var f=e.target.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(ev){var lines=ev.target.result.split(/\r?\n/).filter(function(l){return l.trim();});if(lines.length<2)return;var h=parseRow(lines[0]);var d=lines.slice(1).map(function(l){return parseRow(l);});setCols(h);setRows(d);var am={};h.forEach(function(hh,i){var low=hh.toLowerCase().replace(/[ -]/g,'_');var m=KNOWN.find(function(c){return c===low||c.replace(/_/g,'').includes(low.replace(/_/g,''))||low.replace(/_/g,'').includes(c.replace(/_/g,''));});am[i]=m||'__custom__';});setMapping(am);setStep('preview');};rd.readAsText(f);}
  async function importAll(){setStep('importing');var user=(await supabase.auth.getUser()).data.user;var ok=0,fail=0;
    var allObjs=[];
    for(var i=0;i<rows.length;i++){var row=rows[i];var obj={custom_fields:{}};if(orgId)obj.org_id=orgId;if(user)obj.created_by=user.id;cols.forEach(function(co,ci){var t=mapping[ci];if(!t||t==='__skip__')return;var v=row[ci]?row[ci].trim():null;if(t==='work_types'){obj.custom_fields.work_types=v||'';}else if(t==='__custom__'){var cfk=co.toLowerCase().replace(/[^a-z0-9]+/g,'_');obj.custom_fields[cfk]=v;}else if(DB_COLS.indexOf(t)!==-1){obj[t]=v;}else{obj.custom_fields[t]=v;}});if(!obj.name){fail++;continue;}if(!obj.status)obj.status='active';if(!obj.client_type)obj.client_type='business';allObjs.push(obj);}
    var batchSize=50;
    for(var b=0;b<allObjs.length;b+=batchSize){var batch=allObjs.slice(b,b+batchSize);var r=await supabase.from('clients').insert(batch);if(!r.error){ok+=batch.length;}else{console.warn('Batch failed:',r.error.message,'— retrying individually');for(var j=0;j<batch.length;j++){var r2=await supabase.from('clients').insert(batch[j]);if(!r2.error)ok++;else{fail++;console.warn('Row failed:',batch[j].name,r2.error.message);}}}setProgress(Math.round(Math.min(b+batchSize,allObjs.length)/allObjs.length*100));}
    setResults({ok,fail,errMsg:fail>0?'Check browser console (F12) for details':null});setStep('done');}
  var INP2={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 8px',color:'var(--tf-text)',fontSize:12,outline:'none',fontFamily:'inherit',cursor:'pointer'};
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget&&step!=='importing')onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:14,width:'100%',maxWidth:580,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'15px 20px',borderBottom:'1px solid var(--tf-border)'}}><h3 style={{margin:0,fontSize:16,fontWeight:700,color:'var(--tf-text)'}}>Import Clients from CSV</h3>{step!=='importing'&&<button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20}}>×</button>}</div>
      <div style={{padding:'16px 20px',overflowY:'auto',flex:1}}>
        {step==='upload'&&<div><div style={{background:'rgba(107,140,173,0.06)',border:'1px dashed rgba(107,140,173,0.35)',borderRadius:10,padding:28,textAlign:'center',marginBottom:16}}><div style={{fontSize:28,marginBottom:10}}>📄</div><div style={{fontWeight:600,color:'var(--tf-text)',marginBottom:6}}>Select CSV File</div><div style={{fontSize:12,color:'var(--tf-text-sub)',marginBottom:14}}>Required: name column. All fields auto-mapped including city, state, notes, work types.</div><input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{display:'none'}}/><div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}><button onClick={function(){fileRef.current.click();}} style={{background:'#6b8cad',border:'none',borderRadius:7,padding:'8px 20px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>Choose File</button><button onClick={downloadTemplate} style={{background:'transparent',border:'1px solid rgba(107,140,173,0.4)',borderRadius:7,padding:'8px 16px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>Download Template CSV</button></div></div><div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--tf-text-sub)'}}><div style={{fontWeight:700,marginBottom:4,color:'var(--tf-text)'}}>Supported Columns</div>name, display_name, client_type, email, phone, city, state, pan, gstin, status, notes, work_types (comma-separated){wtFields.length>0&&<span>, <b>Work Type Fields:</b> {wtFields.map(function(f){return f.label;}).join(', ')}</span>}. Extra columns saved as custom fields.</div></div>}
        {step==='preview'&&<div><div style={{fontSize:13,color:'var(--tf-text-sub)',marginBottom:12}}>{rows.length} rows. Map columns:</div><div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:260,overflowY:'auto'}}>{cols.map(function(co,i){return<div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'var(--tf-surface)',borderRadius:7,padding:'7px 10px',border:'1px solid var(--tf-border)'}}><div style={{flex:'0 0 140px',fontSize:12,fontWeight:600,color:'var(--tf-text)'}}>{co}</div><span style={{color:'var(--tf-text-sub)'}}>→</span><select value={mapping[i]||'__skip__'} onChange={function(e){var v=e.target.value;var idx=i;setMapping(function(m){var n=Object.assign({},m);n[idx]=v;return n;});}} style={Object.assign({},INP2,{flex:1})}><option value="__skip__">⊘ Skip</option>{BASE_COLS.map(function(k){return<option key={k} value={k}>{k}</option>;})}<option value="work_types">work_types</option>{wtFields.length>0&&<optgroup label="Work Type Fields">{wtFields.map(function(f){return<option key={f.key} value={f.key}>{f.label}</option>;})}</optgroup>}<option value="__custom__">Custom Field</option></select><div style={{flex:'0 0 80px',fontSize:10,color:'var(--tf-text-sub)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rows[0]&&rows[0][i]||'—'}</div></div>;})} </div></div>}
        {step==='importing'&&<div style={{textAlign:'center',padding:28}}><div style={{fontSize:24,marginBottom:12}}>⏳</div><div style={{fontWeight:600,fontSize:14,color:'var(--tf-text)',marginBottom:10}}>Importing... {progress}%</div><div style={{background:'var(--tf-border)',borderRadius:99,height:6,overflow:'hidden'}}><div style={{width:progress+'%',height:'100%',background:'#6b8cad',transition:'width 0.3s'}}/></div></div>}
        {step==='done'&&results&&<div style={{textAlign:'center',padding:28}}><div style={{fontSize:32,marginBottom:10}}>✅</div><div style={{fontWeight:700,fontSize:16,color:'var(--tf-text)',marginBottom:6}}>Import Complete</div><div style={{color:'#22c55e',fontWeight:600}}>✓ {results.ok} clients imported</div>{results.fail>0&&<div style={{color:'#ef4444',fontSize:13,marginTop:4}}>✗ {results.fail} failed</div>}{results.errMsg&&<div style={{color:'var(--tf-text-sub)',fontSize:11,marginTop:8}}>{results.errMsg}</div>}</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'11px 20px',borderTop:'1px solid var(--tf-border)'}}>
        {step==='upload'&&<button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 15px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>}
        {step==='preview'&&<><button onClick={function(){setStep('upload');}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 15px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>← Back</button><button onClick={importAll} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>Import {rows.length} Clients</button></>}
        {step==='done'&&<button onClick={onImported} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>Done</button>}
      </div>
    </div>
  </div>;
}

// ── Org Management Panel ─────────────────────────────────────────────
function OrgManagementPanel({cu,supabase,allWorkspaces}){
  var [orgs,setOrgs]=useState([]);
  var [loading,setLoading]=useState(true);
  var [showForm,setShowForm]=useState(false);
  var [editOrg,setEditOrg]=useState(null);
  var [localWs,setLocalWs]=useState(allWorkspaces||[]);
  useEffect(function(){load();},[]);
  async function load(){
    setLoading(true);
    var r=await supabase.from('organizations').select('*').order('name').limit(100);
    var rw=await supabase.from('workspaces').select('*').order('name').limit(200);
    if(r.data)setOrgs(r.data);
    if(rw.data)setLocalWs(rw.data);
    setLoading(false);
  }
  async function assign(wsId,orgId){await supabase.from('workspaces').update({org_id:orgId||null}).eq('id',wsId);load();}
  async function delOrg(org){if(!window.confirm('Delete "'+org.name+'"?'))return;await supabase.from('workspaces').update({org_id:null}).eq('org_id',org.id);await supabase.from('organizations').delete().eq('id',org.id);load();}
  var personalWs=localWs.filter(function(w){return !w.org_id;});
  var enrichedOrgs=orgs.map(function(o){return Object.assign({},o,{workspaces:localWs.filter(function(w){return w.org_id===o.id;})});});
  var CARD={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,padding:18,marginBottom:12};
  return<div style={{maxWidth:760,margin:'0 auto',padding:'4px 0 40px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22}}>
      <div><h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Organisations</h2><div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>Assign workspaces to share Client Data</div></div>
      <button onClick={function(){setEditOrg(null);setShowForm(true);}} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>+ New Organisation</button>
    </div>
    {loading?<div style={{textAlign:'center',padding:32,color:'var(--tf-text-sub)'}}>Loading...</div>:<div>
      {enrichedOrgs.map(function(org){return<div key={org.id} style={CARD}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{width:36,height:36,borderRadius:9,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#fff'}}>{org.name.charAt(0).toUpperCase()}</div>
            <div><div style={{fontWeight:700,fontSize:14,color:'var(--tf-text)'}}>{org.name}</div><div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{org.workspaces.length} workspace{org.workspaces.length!==1?'s':''}</div></div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={function(){setEditOrg(org);setShowForm(true);}} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'4px 10px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>Edit</button>
            <button onClick={function(){delOrg(org);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'4px 10px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Delete</button>
          </div>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:8}}>Assigned Workspaces</div>
        {org.workspaces.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic',marginBottom:10}}>None assigned</div>:
          <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:10}}>{org.workspaces.map(function(w){return<div key={w.id} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.22)',borderRadius:20,padding:'3px 8px 3px 7px'}}><div style={{width:6,height:6,borderRadius:'50%',background:w.color||'#6b8cad'}}/><span style={{fontSize:12,fontWeight:600,color:'var(--tf-text)'}}>{w.name}</span><button onClick={function(){assign(w.id,null);}} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,lineHeight:1,paddingLeft:2}}>×</button></div>;})}</div>
        }
        {personalWs.length>0&&<div><div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:5}}>Add Workspace</div><select onChange={function(e){if(e.target.value){var id=e.target.value;assign(id,org.id);e.target.value=''}}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'6px 9px',color:'var(--tf-text)',fontSize:13,cursor:'pointer',outline:'none',maxWidth:240}}><option value="">Select personal workspace...</option>{personalWs.map(function(w){return<option key={w.id} value={w.id}>{w.name}</option>;})}</select></div>}
      </div>;})}
      <div style={Object.assign({},CARD,{borderStyle:'dashed',borderColor:'rgba(107,140,173,0.3)'})}>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}><span style={{fontSize:16}}>👤</span><div><div style={{fontWeight:700,fontSize:13,color:'var(--tf-text)'}}>Personal Workspaces</div><div style={{fontSize:11,color:'var(--tf-text-sub)'}}>Not linked to any organisation</div></div></div>
        {personalWs.length===0?<div style={{fontSize:12,color:'var(--tf-text-sub)',fontStyle:'italic'}}>All workspaces are in organisations</div>:
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>{personalWs.map(function(w){return<div key={w.id} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(148,163,184,0.1)',border:'1px solid rgba(148,163,184,0.2)',borderRadius:20,padding:'3px 10px 3px 7px'}}><div style={{width:6,height:6,borderRadius:'50%',background:w.color||'#94a3b8'}}/><span style={{fontSize:12,color:'var(--tf-text-sub)'}}>{w.name}</span></div>;})}</div>
        }
      </div>
    </div>}
    {showForm&&<OrgFormModal org={editOrg} cu={cu} supabase={supabase} onClose={function(){setShowForm(false);}} onSaved={function(){load();setShowForm(false);}}/>}
  </div>;
}

function OrgFormModal({org,cu,supabase,onClose,onSaved}){
  var [name,setName]=useState(org?org.name:'');
  var [desc,setDesc]=useState(org?org.description||'':'');
  var [saving,setSaving]=useState(false);
  var [err,setErr]=useState('');
  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'};
  async function save(){if(!name.trim()){setErr('Name required');return;}setSaving(true);var slug='org'+Date.now();var error;if(org){({error}=await supabase.from('organizations').update({name:name.trim(),description:desc.trim()||null}).eq('id',org.id));}else{({error}=await supabase.from('organizations').insert({name:name.trim(),slug:slug,description:desc.trim()||null,created_by:cu.id}));}setSaving(false);if(!error)onSaved();else setErr(error.message);}
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1001,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:14,width:'100%',maxWidth:380,boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'15px 18px',borderBottom:'1px solid var(--tf-border)'}}><h3 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--tf-text)'}}>{org?'Edit':'New'} Organisation</h3><button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20}}>×</button></div>
      <div style={{padding:'16px 18px'}}><div style={{marginBottom:12}}><label style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Name *</label><input value={name} onChange={function(e){setName(e.target.value);}} style={INP} autoFocus/></div><div style={{marginBottom:4}}><label style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',marginBottom:4,display:'block'}}>Description</label><input value={desc} onChange={function(e){setDesc(e.target.value);}} style={INP}/></div>{err&&<div style={{color:'#ef4444',fontSize:12,marginTop:8,background:'rgba(239,68,68,0.08)',padding:'6px 10px',borderRadius:6}}>{err}</div>}</div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'11px 18px',borderTop:'1px solid var(--tf-border)'}}><button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 15px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button><button onClick={save} disabled={saving} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>{saving?'Saving...':'Save'}</button></div>
    </div>
  </div>;
}


// ── Org Settings Panel (replaces OrgManagementPanel inside org view) ─
function OrgSettingsPanel({org,cu,supabase,allWorkspaces}){
  var [hierarchy,setHierarchy]=useState((org.workflow_hierarchy||[]).map(function(h){return{key:h.key,label:h.label};}));
  var [saving,setSaving]=useState(false);
  var [toast,setToast]=useState(null);
  var [orgName,setOrgName]=useState(org.name||'');
  var [orgDesc,setOrgDesc]=useState(org.description||'');

  function showToast(msg,type){setToast({msg,type:type||'ok'});setTimeout(function(){setToast(null);},3000);}

  function addLevel(){setHierarchy(function(p){var n=p.length+1;return[...p,{key:'level_'+Date.now(),label:''}];});}
  function removeLevel(idx){setHierarchy(function(p){return p.filter(function(_,i){return i!==idx;});});}
  function updateLevel(idx,label){
    setHierarchy(function(p){return p.map(function(h,i){
      if(i!==idx)return h;
      var key=label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'level_'+i;
      return{key:key,label:label};
    });});
  }
  function moveLevel(idx,dir){
    setHierarchy(function(p){var a=[...p];var ni=idx+dir;if(ni<0||ni>=a.length)return a;var t=a[idx];a[idx]=a[ni];a[ni]=t;return a;});
  }

  async function saveHierarchy(){
    var valid=hierarchy.filter(function(h){return h.label.trim();});
    setSaving(true);
    var res=await supabase.from('organizations').update({workflow_hierarchy:valid}).eq('id',org.id);
    setSaving(false);
    if(res.error){showToast(res.error.message,'err');return;}
    org.workflow_hierarchy=valid;
    showToast('Workflow hierarchy saved!');
  }

  async function saveOrgInfo(){
    if(!orgName.trim()){showToast('Name required','err');return;}
    setSaving(true);
    var res=await supabase.from('organizations').update({name:orgName.trim(),description:orgDesc.trim()||null}).eq('id',org.id);
    setSaving(false);
    if(res.error){showToast(res.error.message,'err');return;}
    org.name=orgName.trim();org.description=orgDesc.trim()||null;
    showToast('Organisation info saved!');
  }

  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'};
  var LBL={fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4,display:'block'};
  var PRESET_LEVELS=[
    {label:'Assignee',desc:'Primary person doing the work'},
    {label:'Sub-Assignee',desc:'Assistant / junior assigned'},
    {label:'Reviewer',desc:'Person who reviews the work'},
    {label:'Senior Reviewer',desc:'Final review before filing'},
    {label:'Approver',desc:'Final authority / Partner'}
  ];

  return<div style={{maxWidth:700,margin:'0 auto',padding:'0 0 40px'}}>
    {/* Organisation Info */}
    <div style={{marginBottom:32}}>
      <h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:'0 0 16px'}}>Organisation Info</h2>
      <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,padding:'18px 20px'}}>
        <div style={{marginBottom:12}}>
          <label style={LBL}>Organisation Name</label>
          <input value={orgName} onChange={function(e){setOrgName(e.target.value);}} style={INP}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={LBL}>Description</label>
          <input value={orgDesc} onChange={function(e){setOrgDesc(e.target.value);}} style={INP} placeholder="e.g. CA Firm, Accounting Practice..."/>
        </div>
        <button onClick={saveOrgInfo} disabled={saving} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>Save Info</button>
      </div>
    </div>

    {/* Workflow Hierarchy */}
    <div style={{marginBottom:32}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Workflow Hierarchy</h2>
          <p style={{fontSize:13,color:'var(--tf-text-sub)',margin:'4px 0 0'}}>Define the org workflow levels. These become default columns in all Worksheets — each as a member dropdown.</p>
        </div>
      </div>

      <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,padding:'18px 20px',marginBottom:14}}>
        {hierarchy.length===0?<div style={{textAlign:'center',padding:'16px 0'}}>
          <div style={{fontSize:13,color:'var(--tf-text-sub)',marginBottom:12}}>No hierarchy levels defined. Add levels to create workflow columns in worksheets.</div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)',marginBottom:12}}>Quick presets:</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
            {PRESET_LEVELS.map(function(p){return<button key={p.label} onClick={function(){setHierarchy(function(prev){return[...prev,{key:p.label.toLowerCase().replace(/[^a-z0-9]+/g,'_'),label:p.label}];});}} style={{background:'rgba(107,140,173,0.08)',border:'1px solid rgba(107,140,173,0.2)',borderRadius:20,padding:'4px 12px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>+ {p.label}</button>;})}
          </div>
        </div>:
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>Hierarchy Order (top = first column in worksheets)</div>
          {hierarchy.map(function(h,i){
            return<div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'var(--tf-bg)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 10px'}}>
              <span style={{width:24,height:24,borderRadius:12,background:'rgba(107,140,173,0.15)',color:'#6b8cad',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i+1}</span>
              <input value={h.label} onChange={function(e){updateLevel(i,e.target.value);}} style={Object.assign({},INP,{flex:1,fontWeight:600})} placeholder="Level name (e.g. Assignee, Reviewer)"/>
              <div style={{display:'flex',gap:2,flexShrink:0}}>
                <button onClick={function(){moveLevel(i,-1);}} disabled={i===0} style={{background:'none',border:'1px solid var(--tf-border)',borderRadius:4,padding:'2px 5px',color:'var(--tf-text-sub)',cursor:i===0?'default':'pointer',fontSize:11,opacity:i===0?0.3:1}}>↑</button>
                <button onClick={function(){moveLevel(i,1);}} disabled={i===hierarchy.length-1} style={{background:'none',border:'1px solid var(--tf-border)',borderRadius:4,padding:'2px 5px',color:'var(--tf-text-sub)',cursor:i===hierarchy.length-1?'default':'pointer',fontSize:11,opacity:i===hierarchy.length-1?0.3:1}}>↓</button>
                <button onClick={function(){removeLevel(i);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:4,padding:'2px 6px',color:'#ef4444',cursor:'pointer',fontSize:13,lineHeight:1}}>×</button>
              </div>
            </div>;
          })}
        </div>}

        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:12}}>
          <button onClick={addLevel} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:7,padding:'5px 14px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Add Level</button>
          {hierarchy.length>0&&<>
            <div style={{flex:1}}/>
            <button onClick={saveHierarchy} disabled={saving} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>{saving?'Saving...':'Save Hierarchy'}</button>
          </>}
        </div>
      </div>

      {hierarchy.length>0&&<div style={{background:'rgba(107,140,173,0.04)',border:'1px solid rgba(107,140,173,0.15)',borderRadius:10,padding:'12px 16px'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#6b8cad',marginBottom:6}}>Preview — Worksheet columns will appear as:</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:4,padding:'3px 8px'}}>Client</span>
          {hierarchy.map(function(h,i){return<span key={i} style={{fontSize:11,fontWeight:600,color:'#6b8cad',background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:4,padding:'3px 8px'}}>{h.label||'Level '+(i+1)}</span>;})}
          <span style={{fontSize:11,color:'var(--tf-text-sub)',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:4,padding:'3px 8px'}}>Data Rcvd</span>
          <span style={{fontSize:11,color:'var(--tf-text-sub)',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:4,padding:'3px 8px'}}>Completed</span>
          <span style={{fontSize:11,color:'var(--tf-text-sub)',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:4,padding:'3px 8px'}}>Status</span>
        </div>
        <div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:6}}>Each level will be a dropdown of org members.</div>
      </div>}

      {hierarchy.length>0&&<div style={{marginTop:12}}>
        <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>Quick add presets:</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
          {PRESET_LEVELS.filter(function(p){return !hierarchy.some(function(h){return h.label===p.label;});}).map(function(p){return<button key={p.label} onClick={function(){setHierarchy(function(prev){return[...prev,{key:p.label.toLowerCase().replace(/[^a-z0-9]+/g,'_'),label:p.label}];});}} title={p.desc} style={{background:'rgba(107,140,173,0.05)',border:'1px solid rgba(107,140,173,0.15)',borderRadius:16,padding:'2px 10px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:11,fontWeight:500}}>+ {p.label}</button>;})}
        </div>
      </div>}
    </div>

    {/* Workspace Assignment (from original OrgManagementPanel) */}
    <OrgManagementPanel cu={cu} supabase={supabase} allWorkspaces={allWorkspaces}/>

    {toast&&<div style={{position:'fixed',bottom:24,right:24,background:toast.type==='err'?'#ef4444':'#22c55e',color:'#fff',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,zIndex:9999}}>{toast.msg}</div>}
  </div>;
}

// ── Org Members Panel ───────────────────────────────────────────────
function OrgMembersPanel({org,cu,supabase}){
  var [members,setMembers]=useState([]);
  var [invites,setInvites]=useState([]);
  var [loading,setLoading]=useState(true);
  var [email,setEmail]=useState('');
  var [role,setRole]=useState('member');
  var [sending,setSending]=useState(false);
  var [err,setErr]=useState('');
  var [toast,setToast]=useState(null);
  useEffect(function(){loadAll();},[ org.id]);
  async function loadAll(){
    setLoading(true);
    var rm=await supabase.from('organization_members').select('org_id,user_id,role,joined_at').eq('org_id',org.id).limit(200);
    var mlist=rm.data||[];
    var enriched=mlist;
    if(mlist.length>0){
      var ids=mlist.map(function(m){return m.user_id;});
      var rp=await supabase.from('profiles').select('id,name,email,avatar_url').in('id',ids).limit(200);
      var profMap={};
      (rp.data||[]).forEach(function(p){profMap[p.id]=p;});
      enriched=mlist.map(function(m){return Object.assign({},m,{profile:profMap[m.user_id]||null});});
    }
    setMembers(enriched);
    var ri=await supabase.from('org_invitations').select('*').eq('org_id',org.id).eq('status','pending').limit(200);
    setInvites(ri.data||[]);
    setLoading(false);
  }
  function showToast(msg,type){setToast({msg,type:type||'ok'});setTimeout(function(){setToast(null);},3000);}
  var myMembership=members.find(function(m){return m.user_id===cu.id;});
  var myRole=myMembership?myMembership.role:'';
  var canManage=myRole==='owner'||myRole==='admin'||org.created_by===cu.id;
  async function inviteMember(){
    if(!email.trim()||!email.includes('@')){setErr('Enter a valid email');return;}
    setSending(true);setErr('');
    var res=await supabase.from('org_invitations').insert({org_id:org.id,inviter_id:cu.id,invitee_email:email.trim().toLowerCase(),role:role,status:'pending'});
    setSending(false);
    if(res.error){setErr(res.error.message);return;}
    setEmail('');loadAll();showToast('Invitation sent to '+email.trim());
  }
  async function removeMember(userId){
    if(!window.confirm('Remove this member?'))return;
    await supabase.from('organization_members').delete().eq('org_id',org.id).eq('user_id',userId);
    loadAll();showToast('Member removed');
  }
  async function cancelInvite(id){
    await supabase.from('org_invitations').update({status:'declined'}).eq('id',id);
    loadAll();showToast('Invitation cancelled');
  }
  async function changeRole(userId,newRole){
    await supabase.from('organization_members').update({role:newRole}).eq('org_id',org.id).eq('user_id',userId);
    loadAll();showToast('Role updated');
  }
  var ROLE_COLORS={owner:'#f59e0b',admin:'#6b8cad',member:'#22c55e'};
  return<div style={{maxWidth:700,margin:'0 auto'}}>
    <div style={{marginBottom:20}}>
      <h3 style={{fontSize:16,fontWeight:700,color:'var(--tf-text)',margin:'0 0 4px'}}>Organisation Members</h3>
      <div style={{fontSize:13,color:'var(--tf-text-sub)'}}>Members can access this organisation's Client Data, Billing and Time Tracking</div>
    </div>
    {canManage&&<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,padding:16,marginBottom:20}}>
      <div style={{fontSize:12,fontWeight:700,color:'var(--tf-text)',marginBottom:10}}>Invite Member by Email</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <input value={email} onChange={function(e){setEmail(e.target.value);setErr('');}} placeholder="colleague@email.com" type="email"
          style={{flex:'1 1 200px',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,outline:'none',fontFamily:'inherit'}}
          onKeyDown={function(e){if(e.key==='Enter')inviteMember();}}/>
        <select value={role} onChange={function(e){setRole(e.target.value);}}
          style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,outline:'none',cursor:'pointer'}}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={inviteMember} disabled={sending}
          style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'8px 16px',color:'#fff',cursor:sending?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:sending?0.6:1,whiteSpace:'nowrap'}}>
          {sending?'Sending...':'Send Invite'}
        </button>
      </div>
      {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:6}}>{err}</div>}
    </div>}
    {loading?<div style={{textAlign:'center',padding:32,color:'var(--tf-text-sub)'}}>Loading...</div>:<>
      <div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Current Members ({members.length})</div>
      <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden',marginBottom:16}}>
        {members.length===0?<div style={{padding:24,textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>No members found</div>
        :members.map(function(m,i){
          var p=m.profile||{};var isMe=m.user_id===cu.id;var rc=ROLE_COLORS[m.role]||'#94a3b8';
          return<div key={m.user_id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:i<members.length-1?'1px solid var(--tf-border)':'none'}}>
            <div style={{width:34,height:34,borderRadius:'50%',background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>
              {(p.name||p.email||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{p.name||p.email||m.user_id.slice(0,8)}{isMe&&<span style={{fontSize:11,color:'var(--tf-text-sub)',fontWeight:400,marginLeft:6}}>(you)</span>}</div>
              {p.email&&<div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{p.email}</div>}
            </div>
            <span style={{fontSize:11,fontWeight:700,color:rc,background:rc+'18',border:'1px solid '+rc+'30',borderRadius:20,padding:'2px 9px',textTransform:'capitalize',flexShrink:0}}>{m.role}</span>
            {canManage&&!isMe&&m.role!=='owner'&&<div style={{display:'flex',gap:5}}>
              <select value={m.role} onChange={function(e){changeRole(m.user_id,e.target.value);}}
                style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:6,padding:'3px 7px',color:'var(--tf-text)',fontSize:11,cursor:'pointer',outline:'none'}}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <button onClick={function(){removeMember(m.user_id);}}
                style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 9px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Remove</button>
            </div>}
          </div>;
        })}
      </div>
      {invites.length>0&&<>
        <div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:8}}>Pending Invitations ({invites.length})</div>
        <div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
          {invites.map(function(inv,i){
            return<div key={inv.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:i<invites.length-1?'1px solid var(--tf-border)':'none'}}>
              <div style={{width:34,height:34,borderRadius:'50%',background:'rgba(107,140,173,0.1)',border:'1px dashed rgba(107,140,173,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:'var(--tf-text-sub)',flexShrink:0}}>?</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{inv.invitee_email}</div>
                <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>Invited as {inv.role}</div>
              </div>
              {canManage&&<button onClick={function(){cancelInvite(inv.id);}}
                style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 9px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Cancel</button>}
            </div>;
          })}
        </div>
      </>}
    </>}
    {toast&&<div style={{position:'fixed',bottom:24,right:24,background:toast.type==='err'?'#ef4444':'#22c55e',color:'#fff',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,zIndex:9999}}>{toast.msg}</div>}
  </div>;
}

function TransferOwnerModal({open,ws,wsMembers,cu,supabase,onClose,onTransferred}){
  var [newOwner,setNewOwner]=useState('');
  var [saving,setSaving]=useState(false);
  var [err,setErr]=useState('');
  if(!open)return null;
  var others=wsMembers.filter(function(m){return m.id!==cu.id;});
  async function doTransfer(){
    if(!newOwner){setErr('Select a member');return;}
    if(!window.confirm('Transfer ownership to this member? You will become an admin.'))return;
    setSaving(true);
    var r=await supabase.from('workspaces').update({owner_id:newOwner}).eq('id',ws.id);
    if(r.error){setErr(r.error.message);setSaving(false);return;}
    // Update workspace_members roles
    await supabase.from('workspace_members').update({role:'admin'}).eq('workspace_id',ws.id).eq('user_id',cu.id);
    await supabase.from('workspace_members').update({role:'owner'}).eq('workspace_id',ws.id).eq('user_id',newOwner);
    setSaving(false);
    onTransferred();
  }
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:14,width:'100%',maxWidth:400,boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'15px 18px',borderBottom:'1px solid var(--tf-border)'}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--tf-text)'}}>🔑 Transfer Ownership</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 18px'}}>
        <div style={{fontSize:13,color:'var(--tf-text-sub)',marginBottom:14,lineHeight:1.6}}>
          Transfer ownership of <strong style={{color:'var(--tf-text)'}}>{ws.name}</strong> to another member. You will become an admin.
        </div>
        <label style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:6,display:'block'}}>New Owner</label>
        <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:220,overflowY:'auto'}}>
          {others.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic'}}>No other members in this workspace</div>:
          others.map(function(m){
            var sel=newOwner===m.id;
            return<div key={m.id} onClick={function(){setNewOwner(m.id);}} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:9,border:'1px solid',borderColor:sel?'#6b8cad':'var(--tf-border)',background:sel?'rgba(107,140,173,0.1)':'var(--tf-surface)',cursor:'pointer'}}>
              <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>
                {(m.name||m.email||'?').charAt(0).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)'}}>{m.name||m.email}</div>
                <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{m.role||'member'}</div>
              </div>
              {sel&&<span style={{fontSize:14,color:'#6b8cad'}}>✓</span>}
            </div>;
          })}
        </div>
        {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:10,background:'rgba(239,68,68,0.08)',padding:'7px 10px',borderRadius:7}}>{err}</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 18px',borderTop:'1px solid var(--tf-border)'}}>
        <button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 15px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>
        <button onClick={doTransfer} disabled={saving||!newOwner} style={{background:'#f59e0b',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:saving||!newOwner?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving||!newOwner?0.5:1}}>
          {saving?'Transferring...':'Transfer Ownership'}
        </button>
      </div>
    </div>
  </div>;
}


// ══════════════════════════════════════════════════════════════════
// WORK TYPE CONFIG PANEL
// ══════════════════════════════════════════════════════════════════

function WorkTypeConfigPanel({org,supabase,cu,workTypeConfigs,onReload}){
  var [configs,setConfigs]=useState(workTypeConfigs||[]);
  var [showForm,setShowForm]=useState(false);
  var [editConfig,setEditConfig]=useState(null);
  var [toast,setToast]=useState(null);
  var [seeding,setSeeding]=useState(false);

  useEffect(function(){setConfigs(workTypeConfigs||[]);},[workTypeConfigs]);

  function showToast(msg,type){setToast({msg,type:type||'ok'});setTimeout(function(){setToast(null);},3000);}

  async function clearAll(){
    if(!window.confirm('Delete ALL work type configs? This cannot be undone.'))return;
    setSeeding(true);
    var ids=configs.map(function(c){return c.id;});
    await supabase.from('work_type_configs').delete().in('id',ids);
    setSeeding(false);
    showToast('All work types deleted');
    if(onReload)onReload();
  }

  async function seedDefaults(){
    setSeeding(true);
    var entries=Object.entries(DEFAULT_WS_TYPE_CONFIGS);
    var batch=entries.map(function(e,i){return{org_id:org.id,name:e[0],frequency:e[1].frequency,columns:e[1].cols,due_day:e[1].due_day||null,due_month:e[1].due_month||null,is_active:true,sort_order:i};});
    await supabase.from('work_type_configs').insert(batch);
    setSeeding(false);
    showToast('Default work types created');
    if(onReload)onReload();
  }

  async function toggleActive(c){
    await updateWorkTypeConfig(c.id,{is_active:!c.is_active});
    showToast(c.is_active?'Deactivated':'Activated');
    if(onReload)onReload();
  }

  async function del(c){
    if(!window.confirm('Delete "'+c.name+'"? This cannot be undone.'))return;
    await deleteWorkTypeConfig(c.id);
    showToast('Deleted');
    if(onReload)onReload();
  }

  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,outline:'none',fontFamily:'inherit'};
  var LBL={fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:4,display:'block'};
  var FREQ_LABELS={monthly:'Monthly',quarterly:'Quarterly',yearly:'Yearly',once:'One-time'};

  return<div style={{maxWidth:800,margin:'0 auto',padding:'0 0 40px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:10}}>
      <div><h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Work Type Configuration</h2>
        <div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>{configs.length} work types configured</div></div>
      <div style={{display:'flex',gap:8}}>
        {configs.length===0&&<button onClick={seedDefaults} disabled={seeding} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 14px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600,opacity:seeding?.5:1}}>
          {seeding?'Creating...':'Load Defaults'}
        </button>}
        {configs.length>0&&<button onClick={clearAll} disabled={seeding} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'7px 14px',color:'#ef4444',cursor:'pointer',fontSize:13,fontWeight:600,opacity:seeding?.5:1}}>
          {seeding?'Clearing...':'Clear All'}
        </button>}
        <button onClick={function(){setEditConfig(null);setShowForm(true);}} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>+ New Work Type</button>
      </div>
    </div>

    {configs.length===0?<div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:12,padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:32,marginBottom:12}}>⚙️</div>
      <div style={{fontWeight:700,fontSize:15,color:'var(--tf-text)',marginBottom:6}}>No work types configured</div>
      <div style={{fontSize:13,color:'var(--tf-text-sub)'}}>Click "Load Defaults" to start with standard CA work types, or add your own.</div>
    </div>:
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {configs.map(function(c){
        var colCount=(c.columns||[]).length;
        return<div key={c.id} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,padding:'14px 18px',opacity:c.is_active?1:0.5}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:700,fontSize:14,color:'var(--tf-text)'}}>{c.name}</span>
                <span style={{fontSize:10,fontWeight:600,color:'#6b8cad',background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:4,padding:'1px 6px'}}>{FREQ_LABELS[c.frequency]||c.frequency}</span>
                {c.worksheet_group&&<span style={{fontSize:10,fontWeight:600,color:'#f59e0b',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:4,padding:'1px 6px'}}>{c.worksheet_group}</span>}
                {(c.sop_steps||[]).length>0&&<span style={{fontSize:10,fontWeight:600,color:'#22c55e',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:4,padding:'1px 6px'}}>SOP</span>}
                {!c.is_active&&<span style={{fontSize:10,fontWeight:600,color:'#94a3b8',background:'rgba(148,163,184,0.1)',borderRadius:4,padding:'1px 6px'}}>Inactive</span>}
              </div>
              <div style={{fontSize:12,color:'var(--tf-text-sub)',marginTop:4}}>
                {colCount} column{colCount!==1?'s':''}
                {(c.due_dates||[]).length>0&&<span> · Due: {(c.due_dates||[]).map(function(d){return(d.label||'Due')+' '+d.day+(d.month?'/'+d.month:'');}).join(', ')}</span>}
                {!(c.due_dates||[]).length&&c.due_day&&<span> · Due: day {c.due_day}{c.due_month?' of month '+c.due_month:''}</span>}
                {(c.client_fields||[]).length>0&&<span> · {(c.client_fields||[]).length} client field{(c.client_fields||[]).length!==1?'s':''}</span>}
                {(c.sop_steps||[]).length>0&&<span> · {(c.sop_steps||[]).length} SOP step{(c.sop_steps||[]).length!==1?'s':''}</span>}
              </div>
              {colCount>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
                {(c.columns||[]).map(function(col){return<span key={col.key} style={{fontSize:10,color:'var(--tf-text-sub)',background:'rgba(107,140,173,0.06)',border:'1px solid var(--tf-border)',borderRadius:4,padding:'1px 6px'}}>{col.label}</span>;})}
              </div>}
            </div>
            <div style={{display:'flex',gap:5,flexShrink:0}}>
              <button onClick={function(){setEditConfig(c);setShowForm(true);}} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'4px 10px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>Edit</button>
              <button onClick={function(){toggleActive(c);}} style={{background:'rgba(148,163,184,0.08)',border:'1px solid rgba(148,163,184,0.2)',borderRadius:6,padding:'4px 10px',color:'#94a3b8',cursor:'pointer',fontSize:12,fontWeight:600}}>{c.is_active?'Disable':'Enable'}</button>
              <button onClick={function(){del(c);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'4px 10px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Del</button>
            </div>
          </div>
        </div>;
      })}
    </div>}

    {showForm&&<WorkTypeFormModal config={editConfig} orgId={org.id} onClose={function(){setShowForm(false);}} onSaved={function(){setShowForm(false);showToast(editConfig?'Updated':'Created');if(onReload)onReload();}}/>}
    {toast&&<div style={{position:'fixed',bottom:24,right:24,background:toast.type==='err'?'#ef4444':'#22c55e',color:'#fff',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,zIndex:9999}}>{toast.msg}</div>}
  </div>;
}

function WorkTypeFormModal({config,orgId,onClose,onSaved}){
  var isEdit=!!config;
  var [tab,setTab]=useState('basic');
  var [name,setName]=useState(config?config.name:'');
  var [frequency,setFrequency]=useState(config?config.frequency:'monthly');
  var [worksheetGroup,setWorksheetGroup]=useState(config?config.worksheet_group||'':'');
  var [columns,setColumns]=useState(config?(config.columns||[]):[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Completed'}]);
  var [dueDates,setDueDates]=useState(config&&config.due_dates&&config.due_dates.length>0?config.due_dates.map(function(d){return{label:d.label||'Due',day:d.day||'',month:d.month||'',month_offset:d.month_offset!=null?d.month_offset:1};}):config&&config.due_day?[{label:'Due',day:config.due_day,month:config.due_month||'',month_offset:1}]:[]);
  var [clientFields,setClientFields]=useState(config?(config.client_fields||[]):[]);
  var [sopSteps,setSopSteps]=useState(config&&config.sop_steps?config.sop_steps.map(function(s){return{title:s.title||'',description:s.description||'',link:s.link||''};}):[]);
  var [saving,setSaving]=useState(false);
  var [err,setErr]=useState('');

  function addCol(){setColumns(function(p){return[...p,{key:'col_'+Date.now(),label:'',type:'checkbox',options:''}];});}
  function removeCol(idx){setColumns(function(p){return p.filter(function(_,i){return i!==idx;});});}
  function updateCol(idx,field,val){
    setColumns(function(p){return p.map(function(c,i){
      if(i!==idx)return c;
      var updated=Object.assign({},c);
      updated[field]=val;
      if(field==='label')updated.key=val.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'col_'+i;
      return updated;
    });});
  }

  function addDueDate(){setDueDates(function(p){return[...p,{label:'',day:'',month:'',month_offset:1}];});}
  function removeDueDate(idx){setDueDates(function(p){return p.filter(function(_,i){return i!==idx;});});}
  function updateDueDate(idx,field,val){setDueDates(function(p){return p.map(function(d,i){if(i!==idx)return d;var u=Object.assign({},d);u[field]=val;return u;});});}

  function addClientField(){setClientFields(function(p){return[...p,{key:'field_'+Date.now(),label:'',type:'text',options:''}];});}
  function removeClientField(idx){setClientFields(function(p){return p.filter(function(_,i){return i!==idx;});});}
  function updateClientField(idx,field,val){
    setClientFields(function(p){return p.map(function(f,i){
      if(i!==idx)return f;
      var u=Object.assign({},f);u[field]=val;
      if(field==='label')u.key=val.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'field_'+i;
      return u;
    });});
  }

  function addSopStep(){setSopSteps(function(p){return[...p,{title:'',description:'',link:''}];});}
  function removeSopStep(idx){setSopSteps(function(p){return p.filter(function(_,i){return i!==idx;});});}
  function updateSopStep(idx,field,val){setSopSteps(function(p){return p.map(function(s,i){if(i!==idx)return s;var u=Object.assign({},s);u[field]=val;return u;});});}
  function moveSopStep(idx,dir){setSopSteps(function(p){var a=[...p];var ni=idx+dir;if(ni<0||ni>=a.length)return a;var t=a[idx];a[idx]=a[ni];a[ni]=t;return a;});}

  async function save(){
    if(!name.trim()){setErr('Name required');return;}
    if(columns.some(function(c){return!c.label.trim();})){setErr('All columns must have a label');return;}
    setSaving(true);
    var firstDue=dueDates.length>0?dueDates[0]:null;
    var payload={
      org_id:orgId, name:name.trim(), frequency:frequency, worksheet_group:worksheetGroup.trim()||null,
      columns:columns.map(function(c){return{key:c.key,label:c.label.trim(),type:c.type||'checkbox',options:c.options||''};}),
      due_day:firstDue&&firstDue.day?Number(firstDue.day):null,
      due_month:firstDue&&firstDue.month?Number(firstDue.month):null,
      due_dates:dueDates.filter(function(d){return d.day;}).map(function(d){return{label:d.label||'Due',day:Number(d.day),month:d.month?Number(d.month):null,month_offset:d.month_offset!=null?Number(d.month_offset):1};}),
      client_fields:clientFields.filter(function(f){return f.label.trim();}).map(function(f){return{key:f.key,label:f.label.trim(),type:f.type,options:f.options||''};}),
      sop_steps:sopSteps.filter(function(s){return s.title.trim();}).map(function(s,i){return{step:i+1,title:s.title.trim(),description:s.description.trim(),link:s.link.trim()};}),
      is_active:config?config.is_active:true,
      sort_order:config?config.sort_order:99
    };
    var result;
    if(isEdit){result=await updateWorkTypeConfig(config.id,payload);}
    else{result=await insertWorkTypeConfig(payload);}
    setSaving(false);
    if(result.error){setErr(result.error.message);return;}
    onSaved();
  }

  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'};
  var LBL={fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:4,display:'block'};
  var TABS=[{id:'basic',label:'Basic'},{id:'columns',label:'Columns'},{id:'duedates',label:'Due Dates'},{id:'clientfields',label:'Client Fields'},{id:'sop',label:'SOP'+(sopSteps.length?' ('+sopSteps.length+')':'')}];

  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:16,width:'100%',maxWidth:560,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid var(--tf-border)'}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:'var(--tf-text)'}}>{isEdit?'Edit':'New'} Work Type</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20}}>×</button>
      </div>
      <div style={{display:'flex',gap:2,padding:'8px 20px 0',borderBottom:'1px solid var(--tf-border)'}}>
        {TABS.map(function(t){return<button key={t.id} onClick={function(){setTab(t.id);}} style={{background:'none',border:'none',padding:'5px 10px',cursor:'pointer',fontSize:12,fontWeight:tab===t.id?700:500,color:tab===t.id?'#6b8cad':'var(--tf-text-sub)',borderBottom:tab===t.id?'2px solid #6b8cad':'2px solid transparent',marginBottom:-1}}>{t.label}</button>;})}
      </div>
      <div style={{padding:'16px 20px',overflowY:'auto',flex:1}}>
        {tab==='basic'&&<div>
          <div style={{marginBottom:14}}>
            <label style={LBL}>Work Type Name *</label>
            <input value={name} onChange={function(e){setName(e.target.value);}} style={INP} placeholder="e.g. GST, ITR, TDS..." disabled={isEdit}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={LBL}>Frequency</label>
            <select value={frequency} onChange={function(e){setFrequency(e.target.value);}} style={Object.assign({},INP,{cursor:'pointer'})}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="once">One-time</option>
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <label style={LBL}>Worksheet Group <span style={{fontWeight:400,textTransform:'none'}}>(optional)</span></label>
            <input value={worksheetGroup} onChange={function(e){setWorksheetGroup(e.target.value);}} style={INP} placeholder="e.g. GST Returns — groups multiple work types into one tab"/>
            <div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:4}}>Work types with the same group name will appear under one worksheet tab with sub-tabs.</div>
          </div>
        </div>}

        {tab==='columns'&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={Object.assign({},LBL,{marginBottom:0})}>Worksheet Columns</label>
            <button onClick={addCol} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'3px 10px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Add Column</button>
          </div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)',marginBottom:10}}>Define columns for the worksheet. Each column can be a checkbox, text, date, time, or dropdown.</div>
          {columns.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic',padding:'8px 0'}}>No columns. Add at least one.</div>:
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {columns.map(function(col,i){
              return<div key={i} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <input value={col.label} onChange={function(e){updateCol(i,'label',e.target.value);}} style={Object.assign({},INP,{flex:1})} placeholder="Column label"/>
                  <select value={col.type||'checkbox'} onChange={function(e){updateCol(i,'type',e.target.value);}} style={Object.assign({},INP,{width:100,cursor:'pointer'})}>
                    <option value="checkbox">Checkbox</option>
                    <option value="text">Text</option>
                    <option value="date">Date</option>
                    <option value="time">Time</option>
                    <option value="select">Select</option>
                  </select>
                  <button onClick={function(){removeCol(i);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 8px',color:'#ef4444',cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}>×</button>
                </div>
                {col.type==='select'&&<input value={col.options||''} onChange={function(e){updateCol(i,'options',e.target.value);}} style={Object.assign({},INP,{marginTop:6})} placeholder="Options (comma-separated, e.g. Yes,No,Partial)"/>}
              </div>;
            })}
          </div>}
        </div>}

        {tab==='duedates'&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={Object.assign({},LBL,{marginBottom:0})}>Due Dates</label>
            <button onClick={addDueDate} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'3px 10px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Add Due Date</button>
          </div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)',marginBottom:10}}>Define one or more due dates per period. E.g. GSTR1 due 11th, GSTR3B due 20th.</div>
          {dueDates.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic',padding:'8px 0'}}>No due dates configured.</div>:
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {dueDates.map(function(dd,i){
              return<div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 10px',flexWrap:'wrap'}}>
                <input value={dd.label} onChange={function(e){updateDueDate(i,'label',e.target.value);}} style={Object.assign({},INP,{flex:1,minWidth:120})} placeholder="Label (e.g. GSTR1 Due)"/>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <label style={{fontSize:10,color:'var(--tf-text-sub)',whiteSpace:'nowrap'}}>Day</label>
                  <input type="number" min="1" max="31" value={dd.day} onChange={function(e){updateDueDate(i,'day',e.target.value);}} style={Object.assign({},INP,{width:55})} placeholder="15"/>
                </div>
                {(frequency==='monthly'||frequency==='quarterly')?<div style={{display:'flex',alignItems:'center',gap:4}}>
                  <label style={{fontSize:10,color:'var(--tf-text-sub)',whiteSpace:'nowrap'}}>When</label>
                  <select value={dd.month_offset!=null?dd.month_offset:1} onChange={function(e){updateDueDate(i,'month_offset',Number(e.target.value));}} style={Object.assign({},INP,{width:120,cursor:'pointer'})}>
                    <option value={0}>{frequency==='quarterly'?'Quarter end month':'Same month'}</option>
                    <option value={1}>Next month</option>
                  </select>
                </div>:<div style={{display:'flex',alignItems:'center',gap:4}}>
                  <label style={{fontSize:10,color:'var(--tf-text-sub)',whiteSpace:'nowrap'}}>Month</label>
                  <input type="number" min="1" max="12" value={dd.month||''} onChange={function(e){updateDueDate(i,'month',e.target.value);}} style={Object.assign({},INP,{width:55})} placeholder="—"/>
                </div>}
                <button onClick={function(){removeDueDate(i);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 8px',color:'#ef4444',cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}>×</button>
              </div>;
            })}
          </div>}
        </div>}

        {tab==='clientfields'&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={Object.assign({},LBL,{marginBottom:0})}>Client Fields</label>
            <button onClick={addClientField} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'3px 10px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Add Field</button>
          </div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)',marginBottom:10}}>Extra fields that appear in the Client form when this work type is selected.</div>
          {clientFields.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic',padding:'8px 0'}}>No extra client fields.</div>:
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {clientFields.map(function(f,i){
              return<div key={i} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:f.type==='select'?6:0}}>
                  <input value={f.label} onChange={function(e){updateClientField(i,'label',e.target.value);}} style={Object.assign({},INP,{flex:1})} placeholder="Field label"/>
                  <select value={f.type} onChange={function(e){updateClientField(i,'type',e.target.value);}} style={Object.assign({},INP,{width:90,cursor:'pointer'})}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Select</option>
                  </select>
                  <button onClick={function(){removeClientField(i);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:6,padding:'3px 8px',color:'#ef4444',cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}>×</button>
                </div>
                {f.type==='select'&&<input value={f.options||''} onChange={function(e){updateClientField(i,'options',e.target.value);}} style={Object.assign({},INP,{marginTop:4})} placeholder="Options (comma-separated, e.g. Monthly,Quarterly,Yearly)"/>}
              </div>;
            })}
          </div>}
        </div>}

        {tab==='sop'&&<div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={Object.assign({},LBL,{marginBottom:0})}>Standard Operating Procedure</label>
            <button onClick={addSopStep} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'3px 10px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Add Step</button>
          </div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)',marginBottom:10}}>Define step-by-step procedure for this work type. Team members can reference this while working.</div>
          {sopSteps.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic',padding:'8px 0'}}>No SOP steps defined. Add steps to create a procedure guide.</div>:
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sopSteps.map(function(s,i){
              return<div key={i} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{width:22,height:22,borderRadius:11,background:'rgba(107,140,173,0.15)',color:'#6b8cad',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i+1}</span>
                  <input value={s.title} onChange={function(e){updateSopStep(i,'title',e.target.value);}} style={Object.assign({},INP,{flex:1,fontWeight:600})} placeholder="Step title (e.g. Collect Data from Client)"/>
                  <div style={{display:'flex',gap:2,flexShrink:0}}>
                    <button onClick={function(){moveSopStep(i,-1);}} disabled={i===0} style={{background:'none',border:'1px solid var(--tf-border)',borderRadius:4,padding:'2px 5px',color:'var(--tf-text-sub)',cursor:i===0?'default':'pointer',fontSize:11,opacity:i===0?0.3:1}}>↑</button>
                    <button onClick={function(){moveSopStep(i,1);}} disabled={i===sopSteps.length-1} style={{background:'none',border:'1px solid var(--tf-border)',borderRadius:4,padding:'2px 5px',color:'var(--tf-text-sub)',cursor:i===sopSteps.length-1?'default':'pointer',fontSize:11,opacity:i===sopSteps.length-1?0.3:1}}>↓</button>
                    <button onClick={function(){removeSopStep(i);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:4,padding:'2px 6px',color:'#ef4444',cursor:'pointer',fontSize:13,lineHeight:1}}>×</button>
                  </div>
                </div>
                <textarea value={s.description} onChange={function(e){updateSopStep(i,'description',e.target.value);}} style={Object.assign({},INP,{minHeight:48,resize:'vertical',fontSize:12})} placeholder="Description / instructions for this step..."/>
                <input value={s.link||''} onChange={function(e){updateSopStep(i,'link',e.target.value);}} style={Object.assign({},INP,{marginTop:6,fontSize:11})} placeholder="Reference link (optional — e.g. https://gst.gov.in)"/>
              </div>;
            })}
          </div>}
        </div>}

        {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:8,background:'rgba(239,68,68,0.08)',padding:'8px 11px',borderRadius:7}}>{err}</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:9,padding:'13px 20px',borderTop:'1px solid var(--tf-border)'}}>
        <button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 16px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>
        <button onClick={save} disabled={saving} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 20px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?.6:1}}>{saving?'Saving...':isEdit?'Save Changes':'Create'}</button>
      </div>
    </div>
  </div>;
}


// ══════════════════════════════════════════════════════════════════
// WORKSHEETS MODULE
// ══════════════════════════════════════════════════════════════════

// Default column configs per work type (used as seed for work_type_configs table)
var DEFAULT_WS_TYPE_CONFIGS = {
  'GST Returns':  {frequency:'monthly',  due_day:11, cols:[{key:'gstr1_recv',label:'GSTR1 Rcvd'},{key:'gstr1_done',label:'GSTR1 Filed'},{key:'gstr3b_recv',label:'GSTR3B Rcvd'},{key:'gstr3b_done',label:'GSTR3B Filed'}]},
  'GSTR Returns': {frequency:'monthly',  due_day:11, cols:[{key:'gstr1_recv',label:'GSTR1 Rcvd'},{key:'gstr1_done',label:'GSTR1 Filed'},{key:'gstr3b_recv',label:'GSTR3B Rcvd'},{key:'gstr3b_done',label:'GSTR3B Filed'}]},
  'ITR':          {frequency:'yearly',   due_day:31, due_month:7, cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Filed'}]},
  'TDS Returns':  {frequency:'quarterly',due_day:31, cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Filed'},{key:'challan',label:'Challan Paid'}]},
  'TDS Payments': {frequency:'monthly',  due_day:7,  cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Paid'}]},
  'Accounts':     {frequency:'monthly',  cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Completed'}]},
  'Audit':        {frequency:'yearly',   due_day:30, due_month:9, cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Completed'}]},
  'MIS':          {frequency:'monthly',  cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Completed'}]},
  'Payroll':      {frequency:'monthly',  due_day:7,  cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Processed'}]},
  'Scrutiny':     {frequency:'yearly',   cols:[{key:'notice_recv',label:'Notice Rcvd'},{key:'reply_done',label:'Reply Filed'}]},
  'Other':        {frequency:'monthly',  cols:[{key:'data_recv',label:'Data Rcvd'},{key:'done',label:'Completed'}]},
};

var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var QUARTERS=['Q1 (Apr-Jun)','Q2 (Jul-Sep)','Q3 (Oct-Dec)','Q4 (Jan-Mar)'];

function getPeriodLabel(freq, year, month, quarter){
  if(freq==='once')     return 'One-time';
  if(freq==='monthly'){
    // year = FY start year. month 4-12 fall in 'year', month 1-3 fall in 'year+1'
    var calYear=month>=4?year:year+1;
    return MONTHS[(month||1)-1]+' '+calYear;
  }
  if(freq==='quarterly'){
    var q=quarter||1;
    return 'Q'+q+' FY'+year+'-'+(String(year+1).slice(2));
  }
  return 'FY '+year+'-'+String(year+1).slice(2);
}

function getCurrentPeriod(freq){
  var now=new Date();
  var y=now.getFullYear(), m=now.getMonth()+1;
  // Indian FY: Apr-Mar. FY start year: Apr 2025 → 2025, Jan 2026 → 2025
  var fy=m>=4?y:y-1;
  if(freq==='once')      return {year:fy,month:null,quarter:null};
  if(freq==='monthly')   return {year:fy,month:m,quarter:null};
  if(freq==='quarterly'){
    var q=m>=4&&m<=6?1:m>=7&&m<=9?2:m>=10&&m<=12?3:4;
    return {year:fy,month:null,quarter:q};
  }
  return {year:fy,month:null,quarter:null};
}

function WorksheetsModule({org, supabase, cu, allWorkspaces, workTypeConfigs, workflowHierarchy, initWorkType, initMineOnly}){
  var wfHierarchy=workflowHierarchy||[];
  // Build lookup from DB configs: { name: { frequency, cols: [{key,label}] } }
  // Always include a synthetic "Unclassified" entry (frequency=once) so tasks
  // created from Your Dashboard without a work type can be triaged here.
  var WS_TYPE_CONFIGS=useMemo(function(){
    var base;
    if(!workTypeConfigs||workTypeConfigs.length===0) base=Object.assign({},DEFAULT_WS_TYPE_CONFIGS);
    else{
      base={};
      workTypeConfigs.forEach(function(c){
        base[c.name]={frequency:c.frequency,cols:c.columns||[],due_day:c.due_day,due_month:c.due_month,due_dates:c.due_dates||[],worksheet_group:c.worksheet_group||null,sop_steps:c.sop_steps||[]};
      });
    }
    // Synthetic Unclassified work type (free-form, one-time tasks)
    base['Unclassified']={frequency:'once',cols:[],due_dates:[],worksheet_group:null,sop_steps:[],synthetic:true};
    return base;
  },[workTypeConfigs]);
  var [clients,setClients]=useState([]);
  var [activeType,setActiveType]=useState(null);
  var [worksheet,setWorksheet]=useState(null); // current period worksheet
  var [rows,setRows]=useState([]);
  var [activeGroup,setActiveGroup]=useState(null); // for grouped work types
  var [loading,setLoading]=useState(true);
  var _initP=getCurrentPeriod('monthly');
  var _initQ=getCurrentPeriod('quarterly');
  var [periodYear,setPeriodYear]=useState(_initP.year);
  var [periodMonth,setPeriodMonth]=useState(_initP.month||1);
  var [periodQuarter,setPeriodQuarter]=useState(_initQ.quarter||1);
  var [showCreateTask,setShowCreateTask]=useState(null); // {row, client}
  var [saving,setSaving]=useState(false);
  // One-time task form
  var [showAddOnce,setShowAddOnce]=useState(false);
  var [onceClientId,setOnceClientId]=useState('');
  var [onceDueDate,setOnceDueDate]=useState('');
  var [onceTitle,setOnceTitle]=useState('');
  var [onceDesc,setOnceDesc]=useState('');
  var [oncePriority,setOncePriority]=useState('medium');
  var [onceContact,setOnceContact]=useState('');
  var [onceChecklist,setOnceChecklist]=useState([]);
  var [onceHierarchy,setOnceHierarchy]=useState({});
  var [orgMembers,setOrgMembers]=useState([]);
  var [toast,setToast]=useState(null);
  var [showSop,setShowSop]=useState(false);

  // Column show/hide
  var [hiddenCols,setHiddenCols]=useState([]);
  var [showColMenu,setShowColMenu]=useState(false);
  // Filters
  var [showFilters,setShowFilters]=useState(false);
  var [filters,setFilters]=useState({});
  // Filter: client name search
  var [filterClient,setFilterClient]=useState('');
  // Mine-only filter: restrict rows to those where current user is assignee or in any hierarchy level
  var [mineOnly,setMineOnly]=useState(!!initMineOnly);

  // Get all work types used by clients in this org
  var [allTypes,setAllTypes]=useState([]);

  // Build grouped tab structure: [{label, types:[], isGroup}]
  var tabLayout=useMemo(function(){
    var groups={};var ungrouped=[];var hasUnclassified=false;
    allTypes.forEach(function(t){
      if(t==='Unclassified'){hasUnclassified=true;return;}
      var cfg=WS_TYPE_CONFIGS[t];
      if(cfg&&cfg.worksheet_group){
        if(!groups[cfg.worksheet_group])groups[cfg.worksheet_group]=[];
        groups[cfg.worksheet_group].push(t);
      }else{ungrouped.push(t);}
    });
    var tabs=[];
    // Add group tabs first
    Object.keys(groups).forEach(function(g){tabs.push({label:g,types:groups[g],isGroup:true});});
    // Add ungrouped tabs
    ungrouped.forEach(function(t){tabs.push({label:t,types:[t],isGroup:false});});
    // Unclassified always last, clearly distinct
    if(hasUnclassified)tabs.push({label:'Unclassified',types:['Unclassified'],isGroup:false,isUnclassified:true});
    return tabs;
  },[allTypes,WS_TYPE_CONFIGS]);

  useEffect(function(){loadClients();loadColPrefs();},[org.id]);
  useEffect(function(){if(activeType)loadWorksheet();},[activeType,periodYear,periodMonth,periodQuarter]);
  useEffect(function(){if(activeType){loadOrgMembers();}},[activeType]);
  // Load column prefs when active type changes
  useEffect(function(){if(activeType)loadColPrefsForType(activeType);},[activeType]);

  function showToast(msg,type){setToast({msg,type:type||'ok'});setTimeout(function(){setToast(null);},3000);}

  var [recalculating,setRecalculating]=useState(false);
  async function recalcAllDueDates(){
    setRecalculating(true);
    var rw=await supabase.from('worksheets').select('id,org_id,work_type,period_year,period_month,period_quarter,frequency,period_label').eq('org_id',org.id).limit(1000);
    var allWS=rw.data||[];
    var fixCount=0;var createCount=0;

    // Step 0: Migrate old monthly worksheets (Jan-Mar) from calendar year to FY year
    // Old format stored period_year=2026 for Jan 2026, new format stores period_year=2025
    for(var mi=0;mi<allWS.length;mi++){
      var mws=allWS[mi];
      if(mws.frequency==='monthly'&&mws.period_month&&mws.period_month<=3){
        // Check if period_label contains the same year as period_year (old calendar format)
        // e.g. period_label="Jan 2026", period_year=2026 → needs migration to 2025
        var labelMatch=mws.period_label&&mws.period_label.match(/(\d{4})$/);
        if(labelMatch){
          var labelYear=Number(labelMatch[1]);
          if(labelYear===mws.period_year){
            // Old format: period_year is calendar year, should be FY start year (year-1)
            var newFY=mws.period_year-1;
            await supabase.from('worksheets').update({period_year:newFY}).eq('id',mws.id);
            mws.period_year=newFY;
            // Also update the period_label to match new format
            var newLabel=MONTHS[(mws.period_month||1)-1]+' '+labelYear;
            await supabase.from('worksheets').update({period_label:newLabel}).eq('id',mws.id);
          }
        }
      }
    }

    for(var wi=0;wi<allWS.length;wi++){
      var ws2=allWS[wi];
      var cfg2=WS_TYPE_CONFIGS[ws2.work_type];
      if(!cfg2||ws2.frequency==='once')continue;
      function calcDue(day,month,freq,monthOffset){
        if(!day)return null;
        // ws2.period_year = FY start year
        if(freq==='monthly'&&ws2.period_month){
          var calY2=ws2.period_month>=4?ws2.period_year:ws2.period_year+1;
          var off=(monthOffset!=null)?Number(monthOffset):1;
          var tM=ws2.period_month+off;var tY=calY2;
          if(tM>12){tM-=12;tY++;}if(tM<1){tM+=12;tY--;}
          return tY+'-'+String(tM).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        }else if(freq==='quarterly'&&ws2.period_quarter){
          var qEnd=[6,9,12,3];var qEndM2=qEnd[ws2.period_quarter-1];
          var qCalY2=ws2.period_quarter<=3?ws2.period_year:ws2.period_year+1;
          var qOff2=(monthOffset!=null)?Number(monthOffset):1;
          var dM=qEndM2+qOff2;var dY=qCalY2;
          if(dM>12){dM-=12;dY++;}
          if(month){dM=month;}
          return dY+'-'+String(dM).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        }else if(freq==='yearly'){
          var dm2=month||7;
          var dueCalY2=dm2>=4?ws2.period_year:ws2.period_year+1;
          return dueCalY2+'-'+String(dm2).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        }
        return null;
      }
      var dueDates2=[];
      if(cfg2.due_dates&&cfg2.due_dates.length>0){
        cfg2.due_dates.forEach(function(dd){var d3=calcDue(dd.day,dd.month,ws2.frequency,dd.month_offset);if(d3)dueDates2.push({date:d3,label:dd.label||'Due'});});
      }else if(cfg2.due_day){
        var d3=calcDue(cfg2.due_day,cfg2.due_month,ws2.frequency);if(d3)dueDates2.push({date:d3,label:'Due'});
      }
      if(dueDates2.length===0)continue;
      var rr2=await supabase.from('worksheet_rows').select('id,client_id,due_date,due_label').eq('worksheet_id',ws2.id).limit(2000);
      var wsRows2=rr2.data||[];
      if(dueDates2.length===1){
        // Single due date: fix all rows
        var correct=dueDates2[0];
        var stale=wsRows2.filter(function(r){return r.due_date!==correct.date||r.due_label!==correct.label;});
        if(stale.length>0){
          await supabase.from('worksheet_rows').update({due_date:correct.date,due_label:correct.label}).in('id',stale.map(function(r){return r.id;}));
          fixCount+=stale.length;
        }
      }else{
        // Multiple due dates: assign first label to unlabeled rows, create missing rows for other labels
        var unlabeled=wsRows2.filter(function(r){return !r.due_label||!dueDates2.some(function(dd){return dd.label===r.due_label;});});
        if(unlabeled.length>0){
          // Assign first due date to unlabeled rows
          await supabase.from('worksheet_rows').update({due_date:dueDates2[0].date,due_label:dueDates2[0].label}).in('id',unlabeled.map(function(r){return r.id;}));
          fixCount+=unlabeled.length;
          // Update local state
          unlabeled.forEach(function(r){r.due_label=dueDates2[0].label;r.due_date=dueDates2[0].date;});
        }
        // Fix dates for labeled rows
        for(var di=0;di<dueDates2.length;di++){
          var dd2=dueDates2[di];
          var matchR=wsRows2.filter(function(r){return r.due_label===dd2.label&&r.due_date!==dd2.date;});
          if(matchR.length>0){
            await supabase.from('worksheet_rows').update({due_date:dd2.date}).in('id',matchR.map(function(r){return r.id;}));
            fixCount+=matchR.length;
          }
        }
        // Create missing rows for 2nd, 3rd, etc. due dates
        var existingKeys2={};
        wsRows2.forEach(function(r){existingKeys2[r.client_id+'_'+(r.due_label||'')]=true;});
        var clientIds2=[...new Set(wsRows2.map(function(r){return r.client_id;}))];
        var newRows2=[];
        clientIds2.forEach(function(cid){
          dueDates2.forEach(function(dd){
            if(!existingKeys2[cid+'_'+dd.label]){
              newRows2.push({worksheet_id:ws2.id,client_id:cid,org_id:ws2.org_id||org.id,data:{},due_date:dd.date,due_label:dd.label});
            }
          });
        });
        if(newRows2.length>0){
          // Insert in batches of 50 to avoid timeouts
          for(var bi=0;bi<newRows2.length;bi+=50){
            var batch=newRows2.slice(bi,bi+50);
            var insR=await supabase.from('worksheet_rows').insert(batch);
            if(insR.error){console.warn('Recalc insert error:',insR.error.message);}
            else{createCount+=batch.length;}
          }
        }
      }
    }
    setRecalculating(false);
    showToast('Fixed '+fixCount+' dates, created '+createCount+' new rows across '+allWS.length+' worksheets');
    if(activeType)loadWorksheet();
  }

  var [allColPrefs,setAllColPrefs]=useState({});
  async function loadColPrefs(){
    var r=await getUserWorksheetPrefs(cu.id,org.id);
    if(r.data){
      var m={};
      r.data.forEach(function(p){m[p.work_type]=p.hidden_columns||[];});
      setAllColPrefs(m);
    }
  }
  function loadColPrefsForType(wt){setHiddenCols(allColPrefs[wt]||[]);}

  async function saveColPref(wt,hidden){
    setHiddenCols(hidden);
    setAllColPrefs(function(p){var n=Object.assign({},p);n[wt]=hidden;return n;});
    await upsertUserWorksheetPref({user_id:cu.id,org_id:org.id,work_type:wt,hidden_columns:hidden});
  }

  function toggleColVisibility(colKey){
    var newHidden=hiddenCols.includes(colKey)?hiddenCols.filter(function(k){return k!==colKey;}):hiddenCols.concat([colKey]);
    if(activeType)saveColPref(activeType,newHidden);
  }

  function setFilter(key,val){setFilters(function(p){var n=Object.assign({},p);if(!val||val==='all')delete n[key];else n[key]=val;return n;});}
  function clearFilters(){setFilters({});setFilterClient('');setMineOnly(false);}

  async function loadClients(){
    setLoading(true);
    var r=await supabase.from('clients').select('*').eq('org_id',org.id).order('name').limit(500);
    if(r.data){
      setClients(r.data);
      // Collect all work types from clients
      var types=new Set();
      r.data.forEach(function(c){
        var wts=((c.custom_fields&&c.custom_fields.work_types)||'').split(',').filter(Boolean);
        wts.forEach(function(t){types.add(t.trim());});
      });
      var typeArr=Array.from(types).filter(function(t){return WS_TYPE_CONFIGS[t];});
      // Always check if an Unclassified worksheet exists for this org — if so,
      // surface it as an always-available tab at the end.
      var rwUnc=await supabase.from('worksheets').select('id').eq('org_id',org.id).eq('work_type','Unclassified').limit(1);
      if(rwUnc.data&&rwUnc.data.length>0&&typeArr.indexOf('Unclassified')<0){
        typeArr.push('Unclassified');
      }
      setAllTypes(typeArr);
      if(typeArr.length>0&&!activeType){
        // If initWorkType was passed, prefer it
        var preferType=initWorkType&&typeArr.indexOf(initWorkType)>=0?initWorkType:null;
        // Pick first tab from grouped layout
        var groups={};var ungrouped=[];
        typeArr.forEach(function(t){var c=WS_TYPE_CONFIGS[t];if(c&&c.worksheet_group){if(!groups[c.worksheet_group])groups[c.worksheet_group]=[];groups[c.worksheet_group].push(t);}else ungrouped.push(t);});
        var firstGroup=Object.keys(groups)[0];
        var firstType=preferType||(firstGroup?groups[firstGroup][0]:(ungrouped[0]||typeArr[0]));
        setActiveType(firstType);
        // Set group if preferred type is part of a group
        if(preferType){
          var preferCfg=WS_TYPE_CONFIGS[preferType];
          if(preferCfg&&preferCfg.worksheet_group)setActiveGroup(preferCfg.worksheet_group);
        }else if(firstGroup){setActiveGroup(firstGroup);}
        var freq=WS_TYPE_CONFIGS[firstType]?WS_TYPE_CONFIGS[firstType].frequency:'monthly';
        var p=getCurrentPeriod(freq);
        setPeriodYear(p.year);
        if(p.month)setPeriodMonth(p.month);
        if(p.quarter)setPeriodQuarter(p.quarter);
      }
    }
    setLoading(false);
  }

  async function loadWorksheet(){
    if(!activeType)return;
    // Ensure clients are loaded before proceeding
    var currentClients=clients;
    if(currentClients.length===0){
      var rc=await supabase.from('clients').select('*').eq('org_id',org.id).order('name').limit(500);
      currentClients=rc.data||[];
      if(currentClients.length>0)setClients(currentClients);
    }
    var cfg=WS_TYPE_CONFIGS[activeType]||{frequency:'monthly',cols:[]};
    var label=getPeriodLabel(cfg.frequency,periodYear,periodMonth,periodQuarter);
    // Find or create worksheet for this period
    var rw=await supabase.from('worksheets').select('*').eq('org_id',org.id).eq('work_type',activeType).eq('period_label',label).maybeSingle();
    var ws=rw.data;
    if(!ws){
      // Auto-create worksheet
      var ins=await supabase.from('worksheets').insert({
        org_id:org.id,work_type:activeType,period_label:label,
        period_year:periodYear,period_month:cfg.frequency==='monthly'?periodMonth:null,
        period_quarter:cfg.frequency==='quarterly'?periodQuarter:null,
        frequency:cfg.frequency,created_by:cu.id
      }).select().single();
      ws=ins.data;
    }
    setWorksheet(ws);
    if(ws){
      // Load rows, auto-create for missing clients
      var rr=await supabase.from('worksheet_rows').select('*').eq('worksheet_id',ws.id).limit(2000);
      var existingRows=rr.data||[];
      // Get clients for this work type (use currentClients to avoid stale state)
      var typeClients=currentClients.filter(function(c){
        var wts=((c.custom_fields&&c.custom_fields.work_types)||'').split(',').filter(Boolean);
        return wts.some(function(t){return t.trim()===activeType;});
      });

      // Compute due dates from config (always, not just for new rows)
      function computeDueDate(day,month,freq,monthOffset){
        if(!day)return null;
        if(freq==='monthly'&&periodMonth){
          // periodYear = FY start year. Convert to calendar year for the period month.
          var calY=periodMonth>=4?periodYear:periodYear+1;
          var offset=(monthOffset!=null)?Number(monthOffset):1;
          var targetM=periodMonth+offset;var targetY=calY;
          if(targetM>12){targetM-=12;targetY++;}
          if(targetM<1){targetM+=12;targetY--;}
          return targetY+'-'+String(targetM).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        }else if(freq==='quarterly'&&periodQuarter){
          // periodYear = FY start year.
          // Quarter end months: Q1=Jun, Q2=Sep, Q3=Dec, Q4=Mar
          var qEndMonths=[6,9,12,3];
          var qEndM=qEndMonths[periodQuarter-1];
          // Calendar year of the quarter end month
          var qCalY=periodQuarter<=3?periodYear:periodYear+1;
          var qOff=(monthOffset!=null)?Number(monthOffset):1;
          var dueM=qEndM+qOff;
          var dueY=qCalY;
          if(dueM>12){dueM-=12;dueY++;}
          if(month){dueM=month;} // absolute month override
          return dueY+'-'+String(dueM).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        }else if(freq==='yearly'){
          // periodYear = FY start year. Due dates fall in FY year or year+1
          var dm=month||7;
          var dueCalY=dm>=4?periodYear:periodYear+1;
          return dueCalY+'-'+String(dm).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        }
        return null;
      }

      // Build due date list from config
      var dueDateList=[];
      if(cfg.frequency!=='once'){
        if(cfg.due_dates&&cfg.due_dates.length>0){
          cfg.due_dates.forEach(function(dd){
            var d=computeDueDate(dd.day,dd.month,cfg.frequency,dd.month_offset);
            if(d)dueDateList.push({date:d,label:dd.label||'Due'});
          });
        }else if(cfg.due_day){
          var d=computeDueDate(cfg.due_day,cfg.due_month,cfg.frequency);
          if(d)dueDateList.push({date:d,label:'Due'});
        }
      }

      // Update existing rows with correct due dates (fix stale dates)
      if(dueDateList.length===1&&cfg.frequency!=='once'){
        var dd0=dueDateList[0];
        var toUpdate=existingRows.filter(function(r){return r.due_date!==dd0.date;});
        if(toUpdate.length>0){
          var updateIds=toUpdate.map(function(r){return r.id;});
          await supabase.from('worksheet_rows').update({due_date:dd0.date,due_label:dd0.label}).in('id',updateIds);
          existingRows=existingRows.map(function(r){return updateIds.includes(r.id)?Object.assign({},r,{due_date:dd0.date,due_label:dd0.label}):r;});
        }
      }

      // Auto-insert missing rows (skip for 'once' — those are added manually)
      if(cfg.frequency==='once'){
        // For one-time: just load existing rows, don't auto-create
        var clientMap={};
        currentClients.forEach(function(c){clientMap[c.id]=c;});
        existingRows.sort(function(a,b){
          var na=(clientMap[a.client_id]||{}).name||'';
          var nb=(clientMap[b.client_id]||{}).name||'';
          return na.localeCompare(nb);
        });
        setRows(existingRows);
        setLoading(false);
        return;
      }
      var existingClientIds=[...new Set(existingRows.map(function(r){return r.client_id;}))];
      var missing=typeClients.filter(function(c){return !existingClientIds.includes(c.id);});

      // Build new rows for missing clients
      var newRows=[];
      if(missing.length>0){
        if(dueDateList.length<=1){
          var dd=dueDateList[0]||null;
          missing.forEach(function(c){var r={worksheet_id:ws.id,client_id:c.id,org_id:org.id,data:{}};if(dd){r.due_date=dd.date;r.due_label=dd.label;}newRows.push(r);});
        }else{
          missing.forEach(function(c){
            dueDateList.forEach(function(dd){
              newRows.push({worksheet_id:ws.id,client_id:c.id,org_id:org.id,data:{},due_date:dd.date,due_label:dd.label});
            });
          });
        }
      }

      // For multiple due dates: also create missing due_label rows for existing clients
      if(dueDateList.length>1){
        var existingKeys={};
        existingRows.forEach(function(r){existingKeys[r.client_id+'_'+(r.due_label||'')]=true;});
        typeClients.forEach(function(c){
          dueDateList.forEach(function(dd){
            if(!existingKeys[c.id+'_'+dd.label]){
              newRows.push({worksheet_id:ws.id,client_id:c.id,org_id:org.id,data:{},due_date:dd.date,due_label:dd.label});
            }
          });
        });
        // Also update existing rows with correct due dates per label
        dueDateList.forEach(function(dd){
          var toFix=existingRows.filter(function(r){return r.due_label===dd.label&&r.due_date!==dd.date;});
          if(toFix.length>0){
            var fixIds=toFix.map(function(r){return r.id;});
            supabase.from('worksheet_rows').update({due_date:dd.date}).in('id',fixIds);
            existingRows=existingRows.map(function(r){return fixIds.includes(r.id)?Object.assign({},r,{due_date:dd.date}):r;});
          }
        });
      }
      if(newRows.length>0){
        var ins2=await supabase.from('worksheet_rows').insert(newRows).select();
        if(ins2.error)console.error('worksheet_rows insert error:',ins2.error);
        existingRows=[...existingRows,...(ins2.data||[])];
      }
      // Sort by client name
      var clientMap={};
      typeClients.forEach(function(c){clientMap[c.id]=c;});
      existingRows.sort(function(a,b){
        var na=(clientMap[a.client_id]||{}).name||'';
        var nb=(clientMap[b.client_id]||{}).name||'';
        return na.localeCompare(nb);
      });
      setRows(existingRows);
    }
  }

  async function toggleCell(rowId,key,currentVal){
    var newVal=!currentVal;
    var row=rows.find(function(r){return r.id===rowId;});
    if(!row)return;
    var newData=Object.assign({},row.data||{});
    newData[key]=newVal;
    // Check if all checkbox cols are now done → auto-set completed_at
    var checkboxCols=cfg.cols.filter(function(c){return !c.type||c.type==='checkbox';});
    var allChecked=checkboxCols.length>0&&checkboxCols.every(function(c){return newData[c.key];});
    var updates={data:newData};
    if(allChecked&&!row.completed_at){updates.completed_at=new Date().toISOString();updates.status='completed';}
    else if(!allChecked&&row.completed_at){updates.completed_at=null;}
    await supabase.from('worksheet_rows').update(updates).eq('id',rowId);
    setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,updates):r;});});
  }

  async function updateRowDueDate(rowId,val){
    await supabase.from('worksheet_rows').update({due_date:val||null}).eq('id',rowId);
    setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,{due_date:val||null}):r;});});
  }

  // Load org members for assignee dropdown (one-time tasks)
  async function loadOrgMembers(){
    if(orgMembers.length>0)return;
    var rm=await supabase.from('organization_members').select('user_id,role').eq('org_id',org.id).limit(200);
    var mlist=rm.data||[];
    if(mlist.length>0){
      var ids=mlist.map(function(m){return m.user_id;});
      var rp=await supabase.from('profiles').select('id,name,email').in('id',ids).limit(200);
      setOrgMembers(rp.data||[]);
    }
  }

  function resetOnceForm(){setOnceClientId('');setOnceDueDate('');setOnceTitle('');setOnceDesc('');setOncePriority('medium');setOnceContact('');setOnceChecklist([]);setOnceHierarchy({});setShowAddOnce(false);}

  async function addOnceTask(){
    if(!onceClientId||!worksheet)return;
    setSaving(true);
    var rowData={};
    // Hierarchy assignments
    var hKeys=Object.keys(onceHierarchy);
    for(var hi=0;hi<hKeys.length;hi++){if(onceHierarchy[hKeys[hi]])rowData[hKeys[hi]]=onceHierarchy[hKeys[hi]];}
    // Legacy __assignee fallback (first hierarchy or direct)
    if(hierarchyCols.length>0&&rowData[hierarchyCols[0].key])rowData.__assignee=rowData[hierarchyCols[0].key];
    // Extra fields
    if(onceTitle.trim())rowData.__title=onceTitle.trim();
    if(onceDesc.trim())rowData.__description=onceDesc.trim();
    if(oncePriority)rowData.__priority=oncePriority;
    if(onceContact.trim())rowData.__contact=onceContact.trim();
    if(onceChecklist.length>0)rowData.__checklist=onceChecklist.filter(function(c){return c.text.trim();});

    var newRow={worksheet_id:worksheet.id,client_id:onceClientId,org_id:org.id,data:rowData,due_date:onceDueDate||null,due_label:onceTitle.trim()||'One-time',status:'pending'};
    var ins=await supabase.from('worksheet_rows').insert(newRow).select().single();
    if(ins.data){
      setRows(function(prev){return[...prev,ins.data];});
      showToast('Task created!');
    }else{showToast('Failed to add','err');}
    resetOnceForm();
    setSaving(false);
  }

  async function deleteOnceRow(rowId){
    if(!window.confirm('Remove this one-time task?'))return;
    await supabase.from('worksheet_rows').delete().eq('id',rowId);
    setRows(function(prev){return prev.filter(function(r){return r.id!==rowId;});});
    showToast('Task removed');
  }

  async function updateCellData(rowId,key,val){
    var row=rows.find(function(r){return r.id===rowId;});
    if(!row)return;
    var newData=Object.assign({},row.data||{});
    newData[key]=val;
    await supabase.from('worksheet_rows').update({data:newData}).eq('id',rowId);
    setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,{data:newData}):r;});});
  }

  async function updateComment(rowId,val){
    await supabase.from('worksheet_rows').update({comments:val}).eq('id',rowId);
    setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,{comments:val}):r;});});
  }

  async function updateStatus(rowId,val){
    var updates={status:val};
    if(val==='completed'){updates.completed_at=new Date().toISOString();}
    else{updates.completed_at=null;}
    await supabase.from('worksheet_rows').update(updates).eq('id',rowId);
    setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,updates):r;});});
  }

  var cfg=activeType&&WS_TYPE_CONFIGS[activeType]?WS_TYPE_CONFIGS[activeType]:{frequency:'monthly',cols:[]};
  var typeClients=clients.filter(function(c){
    var wts=((c.custom_fields&&c.custom_fields.work_types)||'').split(',').filter(Boolean);
    return wts.some(function(t){return t.trim()===activeType;});
  });
  var clientMap={};clients.forEach(function(c){clientMap[c.id]=c;});

  var periodLabel=activeType?getPeriodLabel(cfg.frequency,periodYear,periodMonth,periodQuarter):'';

  var SC_STATUS={pending:'#94a3b8',in_progress:'#f59e0b',under_review:'#8b5cf6',completed:'#22c55e'};

  // Visible columns (exclude hidden)
  var visibleCols=cfg.cols.filter(function(col){return !hiddenCols.includes(col.key);});
  // All toggleable columns (dynamic + built-in)
  var hierarchyCols=wfHierarchy.length>0?wfHierarchy.map(function(h){return{key:'__h_'+h.key,label:h.label};}):
    [{key:'__assignee',label:'Assignee'}];
  var allToggleCols=cfg.cols.map(function(c){return{key:c.key,label:c.label};}).concat(hierarchyCols).concat([{key:'__status',label:'Status'},{key:'__comments',label:'Comments'},{key:'__taskcard',label:'Task Card'}]);
  var showStatus=!hiddenCols.includes('__status');
  var showComments=!hiddenCols.includes('__comments');
  var showTaskCard=!hiddenCols.includes('__taskcard');

  // Apply filters to rows
  var hasActiveFilters=Object.keys(filters).length>0||filterClient||mineOnly;
  var filteredRows=rows.filter(function(row){
    var client=clientMap[row.client_id];
    if(!client)return false;
    // Mine-only filter: row.data must contain cu.id as __assignee or in any __h_*
    if(mineOnly){
      var rd=row.data||{};
      var isMine=rd.__assignee===cu.id;
      if(!isMine){var _dks=Object.keys(rd);for(var _di=0;_di<_dks.length;_di++){if(_dks[_di].indexOf('__h_')===0&&rd[_dks[_di]]===cu.id){isMine=true;break;}}}
      if(!isMine)return false;
    }
    // Client name filter
    if(filterClient&&!client.name.toLowerCase().includes(filterClient.toLowerCase())&&!(client.display_name||'').toLowerCase().includes(filterClient.toLowerCase()))return false;
    // Status filter
    if(filters.__status&&(row.status||'pending')!==filters.__status)return false;
    // Assignee filter
    // Hierarchy / assignee filters
    for(var hi=0;hi<hierarchyCols.length;hi++){var hk=hierarchyCols[hi].key;var hf=filters[hk];if(hf&&hf!=='all'){var hv=(row.data||{})[hk]||'';if(hf==='__unassigned'&&hv)return false;if(hf!=='__unassigned'&&hv!==hf)return false;}}
    // Column filters
    var d=row.data||{};
    var keys=Object.keys(filters);
    for(var i=0;i<keys.length;i++){
      var k=keys[i];
      if(k==='__status'||k.indexOf('__h_')===0||k==='__assignee')continue;
      var fv=filters[k];
      var colDef=cfg.cols.find(function(c){return c.key===k;});
      var ct=colDef&&colDef.type||'checkbox';
      if(ct==='checkbox'){
        if(fv==='checked'&&!d[k])return false;
        if(fv==='unchecked'&&d[k])return false;
      }else if(ct==='select'){
        if(fv==='__filled'&&!d[k])return false;
        if(fv==='__empty'&&d[k])return false;
        if(fv&&fv!=='__filled'&&fv!=='__empty'&&d[k]!==fv)return false;
      }else{
        if(fv==='__filled'&&!d[k])return false;
        if(fv==='__empty'&&d[k])return false;
      }
    }
    return true;
  });

  return<div style={{padding:'0 0 60px'}}>
    {/* Header */}
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
      <div>
        <h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Worksheets</h2>
        <div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>{clients.length} clients · {allTypes.length} work types</div>
      </div>
      <button onClick={recalcAllDueDates} disabled={recalculating} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:8,padding:'7px 14px',color:'#6b8cad',cursor:recalculating?'not-allowed':'pointer',fontSize:12,fontWeight:600,opacity:recalculating?0.6:1}}>{recalculating?'Recalculating...':'Recalculate Due Dates'}</button>
    </div>

    {loading?<div style={{textAlign:'center',padding:48,color:'var(--tf-text-sub)'}}>Loading...</div>:
    allTypes.length===0?<div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:12,padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontSize:32,marginBottom:12}}>📋</div>
      <div style={{fontWeight:700,fontSize:15,color:'var(--tf-text)',marginBottom:6}}>No work types assigned</div>
      <div style={{fontSize:13,color:'var(--tf-text-sub)'}}>Go to Client Master Data → edit each client → Work Types tab to assign work types.</div>
    </div>:<div>
      {/* Work type tabs — with grouping support */}
      <div style={{display:'flex',gap:4,marginBottom:0,borderBottom:'1px solid var(--tf-border)',flexWrap:'wrap'}}>
        {tabLayout.map(function(tab){
          var isActiveTab=tab.isGroup?activeGroup===tab.label:activeType===tab.types[0];
          return<button key={tab.label} onClick={function(){
            if(tab.isGroup){
              setActiveGroup(tab.label);
              // Select first work type in group
              var firstType=tab.types[0];
              setActiveType(firstType);
              var f2=WS_TYPE_CONFIGS[firstType]?WS_TYPE_CONFIGS[firstType].frequency:'monthly';
              var p2=getCurrentPeriod(f2);
              setPeriodYear(p2.year);if(p2.month)setPeriodMonth(p2.month);if(p2.quarter)setPeriodQuarter(p2.quarter);
            }else{
              setActiveGroup(null);
              setActiveType(tab.types[0]);
              var f2=WS_TYPE_CONFIGS[tab.types[0]]?WS_TYPE_CONFIGS[tab.types[0]].frequency:'monthly';
              var p2=getCurrentPeriod(f2);
              setPeriodYear(p2.year);if(p2.month)setPeriodMonth(p2.month);if(p2.quarter)setPeriodQuarter(p2.quarter);
            }
            clearFilters();
          }} style={{padding:'8px 16px',border:'none',borderBottom:isActiveTab?('2px solid '+(tab.isUnclassified?'#f59e0b':'#6b8cad')):'2px solid transparent',background:'none',color:isActiveTab?(tab.isUnclassified?'#f59e0b':'#6b8cad'):(tab.isUnclassified?'#f59e0b':'var(--tf-text-sub)'),cursor:'pointer',fontSize:12,fontWeight:isActiveTab?700:(tab.isUnclassified?700:500),whiteSpace:'nowrap',transition:'all 0.15s'}}>{tab.isUnclassified&&<span style={{marginRight:4}}>🏷</span>}{tab.label}{tab.isGroup&&<span style={{fontSize:9,marginLeft:4,color:'#f59e0b',fontWeight:700}}>▾</span>}</button>;
        })}
      </div>
      {/* Sub-tabs for grouped work types */}
      {activeGroup&&<div style={{display:'flex',gap:2,padding:'6px 0',marginBottom:8,borderBottom:'1px solid var(--tf-border)',flexWrap:'wrap'}}>
        {(tabLayout.find(function(t){return t.label===activeGroup;})||{types:[]}).types.map(function(t){
          var active=activeType===t;
          var cfg2=WS_TYPE_CONFIGS[t]||{};
          return<button key={t} onClick={function(){
            setActiveType(t);
            var f2=cfg2.frequency||'monthly';
            var p2=getCurrentPeriod(f2);
            setPeriodYear(p2.year);if(p2.month)setPeriodMonth(p2.month);if(p2.quarter)setPeriodQuarter(p2.quarter);
            clearFilters();
          }} style={{padding:'5px 12px',borderRadius:'100px',border:active?'1.5px solid rgba(107,140,173,0.5)':'1.5px solid var(--tf-border)',background:active?'rgba(107,140,173,0.1)':'transparent',color:active?'#6b8cad':'var(--tf-text-sub)',cursor:'pointer',fontSize:11,fontWeight:active?700:500,whiteSpace:'nowrap',transition:'all 0.15s'}}>
            {t}<span style={{fontSize:9,marginLeft:4,color:'var(--tf-text-mut)'}}>{(cfg2.frequency||'monthly').charAt(0).toUpperCase()}</span>
          </button>;
        })}
      </div>}

      {/* Period selector + toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {cfg.frequency!=='once'&&<div style={{fontSize:12,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05}}>Period:</div>}
        {cfg.frequency==='once'&&<>
          <div style={{fontSize:12,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05}}>One-time Tasks</div>
          <button onClick={function(){setShowAddOnce(!showAddOnce);loadOrgMembers();}} style={{background:showAddOnce?'rgba(34,197,94,0.15)':'rgba(107,140,173,0.1)',border:'1px solid '+(showAddOnce?'rgba(34,197,94,0.3)':'rgba(107,140,173,0.25)'),borderRadius:7,padding:'5px 12px',fontSize:12,fontWeight:700,color:showAddOnce?'#22c55e':'#6b8cad',cursor:'pointer'}}>+ Add Task</button>
        </>}
        {cfg.frequency==='monthly'&&<>
          <select value={periodMonth} onChange={function(e){setPeriodMonth(Number(e.target.value));}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
            {[4,5,6,7,8,9,10,11,12,1,2,3].map(function(mi){return<option key={mi} value={mi}>{MONTHS[mi-1]}</option>;})}
          </select>
        </>}
        {cfg.frequency==='quarterly'&&<>
          <select value={periodQuarter} onChange={function(e){setPeriodQuarter(Number(e.target.value));}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
            {QUARTERS.map(function(q,i){return<option key={q} value={i+1}>{q}</option>;})}
          </select>
        </>}
        {cfg.frequency!=='once'&&<select value={periodYear} onChange={function(e){setPeriodYear(Number(e.target.value));}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
          {[2022,2023,2024,2025,2026,2027].map(function(y){return<option key={y} value={y}>{'FY '+y+'-'+String(y+1).slice(2)}</option>;})}
        </select>}
        {cfg.frequency!=='once'&&<div style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:7,padding:'5px 12px',fontSize:12,fontWeight:700,color:'#6b8cad'}}>{periodLabel}</div>}

        {/* SOP button */}
        {cfg.sop_steps&&cfg.sop_steps.length>0&&<button onClick={function(){setShowSop(!showSop);}} style={{marginLeft:'auto',background:showSop?'rgba(34,197,94,0.12)':'var(--tf-surface)',border:'1px solid '+(showSop?'rgba(34,197,94,0.3)':'var(--tf-border)'),borderRadius:7,padding:'5px 10px',color:showSop?'#22c55e':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          SOP ({cfg.sop_steps.length})
        </button>}
        {/* Columns toggle button */}
        <div style={{position:'relative',marginLeft:cfg.sop_steps&&cfg.sop_steps.length>0?0:'auto'}}>
          <button onClick={function(){setShowColMenu(!showColMenu);}} style={{background:showColMenu?'rgba(107,140,173,0.15)':'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 10px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
            ⊞ Columns{hiddenCols.length>0&&<span style={{fontSize:10,color:'#f59e0b'}}>({hiddenCols.length} hidden)</span>}
          </button>
          {showColMenu&&<div style={{position:'absolute',top:'100%',right:0,marginTop:4,background:'var(--tf-bg)',border:'1px solid var(--tf-border)',borderRadius:10,padding:'8px 0',minWidth:200,zIndex:100,boxShadow:'0 8px 24px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',gap:6,padding:'4px 12px 8px',borderBottom:'1px solid var(--tf-border)'}}>
              <button onClick={function(){if(activeType)saveColPref(activeType,[]);}} style={{fontSize:11,color:'#6b8cad',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>Show All</button>
              <button onClick={function(){if(activeType)saveColPref(activeType,allToggleCols.map(function(c){return c.key;}));}} style={{fontSize:11,color:'#94a3b8',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>Hide All</button>
            </div>
            {allToggleCols.map(function(col){
              var visible=!hiddenCols.includes(col.key);
              return<div key={col.key} onClick={function(){toggleColVisibility(col.key);}} style={{padding:'6px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--tf-text)'}}>
                <div style={{width:16,height:16,borderRadius:4,border:'2px solid',borderColor:visible?'#6b8cad':'var(--tf-border)',background:visible?'#6b8cad':'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {visible&&<span style={{color:'#fff',fontSize:10,fontWeight:900}}>✓</span>}
                </div>
                {col.label}
              </div>;
            })}
          </div>}
        </div>

        {/* Mine Only toggle */}
        <button onClick={function(){setMineOnly(!mineOnly);}} title="Show only tasks where I'm assigned or reviewing" style={{background:mineOnly?'rgba(99,102,241,0.12)':'var(--tf-surface)',border:'1px solid',borderColor:mineOnly?'#6366f1':'var(--tf-border)',borderRadius:7,padding:'5px 10px',color:mineOnly?'#6366f1':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:700}}>{mineOnly?'✓ Mine Only':'Mine Only'}</button>
        {/* Filter toggle button */}
        <button onClick={function(){setShowFilters(!showFilters);}} style={{background:showFilters||hasActiveFilters?'rgba(107,140,173,0.15)':'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 10px',color:hasActiveFilters?'#6b8cad':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
          ▽ Filter{hasActiveFilters&&<span style={{fontSize:10,color:'#f59e0b'}}>Active</span>}
        </button>
      </div>

      {/* Filter bar */}
      {showFilters&&<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap',padding:'10px 14px',background:'rgba(107,140,173,0.04)',border:'1px solid var(--tf-border)',borderRadius:10}}>
        <input value={filterClient} onChange={function(e){setFilterClient(e.target.value);}} placeholder="Search client..." style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,outline:'none',fontFamily:'inherit',width:140}}/>
        <select value={filters.__status||'all'} onChange={function(e){setFilter('__status',e.target.value);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        {hierarchyCols.map(function(hc){return<select key={hc.key} value={filters[hc.key]||'all'} onChange={function(e){setFilter(hc.key,e.target.value);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
          <option value="all">All {hc.label}s</option>
          <option value="__unassigned">Unassigned</option>
          {orgMembers.map(function(m){return<option key={m.id} value={m.id}>{m.name||m.email}</option>;})}
        </select>;})}
        {cfg.cols.map(function(col){
          var ct=col.type||'checkbox';
          if(ct==='checkbox'){
            return<select key={col.key} value={filters[col.key]||'all'} onChange={function(e){setFilter(col.key,e.target.value);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
              <option value="all">{col.label}: All</option>
              <option value="checked">{col.label}: Done</option>
              <option value="unchecked">{col.label}: Not Done</option>
            </select>;
          }
          if(ct==='select'){
            var opts=(col.options||'').split(',').map(function(o){return o.trim();}).filter(Boolean);
            return<select key={col.key} value={filters[col.key]||'all'} onChange={function(e){setFilter(col.key,e.target.value);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
              <option value="all">{col.label}: All</option>
              <option value="__filled">Has Value</option>
              <option value="__empty">Empty</option>
              {opts.map(function(o){return<option key={o} value={o}>{o}</option>;})}
            </select>;
          }
          return<select key={col.key} value={filters[col.key]||'all'} onChange={function(e){setFilter(col.key,e.target.value);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'5px 9px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
            <option value="all">{col.label}: All</option>
            <option value="__filled">Has Value</option>
            <option value="__empty">Empty</option>
          </select>;
        })}
        {hasActiveFilters&&<button onClick={clearFilters} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:7,padding:'5px 10px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Clear</button>}
        {hasActiveFilters&&<span style={{fontSize:11,color:'var(--tf-text-sub)'}}>Showing {filteredRows.length} of {rows.length}</span>}
      </div>}

      {/* Add one-time task modal */}
      {cfg.frequency==='once'&&showAddOnce&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)resetOnceForm();}}>
        <div style={{background:'var(--tf-bg)',borderRadius:16,width:'100%',maxWidth:540,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid var(--tf-border)'}}>
            <h3 style={{margin:0,fontSize:16,fontWeight:700,color:'var(--tf-text)'}}>New One-time Task — {activeType}</h3>
            <button onClick={resetOnceForm} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20}}>×</button>
          </div>
          <div style={{padding:'16px 20px',overflowY:'auto',flex:1}}>
            {(function(){
              var _INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'};
              var _LBL={fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4,display:'block'};
              return<div>
                {/* Client */}
                <div style={{marginBottom:14}}>
                  <label style={_LBL}>Client *</label>
                  <select value={onceClientId} onChange={function(e){setOnceClientId(e.target.value);}} style={Object.assign({},_INP,{cursor:'pointer'})}>
                    <option value="">— Select Client —</option>
                    {clients.map(function(c){return<option key={c.id} value={c.id}>{c.name}{c.pan?' ('+c.pan+')':''}</option>;})}
                  </select>
                </div>

                {/* Task Title */}
                <div style={{marginBottom:14}}>
                  <label style={_LBL}>Task Title</label>
                  <input value={onceTitle} onChange={function(e){setOnceTitle(e.target.value);}} style={_INP} placeholder="e.g. GST Registration, Company Incorporation..."/>
                </div>

                {/* Description */}
                <div style={{marginBottom:14}}>
                  <label style={_LBL}>Description <span style={{fontWeight:400,textTransform:'none'}}>(optional)</span></label>
                  <textarea value={onceDesc} onChange={function(e){setOnceDesc(e.target.value);}} style={Object.assign({},_INP,{minHeight:56,resize:'vertical'})} placeholder="Task details, instructions, notes..."/>
                </div>

                {/* Hierarchy-level Assignees */}
                <div style={{marginBottom:14}}>
                  <label style={_LBL}>Assign To</label>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    {hierarchyCols.map(function(hc){return<div key={hc.key} style={{flex:1,minWidth:140}}>
                      <div style={{fontSize:10,color:'var(--tf-text-sub)',marginBottom:3}}>{hc.label}</div>
                      <select value={onceHierarchy[hc.key]||''} onChange={function(e){setOnceHierarchy(function(p){var n=Object.assign({},p);n[hc.key]=e.target.value;return n;});}} style={Object.assign({},_INP,{cursor:'pointer',fontSize:12})}>
                        <option value="">— Select —</option>
                        {orgMembers.map(function(m){return<option key={m.id} value={m.id}>{m.name||m.email}</option>;})}
                      </select>
                    </div>;})}
                  </div>
                </div>

                {/* Priority + Due Date + Contact row */}
                <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:120}}>
                    <label style={_LBL}>Priority</label>
                    <select value={oncePriority} onChange={function(e){setOncePriority(e.target.value);}} style={Object.assign({},_INP,{cursor:'pointer'})}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div style={{flex:1,minWidth:140}}>
                    <label style={_LBL}>Due Date</label>
                    <input type="date" value={onceDueDate} onChange={function(e){setOnceDueDate(e.target.value);}} style={_INP}/>
                  </div>
                  <div style={{flex:1,minWidth:140}}>
                    <label style={_LBL}>Contact Person</label>
                    <input value={onceContact} onChange={function(e){setOnceContact(e.target.value);}} style={_INP} placeholder="Client's contact name"/>
                  </div>
                </div>

                {/* Checklist */}
                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                    <label style={Object.assign({},_LBL,{marginBottom:0})}>Checklist <span style={{fontWeight:400,textTransform:'none'}}>(optional)</span></label>
                    <button onClick={function(){setOnceChecklist(function(p){return[...p,{text:'',done:false}];});}} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:6,padding:'2px 10px',color:'#6b8cad',cursor:'pointer',fontSize:11,fontWeight:600}}>+ Item</button>
                  </div>
                  {onceChecklist.length===0?<div style={{fontSize:12,color:'var(--tf-text-sub)',fontStyle:'italic'}}>No checklist items.</div>:
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    {onceChecklist.map(function(item,ci){
                      return<div key={ci} style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:11,color:'var(--tf-text-sub)',width:18,textAlign:'center',flexShrink:0}}>{ci+1}.</span>
                        <input value={item.text} onChange={function(e){setOnceChecklist(function(p){return p.map(function(c,i){return i===ci?{text:e.target.value,done:c.done}:c;});});}} style={Object.assign({},_INP,{flex:1,padding:'5px 8px',fontSize:12})} placeholder="Checklist item..."/>
                        <button onClick={function(){setOnceChecklist(function(p){return p.filter(function(_,i){return i!==ci;});});}} style={{background:'none',border:'none',color:'var(--tf-text-mut)',cursor:'pointer',fontSize:14,padding:'0 4px'}} onMouseEnter={function(e){e.currentTarget.style.color='#ef4444';}} onMouseLeave={function(e){e.currentTarget.style.color='var(--tf-text-mut)';}}>×</button>
                      </div>;
                    })}
                  </div>}
                </div>
              </div>;
            })()}
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:9,padding:'13px 20px',borderTop:'1px solid var(--tf-border)'}}>
            <button onClick={resetOnceForm} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 16px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>
            <button onClick={addOnceTask} disabled={!onceClientId||saving} style={{background:onceClientId?'#22c55e':'#64748b',color:'#fff',border:'none',borderRadius:8,padding:'7px 20px',fontSize:13,fontWeight:700,cursor:onceClientId?'pointer':'not-allowed',opacity:saving?0.6:onceClientId?1:0.5}}>{saving?'Creating...':'Create Task'}</button>
          </div>
        </div>
      </div>}

      {/* Summary stats */}
      {rows.length>0&&<div style={{display:'flex',gap:12,marginBottom:12,fontSize:11,color:'var(--tf-text-sub)',flexWrap:'wrap'}}>
        {cfg.cols.map(function(col){
          var ct=col.type||'checkbox';
          if(ct==='checkbox'){
            var count=rows.filter(function(r){return r.data&&r.data[col.key];}).length;
            return<span key={col.key}><b style={{color:'var(--tf-text)'}}>{count}/{rows.length}</b> {col.label}</span>;
          }
          var filled=rows.filter(function(r){return r.data&&r.data[col.key];}).length;
          return<span key={col.key}><b style={{color:'var(--tf-text)'}}>{filled}/{rows.length}</b> {col.label} filled</span>;
        })}
      </div>}

      {/* Table */}
      {cfg.frequency==='once'&&rows.length===0?<div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:10,padding:'28px 20px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>
        <div style={{fontSize:28,marginBottom:8}}>📝</div>
        <div style={{fontWeight:700,color:'var(--tf-text)',marginBottom:4}}>No one-time tasks yet</div>
        <div>Click <b>+ Add Task</b> above to generate a one-time task by selecting a client, assignee, and due date.</div>
      </div>:
      cfg.frequency!=='once'&&typeClients.length===0?<div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:10,padding:'28px 20px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>
        No clients have {activeType} as a work type. Add clients in Client Master Data.
      </div>:
      <div style={{background:'var(--tf-surface)',borderRadius:12,border:'1px solid var(--tf-border)',overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:400}}>
          <thead>
            <tr style={{background:'rgba(107,140,173,0.07)'}}>
              <th style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:160}}>Client</th>
              {hierarchyCols.map(function(hc){return!hiddenCols.includes(hc.key)&&<th key={hc.key} style={{padding:'10px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:120}}>{hc.label}</th>;})}
              {visibleCols.map(function(col){var ct=col.type||'checkbox';var mw=ct==='checkbox'?80:ct==='date'||ct==='time'?110:ct==='select'?120:100;return<th key={col.key} style={{padding:'10px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:mw}}>{col.label}</th>;})}
              {showStatus&&<th style={{padding:'10px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:100}}>Status</th>}
              {showComments&&<th style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:160}}>Comments</th>}
              {showTaskCard&&<th style={{padding:'10px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:110}}>Task Card</th>}
              {cfg.frequency==='once'&&<th style={{padding:'10px 6px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap',minWidth:60}}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(function(row,ri){
              var client=clientMap[row.client_id];
              if(!client)return null;
              var d=row.data||{};
              var checkboxCols=cfg.cols.filter(function(c){return !c.type||c.type==='checkbox';});
              var allDone=checkboxCols.length>0&&checkboxCols.every(function(c){return d[c.key];});
              return<tr key={row.id} style={{borderBottom:'1px solid var(--tf-border)',background:allDone?'rgba(34,197,94,0.04)':ri%2?'rgba(107,140,173,0.02)':'transparent',transition:'background 0.15s'}}>
                <td style={{padding:'10px 14px'}}>
                  <div style={{fontWeight:600,color:'var(--tf-text)',fontSize:13}}>{client.name}{row.due_label&&row.due_label!=='Due'&&<span style={{fontSize:10,fontWeight:600,color:'#6b8cad',background:'rgba(107,140,173,0.1)',borderRadius:4,padding:'1px 5px',marginLeft:6}}>{row.due_label}</span>}</div>
                  {client.display_name&&client.display_name!==client.name&&<div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{client.display_name}</div>}
                  {client.pan&&<div style={{fontSize:10,fontFamily:'monospace',color:'var(--tf-text-sub)',marginTop:1}}>{client.pan}</div>}
                  {cfg.frequency==='once'?<div style={{marginTop:2}}><input type="date" value={row.due_date||''} onChange={function(e){updateRowDueDate(row.id,e.target.value);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:5,padding:'2px 6px',color:'var(--tf-text)',fontSize:10,outline:'none',fontFamily:'inherit'}}/></div>:row.due_date&&<div style={{fontSize:9,color:'var(--tf-text-sub)',marginTop:1}}>Due: {new Date(row.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>}
                </td>
                {hierarchyCols.map(function(hc){if(hiddenCols.includes(hc.key))return null;var hVal=(row.data||{})[hc.key]||'';return<td key={hc.key} style={{padding:'6px 8px',textAlign:'center'}}>
                  <select value={hVal} onChange={function(e){updateCellData(row.id,hc.key,e.target.value);}}
                    style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:6,padding:'4px 6px',color:hVal?'var(--tf-text)':'var(--tf-text-sub)',fontSize:11,outline:'none',fontFamily:'inherit',cursor:'pointer',maxWidth:140,WebkitAppearance:'none',MozAppearance:'none',appearance:'none',backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'%3E%3Cpath d=\'M0 0l4 5 4-5z\' fill=\'%236b8cad\'/%3E%3C/svg%3E")',backgroundRepeat:'no-repeat',backgroundPosition:'right 6px center',paddingRight:18}}>
                    <option value="" style={{background:'var(--tf-surface)',color:'var(--tf-text-sub)'}}>—</option>
                    {orgMembers.map(function(m){return<option key={m.id} value={m.id} style={{background:'var(--tf-surface)',color:'var(--tf-text)'}}>{m.name||m.email}</option>;})}
                  </select>
                </td>;})}
                {visibleCols.map(function(col){
                  var colType=col.type||'checkbox';
                  if(colType==='checkbox'){
                    var val=!!(d[col.key]);
                    return<td key={col.key} style={{padding:'10px 10px',textAlign:'center'}}>
                      <div onClick={function(){toggleCell(row.id,col.key,val);}} style={{width:22,height:22,borderRadius:5,border:'2px solid',borderColor:val?'#22c55e':'var(--tf-border)',background:val?'#22c55e':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',transition:'all 0.15s'}}>
                        {val&&<span style={{color:'#fff',fontSize:13,fontWeight:900,lineHeight:1}}>✓</span>}
                      </div>
                    </td>;
                  }
                  if(colType==='text'){
                    return<td key={col.key} style={{padding:'6px 6px',textAlign:'center'}}>
                      <input defaultValue={d[col.key]||''} onBlur={function(e){if(e.target.value!==(d[col.key]||''))updateCellData(row.id,col.key,e.target.value);}}
                        style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:5,color:'var(--tf-text)',fontSize:12,width:'100%',minWidth:60,outline:'none',fontFamily:'inherit',padding:'4px 6px',textAlign:'center'}}/>
                    </td>;
                  }
                  if(colType==='date'){
                    return<td key={col.key} style={{padding:'6px 6px',textAlign:'center'}}>
                      <input type="date" defaultValue={d[col.key]||''} onChange={function(e){updateCellData(row.id,col.key,e.target.value);}}
                        style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:5,color:'var(--tf-text)',fontSize:11,outline:'none',fontFamily:'inherit',padding:'3px 4px',cursor:'pointer'}}/>
                    </td>;
                  }
                  if(colType==='time'){
                    return<td key={col.key} style={{padding:'6px 6px',textAlign:'center'}}>
                      <input type="time" defaultValue={d[col.key]||''} onChange={function(e){updateCellData(row.id,col.key,e.target.value);}}
                        style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:5,color:'var(--tf-text)',fontSize:11,outline:'none',fontFamily:'inherit',padding:'3px 4px',cursor:'pointer'}}/>
                    </td>;
                  }
                  if(colType==='select'){
                    var opts=(col.options||'').split(',').map(function(o){return o.trim();}).filter(Boolean);
                    return<td key={col.key} style={{padding:'6px 6px',textAlign:'center'}}>
                      <select value={d[col.key]||''} onChange={function(e){updateCellData(row.id,col.key,e.target.value);}}
                        style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:5,color:'var(--tf-text)',fontSize:11,outline:'none',fontFamily:'inherit',padding:'3px 4px',cursor:'pointer',maxWidth:120}}>
                        <option value="">—</option>
                        {opts.map(function(o){return<option key={o} value={o}>{o}</option>;})}
                      </select>
                    </td>;
                  }
                  return<td key={col.key} style={{padding:'6px 6px',textAlign:'center'}}>
                    <input defaultValue={d[col.key]||''} onBlur={function(e){if(e.target.value!==(d[col.key]||''))updateCellData(row.id,col.key,e.target.value);}}
                      style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:5,color:'var(--tf-text)',fontSize:12,width:'100%',minWidth:60,outline:'none',fontFamily:'inherit',padding:'4px 6px',textAlign:'center'}}/>
                  </td>;
                })}
                {showStatus&&<td style={{padding:'10px 10px',textAlign:'center'}}>
                  <select value={row.status||'pending'} onChange={function(e){updateStatus(row.id,e.target.value);}}
                    style={{background:'transparent',border:'1px solid',borderColor:SC_STATUS[row.status||'pending'],borderRadius:20,padding:'3px 8px',color:SC_STATUS[row.status||'pending'],fontSize:11,fontWeight:700,cursor:'pointer',outline:'none',textTransform:'capitalize'}}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="under_review">Under Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </td>}
                {showComments&&<td style={{padding:'10px 14px'}}>
                  <input value={row.comments||''} onChange={function(e){var v=e.target.value;setRows(function(p){return p.map(function(r){return r.id===row.id?Object.assign({},r,{comments:v}):r;});});}}
                    onBlur={function(e){updateComment(row.id,e.target.value);}}
                    placeholder="Add note..."
                    style={{background:'transparent',border:'none',borderBottom:'1px solid var(--tf-border)',color:'var(--tf-text)',fontSize:12,width:'100%',outline:'none',fontFamily:'inherit',padding:'2px 0'}}/>
                </td>}
                {showTaskCard&&<td style={{padding:'10px 10px',textAlign:'center'}}>
                  {row.task_card_id?<span style={{fontSize:11,fontWeight:600,color:'#22c55e',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.25)',borderRadius:20,padding:'3px 10px'}}>✓ Created</span>:
                  <button onClick={function(){setShowCreateTask({row,client});}} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.3)',borderRadius:7,padding:'5px 10px',color:'#6b8cad',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>+ Create</button>}
                </td>}
                {cfg.frequency==='once'&&<td style={{padding:'10px 6px',textAlign:'center'}}>
                  {row.data&&row.data.__assignee&&<div style={{fontSize:10,color:'var(--tf-text-sub)',marginBottom:2}}>{(orgMembers.find(function(m){return m.id===row.data.__assignee;})||{}).name||'Assigned'}</div>}
                  <button onClick={function(){deleteOnceRow(row.id);}} title="Remove task" style={{background:'none',border:'none',color:'var(--tf-text-mut)',cursor:'pointer',fontSize:14,padding:'2px 6px',borderRadius:4}} onMouseEnter={function(e){e.currentTarget.style.color='#ef4444';}} onMouseLeave={function(e){e.currentTarget.style.color='var(--tf-text-mut)';}}>✕</button>
                </td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>}

    {showCreateTask&&<WorksheetTaskModal row={showCreateTask.row} client={showCreateTask.client} workType={activeType} period={periodLabel} allWorkspaces={allWorkspaces} supabase={supabase} cu={cu} orgId={org.id} onClose={function(){setShowCreateTask(null);}} onCreated={function(taskId,wsId){supabase.from('worksheet_rows').update({task_card_id:taskId,task_workspace_id:wsId}).eq('id',showCreateTask.row.id).then(function(){setRows(function(p){return p.map(function(r){return r.id===showCreateTask.row.id?Object.assign({},r,{task_card_id:taskId,task_workspace_id:wsId}):r;});});setShowCreateTask(null);showToast('Task card created!');});}}/>}

    {/* SOP Slide-out Panel */}
    {showSop&&cfg.sop_steps&&cfg.sop_steps.length>0&&<div style={{position:'fixed',inset:0,zIndex:999,display:'flex',justifyContent:'flex-end'}} onClick={function(e){if(e.target===e.currentTarget)setShowSop(false);}}>
      <div style={{background:'rgba(0,0,0,0.3)',position:'absolute',inset:0}} onClick={function(){setShowSop(false);}}/>
      <div style={{position:'relative',width:420,maxWidth:'90vw',background:'var(--tf-bg)',borderLeft:'1px solid var(--tf-border)',boxShadow:'-8px 0 32px rgba(0,0,0,0.2)',display:'flex',flexDirection:'column',zIndex:1}}>
        <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:'var(--tf-text)',letterSpacing:'-0.02em'}}>SOP — {activeType}</div>
            <div style={{fontSize:12,color:'var(--tf-text-sub)',marginTop:2}}>Standard Operating Procedure · {cfg.sop_steps.length} step{cfg.sop_steps.length!==1?'s':''}</div>
          </div>
          <button onClick={function(){setShowSop(false);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:6,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:16}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {cfg.sop_steps.map(function(step,i){
            return<div key={i} style={{marginBottom:16,position:'relative',paddingLeft:36}}>
              <div style={{position:'absolute',left:0,top:0,width:26,height:26,borderRadius:13,background:'rgba(107,140,173,0.15)',border:'1px solid rgba(107,140,173,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#6b8cad'}}>{step.step||i+1}</div>
              {i<cfg.sop_steps.length-1&&<div style={{position:'absolute',left:12,top:28,width:2,height:'calc(100% - 8px)',background:'rgba(107,140,173,0.15)'}}/>}
              <div style={{fontSize:14,fontWeight:700,color:'var(--tf-text)',marginBottom:4,paddingTop:3}}>{step.title}</div>
              {step.description&&<div style={{fontSize:12,color:'var(--tf-text-sub)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{step.description}</div>}
              {step.link&&<a href={step.link} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#6b8cad',marginTop:4,display:'inline-flex',alignItems:'center',gap:3,textDecoration:'none',wordBreak:'break-all'}} onMouseEnter={function(e){e.currentTarget.style.textDecoration='underline';}} onMouseLeave={function(e){e.currentTarget.style.textDecoration='none';}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                {step.link.length>50?step.link.slice(0,50)+'...':step.link}
              </a>}
            </div>;
          })}
        </div>
      </div>
    </div>}

    {toast&&<div style={{position:'fixed',bottom:24,right:24,background:toast.type==='err'?'#ef4444':'#22c55e',color:'#fff',borderRadius:10,padding:'11px 18px',fontSize:13,fontWeight:600,zIndex:9999}}>{toast.msg}</div>}
  </div>;
}

function WorksheetTaskModal({row,client,workType,period,allWorkspaces,supabase,cu,orgId,onClose,onCreated}){
  var [wsId,setWsId]=useState(allWorkspaces&&allWorkspaces.length>0?allWorkspaces[0].id:'');
  var [title,setTitle]=useState(workType+' - '+(client.display_name||client.name)+' - '+period);
  var [saving,setSaving]=useState(false);
  var [err,setErr]=useState('');
  var orgWs=(allWorkspaces||[]).filter(function(w){return w.org_id===orgId;});
  var wsOptions=allWorkspaces||[];

  async function create(){
    if(!wsId){setErr('Select a workspace');return;}
    if(!title.trim()){setErr('Title required');return;}
    setSaving(true);
    // Get first status of selected workspace
    var wsData=await supabase.from('workspaces').select('custom_statuses,color').eq('id',wsId).single();
    var statuses=(wsData.data&&wsData.data.custom_statuses)||['Todo'];
    var r=await supabase.from('tasks').insert({
      title:title.trim(),
      workspace_id:wsId,
      status:statuses[0],
      priority:'Medium',
      created_by:cu.id,
      sort_order:Date.now()
    }).select().single();
    setSaving(false);
    if(r.error){setErr(r.error.message);return;}
    onCreated(r.data.id,wsId);
  }

  var INP={background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 11px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit',boxSizing:'border-box'};
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:14,width:'100%',maxWidth:420,boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'15px 18px',borderBottom:'1px solid var(--tf-border)'}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--tf-text)'}}>Create Task Card</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 18px'}}>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:5,display:'block'}}>Task Title</label>
          <input value={title} onChange={function(e){setTitle(e.target.value);}} style={INP}/>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:5,display:'block'}}>Workspace</label>
          {wsOptions.length===0?<div style={{fontSize:13,color:'var(--tf-text-sub)',fontStyle:'italic'}}>No workspaces linked to this organisation. Link workspaces in Org Settings.</div>:
          <select value={wsId} onChange={function(e){setWsId(e.target.value);}} style={Object.assign({},INP,{cursor:'pointer'})}>
            {wsOptions.map(function(w){return<option key={w.id} value={w.id}>{w.name}</option>;})}
          </select>}
        </div>
        <div style={{background:'rgba(107,140,173,0.06)',border:'1px solid rgba(107,140,173,0.15)',borderRadius:8,padding:'9px 12px',fontSize:11,color:'var(--tf-text-sub)',lineHeight:1.7}}>
          <div><b style={{color:'var(--tf-text)'}}>Client:</b> {client.name}{client.pan?' · PAN: '+client.pan:''}</div>
          <div><b style={{color:'var(--tf-text)'}}>Work Type:</b> {workType} · <b style={{color:'var(--tf-text)'}}>Period:</b> {period}</div>
        </div>
        {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:8,background:'rgba(239,68,68,0.08)',padding:'6px 10px',borderRadius:6}}>{err}</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'12px 18px',borderTop:'1px solid var(--tf-border)'}}>
        <button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 15px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>
        <button onClick={create} disabled={saving||wsOptions.length===0} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>
          {saving?'Creating...':'Create Task'}
        </button>
      </div>
    </div>
  </div>;
}


function OrgInviteBanner({cu,supabase,onAccepted}){
  var [invites,setInvites]=useState([]);
  var cuId=cu?cu.id:null;
  useEffect(function(){
    if(!cu)return;
    supabase.from('org_invitations')
      .select('*, organizations(id,name)')
      .eq('invitee_email',cu.email.toLowerCase())
      .eq('status','pending')
      .limit(50)
      .then(function(r){if(r.data&&r.data.length)setInvites(r.data);});
  },[cuId]);
  if(!invites.length)return null;
  async function accept(inv){
    // Add to org_members
    await supabase.from('organization_members').insert({org_id:inv.org_id,user_id:cu.id,role:inv.role||'member',joined_at:new Date().toISOString()});
    // Mark invitation accepted
    await supabase.from('org_invitations').update({status:'accepted'}).eq('id',inv.id);
    setInvites(function(p){return p.filter(function(i){return i.id!==inv.id;});});
    if(onAccepted)onAccepted();
  }
  async function decline(inv){
    await supabase.from('org_invitations').update({status:'declined'}).eq('id',inv.id);
    setInvites(function(p){return p.filter(function(i){return i.id!==inv.id;});});
  }
  return<div style={{marginBottom:20}}>
    {invites.map(function(inv){
      var org=inv.organizations||{};
      return<div key={inv.id} style={{background:'linear-gradient(135deg,rgba(107,140,173,0.1),rgba(107,140,173,0.06))',border:'1px solid rgba(107,140,173,0.3)',borderRadius:12,padding:'14px 18px',marginBottom:10,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <div style={{width:38,height:38,borderRadius:10,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,fontWeight:700,color:'#fff',flexShrink:0}}>
          {(org.name||'O').charAt(0).toUpperCase()}
        </div>
        <div style={{flex:1,minWidth:160}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)'}}>Organisation Invitation</div>
          <div style={{fontSize:12,color:'var(--tf-text-sub)',marginTop:2}}>You have been invited to join <b style={{color:'var(--tf-text)'}}>{org.name}</b> as <b style={{color:'#6b8cad'}}>{inv.role||'member'}</b></div>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0}}>
          <button onClick={function(){accept(inv);}} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 16px',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>✓ Accept</button>
          <button onClick={function(){decline(inv);}} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'7px 14px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:600}}>Decline</button>
        </div>
      </div>;
    })}
  </div>;
}

// ── Org Create Modal ───────────────────────────────────────────────
function OrgCreateModal({open,cu,supabase,onClose,onCreated}){
  var [name,setName]=useState('');
  var [saving,setSaving]=useState(false);
  var [err,setErr]=useState('');
  if(!open)return null;
  var save=async function(){
    if(!name.trim()){setErr('Name required');return;}
    setSaving(true);
    var slug='org'+Date.now();
    var res=await supabase.from('organizations').insert({name:name.trim(),slug:slug,created_by:cu.id});
    setSaving(false);
    if(res.error){setErr(res.error.message);return;}
    setName('');setErr('');
    onCreated();
  };
  return<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={function(e){if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'var(--tf-bg)',borderRadius:14,width:'100%',maxWidth:400,boxShadow:'0 24px 80px rgba(0,0,0,0.4)'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'15px 18px',borderBottom:'1px solid var(--tf-border)'}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--tf-text)'}}>New Organisation</h3>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 18px'}}>
        <label style={{fontSize:11,fontWeight:600,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:.05,marginBottom:5,display:'block'}}>Organisation Name *</label>
        <input value={name} onChange={function(e){setName(e.target.value);}} autoFocus placeholder='e.g. Paresh Sarda & Co.' style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 12px',color:'var(--tf-text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} onKeyDown={function(e){if(e.key==='Enter')save();}}/>
        {err&&<div style={{color:'#ef4444',fontSize:12,marginTop:6,background:'rgba(239,68,68,0.08)',padding:'6px 10px',borderRadius:6}}>{err}</div>}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:8,padding:'11px 18px',borderTop:'1px solid var(--tf-border)'}}>
        <button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 15px',color:'var(--tf-text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancel</button>
        <button onClick={save} disabled={saving} style={{background:'#6b8cad',border:'none',borderRadius:8,padding:'7px 18px',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>{saving?'Saving...':'Create'}</button>
      </div>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ══════════════════════════════════════════════════════════════════

function AnalyticsDashboard({org,supabase,cu,workTypeConfigs}){
  var [loading,setLoading]=useState(true);
  var [clients,setClients]=useState([]);
  var [worksheets,setWorksheets]=useState([]);
  var [allRows,setAllRows]=useState([]);
  var [selectedYear,setSelectedYear]=useState(function(){var now=new Date();return now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;});
  var [activeTab,setActiveTab]=useState('overview');
  var [filterMonth,setFilterMonth]=useState(0);
  var [drillType,setDrillType]=useState(null);
  var [drillFilter,setDrillFilter]=useState('all');

  var configMap=useMemo(function(){
    if(!workTypeConfigs||workTypeConfigs.length===0) return DEFAULT_WS_TYPE_CONFIGS;
    var m={};
    workTypeConfigs.forEach(function(c){
      m[c.name]={frequency:c.frequency,cols:c.columns||[],due_day:c.due_day,due_month:c.due_month,due_dates:c.due_dates||[]};
    });
    return m;
  },[workTypeConfigs]);

  useEffect(function(){loadData();},[org.id,selectedYear]);

  async function loadData(){
    setLoading(true);
    var rc=await supabase.from('clients').select('id,name,display_name,pan,custom_fields').eq('org_id',org.id).order('name').limit(500);
    // Fetch worksheets for the selected FY year, also include year+1 to catch old calendar-year monthly data (Jan-Mar)
    var rw=await supabase.from('worksheets').select('id,work_type,period_label,period_year,period_month,period_quarter,frequency').eq('org_id',org.id).in('period_year',[selectedYear,selectedYear+1]).limit(1000);
    var clientData=rc.data||[];
    // Filter: keep worksheets that belong to this FY
    // FY year: months 4-12 have period_year=selectedYear, months 1-3 have period_year=selectedYear (new) or selectedYear+1 (old)
    var wsData=(rw.data||[]).filter(function(ws){
      if(ws.period_year===selectedYear)return true;
      // Old calendar-year format: period_year=selectedYear+1 and period_month 1-3
      if(ws.period_year===selectedYear+1&&ws.frequency==='monthly'&&ws.period_month&&ws.period_month<=3)return true;
      return false;
    });
    setClients(clientData);
    setWorksheets(wsData);
    if(wsData.length>0){
      var wsIds=wsData.map(function(w){return w.id;});
      var rr=await supabase.from('worksheet_rows').select('id,worksheet_id,client_id,status,due_date,due_label,completed_at').in('worksheet_id',wsIds).limit(2000);
      setAllRows(rr.data||[]);
    }else{setAllRows([]);}
    setLoading(false);
  }

  var clientMap={};
  clients.forEach(function(c){clientMap[c.id]=c;});

  // Filter worksheets by month if set
  var filteredWS=worksheets;
  if(filterMonth>0){
    filteredWS=worksheets.filter(function(ws){return ws.period_month===filterMonth;});
  }
  var filteredWSIds=filteredWS.map(function(w){return w.id;});
  var filteredRows=allRows.filter(function(r){return filteredWSIds.includes(r.worksheet_id);});

  // Group by work_type
  var wsGrouped={};
  filteredWS.forEach(function(ws){
    if(!wsGrouped[ws.work_type])wsGrouped[ws.work_type]=[];
    wsGrouped[ws.work_type].push(ws);
  });

  var today=new Date();today.setHours(0,0,0,0);
  var workTypeNames=Object.keys(wsGrouped);

  var workTypeStats=workTypeNames.map(function(wt){
    var wsIds=wsGrouped[wt].map(function(w){return w.id;});
    var wtRows=filteredRows.filter(function(r){return wsIds.includes(r.worksheet_id);});
    var total=wtRows.length;
    var completed=wtRows.filter(function(r){return r.status==='completed';}).length;
    var pending=total-completed;
    var overdue=wtRows.filter(function(r){return r.status!=='completed'&&r.due_date&&new Date(r.due_date)<today;}).length;
    var early=0,ontime=0,late=0,totalDays=0,completedWithDue=0;
    wtRows.forEach(function(r){
      if(r.status==='completed'&&r.completed_at&&r.due_date){
        var comp=new Date(r.completed_at);comp.setHours(0,0,0,0);
        var due=new Date(r.due_date);due.setHours(0,0,0,0);
        var diff=Math.round((comp-due)/(1000*60*60*24));
        if(diff<0)early++;else if(diff===0)ontime++;else late++;
        totalDays+=Math.abs(diff);completedWithDue++;
      }
    });
    var avgDays=completedWithDue>0?Math.round(totalDays/completedWithDue):0;
    return{wt:wt,total:total,completed:completed,pending:pending,overdue:overdue,early:early,ontime:ontime,late:late,avgDays:avgDays,rows:wtRows,wsIds:wsIds};
  });

  // Totals
  var totals={total:0,completed:0,pending:0,overdue:0};
  workTypeStats.forEach(function(s){totals.total+=s.total;totals.completed+=s.completed;totals.pending+=s.pending;totals.overdue+=s.overdue;});
  var totalPct=totals.total>0?Math.round(totals.completed/totals.total*100):0;

  // Drill-down
  var drillData=null;
  if(drillType){
    var stat=workTypeStats.find(function(s){return s.wt===drillType;});
    if(stat){
      var dRows=stat.rows;
      if(drillFilter==='pending')dRows=dRows.filter(function(r){return r.status!=='completed';});
      else if(drillFilter==='completed')dRows=dRows.filter(function(r){return r.status==='completed';});
      else if(drillFilter==='overdue')dRows=dRows.filter(function(r){return r.status!=='completed'&&r.due_date&&new Date(r.due_date)<today;});
      else if(drillFilter==='early')dRows=dRows.filter(function(r){if(r.status!=='completed'||!r.completed_at||!r.due_date)return false;var c2=new Date(r.completed_at);c2.setHours(0,0,0,0);return c2<new Date(r.due_date);});
      else if(drillFilter==='ontime')dRows=dRows.filter(function(r){if(r.status!=='completed'||!r.completed_at||!r.due_date)return false;var c2=new Date(r.completed_at);c2.setHours(0,0,0,0);var d2=new Date(r.due_date);d2.setHours(0,0,0,0);return c2.getTime()===d2.getTime();});
      else if(drillFilter==='late')dRows=dRows.filter(function(r){if(r.status!=='completed'||!r.completed_at||!r.due_date)return false;var c2=new Date(r.completed_at);c2.setHours(0,0,0,0);return c2>new Date(r.due_date);});
      drillData={stat:stat,rows:dRows};
    }
  }

  function daysDiff(d1,d2){return Math.round((new Date(d1)-new Date(d2))/(1000*60*60*24));}
  var SC_STATUS={pending:'#94a3b8',in_progress:'#f59e0b',under_review:'#8b5cf6',completed:'#22c55e'};
  var FY_MONTHS=[4,5,6,7,8,9,10,11,12,1,2,3];
  var MONTH_SHORT=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Monthly breakdown data
  var monthlyData=FY_MONTHS.map(function(mo){
    var moWS=worksheets.filter(function(ws){return ws.period_month===mo;});
    var moWSIds=moWS.map(function(w){return w.id;});
    var moRows=allRows.filter(function(r){return moWSIds.includes(r.worksheet_id);});
    var byWT={};
    workTypeNames.forEach(function(wt){
      var wtWsIds=(wsGrouped[wt]||[]).map(function(w){return w.id;});
      var wtMoRows=moRows.filter(function(r){return wtWsIds.includes(r.worksheet_id);});
      var done=wtMoRows.filter(function(r){return r.status==='completed';}).length;
      byWT[wt]={done:done,total:wtMoRows.length};
    });
    var totalDone=moRows.filter(function(r){return r.status==='completed';}).length;
    return{month:mo,label:MONTH_SHORT[mo],byWT:byWT,done:totalDone,total:moRows.length};
  });

  // Client breakdown data
  var clientStats=clients.map(function(cl){
    var clRows=filteredRows.filter(function(r){return r.client_id===cl.id;});
    var done=clRows.filter(function(r){return r.status==='completed';}).length;
    var byWT={};
    workTypeNames.forEach(function(wt){
      var wtWsIds=(wsGrouped[wt]||[]).map(function(w){return w.id;});
      var wtClRows=clRows.filter(function(r){return wtWsIds.includes(r.worksheet_id);});
      var wtDone=wtClRows.filter(function(r){return r.status==='completed';}).length;
      byWT[wt]={done:wtDone,total:wtClRows.length};
    });
    return{id:cl.id,name:cl.name,pan:cl.pan,done:done,total:clRows.length,pct:clRows.length>0?Math.round(done/clRows.length*100):100,byWT:byWT};
  }).filter(function(c){return c.total>0;}).sort(function(a,b){return a.pct-b.pct;});

  // Overdue data
  var overdueRows=filteredRows.filter(function(r){return r.status!=='completed'&&r.due_date&&new Date(r.due_date)<today;}).map(function(r){
    var ws=filteredWS.find(function(w){return w.id===r.worksheet_id;});
    return Object.assign({},r,{work_type:ws?ws.work_type:'',period_label:ws?ws.period_label:'',daysOverdue:Math.abs(daysDiff(today,r.due_date))});
  }).sort(function(a,b){return b.daysOverdue-a.daysOverdue;});

  var TAB_BTN=function(id,label,count){
    var active=activeTab===id;
    return<button key={id} onClick={function(){setActiveTab(id);setDrillType(null);}} style={{padding:'7px 16px',border:'none',borderBottom:active?'2px solid #6b8cad':'2px solid transparent',background:'none',color:active?'#6b8cad':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:active?700:500,whiteSpace:'nowrap'}}>{label}{count!=null&&<span style={{fontSize:10,marginLeft:4,opacity:0.7}}>({count})</span>}</button>;
  };

  return<div style={{padding:'0 0 60px'}}>
    {/* Header */}
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
      <div>
        <h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Analytics Dashboard</h2>
        <div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>FY {selectedYear}-{String(selectedYear+1).slice(2)}</div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <select value={filterMonth} onChange={function(e){setFilterMonth(Number(e.target.value));}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'6px 10px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
          <option value={0}>All Months</option>
          {FY_MONTHS.map(function(mo){return<option key={mo} value={mo}>{MONTH_SHORT[mo]}</option>;})}
        </select>
        <select value={selectedYear} onChange={function(e){setSelectedYear(Number(e.target.value));setDrillType(null);}} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'6px 10px',color:'var(--tf-text)',fontSize:12,cursor:'pointer',outline:'none'}}>
          {[2022,2023,2024,2025,2026,2027].map(function(y){return<option key={y} value={y}>FY {y}-{String(y+1).slice(2)}</option>;})}
        </select>
      </div>
    </div>

    {/* Tab bar */}
    <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--tf-border)',marginBottom:16,overflowX:'auto'}}>
      {TAB_BTN('overview','Overview',null)}
      {TAB_BTN('monthly','Monthly',null)}
      {TAB_BTN('clients','Clients',clientStats.length)}
      {TAB_BTN('overdue','Overdue',overdueRows.length)}
    </div>

    {loading?<div style={{textAlign:'center',padding:48,color:'var(--tf-text-sub)'}}>Loading analytics...</div>:
    workTypeStats.length===0&&activeTab==='overview'?<div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:12,padding:'40px 24px',textAlign:'center'}}>
      <div style={{fontWeight:700,fontSize:15,color:'var(--tf-text)',marginBottom:6}}>No worksheet data</div>
      <div style={{fontSize:13,color:'var(--tf-text-sub)'}}>Create worksheets in the Worksheets tab to see analytics here.</div>
    </div>:<>

    {/* ── OVERVIEW TAB ── */}
    {activeTab==='overview'&&<>
      {/* KPI Row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:20}}>
        {[{label:'Total Tasks',value:totals.total,color:'var(--tf-text)'},{label:'Completed',value:totalPct+'%',color:'#22c55e'},{label:'Pending',value:totals.pending,color:'#94a3b8'},{label:'Overdue',value:totals.overdue,color:'#ef4444'}].map(function(k){
          return<div key={k.label} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:800,color:k.color}}>{k.value}</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:2}}>{k.label}</div>
          </div>;
        })}
      </div>
      {/* Work type cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12,marginBottom:24}}>
        {workTypeStats.map(function(s){
          var pct=s.total>0?Math.round(s.completed/s.total*100):0;
          var isActive=drillType===s.wt;
          return<div key={s.wt} onClick={function(){setDrillType(isActive?null:s.wt);setDrillFilter('all');}}
            style={{background:isActive?'rgba(107,140,173,0.08)':'var(--tf-surface)',border:'1px solid',borderColor:isActive?'#6b8cad':'var(--tf-border)',borderRadius:12,padding:'16px 18px',cursor:'pointer',transition:'all 0.15s'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <span style={{fontWeight:700,fontSize:14,color:'var(--tf-text)'}}>{s.wt}</span>
              <span style={{fontSize:20,fontWeight:800,color:pct===100?'#22c55e':pct>50?'#6b8cad':'#94a3b8'}}>{pct}%</span>
            </div>
            <div style={{background:'var(--tf-border)',borderRadius:99,height:6,marginBottom:10,overflow:'hidden'}}>
              <div style={{width:pct+'%',height:'100%',background:pct===100?'#22c55e':'#6b8cad',transition:'width 0.3s',borderRadius:99}}/>
            </div>
            <div style={{display:'flex',gap:12,fontSize:11}}>
              <span style={{color:'#22c55e'}}><b>{s.completed}</b> done</span>
              <span style={{color:'#94a3b8'}}><b>{s.pending}</b> pending</span>
              {s.overdue>0&&<span style={{color:'#ef4444'}}><b>{s.overdue}</b> overdue</span>}
            </div>
            {(s.early>0||s.ontime>0||s.late>0)&&<div style={{display:'flex',gap:10,fontSize:10,marginTop:6,color:'var(--tf-text-sub)'}}>
              {s.early>0&&<span style={{color:'#22c55e'}}>{s.early} early</span>}
              {s.ontime>0&&<span style={{color:'#6b8cad'}}>{s.ontime} on-time</span>}
              {s.late>0&&<span style={{color:'#ef4444'}}>{s.late} late</span>}
            </div>}
          </div>;
        })}
      </div>
      {/* Drill-down */}
      {drillData&&<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <div style={{fontWeight:700,fontSize:15,color:'var(--tf-text)'}}>{drillType} — Detail</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {[{id:'all',label:'All',count:drillData.stat.total},{id:'pending',label:'Pending',count:drillData.stat.pending},{id:'completed',label:'Completed',count:drillData.stat.completed},{id:'overdue',label:'Overdue',count:drillData.stat.overdue},{id:'early',label:'Early',count:drillData.stat.early},{id:'ontime',label:'On-time',count:drillData.stat.ontime},{id:'late',label:'Late',count:drillData.stat.late}].filter(function(f){return f.id==='all'||f.count>0;}).map(function(f){
              var active=drillFilter===f.id;
              return<button key={f.id} onClick={function(){setDrillFilter(f.id);}}
                style={{padding:'4px 10px',borderRadius:20,border:'1px solid',borderColor:active?'#6b8cad':'var(--tf-border)',background:active?'rgba(107,140,173,0.12)':'transparent',color:active?'#6b8cad':'var(--tf-text-sub)',fontSize:11,fontWeight:active?700:500,cursor:'pointer'}}>
                {f.label} ({f.count})
              </button>;
            })}
          </div>
        </div>
        {drillData.rows.length===0?<div style={{padding:'24px 18px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>No matching records</div>:
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'rgba(107,140,173,0.04)'}}>
            <th style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Client</th>
            <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Status</th>
            <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Due Date</th>
            <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Completed</th>
            <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Timing</th>
          </tr></thead>
          <tbody>
            {drillData.rows.map(function(row,ri){
              var client=clientMap[row.client_id];if(!client)return null;
              var isCompleted=row.status==='completed';
              var isOverdue=!isCompleted&&row.due_date&&new Date(row.due_date)<today;
              var timing='',timingColor='var(--tf-text-sub)';
              if(isCompleted&&row.completed_at&&row.due_date){var diff=daysDiff(row.completed_at,row.due_date);if(diff<0){timing=Math.abs(diff)+'d early';timingColor='#22c55e';}else if(diff===0){timing='On time';timingColor='#6b8cad';}else{timing=diff+'d late';timingColor='#ef4444';}}
              else if(isOverdue){timing=Math.abs(daysDiff(today,row.due_date))+'d overdue';timingColor='#ef4444';}
              return<tr key={row.id} style={{borderBottom:'1px solid var(--tf-border)',background:ri%2?'rgba(107,140,173,0.02)':'transparent'}}>
                <td style={{padding:'9px 14px'}}><div style={{fontWeight:600,color:'var(--tf-text)',fontSize:13}}>{client.name}{row.due_label&&row.due_label!=='Due'&&<span style={{fontSize:9,color:'#6b8cad',marginLeft:4}}>({row.due_label})</span>}</div>{client.pan&&<div style={{fontSize:10,fontFamily:'monospace',color:'var(--tf-text-sub)'}}>{client.pan}</div>}</td>
                <td style={{padding:'9px 10px',textAlign:'center'}}><span style={{fontSize:11,fontWeight:700,color:SC_STATUS[row.status||'pending'],textTransform:'capitalize'}}>{(row.status||'pending').replace('_',' ')}</span></td>
                <td style={{padding:'9px 10px',textAlign:'center',fontSize:12,color:isOverdue?'#ef4444':'var(--tf-text-sub)'}}>{row.due_date?new Date(row.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
                <td style={{padding:'9px 10px',textAlign:'center',fontSize:12,color:'var(--tf-text-sub)'}}>{row.completed_at?new Date(row.completed_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
                <td style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:600,color:timingColor}}>{timing||'—'}</td>
              </tr>;
            })}
          </tbody>
        </table></div>}
      </div>}
    </>}

    {/* ── MONTHLY TAB ── */}
    {activeTab==='monthly'&&<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--tf-border)',fontWeight:700,fontSize:15,color:'var(--tf-text)'}}>Monthly Breakdown — FY {selectedYear}-{String(selectedYear+1).slice(2)}</div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{background:'rgba(107,140,173,0.04)'}}>
          <th style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',position:'sticky',left:0,background:'var(--tf-surface)',zIndex:1}}>Month</th>
          {workTypeNames.map(function(wt){return<th key={wt} style={{padding:'9px 10px',textAlign:'center',fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap'}}>{wt}</th>;})}
          <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Total</th>
        </tr></thead>
        <tbody>
          {monthlyData.map(function(md,mi){
            var mPct=md.total>0?Math.round(md.done/md.total*100):null;
            return<tr key={md.month} style={{borderBottom:'1px solid var(--tf-border)',background:mi%2?'rgba(107,140,173,0.02)':'transparent'}}>
              <td style={{padding:'9px 14px',fontWeight:700,color:'var(--tf-text)',position:'sticky',left:0,background:mi%2?'rgba(107,140,173,0.02)':'var(--tf-surface)',zIndex:1}}>{md.label}</td>
              {workTypeNames.map(function(wt){
                var cell=md.byWT[wt]||{done:0,total:0};
                var cp=cell.total>0?Math.round(cell.done/cell.total*100):null;
                var bg=cp===null?'transparent':cp>=80?'rgba(34,197,94,0.08)':cp>=50?'rgba(245,158,11,0.08)':'rgba(239,68,68,0.06)';
                var clr=cp===null?'var(--tf-text-sub)':cp>=80?'#22c55e':cp>=50?'#f59e0b':'#ef4444';
                return<td key={wt} style={{padding:'9px 10px',textAlign:'center',background:bg}}>
                  {cell.total>0?<div><span style={{fontWeight:700,color:clr}}>{cell.done}/{cell.total}</span><div style={{fontSize:9,color:clr}}>{cp}%</div></div>:<span style={{color:'var(--tf-text-sub)',fontSize:10}}>—</span>}
                </td>;
              })}
              <td style={{padding:'9px 10px',textAlign:'center',fontWeight:700,color:mPct!=null?(mPct>=80?'#22c55e':mPct>=50?'#f59e0b':'#ef4444'):'var(--tf-text-sub)'}}>
                {md.total>0?md.done+'/'+md.total+' ('+mPct+'%)':'—'}
              </td>
            </tr>;
          })}
        </tbody>
      </table></div>
    </div>}

    {/* ── CLIENTS TAB ── */}
    {activeTab==='clients'&&<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--tf-border)',fontWeight:700,fontSize:15,color:'var(--tf-text)'}}>Client-wise Report ({clientStats.length} clients)</div>
      {clientStats.length===0?<div style={{padding:'24px 18px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>No client data for this period.</div>:
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{background:'rgba(107,140,173,0.04)'}}>
          <th style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',position:'sticky',left:0,background:'var(--tf-surface)',zIndex:1}}>Client</th>
          {workTypeNames.map(function(wt){return<th key={wt} style={{padding:'9px 10px',textAlign:'center',fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)',whiteSpace:'nowrap'}}>{wt}</th>;})}
          <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Overall</th>
        </tr></thead>
        <tbody>
          {clientStats.map(function(cl,ci){
            return<tr key={cl.id} style={{borderBottom:'1px solid var(--tf-border)',background:ci%2?'rgba(107,140,173,0.02)':'transparent'}}>
              <td style={{padding:'9px 14px',position:'sticky',left:0,background:ci%2?'rgba(107,140,173,0.02)':'var(--tf-surface)',zIndex:1}}>
                <div style={{fontWeight:600,color:'var(--tf-text)',fontSize:12}}>{cl.name}</div>
                {cl.pan&&<div style={{fontSize:9,fontFamily:'monospace',color:'var(--tf-text-sub)'}}>{cl.pan}</div>}
              </td>
              {workTypeNames.map(function(wt){
                var cell=cl.byWT[wt]||{done:0,total:0};
                var cp=cell.total>0?Math.round(cell.done/cell.total*100):null;
                var clr=cp===null?'var(--tf-text-sub)':cp>=80?'#22c55e':cp>=50?'#f59e0b':'#ef4444';
                return<td key={wt} style={{padding:'9px 10px',textAlign:'center'}}>
                  {cell.total>0?<span style={{fontWeight:600,color:clr}}>{cell.done}/{cell.total}</span>:<span style={{color:'var(--tf-text-sub)',fontSize:10}}>—</span>}
                </td>;
              })}
              <td style={{padding:'9px 10px',textAlign:'center'}}>
                <span style={{fontWeight:700,color:cl.pct>=80?'#22c55e':cl.pct>=50?'#f59e0b':'#ef4444'}}>{cl.pct}%</span>
                <div style={{fontSize:9,color:'var(--tf-text-sub)'}}>{cl.done}/{cl.total}</div>
              </td>
            </tr>;
          })}
        </tbody>
      </table></div>}
    </div>}

    {/* ── OVERDUE TAB ── */}
    {activeTab==='overdue'&&<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontWeight:700,fontSize:15,color:'var(--tf-text)'}}>Overdue Tasks</div>
        <span style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',fontWeight:700,fontSize:12,padding:'3px 10px',borderRadius:20}}>{overdueRows.length} overdue</span>
      </div>
      {overdueRows.length===0?<div style={{padding:'24px 18px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>No overdue tasks. Great job!</div>:
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{background:'rgba(107,140,173,0.04)'}}>
          <th style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Client</th>
          <th style={{padding:'9px 10px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Work Type</th>
          <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Period</th>
          <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Due Date</th>
          <th style={{padding:'9px 10px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',borderBottom:'1px solid var(--tf-border)'}}>Days Overdue</th>
        </tr></thead>
        <tbody>
          {overdueRows.map(function(row,ri){
            var client=clientMap[row.client_id];if(!client)return null;
            return<tr key={row.id} style={{borderBottom:'1px solid var(--tf-border)',background:ri%2?'rgba(107,140,173,0.02)':'transparent'}}>
              <td style={{padding:'9px 14px'}}><div style={{fontWeight:600,color:'var(--tf-text)',fontSize:12}}>{client.name}</div>{client.pan&&<div style={{fontSize:9,fontFamily:'monospace',color:'var(--tf-text-sub)'}}>{client.pan}</div>}</td>
              <td style={{padding:'9px 10px',fontSize:12,color:'var(--tf-text)'}}>{row.work_type}{row.due_label&&row.due_label!=='Due'&&<span style={{fontSize:9,color:'#6b8cad',marginLeft:4}}>({row.due_label})</span>}</td>
              <td style={{padding:'9px 10px',textAlign:'center',fontSize:12,color:'var(--tf-text-sub)'}}>{row.period_label||'—'}</td>
              <td style={{padding:'9px 10px',textAlign:'center',fontSize:12,color:'#ef4444'}}>{row.due_date?new Date(row.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
              <td style={{padding:'9px 10px',textAlign:'center'}}><span style={{fontWeight:700,color:'#ef4444',fontSize:13}}>{row.daysOverdue}d</span></td>
            </tr>;
          })}
        </tbody>
      </table></div>}
    </div>}

    </>}
  </div>;
}

// ══════════════════════════════════════════════════════════════════
// CALENDAR VIEW
// ══════════════════════════════════════════════════════════════════

function CalendarView({orgs,supabase,cu,showMineToggle}){
  var orgIds=useMemo(function(){return(orgs||[]).map(function(o){return o.id;});},[orgs]);
  var orgIdKey=orgIds.join(',');
  var orgMap={};(orgs||[]).forEach(function(o){orgMap[o.id]=o;});
  var [calYear,setCalYear]=useState(new Date().getFullYear());
  var [calMonth,setCalMonth]=useState(new Date().getMonth()); // 0-indexed
  var [rows,setRows]=useState([]);
  var [worksheets,setWorksheets]=useState([]);
  var [clients,setClients]=useState([]);
  var [loading,setLoading]=useState(true);
  var [selectedDay,setSelectedDay]=useState(null); // day number or null
  var [mineOnly,setMineOnly]=useState(!!showMineToggle); // personalized: show only tasks where current user is assigned/reviewer

  var today=new Date();today.setHours(0,0,0,0);
  var isCurrentMonth=calYear===today.getFullYear()&&calMonth===today.getMonth();

  useEffect(function(){if(orgIds.length>0)loadCalData();},[orgIdKey,calYear,calMonth]);

  async function loadCalData(){
    setLoading(true);
    // Date range for visible month (use local date formatting, not toISOString which converts to UTC)
    var startStr=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-01';
    var lastDay=new Date(calYear,calMonth+1,0).getDate();
    var endStr=calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');

    var rc=await supabase.from('clients').select('id,name,display_name,pan,org_id').in('org_id',orgIds).limit(2000);
    setClients(rc.data||[]);

    var rr=await supabase.from('worksheet_rows')
      .select('id,worksheet_id,client_id,org_id,status,due_date,due_label,completed_at,data')
      .in('org_id',orgIds)
      .gte('due_date',startStr)
      .lte('due_date',endStr)
      .limit(2000);
    var rowData=rr.data||[];
    setRows(rowData);

    if(rowData.length>0){
      var wsIds=[...new Set(rowData.map(function(r){return r.worksheet_id;}))];
      var rw=await supabase.from('worksheets').select('id,work_type,period_label').in('id',wsIds).limit(500);
      setWorksheets(rw.data||[]);
    }else{setWorksheets([]);}
    setLoading(false);
  }

  var clientMap={};
  clients.forEach(function(c){clientMap[c.id]=c;});
  var wsMap={};
  worksheets.forEach(function(w){wsMap[w.id]=w;});

  // Build calendar grid
  var firstDay=new Date(calYear,calMonth,1);
  var lastDay=new Date(calYear,calMonth+1,0);
  var daysInMonth=lastDay.getDate();
  var startWeekday=(firstDay.getDay()+6)%7; // Mon=0
  var weeks=[];
  var dayNum=1-startWeekday;
  for(var w=0;w<6;w++){
    var week=[];
    for(var d=0;d<7;d++){
      if(dayNum>=1&&dayNum<=daysInMonth)week.push(dayNum);
      else week.push(null);
      dayNum++;
    }
    if(week.every(function(x){return x===null;}))break;
    weeks.push(week);
  }

  // Personalized filter: keep only rows where current user is involved (assignee or any hierarchy level)
  var visibleRows=mineOnly?rows.filter(function(r){
    var d=r.data||{};
    if(d.__assignee===cu.id)return true;
    var ks=Object.keys(d);
    for(var ki=0;ki<ks.length;ki++){if(ks[ki].indexOf('__h_')===0&&d[ks[ki]]===cu.id)return true;}
    return false;
  }):rows;

  // Group rows by day
  var dayRows={};
  visibleRows.forEach(function(r){
    if(!r.due_date)return;
    var d=new Date(r.due_date).getDate();
    if(!dayRows[d])dayRows[d]=[];
    dayRows[d].push(r);
  });

  function prevMonth(){
    if(calMonth===0){setCalYear(calYear-1);setCalMonth(11);}
    else setCalMonth(calMonth-1);
    setSelectedDay(null);
  }
  function nextMonth(){
    if(calMonth===11){setCalYear(calYear+1);setCalMonth(0);}
    else setCalMonth(calMonth+1);
    setSelectedDay(null);
  }
  function goToday(){
    setCalYear(today.getFullYear());setCalMonth(today.getMonth());setSelectedDay(null);
  }

  var MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAY_HEADERS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var SC_STATUS={pending:'#94a3b8',in_progress:'#f59e0b',under_review:'#8b5cf6',completed:'#22c55e'};

  // Detail panel data
  var detailRows=selectedDay&&dayRows[selectedDay]?dayRows[selectedDay]:[];
  // Group by worktype
  var detailGrouped={};
  detailRows.forEach(function(r){
    var ws=wsMap[r.worksheet_id];
    var wt=ws?ws.work_type:'Unknown';
    if(!detailGrouped[wt])detailGrouped[wt]=[];
    detailGrouped[wt].push(r);
  });

  async function quickUpdateStatus(rowId,newStatus){
    var updates={status:newStatus};
    if(newStatus==='completed'){updates.completed_at=new Date().toISOString();}
    else{updates.completed_at=null;}
    await supabase.from('worksheet_rows').update(updates).eq('id',rowId);
    setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,updates):r;});});
  }

  // Compute which FY the current calendar month belongs to
  var fyStart=calMonth>=3?calYear:calYear-1; // Apr+ = same year, Jan-Mar = prev year
  var fyLabel='FY '+fyStart+'-'+String(fyStart+1).slice(2);

  return<div style={{padding:'0 0 60px'}}>
    {/* Header */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
      <div>
        <h2 style={{fontSize:20,fontWeight:800,color:'var(--tf-text)',margin:0}}>Calendar</h2>
        <div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>Due dates and workload · {fyLabel}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        {showMineToggle&&<button onClick={function(){setMineOnly(!mineOnly);setSelectedDay(null);}} title="Show only tasks assigned to you" style={{background:mineOnly?'rgba(99,102,241,0.12)':'var(--tf-surface)',border:'1px solid',borderColor:mineOnly?'#6366f1':'var(--tf-border)',borderRadius:7,padding:'5px 12px',color:mineOnly?'#6366f1':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:700}}>{mineOnly?'✓ Mine Only':'Mine Only'}</button>}
        <button onClick={prevMonth} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'6px 10px',color:'var(--tf-text)',cursor:'pointer',fontSize:14,fontWeight:700}}>‹</button>
        <div style={{fontSize:15,fontWeight:700,color:'var(--tf-text)',minWidth:160,textAlign:'center'}}>{MONTH_NAMES[calMonth]} {calYear}</div>
        <button onClick={nextMonth} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:7,padding:'6px 10px',color:'var(--tf-text)',cursor:'pointer',fontSize:14,fontWeight:700}}>›</button>
        {!isCurrentMonth&&<button onClick={goToday} style={{background:'rgba(107,140,173,0.1)',border:'1px solid rgba(107,140,173,0.25)',borderRadius:7,padding:'5px 12px',color:'#6b8cad',cursor:'pointer',fontSize:12,fontWeight:600}}>Today</button>}
      </div>
    </div>

    {loading?<div style={{textAlign:'center',padding:48,color:'var(--tf-text-sub)'}}>Loading calendar...</div>:
    <div style={{display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
      {/* Calendar Grid */}
      <div style={{flex:'1 1 500px',minWidth:320}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,background:'var(--tf-border)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
          {/* Day headers */}
          {DAY_HEADERS.map(function(dh){
            return<div key={dh} style={{padding:'8px 4px',textAlign:'center',fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',background:'var(--tf-surface)'}}>
              {dh}
            </div>;
          })}
          {/* Day cells */}
          {weeks.map(function(week,wi){
            return week.map(function(day,di){
              if(day===null)return<div key={wi+'-'+di} style={{background:'var(--tf-bg)',minHeight:80}}/>;
              var isToday=isCurrentMonth&&day===today.getDate();
              var isSelected=selectedDay===day;
              var dRows=dayRows[day]||[];
              var count=dRows.length;
              var completedCount=dRows.filter(function(r){return r.status==='completed';}).length;
              var overdueCount=dRows.filter(function(r){return r.status!=='completed'&&r.due_date&&new Date(r.due_date)<today;}).length;
              var pendingCount=count-completedCount;
              // Heatmap intensity
              var intensity=Math.min(count/10,1);
              var bgColor='var(--tf-bg)';
              if(count>0){
                if(overdueCount>0)bgColor='rgba(239,68,68,'+(.04+intensity*.08)+')';
                else if(completedCount===count)bgColor='rgba(34,197,94,'+(.04+intensity*.06)+')';
                else bgColor='rgba(107,140,173,'+(.03+intensity*.07)+')';
              }
              return<div key={wi+'-'+di} onClick={function(){setSelectedDay(isSelected?null:day);}}
                style={{background:bgColor,minHeight:80,padding:'4px 6px',cursor:'pointer',position:'relative',border:isSelected?'2px solid #6b8cad':isToday?'2px solid rgba(107,140,173,0.5)':'2px solid transparent',transition:'all 0.12s'}}>
                <div style={{fontSize:12,fontWeight:isToday?800:600,color:isToday?'#6b8cad':'var(--tf-text)',marginBottom:2}}>
                  {day}
                </div>
                {count>0&&<div style={{display:'flex',flexDirection:'column',gap:2}}>
                  {count<=3?dRows.slice(0,3).map(function(r,idx){
                    var client=clientMap[r.client_id];
                    var color=r.status==='completed'?'#22c55e':overdueCount>0&&r.status!=='completed'?'#ef4444':'#6b8cad';
                    return<div key={idx} style={{fontSize:9,color:color,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.3}}>
                      {client?client.name.split(' ')[0]:'?'}
                    </div>;
                  }):
                  <div style={{display:'flex',flexDirection:'column',gap:1}}>
                    <div style={{fontSize:10,fontWeight:700,color:overdueCount>0?'#ef4444':'#6b8cad'}}>{count} due</div>
                    <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                      {completedCount>0&&<span style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',display:'inline-block'}}/>}
                      {pendingCount>0&&<span style={{width:6,height:6,borderRadius:'50%',background:overdueCount>0?'#ef4444':'#94a3b8',display:'inline-block'}}/>}
                    </div>
                  </div>}
                </div>}
              </div>;
            });
          })}
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:14,marginTop:10,fontSize:11,color:'var(--tf-text-sub)'}}>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:3,background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)'}}/> All done</span>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:3,background:'rgba(107,140,173,0.12)',border:'1px solid rgba(107,140,173,0.3)'}}/> Pending</span>
          <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:3,background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)'}}/> Overdue</span>
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDay!==null&&<div style={{flex:'0 0 320px',minWidth:280,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden',maxHeight:'calc(100vh - 240px)',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:'var(--tf-text)'}}>{selectedDay} {MONTH_NAMES[calMonth]} {calYear}</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:2}}>{detailRows.length} item{detailRows.length!==1?'s':''} due</div>
          </div>
          <button onClick={function(){setSelectedDay(null);}} style={{background:'none',border:'none',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
        </div>
        <div style={{overflowY:'auto',flex:1,padding:'0 0 8px'}}>
          {detailRows.length===0?<div style={{padding:'24px 16px',textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>No items due on this day</div>:
          Object.keys(detailGrouped).map(function(wt){
            return<div key={wt}>
              <div style={{padding:'10px 16px 4px',fontSize:11,fontWeight:700,color:'#6b8cad',textTransform:'uppercase',letterSpacing:.05}}>{wt}</div>
              {detailGrouped[wt].map(function(row){
                var client=clientMap[row.client_id];
                if(!client)return null;
                var ws=wsMap[row.worksheet_id];
                var periodStr=ws?ws.period_label:'';
                var isCompleted=row.status==='completed';
                var isOverdue=!isCompleted&&row.due_date&&new Date(row.due_date)<today;
                return<div key={row.id} style={{padding:'8px 16px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,color:'var(--tf-text)',fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{client.name}{row.due_label&&row.due_label!=='Due'&&<span style={{fontSize:9,fontWeight:600,color:'#6b8cad',marginLeft:4}}>({row.due_label})</span>}</div>
                    {periodStr&&<div style={{fontSize:9,color:'var(--tf-text-sub)',marginTop:1}}>Period: {periodStr}{row.due_label&&row.due_label!=='Due'?' · '+row.due_label:''}</div>}
                    {client.pan&&<div style={{fontSize:9,fontFamily:'monospace',color:'var(--tf-text-sub)'}}>{client.pan}</div>}
                    {isCompleted&&row.completed_at&&<div style={{fontSize:9,color:'#22c55e',marginTop:1}}>Done {new Date(row.completed_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>}
                    {isOverdue&&<div style={{fontSize:9,color:'#ef4444',fontWeight:600,marginTop:1}}>Overdue</div>}
                  </div>
                  <select value={row.status||'pending'} onChange={function(e){quickUpdateStatus(row.id,e.target.value);}}
                    style={{background:'transparent',border:'1px solid',borderColor:SC_STATUS[row.status||'pending'],borderRadius:20,padding:'2px 6px',color:SC_STATUS[row.status||'pending'],fontSize:10,fontWeight:700,cursor:'pointer',outline:'none',textTransform:'capitalize',flexShrink:0}}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="under_review">Under Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>;
              })}
            </div>;
          })}
        </div>
      </div>}
    </div>}
  </div>;
}

// ── Your Dashboard Module — personalised works + calendar sidebar ───
function YourDashboardModule({org,supabase,cu,workflowHierarchy,workTypeConfigs,onOpenWorkType}){
  var [rows,setRows]=useState([]);
  var [clients,setClients]=useState([]);
  var [allClients,setAllClients]=useState([]); // all org clients (for Create Task dropdown)
  var [worksheets,setWorksheets]=useState([]);
  var [orgMembers,setOrgMembers]=useState([]);
  var [loading,setLoading]=useState(true);
  var [filter,setFilter]=useState('all');
  var [showCalendar,setShowCalendar]=useState(true);
  // Create Task modal state
  var [showCreate,setShowCreate]=useState(false);
  var [ctClientId,setCtClientId]=useState('');
  var [ctWorkType,setCtWorkType]=useState('');
  var [ctTitle,setCtTitle]=useState('');
  var [ctDesc,setCtDesc]=useState('');
  var [ctPriority,setCtPriority]=useState('medium');
  var [ctDueDate,setCtDueDate]=useState('');
  var [ctContact,setCtContact]=useState('');
  var [ctHierarchy,setCtHierarchy]=useState({});
  var [ctChecklist,setCtChecklist]=useState([]);
  var [ctSaving,setCtSaving]=useState(false);
  var [toast,setToast]=useState(null);
  var wfHierarchy=workflowHierarchy||[];
  var activeConfigs=(workTypeConfigs||[]).filter(function(c){return c.is_active;});
  var hierarchyCols=wfHierarchy.length>0?wfHierarchy.map(function(h){return{key:'__h_'+h.key,label:h.label};}):[{key:'__assignee',label:'Assignee'}];

  function showToast(msg,kind){setToast({msg:msg,kind:kind||'ok'});setTimeout(function(){setToast(null);},2400);}

  useEffect(function(){load();/* eslint-disable-next-line */},[org.id,cu.id]);

  async function load(){
    setLoading(true);
    var rr=await supabase.from('worksheet_rows').select('id,worksheet_id,client_id,org_id,status,due_date,due_label,completed_at,data,comments').eq('org_id',org.id).neq('status','completed').limit(3000);
    var rowData=rr.data||[];
    var myRows=rowData.filter(function(r){
      var d=r.data||{};
      if(d.__assignee===cu.id)return true;
      var keys=Object.keys(d);
      for(var i=0;i<keys.length;i++){if(keys[i].indexOf('__h_')===0&&d[keys[i]]===cu.id)return true;}
      return false;
    });
    setRows(myRows);
    // Load all clients of this org (for task creation dropdown + row display)
    var rcAll=await supabase.from('clients').select('id,name,display_name,pan').eq('org_id',org.id).order('name').limit(2000);
    setAllClients(rcAll.data||[]);
    setClients(rcAll.data||[]);
    // Load worksheets referenced by my rows
    if(myRows.length>0){
      var wsIds=Array.from(new Set(myRows.map(function(r){return r.worksheet_id;}).filter(Boolean)));
      var rw=await supabase.from('worksheets').select('id,work_type,period_label').in('id',wsIds).limit(500);
      setWorksheets(rw.data||[]);
    }else{setWorksheets([]);}
    // Load org members (for hierarchy dropdowns in Create Task form)
    var rm=await supabase.from('organization_members').select('user_id,role').eq('org_id',org.id).limit(200);
    var mlist=rm.data||[];
    if(mlist.length>0){
      var ids=mlist.map(function(m){return m.user_id;});
      var rp=await supabase.from('profiles').select('id,name,email').in('id',ids).limit(200);
      setOrgMembers(rp.data||[]);
    }
    setLoading(false);
  }

  var clientMap={};clients.forEach(function(c){clientMap[c.id]=c;});
  var wsMap={};worksheets.forEach(function(w){wsMap[w.id]=w;});

  var today=new Date();today.setHours(0,0,0,0);
  var todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

  function getRole(r){
    var d=r.data||{};
    if(wfHierarchy.length>0){
      for(var i=0;i<wfHierarchy.length;i++){var k='__h_'+wfHierarchy[i].key;if(d[k]===cu.id)return{level:i,label:wfHierarchy[i].label};}
    }
    if(d.__assignee===cu.id)return{level:0,label:'Assignee'};
    return{level:-1,label:'Involved'};
  }

  var stats={
    total:rows.length,
    today:rows.filter(function(r){return r.due_date===todayStr;}).length,
    overdue:rows.filter(function(r){return r.due_date&&r.due_date<todayStr;}).length,
    review:rows.filter(function(r){var role=getRole(r);return role.label.toLowerCase().indexOf('review')>=0||r.status==='under_review';}).length,
  };

  var filteredRows=rows.filter(function(r){
    var role=getRole(r);
    var isReview=role.label.toLowerCase().indexOf('review')>=0||r.status==='under_review';
    if(filter==='assigned')return !isReview;
    if(filter==='review')return isReview;
    if(filter==='overdue')return r.due_date&&r.due_date<todayStr;
    if(filter==='today')return r.due_date===todayStr;
    return true;
  });

  var grouped={};
  filteredRows.forEach(function(r){
    var ws=wsMap[r.worksheet_id];
    var wt=ws?ws.work_type:'Unknown';
    if(!grouped[wt])grouped[wt]=[];
    grouped[wt].push(r);
  });
  Object.keys(grouped).forEach(function(k){grouped[k].sort(function(a,b){if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date<b.due_date?-1:1;});});

  async function updateStatus(rowId,newStatus){
    var updates={status:newStatus};
    if(newStatus==='completed')updates.completed_at=new Date().toISOString();
    else updates.completed_at=null;
    await supabase.from('worksheet_rows').update(updates).eq('id',rowId);
    if(newStatus==='completed'){
      setRows(function(prev){return prev.filter(function(r){return r.id!==rowId;});});
    }else{
      setRows(function(prev){return prev.map(function(r){return r.id===rowId?Object.assign({},r,updates):r;});});
    }
  }

  var SC={pending:'#94a3b8',in_progress:'#f59e0b',under_review:'#8b5cf6',completed:'#22c55e'};

  function resetCreateForm(){setCtClientId('');setCtWorkType('');setCtTitle('');setCtDesc('');setCtPriority('medium');setCtDueDate('');setCtContact('');setCtHierarchy({});setCtChecklist([]);setShowCreate(false);}

  // Resolve (find or create) a worksheet for the chosen work type. If wtName is empty,
  // returns the Unclassified worksheet for this org (creates if missing).
  async function resolveWorksheet(wtName){
    var cfg=wtName?activeConfigs.find(function(c){return c.name===wtName;}):null;
    var freq=cfg?cfg.frequency:'once';
    var effectiveName=wtName||'Unclassified';
    var p=getCurrentPeriod(freq);
    var label=getPeriodLabel(freq,p.year,p.month,p.quarter);
    var rw=await supabase.from('worksheets').select('*').eq('org_id',org.id).eq('work_type',effectiveName).eq('period_label',label).maybeSingle();
    if(rw.data)return rw.data;
    var ins=await supabase.from('worksheets').insert({
      org_id:org.id,work_type:effectiveName,period_label:label,
      period_year:p.year,
      period_month:freq==='monthly'?p.month:null,
      period_quarter:freq==='quarterly'?p.quarter:null,
      frequency:freq,created_by:cu.id
    }).select().single();
    return ins.data;
  }

  async function submitCreateTask(){
    if(!ctClientId){showToast('Please select a client','err');return;}
    setCtSaving(true);
    try{
      var ws=await resolveWorksheet(ctWorkType);
      if(!ws){showToast('Failed to create worksheet','err');setCtSaving(false);return;}
      var rowData={};
      var hKeys=Object.keys(ctHierarchy);
      for(var hi=0;hi<hKeys.length;hi++){if(ctHierarchy[hKeys[hi]])rowData[hKeys[hi]]=ctHierarchy[hKeys[hi]];}
      // Back-compat assignee
      if(hierarchyCols.length>0&&rowData[hierarchyCols[0].key])rowData.__assignee=rowData[hierarchyCols[0].key];
      // Auto-assign creator if nobody picked — so it shows up in their dashboard
      var anyAssigned=Object.keys(rowData).length>0;
      if(!anyAssigned){
        rowData[hierarchyCols[0].key]=cu.id;
        rowData.__assignee=cu.id;
      }
      if(ctTitle.trim())rowData.__title=ctTitle.trim();
      if(ctDesc.trim())rowData.__description=ctDesc.trim();
      if(ctPriority)rowData.__priority=ctPriority;
      if(ctContact.trim())rowData.__contact=ctContact.trim();
      var validChecklist=ctChecklist.filter(function(c){return c.text&&c.text.trim();});
      if(validChecklist.length>0)rowData.__checklist=validChecklist;
      var newRow={worksheet_id:ws.id,client_id:ctClientId,org_id:org.id,data:rowData,due_date:ctDueDate||null,due_label:ctTitle.trim()||(ctWorkType?'Task':'Unclassified'),status:'pending'};
      var ins=await supabase.from('worksheet_rows').insert(newRow).select().single();
      if(ins.error||!ins.data){showToast('Failed to create task','err');setCtSaving(false);return;}
      showToast('Task created!');
      resetCreateForm();
      await load();
    }catch(e){showToast('Error: '+(e.message||'unknown'),'err');}
    setCtSaving(false);
  }

  // Classify an unclassified row: move it to the chosen work type's worksheet
  async function classifyRow(row,newWorkType){
    if(!newWorkType)return;
    var ws=await resolveWorksheet(newWorkType);
    if(!ws){showToast('Failed to resolve worksheet','err');return;}
    var res=await supabase.from('worksheet_rows').update({worksheet_id:ws.id}).eq('id',row.id);
    if(res.error){showToast('Failed to classify','err');return;}
    showToast('Task classified as '+newWorkType);
    await load();
  }

  // Greeting
  var displayName=(cu&&cu.user_metadata&&cu.user_metadata.full_name)||(cu&&cu.email?cu.email.split('@')[0]:'')||'there';
  var firstName=displayName.split(' ')[0];
  var hr=new Date().getHours();
  var greet=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';

  if(loading)return<div style={{textAlign:'center',padding:48,color:'var(--tf-text-sub)'}}>Loading your dashboard...</div>;

  return<div style={{padding:'0 0 60px'}}>
    {/* Greeting header */}
    <div style={{marginBottom:20,display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
      <div>
        <div style={{fontSize:11,fontWeight:700,color:'#6b8cad',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{greet}</div>
        <h2 style={{fontSize:24,fontWeight:800,color:'var(--tf-text)',margin:0,letterSpacing:'-0.02em'}}>Hey, {firstName}! <span style={{fontSize:18}}>👋</span></h2>
        <div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>Your personal dashboard for <b style={{color:'var(--tf-text)'}}>{org.name}</b></div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <button onClick={function(){setShowCreate(true);}} style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',border:'none',borderRadius:8,padding:'8px 16px',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:6,boxShadow:'0 4px 14px rgba(34,197,94,0.25)'}}>
          <span style={{fontSize:14}}>+</span>Create Task
        </button>
        <button onClick={function(){setShowCalendar(!showCalendar);}} style={{background:showCalendar?'rgba(99,102,241,0.12)':'var(--tf-surface)',border:'1px solid',borderColor:showCalendar?'#6366f1':'var(--tf-border)',borderRadius:8,padding:'7px 14px',color:showCalendar?'#6366f1':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:6}}>
          <span>📅</span>{showCalendar?'Hide Calendar':'Show Calendar'}
        </button>
      </div>
    </div>

    {/* KPI tiles */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:22}}>
      {[
        {id:'all',label:'Total Active',count:stats.total,color:'#6b8cad'},
        {id:'today',label:'Due Today',count:stats.today,color:'#f59e0b'},
        {id:'overdue',label:'Overdue',count:stats.overdue,color:'#ef4444'},
        {id:'review',label:'For Review',count:stats.review,color:'#8b5cf6'},
      ].map(function(k){
        var active=filter===k.id;
        return<button key={k.id} onClick={function(){setFilter(k.id);}}
          style={{textAlign:'left',padding:'14px 16px',background:active?'rgba(107,140,173,0.08)':'var(--tf-surface)',border:'1px solid',borderColor:active?k.color:'var(--tf-border)',borderRadius:12,cursor:'pointer',fontFamily:'inherit',transition:'all 0.14s'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{k.label}</div>
          <div style={{fontSize:26,fontWeight:800,color:k.color,lineHeight:1}}>{k.count}</div>
        </button>;
      })}
    </div>

    {/* Main content + Calendar sidebar */}
    <div style={{display:'flex',gap:18,alignItems:'flex-start',flexWrap:'wrap'}}>
      {/* Your Works */}
      <div style={{flex:'1 1 560px',minWidth:320}}>
        <div style={{fontSize:12,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Your Works</div>
        {filteredRows.length===0?<div style={{textAlign:'center',padding:48,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,color:'var(--tf-text-sub)'}}>
          <div style={{fontSize:40,marginBottom:10}}>✓</div>
          <div style={{fontSize:15,fontWeight:700,color:'var(--tf-text)',marginBottom:4}}>Nothing to do here</div>
          <div style={{fontSize:12}}>{filter==='all'?'No tasks assigned to you.':'No tasks match this filter.'}</div>
        </div>:
        <div>
          {Object.keys(grouped).sort(function(a,b){
            // Put Unclassified at the top so it's easy to triage
            if(a==='Unclassified')return -1;
            if(b==='Unclassified')return 1;
            return a<b?-1:1;
          }).map(function(wt){
            var isUnclassified=wt==='Unclassified';
            return<div key={wt} style={{marginBottom:18}}>
              <button onClick={function(){if(onOpenWorkType&&!isUnclassified)onOpenWorkType(wt);}}
                title={isUnclassified?"Unclassified tasks — classify them below to move to a work type":"Open "+wt+" worksheet with only my clients"}
                style={{width:'100%',textAlign:'left',background:'none',border:'none',padding:'0 0 8px 2px',cursor:(onOpenWorkType&&!isUnclassified)?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,color:isUnclassified?'#f59e0b':'#6b8cad',fontFamily:'inherit'}}
                onMouseEnter={function(e){if(onOpenWorkType&&!isUnclassified)e.currentTarget.style.color='#4a7a9b';}}
                onMouseLeave={function(e){e.currentTarget.style.color=isUnclassified?'#f59e0b':'#6b8cad';}}>
                <span style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.06em'}}>{isUnclassified?'🏷 Unclassified':wt} · {grouped[wt].length}</span>
                {onOpenWorkType&&!isUnclassified&&<span style={{fontSize:10,fontWeight:700,opacity:0.7}}>Open worksheet →</span>}
              </button>
              <div style={{background:'var(--tf-surface)',border:'1px solid',borderColor:isUnclassified?'rgba(245,158,11,0.4)':'var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
                {grouped[wt].map(function(row,idx){
                  var client=clientMap[row.client_id];
                  var ws=wsMap[row.worksheet_id];
                  var role=getRole(row);
                  var isOverdue=row.due_date&&row.due_date<todayStr;
                  var isToday=row.due_date===todayStr;
                  var isReview=role.label.toLowerCase().indexOf('review')>=0;
                  var rowTitle=(row.data&&row.data.__title)||'';
                  return<div key={row.id} style={{padding:'12px 16px',borderTop:idx===0?'none':'1px solid var(--tf-border)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)',marginBottom:3}}>
                        {client?(client.display_name||client.name):'Unknown'}
                        {rowTitle&&<span style={{fontSize:11,color:'var(--tf-text-sub)',marginLeft:6,fontWeight:600}}>· {rowTitle}</span>}
                        {!rowTitle&&row.due_label&&row.due_label!=='Due'&&<span style={{fontSize:10,color:'#6b8cad',marginLeft:6,fontWeight:600}}>· {row.due_label}</span>}
                      </div>
                      <div style={{fontSize:10,color:'var(--tf-text-sub)',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                        {ws&&<span>{ws.period_label}</span>}
                        <span style={{color:isReview?'#8b5cf6':'#6b8cad',fontWeight:700,background:isReview?'rgba(139,92,246,0.1)':'rgba(107,140,173,0.1)',padding:'1px 7px',borderRadius:10}}>{role.label}</span>
                      </div>
                    </div>
                    {row.due_date&&<div style={{fontSize:11,fontWeight:700,color:isOverdue?'#ef4444':isToday?'#f59e0b':'var(--tf-text-sub)',flexShrink:0}}>
                      {isOverdue?'Overdue · ':isToday?'Today · ':''}
                      {new Date(row.due_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}
                    </div>}
                    {isUnclassified&&activeConfigs.length>0&&
                      <select value="" onChange={function(e){if(e.target.value)classifyRow(row,e.target.value);}}
                        title="Classify this task into a work type"
                        style={{background:'var(--tf-bg)',border:'1px solid #f59e0b',borderRadius:6,padding:'4px 8px',color:'#f59e0b',fontSize:10,fontWeight:700,cursor:'pointer',outline:'none',flexShrink:0}}>
                        <option value="">Classify →</option>
                        {activeConfigs.map(function(c){return<option key={c.id} value={c.name}>{c.name}</option>;})}
                      </select>
                    }
                    <select value={row.status||'pending'} onChange={function(e){updateStatus(row.id,e.target.value);}}
                      style={{background:'transparent',border:'1px solid',borderColor:SC[row.status||'pending'],borderRadius:20,padding:'3px 9px',color:SC[row.status||'pending'],fontSize:11,fontWeight:700,cursor:'pointer',outline:'none',textTransform:'capitalize',flexShrink:0}}>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="under_review">Under Review</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>;
                })}
              </div>
            </div>;
          })}
        </div>}
      </div>

      {/* Right-side Calendar */}
      {showCalendar&&<div style={{flex:'0 0 360px',minWidth:300,position:'sticky',top:8}}>
        <div style={{fontSize:12,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Your Calendar</div>
        <MiniCalendar rows={rows} clientMap={clientMap} wsMap={wsMap}/>
      </div>}
    </div>

    {/* Toast */}
    {toast&&<div style={{position:'fixed',bottom:24,right:24,background:toast.kind==='err'?'#ef4444':'#22c55e',color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,fontWeight:700,boxShadow:'0 10px 30px rgba(0,0,0,0.2)',zIndex:1000}}>{toast.msg}</div>}

    {/* Create Task Modal */}
    {showCreate&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:999,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'40px 16px',overflowY:'auto'}} onClick={function(e){if(e.target===e.currentTarget)resetCreateForm();}}>
      <div style={{background:'var(--tf-bg)',border:'1px solid var(--tf-border)',borderRadius:14,width:'100%',maxWidth:640,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        {/* Header */}
        <div style={{padding:'18px 22px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
          <div>
            <div style={{fontSize:10,fontWeight:800,color:'#22c55e',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>New Task</div>
            <h3 style={{margin:0,fontSize:18,fontWeight:800,color:'var(--tf-text)'}}>Create Input Task</h3>
          </div>
          <button onClick={resetCreateForm} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,width:32,height:32,color:'var(--tf-text-sub)',cursor:'pointer',fontSize:16,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>

        {/* Body */}
        <div style={{padding:'18px 22px',display:'flex',flexDirection:'column',gap:14}}>
          {/* Client + Work Type row */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Client *</label>
              <select value={ctClientId} onChange={function(e){setCtClientId(e.target.value);}}
                style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none'}}>
                <option value="">— Select a client —</option>
                {allClients.map(function(c){return<option key={c.id} value={c.id}>{c.display_name||c.name}{c.pan?' ('+c.pan+')':''}</option>;})}
              </select>
            </div>
            <div>
              <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Work Type</label>
              <select value={ctWorkType} onChange={function(e){setCtWorkType(e.target.value);}}
                style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none'}}>
                <option value="">— Unclassified (classify later) —</option>
                {activeConfigs.map(function(c){return<option key={c.id} value={c.name}>{c.name}</option>;})}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Task Title</label>
            <input type="text" value={ctTitle} onChange={function(e){setCtTitle(e.target.value);}} placeholder="e.g., Scrutiny Notice reply"
              style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>

          {/* Description */}
          <div>
            <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Description</label>
            <textarea value={ctDesc} onChange={function(e){setCtDesc(e.target.value);}} rows={3} placeholder="Add any details, context or instructions…"
              style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}/>
          </div>

          {/* Hierarchy assignees */}
          <div>
            <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Assign To</label>
            <div style={{display:'grid',gridTemplateColumns:hierarchyCols.length>1?'repeat(auto-fit,minmax(180px,1fr))':'1fr',gap:8}}>
              {hierarchyCols.map(function(h){
                return<div key={h.key}>
                  <div style={{fontSize:10,color:'var(--tf-text-sub)',fontWeight:600,marginBottom:3}}>{h.label}</div>
                  <select value={ctHierarchy[h.key]||''} onChange={function(e){var v=e.target.value;setCtHierarchy(function(p){var n=Object.assign({},p);if(v)n[h.key]=v;else delete n[h.key];return n;});}}
                    style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'8px 10px',color:'var(--tf-text)',fontSize:12,outline:'none'}}>
                    <option value="">— Unassigned —</option>
                    {orgMembers.map(function(m){return<option key={m.id} value={m.id}>{m.name||m.email}</option>;})}
                  </select>
                </div>;
              })}
            </div>
            <div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:5,fontStyle:'italic'}}>Leave all blank to auto-assign yourself.</div>
          </div>

          {/* Priority + Due Date row */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Priority</label>
              <select value={ctPriority} onChange={function(e){setCtPriority(e.target.value);}}
                style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none'}}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Due Date</label>
              <input type="date" value={ctDueDate} onChange={function(e){setCtDueDate(e.target.value);}}
                style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
            </div>
          </div>

          {/* Contact Person */}
          <div>
            <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Contact Person</label>
            <input type="text" value={ctContact} onChange={function(e){setCtContact(e.target.value);}} placeholder="e.g., Mr. Sharma (+91 98xxx xxxxx)"
              style={{width:'100%',background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 10px',color:'var(--tf-text)',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>

          {/* Checklist */}
          <div>
            <label style={{display:'block',fontSize:10,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Checklist</label>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {ctChecklist.map(function(item,idx){
                return<div key={idx} style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input type="text" value={item.text} onChange={function(e){var v=e.target.value;setCtChecklist(function(p){return p.map(function(x,i){return i===idx?Object.assign({},x,{text:v}):x;});});}} placeholder={"Item "+(idx+1)}
                    style={{flex:1,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'7px 10px',color:'var(--tf-text)',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  <button onClick={function(){setCtChecklist(function(p){return p.filter(function(_,i){return i!==idx;});});}}
                    style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,width:32,height:32,color:'#ef4444',cursor:'pointer',fontSize:14,fontWeight:700,flexShrink:0}}>×</button>
                </div>;
              })}
              <button onClick={function(){setCtChecklist(function(p){return[...p,{text:'',done:false}];});}}
                style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:8,padding:'8px 10px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'}}>+ Add checklist item</button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'14px 22px',borderTop:'1px solid var(--tf-border)',display:'flex',justifyContent:'flex-end',gap:8}}>
          <button onClick={resetCreateForm} disabled={ctSaving}
            style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'9px 16px',color:'var(--tf-text)',cursor:ctSaving?'not-allowed':'pointer',fontSize:12,fontWeight:700}}>Cancel</button>
          <button onClick={submitCreateTask} disabled={ctSaving||!ctClientId}
            style={{background:(ctSaving||!ctClientId)?'var(--tf-surface)':'linear-gradient(135deg,#22c55e,#16a34a)',border:'1px solid',borderColor:(ctSaving||!ctClientId)?'var(--tf-border)':'#16a34a',borderRadius:8,padding:'9px 18px',color:(ctSaving||!ctClientId)?'var(--tf-text-sub)':'#fff',cursor:(ctSaving||!ctClientId)?'not-allowed':'pointer',fontSize:12,fontWeight:800,boxShadow:(ctSaving||!ctClientId)?'none':'0 4px 14px rgba(34,197,94,0.25)'}}>
            {ctSaving?'Creating…':'Create Task'}
          </button>
        </div>
      </div>
    </div>}
  </div>;
}

// ── Mini Calendar — compact month grid with task dots ──────────────
function MiniCalendar({rows,clientMap,wsMap}){
  var now=new Date();
  var [year,setYear]=useState(now.getFullYear());
  var [month,setMonth]=useState(now.getMonth());
  var [selDay,setSelDay]=useState(null);

  var today=new Date();today.setHours(0,0,0,0);
  var isCurrentMonth=year===today.getFullYear()&&month===today.getMonth();

  var firstDay=new Date(year,month,1);
  var lastDayD=new Date(year,month+1,0);
  var daysInMonth=lastDayD.getDate();
  var startWeekday=(firstDay.getDay()+6)%7; // Mon=0

  var weeks=[];var dayNum=1-startWeekday;
  for(var w=0;w<6;w++){var week=[];for(var d=0;d<7;d++){if(dayNum>=1&&dayNum<=daysInMonth)week.push(dayNum);else week.push(null);dayNum++;}if(week.every(function(x){return x===null;}))break;weeks.push(week);}

  // Group rows visible in this month by day
  var monthStart=year+'-'+String(month+1).padStart(2,'0')+'-01';
  var monthEnd=year+'-'+String(month+1).padStart(2,'0')+'-'+String(daysInMonth).padStart(2,'0');
  var monthRows=(rows||[]).filter(function(r){return r.due_date&&r.due_date>=monthStart&&r.due_date<=monthEnd;});
  var dayRows={};
  monthRows.forEach(function(r){var d=new Date(r.due_date).getDate();if(!dayRows[d])dayRows[d]=[];dayRows[d].push(r);});

  var MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAY_HDR=['M','T','W','T','F','S','S'];

  function prev(){if(month===0){setYear(year-1);setMonth(11);}else setMonth(month-1);setSelDay(null);}
  function next(){if(month===11){setYear(year+1);setMonth(0);}else setMonth(month+1);setSelDay(null);}

  var detailRows=selDay&&dayRows[selDay]?dayRows[selDay]:[];

  return<div style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:12,overflow:'hidden'}}>
    {/* Header */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderBottom:'1px solid var(--tf-border)'}}>
      <button onClick={prev} style={{background:'var(--tf-bg)',border:'1px solid var(--tf-border)',borderRadius:6,padding:'2px 8px',color:'var(--tf-text)',cursor:'pointer',fontSize:12,fontWeight:700}}>‹</button>
      <div style={{fontSize:12,fontWeight:800,color:'var(--tf-text)'}}>{MONTH_NAMES[month]} {year}</div>
      <button onClick={next} style={{background:'var(--tf-bg)',border:'1px solid var(--tf-border)',borderRadius:6,padding:'2px 8px',color:'var(--tf-text)',cursor:'pointer',fontSize:12,fontWeight:700}}>›</button>
    </div>
    {/* Grid */}
    <div style={{padding:'8px 8px 10px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
        {DAY_HDR.map(function(h,i){return<div key={i} style={{textAlign:'center',fontSize:9,fontWeight:700,color:'var(--tf-text-sub)',padding:'2px 0'}}>{h}</div>;})}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
        {weeks.map(function(wk,wi){return wk.map(function(day,di){
          if(day===null)return<div key={wi+'-'+di}/>;
          var isToday=isCurrentMonth&&day===today.getDate();
          var isSel=selDay===day;
          var dRows=dayRows[day]||[];
          var cnt=dRows.length;
          var hasOverdue=dRows.some(function(r){return r.due_date&&r.due_date<(today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'))&&r.status!=='completed';});
          var dotColor=hasOverdue?'#ef4444':cnt>0?'#6366f1':'transparent';
          return<button key={wi+'-'+di} onClick={function(){setSelDay(isSel?null:day);}}
            style={{aspectRatio:'1',background:isSel?'rgba(99,102,241,0.15)':'transparent',border:isSel?'1px solid #6366f1':isToday?'1px solid rgba(99,102,241,0.4)':'1px solid transparent',borderRadius:6,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:2,fontFamily:'inherit',position:'relative'}}>
            <div style={{fontSize:11,fontWeight:isToday?800:600,color:isToday?'#6366f1':'var(--tf-text)'}}>{day}</div>
            {cnt>0&&<div style={{position:'absolute',bottom:2,left:0,right:0,display:'flex',justifyContent:'center',gap:2}}>
              <div style={{width:4,height:4,borderRadius:'50%',background:dotColor}}/>
              {cnt>1&&<div style={{width:4,height:4,borderRadius:'50%',background:dotColor}}/>}
              {cnt>2&&<div style={{width:4,height:4,borderRadius:'50%',background:dotColor}}/>}
            </div>}
          </button>;
        });})}
      </div>
    </div>
    {/* Day detail */}
    {selDay&&<div style={{borderTop:'1px solid var(--tf-border)',padding:'10px 12px',maxHeight:260,overflowY:'auto'}}>
      <div style={{fontSize:11,fontWeight:800,color:'var(--tf-text)',marginBottom:6}}>{selDay} {MONTH_NAMES[month]} · {detailRows.length} task{detailRows.length!==1?'s':''}</div>
      {detailRows.length===0?<div style={{fontSize:11,color:'var(--tf-text-sub)',fontStyle:'italic'}}>No tasks on this day.</div>:
      detailRows.map(function(r){
        var client=clientMap[r.client_id];
        var ws=wsMap[r.worksheet_id];
        return<div key={r.id} style={{padding:'6px 0',borderBottom:'1px solid var(--tf-border)',fontSize:11}}>
          <div style={{fontWeight:700,color:'var(--tf-text)'}}>{client?(client.display_name||client.name):'Unknown'}</div>
          <div style={{fontSize:10,color:'var(--tf-text-sub)',marginTop:1}}>{ws?ws.work_type:''} {ws&&ws.period_label?'· '+ws.period_label:''}</div>
        </div>;
      })}
    </div>}
  </div>;
}

// ── Module Placeholder (HR / Billing — coming soon) ────────────────
function ModulePlaceholder({moduleLabel,activeTab,features}){
  var active=features.find(function(f){return f.tab===activeTab;})||features[0];
  return<div style={{padding:'0 0 60px'}}>
    <div style={{background:'var(--tf-surface)',border:'1px dashed var(--tf-border)',borderRadius:14,padding:'36px 28px',textAlign:'center'}}>
      <div style={{fontSize:10,fontWeight:700,color:'#f59e0b',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:20,padding:'4px 12px',display:'inline-block',marginBottom:16,letterSpacing:'0.08em'}}>COMING SOON</div>
      <h2 style={{fontSize:22,fontWeight:800,color:'var(--tf-text)',margin:'0 0 6px'}}>{active.title}</h2>
      <div style={{fontSize:13,color:'var(--tf-text-sub)',maxWidth:460,margin:'0 auto'}}>{active.desc}</div>
    </div>
    <div style={{marginTop:22,fontSize:11,fontWeight:800,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Planned features in the {moduleLabel} module</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
      {features.map(function(f){
        var isActive=f.tab===activeTab;
        return<div key={f.tab} style={{padding:14,background:'var(--tf-surface)',border:'1px solid',borderColor:isActive?'#6b8cad':'var(--tf-border)',borderRadius:10,opacity:isActive?1:0.72}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)',marginBottom:4}}>{f.title}</div>
          <div style={{fontSize:11,color:'var(--tf-text-sub)',lineHeight:1.5}}>{f.desc}</div>
        </div>;
      })}
    </div>
  </div>;
}

// ── Org Dashboard ──────────────────────────────────────────────────
function OrgDashboard({org,supabase,cu,allWorkspaces,onBack}){
  const [orgModule,setOrgModule]=useState(null); // null=launcher | 'dashboard'|'clients'|'analytics'|'hr'|'billing'|'setup'
  const [tab,setTab]=useState('');
  const [workTypeConfigs,setWorkTypeConfigs]=useState([]);
  const [myRole,setMyRole]=useState('member');
  // Worksheet navigation hint (set when user clicks a work type in Your Dashboard)
  const [wsInitWorkType,setWsInitWorkType]=useState(null);
  const [wsInitMineOnly,setWsInitMineOnly]=useState(false);
  const wsCount=(allWorkspaces||[]).filter(function(w){return w.org_id===org.id;}).length;

  useEffect(function(){loadWTC();loadMyRole();/* eslint-disable-next-line */},[org.id]);
  async function loadWTC(){
    var r=await getAllWorkTypeConfigs(org.id);
    setWorkTypeConfigs(r.data||[]);
  }
  async function loadMyRole(){
    if(org.created_by===cu.id){setMyRole('owner');return;}
    var r=await supabase.from('organization_members').select('role').eq('org_id',org.id).eq('user_id',cu.id).maybeSingle();
    if(r.data&&r.data.role)setMyRole(r.data.role);
  }
  var activeConfigs=workTypeConfigs.filter(function(c){return c.is_active;});
  var workTypeNames=activeConfigs.map(function(c){return c.name;});
  var canSeeAnalytics=myRole==='owner'||myRole==='admin'||org.created_by===cu.id;

  var MODULES=[
    {id:'dashboard',label:'Your Dashboard',icon:'⚡',desc:'Your personal works, calendar and everything assigned to you.',gradient:'linear-gradient(135deg,#6366f1,#4f46e5)',tabs:[{id:'home',label:'Home'}]},
    {id:'clients',label:'Clients & Worksheets',icon:'📇',desc:'Client master data and operational worksheets for every work type.',gradient:'linear-gradient(135deg,#6b8cad,#4a7a9b)',tabs:[{id:'clients',label:'Client Master Data'},{id:'worksheets',label:'Worksheets'}]},
  ];
  if(canSeeAnalytics){
    MODULES.push({id:'analytics',label:'Analytics',icon:'📊',desc:'Organisation-wide performance review — for owners and admins.',gradient:'linear-gradient(135deg,#10b981,#059669)',tabs:[{id:'overview',label:'Overview'}],ownerOnly:true});
  }
  MODULES.push(
    {id:'hr',label:'HR',icon:'👥',desc:'Performance, attendance, leaves and activity logs for your team.',gradient:'linear-gradient(135deg,#f59e0b,#d97706)',tabs:[{id:'performance',label:'Performance'},{id:'attendance',label:'Attendance'},{id:'leaves',label:'Leaves'},{id:'logs',label:'Logs'}],soon:true},
    {id:'billing',label:'Billing',icon:'💰',desc:'Client-wise and work-wise invoicing with reusable templates.',gradient:'linear-gradient(135deg,#ec4899,#db2777)',tabs:[{id:'invoices',label:'Invoices'},{id:'templates',label:'Templates'}],soon:true},
    {id:'setup',label:'Setup',icon:'⚙️',desc:'Work types, members and organisation settings.',gradient:'linear-gradient(135deg,#64748b,#475569)',tabs:[{id:'worktypes',label:'Work Types'},{id:'members',label:'Members & Invites'},{id:'settings',label:'Org Settings'}]}
  );

  function openModule(m){setOrgModule(m.id);setTab(m.tabs[0].id);}
  function backToLauncher(){setOrgModule(null);setTab('');setWsInitWorkType(null);setWsInitMineOnly(false);}
  // Called from YourDashboard when a work type header is clicked
  function navigateToWorkType(wt){
    setWsInitWorkType(wt);
    setWsInitMineOnly(true);
    setOrgModule('clients');
    setTab('worksheets');
  }

  var currentModule=orgModule?MODULES.find(function(m){return m.id===orgModule;}):null;
  var showSubTabs=currentModule&&currentModule.tabs&&currentModule.tabs.length>1;

  var header=<div style={{background:'var(--tf-panel)',borderBottom:'1px solid var(--tf-border)',padding:'0 24px',flexShrink:0}}>
    <div style={{display:'flex',alignItems:'center',gap:12,paddingTop:16,paddingBottom:showSubTabs?12:16}}>
      <button onClick={orgModule?backToLauncher:onBack} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:8,padding:'5px 12px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:600}}>&#x2190; {orgModule?'Modules':'Back'}</button>
      <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,fontWeight:700,color:'#fff'}}>{org.name.charAt(0).toUpperCase()}</div>
      <div>
        <div style={{fontSize:16,fontWeight:800,color:'var(--tf-text)',letterSpacing:'-0.02em'}}>
          {org.name}
          {currentModule&&<span style={{color:'var(--tf-text-sub)',fontWeight:500}}> · {currentModule.label}</span>}
        </div>
        <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:1}}>{org.description||wsCount+' workspace'+(wsCount!==1?'s':'')}</div>
      </div>
    </div>
    {showSubTabs&&<div style={{display:'flex',gap:2,overflowX:'auto'}}>
      {currentModule.tabs.map(function(t){
        return<button key={t.id} onClick={function(){setTab(t.id);}}
          style={{padding:'8px 14px',border:'none',borderBottom:tab===t.id?'2px solid #6b8cad':'2px solid transparent',background:'none',color:tab===t.id?'#6b8cad':'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:tab===t.id?700:500,whiteSpace:'nowrap'}}>
          {t.label}
        </button>;
      })}
    </div>}
  </div>;

  // Module launcher view
  if(orgModule===null){
    return<div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>
      {header}
      <div style={{flex:1,overflow:'auto',padding:'28px 24px 60px'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{marginBottom:22}}>
            <div style={{fontSize:22,fontWeight:800,color:'var(--tf-text)',letterSpacing:'-0.02em'}}>Modules</div>
            <div style={{fontSize:13,color:'var(--tf-text-sub)',marginTop:3}}>Pick a module to get focused. Each one groups a specific workflow.</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
            {MODULES.map(function(m){
              return<button key={m.id} onClick={function(){openModule(m);}}
                style={{textAlign:'left',padding:20,background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:14,cursor:'pointer',position:'relative',transition:'transform 0.16s, border-color 0.16s, box-shadow 0.16s',fontFamily:'inherit'}}
                onMouseEnter={function(e){e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.borderColor='#6b8cad';e.currentTarget.style.boxShadow='0 10px 30px rgba(0,0,0,0.12)';}}
                onMouseLeave={function(e){e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.borderColor='var(--tf-border)';e.currentTarget.style.boxShadow='none';}}>
                <div style={{width:48,height:48,borderRadius:12,background:m.gradient,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:14}}>{m.icon}</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--tf-text)',marginBottom:4,display:'flex',alignItems:'center',gap:8}}>
                  {m.label}
                  {m.soon&&<span style={{fontSize:9,fontWeight:700,color:'#f59e0b',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:3,padding:'1px 5px',letterSpacing:'0.06em'}}>PREVIEW</span>}
                </div>
                <div style={{fontSize:12,color:'var(--tf-text-sub)',lineHeight:1.5,marginBottom:m.tabs&&m.tabs.length>1?12:0}}>{m.desc}</div>
                {m.tabs&&m.tabs.length>1&&<div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {m.tabs.map(function(t){return<span key={t.id} style={{fontSize:10,fontWeight:600,color:'var(--tf-text-sub)',background:'var(--tf-bg)',border:'1px solid var(--tf-border)',borderRadius:5,padding:'2px 7px'}}>{t.label}</span>;})}
                </div>}
              </button>;
            })}
          </div>
        </div>
      </div>
    </div>;
  }

  // Module content
  return<div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>
    {header}
    <div style={{flex:1,overflow:'auto',padding:'22px 24px 60px'}}>
      {orgModule==='dashboard'&&<YourDashboardModule org={org} supabase={supabase} cu={cu} workflowHierarchy={org.workflow_hierarchy||[]} workTypeConfigs={activeConfigs} onOpenWorkType={navigateToWorkType}/>}
      {orgModule==='clients'&&tab==='clients'&&<ClientsModule cu={cu} orgId={org.id} supabase={supabase} allWorkspaces={allWorkspaces} workTypeNames={workTypeNames.length>0?workTypeNames:undefined} workTypeConfigs={activeConfigs}/>}
      {orgModule==='clients'&&tab==='worksheets'&&<WorksheetsModule org={org} supabase={supabase} cu={cu} allWorkspaces={allWorkspaces} workTypeConfigs={activeConfigs} workflowHierarchy={org.workflow_hierarchy||[]} initWorkType={wsInitWorkType} initMineOnly={wsInitMineOnly}/>}
      {orgModule==='analytics'&&canSeeAnalytics&&<AnalyticsDashboard org={org} supabase={supabase} cu={cu} workTypeConfigs={activeConfigs}/>}
      {orgModule==='setup'&&tab==='worktypes'&&<WorkTypeConfigPanel org={org} supabase={supabase} cu={cu} workTypeConfigs={workTypeConfigs} onReload={loadWTC}/>}
      {orgModule==='setup'&&tab==='members'&&<OrgMembersPanel org={org} cu={cu} supabase={supabase}/>}
      {orgModule==='setup'&&tab==='settings'&&<OrgSettingsPanel org={org} cu={cu} supabase={supabase} allWorkspaces={allWorkspaces}/>}
      {orgModule==='hr'&&<ModulePlaceholder moduleLabel="HR" activeTab={tab} features={[
        {tab:'performance',title:'Performance',desc:'Track employee KPIs, reviews and goals across review cycles.'},
        {tab:'attendance',title:'Attendance',desc:'Daily check-in / check-out and monthly attendance summaries.'},
        {tab:'leaves',title:'Leaves',desc:'Apply, approve and track leave balances across leave types.'},
        {tab:'logs',title:'Activity Logs',desc:'Employee activity trail and audit logs across the organisation.'},
      ]}/>}
      {orgModule==='billing'&&<ModulePlaceholder moduleLabel="Billing" activeTab={tab} features={[
        {tab:'invoices',title:'Invoices',desc:'Client-wise and work-wise invoicing with automatic totals and taxes.'},
        {tab:'templates',title:'Templates',desc:'Reusable invoice templates for quick creation.'},
      ]}/>}
    </div>
  </div>;
}

export default function App(){
  const [session,setSession]=useState(null)
  const [loading,setLoading]=useState(true)
  const [pendingInvites,setPendingInvites]=useState([])
  const [inviteToken,setInviteToken]=useState(null)
  const initRef=useRef(false);const authIdRef=useRef(null)

  // Check for invite token in URL
  useEffect(()=>{const p=new URLSearchParams(window.location.hash.replace('#','?')||window.location.search);const t=p.get('invite');if(t){setInviteToken(t);window.history.replaceState({},'',window.location.pathname)}},[])

  const handleAuth=async user=>{
    authIdRef.current=user.id
    try{
      await upsertProfile({id:user.id,email:user.email,name:user.user_metadata?.full_name||user.email.split('@')[0],avatar_url:user.user_metadata?.avatar_url||null})
      // If arrived via invite token, accept it using server-side function
      if(inviteToken){
        await acceptInvitationByToken(inviteToken)
        setInviteToken(null)
      }
      // Load pending invitations for this user
      await refreshInvites(user.email)
    }catch(e){console.error(e)}finally{setLoading(false);initRef.current=true}
  }

  const refreshInvites=useCallback(async(email)=>{
    const em=email||session?.user?.email;if(!em)return
    const{data}=await getMyInvitations(em)
    setPendingInvites(data||[])
  },[session?.user?.email])

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);if(session)handleAuth(session.user);else{setLoading(false);initRef.current=true}})
    const{data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      setSession(session)
      if(!session){authIdRef.current=null;setLoading(false);initRef.current=true;return}
      const isNew=authIdRef.current!==session.user.id
      if(event==='TOKEN_REFRESHED')return // don't reset state on silent token refresh
      if(!initRef.current||event==='USER_UPDATED'||(event==='SIGNED_IN'&&isNew))handleAuth(session.user)
    })
    return()=>subscription.unsubscribe()
  },[])

  const onSignOut=async()=>{await signOut();setSession(null);authIdRef.current=null;setPendingInvites([])}

  if(loading)return<div style={{minHeight:'100vh',background:'#0b0f1a',display:'flex',alignItems:'center',justifyContent:'center',color:'#5c6b87',fontFamily:"'DM Sans',system-ui,sans-serif"}}><div style={{textAlign:'center'}}><div style={{width:44,height:44,borderRadius:13,background:'linear-gradient(135deg,#6b8cad,#4a7a9b)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,margin:'0 auto 14px',boxShadow:'0 6px 24px rgba(107,140,173,0.4)'}}>✦</div><div style={{fontSize:13}}>Loading…</div></div></div>
  if(!session)return<AuthScreen inviteToken={inviteToken}/>
  return<ErrorBoundary><TaskFlowApp cu={session.user} allProfiles={[]} onSignOut={onSignOut} pendingInvites={pendingInvites} refreshInvites={()=>refreshInvites(session.user.email)}/></ErrorBoundary>
}
