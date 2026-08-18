import React, { useEffect, useMemo, useState } from 'react'

const palette = ['#2F6BFF','#7C3AED','#F59E0B','#14B8A6','#EC4899','#0EA5E9']
function todayISO(){ const d=new Date(), pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function initials(name='Practice'){ return name.trim().split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase()||'?' }
function dateLabel(d){ if(!d)return ''; try{return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}catch{return ''} }

export default function HomeOverview({orgs,workspaces,allProfiles=[],supabase,cu,onOpenOrg,onOpenWorkspace,onCreateOrg}){
  const [meta,setMeta]=useState({}), [loading,setLoading]=useState(true)
  useEffect(()=>{document.body.classList.add('tf-home-active');return()=>document.body.classList.remove('tf-home-active')},[])
  useEffect(()=>{
    let alive=true
    async function load(){
      setLoading(true); const today=todayISO(), next={}
      await Promise.all((orgs||[]).map(async(org,oi)=>{
        const ws=(workspaces||[]).filter(w=>w.org_id===org.id), wsIds=ws.map(w=>w.id); let clients=0,tasks=[],memberIds=[]
        try{const r=await supabase.from('clients').select('id',{count:'exact',head:true}).eq('org_id',org.id);clients=r.count||0}catch{}
        if(wsIds.length)try{const r=await supabase.from('tasks').select('id,title,status,due_date,created_at,updated_at,workspace_id').in('workspace_id',wsIds).limit(500);tasks=r.data||[]}catch{}
        try{const r=await supabase.from('organization_members').select('user_id').eq('org_id',org.id).limit(50);memberIds=(r.data||[]).map(x=>x.user_id)}catch{}
        const active=tasks.filter(t=>(t.status||'Todo')!=='Done'), dueToday=active.filter(t=>t.due_date===today), overdue=active.filter(t=>t.due_date&&t.due_date<today), review=active.filter(t=>String(t.status||'').toLowerCase()==='review')
        next[org.id]={clients,tasks,active:active.length,dueToday:dueToday.length,overdue:overdue.length,review:review.length,memberIds,wsCount:ws.length,color:palette[oi%palette.length]}
      }))
      if(alive){setMeta(next);setLoading(false)}
    }
    if(orgs?.length)load();else{setMeta({});setLoading(false)}
    return()=>{alive=false}
  },[orgs,workspaces,supabase])

  const summary=useMemo(()=>{const vals=Object.values(meta), tasks=vals.flatMap(v=>v.tasks||[]); return {clients:vals.reduce((n,v)=>n+(v.clients||0),0),active:vals.reduce((n,v)=>n+(v.active||0),0),dueToday:vals.reduce((n,v)=>n+(v.dueToday||0),0),overdue:vals.reduce((n,v)=>n+(v.overdue||0),0),review:vals.reduce((n,v)=>n+(v.review||0),0),recent:tasks.sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0)).slice(0,5)}} , [meta])
  const orgName=cu?.user_metadata?.full_name||cu?.name||(cu?.email||'').split('@')[0]||'there'
  const topOrgs=[...(orgs||[])].sort((a,b)=>(meta[b.id]?.active||0)-(meta[a.id]?.active||0))

  return <div className="tf-home-overview" style={{flex:1,overflowY:'auto',padding:'30px 30px 56px'}}><div className="tf-home-shell">
    <section className="tf-home-hero"><div><div className="tf-home-kicker">TASKFLOWCO · YOUR PRACTICE HOME</div><h1>Welcome back, {orgName}! <span>👋</span></h1><p>One calm place to choose a practice, jump into your work, and keep the day moving.</p></div><button className="tf-home-focus" onClick={()=>{const first=workspaces?.[0];if(first)onOpenWorkspace(first)}}><div className="tf-focus-icon">◎</div><div className="tf-focus-copy"><b>Today's Focus</b><span>{summary.dueToday||0} due today · {summary.review||0} under review</span></div><span className="tf-focus-arrow">›</span></button></section>
    <section className="tf-home-stats">{[['◌','Total Clients',summary.clients,'Firm-wide client base'],['✓','Active Tasks',summary.active,'Not yet completed'],['□','Due Today',summary.dueToday,'Keep these moving'],['!','Overdue',summary.overdue,'Needs attention']].map(([ic,label,val,sub],i)=><div key={label} className={`tf-stat tf-stat-${i}`}><div className="tf-stat-icon">{ic}</div><div><div className="tf-stat-value">{loading?'—':val}</div><div className="tf-stat-label">{label}</div><div className="tf-stat-sub">{sub}</div></div></div>)}</section>

    <section><div className="tf-home-section-head"><div><h2>Your Practices</h2><p>Select a practice to continue</p></div><button onClick={onCreateOrg}>+ New Practice</button></div>
      {topOrgs.length===0?<div className="tf-home-empty"><b>No practices yet</b><span>Create your first practice to begin.</span><button onClick={onCreateOrg}>Create Practice</button></div>:<div className="tf-practice-grid">{topOrgs.map((org,i)=>{const m=meta[org.id]||{},pc=m.color||palette[i%palette.length], memberProfiles=(m.memberIds||[]).map(id=>allProfiles.find(p=>p.id===id)).filter(Boolean).slice(0,4);return <button key={org.id} className="tf-practice-card" onClick={()=>onOpenOrg(org)} style={{'--accent':pc}}><div className="tf-practice-head"><div className="tf-practice-avatar">{initials(org.name)}</div><div><b>{org.name}</b><span>{org.description||'Practice workspace'}</span></div></div><div className="tf-practice-metrics"><div><strong>{m.clients??0}</strong><span>Clients</span></div><div><strong>{m.active??0}</strong><span>Tasks</span></div><div><strong>{m.dueToday??0}</strong><span>Due Today</span></div><div><strong>{m.overdue??0}</strong><span>Overdue</span></div></div><div className="tf-practice-foot"><div className="tf-mini-avatars">{memberProfiles.map((p,j)=><span key={p.id||j}>{(p.name||p.email||'?').charAt(0).toUpperCase()}</span>)}{m.memberIds?.length>4&&<em>+{m.memberIds.length-4}</em>}</div><span className="tf-open-link">Open Practice <b>→</b></span></div></button>})}</div>}
    </section>

    <section><div className="tf-home-section-head"><div><h2>Other Workspaces</h2><p>Tasks, boards and team collaboration</p></div><span className="tf-home-section-link">View all →</span></div><div className="tf-other-grid">{(workspaces||[]).slice(0,6).map((ws,i)=><button key={ws.id} className="tf-other-card" onClick={()=>onOpenWorkspace(ws)} style={{'--accent':ws.color||palette[i%palette.length]}}><span className="tf-other-icon">{ws.icon||'□'}</span><span className="tf-other-copy"><b>{ws.name}</b><small>{ws.description||'Workspace'}</small><em>{meta[ws.org_id]?.active||0} active tasks</em></span><span>›</span></button>)}</div></section>

    <section className="tf-home-bottom-grid"><div><div className="tf-home-section-head"><div><h2>Recent Activity</h2><p>Your latest work across practices</p></div><span className="tf-home-section-link">View all →</span></div><div className="tf-activity-list">{summary.recent.length?summary.recent.map((t,i)=><div key={t.id||i} className="tf-activity-row"><span className="tf-activity-dot"/><div><b>{t.title||'Untitled task'}</b><small>{t.status||'Todo'} · {dateLabel(t.updated_at||t.created_at)}</small></div><span className="tf-activity-age">{i<1?'Just now':i===1?'Today':'Recent'}</span></div>):<div className="tf-home-empty small"><b>No recent activity</b><span>Recent tasks will appear here.</span></div>}</div></div><div className="tf-desktop-card"><div className="tf-desktop-icon">↗</div><h3>Keep work within reach</h3><p>Open My Work or any workspace from the top bar whenever you need a focused task view.</p><button onClick={()=>{const first=workspaces?.[0];if(first)onOpenWorkspace(first)}}>Open Workspace →</button></div></section>
  </div></div>
}
