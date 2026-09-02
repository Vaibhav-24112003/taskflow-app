// src/admin/BillingAdmin.jsx
// Full admin panel: Plans, Offers, Subscribers, Manual Access, Invoices
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

// ── helpers ──────────────────────────────────────────────────────────
const fmt     = p  => '₹' + ((p||0)/100).toLocaleString('en-IN', { minimumFractionDigits: 2 })
const fmtDate = d  => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const fmtDT   = d  => d ? new Date(d).toLocaleString('en-IN',  { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

const ALL_MODULES = ['library','team','chat','analytics','comms','billing','portal']
const PLAN_MODULES = {
  starter:    ['library','team','chat'],
  pro:        ['library','team','chat','analytics','comms','billing'],
  enterprise: ['library','team','chat','analytics','comms','billing','portal'],
}
const STATUS_COLOR = {
  active:    { bg:'#d1fae5', text:'#065f46' },
  trialing:  { bg:'#ede9fe', text:'#5b21b6' },
  past_due:  { bg:'#fee2e2', text:'#991b1b' },
  cancelled: { bg:'#f1f5f9', text:'#64748b' },
  paused:    { bg:'#fef3c7', text:'#92400e' },
  paid:      { bg:'#d1fae5', text:'#065f46' },
  trial:     { bg:'#ede9fe', text:'#5b21b6' },
  free:      { bg:'#f1f5f9', text:'#64748b' },
  manual:    { bg:'#dbeafe', text:'#1e40af' },
}

// ── shared styles ─────────────────────────────────────────────────────
const card = { background:'var(--tf-panel,#1e2533)', border:'1px solid var(--tf-border,rgba(255,255,255,.08))', borderRadius:14, padding:'20px 22px' }
const inp  = { width:'100%', padding:'9px 11px', border:'1px solid var(--tf-border,rgba(255,255,255,.12))', borderRadius:8, background:'var(--tf-bg,#151c28)', color:'var(--tf-text,#e8edf5)', fontSize:13, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }
const lbl  = { display:'block', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--tf-text-sub,#7a8aa0)', marginBottom:5 }
const btn  = (bg='#2F6BFF',color='#fff') => ({ background:bg, color, border:'none', borderRadius:9, padding:'9px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap' })
const pill = (status) => { const c = STATUS_COLOR[status]||STATUS_COLOR.free; return { fontSize:10, fontWeight:800, borderRadius:20, padding:'2px 10px', background:c.bg, color:c.text } }

// ── Field wrapper ─────────────────────────────────────────────────────
function F({ label, children, half }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:4, gridColumn: half ? 'span 1' : 'span 2' }}>
      <span style={lbl}>{label}</span>
      {children}
    </label>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// PLAN MODAL
// ═══════════════════════════════════════════════════════════════════════
function PlanModal({ plan, onSave, onClose }) {
  const isNew = !plan
  const [f, setF] = useState(plan ? {
    ...plan,
    price_monthly: Math.round((plan.price_monthly||0)/100),
    price_yearly:  Math.round((plan.price_yearly||0)/100),
    features:      (plan.features||[]).join('\n'),
    modules:       plan.modules || PLAN_MODULES[plan.id] || [],
  } : {
    id:'', name:'', category:'core', description:'',
    price_monthly:0, price_yearly:0, features:'',
    modules:[], badge:'', offer_label:'', offer_expires_at:'',
    is_active:true, is_featured:false, sort_order:0,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const s = (k,v) => setF(p => ({...p,[k]:v}))

  const toggleModule = (m) => {
    setF(p => ({ ...p, modules: p.modules.includes(m) ? p.modules.filter(x=>x!==m) : [...p.modules, m] }))
  }

  async function save() {
    if (!f.id || !f.name) { setError('Plan ID and Name are required'); return }
    setSaving(true); setError('')
    const payload = {
      id:              f.id.toLowerCase().trim(),
      name:            f.name.trim(),
      category:        f.category,
      description:     f.description || '',
      price_monthly:   Math.round(Number(f.price_monthly) * 100),
      price_yearly:    Math.round(Number(f.price_yearly)  * 100),
      features:        f.features.split('\n').map(x=>x.trim()).filter(Boolean),
      modules:         f.modules,
      limits:          f.limits || {},
      badge:           f.badge || null,
      offer_label:     f.offer_label || null,
      offer_expires_at:f.offer_expires_at || null,
      is_active:       f.is_active,
      is_featured:     f.is_featured,
      sort_order:      Number(f.sort_order)||0,
      updated_at:      new Date().toISOString(),
    }
    const { error: err } = isNew
      ? await supabase.from('plans').insert(payload)
      : await supabase.from('plans').update(payload).eq('id', plan.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ ...card, width:'100%', maxWidth:640, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,.5)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:'var(--tf-text,#e8edf5)' }}>{isNew ? '+ New Plan' : `Edit — ${plan.name}`}</h3>
          <button onClick={onClose} style={{ ...btn('transparent','var(--tf-text-sub,#7a8aa0)'), padding:'4px 8px', fontSize:18 }}>×</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <F label="Plan ID (slug)" half><input style={inp} value={f.id} onChange={e=>s('id',e.target.value)} disabled={!isNew} placeholder="pro" /></F>
          <F label="Display Name" half><input style={inp} value={f.name} onChange={e=>s('name',e.target.value)} placeholder="Pro" /></F>
          <F label="Category" half>
            <select style={inp} value={f.category} onChange={e=>s('category',e.target.value)}>
              <option value="core">Core</option><option value="addon">Add-on</option><option value="bundle">Bundle</option>
            </select>
          </F>
          <F label="Sort Order" half><input style={inp} type="number" value={f.sort_order} onChange={e=>s('sort_order',e.target.value)} /></F>
          <F label="Monthly Price (₹ excl. GST)"><input style={inp} type="number" value={f.price_monthly} onChange={e=>s('price_monthly',e.target.value)} placeholder="1999" /></F>
          <F label="Yearly Price (₹ total, excl. GST)"><input style={inp} type="number" value={f.price_yearly} onChange={e=>s('price_yearly',e.target.value)} placeholder="19990" /></F>
          <F label="Description">
            <input style={inp} value={f.description||''} onChange={e=>s('description',e.target.value)} placeholder="For growing CA, CS and tax advisory firms" />
          </F>
          <F label="Features (one per line)">
            <textarea style={{ ...inp, minHeight:100, resize:'vertical' }} value={f.features} onChange={e=>s('features',e.target.value)} placeholder={"Up to 10 users\n250 clients\nGST worksheets"} />
          </F>
          <F label="Badge (e.g. Best Value)" half><input style={inp} value={f.badge||''} onChange={e=>s('badge',e.target.value)} placeholder="Most Popular" /></F>
          <F label="Offer Label (e.g. 20% off)" half><input style={inp} value={f.offer_label||''} onChange={e=>s('offer_label',e.target.value)} placeholder="Limited time" /></F>
          <F label="Offer Expires At" half>
            <input style={inp} type="datetime-local" value={f.offer_expires_at?.slice(0,16)||''} onChange={e=>s('offer_expires_at',e.target.value)} />
          </F>

          {/* Module access checkboxes */}
          <F label="Modules included in this plan">
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'10px 0' }}>
              {ALL_MODULES.map(m => (
                <label key={m} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:'var(--tf-text,#e8edf5)', background:f.modules.includes(m)?'rgba(47,107,255,.15)':'rgba(255,255,255,.04)', border:`1px solid ${f.modules.includes(m)?'#2F6BFF':'rgba(255,255,255,.1)'}`, borderRadius:8, padding:'5px 12px' }}>
                  <input type="checkbox" checked={f.modules.includes(m)} onChange={()=>toggleModule(m)} style={{ accentColor:'#2F6BFF' }} />
                  {m}
                </label>
              ))}
            </div>
          </F>

          <div style={{ gridColumn:'span 2', display:'flex', gap:20, paddingTop:4 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--tf-text,#e8edf5)' }}>
              <input type="checkbox" checked={f.is_active} onChange={e=>s('is_active',e.target.checked)} style={{ accentColor:'#2F6BFF' }} />
              Active (visible on pricing page)
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--tf-text,#e8edf5)' }}>
              <input type="checkbox" checked={f.is_featured} onChange={e=>s('is_featured',e.target.checked)} style={{ accentColor:'#2F6BFF' }} />
              Featured ("Most popular" highlight)
            </label>
          </div>
        </div>

        {error && <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, color:'#f87171', fontSize:12 }}>⚠ {error}</div>}

        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btn('rgba(255,255,255,.06)','var(--tf-text-sub,#7a8aa0)')}>Cancel</button>
          <button onClick={save} disabled={saving} style={btn()}>{saving ? 'Saving…' : '✓ Save Plan'}</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// SUBSCRIBER OVERRIDE MODAL
// ═══════════════════════════════════════════════════════════════════════
function OverrideModal({ row, plans, onSave, onClose }) {
  const [f, setF] = useState({
    plan_id:             row.plan_id || 'pro',
    billing_cycle:       row.billing_cycle || 'monthly',
    status:              row.sub_status || 'active',
    override_price:      row.override_price ? row.override_price/100 : '',
    discount_pct:        row.discount_pct || 0,
    discount_label:      row.discount_label || '',
    discount_expires_at: row.discount_expires_at?.slice(0,16) || '',
    trial_ends_at:       row.trial_ends_at?.slice(0,16) || '',
    notes:               row.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const s = (k,v) => setF(p => ({...p,[k]:v}))

  async function save() {
    setSaving(true); setError('')
    const selectedPlan = plans.find(p => p.id === f.plan_id)
    const modules      = selectedPlan?.modules || PLAN_MODULES[f.plan_id] || []

    // Update subscriptions
    const subPayload = {
      plan_id:             f.plan_id,
      billing_cycle:       f.billing_cycle,
      status:              f.status,
      override_price:      f.override_price !== '' ? Math.round(Number(f.override_price)*100) : null,
      discount_pct:        Number(f.discount_pct)||0,
      discount_label:      f.discount_label || null,
      discount_expires_at: f.discount_expires_at || null,
      trial_ends_at:       f.trial_ends_at || null,
      notes:               f.notes || null,
      updated_at:          new Date().toISOString(),
    }
    const { data: existing } = await supabase.from('subscriptions').select('id').eq('org_id', row.org_id).maybeSingle()
    let subErr
    if (existing?.id) {
      const { error: e } = await supabase.from('subscriptions').update(subPayload).eq('id', existing.id)
      subErr = e
    } else {
      const { error: e } = await supabase.from('subscriptions').insert({ ...subPayload, org_id: row.org_id })
      subErr = e
    }
    if (subErr) { setError(subErr.message); setSaving(false); return }

    // Update organizations
    await supabase.from('organizations').update({
      subscription_status: f.status === 'active' ? 'paid' : f.status === 'trialing' ? 'trial' : f.status,
      paid_modules:        f.status === 'active' ? modules : [],
      trial_expires_at:    f.trial_ends_at || null,
    }).eq('id', row.org_id)

    setSaving(false); onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ ...card, width:'100%', maxWidth:560, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,.5)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:'var(--tf-text,#e8edf5)' }}>Override — {row.org_name}</h3>
            <p style={{ margin:'3px 0 0', fontSize:11, color:'var(--tf-text-sub,#7a8aa0)' }}>Changes apply immediately. Modules unlock/lock in real time.</p>
          </div>
          <button onClick={onClose} style={{ ...btn('transparent','var(--tf-text-sub,#7a8aa0)'), padding:'4px 8px', fontSize:18 }}>×</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <F label="Plan" half>
            <select style={inp} value={f.plan_id} onChange={e=>s('plan_id',e.target.value)}>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Billing Cycle" half>
            <select style={inp} value={f.billing_cycle} onChange={e=>s('billing_cycle',e.target.value)}>
              <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </F>
          <F label="Status" half>
            <select style={inp} value={f.status} onChange={e=>s('status',e.target.value)}>
              {['active','trialing','past_due','cancelled','paused'].map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </F>
          <F label="Custom Price (₹/period, blank = plan default)" half>
            <input style={inp} type="number" value={f.override_price} onChange={e=>s('override_price',e.target.value)} placeholder="Leave blank for plan price" />
          </F>
          <F label="Discount %" half>
            <input style={inp} type="number" min="0" max="100" value={f.discount_pct} onChange={e=>s('discount_pct',e.target.value)} />
          </F>
          <F label="Discount Label" half>
            <input style={inp} value={f.discount_label} onChange={e=>s('discount_label',e.target.value)} placeholder="Early adopter 30%" />
          </F>
          <F label="Discount Expires At" half>
            <input style={inp} type="datetime-local" value={f.discount_expires_at} onChange={e=>s('discount_expires_at',e.target.value)} />
          </F>
          <F label="Trial Ends At" half>
            <input style={inp} type="datetime-local" value={f.trial_ends_at} onChange={e=>s('trial_ends_at',e.target.value)} />
          </F>
          <F label="Admin Notes (internal only)">
            <textarea style={{ ...inp, minHeight:56, resize:'vertical' }} value={f.notes} onChange={e=>s('notes',e.target.value)} placeholder="e.g. Gave 3-month free for beta feedback" />
          </F>
        </div>

        {error && <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, color:'#f87171', fontSize:12 }}>⚠ {error}</div>}

        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btn('rgba(255,255,255,.06)','var(--tf-text-sub,#7a8aa0)')}>Cancel</button>
          <button onClick={save} disabled={saving} style={btn('#10b981')}>{saving ? 'Applying…' : '✓ Apply Override'}</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MANUAL ACCESS MODAL — grant paid access without payment
// ═══════════════════════════════════════════════════════════════════════
function ManualAccessModal({ orgs, plans, onSave, onClose }) {
  const [orgId,    setOrgId]    = useState('')
  const [planId,   setPlanId]   = useState('pro')
  const [months,   setMonths]   = useState(1)
  const [reason,   setReason]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  async function grant() {
    if (!orgId) { setError('Select an organisation'); return }
    setSaving(true); setError('')

    const selectedPlan = plans.find(p => p.id === planId)
    const modules      = selectedPlan?.modules || PLAN_MODULES[planId] || []
    const periodEnd    = new Date(); periodEnd.setMonth(periodEnd.getMonth() + Number(months))

    const { data: existing } = await supabase.from('subscriptions').select('id').eq('org_id', orgId).maybeSingle()
    const subPayload = {
      org_id:              orgId,
      plan_id:             planId,
      billing_cycle:       'manual',
      status:              'active',
      override_price:      0,
      current_period_start:new Date().toISOString(),
      current_period_end:  periodEnd.toISOString(),
      notes:               `Manual access granted. Reason: ${reason}`,
      updated_at:          new Date().toISOString(),
    }
    const { error: subErr } = existing?.id
      ? await supabase.from('subscriptions').update(subPayload).eq('id', existing.id)
      : await supabase.from('subscriptions').insert(subPayload)

    if (subErr) { setError(subErr.message); setSaving(false); return }

    await supabase.from('organizations').update({
      subscription_status: 'paid',
      paid_modules:        modules,
      trial_expires_at:    null,
    }).eq('id', orgId)

    setSuccess(true); setSaving(false)
  }

  if (success) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ ...card, width:'100%', maxWidth:400, textAlign:'center', boxShadow:'0 32px 80px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
        <h3 style={{ margin:'0 0 8px', color:'var(--tf-text,#e8edf5)', fontWeight:800 }}>Access granted!</h3>
        <p style={{ color:'var(--tf-text-sub,#7a8aa0)', fontSize:13, marginBottom:20 }}>
          {orgs.find(o=>o.id===orgId)?.name} now has {plans.find(p=>p.id===planId)?.name} access for {months} month{months>1?'s':''} at no charge.
        </p>
        <button onClick={()=>{setSuccess(false);onSave()}} style={{ ...btn(), width:'100%', justifyContent:'center' }}>Done</button>
      </div>
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ ...card, width:'100%', maxWidth:500, boxShadow:'0 32px 80px rgba(0,0,0,.5)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:'var(--tf-text,#e8edf5)' }}>Grant Manual Access</h3>
          <button onClick={onClose} style={{ ...btn('transparent','var(--tf-text-sub,#7a8aa0)'), padding:'4px 8px', fontSize:18 }}>×</button>
        </div>
        <p style={{ margin:'0 0 20px', fontSize:12, color:'var(--tf-text-sub,#7a8aa0)' }}>Gives a firm full plan access without requiring payment. Use for beta testers, partners, or exceptions.</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <F label="Organisation">
            <select style={inp} value={orgId} onChange={e=>setOrgId(e.target.value)}>
              <option value="">— select —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </F>
          <F label="Plan to grant" half>
            <select style={inp} value={planId} onChange={e=>setPlanId(e.target.value)}>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Duration (months)" half>
            <input style={inp} type="number" min="1" max="36" value={months} onChange={e=>setMonths(e.target.value)} />
          </F>
          <F label="Reason (internal note)">
            <input style={inp} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Beta tester / Partner / Refund compensation" />
          </F>
        </div>

        {error && <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8, color:'#f87171', fontSize:12 }}>⚠ {error}</div>}

        <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.2)', borderRadius:8, fontSize:12, color:'#93c5fd' }}>
          💡 This does NOT create a payment record or Zoho invoice. It directly sets subscription_status = paid on the org.
        </div>

        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btn('rgba(255,255,255,.06)','var(--tf-text-sub,#7a8aa0)')}>Cancel</button>
          <button onClick={grant} disabled={saving} style={btn('#10b981')}>{saving ? 'Granting…' : '✓ Grant Access'}</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function BillingAdmin() {
  const [tab,         setTab]         = useState('plans')
  const [plans,       setPlans]       = useState([])
  const [subscribers, setSubscribers] = useState([])
  const [invoices,    setInvoices]    = useState([])
  const [orgs,        setOrgs]        = useState([])
  const [stats,       setStats]       = useState({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [planModal,   setPlanModal]   = useState(null)   // null | 'new' | plan obj
  const [subModal,    setSubModal]    = useState(null)   // null | row
  const [manualModal, setManualModal] = useState(false)
  const [search,      setSearch]      = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // 1. Plans
      const { data: pl, error: pe } = await supabase.from('plans').select('*').order('sort_order')
      if (pe) throw new Error('Plans: ' + pe.message)

      // 2. Orgs
      const { data: orgList, error: oe } = await supabase.from('organizations')
        .select('id, name, subscription_status, paid_modules, trial_expires_at').order('name')
      if (oe) throw new Error('Orgs: ' + oe.message)

      // 3. Subscriptions (no join — fetch plans separately)
      const { data: subs, error: se } = await supabase.from('subscriptions')
        .select('*').order('created_at', { ascending: false })
      if (se) throw new Error('Subs: ' + se.message)

      // 4. Owner profiles — separate query, join manually
      const { data: ownerMembers } = await supabase.from('organization_members')
        .select('org_id, user_id').eq('role', 'owner')

      const userIds = [...new Set((ownerMembers||[]).map(m => m.user_id).filter(Boolean))]
      let profileMap = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles')
          .select('id, name, email').in('id', userIds)
        ;(profiles||[]).forEach(p => { profileMap[p.id] = p })
      }
      const ownerMap = {}
      ;(ownerMembers||[]).forEach(m => {
        ownerMap[m.org_id] = profileMap[m.user_id] || {}
      })

      // 5. Plan lookup map
      const planMap = Object.fromEntries((pl||[]).map(p => [p.id, p]))

      // 6. Merge subs
      const enriched = (subs||[]).map(s => {
        const org   = (orgList||[]).find(o => o.id === s.org_id) || {}
        const owner = ownerMap[s.org_id] || {}
        const plan  = planMap[s.plan_id] || {}
        return {
          ...s,
          plans:       plan,
          org_name:    org.name    || s.org_id?.slice(0,8) || '—',
          owner_name:  owner.name  || '—',
          owner_email: owner.email || '—',
          org_status:  org.subscription_status || '—',
          sub_status:  s.status,
          paid_modules:org.paid_modules || [],
          total_paid:  totalPaidMap[s.org_id] || 0,
        }
      })

      // 7. Total paid per org from payment_events (source of truth)
      const { data: payments } = await supabase.from('payment_events')
        .select('org_id, amount').eq('status', 'captured')
      const totalPaidMap = {}
      ;(payments||[]).forEach(p => {
        totalPaidMap[p.org_id] = (totalPaidMap[p.org_id] || 0) + (p.amount || 0)
      })

      // 8. Invoices
      const { data: invs } = await supabase.from('subscription_invoices')
        .select('*').order('created_at', { ascending: false }).limit(100)
      const orgNameMap = Object.fromEntries((orgList||[]).map(o => [o.id, o.name]))
      const enrichedInvs = (invs||[]).map(i => ({
        ...i, org_name: orgNameMap[i.org_id] || i.org_id?.slice(0,8) || '—'
      }))

      // 9. Stats
      const active   = enriched.filter(s => s.sub_status === 'active')
      const trialing = (orgList||[]).filter(o => ['trial','trialing'].includes(o.subscription_status))
      const mrr = active.reduce((n,s) => {
        if (s.billing_cycle === 'manual') return n  // free access, skip
        const basePrice = s.billing_cycle==='yearly'
          ? Math.round((s.plans?.price_yearly||0)/12)
          : (s.plans?.price_monthly||0)
        const price = s.override_price != null ? Math.round(s.override_price / (s.billing_cycle==='yearly'?12:1)) : basePrice
        const disc  = s.discount_pct > 0 ? (100 - s.discount_pct) / 100 : 1
        return n + Math.round(price * disc)
      }, 0)

      setPlans(pl || [])
      setOrgs(orgList || [])
      setSubscribers(enriched)
      setInvoices(enrichedInvs)
      setStats({
        active:   active.length,
        trialing: trialing.length,
        pastDue:  enriched.filter(s=>s.sub_status==='past_due').length,
        manual:   enriched.filter(s=>s.billing_cycle==='manual').length,
        mrr,
        arr:      mrr * 12,
        invoices: enrichedInvs.length,
      })
    } catch(e) {
      console.error('BillingAdmin load error:', e)
      setError(e.message || 'Failed to load billing data. Check console for details.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filteredSubs = subscribers.filter(s =>
    !search || s.org_name.toLowerCase().includes(search.toLowerCase()) ||
    s.owner_email.toLowerCase().includes(search.toLowerCase())
  )

  async function deletePlan(id) {
    if (!confirm(`Delete plan "${id}"? Existing subscribers won't be affected.`)) return
    await supabase.from('plans').delete().eq('id', id)
    load()
  }

  async function togglePlan(plan) {
    await supabase.from('plans').update({ is_active: !plan.is_active, updated_at: new Date().toISOString() }).eq('id', plan.id)
    load()
  }

  const StatCard = ({ label, value, sub, color='#2F6BFF', alert=false }) => (
    <div style={{ ...card, display:'flex', flexDirection:'column', gap:4, borderColor: alert&&value>0 ? 'rgba(239,68,68,.3)' : undefined }}>
      <span style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--tf-text-sub,#7a8aa0)' }}>{label}</span>
      <span style={{ fontSize:28, fontWeight:800, letterSpacing:'-.04em', color: alert&&value>0 ? '#f87171' : color }}>{loading?'—':value}</span>
      {sub && <span style={{ fontSize:10, color:'var(--tf-text-sub,#7a8aa0)' }}>{sub}</span>}
    </div>
  )

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,system-ui,sans-serif', color:'var(--tf-text,#e8edf5)', maxWidth:1400, minHeight:600 }}>

      {/* Modals */}
      {planModal !== null && (
        <PlanModal plan={planModal==='new'?null:planModal} onSave={()=>{setPlanModal(null);load()}} onClose={()=>setPlanModal(null)} />
      )}
      {subModal && (
        <OverrideModal row={subModal} plans={plans} onSave={()=>{setSubModal(null);load()}} onClose={()=>setSubModal(null)} />
      )}
      {manualModal && (
        <ManualAccessModal orgs={orgs} plans={plans} onSave={()=>{setManualModal(false);load()}} onClose={()=>setManualModal(false)} />
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Billing &amp; Plans</h2>
          <p style={{ margin:'4px 0 0', fontSize:12, color:'var(--tf-text-sub,#7a8aa0)' }}>Manage pricing, access, subscribers and invoices</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>setManualModal(true)} style={btn('#10b981')}>🎁 Grant Manual Access</button>
          <button onClick={()=>setPlanModal('new')} style={btn()}>+ New Plan</button>
          <button onClick={load} style={btn('rgba(255,255,255,.06)','var(--tf-text-sub,#7a8aa0)')}>↻ Refresh</button>
        </div>
      </div>

      {error && <div style={{ marginBottom:16, padding:'12px 16px', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:10, color:'#f87171', fontSize:13 }}>⚠ {error}</div>}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:24 }}>
        <StatCard label="Active"   value={stats.active}   sub="Paying subscribers" color="#10b981" />
        <StatCard label="Trialing" value={stats.trialing} sub="Free trial"          color="#8b5cf6" />
        <StatCard label="Past Due" value={stats.pastDue}  sub="Payment failed"      color="#f87171" alert />
        <StatCard label="Manual"   value={stats.manual}   sub="No payment"          color="#3b82f6" />
        <StatCard label="MRR"      value={fmt(stats.mrr)} sub="Monthly recurring"   color="#2F6BFF" />
        <StatCard label="ARR"      value={fmt(stats.arr)} sub="Annualised"          color="#f59e0b" />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--tf-border,rgba(255,255,255,.08))', marginBottom:20 }}>
        {[['plans','📋 Plans & Pricing'],['subscribers','👥 Subscribers'],['invoices','🧾 Invoices']].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            border:'none', background:'none', cursor:'pointer', padding:'10px 18px',
            fontSize:13, fontWeight:tab===id?800:500, fontFamily:'inherit',
            color: tab===id ? '#2F6BFF' : 'var(--tf-text-sub,#7a8aa0)',
            borderBottom: tab===id ? '2px solid #2F6BFF' : '2px solid transparent',
            marginBottom:-1, borderRadius:'6px 6px 0 0'
          }}>{label}</button>
        ))}
      </div>

      {/* ── PLANS TAB ── */}
      {tab === 'plans' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {loading
            ? <p style={{ color:'var(--tf-text-sub,#7a8aa0)', fontSize:13 }}>Loading plans…</p>
            : plans.map(plan => {
              const saving = Math.round((1 - plan.price_yearly/(plan.price_monthly*12))*100)
              return (
                <div key={plan.id} style={{ ...card, position:'relative', opacity:plan.is_active?1:.55, border:`1px solid ${plan.is_featured?'rgba(47,107,255,.45)':'rgba(255,255,255,.08)'}` }}>
                  {plan.is_featured && <div style={{ position:'absolute', top:-10, left:16, background:'linear-gradient(135deg,#2F6BFF,#14C7C0)', color:'#fff', borderRadius:20, padding:'2px 12px', fontSize:9, fontWeight:800 }}>⭐ FEATURED</div>}
                  {plan.badge && <div style={{ position:'absolute', top:plan.is_featured?14:-10, right:14, background:'#f59e0b', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:9, fontWeight:800 }}>{plan.badge}</div>}

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:16, fontWeight:800 }}>{plan.name}</div>
                      <div style={{ fontSize:10, color:'var(--tf-text-sub,#7a8aa0)', marginTop:2 }}>
                        <span style={{ ...pill(plan.is_active?'active':'cancelled') }}>{plan.category}</span>
                        <span style={{ marginLeft:6 }}>sort: {plan.sort_order}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>togglePlan(plan)} title={plan.is_active?'Deactivate':'Activate'} style={{ ...btn('rgba(255,255,255,.06)','var(--tf-text-sub,#7a8aa0)'), padding:'5px 10px' }}>
                        {plan.is_active ? '⏸' : '▶'}
                      </button>
                      <button onClick={()=>setPlanModal(plan)} style={{ ...btn('rgba(47,107,255,.15)','#93bbff'), padding:'5px 10px' }}>✏️</button>
                      <button onClick={()=>deletePlan(plan.id)} style={{ ...btn('rgba(239,68,68,.12)','#f87171'), padding:'5px 10px' }}>🗑</button>
                    </div>
                  </div>

                  <div style={{ marginBottom:10 }}>
                    <span style={{ fontSize:28, fontWeight:800, color:'#2F6BFF', letterSpacing:'-.03em' }}>{fmt(plan.price_monthly)}</span>
                    <span style={{ fontSize:12, color:'var(--tf-text-sub,#7a8aa0)' }}>/mo</span>
                    <span style={{ marginLeft:10, fontSize:11, color:'var(--tf-text-sub,#7a8aa0)' }}>{fmt(plan.price_yearly)}/yr · saves {saving}%</span>
                  </div>

                  {plan.offer_label && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.25)', color:'#fbbf24', borderRadius:7, padding:'3px 10px', fontSize:11, fontWeight:700, marginBottom:10 }}>
                      🏷 {plan.offer_label}
                      {plan.offer_expires_at && <span style={{ color:'#7a8aa0', fontWeight:400 }}>· until {fmtDate(plan.offer_expires_at)}</span>}
                    </div>
                  )}

                  <div style={{ fontSize:11, color:'var(--tf-text-sub,#7a8aa0)', marginBottom:6 }}>Modules:</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:12 }}>
                    {(plan.modules||PLAN_MODULES[plan.id]||[]).map(m => (
                      <span key={m} style={{ fontSize:10, fontWeight:700, background:'rgba(47,107,255,.12)', color:'#93bbff', borderRadius:6, padding:'2px 8px' }}>{m}</span>
                    ))}
                  </div>

                  <div style={{ fontSize:11, color:'var(--tf-text-sub,#7a8aa0)', marginBottom:4 }}>Features:</div>
                  <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:11, color:'var(--tf-text-sub,#7a8aa0)', lineHeight:1.8 }}>
                    {(plan.features||[]).slice(0,5).map((f,i) => <li key={i}>{f}</li>)}
                    {(plan.features||[]).length > 5 && <li style={{ color:'#2F6BFF' }}>+{plan.features.length-5} more</li>}
                  </ul>
                </div>
              )
            })
          }
        </div>
      )}

      {/* ── SUBSCRIBERS TAB ── */}
      {tab === 'subscribers' && (
        <>
          <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
            <input style={{ ...inp, maxWidth:280 }} placeholder="Search org or email…" value={search} onChange={e=>setSearch(e.target.value)} />
            <span style={{ fontSize:12, color:'var(--tf-text-sub,#7a8aa0)' }}>{filteredSubs.length} results</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['Organisation','Owner','Plan','Cycle','Status','Effective Price','Discount','Modules','Renewal','Total Paid',''].map(h => (
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, fontSize:9, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--tf-text-sub,#7a8aa0)', borderBottom:'1px solid var(--tf-border,rgba(255,255,255,.08))', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={11} style={{ padding:32, textAlign:'center', color:'var(--tf-text-sub,#7a8aa0)' }}>Loading…</td></tr>
                  : filteredSubs.length === 0
                    ? <tr><td colSpan={11} style={{ padding:32, textAlign:'center', color:'var(--tf-text-sub,#7a8aa0)' }}>No subscribers yet.</td></tr>
                    : filteredSubs.map(s => {
                      const planObj = plans.find(p=>p.id===s.plan_id)
                      const basePrice = s.billing_cycle==='yearly' ? (planObj?.price_yearly||0) : (planObj?.price_monthly||0)
                      const effectivePrice = s.override_price ?? (s.discount_pct > 0 ? Math.round(basePrice*(100-s.discount_pct)/100) : basePrice)
                      return (
                        <tr key={s.id} style={{ borderBottom:'1px solid var(--tf-border,rgba(255,255,255,.06))' }}>
                          <td style={{ padding:'11px 12px' }}>
                            <div style={{ fontWeight:700, fontSize:13 }}>{s.org_name}</div>
                            {s.notes && <div style={{ fontSize:10, color:'#f59e0b', marginTop:2 }}>📝 {s.notes}</div>}
                          </td>
                          <td style={{ padding:'11px 12px' }}>
                            <div style={{ fontSize:12 }}>{s.owner_name}</div>
                            <div style={{ fontSize:10, color:'var(--tf-text-sub,#7a8aa0)' }}>{s.owner_email}</div>
                          </td>
                          <td style={{ padding:'11px 12px' }}><span style={{ fontWeight:700 }}>{s.plans?.name || s.plan_id}</span></td>
                          <td style={{ padding:'11px 12px' }}><span style={{ ...pill(s.billing_cycle==='manual'?'manual':undefined), background:'rgba(255,255,255,.06)', color:'var(--tf-text-sub,#7a8aa0)' }}>{s.billing_cycle}</span></td>
                          <td style={{ padding:'11px 12px' }}><span style={pill(s.sub_status)}>{s.sub_status}</span></td>
                          <td style={{ padding:'11px 12px', fontWeight:700 }}>
                            {s.billing_cycle==='manual' ? <span style={{ ...pill('manual') }}>FREE</span> : fmt(effectivePrice)}
                            {s.override_price && <div style={{ fontSize:9, color:'#fbbf24' }}>custom</div>}
                          </td>
                          <td style={{ padding:'11px 12px' }}>
                            {s.discount_pct > 0 ? <span style={{ color:'#fbbf24', fontWeight:700 }}>{s.discount_pct}%{s.discount_label?' — '+s.discount_label:''}</span> : <span style={{ color:'var(--tf-text-sub,#7a8aa0)' }}>—</span>}
                          </td>
                          <td style={{ padding:'11px 12px' }}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                              {(s.paid_modules||[]).map(m => <span key={m} style={{ fontSize:9, fontWeight:700, background:'rgba(47,107,255,.12)', color:'#93bbff', borderRadius:4, padding:'1px 6px' }}>{m}</span>)}
                            </div>
                          </td>
                          <td style={{ padding:'11px 12px', fontSize:11, color:'var(--tf-text-sub,#7a8aa0)', whiteSpace:'nowrap' }}>
                            {fmtDate(s.current_period_end || s.trial_ends_at)}
                          </td>
                          <td style={{ padding:'11px 12px', fontWeight:700, color:'#10b981' }}>{fmt(s.total_paid||0)}</td>
                          <td style={{ padding:'11px 12px' }}>
                            <button onClick={()=>setSubModal(s)} style={{ ...btn('rgba(255,255,255,.06)','var(--tf-text-sub,#7a8aa0)'), padding:'6px 12px', fontSize:11 }}>✏ Override</button>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── INVOICES TAB ── */}
      {tab === 'invoices' && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr>
                {['Invoice #','Organisation','Plan','Billing','Amount','Email','Zoho Invoice','Date'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, fontSize:9, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--tf-text-sub,#7a8aa0)', borderBottom:'1px solid var(--tf-border,rgba(255,255,255,.08))', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'var(--tf-text-sub,#7a8aa0)' }}>Loading…</td></tr>
                : invoices.length === 0
                  ? <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'var(--tf-text-sub,#7a8aa0)' }}>No invoices yet.</td></tr>
                  : invoices.map(inv => (
                    <tr key={inv.id} style={{ borderBottom:'1px solid var(--tf-border,rgba(255,255,255,.06))' }}>
                      <td style={{ padding:'11px 12px' }}><code style={{ fontSize:11, color:'#93c5fd' }}>{inv.invoice_number}</code></td>
                      <td style={{ padding:'11px 12px', fontWeight:700 }}>{inv.org_name}</td>
                      <td style={{ padding:'11px 12px' }}>{inv.plan_id}</td>
                      <td style={{ padding:'11px 12px' }}>{inv.billing_cycle}</td>
                      <td style={{ padding:'11px 12px', fontWeight:700, color:'#10b981' }}>{fmt(inv.amount||0)}</td>
                      <td style={{ padding:'11px 12px' }}><span style={pill(inv.email_status==='sent'?'active':inv.email_status==='failed'?'past_due':'trialing')}>{inv.email_status}</span></td>
                      <td style={{ padding:'11px 12px' }}>
                        {inv.zoho_invoice_url
                          ? <a href={inv.zoho_invoice_url} target="_blank" rel="noopener noreferrer" style={{ color:'#93bbff', fontSize:11, fontWeight:700 }}>View PDF ↗</a>
                          : <span style={{ color:'var(--tf-text-sub,#7a8aa0)' }}>{inv.zoho_invoice_id || '—'}</span>}
                      </td>
                      <td style={{ padding:'11px 12px', fontSize:11, color:'var(--tf-text-sub,#7a8aa0)', whiteSpace:'nowrap' }}>{fmtDT(inv.created_at)}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
