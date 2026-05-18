import { useEffect, useState, useRef } from 'react'
import { Megaphone, X } from 'lucide-react'
import {
  getActiveAnnouncements,
  getMyReadAnnouncementIds,
  markAnnouncementRead,
  isAdminEmail,
} from './lib/supabase'

const KIND_COL = {
  info:    { bg: '#6366f11A', fg: '#6366f1', label: 'Update'  },
  success: { bg: '#10b9811A', fg: '#10b981', label: 'Live'    },
  warn:    { bg: '#f59e0b1A', fg: '#f59e0b', label: 'Notice'  },
  release: { bg: '#6b8cad1A', fg: '#6b8cad', label: 'Release' },
}

export default function AnnouncementsBell({ cu, onManage }) {
  const [items,  setItems]  = useState([])
  const [readIds,setReadIds]= useState(new Set())
  const [open,   setOpen]   = useState(false)
  const ref = useRef(null)

  const load = async () => {
    const [a, r] = await Promise.all([
      getActiveAnnouncements(),
      getMyReadAnnouncementIds(),
    ])
    setItems(a.data || [])
    setReadIds(new Set(r.data || []))
  }

  useEffect(() => { load() }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = items.filter(a => !readIds.has(a.id)).length

  const markRead = async (id) => {
    if (readIds.has(id) || !cu?.id) return
    await markAnnouncementRead(id, cu.id)
    setReadIds(prev => new Set([...prev, id]))
  }

  const markAllRead = async () => {
    if (!cu?.id) return
    const unreadItems = items.filter(a => !readIds.has(a.id))
    await Promise.all(unreadItems.map(a => markAnnouncementRead(a.id, cu.id)))
    setReadIds(new Set(items.map(a => a.id)))
  }

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button
        onClick={()=>setOpen(o=>!o)}
        title="Announcements"
        style={{
          position:'relative', background:'transparent', border:'1px solid var(--tf-border)',
          borderRadius:6, padding:'5px 8px', cursor:'pointer',
          color: 'var(--tf-text-sub)', fontFamily:'inherit',
          display:'inline-flex', alignItems:'center',
        }}
      >
        <Megaphone size={14}/>
        {unread > 0 && (
          <span style={{
            position:'absolute', top:-3, right:-3,
            minWidth:15, height:15, padding:'0 4px',
            borderRadius:8, background:'#ef4444', color:'#fff',
            fontSize:9, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 0 2px var(--tf-panel)',
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', right:0,
          width:380, maxHeight:'70vh', overflowY:'auto',
          background:'var(--tf-panel)', border:'1px solid var(--tf-border)',
          borderRadius:12, boxShadow:'0 20px 60px rgba(0,0,0,.35)', zIndex:9999,
        }}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--tf-border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:'var(--tf-text)'}}>Announcements</div>
              <div style={{fontSize:11,color:'var(--tf-text-sub)'}}>{items.length === 0 ? 'Nothing yet' : `${unread} unread · ${items.length} total`}</div>
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{
                background:'transparent', border:'none', cursor:'pointer',
                color:'#6b8cad', fontSize:11, fontWeight:700, fontFamily:'inherit',
              }}>Mark all read</button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{padding:'40px 20px',textAlign:'center',color:'var(--tf-text-sub)'}}>
              <Megaphone size={26} style={{opacity:.3,marginBottom:8}}/>
              <div style={{fontSize:12}}>No announcements right now.</div>
            </div>
          ) : (
            <div>
              {items.map(a => {
                const k = KIND_COL[a.kind] || KIND_COL.info
                const isRead = readIds.has(a.id)
                return (
                  <div key={a.id} onClick={()=>markRead(a.id)} style={{
                    padding:'14px 16px',
                    borderBottom:'1px solid var(--tf-border)',
                    cursor: isRead ? 'default' : 'pointer',
                    background: isRead ? 'transparent' : 'var(--tf-surface)',
                    position:'relative',
                  }}>
                    {!isRead && (
                      <span style={{position:'absolute',top:18,left:6,width:6,height:6,borderRadius:3,background:'#ef4444'}}/>
                    )}
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:3,background:k.bg,color:k.fg,textTransform:'uppercase',letterSpacing:.4}}>{k.label}</span>
                      <span style={{flex:1}}/>
                      <span style={{fontSize:10,color:'var(--tf-text-mut)'}}>{new Date(a.published_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>
                    </div>
                    <div style={{fontSize:13,fontWeight:isRead?600:800,color:'var(--tf-text)',marginBottom:4,letterSpacing:'-.01em'}}>{a.title}</div>
                    <div style={{fontSize:12,color:'var(--tf-text-sub)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{a.body}</div>
                    {a.cta_label && a.cta_url && (
                      <a href={a.cta_url} target="_blank" rel="noreferrer" style={{
                        display:'inline-block', marginTop:8,
                        background:'#6b8cad', color:'#fff', textDecoration:'none',
                        padding:'6px 12px', borderRadius:6, fontSize:11, fontWeight:700,
                      }}>{a.cta_label} →</a>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {isAdminEmail(cu?.email) && (
            <div style={{padding:'10px 14px',borderTop:'1px solid var(--tf-border)',background:'var(--tf-surface)'}}>
              <button
                onClick={()=>{ setOpen(false); onManage && onManage() }}
                style={{
                  width:'100%', background:'transparent', border:'1px dashed var(--tf-border)',
                  borderRadius:8, padding:'8px 12px', cursor:'pointer',
                  color:'#6b8cad', fontSize:12, fontWeight:700, fontFamily:'inherit',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                }}
              >+ New / manage announcements</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
