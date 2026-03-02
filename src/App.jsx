import { useState, useEffect, useRef, useCallback } from 'react'
import * as supabaseApi from './lib/supabase.js'

const { supabase, signInWithGoogle, signOut, submitAccessRequest, checkAccessStatus,
  getAccessRequests, approveRequest, denyRequest, removeUserFromAllWorkspaces, upsertProfile,
  getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace,
  getTasks, createTask, updateTask, deleteTask,
  logActivity = async () => ({ error: null }) } = supabaseApi

// ─── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = ['Todo','In Progress','Review','Done']
const PRIORITIES       = ['Low','Medium','High','Critical']
const RECURRENCE_TYPES = ['none','daily','weekly','monthly','custom']
const PC  = {'Low':'#6b7280','Medium':'#3b82f6','High':'#f59e0b','Critical':'#ef4444'}
const PI  = {'Low':'↓','Medium':'→','High':'↑','Critical':'⚡'}
const WS_COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#06b6d4','#8b5cf6','#ef4444','#3b82f6']
const WS_ICONS  = ['⬡','◈','◉','⊛','◆','▲','●','■']
const SCPAL     = ['#6b7280','#6366f1','#f59e0b','#10b981','#ec4899','#06b6d4','#8b5cf6','#ef4444','#3b82f6','#84cc16']

// ─── Dual Theme System ────────────────────────────────────────────────────────
// MODERN = glassmorphism, blur, ambient glow, smooth curves
// CLASSIC = solid dark, sharp, no blur (original look)
const T = {
  modern: {
    name:'modern',
    bgApp:   '#05080f',
    bgRail:  'rgba(5,8,18,0.97)',
    bgSide:  'rgba(6,10,22,0.93)',
    bgTop:   'rgba(5,8,18,0.85)',
    bgCard:  'rgba(10,16,36,0.82)',
    bgCardH: 'rgba(14,22,50,0.96)',
    bgInput: 'rgba(8,14,32,0.9)',
    bgModal: 'rgba(5,9,22,0.98)',
    bgTag:   'rgba(255,255,255,0.05)',
    border:  'rgba(255,255,255,0.08)',
    borderH: (c) => `${c}55`,
    text:    '#eef2ff',
    textSub: '#64748b',
    textMut: '#2a3850',
    radius:  '16px',
    radiusSm:'10px',
    radiusXs:'7px',
    blur:    'blur(20px)',
    blurSm:  'blur(8px)',
    shadow:  '0 4px 24px rgba(0,0,0,0.5)',
    shadowLg:'0 32px 80px rgba(0,0,0,0.8)',
    cardShadow: (c) => `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${c}18`,
    glow:    (c) => `0 0 30px ${c}22, 0 4px 16px rgba(0,0,0,0.4)`,
    trans:   'all 0.22s cubic-bezier(0.4,0,0.2,1)',
    transFast:'all 0.12s ease',
    font:    "'DM Sans','Segoe UI',system-ui,sans-serif",
  },
  classic: {
    name:'classic',
    bgApp:   '#07101d',
    bgRail:  '#060c18',
    bgSide:  '#060c18',
    bgTop:   '#060c18',
    bgCard:  '#0d1627',
    bgCardH: '#131f35',
    bgInput: '#131f35',
    bgModal: '#0b1220',
    bgTag:   '#131f35',
    border:  '#1e2d42',
    borderH: (c) => `${c}66`,
    text:    '#f1f5f9',
    textSub: '#64748b',
    textMut: '#374151',
    radius:  '12px',
    radiusSm:'9px',
    radiusXs:'6px',
    blur:    'none',
    blurSm:  'none',
    shadow:  'none',
    shadowLg:'0 40px 120px rgba(0,0,0,0.9)',
    cardShadow: () => 'none',
    glow:    () => 'none',
    trans:   'all 0.15s',
    transFast:'all 0.1s',
    font:    "'Inter','Segoe UI',system-ui,sans-serif",
  }
}

const mkColor    = e=>{let n=0;for(let c of e)n+=c.charCodeAt(0);return WS_COLORS[n%WS_COLORS.length]}
const mkInit     = n=>n.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
const isOverdue  = d=>d&&new Date(d)<new Date()
const fmtDate    = d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'

const nextRecurringDate=(dueDate,type='none',interval=1)=>{
  if(!dueDate||type==='none') return null
  const dt=new Date(`${dueDate}T00:00:00`)
  const step=Math.max(1,Number(interval)||1)
  if(type==='daily'||type==='custom') dt.setDate(dt.getDate()+step)
  else if(type==='weekly') dt.setDate(dt.getDate()+7*step)
  else if(type==='monthly') dt.setMonth(dt.getMonth()+step)
  return dt.toISOString().slice(0,10)
}

const recurringLabel=(type,interval=1)=>{
  if(!type||type==='none') return null
  const n=Number(interval)||1
  if(type==='daily') return n===1?'Repeats daily':`Every ${n} days`
  if(type==='weekly') return n===1?'Repeats weekly':`Every ${n} weeks`
  if(type==='monthly') return n===1?'Repeats monthly':`Every ${n} months`
  if(type==='custom') return `Every ${n} days`
  return null
}

const enrich  = u=>u?{...u,initials:mkInit(u.name||u.email||'?'),color:mkColor(u.email||'')}:null
const getUser = (id,list=[])=>enrich(list.find(u=>u.id===id))||null
const scMap   = ss=>{const d={'Todo':'#6b7280','In Progress':'#6366f1','Review':'#f59e0b','Done':'#10b981'};let i=0;return Object.fromEntries(ss.map(s=>[s,d[s]||SCPAL[4+(i++%6)]]))}

const isOnMyBoard = (task, userId) => {
  const mine=task.created_by===userId,assignedToMe=task.assigned_to===userId,unassigned=!task.assigned_to,delegated=mine&&task.assigned_to&&task.assigned_to!==userId
  return (mine&&unassigned)||assignedToMe||delegated
}
const isMirroredToMe = (task,userId)=>task.assigned_to===userId&&task.created_by!==userId

const inp = (th)=>({display:'block',width:'100%',boxSizing:'border-box',background:th.bgInput,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'10px 13px',color:th.text,fontSize:14,outline:'none',fontFamily:th.font,lineHeight:1.5,backdropFilter:th.blurSm,transition:th.trans})
const lbl = (th)=>({display:'block',fontSize:11,color:th.textSub,fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.07em'})

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({user,size=32,th}){
  const ring=th?.name==='modern'?'0 0 0 2px rgba(255,255,255,0.1)':'none'
  if(!user) return <div style={{width:size,height:size,borderRadius:'50%',background:'#1e2d42',flexShrink:0}}/>
  if(user.avatar_url) return <img src={user.avatar_url} alt={user.name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0,boxShadow:ring}}/>
  return <div title={user.name} style={{width:size,height:size,borderRadius:'50%',background:`linear-gradient(135deg,${user.color||'#6366f1'},${user.color||'#6366f1'}99)`,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.36,fontWeight:700,flexShrink:0,userSelect:'none',boxShadow:ring}}>{user.initials}</div>
}

function Pill({label,color,sm}){
  return <span style={{background:color+'22',color,border:`1px solid ${color}44`,borderRadius:6,padding:sm?'1px 6px':'3px 10px',fontSize:sm?10:11,fontWeight:700,whiteSpace:'nowrap'}}>{label}</span>
}

function Modal({open,onClose,title,width=600,children,th}){
  if(!open) return null
  const isM=th?.name==='modern'
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:isM?'rgba(0,0,0,0.75)':'rgba(0,0,0,0.88)',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:th.bgModal,border:`1px solid ${th.border}`,borderRadius:'20px',width:'100%',maxWidth:width,maxHeight:'93vh',overflow:'auto',boxShadow:isM?'0 32px 96px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)':th.shadowLg,backdropFilter:isM?th.blur:'none',WebkitBackdropFilter:isM?th.blur:'none'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:`1px solid ${th.border}`}}>
          <span style={{fontSize:16,fontWeight:700,color:th.text,letterSpacing:'-0.01em'}}>{title}</span>
          <button onClick={onClose} style={{background:isM?'rgba(255,255,255,0.06)':'none',border:isM?`1px solid ${th.border}`:'none',borderRadius:'8px',width:30,height:30,color:th.textSub,cursor:'pointer',fontSize:18,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',transition:th.trans}}>✕</button>
        </div>
        <div style={{padding:24}}>{children}</div>
      </div>
    </div>
  )
}

function Confirm({open,icon,title,body,confirmLabel,confirmColor='#ef4444',onConfirm,onCancel,th}){
  if(!open||!th) return null
  return(
    <div onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:th.bgModal,border:`1px solid ${confirmColor}44`,borderRadius:'20px',width:'100%',maxWidth:400,padding:30,boxShadow:`0 0 0 1px ${confirmColor}22, ${th.shadowLg}`}}>
        <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>{icon}</div>
        <div style={{fontSize:17,fontWeight:700,color:th.text,textAlign:'center',marginBottom:8,letterSpacing:'-0.02em'}}>{title}</div>
        <div style={{fontSize:13,color:th.textSub,textAlign:'center',marginBottom:24,lineHeight:1.6}}>{body}</div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'10px',color:th.textSub,cursor:'pointer',fontSize:14,fontWeight:600,transition:th.trans}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,background:confirmColor,border:'none',borderRadius:th.radiusSm,padding:'10px',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,boxShadow:`0 4px 16px ${confirmColor}44`}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Auth ───────────────────────────────────────────────────────────────────────
function AuthScreen({th}){
  const [loading,setLoading]=useState(false)
  const isM=th.name==='modern'
  return(
    <div style={{minHeight:'100vh',background:th.bgApp,display:'flex',fontFamily:th.font,position:'relative',overflow:'hidden'}}>
      {isM&&<>
        <div style={{position:'absolute',top:'-20%',left:'-10%',width:'60%',height:'60%',background:'radial-gradient(ellipse,rgba(99,102,241,0.07) 0%,transparent 70%)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:'-10%',right:'0',width:'50%',height:'50%',background:'radial-gradient(ellipse,rgba(16,185,129,0.05) 0%,transparent 70%)',pointerEvents:'none'}}/>
      </>}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:48,position:'relative'}}>
        <div style={{maxWidth:400,width:'100%'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
            <div style={{width:44,height:44,borderRadius:'13px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,boxShadow:isM?'0 8px 24px rgba(99,102,241,0.4)':'none'}}>✦</div>
            <span style={{fontSize:28,fontWeight:800,color:th.text,letterSpacing:'-0.03em'}}>TaskFlow</span>
          </div>
          <div style={{fontSize:30,fontWeight:800,color:th.text,lineHeight:1.15,marginBottom:12,letterSpacing:isM?'-0.04em':'normal'}}>Private workspace<br/><span style={{background:'linear-gradient(90deg,#6366f1,#10b981)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>for your team</span></div>
          <div style={{fontSize:14,color:th.textSub,lineHeight:1.6,marginBottom:32}}>Sign in with Google to request access.<br/>Admin reviews all requests.</div>
          <button onClick={async()=>{setLoading(true);await signInWithGoogle()}} disabled={loading}
            style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'15px 20px',background:'#fff',borderRadius:isM?'14px':'12px',border:'none',cursor:'pointer',fontSize:15,fontWeight:600,color:'#1a1a1a',boxShadow:isM?'0 4px 20px rgba(0,0,0,0.4)':'0 2px 12px rgba(0,0,0,0.4)',opacity:loading?0.7:1,transition:th.trans}}>
            <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {loading?'Redirecting…':'Continue with Google'}
          </button>
        </div>
      </div>
      <div style={{width:270,background:isM?'rgba(7,11,28,0.7)':'#0a1220',borderLeft:`1px solid ${th.border}`,backdropFilter:isM?th.blur:'none',display:'flex',flexDirection:'column',justifyContent:'center',padding:32,position:'relative'}}>
        {[{icon:'👤',title:'Personal Board',desc:'Your tasks stay private'},{icon:'📤',title:'Delegate to Team',desc:'Assign tasks — mirror on their board'},{icon:'🔁',title:'Recurring Tasks',desc:'Auto-create tasks on a schedule'},{icon:'📊',title:'CSV Import/Export',desc:'Bulk upload or download all tasks'}].map(f=>(
          <div key={f.title} style={{display:'flex',gap:12,marginBottom:22}}>
            <div style={{width:34,height:34,borderRadius:'10px',background:isM?'rgba(99,102,241,0.12)':'#6366f122',border:`1px solid ${isM?'rgba(99,102,241,0.22)':'#6366f144'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,boxShadow:isM?'0 4px 12px rgba(99,102,241,0.1)':'none'}}>{f.icon}</div>
            <div><div style={{fontSize:13,fontWeight:700,color:th.text,marginBottom:2}}>{f.title}</div><div style={{fontSize:12,color:th.textSub,lineHeight:1.5}}>{f.desc}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}
function PendingScreen({user,onSignOut,th}){
  return(<div style={{minHeight:'100vh',background:th.bgApp,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:th.font}}><div style={{textAlign:'center',maxWidth:400,padding:32}}><div style={{fontSize:56,marginBottom:20}}>⏳</div><div style={{fontSize:22,fontWeight:800,color:th.text,marginBottom:8,letterSpacing:'-0.02em'}}>Access Requested</div><div style={{fontSize:14,color:'#818cf8',marginBottom:4}}>{user.email}</div><div style={{fontSize:13,color:th.textSub,background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radius,padding:16,margin:'20px 0',lineHeight:1.6}}>The admin will review your request.</div><button onClick={onSignOut} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'10px 24px',color:th.textSub,cursor:'pointer',fontSize:14,fontFamily:th.font}}>Sign Out</button></div></div>)
}
function DeniedScreen({onSignOut,th}){
  return(<div style={{minHeight:'100vh',background:th.bgApp,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:th.font}}><div style={{textAlign:'center',maxWidth:380,padding:32}}><div style={{fontSize:56,marginBottom:20}}>🚫</div><div style={{fontSize:22,fontWeight:800,color:th.text,marginBottom:12,letterSpacing:'-0.02em'}}>Access Denied</div><div style={{fontSize:14,color:th.textSub,marginBottom:24}}>Contact the admin if you think this is a mistake.</div><button onClick={onSignOut} style={{background:'#ef444420',border:'1px solid #ef444440',borderRadius:th.radiusSm,padding:'10px 24px',color:'#ef4444',cursor:'pointer',fontSize:14,fontWeight:600,fontFamily:th.font}}>Sign Out</button></div></div>)
}

// ── Admin Panel ────────────────────────────────────────────────────────────────
function AdminPanel({open,onClose,onAccessChanged,th}){
  const [reqs,setReqs]=useState([]);const [loading,setLoading]=useState(true)
  const load=async()=>{setLoading(true);const{data}=await getAccessRequests();setReqs(data||[]);setLoading(false)}
  useEffect(()=>{if(open)load()},[open])
  const act=async(uid,a)=>{
    if(a==='approve'){await approveRequest(uid)}
    else if(a==='remove'){if(!window.confirm('Remove this person?'))return;await denyRequest(uid);await removeUserFromAllWorkspaces(uid)}
    else{await denyRequest(uid)}
    await load();await onAccessChanged?.()
  }
  const sc={pending:'#f59e0b',approved:'#10b981',denied:'#ef4444'}
  return(
    <Modal open={open} onClose={onClose} title="🛡️ Access Requests" width={520} th={th}>
      {loading?<div style={{textAlign:'center',padding:40,color:th.textSub}}>Loading…</div>
      :reqs.length===0?<div style={{textAlign:'center',padding:40,color:th.textSub}}>No requests yet.</div>
      :reqs.map(r=>{
        const status=(r.status||'').trim().toLowerCase();const statusColor=sc[status]||th.textSub
        return(
          <div key={r.user_id} style={{display:'flex',alignItems:'center',gap:12,background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'12px 16px',marginBottom:10}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:`linear-gradient(135deg,${mkColor(r.email)},${mkColor(r.email)}88)`,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,flexShrink:0}}>{mkInit(r.name||r.email)}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:th.text}}>{r.name}</div><div style={{fontSize:11,color:th.textSub,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.email}</div></div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,color:statusColor,background:statusColor+'22',border:`1px solid ${statusColor}44`,borderRadius:6,padding:'2px 8px'}}>{status.toUpperCase()}</span>
              {status==='pending'&&<div style={{display:'flex',gap:6}}>
                <button onClick={()=>act(r.user_id,'approve')} style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:8,padding:'5px 12px',color:'#10b981',cursor:'pointer',fontSize:12,fontWeight:700}}>✓ Approve</button>
                <button onClick={()=>act(r.user_id,'deny')} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:8,padding:'5px 12px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:700}}>✗ Deny</button>
              </div>}
              {status==='denied'&&<button onClick={()=>act(r.user_id,'approve')} style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:8,padding:'5px 12px',color:'#10b981',cursor:'pointer',fontSize:12,fontWeight:700}}>Approve Again</button>}
              {status==='approved'&&<button onClick={()=>act(r.user_id,'remove')} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:8,padding:'5px 12px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:700}}>Remove Access</button>}
            </div>
          </div>
        )
      })}
    </Modal>
  )
}

// ── Status Manager ─────────────────────────────────────────────────────────────
function StatusManager({open,onClose,statuses,wsColor,onSave,th}){
  const [list,setList]=useState([...statuses]);const ref=useRef()
  useEffect(()=>{if(open)setList([...statuses])},[open,statuses])
  const SC=scMap(list)
  const add=()=>{const v=ref.current?.value?.trim();if(!v||list.includes(v))return;setList(p=>[...p,v]);ref.current.value=''}
  const del=s=>{if(list.length<=1)return;setList(p=>p.filter(x=>x!==s))}
  const mv=(i,d)=>{const a=[...list],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setList(a)}
  const INP=inp(th)
  return(
    <Modal open={open} onClose={onClose} title="⚙️ Manage Status Columns" width={440} th={th}>
      <div style={{fontSize:12,color:th.textSub,marginBottom:16,lineHeight:1.6}}>Add, remove, or reorder status columns for this workspace.</div>
      {list.map((s,i)=>(
        <div key={s} style={{display:'flex',alignItems:'center',gap:10,background:th.bgCard,border:`1px solid ${SC[s]}44`,borderRadius:th.radiusSm,padding:'9px 12px',marginBottom:7,transition:th.trans}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:SC[s],flexShrink:0,boxShadow:th.name==='modern'?`0 0 8px ${SC[s]}88`:'none'}}/>
          <span style={{flex:1,fontSize:13,fontWeight:600,color:th.text}}>{s}</span>
          <button onClick={()=>mv(i,-1)} disabled={i===0} style={{background:'none',border:'none',color:i===0?th.textMut:th.textSub,cursor:i===0?'default':'pointer',fontSize:14,padding:'0 4px'}}>↑</button>
          <button onClick={()=>mv(i,1)} disabled={i===list.length-1} style={{background:'none',border:'none',color:i===list.length-1?th.textMut:th.textSub,cursor:i===list.length-1?'default':'pointer',fontSize:14,padding:'0 4px'}}>↓</button>
          <button onClick={()=>del(s)} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:6,padding:'3px 8px',color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:600}}>✕</button>
        </div>
      ))}
      <div style={{display:'flex',gap:8,margin:'16px 0'}}>
        <input ref={ref} placeholder="New status… e.g. Blocked, QA" style={{...INP,flex:1}} onKeyDown={e=>{if(e.key==='Enter')add()}}/>
        <button onClick={add} style={{background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:th.radiusSm,padding:'0 16px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14,flexShrink:0,boxShadow:`0 4px 16px ${wsColor}44`}}>+ Add</button>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'9px 20px',color:th.textSub,cursor:'pointer',fontSize:13,transition:th.trans}}>Cancel</button>
        <button onClick={()=>{onSave(list);onClose()}} style={{background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:th.radiusSm,padding:'9px 26px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,boxShadow:`0 4px 16px ${wsColor}44`}}>Save</button>
      </div>
    </Modal>
  )
}

// ── Import/Export ──────────────────────────────────────────────────────────────
function ImportExportModal({open,onClose,tasks,wsMembers,statuses,wsName,onImport,th}){
  const [tab,setTab]=useState('export');const [dragging,setDragging]=useState(false);const [preview,setPreview]=useState(null);const fileRef=useRef()
  const esc=v=>{const s=String(v??'');return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s}
  const handleExport=()=>{
    const getName=id=>wsMembers.find(m=>m.id===id)?.name||id||''
    const headers=['Title','Description','Status','Priority','Assigned To','Created By','Project','Tags','Due Date','Recurrence','Interval']
    const rows=tasks.map(t=>[t.title,t.description||'',t.status,t.priority,getName(t.assigned_to),getName(t.created_by),t.project||'',(t.tags||[]).join(';'),t.due_date||'',t.recurrence_type||'none',t.recurrence_interval||1].map(esc))
    const csv=[headers,...rows].map(r=>r.join(',')).join('\n')
    const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download=`${wsName}_tasks_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)
  }
  const parseCSV=text=>{
    const parseRow=row=>{const cells=[];let cur='',inQ=false;for(const ch of row){if(ch==='"'&&!inQ)inQ=true;else if(ch==='"'&&inQ)inQ=false;else if(ch===','&&!inQ){cells.push(cur.trim());cur=''}else cur+=ch}cells.push(cur.trim());return cells}
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);if(lines.length<2) return null
    const headers=parseRow(lines[0]).map(h=>h.toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z_]/g,''));const gi=k=>headers.indexOf(k)
    return lines.slice(1).map(line=>{const cols=parseRow(line);return{title:(cols[gi('title')]||'').trim(),description:(cols[gi('description')]||'').trim(),status:(cols[gi('status')]||'').trim(),priority:(cols[gi('priority')]||'').trim(),assigned_to_name:(cols[gi('assigned_to')]||'').trim(),project:(cols[gi('project')]||'').trim(),tags:(cols[gi('tags')]||'').split(';').map(t=>t.trim()).filter(Boolean),due_date:(cols[gi('due_date')]||'').trim()||null,recurrence_type:(cols[gi('recurrence')]||'none').trim(),recurrence_interval:Math.max(1,parseInt(cols[gi('interval')])||1)}}).filter(r=>r.title)
  }
  const handleFile=async f=>{if(!f)return;const text=await f.text();const rows=parseCSV(text);if(!rows||rows.length===0){alert('Could not parse CSV.');return};setPreview(rows)}
  const INP=inp(th)
  return(
    <Modal open={open} onClose={()=>{onClose();setPreview(null);setTab('export')}} title="📊 Import / Export Tasks" width={640} th={th}>
      <div style={{display:'flex',gap:4,background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:4,marginBottom:20}}>
        {[{id:'export',label:'⬇ Export CSV'},{id:'import',label:'⬆ Import CSV'}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setPreview(null)}} style={{flex:1,padding:'8px 0',borderRadius:th.radiusXs,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:tab===t.id?'#6366f1':'transparent',color:tab===t.id?'#fff':th.textSub,transition:th.trans,boxShadow:tab===t.id&&th.name==='modern'?'0 4px 12px rgba(99,102,241,0.4)':'none'}}>{t.label}</button>
        ))}
      </div>
      {tab==='export'&&(
        <div>
          <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:16,marginBottom:16}}>
            <div style={{fontSize:13,color:th.textSub,marginBottom:12,lineHeight:1.6}}>Downloads a CSV with all <strong style={{color:th.text}}>{tasks.length} tasks</strong> from this workspace.</div>
            <div style={{fontSize:11,color:th.textMut,fontFamily:'monospace',background:'rgba(0,0,0,0.3)',borderRadius:8,padding:'8px 12px'}}>Title · Status · Priority · Assigned To · Due Date · Recurrence</div>
          </div>
          <button onClick={handleExport} style={{width:'100%',background:'linear-gradient(135deg,#10b981,#059669)',border:'none',borderRadius:th.radiusSm,padding:'12px',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 8px 24px rgba(16,185,129,0.35)',transition:th.trans}}>⬇ Download {tasks.length} Tasks as CSV</button>
        </div>
      )}
      {tab==='import'&&!preview&&(
        <div>
          <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:16,marginBottom:16,fontSize:12,color:th.textSub,lineHeight:1.8}}>
            <div style={{fontWeight:700,color:th.text,marginBottom:8,fontSize:13}}>CSV Format Requirements</div>
            <div>• Required: <strong style={{color:'#818cf8'}}>Title</strong></div>
            <div>• Optional: Description, Status, Priority, Assigned To, Project, Tags (;), Due Date (YYYY-MM-DD), Recurrence, Interval</div>
          </div>
          <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}} onClick={()=>fileRef.current?.click()}
            style={{border:`2px dashed ${dragging?'#6366f1':th.border}`,borderRadius:th.radius,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:dragging?'rgba(99,102,241,0.06)':'transparent',transition:th.trans}}>
            <div style={{fontSize:36,marginBottom:12}}>📂</div>
            <div style={{fontSize:14,fontWeight:600,color:th.textSub,marginBottom:4}}>Drop your CSV file here</div>
            <div style={{fontSize:12,color:th.textMut}}>or click to browse</div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
          </div>
        </div>
      )}
      {tab==='import'&&preview&&(
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:700,color:th.text}}>Preview — {preview.length} rows</div>
            <button onClick={()=>setPreview(null)} style={{background:'none',border:'none',color:th.textSub,cursor:'pointer',fontSize:12}}>← Back</button>
          </div>
          <div style={{maxHeight:280,overflow:'auto',border:`1px solid ${th.border}`,borderRadius:th.radiusSm,marginBottom:14}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead style={{position:'sticky',top:0,background:th.bgModal}}>
                <tr>{['Title','Status','Priority','Assigned To','Due Date'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',color:th.textSub,fontWeight:700,borderBottom:`1px solid ${th.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((r,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${th.border}`}}>
                    <td style={{padding:'7px 12px',color:th.text,fontWeight:600}}>{r.title}</td>
                    <td style={{padding:'7px 8px',color:th.textSub}}>{r.status||'—'}</td>
                    <td style={{padding:'7px 8px',color:th.textSub}}>{r.priority||'—'}</td>
                    <td style={{padding:'7px 8px',color:th.textSub}}>{r.assigned_to_name||'—'}</td>
                    <td style={{padding:'7px 8px',color:th.textSub}}>{r.due_date||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setPreview(null)} style={{flex:1,background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'10px',color:th.textSub,cursor:'pointer',fontSize:13,fontWeight:600}}>← Back</button>
            <button onClick={()=>{onImport(preview);onClose();setPreview(null)}} style={{flex:2,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none',borderRadius:th.radiusSm,padding:'10px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,boxShadow:'0 8px 24px rgba(99,102,241,0.4)'}}>✓ Import {preview.length} Tasks</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Recurrence Picker ──────────────────────────────────────────────────────────
function RecurrencePicker({recurrenceType,recurrenceInterval,onTypeChange,onIntervalChange,th}){
  const showInterval=recurrenceType!=='none';const INP=inp(th)
  return(
    <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'12px 14px',marginTop:2}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:showInterval?12:0}}>
        {RECURRENCE_TYPES.map(rt=>(
          <button key={rt} onClick={()=>onTypeChange(rt)} style={{padding:'6px 12px',borderRadius:8,border:`1.5px solid ${recurrenceType===rt?'#6366f1':th.border}`,background:recurrenceType===rt?'rgba(99,102,241,0.18)':'transparent',color:recurrenceType===rt?'#818cf8':th.textSub,cursor:'pointer',fontSize:12,fontWeight:recurrenceType===rt?700:500,transition:th.trans,boxShadow:recurrenceType===rt&&th.name==='modern'?'0 0 12px rgba(99,102,241,0.2)':'none'}}>
            {rt==='none'?'✕ None':rt==='daily'?'📅 Daily':rt==='weekly'?'📆 Weekly':rt==='monthly'?'🗓 Monthly':'⚙️ Custom'}
          </button>
        ))}
      </div>
      {showInterval&&(
        <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(0,0,0,0.2)',borderRadius:9,padding:'10px 12px',border:`1px solid ${th.border}`}}>
          <span style={{fontSize:12,color:th.textSub,whiteSpace:'nowrap'}}>Every</span>
          <input type="number" min={1} max={365} value={recurrenceInterval} onChange={e=>onIntervalChange(Math.max(1,parseInt(e.target.value)||1))} style={{...INP,width:70,padding:'6px 10px',fontSize:13,flex:'none'}}/>
          <span style={{fontSize:12,color:th.textSub,whiteSpace:'nowrap'}}>{recurrenceType==='weekly'?`week${recurrenceInterval===1?'':'s'}`:recurrenceType==='monthly'?`month${recurrenceInterval===1?'':'s'}`:`day${recurrenceInterval===1?'':'s'}`}</span>
          <span style={{marginLeft:'auto',fontSize:11,color:'#6366f1',background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:6,padding:'3px 8px',whiteSpace:'nowrap',fontWeight:600}}>🔁 {recurringLabel(recurrenceType,recurrenceInterval)}</span>
        </div>
      )}
      {showInterval&&<div style={{marginTop:8,fontSize:11,color:th.textSub,lineHeight:1.6}}>💡 When marked <strong style={{color:'#10b981'}}>Done</strong>, a new copy auto-creates with the next due date.</div>}
    </div>
  )
}

// ── Task Form ──────────────────────────────────────────────────────────────────
function TaskFormModal({open,onClose,task,ws,wsMembers,cu,statuses,defaultStatus,onSave,onDelete,th}){
  const titleRef=useRef(),descRef=useRef(),projRef=useRef(),tagsRef=useRef(),dateRef=useRef()
  const [status,setStatus]=useState(defaultStatus||statuses[0]||'Todo')
  const [priority,setPriority]=useState('Medium')
  const [assignTarget,setAssignTarget]=useState('self')
  const [recurrenceType,setRecurrenceType]=useState('none')
  const [recurrenceInterval,setRecurrenceInterval]=useState(1)
  const [cdel,setCdel]=useState(false)
  const isEdit=!!task;const INP=inp(th)

  useEffect(()=>{
    if(!open)return
    setStatus(task?.status||defaultStatus||statuses[0]||'Todo');setPriority(task?.priority||'Medium')
    if(task){const sa=!task.assigned_to||task.assigned_to===task.created_by;setAssignTarget(sa?'self':task.assigned_to);setRecurrenceType(task?.recurrence_type||'none');setRecurrenceInterval(task?.recurrence_interval||1)}
    else{setAssignTarget('self');setRecurrenceType('none');setRecurrenceInterval(1)}
  },[open,task,defaultStatus,statuses])

  if(!open||!ws||!cu) return null
  const otherMembers=wsMembers.filter(m=>m.id!==cu.id)

  const handleSave=async()=>{
    const title=titleRef.current?.value?.trim();if(!title)return
    const assigned_to=assignTarget==='self'?cu.id:assignTarget
    const payload={title,description:descRef.current?.value?.trim()||'',project:projRef.current?.value?.trim()||'',tags:(tagsRef.current?.value||'').split(',').map(t=>t.trim()).filter(Boolean),due_date:dateRef.current?.value||null,recurrence_type:recurrenceType,recurrence_interval:Math.max(1,Number(recurrenceInterval)||1),status,priority,assigned_to,workspace_id:ws.id,created_by:task?.created_by||cu.id}
    await onSave(isEdit?{...task,...payload}:payload);onClose()
  }
  const F=({label,children,full})=>(<div style={{marginBottom:14,gridColumn:full?'1/-1':undefined}}><label style={lbl(th)}>{label}</label>{children}</div>)

  return(
    <>
      <Modal open={open} onClose={onClose} title={isEdit?'✏️ Edit Task':'✦ New Task'} width={600} th={th}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <F label="Task Title *" full><input ref={titleRef} autoFocus defaultValue={task?.title||''} placeholder="What needs to be done?" style={{...INP,fontSize:15,fontWeight:600}} onKeyDown={e=>{if(e.key==='Enter')handleSave()}}/></F>
          <F label="Description" full><textarea ref={descRef} defaultValue={task?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="Details…"/></F>
          <F label="Status"><select value={status} onChange={e=>setStatus(e.target.value)} style={{...INP,cursor:'pointer'}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></F>
          <F label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value)} style={{...INP,cursor:'pointer'}}>{PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}</select></F>
          <F label={otherMembers.length===0?'Assign To (add members first)':'Assign To'} full>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <div onClick={()=>setAssignTarget('self')} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:th.radiusSm,cursor:'pointer',border:`2px solid ${assignTarget==='self'?ws.color:th.border}`,background:assignTarget==='self'?ws.color+'18':th.bgCard,transition:th.trans,flexShrink:0}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:ws.color+'33',border:`1px solid ${ws.color}66`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>🔒</div>
                <div><div style={{fontSize:12,fontWeight:700,color:assignTarget==='self'?ws.color:th.text}}>Only Me</div><div style={{fontSize:10,color:th.textSub}}>Private task</div></div>
                {assignTarget==='self'&&<div style={{width:16,height:16,borderRadius:'50%',background:ws.color,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:4}}><span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span></div>}
              </div>
              {otherMembers.map(m=>{
                const eu=enrich(m);const sel=assignTarget===m.id
                return(
                  <div key={m.id} onClick={()=>setAssignTarget(m.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:th.radiusSm,cursor:'pointer',border:`2px solid ${sel?ws.color:th.border}`,background:sel?ws.color+'18':th.bgCard,transition:th.trans,flexShrink:0}}>
                    <Avatar user={eu} size={28} th={th}/>
                    <div><div style={{fontSize:12,fontWeight:700,color:sel?ws.color:th.text}}>{m.name||m.email.split('@')[0]}</div><div style={{fontSize:10,color:th.textSub}}>Assign task</div></div>
                    {sel&&<div style={{width:16,height:16,borderRadius:'50%',background:ws.color,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:4}}><span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span></div>}
                  </div>
                )
              })}
            </div>
          </F>
          <F label="Due Date (first occurrence)" full><input ref={dateRef} type="date" defaultValue={task?.due_date||''} style={INP}/></F>
          <F label="🔁 Recurrence" full><RecurrencePicker recurrenceType={recurrenceType} recurrenceInterval={recurrenceInterval} onTypeChange={setRecurrenceType} onIntervalChange={setRecurrenceInterval} th={th}/></F>
          <F label="Project"><input ref={projRef} defaultValue={task?.project||''} style={INP} placeholder="e.g. Accounts, HR"/></F>
          <F label="Tags (comma-separated)"><input ref={tagsRef} defaultValue={(task?.tags||[]).join(', ')} style={INP} placeholder="Urgent, Finance"/></F>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:8,paddingTop:12,borderTop:`1px solid ${th.border}`}}>
          {isEdit?<button onClick={()=>setCdel(true)} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:th.radiusSm,padding:'9px 16px',color:'#ef4444',cursor:'pointer',fontSize:13,fontWeight:600}}>🗑️ Delete</button>:<div/>}
          <div style={{display:'flex',gap:10}}>
            <button onClick={onClose} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'9px 20px',color:th.textSub,cursor:'pointer',fontSize:13,transition:th.trans}}>Cancel</button>
            <button onClick={handleSave} style={{background:`linear-gradient(135deg,${ws.color},${ws.color}bb)`,border:'none',borderRadius:th.radiusSm,padding:'9px 26px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,boxShadow:`0 6px 20px ${ws.color}44`}}>{isEdit?'💾 Save':'Create Task'}</button>
          </div>
        </div>
      </Modal>
      <Confirm open={cdel} icon="🗑️" title="Delete Task?" body={`Delete "${task?.title}"?`} confirmLabel="Delete" onConfirm={async()=>{setCdel(false);await onDelete(task.id);onClose()}} onCancel={()=>setCdel(false)} th={th}/>
    </>
  )
}

// ── Workspace Form ─────────────────────────────────────────────────────────────
function WorkspaceFormModal({open,onClose,ws,allProfiles,cu,onSave,currentMemberIds,th}){
  const nameRef=useRef(),descRef=useRef()
  const [color,setColor]=useState(WS_COLORS[0]);const [icon,setIcon]=useState(WS_ICONS[0]);const [members,setMembers]=useState([])
  const INP=inp(th)
  useEffect(()=>{if(open){setColor(ws?.color||WS_COLORS[0]);setIcon(ws?.icon||WS_ICONS[0]);const initial=ws?(currentMemberIds?.length>0?currentMemberIds:[cu?.id]):[cu?.id];setMembers(initial)}},[open,ws,cu,currentMemberIds])
  if(!open||!cu) return null
  const toggle=id=>{if(id===cu.id)return;setMembers(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])}
  return(
    <Modal open={open} onClose={onClose} title={ws?'✏️ Edit Workspace':'✦ New Workspace'} width={500} th={th}>
      <div style={{marginBottom:14}}><label style={lbl(th)}>Workspace Name *</label><input ref={nameRef} defaultValue={ws?.name||''} placeholder="e.g. Daily To Do, Accounts Team" style={INP}/></div>
      <div style={{marginBottom:14}}><label style={lbl(th)}>Description</label><textarea ref={descRef} defaultValue={ws?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="What does this workspace cover?"/></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px',marginBottom:14}}>
        <div><label style={lbl(th)}>Color</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{WS_COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:8,background:c,cursor:'pointer',border:`2.5px solid ${color===c?'#fff':'transparent'}`,boxShadow:color===c?`0 0 0 2px ${c}, 0 4px 12px ${c}66`:'none',transition:th.trans}}/>)}</div></div>
        <div><label style={lbl(th)}>Icon</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{WS_ICONS.map(ic=><div key={ic} onClick={()=>setIcon(ic)} style={{width:34,height:34,borderRadius:8,background:icon===ic?color+'33':th.bgCard,border:`1.5px solid ${icon===ic?color:th.border}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,transition:th.trans}}>{ic}</div>)}</div></div>
      </div>
      <div style={{marginBottom:20}}>
        <label style={lbl(th)}>Members — {members.length} selected</label>
        {allProfiles.length===0&&<div style={{fontSize:12,color:'#f59e0b',background:'#f59e0b11',borderRadius:th.radiusSm,padding:12,lineHeight:1.6,border:'1px solid #f59e0b33'}}>⚠ No approved members yet. Open Admin Panel and approve teammates first.</div>}
        {allProfiles.map(u=>{
          const checked=members.includes(u.id),isSelf=u.id===cu.id
          return(
            <div key={u.id} onClick={()=>toggle(u.id)} style={{display:'flex',alignItems:'center',gap:12,background:checked?th.bgCard:'transparent',border:`1px solid ${checked?color+'44':th.border}`,borderRadius:th.radiusSm,padding:'9px 13px',cursor:isSelf?'default':'pointer',marginBottom:7,transition:th.trans,boxShadow:checked&&th.name==='modern'?`0 4px 16px ${color}18`:'none'}}>
              <Avatar user={enrich(u)} size={30} th={th}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:th.text}}>{u.name||u.email}{isSelf?' (You — always included)':''}</div><div style={{fontSize:11,color:th.textSub}}>{u.email}</div></div>
              <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${checked?color:th.textMut}`,background:checked?color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:th.trans,boxShadow:checked?`0 2px 8px ${color}44`:'none'}}>{checked&&<span style={{color:'#fff',fontSize:11,fontWeight:700}}>✓</span>}</div>
            </div>
          )
        })}
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'9px 20px',color:th.textSub,cursor:'pointer',fontSize:13,transition:th.trans}}>Cancel</button>
        <button onClick={async()=>{const name=nameRef.current?.value?.trim();if(!name)return;await onSave({id:ws?.id,name,description:descRef.current?.value?.trim()||'',color,icon,memberIds:members.includes(cu.id)?members:[...members,cu.id]});onClose()}} style={{background:`linear-gradient(135deg,${color},${color}bb)`,border:'none',borderRadius:th.radiusSm,padding:'9px 26px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,boxShadow:`0 6px 20px ${color}44`}}>{ws?'Save Changes':'Create Workspace'}</button>
      </div>
    </Modal>
  )
}

// ── Task Card ──────────────────────────────────────────────────────────────────
function TaskCard({task,wsColor,SC,wsMembers,cu,onEdit,onDelete,onDragStart,isDragging,th}){
  const assignee=getUser(task.assigned_to,wsMembers);const creator=getUser(task.created_by,wsMembers)
  const overdue=isOverdue(task.due_date);const mirrored=isMirroredToMe(task,cu?.id)
  const delegated=task.created_by===cu?.id&&task.assigned_to&&task.assigned_to!==cu?.id
  const recurring=task.recurrence_type&&task.recurrence_type!=='none'
  const [hov,setHov]=useState(false);const [cdel,setCdel]=useState(false)
  const accentColor=mirrored?'#818cf8':delegated?'#f59e0b':wsColor
  const isM=th.name==='modern'
  return(
    <>
      <div draggable={!mirrored} onDragStart={e=>{if(mirrored)return;e.dataTransfer.effectAllowed='move';onDragStart(task.id)}}
        onClick={()=>onEdit(task)} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
        style={{background:isDragging?th.bgCardH:hov?th.bgCardH:th.bgCard,border:`1px solid ${hov?accentColor+'55':th.border}`,borderLeft:`3px solid ${accentColor}`,borderRadius:th.radius,padding:14,cursor:mirrored?'default':'grab',transition:th.trans,opacity:isDragging?0.35:1,boxShadow:hov&&!isDragging?(isM?`0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}22`:th.shadow):'none',transform:hov&&!isDragging&&isM?'translateY(-2px)':'none',userSelect:'none',position:'relative',backdropFilter:isM?th.blurSm:'none',WebkitBackdropFilter:isM?th.blurSm:'none'}}>
        {mirrored&&<div style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,background:'rgba(129,140,248,0.15)',color:'#818cf8',border:'1px solid rgba(129,140,248,0.25)',borderRadius:5,padding:'2px 6px'}}>📥 ASSIGNED TO ME</div>}
        {delegated&&!mirrored&&<div style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,background:'rgba(245,158,11,0.12)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.25)',borderRadius:5,padding:'2px 6px'}}>📤 DELEGATED</div>}
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6,paddingRight:mirrored||delegated?90:0}}>
          {(task.tags||[]).slice(0,2).map(t=><span key={t} style={{fontSize:10,color:th.textSub,background:th.bgTag,borderRadius:4,padding:'2px 5px',fontWeight:600,border:`1px solid ${th.border}`}}>{t}</span>)}
          {recurring&&<span style={{fontSize:10,color:'#6366f1',background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:4,padding:'2px 5px',fontWeight:600}}>🔁 {recurringLabel(task.recurrence_type,task.recurrence_interval)}</span>}
        </div>
        <div style={{fontSize:13,fontWeight:600,color:th.text,marginBottom:5,lineHeight:1.4,letterSpacing:isM?'-0.01em':'normal'}}>{task.title}</div>
        {task.description&&<div style={{fontSize:11,color:th.textSub,marginBottom:8,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{task.description}</div>}
        <div style={{display:'flex',gap:4,marginBottom:8}}>
          <Pill label={`${PI[task.priority]} ${task.priority}`} color={PC[task.priority]} sm/>
          {overdue&&<Pill label="⚠ Overdue" color="#ef4444" sm/>}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            {mirrored?(<><Avatar user={creator} size={18} th={th}/><span style={{fontSize:10,color:'#818cf8',fontWeight:600}}>from {creator?.name?.split(' ')[0]||'?'}</span></>)
                     :(<><Avatar user={assignee} size={18} th={th}/><span style={{fontSize:11,color:th.textSub}}>{assignee?.id===cu?.id?'Me':assignee?.name?.split(' ')[0]||'—'}</span></>)}
          </div>
          {task.due_date&&<span style={{fontSize:10,color:overdue?'#ef4444':th.textSub,fontWeight:overdue?700:400}}>{fmtDate(task.due_date)}</span>}
        </div>
        {!mirrored&&(
          <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:`1px solid ${th.border}`,opacity:hov?1:0,transform:hov?'none':'translateY(4px)',transition:th.trans}}>
            <button onClick={e=>{e.stopPropagation();onEdit(task)}} style={{flex:1,background:wsColor+'22',border:`1px solid ${wsColor}44`,borderRadius:th.radiusXs,padding:'5px 0',color:wsColor,cursor:'pointer',fontSize:11,fontWeight:600}}>✏️ Edit</button>
            <button onClick={e=>{e.stopPropagation();setCdel(true)}} style={{flex:1,background:'#ef444418',border:'1px solid #ef444440',borderRadius:th.radiusXs,padding:'5px 0',color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:600}}>🗑 Delete</button>
          </div>
        )}
      </div>
      <Confirm open={cdel} icon="🗑️" title="Delete Task?" body={`Delete "${task.title}"?`} confirmLabel="Delete" onConfirm={()=>{setCdel(false);onDelete(task.id)}} onCancel={()=>setCdel(false)} th={th}/>
    </>
  )
}

// ── Drop Column ────────────────────────────────────────────────────────────────
function DropColumn({status,tasks,wsColor,SC,wsMembers,cu,onEdit,onDelete,dragId,onDragStart,onDrop,onAddTask,th}){
  const [over,setOver]=useState(false);const col=SC[status]||wsColor;const isM=th.name==='modern'
  return(
    <div onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);onDrop(status)}} style={{minWidth:250,flex:'1 1 250px',maxWidth:300}}>
      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:10,padding:'7px 10px',background:over?(isM?`rgba(0,0,0,0.2)`:`${col}11`):'transparent',borderRadius:th.radiusSm,border:`1px solid ${over?col+'55':'transparent'}`,transition:th.trans,backdropFilter:isM&&over?th.blurSm:'none'}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:col,boxShadow:isM?`0 0 8px ${col}99`:'none'}}/>
        <span style={{fontSize:12,fontWeight:700,color:th.text,flex:1}}>{status}</span>
        <span style={{background:col+'22',color:col,borderRadius:20,padding:'2px 8px',fontSize:11,fontWeight:700,border:`1px solid ${col}33`}}>{tasks.length}</span>
        <button onClick={()=>onAddTask(status)} style={{width:24,height:24,borderRadius:7,background:col+'22',border:`1px solid ${col}44`,color:col,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,flexShrink:0,padding:0,lineHeight:1,transition:th.transFast}}
          onMouseEnter={e=>e.currentTarget.style.background=col+'44'} onMouseLeave={e=>e.currentTarget.style.background=col+'22'}>+</button>
      </div>
      <div style={{minHeight:60,borderRadius:th.radiusSm,padding:over?'8px':'0',background:over?col+'0d':'transparent',border:over?`2px dashed ${col}66`:'2px dashed transparent',transition:th.trans,display:'flex',flexDirection:'column',gap:9}}>
        {tasks.map(t=><TaskCard key={t.id} task={t} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} isDragging={dragId===t.id} th={th}/>)}
        {tasks.length===0&&!over&&<div style={{border:`2px dashed ${th.border}`,borderRadius:th.radiusSm,padding:20,textAlign:'center',color:th.textMut,fontSize:12}}>No tasks</div>}
        {over&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:60,color:col,fontSize:12,fontWeight:600}}>↓ Drop here</div>}
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
function TaskFlowApp({cu,isAdmin,allProfiles,onSignOut,onAccessChanged}){
  const [workspaces,setWorkspaces]=useState([]);const [activeWsId,setActiveWsId]=useState(null);const [wsMembers,setWsMembers]=useState([]);const [tasks,setTasks]=useState([])
  const [subView,setSubView]=useState('board');const [teamMemberId,setTeamMemberId]=useState(null);const [editTask,setEditTask]=useState(null);const [createStatus,setCreateStatus]=useState(null)
  const [wsForm,setWsForm]=useState(null);const [delWs,setDelWs]=useState(null);const [statusMgr,setStatusMgr]=useState(false);const [showImEx,setShowImEx]=useState(false)
  const [dragId,setDragId]=useState(null);const [adminOpen,setAdminOpen]=useState(false);const [fPriority,setFPriority]=useState('');const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true);const [showProf,setShowProf]=useState(false);const [toast,setToast]=useState(null);const [sidebarOpen,setSidebarOpen]=useState(true)
  const [lightMode,setLightMode]=useState(false);const [themeName,setThemeName]=useState('modern')
  const pRef=useRef();const th=T[themeName]
  const isM=themeName==='modern'

  useEffect(()=>{
    const sl=localStorage.getItem('taskflow-light-mode');const ss=localStorage.getItem('taskflow-sidebar-open');const st=localStorage.getItem('taskflow-theme')||'modern'
    if(sl!==null)setLightMode(sl==='true');if(ss!==null)setSidebarOpen(ss==='true');setThemeName(st)
  },[])
  useEffect(()=>{localStorage.setItem('taskflow-light-mode',String(lightMode))},[lightMode])
  useEffect(()=>{localStorage.setItem('taskflow-sidebar-open',String(sidebarOpen))},[sidebarOpen])
  useEffect(()=>{localStorage.setItem('taskflow-theme',themeName)},[themeName])

  const showToast=useCallback((msg,type='ok')=>{setToast({msg,type});setTimeout(()=>setToast(null),4000)},[])
  const activeWs=workspaces.find(w=>w.id===activeWsId)||null;const wsColor=activeWs?.color||'#6366f1';const statuses=activeWs?.custom_statuses||DEFAULT_STATUSES;const SC=scMap(statuses)

  useEffect(()=>{setTeamMemberId(null)},[activeWsId])
  useEffect(()=>{if(subView==='team'&&!teamMemberId&&wsMembers.length>0){const other=wsMembers.find(m=>m.id!==cu.id);setTeamMemberId(other?.id||wsMembers[0]?.id||null)}},[subView,wsMembers,teamMemberId,cu.id])

  const loadWorkspaces=useCallback(async()=>{try{const{data}=await getMyWorkspaces(cu.id);setWorkspaces(data||[]);if(data?.length>0&&!activeWsId)setActiveWsId(data[0].id)}catch(e){console.error('loadWorkspaces error:',e)}finally{setLoading(false)}},[cu.id,activeWsId])
  useEffect(()=>{loadWorkspaces()},[cu.id])
  useEffect(()=>{if(!activeWsId)return;Promise.all([getWorkspaceMembers(activeWsId),getTasks(activeWsId)]).then(([{data:mems},{data:tsks}])=>{setWsMembers(mems||[]);setTasks(tsks||[])})},[activeWsId])
  useEffect(()=>{const h=e=>{if(pRef.current&&!pRef.current.contains(e.target))setShowProf(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])

  const handleSaveWorkspace=async({id,name,description,color,icon,memberIds})=>{
    if(id){
      const{error}=await updateWorkspace(id,{name,description,color,icon});if(error){showToast('Update failed: '+error.message,'err');return}
      const cur=wsMembers.map(m=>m.id)
      for(const uid of memberIds){if(!cur.includes(uid))await addMemberToWorkspace(id,uid)}
      for(const uid of cur){if(!memberIds.includes(uid)&&uid!==cu.id)await removeMemberFromWorkspace(id,uid)}
      const{data:mems}=await getWorkspaceMembers(id);setWsMembers(mems||[]);showToast('Workspace updated! ✓')
    } else {
      const{data:ws,error}=await createWorkspace({name,description,color,icon,owner_id:cu.id});if(error||!ws){showToast('Create failed','err');return}
      for(const uid of [...new Set([cu.id,...memberIds])])await addMemberToWorkspace(ws.id,uid,uid===cu.id?'owner':'member')
      setActiveWsId(ws.id);showToast('Workspace created! ✓')
    }
    await loadWorkspaces()
  }
  const handleSaveStatuses=async ss=>{if(!activeWsId)return;const{error}=await updateWorkspace(activeWsId,{custom_statuses:ss});if(error){showToast('Failed','err');return};setWorkspaces(p=>p.map(w=>w.id===activeWsId?{...w,custom_statuses:ss}:w));showToast('Columns saved! ✓')}
  const handleDeleteWorkspace=async id=>{await deleteWorkspace(id);setActiveWsId(null);setDelWs(null);await loadWorkspaces()}

  const handleSaveTask=async td=>{
    if(td.id){
      const prev=tasks.find(t=>t.id===td.id)
      const{data,error}=await updateTask(td.id,td);if(error){showToast('Save failed','err');return}
      if(data)setTasks(p=>p.map(t=>t.id===data.id?data:t))
      await logActivity(td.id,cu.id,'Updated task')
      const becameDone=prev&&prev.status!==statuses[statuses.length-1]&&td.status===statuses[statuses.length-1]
      const recurring=td.recurrence_type&&td.recurrence_type!=='none'&&td.due_date
      if(becameDone&&recurring){
        const nextDue=nextRecurringDate(td.due_date,td.recurrence_type,td.recurrence_interval)
        if(nextDue){
          const clone={title:td.title,description:td.description||'',project:td.project||'',tags:td.tags||[],due_date:nextDue,recurrence_type:td.recurrence_type,recurrence_interval:td.recurrence_interval||1,status:statuses[0],priority:td.priority,assigned_to:td.assigned_to,workspace_id:td.workspace_id,created_by:cu.id}
          const{data:nextTask,error:nextErr}=await createTask(clone)
          if(!nextErr&&nextTask){setTasks(p=>[...p,nextTask]);await logActivity(nextTask.id,cu.id,'Auto-created recurring task');showToast(`✓ Done! Next recurring task → ${fmtDate(nextDue)} 🔁`);return}
        }
      }
      showToast('Task saved! ✓')
    } else {
      const{data,error}=await createTask(td);if(error){showToast('Create failed','err');return}
      if(data){setTasks(p=>[...p,data]);await logActivity(data.id,cu.id,'Created task')}
      const rl=recurringLabel(td.recurrence_type,td.recurrence_interval)
      showToast(rl?`Task created! Repeats: ${rl} 🔁`:'Task created! ✓')
    }
  }
  const handleDeleteTask=async id=>{await deleteTask(id);setTasks(p=>p.filter(t=>t.id!==id));setEditTask(null);setCreateStatus(null)}
  const handleDrop=useCallback(async st=>{if(!dragId)return;const task=tasks.find(t=>t.id===dragId);if(!task||task.status===st){setDragId(null);return};const{data}=await updateTask(dragId,{status:st});if(data)setTasks(p=>p.map(t=>t.id===dragId?data:t));await logActivity(dragId,cu.id,`Moved to ${st}`);setDragId(null)},[dragId,tasks,cu.id])
  const handleImport=async rows=>{
    const memberByName=name=>wsMembers.find(m=>m.name?.toLowerCase()===name?.toLowerCase()||m.email?.toLowerCase()===name?.toLowerCase())
    let added=0,skipped=0
    for(const r of rows){const assignee=memberByName(r.assigned_to_name);const payload={title:r.title,description:r.description,status:statuses.includes(r.status)?r.status:statuses[0],priority:PRIORITIES.includes(r.priority)?r.priority:'Medium',assigned_to:assignee?.id||cu.id,created_by:cu.id,workspace_id:activeWsId,project:r.project,tags:r.tags,due_date:r.due_date,recurrence_type:RECURRENCE_TYPES.includes(r.recurrence_type)?r.recurrence_type:'none',recurrence_interval:r.recurrence_interval||1};const{data,error}=await createTask(payload);if(data){setTasks(p=>[...p,data]);added++}else{skipped++;console.warn('Import skip:',error?.message)}}
    showToast(`Imported ${added} task${added!==1?'s':''}${skipped?` · ${skipped} skipped`:''}`,added>0?'ok':'err')
  }

  const openNewTask=s=>{setCreateStatus(s||statuses[0]);setEditTask(null)}
  const isFormOpen=createStatus!==null||editTask!==null
  const baseFilter=t=>{if(fPriority&&t.priority!==fPriority)return false;if(search&&!t.title.toLowerCase().includes(search.toLowerCase()))return false;return true}
  const myBoardTasks=tasks.filter(t=>baseFilter(t)&&isOnMyBoard(t,cu.id))
  const allTasks=tasks.filter(baseFilter)
  const selMember=wsMembers.find(m=>m.id===teamMemberId)||null
  const teamTasks=allTasks.filter(t=>t.assigned_to===teamMemberId&&t.created_by!==teamMemberId)
  const teamSelfTasks=allTasks.filter(t=>t.created_by===teamMemberId&&(!t.assigned_to||t.assigned_to===teamMemberId))
  const recurringTasks=tasks.filter(t=>t.recurrence_type&&t.recurrence_type!=='none')

  if(loading)return(<div style={{minHeight:'100vh',background:th.bgApp,display:'flex',alignItems:'center',justifyContent:'center',color:th.textSub,fontFamily:th.font}}><div style={{textAlign:'center'}}><div style={{width:44,height:44,borderRadius:'13px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,margin:'0 auto 16px',boxShadow:isM?'0 8px 24px rgba(99,102,241,0.4)':'none'}}>✦</div><div style={{fontSize:14}}>Loading TaskFlow…</div></div></div>)

  const railBtn=(title,onClick,children,extraStyle={})=>(
    <div title={title} onClick={onClick} style={{width:40,height:40,borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,cursor:'pointer',transition:th.trans,...extraStyle}}>{children}</div>
  )

  return(
    <div style={{minHeight:'100vh',background:th.bgApp,fontFamily:th.font,color:th.text,display:'flex',WebkitFontSmoothing:'antialiased',filter:lightMode?'invert(1) hue-rotate(180deg)':'none',transition:'filter .2s ease',position:'relative'}} onDragEnd={()=>setDragId(null)}>

      {/* Ambient glow for modern theme */}
      {isM&&activeWs&&<>
        <div style={{position:'fixed',top:0,left:0,right:0,height:'100vh',background:`radial-gradient(ellipse 60% 40% at 20% 0%, ${wsColor}07 0%, transparent 60%)`,pointerEvents:'none',zIndex:0}}/>
        <div style={{position:'fixed',bottom:0,right:0,width:'50%',height:'50vh',background:`radial-gradient(ellipse 50% 40% at 80% 100%, ${wsColor}05 0%, transparent 60%)`,pointerEvents:'none',zIndex:0}}/>
      </>}

      {/* Toast */}
      {toast&&<div style={{position:'fixed',bottom:24,right:24,zIndex:9999,background:toast.type==='ok'?'linear-gradient(135deg,#10b981,#059669)':'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',borderRadius:th.radius,padding:'12px 20px',fontSize:14,fontWeight:600,boxShadow:th.shadowLg,display:'flex',alignItems:'center',gap:8,maxWidth:400,border:'1px solid rgba(255,255,255,0.15)'}}><span>{toast.type==='ok'?'✓':'⚠'}</span><span>{toast.msg}</span></div>}

      {/* Icon Rail */}
      <div style={{width:64,background:th.bgRail,borderRight:`1px solid ${th.border}`,display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 0',gap:8,flexShrink:0,backdropFilter:isM?th.blur:'none',WebkitBackdropFilter:isM?th.blur:'none',position:'relative',zIndex:10}}>
        <div style={{width:40,height:40,borderRadius:'12px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,marginBottom:8,cursor:'pointer',boxShadow:isM?'0 8px 20px rgba(99,102,241,0.45)':'none',transition:th.trans}} onClick={()=>setActiveWsId(null)}>✦</div>
        <div style={{width:32,height:1,background:th.border,marginBottom:4}}/>
        {workspaces.map(ws=>(
          <div key={ws.id} title={ws.name} onClick={()=>{setActiveWsId(ws.id);setSubView('board');setFPriority('');setSearch('')}}
            style={{width:40,height:40,borderRadius:'12px',background:activeWsId===ws.id?ws.color+'33':isM?'rgba(255,255,255,0.03)':'#0d1627',border:`1.5px solid ${activeWsId===ws.id?ws.color:th.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,cursor:'pointer',transition:th.trans,boxShadow:activeWsId===ws.id&&isM?`0 0 20px ${ws.color}33`:'none'}}
            onMouseEnter={e=>{if(activeWsId!==ws.id){e.currentTarget.style.background=isM?'rgba(255,255,255,0.07)':'#131f35';e.currentTarget.style.borderColor=ws.color+'66'}}}
            onMouseLeave={e=>{if(activeWsId!==ws.id){e.currentTarget.style.background=isM?'rgba(255,255,255,0.03)':'#0d1627';e.currentTarget.style.borderColor=th.border}}}>
            {ws.icon}
          </div>
        ))}
        <div title="New Workspace" onClick={()=>setWsForm('new')} style={{width:40,height:40,borderRadius:'12px',border:`1.5px dashed ${th.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,cursor:'pointer',color:th.textMut,transition:th.trans}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.color='#6366f1';e.currentTarget.style.background='rgba(99,102,241,0.1)'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.color=th.textMut;e.currentTarget.style.background='transparent'}}>+</div>
        <div style={{flex:1}}/>
        {isAdmin&&<div title="Admin Panel" onClick={()=>setAdminOpen(true)} style={{width:40,height:40,borderRadius:'12px',background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,cursor:'pointer',marginBottom:4,transition:th.trans,boxShadow:isM?'0 4px 12px rgba(245,158,11,0.15)':'none'}}>🛡️</div>}
        {/* ─── THEME TOGGLE ─── click to switch Modern ↔ Classic instantly */}
        <div
          title={isM?'Switch to Classic UI (rollback)':'Switch to Modern UI'}
          onClick={()=>setThemeName(n=>n==='modern'?'classic':'modern')}
          style={{width:40,height:40,borderRadius:'12px',background:isM?'rgba(99,102,241,0.15)':'#131f35',border:`1px solid ${isM?'rgba(99,102,241,0.35)':th.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,cursor:'pointer',marginBottom:4,color:isM?'#818cf8':th.textSub,transition:th.trans,boxShadow:isM?'0 4px 12px rgba(99,102,241,0.15)':'none'}}>
          {isM?'◆':'◇'}
        </div>
        <button title={lightMode?'Dark mode':'Light mode'} onClick={()=>setLightMode(v=>!v)} style={{width:40,height:40,borderRadius:'12px',background:isM?'rgba(255,255,255,0.05)':'#131f35',border:`1px solid ${th.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,cursor:'pointer',marginBottom:8,color:th.textSub,transition:th.trans,fontFamily:th.font}}>{lightMode?'🌙':'☀️'}</button>
        <div ref={pRef} style={{position:'relative'}}>
          <div onClick={()=>setShowProf(p=>!p)} style={{cursor:'pointer'}}><Avatar user={enrich(cu)} size={36} th={th}/></div>
          {showProf&&(
            <div style={{position:'absolute',bottom:0,left:52,background:th.bgModal,border:`1px solid ${th.border}`,borderRadius:th.radius,width:220,boxShadow:th.shadowLg,zIndex:500,overflow:'hidden',backdropFilter:isM?th.blur:'none',WebkitBackdropFilter:isM?th.blur:'none'}}>
              <div style={{padding:'12px 14px',borderBottom:`1px solid ${th.border}`,display:'flex',gap:9,alignItems:'center'}}>
                <Avatar user={enrich(cu)} size={36} th={th}/>
                <div><div style={{fontSize:13,fontWeight:700,color:th.text}}>{cu.user_metadata?.full_name||cu.email}</div><div style={{fontSize:11,color:th.textSub}}>{cu.email}</div><div style={{fontSize:10,color:'#10b981',marginTop:2,fontWeight:600}}>● Google Auth{isAdmin?' · Admin':''}</div></div>
              </div>
              {isAdmin&&<button onClick={()=>{setAdminOpen(true);setShowProf(false)}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',color:'#f59e0b',fontSize:13,textAlign:'left',fontWeight:600,transition:th.trans,fontFamily:th.font}} onMouseEnter={e=>e.currentTarget.style.background=isM?'rgba(255,255,255,0.05)':'#1e2937'} onMouseLeave={e=>e.currentTarget.style.background='none'}>🛡️ Admin Panel</button>}
              <button onClick={()=>{setShowProf(false);onSignOut()}} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 14px',background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontSize:13,transition:th.trans,fontFamily:th.font}} onMouseEnter={e=>e.currentTarget.style.background=isM?'rgba(255,255,255,0.05)':'#1e2937'} onMouseLeave={e=>e.currentTarget.style.background='none'}>⎋ Sign Out</button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div style={{width:sidebarOpen?230:0,background:th.bgSide,borderRight:sidebarOpen?`1px solid ${th.border}`:'none',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden',transition:'width 0.25s cubic-bezier(0.4,0,0.2,1)',backdropFilter:isM?th.blur:'none',WebkitBackdropFilter:isM?th.blur:'none',position:'relative',zIndex:9}}>
        {activeWs?(
          <>
            <div style={{padding:'16px 14px',borderBottom:`1px solid ${th.border}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <div style={{width:30,height:30,borderRadius:'9px',background:wsColor+'22',border:`1px solid ${wsColor}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,boxShadow:isM?`0 4px 12px ${wsColor}22`:'none'}}>{activeWs.icon}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:th.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:isM?'-0.01em':'normal'}}>{activeWs.name}</div><div style={{fontSize:10,color:th.textSub}}>{wsMembers.length} members · {tasks.length} tasks{recurringTasks.length>0?` · 🔁 ${recurringTasks.length}`:''}</div></div>
              </div>
              <div style={{display:'flex',gap:5}}>
                <button onClick={()=>setWsForm({...activeWs,memberIds:wsMembers.map(m=>m.id)})} style={{flex:1,background:wsColor+'18',border:`1px solid ${wsColor}33`,borderRadius:'7px',padding:'5px 0',color:wsColor,cursor:'pointer',fontSize:11,fontWeight:600,transition:th.transFast,fontFamily:th.font}}>✏️ Edit</button>
                <button onClick={()=>setStatusMgr(true)} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:'7px',padding:'5px 8px',color:th.textSub,cursor:'pointer',fontSize:11,transition:th.transFast,fontFamily:th.font}}>⚙️</button>
                {activeWs.owner_id===cu.id&&<button onClick={()=>setDelWs(activeWs)} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:'7px',padding:'5px 7px',color:'#ef4444',cursor:'pointer',fontSize:11,transition:th.transFast,fontFamily:th.font}}>🗑</button>}
              </div>
            </div>
            <div style={{padding:'10px 8px',flex:1,overflowY:'auto'}}>
              <div style={{margin:'0 0 8px 10px'}}>
                {[{c:'#818cf8',icon:'📥',label:'Assigned to me'},{c:'#f59e0b',icon:'📤',label:'Delegated by me'},{c:'#6366f1',icon:'🔁',label:'Recurring task'}].map(x=>(
                  <div key={x.label} style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    <div style={{width:3,height:12,borderRadius:2,background:x.c,flexShrink:0,boxShadow:isM?`0 0 6px ${x.c}88`:'none'}}/>
                    <span style={{fontSize:10,color:th.textSub}}>{x.icon} {x.label}</span>
                  </div>
                ))}
              </div>
              <div style={{height:1,background:th.border,margin:'0 0 8px'}}/>
              {[{id:'board',label:'My Board',icon:'⊞'},{id:'team',label:'Team View',icon:'⊛'},{id:'recurring',label:'Recurring Tasks',icon:'🔁'},{id:'list',label:'All Tasks',icon:'☰'},{id:'dashboard',label:'Dashboard',icon:'⬡'}].map(n=>(
                <button key={n.id} onClick={()=>setSubView(n.id)}
                  style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'8px 10px',borderRadius:th.radiusSm,border:'none',cursor:'pointer',marginBottom:2,fontSize:13,textAlign:'left',fontWeight:subView===n.id?700:500,background:subView===n.id?wsColor+'22':'transparent',color:subView===n.id?wsColor:th.textSub,transition:th.trans,boxShadow:subView===n.id&&isM?`0 2px 8px ${wsColor}18`:'none',fontFamily:th.font}}
                  onMouseEnter={e=>{if(subView!==n.id)e.currentTarget.style.background=isM?'rgba(255,255,255,0.04)':'#131f35'}}
                  onMouseLeave={e=>{if(subView!==n.id)e.currentTarget.style.background='transparent'}}>
                  <span style={{fontSize:15}}>{n.icon}</span>{n.label}
                  {n.id==='recurring'&&recurringTasks.length>0&&<span style={{marginLeft:'auto',background:wsColor+'22',color:wsColor,borderRadius:10,padding:'1px 7px',fontSize:10,fontWeight:700}}>{recurringTasks.length}</span>}
                </button>
              ))}
              <div style={{height:1,background:th.border,margin:'8px 0'}}/>
              <div style={{padding:'0 10px',marginBottom:6,fontSize:10,color:th.textMut,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>Members ({wsMembers.length})</div>
              {wsMembers.map(u=>(
                <div key={u.id} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 10px',borderRadius:8}}>
                  <Avatar user={enrich(u)} size={20} th={th}/>
                  <span style={{fontSize:12,color:u.id===cu.id?wsColor:th.textSub,fontWeight:u.id===cu.id?700:400,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(u.name||u.email||'').split(' ')[0]}{u.id===cu.id?' ✦':''}</span>
                </div>
              ))}
            </div>
            <div style={{padding:'12px 8px',borderTop:`1px solid ${th.border}`,display:'flex',flexDirection:'column',gap:6}}>
              <button onClick={()=>openNewTask()} style={{width:'100%',background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:th.radiusSm,padding:'10px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,boxShadow:`0 6px 20px ${wsColor}44`,transition:th.trans,fontFamily:th.font}}>
                <span style={{fontSize:17}}>+</span> New Task
              </button>
              <button onClick={()=>setShowImEx(true)} style={{width:'100%',background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'8px',color:th.textSub,fontWeight:600,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:th.trans,fontFamily:th.font}}>📊 Import / Export CSV</button>
            </div>
          </>
        ):(
          <div style={{padding:14,flex:1,overflowY:'auto'}}>
            <div style={{fontSize:11,color:th.textSub,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Your Workspaces</div>
            {workspaces.map(ws=>(
              <div key={ws.id} onClick={()=>setActiveWsId(ws.id)} style={{background:th.bgCard,border:`1.5px solid ${th.border}`,borderRadius:th.radius,padding:'12px 14px',cursor:'pointer',marginBottom:8,transition:th.trans,backdropFilter:isM?th.blurSm:'none'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=ws.color;e.currentTarget.style.background=th.bgCardH;if(isM)e.currentTarget.style.boxShadow=`0 8px 24px ${ws.color}18`}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.background=th.bgCard;e.currentTarget.style.boxShadow='none'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:32,height:32,borderRadius:'9px',background:ws.color+'22',border:`1px solid ${ws.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>{ws.icon}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:th.text}}>{ws.name}</div><div style={{fontSize:11,color:th.textSub}}>{ws.description}</div></div>
                </div>
              </div>
            ))}
            <button onClick={()=>setWsForm('new')} style={{width:'100%',background:'transparent',border:`1.5px dashed ${th.border}`,borderRadius:th.radius,padding:'12px',color:th.textMut,cursor:'pointer',fontSize:13,fontWeight:600,transition:th.trans,fontFamily:th.font}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.color='#6366f1'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.color=th.textMut}}>+ Create Workspace</button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',zIndex:1}}>
        {/* Topbar */}
        <div style={{background:th.bgTop,borderBottom:`1px solid ${th.border}`,padding:'0 18px',height:54,display:'flex',alignItems:'center',gap:10,flexShrink:0,backdropFilter:isM?th.blur:'none',WebkitBackdropFilter:isM?th.blur:'none'}}>
          <button onClick={()=>setSidebarOpen(v=>!v)} style={{background:isM?'rgba(255,255,255,0.05)':'#131f35',border:`1px solid ${th.border}`,borderRadius:'8px',padding:'5px 9px',color:th.textSub,cursor:'pointer',fontSize:12,fontWeight:700,transition:th.trans,fontFamily:th.font}}>{sidebarOpen?'◀':'▶'}</button>
          {activeWs?(
            <>
              <button onClick={()=>setActiveWsId(null)} style={{background:'none',border:'none',color:th.textSub,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:th.font}}>All Workspaces</button>
              <span style={{color:th.textMut}}>/</span>
              <span style={{color:wsColor}}>{activeWs.icon}</span>
              <span style={{fontSize:13,fontWeight:700,color:th.text,letterSpacing:isM?'-0.01em':'normal'}}>{activeWs.name}</span>
              <div style={{width:1,height:20,background:th.border,margin:'0 4px'}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search…" style={{background:isM?'rgba(255,255,255,0.05)':'#0d1627',border:`1px solid ${th.border}`,borderRadius:'8px',padding:'5px 10px',color:th.text,fontSize:12,outline:'none',width:160,fontFamily:th.font,backdropFilter:isM?th.blurSm:'none',transition:th.trans}}/>
              <select value={fPriority} onChange={e=>setFPriority(e.target.value)} style={{background:isM?'rgba(255,255,255,0.05)':'#0d1627',border:`1px solid ${th.border}`,borderRadius:'8px',padding:'4px 7px',color:th.textSub,fontSize:11,cursor:'pointer',outline:'none',fontFamily:th.font}}>
                <option value="">All Priority</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}
              </select>
              {(fPriority||search)&&<button onClick={()=>{setFPriority('');setSearch('')}} style={{background:'#ef444420',border:'1px solid #ef444440',borderRadius:'6px',padding:'3px 9px',color:'#ef4444',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:th.font}}>Clear ✕</button>}
            </>
          ):<span style={{fontSize:15,fontWeight:700,color:th.text,letterSpacing:isM?'-0.02em':'normal'}}>All Workspaces</span>}
          <div style={{flex:1}}/>
          <button onClick={()=>setWsForm('new')} style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none',borderRadius:'8px',padding:'6px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:isM?'0 4px 16px rgba(99,102,241,0.35)':'none',transition:th.trans}}>+ New Workspace</button>
        </div>

        <div style={{flex:1,overflow:'auto',padding:20}}>

          {/* HOME */}
          {!activeWs&&(
            <div>
              <h1 style={{fontSize:22,fontWeight:800,color:th.text,margin:'0 0 20px',letterSpacing:isM?'-0.03em':'normal'}}>Your Workspaces</h1>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
                {workspaces.map(ws=>(
                  <div key={ws.id} onClick={()=>setActiveWsId(ws.id)} style={{background:th.bgCard,border:`1.5px solid ${th.border}`,borderRadius:th.radius,padding:18,cursor:'pointer',transition:th.trans,position:'relative',overflow:'hidden',backdropFilter:isM?th.blurSm:'none'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=ws.color;e.currentTarget.style.background=th.bgCardH;if(isM)e.currentTarget.style.boxShadow=`0 16px 48px ${ws.color}18, 0 0 0 1px ${ws.color}22`}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.background=th.bgCard;e.currentTarget.style.boxShadow='none'}}>
                    <div style={{position:'absolute',top:0,left:0,right:0,height:isM?3:2,background:isM?`linear-gradient(90deg,${ws.color},${ws.color}66)`:ws.color}}/>
                    {isM&&<div style={{position:'absolute',top:0,right:0,width:'60%',height:'100%',background:`radial-gradient(ellipse at top right, ${ws.color}07 0%, transparent 70%)`,pointerEvents:'none'}}/>}
                    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
                      <div style={{width:40,height:40,borderRadius:'11px',background:ws.color+'22',border:`1px solid ${ws.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,boxShadow:isM?`0 6px 16px ${ws.color}22`:'none'}}>{ws.icon}</div>
                      <div><div style={{fontSize:14,fontWeight:700,color:th.text,letterSpacing:isM?'-0.02em':'normal'}}>{ws.name}</div><div style={{fontSize:11,color:th.textSub}}>{ws.description}</div></div>
                    </div>
                  </div>
                ))}
                <div onClick={()=>setWsForm('new')} style={{background:th.bgCard,border:`1.5px dashed ${th.border}`,borderRadius:th.radius,padding:'28px 20px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:10,transition:th.trans,backdropFilter:isM?th.blurSm:'none'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.background=th.bgCardH;if(isM)e.currentTarget.style.boxShadow='0 8px 24px rgba(99,102,241,0.1)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=th.border;e.currentTarget.style.background=th.bgCard;e.currentTarget.style.boxShadow='none'}}>
                  <div style={{width:44,height:44,borderRadius:'12px',border:`2px dashed ${th.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:th.textMut}}>+</div>
                  <div style={{fontSize:13,fontWeight:600,color:th.textMut}}>Create Workspace</div>
                </div>
              </div>
            </div>
          )}

          {/* MY BOARD */}
          {activeWs&&subView==='board'&&(
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div>
                  <h1 style={{fontSize:20,fontWeight:800,color:th.text,margin:0,letterSpacing:isM?'-0.03em':'normal'}}>My Board — {activeWs.name}</h1>
                  <p style={{margin:'4px 0 0',fontSize:12,color:th.textSub}}>{myBoardTasks.length} tasks · <span style={{color:'#818cf8'}}>📥 assigned to me</span> · <span style={{color:'#f59e0b'}}>📤 delegated</span> · <span style={{color:'#6366f1'}}>🔁 recurring</span></p>
                </div>
                <button onClick={()=>openNewTask()} style={{background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:th.radiusSm,padding:'8px 18px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',boxShadow:`0 6px 20px ${wsColor}44`,transition:th.trans}}>+ New Task</button>
              </div>
              <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:16,alignItems:'flex-start'}}>
                {statuses.map(st=>(<DropColumn key={st} status={st} tasks={myBoardTasks.filter(t=>t.status===st)} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={setEditTask} onDelete={handleDeleteTask} dragId={dragId} onDragStart={setDragId} onDrop={handleDrop} onAddTask={s=>openNewTask(s)} th={th}/>))}
              </div>
            </div>
          )}

          {/* RECURRING */}
          {activeWs&&subView==='recurring'&&(
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
                <div>
                  <h1 style={{fontSize:20,fontWeight:800,color:th.text,margin:0,letterSpacing:isM?'-0.03em':'normal'}}>🔁 Recurring Tasks</h1>
                  <p style={{margin:'4px 0 0',fontSize:12,color:th.textSub}}>{recurringTasks.length} recurring · Auto-creates next when marked Done</p>
                </div>
                <button onClick={()=>openNewTask()} style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none',borderRadius:th.radiusSm,padding:'8px 18px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',boxShadow:'0 6px 20px rgba(99,102,241,0.4)',transition:th.trans}}>+ New Recurring Task</button>
              </div>
              {recurringTasks.length===0?(
                <div style={{textAlign:'center',padding:60,border:`2px dashed ${th.border}`,borderRadius:th.radius,color:th.textMut,backdropFilter:isM?th.blurSm:'none'}}>
                  <div style={{fontSize:40,marginBottom:12}}>🔁</div>
                  <div style={{fontSize:15,fontWeight:700,color:th.textSub,marginBottom:8}}>No recurring tasks yet</div>
                  <div style={{fontSize:13,color:th.textMut,marginBottom:20}}>Create a task and set a recurrence. Mark Done → next auto-creates.</div>
                  <button onClick={()=>openNewTask()} style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none',borderRadius:th.radiusSm,padding:'10px 24px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13}}>Create First Recurring Task</button>
                </div>
              ):(
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
                  {recurringTasks.map(t=>{
                    const assignee=getUser(t.assigned_to,wsMembers);const overdue=isOverdue(t.due_date);const rl=recurringLabel(t.recurrence_type,t.recurrence_interval);const nextDue=nextRecurringDate(t.due_date,t.recurrence_type,t.recurrence_interval);const statusColor=SC[t.status]||wsColor
                    return(
                      <div key={t.id} onClick={()=>setEditTask(t)} style={{background:th.bgCard,border:`1.5px solid rgba(99,102,241,0.2)`,borderRadius:th.radius,padding:16,cursor:'pointer',transition:th.trans,position:'relative',overflow:'hidden',backdropFilter:isM?th.blurSm:'none'}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(99,102,241,0.4)';e.currentTarget.style.background=th.bgCardH;if(isM)e.currentTarget.style.boxShadow='0 12px 40px rgba(99,102,241,0.12)'}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(99,102,241,0.2)';e.currentTarget.style.background=th.bgCard;e.currentTarget.style.boxShadow='none'}}>
                        <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,#6366f1,#8b5cf6)'}}/>
                        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:8}}>
                          <div style={{fontSize:14,fontWeight:700,color:th.text,lineHeight:1.4,flex:1}}>{t.title}</div>
                          <span style={{background:'rgba(99,102,241,0.15)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.25)',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700,whiteSpace:'nowrap',flexShrink:0}}>🔁 {rl}</span>
                        </div>
                        {t.description&&<div style={{fontSize:12,color:th.textSub,marginBottom:10,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{t.description}</div>}
                        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                          <Pill label={t.status} color={statusColor} sm/><Pill label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]} sm/>
                          {overdue&&<Pill label="⚠ Overdue" color="#ef4444" sm/>}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,background:'rgba(0,0,0,0.2)',borderRadius:th.radiusSm,padding:'10px 12px'}}>
                          <div><div style={{fontSize:10,color:th.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Current Due</div><div style={{fontSize:12,color:overdue?'#ef4444':th.textSub,fontWeight:600}}>{t.due_date?fmtDate(t.due_date):'Not set'}</div></div>
                          <div><div style={{fontSize:10,color:th.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Next Occurrence</div><div style={{fontSize:12,color:'#10b981',fontWeight:600}}>{nextDue?fmtDate(nextDue):'—'}</div></div>
                          <div><div style={{fontSize:10,color:th.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Assigned To</div><div style={{display:'flex',alignItems:'center',gap:4}}><Avatar user={assignee} size={16} th={th}/><span style={{fontSize:12,color:th.textSub}}>{assignee?.id===cu?.id?'Me':assignee?.name?.split(' ')[0]||'—'}</span></div></div>
                          <div><div style={{fontSize:10,color:th.textMut,fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Action</div><div style={{fontSize:11,color:'#6366f1'}}>Mark Done → auto-creates next</div></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TEAM VIEW */}
          {activeWs&&subView==='team'&&(
            <div>
              <div style={{marginBottom:20}}>
                <h1 style={{fontSize:20,fontWeight:800,color:th.text,margin:0,letterSpacing:isM?'-0.03em':'normal'}}>Team View — {activeWs.name}</h1>
                <p style={{margin:'4px 0 0',fontSize:12,color:th.textSub}}>Select a member to see their assigned workload</p>
              </div>
              {wsMembers.filter(m=>m.id!==cu.id).length===0?(
                <div style={{textAlign:'center',padding:40,color:th.textMut,fontSize:13,border:`2px dashed ${th.border}`,borderRadius:th.radius}}>No other team members yet. Edit the workspace to add members.</div>
              ):(
                <>
                  <div style={{display:'flex',gap:10,marginBottom:24,flexWrap:'wrap'}}>
                    {wsMembers.filter(m=>m.id!==cu.id).map(m=>{
                      const eu=enrich(m);const sel=m.id===teamMemberId;const mAssigned=allTasks.filter(t=>t.assigned_to===m.id&&t.created_by!==m.id).length
                      return(
                        <div key={m.id} onClick={()=>setTeamMemberId(m.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderRadius:th.radiusSm,cursor:'pointer',border:`2px solid ${sel?wsColor:th.border}`,background:sel?wsColor+'18':th.bgCard,transition:th.trans,minWidth:160,boxShadow:sel&&isM?`0 8px 24px ${wsColor}18`:'none'}}>
                          <Avatar user={eu} size={34} th={th}/>
                          <div><div style={{fontSize:13,fontWeight:700,color:sel?wsColor:th.text}}>{m.name||m.email.split('@')[0]}</div><div style={{fontSize:11,color:th.textSub}}>{mAssigned} task{mAssigned!==1?'s':''} assigned</div></div>
                          {sel&&<div style={{width:8,height:8,borderRadius:'50%',background:wsColor,marginLeft:'auto',boxShadow:isM?`0 0 8px ${wsColor}`:'none'}}/>}
                        </div>
                      )
                    })}
                  </div>
                  {selMember&&(
                    <div style={{background:th.bgCard,border:`1.5px solid ${wsColor}44`,borderRadius:th.radius,padding:20,backdropFilter:isM?th.blurSm:'none'}}>
                      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${th.border}`}}>
                        <Avatar user={enrich(selMember)} size={52} th={th}/>
                        <div style={{flex:1}}><div style={{fontSize:18,fontWeight:800,color:th.text,letterSpacing:isM?'-0.03em':'normal'}}>{selMember.name||selMember.email}</div><div style={{fontSize:12,color:th.textSub}}>{selMember.email}</div></div>
                        <div style={{display:'flex',gap:20}}>
                          {[{l:'Assigned',v:teamTasks.length,c:wsColor},{l:'Own tasks',v:teamSelfTasks.length,c:th.textSub},{l:'Completed',v:teamTasks.filter(t=>t.status===statuses[statuses.length-1]).length,c:'#10b981'},{l:'Overdue',v:teamTasks.filter(t=>isOverdue(t.due_date)).length,c:'#ef4444'}].map(x=>(
                            <div key={x.l} style={{textAlign:'center',minWidth:60}}><div style={{fontSize:22,fontWeight:800,color:x.c}}>{x.v}</div><div style={{fontSize:9,color:th.textSub,marginTop:2,fontWeight:600}}>{x.l}</div></div>
                          ))}
                        </div>
                      </div>
                      {teamTasks.length===0?(
                        <div style={{textAlign:'center',padding:32,color:th.textMut,fontSize:13,border:`2px dashed ${th.border}`,borderRadius:th.radiusSm}}>No tasks assigned to {selMember.name?.split(' ')[0]||'this member'} yet.</div>
                      ):(
                        <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:4,alignItems:'flex-start'}}>
                          {statuses.map(st=>(<DropColumn key={st} status={st} tasks={teamTasks.filter(t=>t.status===st)} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={setEditTask} onDelete={handleDeleteTask} dragId={dragId} onDragStart={setDragId} onDrop={handleDrop} onAddTask={s=>openNewTask(s)} th={th}/>))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ALL TASKS LIST */}
          {activeWs&&subView==='list'&&(
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
                <h1 style={{fontSize:20,fontWeight:800,color:th.text,margin:0,letterSpacing:isM?'-0.03em':'normal'}}>All Tasks — {activeWs.name}</h1>
                <button onClick={()=>setShowImEx(true)} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radiusSm,padding:'7px 14px',color:th.textSub,cursor:'pointer',fontSize:12,fontWeight:600,transition:th.trans}}>📊 Import / Export</button>
              </div>
              <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radius,overflow:'hidden',backdropFilter:isM?th.blurSm:'none'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{borderBottom:`1px solid ${th.border}`}}>{['Task','Status','Priority','Creator','Assignee','Due','Recurrence',''].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,color:th.textSub,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {allTasks.map(t=>{
                      const asgn=getUser(t.assigned_to,wsMembers);const crea=getUser(t.created_by,wsMembers);const ov=isOverdue(t.due_date);const col=SC[t.status]||wsColor;const rl=recurringLabel(t.recurrence_type,t.recurrence_interval)
                      return(
                        <tr key={t.id} style={{borderBottom:`1px solid ${th.border}`,transition:th.transFast}} onMouseEnter={e=>e.currentTarget.style.background=th.bgCardH} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <td style={{padding:'11px 14px'}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:3,height:28,borderRadius:2,background:PC[t.priority],flexShrink:0}}/><div style={{fontSize:13,fontWeight:600,color:th.text}}>{t.title}</div></div></td>
                          <td style={{padding:'11px 8px'}}><Pill label={t.status} color={col} sm/></td>
                          <td style={{padding:'11px 8px'}}><Pill label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]} sm/></td>
                          <td style={{padding:'11px 8px'}}><div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={crea} size={20} th={th}/><span style={{fontSize:11,color:th.textSub}}>{crea?.name?.split(' ')[0]||'?'}</span></div></td>
                          <td style={{padding:'11px 8px'}}>{asgn&&asgn.id!==t.created_by?<div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={asgn} size={20} th={th}/><span style={{fontSize:11,color:'#818cf8'}}>{asgn.name?.split(' ')[0]}</span></div>:<span style={{fontSize:11,color:th.textMut}}>—</span>}</td>
                          <td style={{padding:'11px 8px'}}><span style={{fontSize:12,color:ov?'#ef4444':th.textSub,fontWeight:ov?700:400}}>{t.due_date?fmtDate(t.due_date):'—'}</span></td>
                          <td style={{padding:'11px 8px'}}>{rl?<span style={{fontSize:11,color:'#6366f1',background:'rgba(99,102,241,0.15)',borderRadius:6,padding:'2px 7px',fontWeight:600}}>🔁 {rl}</span>:<span style={{fontSize:11,color:th.textMut}}>—</span>}</td>
                          <td style={{padding:'11px 8px'}}><button onClick={()=>setEditTask(t)} style={{background:wsColor+'22',border:`1px solid ${wsColor}44`,borderRadius:6,padding:'4px 8px',color:wsColor,cursor:'pointer',fontSize:11,fontWeight:600}}>✏️</button></td>
                        </tr>
                      )
                    })}
                    {allTasks.length===0&&<tr><td colSpan={8} style={{padding:40,textAlign:'center',color:th.textMut,fontSize:13}}>No tasks yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DASHBOARD */}
          {activeWs&&subView==='dashboard'&&(
            <div>
              <h1 style={{fontSize:20,fontWeight:800,color:th.text,margin:'0 0 20px',letterSpacing:isM?'-0.03em':'normal'}}>Dashboard — {activeWs.name}</h1>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:18}}>
                {[{l:'Total Tasks',v:tasks.length,c:wsColor},{l:'On My Board',v:myBoardTasks.length,c:'#818cf8'},{l:'Recurring',v:recurringTasks.length,c:'#6366f1'},{l:'I Delegated',v:tasks.filter(t=>t.created_by===cu.id&&t.assigned_to&&t.assigned_to!==cu.id).length,c:'#f59e0b'},{l:'Overdue',v:tasks.filter(t=>isOverdue(t.due_date)).length,c:'#ef4444'}].map(x=>(
                  <div key={x.l} style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radius,padding:'16px 18px',backdropFilter:isM?th.blurSm:'none',boxShadow:isM?th.cardShadow(x.c):'none',transition:th.trans}}>
                    <div style={{fontSize:28,fontWeight:800,color:x.c,marginBottom:2,letterSpacing:'-0.02em'}}>{x.v}</div>
                    <div style={{fontSize:12,fontWeight:700,color:th.text}}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radius,padding:16,backdropFilter:isM?th.blurSm:'none'}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:th.text}}>Status Breakdown</div>
                  {statuses.map(s=>{const c=tasks.filter(t=>t.status===s).length;const p=tasks.length?Math.round((c/tasks.length)*100):0;return(
                    <div key={s} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:12,color:th.textSub}}>{s}</span><span style={{fontSize:12,color:SC[s],fontWeight:700}}>{c}</span></div>
                      <div style={{height:5,background:th.bgCardH,borderRadius:3,overflow:'hidden'}}><div style={{width:p+'%',height:'100%',background:SC[s],borderRadius:3,boxShadow:isM?`0 0 8px ${SC[s]}88`:'none'}}/></div>
                    </div>
                  )})}
                </div>
                <div style={{background:th.bgCard,border:`1px solid ${th.border}`,borderRadius:th.radius,padding:16,backdropFilter:isM?th.blurSm:'none'}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:th.text}}>Workload by Member</div>
                  {wsMembers.map(m=>{const assigned=tasks.filter(t=>t.assigned_to===m.id&&t.created_by!==m.id).length;const own=tasks.filter(t=>t.created_by===m.id&&(!t.assigned_to||t.assigned_to===m.id)).length;return(
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <Avatar user={enrich(m)} size={24} th={th}/>
                      <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:th.text,marginBottom:2}}>{m.name?.split(' ')[0]||m.email}</div><div style={{display:'flex',gap:4}}><span style={{fontSize:10,color:'#818cf8'}}>{assigned} assigned</span><span style={{fontSize:10,color:th.textMut}}>·</span><span style={{fontSize:10,color:th.textSub}}>{own} own</span></div></div>
                    </div>
                  )})}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isFormOpen&&activeWs&&(<TaskFormModal open onClose={()=>{setCreateStatus(null);setEditTask(null)}} task={editTask} ws={activeWs} wsMembers={wsMembers} cu={cu} statuses={statuses} defaultStatus={createStatus||statuses[0]} onSave={handleSaveTask} onDelete={handleDeleteTask} th={th}/>)}
      {wsForm&&(<WorkspaceFormModal open onClose={()=>setWsForm(null)} ws={wsForm==='new'?null:wsForm} allProfiles={allProfiles} cu={cu} onSave={handleSaveWorkspace} currentMemberIds={wsMembers.map(m=>m.id)} th={th}/>)}
      <StatusManager open={statusMgr} onClose={()=>setStatusMgr(false)} statuses={statuses} wsColor={wsColor} onSave={handleSaveStatuses} th={th}/>
      {showImEx&&activeWs&&(<ImportExportModal open onClose={()=>setShowImEx(false)} tasks={tasks} wsMembers={wsMembers} statuses={statuses} wsName={activeWs.name} onImport={handleImport} th={th}/>)}
      <Confirm open={!!delWs} icon="⚠️" title="Delete Workspace?" body={`Delete "${delWs?.name}" and all its tasks?`} confirmLabel="Delete Workspace" onConfirm={()=>handleDeleteWorkspace(delWs?.id)} onCancel={()=>setDelWs(null)} th={th}/>
      <AdminPanel open={adminOpen} onClose={()=>setAdminOpen(false)} onAccessChanged={onAccessChanged} th={th}/>
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(null);const [accessStatus,setAccessStatus]=useState(null);const [allProfiles,setAllProfiles]=useState([]);const [loading,setLoading]=useState(true)
  const initializedRef=useRef(false);const authUserIdRef=useRef(null)
  const ADMIN_EMAIL=import.meta.env.VITE_ADMIN_EMAIL||'';const isAdmin=session?.user?.email===ADMIN_EMAIL
  const [themeName,setThemeName]=useState(()=>localStorage.getItem('taskflow-theme')||'modern')
  const th=T[themeName]

  useEffect(()=>{
    const id='app-font-link'
    if(!document.getElementById(id)){
      const l=document.createElement('link');l.id=id;l.rel='stylesheet'
      l.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap'
      document.head.appendChild(l)
    }
  },[])

  const handleUserAuth=async user=>{
    authUserIdRef.current=user.id
    try{
      await upsertProfile({id:user.id,email:user.email,name:user.user_metadata?.full_name||user.email.split('@')[0],avatar_url:user.user_metadata?.avatar_url||null})
      if(user.email===ADMIN_EMAIL){await submitAccessRequest(user.id,user.email,user.user_metadata?.full_name||'');await approveRequest(user.id);setAccessStatus('approved')}
      else{const{data:reqData}=await checkAccessStatus(user.id);if(!reqData){await submitAccessRequest(user.id,user.email,user.user_metadata?.full_name||'');setAccessStatus('pending')}else{setAccessStatus(reqData.status?.trim()||'pending')}}
      const{data:reqList}=await getAccessRequests();const approvedIds=(reqList||[]).filter(r=>r.status==='approved').map(r=>r.user_id)
      if(approvedIds.length>0){const{data:profiles}=await supabase.from('profiles').select('*').in('id',approvedIds);setAllProfiles(profiles||[])}else{setAllProfiles([])}
    }catch(e){console.error('Auth error:',e)}finally{setLoading(false);initializedRef.current=true}
  }

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);if(session){handleUserAuth(session.user)}else{setLoading(false);initializedRef.current=true}})
    const{data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      setSession(session)
      if(!session){authUserIdRef.current=null;setAccessStatus(null);setLoading(false);initializedRef.current=true;return}
      const isNewUser=authUserIdRef.current!==session.user.id
      if(!initializedRef.current||event==='USER_UPDATED'||(event==='SIGNED_IN'&&isNewUser)){handleUserAuth(session.user)}
    })
    return()=>subscription.unsubscribe()
  },[])

  const onSignOut=async()=>{await signOut();setSession(null);setAccessStatus(null);authUserIdRef.current=null}
  const onAccessChanged=async()=>{if(!session?.user)return;const{data:reqList}=await getAccessRequests();const approvedIds=(reqList||[]).filter(r=>r.status==='approved').map(r=>r.user_id);if(approvedIds.length>0){const{data:profiles}=await supabase.from('profiles').select('*').in('id',approvedIds);setAllProfiles(profiles||[])}}

  if(loading)return(<div style={{minHeight:'100vh',background:th.bgApp,display:'flex',alignItems:'center',justifyContent:'center',color:th.textSub,fontFamily:th.font}}><div style={{textAlign:'center'}}><div style={{width:42,height:42,borderRadius:'12px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,margin:'0 auto 16px',boxShadow:'0 8px 24px rgba(99,102,241,0.4)'}}>✦</div><div style={{fontSize:14}}>Loading TaskFlow…</div></div></div>)

  if(!session) return <AuthScreen th={th}/>
  if(accessStatus==='pending') return <PendingScreen user={session.user} onSignOut={onSignOut} th={th}/>
  if(accessStatus==='denied') return <DeniedScreen onSignOut={onSignOut} th={th}/>
  if(!accessStatus) return(<div style={{minHeight:'100vh',background:th.bgApp,display:'flex',alignItems:'center',justifyContent:'center',color:th.textSub,fontFamily:th.font}}>Checking access…</div>)

  return <TaskFlowApp cu={session.user} isAdmin={isAdmin} allProfiles={allProfiles} onSignOut={onSignOut} onAccessChanged={onAccessChanged}/>
}
