import { useState, useEffect, useRef, useCallback } from 'react';

const SLIDE_MS = 4800;

const SLIDES = [
  { img: '/tour/slide-00.png', module: 'Your Diary',                    caption: 'Your personalised daily workspace',                pills: ['Plan My Day', '6 active works'] },
  { img: '/tour/slide-01.png', module: 'Your Diary · Board View',       caption: 'All tasks by status — nothing slips through',      pills: ['Pending · In Progress · Review', 'Client & work type on every card'] },
  { img: '/tour/slide-02.png', module: 'Your Diary · By Work Type',     caption: 'GSTR, TDS, ITR — sorted instantly',                pills: ['GSTR 1 · GSTR 3B · ITR · TDS', 'One toggle, different lens'] },
  { img: '/tour/slide-03.png', module: 'Your Diary · Calendar',         caption: 'All deadlines mapped across the month',            pills: ['Monthly deadline view', 'Click any date to see tasks'] },
  { img: '/tour/slide-04.png', module: 'WorkZone · Worksheets',         caption: 'Every client × every work type — one master grid', pills: ['Grid · Pipeline · Funnel views', '2 clients · 5 work types'] },
  { img: '/tour/slide-05.png', module: 'WorkZone · Pipeline',           caption: 'Stage-by-stage visual progress',                   pills: ['Not Started → Done', 'Drag cards to update stage'] },
  { img: '/tour/slide-06.png', module: 'WorkZone · Funnel',             caption: 'Spot bottlenecks before deadlines hit',            pills: ['Colour-coded completion', 'Total clients per stage'] },
  { img: '/tour/slide-07.png', module: 'WorkZone · Big Clients',        caption: 'Dedicated monthly checklist for top accounts',     pills: ['Accounting · Reco · Finalisation', 'Monthly checklist per client'] },
  { img: '/tour/slide-08.png', module: 'WorkZone · Team Workload',      caption: "See who's at capacity, who has room",              pills: ['Heatmap · 7d · 14d · 30d', 'Active tasks per member'] },
  { img: '/tour/slide-09.png', module: 'Team · Daily Logs',             caption: 'Attendance, leaves & hours — all in one place',    pills: ['26 working days tracked', 'Attendance · Leave · Time entries'] },
  { img: '/tour/slide-10.png', module: 'Library · Credentials',         caption: 'Every portal login — secure and searchable',       pills: ['GST · IT · MCA portals', 'Search by client or PAN'] },
  { img: '/tour/slide-11.png', module: 'Analytics Dashboard',           caption: 'Org-wide compliance overview',                     pills: ['43% completed this FY', 'Drill into any work type'] },
  { img: '/tour/slide-12.png', module: 'Communication · Client Connect', caption: 'Send document requests to clients',               pills: ['GST Data request · SENT', 'Status tracked per client'] },
  { img: '/tour/slide-13.png', module: 'Communication · Client Portal', caption: 'Clients respond via a simple shareable link',      pills: ['Shareable portal link', 'No app download required'] },
  { img: '/tour/slide-14.png', module: 'Communication · Bulk Email',    caption: 'Email all clients in one compose window',          pills: ['Filter by work type', 'Templates for common messages'] },
  { img: '/tour/slide-15.png', module: 'Billing · Tax Invoice',         caption: 'GST-compliant invoices with auto-TDS',             pills: ['GST 18% · TDS 10% auto-calc', 'Send · Share · Mark Paid'] },
  { img: '/tour/slide-16.png', module: 'Billing · Client Statement',    caption: 'Complete account statement, one click',            pills: ['Invoiced · Paid · Balance', 'Generate & Print instantly'] },
  { img: '/tour/slide-17.png', module: 'Billing · Export',              caption: 'Export to Tally, Zoho Books & Excel',              pills: ['Tally JSON · Zoho CSV · Excel', 'All formats, always current'] },
  { img: '/tour/slide-18.png', module: 'TaskFlowCo',                    caption: 'The operating system for your accounting practice', pills: ['Work · Clients · Team · Billing', 'Built for Indian CAs'] },
];

const MOTIONS = ['kbZI','kbZO','kbPR','kbZI','kbZO','kbPL','kbZI','kbPR','kbZO','kbPL','kbZI','kbZO','kbPR','kbPL','kbZI','kbZO','kbPR','kbPL','kbZO'];

const TOUR_CSS = `
  @keyframes kbZI { from{transform:scale(1.00)}   to{transform:scale(1.10)} }
  @keyframes kbZO { from{transform:scale(1.10)}   to{transform:scale(1.00)} }
  @keyframes kbPR { from{transform:scale(1.07) translateX(-1.5%)} to{transform:scale(1.07) translateX(1.5%)} }
  @keyframes kbPL { from{transform:scale(1.07) translateX(1.5%)}  to{transform:scale(1.07) translateX(-1.5%)} }

  @keyframes tfCardUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes tfTitleIn {
    from { transform: translateY(18px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes tfCapIn {
    from { transform: translateY(12px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes tfPill1 {
    0%,20%  { transform:translateX(72px); opacity:0; }
    30%     { transform:translateX(0);    opacity:1; }
    76%     { transform:translateX(0);    opacity:1; }
    88%,100%{ transform:translateX(72px); opacity:0; }
  }
  @keyframes tfPill2 {
    0%,36%  { transform:translateX(72px); opacity:0; }
    46%     { transform:translateX(0);    opacity:1; }
    76%     { transform:translateX(0);    opacity:1; }
    88%,100%{ transform:translateX(72px); opacity:0; }
  }
  @keyframes tfSlideIn {
    from { opacity:0; }
    to   { opacity:1; }
  }
  @keyframes tfOverlayIn {
    from { opacity:0; backdrop-filter:blur(0px); }
    to   { opacity:1; backdrop-filter:blur(6px); }
  }
  .tour-img-wrap { width:100%; height:100%; overflow:hidden; position:absolute; inset:0; }
  .tour-img-wrap img { width:100%; height:100%; object-fit:cover; transform-origin:center center; }
`;

export default function TourModal({ onClose }) {
  const [idx, setIdx]       = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProg] = useState(0);
  const stepRef = useRef(0);
  const pausedRef = useRef(false);

  pausedRef.current = paused;

  const goTo = useCallback((n) => {
    setIdx(n);
    stepRef.current = 0;
    setProg(0);
  }, []);

  const goNext = useCallback(() => goTo((idx + 1) % SLIDES.length), [idx, goTo]);
  const goPrev = useCallback(() => goTo((idx - 1 + SLIDES.length) % SLIDES.length), [idx, goTo]);

  // Auto-advance timer
  useEffect(() => {
    stepRef.current = 0;
    setProg(0);
    const TICK = 50;
    const TOTAL_STEPS = SLIDE_MS / TICK;

    const iv = setInterval(() => {
      if (pausedRef.current) return;
      stepRef.current += 1;
      const p = stepRef.current / TOTAL_STEPS;
      setProg(Math.min(p, 1));
      if (stepRef.current >= TOTAL_STEPS) {
        clearInterval(iv);
        setIdx(i => (i + 1) % SLIDES.length);
      }
    }, TICK);

    return () => clearInterval(iv);
  }, [idx]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowRight')  goNext();
      if (e.key === 'ArrowLeft')   goPrev();
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  const slide  = SLIDES[idx];
  const motion = MOTIONS[idx];
  const anim   = `${motion} ${SLIDE_MS}ms linear forwards`;
  const ps     = paused ? 'paused' : 'running';

  return (
    <>
      <style>{TOUR_CSS}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:'fixed', inset:0, zIndex:9000,
          background:'rgba(5,8,20,0.88)',
          backdropFilter:'blur(6px)',
          WebkitBackdropFilter:'blur(6px)',
          animation:'tfOverlayIn 0.3s ease',
        }}
      />

      {/* Viewer */}
      <div
        style={{
          position:'fixed', inset:0, zIndex:9001,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          padding:'20px 24px',
          pointerEvents:'none',
        }}
      >
        <div
          style={{
            width:'100%', maxWidth:1320,
            pointerEvents:'all',
            animation:'tfSlideIn 0.3s ease',
          }}
        >
          {/* Top bar: progress dots + close */}
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10, paddingLeft:2}}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  flex: i === idx ? 3 : 1,
                  height: 3,
                  borderRadius: 2,
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  background: i === idx
                    ? `linear-gradient(90deg, #2563eb ${progress*100}%, rgba(255,255,255,0.25) ${progress*100}%)`
                    : i < idx ? '#2563eb' : 'rgba(255,255,255,0.2)',
                  transition: 'flex 0.3s ease',
                }}
              />
            ))}
            <button
              onClick={onClose}
              style={{
                marginLeft:8, background:'rgba(255,255,255,0.1)', border:'none',
                borderRadius:8, color:'#fff', cursor:'pointer', width:32, height:32,
                fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
                flexShrink:0,
              }}
            >×</button>
          </div>

          {/* Main slide frame */}
          <div
            style={{
              position:'relative',
              borderRadius:12,
              overflow:'hidden',
              aspectRatio:'16/9',
              background:'#f1f5f9',
              boxShadow:'0 32px 80px rgba(0,0,0,0.6)',
              cursor: paused ? 'pointer' : 'default',
            }}
            onClick={() => setPaused(p => !p)}
          >
            {/* Ken Burns image */}
            <div className="tour-img-wrap">
              <img
                key={idx}
                src={slide.img}
                alt={slide.module}
                style={{ animation: anim, animationPlayState: ps }}
                draggable={false}
              />
            </div>

            {/* Slight dark gradient at bottom so card text pops */}
            <div style={{
              position:'absolute', inset:0,
              background:'linear-gradient(to top, rgba(0,0,0,0.18) 0%, transparent 40%)',
              pointerEvents:'none',
            }}/>

            {/* Pill callouts */}
            <div style={{position:'absolute', right:20, bottom:110, display:'flex', flexDirection:'column', gap:10, alignItems:'flex-end'}}>
              {slide.pills.map((pill, i) => (
                <div
                  key={`${idx}-${i}`}
                  style={{
                    background: i === 0 ? '#2563eb' : '#1e3a8a',
                    color:'#fff',
                    borderRadius:8,
                    padding:'8px 16px',
                    fontSize:'clamp(11px,1.1vw,14px)',
                    fontWeight: i === 0 ? 700 : 500,
                    letterSpacing:'-0.01em',
                    boxShadow:'0 4px 16px rgba(0,0,0,0.35)',
                    whiteSpace:'nowrap',
                    animation:`tfPill${i+1} ${SLIDE_MS}ms ease-in-out forwards`,
                    animationPlayState: ps,
                  }}
                >
                  {i === 0 ? '→ ' : '· '}{pill}
                </div>
              ))}
            </div>

            {/* Bottom info card */}
            <div
              key={idx}
              style={{
                position:'absolute', bottom:0, left:0, right:0,
                background:'#fff',
                borderTop:'3px solid #2563eb',
                padding:'14px 20px 16px 24px',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                animation:'tfCardUp 0.55s cubic-bezier(0.34,1.4,0.64,1) forwards',
              }}
            >
              <div>
                <div
                  key={`t-${idx}`}
                  style={{
                    fontSize:'clamp(14px,1.5vw,20px)', fontWeight:800,
                    color:'#1e3a8a', letterSpacing:'-0.03em',
                    animation:'tfTitleIn 0.4s 0.15s ease both',
                  }}
                >
                  {slide.module}
                </div>
                <div
                  key={`c-${idx}`}
                  style={{
                    fontSize:'clamp(11px,1.1vw,14px)', color:'#64748b', marginTop:3,
                    animation:'tfCapIn 0.4s 0.25s ease both',
                  }}
                >
                  {slide.caption}
                </div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:12, flexShrink:0, marginLeft:16}}>
                <span style={{fontSize:'clamp(10px,1vw,13px)', color:'#94a3b8', fontVariantNumeric:'tabular-nums'}}>
                  {idx + 1} / {SLIDES.length}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); setPaused(p => !p); }}
                  style={{
                    background:'#f1f5f9', border:'1px solid #e2e8f0',
                    borderRadius:6, color:'#64748b', cursor:'pointer',
                    width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12,
                  }}
                  title={paused ? 'Play (Space)' : 'Pause (Space)'}
                >
                  {paused ? '▶' : '⏸'}
                </button>
              </div>
            </div>

            {/* Pause overlay hint */}
            {paused && (
              <div style={{
                position:'absolute', inset:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                pointerEvents:'none',
              }}>
                <div style={{
                  background:'rgba(0,0,0,0.5)', borderRadius:50,
                  width:64, height:64,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:24, color:'#fff',
                }}>▶</div>
              </div>
            )}
          </div>

          {/* Bottom nav */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12, paddingLeft:2, paddingRight:4}}>
            <button
              onClick={goPrev}
              style={{
                background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8,
                color:'#fff', cursor:'pointer', padding:'8px 18px',
                fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
              }}
            >
              ‹ Prev
            </button>

            {/* Section label */}
            <span style={{fontSize:12, color:'rgba(255,255,255,0.45)', letterSpacing:'0.06em', textTransform:'uppercase'}}>
              {slide.module.split('·')[0].trim()}
            </span>

            <button
              onClick={goNext}
              style={{
                background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8,
                color:'#fff', cursor:'pointer', padding:'8px 18px',
                fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6,
              }}
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
