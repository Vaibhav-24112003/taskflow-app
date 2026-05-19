// src/lib/authStateListener.js
import { supabase } from "./supabase.js";

const PROBE_IP_URL = "https://ipapi.co/json/";
let cachedGeo = null;

async function probeGeo() {
  if (cachedGeo) return cachedGeo;
  try {
    // Hard 2s timeout — the IP probe must NEVER block an auth-state callback.
    // Supabase's GoTrue holds the auth lock during the callback and warns
    // (then forcefully recovers) after 5s.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(PROBE_IP_URL, { credentials: "omit", signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    cachedGeo = { ip: j.ip, city: j.city, country: j.country_name };
    return cachedGeo;
  } catch { return null; }
}

// Fire-and-forget — never awaited from auth-state callbacks so we don't hold
// the GoTrue auth lock. If probeGeo or the insert is slow, that's fine.
function logAuthEvent(user_id, event) {
  if (!user_id) return;
  (async () => {
    const geo = await probeGeo();
    try {
      await supabase.from("auth_events").insert({
        user_id,
        event,
        user_agent: navigator.userAgent,
        ip:         geo?.ip ?? null,
        city:       geo?.city ?? null,
        country:    geo?.country ?? null,
      });
    } catch (e) {
      console.warn("auth_events insert failed", e);
    }
  })();
}

export async function checkBlocked(user_id) {
  if (!user_id) return null;
  const { data } = await supabase
    .from("profiles")
    .select("is_blocked, blocked_reason")
    .eq("id", user_id)
    .single();
  return data?.is_blocked ? data : null;
}

// IMPORTANT: pass the already-resolved user (from supabase.auth.getSession())
// — calling supabase.auth.getUser() here would race the main getSession()
// call and steal the auth lock, leaving the client unauthenticated.
export async function bootBlockedCheck(user, onBlocked) {
  if (!user) return;
  const blocked = await checkBlocked(user.id);
  if (blocked) {
    await supabase.auth.signOut();
    onBlocked?.(blocked);
  }
}

export async function handleAuthEvent(event, session, onBlocked) {
  const uid = session?.user?.id;

  if (event === "SIGNED_IN") {
    const blocked = await checkBlocked(uid);
    if (blocked) {
      logAuthEvent(uid, "sign_in_blocked");  // fire-and-forget
      await supabase.auth.signOut();
      onBlocked?.(blocked);
      return true;
    }
    logAuthEvent(uid, "sign_in");  // fire-and-forget
  } else if (event === "SIGNED_OUT") {
    logAuthEvent(uid, "sign_out");
  } else if (event === "TOKEN_REFRESHED") {
    logAuthEvent(uid, "session_refresh");
  }
  return false;
}
