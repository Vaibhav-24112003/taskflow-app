// src/components/TrialBanner.jsx
import { useState } from "react";

export default function TrialBanner({ gate, org, onRenew }) {
  const [dismissed, setDismissed] = useState(false);
  if (!gate.bannerLevel) return null;
  if (gate.bannerLevel === "warning" && dismissed) return null;

  const cfg = {
    warning:  { color: "#6b8cad", bg: "rgba(107,140,173,.1)", border: "rgba(107,140,173,.3)", icon: "i",
      title: `Your free trial of ${org.name} ends in ${gate.daysLeft} days.`,
      sub: "Set up a renewal call to keep everything running — no card needed today.",
      cta: "Book renewal call", dismissable: true },
    critical: { color: "#f59e0b", bg: "rgba(245,158,11,.1)", border: "rgba(245,158,11,.3)", icon: "!",
      title: `Trial ends in ${gate.daysLeft} ${gate.daysLeft === 1 ? "day" : "days"} — your team will lose write access.`,
      sub: "You'll keep read-only access for 60 days after that. Renew now to avoid the lock.",
      cta: "Renew now", dismissable: false },
    expired:  { color: "#ef4444", bg: "rgba(239,68,68,.1)", border: "rgba(239,68,68,.3)", icon: "✕",
      title: `Your trial ended. ${org.name} is read-only.`,
      sub: "You can still browse and export data. New tasks, edits, and invoices are paused until you renew.",
      cta: "Reactivate", dismissable: false },
  }[gate.bannerLevel];

  return (
    <div style={{ padding: "12px 18px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 14, margin: "0 0 12px" }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.color}33`, color: cfg.color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>{cfg.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tf-text)" }}>{cfg.title}</div>
        <div style={{ fontSize: 12, color: "var(--tf-text-sub)", marginTop: 2 }}>{cfg.sub}</div>
      </div>
      <button onClick={onRenew}
        style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, background: cfg.color, color: "#fff", border: 0, borderRadius: 7, cursor: "pointer" }}>
        {cfg.cta}
      </button>
      {cfg.dismissable && (
        <button onClick={() => setDismissed(true)}
          style={{ padding: "8px 10px", fontSize: 11, background: "transparent", color: "var(--tf-text-sub)", border: 0, cursor: "pointer" }}>
          Dismiss
        </button>
      )}
    </div>
  );
}

export function ModuleLock({ module: moduleName, gate, onUpgrade, onContactSales, onBack }) {
  // Which plan unlocks this module
  const PLAN_UNLOCK = {
    library:   { plan: 'Starter', id: 'starter', color: '#2563eb' },
    team:      { plan: 'Starter', id: 'starter', color: '#2563eb' },
    chat:      { plan: 'Starter', id: 'starter', color: '#2563eb' },
    analytics: { plan: 'Pro',     id: 'pro',     color: '#7c3aed' },
    comms:     { plan: 'Pro',     id: 'pro',     color: '#7c3aed' },
    billing:   { plan: 'Pro',     id: 'pro',     color: '#7c3aed' },
    portal:    { plan: 'Enterprise', id: 'enterprise', color: '#0891b2' },
  }
  const unlock = PLAN_UNLOCK[moduleName] || { plan: 'Pro', id: 'pro', color: '#7c3aed' }

  const MODULE_INFO = {
    library:   { icon: '📚', title: 'Library',        tagline: 'Store credentials, SOPs and firm resources.' },
    team:      { icon: '👥', title: 'Team',            tagline: 'Attendance, logs and leave management.' },
    chat:      { icon: '💬', title: 'Team Chat',       tagline: 'Group messaging and threads for your team.' },
    analytics: { icon: '📊', title: 'Analytics',       tagline: 'Firm-wide performance and on-time reports.' },
    comms:     { icon: '📨', title: 'Communication',   tagline: 'Reach 1,000 clients in one go via email & WhatsApp.' },
    billing:   { icon: '🧾', title: 'Billing',         tagline: 'GST-ready invoicing your accountant will love.' },
    portal:    { icon: '🌐', title: 'Client Portal',   tagline: 'Let clients see status and upload documents.' },
  }
  const info = MODULE_INFO[moduleName] || { icon: '🔒', title: moduleName, tagline: 'Upgrade to access this module.' }

  const isPaid = gate?.status === 'paid'
  // If paid but module not included — they need a higher plan
  // If not paid — they need to subscribe

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(6px)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:900, padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onBack?.() }}
    >
      <div style={{ width:500, maxWidth:'calc(100vw - 32px)', background:'var(--tf-panel)',
        border:'1px solid var(--tf-border-hov)', borderRadius:20, padding:'32px 30px',
        boxShadow:'0 24px 64px rgba(0,0,0,.28)' }}>

        {/* Close */}
        {onBack && (
          <button onClick={onBack} style={{ position:'absolute', marginLeft:430, marginTop:-10,
            background:'transparent', border:'none', fontSize:20, color:'var(--tf-text-sub)', cursor:'pointer' }}>✕</button>
        )}

        {/* Icon + title */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:`${unlock.color}18`,
            border:`1px solid ${unlock.color}30`, display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:24, flexShrink:0 }}>
            {info.icon}
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:800, color:unlock.color, textTransform:'uppercase',
              letterSpacing:'.1em', marginBottom:3 }}>
              {info.title} · {unlock.plan} plan
            </div>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--tf-text)', lineHeight:1.2 }}>
              {info.tagline}
            </div>
          </div>
        </div>

        {/* Plan requirement badge */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
          background:`${unlock.color}0e`, border:`1px solid ${unlock.color}25`,
          borderRadius:12, marginBottom:18 }}>
          <span style={{ fontSize:18 }}>🔒</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--tf-text)' }}>
              {isPaid
                ? `${info.title} is included in the ${unlock.plan} plan and above`
                : `Upgrade to ${unlock.plan} to unlock ${info.title}`}
            </div>
            <div style={{ fontSize:11, color:'var(--tf-text-sub)', marginTop:2 }}>
              {isPaid
                ? `Your current plan doesn't include this module. Upgrade to ${unlock.plan} to continue.`
                : 'Start your subscription to unlock this and other powerful modules.'}
            </div>
          </div>
        </div>

        {/* What's included */}
        <div style={{ fontSize:11, color:'var(--tf-text-sub)', marginBottom:16 }}>
          {unlock.plan === 'Starter' && '✓ Library  ✓ Team management  ✓ Team Chat'}
          {unlock.plan === 'Pro' && '✓ Everything in Starter  ✓ Analytics  ✓ Communication  ✓ Billing'}
          {unlock.plan === 'Enterprise' && '✓ Everything in Pro  ✓ Client Portal  ✓ Unlimited users  ✓ Custom integrations'}
        </div>

        {/* CTAs */}
        <div style={{ display:'flex', gap:10 }}>
          {onBack && (
            <button onClick={onBack} style={{ padding:'11px 16px', fontSize:13, fontWeight:600,
              background:'transparent', color:'var(--tf-text-sub)', border:'1px solid var(--tf-border)',
              borderRadius:9, cursor:'pointer', flexShrink:0 }}>
              ← Back
            </button>
          )}
          <button
            onClick={() => onUpgrade ? onUpgrade(unlock.id) : onContactSales?.()}
            style={{ flex:1, padding:'12px 18px', fontSize:13, fontWeight:800,
              background:`linear-gradient(135deg,${unlock.color},${unlock.color}cc)`,
              color:'#fff', border:0, borderRadius:9, cursor:'pointer',
              boxShadow:`0 6px 20px ${unlock.color}40` }}>
            {onUpgrade ? `⚡ Upgrade to ${unlock.plan}` : 'Contact sales'}
          </button>
        </div>

        <p style={{ textAlign:'center', fontSize:10.5, color:'var(--tf-text-sub)', margin:'12px 0 0' }}>
          Plans start at ₹999/mo · Cancel anytime · GST invoice auto-emailed
        </p>
      </div>
    </div>
  )
}
