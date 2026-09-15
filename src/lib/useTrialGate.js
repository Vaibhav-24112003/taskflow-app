// src/lib/useTrialGate.js
import { useMemo } from "react";

const DAY = 24 * 60 * 60 * 1000;

// Modules a firm may use during an active trial (mirrors the DB `trial` plan).
// Trials get full-plan module access; access is time-boxed by trial expiry, not
// by module. `portal` stays paid-only (matches the trial plan's module set).
export const TRIAL_MODULES = ["library", "team", "chat", "analytics", "comms", "billing"];

// Resource limits are read from organizations.plan_limits (copied from the plan
// on purchase, admin-editable per org). null / missing / -1 => unlimited.
// The DB triggers are the tamper-proof enforcement; these helpers are for UI.
function limitFor(org, key) {
  const raw = org?.plan_limits?.[key];
  if (raw === undefined || raw === null || raw === "") return null; // unlimited
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null; // -1 / bad value => unlimited
  return n;
}

export function useTrialGate(org) {
  return useMemo(() => {
    const limits = org?.plan_limits ?? {};
    const base = {
      limits,
      limitFor: (k) => limitFor(org, k),
    };

    if (!org) {
      return {
        ...base,
        status: "loading", daysLeft: null, bannerLevel: null,
        writesAllowed: false, hasModule: () => false,
      };
    }

    const status = org.subscription_status;
    const expiresAt = org.trial_expires_at ? new Date(org.trial_expires_at) : null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / DAY) : null;
    const paid = new Set(org.paid_modules ?? []);

    if (status === "paid") {
      return {
        ...base,
        status, daysLeft: null, bannerLevel: null,
        writesAllowed: true,
        hasModule: (m) => paid.has(m),
      };
    }

    if (status === "suspended" || status === "cancelled") {
      return {
        ...base,
        status, daysLeft, bannerLevel: "expired",
        writesAllowed: false,
        hasModule: () => false,
      };
    }

    const expired = status === "expired" || (daysLeft !== null && daysLeft <= 0);
    let bannerLevel = null;
    if (expired)                  bannerLevel = "expired";
    else if (daysLeft <= 7)       bannerLevel = "critical";
    else if (daysLeft <= 30)      bannerLevel = "warning";

    // Active trial: full trial-plan modules (plus anything explicitly granted).
    // Expired trial: everything locks until they subscribe.
    const trialModules = new Set([...TRIAL_MODULES, ...paid]);

    return {
      ...base,
      status: expired ? "expired" : "trial",
      daysLeft,
      bannerLevel,
      writesAllowed: !expired,
      hasModule: (m) => (expired ? false : trialModules.has(m)),
    };
  }, [org]);
}
