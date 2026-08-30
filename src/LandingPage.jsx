import React, { useState, useEffect, lazy, Suspense } from 'react'
import { supabase, signInWithEmailLink } from './lib/supabase'
import InstallPWAButton from './components/InstallPWAButton.jsx'
import CheckoutButton from './components/CheckoutButton.jsx'

// "Watch demo" tour is loaded on demand.
const LaunchTour = lazy(() => import('./LaunchTour.jsx'))

// ── Design tokens + styles ported from the TaskFlowCo landing-page.html
// handoff. Scoped to .lp2 so nothing leaks into the app shell; the <style>
// unmounts with the component (only mounted while logged-out).
const CSS = `
.lp2{
  --blue:#2F6BFF; --teal:#14C7C0; --navy:#0E2A47;
  --grad:linear-gradient(135deg,#2F6BFF,#14C7C0);
  --danger:#EF4444; --progress:#2F6BFF; --warning:#F4A52A; --success:#1FA971;
  --page:#EAF0F7; --surface:#FFFFFF; --canvas:#F4F7FB; --col:#EEF3F9;
  --field:#F1F5FA; --seg:#E9EEF5; --border:#E6ECF4; --border-2:#EAEFF6;
  --text:#0E2A47; --text-2:#5A6E87; --muted:#94A3B8; --sub:#8194AB;
  --nav:#5A6E87; --badge-fg:#0E7A74; --badge-bg:rgba(20,199,192,.14);
  --hero-bg:radial-gradient(900px 420px at 88% -40px,rgba(20,199,192,.16),transparent),radial-gradient(700px 360px at 6% 110%,rgba(47,107,255,.12),transparent),#F7FAFD;
  --card:#FFFFFF; --card-border:#E6ECF4; --inner:#FFFFFF; --inner-border:#EDF1F7;
  --chip-bg:#EEF2F7; --chip-fg:#5A6E87; --teal-fg:#0E7A74;
  --shadow-panel:0 24px 60px -28px rgba(14,42,71,.45);
  --shadow-card:0 12px 24px -14px rgba(14,42,71,.45);
  --shadow-cta:0 12px 26px -10px rgba(47,107,255,.7);
  --footer-bg:#0E2A47;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif; background:var(--page); color:var(--text);
  -webkit-font-smoothing:antialiased; min-height:100vh; transition:background .4s ease,color .4s ease;
}
.lp2[data-theme="dark"]{
  --page:#0B2237; --surface:#0F2C49; --canvas:#0B2237; --col:#0F2A45;
  --field:#12314F; --seg:#12314F; --border:rgba(255,255,255,.08); --border-2:rgba(255,255,255,.06);
  --text:#EAF1F8; --text-2:#B4C4D6; --muted:#7E93AD; --sub:#8AA0BB;
  --nav:#9FB6D4; --badge-fg:#7FF0EA; --badge-bg:rgba(20,199,192,.16);
  --hero-bg:radial-gradient(900px 460px at 85% -60px,rgba(20,199,192,.22),transparent),radial-gradient(760px 400px at 0% 120%,rgba(47,107,255,.28),transparent),linear-gradient(160deg,#0B2038,#0E2A47);
  --card:#12324F; --card-border:rgba(255,255,255,.06); --inner:#143A5E; --inner-border:rgba(255,255,255,.06);
  --chip-bg:rgba(255,255,255,.08); --chip-fg:#C7D5E6; --teal-fg:#7FF0EA;
  --shadow-panel:0 24px 60px -28px rgba(6,16,30,.7);
  --footer-bg:#081627;
}
.lp2 *{box-sizing:border-box}
.lp2 .mono{font-family:'JetBrains Mono',monospace}
.lp2 .wrap{max-width:1400px;margin:0 auto;padding:0 40px}
.lp2 .section{padding:88px 0}
.lp2 h1,.lp2 h2,.lp2 h3{margin:0;letter-spacing:-.02em;font-weight:800}
.lp2 .eyebrow{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.lp2 a{color:inherit;text-decoration:none}
.lp2 .logo{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:17px;color:var(--text)}
.lp2 .logo .tile{width:30px;height:30px;border-radius:9px;background:var(--grad);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lp2 .mark{position:relative;display:inline-block;white-space:nowrap}
.lp2 .mark .leg{position:absolute;left:.30em;bottom:.05em;height:1.15em;width:auto;overflow:visible}
.lp2 .mark .co{margin-left:.50em}
.lp2 .btn{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px;padding:13px 24px;border-radius:12px;cursor:pointer;border:0;white-space:nowrap;transition:transform .15s ease,box-shadow .2s ease;font-family:inherit}
.lp2 .btn:hover{transform:translateY(-1px)}
.lp2 .btn-primary{background:var(--grad);color:#fff;box-shadow:var(--shadow-cta)}
.lp2 .btn-ghost{background:var(--card);border:1px solid var(--card-border);color:var(--text)}
.lp2 .btn-sm{padding:9px 16px;font-size:13px;border-radius:10px}
.lp2 .nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--page) 82%,transparent);border-bottom:1px solid var(--border)}
.lp2 .nav .row{display:flex;align-items:center;justify-content:space-between;height:68px}
.lp2 .nav .links{display:flex;align-items:center;gap:22px;font-size:13.5px;font-weight:600;color:var(--nav)}
.lp2 .nav .links a:hover{color:var(--text)}
.lp2 .theme-toggle{display:inline-flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:var(--seg);border:1px solid var(--border);cursor:pointer}
.lp2 .theme-toggle span{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.lp2 .theme-toggle .sun{background:var(--surface)}
.lp2[data-theme="dark"] .theme-toggle .sun{background:transparent}
.lp2[data-theme="dark"] .theme-toggle .moon{background:var(--grad)}
.lp2 .hero{position:relative;overflow:hidden}
.lp2 .hero-inner{position:relative;background:var(--hero-bg);border-radius:28px;margin-top:26px;padding:64px 56px;min-height:560px;overflow:hidden;transition:background .4s ease}
.lp2 .badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--badge-fg);background:var(--badge-bg);padding:6px 12px;border-radius:999px}
.lp2 .hero h1{font-size:clamp(34px,4.4vw,50px);line-height:1.04;letter-spacing:-.028em;margin:18px 0 14px;max-width:15ch}
.lp2 .hero .lede{font-size:16.5px;line-height:1.6;color:var(--text-2);max-width:44ch;margin:0 0 28px}
.lp2 .hero .cta-row{display:flex;gap:12px;flex-wrap:wrap}
.lp2 .hero .trust{display:flex;align-items:center;gap:9px;margin-top:26px;font-size:12.5px;color:var(--muted)}
.lp2 .avatars{display:flex}
.lp2 .avatars span{width:26px;height:26px;border-radius:50%;border:2px solid #F7FAFD}
.lp2 .avatars span+span{margin-left:-8px}
.lp2 .grad-text{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.lp2 .hero-copy{max-width:460px;position:relative;z-index:2}
.lp2 .preview{position:absolute;right:-24px;bottom:-16px;width:400px;border-radius:18px 18px 0 0;background:var(--card);border:1px solid var(--card-border);box-shadow:var(--shadow-panel);padding:16px;animation:lp2-floaty 6s ease-in-out infinite}
.lp2 .preview h4{margin:0;font-size:13px;font-weight:800;color:var(--text)}
.lp2 .task{border:1px solid var(--inner-border);background:var(--inner);border-radius:10px;padding:11px 12px}
.lp2 .task+.task{margin-top:9px}
.lp2 .task .name{font-weight:700;font-size:12.5px;color:var(--text)}
.lp2 .chip{font-size:10px;font-weight:700;background:var(--chip-bg);color:var(--chip-fg);padding:2px 7px;border-radius:6px}
@keyframes lp2-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
.lp2 .grid{display:grid;gap:20px}
.lp2 .cols-3{grid-template-columns:repeat(3,1fr)}
.lp2 .feature{background:var(--card);border:1px solid var(--card-border);border-radius:18px;padding:26px;transition:transform .18s ease,box-shadow .2s ease}
.lp2 .feature:hover{transform:translateY(-3px);box-shadow:var(--shadow-card)}
.lp2 .feature .ico{width:46px;height:46px;border-radius:13px;background:var(--badge-bg);display:flex;align-items:center;justify-content:center;color:var(--teal-fg);margin-bottom:16px}
.lp2 .feature h3{font-size:17px;margin-bottom:8px}
.lp2 .feature p{margin:0;font-size:14px;line-height:1.6;color:var(--text-2)}
.lp2 .steps{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.lp2 .step{position:relative;padding-top:14px}
.lp2 .step .num{width:34px;height:34px;border-radius:10px;background:var(--grad);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;margin-bottom:14px}
.lp2 .step h3{font-size:16px;margin-bottom:6px}
.lp2 .step p{margin:0;font-size:13.5px;line-height:1.55;color:var(--text-2)}
.lp2 .showcase{background:var(--canvas);border:1px solid var(--border);border-radius:22px;padding:22px;box-shadow:var(--shadow-panel)}
.lp2 .board{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.lp2 .column{background:var(--col);border-radius:14px;padding:13px}
.lp2 .column .head{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-weight:800;font-size:13px}
.lp2 .dot{width:9px;height:9px;border-radius:50%}
.lp2 .count{margin-left:auto;font-size:11.5px;font-weight:700;background:var(--surface);padding:2px 9px;border-radius:99px}
.lp2 .card{background:var(--card);border:1px solid var(--card-border);border-radius:12px;padding:13px;border-left:3px solid var(--muted)}
.lp2 .card+.card{margin-top:10px}
.lp2 .card .name{font-weight:700;font-size:13.5px}
.lp2 .card .meta{font-size:11.5px;color:var(--muted);margin-top:7px}
.lp2 .bar{height:5px;border-radius:99px;background:var(--seg);overflow:hidden;margin-top:10px}
.lp2 .bar>i{display:block;height:100%;border-radius:99px;background:var(--grad)}
.lp2 .quote{background:var(--grad);border-radius:24px;padding:56px;color:#fff;text-align:center}
.lp2 .quote p{font-size:clamp(20px,2.4vw,28px);font-weight:700;line-height:1.4;max-width:24ch;margin:0 auto 22px;letter-spacing:-.01em}
.lp2 .quote .who{font-size:14px;opacity:.85;font-weight:600}
.lp2 .price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lp2 .plan{background:var(--card);border:1px solid var(--card-border);border-radius:18px;padding:28px}
.lp2 .plan.featured{border:2px solid var(--blue);box-shadow:var(--shadow-card);position:relative}
.lp2 .plan .tag{position:absolute;top:-12px;left:28px;background:var(--grad);color:#fff;font-size:11px;font-weight:800;padding:4px 11px;border-radius:99px}
.lp2 .plan h3{font-size:16px}
.lp2 .plan .amt{font-size:38px;font-weight:800;margin:12px 0 4px;letter-spacing:-.03em}
.lp2 .plan .amt small{font-size:14px;font-weight:600;color:var(--muted)}
.lp2 .plan ul{list-style:none;padding:0;margin:18px 0 22px;display:flex;flex-direction:column;gap:10px}
.lp2 .plan li{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--text-2)}
.lp2 .cta-band{background:var(--card);border:1px solid var(--card-border);border-radius:24px;padding:48px;text-align:center;box-shadow:var(--shadow-panel)}
.lp2 .cta-band h2{font-size:clamp(26px,3vw,34px);margin-bottom:12px}
.lp2 .cta-band p{color:var(--text-2);font-size:16px;margin:0 auto 26px;max-width:46ch;line-height:1.6}
.lp2 .preview-card{background:var(--card);border:1px solid var(--card-border);border-radius:18px;padding:20px;box-shadow:var(--shadow-panel)}
.lp2 .preview-card .ph{display:flex;align-items:center;gap:9px;margin-bottom:14px}
.lp2 .preview-card .ph .ico{width:32px;height:32px;border-radius:9px;background:var(--badge-bg);display:flex;align-items:center;justify-content:center;color:var(--teal-fg)}
.lp2 .preview-card .ph h3{font-size:14px;font-weight:800;color:var(--text)}
.lp2 .mini{border:1px solid var(--inner-border);background:var(--inner);border-radius:10px;padding:11px}
.lp2 .mini+.mini{margin-top:9px}
.lp2 .chipbtn{font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:9px;background:var(--field);border:1px solid var(--card-border);color:var(--text-2);cursor:pointer}
.lp2 .chipbtn.on{background:var(--grad);color:#fff;border-color:transparent}
.lp2 .field{border:1px solid var(--card-border);background:var(--field);border-radius:10px;padding:11px 13px;font-size:13.5px;color:var(--text);font-family:inherit;outline:none}
.lp2 .field::placeholder{color:var(--muted)}
.lp2[data-theme="dark"] input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(.6)}
.lp2 .lbl{display:block;font-size:12px;font-weight:700;color:var(--text-2);margin-bottom:6px}
.lp2 .two-col{display:grid;grid-template-columns:1.15fr .85fr;gap:20px}
.lp2 .support-card{background:var(--card);border:1px solid var(--card-border);border-radius:18px;padding:22px;flex:1}
.lp2 .support-card .ico{width:38px;height:38px;border-radius:11px;background:var(--badge-bg);display:flex;align-items:center;justify-content:center;color:var(--teal-fg);margin-bottom:14px}
.lp2 .faq-item{background:var(--card);border:1px solid var(--card-border);border-radius:14px;overflow:hidden}
.lp2 .faq-item+.faq-item{margin-top:12px}
.lp2 .faq-q{display:flex;align-items:center;gap:14px;padding:18px 20px;cursor:pointer}
.lp2 .faq-q span:first-child{font-weight:700;font-size:15px;color:var(--text);flex:1}
.lp2 .faq-sign{font-size:22px;font-weight:400;color:var(--blue);line-height:1;width:20px;text-align:center}
.lp2 .faq-a{padding:0 20px 18px;font-size:14px;line-height:1.6;color:var(--text-2)}
.lp2 footer{background:var(--footer-bg);color:#9FB6D4;margin-top:64px}
.lp2 footer .cols{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:30px;padding:56px 0 34px}
.lp2 footer h5{color:#fff;font-size:13px;font-weight:700;margin:0 0 14px;letter-spacing:.02em}
.lp2 footer a{display:block;font-size:13.5px;color:#9FB6D4;padding:5px 0}
.lp2 footer a:hover{color:#fff}
.lp2 footer .bottom{border-top:1px solid rgba(255,255,255,.1);padding:20px 0;display:flex;justify-content:space-between;font-size:12.5px;color:#7E93AD}
.lp2 footer .logo{color:#fff}
@media(max-width:900px){
  .lp2 .cols-3,.lp2 .steps,.lp2 .price-grid,.lp2 .board{grid-template-columns:1fr 1fr}
  .lp2 .two-col{grid-template-columns:1fr}
  .lp2 .preview{display:none}
  .lp2 .hero-inner{padding:44px 32px}
}
@media(max-width:620px){
  .lp2 .cols-3,.lp2 .steps,.lp2 .price-grid,.lp2 .board{grid-template-columns:1fr}
  .lp2 .nav .links a{display:none}
  .lp2 .nav .links .keep{display:inline-flex}
}
@media(prefers-reduced-motion:reduce){.lp2 *{animation:none!important;transition:none!important}}
`

// ── Reusable wordmark: gradient tile + "Taskflo v[check] co" (reads "Taskflowco") ──
function Logo({ footer }) {
  return (
    <span className="logo" style={footer ? { color: '#fff' } : undefined}>
      <span className="tile">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19.5 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span>Taskflo<span className="mark">v
        <svg className="leg" viewBox="0 0 72 92">
          <defs><linearGradient id="lp2tk" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2F6BFF" /><stop offset="1" stopColor="#14C7C0" /></linearGradient></defs>
          <path d="M4 56 24 78 68 8" fill="none" stroke="url(#lp2tk)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="co">co</span>
      </span></span>
    </span>
  )
}

const check = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17 19 7" stroke="#1FA971" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>

function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

// ── Demo booking form (wired to demo_requests) ──
// Half-hourly time options across a working day (any day is bookable).
const SLOT_TIMES = (() => {
  const out = []
  for (let h = 9; h <= 19; h++) { out.push(String(h).padStart(2, '0') + ':00'); if (h < 19) out.push(String(h).padStart(2, '0') + ':30') }
  return out
})()
function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }

function DemoForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [firm, setFirm] = useState('CA')
  const [slotDate, setSlotDate] = useState(todayISO)
  const [slotTime, setSlotTime] = useState('11:00')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setErr('Name and work email are required.'); return }
    setBusy(true); setErr('')
    try {
      const slot = slotDate ? (slotDate + ' ' + slotTime) : slotTime
      const { error } = await supabase.from('demo_requests').insert({
        name: name.trim(), email: email.trim(), firm_name: firm,
        message: 'Firm type: ' + firm + ' · Preferred slot: ' + slot, status: 'new',
      })
      if (error) throw error
      setDone(true)
    } catch (e2) { setErr('Could not submit. Please email support@taskflowco.in.') }
    setBusy(false)
  }
  if (done) return (
    <div style={{ textAlign: 'center', padding: '30px 0' }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>🎉</div>
      <h3 style={{ fontSize: 20, margin: '0 0 8px' }}>Demo request received</h3>
      <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>We'll reach out within 24 hours to confirm your slot.</p>
    </div>
  )
  const single = (val, cur, set, opts) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opts.map(o => <span key={o} className={'chipbtn' + (cur === o ? ' on' : '') + (val === 'slot' ? ' mono' : '')} onClick={() => set(o)}>{o}</span>)}
    </div>
  )
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 150 }}><label className="lbl">Your name</label><input className="field" style={{ width: '100%' }} placeholder="Vaibhav B." value={name} onChange={e => setName(e.target.value)} required /></div>
        <div style={{ flex: 1, minWidth: 150 }}><label className="lbl">Work email</label><input className="field" style={{ width: '100%' }} type="email" placeholder="you@firm.in" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      </div>
      <div><label className="lbl">Firm type</label>{single('firm', firm, setFirm, ['CA', 'CS', 'CMA', 'Tax / Advisory'])}</div>
      <div><label className="lbl">Preferred slot</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="field mono" type="date" min={todayISO()} value={slotDate} onChange={e => setSlotDate(e.target.value)} style={{ flex: '1 1 150px', minWidth: 140 }} />
          <select className="field mono" value={slotTime} onChange={e => setSlotTime(e.target.value)} style={{ flex: '1 1 110px', minWidth: 110, cursor: 'pointer' }}>
            {SLOT_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Any day works — weekends included. We'll confirm by email.</div>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>{err}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ justifyContent: 'center', marginTop: 4 }}>{busy ? 'Sending…' : 'Book my demo'}</button>
    </form>
  )
}

function FAQItem({ q, a, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className={'faq-item' + (open ? ' open' : '')}>
      <div className="faq-q" onClick={() => setOpen(o => !o)}>
        <span>{q}</span><span className="faq-sign">{open ? '−' : '+'}</span>
      </div>
      {open && <div className="faq-a">{a}</div>}
    </div>
  )
}

const FEATURES = [
  { p: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>, h: 'Never miss a due date', d: 'Every GST, ITR and ROC deadline tracked automatically, with reminders that escalate as the date nears.' },
  { p: <><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>, h: 'WorkZone board', d: 'See every client task move from pending to filed. Assign, review and close work without a single spreadsheet.' },
  { p: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8M20.5 19a5.5 5.5 0 0 0-4-5.3" /></>, h: 'Team workload', d: "Balance work across articles and staff. Know who's overloaded before deadlines pile up." },
  { p: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>, h: 'Smart reminders', d: 'Nudge clients for documents and payments automatically over email — no more manual follow-ups.' },
  { p: <path d="M5 19V5M5 19h14M9 16v-4M13 16V8M17 16v-6" />, h: 'Practice analytics', d: 'Revenue, realization and pending work at a glance. Understand the health of your firm in seconds.' },
  { p: <><path d="M6 4h9l4 4v12H6z" /><path d="M14 4v5h5M9 13h6M9 16h4" /></>, h: 'Notes & documents', d: 'Keep every worksheet, note and file attached to the client and task it belongs to.' },
]
const fico = paths => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>

// ── Sign-in modal: Google + email magic link. The email link is how domain /
// admin mailboxes (e.g. name@taskflowco.in) that aren't Google accounts sign in.
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
            <button onClick={onClose} className="btn btn-ghost" style={{ marginTop: 18, justifyContent: 'center' }}>Done</button>
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
              <button type="submit" disabled={busy || googleBusy} className="btn btn-ghost" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}>{busy ? 'Sending…' : 'Send sign-in link →'}</button>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>Works with any email — no password required.<br />New here? Your account is created automatically.</div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}



// ── PurchaseModal — works for visitors AND signed-in users ──────────
// Collects email → looks up orgs → lets user pick org → Razorpay checkout
function PurchaseModal({ planId, billing, onClose, supabase }) {
  const [step, setStep]       = React.useState('details')  // details | org | pay | success
  const [email, setEmail]     = React.useState('')
  const [phone, setPhone]     = React.useState('')
  const [name,  setName]      = React.useState('')
  const [orgs,  setOrgs]      = React.useState([])
  const [selectedOrg, setSelectedOrg] = React.useState(null)
  const [busy,  setBusy]      = React.useState(false)
  const [error, setError]     = React.useState('')
  const [rzpLoaded, setRzpLoaded] = React.useState(false)

  const planName    = planId === 'pro' ? 'Pro' : 'Starter'
  const monthlyRs   = planId === 'pro' ? 1999  : 999
  const yearlyRs    = planId === 'pro' ? 19990 : 9990
  const monthlyEquiv= planId === 'pro' ? 1666  : 833
  const displayAmt  = billing === 'yearly' ? monthlyEquiv : monthlyRs
  const billedAmt   = billing === 'yearly' ? yearlyRs     : monthlyRs

  // Load Razorpay script early
  React.useEffect(() => {
    if (window.Razorpay) { setRzpLoaded(true); return }
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => setRzpLoaded(true)
    document.head.appendChild(s)
  }, [])

  async function lookupOrgs() {
    if (!email.trim() || !name.trim() || !phone.trim()) { setError('Please fill in all fields'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return }
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\s/g,''))) { setError('Enter a valid 10-digit Indian mobile number'); return }
    setBusy(true); setError('')
    try {
      // Sign in with OTP / magic link to get user context
      // First check if user exists by trying to find their orgs via email lookup
      const { data: { user } } = await supabase.auth.getUser()
      if (user && user.email === email) {
        // Already signed in — fetch their orgs directly
        const { data: members } = await supabase
          .from('organization_members')
          .select('org_id, role, organizations(id, name, description)')
          .eq('user_id', user.id)
        const orgList = (members || []).map(m => m.organizations).filter(Boolean)
        setOrgs(orgList)
        if (orgList.length === 1) { setSelectedOrg(orgList[0]); setStep('pay') }
        else if (orgList.length > 1) setStep('org')
        else {
          // User exists but no orgs — go straight to pay, create org on success
          setSelectedOrg({ id: null, name: name + "'s Practice" })
          setStep('pay')
        }
      } else {
        // Send magic link / OTP
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.href }
        })
        if (otpErr) throw otpErr
        setStep('otp')
      }
    } catch (e) { setError(e.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  async function proceedAsGuest() {
    // Allow checkout without signing in — we'll create/link account after payment
    setSelectedOrg({ id: null, name: name + "'s Practice" })
    setStep('pay')
  }

  async function startPayment() {
    if (!rzpLoaded) { setError('Payment gateway loading, please wait...'); return }
    setBusy(true); setError('')
    try {
      let orgId = selectedOrg?.id

      // If no org yet, sign up user and create org
      if (!orgId) {
        // Sign up / get session
        const { data: authData, error: signErr } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: true }
        })
        // Continue with guest checkout — org will be created post-payment via webhook
        // Pass email+name in Razorpay notes for post-payment org creation
      }

      // Call create-order edge function
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token

      let orderData
      if (orgId && session?.access_token) {
        // Signed-in user with org
        const res = await fetch(
          `${supabase.supabaseUrl}/functions/v1/create-order`,
          { method: 'POST', headers, body: JSON.stringify({ org_id: orgId, plan_id: planId, billing_cycle: billing }) }
        )
        orderData = await res.json()
        if (!orderData.order_id) throw new Error(orderData.error || orderData.detail || 'Order creation failed')
      } else {
        // Guest — create order via guest-order function
        const res = await fetch(
          `${supabase.supabaseUrl}/functions/v1/create-guest-order`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId, billing_cycle: billing, email: email.trim(), name: name.trim(), phone: phone.trim() }) }
        )
        orderData = await res.json()
        if (!orderData.order_id) throw new Error(orderData.error || orderData.detail || 'Order creation failed')
      }

      // Open Razorpay
      const rzp = new window.Razorpay({
        key:         orderData.key_id,
        order_id:    orderData.order_id,
        amount:      orderData.amount,
        currency:    orderData.currency || 'INR',
        name:        'TaskFlowCo',
        description: `${planName} Plan — ${billing}`,
        prefill:     { name: name.trim(), email: email.trim(), contact: phone.trim() },
        theme:       { color: '#2F6BFF' },
        handler: () => { setBusy(false); setStep('success') },
        modal: { ondismiss: () => setBusy(false) }
      })
      rzp.on('payment.failed', (r) => { setError(r?.error?.description || 'Payment failed'); setBusy(false) })
      rzp.open()
    } catch (e) { setError(e.message || 'Something went wrong'); setBusy(false) }
  }

  const inp = { width:'100%', padding:'11px 13px', border:'1px solid var(--border)', borderRadius:10,
    background:'var(--surface)', color:'var(--text)', fontSize:14, fontFamily:'inherit',
    outline:'none', boxSizing:'border-box' }
  const lbl = { display:'block', fontSize:11, fontWeight:700, color:'var(--text-2)',
    textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(10,20,40,.65)', backdropFilter:'blur(6px)',
      zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', borderRadius:22, padding:'32px 28px', width:'100%',
        maxWidth:460, border:'1px solid var(--border)', boxShadow:'0 32px 80px rgba(10,20,40,.22)',
        position:'relative', maxHeight:'90vh', overflowY:'auto' }}>

        {/* Close */}
        <button onClick={onClose} style={{ position:'absolute', top:16, right:18, background:'none',
          border:'none', cursor:'pointer', fontSize:22, color:'var(--muted)', lineHeight:1 }}>×</button>

        {/* Plan recap header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:22 }}>
          <div style={{ width:44, height:44, borderRadius:13, background:'linear-gradient(135deg,#2F6BFF22,#14C7C022)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>⚡</div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#2F6BFF', textTransform:'uppercase', letterSpacing:'.08em' }}>
              TaskFlowCo {planName}
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', letterSpacing:'-.03em' }}>
              ₹{displayAmt.toLocaleString('en-IN')}<span style={{ fontSize:12, fontWeight:500, color:'var(--muted)' }}>/mo</span>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>
              {billing === 'yearly'
                ? `Billed ₹${yearlyRs.toLocaleString('en-IN')}/year · 2 months free`
                : 'Billed monthly · cancel anytime'}
              {' · +18% GST'}
            </div>
          </div>
        </div>

        {/* ── STEP: details ── */}
        {step === 'details' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={lbl}>Full Name</label>
              <input style={inp} placeholder="CA Ramesh Sharma" value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Work Email</label>
              <input style={inp} type="email" placeholder="ramesh@sharmaandco.in" value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Mobile Number</label>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ ...inp, width:'auto', padding:'11px 12px', color:'var(--muted)', flexShrink:0, background:'var(--card)' }}>🇮🇳 +91</span>
                <input style={{ ...inp, flex:1 }} type="tel" placeholder="9876543210" value={phone}
                  onChange={e=>setPhone(e.target.value.replace(/\D/g,'').slice(0,10))} />
              </div>
            </div>
            {error && <div style={{ fontSize:12, color:'#ef4444', background:'rgba(239,68,68,.08)', padding:'8px 12px', borderRadius:8 }}>⚠ {error}</div>}
            <button onClick={lookupOrgs} disabled={busy} style={{ background:'linear-gradient(135deg,#2F6BFF,#14C7C0)',
              color:'#fff', border:'none', borderRadius:11, padding:'13px', fontSize:14,
              fontWeight:800, cursor:busy?'not-allowed':'pointer', fontFamily:'inherit', marginTop:4 }}>
              {busy ? 'Looking up your account…' : 'Continue →'}
            </button>
            <button onClick={proceedAsGuest} style={{ background:'none', border:'none', color:'var(--muted)',
              fontSize:12, cursor:'pointer', fontFamily:'inherit', textDecoration:'underline' }}>
              Continue without signing in
            </button>
            <p style={{ fontSize:10.5, color:'var(--muted)', textAlign:'center', margin:0 }}>
              🔒 Payments secured by Razorpay · PCI-DSS compliant
            </p>
          </div>
        )}

        {/* ── STEP: otp (magic link sent) ── */}
        {step === 'otp' && (
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📧</div>
            <h3 style={{ margin:'0 0 10px', color:'var(--text)', fontWeight:800 }}>Check your email</h3>
            <p style={{ color:'var(--muted)', fontSize:13, marginBottom:20 }}>
              We sent a sign-in link to <b>{email}</b>. Click it and come back here to complete checkout.
            </p>
            <p style={{ color:'var(--muted)', fontSize:12 }}>Or —</p>
            <button onClick={proceedAsGuest} style={{ marginTop:8, background:'linear-gradient(135deg,#2F6BFF,#14C7C0)',
              color:'#fff', border:'none', borderRadius:11, padding:'12px 24px', fontSize:13,
              fontWeight:800, cursor:'pointer', fontFamily:'inherit' }}>
              Skip & pay now →
            </button>
          </div>
        )}

        {/* ── STEP: org selection ── */}
        {step === 'org' && (
          <div>
            <h3 style={{ margin:'0 0 6px', color:'var(--text)', fontWeight:800, fontSize:16 }}>Select your practice</h3>
            <p style={{ margin:'0 0 16px', color:'var(--muted)', fontSize:13 }}>Which practice would you like to upgrade?</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {orgs.map(org => (
                <button key={org.id} onClick={() => { setSelectedOrg(org); setStep('pay') }}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
                    border:`2px solid ${selectedOrg?.id===org.id ? '#2F6BFF' : 'var(--border)'}`,
                    borderRadius:12, background:'var(--card)', cursor:'pointer', textAlign:'left',
                    transition:'border-color .15s' }}>
                  <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,#2F6BFF22,#14C7C022)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#2F6BFF', flexShrink:0 }}>
                    {(org.name||'?').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>{org.name}</div>
                    {org.description && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{org.description}</div>}
                  </div>
                </button>
              ))}
            </div>
            {error && <div style={{ fontSize:12, color:'#ef4444', marginBottom:12 }}>⚠ {error}</div>}
          </div>
        )}

        {/* ── STEP: pay ── */}
        {step === 'pay' && (
          <div>
            <div style={{ background:'linear-gradient(135deg,rgba(47,107,255,.07),rgba(20,199,192,.05))',
              border:'1px solid rgba(47,107,255,.15)', borderRadius:13, padding:'16px 18px', marginBottom:20 }}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>Upgrading</div>
              <div style={{ fontWeight:800, color:'var(--text)', fontSize:15 }}>{selectedOrg?.name || name + "'s Practice"}ractice"}</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
                {planName} · {billing} · ₹{billedAmt.toLocaleString('en-IN')} {billing === 'yearly' ? '/year' : '/month'} + GST
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {[
                planId === 'pro'
                  ? ['Unlimited clients & 15 users', 'GST, ITR, TDS worksheets', 'Client portal & reminders', 'Priority support']
                  : ['Up to 3 users & 50 clients', 'GST worksheets & ITR tracking', 'Task management', 'Email support']
              ][0].map((f,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-2)' }}>
                  <span style={{ color:'#10b981', fontWeight:700 }}>✓</span>{f}
                </div>
              ))}
            </div>
            {error && <div style={{ fontSize:12, color:'#ef4444', background:'rgba(239,68,68,.08)', padding:'8px 12px', borderRadius:8, marginBottom:12 }}>⚠ {error}</div>}
            <button onClick={startPayment} disabled={busy} style={{ width:'100%', background:'linear-gradient(135deg,#2F6BFF,#14C7C0)',
              color:'#fff', border:'none', borderRadius:11, padding:'14px', fontSize:14,
              fontWeight:800, cursor:busy?'not-allowed':'pointer', fontFamily:'inherit' }}>
              {busy ? 'Opening payment…' : `Pay ₹${billedAmt.toLocaleString('en-IN')} + GST →`}
            </button>
            <p style={{ fontSize:10.5, color:'var(--muted)', textAlign:'center', marginTop:10 }}>
              🔒 Secured by Razorpay · UPI / Cards / Net Banking · Cancel anytime
            </p>
          </div>
        )}

        {/* ── STEP: success ── */}
        {step === 'success' && (
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <h3 style={{ margin:'0 0 8px', color:'var(--text)', fontWeight:800, fontSize:20 }}>Payment received!</h3>
            <p style={{ color:'var(--muted)', fontSize:13, marginBottom:6 }}>
              Your TaskFlowCo <b>{planName}</b> plan is being activated.
            </p>
            <p style={{ color:'var(--muted)', fontSize:13, marginBottom:24 }}>
              A GST invoice will be emailed to <b>{email}</b> within a few minutes.
            </p>
            <button onClick={onClose} style={{ background:'linear-gradient(135deg,#2F6BFF,#14C7C0)',
              color:'#fff', border:'none', borderRadius:11, padding:'13px 28px', fontSize:14,
              fontWeight:800, cursor:'pointer', fontFamily:'inherit', width:'100%' }}>
              Go to dashboard →
            </button>
          </div>
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
        <p style={{ color:'var(--text-2)',fontSize:14,margin:'0 0 22px',lineHeight:1.6 }}>Your {planName} plan is active. The GST invoice will arrive in your inbox shortly via Zoho Books.</p>
        <button onClick={onClose} style={{ background:'var(--grad)',color:'#fff',border:'none',borderRadius:11,padding:'12px 28px',fontSize:14,fontWeight:800,cursor:'pointer',width:'100%' }}>Go to dashboard →</button>
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

        {/* Price recap */}
        <div style={{ background:'linear-gradient(135deg,rgba(47,107,255,.07),rgba(20,199,192,.06))',border:'1px solid rgba(47,107,255,.14)',borderRadius:13,padding:'16px 18px',marginBottom:20 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'baseline' }}>
            <span style={{ fontSize:13,color:'var(--text-2)' }}>{planName} · {billing === 'yearly' ? 'Yearly' : 'Monthly'}</span>
            <span style={{ fontSize:24,fontWeight:800,color:'var(--blue)' }}>₹{billing === 'yearly' ? yearlyAmt : monthlyAmt}<span style={{ fontSize:12,fontWeight:500,color:'var(--text-2)' }}>/mo</span></span>
          </div>
          {billing === 'yearly' && (
            <div style={{ fontSize:11,color:'var(--text-2)',marginTop:4 }}>Billed ₹{yearlyTotal}/year · 2 months free</div>
          )}
          <div style={{ fontSize:11,color:'var(--muted)',marginTop:6 }}>+ 18% GST · Cancel anytime · Invoice sent automatically</div>
        </div>

        {/* What you get */}
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

        {/* CheckoutButton — full Razorpay flow */}
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
  const [billing, setBilling] = useState('yearly')
  const [upgradeModal, setUpgradeModal] = useState(null) // null | 'pro' | 'starter'
  const [purchaseModal, setPurchaseModal] = useState(null) // null | 'pro' | 'starter'
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
    if (currentOrgId) {
      setUpgradeModal(planId)  // signed-in: use UpgradeModal with org pre-loaded
    } else {
      setPurchaseModal(planId) // visitor: use PurchaseModal with details form
    }
  }

  return (
    <div className="lp2" data-theme={dark ? 'dark' : 'light'}>
      <style>{CSS}</style>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onGoogle={onSignIn} googleBusy={loading} />
      {purchaseModal && (
        <PurchaseModal
          planId={purchaseModal}
          billing={billing}
          supabase={supabase}
          onClose={() => setPurchaseModal(null)}
        />
      )}
      {upgradeModal && (
        <UpgradeModal
          planId={upgradeModal}
          billing={billing}
          orgId={currentOrgId}
          onClose={() => setUpgradeModal(null)}
        />
      )}
      {launchOpen && (
        <Suspense fallback={null}>
          <LaunchTour open={launchOpen} onClose={() => setLaunchOpen(false)} />
        </Suspense>
      )}

      {/* NAV */}
      <header className="nav">
        <div className="wrap row">
          <a className="logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Logo /></a>
          <nav className="links">
            <a href="#features" onClick={e => { e.preventDefault(); scrollToId('features') }}>Product</a>
            <a href="#workflow" onClick={e => { e.preventDefault(); scrollToId('workflow') }}>How it works</a>
            <a href="#pricing" onClick={e => { e.preventDefault(); scrollToId('pricing') }}>Pricing</a>
            <a href="#faq" onClick={e => { e.preventDefault(); scrollToId('faq') }}>FAQ</a>
            <button className="theme-toggle keep" onClick={() => setDark(d => !d)} title="Switch theme" aria-label="Switch theme">
              <span className="sun"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#F4A52A" strokeWidth="1.9" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" stroke="#F4A52A" strokeWidth="1.9" strokeLinecap="round" /></svg></span>
              <span className="moon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" stroke="#94A3B8" strokeWidth="1.9" strokeLinejoin="round" /></svg></span>
            </button>
            <InstallPWAButton variant="compact" />
            <a href="#" className="keep" onClick={e => { e.preventDefault(); start() }} style={{ color: 'var(--nav)', fontWeight: 600 }}>Sign in</a>
            <a href="#demo" className="btn btn-primary btn-sm keep" onClick={e => { e.preventDefault(); scrollToId('demo') }}>Book a demo</a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="hero wrap">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="badge">● Built for CA · CS · CMA &amp; tax firms</span>
            <h1>Stop juggling. <span className="grad-text">Start flowing.</span></h1>
            <p className="lede">Run your entire practice with total clarity — worksheets, returns, reminders and team workload in one source of truth that never lets a deadline slip.</p>
            <div className="cta-row">
              <button className="btn btn-primary" onClick={start} disabled={loading}>{loading ? 'Signing in…' : 'Get started free'}</button>
              <button className="btn btn-ghost" onClick={() => setLaunchOpen(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 6.5v11l9-5.5z" fill="#2F6BFF" /></svg>Watch demo</button>
            </div>
            <div className="trust">
              <span className="avatars"><span style={{ background: '#2F6BFF' }} /><span style={{ background: '#14C7C0' }} /><span style={{ background: '#0E2A47' }} /></span>
              Trusted by firms and their teams
            </div>
          </div>
          <div className="preview" aria-hidden="true">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><h4>WorkZone · Board</h4><span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>FY 2025‑26</span></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><span className="chip">Pending 24</span><span className="chip" style={{ background: 'rgba(47,107,255,.16)', color: '#5B9BFF' }}>In Progress 1</span></div>
            <div className="task" style={{ borderLeft: '3px solid var(--danger)' }}>
              <div className="name">Milind Rathod</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}><span className="chip">GSTR Returns</span><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>Jan 2026</span></div>
              <div className="mono" style={{ marginTop: 7, fontSize: 10.5, color: 'var(--danger)', fontWeight: 600 }}>⚠ Due 2026‑02‑11</div>
            </div>
            <div className="task" style={{ borderLeft: '3px solid var(--teal)' }}>
              <div className="name">Omkar Mane</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}><span className="chip" style={{ background: 'var(--badge-bg)', color: 'var(--teal-fg)' }}>Income Tax Return</span></div>
              <div className="mono" style={{ marginTop: 7, fontSize: 10.5, color: 'var(--success)', fontWeight: 600 }}>On track · 2026‑07‑31</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section wrap" id="features">
        <div style={{ textAlign: 'center', marginBottom: 46 }}>
          <span className="eyebrow">Everything in one place</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 12 }}>Built for the way practices actually work</h2>
        </div>
        <div className="grid cols-3">
          {FEATURES.map((f, i) => (
            <div className="feature" key={i}>
              <div className="ico">{fico(f.p)}</div>
              <h3>{f.h}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="section wrap" id="workflow" style={{ background: 'var(--canvas)', borderRadius: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 46 }}>
          <span className="eyebrow">From onboarding to filed</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 12 }}>Your practice, in flow</h2>
        </div>
        <div className="steps">
          {[['1', 'Import clients', 'Bring your client list from Excel — columns map automatically.'],
            ['2', 'Auto-build calendar', 'Compliance due dates populate for every client and work type.'],
            ['3', 'Assign & track', 'Push work to the team and watch it move across the board.'],
            ['4', 'Review & file', 'Approve, mark filed, and keep a clean audit trail of everything.']].map(s => (
            <div className="step" key={s[0]}><div className="num">{s[0]}</div><h3>{s[1]}</h3><p>{s[2]}</p></div>
          ))}
        </div>
      </section>

      {/* BOARD SHOWCASE */}
      <section className="section wrap">
        <div style={{ textAlign: 'center', marginBottom: 38 }}>
          <span className="eyebrow">In-app preview</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 12 }}>One board for the whole firm</h2>
        </div>
        <div className="showcase">
          <div className="board">
            <div className="column">
              <div className="head"><span className="dot" style={{ background: 'var(--muted)' }} />Pending<span className="count" style={{ color: 'var(--muted)' }}>24</span></div>
              <div className="card" style={{ borderLeftColor: 'var(--danger)' }}><div className="name">Milind Rathod</div><div style={{ marginTop: 7 }}><span className="chip">GSTR Returns</span></div><div className="meta mono">⚠ 2026‑02‑11</div></div>
              <div className="card" style={{ borderLeftColor: 'var(--danger)' }}><div className="name">Raj Bhoite</div><div style={{ marginTop: 7 }}><span className="chip">GSTR 3B</span></div><div className="meta mono">⚠ 2026‑04‑20</div></div>
            </div>
            <div className="column">
              <div className="head"><span className="dot" style={{ background: 'var(--progress)' }} />In Progress<span className="count" style={{ color: 'var(--progress)' }}>1</span></div>
              <div className="card" style={{ borderLeftColor: 'var(--progress)' }}><div className="name">Milind Rathod</div><div style={{ marginTop: 7 }}><span className="chip">GSTR Returns</span></div><div className="meta">Priya N. · <span className="mono" style={{ color: 'var(--danger)', fontWeight: 700 }}>2026‑04‑11</span></div><div className="bar"><i style={{ width: '62%' }} /></div></div>
            </div>
            <div className="column">
              <div className="head"><span className="dot" style={{ background: 'var(--warning)' }} />Under Review<span className="count" style={{ color: 'var(--warning)' }}>2</span></div>
              <div className="card" style={{ borderLeftColor: 'var(--warning)' }}><div className="name">Sandip Kale</div><div style={{ marginTop: 7 }}><span className="chip">ITR Filing</span></div><div className="meta">Aarti S. · <span className="mono">2026‑07‑31</span></div></div>
            </div>
            <div className="column">
              <div className="head"><span className="dot" style={{ background: 'var(--success)' }} />Completed<span className="count" style={{ color: 'var(--success)' }}>9</span></div>
              <div className="card" style={{ borderLeftColor: 'var(--success)', opacity: .92 }}><div className="name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>OM &amp; Associates <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#1FA971" /><path d="M7.5 12.5 11 16 16.5 8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></div><div style={{ marginTop: 7 }}><span className="chip">Income Tax Return</span></div><div className="meta mono">Filed · 2026‑06‑28</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* IN-APP PREVIEWS */}
      <section className="section wrap">
        <div style={{ textAlign: 'center', marginBottom: 38 }}>
          <span className="eyebrow">One workspace, every workflow</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 12 }}>Everything your practice runs on</h2>
        </div>
        <div className="grid cols-3">
          <div className="preview-card">
            <div className="ph"><span className="ico">{fico(<><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 8 7 5 7-5" /></>)}</span><h3>Communications</h3></div>
            <div className="mini"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>GST reminder sent</span><span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>2:14 PM</span></div><div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>To Milind Rathod · GSTR-3B due in 3 days</div></div>
            <div className="mini"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>Docs requested</span><span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>Yst</span></div><div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>To Sandip Kale · Bank statements FY25‑26</div></div>
          </div>
          <div className="preview-card">
            <div className="ph"><span className="ico">{fico(<><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></>)}</span><h3>Client Ledger</h3></div>
            <div className="mini">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', paddingBottom: 8, borderBottom: '1px solid var(--inner-border)' }}><span>Invoice</span><span>Amount</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12.5, color: 'var(--text)' }}><span>#INV‑2041 · Filing fee</span><span className="mono">₹12,000</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12.5, color: 'var(--text)', borderTop: '1px solid var(--inner-border)' }}><span>#INV‑2038 · Advisory</span><span className="mono">₹8,500</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 9, marginTop: 3, borderTop: '1px solid var(--inner-border)', fontWeight: 800, fontSize: 12.5, color: 'var(--text)' }}><span>Outstanding</span><span className="mono" style={{ color: 'var(--warning)' }}>₹20,500</span></div>
            </div>
          </div>
          <div className="preview-card">
            <div className="ph"><span className="ico">{fico(<path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4z" />)}</span><h3>Team Chat</h3></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}><span style={{ width: 26, height: 26, borderRadius: '50%', background: '#2F6BFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>PN</span><div style={{ background: 'var(--inner)', border: '1px solid var(--inner-border)', borderRadius: 10, padding: '8px 11px', fontSize: 12, color: 'var(--text)' }}>Rathod's GSTR is ready for review 👍</div></div>
            <div style={{ display: 'flex', gap: 8, flexDirection: 'row-reverse' }}><span style={{ width: 26, height: 26, borderRadius: '50%', background: '#14C7C0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>AS</span><div style={{ background: 'var(--grad)', color: '#fff', borderRadius: 10, padding: '8px 11px', fontSize: 12 }}>On it — filing today.</div></div>
          </div>
          <div className="preview-card">
            <div className="ph"><span className="ico">{fico(<><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>)}</span><h3>WorkZone</h3></div>
            <div className="mini" style={{ borderLeft: '3px solid var(--progress)' }}><div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>GSTR Returns · Rathod</div><div className="bar" style={{ marginTop: 8 }}><i style={{ width: '62%' }} /></div></div>
            <div className="mini" style={{ borderLeft: '3px solid var(--success)' }}><div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>ITR · OM &amp; Associates</div><div className="mono" style={{ fontSize: 10.5, color: 'var(--success)', marginTop: 5, fontWeight: 600 }}>Filed · 2026‑06‑28</div></div>
          </div>
          <div className="preview-card">
            <div className="ph"><span className="ico">{fico(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>)}</span><h3>Client Portal</h3></div>
            <div className="mini" style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--badge-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal-fg)' }}>{fico(<><path d="M12 16V5m0 0L8 9m4-4 4 4" /><path d="M5 17v2h14v-2" /></>)}</span><div><div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>Upload documents</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>3 pending requests</div></div></div>
            <div className="mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Form 16 · FY24‑25</span><span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--success)', background: 'var(--badge-bg)', padding: '3px 8px', borderRadius: 99 }}>Approved</span></div>
          </div>
          <div className="preview-card">
            <div className="ph"><span className="ico">{fico(<path d="M5 19V5M5 19h14M9 16v-4M13 16V8M17 16v-6" />)}</span><h3>Analytics</h3></div>
            <div className="mini" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96, padding: '14px 11px' }}>
              {['40%', '62%', '50%', '85%', '70%'].map((h, i) => <div key={i} style={{ flex: 1, height: h, borderRadius: '5px 5px 0 0', background: i === 3 ? 'var(--grad)' : 'var(--seg)' }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 11.5, color: 'var(--text-2)' }}><span>Work filed this month</span><span style={{ fontWeight: 800, color: 'var(--text)' }}>128</span></div>
          </div>
        </div>
      </section>

      {/* DEMO + SUPPORT */}
      <section className="section wrap" id="demo" style={{ paddingTop: 0 }}>
        <div className="two-col">
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 22, padding: 34, boxShadow: 'var(--shadow-panel)' }}>
            <span className="eyebrow">Book a demo</span>
            <h2 style={{ fontSize: 'clamp(22px,2.4vw,28px)', margin: '12px 0 8px' }}>See TaskFlowCo on your own practice</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-2)', margin: '0 0 22px', maxWidth: '44ch' }}>A 20-minute walkthrough with our team. We'll map your work types and show you exactly how your firm would run.</p>
            <DemoForm />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="support-card">
              <span className="ico">{fico(<path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4z" />)}</span>
              <h3 style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 800 }}>Chat with support</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-2)', margin: '0 0 14px' }}>Real humans, Mon–Sat 9am–7pm IST. Average first reply under 5 minutes.</p>
              <a href="mailto:support@taskflowco.in" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13, color: 'var(--blue)' }}>Start a chat <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
            </div>
            <div className="support-card">
              <span className="ico">{fico(<><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 8 7 5 7-5" /></>)}</span>
              <h3 style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 800 }}>Email us</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-2)', margin: '0 0 10px' }}>Questions about migrating or pricing? We're glad to help.</p>
              <a href="mailto:support@taskflowco.in" className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>support@taskflowco.in</a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq" style={{ maxWidth: 820, margin: '0 auto', padding: '0 28px 88px' }}>
        <div style={{ textAlign: 'center', marginBottom: 38 }}>
          <span className="eyebrow">Questions</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 12 }}>Everything you're wondering</h2>
        </div>
        <FAQItem defaultOpen q="Is TaskFlowCo built specifically for CA / CS / CMA firms?" a="Yes. The compliance calendar, work types and worksheets are pre-built for Indian practice work — GST, ITR, ROC and more — so you are productive on day one." />
        <FAQItem q="Can I import my existing client list?" a="Absolutely. Upload an Excel sheet and we map the columns automatically. Most firms import their entire client base in a few minutes." />
        <FAQItem q="Do I need a card to start?" a="No. Sign up free on the Free plan — free forever for up to 25 clients, no card required. Upgrade to Pro or Max whenever your team is ready; switch between monthly and yearly anytime." />
        <FAQItem q="Is my client data secure?" a="Data is encrypted in transit and at rest, hosted in India, with role-based access and a full audit trail on every action. The Max plan adds SSO." />
        <FAQItem q="Can clients upload documents themselves?" a="Yes — the Client Portal lets clients respond to document requests and approvals directly, so you stop chasing paperwork over email and WhatsApp." />
        <FAQItem q="What's free and what's paid?" a="Workspaces (Kanban boards), the WorkZone board and the compliance calendar are free for life. The Practice Hub is free for your first 6 months. Communication (client email & portal) and Billing (invoices & payments) are paid add-ons." />
        <FAQItem q="Will you help me get set up?" a="Yes — onboarding is free. Our team imports your client list, configures your work types and gets your first period live with you. Book a slot from the 'Get onboarding help' button in pricing or the demo section." />
      </section>

      {/* TESTIMONIAL */}
      <section className="section wrap">
        <div className="quote">
          <p>"We streamlined our tasks and closed work and filing seasons without miscommunication or missed updates. TaskFlowCo replaced many worksheets and WhatsApp groups."</p>
          <div className="who">Vaibhav Bhoite — Founder, TaskFlowCo</div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section wrap" id="pricing">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span className="eyebrow">Simple pricing</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 12 }}>One price per firm. Your whole team included.</h2>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 8 }}>No per-user fees. No setup cost. Start free, upgrade when you're ready.</p>
        </div>
        {/* Monthly / Yearly toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 99, padding: 4 }}>
            {['monthly', 'yearly'].map(cyc => (
              <button key={cyc} onClick={() => setBilling(cyc)} style={{ border: 'none', cursor: 'pointer', borderRadius: 99, padding: '8px 18px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7, background: billing === cyc ? 'var(--grad)' : 'transparent', color: billing === cyc ? '#fff' : 'var(--text-2)', transition: 'all .15s' }}>
                {cyc === 'monthly' ? 'Monthly' : 'Yearly'}
                {cyc === 'yearly' && <span style={{ fontSize: 10, fontWeight: 800, background: billing === 'yearly' ? 'rgba(255,255,255,.22)' : 'rgba(20,199,192,.15)', color: billing === 'yearly' ? '#fff' : '#0EA5A0', borderRadius: 99, padding: '2px 7px' }}>Save 2 months</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="price-grid">
          <div className="plan">
            <h3>Free</h3>
            <div className="amt">₹0<small>/mo</small></div>
            <p style={{ color: 'var(--text-2)', fontSize: 13.5, margin: 0 }}>For an individual practitioner starting out.</p>
            <ul><li>{check}Up to 25 clients</li><li>{check}Workspaces — Kanban boards <b style={{color:'#0EA5A0'}}>(free for life)</b></li><li>{check}WorkZone + Stages board</li><li>{check}Compliance calendar &amp; My Work planner</li></ul>
            <button className="btn btn-ghost" onClick={start} style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>Get started free</button>
            {currentOrgId && (
              <button onClick={() => buyPlan('starter')} style={{ width:'100%', background:'none', border:'1px solid var(--border)', borderRadius:10, padding:'9px 0', fontSize:12.5, fontWeight:700, color:'var(--text-2)', cursor:'pointer', fontFamily:'inherit' }}>
                Or buy Starter ₹{billing === 'yearly' ? '833' : '999'}/mo →
              </button>
            )}
          </div>
          <div className="plan featured">
            <span className="tag">Most popular</span>
            <h3>Pro</h3>
            <div className="amt">₹{billing === 'yearly' ? '1,249' : '1,499'}<small>/mo</small></div>
            <p style={{ color: 'var(--text-2)', fontSize: 12.5, margin: '0 0 2px', minHeight: 18 }}>{billing === 'yearly' ? 'Billed ₹14,990/year — 2 months free' : 'Billed monthly · switch to yearly to save'}</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13.5, margin: 0 }}>For a growing firm running work as a team.</p>
            <ul><li>{check}Everything in Free</li><li>{check}Unlimited clients &amp; up to 15 team members</li><li>{check}Practice Hub <b style={{color:'#0EA5A0'}}>(free for 6 months)</b></li><li>{check}Communication &amp; Billing <span style={{color:'var(--muted)'}}>— paid add-ons</span></li><li>{check}Analytics &amp; on-time reports</li><li>{check}Automated work reminders</li><li>{check}Rolling assignments &amp; time tracking</li></ul>
            <button className="btn btn-primary" onClick={() => buyPlan('pro')} style={{ width: '100%', justifyContent: 'center' }}>
              {currentOrgId ? '⚡ Upgrade to Pro' : '⚡ Buy Pro — ₹' + (billing === 'yearly' ? '1,666' : '1,999') + '/mo'}
            </button>
            <p style={{ textAlign:'center', fontSize:11, color:'var(--muted)', margin:'8px 0 0' }}>
              {currentOrgId ? 'Instant activation · Invoice emailed automatically' : 'Sign in, then complete checkout'}
            </p>
          </div>
          <div className="plan">
            <h3>Max</h3>
            <div className="amt">Custom</div>
            <p style={{ color: 'var(--text-2)', fontSize: 12.5, margin: '0 0 2px', minHeight: 18 }}>Tailored to your firm's size &amp; branches</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13.5, margin: 0 }}>For multi-branch practices &amp; advisory groups.</p>
            <ul><li>{check}Everything in Pro</li><li>{check}Unlimited team members</li><li>{check}Multiple branches / offices</li><li>{check}SSO &amp; advanced roles</li><li>{check}Priority support &amp; onboarding</li></ul>
            <button className="btn btn-ghost" onClick={() => scrollToId('demo')} style={{ width: '100%', justifyContent: 'center' }}>Talk to sales</button>
          </div>
        </div>
        {/* Practice Hub promo + onboarding help */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 28 }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(47,107,255,.08),rgba(20,199,192,.08))', border: '1px solid rgba(20,199,192,.3)', borderRadius: 16, padding: '20px 22px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>🎁</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>Practice Hub — free for 6 months</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}><b>Workspaces (Kanban)</b> is free for life. The <b>Practice Hub</b> is free for your first 6 months. <b>Communication</b> (client email &amp; portal) and <b>Billing</b> (invoices &amp; payments) are paid add-ons.</p>
            </div>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 16, padding: '20px 22px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>🤝</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>Free onboarding &amp; client migration</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.55 }}>New to TaskFlowCo? Our team imports your client list, sets up your work types and gets your first period running — at no cost.</p>
              <button className="btn btn-ghost" onClick={() => scrollToId('demo')} style={{ fontSize: 13, padding: '8px 16px' }}>Get onboarding help →</button>
            </div>
          </div>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 12, marginTop: 22 }}>All prices in ₹, exclude 18% GST · Cancel anytime · Your data stays yours</p>
      </section>

      {/* CTA BAND */}
      <section className="section wrap">
        <div className="cta-band">
          <h2>Give every deadline a home.</h2>
          <p>Join firms and their teams who run their compliance work on TaskFlowCo. Free to start, no card required.</p>
          <button className="btn btn-primary" onClick={start} style={{ fontSize: 15.5, padding: '15px 30px' }}>Get started free</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap cols">
          <div>
            <Logo footer />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#9FB6D4', margin: '16px 0 0', maxWidth: '30ch' }}>Practice management for CA, CS, CMA &amp; tax firms. Every filing, deadline and client in one calm workspace.</p>
          </div>
          <div><h5>Product</h5><a href="#features" onClick={e => { e.preventDefault(); scrollToId('features') }}>Features</a><a href="#pricing" onClick={e => { e.preventDefault(); scrollToId('pricing') }}>Pricing</a><a href="#workflow" onClick={e => { e.preventDefault(); scrollToId('workflow') }}>WorkZone</a><a href="#demo" onClick={e => { e.preventDefault(); scrollToId('demo') }}>Book a demo</a></div>
          <div><h5>Company</h5><a href="#">About</a><a href="#">Customers</a><a href="#">Careers</a><a href="mailto:support@taskflowco.in">Contact</a></div>
          <div><h5>Resources</h5><a href="mailto:support@taskflowco.in">Help center</a><a href="#faq" onClick={e => { e.preventDefault(); scrollToId('faq') }}>FAQ</a><a href="#">Blog</a><a href="#">Status</a></div>
        </div>
        <div className="wrap bottom">
          <span>© 2026 TaskFlowCo. All rights reserved.</span>
          <span>Privacy · Terms · Security</span>
        </div>
      </footer>
    </div>
  )
}
