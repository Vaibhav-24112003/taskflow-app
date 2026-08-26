// src/admin/BillingAdmin.jsx
// Admin dashboard for: Plan management, Pricing, Offers, Subscribers, Invoices
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  IndianRupee, Users, TrendingUp, AlertTriangle, Tag, Plus,
  Pencil, Trash2, Check, X, RefreshCw, ExternalLink,
  ChevronDown, Star, BadgePercent, FileText, ToggleLeft, ToggleRight
} from 'lucide-react'

const fmt     = p  => '₹' + ((p || 0) / 100).toLocaleString('en-IN')
const fmtDate = d  => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const STATUS_COLOR = { active:'#10b981', trialing:'#6366f1', past_due:'#ef4444', cancelled:'#94a3b8', paused:'#f59e0b' }
const CYCLE_LABEL  = { monthly:'Monthly', yearly:'Yearly' }

// ── Reusable input ────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--tf-text-sub)' }}>{label}</span>
      {children}
    </label>
  )
}
const inp = { background:'var(--tf-bg)', border:'1px solid var(--tf-border)', borderRadius:8, padding:'8px 10px', color:'var(--tf-text)', fontSize:13, width:'100%', boxSizing:'border-box' }

// ══════════════════════════════════════════════════════════════════
// PLAN EDITOR MODAL
// ══════════════════════════════════════════════════════════════════
function PlanModal({ plan, onSave, onClose }) {
  const isNew = !plan?.id
  const [form, setForm] = useState(plan || {
    id:'', name:'', category:'core', description:'',
    price_monthly:0, price_yearly:0,
    features:[], limits:{}, badge:'', offer_label:'',
    offer_expires_at:'', is_active:true, is_featured:false, sort_order:0
  })
  const [featInput, setFeatInput] = useState((plan?.features || []).join('\n'))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const payload = {
      ...form,
      price_monthly: Math.round(Number(form.price_monthly) * 100),
      price_yearly:  Math.round(Number(form.price_yearly)  * 100),
      features:      featInput.split('\n').map(s => s.trim()).filter(Boolean),
      updated_at:    new Date().toISOString()
    }
    if (isNew) {
      await supabase.from('plans').insert(payload)
    } else {
      await supabase.from('plans').update(payload).eq('id', form.id)
    }
    setSaving(false)
    onSave()
  }

  const s = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--tf-panel)', borderRadius:18, padding:28, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--tf-border)', boxShadow:'0 32px 80px rgba(0,0,0,.32)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>{isNew ? 'New Plan' : `Edit — ${form.name}`}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--tf-text-sub)' }}><X size={18} /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <Field label="Plan ID (slug)"><input style={inp} value={form.id} onChange={e=>s('id',e.target.value)} disabled={!isNew} placeholder="pro" /></Field>
          <Field label="Display Name"><input style={inp} value={form.name} onChange={e=>s('name',e.target.value)} placeholder="Pro" /></Field>
          <Field label="Category">
            <select style={inp} value={form.category} onChange={e=>s('category',e.target.value)}>
              <option value="core">Core</option><option value="addon">Add-on</option><option value="bundle">Bundle</option>
            </select>
          </Field>
          <Field label="Sort Order"><input style={inp} type="number" value={form.sort_order} onChange={e=>s('sort_order',+e.target.value)} /></Field>
          <Field label="Monthly Price (₹)"><input style={inp} type="number" value={form.price_monthly/100||''} onChange={e=>s('price_monthly',+e.target.value*100)} placeholder="1999" /></Field>
          <Field label="Yearly Price (₹ total)"><input style={inp} type="number" value={form.price_yearly/100||''} onChange={e=>s('price_yearly',+e.target.value*100)} placeholder="19990" /></Field>
          <div style={{ gridColumn:'1/-1' }}>
            <Field label="Description"><input style={inp} value={form.description||''} onChange={e=>s('description',e.target.value)} /></Field>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <Field label="Features (one per line)">
              <textarea style={{ ...inp, minHeight:90, resize:'vertical' }} value={featInput} onChange={e=>setFeatInput(e.target.value)} />
            </Field>
          </div>
          <Field label="Badge (e.g. Best Value)"><input style={inp} value={form.badge||''} onChange={e=>s('badge',e.target.value)} placeholder="Most Popular" /></Field>
          <Field label="Offer Label (e.g. 20% off)"><input style={inp} value={form.offer_label||''} onChange={e=>s('offer_label',e.target.value)} placeholder="Limited time" /></Field>
          <Field label="Offer Expires At">
            <input style={inp} type="datetime-local" value={form.offer_expires_at?.slice(0,16)||''} onChange={e=>s('offer_expires_at',e.target.value)} />
          </Field>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={form.is_active} onChange={e=>s('is_active',e.target.checked)} />
              <span>Active (visible on pricing page)</span>
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={form.is_featured} onChange={e=>s('is_featured',e.target.checked)} />
              <span>Featured ("Most popular" highlight)</span>
            </label>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ ...inp, width:'auto', padding:'9px 18px', cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...inp, width:'auto', padding:'9px 18px', cursor:'pointer', background:'#2F6BFF', color:'#fff', border:'none', fontWeight:700 }}>
            {saving ? 'Saving…' : 'Save Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SUBSCRIPTION OVERRIDE MODAL
// ══════════════════════════════════════════════════════════════════
function OverrideModal({ sub, plans, onSave, onClose }) {
  const [form, setForm] = useState({
    plan_id:          sub.plan_id || 'pro',
    billing_cycle:    sub.billing_cycle || 'monthly',
    status:           sub.status || 'active',
    override_price:   sub.override_price ? sub.override_price / 100 : '',
    discount_pct:     sub.discount_pct || 0,
    discount_label:   sub.discount_label || '',
    discount_expires_at: sub.discount_expires_at?.slice(0,16) || '',
    trial_ends_at:    sub.trial_ends_at?.slice(0,16) || '',
    notes:            sub.notes || ''
  })
  const [saving, setSaving] = useState(false)
  const s = (k,v) => setForm(f => ({...f,[k]:v}))

  async function save() {
    setSaving(true)
    await supabase.from('subscriptions').update({
      plan_id:             form.plan_id,
      billing_cycle:       form.billing_cycle,
      status:              form.status,
      override_price:      form.override_price !== '' ? Math.round(+form.override_price * 100) : null,
      discount_pct:        +form.discount_pct,
      discount_label:      form.discount_label,
      discount_expires_at: form.discount_expires_at || null,
      trial_ends_at:       form.trial_ends_at || null,
      notes:               form.notes,
      updated_at:          new Date().toISOString()
    }).eq('subscription_id', sub.subscription_id)
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--tf-panel)', borderRadius:18, padding:28, width:'100%', maxWidth:520, border:'1px solid var(--tf-border)', boxShadow:'0 32px 80px rgba(0,0,0,.32)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Override — {sub.org_name}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--tf-text-sub)' }}><X size={18} /></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <Field label="Plan">
            <select style={inp} value={form.plan_id} onChange={e=>s('plan_id',e.target.value)}>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Billing Cycle">
            <select style={inp} value={form.billing_cycle} onChange={e=>s('billing_cycle',e.target.value)}>
              <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </Field>
          <Field label="Status">
            <select style={inp} value={form.status} onChange={e=>s('status',e.target.value)}>
              {['trialing','active','past_due','cancelled','paused'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Custom Price (₹, blank = plan price)">
            <input style={inp} type="number" value={form.override_price} onChange={e=>s('override_price',e.target.value)} placeholder="Leave blank for default" />
          </Field>
          <Field label="Discount %">
            <input style={inp} type="number" min="0" max="100" value={form.discount_pct} onChange={e=>s('discount_pct',e.target.value)} />
          </Field>
          <Field label="Discount Label">
            <input style={inp} value={form.discount_label} onChange={e=>s('discount_label',e.target.value)} placeholder="Early adopter 30%" />
          </Field>
          <Field label="Discount Expires At">
            <input style={inp} type="datetime-local" value={form.discount_expires_at} onChange={e=>s('discount_expires_at',e.target.value)} />
          </Field>
          <Field label="Trial Ends At">
            <input style={inp} type="datetime-local" value={form.trial_ends_at} onChange={e=>s('trial_ends_at',e.target.value)} />
          </Field>
          <div style={{ gridColumn:'1/-1' }}>
            <Field label="Admin Notes (internal only)">
              <textarea style={{ ...inp, minHeight:56, resize:'vertical' }} value={form.notes} onChange={e=>s('notes',e.target.value)} placeholder="e.g. Gave 3-month trial for beta feedback" />
            </Field>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ ...inp, width:'auto', padding:'9px 18px', cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...inp, width:'auto', padding:'9px 18px', cursor:'pointer', background:'#2F6BFF', color:'#fff', border:'none', fontWeight:700 }}>
            {saving ? 'Saving…' : 'Apply Override'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function BillingAdmin() {
  const [tab,  setTab]  = useState('plans')
  const [plans, setPlans] = useState([])
  const [subs,  setSubs]  = useState([])
  const [invs,  setInvs]  = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [planModal,  setPlanModal]  = useState(null)   // null | 'new' | plan obj
  const [subModal,   setSubModal]   = useState(null)   // null | sub row

  async function load() {
    setLoading(true)
    const [pr, sr, ir] = await Promise.all([
      supabase.from('plans').select('*').order('sort_order'),
      supabase.from('admin_billing_overview').select('*').order('created_at', { ascending:false }),
      supabase.from('invoices').select('*, organizations(name,email)').order('created_at', { ascending:false }).limit(60)
    ])
    const pl = pr.data || []
    const sb = sr.data || []
    const iv = ir.data || []
    setPlans(pl); setSubs(sb); setInvs(iv)

    const active = sb.filter(s => s.status === 'active')
    const mrr    = active.reduce((n,s) => n + (s.effective_price || 0) * (s.billing_cycle === 'yearly' ? 1/12 : 1), 0)
    setStats({
      activeSubs:  active.length,
      trialing:    sb.filter(s => s.status === 'trialing').length,
      pastDue:     sb.filter(s => s.status === 'past_due').length,
      mrr:         Math.round(mrr),
      arr:         Math.round(mrr * 12),
      totalInv:    iv.length
    })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function deletePlan(id) {
    if (!confirm(`Delete plan "${id}"? Existing subscribers won't be affected.`)) return
    await supabase.from('plans').delete().eq('id', id)
    load()
  }

  async function togglePlanActive(plan) {
    await supabase.from('plans').update({ is_active: !plan.is_active, updated_at: new Date().toISOString() }).eq('id', plan.id)
    load()
  }

  const card = (icon, label, value, sub, color) => (
    <div style={{ background:'var(--tf-panel)', border:'1px solid var(--tf-border)', borderRadius:14, padding:'18px 20px', display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:2 }}>
        <span style={{ color: color || '#2F6BFF' }}>{icon}</span>
        <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--tf-text-sub)' }}>{label}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:800, letterSpacing:'-.04em', color: color || 'var(--tf-text)' }}>{loading ? '—' : value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--tf-text-sub)' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,system-ui,sans-serif', color:'var(--tf-text)', maxWidth:1400 }}>
      {(planModal !== null) && (
        <PlanModal
          plan={planModal === 'new' ? null : planModal}
          onSave={() => { setPlanModal(null); load() }}
          onClose={() => setPlanModal(null)}
        />
      )}
      {subModal && (
        <OverrideModal
          sub={subModal}
          plans={plans}
          onSave={() => { setSubModal(null); load() }}
          onClose={() => setSubModal(null)}
        />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800 }}>Billing & Plans</h2>
          <p style={{ margin:'4px 0 0', fontSize:12, color:'var(--tf-text-sub)' }}>Manage pricing, offers, subscriptions and invoices</p>
        </div>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, border:'1px solid var(--tf-border)', background:'var(--tf-panel)', color:'var(--tf-text-sub)', borderRadius:9, padding:'8px 13px', cursor:'pointer', fontSize:12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:24 }}>
        {card(<Users size={14}/>,       'Active',     stats.activeSubs,  'Paying subscribers', '#10b981')}
        {card(<Tag size={14}/>,          'Trialing',   stats.trialing,    '14-day free trial',  '#6366f1')}
        {card(<AlertTriangle size={14}/>, 'Past Due',  stats.pastDue,     'Payment failed',     '#ef4444')}
        {card(<IndianRupee size={14}/>,   'MRR',       fmt(stats.mrr),    'Monthly recurring',  '#2F6BFF')}
        {card(<TrendingUp size={14}/>,    'ARR',       fmt(stats.arr),    'Annualised',         '#f59e0b')}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--tf-border)', marginBottom:20 }}>
        {[['plans','Plans & Pricing'],['offers','Offers & Categories'],['subscribers','Subscribers'],['invoices','Invoices']].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            border:'none', background:'none', cursor:'pointer', padding:'10px 16px', fontSize:13, fontWeight: tab===id ? 800 : 500,
            color: tab===id ? '#2F6BFF' : 'var(--tf-text-sub)',
            borderBottom: tab===id ? '2px solid #2F6BFF' : '2px solid transparent',
            marginBottom:-1, borderRadius:'6px 6px 0 0'
          }}>{label}</button>
        ))}
      </div>

      {/* ── PLANS TAB ── */}
      {tab === 'plans' && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
            <button onClick={()=>setPlanModal('new')} style={{ display:'flex', alignItems:'center', gap:6, background:'#2F6BFF', color:'#fff', border:'none', borderRadius:10, padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
              <Plus size={14} /> New Plan
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
            {plans.map(p => (
              <div key={p.id} style={{ border:`1px solid ${p.is_featured ? '#2F6BFF' : 'var(--tf-border)'}`, borderRadius:16, padding:20, background:'var(--tf-panel)', position:'relative', opacity: p.is_active ? 1 : .55 }}>
                {p.is_featured && <div style={{ position:'absolute', top:-10, right:16, background:'#2F6BFF', color:'#fff', borderRadius:20, padding:'2px 12px', fontSize:10, fontWeight:800 }}><Star size={9} style={{marginRight:3}}/>FEATURED</div>}
                {p.badge && <div style={{ position:'absolute', top:p.is_featured ? 18 : -10, left:16, background:'#f59e0b', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:800 }}>{p.badge}</div>}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div>
                    <b style={{ fontSize:15 }}>{p.name}</b>
                    <span style={{ fontSize:10, fontWeight:700, marginLeft:8, background:'var(--tf-bg)', border:'1px solid var(--tf-border)', borderRadius:6, padding:'1px 7px', color:'var(--tf-text-sub)' }}>{p.category}</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>togglePlanActive(p)} title={p.is_active ? 'Deactivate' : 'Activate'} style={{ background:'none', border:'none', cursor:'pointer', color: p.is_active ? '#10b981' : '#94a3b8' }}>
                      {p.is_active ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                    </button>
                    <button onClick={()=>setPlanModal(p)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--tf-text-sub)' }}><Pencil size={14}/></button>
                    <button onClick={()=>deletePlan(p.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444' }}><Trash2 size={14}/></button>
                  </div>
                </div>
                <div style={{ fontSize:24, fontWeight:800, letterSpacing:'-.03em', color:'#2F6BFF', marginBottom:2 }}>
                  {fmt(p.price_monthly)}<span style={{ fontSize:12, fontWeight:400, color:'var(--tf-text-sub)' }}>/mo</span>
                </div>
                <div style={{ fontSize:11, color:'var(--tf-text-sub)', marginBottom:10 }}>
                  {fmt(p.price_yearly)}/yr · saves {Math.round((1 - p.price_yearly / (p.price_monthly * 12)) * 100)}%
                </div>
                {p.offer_label && (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.25)', color:'#d97706', borderRadius:7, padding:'3px 10px', fontSize:11, fontWeight:700, marginBottom:8 }}>
                    <BadgePercent size={11}/> {p.offer_label}
                    {p.offer_expires_at && <span style={{ color:'#94a3b8', fontWeight:400 }}>· expires {fmtDate(p.offer_expires_at)}</span>}
                  </div>
                )}
                <ul style={{ margin:'8px 0 0', padding:'0 0 0 16px', fontSize:11, color:'var(--tf-text-sub)', lineHeight:1.8 }}>
                  {(p.features || []).slice(0,5).map((f,i) => <li key={i}>{f}</li>)}
                  {(p.features || []).length > 5 && <li style={{ color:'#2F6BFF' }}>+{p.features.length-5} more</li>}
                </ul>
                <div style={{ marginTop:12, fontSize:10, color:'var(--tf-text-sub)' }}>Sort: {p.sort_order} · ID: <code>{p.id}</code></div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── OFFERS & CATEGORIES TAB ── */}
      {tab === 'offers' && (
        <div>
          <p style={{ fontSize:13, color:'var(--tf-text-sub)', marginBottom:16 }}>
            Active offers across all plans. Edit via the Plans tab → Edit Plan → Offer Label.
          </p>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--tf-panel)' }}>
                {['Plan','Category','Monthly','Yearly','Offer','Expires','Active'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--tf-text-sub)', borderBottom:'1px solid var(--tf-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid var(--tf-border)' }}>
                  <td style={{ padding:'12px 14px' }}>
                    <b>{p.name}</b>
                    {p.badge && <span style={{ marginLeft:6, fontSize:9, background:'#f59e0b', color:'#fff', borderRadius:4, padding:'1px 6px', fontWeight:800 }}>{p.badge}</span>}
                  </td>
                  <td style={{ padding:'12px 14px' }}><span style={{ fontSize:10, fontWeight:700, background:'var(--tf-bg)', border:'1px solid var(--tf-border)', borderRadius:5, padding:'2px 8px' }}>{p.category}</span></td>
                  <td style={{ padding:'12px 14px', fontWeight:700 }}>{fmt(p.price_monthly)}</td>
                  <td style={{ padding:'12px 14px', fontWeight:700 }}>{fmt(p.price_yearly)}</td>
                  <td style={{ padding:'12px 14px' }}>
                    {p.offer_label
                      ? <span style={{ color:'#d97706', fontWeight:700 }}><BadgePercent size={11} style={{marginRight:4}}/>{p.offer_label}</span>
                      : <span style={{ color:'#94a3b8', fontSize:11 }}>No offer</span>}
                  </td>
                  <td style={{ padding:'12px 14px', fontSize:11, color:'var(--tf-text-sub)' }}>{fmtDate(p.offer_expires_at)}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', display:'inline-block', background: p.is_active ? '#10b981' : '#94a3b8', marginRight:6 }}/>
                    {p.is_active ? 'Active' : 'Hidden'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUBSCRIBERS TAB ── */}
      {tab === 'subscribers' && (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'var(--tf-panel)' }}>
              {['Organisation','Plan','Cycle','Status','Effective Price','Discount','Renewal','Total Paid','Actions'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--tf-text-sub)', borderBottom:'1px solid var(--tf-border)', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subs.map(s => (
              <tr key={s.subscription_id} style={{ borderBottom:'1px solid var(--tf-border)' }}>
                <td style={{ padding:'12px 14px' }}>
                  <b style={{ fontSize:13 }}>{s.org_name}</b>
                  {s.notes && <div style={{ fontSize:10, color:'#f59e0b', marginTop:2 }}>📝 {s.notes}</div>}
                </td>
                <td style={{ padding:'12px 14px' }}>{s.plan_name}</td>
                <td style={{ padding:'12px 14px', fontSize:11 }}>{CYCLE_LABEL[s.billing_cycle]||s.billing_cycle}</td>
                <td style={{ padding:'12px 14px' }}>
                  <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[s.status]||'#94a3b8', background: (STATUS_COLOR[s.status]||'#94a3b8')+'18', borderRadius:6, padding:'2px 9px' }}>
                    {s.status}
                  </span>
                </td>
                <td style={{ padding:'12px 14px', fontWeight:700 }}>
                  {fmt(s.effective_price)}
                  {s.override_price && <div style={{ fontSize:9, color:'#f59e0b' }}>Custom price</div>}
                </td>
                <td style={{ padding:'12px 14px' }}>
                  {s.discount_pct > 0
                    ? <span style={{ color:'#d97706', fontWeight:700, fontSize:12 }}>{s.discount_pct}% — {s.discount_label||''}</span>
                    : <span style={{ color:'#94a3b8', fontSize:11 }}>None</span>}
                </td>
                <td style={{ padding:'12px 14px', fontSize:11, color:'var(--tf-text-sub)' }}>
                  {fmtDate(s.current_period_end || s.trial_ends_at)}
                  {s.status === 'trialing' && <div style={{ fontSize:9, color:'#6366f1' }}>trial</div>}
                </td>
                <td style={{ padding:'12px 14px', fontWeight:700, color:'#10b981' }}>{fmt(s.total_paid)}</td>
                <td style={{ padding:'12px 14px' }}>
                  <button onClick={()=>setSubModal(s)} style={{ display:'flex', alignItems:'center', gap:4, border:'1px solid var(--tf-border)', background:'var(--tf-bg)', color:'var(--tf-text)', borderRadius:8, padding:'6px 11px', cursor:'pointer', fontSize:11 }}>
                    <Pencil size={11}/> Override
                  </button>
                </td>
              </tr>
            ))}
            {subs.length === 0 && !loading && (
              <tr><td colSpan={9} style={{ padding:32, textAlign:'center', color:'var(--tf-text-sub)', fontSize:13 }}>No subscribers yet. Share your pricing page to get started.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* ── INVOICES TAB ── */}
      {tab === 'invoices' && (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'var(--tf-panel)' }}>
              {['Invoice #','Organisation','Plan','Amount','Email','Zoho','Date'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--tf-text-sub)', borderBottom:'1px solid var(--tf-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invs.map(inv => (
              <tr key={inv.id} style={{ borderBottom:'1px solid var(--tf-border)' }}>
                <td style={{ padding:'12px 14px' }}><b style={{ fontFamily:'monospace', fontSize:12 }}>{inv.invoice_number}</b></td>
                <td style={{ padding:'12px 14px' }}>{inv.organizations?.name}</td>
                <td style={{ padding:'12px 14px', fontSize:11 }}>{inv.plan_id} · {inv.billing_cycle}</td>
                <td style={{ padding:'12px 14px', fontWeight:700 }}>{fmt(inv.amount)}</td>
                <td style={{ padding:'12px 14px' }}>
                  <span style={{ fontSize:11, fontWeight:700, color: inv.email_status==='sent'?'#10b981':inv.email_status==='failed'?'#ef4444':'#f59e0b', background: (inv.email_status==='sent'?'#10b981':inv.email_status==='failed'?'#ef4444':'#f59e0b')+'18', borderRadius:6, padding:'2px 8px' }}>
                    {inv.email_status}
                  </span>
                </td>
                <td style={{ padding:'12px 14px' }}>
                  {inv.zoho_invoice_url
                    ? <a href={inv.zoho_invoice_url} target="_blank" rel="noopener noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, color:'#2F6BFF', fontSize:11, fontWeight:700 }}><ExternalLink size={11}/> View</a>
                    : <span style={{ color:'#94a3b8', fontSize:11 }}>—</span>}
                </td>
                <td style={{ padding:'12px 14px', fontSize:11, color:'var(--tf-text-sub)' }}>{fmtDate(inv.created_at)}</td>
              </tr>
            ))}
            {invs.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--tf-text-sub)', fontSize:13 }}>No invoices yet. They'll appear automatically after first payment.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
