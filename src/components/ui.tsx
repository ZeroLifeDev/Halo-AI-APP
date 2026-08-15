import React from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export function tap() {
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** The signature Spectrum Line: calm → storm, filled to `value` (0–1). */
export function SpectrumLine({
  value = 1,
  height = 6,
  busy = false,
}: {
  value?: number;
  height?: number;
  /** Runs a light along the bar while a refresh is in flight. */
  busy?: boolean;
}) {
  const pct = Math.max(0, Math.min(value, 1)) * 100;
  return (
    <div
      className={busy ? "sweeping" : undefined}
      style={{
        position: "relative",
        height,
        borderRadius: height,
        overflow: "hidden",
        background: "var(--raised)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--spectrum)" }} />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: `${100 - pct}%`,
          background: "var(--raised)",
          transition: "width 700ms cubic-bezier(.2,.8,.2,1)",
        }}
      />
      {value < 1 && (
        <div
          style={{
            position: "absolute",
            top: -1,
            bottom: -1,
            left: `calc(${pct}% - 1.5px)`,
            width: 3,
            background: "var(--hi)",
            borderRadius: 2,
            transition: "left 700ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      )}
    </div>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  right,
  onBack,
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div style={{ padding: "calc(var(--sat) + 18px) 20px 0" }}>
      {onBack && (
        <button
          onClick={() => {
            tap();
            onBack();
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--dim)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "0 0 10px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={16} /> Back
        </button>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <div
            className="display"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 3 }}
          >
            {title}
          </div>
        </div>
        <div style={{ flex: "none", paddingTop: 4 }}>{right}</div>
      </div>
      <div className="spectrum-rule" style={{ marginTop: 12 }} />
    </div>
  );
}

export function Pill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={() => {
        tap();
        onClick?.();
      }}
      style={{
        padding: "8px 15px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        border: `1px solid ${active ? "var(--teal)" : "var(--line-2)"}`,
        background: active ? "rgba(45,212,191,0.12)" : "transparent",
        color: active ? "var(--teal)" : "var(--mid)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flex: "none",
        transition: "all 160ms ease",
      }}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  onClick,
  priority,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  priority?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`card${priority ? " priority" : ""}`}
      onClick={
        onClick
          ? () => {
              tap();
              onClick();
            }
          : undefined
      }
      style={{ cursor: onClick ? "pointer" : "default", ...style }}
    >
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  icon: Icon,
  variant = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  variant?: "primary" | "ghost" | "quiet";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`btn${variant === "primary" ? "" : ` ${variant}`}`}
      disabled={disabled}
      onClick={
        onClick
          ? () => {
              tap();
              onClick();
            }
          : undefined
      }
    >
      {children}
      {Icon && <Icon size={18} />}
    </button>
  );
}

export function Field({
  label,
  icon: Icon,
  hint,
  ...props
}: {
  label: string;
  icon?: LucideIcon;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <div className="field-label">{label}</div>
      <div className="field-box">
        {Icon && <Icon size={16} color="var(--dim)" style={{ flex: "none" }} />}
        <input {...props} />
      </div>
      {hint && <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  detail,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  detail?: string;
}) {
  return (
    <button
      onClick={() => {
        tap();
        onChange(!on);
      }}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        background: "none",
        border: "none",
        padding: "12px 0",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500 }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 2, lineHeight: 1.45 }}>{detail}</div>
        )}
      </div>
      <div
        style={{
          flex: "none",
          width: 46,
          height: 27,
          borderRadius: 999,
          background: on ? "linear-gradient(90deg,var(--teal),var(--teal-soft))" : "var(--raised)",
          border: `1px solid ${on ? "transparent" : "var(--line-2)"}`,
          position: "relative",
          transition: "background 200ms ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: on ? 21 : 2,
            width: 21,
            height: 21,
            borderRadius: 999,
            background: on ? "var(--void)" : "var(--mid)",
            transition: "left 200ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </div>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          data-on={value === o.value}
          onClick={() => {
            tap();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Compact line chart for real time-series data. */
export function Sparkline({
  points,
  color = "var(--teal)",
  height = 56,
  fill = true,
}: {
  points: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  // useId must run before any early return — the number of hooks a component
  // calls has to stay constant, and `points` starts empty then fills with data.
  const id = React.useId();
  if (points.length < 2) return <div className="skeleton" style={{ height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 100;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = height - ((p - min) / span) * (height - 6) - 3;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <polygon points={`0,${height} ${coords.join(" ")} ${w},${height}`} fill={`url(#${id})`} />
      )}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  status,
  statusColor,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  status?: string;
  statusColor?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Icon size={17} color={statusColor ?? "var(--teal)"} />
        {status && (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              color: statusColor ?? "var(--teal)",
              border: `1px solid ${statusColor ?? "var(--teal)"}44`,
              background: `${statusColor ?? "#2dd4bf"}14`,
              padding: "3px 8px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {status}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 16 }}>{label}</div>
      <div className="display" style={{ fontWeight: 700, fontSize: 20, marginTop: 2 }}>
        {value}
      </div>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: 20,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <Icon size={28} color="var(--dim)" />
      </div>
      <div className="display" style={{ fontWeight: 700, fontSize: 17 }}>
        {title}
      </div>
      <div style={{ color: "var(--mid)", fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>{detail}</div>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

export function Row({
  icon: Icon,
  title,
  detail,
  right,
  onClick,
  tint = "var(--teal)",
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  tint?: string;
}) {
  return (
    <Card onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <div
        style={{
          width: 40,
          height: 40,
          flex: "none",
          borderRadius: 11,
          background: `${tint}1f`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={18} color={tint} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="display" style={{ fontWeight: 600, fontSize: 14.5 }}>
          {title}
        </div>
        {detail && (
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 2, lineHeight: 1.4 }}>{detail}</div>
        )}
      </div>
      {right}
    </Card>
  );
}

export function timeAgo(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/**
 * Eases a number to its new value. A reading that slides from 3.1 to 4.7
 * reads as a change; one that snaps looks like a re-render.
 */
export function CountUp({
  value,
  decimals = 1,
  durationMs = 700,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
}) {
  const [shown, setShown] = React.useState(value);
  const fromRef = React.useRef(value);
  const rafRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      // ease-out cubic: quick to move, gentle to land
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return <>{shown.toFixed(decimals)}</>;
}

/** Wraps children so they rise into place in sequence. */
export function Stagger({ children }: { children: React.ReactNode }) {
  return (
    <>
      {React.Children.map(children, (child, i) =>
        React.isValidElement(child) ? (
          <div className="rise" style={{ ["--i" as string]: i }}>
            {child}
          </div>
        ) : (
          child
        ),
      )}
    </>
  );
}
