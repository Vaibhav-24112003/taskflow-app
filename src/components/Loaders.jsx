// Loading / spinner / progress state family — design refresh
// (handoff: TaskFlowCo Design Improvements, deliverable #3)
//
// Inline-styled to match the rest of the app. Keyframes injected once.
// Brand gradient: #2F6BFF → #14C7C0. Respects prefers-reduced-motion.
//
// Exports: BrandRing, CheckDraw, ThinkingDots, ProgressBar, Skeleton, BrandLoader

var _loaderKeyframes = false;
function ensureLoaderKeyframes() {
  if (_loaderKeyframes || typeof document === "undefined") return;
  _loaderKeyframes = true;
  var el = document.createElement("style");
  el.setAttribute("data-tf-loaders", "");
  el.textContent =
    "@keyframes tf-spin{to{transform:rotate(360deg)}}" +
    "@keyframes tf-checkloop{0%{stroke-dashoffset:64}45%{stroke-dashoffset:0}75%{stroke-dashoffset:0}100%{stroke-dashoffset:-64}}" +
    "@keyframes tf-dotp{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}" +
    "@keyframes tf-indet{0%{left:-40%;width:40%}50%{width:55%}100%{left:100%;width:40%}}" +
    "@keyframes tf-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}" +
    "@media (prefers-reduced-motion: reduce){[data-tf-anim]{animation-duration:.001ms!important;animation-iteration-count:1!important}}";
  document.head.appendChild(el);
}

// Conic-gradient ring masked to a stroke, spinning.
export function BrandRing({ size = 44, thickness = 4 }) {
  ensureLoaderKeyframes();
  var mask =
    "radial-gradient(farthest-side, transparent calc(100% - " +
    thickness +
    "px), #000 calc(100% - " +
    thickness +
    "px))";
  return (
    <div
      data-tf-anim
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "conic-gradient(from 90deg, rgba(47,107,255,0) 0deg, #2F6BFF 200deg, #14C7C0 340deg, rgba(20,199,192,0) 360deg)",
        WebkitMask: mask,
        mask: mask,
        animation: "tf-spin 1s linear infinite",
        flexShrink: 0,
      }}
      aria-label="Loading"
      role="status"
    />
  );
}

// Self-drawing check that loops "saving → done".
export function CheckDraw({ size = 44, color = "#1FA971" }) {
  ensureLoaderKeyframes();
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="36" cy="36" r="30" fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="5" />
      <path
        data-tf-anim
        d="M20 38 32 50 54 22"
        pathLength={64}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ strokeDasharray: 64, strokeDashoffset: 64, animation: "tf-checkloop 2.2s ease-in-out infinite" }}
      />
    </svg>
  );
}

// Three staggered dots.
export function ThinkingDots({ size = 8, color = "#2F6BFF" }) {
  ensureLoaderKeyframes();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.75 }} role="status" aria-label="Thinking">
      {[0, 1, 2].map(function (i) {
        return (
          <span
            key={i}
            data-tf-anim
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              display: "inline-block",
              animation: "tf-dotp 1.2s ease-in-out infinite",
              animationDelay: i * 0.18 + "s",
            }}
          />
        );
      })}
    </span>
  );
}

// Indeterminate progress bar.
export function ProgressBar({ height = 6, dark = false }) {
  ensureLoaderKeyframes();
  return (
    <div
      style={{
        position: "relative",
        height: height,
        borderRadius: 999,
        overflow: "hidden",
        background: dark ? "rgba(255,255,255,0.08)" : "#E9EEF5",
      }}
      role="progressbar"
      aria-label="Loading"
    >
      <div
        data-tf-anim
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          borderRadius: 999,
          background: "linear-gradient(135deg,#2F6BFF,#14C7C0)",
          animation: "tf-indet 1.4s cubic-bezier(.4,0,.2,1) infinite",
        }}
      />
    </div>
  );
}

// Shimmering content skeleton line/block.
export function Skeleton({ width = "100%", height = 14, radius = 8, dark = false, style = {} }) {
  ensureLoaderKeyframes();
  var base = dark ? "#12324F" : "#EEF3F9";
  var hi = dark ? "rgba(255,255,255,0.08)" : "#F7FAFD";
  return (
    <div
      data-tf-anim
      style={Object.assign(
        {
          width: width,
          height: height,
          borderRadius: radius,
          background: "linear-gradient(90deg," + base + " 25%," + hi + " 50%," + base + " 75%)",
          backgroundSize: "200% 100%",
          animation: "tf-shimmer 1.3s linear infinite",
        },
        style
      )}
    />
  );
}

// Full-screen / block brand loader with the ring + label.
export function BrandLoader({ label = "Loading…", dark = false, fullscreen = false }) {
  var wrap = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    color: dark ? "#8AA0BB" : "#5A6E87",
    fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
    fontSize: 13,
    fontWeight: 600,
  };
  if (fullscreen)
    Object.assign(wrap, {
      minHeight: "100vh",
      background: dark ? "linear-gradient(160deg,#0B2038,#0E2A47)" : "#F4F7FB",
    });
  else Object.assign(wrap, { padding: 40 });
  return (
    <div style={wrap}>
      <BrandRing />
      <div>{label}</div>
    </div>
  );
}
