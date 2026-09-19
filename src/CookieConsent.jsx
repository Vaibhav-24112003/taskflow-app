// Minimal, DPDP-friendly cookie/consent notice. We use only strictly-necessary
// storage (sign-in + preferences), so this is a notice with a single acknowledge
// action rather than a tracking opt-in. Shown once, remembered in localStorage.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function CookieConsent() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem('tfc_cookie_ack') !== '1') setShow(true) } catch { setShow(true) }
  }, [])
  if (!show) return null
  const ack = () => { try { localStorage.setItem('tfc_cookie_ack', '1') } catch {} setShow(false) }
  return createPortal(
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 2147482000, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 640, background: '#0E2A47', color: '#EAF2FF', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, lineHeight: 1.55, color: '#C9DAF0' }}>
          We use only <b style={{ color: '#fff' }}>strictly necessary</b> cookies/local storage to keep you signed in and remember settings. No advertising or cross-site tracking. See our{' '}
          <a href="/privacy.html" style={{ color: '#7FB3FF', fontWeight: 700 }}>Privacy Policy</a>.
        </div>
        <button onClick={ack} style={{ flexShrink: 0, border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 800, color: '#0E2A47', background: 'linear-gradient(135deg,#2F6BFF,#14C7C0)', cursor: 'pointer', fontFamily: 'inherit' }}>Got it</button>
      </div>
    </div>,
    document.body
  )
}
