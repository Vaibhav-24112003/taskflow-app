import { useState, useEffect } from 'react'
import { getAllTickets, updateSupportTicket } from './lib/supabase'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']
const COL = {
  open:         '#f59e0b',
  in_progress:  '#6366f1',
  resolved:     '#10b981',
  closed:       '#94a3b8',
}
const PCOL = {
  urgent: '#ef4444', high: '#f59e0b', normal: '#6366f1', low: '#94a3b8',
}

export default function SupportAdminView({ onClose }) {
  const [tickets, setTickets] = useState([])
  const [filter,  setFilter]  = useState('open')
  const [sel,     setSel]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data, error } = await getAllTickets(filter === 'all' ? {} : { status: filter })
    if (error) console.error(error)
    setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  const counts = STATUSES.reduce((a, s) => ({ ...a, [s]: tickets.filter(t => t.status === s).length }), {})

  const setStatus = async (id, status) => {
    const { data, error } = await updateSupportTicket(id, { status })
    if (error) { alert('Failed: ' + error.message); return }
    if (data) {
      setTickets(t => t.map(x => x.id === id ? data : x))
      if (sel?.id === id) setSel(data)
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'var(--tf-bg, #f8fafc)',
      display:'flex', flexDirection:'column',
      fontFamily:'inherit',
    }}>
      {/* Header */}
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--tf-border, #e2e8f0)',display:'flex',alignItems:'center',gap:14,flexShrink:0,background:'var(--tf-panel, #fff)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#2F6BFF,#14C7C0)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4.5 12.5 10 18 20 6.5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:'var(--tf-text, #111827)',letterSpacing:'-.01em'}}>Support Tickets</div>
            <div style={{fontSize:11,color:'var(--tf-text-sub, #6b7280)'}}>Admin view · TaskFlowCo</div>
          </div>
        </div>

        <div style={{flex:1,display:'flex',gap:4,marginLeft:18,flexWrap:'wrap'}}>
          {['all', ...STATUSES].map(s => (
            <button key={s} onClick={()=>setFilter(s)} style={{
              background: filter === s ? 'var(--tf-surface-hov, #e2e8f0)' : 'transparent',
              border: '1px solid ' + (filter === s ? 'var(--tf-border-hov, #cbd5e1)' : 'transparent'),
              borderRadius: 6, padding:'5px 12px', cursor:'pointer',
              fontSize: 12, fontWeight:600, fontFamily:'inherit',
              color: filter === s ? 'var(--tf-text, #111827)' : 'var(--tf-text-sub, #6b7280)',
              textTransform:'capitalize',
            }}>
              {s.replace('_', ' ')}
              {s !== 'all' && <span style={{color:'var(--tf-text-mut, #94a3b8)', marginLeft:5, fontVariantNumeric:'tabular-nums'}}>{counts[s] || 0}</span>}
            </button>
          ))}
        </div>

        <button onClick={load} title="Refresh" style={{background:'transparent',border:'1px solid var(--tf-border, #e2e8f0)',borderRadius:6,padding:'5px 10px',color:'var(--tf-text-sub, #6b7280)',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>↻</button>
        <button onClick={onClose} style={{background:'var(--tf-surface, #f1f5f9)',border:'1px solid var(--tf-border, #e2e8f0)',borderRadius:6,padding:'6px 12px',color:'var(--tf-text-sub, #6b7280)',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✕ Close</button>
      </div>

      {/* Body */}
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>

        {/* List */}
        <div style={{flex:'0 0 380px',borderRight:'1px solid var(--tf-border, #e2e8f0)',overflowY:'auto',background:'var(--tf-panel, #fff)'}}>
          {loading ? (
            <div style={{padding:32,color:'var(--tf-text-sub, #6b7280)',fontSize:13,textAlign:'center'}}>Loading tickets…</div>
          ) : tickets.length === 0 ? (
            <div style={{padding:48,color:'var(--tf-text-sub, #6b7280)',fontSize:13,textAlign:'center'}}>
              <div style={{fontSize:36,marginBottom:10,opacity:.4}}>✉</div>
              No tickets in this filter
            </div>
          ) : tickets.map(t => (
            <div key={t.id} onClick={()=>setSel(t)} style={{
              padding:'14px 18px',
              borderBottom:'1px solid var(--tf-border, #e2e8f0)',
              cursor:'pointer',
              background: sel?.id === t.id ? 'var(--tf-surface-hov, #f1f5f9)' : 'transparent',
              borderLeft: sel?.id === t.id ? '3px solid #0e2a47' : '3px solid transparent',
              transition: 'background .12s ease',
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                <span style={{width:6,height:6,borderRadius:3,background:COL[t.status]}}/>
                <span style={{fontSize:10,color:'var(--tf-text-mut, #94a3b8)',textTransform:'uppercase',letterSpacing:.5,fontWeight:600}}>{t.status.replace('_',' ')}</span>
                {t.priority !== 'normal' && (
                  <span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:`${PCOL[t.priority]||'#94a3b8'}1F`,color:PCOL[t.priority]||'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:.3}}>{t.priority}</span>
                )}
                <span style={{flex:1}}/>
                <span style={{fontSize:10,color:'var(--tf-text-mut, #94a3b8)'}}>{new Date(t.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text, #111827)',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.subject}</div>
              <div style={{fontSize:11,color:'var(--tf-text-sub, #6b7280)',marginBottom:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.message}</div>
              <div style={{fontSize:10,color:'var(--tf-text-mut, #94a3b8)',display:'flex',gap:8,alignItems:'center'}}>
                <span>{t.email}</span>
                <span>·</span>
                <span style={{textTransform:'capitalize'}}>{t.category}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{flex:1,overflowY:'auto',background:'var(--tf-bg, #f8fafc)'}}>
          {sel ? (
            <div style={{padding:'32px 36px',maxWidth:820}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
                <span style={{fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:4,letterSpacing:.5,textTransform:'uppercase',color:COL[sel.status],background:`${COL[sel.status]}1F`}}>{sel.status.replace('_',' ')}</span>
                <span style={{fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:4,letterSpacing:.5,textTransform:'uppercase',color:PCOL[sel.priority]||'#94a3b8',background:`${PCOL[sel.priority]||'#94a3b8'}1F`}}>{sel.priority}</span>
                <span style={{fontSize:11,color:'var(--tf-text-sub, #6b7280)',textTransform:'capitalize'}}>{sel.category}</span>
                <span style={{flex:1}}/>
                <span style={{fontSize:11,color:'var(--tf-text-mut, #94a3b8)'}}>{new Date(sel.created_at).toLocaleString('en-IN')}</span>
              </div>

              <h1 style={{fontSize:26,fontWeight:800,color:'var(--tf-text, #111827)',margin:'0 0 8px',letterSpacing:'-.02em',lineHeight:1.2}}>{sel.subject}</h1>

              <div style={{fontSize:13,color:'var(--tf-text-sub, #6b7280)',marginBottom:24}}>
                From <a href={`mailto:${sel.email}`} style={{color:'#0e2a47',fontWeight:600,textDecoration:'none'}}>{sel.name || sel.email}</a>
                {sel.name && <span style={{color:'var(--tf-text-mut, #94a3b8)',marginLeft:6}}>&lt;{sel.email}&gt;</span>}
                {sel.source && <span style={{marginLeft:10,padding:'2px 8px',background:'var(--tf-surface, #f1f5f9)',border:'1px solid var(--tf-border, #e2e8f0)',borderRadius:4,fontSize:11,color:'var(--tf-text-mut, #94a3b8)'}}>via {sel.source}</span>}
              </div>

              <div style={{background:'var(--tf-panel, #fff)',border:'1px solid var(--tf-border, #e2e8f0)',borderRadius:10,padding:'20px 22px',fontSize:14,color:'var(--tf-text, #111827)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>
                {sel.message}
              </div>

              <div style={{display:'flex',gap:8,marginTop:24,flexWrap:'wrap',alignItems:'center'}}>
                <a href={`mailto:${sel.email}?subject=${encodeURIComponent('Re: ' + sel.subject)}`} style={{
                  background:'#0e2a47', border:'none', borderRadius:8,
                  padding:'10px 18px', color:'#fff', textDecoration:'none',
                  fontSize:13, fontWeight:700,
                }}>
                  ✉  Reply via email
                </a>
                <span style={{flex:1,minWidth:8}}/>
                <span style={{fontSize:11,color:'var(--tf-text-mut, #94a3b8)',marginRight:4}}>Set status:</span>
                {STATUSES.map(s => (
                  <button key={s} onClick={()=>setStatus(sel.id, s)} disabled={sel.status === s} style={{
                    background: sel.status === s ? `${COL[s]}1F` : 'transparent',
                    border:`1px solid ${sel.status === s ? COL[s] : 'var(--tf-border, #e2e8f0)'}`,
                    borderRadius:6, padding:'7px 14px',
                    color: sel.status === s ? COL[s] : 'var(--tf-text-sub, #6b7280)',
                    cursor: sel.status === s ? 'default' : 'pointer',
                    fontSize:11, fontWeight:600, fontFamily:'inherit',
                    textTransform:'capitalize',
                  }}>{s.replace('_',' ')}</button>
                ))}
              </div>

              <div style={{marginTop:32,paddingTop:18,borderTop:'1px solid var(--tf-border, #e2e8f0)',fontSize:11,color:'var(--tf-text-mut, #94a3b8)',display:'flex',gap:14,flexWrap:'wrap'}}>
                <span>Ticket ID: <code style={{fontFamily:'ui-monospace,monospace'}}>{sel.id}</code></span>
                {sel.user_id && <span>User: <code style={{fontFamily:'ui-monospace,monospace'}}>{sel.user_id.slice(0,8)}…</code></span>}
                {sel.resolved_at && <span>Resolved: {new Date(sel.resolved_at).toLocaleString('en-IN')}</span>}
              </div>
            </div>
          ) : (
            <div style={{padding:64,textAlign:'center',color:'var(--tf-text-sub, #6b7280)'}}>
              <div style={{fontSize:42,marginBottom:12,opacity:.35}}>✉</div>
              <div style={{fontSize:14}}>Select a ticket on the left to view details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
