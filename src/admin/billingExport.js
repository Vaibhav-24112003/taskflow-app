// ─────────────────────────────────────────────────────────────────
// TaskFlowCo — Billing accounting export
// Produces:
//   1. Zoho Books-ready CSVs (Contacts / Invoices / Customer Payments)
//      — column headers match Zoho's import templates so each file imports
//        directly into the matching Zoho module.
//   2. A single multi-sheet Excel workbook (.xls / SpreadsheetML 2003)
//      with Invoices, Customers and Payments tabs for quick review.
//
// Amounts in the DB are stored in paise (integer); everything here is
// emitted in rupees. TaskFlowCo is not GST-registered, so no tax columns
// are produced — invoice line total == invoice total == amount paid.
// ─────────────────────────────────────────────────────────────────

// ── low-level helpers ────────────────────────────────────────────
function rupees(paise) {
  return ((Number(paise) || 0) / 100).toFixed(2)
}

function ymd(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function toCSV(header, rows) {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function today() {
  return ymd(new Date())
}

// ── dataset builders (return { header, rows }) ────────────────────
// customers: [{ org_name, owner_email, address, gstin, plan_id, status, created_at }]
export function buildCustomers(customers) {
  const header = [
    'Contact Name', 'Company Name', 'Display Name', 'EmailID', 'Phone',
    'Billing Address', 'Billing Country', 'GST Treatment',
    'GST Identification Number (GSTIN)', 'Place of Contact', 'Customer Sub Type',
  ]
  const rows = (customers || []).map(c => [
    c.org_name || '',
    c.org_name || '',
    c.org_name || '',
    c.owner_email && c.owner_email !== '—' ? c.owner_email : '',
    '',
    c.address || '',
    'India',
    c.gstin ? 'business_gst' : 'consumer',
    c.gstin || '',
    (c.gstin || '').slice(0, 2).toUpperCase(),
    'business',
  ])
  return { header, rows }
}

// invoices: [{ invoice_number, created_at, org_name, plan_id, billing_cycle, amount, payment_ref }]
export function buildInvoices(invoices) {
  const header = [
    'Invoice Number', 'Invoice Date', 'Customer Name', 'Item Name', 'Item Desc',
    'Quantity', 'Item Price', 'Item Total', 'Total', 'Invoice Status',
    'Payment Reference', 'Notes',
  ]
  const rows = (invoices || []).map(i => {
    const amt = rupees(i.amount)
    const cycle = i.billing_cycle === 'yearly' ? 'Annual' : 'Monthly'
    return [
      i.invoice_number || '',
      ymd(i.created_at),
      i.org_name || '',
      `TaskFlowCo ${i.plan_id || ''} Plan`.trim(),
      `${cycle} subscription`,
      1,
      amt,
      amt,
      amt,
      'Paid',
      i.payment_ref || '',
      'Not registered under GST',
    ]
  })
  return { header, rows }
}

// payments: [{ created_at, org_name, amount, status, razorpay_payment_id, razorpay_order_id, invoice_number, event_type }]
export function buildPayments(payments) {
  const header = [
    'Date', 'Customer Name', 'Amount', 'Payment Mode', 'Reference Number',
    'Invoice Number', 'Status', 'Order ID', 'Description',
  ]
  const rows = (payments || []).map(p => [
    ymd(p.created_at),
    p.org_name || '',
    rupees(p.amount),
    'Razorpay',
    p.razorpay_payment_id || '',
    p.invoice_number || '',
    p.status || '',
    p.razorpay_order_id || '',
    p.event_type || '',
  ])
  return { header, rows }
}

// ── CSV exports (Zoho-import-ready, one module per file) ──────────
export function exportCustomersCSV(customers) {
  const { header, rows } = buildCustomers(customers)
  download(`zoho-contacts-${today()}.csv`, toCSV(header, rows), 'text/csv;charset=utf-8')
}

export function exportInvoicesCSV(invoices) {
  const { header, rows } = buildInvoices(invoices)
  download(`zoho-invoices-${today()}.csv`, toCSV(header, rows), 'text/csv;charset=utf-8')
}

export function exportPaymentsCSV(payments) {
  const { header, rows } = buildPayments(payments)
  download(`zoho-customer-payments-${today()}.csv`, toCSV(header, rows), 'text/csv;charset=utf-8')
}

// ── Excel workbook (SpreadsheetML 2003, native multi-sheet, no deps) ──
function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isNumeric(v) {
  return typeof v === 'number' && isFinite(v)
}

function sheetXML(name, header, rows) {
  const headRow =
    '<Row>' +
    header.map(h =>
      `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`
    ).join('') +
    '</Row>'
  const bodyRows = rows.map(r =>
    '<Row>' +
    r.map(v => {
      const type = isNumeric(v) ? 'Number' : 'String'
      return `<Cell><Data ss:Type="${type}">${xmlEsc(v)}</Data></Cell>`
    }).join('') +
    '</Row>'
  ).join('')
  return (
    `<Worksheet ss:Name="${xmlEsc(name).slice(0, 31)}"><Table>` +
    headRow + bodyRows +
    '</Table></Worksheet>'
  )
}

// sheets: [{ name, header, rows }]
export function exportWorkbook(sheets, filename) {
  const body = (sheets || []).map(s => sheetXML(s.name, s.header, s.rows)).join('')
  const xml =
    '<?xml version="1.0"?>\r\n<?mso-application progid="Excel.Sheet"?>\r\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/>' +
    '<Interior ss:Color="#E8EEFB" ss:Pattern="Solid"/></Style></Styles>' +
    body +
    '</Workbook>'
  download(filename || `taskflowco-billing-${today()}.xls`, xml, 'application/vnd.ms-excel')
}

export function exportBillingWorkbook(invoices, customers, payments) {
  const inv = buildInvoices(invoices)
  const cus = buildCustomers(customers)
  const pay = buildPayments(payments)
  exportWorkbook([
    { name: 'Invoices', header: inv.header, rows: inv.rows },
    { name: 'Customers', header: cus.header, rows: cus.rows },
    { name: 'Payments', header: pay.header, rows: pay.rows },
  ], `taskflowco-billing-${today()}.xls`)
}
