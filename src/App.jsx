import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  supabase, signInWithGoogle, signOut, upsertProfile,
  getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace, getMemberRole,
  inviteToWorkspace, getWorkspaceInvitations, getMyInvitations,
  getInvitationByToken, acceptInvitation, acceptInvitationByToken, declineInvitation, cancelInvitation,
  getTasks, createTask, updateTask, deleteTask, logActivity
} from './lib/supabase.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = ['Todo','In Progress','Review','Done']
const PRIORITIES = ['Low','Medium','High','Critical']
const RECURRENCE_TYPES = ['none','daily','weekly','monthly','custom']
const PC = {'Low':'#64748b','Medium':'#38bdf8','High':'#fb923c','Critical':'#f87171'}
const PI = {'Low':'','Medium':'','High':'','Critical':'!'}
const WS_COLORS = ['#6b8cad','#ec4899','#10b981','#f59e0b','#06b6d4','#4a7a9b','#ef4444','#3b82f6']
const WS_ICONS  = ['*','#','@','&','+','~','-','=']
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
            <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)'}}>{m.name||m.email}{isSelf?<span style={{fontSize:10,color:'var(--tf-text-sub)',marginLeft:6}}>(You)</span>:''}</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{m.email}</div>
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
        <div style={{fontSize:12,fontWeight:700,color:selected?ac:'var(--tf-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name||m.email.split('@')[0]}{isSelf?' (You)':''}</div>
        <div style={{fontSize:10,color:'var(--tf-text-sub)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>
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
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
        {wsMembers.map(m=><MemberCard key={m.id} m={m} selected={delegatorId===m.id} onClick={()=>setDelegatorId(m.id)} accent='#f59e0b'/>)}
      </div>
      <div style={{background:'rgba(143,165,190,0.06)',border:'1px solid rgba(143,165,190,0.15)',borderRadius:G.radiusMd,padding:'10px 14px',fontSize:11,color:'#8fa5be'}}>
        ℹ This task will appear on <strong>your board</strong> as "Assigned by [Manager]". The manager sees it as a delegated task under their watch.
      </div>
    </>}

    {/* CASE B: Delegate → pick subordinates */}
    {mode==='delegate'&&<>
      <div style={{fontSize:11,fontWeight:700,color:'var(--tf-text-sub)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>
        👥 Select subordinates to assign this task to
      </div>
      <div style={{fontSize:10,color:'var(--tf-text-sub)',marginBottom:10}}>You will be the Manager / Delegator. Selected members will see it on their board.</div>
      {others.length===0
        ?<div style={{padding:20,textAlign:'center',color:'var(--tf-text-mut)',fontSize:12}}>No other members in this workspace</div>
        :<div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
          {others.map(m=><MemberCard key={m.id} m={m} selected={subordinates.includes(m.id)} onClick={()=>toggleSub(m.id)} accent={ws.color}/>)}
        </div>
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
function TaskFormModal({open,onClose,task,ws,wsMembers,cu,statuses,defaultStatus,onSave,onDelete}){
  const titleRef=useRef(),descRef=useRef(),projRef=useRef(),tagsRef=useRef(),dateRef=useRef()
  const [status,setStatus]=useState(defaultStatus||statuses[0]||'Todo')
  const [priority,setPriority]=useState('Medium')
  const [assignees,setAssignees]=useState([])
  const [delegatorId,setDelegatorId]=useState(null)
  const [checklist,setChecklist]=useState([])
  const [rt,setRt]=useState('none');const [ri,setRi]=useState(1)
  const [cdel,setCdel]=useState(false);const isEdit=!!task

  useEffect(()=>{
    if(!open||!cu)return
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
    const title=titleRef.current?.value?.trim();if(!title)return
    const fa=assignees.length>0?assignees:[cu.id]
    const payload={title,description:descRef.current?.value?.trim()||'',project:projRef.current?.value?.trim()||'',tags:(tagsRef.current?.value||'').split(',').map(t=>t.trim()).filter(Boolean),due_date:dateRef.current?.value||null,recurrence_type:rt,recurrence_interval:Math.max(1,Number(ri)||1),status,priority,assignees:fa,assigned_to:fa[0],delegator_id:delegatorId||cu.id,workspace_id:ws.id,created_by:task?.created_by||cu.id,checklist}
    await onSave(isEdit?{...task,...payload}:payload);onClose()
  }
  const F=({label,children,full})=><div style={{marginBottom:16,gridColumn:full?'1/-1':undefined}}><label style={LBL}>{label}</label>{children}</div>

  return<><Modal open={open} onClose={onClose} title={isEdit?'Edit Task':'New Task'} width={660}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 18px'}}>
      <F full label="Title *"><input ref={titleRef} defaultValue={task?.title||''} placeholder="What needs to be done?" style={{...INP,fontSize:15,fontWeight:600}} onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();save()}}}/></F>
      <F full label="Description"><textarea ref={descRef} defaultValue={task?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="Optional details…"/></F>
      <F label="Status"><CustomSelect value={status} onChange={setStatus} options={statuses} style={{width:'100%'}}/></F>
      <F label="Priority"><CustomSelect value={priority} onChange={setPriority} options={PRIORITIES} style={{width:'100%'}}/></F>
      {/* ── DELEGATOR / MANAGER ── */}
      <F full label="⚡ Manager / Delegator">
        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          {wsMembers.map(m=>{const eu=enrich(m);const sel=delegatorId===m.id
            return<div key={m.id} onClick={()=>setDelegatorId(m.id)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:G.radiusMd,cursor:'pointer',
                border:`1.5px solid ${sel?'rgba(245,158,11,0.6)':'var(--tf-border)'}`,
                background:sel?'rgba(245,158,11,0.1)':'var(--tf-surface)',
                transition:G.trans,flex:'0 0 auto'}}>
              <Avatar user={eu} size={26}/>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:sel?'#f59e0b':'var(--tf-text)'}}>
                  {m.name||m.email.split('@')[0]}{m.id===cu.id?' (You)':''}
                </div>
                <div style={{fontSize:10,color:sel?'rgba(245,158,11,0.7)':'var(--tf-text-sub)'}}>
                  {sel?'✓ Manager':m.email}
                </div>
              </div>
            </div>
          })}
        </div>
      </F>
      {/* ── ASSIGNEES ── */}
      <F full label={`✅ Assignee${assignees.length>1?'s':''} (${assignees.length})`}>
        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          {wsMembers.map(m=>{const eu=enrich(m);const sel=assignees.includes(m.id)
            return<div key={m.id} onClick={()=>toggleA(m.id)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:G.radiusMd,cursor:'pointer',
                border:`1.5px solid ${sel?`rgba(${rgb},0.6)`:'var(--tf-border)'}`,
                background:sel?`rgba(${rgb},0.1)`:'var(--tf-surface)',
                transition:G.trans,flex:'0 0 auto'}}>
              <Avatar user={eu} size={26}/>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:sel?ws.color:'var(--tf-text)'}}>
                  {m.name||m.email.split('@')[0]}{m.id===cu.id?' (You)':''}
                </div>
                <div style={{fontSize:10,color:sel?`rgba(${rgb},0.7)`:'var(--tf-text-sub)'}}>
                  {sel?'✓ Assignee':m.email}
                </div>
              </div>
              <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${sel?ws.color:'var(--tf-text-mut)'}`,background:sel?ws.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginLeft:2}}>
                {sel&&<span style={{color:'#fff',fontSize:10,fontWeight:900,lineHeight:1}}>✓</span>}
              </div>
            </div>
          })}
        </div>
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
        <div style={{display:'flex',alignItems:'center',gap:-3}}>
          {mir?<Avatar user={creator} size={20}/>:assigneeUsers.slice(0,4).map((u,i)=><div key={u.id} style={{marginLeft:i?-6:0,zIndex:10-i}}><Avatar user={u} size={20}/></div>)}
          {!mir&&assigneeUsers.length>4&&<div style={{marginLeft:-6,width:20,height:20,borderRadius:'50%',background:'var(--tf-surface-hov)',border:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'var(--tf-text-sub)',fontWeight:700}}>+{assigneeUsers.length-4}</div>}
        </div>
        {task.due_date&&<span style={{fontSize:10,color:ovd?'#ef4444':'var(--tf-text-sub)',fontWeight:ovd?600:400}}>{fmtDate(task.due_date)}</span>}
      </div>
      {/* Hover actions */}
      {!mir&&<div style={{display:'flex',gap:4,marginTop:8,paddingTop:8,borderTop:'1px solid var(--tf-border)',opacity:hov?1:0,transition:'opacity 0.15s',pointerEvents:hov?'auto':'none'}}>
        <Btn onClick={e=>{e.stopPropagation();onEdit(task)}} outline color={acc} sm full>Edit</Btn>
        <Btn onClick={e=>{e.stopPropagation();setCdel(true)}} danger sm full>Delete</Btn>
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
        <Btn onClick={()=>setPreview(null)} outline color="#64748b" full>Back</Btn>
        <Btn onClick={()=>{onImport(preview);onClose();setPreview(null)}} color="#6b8cad" full>Import {preview.length} Tasks</Btn>
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
    {/* Member picker row */}
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'var(--tf-text-sub)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginRight:4}}>Member</span>
      {wsMembers.map(m=>{
        const eu=enrich(m);const sel=m.id===teamMemberId;const isSelf=m.id===cu.id
        const mAll=allT.filter(t=>isOnMyBoard(t,m.id)).length
        return<div key={m.id} onClick={()=>setTeamMemberId(m.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:G.radiusMd,cursor:'pointer',border:`1.5px solid ${sel?`rgba(${rgb},0.5)`:'var(--tf-border)'}`,background:sel?`rgba(${rgb},0.1)`:'var(--tf-surface)',transition:G.trans}}>
          <Avatar user={eu} size={28}/>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:sel?wsColor:'var(--tf-text)'}}>{m.name||m.email.split('@')[0]}{isSelf?' (You)':''}</div>
            <div style={{fontSize:10,color:'var(--tf-text-sub)'}}>{mAll} task{mAll!==1?'s':''}</div>
          </div>
          {sel&&<div style={{width:6,height:6,borderRadius:'50%',background:wsColor,marginLeft:4,boxShadow:`0 0 8px ${wsColor}`}}/>}
        </div>
      })}
    </div>

    {selMem&&<>
      {/* Member header + stats */}
      <div style={{background:'var(--tf-surface)',border:`1px solid rgba(${rgb},0.2)`,borderRadius:G.radius,padding:'18px 22px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <Avatar user={enrich(selMem)} size={52} ring={wsColor}/>
        <div style={{flex:1,minWidth:160}}>
          <div style={{fontSize:18,fontWeight:800,color:'var(--tf-text)',letterSpacing:'-0.02em'}}>{selMem.name||selMem.email}</div>
          <div style={{fontSize:12,color:'var(--tf-text-sub)',marginTop:2}}>{selMem.email}</div>
          <div style={{fontSize:11,color:'#10b981',marginTop:4,fontWeight:600}}>● Workspace member</div>
        </div>
        {/* Stats */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[
            {l:'Total',v:memberAll.length,c:wsColor,f:'all'},
            {l:'Own',v:memberOwn.length,c:'#8fa5be',f:'own'},
            {l:'Assigned',v:memberAssigned.length,c:'#f59e0b',f:'assigned'},
            {l:'Done',v:memberDone.length,c:'#10b981',f:null},
            {l:'Overdue',v:memberOverdue.length,c:'#ef4444',f:null},
          ].map(x=>{
            const xrgb=hexRgb(x.c);const active=filter===x.f
            return<div key={x.l} onClick={x.f?()=>setFilter(f=>f===x.f?'all':x.f):undefined}
              style={{textAlign:'center',background:active?`rgba(${xrgb},0.15)`:'var(--tf-surface)',border:`1px solid ${active?`rgba(${xrgb},0.4)`:'var(--tf-border)'}`,borderRadius:G.radiusMd,padding:'10px 16px',cursor:x.f?'pointer':'default',transition:G.trans,minWidth:60}}>
              <div style={{fontSize:22,fontWeight:800,color:x.c,lineHeight:1}}>{x.v}</div>
              <div style={{fontSize:10,color:active?x.c:'var(--tf-text-sub)',fontWeight:700,marginTop:3,textTransform:'uppercase',letterSpacing:'0.06em'}}>{x.l}</div>
            </div>
          })}
        </div>
      </div>

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
  const [lightMode,setLightMode]=useState(()=>localStorage.getItem('tf-light')==='1')
  const userMenuRef=useRef();const wsMenuRef=useRef()

  useEffect(()=>{localStorage.setItem('tf-light',lightMode?'1':'0')},[lightMode])

  const showToast=useCallback((msg,type='ok')=>{setToastData({msg,type});setTimeout(()=>setToastData(null),4000)},[])
  const activeWs=workspaces.find(w=>w.id===activeWsId)||null
  const wsColor=activeWs?.color||'#6b8cad';const statuses=activeWs?.custom_statuses||DEFAULT_STATUSES;const SC=scMap(statuses)
  const wsRgb=hexRgb(wsColor)

  useEffect(()=>{setTeamMemberId(null);setView('board')},[activeWsId])
  useEffect(()=>{if(view==='team'&&!teamMemberId){const o=wsMembers.find(m=>m.id!==cu.id);setTeamMemberId(o?.id||null)}},[view,wsMembers,teamMemberId,cu.id])
  useEffect(()=>{const h=e=>{if(userMenuRef.current&&!userMenuRef.current.contains(e.target))setShowUserMenu(false);if(wsMenuRef.current&&!wsMenuRef.current.contains(e.target))setShowWsMenu(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])

  const loadWS=useCallback(async(forceWsId)=>{try{const{data}=await getMyWorkspaces(cu.id);setWorkspaces(data||[]);if(forceWsId){setActiveWsId(forceWsId)}else if(data?.length>0&&!activeWsId){setActiveWsId(data[0].id)}}catch(e){console.error(e)}finally{setLoading(false)}},[cu.id,activeWsId])
  useEffect(()=>{loadWS()},[cu.id])

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

  const openNew=s=>{setCreateStatus(s||statuses[0]);setEditTask(null)}
  const bf=t=>{if(fPriority&&t.priority!==fPriority)return false;if(search&&!t.title.toLowerCase().includes(search.toLowerCase()))return false;return true}
  const myTasks=tasks.filter(t=>bf(t)&&isOnMyBoard(t,cu.id)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  const allT=tasks.filter(bf).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  const recT=tasks.filter(t=>t.recurrence_type&&t.recurrence_type!=='none')
  const curUser=enrich(cu)
  const views=[{id:'board',label:'My Board',icon:''},{id:'team',label:'Team',icon:''},{id:'recurring',label:'Recurring',icon:'[R]'},{id:'list',label:'All Tasks',icon:''},{id:'dashboard',label:'Dashboard',icon:''}]

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
      <div style={{width:1,height:16,background:'var(--tf-border)',marginRight:3,flexShrink:0}}/>
      <div style={{display:'flex',alignItems:'center',gap:2,overflowX:'auto',flex:1,scrollbarWidth:'none'}}>
        {workspaces.map(ws=>{const active=ws.id===activeWsId;const wrgb=hexRgb(ws.color);return<button key={ws.id} onClick={()=>{setActiveWsId(ws.id);setSearch('');setFPriority('')}} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:G.radiusSm,border:`1px solid ${active?`rgba(${wrgb},0.3)`:'transparent'}`,background:active?`rgba(${wrgb},0.1)`:'transparent',color:active?ws.color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontWeight:active?600:400,transition:G.trans,whiteSpace:'nowrap',fontFamily:G.font,flexShrink:0}} onMouseEnter={e=>{if(!active){e.currentTarget.style.background='var(--tf-surface-hov)';e.currentTarget.style.color='var(--tf-text)'}}} onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--tf-text-sub)'}}}><span>{ws.icon}</span>{ws.name}</button>})}
        <button onClick={()=>setWsForm('new')} style={{width:24,height:24,borderRadius:G.radiusSm,border:'1px dashed var(--tf-border)',background:'transparent',color:'var(--tf-text-mut)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',transition:G.trans,fontFamily:G.font,flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#6b8cad';e.currentTarget.style.color='#6b8cad'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--tf-border)';e.currentTarget.style.color='var(--tf-text-mut)'}}>+</button>
      </div>
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
            ...(myRole==='owner'?[{label:'Delete workspace',icon:'🗑',action:()=>{setDelWs(activeWs);setShowWsMenu(false)},danger:true}]:[{label:'Leave workspace',icon:'🚪',action:()=>{if(window.confirm('Leave this workspace?'))leaveWs();setShowWsMenu(false)},danger:true}])
          ].map((item,i)=><button key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',color:item.danger?'#ef4444':'var(--tf-text)',fontSize:13,textAlign:'left',fontFamily:G.font,transition:G.transSnap}} onMouseEnter={e=>e.currentTarget.style.background='var(--tf-surface-hov)'} onMouseLeave={e=>e.currentTarget.style.background='none'}><span style={{fontSize:14}}>{item.icon}</span>{item.label}</button>)}
        </div>}
      </div>}
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
      ?<div style={{flex:1,padding:'28px 32px',position:'relative',zIndex:1,overflowY:'auto'}}>
        {/* Pending invites banner on home screen */}
        <InviteBanner invites={pendingInvites} onAccept={acceptInv} onDecline={declineInv}/>
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
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)'}}>Team Workload</div>
                  {(myRole==='owner'||myRole==='admin')&&<button onClick={()=>setShowMembers(true)} style={{background:'none',border:'none',color:'#8fa5be',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:G.font}}>+ Invite</button>}
                </div>
                {wsMembers.map(m=>{const a=tasks.filter(t=>getAssignees(t).includes(m.id)&&t.created_by!==m.id).length;const o=tasks.filter(t=>t.created_by===m.id&&!getAssignees(t).some(id=>id!==m.id)).length;return<div key={m.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><Avatar user={enrich(m)} size={26}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:'var(--tf-text)'}}>{m.name?.split(' ')[0]||m.email}</div><div style={{display:'flex',gap:8}}><span style={{fontSize:10,color:'#8fa5be'}}>{a} assigned</span><span style={{fontSize:10,color:'var(--tf-text-mut)'}}>·</span><span style={{fontSize:10,color:'var(--tf-text-sub)'}}>{o} own</span></div></div></div>})}
              </div>
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
    <Confirm open={!!delWs} icon="⚠️" title="Delete workspace?" body={`Delete "${delWs?.name}" and all tasks?`} confirmLabel="Delete" onConfirm={()=>delWsHandler(delWs?.id)} onCancel={()=>setDelWs(null)}/>
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
