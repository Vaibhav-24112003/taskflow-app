import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body      = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''
  const secret    = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''

  // ── 1. Verify HMAC-SHA256 signature ─────────────────────────────
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2,'0')).join('')

  if (expected !== signature) {
    console.error('Invalid signature')
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 400, headers: cors })
  }

  const event   = JSON.parse(body)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const payment = event.payload?.payment?.entity || {}
  const org_id  = payment.notes?.org_id
  const plan_id = payment.notes?.plan_id
  const billing = payment.notes?.billing_cycle || 'monthly'

  // ── 2. Log every event (idempotent via unique razorpay_payment_id) ─
  const { data: eventRow } = await supabase.from('payment_events').upsert({
    org_id,
    razorpay_order_id:   payment.order_id,
    razorpay_payment_id: payment.id,
    razorpay_signature:  signature,
    amount:              payment.amount,
    currency:            payment.currency || 'INR',
    status:              payment.status,
    event_type:          event.event,
    failure_reason:      payment.error_description || null,
    raw_webhook:         event
  }, { onConflict: 'razorpay_payment_id' }).select().single()

  // ── 3. Handle payment captured ───────────────────────────────────
  if (event.event === 'payment.captured' && org_id) {
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + (billing === 'yearly' ? 12 : 1))

    // Upsert subscription
    await supabase.from('subscriptions').upsert({
      org_id,
      plan_id,
      billing_cycle:          billing,
      status:                 'active',
      razorpay_customer_id:   payment.customer_id || null,
      current_period_start:   now.toISOString(),
      current_period_end:     periodEnd.toISOString(),
      updated_at:             now.toISOString()
    }, { onConflict: 'org_id' })

    // ── 4. Create invoice in Zoho Books ──────────────────────────────
    const invoiceRes = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-invoice`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          org_id,
          plan_id,
          billing_cycle: billing,
          amount:  payment.amount,
          payment_event_id: eventRow?.id,
          razorpay_payment_id: payment.id
        })
      }
    )
    if (!invoiceRes.ok) {
      console.error('Zoho invoice failed:', await invoiceRes.text())
    }
  }

  // ── 5. Handle payment failed ─────────────────────────────────────
  if (event.event === 'payment.failed' && org_id) {
    await supabase.from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('org_id', org_id)
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: cors })
})
