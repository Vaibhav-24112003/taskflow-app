import React, { useState, useEffect } from 'react'

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
    --lp-bg: #f0f4f9; --lp-panel: #ffffff; --lp-surface: rgba(0,0,0,.03);
    --lp-text: #111827; --lp-text-sub: #6b7280; --lp-text-mut: #aab0be;
    --lp-border: rgba(0,0,0,.08); --lp-border-hov: rgba(0,0,0,.16);
    --lp-nav-bg: rgba(240,244,249,0.85); --lp-alt: rgba(0,0,0,.025);
    --lp-track: rgba(0,0,0,.06);
  }
  .lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }
  .lp-root ::selection { background: rgba(107,140,173,.35); color: #fff; }
  .lp-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-feature-settings: "tnum"; }
  .lp-container { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
  .lp-eyebrow { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; font-weight: 600; color: #6b8cad; text-transform: uppercase; letter-spacing: .16em; }
  .lp-h1 { font-size: clamp(40px,5.4vw,72px); font-weight: 800; letter-spacing: -.035em; line-height: 1.04; margin: 0; }
  .lp-h2 { font-size: clamp(28px,3.4vw,44px); font-weight: 800; letter-spacing: -.025em; line-height: 1.1; margin: 0; }
  .lp-lede { font-size: 18px; color: var(--lp-text-sub); line-height: 1.6; max-width: 640px; }
  .lp-sec { padding: 96px 0; position: relative; }
  .lp-root a { color: inherit; text-decoration: none; }
  .lp-grain::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.025) 1px, transparent 1px); background-size: 3px 3px; pointer-events: none; opacity: .6; }
  .lp-btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all .18s ease; white-space: nowrap; font-family: inherit; }
  .lp-btn-primary { background: #6b8cad; color: #fff; box-shadow: 0 6px 18px rgba(107,140,173,.32); }
  .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(107,140,173,.4); }
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
  .lp-modal-box { width:100%; max-width:1020px; border-radius:16px; overflow:hidden; background:#080b18; border:1px solid rgba(255,255,255,.1); box-shadow:0 40px 120px rgba(0,0,0,.9); display:flex; flex-direction:column; animation:lp-modal-in .2s ease; max-height:92vh; }
  @keyframes lp-tour-imgIn { from { opacity:0; transform: scale(.985); } to { opacity:1; transform: scale(1); } }
  @keyframes lp-tour-textIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
  .lp-tour-img { animation: lp-tour-imgIn .4s ease both; }
  .lp-tour-text > * { animation: lp-tour-textIn .4s ease both; }
  .lp-tour-text > *:nth-child(2) { animation-delay: .05s; }
  .lp-tour-text > *:nth-child(3) { animation-delay: .1s; }
  .lp-tour-text > *:nth-child(4) { animation-delay: .15s; }
  .lp-tour-text > *:nth-child(5) { animation-delay: .2s; }
  .lp-tour-bullet:hover { background: rgba(255,255,255,.025); }
  .lp-tour-nav-btn { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; color: #cbd2e0; cursor: pointer; padding: 9px 18px; font-size: 13px; font-weight: 600; transition: all .15s ease; font-family: inherit; }
  .lp-tour-nav-btn:hover:not(:disabled) { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.14); color: #eef0f8; }
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
  { label: 'Contact',   href: '#contact'    },
]

function scrollTo(id) {
  const el = document.querySelector(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Nav({ onSignIn, loading, dark, onToggleTheme }) {
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(14px)', background: 'var(--lp-nav-bg)', borderBottom: '1px solid var(--lp-border)' }}>
      <div className="lp-container" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6b8cad,#4a7a9b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>✦</div>
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
        <button className="lp-btn lp-btn-link" onClick={onSignIn}>Sign in</button>
        <button className="lp-btn lp-btn-primary" onClick={onSignIn} disabled={loading}>
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
      <div style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: 680, background: 'var(--lp-panel)', border: '1px solid var(--lp-border-hov)', borderRadius: 14, boxShadow: '0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(107,140,173,.15)', overflow: 'hidden', zIndex: 3 }}>
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
            ['Mehta Industries', 'Data req', '#6b8cad', 40, 'RS'],
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
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
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
            <span key={m} className="lp-mono" style={{ flex: 1, padding: '5px 0', textAlign: 'center', fontSize: 10, background: i === 1 ? '#6b8cad' : 'rgba(255,255,255,.04)', color: i === 1 ? '#fff' : '#8693b0', borderRadius: 4, fontWeight: i === 1 ? 700 : 500 }}>{m}</span>
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

function Hero({ onSignIn, loading, onOpenTour }) {
  return (
    <section id="product" className="lp-sec lp-grain" style={{ paddingTop: 80, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 1100, height: 600, background: 'radial-gradient(ellipse,rgba(107,140,173,.18),transparent 60%)', pointerEvents: 'none' }} />
      <div className="lp-container" style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', maxWidth: 880, margin: '0 auto 56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 100, background: 'rgba(107,140,173,.1)', border: '1px solid rgba(107,140,173,.25)', fontSize: 12, fontWeight: 600, color: '#6b8cad', marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6b8cad', boxShadow: '0 0 12px #6b8cad' }} />
            Built for CA · CS · CMA · Tax & Legal Consultants · Advocates
          </div>
          <h1 className="lp-h1">The operating system<br />for your <span style={{ background: 'linear-gradient(90deg,#6b8cad,#a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>practice</span>.</h1>
          <p className="lp-lede" style={{ margin: '24px auto 0' }}>Worksheets, recurring work, client portal, billing and team workload — all in one place. For service-first practices: CA, CS, CMA, tax consultants, advisory firms, advocates and consultants. Stop juggling Excel, WhatsApp and email.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
            <button className="lp-btn lp-btn-primary" onClick={onSignIn} disabled={loading}>
              {loading ? 'Signing in…' : 'Start free trial →'}
            </button>
            <button className="lp-btn lp-btn-ghost" onClick={onOpenTour}>▶ Watch 90-sec tour</button>
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
    { id: 'workzone', label: 'WorkZone', desc: 'Worksheets per work type. ITR · GST · TDS · Audit.', color: '#6b8cad', glyph: '◧' },
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
    { t: 'Kanban boards', d: 'Drag tasks across statuses. Per-work-type columns.', icon: '⊞', c: '#6b8cad' },
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
      <div style={{ width: '90%', maxWidth: 480, background: 'rgba(15,18,32,.96)', border: '1px solid var(--lp-border-hov)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.7)', overflow: 'hidden', animation: 'lp-fadeUp .4s ease' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--lp-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="lp-mono" style={{ color: 'var(--lp-text-sub)' }}>›</span>
          <span style={{ fontSize: 14, flex: 1 }}>GSTR Acme<span style={{ color: '#6b8cad', animation: 'lp-blink 1s steps(2) infinite' }}>|</span></span>
          <span className="lp-kbd">esc</span>
        </div>
        {[['CL', 'Acme Pvt Ltd · GSTIN 27AABCA1234A1Z5', '#6b8cad', true], ['WK', 'GSTR-3B · Apr 26 · Acme Pvt Ltd', '#f59e0b', false], ['⚡', 'Create new GSTR-3B for Acme', '#10b981', false]].map(([k, t, c, a]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', background: a ? 'rgba(107,140,173,.12)' : 'transparent' }}>
            <span className="lp-mono" style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(107,140,173,.14)', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: a ? 700 : 500, flex: 1 }}>{t}</span>
            {a && <span className="lp-mono" style={{ fontSize: 10, color: '#6b8cad', padding: '2px 6px', background: 'rgba(107,140,173,.16)', border: '1px solid rgba(107,140,173,.3)', borderRadius: 4 }}>↵</span>}
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
      {[['Acme Pvt Ltd', 'Filed', '#10b981', 100], ['Singh & Co', 'Review', '#f59e0b', 80], ['Mehta Industries', 'Data req', '#6b8cad', 40], ['Patel Trading', 'Overdue', '#ef4444', 10], ['Reliance Holdings', 'Filed', '#10b981', 100], ['Tata Components', 'Filed', '#10b981', 100]].map(([c, s, col, p]) => (
        <div key={c} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--lp-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{c}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 9px', background: `rgba(${hex2rgb(col)},.14)`, border: `1px solid rgba(${hex2rgb(col)},.28)`, borderRadius: 100, fontSize: 11, color: col, fontWeight: 600, width: 'fit-content' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />{s}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
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
            <span key={m} className="lp-mono" style={{ flex: 1, padding: '8px 0', textAlign: 'center', fontSize: 10, background: i === 1 ? '#6366f1' : 'rgba(99,102,241,.08)', color: i === 1 ? '#fff' : '#8693b0', borderRadius: 5, fontWeight: 700, border: i === 1 ? 'none' : '1px solid rgba(99,102,241,.18)' }}>{m}</span>
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
      <div style={{ marginTop: 18, padding: '10px 14px', background: 'rgba(255,255,255,.03)', border: '1px dashed rgba(255,255,255,.14)', borderRadius: 8, fontSize: 11.5, color: 'var(--lp-text-sub)' }}>
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
              <div key={i} onClick={() => setStep(i)} style={{ cursor: 'pointer', padding: '14px 16px', background: i === step ? '#131825' : 'transparent', border: `1px solid ${i === step ? 'rgba(107,140,173,.3)' : 'rgba(255,255,255,.07)'}`, borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                {i === step && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#6b8cad' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span className="lp-mono" style={{ fontSize: 10, color: i === step ? '#6b8cad' : '#3a4663', fontWeight: 700 }}>0{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: i === step ? '#eef0f8' : '#8693b0' }}>{s.t}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-sub)', paddingLeft: 24 }}>{s.d}</div>
                {i === step && <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, background: '#6b8cad', animation: 'lp-fillBar 3s linear' }} />}
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
            <h2 className="lp-h2" style={{ marginTop: 8 }}>Speaks fluent <span style={{ color: '#6b8cad' }}>GSTR</span>, <span style={{ color: '#6366f1' }}>TDS</span>, <span style={{ color: '#10b981' }}>ITR</span>.</h2>
            <p className="lp-lede" style={{ marginTop: 18 }}>Every recurring rule, every status, every report is shaped to the Indian compliance calendar — perfect for CA, CS and CMA practices. Define custom work types for advisory, legal or consulting work too.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
              {['ICAI-friendly', 'GSTN periodicity', 'Indian FY Apr–Mar', '₹ INR-first', 'Multi-GSTIN clients'].map(t => (
                <span key={t} className="lp-mono" style={{ fontSize: 11, padding: '5px 10px', background: 'rgba(107,140,173,.08)', border: '1px solid rgba(107,140,173,.22)', borderRadius: 6, color: '#6b8cad', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {items.map(([t, d], i) => (
              <div key={t} style={{ padding: '16px 18px', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 11 }}>
                <div className="lp-mono" style={{ fontSize: 10, color: '#6b8cad', fontWeight: 700, marginBottom: 6 }}>0{i + 1}</div>
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
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(107,140,173,.12)', color: '#6b8cad', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{ic}</div>
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

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA({ onSignIn, loading }) {
  return (
    <section id="contact" className="lp-sec" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse,rgba(107,140,173,.18),transparent 60%)', pointerEvents: 'none' }} />
      <div className="lp-container" style={{ textAlign: 'center', position: 'relative' }}>
        <h2 className="lp-h1" style={{ maxWidth: 820, margin: '0 auto' }}>Make tomorrow's<br />deadline day quiet.</h2>
        <p className="lp-lede" style={{ margin: '24px auto 32px' }}>Start free for 14 days. No credit card. Bring your team. We'll get out of the way.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="lp-btn lp-btn-primary" onClick={onSignIn} disabled={loading}>
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
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6b8cad,#4a7a9b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>✦</div>
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
          <span>© 2026 TaskFlowCo Technologies Pvt Ltd · Made in India 🇮🇳</span>
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
const HM_COLS = ['#1a2035','#2d4a6b','#4a7a9b','#6b8cad','#a5c4de']

const SIDEBAR_NAV = [
  { label: 'Diary',         glyph: '◐', color: '#6366f1' },
  { label: 'WorkZone',      glyph: '◧', color: '#6b8cad' },
  { label: 'Team',          glyph: '◔', color: '#f59e0b' },
  { label: 'Master Data',   glyph: '◓', color: '#8b5cf6' },
  { label: 'Communication', glyph: '◑', color: '#06b6d4' },
  { label: 'Billing',       glyph: '◒', color: '#ec4899' },
  { label: 'Library',       glyph: '◇', color: '#0ea5e9' },
  { label: 'Analytics',     glyph: '◰', color: '#10b981' },
]

function AppChrome({ module, topContent, children, noContentPad }) {
  return (
    <div style={{ display: 'flex', height: '100%', background: '#080b18', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ width: 44, background: '#0a0d1a', borderRight: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 3, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#6b8cad,#4a7a9b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', marginBottom: 10 }}>✦</div>
        {SIDEBAR_NAV.map(n => {
          const active = n.label === module
          return (
            <div key={n.label} title={n.label} style={{ width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: active ? `rgba(${hex2rgb(n.color)},.18)` : 'transparent', color: active ? n.color : '#2a3350' }}>{n.glyph}</div>
          )
        })}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 40, borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0, background: '#0a0d1a' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#eef0f8' }}>{module}</span>
          <div style={{ flex: 1 }}>{topContent}</div>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#6b8cad,#4a7a9b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>PM</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: noContentPad ? 0 : '14px 16px' }}>{children}</div>
      </div>
    </div>
  )
}

function ScrnWorkZone() {
  const cols = [
    { label: 'Backlog',     color: '#3a4663', tasks: ['GSTR-1 · Patel Trading', 'Audit · Sharma Ltd'] },
    { label: 'In Progress', color: '#6b8cad', tasks: ['GSTR-3B · Acme', 'TDS Q4 · Singh & Co', 'ITR · Mehta'] },
    { label: 'Review',      color: '#f59e0b', tasks: ['Payroll Jun · Acme', 'ROC Filing · Tata'] },
    { label: 'Filed',       color: '#10b981', tasks: ['GSTR-3B · Reliance', 'TDS Apr · Acme', 'ITR FY26 · Patel'] },
  ]
  const topContent = (
    <div style={{ display: 'flex', gap: 3, marginLeft: 14 }}>
      {['Stage', 'Board', 'Calendar', 'List'].map((v, i) => (
        <span key={v} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: i === 1 ? 'rgba(107,140,173,.22)' : 'transparent', color: i === 1 ? '#6b8cad' : '#3a4663', fontWeight: 600 }}>{v}</span>
      ))}
    </div>
  )
  return (
    <AppChrome module="WorkZone" topContent={topContent}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, alignItems: 'start' }}>
        {cols.map(col => (
          <div key={col.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '.07em' }}>{col.label}</span>
              <span style={{ fontSize: 9, color: '#3a4663', marginLeft: 'auto' }}>{col.tasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {col.tasks.map(t => (
                <div key={t} style={{ padding: '8px 9px', background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6, fontSize: 11, color: '#b8c4d8', lineHeight: 1.4 }}>{t}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppChrome>
  )
}

function ScrnTeam() {
  const members = [
    { name: 'Priya Mehta',  role: 'Senior CA', tasks: 14, hrs: 38, color: '#6b8cad' },
    { name: 'Rahul Singh',  role: 'Article',    tasks: 9,  hrs: 42, color: '#f59e0b' },
    { name: 'Sneha Patel',  role: 'Staff',      tasks: 11, hrs: 36, color: '#10b981' },
    { name: 'Amit Joshi',   role: 'Manager',    tasks: 7,  hrs: 29, color: '#8b5cf6' },
  ]
  return (
    <AppChrome module="Team">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8693b0', marginBottom: 8 }}>Workload · last 4 weeks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {HM_DATA.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 3 }}>
                {row.map((v, ci) => (
                  <div key={ci} style={{ flex: 1, height: 10, borderRadius: 2, background: HM_COLS[v - 1] }} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: '#3a4663' }}>
            <span>4 weeks ago</span><span>Today</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {members.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 7 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg,${m.color},${m.color}88)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{m.name.split(' ').map(n => n[0]).join('')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 10, color: '#8693b0' }}>{m.role}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.tasks} tasks</div>
                <div style={{ fontSize: 9, color: '#8693b0' }}>{m.hrs}h</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppChrome>
  )
}

function ScrnComms() {
  const clients = ['Acme Pvt Ltd', 'Singh & Co', 'Mehta Industries', 'Patel Trading', 'Reliance Holdings']
  const msgs = [
    { text: 'Please share the bank statements for April.', time: '10:02', out: true },
    { text: 'Sure, attaching now.', time: '10:18', out: false },
    { text: '📎 BankStmt_Apr26.pdf · 1.2 MB', time: '10:18', out: false },
    { text: 'Got it, will update the worksheet.', time: '10:22', out: true },
  ]
  return (
    <AppChrome module="Communication" noContentPad>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', height: '100%' }}>
        <div style={{ borderRight: '1px solid rgba(255,255,255,.06)', overflow: 'auto' }}>
          {clients.map((c, i) => (
            <div key={c} style={{ padding: '9px 11px', borderBottom: '1px solid rgba(255,255,255,.03)', background: i === 0 ? 'rgba(107,140,173,.12)' : 'transparent', cursor: 'pointer' }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{c}</div>
              <div style={{ fontSize: 9, color: '#8693b0', marginTop: 2 }}>via Client Portal</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '9px 13px', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 11, fontWeight: 700 }}>Acme Pvt Ltd</div>
          <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, overflow: 'auto' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.out ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '72%', padding: '7px 11px', borderRadius: 9, background: m.out ? 'rgba(107,140,173,.22)' : '#0a0d1a', border: `1px solid ${m.out ? 'rgba(107,140,173,.3)' : 'rgba(255,255,255,.06)'}`, fontSize: 11 }}>
                  {m.text}
                  <div style={{ fontSize: 9, color: '#3a4663', marginTop: 3, textAlign: 'right' }}>{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 7 }}>
            <div style={{ flex: 1, height: 30, background: '#0a0d1a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '0 9px', fontSize: 11, color: '#3a4663', display: 'flex', alignItems: 'center' }}>Type a message…</div>
            <div style={{ width: 30, height: 30, background: '#6b8cad', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>↑</div>
          </div>
        </div>
      </div>
    </AppChrome>
  )
}

function ScrnLibrary() {
  const sections = [
    { label: 'SOPs',        color: '#6366f1', items: ['GSTR-3B filing SOP', 'TDS payment checklist', 'ITR data prep guide', 'Audit planning SOP'] },
    { label: 'Credentials', color: '#ec4899', items: ['Income Tax portal', 'GST portal', 'MCA21 login', 'Traces – TDS'] },
    { label: 'Resources',   color: '#0ea5e9', items: ['ICAI guidance notes', 'Budget 2026 summary', 'GST circulars FY26', 'Ind AS reference'] },
  ]
  return (
    <AppChrome module="Library">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {sections.map(sec => (
          <div key={sec.label} style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: sec.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 9 }}>{sec.label}</div>
            {sec.items.map(it => (
              <div key={it} style={{ padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.03)', fontSize: 11, color: '#b8c4d8', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgba(${hex2rgb(sec.color)},.16)`, color: sec.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0 }}>◇</span>
                {it}
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppChrome>
  )
}

function ScrnAnalytics() {
  const kpis = [['147', 'Works filed', '#10b981'], ['₹4.2L', 'Billed MTD', '#6b8cad'], ['92h', 'Hours logged', '#f59e0b'], ['8', 'Overdue', '#ef4444']]
  const bars = [['Priya M', 95], ['Rahul S', 72], ['Sneha P', 83], ['Amit J', 61]]
  return (
    <AppChrome module="Analytics">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9 }}>
          {kpis.map(([v, l, c]) => (
            <div key={l} style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 8, padding: '11px 13px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, letterSpacing: '-.02em' }}>{v}</div>
              <div style={{ fontSize: 10, color: '#8693b0', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#0a0d1a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: '11px 13px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8693b0', marginBottom: 10 }}>Staff performance · this month</div>
          {bars.map(([n, p]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#b8c4d8', width: 56, flexShrink: 0 }}>{n}</span>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${p}%`, background: 'linear-gradient(90deg,#6b8cad,#a5b4fc)', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: '#6b8cad', width: 28, textAlign: 'right', fontWeight: 700 }}>{p}%</span>
            </div>
          ))}
        </div>
      </div>
    </AppChrome>
  )
}

function ScrnBilling() {
  const invoices = [
    { client: 'Acme Pvt Ltd',     num: 'INV-142', amt: '₹20,500', status: 'Paid',    col: '#10b981' },
    { client: 'Singh & Co',       num: 'INV-143', amt: '₹8,000',  status: 'Sent',    col: '#6b8cad' },
    { client: 'Mehta Industries', num: 'INV-144', amt: '₹15,000', status: 'Draft',   col: '#f59e0b' },
    { client: 'Patel Trading',    num: 'INV-145', amt: '₹5,500',  status: 'Overdue', col: '#ef4444' },
  ]
  return (
    <AppChrome module="Billing" noContentPad>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
        <div style={{ borderRight: '1px solid rgba(255,255,255,.06)', overflow: 'auto' }}>
          {invoices.map(inv => (
            <div key={inv.num} style={{ padding: '9px 11px', borderBottom: '1px solid rgba(255,255,255,.03)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{inv.client}</span>
                <span style={{ fontSize: 11, color: inv.col, fontWeight: 700 }}>{inv.amt}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: '#8693b0' }}>{inv.num}</span>
                <span style={{ fontSize: 9, color: inv.col }}>{inv.status}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>INV-142 · Acme Pvt Ltd</span>
            <span style={{ padding: '2px 9px', background: 'rgba(16,185,129,.16)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 100, fontSize: 10, color: '#10b981', fontWeight: 700 }}>Paid</span>
          </div>
          {[['GSTR-3B · April 2026', '5,000'], ['TDS Q4 payment', '3,500'], ['ITR data preparation', '12,000']].map(([l, a]) => (
            <div key={l} style={{ display: 'flex', padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.04)', fontSize: 11 }}>
              <span style={{ flex: 1 }}>{l}</span><span style={{ fontWeight: 700 }}>₹{a}</span>
            </div>
          ))}
          <div style={{ display: 'flex', padding: '9px 0', borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 12, fontWeight: 800 }}>
            <span style={{ flex: 1 }}>Total</span><span>₹20,500</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['Tally XML', 'Zoho', 'Email', 'Print'].map(b => (
              <div key={b} style={{ padding: '4px 9px', background: '#0a0d1a', border: '1px solid rgba(255,255,255,.08)', borderRadius: 5, fontSize: 10, color: '#8693b0', cursor: 'pointer' }}>{b}</div>
            ))}
          </div>
        </div>
      </div>
    </AppChrome>
  )
}

const SCRN_TABS = [
  { label: 'WorkZone',  icon: '◧', color: '#6b8cad', Screen: ScrnWorkZone },
  { label: 'Team',      icon: '◔', color: '#f59e0b', Screen: ScrnTeam },
  { label: 'Chat',      icon: '◑', color: '#06b6d4', Screen: ScrnComms },
  { label: 'Library',   icon: '◇', color: '#0ea5e9', Screen: ScrnLibrary },
  { label: 'Analytics', icon: '◰', color: '#10b981', Screen: ScrnAnalytics },
  { label: 'Billing',   icon: '◒', color: '#ec4899', Screen: ScrnBilling },
]

const TOUR_SLIDES = [
  { img: '/tour/slide-00.png', module: 'Your Diary',         color: '#6366f1', title: 'Personal Dashboard & Plan My Day',
    bullets: ["Today's tasks at a glance — across every workspace", 'Plan My Day side panel for focused execution', 'Overdue, today, this-week filters built-in'],
    desc: 'Open TaskFlowCo and your Diary greets you with a personalised dashboard. Every task you own, sorted by status, work type, or due date. The Plan My Day sidebar lets you batch tasks for focused execution.' },
  { img: '/tour/slide-01.png', module: 'Your Diary',         color: '#6366f1', title: 'Kanban Board by Status',
    bullets: ['Pending · In Progress · Under Review · Done columns', 'Client + work type stamped on every card', 'Drag any card to update its status'],
    desc: 'The Board view brings classic Kanban organisation to compliance work. See every task as a card, organised by status. Drag cards across columns to update progress — never lose track of where a return stands.' },
  { img: '/tour/slide-02.png', module: 'Your Diary',         color: '#6366f1', title: 'Group by Work Type',
    bullets: ['GSTR 1 · GSTR 3B · ITR · TDS columns', 'Same data, completely different lens', 'One toggle switches the entire view'],
    desc: 'Switch from status grouping to work-type grouping with a single toggle. Now you see all GSTR 1 tasks together, all TDS returns together — perfect for week-end compliance reviews and capacity planning.' },
  { img: '/tour/slide-03.png', module: 'Your Diary',         color: '#6366f1', title: 'Monthly Deadline Calendar',
    bullets: ['Every due date mapped onto the month', 'Click any date to see what is due', 'Spot crunch days before they arrive'],
    desc: 'The Calendar view maps every compliance deadline across the month. Hover or click any date to see exactly what is due. Plan the next week, anticipate the GSTR-3B crunch, and never miss filing dates.' },
  { img: '/tour/slide-04.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Master Worksheets Grid',
    bullets: ['Every client × every work type in one grid', 'Status, assignee, due date per cell', 'Grid · Pipeline · Funnel views — one click'],
    desc: 'WorkZone Worksheets are your master compliance grid. Every client across every work type, one period at a time. Switch between Grid (table), Pipeline (kanban) and Funnel (stages) views without losing context.' },
  { img: '/tour/slide-05.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Stage-by-Stage Pipeline',
    bullets: ['Not Started → Data Collection → Working → Done', 'Drag cards to advance the stage', 'Filter by period, assignee, or work type'],
    desc: 'The Pipeline view turns compliance work into a visual progress board. Drag client cards through stages: Not Started, Data Collection, Working, Review, Done. See bottlenecks at a glance and re-assign work in seconds.' },
  { img: '/tour/slide-06.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Funnel View — Spot Bottlenecks',
    bullets: ['Total clients at every stage', 'Colour-coded completion percentage', 'Identify stuck clients before deadlines'],
    desc: 'The Funnel view shows completion rates at each stage. Spot where work is piling up before it becomes a deadline crisis. Drill into any stage to see which clients are stuck and why.' },
  { img: '/tour/slide-07.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Big Clients — Monthly Checklist',
    bullets: ['Accounting · Reconciliation · Finalisation', 'Per-client structured monthly checklist', 'Every recurring deliverable, tracked'],
    desc: 'For your major retainer clients — those needing monthly accounting, reconciliation, and finalisation — Big Clients provides a dedicated structured checklist. Never miss a recurring deliverable again.' },
  { img: '/tour/slide-08.png', module: 'WorkZone',           color: '#0ea5e9', title: 'Team Workload Heatmap',
    bullets: ['Active tasks per team member', '7d · 14d · 30d capacity views', 'Spot overloaded and idle members fast'],
    desc: "Team Workload shows every member's active tasks, overdue count, and capacity utilisation. Delegate smartly — see who has room, redistribute before bottlenecks become missed deadlines." },
  { img: '/tour/slide-09.png', module: 'Team',               color: '#f59e0b', title: 'Daily Logs — Attendance & Hours',
    bullets: ['Auto-tracked working days per member', 'Leaves and overtime captured', 'Per-member time entries on tasks'],
    desc: 'Daily Logs automatically track attendance, leaves, and time entries. Useful for billing, payroll calculations, and understanding which work types consume the most team hours.' },
  { img: '/tour/slide-10.png', module: 'Library',            color: '#10b981', title: 'Credentials Vault',
    bullets: ['GST · Income Tax · MCA · Banking', 'Searchable by client name or PAN', 'Encrypted at rest, audit-logged access'],
    desc: 'The Credentials Library stores every portal password — GST portal, Income Tax, MCA, banking — encrypted and instant to retrieve. Stop the WhatsApp scramble when a client asks for a download.' },
  { img: '/tour/slide-11.png', module: 'Analytics',          color: '#10b981', title: 'Org-Wide Performance Dashboard',
    bullets: ['Tasks completed · pending · overdue', 'Breakdown by work type', 'Drill into any segment for details'],
    desc: 'Analytics gives owners and partners an org-wide compliance dashboard. See total tasks completed this FY, pending breakdown by work type, and overdue heatmap — all in real-time, all auto-computed.' },
  { img: '/tour/slide-12.png', module: 'Communication',      color: '#06b6d4', title: 'Client Connect — Document Requests',
    bullets: ['Raise GST / IT data requests directly', 'Track per-client request status', 'Reminders auto-sent on schedule'],
    desc: 'Client Connect lets you raise document requests directly to clients. No more WhatsApp follow-ups — track every request status and let TaskFlowCo auto-send reminders on a schedule you define.' },
  { img: '/tour/slide-13.png', module: 'Communication',      color: '#06b6d4', title: 'Shareable Client Portal',
    bullets: ['One simple shareable link per client', 'Upload without login or signup', 'No app download required'],
    desc: 'Clients receive a simple shareable link. They upload documents directly — no login, no app, no friction. Documents land in your TaskFlowCo workspace, automatically tagged to the right task.' },
  { img: '/tour/slide-14.png', module: 'Communication',      color: '#06b6d4', title: 'Bulk Email to Clients',
    bullets: ['Filter clients by work type', 'Templates for common messages', 'BCC by default for client privacy'],
    desc: 'Bulk Email lets you compose once and send to all your clients — filter by work type, use templates for common messages, BCC by default for privacy. Perfect for filing-deadline reminders.' },
  { img: '/tour/slide-15.png', module: 'Billing',            color: '#ec4899', title: 'GST-Compliant Tax Invoice',
    bullets: ['Auto-calculated GST + TDS deductions', 'Partial payments tracked per invoice', 'Send · Share · Mark Paid — all in one panel'],
    desc: 'Generate GST-compliant tax invoices in seconds with automatic TDS deduction and GST rate selection. Track partial payments, send via email, and share secure PDF links — all from one panel.' },
  { img: '/tour/slide-16.png', module: 'Billing',            color: '#ec4899', title: 'Complete Client Statement',
    bullets: ['Invoiced · Paid · TDS Credit · Balance', 'Outstanding amount calculated automatically', 'Generate & print in a single click'],
    desc: 'Pull a full client statement in one click — total invoiced, amounts paid, TDS credit available, and outstanding balance. Useful for year-end reconciliation, dispute resolution, and client review meetings.' },
  { img: '/tour/slide-17.png', module: 'Billing',            color: '#ec4899', title: 'Export to Tally · Zoho · Excel',
    bullets: ['Tally JSON · Zoho Books CSV · Excel XLSX', 'Import-ready format, no clean-up needed', 'All formats always current'],
    desc: 'Export all your TaskFlowCo billing data to Tally, Zoho Books, or Excel — import-ready, with one click. Stop the manual data entry between systems. Save 2-3 hours per month, every month.' },
  { img: '/tour/slide-18.png', module: 'TaskFlowCo',         color: '#6366f1', title: 'One Platform, Zero Chaos',
    bullets: ['Work · Clients · Team · Billing in one platform', 'Built specifically for Indian CAs', 'Setup in under 10 minutes'],
    desc: 'TaskFlowCo is the operating system for your accounting practice — work, clients, team, and billing in one platform. Built specifically for the way Indian chartered accountants actually work.' },
]

function TourModal({ open, onClose }) {
  const [idx, setIdx] = useState(0)
  const total = TOUR_SLIDES.length

  const goPrev = () => setIdx(i => Math.max(0, i - 1))
  const goNext = () => setIdx(i => Math.min(total - 1, i + 1))

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight')  goNext()
      if (e.key === 'ArrowLeft')   goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, idx, onClose])

  useEffect(() => { if (open) setIdx(0) }, [open])

  if (!open) return null
  const s = TOUR_SLIDES[idx]

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1280, height: 'min(740px, 92vh)',
          background: '#080b18', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 16, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 50px 120px rgba(0,0,0,.92)',
          animation: 'lp-modal-in .22s ease',
        }}
      >
        {/* Header */}
        <div style={{padding:'14px 18px',borderBottom:'1px solid rgba(255,255,255,.07)',display:'flex',alignItems:'center',gap:14,flexShrink:0,background:'#070a14'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <div style={{width:24,height:24,borderRadius:7,background:'linear-gradient(135deg,#6366f1,#4f46e5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12}}>✦</div>
            <span style={{fontSize:13,fontWeight:700,color:'#eef0f8',letterSpacing:'-0.01em'}}>Product Tour</span>
            <span style={{fontSize:11,color:'#3a4663',fontFamily:"'JetBrains Mono',monospace"}}>· 19 modules</span>
          </div>

          {/* Progress segments */}
          <div style={{display:'flex',gap:3,flex:1,alignItems:'center'}}>
            {TOUR_SLIDES.map((t, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                title={`${t.module} — ${t.title}`}
                style={{
                  height: 4, flex: i === idx ? 3 : 1, border: 'none', borderRadius: 2, padding: 0,
                  background: i === idx ? s.color : i < idx ? 'rgba(255,255,255,.32)' : 'rgba(255,255,255,.08)',
                  cursor: 'pointer', transition: 'flex .3s ease, background .2s ease',
                }}
              />
            ))}
          </div>

          <button onClick={onClose} style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'#8693b0',cursor:'pointer',padding:'5px 10px',fontSize:11,fontFamily:'inherit',flexShrink:0}}>✕ Esc</button>
        </div>

        {/* Body: left/right split */}
        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
          {/* LEFT — explanation */}
          <div
            key={`left-${idx}`}
            className="lp-tour-text"
            style={{
              flex:'0 0 420px',padding:'34px 32px 28px',display:'flex',flexDirection:'column',
              borderRight:'1px solid rgba(255,255,255,.06)',
              background:`linear-gradient(160deg, ${s.color}0a 0%, transparent 50%)`,
              overflowY:'auto',minWidth:0,
            }}
          >
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
              <span style={{
                fontSize:10, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase',
                color:s.color, background:`${s.color}1F`, padding:'4px 10px', borderRadius:4,
                fontFamily:"'JetBrains Mono',monospace",
              }}>{s.module}</span>
              <span style={{fontSize:11,color:'#3a4663',fontFamily:"'JetBrains Mono',monospace"}}>
                Step {String(idx+1).padStart(2,'0')} / {total}
              </span>
            </div>

            <h2 style={{fontSize:26,fontWeight:800,color:'#eef0f8',letterSpacing:'-0.025em',lineHeight:1.18,margin:'0 0 14px'}}>
              {s.title}
            </h2>

            <p style={{fontSize:14,color:'#a4afc8',lineHeight:1.62,margin:'0 0 22px'}}>
              {s.desc}
            </p>

            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              {s.bullets.map((b, i) => (
                <div key={i} className="lp-tour-bullet" style={{display:'flex',alignItems:'flex-start',gap:11,padding:'9px 10px',borderRadius:7,transition:'background .15s ease'}}>
                  <span style={{color:s.color,fontSize:12,fontWeight:700,marginTop:2,flexShrink:0,width:14,height:14,borderRadius:4,background:`${s.color}22`,display:'flex',alignItems:'center',justifyContent:'center'}}>✓</span>
                  <span style={{fontSize:13,color:'#cbd2e0',lineHeight:1.5}}>{b}</span>
                </div>
              ))}
            </div>

            <div style={{flex:1,minHeight:18}}/>

            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:'#3a4663',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.04em'}}>
              <kbd style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',borderRadius:3,padding:'2px 6px',fontSize:9,color:'#5b6580'}}>←</kbd>
              <kbd style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',borderRadius:3,padding:'2px 6px',fontSize:9,color:'#5b6580'}}>→</kbd>
              <span style={{marginLeft:4}}>to navigate</span>
              <span style={{marginLeft:12}}>·</span>
              <kbd style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',borderRadius:3,padding:'2px 6px',fontSize:9,color:'#5b6580'}}>Esc</kbd>
              <span>to close</span>
            </div>
          </div>

          {/* RIGHT — screenshot */}
          <div style={{flex:1,background:'#0a0d1a',display:'flex',alignItems:'center',justifyContent:'center',padding:24,position:'relative',minWidth:0,overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse at 50% 50%, ${s.color}10 0%, transparent 60%)`,pointerEvents:'none'}}/>
            <img
              key={`img-${idx}`}
              className="lp-tour-img"
              src={s.img}
              alt={s.title}
              style={{
                maxWidth:'100%',maxHeight:'100%',objectFit:'contain',
                borderRadius:10,
                boxShadow:`0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06), 0 0 80px ${s.color}14`,
                display:'block',
              }}
              draggable={false}
            />
          </div>
        </div>

        {/* Footer nav */}
        <div style={{padding:'12px 18px',borderTop:'1px solid rgba(255,255,255,.07)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'#070a14'}}>
          <button onClick={goPrev} disabled={idx === 0} className="lp-tour-nav-btn">‹  Prev</button>

          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontSize:11,color:'#5b6580',fontFamily:"'JetBrains Mono',monospace"}}>
              {String(idx+1).padStart(2,'0')} / {String(total).padStart(2,'0')}
            </span>
          </div>

          {idx === total - 1
            ? <button onClick={onClose} className="lp-tour-nav-btn primary">Finish ✓</button>
            : <button onClick={goNext} className="lp-tour-nav-btn primary">Next  ›</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function LandingPage({ onSignIn, loading }) {
  const [dark, setDark] = useState(true)
  const [tourOpen, setTourOpen] = useState(false)
  return (
    <div className="lp-root" data-theme={dark ? 'dark' : 'light'}>
      <style>{CSS}</style>
      <TourModal open={tourOpen} onClose={() => setTourOpen(false)} />
      <Nav onSignIn={onSignIn} loading={loading} dark={dark} onToggleTheme={() => setDark(d => !d)} />
      <Hero onSignIn={onSignIn} loading={loading} onOpenTour={() => setTourOpen(true)} />
      <Stats />
      <Problem />
      <Modules />
      <Features />
      <TourVideo />
      <Compliance />
      <Security />
      <FAQ />
      <FinalCTA onSignIn={onSignIn} loading={loading} />
      <Footer />
    </div>
  )
}
