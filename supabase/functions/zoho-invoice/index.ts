import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

// ── Zoho OAuth token (client credentials) ────────────────────────
let _zohoToken: string | null = null
let _tokenExpiry = 0

async function getZohoToken(): Promise<string> {
  if (_zohoToken && Date.now() < _tokenExpiry) return _zohoToken
  const res = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     Deno.env.get('ZOHO_CLIENT_ID')!,
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
      scope:         'ZohoBooks.invoices.CREATE,ZohoBooks.contacts.CREATE,ZohoBooks.invoices.READ'
    })
  })
  const data = await res.json()
  _zohoToken  = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return _zohoToken!
}

const ZOHO_ORG   = () => Deno.env.get('ZOHO_BOOKS_ORG_ID')!
const ZOHO_BASE  = 'https://www.zohoapis.in/books/v3'
const SELLER_GST = () => Deno.env.get('SELLER_GSTIN')!

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { org_id, plan_id, billing_cycle, amount, payment_event_id, razorpay_payment_id } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Fetch org details
  const { data: org } = await supabase
    .from('organizations').select('name,email,gstin,state,address').eq('id', org_id).single()
  const { data: plan } = await supabase
    .from('plans').select('name,price_monthly,price_yearly').eq('id', plan_id).single()

  const token = await getZohoToken()
  const orgId = ZOHO_ORG()

  // ── 1. Find or create Zoho contact ──────────────────────────────
  let zohoContactId = ''
  const searchRes = await fetch(
    `${ZOHO_BASE}/contacts?organization_id=${orgId}&contact_name_startswith=${encodeURIComponent(org.name || '')}&per_page=1`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${token}` } }
  )
  const searchData = await searchRes.json()
  if (searchData.contacts?.length > 0) {
    zohoContactId = searchData.contacts[0].contact_id
  } else {
    const createRes = await fetch(`${ZOHO_BASE}/contacts?organization_id=${orgId}`, {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_name:     org.name,
        contact_type:     'customer',
        email:            org.email || '',
        gst_no:           org.gstin || '',
        gst_treatment:    org.gstin ? 'business_gst' : 'consumer',
        place_of_contact: (org.state || 'MH').slice(0,2).toUpperCase(),
        billing_address:  { address: org.address || '', country: 'India' }
      })
    })
    const cd = await createRes.json()
    zohoContactId = cd.contact?.contact_id || ''
  }

  if (!zohoContactId) {
    return new Response(JSON.stringify({ error: 'Could not create Zoho contact' }), { status: 500, headers: cors })
  }

  // ── 2. GST calculation ───────────────────────────────────────────
  // amount is in paise (total incl. GST)
  const sameState   = (org.state || '').toLowerCase().includes('maharashtra')
  const subtotal    = Math.round(amount / 1.18)
  const gstAmount   = amount - subtotal

  // ── 3. Create Zoho Books invoice ─────────────────────────────────
  const invoiceBody: Record<string, unknown> = {
    customer_id:   zohoContactId,
    invoice_date:  new Date().toISOString().slice(0, 10),
    payment_terms: 0,
    notes:         `Razorpay Payment ID: ${razorpay_payment_id}`,
    reference_number: razorpay_payment_id,
    line_items: [{
      name:        `TaskFlowCo ${plan?.name || plan_id} Plan`,
      description: `Practice management software — ${billing_cycle} subscription`,
      rate:        subtotal / 100,
      quantity:    1,
      sac_code:    '998314',
      tax_name:    sameState ? 'GST18' : 'IGST18',
      tax_percentage: 18
    }],
    // Auto-send from Zoho Books directly to the org email
    send_from_org_email_id: true
  }

  const invoiceRes = await fetch(
    `${ZOHO_BASE}/invoices?organization_id=${orgId}&send=true`,
    {
      method:  'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(invoiceBody)
    }
  )
  const invoiceData = await invoiceRes.json()
  const zohoInvoice = invoiceData.invoice

  if (!zohoInvoice?.invoice_id) {
    console.error('Zoho invoice creation failed:', JSON.stringify(invoiceData))
    return new Response(JSON.stringify({ error: 'Zoho invoice failed', detail: invoiceData }), { status: 500, headers: cors })
  }

  // ── 4. Record payment in Zoho against this invoice ────────────────
  await fetch(`${ZOHO_BASE}/customerpayments?organization_id=${orgId}`, {
    method: 'POST',
    headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id:    zohoContactId,
      payment_mode:   'online',
      amount:         amount / 100,
      date:           new Date().toISOString().slice(0, 10),
      reference_number: razorpay_payment_id,
      description:    `Razorpay — ${plan?.name || plan_id} ${billing_cycle}`,
      invoices: [{ invoice_id: zohoInvoice.invoice_id, amount_applied: amount / 100 }]
    })
  })

  // ── 5. Generate invoice number + store local record ───────────────
  const { data: invNum } = await supabase.rpc('next_invoice_number')
  await supabase.from('invoices').insert({
    invoice_number:      invNum,
    org_id,
    payment_event_id,
    plan_id,
    billing_cycle,
    amount,
    zoho_invoice_id:     zohoInvoice.invoice_id,
    zoho_invoice_url:    zohoInvoice.invoice_url || null,
    email_status:        'sent'
  })

  // ── 6. Update payment_events with zoho reference ─────────────────
  await supabase.from('payment_events')
    .update({ zoho_invoice_id: zohoInvoice.invoice_id, zoho_invoice_number: zohoInvoice.invoice_number })
    .eq('id', payment_event_id)

  return new Response(JSON.stringify({
    success: true,
    invoice_number: invNum,
    zoho_invoice_id: zohoInvoice.invoice_id
  }), { status: 200, headers: cors })
})
