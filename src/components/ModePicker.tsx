import {
  Activity,
  Anchor,
  Check,
  Crosshair,
  Home,
  Plane,
  Radio,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MODES, getMode, type ModeId } from "../lib/modes";
import { tap } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  Home,
  Sparkles,
  Radio,
  Plane,
  Crosshair,
  Anchor,
  Zap,
  Activity,
};

export function modeIcon(name: string): LucideIcon {
  return ICONS[name] ?? Home;
}

/** The compact chip on the dashboard that opens the picker. */
export function ModeChip({ mode, onClick }: { mode: ModeId; onClick: () => void }) {
  const m = getMode(mode);
  const Icon = modeIcon(m.icon);
  return (
    <button
      onClick={() => {
        tap();
        onClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "11px 14px",
        borderRadius: 14,
        background: `${m.accent}14`,
        border: `1px solid ${m.accent}55`,
        color: "var(--hi)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <Icon size={17} color={m.accent} style={{ flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{m.label} mode</span>
        <span style={{ fontSize: 12, color: "var(--dim)", marginLeft: 8 }}>{m.who}</span>
      </span>
      <span className="mono" style={{ fontSize: 10.5, color: m.accent, flex: "none" }}>
        CHANGE
      </span>
    </button>
  );
}

/**
 * Full-screen mode chooser. Modes only change emphasis — the readings behind
 * them are identical — so switching is cheap and reversible.
 */
export function ModePicker({
  value,
  onPick,
  onClose,
  onThresholdSuggest,
}: {
  value: ModeId;
  onPick: (id: ModeId) => void;
  onClose: () => void;
  /** Lets the caller adopt the mode's sensible alert threshold. */
  onThresholdSuggest?: (kp: number) => void;
}) {
  return (
    <div
      className="fade-up"
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--scrim)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "calc(var(--sat) + 24px) 22px 14px" }}>
        <div className="eyebrow">Choose a mode</div>
        <div className="display" style={{ fontSize: 23, fontWeight: 700, marginTop: 4 }}>
          What are you using this for?
        </div>
        <p style={{ color: "var(--mid)", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 0" }}>
          Same readings either way — this changes what we put first and how we explain it.
        </p>
      </div>

      <div className="scroll" style={{ flex: 1, padding: "6px 22px 22px", display: "flex", flexDirection: "column", gap: 9 }}>
        {MODES.map((m) => {
          const Icon = modeIcon(m.icon);
          const on = m.id === value;
          return (
            <button
              key={m.id}
              onClick={() => {
                tap();
                onPick(m.id);
                onThresholdSuggest?.(m.defaultThreshold);
                onClose();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "14px 15px",
                borderRadius: 14,
                background: on ? `${m.accent}16` : "var(--panel)",
                border: `1px solid ${on ? m.accent : "var(--line)"}`,
                cursor: "pointer",
                textAlign: "left",
                color: "var(--hi)",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  flex: "none",
                  borderRadius: 11,
                  background: `${m.accent}1f`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={18} color={m.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="display" style={{ fontWeight: 600, fontSize: 15 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 2 }}>{m.who}</div>
              </div>
              {on && <Check size={17} color={m.accent} style={{ flex: "none" }} />}
            </button>
          );
        })}

        <button
          onClick={() => {
            tap();
            onClose();
          }}
          style={{
            marginTop: 6,
            background: "none",
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            color: "var(--mid)",
            fontSize: 14,
            padding: 14,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
