import React, { useState, useEffect, lazy, Suspense } from 'react'
import SupportContactForm from './SupportContactForm.jsx'
import { signInWithEmailLink } from './lib/supabase'

// Heavy tour modal is only loaded when the user opens it.
const TourModal = lazy(() => import('./LandingTour.jsx'))

// ── Utilities ─────────────────────────────────────────────────────────────────
const hex2rgb = hex => {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  .lp-root {
    --lp-bg: #0a0e18; --lp-panel: #131825; --lp-surface: rgba(255,255,255,.03);
    --lp-text: #eef0f8; --lp-text-sub: #8693b0; --lp-text-mut: #3a4663;
    --lp-border: rgba(255,255,255,.07); --lp-border-hov: rgba(255,255,255,.14);
    --lp-nav-bg: rgba(10,14,24,0.75); --lp-alt: rgba(255,255,255,.015);
    --lp-track: rgba(255,255,255,.05);
    font-family: 'Inter','Helvetica Neue',system-ui,sans-serif;
    -webkit-font-smoothing: antialiased; background: var(--lp-bg); color: var(--lp-text);
  }
  .lp-root[data-theme="light"] {
    --lp-bg: #f5f7fa; --lp-panel: #ffffff; --lp-surface: rgba(0,0,0,.03);
    --lp-text: #0a1929; --lp-text-sub: #475569; --lp-text-mut: #aab0be;
    --lp-border: rgba(0,0,0,.08); --lp-border-hov: rgba(0,0,0,.16);
    --lp-nav-bg: rgba(245,247,250,0.85); --lp-alt: rgba(0,0,0,.025);
    --lp-track: rgba(0,0,0,.06);
  }
  .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }
  .lp-root ::selection { background: rgba(14,42,71,.35); color: #fff; }
  .lp-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-feature-settings: "tnum"; }
  .lp-container { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
  .lp-eyebrow { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; font-weight: 600; color: #0e2a47; text-transform: uppercase; letter-spacing: .16em; }
  .lp-h1 { font-size: clamp(40px,5.4vw,72px); font-weight: 800; letter-spacing: -.035em; line-height: 1.04; margin: 0; }
  .lp-h2 { font-size: clamp(28px,3.4vw,44px); font-weight: 800; letter-spacing: -.025em; line-height: 1.1; margin: 0; }
  .lp-lede { font-size: 18px; color: var(--lp-text-sub); line-height: 1.6; max-width: 640px; }
  .lp-sec { padding: 96px 0; position: relative; }
  .lp-root a { color: inherit; text-decoration: none; }
  .lp-grain::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.025) 1px, transparent 1px); background-size: 3px 3px; pointer-events: none; opacity: .6; }
  .lp-btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all .18s ease; white-space: nowrap; font-family: inherit; }
  .lp-btn-primary { background: #0e2a47; color: #fff; box-shadow: 0 6px 18px rgba(14,42,71,.32); }
  .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(14,42,71,.4); }
  .lp-btn-ghost { background: var(--lp-surface); border: 1px solid var(--lp-border); color: var(--lp-text); }
  .lp-btn-ghost:hover { background: var(--lp-alt); border-color: var(--lp-border-hov); }
  .lp-btn-link { background: transparent; color: var(--lp-text-sub); padding: 13px 8px; }
  .lp-btn-link:hover { color: var(--lp-text); }
  .lp-kbd { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 6px; background: var(--lp-surface); border-radius: 4px; border: 1px solid var(--lp-border); }
  .lp-mod-card { transition: all .2s; }
  .lp-mod-card:hover { transform: translateY(-2px); }
  .lp-faq-item { background: var(--lp-panel); border: 1px solid var(--lp-border); border-radius: 11px; overflow: hidden; }
  .lp-faq-trigger { display: flex; align-items: center; gap: 14px; padding: 16px 20px; cursor: pointer; width: 100%; background: none; border: none; color: inherit; font-family: inherit; text-align: left; }
  .lp-faq-icon { font-size: 18px; color: var(--lp-text-sub); transition: transform .2s; }
  .lp-nav-link { padding: 8px 14px; font-size: 13px; color: var(--lp-text-sub); font-weight: 500; border-radius: 7px; transition: color .15s; }
  .lp-nav-link:hover { color: var(--lp-text); }
  .lp-theme-toggle { background: var(--lp-panel); border: 1px solid var(--lp-border); border-radius: 8px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; transition: all .18s; color: var(--lp-text-sub); }
  .lp-theme-toggle:hover { border-color: var(--lp-border-hov); color: var(--lp-text); }
  @keyframes lp-fillBar { from { width: 0 } to { width: 100% } }
  @keyframes lp-fadeUp { from { opacity: 0; transform: translateY(8px) } }
  @keyframes lp-blink { 50% { opacity: 0 } }
  @keyframes lp-modal-in { from { opacity:0; transform:scale(.97) translateY(10px) } }
  .lp-modal-overlay { position:fixed; inset:0; background:rgba(3,5,14,.93); backdrop-filter:blur(18px); z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; animation:lp-fadeUp .16s ease; }
  .lp-root[data-theme="light"] .lp-modal-overlay { background:rgba(200,212,228,.78); }
  .lp-modal-box { width:100%; max-width:1020px; border-radius:16px; overflow:hidden; background:#080b18; border:1px solid rgba(255,255,255,.1); box-shadow:0 40px 120px rgba(0,0,0,.9); display:flex; flex-direction:column; animation:lp-modal-in .2s ease; max-height:92vh; }
  .lp-root[data-theme="light"] .lp-modal-box { background:#ffffff; border-color:rgba(0,0,0,.1); box-shadow:0 40px 120px rgba(0,0,0,.18); }

  /* Tour modal — theme-aware tokens */
  .lp-tour-shell { background: var(--lp-panel); border:1px solid var(--lp-border); }
  .lp-tour-bar  { background: var(--lp-bg); border-color: var(--lp-border); }
  .lp-tour-img-bg { background: var(--lp-bg); }
  .lp-tour-left-bg { background: var(--lp-panel); }
  .lp-tour-kbd { background: var(--lp-surface); border:1px solid var(--lp-border); color: var(--lp-text-mut); }
  .lp-tour-seg-empty { background: var(--lp-track); }
  .lp-tour-seg-done  { background: var(--lp-text-mut); opacity: .55; }
  .lp-tour-close { background: var(--lp-surface); border:1px solid var(--lp-border); color: var(--lp-text-sub); }
  .lp-tour-close:hover { background: var(--lp-alt); color: var(--lp-text); }

  @keyframes lp-tour-imgIn { from { opacity:0; transform: scale(.985); } to { opacity:1; transform: scale(1); } }
  @keyframes lp-tour-textIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
  .lp-tour-img { animation: lp-tour-imgIn .4s ease both; }
  .lp-tour-text > * { animation: lp-tour-textIn .4s ease both; }
  .lp-tour-text > *:nth-child(2) { animation-delay: .05s; }
  .lp-tour-text > *:nth-child(3) { animation-delay: .1s; }
  .lp-tour-text > *:nth-child(4) { animation-delay: .15s; }
  .lp-tour-text > *:nth-child(5) { animation-delay: .2s; }
  .lp-tour-bullet:hover { background: var(--lp-alt); }
  .lp-tour-nav-btn { background: var(--lp-surface); border: 1px solid var(--lp-border); border-radius: 8px; color: var(--lp-text); cursor: pointer; padding: 9px 18px; font-size: 13px; font-weight: 600; transition: all .15s ease; font-family: inherit; }
  .lp-tour-nav-btn:hover:not(:disabled) { background: var(--lp-alt); border-color: var(--lp-border-hov); }
  .lp-tour-nav-btn:disabled { opacity: .35; cursor: not-allowed; }
  .lp-tour-nav-btn.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
  .lp-tour-nav-btn.primary:hover:not(:disabled) { background: #4f46e5; border-color: #4f46e5; }
`

// ── Nav ───────────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: 'Product',   href: '#product'    },
  { label: 'Modules',   href: '#modules'    },
  { label: 'Pricing',   href: '#pricing'    },
  { label: 'Customers', href: '#customers'  },
  { label: 'Docs',      href: '#faq'        },
  { label: 'Support',   href: '#support'    },
]

function scrollTo(id) {
  const el = document.querySelector(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Nav({ onOpenAuth, loading, dark, onToggleTheme }) {
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(14px)', background: 'var(--lp-nav-bg)', borderBottom: '1px solid var(--lp-border)' }}>
      <div className="lp-container" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#0e2a47,#1d4670)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>✦</div>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--lp-text)' }}>TaskFlowCo</span>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 4, marginLeft: 32 }}>
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="lp-nav-link"
               onClick={e => { e.preventDefault(); scrollTo(href) }}>{label}</a>
          ))}
        </div>
        <button className="lp-theme-toggle" onClick={onToggleTheme} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? '☀︎' : '☾'}
        </button>
        <button className="lp-btn lp-btn-link" onClick={onOpenAuth}>Sign in</button>
        <button className="lp-btn lp-btn-primary" onClick={onOpenAuth} disabled={loading}>
          {loading ? 'Signing in…' : 'Start free'}
        </button>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function HeroMosaic() {
  return (
    <div style={{ position: 'relative', maxWidth: 1140, margin: '0 auto', height: 520 }}>
      {/* Center: worksheet */}
      <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: 680, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(14,42,71,.15)', overflow: 'hidden', zIndex: 3 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--lp-border)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
          <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-text-mut)', marginLeft: 10 }}>taskflow.app · WorkZone › GSTR-3B › Apr 2026</span>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)', textTransform: 'uppercase', letterSpacing: '.12em' }}>Work type</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>GSTR-3B · April 2026</div>
            <span style={{ flex: 1 }} />
            {[['Filed', 32, '#10b981'], ['Review', 8, '#f59e0b'], ['Late', 2, '#ef4444']].map(([l, v, c]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
                <span style={{ color: 'var(--lp-text-sub)' }}>{l}</span>
                <span className="lp-mono" style={{ color: 'var(--lp-text)', fontWeight: 700 }}>{v}</span>
              </span>
            ))}
          </div>
          {[
            ['Acme Pvt Ltd', 'Filed', '#10b981', 100, 'PM'],
            ['Singh & Co', 'Review', '#f59e0b', 80, 'PM'],
            ['Mehta Industries', 'Data req', '#0e2a47', 40, 'RS'],
            ['Patel Trading', 'Overdue', '#ef4444', 10, 'RS'],
            ['Reliance Holdings', 'Filed', '#10b981', 100, 'PM'],
          ].map(([c, s, col, p, a]) => (
            <div key={c} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 30px 1fr', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--lp-border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', background: `rgba(${hex2rgb(col)},.14)`, border: `1px solid rgba(${hex2rgb(col)},.28)`, borderRadius: 100, fontSize: 11, color: col, fontWeight: 600, width: 'fit-content' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />{s}
              </span>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg,${col},${col}99)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{a}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--lp-track)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p}%`, background: col }} />
                </div>
                <span className="lp-mono" style={{ fontSize: 10.5, color: 'var(--lp-text-sub)', width: 30, textAlign: 'right' }}>{p}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Left float: recurring */}
      <div style={{ position: 'absolute', left: 0, top: 140, width: 280, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 20px 50px rgba(0,0,0,.55)', transform: 'rotate(-2deg)', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(99,102,241,.16)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>↻</span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Recurring</span>
          <span className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)', marginLeft: 'auto' }}>auto</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>TDS Q4 payment</div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-sub)', marginBottom: 10 }}>Monthly · 7th of every month</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m, i) => (
            <span key={m} className="lp-mono" style={{ flex: 1, padding: '5px 0', textAlign: 'center', fontSize: 10, background: i === 1 ? '#0e2a47' : 'rgba(255,255,255,.04)', color: i === 1 ? '#fff' : '#8693b0', borderRadius: 4, fontWeight: i === 1 ? 700 : 500 }}>{m}</span>
          ))}
        </div>
      </div>

      {/* Right float: client portal */}
      <div style={{ position: 'absolute', right: 0, top: 90, width: 260, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 20px 50px rgba(0,0,0,.55)', transform: 'rotate(2deg)', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(6,182,212,.16)', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>◑</span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Client portal</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-sub)', marginBottom: 8 }}>From Acme Pvt Ltd · just now</div>
        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--lp-border)', borderRadius: 8, fontSize: 12, lineHeight: 1.5 }}>
          <span>Bank statement · April</span><br />
          <span className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)' }}>statement_apr26.pdf · 1.2 MB</span>
        </div>
        <div style={{ marginTop: 8, width: '100%', padding: '7px', background: '#06b6d4', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>Approve & link</div>
      </div>

      {/* Bottom right: stats */}
      <div style={{ position: 'absolute', right: 40, bottom: 0, width: 240, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 20px 50px rgba(0,0,0,.55)', zIndex: 4 }}>
        <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 6 }}>This week · your team</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <div><div className="lp-mono" style={{ fontSize: 22, fontWeight: 800, color: '#10b981', letterSpacing: '-.02em' }}>147</div><div style={{ fontSize: 10, color: 'var(--lp-text-sub)', fontWeight: 600 }}>Filed</div></div>
          <div><div className="lp-mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>92h</div><div style={{ fontSize: 10, color: 'var(--lp-text-sub)', fontWeight: 600 }}>Logged</div></div>
          <div><div className="lp-mono" style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', letterSpacing: '-.02em' }}>↑12%</div><div style={{ fontSize: 10, color: 'var(--lp-text-sub)', fontWeight: 600 }}>vs last</div></div>
        </div>
      </div>

      {/* Bottom left: diary */}
      <div style={{ position: 'absolute', left: 30, bottom: 60, width: 230, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 20px 50px rgba(0,0,0,.55)', transform: 'rotate(-1deg)', zIndex: 4 }}>
        <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 8 }}>Today · 09:41</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', marginTop: 6, flexShrink: 0, boxShadow: '0 0 10px #6366f1' }} />
          <div><div style={{ fontSize: 12, fontWeight: 600 }}>GSTR-3B · Acme</div><div style={{ fontSize: 10.5, color: 'var(--lp-text-sub)' }}>Up next · 09:00</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', marginTop: 6, flexShrink: 0 }} />
          <div><div style={{ fontSize: 12, fontWeight: 600 }}>TDS review · Singh</div><div style={{ fontSize: 10.5, color: 'var(--lp-text-sub)' }}>11:30</div></div>
        </div>
      </div>
    </div>
  )
}

function Hero({ onOpenAuth, loading, onOpenTour }) {
  return (
    <section id="product" className="lp-sec lp-grain" style={{ paddingTop: 80, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 1100, height: 600, background: 'radial-gradient(ellipse,rgba(14,42,71,.18),transparent 60%)', pointerEvents: 'none' }} />
      <div className="lp-container" style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', maxWidth: 880, margin: '0 auto 56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 100, background: 'rgba(14,42,71,.1)', border: '1px solid rgba(14,42,71,.25)', fontSize: 12, fontWeight: 600, color: '#0e2a47', marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0e2a47', boxShadow: '0 0 12px #0e2a47' }} />
            Built for CA · CS · CMA · Tax & Legal Consultants · Advocates
          </div>
          <h1 className="lp-h1">The operating system<br />for your <span style={{ background: 'linear-gradient(90deg,#0e2a47,#5b8cb8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>practice</span>.</h1>
          <p className="lp-lede" style={{ margin: '24px auto 0' }}>Worksheets, recurring work, client portal, billing and team workload — all in one place. For service-first practices: CA, CS, CMA, tax consultants, advisory firms, advocates and consultants. Stop juggling Excel, WhatsApp and email.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
            <button className="lp-btn lp-btn-primary" onClick={onOpenAuth} disabled={loading}>
              {loading ? 'Signing in…' : 'Start free trial →'}
            </button>
            <button className="lp-btn lp-btn-ghost" onClick={onOpenTour}>Website tour →</button>
            <button className="lp-btn lp-btn-link">Book a demo</button>
          </div>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 22, fontSize: 12, color: 'var(--lp-text-mut)' }} className="lp-mono">
            <span>✓ No credit card</span><span>✓ 14-day trial</span><span>✓ Setup in 10 minutes</span>
          </div>
        </div>
        <HeroMosaic />
      </div>
    </section>
  )
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function Stats() {
  const stats = [['1', 'Practice onboard'], ['62 hrs', 'saved per firm/month'], ['100%', 'on-time delivery rate'], ['∞', 'Excel sheets replaced']]
  return (
    <section id="customers" className="lp-sec" style={{ paddingTop: 32, paddingBottom: 32, borderTop: '1px solid var(--lp-border)', borderBottom: '1px solid var(--lp-border)', background: 'var(--lp-alt)' }}>
      <div className="lp-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
        {stats.map(([v, l]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div className="lp-mono" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', background: 'linear-gradient(180deg,#fff,#8693b0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{v}</div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-sub)', fontWeight: 500, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Problem ───────────────────────────────────────────────────────────────────
function Problem() {
  const before = [
    ['Excel sheets in 12 different folders', 'Versioning chaos every Monday'],
    ['WhatsApp groups for client docs', 'Compliance proof? Good luck.'],
    ['Junior staff missing TDS payments', 'One forgotten challan = ₹10k late fee'],
    ['Recurring works copy-pasted', 'Until someone forgets to copy them'],
  ]
  const after = [
    ['One worksheet per work type', 'Clients in rows, status at a glance'],
    ['Branded client portal', 'Every doc tied to a request, audit-trailed'],
    ['Recurring tasks auto-generate', 'Daily, monthly, quarterly — set once'],
    ['Workload visible across team', "Who's underwater, who has capacity"],
  ]
  return (
    <section className="lp-sec">
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-eyebrow">The problem</div>
          <h2 className="lp-h2" style={{ marginTop: 8 }}>Your firm runs on willpower.<br /><span style={{ color: 'var(--lp-text-sub)' }}>It shouldn't.</span></h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ padding: '24px 26px', background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.18)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(239,68,68,.16)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>×</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', letterSpacing: '-.01em' }}>Life before TaskFlowCo</span>
            </div>
            {before.map(([t, d]) => (
              <div key={t} style={{ padding: '12px 0', borderTop: '1px solid rgba(239,68,68,.12)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3, textDecoration: 'line-through', textDecorationColor: 'rgba(239,68,68,.4)' }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-sub)' }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '24px 26px', background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.22)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,.16)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981', letterSpacing: '-.01em' }}>With TaskFlowCo</span>
            </div>
            {after.map(([t, d]) => (
              <div key={t} style={{ padding: '12px 0', borderTop: '1px solid rgba(16,185,129,.12)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-sub)' }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Modules ───────────────────────────────────────────────────────────────────
function Modules() {
  const mods = [
    { id: 'diary', label: 'Your Diary', desc: 'Personal worklist, calendar, plan-my-day.', color: '#6366f1', glyph: '◐' },
    { id: 'workzone', label: 'WorkZone', desc: 'Worksheets per work type. ITR · GST · TDS · Audit.', color: '#0e2a47', glyph: '◧' },
    { id: 'team', label: 'Team', desc: 'Attendance, leaves, daily logs, workload heatmap.', color: '#f59e0b', glyph: '◔' },
    { id: 'masterdata', label: 'Master Data', desc: 'Clients, work types, groups, custom fields.', color: '#8b5cf6', glyph: '◓' },
    { id: 'comms', label: 'Communication', desc: 'Branded client portal · bulk Gmail · templates.', color: '#06b6d4', glyph: '◑' },
    { id: 'billing', label: 'Billing', desc: 'Invoices, proposals, statements. Tally & Zoho exports.', color: '#ec4899', glyph: '◒' },
    { id: 'library', label: 'Library', desc: 'Credentials vault, SOPs, study resources.', color: '#0ea5e9', glyph: '◇' },
    { id: 'analytics', label: 'Analytics', desc: 'Org-wide review for owners and admins.', color: '#10b981', glyph: '◰' },
    { id: 'setup', label: 'Set-up', desc: 'Members, invites, roles, org settings.', color: '#64748b', glyph: '◕' },
  ]
  return (
    <section id="modules" className="lp-sec" style={{ background: 'var(--lp-alt)', borderTop: '1px solid var(--lp-border)', borderBottom: '1px solid var(--lp-border)' }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-eyebrow">Modules tour</div>
          <h2 className="lp-h2" style={{ marginTop: 8 }}>Nine modules.<br />One operating system.</h2>
          <p className="lp-lede" style={{ margin: '18px auto 0' }}>Every module talks to the others. A new client in Master Data shows up in WorkZone, Billing, and the Client Portal — instantly.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {mods.map(m => {
            const r = hex2rgb(m.color)
            return (
              <div key={m.id} className="lp-mod-card" style={{ padding: '22px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 14, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${r},.32)` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}>
                <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, background: `radial-gradient(circle,rgba(${r},.12),transparent 70%)`, pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: `rgba(${r},.14)`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{m.glyph}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>{m.label}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--lp-text-sub)', lineHeight: 1.55, position: 'relative' }}>{m.desc}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────
function Features() {
  const feats = [
    { t: 'Recurring tasks', d: 'Daily · weekly · biweekly · monthly · quarterly · yearly · custom. Set the rule once, the next instance auto-generates.', icon: '↻', c: '#6366f1', span: 2 },
    { t: 'Kanban boards', d: 'Drag tasks across statuses. Per-work-type columns.', icon: '⊞', c: '#0e2a47' },
    { t: '⌘K command bar', d: 'Jump to any client, work, or action in one keystroke.', icon: '⌘', c: '#10b981' },
    { t: 'Client portal', d: 'Branded portal where clients upload docs and respond to requests.', icon: '◑', c: '#06b6d4' },
    { t: 'Gmail integration', d: 'OAuth-based. Bulk-mail clients and template common replies.', icon: '@', c: '#ec4899' },
    { t: 'Audit trail', d: 'Every status change, comment and doc upload is logged.', icon: '⎘', c: '#f59e0b', span: 2 },
  ]
  return (
    <section id="pricing" className="lp-sec">
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-eyebrow">Built for the work you actually do</div>
          <h2 className="lp-h2" style={{ marginTop: 8 }}>Power-user details<br />that compound every day.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridAutoRows: 'minmax(180px,auto)', gap: 12 }}>
          {feats.map(f => {
            const r = hex2rgb(f.c)
            return (
              <div key={f.t} style={{ gridColumn: f.span ? `span ${f.span}` : 'span 1', padding: '22px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 14, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 7, background: `rgba(${r},.14)`, color: f.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{f.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{f.t}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--lp-text-sub)', lineHeight: 1.55, flex: 1 }}>{f.d}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Tour Video ────────────────────────────────────────────────────────────────
function ScCapture() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 30 }}>
      <div style={{ width: '90%', maxWidth: 480, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden', animation: 'lp-fadeUp .4s ease' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--lp-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="lp-mono" style={{ color: 'var(--lp-text-sub)' }}>›</span>
          <span style={{ fontSize: 14, flex: 1 }}>GSTR Acme<span style={{ color: '#0e2a47', animation: 'lp-blink 1s steps(2) infinite' }}>|</span></span>
          <span className="lp-kbd">esc</span>
        </div>
        {[['CL', 'Acme Pvt Ltd · GSTIN 27AABCA1234A1Z5', '#0e2a47', true], ['WK', 'GSTR-3B · Apr 26 · Acme Pvt Ltd', '#f59e0b', false], ['⚡', 'Create new GSTR-3B for Acme', '#10b981', false]].map(([k, t, c, a]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', background: a ? 'rgba(14,42,71,.12)' : 'transparent' }}>
            <span className="lp-mono" style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(14,42,71,.14)', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: a ? 700 : 500, flex: 1 }}>{t}</span>
            {a && <span className="lp-mono" style={{ fontSize: 10, color: '#0e2a47', padding: '2px 6px', background: 'rgba(14,42,71,.16)', border: '1px solid rgba(14,42,71,.3)', borderRadius: 4 }}>↵</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScSheet() {
  return (
    <div style={{ height: '100%', animation: 'lp-fadeUp .4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>GSTR-3B · April 2026</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /><span style={{ color: 'var(--lp-text-sub)' }}>Filed</span><span className="lp-mono" style={{ fontWeight: 700 }}>32</span>
        </span>
      </div>
      {[['Acme Pvt Ltd', 'Filed', '#10b981', 100], ['Singh & Co', 'Review', '#f59e0b', 80], ['Mehta Industries', 'Data req', '#0e2a47', 40], ['Patel Trading', 'Overdue', '#ef4444', 10], ['Reliance Holdings', 'Filed', '#10b981', 100], ['Tata Components', 'Filed', '#10b981', 100]].map(([c, s, col, p]) => (
        <div key={c} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--lp-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{c}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', background: `rgba(${hex2rgb(col)},.14)`, border: `1px solid rgba(${hex2rgb(col)},.28)`, borderRadius: 100, fontSize: 11, color: col, fontWeight: 600, width: 'fit-content' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />{s}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--lp-track)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${p}%`, background: col }} />
            </div>
            <span className="lp-mono" style={{ fontSize: 10.5, color: 'var(--lp-text-sub)', width: 30, textAlign: 'right' }}>{p}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ScRecurring() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'lp-fadeUp .4s ease' }}>
      <div style={{ width: '80%', maxWidth: 460 }}>
        <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg,rgba(99,102,241,.16),rgba(99,102,241,.04))', border: '1px solid rgba(99,102,241,.32)', borderRadius: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(99,102,241,.2)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>↻</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>TDS payment · Acme Pvt Ltd</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-sub)', marginLeft: 40 }}>Monthly · 7th of every month · until Mar 2027</div>
        </div>
        <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 8 }}>Auto-generates</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m, i) => (
            <span key={m} className="lp-mono" style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 10, background: i === 1 ? '#6366f1' : 'rgba(99,102,241,.08)', color: i === 1 ? '#fff' : 'var(--lp-text-sub)', borderRadius: 5, fontWeight: 700, border: i === 1 ? 'none' : '1px solid rgba(99,102,241,.18)' }}>{m}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScInvoice() {
  return (
    <div style={{ height: '100%', animation: 'lp-fadeUp .4s ease', padding: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Invoice · Acme Pvt Ltd</span>
        <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-text-mut)' }}>INV-2026-0142</span>
        <span style={{ flex: 1 }} />
        <span style={{ padding: '3px 10px', background: 'rgba(16,185,129,.16)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 100, fontSize: 11, color: '#10b981', fontWeight: 700 }}>Paid</span>
      </div>
      {[['GSTR-3B · April 2026', '5,000'], ['TDS Q4 payment', '3,500'], ['ITR data preparation', '12,000']].map(([l, a]) => (
        <div key={l} style={{ display: 'flex', padding: '10px 0', borderTop: '1px solid var(--lp-border)', fontSize: 13 }}>
          <span style={{ flex: 1 }}>{l}</span>
          <span className="lp-mono" style={{ fontWeight: 600 }}>₹{a}</span>
        </div>
      ))}
      <div style={{ display: 'flex', padding: '14px 0', borderTop: '1px solid var(--lp-border)', marginTop: 10, fontSize: 14, fontWeight: 800 }}>
        <span style={{ flex: 1 }}>Total</span>
        <span className="lp-mono">₹20,500</span>
      </div>
      <div style={{ marginTop: 18, padding: '10px 14px', background: 'var(--lp-surface)', border: '1px dashed var(--lp-border-hov)', borderRadius: 8, fontSize: 11.5, color: 'var(--lp-text-sub)' }}>
        ✓ Pulled from completed works · ✓ Tally export ready · ✓ Sent via Gmail
      </div>
    </div>
  )
}

function TourVideo() {
  const [step, setStep] = useState(0)
  const steps = [
    { t: 'Capture in seconds', d: 'Press ⌘K, type the client name, hit enter.' },
    { t: 'Track on the worksheet', d: 'Status, assignee, progress — all visible.' },
    { t: 'File on time', d: "Recurring rules generate next month's instance." },
    { t: 'Bill the work', d: 'Invoice from completed works — no double entry.' },
  ]
  useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % 4), 3000)
    return () => clearInterval(id)
  }, [])
  return (
    <section id="tour" className="lp-sec" style={{ background: 'var(--lp-alt)', borderTop: '1px solid var(--lp-border)', borderBottom: '1px solid var(--lp-border)' }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-eyebrow">90-second tour</div>
          <h2 className="lp-h2" style={{ marginTop: 8 }}>From task to filed.<br />Watch it run.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s, i) => (
              <div key={i} onClick={() => setStep(i)} style={{ cursor: 'pointer', padding: '14px 16px', background: i === step ? 'var(--lp-panel)' : 'transparent', border: `1px solid ${i === step ? 'rgba(14,42,71,.3)' : 'var(--lp-border)'}`, borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                {i === step && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#0e2a47' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span className="lp-mono" style={{ fontSize: 10, color: i === step ? '#0e2a47' : 'var(--lp-text-mut)', fontWeight: 700 }}>0{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: i === step ? 'var(--lp-text)' : 'var(--lp-text-sub)' }}>{s.t}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-sub)', paddingLeft: 24 }}>{s.d}</div>
                {i === step && <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, background: '#0e2a47', animation: 'lp-fillBar 3s linear' }} />}
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6)', overflow: 'hidden', height: 420 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--lp-border)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              <span className="lp-mono" style={{ fontSize: 11, color: 'var(--lp-text-mut)', marginLeft: 10 }}>taskflow.app</span>
            </div>
            <div style={{ padding: 24, height: 'calc(100% - 38px)', position: 'relative' }}>
              {step === 0 && <ScCapture />}
              {step === 1 && <ScSheet />}
              {step === 2 && <ScRecurring />}
              {step === 3 && <ScInvoice />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Compliance ────────────────────────────────────────────────────────────────
function Compliance() {
  const items = [
    ['GST returns', 'GSTR-1, 3B, 9, IFF — recurring rules built in.'],
    ['TDS / TCS', 'Quarterly returns, monthly challans, certificates.'],
    ['Income Tax', 'ITR for individuals, firms, companies — with status tracking.'],
    ['Audit', 'Statutory, tax, internal — with workpaper & checklist support.'],
    ['ROC / MCA', 'Annual filings, board minutes, DIR-3 KYC.'],
    ['Payroll', 'Salary processing, PF, ESI, professional tax.'],
  ]
  return (
    <section className="lp-sec">
      <div className="lp-container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <div className="lp-eyebrow">Built for Indian compliance</div>
            <h2 className="lp-h2" style={{ marginTop: 8 }}>Speaks fluent <span style={{ color: '#0e2a47' }}>GSTR</span>, <span style={{ color: '#6366f1' }}>TDS</span>, <span style={{ color: '#10b981' }}>ITR</span>.</h2>
            <p className="lp-lede" style={{ marginTop: 18 }}>Every recurring rule, every status, every report is shaped to the Indian compliance calendar — perfect for CA, CS and CMA practices. Define custom work types for advisory, legal or consulting work too.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
              {['ICAI-friendly', 'GSTN periodicity', 'Indian FY Apr–Mar', '₹ INR-first', 'Multi-GSTIN clients'].map(t => (
                <span key={t} className="lp-mono" style={{ fontSize: 11, padding: '5px 10px', background: 'rgba(14,42,71,.08)', border: '1px solid rgba(14,42,71,.22)', borderRadius: 6, color: '#0e2a47', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {items.map(([t, d], i) => (
              <div key={t} style={{ padding: '16px 18px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 11 }}>
                <div className="lp-mono" style={{ fontSize: 10, color: '#0e2a47', fontWeight: 700, marginBottom: 6 }}>0{i + 1}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t}</div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-sub)', lineHeight: 1.45 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Security ──────────────────────────────────────────────────────────────────
function Security() {
  const items = [
    ['Data residency in India', 'Hosted on AWS Mumbai (ap-south-1). Your data never leaves the country.', '◊'],
    ['Row-level security', "Supabase RLS — staff only see clients and works they're assigned.", '⌗'],
    ['Audit logs', 'Every status change, doc upload, and login is logged with timestamp & user.', '⎘'],
    ['Encrypted at rest & in transit', 'TLS 1.3 in flight · AES-256 at rest. Backups every 6 hours.', '🔒'],
    ['Role-based access', 'Owner · admin · staff · viewer. Configure per workspace.', '◈'],
    ['SOC 2 in progress', 'Type II audit underway with a Big-4 assessor.', '✓'],
  ]
  return (
    <section id="security" className="lp-sec" style={{ background: 'var(--lp-alt)', borderTop: '1px solid var(--lp-border)', borderBottom: '1px solid var(--lp-border)' }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-eyebrow">Security & data residency</div>
          <h2 className="lp-h2" style={{ marginTop: 8 }}>Your client data,<br />treated like client data.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {items.map(([t, d, ic]) => (
            <div key={t} style={{ padding: '22px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(14,42,71,.12)', color: '#0e2a47', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{ic}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t}</div>
              <div style={{ fontSize: 12, color: 'var(--lp-text-sub)', lineHeight: 1.55 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState(0)
  const qs = [
    ['How long does setup take?', 'Most firms are live in under 30 minutes. Import your client list as CSV, pick the work types you handle, invite your team.'],
    ['Can we migrate from Excel / existing tools?', 'Yes. CSV import for clients and master data. We also help migrate from Practice Pro, Munimji, and similar tools — included in onboarding.'],
    ['Do clients need an account?', 'Only if they use the Client Portal. You can also operate TaskFlowCo entirely internally without exposing it to clients.'],
    ['What about pricing?', 'Per-user monthly pricing. The first 14 days are free with no credit card. We have firm-wide plans starting at 5 seats.'],
    ['Where is our data stored?', 'In AWS Mumbai (ap-south-1). Encrypted at rest with AES-256. Daily backups. Your data is yours — full export available any time.'],
    ['Does it integrate with Tally / Zoho?', 'Yes. Billing exports to Tally XML and Zoho Books. We also support Gmail OAuth for client communication.'],
  ]
  return (
    <section id="faq" className="lp-sec">
      <div className="lp-container" style={{ maxWidth: 820 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="lp-eyebrow">FAQ</div>
          <h2 className="lp-h2" style={{ marginTop: 8 }}>Common questions.</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {qs.map(([q, a], i) => (
            <div key={i} className="lp-faq-item">
              <button className="lp-faq-trigger" onClick={() => setOpen(open === i ? -1 : i)}>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{q}</span>
                <span className="lp-faq-icon" style={{ transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
              </button>
              {open === i && <div style={{ padding: '0 20px 18px', fontSize: 13, color: 'var(--lp-text-sub)', lineHeight: 1.6 }}>{a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Support ───────────────────────────────────────────────────────────────────
function Support() {
  return (
    <section id="support" className="lp-sec" style={{ background: 'var(--lp-alt)', borderTop: '1px solid var(--lp-border)', borderBottom: '1px solid var(--lp-border)' }}>
      <div className="lp-container">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'start' }}>
          <div>
            <div className="lp-eyebrow">Support</div>
            <h2 className="lp-h2" style={{ marginTop: 8 }}>We're a quick<br/>email away.</h2>
            <p className="lp-lede" style={{ marginTop: 18, maxWidth: 460 }}>
              Stuck on something? Found a bug? Want a feature? Drop us a line and we'll get back to you within one business day.
            </p>
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <a href="mailto:support@taskflowco.in" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 11, textDecoration: 'none', transition: 'all .15s ease' }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'linear-gradient(135deg,#0e2a47,#1d4670)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>✉</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)' }}>support@taskflowco.in</div>
                  <div style={{ fontSize: 11, color: 'var(--lp-text-sub)', marginTop: 2 }}>Reply within 1 business day</div>
                </div>
                <span style={{ fontSize: 15, color: 'var(--lp-text-mut)' }}>↗</span>
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 11 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(99,102,241,.14)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>?</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)' }}>Check the FAQ first</div>
                  <div style={{ fontSize: 11, color: 'var(--lp-text-sub)', marginTop: 2 }}>Many common questions are already answered above</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 11 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(16,185,129,.14)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>★</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)' }}>Existing customers</div>
                  <div style={{ fontSize: 11, color: 'var(--lp-text-sub)', marginTop: 2 }}>Use the help icon inside the app for faster, context-aware support</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 14, padding: 28 }}>
            <div style={{ marginBottom: 18 }}>
              <div className="lp-eyebrow" style={{ marginBottom: 6 }}>Send a message</div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-sub)' }}>Lands directly in our inbox.</div>
            </div>
            <SupportContactForm source="landing" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA({ onOpenAuth, loading }) {
  return (
    <section id="trial" className="lp-sec" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse,rgba(14,42,71,.18),transparent 60%)', pointerEvents: 'none' }} />
      <div className="lp-container" style={{ textAlign: 'center', position: 'relative' }}>
        <h2 className="lp-h1" style={{ maxWidth: 820, margin: '0 auto' }}>Make tomorrow's<br />deadline day quiet.</h2>
        <p className="lp-lede" style={{ margin: '24px auto 32px' }}>Start free for 14 days. No credit card. Bring your team. We'll get out of the way.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="lp-btn lp-btn-primary" onClick={onOpenAuth} disabled={loading}>
            {loading ? 'Signing in…' : 'Start free trial →'}
          </button>
          <button className="lp-btn lp-btn-ghost">Book a demo</button>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--lp-border)', padding: '48px 0 32px', background: 'var(--lp-bg)' }}>
      <div className="lp-container">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 32, marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#0e2a47,#1d4670)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>✦</div>
              <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>TaskFlowCo</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-sub)', lineHeight: 1.6, maxWidth: 300 }}>The operating system for service-first practices — CA, CS, CMA, tax consultants, advisory firms, advocates and consultants.</div>
          </div>
          {[
            ['Product', ['Modules', 'Pricing', 'Changelog', 'Roadmap', 'Status']],
            ['Company', ['About', 'Blog', 'Customers', 'Careers', 'Press']],
            ['Resources', ['Docs', 'API', 'Help center', 'Webinars', 'Migrate from Excel']],
            ['Legal', ['Privacy', 'Terms', 'Security', 'GDPR', 'DPA']],
          ].map(([h, ls]) => (
            <div key={h}>
              <div className="lp-mono" style={{ fontSize: 10, color: 'var(--lp-text-mut)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 12, fontWeight: 700 }}>{h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ls.map(l => <a key={l} href="#" style={{ fontSize: 12.5, color: 'var(--lp-text-sub)' }}>{l}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTop: '1px solid var(--lp-border)', fontSize: 11.5, color: 'var(--lp-text-mut)' }} className="lp-mono">
          <span>© 2026 TaskFlowCo · All rights reserved</span>
          <span>v 2.4.1 · all systems operational</span>
        </div>
      </div>
    </footer>
  )
}

// ── Tour Modal ────────────────────────────────────────────────────────────────
const HM_DATA = [
  [1,3,2,4,2,1,3,2,4,3,2,1,3,2,4,2,3,1,2,3],
  [2,4,1,3,4,2,1,3,2,4,3,2,4,1,3,2,4,3,1,2],
  [3,2,4,1,2,3,4,2,1,3,4,2,1,3,2,4,1,3,2,4],
  [1,3,2,4,3,1,2,4,3,2,1,4,2,3,1,4,2,3,4,1],
  [4,1,3,2,1,4,3,1,2,4,2,3,1,4,2,3,1,4,2,3],
]
const HM_COLS = ['#1a2035','#2d4a6b','#1d4670','#0e2a47','#a5c4de']


// ── Email magic-link sign-in modal ────────────────────────────────────────────
// For users whose email isn't a Google account (e.g. domain mailboxes like
// support@taskflowco.in). Sends a one-time sign-in link to their inbox.
function AuthModal({ open, onClose, onGoogle, googleBusy }) {
  const [email, setEmail]     = useState('')
  const [busy,  setBusy]      = useState(false)
  const [sent,  setSent]      = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!open) { setEmail(''); setSent(false); setError(null); setBusy(false) }
  }, [open])

  if (!open) return null

  const submit = async (e) => {
    e?.preventDefault?.()
    const v = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(v)) { setError('Please enter a valid email address.'); return }
    setBusy(true); setError(null)
    try {
      const { error: err } = await signInWithEmailLink(v)
      if (err) throw err
      setSent(true)
    } catch (err) {
      setError(err?.message || 'Could not send the link. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--lp-bg)', color:'var(--lp-text)',
        border:'1px solid var(--lp-border)', borderRadius:14,
        width:'100%', maxWidth:420, padding:'26px 28px',
        boxShadow:'0 30px 90px rgba(0,0,0,.45)',
        fontFamily:'inherit',
      }}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:18}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:'-.01em'}}>Sign in to TaskFlowCo</div>
            <div style={{fontSize:12,color:'var(--lp-text-sub)',marginTop:4}}>
              {sent ? 'Check your inbox to finish signing in.' : 'Pick how you want to continue.'}
            </div>
          </div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'var(--lp-text-sub)',cursor:'pointer',fontSize:20,padding:'0 4px',fontFamily:'inherit'}}>×</button>
        </div>

        {sent ? (
          <div style={{padding:'10px 0 6px',textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:8}}>✓</div>
            <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Check your inbox</div>
            <div style={{fontSize:12,color:'var(--lp-text-sub)',lineHeight:1.5}}>
              We sent a sign-in link to <b style={{color:'var(--lp-text)'}}>{email}</b>.<br/>
              Click it from any device to finish signing in.
            </div>
            <button onClick={onClose} className="lp-btn lp-btn-ghost" style={{marginTop:18}}>Done</button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onGoogle}
              disabled={googleBusy || busy}
              style={{
                width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                padding:'11px 14px', fontSize:14, fontWeight:600, fontFamily:'inherit',
                background:'#fff', color:'#1f2937',
                border:'1px solid #d1d5db', borderRadius:10,
                cursor: (googleBusy || busy) ? 'not-allowed' : 'pointer',
                boxShadow:'0 1px 2px rgba(0,0,0,.04)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2c-.4.4 6.8-5 6.8-14.8 0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              {googleBusy ? 'Signing in…' : 'Continue with Google'}
            </button>

            <div style={{display:'flex',alignItems:'center',gap:10,margin:'18px 0 14px'}}>
              <div style={{flex:1,height:1,background:'var(--lp-border)'}} />
              <span style={{fontSize:11,color:'var(--lp-text-mut)',letterSpacing:'.06em',textTransform:'uppercase'}}>or</span>
              <div style={{flex:1,height:1,background:'var(--lp-border)'}} />
            </div>

            <form onSubmit={submit}>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--lp-text-sub)',marginBottom:6,letterSpacing:'.02em'}}>Sign in with email link</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourdomain.com"
                disabled={busy || googleBusy}
                style={{
                  width:'100%', padding:'10px 12px', fontSize:14, fontFamily:'inherit',
                  background:'var(--lp-bg)', color:'var(--lp-text)',
                  border:'1px solid var(--lp-border)', borderRadius:8,
                  outline:'none', boxSizing:'border-box',
                }}
              />
              {error && (
                <div style={{fontSize:12,color:'#ef4444',marginTop:8}}>{error}</div>
              )}
              <button
                type="submit"
                disabled={busy || googleBusy}
                className="lp-btn lp-btn-ghost"
                style={{width:'100%',marginTop:12,justifyContent:'center'}}
              >
                {busy ? 'Sending…' : 'Send sign-in link →'}
              </button>
              <div style={{fontSize:11,color:'var(--lp-text-mut)',marginTop:12,textAlign:'center',lineHeight:1.5}}>
                Works with any email — no password required.<br/>
                New here? Your account is created automatically.
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LandingPage({ onSignIn, loading }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const saved = localStorage.getItem('lp_theme')
      if (saved === 'dark') return true
      if (saved === 'light') return false
    } catch (_) {}
    // First-time visitors always land in light mode; subsequent visits respect their choice.
    return false
  })
  useEffect(() => {
    try { localStorage.setItem('lp_theme', dark ? 'dark' : 'light') } catch (_) {}
  }, [dark])
  const [tourOpen, setTourOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const openAuth = () => setAuthOpen(true)
  return (
    <div className="lp-root" data-theme={dark ? 'dark' : 'light'}>
      <style>{CSS}</style>
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onGoogle={onSignIn}
        googleBusy={loading}
      />
      {tourOpen && (
        <Suspense fallback={<div className="lp-modal-overlay"><div style={{padding:24,color:'var(--lp-text-sub)',fontSize:13}}>Loading tour…</div></div>}>
          <TourModal open={tourOpen} onClose={() => setTourOpen(false)} />
        </Suspense>
      )}
      <Nav onOpenAuth={openAuth} loading={loading} dark={dark} onToggleTheme={() => setDark(d => !d)} />
      <Hero onOpenAuth={openAuth} loading={loading} onOpenTour={() => setTourOpen(true)} />
      <Stats />
      <Problem />
      <Modules />
      <Features />
      <TourVideo />
      <Compliance />
      <Security />
      <FAQ />
      <Support />
      <FinalCTA onOpenAuth={openAuth} loading={loading} />
      <Footer />
    </div>
  )
}
