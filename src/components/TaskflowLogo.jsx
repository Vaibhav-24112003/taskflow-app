// Taskflowco wordmark — design round 9 picks (handoff:
// taskflow/project/Taskflowco Logo v9.html).
//
// Layout:  "Taskflo" + small-v bridge + hand-drawn marker V + "co"
//          Geist 800 · ink white over navy · co in #5e8bb0
//          V: marker style, weight 13, -4° tilt, 4px drop, wobble 0 (deterministic)
//
// Use `<TaskflowLogo size={…}>` anywhere a wordmark is needed. The mark scales
// off a single `size` prop (stem font-size, in px).

const PEN_COLOR = "#5e8bb0";

// Hand-drawn V — two pen strokes meeting at a centered apex. NOT a tick.
// viewBox 100x100, deterministic (no jitter — wobble fixed at 0 per design picks).
function HandV({ size = 110, weight = 13, color = "#ffffff", tilt = -4, shift = 4 }) {
  // Marker profile: round caps, 1.5x weight multiplier
  const sw = weight * 1.5;
  // Symmetric V geometry (matches design source verbatim)
  const d = "M 12 10 Q 29 50 50 90 Q 71 50 88 10";

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
  size = 28,           // stem font-size in px (the "Taskflo" / "co" text size)
  inkColor = "#fff",   // colour of "Taskflo" and the hand-V
  coColor = PEN_COLOR, // colour of "co"
  showCo = true,
  style = {},
}) {
  // V is sized ~1.1x the stem, small-v bridge ~0.9x — same ratios as the design.
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
      <HandV size={vSize} color={inkColor} />
      {showCo && <span style={{ color: coColor }}>co</span>}
    </span>
  );
}
