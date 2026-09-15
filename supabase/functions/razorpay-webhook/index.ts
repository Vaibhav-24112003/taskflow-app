import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

// Modules unlocked per plan (fallback if plans.modules is empty)
const PLAN_MODULES: Record<string, string[]> = {
  free:       [],
  starter:    ['library', 'team', 'chat'],
  pro:        ['library', 'team', 'chat', 'analytics', 'comms', 'billing'],
  enterprise: ['library', 'team', 'chat', 'analytics', 'comms', 'billing', 'portal'],
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body      = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''
  const secret    = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''

  // 1. Verify HMAC-SHA256 signature
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  if (expected !== signature) {
    console.error('Invalid webhook signature')
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 400, headers: cors })
  }

  const event    = JSON.parse(body)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const payment  = event.payload?.payment?.entity || {}
  const org_id   = payment.notes?.org_id
  const billing  = payment.notes?.billing_cycle || 'monthly'

  // 2. Resolve plan_id — HONOUR the plan actually paid for (from the order notes).
  //    create-order only issues orders for real active plans, so notes.plan_id is
  //    authoritative (including 'trial'/'free'). Validate it against the plans
  //    table; only fall back to the org's current sub / 'starter' if it's missing
  //    or unknown. (Do NOT rewrite 'trial' → 'starter' — that mislabels the
  //    invoice and wrongly unlocks paid modules for a ₹1 trial payment.)
  let plan_id = (payment.notes?.plan_id || '').trim()
  let planData: { modules?: string[]; limits?: Record<string, number> } | null = null
  if (plan_id) {
    const { data } = await supabase.from('plans').select('modules, limits').eq('id', plan_id).maybeSingle()
    planData = data
  }
  if (!plan_id || !planData) {
    if (org_id) {
      const { data: sub } = await supabase
        .from('subscriptions').select('plan_id').eq('org_id', org_id).maybeSingle()
      plan_id = sub?.plan_id || 'starter'
    } else {
      plan_id = 'starter'
    }
    const { data } = await supabase.from('plans').select('modules, limits').eq('id', plan_id).maybeSingle()
    planData = data
  }

  // 3. Log event — idempotent via unique razorpay_payment_id
  const { data: eventRow } = await supabase
    .from('payment_events')
    .upsert({
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
    }, { onConflict: 'razorpay_payment_id' })
    .select().single()

  // 4. Payment captured
  if (event.event === 'payment.captured' && org_id) {
    const now       = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + (billing === 'yearly' ? 12 : 1))

    // Modules from the resolved plan (planData fetched above; respects admin changes)
    const modules = planData?.modules || PLAN_MODULES[plan_id] || PLAN_MODULES['starter']

    // Update subscriptions
    await supabase.from('subscriptions').upsert({
      org_id, plan_id,
      billing_cycle:        billing,
      status:               'active',
      razorpay_customer_id: payment.customer_id || null,
      current_period_start: now.toISOString(),
      current_period_end:   periodEnd.toISOString(),
      updated_at:           now.toISOString()
    }, { onConflict: 'org_id' })

    // Update organizations — this is what the app reads for module access + limits.
    // plan_limits is the tamper-proof source the DB triggers enforce (users/clients/workspaces).
    await supabase.from('organizations').update({
      subscription_status: 'paid',
      paid_modules:        modules,
      plan_limits:         planData?.limits ?? {},
      trial_expires_at:    null
    }).eq('id', org_id)

    console.log(`Activated: org=${org_id} plan=${plan_id} modules=${modules.join(',')}`)

    // Generate + email invoice, unless one already exists for this payment (idempotent)
    const { data: existingInvoice } = await supabase
      .from('subscription_invoices')
      .select('invoice_number').eq('payment_event_id', eventRow?.id).maybeSingle()

    if (!existingInvoice) {
      fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type':  'application/json'
          },
          body: JSON.stringify({
            org_id,
            plan_id,
            billing_cycle:       billing,
            amount:              payment.amount,
            payment_event_id:    eventRow?.id,
            razorpay_payment_id: payment.id
          })
        }
      ).then(r => r.json())
       .then(d => console.log('Invoice:', d.invoice_number || d.error))
       .catch(e => console.error('Invoice error:', e))
    }
  }

  // 5. Payment failed
  if (event.event === 'payment.failed' && org_id) {
    await supabase.from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('org_id', org_id)
  }

  // 6. Subscription cancelled / expired
  if (['subscription.cancelled', 'subscription.expired'].includes(event.event) && org_id) {
    await supabase.from('organizations').update({
      subscription_status: 'cancelled',
      paid_modules:        [],
      plan_limits:         null
    }).eq('id', org_id)
    await supabase.from('subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('org_id', org_id)
  }

  return new Response(JSON.stringify({ received: true, event: event.event, plan_id }), { status: 200, headers: cors })
})
