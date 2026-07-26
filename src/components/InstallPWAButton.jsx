import { useEffect, useState } from "react";

// "Install app" affordance for the PWA.
// - Android/desktop Chrome/Edge: fires the captured beforeinstallprompt.
// - iOS Safari (no prompt API): shows Add-to-Home-Screen instructions.
// - Hidden once the app is already installed / running standalone.
function isStandalone() {
  return (
    (typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && navigator.standalone === true)
  );
}
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/mac/i.test(navigator.platform || "") && navigator.maxTouchPoints > 1)
  );
}

export default function InstallPWAButton({ variant = "pill", style = {} }) {
  const [canPrompt, setCanPrompt] = useState(
    typeof window !== "undefined" && !!window.__tfInstallPrompt
  );
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setIos(isIOS() && !isStandalone());
    function onInstallable() { setCanPrompt(true); }
    function onInstalled() { setCanPrompt(false); setInstalled(true); }
    window.addEventListener("tf-installable", onInstallable);
    window.addEventListener("tf-installed", onInstalled);
    return () => {
      window.removeEventListener("tf-installable", onInstallable);
      window.removeEventListener("tf-installed", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!canPrompt && !ios) return null; // nothing to offer on this browser

  async function onClick() {
    if (canPrompt && window.__tfInstallPrompt) {
      const e = window.__tfInstallPrompt;
      window.__tfInstallPrompt = null;
      setCanPrompt(false);
      try {
        e.prompt();
        await e.userChoice;
      } catch (_) {}
      return;
    }
    if (ios) setShowIosHelp(true);
  }

  const base =
    variant === "pill"
      ? {
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          borderRadius: 999,
          border: "none",
          background: "linear-gradient(135deg,#2F6BFF,#14C7C0)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: "0 6px 18px rgba(47,107,255,0.28)",
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid rgba(47,107,255,0.35)",
          background: "rgba(47,107,255,0.08)",
          color: "#2F6BFF",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
        };

  const icon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );

  return (
    <>
      <button onClick={onClick} style={{ ...base, ...style }} title="Install the TaskFlowCo app">
        {icon}
        Install app
      </button>
      {showIosHelp && (
        <div
          onClick={() => setShowIosHelp(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(6,16,30,0.55)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", color: "#0E2A47", borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif" }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Install on iPhone / iPad</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "#3b4a63" }}>
              <li>Tap the <b>Share</b> button in Safari <span style={{ opacity: 0.7 }}>(the square with an ↑)</span>.</li>
              <li>Scroll and tap <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b> — TaskFlowCo appears on your home screen.</li>
            </ol>
            <button onClick={() => setShowIosHelp(false)} style={{ marginTop: 16, width: "100%", background: "linear-gradient(135deg,#2F6BFF,#14C7C0)", border: "none", borderRadius: 10, padding: "11px 0", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
