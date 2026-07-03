// Supabase Edge Function — generate-recurring-worksheets
//
// Ensures recurring compliance work actually EXISTS ahead of time. For every org,
// every active recurring work type (monthly/quarterly/yearly), it makes sure the
// worksheet + one row per enrolled client exists for BOTH the current period and
// the next upcoming period — so August's GST tasks are already sitting in every
// preparer's list on/ before Aug 1, instead of only appearing when a human happens
// to open that month.
//
// This is a faithful server-side port of the client's loadWorksheet() auto-create
// logic (src/App.jsx ~5154-5364): same period math (Indian FY, Apr–Mar), same
// due-date rules (due_dates[] with monthly_map / quarterly_map / month_offset),
// same prep_days start_date, same enrollment (clients.custom_fields.work_types),
// same dedupe (one row per client_id + due_label per worksheet).
//
// Idempotent: only INSERTS missing worksheets/rows; never edits or deletes existing
// rows (the app still reconciles due dates on open). Safe to run repeatedly.
//
// Invoke dry-run (no writes):  POST { "dryRun": true }   → returns the plan + counts
// Invoke for real:            POST { }                    → performs inserts
// Deploy:  supabase functions deploy generate-recurring-worksheets
// Schedule: pg_cron nightly (see migration 20260703_recurring_and_reminders_cron.sql)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Period helpers (ported verbatim from App.jsx) ──────────────────
// IST clock so month/quarter boundaries match what users see (cron runs in UTC).
function nowIST() { return new Date(Date.now() + 5.5 * 3600 * 1000) }

function getCurrentPeriod(freq: string) {
  const now = nowIST()
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1
  const fy = m >= 4 ? y : y - 1
  if (freq === 'monthly')   return { year: fy, month: m, quarter: null as number | null }
  if (freq === 'quarterly') {
    const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4
    return { year: fy, month: null as number | null, quarter: q }
  }
  return { year: fy, month: null as number | null, quarter: null as number | null } // yearly
}

// The period immediately after p (for pre-creating upcoming work).
function nextPeriod(freq: string, p: { year: number, month: number | null, quarter: number | null }) {
  if (freq === 'monthly') {
    const calY = (p.month! >= 4) ? p.year : p.year + 1
    let cm = p.month! + 1, cyy = calY
    if (cm > 12) { cm = 1; cyy++ }
    const fy2 = cm >= 4 ? cyy : cyy - 1
    return { year: fy2, month: cm, quarter: null }
  }
  if (freq === 'quarterly') {
    return p.quarter! < 4 ? { year: p.year, month: null, quarter: p.quarter! + 1 }
                          : { year: p.year + 1, month: null, quarter: 1 }
  }
  return { year: p.year + 1, month: null, quarter: null } // yearly
}

function getPeriodLabel(freq: string, year: number, month: number | null, quarter: number | null) {
  if (freq === 'monthly') {
    const calYear = (month! >= 4) ? year : year + 1
    return MONTHS[(month || 1) - 1] + ' ' + calYear
  }
  if (freq === 'quarterly') {
    const q = quarter || 1
    return 'Q' + q + ' FY' + year + '-' + String(year + 1).slice(2)
  }
  return 'FY ' + year + '-' + String(year + 1).slice(2)
}

// ── Due-date computation (ported verbatim from App.jsx computeDueDate + builder) ──
function computeDueDate(day: number, month: number | null, freq: string, monthOffset: number | null,
                        periodYear: number, periodMonth: number | null, periodQuarter: number | null): string | null {
  if (!day) return null
  if (freq === 'monthly' && periodMonth) {
    const calY = periodMonth >= 4 ? periodYear : periodYear + 1
    const offset = (monthOffset != null) ? Number(monthOffset) : 1
    let targetM = periodMonth + offset, targetY = calY
    if (targetM > 12) { targetM -= 12; targetY++ }
    if (targetM < 1)  { targetM += 12; targetY-- }
    return targetY + '-' + String(targetM).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  } else if (freq === 'quarterly' && periodQuarter) {
    const qEndMonths = [6, 9, 12, 3]
    const qEndM = qEndMonths[periodQuarter - 1]
    const qCalY = periodQuarter <= 3 ? periodYear : periodYear + 1
    const qOff = (monthOffset != null) ? Number(monthOffset) : 1
    let dueM = qEndM + qOff, dueY = qCalY
    if (dueM > 12) { dueM -= 12; dueY++ }
    if (month) dueM = month
    return dueY + '-' + String(dueM).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  } else if (freq === 'yearly') {
    const dm = month || 7
    const yearOff = (monthOffset != null) ? Number(monthOffset) : (dm >= 4 ? 0 : 1)
    const dueCalY = periodYear + yearOff
    return dueCalY + '-' + String(dm).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  }
  return null
}

function buildDueDateList(cfg: any, periodYear: number, periodMonth: number | null, periodQuarter: number | null) {
  const freq = cfg.frequency
  const out: { date: string, label: string }[] = []
  if (freq === 'once') return out
  const dueDates = Array.isArray(cfg.due_dates) ? cfg.due_dates : []
  if (dueDates.length > 0) {
    for (const dd of dueDates) {
      if (dd.monthly_map && freq === 'monthly' && periodMonth) {
        const me = dd.monthly_map[periodMonth] || dd.monthly_map[String(periodMonth)]
        if (me && me.day && me.due_month) {
          const calY = periodMonth >= 4 ? periodYear : periodYear + 1
          let dueCalY = calY
          if (me.due_month < periodMonth) dueCalY = calY + 1
          out.push({ date: dueCalY + '-' + String(me.due_month).padStart(2, '0') + '-' + String(me.day).padStart(2, '0'), label: dd.label || 'Due' })
        }
      } else if (dd.quarterly_map && freq === 'quarterly' && periodQuarter) {
        const qe = dd.quarterly_map[String(periodQuarter)] || dd.quarterly_map[periodQuarter]
        if (qe && qe.day && qe.due_month) {
          const qEndMsQ = [6, 9, 12, 3]
          const qEndMQ = qEndMsQ[periodQuarter - 1]
          const qEndCalYQ = periodQuarter <= 3 ? periodYear : periodYear + 1
          const dueCalYQ = qe.due_month >= qEndMQ ? qEndCalYQ : qEndCalYQ + 1
          out.push({ date: dueCalYQ + '-' + String(qe.due_month).padStart(2, '0') + '-' + String(qe.day).padStart(2, '0'), label: dd.label || 'Due' })
        }
      } else {
        const d = computeDueDate(dd.day, dd.month, freq, dd.month_offset, periodYear, periodMonth, periodQuarter)
        if (d) out.push({ date: d, label: dd.label || 'Due' })
      }
    }
  } else if (cfg.due_day) {
    const d = computeDueDate(cfg.due_day, cfg.due_month, freq, null, periodYear, periodMonth, periodQuarter)
    if (d) out.push({ date: d, label: 'Due' })
  }
  return out
}

function computeStartDate(dueDate: string | null, prepDays: number | null): string | null {
  if (!dueDate || prepDays == null) return null
  const d = new Date(dueDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - prepDays)
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0')
}

function enrolledClients(clients: any[], workType: string) {
  return clients.filter((c) => {
    const wts = ((c.custom_fields && c.custom_fields.work_types) || '').split(',').filter(Boolean)
    return wts.some((t: string) => t.trim() === workType)
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  let dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dry') === '1'
  try { const body = await req.json(); if (body && body.dryRun) dryRun = true } catch { /* no body */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const summary = { dryRun, orgs: 0, worksheetsCreated: 0, rowsCreated: 0, plan: [] as any[], errors: [] as string[] }

  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id,name')
  if (orgErr) return json({ error: orgErr.message }, 500)

  for (const org of orgs || []) {
    summary.orgs++
    const { data: configs } = await supabase.from('work_type_configs')
      .select('name,frequency,due_day,due_month,due_dates,prep_days,is_active')
      .eq('org_id', org.id).eq('is_active', true)
      .in('frequency', ['monthly', 'quarterly', 'yearly'])
    if (!configs || configs.length === 0) continue

    const { data: clients } = await supabase.from('clients').select('id,custom_fields').eq('org_id', org.id).limit(2000)
    const allClients = clients || []

    for (const cfg of configs) {
      const enrolled = enrolledClients(allClients, cfg.name)
      if (enrolled.length === 0) continue

      const cur = getCurrentPeriod(cfg.frequency)
      const nxt = nextPeriod(cfg.frequency, cur)
      for (const p of [cur, nxt]) {
        const label = getPeriodLabel(cfg.frequency, p.year, p.month, p.quarter)
        const dueList = buildDueDateList(cfg, p.year, p.month, p.quarter)

        // Find or create the worksheet for this period.
        const { data: wsExisting } = await supabase.from('worksheets').select('id')
          .eq('org_id', org.id).eq('work_type', cfg.name).eq('period_label', label).maybeSingle()
        let wsId = wsExisting?.id as string | undefined
        let existingRows: any[] = []
        if (wsId) {
          const { data: rows } = await supabase.from('worksheet_rows').select('id,client_id,due_label').eq('worksheet_id', wsId).limit(5000)
          existingRows = rows || []
        }

        // Determine which (client, due_label) rows are missing — same dedupe as the app.
        const existingKeys = new Set(existingRows.map((r) => r.client_id + '_' + (r.due_label || '')))
        const newRows: any[] = []
        const labelsToMake = dueList.length > 0 ? dueList : [{ date: null as any, label: '' }]
        for (const c of enrolled) {
          for (const dd of labelsToMake) {
            const key = c.id + '_' + (dd.label || '')
            // Single-due-date rows historically stored due_label 'Due' or null; guard both.
            if (existingKeys.has(key)) continue
            if (dueList.length <= 1 && (existingKeys.has(c.id + '_') || (dueList[0] && existingKeys.has(c.id + '_' + dueList[0].label)))) continue
            const row: any = { worksheet_id: wsId || null, client_id: c.id, org_id: org.id, data: {} }
            if (dd.date) {
              row.due_date = dd.date; row.due_label = dd.label
              const sd = computeStartDate(dd.date, cfg.prep_days)
              if (sd) row.start_date = sd
            }
            newRows.push(row)
          }
        }

        if (newRows.length === 0 && wsId) continue // nothing to do for this period

        summary.plan.push({ org: org.name, work_type: cfg.name, period: label, worksheetExists: !!wsId, rowsToCreate: newRows.length })

        if (dryRun) { if (!wsId) summary.worksheetsCreated++; summary.rowsCreated += newRows.length; continue }

        // Create worksheet if needed.
        if (!wsId) {
          const { data: ins, error: wErr } = await supabase.from('worksheets').insert({
            org_id: org.id, work_type: cfg.name, period_label: label,
            period_year: p.year,
            period_month: cfg.frequency === 'monthly' ? p.month : null,
            period_quarter: cfg.frequency === 'quarterly' ? p.quarter : null,
            frequency: cfg.frequency,
          }).select('id').single()
          if (wErr || !ins) { summary.errors.push(`${org.name}/${cfg.name}/${label}: ws ${wErr?.message}`); continue }
          wsId = ins.id; summary.worksheetsCreated++
        }
        for (const r of newRows) r.worksheet_id = wsId
        if (newRows.length > 0) {
          const { error: rErr } = await supabase.from('worksheet_rows').insert(newRows)
          if (rErr) { summary.errors.push(`${org.name}/${cfg.name}/${label}: rows ${rErr.message}`); continue }
          summary.rowsCreated += newRows.length
        }
      }
    }
  }
  return json(summary, 200)
})

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } })
}
