import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, signInWithGoogle, signOut, submitAccessRequest, checkAccessStatus,
         getAccessRequests, approveRequest, denyRequest, upsertProfile,
         getMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
         getWorkspaceMembers, addMemberToWorkspace, removeMemberFromWorkspace,
         getTasks, createTask, updateTask, deleteTask, logActivity } from './lib/supabase.js'

// ─── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_STATUSES = ['Todo','In Progress','Review','Done']
const PRIORITIES       = ['Low','Medium','High','Critical']
const PC  = {'Low':'#6b7280','Medium':'#3b82f6','High':'#f59e0b','Critical':'#ef4444'}
const PI  = {'Low':'↓','Medium':'→','High':'↑','Critical':'⚡'}
const WS_COLORS = ['#6366f1','#ec4899','#10b981','#f59e0b','#06b6d4','#8b5cf6','#ef4444','#3b82f6']
const WS_ICONS  = ['⬡','◈','◉','⊛','◆','▲','●','■']
const SCPAL     = ['#6b7280','#6366f1','#f59e0b','#10b981','#ec4899','#06b6d4','#8b5cf6','#ef4444','#3b82f6','#84cc16']

const mkColor    = e=>{let n=0;for(let c of e)n+=c.charCodeAt(0);return WS_COLORS[n%WS_COLORS.length]}
const mkInit     = n=>n.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
const isOverdue  = d=>d&&new Date(d)<new Date()
const fmtDate    = d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'
const enrich     = u=>u?{...u,initials:mkInit(u.name||u.email||'?'),color:mkColor(u.email||'')}:null
const getUser    = (id,list=[])=>enrich(list.find(u=>u.id===id))||null
const scMap      = ss=>{const d={'Todo':'#6b7280','In Progress':'#6366f1','Review':'#f59e0b','Done':'#10b981'};let i=0;return Object.fromEntries(ss.map(s=>[s,d[s]||SCPAL[4+(i++%6)]]))}

// ─── Task visibility logic (the 3 rules) ──────────────────────────────────────
// A task is visible on a user's board if:
//   Rule 1: created_by = user AND assigned_to = null (unassigned — only creator sees)
//   Rule 2a: assigned_to = user (assigned to me — I see it as mirrored)
//   Rule 2b: created_by = user AND assigned_to ≠ null AND assigned_to ≠ user (I delegated it — I see it)
//   Rule 3: created_by = user AND assigned_to = user (self-assigned — only I see)
const isOnMyBoard = (task, userId) => {
  const mine    = task.created_by === userId
  const assignedToMe = task.assigned_to === userId
  const unassigned   = !task.assigned_to
  const delegated    = mine && task.assigned_to && task.assigned_to !== userId
  return mine && unassigned   // Rule 1: my unassigned task
      || assignedToMe         // Rule 2a + 3: assigned to me (by anyone, including self)
      || delegated            // Rule 2b: I created and delegated to someone else
}

// A task is "mirrored" (assigned by someone else to me) if:
const isMirroredToMe = (task, userId) =>
  task.assigned_to === userId && task.created_by !== userId

// Tasks visible on a specific member's board FROM MANAGER VIEW:
// Only tasks assigned to that member (not their private self-tasks)
const isAssignedToMember = (task, memberId) =>
  task.assigned_to === memberId && task.created_by !== memberId

const INP = {display:'block',width:'100%',boxSizing:'border-box',background:'#131f35',border:'1px solid #1e2d42',borderRadius:9,padding:'10px 13px',color:'#f1f5f9',fontSize:14,outline:'none',fontFamily:'system-ui,sans-serif',lineHeight:1.5}
const LBL = {display:'block',fontSize:11,color:'#64748b',fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.07em'}

// ─── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({user,size=32}){
  if(!user) return <div style={{width:size,height:size,borderRadius:'50%',background:'#1e2d42',flexShrink:0}}/>
  if(user.avatar_url) return <img src={user.avatar_url} alt={user.name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
  return <div title={user.name} style={{width:size,height:size,borderRadius:'50%',background:user.color||'#6366f1',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.36,fontWeight:700,flexShrink:0,userSelect:'none',border:'2px solid rgba(255,255,255,0.1)'}}>{user.initials}</div>
}

function Pill({label,color,sm}){
  return <span style={{background:color+'22',color,border:`1px solid ${color}44`,borderRadius:6,padding:sm?'1px 6px':'3px 10px',fontSize:sm?10:11,fontWeight:700,whiteSpace:'nowrap'}}>{label}</span>
}

function Modal({open,onClose,title,width=600,children}){
  if(!open) return null
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#0b1220',border:'1px solid #1e2d42',borderRadius:20,width:'100%',maxWidth:width,maxHeight:'93vh',overflow:'auto',boxShadow:'0 40px 120px rgba(0,0,0,0.9)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:'1px solid #1e2d42'}}>
          <span style={{fontSize:16,fontWeight:700,color:'#f1f5f9'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:22,lineHeight:1}}>✕</button>
        </div>
        <div style={{padding:24}}>{children}</div>
      </div>
    </div>
  )
}

function Confirm({open,icon,title,body,confirmLabel,confirmColor='#ef4444',onConfirm,onCancel}){
  if(!open) return null
  return(
    <div onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#0b1220',border:`1px solid ${confirmColor}44`,borderRadius:18,width:'100%',maxWidth:400,padding:30}}>
        <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>{icon}</div>
        <div style={{fontSize:17,fontWeight:700,color:'#f1f5f9',textAlign:'center',marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:'#94a3b8',textAlign:'center',marginBottom:24,lineHeight:1.6}}>{body}</div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,background:'#1a2640',border:'1px solid #2a3a54',borderRadius:10,padding:'10px',color:'#94a3b8',cursor:'pointer',fontSize:14,fontWeight:600}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,background:confirmColor,border:'none',borderRadius:10,padding:'10px',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Auth Screens ──────────────────────────────────────────────────────────────
function AuthScreen(){
  const [loading,setLoading]=useState(false)
  return(
    <div style={{minHeight:'100vh',background:'#06090f',display:'flex',fontFamily:'system-ui,sans-serif'}}>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:48}}>
        <div style={{maxWidth:400,width:'100%'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
            <div style={{width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>✦</div>
            <span style={{fontSize:26,fontWeight:800,color:'#f1f5f9'}}>TaskFlow</span>
          </div>
          <div style={{fontSize:30,fontWeight:800,color:'#f1f5f9',lineHeight:1.15,marginBottom:12}}>Private workspace<br/><span style={{background:'linear-gradient(90deg,#6366f1,#10b981)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>for your team</span></div>
          <div style={{fontSize:14,color:'#64748b',lineHeight:1.6,marginBottom:32}}>Sign in with Google to request access. The admin reviews all requests.</div>
          <button onClick={async()=>{setLoading(true);await signInWithGoogle()}} disabled={loading}
            style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'15px 20px',background:'#fff',borderRadius:14,border:'none',cursor:'pointer',fontSize:15,fontWeight:600,color:'#1a1a1a',boxShadow:'0 2px 12px rgba(0,0,0,0.4)',opacity:loading?0.7:1}}>
            <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {loading?'Redirecting…':'Continue with Google'}
          </button>
          <div style={{textAlign:'center',fontSize:11,color:'#374151',marginTop:14}}>🔒 Invite-only access</div>
        </div>
      </div>
      <div style={{width:280,background:'#0a1220',borderLeft:'1px solid #1e2d42',display:'flex',flexDirection:'column',justifyContent:'center',padding:32}}>
        {[
          {icon:'👤',title:'Personal Board',desc:'Your tasks stay private. Assigned tasks appear as a mirror.'},
          {icon:'📤',title:'Delegate to Team',desc:'Assign tasks to teammates — they appear on their board.'},
          {icon:'👁',title:'Manager View',desc:'See every subordinate\'s workload in Team View.'},
          {icon:'⚙️',title:'Custom Workflows',desc:'Add your own status columns per workspace.'},
        ].map(f=>(
          <div key={f.title} style={{display:'flex',gap:12,marginBottom:20}}>
            <div style={{width:32,height:32,borderRadius:9,background:'#6366f122',border:'1px solid #6366f144',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>{f.icon}</div>
            <div><div style={{fontSize:13,fontWeight:700,color:'#e2e8f0',marginBottom:2}}>{f.title}</div><div style={{fontSize:12,color:'#64748b',lineHeight:1.5}}>{f.desc}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PendingScreen({user,onSignOut}){
  return(
    <div style={{minHeight:'100vh',background:'#06090f',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center',maxWidth:400,padding:32}}>
        <div style={{fontSize:56,marginBottom:20}}>⏳</div>
        <div style={{fontSize:22,fontWeight:800,color:'#f1f5f9',marginBottom:8}}>Access Requested</div>
        <div style={{fontSize:14,color:'#818cf8',marginBottom:4}}>{user.email}</div>
        <div style={{fontSize:13,color:'#64748b',background:'#131f35',border:'1px solid #1e2d42',borderRadius:12,padding:16,margin:'20px 0',lineHeight:1.6}}>The admin will review your request. Check back after you've been notified.</div>
        <button onClick={onSignOut} style={{background:'#1a2640',border:'1px solid #2a3a54',borderRadius:10,padding:'10px 24px',color:'#94a3b8',cursor:'pointer',fontSize:14}}>Sign Out</button>
      </div>
    </div>
  )
}

function DeniedScreen({onSignOut}){
  return(
    <div style={{minHeight:'100vh',background:'#06090f',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}>
      <div style={{textAlign:'center',maxWidth:380,padding:32}}>
        <div style={{fontSize:56,marginBottom:20}}>🚫</div>
        <div style={{fontSize:22,fontWeight:800,color:'#f1f5f9',marginBottom:12}}>Access Denied</div>
        <div style={{fontSize:14,color:'#94a3b8',marginBottom:24}}>Contact the admin if you think this is a mistake.</div>
        <button onClick={onSignOut} style={{background:'#ef444420',border:'1px solid #ef444440',borderRadius:10,padding:'10px 24px',color:'#ef4444',cursor:'pointer',fontSize:14,fontWeight:600}}>Sign Out</button>
      </div>
    </div>
  )
}

// ─── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({open,onClose}){
  const [reqs,setReqs]=useState([])
  const [loading,setLoading]=useState(true)
  const load=async()=>{setLoading(true);const{data}=await getAccessRequests();setReqs(data||[]);setLoading(false)}
  useEffect(()=>{if(open)load()},[open])
  const act=async(uid,a)=>{if(a==='approve')await approveRequest(uid);else await denyRequest(uid);load()}
  const sc={pending:'#f59e0b',approved:'#10b981',denied:'#ef4444'}
  return(
    <Modal open={open} onClose={onClose} title="🛡️ Access Requests" width={520}>
      {loading?<div style={{textAlign:'center',padding:40,color:'#64748b'}}>Loading…</div>
      :reqs.length===0?<div style={{textAlign:'center',padding:40,color:'#64748b'}}>No requests yet.</div>
      :reqs.map(r=>(
        <div key={r.user_id} style={{display:'flex',alignItems:'center',gap:12,background:'#131f35',border:'1px solid #1e2d42',borderRadius:12,padding:'12px 16px',marginBottom:10}}>
          <div style={{width:40,height:40,borderRadius:'50%',background:mkColor(r.email),color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,flexShrink:0}}>{mkInit(r.name||r.email)}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:'#f1f5f9'}}>{r.name}</div><div style={{fontSize:11,color:'#64748b'}}>{r.email}</div></div>
          <span style={{fontSize:11,fontWeight:700,color:sc[r.status],background:sc[r.status]+'22',border:`1px solid ${sc[r.status]}44`,borderRadius:6,padding:'2px 8px'}}>{r.status.toUpperCase()}</span>
          {r.status==='pending'&&<>
            <button onClick={()=>act(r.user_id,'approve')} style={{background:'#10b98122',border:'1px solid #10b98144',borderRadius:8,padding:'5px 12px',color:'#10b981',cursor:'pointer',fontSize:12,fontWeight:700}}>✓ Approve</button>
            <button onClick={()=>act(r.user_id,'deny')} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:8,padding:'5px 12px',color:'#ef4444',cursor:'pointer',fontSize:12,fontWeight:700}}>✗ Deny</button>
          </>}
        </div>
      ))}
    </Modal>
  )
}

// ─── Status Manager ────────────────────────────────────────────────────────────
function StatusManager({open,onClose,statuses,wsColor,onSave}){
  const [list,setList]=useState([...statuses])
  const ref=useRef()
  useEffect(()=>{if(open)setList([...statuses])},[open,statuses])
  const SC=scMap(list)
  const add=()=>{const v=ref.current?.value?.trim();if(!v||list.includes(v))return;setList(p=>[...p,v]);ref.current.value=''}
  const del=s=>{if(list.length<=1)return;setList(p=>p.filter(x=>x!==s))}
  const mv=(i,d)=>{const a=[...list],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setList(a)}
  return(
    <Modal open={open} onClose={onClose} title="⚙️ Manage Status Columns" width={440}>
      <div style={{fontSize:12,color:'#64748b',marginBottom:16,lineHeight:1.6}}>Add, remove, or reorder status columns. These are per-workspace only.</div>
      {list.map((s,i)=>(
        <div key={s} style={{display:'flex',alignItems:'center',gap:10,background:'#131f35',border:`1px solid ${SC[s]}44`,borderRadius:10,padding:'9px 12px',marginBottom:7}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:SC[s],flexShrink:0}}/>
          <span style={{flex:1,fontSize:13,fontWeight:600,color:'#f1f5f9'}}>{s}</span>
          <button onClick={()=>mv(i,-1)} disabled={i===0} style={{background:'none',border:'none',color:i===0?'#374151':'#94a3b8',cursor:i===0?'default':'pointer',fontSize:14,padding:'0 4px'}}>↑</button>
          <button onClick={()=>mv(i,1)} disabled={i===list.length-1} style={{background:'none',border:'none',color:i===list.length-1?'#374151':'#94a3b8',cursor:i===list.length-1?'default':'pointer',fontSize:14,padding:'0 4px'}}>↓</button>
          <button onClick={()=>del(s)} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:6,padding:'3px 8px',color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:600}}>✕</button>
        </div>
      ))}
      <div style={{display:'flex',gap:8,margin:'16px 0'}}>
        <input ref={ref} placeholder="New status… e.g. Blocked, QA, Deployed" style={{...INP,flex:1}} onKeyDown={e=>{if(e.key==='Enter')add()}}/>
        <button onClick={add} style={{background:wsColor,border:'none',borderRadius:9,padding:'0 16px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:14,flexShrink:0}}>+ Add</button>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{background:'#1a2640',border:'1px solid #2a3a54',borderRadius:9,padding:'9px 20px',color:'#94a3b8',cursor:'pointer',fontSize:13}}>Cancel</button>
        <button onClick={()=>{onSave(list);onClose()}} style={{background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:9,padding:'9px 26px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13}}>Save</button>
      </div>
    </Modal>
  )
}

// ─── Task Form Modal ───────────────────────────────────────────────────────────
// The key fix: "Assign To" has "Only Me" as first option (null), then each member.
// When "Only Me" is selected → assigned_to is saved as current user's id (self-assigned = private).
// When another member is selected → assigned_to = their id (mirrored on their board).
function TaskFormModal({open,onClose,task,ws,wsMembers,cu,statuses,defaultStatus,onSave,onDelete}){
  const titleRef=useRef(),descRef=useRef(),projRef=useRef(),tagsRef=useRef(),dateRef=useRef()
  const [status,  setStatus]   = useState(defaultStatus||statuses[0]||'Todo')
  const [priority,setPriority] = useState('Medium')
  // assignTarget: 'self' = only me (assigned_to = cu.id, created_by = cu.id → private)
  //               memberId = delegate to that member
  const [assignTarget,setAssignTarget] = useState('self')
  const [cdel,setCdel] = useState(false)
  const isEdit = !!task

  useEffect(()=>{
    if(!open) return
    setStatus(task?.status||defaultStatus||statuses[0]||'Todo')
    setPriority(task?.priority||'Medium')
    // Determine assignTarget from existing task
    if(task){
      const isSelfAssigned = !task.assigned_to || task.assigned_to===task.created_by
      setAssignTarget(isSelfAssigned ? 'self' : task.assigned_to)
    } else {
      setAssignTarget('self')
    }
  },[open,task,cu,defaultStatus,statuses])

  if(!open||!ws||!cu) return null

  // Build dropdown options:
  // 1. "Only Me (private)" → assignTarget='self'
  // 2. Each OTHER workspace member → assignTarget=member.id
  const otherMembers = wsMembers.filter(m=>m.id!==cu.id)

  const handleSave=async()=>{
    const title=titleRef.current?.value?.trim()
    if(!title) return
    // If assignTarget='self' → assigned_to = cu.id (self-task, private by rule 3)
    // If assignTarget=memberId → assigned_to = that member (delegated, mirrors on their board)
    const assigned_to = assignTarget==='self' ? cu.id : assignTarget
    const payload={
      title,
      description:descRef.current?.value?.trim()||'',
      project:projRef.current?.value?.trim()||'',
      tags:(tagsRef.current?.value||'').split(',').map(t=>t.trim()).filter(Boolean),
      due_date:dateRef.current?.value||null,
      status, priority, assigned_to,
      workspace_id:ws.id,
      created_by:task?.created_by||cu.id,
    }
    await onSave(isEdit?{...task,...payload}:payload)
    onClose()
  }

  const F=({label,children,full})=>(
    <div style={{marginBottom:14,gridColumn:full?'1/-1':undefined}}>
      <label style={LBL}>{label}</label>{children}
    </div>
  )

  const assignLabel = assignTarget==='self'
    ? '🔒 Only Me (private)'
    : `📤 ${wsMembers.find(m=>m.id===assignTarget)?.name||'Unknown'}`

  return(
    <>
      <Modal open={open} onClose={onClose} title={isEdit?'✏️ Edit Task':'✦ New Task'} width={580}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <F label="Task Title *" full>
            <input ref={titleRef} autoFocus defaultValue={task?.title||''} placeholder="What needs to be done?" style={INP} onKeyDown={e=>{if(e.key==='Enter')handleSave()}}/>
          </F>
          <F label="Description" full>
            <textarea ref={descRef} defaultValue={task?.description||''} rows={3} style={{...INP,resize:'vertical'}} placeholder="Details…"/>
          </F>
          <F label="Status">
            <select value={status} onChange={e=>setStatus(e.target.value)} style={{...INP,cursor:'pointer'}}>
              {statuses.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </F>
          <F label="Priority">
            <select value={priority} onChange={e=>setPriority(e.target.value)} style={{...INP,cursor:'pointer'}}>
              {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </F>

          {/* ── Assign To — the key fix ── */}
          <F label={`Assign To${otherMembers.length===0?' (add members to workspace first)':''}`} full>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {/* Self option */}
              <div onClick={()=>setAssignTarget('self')}
                style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:10,cursor:'pointer',border:`2px solid ${assignTarget==='self'?ws.color:'#1e2d42'}`,background:assignTarget==='self'?ws.color+'18':'#131f35',transition:'all 0.15s',flex:'0 0 auto'}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:ws.color+'33',border:`1px solid ${ws.color}66`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>🔒</div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:assignTarget==='self'?ws.color:'#f1f5f9'}}>Only Me</div>
                  <div style={{fontSize:10,color:'#64748b'}}>Private task</div>
                </div>
                {assignTarget==='self'&&<div style={{width:16,height:16,borderRadius:'50%',background:ws.color,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:4}}><span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span></div>}
              </div>

              {/* Team member options */}
              {otherMembers.map(m=>{
                const eu=enrich(m)
                const sel=assignTarget===m.id
                return(
                  <div key={m.id} onClick={()=>setAssignTarget(m.id)}
                    style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderRadius:10,cursor:'pointer',border:`2px solid ${sel?ws.color:'#1e2d42'}`,background:sel?ws.color+'18':'#131f35',transition:'all 0.15s',flex:'0 0 auto'}}>
                    <Avatar user={eu} size={28}/>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:sel?ws.color:'#f1f5f9'}}>{m.name||m.email.split('@')[0]}</div>
                      <div style={{fontSize:10,color:'#64748b'}}>Assign task</div>
                    </div>
                    {sel&&<div style={{width:16,height:16,borderRadius:'50%',background:ws.color,display:'flex',alignItems:'center',justifyContent:'center',marginLeft:4}}><span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span></div>}
                  </div>
                )
              })}

              {otherMembers.length===0&&(
                <div style={{fontSize:12,color:'#64748b',background:'#0d1627',border:'1px solid #1e2d42',borderRadius:10,padding:'10px 14px',lineHeight:1.6}}>
                  No teammates in this workspace yet.<br/>Edit the workspace to add members first.
                </div>
              )}
            </div>

            {/* Delegation note */}
            {assignTarget!=='self'&&(
              <div style={{marginTop:10,fontSize:11,color:'#f59e0b',background:'#f59e0b11',border:'1px solid #f59e0b33',borderRadius:8,padding:'8px 12px',lineHeight:1.6}}>
                📤 This task will appear on <strong>{wsMembers.find(m=>m.id===assignTarget)?.name||'their'}</strong>'s board as assigned work, and stays visible on your board so you can track it.
              </div>
            )}
          </F>

          <F label="Due Date"><input ref={dateRef} type="date" defaultValue={task?.due_date||''} style={INP}/></F>
          <F label="Project"><input ref={projRef} defaultValue={task?.project||''} style={INP} placeholder="e.g. Accounts, HR"/></F>
          <F label="Tags (comma-separated)"><input ref={tagsRef} defaultValue={(task?.tags||[]).join(', ')} style={INP} placeholder="Urgent, Finance"/></F>
        </div>

        <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:8}}>
          {isEdit?<button onClick={()=>setCdel(true)} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:9,padding:'9px 16px',color:'#ef4444',cursor:'pointer',fontSize:13,fontWeight:600}}>🗑️ Delete</button>:<div/>}
          <div style={{display:'flex',gap:10}}>
            <button onClick={onClose} style={{background:'#1a2640',border:'1px solid #2a3a54',borderRadius:9,padding:'9px 20px',color:'#94a3b8',cursor:'pointer',fontSize:13}}>Cancel</button>
            <button onClick={handleSave} style={{background:`linear-gradient(135deg,${ws.color},${ws.color}bb)`,border:'none',borderRadius:9,padding:'9px 26px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13}}>{isEdit?'💾 Save':'Create Task'}</button>
          </div>
        </div>
      </Modal>
      <Confirm open={cdel} icon="🗑️" title="Delete Task?" body={`Delete "${task?.title}"?`} confirmLabel="Delete" onConfirm={async()=>{setCdel(false);await onDelete(task.id);onClose()}} onCancel={()=>setCdel(false)}/>
    </>
  )
}

// ─── Workspace Form ────────────────────────────────────────────────────────────
function WorkspaceFormModal({open,onClose,ws,allProfiles,cu,onSave}){
  const nameRef=useRef(),descRef=useRef()
  const [color,setColor]=useState(WS_COLORS[0])
  const [icon,setIcon]  =useState(WS_ICONS[0])
  const [members,setMembers]=useState([])
  useEffect(()=>{if(open){setColor(ws?.color||WS_COLORS[0]);setIcon(ws?.icon||WS_ICONS[0]);setMembers(ws?.memberIds||[cu?.id])}},[open,ws,cu])
  if(!open||!cu) return null
  const toggle=id=>{if(id===cu.id)return;setMembers(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])}
  return(
    <Modal open={open} onClose={onClose} title={ws?'✏️ Edit Workspace':'✦ New Workspace'} width={500}>
      <div style={{marginBottom:14}}><label style={LBL}>Workspace Name *</label><input ref={nameRef} defaultValue={ws?.name||''} placeholder="e.g. Daily To Do, Accounts Team" style={INP}/></div>
      <div style={{marginBottom:14}}><label style={LBL}>Description</label><textarea ref={descRef} defaultValue={ws?.description||''} rows={2} style={{...INP,resize:'vertical'}} placeholder="What does this workspace cover?"/></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px',marginBottom:14}}>
        <div><label style={LBL}>Color</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{WS_COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:8,background:c,cursor:'pointer',border:`2.5px solid ${color===c?'#fff':'transparent'}`,boxShadow:color===c?`0 0 0 2px ${c}`:'none'}}/>)}</div></div>
        <div><label style={LBL}>Icon</label><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{WS_ICONS.map(ic=><div key={ic} onClick={()=>setIcon(ic)} style={{width:34,height:34,borderRadius:8,background:icon===ic?color+'33':'#131f35',border:`1.5px solid ${icon===ic?color:'#1e2d42'}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17}}>{ic}</div>)}</div></div>
      </div>
      <div style={{marginBottom:20}}>
        <label style={LBL}>Members — who can access this workspace</label>
        {allProfiles.length===0&&<div style={{fontSize:12,color:'#f59e0b',background:'#f59e0b11',borderRadius:10,padding:12,lineHeight:1.6,border:'1px solid #f59e0b33'}}>⚠ No approved team members yet. Go to Admin Panel (🛡️) and approve your teammates first, then come back and add them here.</div>}
        {allProfiles.map(u=>{
          const checked=members.includes(u.id),isSelf=u.id===cu.id
          return(
            <div key={u.id} onClick={()=>toggle(u.id)} style={{display:'flex',alignItems:'center',gap:12,background:checked?'#131f35':'transparent',border:`1px solid ${checked?color+'44':'#1e2d42'}`,borderRadius:10,padding:'9px 13px',cursor:isSelf?'default':'pointer',marginBottom:7,transition:'all 0.15s'}}>
              <Avatar user={enrich(u)} size={30}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'#f1f5f9'}}>{u.name||u.email}{isSelf?' (You — always included)':''}</div><div style={{fontSize:11,color:'#64748b'}}>{u.email}</div></div>
              <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${checked?color:'#374151'}`,background:checked?color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{checked&&<span style={{color:'#fff',fontSize:11,fontWeight:700}}>✓</span>}</div>
            </div>
          )
        })}
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{background:'#1a2640',border:'1px solid #2a3a54',borderRadius:9,padding:'9px 20px',color:'#94a3b8',cursor:'pointer',fontSize:13}}>Cancel</button>
        <button onClick={async()=>{
          const name=nameRef.current?.value?.trim();if(!name)return
          await onSave({id:ws?.id,name,description:descRef.current?.value?.trim()||'',color,icon,memberIds:members.includes(cu.id)?members:[...members,cu.id]})
          onClose()
        }} style={{background:`linear-gradient(135deg,${color},${color}bb)`,border:'none',borderRadius:9,padding:'9px 26px',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13}}>
          {ws?'Save Changes':'Create Workspace'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({task,wsColor,SC,wsMembers,cu,onEdit,onDelete,onDragStart,isDragging}){
  const assignee = getUser(task.assigned_to,wsMembers)
  const creator  = getUser(task.created_by,wsMembers)
  const overdue  = isOverdue(task.due_date)&&task.status!=='Done'
  const mirrored = isMirroredToMe(task,cu?.id)  // assigned to me by someone else
  const delegated= task.created_by===cu?.id && task.assigned_to && task.assigned_to!==cu?.id
  const [hov,setHov]=useState(false)
  const [cdel,setCdel]=useState(false)
  const col=SC[task.status]||wsColor

  // Card top accent color
  const accentColor = mirrored ? '#818cf8'    // purple = assigned to me
                    : delegated ? '#f59e0b'   // amber = I delegated it
                    : wsColor                  // workspace color = my own

  return(
    <>
      <div draggable={!mirrored} onDragStart={e=>{if(mirrored)return;e.dataTransfer.effectAllowed='move';onDragStart(task.id)}}
        style={{background:isDragging?'#1a2a40':'#0d1627',border:`1px solid ${isDragging?wsColor:hov?accentColor+'66':'#1e2d42'}`,borderRadius:12,padding:14,cursor:mirrored?'default':'grab',transition:'all 0.15s',borderLeft:`3px solid ${accentColor}`,opacity:isDragging?0.4:1,boxShadow:hov&&!isDragging?'0 8px 24px rgba(0,0,0,0.5)':'none',userSelect:'none',position:'relative'}}
        onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>

        {/* Badge: Mirrored / Delegated */}
        {mirrored&&(
          <div style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,background:'#818cf833',color:'#818cf8',border:'1px solid #818cf844',borderRadius:5,padding:'2px 6px',letterSpacing:'0.05em'}}>
            📥 ASSIGNED TO ME
          </div>
        )}
        {delegated&&(
          <div style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,background:'#f59e0b22',color:'#f59e0b',border:'1px solid #f59e0b44',borderRadius:5,padding:'2px 6px',letterSpacing:'0.05em'}}>
            📤 DELEGATED
          </div>
        )}

        {/* Tags */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6,paddingRight:mirrored||delegated?90:0}}>
          {(task.tags||[]).slice(0,2).map(t=><span key={t} style={{fontSize:10,color:'#94a3b8',background:'#131f35',borderRadius:4,padding:'2px 5px',fontWeight:600}}>{t}</span>)}
        </div>

        <div style={{fontSize:13,fontWeight:600,color:'#f1f5f9',marginBottom:5,lineHeight:1.4}}>{task.title}</div>
        {task.description&&<div style={{fontSize:11,color:'#64748b',marginBottom:8,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{task.description}</div>}

        <div style={{display:'flex',gap:4,marginBottom:8}}>
          <Pill label={`${PI[task.priority]} ${task.priority}`} color={PC[task.priority]} sm/>
          {overdue&&<Pill label="⚠ Overdue" color="#ef4444" sm/>}
        </div>

        {/* Assignee / Creator row */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            {mirrored?(
              // Show who assigned it to me
              <><Avatar user={creator} size={18}/><span style={{fontSize:10,color:'#818cf8',fontWeight:600}}>from {creator?.name?.split(' ')[0]||'?'}</span></>
            ):(
              <><Avatar user={assignee} size={18}/><span style={{fontSize:11,color:'#64748b'}}>{assignee?.id===cu?.id?'Me':assignee?.name?.split(' ')[0]||'—'}</span></>
            )}
          </div>
          {task.due_date&&<span style={{fontSize:10,color:overdue?'#ef4444':'#64748b'}}>{fmtDate(task.due_date)}</span>}
        </div>

        {/* Action buttons — mirrored cards can't be deleted by the viewer */}
        {!mirrored&&(
          <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:'1px solid #1e2d42',opacity:hov?1:0,transition:'opacity 0.15s'}}>
            <button onClick={e=>{e.stopPropagation();onEdit(task)}} style={{flex:1,background:wsColor+'22',border:`1px solid ${wsColor}44`,borderRadius:7,padding:'5px 0',color:wsColor,cursor:'pointer',fontSize:11,fontWeight:600}}>✏️ Edit</button>
            <button onClick={e=>{e.stopPropagation();setCdel(true)}} style={{flex:1,background:'#ef444418',border:'1px solid #ef444440',borderRadius:7,padding:'5px 0',color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:600}}>🗑 Delete</button>
          </div>
        )}
        {mirrored&&hov&&(
          <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #1e2d42',fontSize:11,color:'#818cf8',textAlign:'center'}}>
            Assigned by {creator?.name?.split(' ')[0]||'?'} · Edit from their board
          </div>
        )}
      </div>
      <Confirm open={cdel} icon="🗑️" title="Delete Task?" body={`Delete "${task.title}"?`} confirmLabel="Delete" onConfirm={()=>{setCdel(false);onDelete(task.id)}} onCancel={()=>setCdel(false)}/>
    </>
  )
}

// ─── Drop Column ───────────────────────────────────────────────────────────────
function DropColumn({status,tasks,wsColor,SC,wsMembers,cu,onEdit,onDelete,dragId,onDragStart,onDrop,onAddTask,readOnly}){
  const [over,setOver]=useState(false)
  const col=SC[status]||wsColor
  return(
    <div onDragOver={e=>{if(readOnly)return;e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{if(readOnly)return;e.preventDefault();setOver(false);onDrop(status)}} style={{minWidth:250,flex:'1 1 250px',maxWidth:300}}>
      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:10,padding:'7px 10px',background:over?col+'11':'transparent',borderRadius:10,border:`1px solid ${over?col+'55':'transparent'}`,transition:'all 0.15s'}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:col}}/>
        <span style={{fontSize:12,fontWeight:700,color:'#f1f5f9',flex:1}}>{status}</span>
        <span style={{background:'#131f35',color:col,borderRadius:20,padding:'2px 8px',fontSize:11,fontWeight:700}}>{tasks.length}</span>
        {!readOnly&&(
          <button onClick={()=>onAddTask(status)}
            style={{width:24,height:24,borderRadius:7,background:col+'22',border:`1px solid ${col}44`,color:col,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,flexShrink:0,padding:0,lineHeight:1}}
            onMouseEnter={e=>e.currentTarget.style.background=col+'44'}
            onMouseLeave={e=>e.currentTarget.style.background=col+'22'}>+</button>
        )}
      </div>
      <div style={{minHeight:60,borderRadius:12,padding:over?'8px':'0',background:over?col+'0d':'transparent',border:over?`2px dashed ${col}66`:'2px dashed transparent',transition:'all 0.15s',display:'flex',flexDirection:'column',gap:9}}>
        {tasks.map(t=><TaskCard key={t.id} task={t} wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} isDragging={dragId===t.id}/>)}
        {tasks.length===0&&!over&&<div style={{border:'2px dashed #1e2d42',borderRadius:10,padding:20,textAlign:'center',color:'#374151',fontSize:12}}>No tasks</div>}
        {over&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:60,color:col,fontSize:12,fontWeight:600}}>↓ Drop here</div>}
      </div>
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────────────────────────
function TaskFlowApp({cu,isAdmin,allProfiles,onSignOut}){
  const [workspaces,  setWorkspaces]   = useState([])
  const [activeWsId,  setActiveWsId]   = useState(null)
  const [wsMembers,   setWsMembers]    = useState([])
  const [tasks,       setTasks]        = useState([])
  const [subView,     setSubView]      = useState('board')
  const [editTask,    setEditTask]     = useState(null)
  const [createStatus,setCreateStatus] = useState(null)
  const [wsForm,      setWsForm]       = useState(null)
  const [delWs,       setDelWs]        = useState(null)
  const [statusMgr,   setStatusMgr]   = useState(false)
  const [dragId,      setDragId]       = useState(null)
  const [adminOpen,   setAdminOpen]    = useState(false)
  const [fPriority,   setFPriority]   = useState('')
  const [search,      setSearch]       = useState('')
  const [loading,     setLoading]      = useState(true)
  const [showProf,    setShowProf]     = useState(false)
  const [toast,       setToast]        = useState(null)
  const pRef=useRef()

  const showToast=useCallback((msg,type='ok')=>{setToast({msg,type});setTimeout(()=>setToast(null),4000)},[])
  const activeWs=workspaces.find(w=>w.id===activeWsId)||null
  const wsColor=activeWs?.color||'#6366f1'
  const statuses=activeWs?.custom_statuses||DEFAULT_STATUSES
  const SC=scMap(statuses)

  const loadWorkspaces=useCallback(async()=>{
    const{data}=await getMyWorkspaces(cu.id)
    setWorkspaces(data||[])
    setLoading(false)
    if(data?.length>0&&!activeWsId) setActiveWsId(data[0].id)
  },[cu.id,activeWsId])

  useEffect(()=>{loadWorkspaces()},[cu.id])

  useEffect(()=>{
    if(!activeWsId) return
    Promise.all([getWorkspaceMembers(activeWsId),getTasks(activeWsId)])
      .then(([{data:mems},{data:tsks}])=>{
        setWsMembers(mems||[])
        setTasks(tsks||[])
      })
  },[activeWsId])

  useEffect(()=>{
    const h=e=>{if(pRef.current&&!pRef.current.contains(e.target))setShowProf(false)}
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)
  },[])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSaveWorkspace=async({id,name,description,color,icon,memberIds})=>{
    if(id){
      const{error}=await updateWorkspace(id,{name,description,color,icon})
      if(error){showToast('Update failed: '+error.message,'err');return}
      const cur=wsMembers.map(m=>m.id)
      for(const uid of memberIds){if(!cur.includes(uid))await addMemberToWorkspace(id,uid)}
      for(const uid of cur){if(!memberIds.includes(uid)&&uid!==cu.id)await removeMemberFromWorkspace(id,uid)}
      // Reload members so Assign To is up-to-date
      const{data:mems}=await getWorkspaceMembers(id);setWsMembers(mems||[])
      showToast('Workspace updated! ✓')
    } else {
      const{data:ws,error}=await createWorkspace({name,description,color,icon,owner_id:cu.id})
      if(error||!ws){showToast('Create failed: '+(error?.message||'unknown'),'err');return}
      for(const uid of [...new Set([cu.id,...memberIds])]) await addMemberToWorkspace(ws.id,uid,uid===cu.id?'owner':'member')
      setActiveWsId(ws.id)
      showToast('Workspace created! ✓')
    }
    await loadWorkspaces()
  }

  const handleSaveStatuses=async ss=>{
    if(!activeWsId) return
    const{error}=await updateWorkspace(activeWsId,{custom_statuses:ss})
    if(error){showToast('Failed: '+error.message,'err');return}
    setWorkspaces(p=>p.map(w=>w.id===activeWsId?{...w,custom_statuses:ss}:w))
    showToast('Status columns saved! ✓')
  }

  const handleDeleteWorkspace=async id=>{
    await deleteWorkspace(id);setActiveWsId(null);setDelWs(null);await loadWorkspaces()
  }

  const handleSaveTask=async td=>{
    if(td.id){
      const{data,error}=await updateTask(td.id,td)
      if(error){showToast('Save failed: '+error.message,'err');return}
      if(data) setTasks(p=>p.map(t=>t.id===data.id?data:t))
      await logActivity(td.id,cu.id,'Updated task')
      showToast('Task saved! ✓')
    } else {
      const{data,error}=await createTask(td)
      if(error){showToast('Create failed: '+error.message,'err');return}
      if(data){setTasks(p=>[...p,data]);await logActivity(data.id,cu.id,'Created task')}
      showToast('Task created! ✓')
    }
  }

  const handleDeleteTask=async id=>{
    await deleteTask(id);setTasks(p=>p.filter(t=>t.id!==id));setEditTask(null);setCreateStatus(null)
  }

  const handleDrop=useCallback(async st=>{
    if(!dragId) return
    const task=tasks.find(t=>t.id===dragId)
    if(!task||task.status===st){setDragId(null);return}
    const{data}=await updateTask(dragId,{status:st})
    if(data) setTasks(p=>p.map(t=>t.id===dragId?data:t))
    await logActivity(dragId,cu.id,`Moved to ${st}`)
    setDragId(null)
  },[dragId,tasks,cu.id])

  const openNewTask=s=>{setCreateStatus(s||statuses[0]);setEditTask(null)}
  const isFormOpen = createStatus!==null||editTask!==null

  // ── Task filtering ─────────────────────────────────────────────────────────
  const baseFilter=t=>{
    if(fPriority&&t.priority!==fPriority) return false
    if(search&&!t.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }

  // MY BOARD: apply the 3 visibility rules
  const myBoardTasks = tasks.filter(t=>baseFilter(t)&&isOnMyBoard(t,cu.id))
  // ALL tasks (for list view — manager sees everything)
  const allTasks     = tasks.filter(baseFilter)

  if(loading) return <div style={{minHeight:'100vh',background:'#06090f',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontFamily:'system-ui,sans-serif'}}>Loading…</div>

  return(
    <div style={{minHeight:'100vh',background:'#07101d',fontFamily:'system-ui,sans-serif',color:'#f1f5f9',display:'flex'}} onDragEnd={()=>setDragId(null)}>

      {toast&&<div style={{position:'fixed',bottom:24,right:24,zIndex:9999,background:toast.type==='ok'?'#10b981':'#ef4444',color:'#fff',borderRadius:12,padding:'12px 20px',fontSize:14,fontWeight:600,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',gap:8,maxWidth:400}}><span>{toast.type==='ok'?'✓':'⚠'}</span><span>{toast.msg}</span></div>}

      {/* ── Icon Rail ── */}
      <div style={{width:64,background:'#060c18',borderRight:'1px solid #1e2d42',display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 0',gap:8,flexShrink:0}}>
        <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,marginBottom:8,cursor:'pointer'}} onClick={()=>setActiveWsId(null)}>✦</div>
        <div style={{width:32,height:1,background:'#1e2d42',marginBottom:4}}/>
        {workspaces.map(ws=>(
          <div key={ws.id} title={ws.name} onClick={()=>{setActiveWsId(ws.id);setSubView('board');setFPriority('');setSearch('')}}
            style={{width:40,height:40,borderRadius:12,background:activeWsId===ws.id?ws.color+'33':'#0d1627',border:`1.5px solid ${activeWsId===ws.id?ws.color:'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,cursor:'pointer',transition:'all 0.2s',boxShadow:activeWsId===ws.id?`0 0 0 3px ${ws.color}33`:undefined}}
            onMouseEnter={e=>{if(activeWsId!==ws.id){e.currentTarget.style.background='#131f35';e.currentTarget.style.borderColor=ws.color+'66'}}}
            onMouseLeave={e=>{if(activeWsId!==ws.id){e.currentTarget.style.background='#0d1627';e.currentTarget.style.borderColor='transparent'}}}>
            {ws.icon}
          </div>
        ))}
        <div title="New Workspace" onClick={()=>setWsForm('new')} style={{width:40,height:40,borderRadius:12,border:'1.5px dashed #1e2d42',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,cursor:'pointer',color:'#374151',transition:'all 0.2s'}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.color='#6366f1';e.currentTarget.style.background='#6366f111'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='#1e2d42';e.currentTarget.style.color='#374151';e.currentTarget.style.background='transparent'}}>+</div>
        <div style={{flex:1}}/>
        {isAdmin&&<div title="Admin Panel" onClick={()=>setAdminOpen(true)} style={{width:40,height:40,borderRadius:12,background:'#f59e0b22',border:'1px solid #f59e0b44',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,cursor:'pointer',marginBottom:8}}>🛡️</div>}
        <div ref={pRef} style={{position:'relative'}}>
          <div onClick={()=>setShowProf(p=>!p)} style={{cursor:'pointer'}}><Avatar user={enrich(cu)} size={36}/></div>
          {showProf&&(
            <div style={{position:'absolute',bottom:0,left:52,background:'#0b1220',border:'1px solid #1e2d42',borderRadius:12,width:220,boxShadow:'0 16px 48px rgba(0,0,0,0.6)',zIndex:500,overflow:'hidden'}}>
              <div style={{padding:'12px 14px',borderBottom:'1px solid #1e2d42',display:'flex',gap:9,alignItems:'center'}}>
                <Avatar user={enrich(cu)} size={36}/>
                <div><div style={{fontSize:13,fontWeight:700,color:'#f1f5f9'}}>{cu.user_metadata?.full_name||cu.email}</div><div style={{fontSize:11,color:'#64748b'}}>{cu.email}</div><div style={{fontSize:10,color:'#10b981',marginTop:2,fontWeight:600}}>● Google Auth{isAdmin?' · Admin':''}</div></div>
              </div>
              {isAdmin&&<button onClick={()=>{setAdminOpen(true);setShowProf(false)}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',color:'#f59e0b',fontSize:13,textAlign:'left',fontWeight:600}} onMouseEnter={e=>e.currentTarget.style.background='#1e2937'} onMouseLeave={e=>e.currentTarget.style.background='none'}>🛡️ Admin Panel</button>}
              <button onClick={()=>{setShowProf(false);onSignOut()}} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 14px',background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background='#1e2937'} onMouseLeave={e=>e.currentTarget.style.background='none'}>⎋ Sign Out</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div style={{width:230,background:'#060c18',borderRight:'1px solid #1e2d42',display:'flex',flexDirection:'column',flexShrink:0}}>
        {activeWs?(
          <>
            <div style={{padding:'16px 14px',borderBottom:'1px solid #1e2d42'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <div style={{width:30,height:30,borderRadius:8,background:wsColor+'22',border:`1px solid ${wsColor}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>{activeWs.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#f1f5f9',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{activeWs.name}</div>
                  <div style={{fontSize:10,color:'#64748b'}}>{wsMembers.length} members · {tasks.length} tasks</div>
                </div>
              </div>
              <div style={{display:'flex',gap:5}}>
                <button onClick={()=>setWsForm(activeWs)} style={{flex:1,background:wsColor+'18',border:`1px solid ${wsColor}33`,borderRadius:7,padding:'5px 0',color:wsColor,cursor:'pointer',fontSize:11,fontWeight:600}}>✏️ Edit</button>
                <button onClick={()=>setStatusMgr(true)} title="Custom status columns" style={{background:'#131f35',border:'1px solid #1e2d42',borderRadius:7,padding:'5px 8px',color:'#94a3b8',cursor:'pointer',fontSize:11}}>⚙️</button>
                {activeWs.owner_id===cu.id&&<button onClick={()=>setDelWs(activeWs)} style={{background:'#ef444418',border:'1px solid #ef444440',borderRadius:7,padding:'5px 7px',color:'#ef4444',cursor:'pointer',fontSize:11}}>🗑</button>}
              </div>
            </div>
            <div style={{padding:'10px 8px',flex:1,overflowY:'auto'}}>
              {/* Legend */}
              <div style={{margin:'0 0 12px 10px'}}>
                <div style={{fontSize:10,color:'#374151',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>Card Types</div>
                {[{c:'#818cf8',icon:'📥',label:'Assigned to me'},{c:'#f59e0b',icon:'📤',label:'Delegated by me'},{c:wsColor,icon:'🔒',label:'My private task'}].map(x=>(
                  <div key={x.label} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                    <div style={{width:3,height:14,borderRadius:2,background:x.c,flexShrink:0}}/>
                    <span style={{fontSize:10,color:'#64748b'}}>{x.icon} {x.label}</span>
                  </div>
                ))}
              </div>
              <div style={{height:1,background:'#1e2d42',margin:'0 0 10px'}}/>
              {[{id:'board',label:'My Board',icon:'⊞'},{id:'team',label:'Team View',icon:'⊛'},{id:'list',label:'All Tasks',icon:'☰'},{id:'dashboard',label:'Dashboard',icon:'⬡'}].map(n=>(
                <button key={n.id} onClick={()=>setSubView(n.id)} style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'8px 10px',borderRadius:10,border:'none',cursor:'pointer',marginBottom:2,fontSize:13,textAlign:'left',fontWeight:subView===n.id?700:500,background:subView===n.id?wsColor+'22':'transparent',color:subView===n.id?wsColor:'#64748b',transition:'all 0.15s'}}
                  onMouseEnter={e=>{if(subView!==n.id)e.currentTarget.style.background='#131f35'}}
                  onMouseLeave={e=>{if(subView!==n.id)e.currentTarget.style.background='transparent'}}>
                  <span style={{fontSize:15}}>{n.icon}</span>{n.label}
                </button>
              ))}
              <div style={{margin:'16px 0 8px 10px',fontSize:10,color:'#374151',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>Members ({wsMembers.length})</div>
              {wsMembers.map(u=>(
                <div key={u.id} style={{display:'flex',alignItems:'center',gap:7,padding:'5px 10px',borderRadius:8}}>
                  <Avatar user={enrich(u)} size={20}/>
                  <span style={{fontSize:12,color:u.id===cu.id?wsColor:'#64748b',fontWeight:u.id===cu.id?700:400,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {(u.name||u.email||'').split(' ')[0]}{u.id===cu.id?' ✦':''}
                  </span>
                </div>
              ))}
            </div>
            <div style={{padding:'12px 8px',borderTop:'1px solid #1e2d42'}}>
              <button onClick={()=>openNewTask()} style={{width:'100%',background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:10,padding:'10px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <span style={{fontSize:17}}>+</span> New Task
              </button>
            </div>
          </>
        ):(
          <div style={{padding:14,flex:1,overflowY:'auto'}}>
            <div style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Your Workspaces</div>
            {workspaces.map(ws=>(
              <div key={ws.id} onClick={()=>setActiveWsId(ws.id)} style={{background:'#0d1627',border:'1.5px solid #1e2d42',borderRadius:14,padding:'12px 14px',cursor:'pointer',marginBottom:8,transition:'all 0.2s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=ws.color;e.currentTarget.style.background='#131f35'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#1e2d42';e.currentTarget.style.background='#0d1627'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:32,height:32,borderRadius:9,background:ws.color+'22',border:`1px solid ${ws.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>{ws.icon}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:'#f1f5f9'}}>{ws.name}</div><div style={{fontSize:11,color:'#64748b'}}>{ws.description}</div></div>
                </div>
              </div>
            ))}
            <button onClick={()=>setWsForm('new')} style={{width:'100%',background:'transparent',border:'1.5px dashed #1e2d42',borderRadius:12,padding:'12px',color:'#374151',cursor:'pointer',fontSize:13,fontWeight:600}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.color='#6366f1'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#1e2d42';e.currentTarget.style.color='#374151'}}>+ Create Workspace</button>
          </div>
        )}
      </div>

      {/* ── Main ── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{background:'#060c18',borderBottom:'1px solid #1e2d42',padding:'0 18px',height:54,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          {activeWs?(
            <>
              <button onClick={()=>setActiveWsId(null)} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:12,fontWeight:600}}>All Workspaces</button>
              <span style={{color:'#374151'}}>/</span>
              <span style={{color:wsColor}}>{activeWs.icon}</span>
              <span style={{fontSize:13,fontWeight:700,color:'#f1f5f9'}}>{activeWs.name}</span>
              <div style={{width:1,height:20,background:'#1e2d42',margin:'0 4px'}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search…" style={{background:'#0d1627',border:'1px solid #1e2d42',borderRadius:8,padding:'5px 10px',color:'#f1f5f9',fontSize:12,outline:'none',width:160,fontFamily:'system-ui,sans-serif'}}/>
              <select value={fPriority} onChange={e=>setFPriority(e.target.value)} style={{background:'#0d1627',border:'1px solid #1e2d42',borderRadius:8,padding:'4px 7px',color:'#94a3b8',fontSize:11,cursor:'pointer',outline:'none'}}>
                <option value="">All Priority</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}
              </select>
              {(fPriority||search)&&<button onClick={()=>{setFPriority('');setSearch('')}} style={{background:'#ef444420',border:'1px solid #ef444440',borderRadius:6,padding:'3px 9px',color:'#ef4444',fontSize:10,fontWeight:600,cursor:'pointer'}}>Clear ✕</button>}
            </>
          ):<span style={{fontSize:15,fontWeight:700,color:'#f1f5f9'}}>All Workspaces</span>}
          <div style={{flex:1}}/>
          <button onClick={()=>setWsForm('new')} style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none',borderRadius:8,padding:'6px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ New Workspace</button>
        </div>

        <div style={{flex:1,overflow:'auto',padding:20}}>

          {/* Home */}
          {!activeWs&&(
            <div>
              <h1 style={{fontSize:22,fontWeight:800,color:'#f1f5f9',margin:'0 0 20px'}}>Your Workspaces</h1>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
                {workspaces.map(ws=>(
                  <div key={ws.id} onClick={()=>setActiveWsId(ws.id)} style={{background:'#0d1627',border:'1.5px solid #1e2d42',borderRadius:14,padding:18,cursor:'pointer',transition:'all 0.2s',position:'relative',overflow:'hidden'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=ws.color;e.currentTarget.style.background='#131f35'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#1e2d42';e.currentTarget.style.background='#0d1627'}}>
                    <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:ws.color}}/>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
                      <div style={{width:40,height:40,borderRadius:11,background:ws.color+'22',border:`1px solid ${ws.color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{ws.icon}</div>
                      <div><div style={{fontSize:14,fontWeight:700,color:'#f1f5f9'}}>{ws.name}</div><div style={{fontSize:11,color:'#64748b'}}>{ws.description}</div></div>
                    </div>
                  </div>
                ))}
                <div onClick={()=>setWsForm('new')} style={{background:'#0d1627',border:'1.5px dashed #1e2d42',borderRadius:14,padding:'28px 20px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:10,transition:'all 0.2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='#6366f1';e.currentTarget.style.background='#131f35'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='#1e2d42';e.currentTarget.style.background='#0d1627'}}>
                  <div style={{width:44,height:44,borderRadius:12,border:'2px dashed #374151',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'#374151'}}>+</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#374151'}}>Create Workspace</div>
                </div>
              </div>
            </div>
          )}

          {/* ── MY BOARD — applies the 3 visibility rules ── */}
          {activeWs&&subView==='board'&&(
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div>
                  <h1 style={{fontSize:20,fontWeight:800,color:'#f1f5f9',margin:0}}>My Board — {activeWs.name}</h1>
                  <p style={{margin:'4px 0 0',fontSize:12,color:'#64748b'}}>{myBoardTasks.length} tasks · <span style={{color:'#818cf8'}}>📥 purple = assigned to me</span> · <span style={{color:'#f59e0b'}}>📤 amber = delegated</span></p>
                </div>
                <button onClick={()=>openNewTask()} style={{background:`linear-gradient(135deg,${wsColor},${wsColor}bb)`,border:'none',borderRadius:9,padding:'8px 18px',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>+ New Task</button>
              </div>
              <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:16,alignItems:'flex-start'}}>
                {statuses.map(st=>(
                  <DropColumn key={st} status={st} tasks={myBoardTasks.filter(t=>t.status===st)}
                    wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu}
                    onEdit={setEditTask} onDelete={handleDeleteTask}
                    dragId={dragId} onDragStart={setDragId} onDrop={handleDrop}
                    onAddTask={s=>openNewTask(s)}/>
                ))}
              </div>
            </div>
          )}

          {/* ── TEAM VIEW — manager sees each member's assigned workload ── */}
          {activeWs&&subView==='team'&&(
            <div>
              <div style={{marginBottom:20}}>
                <h1 style={{fontSize:20,fontWeight:800,color:'#f1f5f9',margin:0}}>Team View — {activeWs.name}</h1>
                <p style={{margin:'4px 0 0',fontSize:12,color:'#64748b'}}>Shows tasks assigned TO each member. Private self-tasks are not shown here.</p>
              </div>
              {wsMembers.map(member=>{
                const isMe=member.id===cu.id
                // Manager view: tasks assigned TO this member by ANYONE (including themselves if they self-assigned from manager)
                // But excludes their pure private tasks (created_by=member AND assigned_to=member AND no one else involved)
                // Rule: show tasks where assigned_to = member AND (created_by ≠ member OR it was explicitly delegated)
                // Simpler: show tasks where assigned_to = member AND created_by ≠ member (tasks given to them)
                //       + tasks where created_by = member AND assigned_to = member that the manager explicitly assigned
                // Actually cleanest: show all tasks where assigned_to = this member (includes mirrored)
                // But NOT tasks where created_by = member AND assigned_to = member (those are their private self-tasks)
                const memberTasks = tasks.filter(t=>
                  t.assigned_to===member.id && t.created_by!==member.id  // tasks assigned TO them BY others
                )
                const selfTasks = tasks.filter(t=>
                  t.created_by===member.id && (!t.assigned_to||t.assigned_to===member.id)
                )
                return(
                  <div key={member.id} style={{background:'#0a1525',border:`1px solid ${isMe?wsColor+'44':'#1e2d42'}`,borderRadius:18,padding:20,marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14,paddingBottom:14,borderBottom:'1px solid #1e2d42'}}>
                      <Avatar user={enrich(member)} size={46}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:16,fontWeight:800,color:'#f1f5f9'}}>{member.name||member.email}{isMe?' (You)':''}</div>
                        <div style={{fontSize:12,color:'#64748b'}}>{member.email}</div>
                      </div>
                      <div style={{display:'flex',gap:14}}>
                        {[
                          {l:'Assigned by others',v:memberTasks.length,c:wsColor},
                          {l:'Own tasks',v:selfTasks.length,c:'#64748b'},
                          {l:'Done',v:memberTasks.filter(t=>t.status===statuses[statuses.length-1]).length,c:'#10b981'},
                        ].map(x=>(
                          <div key={x.l} style={{textAlign:'center',minWidth:55}}>
                            <div style={{fontSize:20,fontWeight:800,color:x.c}}>{x.v}</div>
                            <div style={{fontSize:9,color:'#64748b',marginTop:2,fontWeight:600,lineHeight:1.2}}>{x.l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {memberTasks.length===0?(
                      <div style={{textAlign:'center',padding:'20px',color:'#374151',fontSize:13,border:'2px dashed #1e2d42',borderRadius:12}}>No tasks assigned to {isMe?'you':member.name?.split(' ')[0]||'them'} yet</div>
                    ):(
                      <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:4}}>
                        {statuses.map(st=>(
                          <DropColumn key={st} status={st} tasks={memberTasks.filter(t=>t.status===st)}
                            wsColor={wsColor} SC={SC} wsMembers={wsMembers} cu={cu}
                            onEdit={setEditTask} onDelete={handleDeleteTask}
                            dragId={dragId} onDragStart={setDragId} onDrop={handleDrop}
                            onAddTask={s=>openNewTask(s)} readOnly={false}/>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── ALL TASKS LIST — manager/admin overview ── */}
          {activeWs&&subView==='list'&&(
            <div>
              <h1 style={{fontSize:20,fontWeight:800,color:'#f1f5f9',margin:'0 0 20px'}}>All Tasks — {activeWs.name}</h1>
              <div style={{background:'#0d1627',border:'1px solid #1e2d42',borderRadius:14,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{borderBottom:'1px solid #1e2d42'}}>{['Task','Status','Priority','Creator','Assignee','Due',''].map(h=><th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,color:'#64748b',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {allTasks.map(t=>{
                      const asgn=getUser(t.assigned_to,wsMembers)
                      const crea=getUser(t.created_by,wsMembers)
                      const ov=isOverdue(t.due_date)
                      const col=SC[t.status]||wsColor
                      const isPrivate=t.created_by===t.assigned_to
                      return(
                        <tr key={t.id} style={{borderBottom:'1px solid #1e2d42'}} onMouseEnter={e=>e.currentTarget.style.background='#131f35'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <td style={{padding:'11px 14px'}}>
                            <div style={{display:'flex',alignItems:'center',gap:10}}>
                              <div style={{width:3,height:28,borderRadius:2,background:PC[t.priority],flexShrink:0}}/>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:'#f1f5f9'}}>{t.title}</div>
                                <div style={{fontSize:10,color:'#64748b'}}>{isPrivate?'🔒 Private':t.assigned_to&&t.assigned_to!==t.created_by?'📤 Delegated':'—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{padding:'11px 8px'}}><Pill label={t.status} color={col} sm/></td>
                          <td style={{padding:'11px 8px'}}><Pill label={`${PI[t.priority]} ${t.priority}`} color={PC[t.priority]} sm/></td>
                          <td style={{padding:'11px 8px'}}><div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={crea} size={20}/><span style={{fontSize:11,color:'#94a3b8'}}>{crea?.name?.split(' ')[0]||'?'}</span></div></td>
                          <td style={{padding:'11px 8px'}}>{asgn&&asgn.id!==t.created_by?<div style={{display:'flex',alignItems:'center',gap:5}}><Avatar user={asgn} size={20}/><span style={{fontSize:11,color:'#818cf8'}}>{asgn.name?.split(' ')[0]}</span></div>:<span style={{fontSize:11,color:'#374151'}}>—</span>}</td>
                          <td style={{padding:'11px 8px'}}><span style={{fontSize:12,color:ov?'#ef4444':'#94a3b8',fontWeight:ov?700:400}}>{t.due_date?fmtDate(t.due_date):'—'}</span></td>
                          <td style={{padding:'11px 8px'}}><button onClick={()=>setEditTask(t)} style={{background:wsColor+'22',border:`1px solid ${wsColor}44`,borderRadius:6,padding:'4px 8px',color:wsColor,cursor:'pointer',fontSize:11,fontWeight:600}}>✏️</button></td>
                        </tr>
                      )
                    })}
                    {allTasks.length===0&&<tr><td colSpan={7} style={{padding:40,textAlign:'center',color:'#374151',fontSize:13}}>No tasks yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dashboard */}
          {activeWs&&subView==='dashboard'&&(
            <div>
              <h1 style={{fontSize:20,fontWeight:800,color:'#f1f5f9',margin:'0 0 20px'}}>Dashboard — {activeWs.name}</h1>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
                {[
                  {l:'Total Tasks',v:tasks.length,c:wsColor},
                  {l:'My Board Tasks',v:myBoardTasks.length,c:'#818cf8'},
                  {l:'I Delegated',v:tasks.filter(t=>t.created_by===cu.id&&t.assigned_to&&t.assigned_to!==cu.id).length,c:'#f59e0b'},
                  {l:'Overdue',v:tasks.filter(t=>isOverdue(t.due_date)).length,c:'#ef4444'},
                ].map(x=>(
                  <div key={x.l} style={{background:'#0d1627',border:'1px solid #1e2d42',borderRadius:14,padding:'16px 18px'}}>
                    <div style={{fontSize:28,fontWeight:800,color:x.c,marginBottom:2}}>{x.v}</div>
                    <div style={{fontSize:12,fontWeight:700,color:'#e2e8f0'}}>{x.l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{background:'#0d1627',border:'1px solid #1e2d42',borderRadius:14,padding:16}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:'#f1f5f9'}}>Status Breakdown</div>
                  {statuses.map(s=>{const c=tasks.filter(t=>t.status===s).length;const p=tasks.length?Math.round((c/tasks.length)*100):0;return(<div key={s} style={{marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:12,color:'#94a3b8'}}>{s}</span><span style={{fontSize:12,color:SC[s],fontWeight:700}}>{c}</span></div><div style={{height:5,background:'#1e2d42',borderRadius:3,overflow:'hidden'}}><div style={{width:p+'%',height:'100%',background:SC[s],borderRadius:3}}/></div></div>)})}
                </div>
                <div style={{background:'#0d1627',border:'1px solid #1e2d42',borderRadius:14,padding:16}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:'#f1f5f9'}}>Workload by Member</div>
                  {wsMembers.map(m=>{
                    const assigned=tasks.filter(t=>t.assigned_to===m.id&&t.created_by!==m.id).length
                    const own=tasks.filter(t=>t.created_by===m.id&&(!t.assigned_to||t.assigned_to===m.id)).length
                    return(
                      <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                        <Avatar user={enrich(m)} size={24}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:600,color:'#f1f5f9',marginBottom:2}}>{m.name?.split(' ')[0]||m.email}</div>
                          <div style={{display:'flex',gap:4}}>
                            <span style={{fontSize:10,color:'#818cf8'}}>{assigned} assigned</span>
                            <span style={{fontSize:10,color:'#374151'}}>·</span>
                            <span style={{fontSize:10,color:'#64748b'}}>{own} own</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {isFormOpen&&activeWs&&(
        <TaskFormModal
          open onClose={()=>{setCreateStatus(null);setEditTask(null)}}
          task={editTask} ws={activeWs} wsMembers={wsMembers} cu={cu}
          statuses={statuses} defaultStatus={createStatus||statuses[0]}
          onSave={handleSaveTask} onDelete={handleDeleteTask}/>
      )}
      {wsForm&&<WorkspaceFormModal open onClose={()=>setWsForm(null)} ws={wsForm==='new'?null:wsForm} allProfiles={allProfiles} cu={cu} onSave={handleSaveWorkspace}/>}
      <StatusManager open={statusMgr} onClose={()=>setStatusMgr(false)} statuses={statuses} wsColor={wsColor} onSave={handleSaveStatuses}/>
      <Confirm open={!!delWs} icon="⚠️" title="Delete Workspace?" body={`Delete "${delWs?.name}" and all its tasks?`} confirmLabel="Delete Workspace" onConfirm={()=>handleDeleteWorkspace(delWs?.id)} onCancel={()=>setDelWs(null)}/>
      <AdminPanel open={adminOpen} onClose={()=>setAdminOpen(false)}/>
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [session,      setSession]      = useState(null)
  const [accessStatus, setAccessStatus] = useState(null)
  const [allProfiles,  setAllProfiles]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL||''
  const isAdmin = session?.user?.email===ADMIN_EMAIL

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session);if(session)handleUserAuth(session.user);else setLoading(false)
    })
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{
      setSession(session);if(session)handleUserAuth(session.user);else{setAccessStatus(null);setLoading(false)}
    })
    return()=>subscription.unsubscribe()
  },[])

  const handleUserAuth=async user=>{
    setLoading(true)
    await upsertProfile(user)
    if(user.email===ADMIN_EMAIL){
      await supabase.from('access_requests').upsert({user_id:user.id,email:user.email,name:user.user_metadata?.full_name||user.email,status:'approved'},{onConflict:'user_id'})
      setAccessStatus('approved')
    } else {
      const status=await checkAccessStatus(user.id)
      if(!status){await submitAccessRequest(user);setAccessStatus('pending')}
      else setAccessStatus(status)
    }
    const{data:ar}=await supabase.from('access_requests').select('user_id').eq('status','approved')
    const ids=ar?.map(r=>r.user_id)||[]
    if(ids.length>0){const{data}=await supabase.from('profiles').select('id,email,name,avatar_url').in('id',ids);setAllProfiles(data||[])}
    setLoading(false)
  }

  const handleSignOut=async()=>{await signOut();setSession(null);setAccessStatus(null)}

  if(loading) return <div style={{minHeight:'100vh',background:'#06090f',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif'}}><div style={{textAlign:'center'}}><div style={{fontSize:40,marginBottom:16}}>✦</div><div style={{fontSize:14,color:'#64748b'}}>Loading TaskFlow…</div></div></div>
  if(!session) return <AuthScreen/>
  if(accessStatus==='pending') return <PendingScreen user={session.user} onSignOut={handleSignOut}/>
  if(accessStatus==='denied') return <DeniedScreen onSignOut={handleSignOut}/>
  if(accessStatus==='approved') return <TaskFlowApp cu={session.user} isAdmin={isAdmin} allProfiles={allProfiles} onSignOut={handleSignOut}/>
  return <AuthScreen/>
}
