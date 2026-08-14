import { useMemo, useState } from "react";
import { AlertTriangle, Bell, ChevronRight, Inbox, X } from "lucide-react";
import { Card, EmptyState, Pill, ScreenHeader, timeAgo } from "../components/ui";
import { useConditions } from "../lib/conditions";
import type { Alert } from "../lib/swpc";

const FILTERS = ["All", "Warnings", "Alerts", "Watches", "Summaries"] as const;

export function Events({ onBack }: { onBack: () => void }) {
  const c = useConditions();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState<Alert | null>(null);

  const list = useMemo(() => {
    if (filter === "All") return c.alerts;
    const want = filter.slice(0, -1).toUpperCase(); // "Warnings" -> "WARNING"
    return c.alerts.filter((a) => a.kind === want);
  }, [c.alerts, filter]);

  if (open) return <EventDetail alert={open} onBack={() => setOpen(null)} />;

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader
        eyebrow={c.alerts.length ? `${c.alerts.length} from NOAA` : "Official feed"}
        title="Event log"
        onBack={onBack}
        right={<Bell size={20} color="var(--teal)" />}
      />

      <div className="scroll" style={{ padding: "16px 20px 0", display: "flex", gap: 8, overflowX: "auto" }}>
        {FILTERS.map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Pill>
        ))}
      </div>

      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {c.loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 78 }} />)
        ) : list.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter === "All" ? "Nothing to report" : `No ${filter.toLowerCase()}`}
            detail={
              filter === "All"
                ? "NOAA hasn't issued any space weather messages recently. That's good news — it means things are calm."
                : "Try a different filter to see other messages."
            }
          />
        ) : (
          list.map((a) => (
            <Card key={a.id} onClick={() => setOpen(a)}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    flex: "none",
                    borderRadius: 10,
                    background: `${kindColor(a.kind)}1f`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AlertTriangle size={16} color={kindColor(a.kind)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="eyebrow" style={{ color: kindColor(a.kind) }}>
                    {a.kind} · {timeAgo(a.issued)}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.45 }}>{a.headline}</div>
                </div>
                <ChevronRight size={16} color="var(--dim)" style={{ flex: "none", marginTop: 8 }} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function EventDetail({ alert, onBack }: { alert: Alert; onBack: () => void }) {
  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 40 }}>
      <ScreenHeader
        eyebrow={`${alert.kind} · ${new Date(alert.issued).toLocaleString()}`}
        title={alert.headline}
        onBack={onBack}
        right={<X size={20} color="var(--dim)" onClick={onBack} style={{ cursor: "pointer" }} />}
      />
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 8 }}>In plain English</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>{explainAlert(alert)}</div>
        </Card>
        <Card>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Original NOAA message</div>
          <pre
            className="mono"
            style={{
              margin: 0,
              fontSize: 11.5,
              lineHeight: 1.65,
              color: "var(--mid)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {alert.body}
          </pre>
        </Card>
      </div>
    </div>
  );
}

function kindColor(kind: string): string {
  switch (kind) {
    case "WARNING":
      return "#ff5d6c";
    case "ALERT":
      return "#ff9f43";
    case "WATCH":
      return "#ffd166";
    default:
      return "#2dd4bf";
  }
}

/** Turns NOAA's terse message text into something a non-specialist can act on. */
function explainAlert(a: Alert): string {
  const t = a.body.toUpperCase();
  if (t.includes("GEOMAGNETIC"))
    return "Earth's magnetic field is being disturbed by material from the Sun. Satellite navigation may drift by a few metres and long-distance radio can be patchy. If you're far north or south, look up after dark — you may see the aurora.";
  if (t.includes("RADIO BLACKOUT") || t.includes("X-RAY"))
    return "A solar flare has disturbed the upper atmosphere on the daylight side of Earth. Long-distance radio may fade or drop out for a while. Mobile phones, wifi and TV are not affected.";
  if (t.includes("RADIATION"))
    return "Energetic particles from the Sun are passing Earth. This mainly matters for satellites, astronauts and aircrew on polar routes. On the ground you're fully protected.";
  if (t.includes("WATCH"))
    return "Forecasters think conditions may become stormy soon. Nothing is happening yet — this is an early heads-up so you can plan.";
  return "NOAA has issued a space weather message. Check the original text below for the specifics, or ask Halo to explain it for you.";
}
