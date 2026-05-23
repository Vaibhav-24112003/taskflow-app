// Supabase Edge Function — notify-support-ticket
// Sends an email to SUPPORT_EMAIL via Resend whenever a new ticket is submitted.
//
// Deploy:    supabase functions deploy notify-support-ticket
// Secrets:   supabase secrets set RESEND_API_KEY=re_xxx SUPPORT_EMAIL=support@taskflowco.in FROM_EMAIL=no-reply@taskflowco.in
// Invoke:    supabase.functions.invoke('notify-support-ticket', { body: { ticket } })

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPPORT_EMAIL  = Deno.env.get('SUPPORT_EMAIL')  || 'support@taskflowco.in'
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')     || 'no-reply@taskflowco.in'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { ticket } = await req.json()
    if (!ticket || !ticket.email || !ticket.subject) {
      return new Response(JSON.stringify({ error: 'Missing ticket fields' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured')
      return new Response(JSON.stringify({ sent: false, reason: 'email not configured' }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const priorityColor: Record<string, string> = {
      urgent: '#ef4444', high: '#f59e0b', normal: '#6366f1', low: '#94a3b8',
    }
    const html = `
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
  <div style="padding:24px 28px;background:linear-gradient(135deg,#6b8cad,#4a7a9b);border-radius:12px 12px 0 0;">
    <h2 style="margin:0;color:#fff;font-size:18px;letter-spacing:-.02em;">New support ticket</h2>
    <div style="color:rgba(255,255,255,.85);font-size:12px;margin-top:4px;">${esc(ticket.category)} · ${esc(ticket.source)}</div>
  </div>
  <div style="padding:24px 28px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;">
      <tr><td style="padding:5px 0;color:#6b7280;width:90px;">From</td><td style="padding:5px 0;color:#111827;font-weight:600;">${esc(ticket.name || '—')} &lt;${esc(ticket.email)}&gt;</td></tr>
      <tr><td style="padding:5px 0;color:#6b7280;">Category</td><td style="padding:5px 0;color:#111827;">${esc(ticket.category)}</td></tr>
      <tr><td style="padding:5px 0;color:#6b7280;">Priority</td><td style="padding:5px 0;"><span style="display:inline-block;padding:2px 9px;background:${priorityColor[ticket.priority]||'#94a3b8'}22;color:${priorityColor[ticket.priority]||'#94a3b8'};border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;">${esc(ticket.priority)}</span></td></tr>
      <tr><td style="padding:5px 0;color:#6b7280;">Source</td><td style="padding:5px 0;color:#111827;">${esc(ticket.source)}</td></tr>
      <tr><td style="padding:5px 0;color:#6b7280;">Submitted</td><td style="padding:5px 0;color:#111827;">${new Date(ticket.created_at || Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</td></tr>
    </table>
    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:6px;">Subject</div>
    <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:18px;letter-spacing:-.01em;">${esc(ticket.subject)}</div>
    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:6px;">Message</div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;">${esc(ticket.message)}</div>
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
      Reply directly to this email — it goes back to the customer.<br/>
      Ticket ID: <code style="font-family:ui-monospace,monospace;">${esc(ticket.id || 'unknown')}</code>
    </div>
  </div>
</div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       [SUPPORT_EMAIL],
        reply_to: ticket.email,
        subject:  `[TaskFlowCo Support] ${ticket.subject}`,
        html,
      }),
    })

    const data = await res.json()
    return new Response(JSON.stringify({ sent: res.ok, data }), {
      status: res.ok ? 200 : 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
