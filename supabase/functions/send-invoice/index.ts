import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────
// send-invoice — native TaskFlowCo invoice / payment receipt.
// Replaces the old Zoho Books integration. No GST is applied
// (TaskFlowCo is not GST-registered): the amount paid is the total.
// Stores a local invoice record and emails a branded receipt via Resend.
// Idempotent per payment_event_id.
// ─────────────────────────────────────────────────────────────────

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors })
  }

  const { org_id, plan_id, billing_cycle, amount, payment_event_id, razorpay_payment_id } =
    body as Record<string, string>
  if (!org_id || !plan_id || !amount) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: cors })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Idempotency — one invoice per payment event
  if (payment_event_id) {
    const { data: existing } = await supabase.from('subscription_invoices')
      .select('invoice_number').eq('payment_event_id', payment_event_id).maybeSingle()
    if (existing) {
      return new Response(JSON.stringify({
        success: true, invoice_number: existing.invoice_number, duplicate: true
      }), { status: 200, headers: cors })
    }
  }

  // Org details
  const { data: org } = await supabase.from('organizations').select('name, address').eq('id', org_id).single()

  // Owner email + name from profiles (fallback to auth)
  const { data: member } = await supabase.from('organization_members')
    .select('user_id').eq('org_id', org_id).eq('role', 'owner').maybeSingle()

  let ownerName = org?.name || 'Customer'
  let ownerEmail = ''
  if (member?.user_id) {
    const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', member.user_id).maybeSingle()
    if (profile?.name)  ownerName  = profile.name
    if (profile?.email) ownerEmail = profile.email
    if (!ownerEmail) {
      const { data: authUser } = await supabase.auth.admin.getUserById(member.user_id)
      ownerEmail = authUser?.user?.email || ''
    }
  }

  const { data: plan } = await supabase.from('plans').select('name').eq('id', plan_id).single()

  // Invoice number
  const { data: invNum } = await supabase.rpc('next_invoice_number')

  const totalRs     = Number(amount) / 100
  const invoiceDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  const planName    = plan?.name || plan_id
  const cycleLabel  = billing_cycle === 'yearly' ? 'Annual' : 'Monthly'

  // Store local invoice record
  await supabase.from('subscription_invoices').insert({
    invoice_number:   invNum,
    org_id,
    payment_event_id: payment_event_id || null,
    plan_id,
    billing_cycle:    billing_cycle || 'monthly',
    amount:           Number(amount),
    email_status:     ownerEmail ? 'pending' : 'no_email',
    emailed_at:       null
  })

  // Send branded receipt via Resend
  let emailSent = false
  const resendKey = Deno.env.get('RESEND_API_KEY')

  if (ownerEmail && resendKey) {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a2840; }
  .header { background: linear-gradient(135deg, #2F6BFF, #14C7C0); padding: 32px; text-align: center; border-radius: 12px 12px 0 0; }
  .header h1 { color: #fff; margin: 0; font-size: 24px; letter-spacing: -0.5px; }
  .header p { color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px; }
  .body { background: #f8fafc; padding: 32px; border: 1px solid #e2e8f0; }
  .invoice-box { background: #fff; border-radius: 10px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .row:last-child { border-bottom: none; }
  .label { color: #64748b; }
  .value { font-weight: 600; color: #1a2840; }
  .total-row { background: #eff6ff; border-radius: 8px; padding: 14px 16px; display: flex; justify-content: space-between; margin-top: 16px; }
  .total-label { font-size: 15px; font-weight: 700; color: #1e40af; }
  .total-value { font-size: 20px; font-weight: 800; color: #2F6BFF; }
  .badge { display: inline-block; background: #d1fae5; color: #065f46; border-radius: 20px; padding: 4px 14px; font-size: 12px; font-weight: 700; margin-bottom: 16px; }
  .footer { text-align: center; padding: 20px; font-size: 12px; color: #94a3b8; }
  .support { background: #fff; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #e2e8f0; font-size: 13px; }
</style></head>
<body>
  <div class="header">
    <h1>TaskFlowCo</h1>
    <p>Practice Management Software for CA Firms</p>
  </div>
  <div class="body">
    <p>Dear <strong>${ownerName}</strong>,</p>
    <p>Thank you for your payment. Your subscription is now active.</p>
    <div class="invoice-box">
      <div style="margin-bottom:16px">
        <span class="badge">✓ Payment Received</span>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">This is your payment receipt</div>
      </div>
      <div class="row"><span class="label">Invoice Number</span><span class="value">${invNum}</span></div>
      <div class="row"><span class="label">Invoice Date</span><span class="value">${invoiceDate}</span></div>
      <div class="row"><span class="label">Organisation</span><span class="value">${org?.name || ownerName}</span></div>
      <div class="row"><span class="label">Plan</span><span class="value">TaskFlowCo ${planName} — ${cycleLabel}</span></div>
      <div class="row"><span class="label">Payment Reference</span><span class="value" style="font-size:12px;font-family:monospace">${razorpay_payment_id || '—'}</span></div>
      <div class="row"><span class="label">Payment Mode</span><span class="value">Razorpay (Online)</span></div>
      <div class="total-row">
        <span class="total-label">Amount Paid</span>
        <span class="total-value">₹${totalRs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
    <div class="support">
      For billing queries, write to <a href="mailto:support@taskflowco.in" style="color:#2F6BFF;font-weight:600">support@taskflowco.in</a><br>
      <span style="color:#94a3b8;font-size:11px;margin-top:4px;display:block">GST invoice will be issued once we receive our GSTIN registration</span>
    </div>
  </div>
  <div class="footer">
    TaskFlowCo &nbsp;·&nbsp; Pune, Maharashtra &nbsp;·&nbsp; taskflowco.in<br>
    &copy; ${new Date().getFullYear()} TaskFlowCo. All rights reserved.
  </div>
</body>
</html>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'TaskFlowCo Billing <billing@taskflowco.in>',
        to:      [ownerEmail],
        subject: `Payment Receipt ${invNum} — TaskFlowCo ${planName} Plan`,
        html
      })
    })
    const emailData = await emailRes.json()
    emailSent = !!emailData.id
    console.log('Email result:', JSON.stringify(emailData))

    await supabase.from('subscription_invoices')
      .update({ email_status: emailSent ? 'sent' : 'failed', emailed_at: emailSent ? new Date().toISOString() : null })
      .eq('invoice_number', invNum)
  }

  console.log(`Invoice ${invNum} | ${ownerName} <${ownerEmail}> | ₹${totalRs} | email: ${emailSent}`)

  return new Response(JSON.stringify({
    success:        true,
    invoice_number: invNum,
    customer:       ownerName,
    email:          ownerEmail,
    email_sent:     emailSent,
    note:           resendKey ? undefined : 'Add RESEND_API_KEY to Supabase secrets to enable email delivery'
  }), { status: 200, headers: cors })
})
