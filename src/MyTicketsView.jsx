import { useEffect, useState } from 'react'
import { getMyTickets } from './lib/supabase'

const COL = {
  open:         '#f59e0b',
  in_progress:  '#6366f1',
  resolved:     '#10b981',
  closed:       '#94a3b8',
}

export default function MyTicketsView() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [open,    setOpen]    = useState(null) // expanded ticket id

  useEffect(() => {
    (async () => {
      const { data, error } = await getMyTickets()
      if (error) console.error(error)
      setTickets(data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <div style={{padding:24,fontSize:13,color:'var(--tf-text-sub)',textAlign:'center'}}>Loading…</div>
  }
  if (!tickets.length) {
    return (
      <div style={{padding:'40px 20px',textAlign:'center',color:'var(--tf-text-sub)'}}>
        <div style={{fontSize:38,opacity:.35,marginBottom:10}}>✉</div>
        <div style={{fontSize:13,fontWeight:600,color:'var(--tf-text)',marginBottom:4}}>No tickets yet</div>
        <div style={{fontSize:12}}>Submit one from the "Send message" tab and it will show up here.</div>
      </div>
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {tickets.map(t => {
        const isOpen = open === t.id
        return (
          <div key={t.id} style={{
            border:'1px solid var(--tf-border)', borderRadius:10, overflow:'hidden',
            background:'var(--tf-surface)',
          }}>
            <button onClick={()=>setOpen(isOpen ? null : t.id)} style={{
              all:'unset', cursor:'pointer', width:'100%', display:'block',
              padding:'12px 14px', boxSizing:'border-box',
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={{width:6,height:6,borderRadius:3,background:COL[t.status]||'#94a3b8'}}/>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:.4,textTransform:'uppercase',color:COL[t.status]||'#94a3b8'}}>
                  {t.status.replace('_',' ')}
                </span>
                <span style={{flex:1}}/>
                <span style={{fontSize:10,color:'var(--tf-text-mut)'}}>{new Date(t.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})}</span>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--tf-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.subject}</div>
              {!isOpen && (
                <div style={{fontSize:11,color:'var(--tf-text-sub)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.message}</div>
              )}
            </button>
            {isOpen && (
              <div style={{padding:'4px 14px 14px',fontSize:12,color:'var(--tf-text)',lineHeight:1.6,whiteSpace:'pre-wrap',borderTop:'1px dashed var(--tf-border)'}}>
                <div style={{fontSize:10,color:'var(--tf-text-mut)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700,margin:'8px 0 4px'}}>Your message</div>
                {t.message}
                {t.admin_notes && (
                  <>
                    <div style={{fontSize:10,color:'var(--tf-text-mut)',textTransform:'uppercase',letterSpacing:.5,fontWeight:700,margin:'12px 0 4px'}}>Notes from support</div>
                    <div style={{padding:'8px 10px',background:'var(--tf-panel)',border:'1px solid var(--tf-border)',borderRadius:6}}>{t.admin_notes}</div>
                  </>
                )}
                <div style={{fontSize:10,color:'var(--tf-text-mut)',marginTop:10,display:'flex',gap:10,flexWrap:'wrap'}}>
                  <span>Category: <b style={{color:'var(--tf-text-sub)',textTransform:'capitalize'}}>{t.category}</b></span>
                  <span>Priority: <b style={{color:'var(--tf-text-sub)',textTransform:'capitalize'}}>{t.priority}</b></span>
                  {t.resolved_at && <span>Resolved: {new Date(t.resolved_at).toLocaleDateString('en-IN')}</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
