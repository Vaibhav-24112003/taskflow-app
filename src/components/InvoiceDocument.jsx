// src/components/InvoiceDocument.jsx
// Full printable / downloadable invoice document for TaskFlowCo subscription
// payments. Always rendered light (invoices print on white). TaskFlowCo is not
// GST-registered, so this is a plain INVOICE (no "Tax Invoice", no GST lines) —
// line total == total == amount paid.

// Seller details (TaskFlowCo)
export const SELLER = {
  name:    'TaskFlowCo',
  address: ['1250, Sakar Building, Subhas Nagar', 'Shrukruwar Peth', 'Pune, Maharashtra 411002', 'India'],
  phone:   '08600869211',
  email:   'support@taskflowco.in',
  web:     'www.taskflowco.in',
}

// ── number → Indian-rupee words ───────────────────────────────────
function twoDigits(n) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  if (n < 20) return ones[n]
  return (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')).trim()
}

function threeDigits(n) {
  const h = Math.floor(n / 100)
  const rest = n % 100
  let s = ''
  if (h) s += twoDigits(h) + ' Hundred'
  if (rest) s += (s ? ' ' : '') + twoDigits(rest)
  return s
}

// Indian numbering: crore, lakh, thousand, hundred
function intToWords(num) {
  if (num === 0) return 'Zero'
  let words = ''
  const crore = Math.floor(num / 10000000); num %= 10000000
  const lakh = Math.floor(num / 100000); num %= 100000
  const thousand = Math.floor(num / 1000); num %= 1000
  const hundred = num
  if (crore) words += twoDigits(crore) + ' Crore '
  if (lakh) words += twoDigits(lakh) + ' Lakh '
  if (thousand) words += twoDigits(thousand) + ' Thousand '
  if (hundred) words += threeDigits(hundred)
  return words.trim()
}

// paise → "Indian Rupee ... Only"
export function rupeesInWords(paise) {
  const total = Math.round(Number(paise) || 0)
  const rupees = Math.floor(total / 100)
  const paisePart = total % 100
  let s = 'Indian Rupee ' + intToWords(rupees)
  if (paisePart) s += ' and ' + intToWords(paisePart) + ' Paise'
  return s + ' Only'
}

function fmtMoney(paise) {
  return ((Number(paise) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDMY(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  const p = n => String(n).padStart(2, '0')
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`
}

// ── the document ──────────────────────────────────────────────────
// props: invoice { invoice_number, created_at, plan_id, billing_cycle, amount, payment_ref, plan_name }
//        org     { name, address }
//        owner   { name }
export default function InvoiceDocument({ invoice = {}, org = {}, owner = {} }) {
  const amount = invoice.amount || 0
  const planName = invoice.plan_name || invoice.plan_id || '—'
  const cycle = invoice.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
  const buyerName = org.name || owner.name || 'Customer'
  const orgAddr = (org.address || '').split('\n').map(s => s.trim()).filter(Boolean)

  const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, textAlign: 'left', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }
  const td = { padding: '9px 10px', fontSize: 12, borderBottom: '1px solid #eef2f7', verticalAlign: 'top' }
  const totRow = (label, val, opts = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, ...opts.row }}>
      <span style={{ color: '#475569', ...opts.label }}>{label}</span>
      <span style={{ fontWeight: opts.bold ? 800 : 600, color: opts.color || '#0f172a', fontFamily: "'JetBrains Mono',monospace" }}>{val}</span>
    </div>
  )

  return (
    <div id="tf-invoice-doc" style={{ background: '#fff', color: '#0f172a', width: '100%', maxWidth: 760, margin: '0 auto', padding: 28, fontFamily: "'Inter',system-ui,sans-serif", border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, borderBottom: '2px solid #0f172a', paddingBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#2F6BFF,#14C7C0)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>✓</div>
          <div style={{ fontSize: 11, lineHeight: 1.5, color: '#334155' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{SELLER.name}</div>
            {SELLER.address.map((l, i) => <div key={i}>{l}</div>)}
            <div>{SELLER.phone}</div>
            <div>{SELLER.email}</div>
            <div>{SELLER.web}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: '#0f172a' }}>INVOICE</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Not registered under GST</div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, margin: '16px 0', fontSize: 12 }}>
        {[
          ['Invoice #', invoice.invoice_number || '—'],
          ['Invoice Date', fmtDMY(invoice.created_at)],
          ['Terms', 'Due on Receipt'],
          ['Payment Reference', invoice.payment_ref || '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: '#64748b', minWidth: 130 }}>{k}</span>
            <span style={{ fontWeight: 700, fontFamily: k === 'Payment Reference' ? "'JetBrains Mono',monospace" : 'inherit', fontSize: k === 'Payment Reference' ? 11 : 12, wordBreak: 'break-all' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Bill To */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b', marginBottom: 4 }}>Bill To</div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{buyerName}</div>
        {owner.name && owner.name !== buyerName && <div style={{ fontSize: 12, color: '#475569' }}>Attn: {owner.name}</div>}
        {orgAddr.map((l, i) => <div key={i} style={{ fontSize: 12, color: '#475569' }}>{l}</div>)}
      </div>

      {/* Line items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 28, textAlign: 'center' }}>#</th>
            <th style={th}>Item &amp; Description</th>
            <th style={{ ...th, textAlign: 'right', width: 50 }}>Qty</th>
            <th style={{ ...th, textAlign: 'right', width: 100 }}>Rate</th>
            <th style={{ ...th, textAlign: 'right', width: 110 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...td, textAlign: 'center' }}>1</td>
            <td style={td}>
              <div style={{ fontWeight: 700 }}>TaskFlowCo {planName} Plan</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Practice management software — {cycle} subscription</div>
            </td>
            <td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>1.00</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{fmtMoney(amount)}</td>
            <td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>{fmtMoney(amount)}</td>
          </tr>
        </tbody>
      </table>

      {/* Totals + words */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', marginBottom: 4 }}>Total in Words</div>
          <div style={{ fontSize: 12, fontStyle: 'italic', color: '#334155' }}>{rupeesInWords(amount)}</div>
          {invoice.payment_ref && (
            <div style={{ marginTop: 14, fontSize: 11, color: '#64748b' }}>
              <b style={{ color: '#475569' }}>Notes:</b> Razorpay Payment ID: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{invoice.payment_ref}</span>
            </div>
          )}
        </div>
        <div style={{ flex: '0 0 260px', minWidth: 240 }}>
          {totRow('Sub Total', '₹' + fmtMoney(amount))}
          {totRow('Total', '₹' + fmtMoney(amount), { bold: true, row: { borderTop: '1px solid #e2e8f0' } })}
          {totRow('Payment Made', '(-) ' + fmtMoney(amount), { color: '#dc2626' })}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: 6, background: '#eff6ff', borderRadius: 8 }}>
            <span style={{ fontWeight: 800, color: '#1e40af' }}>Balance Due</span>
            <span style={{ fontWeight: 800, color: '#1e40af', fontFamily: "'JetBrains Mono',monospace" }}>₹0.00</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 22, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
        This is a computer-generated invoice and does not require a signature. &nbsp;·&nbsp; {SELLER.name} is not registered under GST.
      </div>
    </div>
  )
}

// ── print / save-as-PDF helper ────────────────────────────────────
// Grabs the rendered #tf-invoice-doc node and prints it in isolation so the
// user gets just the invoice (browser "Save as PDF" produces the PDF).
export function printInvoice(title) {
  const node = document.getElementById('tf-invoice-doc')
  if (!node) return
  const w = window.open('', '_blank', 'width=820,height=1000')
  if (!w) { alert('Please allow pop-ups to print/download the invoice.'); return }
  w.document.open()
  w.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    (title || 'Invoice') +
    '</title><style>@page{size:A4;margin:14mm}body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>' +
    node.outerHTML +
    '</body></html>'
  )
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); }, 350)
}
