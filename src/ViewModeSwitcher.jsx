// Global, cross-root view-mode helper. Mounted once in main.jsx so it shows on
// EVERY screen (Practice Home and the in-practice shell are separate React
// roots). On a phone-width screen where the user is in forced "desktop" mode it
// offers a one-tap switch back to the mobile app, plus a one-time prompt the
// first time we detect a phone on the desktop layout.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'

const ACCENT = '#2F6BFF', ACCENT2 = '#14C7C0'

function readPref() { try { return localStorage.getItem('tf_view_pref') } catch { return null } }

export default function ViewModeSwitcher() {
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < 820)
  const [authed, setAuthed] = useState(false)
  const [pref, setPref] = useState(readPref)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const onR = () => { setNarrow(window.innerWidth < 820); setPref(readPref()) }
    window.addEventListener('resize', onR)
    let alive = true
    supabase.auth.getUser().then(({ data }) => { if (alive) setAuthed(!!data?.user) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setAuthed(!!s?.user) })
    return () => { alive = false; window.removeEventListener('resize', onR); sub?.subscription?.unsubscribe?.() }
  }, [])

  // One-time prompt: phone width + signed in + currently on the desktop layout.
  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem('tf_view_prompt_seen') === '1' } catch {}
    setShowPrompt(narrow && authed && readPref() === 'desktop' && !seen)
  }, [narrow, authed, pref])

  // Only relevant on a phone, when signed in, and when the desktop layout is the
  // one actually showing (pref === 'desktop'). In mobile/auto the MobileApp
  // overlay is up and carries its own "Switch to desktop" control.
  if (!narrow || !authed || readPref() !== 'desktop') return null

  function goMobile() {
    try { localStorage.setItem('tf_view_pref', 'mobile'); localStorage.setItem('tf_view_prompt_seen', '1'); sessionStorage.removeItem('tf_mobile_off') } catch {}
    window.location.reload()
  }
  function dismiss() { try { localStorage.setItem('tf_view_prompt_seen', '1') } catch {} setShowPrompt(false) }

  if (showPrompt) {
    return createPortal(
      <div style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 2147483000, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 460, background: '#fff', color: '#0E2A47', border: '1px solid #e6ecf3', borderRadius: 16, boxShadow: '0 18px 50px rgba(14,42,71,.28)', padding: '16px 16px 14px', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>
            </span>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>Open the mobile app?</div>
          </div>
          <div style={{ fontSize: 12.5, color: '#5d7189', lineHeight: 1.5, marginBottom: 12 }}>You're on a phone viewing the desktop layout. The mobile app is faster and easier to use on this screen.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={goMobile} style={{ flex: 1, border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, cursor: 'pointer', fontFamily: 'inherit' }}>Open mobile app</button>
            <button onClick={dismiss} style={{ border: '1px solid #e6ecf3', borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 700, color: '#5d7189', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Stay on desktop</button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // Persistent small pill once the prompt has been dealt with.
  return createPortal(
    <button onClick={goMobile} title="Switch to the mobile app"
      style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(14px + env(safe-area-inset-bottom))', zIndex: 2147483000,
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 999,
        border: 'none', color: '#fff', background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`,
        boxShadow: '0 8px 24px rgba(47,107,255,.45)', fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
        fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>
      Mobile view
    </button>,
    document.body
  )
}
