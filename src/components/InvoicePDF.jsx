// src/components/InvoicePDF.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const fmtRs  = n => new Intl.NumberFormat('en-IN', { minimumFractionDigits:2 }).format(n)
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })

export default function InvoicePDF({ invoiceNumber, onClose }) {
  const [d, setD]   = useState(null)
  const [err, setErr] = useState('')
  const [loading, setL] = useState(true)

  useEffect(() => { if (invoiceNumber) load() }, [invoiceNumber])

  async function load() {
    setL(true)
    try {
      const { data: inv } = await supabase.from('subscription_invoices').select('*').eq('invoice_number', invoiceNumber).single()
      if (!inv) throw new Error('Invoice not found')
      const { data: org }    = await supabase.from('organizations').select('name,address,gstin').eq('id', inv.org_id).single()
      const { data: member } = await supabase.from('organization_members').select('user_id').eq('org_id', inv.org_id).eq('role','owner').maybeSingle()
      let ownerName = org?.name || '', ownerEmail = ''
      if (member?.user_id) {
        const { data: p } = await supabase.from('profiles').select('name,email').eq('id', member.user_id).maybeSingle()
        if (p?.name)  ownerName  = p.name
        if (p?.email) ownerEmail = p.email
      }
      const { data: plan } = await supabase.from('plans').select('name').eq('id', inv.plan_id).maybeSingle()
      const { data: pe }   = inv.payment_event_id
        ? await supabase.from('payment_events').select('razorpay_payment_id,razorpay_order_id,created_at').eq('id', inv.payment_event_id).maybeSingle()
        : { data: null }
      setD({ inv, org, ownerName, ownerEmail, plan, pe })
    } catch(e) { setErr(e.message) }
    setL(false)
  }

  if (loading) return (
    <div style={overlay}>
      <div style={{ textAlign:'center', color:'#64748b', fontFamily:'Arial,sans-serif' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📄</div>
        <div>Loading invoice…</div>
      </div>
    </div>
  )

  if (err || !d) return (
    <div style={overlay}>
      <div style={{ textAlign:'center', fontFamily:'Arial,sans-serif' }}>
        <div style={{ fontSize:32, marginBottom:12, color:'#ef4444' }}>⚠</div>
        <div style={{ color:'#ef4444' }}>{err || 'Invoice not found'}</div>
        {onClose && <button onClick={onClose} style={btnClose}>Close</button>}
      </div>
    </div>
  )

  const { inv, org, ownerName, ownerEmail, plan, pe } = d
  const totalRs    = Number(inv.amount) / 100
  const planName   = plan?.name || inv.plan_id || 'Subscription'
  const cycleLabel = inv.billing_cycle === 'yearly' ? 'Annual Subscription' : 'Monthly Subscription'
  const invDate    = fmtDate(inv.created_at)
  const payDate    = pe?.created_at ? fmtDate(pe.created_at) : invDate

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose && onClose()}>
      <div style={modal}>

        {/* Action bar */}
        <div className="no-print" style={actionBar}>
          <span style={{ fontSize:13, fontWeight:700, color:'#475569' }}>{invoiceNumber}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => window.print()} style={btnPrint}>Print / Save PDF</button>
            {onClose && <button onClick={onClose} style={btnClose}>Close</button>}
          </div>
        </div>

        {/* Invoice body */}
        <div id="invoice-content" style={body}>

          {/* Header */}
          <div style={headerRow}>
            <div>
              <div style={{ fontSize:26, fontWeight:900, color:'#2F6BFF', marginBottom:4 }}>Taskflow/co</div>
              <div style={{ fontSize:12, color:'#64748b', lineHeight:1.7 }}>
                <div>Practice Management Software</div>
                <div>Pune, Maharashtra, India</div>
                <div>support@taskflowco.in</div>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:20, fontWeight:800, color:'#1a2840', marginBottom:6 }}>PAYMENT RECEIPT</div>
              <div style={{ fontSize:13, color:'#64748b', lineHeight:1.8 }}>
                <div style={{ fontWeight:700, color:'#2F6BFF' }}>{inv.invoice_number}</div>
                <div>Date: {invDate}</div>
              </div>
              <div style={paidBadge}>PAID</div>
            </div>
          </div>

          {/* Bill to + Payment details */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, marginBottom:28 }}>
            <div>
              <div style={sectionLabel}>Bill To</div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{org?.name || ownerName}</div>
              <div style={{ fontSize:13, color:'#475569', lineHeight:1.7 }}>
                {ownerName && ownerName !== org?.name && <div>{ownerName}</div>}
                {ownerEmail && <div>{ownerEmail}</div>}
                {org?.address && <div>{org.address}</div>}
                {org?.gstin && <div>GSTIN: {org.gstin}</div>}
              </div>
            </div>
            <div>
              <div style={sectionLabel}>Payment Details</div>
              <div style={{ fontSize:13, color:'#475569', lineHeight:1.8 }}>
                <div><span style={{ color:'#94a3b8' }}>Date: </span><strong>{payDate}</strong></div>
                <div><span style={{ color:'#94a3b8' }}>Mode: </span><strong>Razorpay — Online</strong></div>
                {pe?.razorpay_payment_id && (
                  <div style={{ fontSize:11 }}>
                    <span style={{ color:'#94a3b8' }}>Ref: </span>
                    <span style={{ fontFamily:'monospace' }}>{pe.razorpay_payment_id}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line items */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:24 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Description','Qty','Amount'].map(h => (
                  <th key={h} style={{ padding:'12px 14px', textAlign: h==='Amount' ? 'right' : h==='Qty' ? 'center' : 'left', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding:'16px 14px', borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>TaskFlowCo {planName} Plan</div>
                  <div style={{ fontSize:12, color:'#64748b' }}>{cycleLabel} · SAC: 998314</div>
                </td>
                <td style={{ padding:'16px 14px', textAlign:'center', color:'#475569' }}>1</td>
                <td style={{ padding:'16px 14px', textAlign:'right', fontWeight:700 }}>{'Rs.' + fmtRs(totalRs)}</td>
              </tr>
            </tbody>
          </table>

          {/* Total */}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:28 }}>
            <div style={{ width:280 }}>
              <div style={totalRow}>
                <span style={{ fontWeight:800, fontSize:15, color:'#1e40af' }}>Total Paid</span>
                <span style={{ fontWeight:800, fontSize:20, color:'#2F6BFF' }}>{'Rs.' + fmtRs(totalRs)}</span>
              </div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:6, textAlign:'right' }}>
                GST invoice will be issued upon GSTIN registration
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div style={noteBox}>
            <strong style={{ color:'#475569' }}>Note: </strong>
            This is a payment receipt for your TaskFlowCo subscription.
            For billing queries contact support@taskflowco.in
          </div>

          <div style={{ marginTop:20, textAlign:'center', fontSize:11, color:'#94a3b8' }}>
            TaskFlowCo · Pune, Maharashtra · taskflowco.in
          </div>
        </div>
      </div>
    </div>
  )
}

// Styles
const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'20px 16px', overflowY:'auto' }
const modal   = { width:'100%', maxWidth:700, background:'#fff', borderRadius:16, boxShadow:'0 32px 80px rgba(0,0,0,.3)', fontFamily:'Arial,sans-serif', color:'#1a2840' }
const actionBar  = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 24px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', borderRadius:'16px 16px 0 0' }
const body       = { padding:'36px 44px' }
const headerRow  = { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, paddingBottom:20, borderBottom:'2px solid #e2e8f0' }
const paidBadge  = { marginTop:8, display:'inline-block', background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'3px 14px', fontSize:11, fontWeight:800 }
const sectionLabel = { fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:'#94a3b8', marginBottom:8 }
const totalRow   = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 16px', background:'#eff6ff', borderRadius:8 }
const noteBox    = { padding:'14px 18px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0', fontSize:12, color:'#64748b', lineHeight:1.7 }
const btnPrint   = { padding:'8px 16px', background:'#2F6BFF', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700 }
const btnClose   = { padding:'8px 14px', background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:12 }
