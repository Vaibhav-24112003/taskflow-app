// src/lib/authStateListener.js
import { supabase } from "./supabase.js";

const PROBE_IP_URL = "https://ipapi.co/json/";
let cachedGeo = null;

async function probeGeo() {
  if (cachedGeo) return cachedGeo;
  try {
    const r = await fetch(PROBE_IP_URL, { credentials: "omit" });
    if (!r.ok) return null;
    const j = await r.json();
    cachedGeo = { ip: j.ip, city: j.city, country: j.country_name };
    return cachedGeo;
  } catch { return null; }
}

async function logAuthEvent(user_id, event) {
  if (!user_id) return;
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

export async function bootBlockedCheck(onBlocked) {
  const { data: { user } } = await supabase.auth.getUser();
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
      await logAuthEvent(uid, "sign_in_blocked");
      await supabase.auth.signOut();
      onBlocked?.(blocked);
      return true;
    }
    await logAuthEvent(uid, "sign_in");
  } else if (event === "SIGNED_OUT") {
    await logAuthEvent(uid, "sign_out");
  } else if (event === "TOKEN_REFRESHED") {
    await logAuthEvent(uid, "session_refresh");
  }
  return false;
}
