// src/components/InvoicePDF.jsx
// Renders a printable/downloadable invoice page
// Usage: open as /invoice?id=TFC-2026-0001 or pass as prop
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function InvoicePDF({ invoiceNumber, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!invoiceNumber) return
    load()
  }, [invoiceNumber])

  async function load() {
    setLoading(true)
    try {
      // Fetch invoice
      const { data: inv, error: ie } = await supabase
        .from('subscription_invoices')
        .select('*')
        .eq('invoice_number', invoiceNumber)
        .single()
      if (ie || !inv) throw new Error('Invoice not found')

      // Fetch org
      const { data: org } = await supabase
        .from('organizations')
        .select('name, address, gstin')
        .eq('id', inv.org_id)
        .single()

      // Fetch owner
      const { data: member } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', inv.org_id)
        .eq('role', 'owner')
        .maybeSingle()

      let ownerName = org?.name || '', ownerEmail = ''
      if (member?.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', member.user_id)
          .maybeSingle()
        if (profile?.name)  ownerName  = profile.name
        if (profile?.email) ownerEmail = profile.email
      }

      // Fetch plan
      const { data: plan } = await supabase
        .from('plans')
        .select('name, price_monthly, price_yearly')
        .eq('id', inv.plan_id)
        .maybeSingle()

      // Fetch payment event for Razorpay ref
      const { data: pe } = inv.payment_event_id
        ? await supabase.from('payment_events').select('razorpay_payment_id, razorpay_order_id, created_at').eq('id', inv.payment_event_id).maybeSingle()
        : { data: null }

      setData({ inv, org, ownerName, ownerEmail, plan, pe })
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ textAlign:'center', color:'#64748b' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📄</div>
        <div>Loading invoice…</div>
      </div>
    </div>
  )

  if (error || !data) return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ textAlign:'center', color:'#ef4444' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚠</div>
        <div>{error || 'Invoice not found'}</div>
        {onClose && <button onClick={onClose} style={{ marginTop:16, padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer' }}>Close</button>}
      </div>
    </div>
  )

  const { inv, org, ownerName, ownerEmail, plan, pe } = data
  const totalRs    = Number(inv.amount) / 100
  const planName   = plan?.name || inv.plan_id || '—'
  const cycleLabel = inv.billing_cycle === 'yearly' ? 'Annual Subscription' : 'Monthly Subscription'
  const invDate    = new Date(inv.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })
  const payDate    = pe?.created_at ? new Date(pe.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' }) : invDate

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'20px 16px', overflowY:'auto' }}>
      <div style={{ width:'100%', maxWidth:720, background:'#fff', borderRadius:16, boxShadow:'0 32px 80px rgba(0,0,0,.3)' }}>

        {/* Action bar (hidden on print) */}
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', borderRadius:'16px 16px 0 0' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#475569' }}>Invoice {invoiceNumber}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => window.print()} style={{ padding:'8px 16px', background:'#2F6BFF', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700 }}>
              🖨 Print / Save PDF
            </button>
            {onClose && <button onClick={onClose} style={{ padding:'8px 16px', background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:12 }}>✕ Close</button>}
          </div>
        </div>

        {/* Invoice content */}
        <div id="invoice-content" style={{ padding:'40px 48px', fontFamily:'Arial, sans-serif', color:'#1a2840' }}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:32, paddingBottom:24, borderBottom:'2px solid #e2e8f0' }}>
            <div>
              <div style={{ fontSize:28, fontWeight:900, background:'linear-gradient(135deg,#2F6BFF,#14C7C0)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>Taskflow/co</div>
              <div style={{ fontSize:12, color:'#64748b', lineHeight:1.6 }}>
                Practice Management Software<br/>
                Pune, Maharashtra, India<br/>
                support@taskflowco.in · taskflowco.in
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#1a2840', marginBottom:6 }}>PAYMENT RECEIPT</div>
              <div style={{ fontSize:13, color:'#64748b', lineHeight:1.8 }}>
                <span style={{ fontWeight:700, color:'#2F6BFF' }}>{inv.invoice_number}</span><br/>
                Date: {invDate}
              </div>
              <div style={{ marginTop:8, display:'inline-block', background:'#d1fae5', color:'#065f46', borderRadius:20, padding:'3px 14px', fontSize:11, fontWeight:800 }}>
                ✓ PAID
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32, marginBottom:32 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:'#94a3b8', marginBottom:8 }}>Bill To</div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{org?.name || ownerName}</div>
              <div style={{ fontSize:13, color:'#475569', lineHeight:1.7 }}>
                {ownerName && ownerName !== org?.name && <div>{ownerName}</div>}
                {ownerEmail && <div>{ownerEmail}</div>}
                {org?.address && <div>{org.address}</div>}
                {org?.gstin && <div>GSTIN: {org.gstin}</div>}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:'#94a3b8', marginBottom:8 }}>Payment Details</div>
              <div style={{ fontSize:13, color:'#475569', lineHeight:1.8 }}>
                <div><span style={{ color:'#94a3b8' }}>Payment Date:</span> <strong>{payDate}</strong></div>
                <div><span style={{ color:'#94a3b8' }}>Mode:</span> <strong>Razorpay — Online</strong></div>
                {pe?.razorpay_payment_id && <div style={{ fontSize:11 }}><span style={{ color:'#94a3b8' }}>Ref:</span> <span style={{ fontFamily:'monospace' }}>{pe.razorpay_payment_id}</span></div>}
                {pe?.razorpay_order_id   && <div style={{ fontSize:11 }}><span style={{ color:'#94a3b8' }}>Order:</span> <span style={{ fontFamily:'monospace' }}>{pe.razorpay_order_id}</span></div>}
              </div>
            </div>
          </div>

          {/* Line items */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:24 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                <th style={{ padding:'12px 14px', textAlign:'left', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Description</th>
                <th style={{ padding:'12px 14px', textAlign:'center', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Qty</th>
                <th style={{ padding:'12px 14px', textAlign:'right', fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', color:'#64748b', borderBottom:'2px solid #e2e8f0' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding:'16px 14px', borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>TaskFlowCo {planName} Plan</div>
                  <div style={{ fontSize:12, color:'#64748b' }}>{cycleLabel} · SAC Code: 998314</div>
                </td>
                <td style={{ padding:'16px 14px', textAlign:'center', color:'#475569' }}>1</td>
                <td style={{ padding:'16px 14px', textAlign:'right', fontWeight:700 }}>₹{totalRs.toLocaleString('en-IN', { minimumFractionDigits:2 })}</td>
              </tr>
            </tbody>
          </table>

          {/* Total */}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:32 }}>
            <div style={{ width:280 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:13, color:'#64748b', borderBottom:'1px solid #f1f5f9' }}>
                <span>Subtotal</span>
                <span>₹{totalRs.toLocaleString('en-IN', { minimumFractionDigits:2 })}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:12, color:'#94a3b8', borderBottom:'1px solid #f1f5f9' }}>
                <span>GST (Applicable after GSTIN registration)</span>
                <span>—</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 16px', marginTop:8, background:'#eff6ff', borderRadius:8 }}>
                <span style={{ fontWeight:800, fontSize:15, color:'#1e40af' }}>Total Paid</span>
                <span style={{ fontWeight:800, fontSize:20, color:'#2F6BFF' }}>₹{totalRs.toLocaleString('en-IN', { minimumFractionDigits:2 })}</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div style={{ padding:'16px 20px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0', fontSize:12, color:'#64748b', lineHeight:1.7 }}>
            <strong style={{ color:'#475569' }}>Notes:</strong><br/>
            This is a payment receipt for your TaskFlowCo subscription. A formal GST invoice will be issued upon GSTIN registration.<br/>
            For billing queries, contact <a href="mailto:support@taskflowco.in" style={{ color:'#2F6BFF' }}>support@taskflowco.in</a>
          </div>

          {/* Print footer */}
          <div style={{ marginTop:24, textAlign:'center', fontSize:11, color:'#94a3b8' }}>
            TaskFlowCo · Pune, Maharashtra · taskflowco.in
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          #invoice-content { padding: 24px !important; }
        }
      `}</style>
    </div>
  )
}
