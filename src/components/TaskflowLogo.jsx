// Taskflowco wordmark — design round 10 (handoff: Taskflowco Logo v10.html)
//
// Layout:  "Taskflo" + small-v bridge + hand-drawn asymmetric V + "co"
//          Geist 800 · ink (white/dark) · V in accent #5e8bb0 · co matches ink
//
// V shape: asymmetric — short left dip, right leg stretched well above cap line
//          per user's pen sketch (round 10).
//
// Use `<TaskflowLogo size={N} />` anywhere a wordmark is needed.

const V_ACCENT = "#5e8bb0";

// Asymmetric pen V — left leg is a small dip to the apex, right leg shoots up
// well past the cap line. Path matches design round 10 Option B ("medium stretch").
function HandV({ size = 110, weight = 13, color = V_ACCENT, tilt = -4, shift = 4 }) {
  const sw = weight * 1.5;
  // M left-top → apex → right-top (right leg ends well above cap line)
  const d = "M 18 38 Q 32 64 50 88 Q 70 50 96 6";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        display: "inline-block",
        verticalAlign: "baseline",
        transform: `translateY(${shift}px) rotate(${tilt}deg)`,
        transformOrigin: "center 70%",
        overflow: "visible",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />
    </svg>
  );
}

export default function TaskflowLogo({
  size = 28,             // stem font-size in px
  inkColor = "#fff",     // colour of "Taskflo", "co", and the small-v bridge
  vColor = V_ACCENT,     // colour of the hand-drawn V stroke (accent blue)
  showCo = true,
  style = {},
}) {
  const vSize = size * 1.1;
  const smallVSize = size * 0.9;

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
      <span style={{ fontSize: smallVSize + "px", fontWeight: 800, margin: "0 -1px" }}>v</span>
      <HandV size={vSize} color={vColor} />
      {showCo && <span>co</span>}
    </span>
  );
}
