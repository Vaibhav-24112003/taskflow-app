// In-app demo tour — spotlight / coachmark overlay (design refresh #6)
//
// Dims the app and spotlights real elements (targeted by CSS selector),
// with a repositioning tooltip. Self-contained; pass steps + onClose.
// Targets default to the sidebar nav anchors (data-tour="tour-nav-<id>").

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'

var _tourKeyframes = false
function ensureTourKeyframes() {
  if (_tourKeyframes || typeof document === 'undefined') return
  _tourKeyframes = true
  var el = document.createElement('style')
  el.setAttribute('data-tf-tour', '')
  el.textContent =
    '@keyframes tf-glowPulse{0%,100%{box-shadow:0 0 0 6px rgba(20,199,192,.25),0 0 0 9999px rgba(7,20,36,.62)}50%{box-shadow:0 0 0 9px rgba(20,199,192,.35),0 0 0 9999px rgba(7,20,36,.62)}}'
  document.head.appendChild(el)
}

var DEFAULT_STEPS = [
  { sel: '[data-tour="tour-nav-diary"]', title: 'Start your day here', body: 'My Work is your personal home — today’s tasks, calendar and plan in one calm view.' },
  { sel: '[data-tour="tour-nav-workzone"]', title: 'All your client work', body: 'WorkZone holds every worksheet, board and deadline across the whole practice.' },
  { sel: '[data-tour="tour-nav-chat"]', title: 'Talk to your team', body: 'Team Chat keeps conversations, DMs and updates next to the work — no more WhatsApp.' },
]

export default function AppTour({ steps, onClose }) {
  var stepList = (steps && steps.length ? steps : DEFAULT_STEPS)
  var [i, setI] = useState(0)
  var [rect, setRect] = useState(null)
  var rafRef = useRef(0)

  ensureTourKeyframes()

  function measure() {
    var step = stepList[i]
    var elm = step && document.querySelector(step.sel)
    if (!elm) { setRect(null); return }
    var r = elm.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }

  useLayoutEffect(function () { measure() }, [i])
  useEffect(function () {
    function onResize() { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(measure) }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    function onKey(e) { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') back() }
    window.addEventListener('keydown', onKey)
    return function () {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(rafRef.current)
    }
  }, [i])

  function next() { if (i >= stepList.length - 1) onClose(); else setI(i + 1) }
  function back() { if (i > 0) setI(i - 1) }

  var pad = 8
  // Spotlight box (falls back to a centered dim if target missing)
  var spot = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null

  // Tooltip position: to the right of the target if room, else below.
  var vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  var vh = typeof window !== 'undefined' ? window.innerHeight : 800
  var ttW = 280
  var ttStyle
  if (spot) {
    var rightRoom = vw - (spot.left + spot.width)
    if (rightRoom > ttW + 24) ttStyle = { top: Math.min(spot.top, vh - 200), left: spot.left + spot.width + 16 }
    else ttStyle = { top: Math.min(spot.top + spot.height + 14, vh - 200), left: Math.max(16, Math.min(spot.left, vw - ttW - 16)) }
  } else {
    ttStyle = { top: vh / 2 - 90, left: vw / 2 - ttW / 2 }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000 }} aria-modal="true" role="dialog">
      {/* Backdrop click closes (only where there's no spotlight interaction) */}
      <div style={{ position: 'fixed', inset: 0, background: spot ? 'transparent' : 'rgba(7,20,36,.62)' }} onClick={onClose} />
      {spot && (
        <div
          style={{
            position: 'fixed',
            top: spot.top, left: spot.left, width: spot.width, height: spot.height,
            borderRadius: 12,
            border: '2px solid #14C7C0',
            animation: 'tf-glowPulse 2s ease-in-out infinite',
            transition: 'all .45s cubic-bezier(.4,0,.2,1)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'fixed', width: ttW, background: '#0F2C49', color: '#EAF1F8',
          border: '1px solid rgba(255,255,255,.09)', borderRadius: 14,
          boxShadow: '0 24px 60px -18px rgba(0,0,0,.6)', padding: 16,
          fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
          transition: 'top .45s cubic-bezier(.4,0,.2,1), left .45s cubic-bezier(.4,0,.2,1)',
          ...ttStyle,
        }}
      >
        <div style={{ display: 'inline-block', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: '#14C7C0', background: 'rgba(20,199,192,.14)', padding: '2px 8px', borderRadius: 999, marginBottom: 10 }}>
          {i + 1} / {stepList.length}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{stepList[i].title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#A9BDD6', marginBottom: 14 }}>{stepList[i].body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8AA0BB', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>Skip</button>
          <span style={{ flex: 1 }} />
          <button onClick={back} disabled={i === 0} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)', color: '#EAF1F8', borderRadius: 8, padding: '6px 12px', cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', opacity: i === 0 ? 0.5 : 1 }}>Back</button>
          <button onClick={next} style={{ background: 'linear-gradient(135deg,#2F6BFF,#14C7C0)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>{i >= stepList.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
