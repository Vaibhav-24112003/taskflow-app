// src/admin/OrgsAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";

const ALL_MODULES = [
  { key: "comms",   label: "Comms",   price: "₹2,000/mo" },
  { key: "billing", label: "Billing", price: "₹2,500/mo" },
  { key: "portal",  label: "Client Portal", price: "₹1,500/mo" },
];

export default function OrgsAdmin() {
  const [orgs, setOrgs]         = useState([]);
  const [q, setQ]               = useState("");
  const [filter, setFilter]     = useState("all");
  const [editing, setEditing]   = useState(null);
  const [limitsOrg, setLimitsOrg] = useState(null);
  const [loading, setLoading]   = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("admin_org_overview")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setOrgs(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orgs.filter(o => {
      if (filter !== "all" && o.subscription_status !== filter) return false;
      if (!needle) return true;
      return (o.name ?? "").toLowerCase().includes(needle);
    });
  }, [orgs, q, filter]);

  async function extendTrial(org, days, reason) {
    const newExpiry = new Date(Math.max(Date.now(), new Date(org.trial_expires_at ?? 0).getTime()) + days * 86_400_000);
    const { error } = await supabase
      .from("organizations")
      .update({ trial_expires_at: newExpiry.toISOString() })
      .eq("id", org.id);
    if (error) { alert(error.message); return; }
    await supabase.from("org_events").insert({
      org_id: org.id, event: "trial.extended", metadata: { days, reason, new_expires_at: newExpiry.toISOString() },
    });
    await load();
    setEditing(null);
  }

  async function toggleModule(org, key) {
    const has = (org.paid_modules ?? []).includes(key);
    const next = has
      ? (org.paid_modules ?? []).filter(m => m !== key)
      : [...(org.paid_modules ?? []), key];
    await supabase.from("organizations").update({ paid_modules: next }).eq("id", org.id);
    await supabase.from("org_events").insert({
      org_id: org.id,
      event:  has ? "module.revoked" : "module.granted",
      metadata: { module: key },
    });
    await load();
  }

  async function saveLimits(org, limits) {
    // limits === null clears the per-org override (everything unlimited).
    const { error } = await supabase
      .from("organizations")
      .update({ plan_limits: limits })
      .eq("id", org.id);
    if (error) { alert(error.message); return; }
    await supabase.from("org_events").insert({
      org_id: org.id, event: "limits.updated", metadata: { limits },
    });
    await load();
    setLimitsOrg(null);
  }

  async function setStatus(org, status) {
    if (!confirm(`Set ${org.name} → ${status}?`)) return;
    await supabase.from("organizations").update({ subscription_status: status }).eq("id", org.id);
    await supabase.from("org_events").insert({
      org_id: org.id, event: `subscription.${status}`, metadata: {},
    });
    await load();
  }

  if (loading) return <div style={{ padding: 32, color: "var(--tf-text-sub)" }}>Loading…</div>;

  const stats = {
    total:     orgs.length,
    paid:      orgs.filter(o => o.subscription_status === "paid").length,
    trial:     orgs.filter(o => o.subscription_status === "trial").length,
    expired:   orgs.filter(o => ["expired", "suspended", "cancelled"].includes(o.subscription_status)).length,
  };

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--tf-text-sub)", letterSpacing: ".12em", textTransform: "uppercase" }}>ADMIN · ORGANISATIONS</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 0" }}>All orgs</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by org name…"
            style={{ padding: "9px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)", borderRadius: 8, fontSize: 13, color: "var(--tf-text)", width: 240 }}/>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ padding: "9px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)", borderRadius: 8, fontSize: 13 }}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="trial">Trial</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </header>

      <div style={{ display: "flex", gap: 10 }}>
        <Stat label="Total orgs"        value={stats.total}/>
        <Stat label="Paid"              value={stats.paid}    color="#10b981"/>
        <Stat label="In trial"          value={stats.trial}   color="#f59e0b"/>
        <Stat label="Expired/suspended" value={stats.expired} color="#ef4444"/>
      </div>

      <div style={{ border: "1px solid var(--tf-border)", borderRadius: 12, background: "var(--tf-surface)", overflow: "hidden" }}>
        <div className="mono" style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 1fr 1.4fr 0.7fr", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--tf-border)", background: "rgba(0,0,0,.15)", fontSize: 10, color: "var(--tf-text-mut)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
          <div>Org</div><div>Status</div><div>Members</div><div>Trial expires</div><div>Paid modules</div><div style={{ textAlign: "right" }}>Actions</div>
        </div>
        <div style={{ maxHeight: 560, overflow: "auto" }}>
          {filtered.map(o => <OrgRow key={o.id} org={o}
            onExtend={() => setEditing(o)}
            onLimits={() => setLimitsOrg(o)}
            onModule={k => toggleModule(o, k)}
            onSuspend={() => setStatus(o, "suspended")}
            onMarkPaid={() => setStatus(o, "paid")}/>)}
        </div>
      </div>

      {editing && (
        <ExtendDialog org={editing}
          onCancel={() => setEditing(null)}
          onConfirm={(days, reason) => extendTrial(editing, days, reason)}/>
      )}

      {limitsOrg && (
        <LimitsDialog org={limitsOrg}
          onCancel={() => setLimitsOrg(null)}
          onSave={(limits) => saveLimits(limitsOrg, limits)}/>
      )}
    </div>
  );
}

function LimitsDialog({ org, onCancel, onSave }) {
  const cur = org.plan_limits || {};
  const [users, setUsers]           = useState(cur.users ?? "");
  const [clients, setClients]       = useState(cur.clients ?? "");
  const [workspaces, setWorkspaces] = useState(cur.workspaces ?? "");

  const build = () => {
    const out = {};
    [["users", users], ["clients", clients], ["workspaces", workspaces]].forEach(([k, v]) => {
      if (v === "" || v === null || v === undefined) return;   // blank => unlimited (omit)
      const n = Math.trunc(Number(v));
      if (Number.isFinite(n)) out[k] = n;
    });
    return out;
  };

  const rows = [
    ["Team members", users, setUsers, org.member_count],
    ["Clients",      clients, setClients, org.client_count],
    ["Workspaces",   workspaces, setWorkspaces, org.workspace_count],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ width: 520, background: "rgba(11,15,28,.97)", border: "1px solid var(--tf-border-hov)", borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--tf-border)" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Plan limits · {org.name}</div>
          <div style={{ fontSize: 12, color: "var(--tf-text-sub)", marginTop: 3 }}>
            Enforced tamper-proof at the database. Blank or -1 = unlimited. This override replaces the plan's limits for this org.
          </div>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(([label, val, setVal, used]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 13 }}>
                {label}
                <span className="mono" style={{ fontSize: 11, color: "var(--tf-text-mut)", marginLeft: 8 }}>
                  in use: {used ?? "—"}
                </span>
              </div>
              <input type="number" min="-1" step="1" value={val} onChange={e => setVal(e.target.value)}
                placeholder="∞"
                style={{ padding: "9px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)", borderRadius: 8, fontSize: 13, color: "var(--tf-text)" }}/>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--tf-border)", display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button onClick={() => onSave(null)} style={{ ...miniBtn("#ef4444"), padding: "9px 14px" }} title="Remove override — org becomes unlimited">
            Clear override
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={{ ...miniBtn("transparent"), color: "var(--tf-text-sub)", border: "1px solid var(--tf-border)", padding: "9px 16px" }}>Cancel</button>
            <button onClick={() => onSave(build())} style={{ ...miniBtn("var(--tf-accent)"), background: "var(--tf-accent)", color: "#fff", border: "1px solid var(--tf-accent)", padding: "9px 16px" }}>Save limits</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color = "var(--tf-accent)" }) {
  return (
    <div style={{ flex: 1, padding: "14px 16px", background: "var(--tf-surface)", border: "1px solid var(--tf-border)", borderRadius: 10 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tf-text-mut)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color, letterSpacing: "-.02em" }}>{value}</div>
    </div>
  );
}

function OrgRow({ org, onExtend, onLimits, onModule, onSuspend, onMarkPaid }) {
  const c = ({ paid: "#10b981", trial: "#f59e0b", expired: "#ef4444", suspended: "#ef4444", cancelled: "#5c6b87" })[org.subscription_status] ?? "#5c6b87";
  const expiry = org.trial_expires_at ? new Date(org.trial_expires_at) : null;
  const daysLeft = expiry ? Math.ceil((expiry - Date.now()) / 86_400_000) : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 1fr 1.4fr 0.7fr", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--tf-border)", alignItems: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{org.name}</div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: c, fontWeight: 600, textTransform: "capitalize" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }}/>{org.subscription_status}
      </span>
      <div style={{ fontSize: 12, color: "var(--tf-text-sub)" }}>{org.member_count}</div>
      <div className="mono" style={{ fontSize: 12, color: c }}>
        {expiry ? expiry.toLocaleDateString("en-IN") : "—"}
        {daysLeft !== null && org.subscription_status === "trial" && ` · ${daysLeft}d`}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {ALL_MODULES.map(m => {
          const on = (org.paid_modules ?? []).includes(m.key);
          return (
            <button key={m.key} onClick={() => onModule(m.key)}
              style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 5, fontWeight: 600,
                background: on ? "rgba(107,140,173,.18)" : "var(--tf-input)",
                color:      on ? "var(--tf-accent)"     : "var(--tf-text-mut)",
                border: `1px solid ${on ? "rgba(107,140,173,.35)" : "var(--tf-border)"}`,
                cursor: "pointer",
              }}>
              {on ? "✓ " : "+ "}{m.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={onExtend}   style={miniBtn("var(--tf-accent)")}>Extend</button>
        <button onClick={onLimits}   style={miniBtn("#14C7C0")}>Limits</button>
        {org.subscription_status !== "paid" &&
          <button onClick={onMarkPaid} style={miniBtn("#10b981")}>Paid</button>}
        {org.subscription_status !== "suspended" &&
          <button onClick={onSuspend}  style={miniBtn("#ef4444")}>Suspend</button>}
      </div>
    </div>
  );
}

function ExtendDialog({ org, onCancel, onConfirm }) {
  const [days, setDays]     = useState(30);
  const [reason, setReason] = useState("");
  const base = org.trial_expires_at ? new Date(org.trial_expires_at) : new Date();
  const next = new Date(Math.max(Date.now(), base.getTime()) + days * 86_400_000);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ width: 560, background: "rgba(11,15,28,.97)", border: "1px solid var(--tf-border-hov)", borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--tf-border)" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Extend trial · {org.name}</div>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[15, 30, 90, 180].map(d => (
              <button key={d} onClick={() => setDays(d)}
                style={{
                  padding: "10px 8px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                  background: days === d ? "rgba(107,140,173,.18)" : "var(--tf-input)",
                  color:      days === d ? "var(--tf-accent)"     : "var(--tf-text)",
                  border: `1px solid ${days === d ? "rgba(107,140,173,.35)" : "var(--tf-border)"}`,
                }}>+{d} days</button>
            ))}
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10, color: "var(--tf-text-mut)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, marginBottom: 6 }}>New expiry</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "#10b981", padding: "10px 12px", background: "var(--tf-input)", borderRadius: 8 }}>
              {next.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason / Intercom ticket"
            style={{ padding: "10px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)", borderRadius: 8, fontSize: 13, color: "var(--tf-text)" }}/>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--tf-border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...miniBtn("transparent"), color: "var(--tf-text-sub)", border: "1px solid var(--tf-border)", padding: "9px 16px" }}>Cancel</button>
          <button onClick={() => onConfirm(days, reason)} style={{ ...miniBtn("var(--tf-accent)"), background: "var(--tf-accent)", color: "#fff", border: "1px solid var(--tf-accent)", padding: "9px 16px" }}>Extend trial</button>
        </div>
      </div>
    </div>
  );
}

const miniBtn = c => ({
  padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
  background: `${c}1f`, color: c, border: `1px solid ${c}55`,
});
