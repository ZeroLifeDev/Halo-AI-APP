/**
 * The Halo mark: an open ring with an orb resting in the gap.
 *
 * Replaces the old sun glyph. It reads as a halo, a shield and an orbit at
 * once, and unlike a sun it doesn't get confused with a brightness control.
 */
export function HaloMark({
  size = 28,
  color = "currentColor",
  gradient = false,
  strokeWidth = 8,
}: {
  size?: number;
  color?: string;
  /** Draw the ring along the calm→storm spectrum instead of a flat colour. */
  gradient?: boolean;
  strokeWidth?: number;
}) {
  const id = `halo-${gradient ? "grad" : "flat"}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" fill="none" aria-hidden="true">
      {gradient && (
        <defs>
          <linearGradient id={id} x1="14" y1="80" x2="94" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="55%" stopColor="#7DD3C0" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M38 81.7A32 32 0 1 1 70 81.7"
        stroke={gradient ? `url(#${id})` : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="54" cy="79" r="6" fill={gradient ? "#A78BFA" : color} />
    </svg>
  );
}

/** The mark on its brand plate, for splash and headers. */
export function HaloBadge({ size = 60 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: "linear-gradient(135deg, var(--teal), var(--violet))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <HaloMark size={size * 0.56} color="var(--on-accent)" strokeWidth={9} />
    </div>
  );
}
