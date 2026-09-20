import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase, signInWithEmailLink } from './lib/supabase'
import InstallPWAButton from './components/InstallPWAButton.jsx'
import CheckoutButton from './components/CheckoutButton.jsx'

// "Watch demo" tour is loaded on demand.
const LaunchTour = lazy(() => import('./LaunchTour.jsx'))

// ── Design tokens + styles ported from the "Landing Page v2" handoff (editorial,
// Zoho/Razorpay-style) with the user-selected navy accent. Scoped to .lp2 so
// nothing leaks into the app shell; the <style> unmounts with the component
// (only mounted while logged-out). Legacy aliases (--card, --grad, --text…) are
// kept so the existing AuthModal / UpgradeModal / DemoForm markup keeps working.
const CSS = `
.lp2{
  /* v2 palette — light (primary) */
  --blue:#0E2A47; --blue-strong:#0A1F35;
  --bg:#FBF9F5; --bg-alt:#F4F1EA; --panel:#FFFFFF; --field:#F6F3EC;
  --ink:#132338; --ink-2:#55637A; --muted:#8C93A3;
  --border:#E7E2D8; --border-2:#EFEBE2;
  --nav-bg:rgba(251,249,245,.85); --foot:#14243A; --teal:#0E8F89;
  --laptop:#1A2A40; --laptopbase:#C9CFD9;
  --hero:radial-gradient(760px 360px at 80% 8%,rgba(14,42,71,.06),transparent),#F4F1EA;
  --serif:'Source Serif 4',Georgia,serif;
  --r:14px; --r2:8px;
  /* legacy aliases for shared modals/forms */
  --grad:var(--blue); --card:var(--panel); --card-border:var(--border); --surface:var(--panel);
  --text:var(--ink); --text-2:var(--ink-2); --sub:var(--muted);
  --danger:#D6455A; --success:#0E8F89;
  --shadow-panel:0 24px 60px -30px rgba(19,35,56,.4);
  --shadow-cta:0 14px 30px -16px rgba(14,42,71,.55);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif; background:var(--bg); color:var(--ink);
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility;
  min-height:100vh; transition:background .3s ease,color .3s ease;
}
.lp2[data-theme="dark"]{
  --blue:#4C86F0; --blue-strong:#3E76DC;
  --bg:#0B1B2C; --bg-alt:#0F2132; --panel:#132A3E; --field:#0F2132;
  --ink:#EAF1F8; --ink-2:#AEC0D4; --muted:#7E93AD;
  --border:rgba(255,255,255,.10); --border-2:rgba(255,255,255,.06);
  --nav-bg:rgba(11,27,44,.85); --foot:#08131F; --teal:#3FD0C9;
  --laptop:#050D16; --laptopbase:#243244;
  --hero:radial-gradient(760px 360px at 80% 8%,rgba(76,134,240,.16),transparent),#0F2132;
  --shadow-panel:0 24px 60px -30px rgba(6,16,30,.7);
  --shadow-cta:0 14px 30px -16px rgba(0,0,0,.5);
}
.lp2 *{box-sizing:border-box}
.lp2 .mono{font-family:'JetBrains Mono',monospace}
.lp2 .wrap{max-width:1200px;margin:0 auto;padding:0 32px}
.lp2 h1,.lp2 h2,.lp2 h3{margin:0}
.lp2 .serif{font-family:var(--serif);letter-spacing:-.02em}
.lp2 .eyebrow{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--blue)}
.lp2 a{color:inherit;text-decoration:none}

/* buttons */
.lp2 .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:15px;padding:14px 24px;border-radius:var(--r2);cursor:pointer;border:0;white-space:nowrap;font-family:inherit;transition:background .15s ease,border-color .15s ease,transform .15s ease,filter .15s ease}
.lp2 .btn-primary{background:var(--blue);color:#fff}
.lp2 .btn-primary:hover{background:var(--blue-strong)}
.lp2 .btn-primary:disabled{opacity:.6;cursor:not-allowed}
.lp2 .btn-ghost{background:var(--panel);border:1px solid var(--border);color:var(--ink)}
.lp2 .btn-ghost:hover{border-color:var(--blue)}
.lp2 .btn-sm{padding:10px 18px;font-size:14px}

/* form fields (shared with DemoForm / AuthModal) */
.lp2 .field{border:1px solid var(--border);background:var(--field);border-radius:8px;padding:11px 13px;font-size:14px;color:var(--ink);font-family:inherit;outline:none}
.lp2 .field:focus{border-color:var(--blue)}
.lp2 .lbl{display:block;font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:6px}
.lp2 .chipbtn{font-size:13px;font-weight:700;padding:9px 15px;border-radius:8px;cursor:pointer;border:1px solid var(--border);background:var(--field);color:var(--ink-2);user-select:none}
.lp2 .chipbtn.on{background:var(--blue);color:#fff;border-color:transparent}

/* nav */
.lp2 .nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(10px);background:var(--nav-bg);border-bottom:1px solid var(--border)}
.lp2 .nav .row{display:flex;align-items:center;justify-content:space-between;gap:24px;height:66px}
.lp2 .nav .links{display:flex;align-items:center;gap:26px;font-size:14px;font-weight:600;color:var(--ink-2)}
.lp2 .nav .links a:hover{color:var(--ink)}
.lp2 .nav .right{display:flex;align-items:center;gap:12px}
.lp2 .theme-toggle{width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--ink-2);display:flex;align-items:center;justify-content:center;cursor:pointer}
.lp2 .login-link{font-size:14px;font-weight:700;color:var(--ink);padding:9px 14px;border:1px solid var(--border);border-radius:var(--r2)}
.lp2 .login-link:hover{border-color:var(--blue)}

/* logo */
.lp2 .logo{display:inline-flex;align-items:center;gap:10px;color:var(--ink)}
.lp2 .logo .tile{width:30px;height:30px;border-radius:8px;background:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lp2 .logo .word{font-weight:800;font-size:18px;letter-spacing:-.02em}
.lp2 .logo .word .co{color:var(--blue)}

/* hero */
.lp2 .hero{background:var(--hero);border-bottom:1px solid var(--border)}
.lp2 .hero .inner{display:flex;flex-wrap:wrap;gap:48px;align-items:center;padding:60px 0 64px}
.lp2 .hero .copy{flex:1 1 400px;min-width:0}
.lp2 .hero h1{font-family:var(--serif);font-size:clamp(38px,4.8vw,58px);line-height:1.05;letter-spacing:-.02em;font-weight:600;color:var(--ink);margin:0 0 20px}
.lp2 .hero h1 .accent{color:var(--blue)}
.lp2 .hero .lede{font-size:17px;line-height:1.65;color:var(--ink-2);max-width:46ch;margin:0 0 30px}
.lp2 .hero .checks{display:flex;align-items:center;gap:20px;margin-top:28px;flex-wrap:wrap;font-size:13.5px;color:var(--ink-2);font-weight:600}
.lp2 .hero .checks span{display:inline-flex;align-items:center;gap:8px}
.lp2 .stage{flex:1 1 520px;min-width:0;position:relative;padding:30px 10px}
.lp2 .stage .frame{position:relative;margin:0 auto;max-width:620px}
.lp2 .floatcard{display:flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:9px 12px;box-shadow:0 16px 36px -20px rgba(19,35,56,.5)}

@keyframes lpfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes lpfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}

/* sections */
.lp2 .band{background:var(--bg-alt);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.lp2 .sec-head h2{font-family:var(--serif);font-size:clamp(30px,3.4vw,42px);font-weight:600;letter-spacing:-.02em;color:var(--ink)}

/* features */
.lp2 .grp-label{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.lp2 .grp-label span{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--teal)}
.lp2 .grp-label .rule{flex:1;height:1px;background:var(--border)}
.lp2 .fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.lp2 .fcell{background:var(--panel);padding:24px;transition:background .15s ease}
.lp2 .fcell:hover{background:var(--field)}
.lp2 .fcell .fic{width:42px;height:42px;border-radius:11px;background:var(--field);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--blue);margin-bottom:15px}
.lp2 .fcell h3{font-size:16.5px;font-weight:800;letter-spacing:-.01em;color:var(--ink);margin:0 0 7px}
.lp2 .fcell p{font-size:13.5px;line-height:1.6;color:var(--ink-2);margin:0}

/* product showcase */
.lp2 .tabrow{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.lp2 .ptab{white-space:nowrap;font-size:13px;font-weight:700;padding:9px 16px;border-radius:var(--r2);cursor:pointer;font-family:inherit;border:1px solid var(--border);background:var(--panel);color:var(--ink-2)}
.lp2 .ptab.on{background:var(--blue);color:#fff;border-color:transparent}
.lp2 .browser{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--panel);box-shadow:0 24px 60px -34px rgba(19,35,56,.35)}
.lp2 .browser .chrome{display:flex;align-items:center;gap:8px;padding:11px 14px;background:var(--bg-alt);border-bottom:1px solid var(--border)}
.lp2 .browser .addr{flex:1;max-width:280px;margin:0 auto;text-align:center;font-size:11px;color:var(--muted);background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:4px 10px}
.lp2 .prow{display:flex;align-items:center;justify-content:space-between;background:var(--bg-alt);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:9px}
.lp2 .pill-ok{font-size:11px;font-weight:700;color:var(--teal);background:var(--field);border:1px solid var(--border);padding:4px 10px;border-radius:99px;white-space:nowrap}
.lp2 .pill-wait{font-size:11px;font-weight:700;color:#B4791C;background:rgba(244,165,42,.14);border:1px solid rgba(244,165,42,.28);padding:4px 10px;border-radius:99px;white-space:nowrap}

/* steps */
.lp2 .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}
.lp2 .step{border-top:2px solid var(--border);padding-top:18px}
.lp2 .step .n{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:var(--blue);color:#fff;font-weight:800;font-size:15px;margin-bottom:14px}
.lp2 .step h3{font-size:16.5px;font-weight:800;letter-spacing:-.01em;color:var(--ink);margin:0 0 7px}
.lp2 .step p{font-size:13.5px;line-height:1.6;color:var(--ink-2);margin:0}

/* capability band */
.lp2 .capband{background:var(--foot);color:#fff}
.lp2 .capgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:36px;padding:56px 0}
.lp2 .capgrid .big{font-family:var(--serif);font-size:24px;font-weight:600;letter-spacing:-.01em;line-height:1.15;color:#fff}

/* testimonial */
.lp2 .quote{font-family:var(--serif);font-size:clamp(24px,3vw,34px);font-weight:500;line-height:1.4;letter-spacing:-.01em;color:var(--ink);margin:0 auto 26px;max-width:24ch}

/* pricing */
.lp2 .seg{display:inline-flex;margin-top:20px;padding:4px;border-radius:999px;background:var(--panel);border:1px solid var(--border)}
.lp2 .seg button{font-size:13px;font-weight:700;padding:8px 16px;border-radius:999px;cursor:pointer;font-family:inherit;border:0;background:transparent;color:var(--ink-2)}
.lp2 .seg button.on{background:var(--blue);color:#fff}
.lp2 .pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;align-items:start}
.lp2 .plan{position:relative;background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:26px}
.lp2 .plan.featured{border:2px solid var(--blue);box-shadow:0 18px 40px -24px rgba(14,42,71,.5)}
.lp2 .plan .tag{position:absolute;top:-11px;left:24px;background:var(--blue);color:#fff;font-size:11px;font-weight:800;padding:4px 11px;border-radius:99px}
.lp2 .plan h3{font-size:16px;font-weight:800;color:var(--ink);margin:0}
.lp2 .plan .amt{font-family:var(--serif);font-size:38px;font-weight:600;letter-spacing:-.02em;color:var(--ink);margin:12px 0 2px}
.lp2 .plan .amt small{font-size:14px;font-weight:600;color:var(--muted);font-family:'Plus Jakarta Sans',sans-serif}
.lp2 .plan ul{list-style:none;margin:20px 0 0;padding:20px 0 0;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:11px}
.lp2 .plan li{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--ink-2);line-height:1.4}

/* faq */
.lp2 .faq-item{border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--panel)}
.lp2 .faq-q{display:flex;align-items:center;gap:14px;padding:17px 20px;cursor:pointer}
.lp2 .faq-q span:first-child{flex:1;font-weight:700;font-size:15px;color:var(--ink)}
.lp2 .faq-sign{font-size:22px;font-weight:400;color:var(--blue);line-height:1;width:18px;text-align:center}
.lp2 .faq-a{padding:0 20px 18px;font-size:14px;line-height:1.65;color:var(--ink-2)}

/* demo */
.lp2 .demo-card{border:1px solid var(--border);border-radius:20px;overflow:hidden;background:var(--panel);display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.lp2 .demo-left{padding:46px;background:var(--foot);color:#fff}

/* footer */
.lp2 footer{background:var(--foot);color:#9FB6D4}
.lp2 footer .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;padding:56px 0 30px}
.lp2 footer h5{color:#fff;font-size:13px;font-weight:700;margin:0 0 14px}
.lp2 footer a{display:block;font-size:13.5px;color:#9FB6D4;padding:5px 0}
.lp2 footer a:hover{color:#fff}
.lp2 footer .bottom{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12.5px;color:#7E93AD;padding:20px 0;border-top:1px solid rgba(255,255,255,.1)}

@media (max-width:760px){
  .lp2 .nav .links .navlink{display:none}
  .lp2 .floatcard{display:none}
  .lp2 .wrap{padding:0 20px}
}
`

// ── Wordmark: navy tile + white check + "Taskflowco" ──
function Logo({ footer }) {
  return (
    <span className="logo" style={footer ? { color: '#fff' } : undefined}>
      <span className="tile">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19.5 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="word" style={footer ? { color: '#fff' } : undefined}>Taskflow<span className="co" style={footer ? { color: '#5B9BFF' } : undefined}>co</span></span>
    </span>
  )
}

const check = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><path d="M5 12.5 10 17 19 7" stroke="var(--teal,#0E8F89)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>

function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

// icon helpers
const fic = paths => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>

// ── Feature groups (copy from handoff) ──
const FEATURE_GROUPS = [
  { group: 'Compliance & filing', items: [
    { p: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h6M9 16l1.6 1.6L14 14.5" /></>, h: 'GST Desk', d: 'Track every GSTR return by stage and reconcile your internal status against the GST portal — so nothing is filed twice or slips through.' },
    { p: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h4" /></>, h: 'ITR Desk', d: 'Per-client income-tax compilation with a completeness checklist and a reusable, firm-wide ITR template.' },
    { p: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>, h: 'Deadline engine', d: 'GST, ITR, TDS and ROC due dates auto-populate for every client and work type, with reminders that escalate as the date nears.' },
  ] },
  { group: 'Workflow', items: [
    { p: <><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="10" y="4" width="4" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" /></>, h: 'WorkZone board', d: 'Every client task moves pending → in progress → review → filed, with stage-based workflows tailored per work type.' },
    { p: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>, h: 'Auto-generated worksheets', d: 'Recurring monthly and quarterly filings are created for you each cycle — no manual setup, nothing forgotten.' },
    { p: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, h: 'Aging & time tracking', d: 'See how long work has sat in a stage, plus actual hours vs. estimate on every task.' },
  ] },
  { group: 'Clients', items: [
    { p: <><path d="M6 16a4 4 0 0 1 1-7.9A5 5 0 0 1 17 8a3.5 3.5 0 0 1 1 6.9" /><path d="M12 11v6m0-6-2 2m2-2 2 2" /></>, h: 'Client Portal', d: 'Request documents and collect them from clients directly — each upload linked to the right task.' },
    { p: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, h: 'Credential vault', d: 'Store client portal logins encrypted, with one-click copy-and-open to the GST and Income-Tax portals.' },
    { p: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 8 7 5 7-5" /></>, h: 'Automated reminders', d: 'Chase upcoming and overdue work by email — bulk from your firm’s Gmail, or fully automatic every cycle.' },
  ] },
  { group: 'Firm operations', items: [
    { p: <><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" /><circle cx="12" cy="11" r="2.2" /></>, h: 'Attendance & time', d: 'Geotagged GPS check-in / check-out and daily time logging for your whole team.' },
    { p: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>, h: 'Billing & exports', d: 'Invoices, proposals, payments and statements — with one-click export to Tally and Zoho Books.' },
    { p: <path d="M5 19V5M5 19h14M9 16v-4M13 16V8M17 16v-6" />, h: 'Analytics & workload', d: 'Revenue, on-time %, pending work and who’s overloaded — the health of your firm at a glance.' },
  ] },
]

// ── Hero product stage: laptop dashboard + floating module cards ──
function HeroStage() {
  const DASH_NAV = [['Home', 1], ['Clients', 0], ['WorkZone', 0], ['Compliance', 0], ['Documents', 0], ['Team', 0], ['Billing', 0], ['Reports', 0]]
  const dot = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="8" /></svg>
  const STATS = [
    { v: '128', k: 'Total Clients', color: 'var(--blue)' },
    { v: '24', k: 'Active Tasks', color: 'var(--ink)' },
    { v: '8', k: 'Due Today', color: '#D68A17' },
    { v: '4', k: 'Overdue', color: '#D6455A' },
  ]
  const pillA = { fontSize: 7.5, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(14,42,71,.10)', color: 'var(--blue)' }
  const pillB = { fontSize: 7.5, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(244,165,42,.16)', color: '#B4791C' }
  const pillC = { fontSize: 7.5, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(20,199,192,.16)', color: 'var(--teal)' }
  const WORK = [
    { t: 'GST Filing – ABC Ltd', s: 'In Progress', pill: pillA },
    { t: 'ITR Review – Mehta & Co', s: 'Review', pill: pillC },
    { t: 'Audit Papers – XYZ', s: 'Due Today', pill: pillB },
    { t: 'Client Docs – Kumar', s: 'Pending', pill: pillB },
  ]
  const DEADS = [['GST Return', 'Apr 20'], ['TDS Return', 'Apr 25'], ['ITR Filing', 'Jul 30'], ['Audit Report', 'Sep 30']]
  const FLOAT = [
    { label: 'Clients', sub: 'All client info in one place', color: '#0E8F89', tint: 'rgba(20,199,192,.14)', pos: { left: '-6%', top: '8%' }, dur: '6s', icon: fic(<><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0 1 10 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5M17 14.5a5 5 0 0 1 3 5.5" /></>) },
    { label: 'Tasks', sub: 'Assign, track, complete', color: 'var(--blue)', tint: 'rgba(14,42,71,.10)', pos: { left: '38%', top: '-5%' }, dur: '7s', icon: fic(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5 11 15l5-5.5" /></>) },
    { label: 'Compliance', sub: 'Never miss a deadline', color: '#D6455A', tint: 'rgba(214,69,90,.12)', pos: { right: '-5%', top: '4%' }, dur: '6.5s', icon: fic(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>) },
    { label: 'Reports', sub: 'Your practice at a glance', color: 'var(--blue)', tint: 'rgba(14,42,71,.10)', pos: { right: '-7%', bottom: '14%' }, dur: '7.5s', icon: fic(<path d="M5 19V5M5 19h14M9 16v-4M13 16V8M17 16v-6" />) },
    { label: 'Team', sub: 'Work together with clarity', color: '#D68A17', tint: 'rgba(244,165,42,.16)', pos: { left: '-3%', bottom: '6%' }, dur: '6.8s', icon: fic(<><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></>) },
  ]
  return (
    <div className="stage">
      <div className="frame">
        {/* laptop */}
        <div style={{ border: '11px solid var(--laptop)', borderBottom: 'none', borderRadius: '16px 16px 0 0', overflow: 'hidden', background: 'var(--panel)', boxShadow: '0 40px 80px -40px rgba(19,35,56,.5)' }}>
          <div style={{ display: 'flex', background: 'var(--panel)', minHeight: 360 }}>
            {/* sidebar */}
            <div style={{ width: 132, flexShrink: 0, background: 'var(--bg-alt)', borderRight: '1px solid var(--border)', padding: '12px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px 12px' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19.5 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)' }}>Taskflowco</span>
              </div>
              {DASH_NAV.map(([name, on]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: on ? 700 : 600, padding: '6px 8px', borderRadius: 6, marginBottom: 2, color: on ? '#fff' : 'var(--ink-2)', background: on ? 'var(--blue)' : 'transparent' }}>
                  <span style={{ width: 14, height: 14, display: 'inline-flex', color: on ? '#fff' : 'var(--muted)' }}>{dot}</span>{name}
                </div>
              ))}
            </div>
            {/* main */}
            <div style={{ flex: 1, minWidth: 0, padding: '13px 14px', background: 'var(--panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Welcome back, Vaibhav 👋</div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>Here's what's happening in your practice today</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}>This Board ▾</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 12 }}>
                {STATS.map(s => (
                  <div key={s.k} style={{ background: 'var(--field)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 9px' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{s.k}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 11 }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 7 }}>Today's Work</div>
                  {WORK.map(w => (
                    <div key={w.t} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: '1px solid var(--border-2)' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--field)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.t}</div></div>
                      <span style={w.pill}>{w.s}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 7 }}>Upcoming Deadlines</div>
                  {DEADS.map(([n, d]) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-2)' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--ink-2)' }}>{n}</span>
                      <span className="mono" style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--blue)' }}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ height: 12, width: '112%', marginLeft: '-6%', background: 'var(--laptopbase)', borderRadius: '0 0 12px 12px' }} />

        {/* floating cards */}
        {FLOAT.map(f => (
          <div key={f.label} className="floatcard" style={{ position: 'absolute', zIndex: 5, ...f.pos, animation: `lpfloat ${f.dur} ease-in-out infinite` }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: f.tint, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.icon}</span>
            <div><div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>{f.label}</div><div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>{f.sub}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Product showcase (tabbed browser window) ──
const TABS = [
  { name: 'GST Desk', addr: 'app.taskflowco.in/gst' },
  { name: 'Client Portal', addr: 'app.taskflowco.in/portal' },
  { name: 'Billing', addr: 'app.taskflowco.in/billing' },
  { name: 'Analytics', addr: 'app.taskflowco.in/analytics' },
]
function ProductShowcase() {
  const [tab, setTab] = useState('GST Desk')
  const addr = (TABS.find(t => t.name === tab) || TABS[0]).addr
  const gstRows = [
    { name: 'Milind Rathod', ret: 'GSTR-3B', internal: 'Reviewed', portal: 'Filed', ok: true },
    { name: 'Omkar Mane', ret: 'GSTR-1', internal: 'Filed', portal: 'Pending', ok: false },
    { name: 'OM & Associates', ret: 'GSTR-3B', internal: 'Reviewed', portal: 'Filed', ok: true },
    { name: 'Raj Bhoite', ret: 'GSTR-1', internal: 'In progress', portal: 'Not filed', ok: false },
  ]
  const portalRows = [
    { doc: 'Bank statements FY25-26', client: 'Sandip Kale', status: 'Received', ok: true },
    { doc: 'Form 16 · FY24-25', client: 'Milind Rathod', status: 'Approved', ok: true },
    { doc: 'Purchase invoices — Aug', client: 'Raj Bhoite', status: '3 pending', ok: false },
    { doc: 'Aadhaar + PAN', client: 'OM & Associates', status: 'Requested', ok: false },
  ]
  const billRows = [
    { no: '#INV-2041', desc: 'Rathod · Filing fee', amt: '₹12,000', status: 'Paid', ok: true },
    { no: '#INV-2038', desc: 'OM & Assoc · Advisory', amt: '₹8,500', status: 'Sent', ok: false },
    { no: '#INV-2044', desc: 'Kale · ITR filing', amt: '₹4,000', status: 'Paid', ok: true },
  ]
  const aStats = [['On-time %', '96%'], ['Filed · month', '128'], ['Outstanding', '₹20.5k']]
  const bars = ['45%', '68%', '55%', '90%', '72%', '84%']
  const uploadIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V5m0 0L8 9m4-4 4 4" /><path d="M5 17v2h14v-2" /></svg>
  return (
    <>
      <div className="tabrow">
        {TABS.map(t => <button key={t.name} className={'ptab' + (tab === t.name ? ' on' : '')} onClick={() => setTab(t.name)}>{t.name}</button>)}
      </div>
      <div className="browser">
        <div className="chrome">
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E2626B' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F4C04E' }} /><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5FCE8E' }} />
          <span className="addr mono">{addr}</span>
        </div>
        <div style={{ padding: 18, minHeight: 340 }}>
          {tab === 'GST Desk' && (
            <div style={{ animation: 'lpfade .35s ease' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 14 }}>GST Desk · Reconciliation — Sep 2026</div>
              {gstRows.map(r => (
                <div key={r.name} className="prow">
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.3 }}>{r.name} · {r.ret}</div><div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Internal: {r.internal}</div></div>
                  <span className={r.ok ? 'pill-ok' : 'pill-wait'}>Portal: {r.portal}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'Client Portal' && (
            <div style={{ animation: 'lpfade .35s ease' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 14 }}>Client Portal · Document requests</div>
              {portalRows.map(r => (
                <div key={r.doc} className="prow">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--field)', border: '1px solid var(--border)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{uploadIcon}</span>
                    <div><div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{r.doc}</div><div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{r.client}</div></div>
                  </div>
                  <span className={r.ok ? 'pill-ok' : 'pill-wait'}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'Billing' && (
            <div style={{ animation: 'lpfade .35s ease' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 14 }}>Billing · Invoices &amp; payments</div>
              {billRows.map(r => (
                <div key={r.no} className="prow">
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{r.no} · {r.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="mono" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{r.amt}</span><span className={r.ok ? 'pill-ok' : 'pill-wait'}>{r.status}</span></div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--ink)' }}>Export to Tally / Zoho Books</span>
                <span className="pill-ok">Ready</span>
              </div>
            </div>
          )}
          {tab === 'Analytics' && (
            <div style={{ animation: 'lpfade .35s ease' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', marginBottom: 14 }}>Analytics · Practice health</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 16 }}>
                {aStats.map(([k, v]) => (
                  <div key={k} style={{ background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{k}</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{v}</div></div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
                {bars.map((h, i) => <div key={i} style={{ flex: 1, height: h, borderRadius: '6px 6px 0 0', background: i === 3 ? 'var(--blue)' : 'var(--border)' }} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Demo booking form (wired to demo_requests) ──
function DemoForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [firm, setFirm] = useState('CA')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setErr('Name and work email are required.'); return }
    setBusy(true); setErr('')
    try {
      const { error } = await supabase.from('demo_requests').insert({
        name: name.trim(), email: email.trim(), firm_name: firm,
        message: 'Firm type: ' + firm, status: 'new',
      })
      if (error) throw error
      setDone(true)
    } catch (e2) { setErr('Could not submit. Please email support@taskflowco.in.') }
    setBusy(false)
  }
  if (done) return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <span style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: '50%', background: 'var(--field)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>
      </span>
      <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>Demo request received</h3>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0 }}>We'll reach out within 24 hours to confirm your slot.</p>
    </div>
  )
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 150 }}><label className="lbl">Your name</label><input className="field" style={{ width: '100%' }} placeholder="Vaibhav B." value={name} onChange={e => setName(e.target.value)} required /></div>
        <div style={{ flex: 1, minWidth: 150 }}><label className="lbl">Work email</label><input className="field" style={{ width: '100%' }} type="email" placeholder="you@firm.in" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      </div>
      <div>
        <label className="lbl">Firm type</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['CA', 'CS', 'CMA', 'Tax / Advisory'].map(f => <span key={f} className={'chipbtn' + (firm === f ? ' on' : '')} onClick={() => setFirm(f)}>{f}</span>)}
        </div>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>{err}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 4 }}>{busy ? 'Sending…' : 'Book my demo'}</button>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>We'll confirm your slot by email within 24 hours.</p>
    </form>
  )
}

// ── FAQ (single-open accordion) ──
const FAQS = [
  { q: 'Is TaskFlowCo built specifically for CA / CS / CMA firms?', a: 'Yes. The compliance calendar, work types and worksheets are pre-built for Indian practice work — GST, ITR, ROC and more — so you are productive on day one.' },
  { q: 'Can I import my existing client list?', a: 'Absolutely. Upload an Excel sheet and we map the columns automatically. Most firms import their entire client base in a few minutes.' },
  { q: 'Do I need a card to start?', a: 'No. Sign up free on the Free plan — free forever for up to 25 clients, no card required. Upgrade to Pro or Max whenever your team is ready; switch between monthly and yearly anytime.' },
  { q: 'Is my client data secure?', a: 'Data is encrypted in transit and at rest, hosted in India, with role-based access and a full audit trail on every action. Enterprise adds SSO.' },
  { q: 'Does it reconcile with the GST portal?', a: "Yes. The GST Desk tracks each return by internal stage and lets you reconcile it against the portal's filing status, so you can instantly see what's actually filed versus what's still pending." },
  { q: 'Can I export to Tally or Zoho Books?', a: 'Yes. Billing exports your invoices, payments and statements as import-ready files for Tally and Zoho Books (plus Excel) — no manual re-entry between systems.' },
  { q: 'Is there a mobile app?', a: 'TaskFlowCo installs as an app on your phone and desktop (PWA), with a mobile-optimised layout and geotagged attendance — no app store needed.' },
]
function FAQList() {
  const [open, setOpen] = useState(0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FAQS.map((f, i) => (
        <div key={i} className="faq-item">
          <div className="faq-q" onClick={() => setOpen(o => o === i ? -1 : i)}>
            <span>{f.q}</span><span className="faq-sign">{open === i ? '–' : '+'}</span>
          </div>
          {open === i && <div className="faq-a">{f.a}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Sign-in modal: Google + email magic link ──
function AuthModal({ open, onClose, onGoogle, googleBusy }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { if (!open) { setEmail(''); setSent(false); setError(null); setBusy(false) } }, [open])
  if (!open) return null
  const submit = async (e) => {
    e?.preventDefault?.()
    const v = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(v)) { setError('Please enter a valid email address.'); return }
    setBusy(true); setError(null)
    try { const { error: err } = await signInWithEmailLink(v); if (err) throw err; setSent(true) }
    catch (err) { setError(err?.message || 'Could not send the link. Try again in a moment.') }
    finally { setBusy(false) }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(7,20,36,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: '26px 28px', boxShadow: 'var(--shadow-panel)', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em' }}>Sign in to TaskFlowCo</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{sent ? 'Check your inbox to finish signing in.' : 'Pick how you want to continue.'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, padding: '0 4px', fontFamily: 'inherit' }}>×</button>
        </div>
        {sent ? (
          <div style={{ padding: '10px 0 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8, color: 'var(--success)' }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Check your inbox</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>We sent a sign-in link to <b style={{ color: 'var(--text)' }}>{email}</b>.<br />Click it from any device to finish signing in.</div>
            <button onClick={onClose} className="btn btn-ghost" style={{ marginTop: 18 }}>Done</button>
          </div>
        ) : (
          <>
            <button type="button" onClick={onGoogle} disabled={googleBusy || busy} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px 14px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: '#fff', color: '#1f2937', border: '1px solid #d1d5db', borderRadius: 10, cursor: (googleBusy || busy) ? 'not-allowed' : 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.2 5.2c-.4.4 6.8-5 6.8-14.8 0-1.3-.1-2.4-.4-3.5z" /></svg>
              {googleBusy ? 'Signing in…' : 'Continue with Google'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <form onSubmit={submit}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '.02em' }}>Sign in with email link</label>
              <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourdomain.com" disabled={busy || googleBusy} style={{ width: '100%' }} />
              {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
              <button type="submit" disabled={busy || googleBusy} className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }}>{busy ? 'Sending…' : 'Send sign-in link →'}</button>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>Works with any email — no password required.<br />New here? Your account is created automatically.</div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ── Upgrade modal — shown after sign-in when user clicked a plan CTA ──
function UpgradeModal({ planId, billing, orgId, onClose }) {
  const [done, setDone] = React.useState(false)
  const planName   = planId === 'pro' ? 'Pro' : 'Starter'
  const monthlyAmt = planId === 'pro' ? '1,499' : '999'
  const yearlyAmt  = planId === 'pro' ? '1,249' : '833'
  const yearlyTotal= planId === 'pro' ? '14,990' : '9,990'

  if (done) return (
    <div style={{ position:'fixed',inset:0,background:'rgba(10,20,40,.62)',backdropFilter:'blur(6px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'var(--surface)',borderRadius:20,padding:'36px 32px',maxWidth:400,width:'100%',textAlign:'center',border:'1px solid var(--border)',boxShadow:'0 24px 64px rgba(10,20,40,.18)' }}>
        <div style={{ fontSize:48,marginBottom:12 }}>🎉</div>
        <h3 style={{ margin:'0 0 8px',fontSize:20,fontWeight:800,color:'var(--text)' }}>You're all set!</h3>
        <p style={{ color:'var(--text-2)',fontSize:14,margin:'0 0 22px',lineHeight:1.6 }}>Your {planName} plan is active. Your payment receipt will arrive in your inbox shortly.</p>
        <button onClick={onClose} style={{ background:'var(--blue)',color:'#fff',border:'none',borderRadius:11,padding:'12px 28px',fontSize:14,fontWeight:800,cursor:'pointer',width:'100%' }}>Go to dashboard →</button>
      </div>
    </div>
  )

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(10,20,40,.62)',backdropFilter:'blur(6px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'var(--surface)',borderRadius:20,padding:'32px 28px',maxWidth:440,width:'100%',border:'1px solid var(--border)',boxShadow:'0 24px 64px rgba(10,20,40,.18)',position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute',top:16,right:18,background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--muted)' }}>×</button>
        <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:20 }}>
          <span style={{ fontSize:28 }}>⚡</span>
          <div>
            <h3 style={{ margin:0,fontSize:18,fontWeight:800,color:'var(--text)' }}>Upgrade to {planName}</h3>
            <p style={{ margin:0,fontSize:12,color:'var(--text-2)' }}>You're one step away from unlocking your full practice.</p>
          </div>
        </div>

        <div style={{ background:'var(--field)',border:'1px solid var(--border)',borderRadius:13,padding:'16px 18px',marginBottom:20 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'baseline' }}>
            <span style={{ fontSize:13,color:'var(--text-2)' }}>{planName} · {billing === 'yearly' ? 'Yearly' : 'Monthly'}</span>
            <span style={{ fontSize:24,fontWeight:800,color:'var(--blue)' }}>₹{billing === 'yearly' ? yearlyTotal : monthlyAmt}<span style={{ fontSize:12,fontWeight:500,color:'var(--text-2)' }}>{billing === 'yearly' ? '/yr' : '/mo'}</span></span>
          </div>
          {billing === 'yearly' && (
            <div style={{ fontSize:11,color:'var(--text-2)',marginTop:4 }}>One payment for 12 months · ₹{yearlyAmt}/mo · 2 months free</div>
          )}
          <div style={{ fontSize:11,color:'var(--muted)',marginTop:6 }}>Cancel anytime · Receipt emailed automatically</div>
        </div>

        <ul style={{ margin:'0 0 22px',padding:'0 0 0 18px',color:'var(--text-2)',fontSize:13,lineHeight:1.9 }}>
          {planId === 'pro' ? <>
            <li>Unlimited clients &amp; up to 15 team members</li>
            <li>Practice Hub — GST, ITR, TDS worksheet management</li>
            <li>Client portal, reminders &amp; time tracking</li>
            <li>Analytics, on-time reports &amp; workload view</li>
          </> : <>
            <li>Up to 3 users &amp; 50 clients</li>
            <li>GST worksheets, ITR tracking, task management</li>
            <li>All core compliance tools</li>
          </>}
        </ul>

        {orgId ? (
          <CheckoutButton
            orgId={orgId}
            planId={planId}
            billingCycle={billing}
            label={`Pay & activate ${planName} →`}
            onSuccess={() => setDone(true)}
          />
        ) : (
          <p style={{ fontSize:12,color:'var(--muted)',textAlign:'center' }}>Sign in first to complete checkout.</p>
        )}

        <p style={{ fontSize:11,color:'var(--muted)',textAlign:'center',marginTop:14 }}>
          🔒 Payments secured by Razorpay · PCI-DSS compliant · UPI / cards / net banking
        </p>
      </div>
    </div>
  )
}

export default function LandingPage({ onSignIn, loading }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const saved = localStorage.getItem('tfc-theme')
      if (saved === 'dark') return true
      if (saved === 'light') return false
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true
    } catch (_) {}
    return false
  })
  useEffect(() => { try { localStorage.setItem('tfc-theme', dark ? 'dark' : 'light') } catch (_) {} }, [dark])
  const [launchOpen, setLaunchOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [billing, setBilling] = useState('monthly')
  const [upgradeModal, setUpgradeModal] = useState(null)
  const [plans, setPlans] = useState([])
  const [plansLoading, setPlansLoading] = useState(true)

  useEffect(() => {
    supabase.from('plans').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => { setPlans(data || []); setPlansLoading(false) })
      .catch(() => setPlansLoading(false))
    // Admin-configurable default billing view (falls back to monthly).
    supabase.from('platform_settings').select('default_billing_cycle').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data?.default_billing_cycle) setBilling(data.default_billing_cycle) })
      .catch(() => {})
  }, [])
  const [currentOrgId, setCurrentOrgId] = useState(null)

  // After sign-in, fetch user's first org so CheckoutButton has an orgId
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('organization_members').select('org_id').eq('user_id', user.id).limit(1).single()
        .then(({ data }) => { if (data?.org_id) setCurrentOrgId(data.org_id) })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) return
      supabase.from('organization_members').select('org_id').eq('user_id', session.user.id).limit(1).single()
        .then(({ data }) => { if (data?.org_id) setCurrentOrgId(data.org_id) })
    })
    return () => subscription.unsubscribe()
  }, [])

  const start = () => setAuthOpen(true)
  const buyPlan = (planId) => {
    try { localStorage.setItem('tfc-upgrade-intent', planId) } catch (_) {}
    if (currentOrgId) setUpgradeModal(planId)
    else setAuthOpen(true)
  }

  const arrow = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  const heroChecks = ['Save hours every week', 'Never miss a deadline', 'Set up in a day']
  const AUDIENCES = ['CA Firms', 'CS Practices', 'CMA', 'Tax Consultants', 'Advisory']
  const STEPS = [
    { n: '1', h: 'Add your clients', d: 'Import your client list from Excel — we map the columns automatically, so your whole book is in within minutes.' },
    { n: '2', h: 'Turn on work types', d: 'Switch on GST, ITR, TDS, ROC and more. Worksheets and due dates populate for every client and cycle.' },
    { n: '3', h: 'Run the work', d: 'Your team moves each task through stages on the WorkZone board; reminders chase what is due.' },
    { n: '4', h: 'See the whole firm', d: 'Analytics show on-time %, pending work and workload so you always know where the firm stands.' },
  ]
  const FACTS = [
    { big: 'GST · ITR · TDS · ROC', label: 'Every due date, auto-tracked', sub: 'Compliance calendar pre-built for Indian practice work.' },
    { big: '25 clients, free', label: 'Free forever plan', sub: 'No card required — start today and upgrade when ready.' },
    { big: 'One-click', label: 'Tally & Zoho Books export', sub: 'Invoices, payments and statements, import-ready.' },
    { big: 'Hosted in India', label: 'Encrypted & access-controlled', sub: 'Role-based access with a full audit trail on every action.' },
  ]

  return (
    <div className="lp2" data-theme={dark ? 'dark' : 'light'}>
      <style>{CSS}</style>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onGoogle={onSignIn} googleBusy={loading} />
      {upgradeModal && (
        <UpgradeModal planId={upgradeModal} billing={billing} orgId={currentOrgId} onClose={() => setUpgradeModal(null)} />
      )}
      {launchOpen && (
        <Suspense fallback={null}>
          <LaunchTour open={launchOpen} onClose={() => setLaunchOpen(false)} />
        </Suspense>
      )}

      {/* NAV */}
      <header className="nav">
        <div className="wrap row">
          <a className="logo" href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Logo /></a>
          <nav className="links">
            <a className="navlink" href="#features" onClick={e => { e.preventDefault(); scrollToId('features') }}>Product</a>
            <a className="navlink" href="#product" onClick={e => { e.preventDefault(); scrollToId('product') }}>Solutions</a>
            <a className="navlink" href="#pricing" onClick={e => { e.preventDefault(); scrollToId('pricing') }}>Pricing</a>
            <a className="navlink" href="#faq" onClick={e => { e.preventDefault(); scrollToId('faq') }}>Resources</a>
          </nav>
          <div className="right">
            <button className="theme-toggle" onClick={() => setDark(d => !d)} title="Toggle theme" aria-label="Toggle theme">
              {dark
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}
            </button>
            <InstallPWAButton variant="compact" />
            <a href="#login" className="login-link" onClick={e => { e.preventDefault(); start() }}>Login</a>
            <button className="btn btn-primary btn-sm" onClick={start} disabled={loading}>{loading ? 'Signing in…' : 'Get started free'} {arrow}</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="hero">
        <div className="wrap inner">
          <div className="copy">
            <div className="eyebrow" style={{ color: 'var(--muted)', marginBottom: 18 }}>Built for CA · CS · CMA &amp; tax firms</div>
            <h1>Stop juggling.<br /><span className="accent">Start flowing.</span></h1>
            <p className="lede">Every client, filing, deadline, document and invoice in one workspace — so your team stops switching between ten tools and spreadsheets, and gets <b style={{ color: 'var(--ink)', fontWeight: 700 }}>hours back every week</b>.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={start} disabled={loading}>{loading ? 'Signing in…' : 'Get started free'} {arrow}</button>
              <button className="btn btn-ghost" onClick={() => setLaunchOpen(true)}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--field)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="var(--blue)"><path d="M8 6.5v11l9-5.5z" /></svg></span>
                Watch demo
              </button>
            </div>
            <div className="checks">
              {heroChecks.map(c => (
                <span key={c}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5 11 15l5-5.5" /></svg>{c}</span>
              ))}
            </div>
          </div>
          <HeroStage />
        </div>
      </section>

      {/* TRUST STRIP */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
        <div className="wrap" style={{ padding: '22px 32px', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Trusted by firms across India</span>
          {AUDIENCES.map(a => <span key={a} className="serif" style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink-2)', opacity: .8 }}>{a}</span>)}
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="wrap" style={{ padding: '80px 32px 44px' }}>
        <div className="sec-head" style={{ maxWidth: 640 }}>
          <span className="eyebrow">Everything in one place</span>
          <h2 style={{ margin: '14px 0 12px' }}>One platform for the whole firm</h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--ink-2)', margin: 0 }}>Compliance, workflow, clients and operations — the modules your practice actually uses, working off the same data.</p>
        </div>
        <div style={{ marginTop: 38, display: 'flex', flexDirection: 'column', gap: 36 }}>
          {FEATURE_GROUPS.map(g => (
            <div key={g.group}>
              <div className="grp-label"><span>{g.group}</span><span className="rule" /></div>
              <div className="fgrid">
                {g.items.map(it => (
                  <div key={it.h} className="fcell">
                    <span className="fic">{fic(it.p)}</span>
                    <h3>{it.h}</h3>
                    <p>{it.d}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRODUCT SHOWCASE */}
      <div id="product" className="band" style={{ marginTop: 36 }}>
        <div className="wrap" style={{ padding: '80px 32px' }}>
          <div className="sec-head" style={{ maxWidth: 640, marginBottom: 28 }}>
            <span className="eyebrow">See it in action</span>
            <h2 style={{ marginTop: 14 }}>The modules your team lives in</h2>
          </div>
          <ProductShowcase />
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="workflow" className="wrap" style={{ padding: '80px 32px' }}>
        <div className="sec-head" style={{ maxWidth: 640, marginBottom: 36 }}>
          <span className="eyebrow">How it works</span>
          <h2 style={{ marginTop: 14 }}>Live in a day, not a quarter</h2>
        </div>
        <div className="steps">
          {STEPS.map(s => (
            <div key={s.n} className="step"><span className="n">{s.n}</span><h3>{s.h}</h3><p>{s.d}</p></div>
          ))}
        </div>
      </section>

      {/* CAPABILITY BAND */}
      <div className="capband">
        <div className="wrap capgrid">
          {FACTS.map(f => (
            <div key={f.label}>
              <div className="big">{f.big}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: '#fff' }}>{f.label}</div>
              <div style={{ fontSize: 13, color: '#9FB6D4', marginTop: 5, lineHeight: 1.5 }}>{f.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TESTIMONIAL */}
      <div className="wrap" style={{ maxWidth: 900, padding: '80px 32px', textAlign: 'center' }}>
        <p className="quote">“Every GST and ITR deadline for the whole firm sits on one board now. Nothing slips.”</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--field)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--ink-2)', fontSize: 14 }}>RB</span>
          <div style={{ textAlign: 'left' }}><div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Managing Partner</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>Mid-size CA firm · Pune</div></div>
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing" className="band">
        <div className="wrap" style={{ padding: '80px 32px' }}>
          <div className="sec-head" style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 28px' }}>
            <span className="eyebrow">Pricing</span>
            <h2 style={{ margin: '14px 0 10px' }}>Simple, per-firm pricing</h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>Start free forever. Upgrade when your team is ready — switch monthly to yearly anytime.</p>
            <div className="seg">
              <button className={billing === 'monthly' ? 'on' : ''} onClick={() => setBilling('monthly')}>Monthly</button>
              <button className={billing === 'yearly' ? 'on' : ''} onClick={() => setBilling('yearly')}>Yearly · save 17%</button>
            </div>
          </div>
          <div className="pgrid">
            {plansLoading
              ? [1, 2, 3, 4].map(i => (
                  <div key={i} className="plan" style={{ opacity: .5, minHeight: 320 }}>
                    <div style={{ height: 18, background: 'var(--border)', borderRadius: 6, width: '55%', marginBottom: 14 }} />
                    <div style={{ height: 40, background: 'var(--border)', borderRadius: 6, width: '75%', marginBottom: 16 }} />
                    <div style={{ height: 120, background: 'var(--border)', borderRadius: 6 }} />
                  </div>
                ))
              : plans.filter(plan => !/^trial/i.test(plan.id) && !/^trial/i.test(plan.name || '')).map(plan => {
                  const monthlyPrice = plan.price_monthly / 100
                  const yearlyTotal  = plan.price_yearly / 100
                  const yearlyMonthly = monthlyPrice > 0 ? Math.round(yearlyTotal / 12) : 0
                  const displayPrice = billing === 'yearly' ? yearlyTotal : monthlyPrice
                  const savePct = monthlyPrice > 0 && yearlyTotal > 0 ? Math.round((1 - yearlyTotal / (monthlyPrice * 12)) * 100) : 0
                  const isFree = plan.id === 'free' || monthlyPrice === 0
                  const isEnterprise = plan.id === 'enterprise' || plan.category === 'enterprise'
                  const isFeatured = plan.is_featured
                  const features = plan.features || []
                  return (
                    <div key={plan.id} className={'plan' + (isFeatured ? ' featured' : '')}>
                      {isFeatured && <span className="tag">Most popular</span>}
                      <h3>{plan.name}</h3>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 5, minHeight: 34, lineHeight: 1.4 }}>{plan.description}</div>
                      {isEnterprise
                        ? <div className="amt">Custom</div>
                        : <div className="amt">₹{displayPrice.toLocaleString('en-IN')}<small>{isFree ? '' : billing === 'yearly' ? '/yr' : '/mo'}</small></div>}
                      <div style={{ fontSize: 12, color: 'var(--muted)', minHeight: 18 }}>
                        {isEnterprise ? 'Tailored to your firm'
                          : isFree ? 'Free forever · no card'
                          : billing === 'yearly' && savePct > 0 ? `billed annually · ₹${yearlyMonthly.toLocaleString('en-IN')}/mo · saves ${savePct}%`
                          : 'billed monthly'}
                      </div>
                      {isFree
                        ? <button className="btn btn-ghost" onClick={start} style={{ width: '100%', marginTop: 18 }}>Start free →</button>
                        : isEnterprise
                          ? <button className="btn btn-ghost" onClick={() => scrollToId('demo')} style={{ width: '100%', marginTop: 18 }}>Talk to sales →</button>
                          : <button className="btn btn-primary" onClick={() => buyPlan(plan.id)} style={{ width: '100%', marginTop: 18 }}>{currentOrgId ? `Upgrade to ${plan.name}` : `Get ${plan.name}`}</button>}
                      {features.length > 0 && (
                        <ul>
                          {features.slice(0, 6).map((f, i) => <li key={i}>{check}{f}</li>)}
                          {features.length > 6 && <li style={{ color: 'var(--blue)', fontSize: 12 }}>+{features.length - 6} more</li>}
                        </ul>
                      )}
                    </div>
                  )
                })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13.5, color: 'var(--ink-2)' }}>Need a hand getting started? <a onClick={() => scrollToId('demo')} style={{ color: 'var(--blue)', fontWeight: 700, cursor: 'pointer' }}>Get free onboarding help →</a></div>
        </div>
      </div>

      {/* FAQ */}
      <section id="faq" className="wrap" style={{ maxWidth: 820, padding: '80px 32px 44px' }}>
        <div className="sec-head" style={{ textAlign: 'center', marginBottom: 32 }}>
          <span className="eyebrow">FAQ</span>
          <h2 style={{ marginTop: 14 }}>Everything you're wondering</h2>
        </div>
        <FAQList />
      </section>

      {/* DEMO CTA */}
      <section id="demo" className="wrap" style={{ padding: '44px 32px 84px' }}>
        <div className="demo-card">
          <div className="demo-left">
            <h2 className="serif" style={{ fontSize: 'clamp(26px,2.8vw,34px)', fontWeight: 600, margin: '0 0 14px' }}>Bring your whole practice into one workspace</h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#9FB6D4', margin: '0 0 24px', maxWidth: '40ch' }}>Book a 30-minute demo. We'll import a few of your clients and configure your work types with you — free.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['Free setup & client import', 'No card required to start', 'Cancel anytime'].map(p => (
                <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#DCE7F3' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3FD0C9" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>{p}</span>
              ))}
            </div>
          </div>
          <div style={{ padding: 46 }}>
            <DemoForm />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap cols">
          <div style={{ minWidth: 220 }}>
            <a href="#top" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Logo footer /></a>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9FB6D4', margin: '16px 0 0', maxWidth: '30ch' }}>Practice management for CA, CS, CMA &amp; tax firms. Every filing, deadline and client in one calm workspace.</p>
          </div>
          <div><h5>Product</h5><a href="#features" onClick={e => { e.preventDefault(); scrollToId('features') }}>Features</a><a href="#pricing" onClick={e => { e.preventDefault(); scrollToId('pricing') }}>Pricing</a><a href="#workflow" onClick={e => { e.preventDefault(); scrollToId('workflow') }}>How it works</a><a href="#demo" onClick={e => { e.preventDefault(); scrollToId('demo') }}>Book a demo</a></div>
          <div><h5>Modules</h5><a href="#product" onClick={e => { e.preventDefault(); scrollToId('product') }}>GST Desk</a><a href="#product" onClick={e => { e.preventDefault(); scrollToId('product') }}>ITR Desk</a><a href="#product" onClick={e => { e.preventDefault(); scrollToId('product') }}>Client Portal</a><a href="#product" onClick={e => { e.preventDefault(); scrollToId('product') }}>Billing</a></div>
          <div><h5>Company</h5><a href="#faq" onClick={e => { e.preventDefault(); scrollToId('faq') }}>FAQ</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="mailto:support@taskflowco.in">Contact</a></div>
        </div>
        <div className="wrap bottom">
          <span>© 2026 TaskFlowCo. All rights reserved.</span>
          <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <a href="/privacy.html" style={{ padding: 0, display: 'inline' }}>Privacy</a>
            <a href="/terms.html" style={{ padding: 0, display: 'inline' }}>Terms</a>
            <a href="/refund.html" style={{ padding: 0, display: 'inline' }}>Refunds</a>
            <a href="/dpa.html" style={{ padding: 0, display: 'inline' }}>DPA</a>
            <span>Made in India · support@taskflowco.in</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
