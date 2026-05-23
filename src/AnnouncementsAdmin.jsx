import { useEffect, useState } from 'react'
import {
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from './lib/supabase'

const KINDS = [
  ['info',    'Info'],
  ['release', 'Release'],
  ['success', 'Live / Good news'],
  ['warn',    'Heads up / Maintenance'],
]
const KIND_COL = {
  info:    '#6366f1', success: '#10b981', warn: '#f59e0b', release: '#0e2a47',
}

const blank = () => ({
  title: '', body: '', kind: 'info',
  cta_label: '', cta_url: '',
  active: true, expires_at: '',
})

const inp = {
  width:'100%', padding:'9px 11px', fontSize:13, fontFamily:'inherit',
  background:'var(--tf-surface)', border:'1px solid var(--tf-border)',
  borderRadius:8, color:'var(--tf-text)', outline:'none', boxSizing:'border-box',
}
const lbl = { fontSize:11, fontWeight:600, color:'var(--tf-text-sub)', marginBottom:5, display:'block', letterSpacing:'.02em' }

export default function AnnouncementsAdmin({ cu, onClose }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | row

  const load = async () => {
    setLoading(true)
    const { data } = await getAllAnnouncements()
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async (form) => {
    const payload = {
      title:     form.title.trim(),
      body:      form.body.trim(),
      kind:      form.kind,
      cta_label: form.cta_label.trim() || null,
      cta_url:   form.cta_url.trim() || null,
      active:    !!form.active,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    }
    if (!payload.title || !payload.body) { alert('Title and body required'); return }
    if (editing === 'new') {
      payload.created_by = cu?.id || null
      const { error } = await createAnnouncement(payload)
      if (error) { alert('Failed: ' + error.message); return }
    } else {
      const { error } = await updateAnnouncement(editing.id, payload)
      if (error) { alert('Failed: ' + error.message); return }
    }
    setEditing(null)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Delete this announcement?')) return
    const { error } = await deleteAnnouncement(id)
    if (error) { alert('Failed: ' + error.message); return }
    load()
  }

  const toggleActive = async (a) => {
    await updateAnnouncement(a.id, { active: !a.active })
    load()
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'var(--tf-bg, #f8fafc)',
      display:'flex', flexDirection:'column', fontFamily:'inherit',
    }}>
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',gap:14,background:'var(--tf-panel)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#0e2a47,#1d4670)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800}}>📣</div>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:'var(--tf-text)',letterSpacing:'-.01em'}}>Announcements</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>Manage in-app notices · {items.length} total</div>
          </div>
        </div>
        <span style={{flex:1}}/>
        <button onClick={()=>setEditing('new')} style={{background:'#0e2a47',border:'none',borderRadius:8,padding:'8px 14px',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>+ New announcement</button>
        <button onClick={onClose} style={{background:'var(--tf-surface)',border:'1px solid var(--tf-border)',borderRadius:6,padding:'7px 12px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✕ Close</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'24px 28px',display:'flex',gap:24}}>
        {/* List */}
        <div style={{flex:1,minWidth:0}}>
          {loading ? (
            <div style={{padding:40,textAlign:'center',color:'var(--tf-text-sub)',fontSize:13}}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{padding:'60px 20px',textAlign:'center',color:'var(--tf-text-sub)'}}>
              <div style={{fontSize:42,opacity:.3,marginBottom:10}}>📣</div>
              <div style={{fontSize:13}}>No announcements yet. Click "+ New" to publish one.</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {items.map(a => {
                const expired = a.expires_at && new Date(a.expires_at) < new Date()
                return (
                  <div key={a.id} style={{
                    background:'var(--tf-panel)', border:'1px solid var(--tf-border)',
                    borderRadius:10, padding:'14px 16px',
                    opacity: (!a.active || expired) ? .55 : 1,
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                      <span style={{width:7,height:7,borderRadius:4,background:KIND_COL[a.kind]||'#94a3b8'}}/>
                      <span style={{fontSize:10,fontWeight:700,letterSpacing:.4,textTransform:'uppercase',color:KIND_COL[a.kind]||'#94a3b8'}}>{a.kind}</span>
                      {!a.active && <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:3,background:'#94a3b81F',color:'#94a3b8',textTransform:'uppercase'}}>Inactive</span>}
                      {expired   && <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:3,background:'#ef44441F',color:'#ef4444',textTransform:'uppercase'}}>Expired</span>}
                      <span style={{flex:1}}/>
                      <span style={{fontSize:10,color:'var(--tf-text-mut)'}}>{new Date(a.published_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})}</span>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:'var(--tf-text)',marginBottom:4}}>{a.title}</div>
                    <div style={{fontSize:12,color:'var(--tf-text-sub)',lineHeight:1.5,whiteSpace:'pre-wrap',marginBottom:8}}>{a.body}</div>
                    {a.cta_label && a.cta_url && (
                      <div style={{fontSize:11,color:'var(--tf-text-mut)',marginBottom:8}}>CTA: <code>{a.cta_label}</code> → <code>{a.cta_url}</code></div>
                    )}
                    <div style={{display:'flex',gap:6,marginTop:6}}>
                      <button onClick={()=>setEditing(a)} style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:6,padding:'5px 10px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>Edit</button>
                      <button onClick={()=>toggleActive(a)} style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:6,padding:'5px 10px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>{a.active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={()=>remove(a.id)} style={{background:'transparent',border:'1px solid #ef444466',borderRadius:6,padding:'5px 10px',color:'#ef4444',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Edit panel */}
        {editing && (
          <div style={{
            flex:'0 0 380px', background:'var(--tf-panel)',
            border:'1px solid var(--tf-border)', borderRadius:12,
            padding:'20px 22px', alignSelf:'flex-start', position:'sticky', top:0,
          }}>
            <EditPanel
              initial={editing === 'new' ? blank() : {
                title: editing.title || '',
                body: editing.body || '',
                kind: editing.kind || 'info',
                cta_label: editing.cta_label || '',
                cta_url: editing.cta_url || '',
                active: editing.active !== false,
                expires_at: editing.expires_at ? new Date(editing.expires_at).toISOString().slice(0,16) : '',
              }}
              isNew={editing === 'new'}
              onSave={save}
              onCancel={()=>setEditing(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function EditPanel({ initial, isNew, onSave, onCancel }) {
  const [form, setForm] = useState(initial)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <>
      <div style={{fontSize:13,fontWeight:800,color:'var(--tf-text)',marginBottom:14}}>
        {isNew ? 'New announcement' : 'Edit announcement'}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:11}}>
        <div>
          <label style={lbl}>Title *</label>
          <input value={form.title} onChange={set('title')} style={inp} placeholder="Short, punchy headline"/>
        </div>
        <div>
          <label style={lbl}>Body *</label>
          <textarea value={form.body} onChange={set('body')} rows={5} style={{...inp,resize:'vertical',minHeight:100}} placeholder="What's the news? Keep it tight — 1-3 sentences."/>
        </div>
        <div>
          <label style={lbl}>Kind</label>
          <select value={form.kind} onChange={set('kind')} style={inp}>
            {KINDS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:11}}>
          <div>
            <label style={lbl}>CTA label (optional)</label>
            <input value={form.cta_label} onChange={set('cta_label')} style={inp} placeholder="Learn more"/>
          </div>
          <div>
            <label style={lbl}>CTA URL (optional)</label>
            <input value={form.cta_url} onChange={set('cta_url')} style={inp} placeholder="https://…"/>
          </div>
        </div>
        <div>
          <label style={lbl}>Expires at (optional)</label>
          <input type="datetime-local" value={form.expires_at} onChange={set('expires_at')} style={inp}/>
          <div style={{fontSize:10,color:'var(--tf-text-mut)',marginTop:4}}>Leave blank to keep visible until you deactivate it.</div>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--tf-text-sub)',cursor:'pointer'}}>
          <input type="checkbox" checked={form.active} onChange={set('active')}/>
          Active (visible to users)
        </label>
        <div style={{display:'flex',gap:8,marginTop:6}}>
          <button onClick={()=>onSave(form)} style={{flex:1,background:'#0e2a47',border:'none',borderRadius:8,padding:'10px 16px',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>{isNew?'Publish':'Save'}</button>
          <button onClick={onCancel} style={{background:'transparent',border:'1px solid var(--tf-border)',borderRadius:8,padding:'10px 14px',color:'var(--tf-text-sub)',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
        </div>
      </div>
    </>
  )
}
