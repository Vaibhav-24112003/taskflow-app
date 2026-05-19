// src/lib/useTrialGate.js
import { useMemo } from "react";

const DAY = 24 * 60 * 60 * 1000;

export function useTrialGate(org) {
  return useMemo(() => {
    if (!org) {
      return {
        status: "loading", daysLeft: null, bannerLevel: null,
        writesAllowed: false, hasModule: () => false,
      };
    }

    const status = org.subscription_status;
    const expiresAt = org.trial_expires_at ? new Date(org.trial_expires_at) : null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / DAY) : null;
    const modules = new Set(org.paid_modules ?? []);

    if (status === "paid") {
      return {
        status, daysLeft: null, bannerLevel: null,
        writesAllowed: true,
        hasModule: (m) => modules.has(m),
      };
    }

    if (status === "suspended" || status === "cancelled") {
      return {
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

    return {
      status: expired ? "expired" : "trial",
      daysLeft,
      bannerLevel,
      writesAllowed: !expired,
      hasModule: (m) => modules.has(m),
    };
  }, [org]);
}
