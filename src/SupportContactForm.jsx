import { useState } from 'react'
import { createSupportTicket, notifyAdminOfTicket } from './lib/supabase'

const CATEGORIES = [
  ['general',  'General question'],
  ['bug',      'Bug report'],
  ['billing',  'Billing & subscription'],
  ['feature',  'Feature request'],
  ['account',  'Account access'],
]

const inp = {
  width:'100%', padding:'10px 12px', background:'var(--lp-surface, var(--tf-surface, #f8fafc))',
  border:'1px solid var(--lp-border, var(--tf-border, #e2e8f0))',
  borderRadius:8, color:'var(--lp-text, var(--tf-text, #111827))',
  fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box',
}
const lbl = { fontSize:11, fontWeight:600, color:'var(--lp-text-sub, var(--tf-text-sub, #6b7280))', marginBottom:5, display:'block', letterSpacing:'.02em' }

export default function SupportContactForm({
  defaultName  = '',
  defaultEmail = '',
  source       = 'landing',
  userId       = null,
  orgId        = null,
  compact      = false,
  onSubmitted,
}) {
  const [name,     setName]     = useState(defaultName)
  const [email,    setEmail]    = useState(defaultEmail)
  const [category, setCategory] = useState('general')
  const [subject,  setSubject]  = useState('')
  const [message,  setMessage]  = useState('')
  const [busy,     setBusy]     = useState(false)
  const [status,   setStatus]   = useState(null)   // null | 'ok' | 'err'
  const [errMsg,   setErrMsg]   = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !subject.trim() || !message.trim()) {
      setStatus('err'); setErrMsg('Email, subject and message are required.')
      return
    }
    setBusy(true); setStatus(null)
    try {
      const { data: ticket, error } = await createSupportTicket({
        name: name.trim() || null,
        email: email.trim().toLowerCase(),
        category, subject: subject.trim(), message: message.trim(),
        source, user_id: userId, org_id: orgId,
      })
      if (error) throw error
      // Fire-and-forget — UX shouldn't wait on email
      notifyAdminOfTicket(ticket).catch(() => {})
      setStatus('ok')
      setSubject(''); setMessage(''); setCategory('general')
      onSubmitted?.(ticket)
    } catch (err) {
      setStatus('err')
      setErrMsg(err?.message || 'Could not send. Please email support@taskflowco.in directly.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'ok') {
    return (
      <div style={{padding:'28px 24px',textAlign:'center',background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.3)',borderRadius:12}}>
        <div style={{width:42,height:42,borderRadius:21,background:'#10b981',color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:10}}>✓</div>
        <div style={{fontSize:15,fontWeight:700,color:'var(--lp-text, var(--tf-text))',marginBottom:6,letterSpacing:'-.01em'}}>Got it — we'll be in touch</div>
        <div style={{fontSize:13,color:'var(--lp-text-sub, var(--tf-text-sub))',maxWidth:360,margin:'0 auto'}}>Most queries are answered within one business day. We'll reply to <b>{email}</b>.</div>
        <button onClick={()=>setStatus(null)} style={{marginTop:16,background:'transparent',border:'1px solid var(--lp-border, var(--tf-border))',borderRadius:8,padding:'7px 16px',color:'var(--lp-text-sub, var(--tf-text-sub))',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Send another</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
      {!compact ? (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <label style={lbl}>Your name</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Optional" style={inp}/>
          </div>
          <div>
            <label style={lbl}>Email *</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@firm.in" style={inp} required/>
          </div>
        </div>
      ) : (
        <div>
          <label style={lbl}>Email *</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@firm.in" style={inp} required/>
        </div>
      )}

      <div>
        <label style={lbl}>Category</label>
        <select value={category} onChange={e=>setCategory(e.target.value)} style={inp}>
          {CATEGORIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div>
        <label style={lbl}>Subject *</label>
        <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="A short title for your query" style={inp} required/>
      </div>

      <div>
        <label style={lbl}>Message *</label>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Tell us what's going on…" rows={5} style={{...inp, resize:'vertical', minHeight:110}} required/>
      </div>

      {status === 'err' && (
        <div style={{fontSize:12,color:'#ef4444',padding:'9px 12px',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:7}}>
          {errMsg}
        </div>
      )}

      <button type="submit" disabled={busy} style={{
        background: busy ? '#94a3b8' : '#0e2a47',
        border:'none', borderRadius:8, padding:'11px 18px',
        color:'#fff', cursor: busy ? 'wait' : 'pointer',
        fontSize:13, fontWeight:700, fontFamily:'inherit', marginTop:4,
      }}>
        {busy ? 'Sending…' : 'Send message  →'}
      </button>

      <div style={{fontSize:11,color:'var(--lp-text-mut, var(--tf-text-mut, #9ca3af))',textAlign:'center',marginTop:2}}>
        Or email us directly at <a href="mailto:support@taskflowco.in" style={{color:'var(--lp-text-sub, var(--tf-text-sub))',textDecoration:'underline'}}>support@taskflowco.in</a>
      </div>
    </form>
  )
}
