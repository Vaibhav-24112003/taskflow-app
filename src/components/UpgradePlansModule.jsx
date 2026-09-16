// src/components/UpgradePlansModule.jsx
// In-app Plans & Billing page — shown when signed-in user navigates to "Plans & Billing"
import { useEffect, useState } from 'react'
import CheckoutButton from './CheckoutButton.jsx'
import InvoiceDocument, { printInvoice } from './InvoiceDocument.jsx'

const fmt = p => '₹' + ((p || 0) / 100).toLocaleString('en-IN')
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function UpgradePlansModule({ org, supabase, cu, onUpgraded, defaultPlanId }) {
  const [plans, setPlans]   = useState([])
  const [sub,   setSub]     = useState(null)
  const [invs,  setInvs]    = useState([])
  const [billing, setBilling] = useState('yearly')
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [viewInv, setViewInv] = useState(null)

  useEffect(() => { load() }, [org?.id])

  async function load() {
    setLoading(true)
    const [pr, sr, ir, per, ps] = await Promise.all([
      supabase.from('plans').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('subscriptions').select('*, plans(name,price_monthly,price_yearly)').eq('org_id', org.id).maybeSingle(),
      supabase.from('subscription_invoices').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('payment_events').select('id, razorpay_payment_id').eq('org_id', org.id),
      supabase.from('platform_settings').select('default_billing_cycle').eq('id', 1).maybeSingle()
    ])
    if (ps.data?.default_billing_cycle) setBilling(ps.data.default_billing_cycle)
    const payRef = Object.fromEntries((per.data || []).map(p => [p.id, p.razorpay_payment_id]))
    setPlans(pr.data || [])
    setSub(sr.data)
    setInvs((ir.data || []).map(i => ({ ...i, payment_ref: payRef[i.payment_event_id] || '' })))
    setLoading(false)
  }

  function openInvoice(inv) {
    const plan = plans.find(p => p.id === inv.plan_id)
    setViewInv({ ...inv, plan_name: plan?.name || inv.plan_id })
  }

  const check = <span style={{ color: '#10b981', marginRight: 6 }}>✓</span>
  const cross  = <span style={{ color: '#94a3b8', marginRight: 6 }}>○</span>

  const STATUS_COLOR = { active: '#10b981', trialing: '#6366f1', past_due: '#ef4444', cancelled: '#94a3b8', paused: '#f59e0b' }

  if (success) return (
    <div style={{ padding: 48, textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
      <h2 style={{ margin: '0 0 10px', color: 'var(--tf-text)', fontWeight: 800 }}>You're all set!</h2>
      <p style={{ color: 'var(--tf-text-sub)', fontSize: 14, marginBottom: 24 }}>
        Your plan is now active. A payment receipt has been sent to your registered email.
      </p>
      <button onClick={() => { load(); setSuccess(false); onUpgraded?.() }}
        style={{ background: 'linear-gradient(135deg,#2F6BFF,#14C7C0)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 28px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        Go to dashboard →
      </button>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Inter,system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: 'var(--tf-text)' }}>Plans & Billing</h2>
        <p style={{ margin: 0, color: 'var(--tf-text-sub)', fontSize: 13 }}>
          Manage your TaskFlowCo subscription · Payments via Razorpay · Receipts by email.
        </p>
        {defaultPlanId && (
          <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)',
            borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#059669', fontWeight: 600 }}>
            <span>✓</span> You selected the <b style={{textTransform:'capitalize'}}>{defaultPlanId}</b> plan — complete your purchase below
          </div>
        )}
      </div>

      {/* Current subscription */}
      {sub && (
        <div style={{ background: 'linear-gradient(135deg,rgba(47,107,255,.07),rgba(20,199,192,.05))', border: '1px solid rgba(47,107,255,.18)', borderRadius: 16, padding: '20px 24px', marginBottom: 28, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#2F6BFF', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Current Plan</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tf-text)' }}>{sub.plans?.name || sub.plan_id}</div>
            <div style={{ fontSize: 12, color: 'var(--tf-text-sub)', marginTop: 4 }}>
              {fmt(sub.plans?.price_monthly)}/mo · {sub.billing_cycle === 'yearly' ? 'Billed yearly' : 'Billed monthly'}
              {sub.discount_pct > 0 && <span style={{ marginLeft: 8, color: '#d97706', fontWeight: 700 }}>{sub.discount_pct}% discount</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: STATUS_COLOR[sub.status] || '#94a3b8', background: (STATUS_COLOR[sub.status] || '#94a3b8') + '18', borderRadius: 8, padding: '4px 12px', display: 'inline-block', marginBottom: 6 }}>
              {sub.status}
            </span>
            <div style={{ fontSize: 11, color: 'var(--tf-text-sub)' }}>
              {sub.status === 'trialing' ? `Trial ends ${fmtDate(sub.trial_ends_at)}` : `Renews ${fmtDate(sub.current_period_end)}`}
            </div>
          </div>
        </div>
      )}

      {/* Billing toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', background: 'var(--tf-surface)', border: '1px solid var(--tf-border)', borderRadius: 99, padding: 4, gap: 4 }}>
          {['monthly', 'yearly'].map(c => (
            <button key={c} onClick={() => setBilling(c)} style={{
              border: 'none', cursor: 'pointer', borderRadius: 99, padding: '8px 20px', fontSize: 13, fontWeight: 700,
              background: billing === c ? 'linear-gradient(135deg,#2F6BFF,#14C7C0)' : 'transparent',
              color: billing === c ? '#fff' : 'var(--tf-text-sub)', transition: 'all .15s', fontFamily: 'inherit'
            }}>
              {c === 'monthly' ? 'Monthly' : 'Yearly'}
              {c === 'yearly' && <span style={{ fontSize: 9, fontWeight: 800, marginLeft: 6, background: billing === 'yearly' ? 'rgba(255,255,255,.2)' : 'rgba(20,199,192,.15)', color: billing === 'yearly' ? '#fff' : '#0EA5A0', borderRadius: 99, padding: '2px 7px' }}>Save 2 months</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      {loading
        ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--tf-text-sub)' }}>Loading plans…</div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 36 }}>
            {plans.map(plan => {
              const price = billing === 'yearly' ? plan.price_yearly : plan.price_monthly
              const monthlyEquiv = billing === 'yearly' ? Math.round(plan.price_yearly / 12) : plan.price_monthly
              const isCurrent = sub?.plan_id === plan.id
              const isFeatured = plan.is_featured

              return (
                <div key={plan.id} style={{
                  border: `${(defaultPlanId === plan.id || isFeatured) ? 2 : 1}px solid ${defaultPlanId === plan.id ? '#10b981' : isFeatured ? '#2F6BFF' : 'var(--tf-border)'}`,
                  borderRadius: 18, padding: 24, background: 'var(--tf-panel)', position: 'relative',
                  boxShadow: defaultPlanId === plan.id ? '0 8px 32px rgba(16,185,129,.18)' : isFeatured ? '0 8px 32px rgba(47,107,255,.12)' : 'none'
                }}>
                  {isFeatured && <div style={{ position: 'absolute', top: -12, left: 24, background: 'linear-gradient(135deg,#2F6BFF,#14C7C0)', color: '#fff', borderRadius: 20, padding: '3px 14px', fontSize: 10, fontWeight: 800 }}>⭐ Most Popular</div>}
                  {plan.badge && <div style={{ position: 'absolute', top: isFeatured ? 20 : -12, right: 20, background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '3px 12px', fontSize: 10, fontWeight: 800 }}>{plan.badge}</div>}
                  {plan.offer_label && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', color: '#d97706', borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>🏷 {plan.offer_label}</div>}

                  <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--tf-text)' }}>{plan.name}</h3>
                  <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--tf-text-sub)', lineHeight: 1.5 }}>{plan.description}</p>

                  <div style={{ margin: '0 0 4px' }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: '#2F6BFF', letterSpacing: '-.03em' }}>{fmt(billing === 'yearly' && plan.price_monthly > 0 ? price : monthlyEquiv)}</span>
                    <span style={{ fontSize: 12, color: 'var(--tf-text-sub)' }}>{billing === 'yearly' && plan.price_monthly > 0 ? '/yr' : '/mo'}</span>
                  </div>
                  {billing === 'yearly' && plan.price_monthly > 0 && <div style={{ fontSize: 11, color: 'var(--tf-text-sub)', marginBottom: 16 }}>One payment for 12 months · {fmt(monthlyEquiv)}/mo — 2 months free</div>}
                  {billing === 'monthly' && <div style={{ fontSize: 11, color: 'var(--tf-text-sub)', marginBottom: 16 }}>Billed monthly · switch to yearly to save</div>}

                  <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(plan.features || []).map((f, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--tf-text-sub)' }}>{check}{f}</li>
                    ))}
                  </ul>

                  {isCurrent
                    ? <div style={{ textAlign: 'center', padding: '11px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 10, color: '#10b981', fontSize: 13, fontWeight: 700 }}>✓ Current plan</div>
                    : plan.id === 'enterprise'
                      ? <button onClick={() => window.open('mailto:sales@taskflowco.in?subject=Enterprise Plan – ' + org.name, '_blank')}
                          style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid var(--tf-border)', borderRadius: 10, color: 'var(--tf-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Contact sales →
                        </button>
                      : <CheckoutButton
                          orgId={org.id}
                          planId={plan.id}
                          billingCycle={billing}
                          label={`Upgrade to ${plan.name} →`}
                          onSuccess={() => { setSuccess(true); load() }}
                        />
                  }
                </div>
              )
            })}
          </div>
      }

      {/* Invoice history */}
      {invs.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, color: 'var(--tf-text)' }}>Invoice History</h3>
          <div style={{ border: '1px solid var(--tf-border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 80px', padding: '10px 16px', background: 'var(--tf-surface)', borderBottom: '1px solid var(--tf-border)', fontSize: 10, fontWeight: 800, color: 'var(--tf-text-sub)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <div>Invoice</div><div>Plan</div><div>Amount</div><div>Date</div><div></div>
            </div>
            {invs.map(inv => (
              <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 80px', padding: '12px 16px', borderBottom: '1px solid var(--tf-border)', fontSize: 13, alignItems: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--tf-text)' }}>{inv.invoice_number}</div>
                <div style={{ color: 'var(--tf-text-sub)' }}>{inv.plan_id} · {inv.billing_cycle}</div>
                <div style={{ fontWeight: 700, color: 'var(--tf-text)' }}>{fmt(inv.amount)}</div>
                <div style={{ color: 'var(--tf-text-sub)', fontSize: 11 }}>{fmtDate(inv.created_at)}</div>
                <button onClick={() => openInvoice(inv)} style={{ padding: '5px 10px', background: 'rgba(47,107,255,.1)', border: '1px solid rgba(47,107,255,.3)', borderRadius: 8, color: '#2F6BFF', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>View</button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--tf-text-sub)', marginTop: 10 }}>
            A payment receipt is sent automatically to your registered email after every payment.
          </p>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--tf-text-sub)', marginTop: 24, textAlign: 'center' }}>
        All prices in ₹ · Payments secured by Razorpay · Cancel anytime
      </p>

      {viewInv && (
        <div onClick={() => setViewInv(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 800, margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
              <button onClick={() => printInvoice('Invoice ' + (viewInv.invoice_number || ''))} style={{ padding: '9px 16px', background: '#2F6BFF', border: 'none', borderRadius: 9, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>🖨 Print / Save as PDF</button>
              <button onClick={() => setViewInv(null)} style={{ padding: '9px 16px', background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 9, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Close</button>
            </div>
            <InvoiceDocument invoice={viewInv} org={{ name: org?.name, address: org?.address || '' }} owner={{ name: cu?.name || cu?.user_metadata?.full_name || '' }} />
          </div>
        </div>
      )}
    </div>
  )
}
