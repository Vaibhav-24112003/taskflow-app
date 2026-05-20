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
      cta: "Renew · ₹48,000/yr", dismissable: false },
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

export function ModuleLock({ module, onContactSales, onBack }) {
  const cfg = {
    comms:   { title: "Comms", tagline: "Reach 1,000 clients in one go.", price: "From ₹2,000/month" },
    billing: { title: "Billing", tagline: "GST-ready invoicing your accountant won't curse at.", price: "From ₹2,500/month" },
    portal:  { title: "Client Portal", tagline: "Let clients see status and upload documents themselves.", price: "From ₹1,500/month" },
  }[module] ?? { title: module, tagline: "Paid add-on for TaskFlow.", price: "Contact sales" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "var(--tf-overlay)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900 }}
      onClick={(e) => { if (e.target === e.currentTarget) onBack?.(); }}
    >
      <div style={{ width: 520, maxWidth: "calc(100vw - 32px)", background: "var(--tf-panel)", border: "1px solid var(--tf-border-hov)", borderRadius: 16, padding: "28px 32px", boxShadow: "0 24px 64px var(--tf-shadow-lg)" }}>
        {/* Header row with back button */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--tf-accent)", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>{cfg.title} · paid module</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, color: "var(--tf-text)" }}>{cfg.tagline}</div>
          </div>
          {onBack && (
            <button onClick={onBack}
              style={{ flexShrink: 0, marginLeft: 16, padding: "6px 10px", fontSize: 18, lineHeight: 1, background: "transparent", color: "var(--tf-text-sub)", border: "1px solid var(--tf-border)", borderRadius: 8, cursor: "pointer" }}
              title="Go back">
              ✕
            </button>
          )}
        </div>
        <div style={{ fontSize: 14, color: "var(--tf-text-sub)", lineHeight: 1.6, marginBottom: 20 }}>
          This module isn't included in your current plan. Talk to our team and we'll have you up in 24 hours.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {onBack && (
            <button onClick={onBack}
              style={{ padding: "11px 18px", fontSize: 13, fontWeight: 600, background: "transparent", color: "var(--tf-text-sub)", border: "1px solid var(--tf-border)", borderRadius: 9, cursor: "pointer" }}>
              ← Go back
            </button>
          )}
          <button onClick={onContactSales}
            style={{ flex: 1, padding: "11px 18px", fontSize: 13, fontWeight: 700, background: "var(--tf-accent)", color: "#fff", border: 0, borderRadius: 9, cursor: "pointer" }}>
            Talk to sales · 15 min call
          </button>
        </div>
        <div className="mono" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--tf-border)", fontSize: 11, color: "var(--tf-text-mut)", textAlign: "center" }}>
          {cfg.price} · billed annually
        </div>
      </div>
    </div>
  );
}
