// Taskflowco wordmark — design refresh (handoff: TaskFlowCo Design Improvements)
//
// Layout:  "Taskflo" + small-v bridge + self-drawing gradient CHECKMARK (forms
//          the stretched right leg of the "w") + "co"
//
// The check is an SVG path (M4 56 24 78 68 8), stroke-width 12, round caps,
// stroked with the brand gradient. Light: #2F6BFF→#14C7C0 · Dark: #5B9BFF→#14C7C0.
// Pass `animate` to loop the self-draw (loopCheck, 3.4s), or `drawOnce` for a
// one-shot 0.6s draw (used at the onboarding-wizard success moment).
//
// Use `<TaskflowLogo size={N} />` anywhere a wordmark is needed.
// Back-compatible: size / inkColor / showCo / style keep their old meaning.

const V_ACCENT = "#2F6BFF";

// Inject keyframes once (the app is inline-styled; animations need a stylesheet).
var _tfLogoKeyframes = false;
function ensureLogoKeyframes() {
  if (_tfLogoKeyframes || typeof document === "undefined") return;
  _tfLogoKeyframes = true;
  var el = document.createElement("style");
  el.setAttribute("data-tf-logo", "");
  el.textContent =
    "@keyframes tf-loopCheck{0%{stroke-dashoffset:64}35%{stroke-dashoffset:0}68%{stroke-dashoffset:0}100%{stroke-dashoffset:-64}}" +
    "@keyframes tf-drawOnce{0%{stroke-dashoffset:64}100%{stroke-dashoffset:0}}" +
    "@media (prefers-reduced-motion: reduce){.tf-check-anim{animation:none!important;stroke-dashoffset:0!important}}";
  document.head.appendChild(el);
}

// Self-drawing checkmark that forms the "w" right leg.
function CheckMark({ size = 30, dark = false, animate = false, drawOnce = false, gradId }) {
  ensureLogoKeyframes();
  var from = dark ? "#5B9BFF" : "#2F6BFF";
  var to = "#14C7C0";
  var anim = drawOnce
    ? "tf-drawOnce 0.6s ease-out forwards"
    : animate
    ? "tf-loopCheck 3.4s ease-in-out infinite"
    : "none";
  var pathStyle = {
    strokeDasharray: 64,
    strokeDashoffset: animate || drawOnce ? 64 : 0,
    animation: anim,
  };
  return (
    <svg
      width={size}
      height={size * (84 / 72)}
      viewBox="0 0 72 84"
      style={{ display: "inline-block", verticalAlign: "baseline", overflow: "visible", flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        className={animate || drawOnce ? "tf-check-anim" : undefined}
        d="M4 56 24 78 68 8"
        pathLength={64}
        fill="none"
        stroke={"url(#" + gradId + ")"}
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={pathStyle}
      />
    </svg>
  );
}

var _tfGradSeq = 0;

export default function TaskflowLogo({
  size = 28, // stem font-size in px
  inkColor = "#fff", // colour of "Taskflo", "co", and the small-v bridge
  vColor, // kept for API compat (ignored — the check uses the brand gradient)
  dark = false, // dark-mode check gradient variant
  animate = false, // loop the self-draw
  drawOnce = false, // one-shot 0.6s draw
  showCo = true,
  style = {},
}) {
  // Stable-ish unique gradient id per instance so multiple logos don't collide.
  var gradId = "tfCheck" + (++_tfGradSeq);
  var checkSize = size * 0.92;

  return (
    <span
      style={{
        fontFamily: "'Geist','Inter',system-ui,sans-serif",
        fontWeight: 800,
        letterSpacing: "-0.04em",
        lineHeight: 1,
        color: inkColor,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "baseline",
        fontSize: size + "px",
        ...style,
      }}
    >
      <span>Taskflo</span>
      <span style={{ position: "relative", display: "inline-block", width: checkSize * 0.66, height: "1em" }}>
        <span style={{ fontSize: size * 0.9 + "px", fontWeight: 800 }}>v</span>
        <span style={{ position: "absolute", left: checkSize * 0.16, bottom: 0 }}>
          <CheckMark size={checkSize} dark={dark} animate={animate} drawOnce={drawOnce} gradId={gradId} />
        </span>
      </span>
      {showCo && <span style={{ marginLeft: checkSize * 0.12 }}>co</span>}
    </span>
  );
}
