// src/admin/UsersAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function UsersAdmin() {
  const [users, setUsers]       = useState([]);
  const [stats, setStats]       = useState(null);
  const [q, setQ]               = useState("");
  const [statusFilter, setSF]   = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    // Fetch user list — required
    const { data: rows, error: e1 } = await supabase
      .from("admin_user_overview")
      .select("*")
      .order("last_sign_in_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (e1) { setError(e1); setLoading(false); return; }
    setUsers(rows ?? []);

    // Fetch aggregate stats — optional, fail silently
    const { data: agg, error: e2 } = await supabase.rpc("admin_user_stats");
    if (!e2) setStats(Array.isArray(agg) ? agg[0] : agg);
    // If e2 (e.g. function missing / permission denied), stats panel just won't render

    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter(u => {
      if (statusFilter === "blocked" && !u.is_blocked) return false;
      if (statusFilter === "active"  && u.is_blocked) return false;
      if (!needle) return true;
      return (u.email ?? "").toLowerCase().includes(needle)
          || (u.full_name ?? "").toLowerCase().includes(needle);
    });
  }, [users, q, statusFilter]);

  async function blockUser(user, { reason, note }) {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/block-user`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ user_id: user.id, reason, note }),
    });
    if (!r.ok) { alert(`Block failed: ${(await r.json()).error}`); return; }
    await load();
    setSelected(null);
  }

  async function unblockUser(user) {
    if (!confirm(`Unblock ${user.email}?`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unblock-user`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ user_id: user.id }),
    });
    if (!r.ok) { alert(`Unblock failed: ${(await r.json()).error}`); return; }
    await load();
  }

  if (error) return <div style={{ padding: 32, color: "#ef4444" }}>Error: {String(error.message)}</div>;
  if (loading) return <div style={{ padding: 32, color: "var(--tf-text-sub)" }}>Loading…</div>;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: "var(--tf-text-sub)", letterSpacing: ".12em", textTransform: "uppercase" }}>ADMIN · USERS</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 0" }}>All users</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by email…"
            style={{ padding: "9px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)", borderRadius: 8, fontSize: 13, color: "var(--tf-text)", width: 240 }}
          />
          <select value={statusFilter} onChange={e => setSF(e.target.value)}
            style={{ padding: "9px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)", borderRadius: 8, fontSize: 13, color: "var(--tf-text)" }}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </header>

      {stats && (
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label="Total users"  value={stats.total}/>
          <Stat label="MAU (30d)"    value={stats.mau} color="#10b981"/>
          <Stat label="New (7d)"     value={stats.new_7d} color="#f59e0b"/>
          <Stat label="Blocked"      value={stats.blocked} color="#ef4444"/>
        </div>
      )}

      <UserTable users={filtered} onBlock={u => setSelected(u)} onUnblock={unblockUser}/>

      {selected && (
        <BlockDialog
          user={selected}
          onCancel={() => setSelected(null)}
          onConfirm={(reason, note) => blockUser(selected, { reason, note })}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color = "var(--tf-accent)" }) {
  return (
    <div style={{ flex: 1, padding: "14px 16px", background: "var(--tf-surface)", border: "1px solid var(--tf-border)", borderRadius: 10 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--tf-text-mut)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color, letterSpacing: "-.02em" }}>{value ?? "—"}</div>
    </div>
  );
}

function UserTable({ users, onBlock, onUnblock }) {
  return (
    <div style={{ border: "1px solid var(--tf-border)", borderRadius: 12, background: "var(--tf-surface)", overflow: "hidden" }}>
      <div className="mono" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.7fr 0.7fr 0.9fr 0.6fr", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--tf-border)", background: "rgba(0,0,0,.15)", fontSize: 10, color: "var(--tf-text-mut)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
        <div>User</div><div>Email</div><div>Status</div><div>Orgs</div><div>Last sign-in</div><div style={{ textAlign: "right" }}>Actions</div>
      </div>
      <div style={{ maxHeight: 520, overflow: "auto" }}>
        {users.map(u => (
          <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.7fr 0.7fr 0.9fr 0.6fr", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--tf-border)", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{u.full_name ?? "—"}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--tf-text-sub)" }}>{u.email}</div>
            <Dot status={u.is_blocked ? "blocked" : "active"}/>
            <div style={{ fontSize: 12, color: "var(--tf-text-sub)" }}>{u.org_count}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--tf-text-mut)" }}>
              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("en-IN") : "never"}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {u.is_blocked
                ? <button onClick={() => onUnblock(u)} style={btn("#10b981")}>Unblock</button>
                : <button onClick={() => onBlock(u)} style={btn("#ef4444")}>Block</button>}
            </div>
          </div>
        ))}
        {!users.length && <div style={{ padding: 24, textAlign: "center", color: "var(--tf-text-mut)", fontSize: 13 }}>No users match the filter.</div>}
      </div>
    </div>
  );
}

function Dot({ status }) {
  const c = status === "blocked" ? "#ef4444" : "#10b981";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: c, fontWeight: 600, textTransform: "capitalize" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }}/>{status}
    </span>
  );
}

function BlockDialog({ user, onCancel, onConfirm }) {
  const [reason, setReason] = useState("abuse");
  const [note, setNote]     = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ width: 540, background: "rgba(11,15,28,.97)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--tf-border)" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Block {user.full_name ?? user.email}?</div>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <select value={reason} onChange={e => setReason(e.target.value)} style={inputStyle}>
            <option value="abuse">Abuse / harassment</option>
            <option value="spam">Spam</option>
            <option value="chargeback">Chargeback / fraud</option>
            <option value="tos">ToS violation</option>
            <option value="other">Other</option>
          </select>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Internal note (optional)" style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}/>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--tf-border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btn("transparent"), color: "var(--tf-text-sub)", border: "1px solid var(--tf-border)" }}>Cancel</button>
          <button onClick={() => onConfirm(reason, note)} style={{ ...btn("#ef4444"), color: "#fff", border: "1px solid #ef4444", background: "#ef4444" }}>Block user</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px", background: "var(--tf-input)", border: "1px solid var(--tf-border)",
  borderRadius: 8, fontSize: 13, color: "var(--tf-text)", outline: "none",
};
const btn = (c) => ({
  padding: "9px 16px", fontSize: 13, fontWeight: 600,
  background: `${c}1f`, color: c, border: `1px solid ${c}55`, borderRadius: 8, cursor: "pointer",
});
