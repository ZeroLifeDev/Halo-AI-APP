import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CloudOff,
  Compass,
  Eye,
  MapPin,
  Radio,
  RefreshCw,
  Satellite,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Wind,
} from "lucide-react";
import {
  Btn,
  Card,
  Row,
  ScreenHeader,
  Segmented,
  Sparkline,
  SpectrumLine,
  StatTile,
  timeAgo,
} from "../components/ui";
import { useConditions } from "../lib/conditions";
import { useStore } from "../lib/store";
import { gpsImpact, kpToStatus, plainSummary, radioImpact, technicalSummary } from "../lib/swpc";
import { explainConditions } from "../lib/gemini";
import type { Screen } from "../nav";

export function Now({ go }: { go: (s: Screen) => void }) {
  const c = useConditions();
  const { settings, setSetting, place, refreshLocation, locating } = useStore();
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const status = kpToStatus(c.kp);
  const gps = gpsImpact(c.kp);
  const radio = radioImpact(c.flareClass, c.kp);

  // Let Gemini phrase the summary for this exact situation; if it can't be
  // reached we keep the built-in wording, which is always correct.
  useEffect(() => {
    if (c.loading || c.kp == null) return;
    let cancelled = false;
    explainConditions({
      kp: c.kp,
      flareClass: c.flareClass,
      windSpeed: c.wind?.speed ?? null,
      auroraChance: c.auroraChance,
      place: place?.label ?? null,
      mode: settings.mode,
    }).then((t) => {
      if (!cancelled) setAiSummary(t);
    });
    return () => {
      cancelled = true;
    };
  }, [c.kp, c.flareClass, c.wind?.speed, c.auroraChance, place?.label, settings.mode, c.loading]);

  const fallback =
    settings.mode === "simple"
      ? plainSummary(c.kp, c.flareClass)
      : technicalSummary(c.kp, c.wind, c.mag, c.flareClass);

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader
        eyebrow={c.offline ? "Last known reading" : "Live · NOAA SWPC"}
        title="Right now"
        right={
          <button
            onClick={() => (place ? c.refresh() : refreshLocation())}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: place ? "rgba(45,212,191,0.12)" : "var(--panel)",
              border: `1px solid ${place ? "var(--teal)" : "var(--line-2)"}`,
              borderRadius: 999,
              padding: "7px 11px",
              cursor: "pointer",
              maxWidth: 150,
            }}
          >
            <MapPin size={13} color={place ? "var(--teal)" : "var(--dim)"} style={{ flex: "none" }} />
            <span
              style={{
                fontSize: 11.5,
                color: place ? "var(--teal)" : "var(--dim)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {locating ? "Locating…" : (place?.label ?? "Set location")}
            </span>
          </button>
        }
      />

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Segmented
          value={settings.mode}
          onChange={(m) => setSetting("mode", m)}
          options={[
            { value: "simple", label: "Simple" },
            { value: "scientific", label: "Scientific" },
          ]}
        />

        {/* headline gauge */}
        <Card priority>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4 }}>
            <span className="chip">
              <span className="dot" style={{ background: status.color }} />
              Planetary Kp-index
            </span>
            <Satellite size={18} color="var(--dim)" />
          </div>

          <div style={{ textAlign: "center", padding: "14px 0 6px" }}>
            {c.loading ? (
              <div className="skeleton" style={{ height: 62, width: 140, margin: "0 auto" }} />
            ) : (
              <div
                className="mono"
                style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}
              >
                {c.kp != null ? c.kp.toFixed(1) : "—"}
              </div>
            )}
            <div style={{ color: status.color, fontSize: 17, fontWeight: 600, marginTop: 8 }}>
              {c.loading ? "Reading…" : status.label}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div
              className="mono"
              style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--dim)", marginBottom: 6 }}
            >
              <span>0 · CALM</span>
              <span>STORM · 9</span>
            </div>
            <SpectrumLine value={status.scale} height={10} />
          </div>

          {c.kpHistory.length > 2 && (
            <div style={{ marginTop: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Last 24 hours</div>
              <Sparkline points={c.kpHistory.slice(-24).map((p) => p.kp)} color={status.color} height={44} />
            </div>
          )}
        </Card>

        {/* what it means */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            <Sparkles size={14} color="var(--violet)" />
            <span className="eyebrow">
              {settings.mode === "simple" ? "What this means for you" : "Technical readout"}
            </span>
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--hi)" }}>
            {c.loading ? (
              <>
                <div className="skeleton" style={{ height: 13, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 13, width: "75%" }} />
              </>
            ) : (
              (aiSummary ?? fallback)
            )}
          </div>
        </Card>

        {/* impacts */}
        <div style={{ display: "flex", gap: 12 }}>
          <StatTile
            icon={Compass}
            label="Satellite navigation"
            value={gps.label}
            status={gps.detail}
            statusColor={gps.color}
          />
          <StatTile
            icon={Radio}
            label="Radio signal"
            value={radio.label}
            status={radio.detail}
            statusColor={radio.color}
          />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <StatTile
            icon={Wind}
            label="Solar wind speed"
            value={c.wind ? `${c.wind.speed.toFixed(0)} km/s` : "—"}
            status={c.wind ? (c.wind.speed > 600 ? "Fast" : c.wind.speed > 450 ? "Elevated" : "Normal") : undefined}
            statusColor={c.wind && c.wind.speed > 600 ? "var(--amber)" : "var(--teal)"}
          />
          <StatTile
            icon={AlertTriangle}
            label="Strongest recent flare"
            value={c.flareClass}
            status={/^[MX]/.test(c.flareClass) ? "Notable" : "Background"}
            statusColor={/^X/.test(c.flareClass) ? "var(--red)" : /^M/.test(c.flareClass) ? "var(--amber)" : "var(--teal)"}
          />
        </div>

        {/* aurora */}
        {c.auroraChance != null && (
          <Card
            onClick={() => go("forecast")}
            style={{
              background:
                c.auroraChance >= 20
                  ? "linear-gradient(135deg, rgba(167,139,250,0.16), rgba(45,212,191,0.08))"
                  : undefined,
              borderColor: c.auroraChance >= 20 ? "rgba(167,139,250,0.45)" : undefined,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Eye size={20} color="var(--violet)" style={{ flex: "none" }} />
              <div style={{ flex: 1 }}>
                <div className="display" style={{ fontWeight: 700, fontSize: 15 }}>
                  {c.auroraChance >= 20
                    ? "You might see the northern lights"
                    : "Aurora unlikely where you are"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 3 }}>
                  {c.auroraChance}% chance overhead right now · tap for the map
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* live NOAA alert */}
        {c.alerts[0] && Date.now() - c.alerts[0].issued < 48 * 3600_000 && (
          <Card
            onClick={() => go("events")}
            style={{ borderColor: "rgba(255,159,67,0.45)", background: "rgba(255,159,67,0.06)" }}
          >
            <div style={{ display: "flex", gap: 11 }}>
              <AlertTriangle size={18} color="var(--amber)" style={{ flex: "none", marginTop: 2 }} />
              <div>
                <div className="eyebrow" style={{ color: "var(--amber)" }}>
                  NOAA {c.alerts[0].kind} · {timeAgo(c.alerts[0].issued)}
                </div>
                <div style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.5 }}>{c.alerts[0].headline}</div>
              </div>
            </div>
          </Card>
        )}

        <Row
          icon={Bell}
          tint="var(--amber)"
          title="Event log"
          detail="Every official message from NOAA"
          onClick={() => go("events")}
        />
        <Row
          icon={ShoppingBag}
          tint="var(--teal)"
          title="Halo devices"
          detail="Add your own local sensor"
          onClick={() => go("shop")}
        />
        <Row
          icon={SlidersHorizontal}
          tint="var(--violet)"
          title="Settings"
          detail="Alerts, language, location and account"
          onClick={() => go("settings")}
        />

        {/* footer state */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            color: "var(--dim)",
            fontSize: 11.5,
            padding: "6px 0 2px",
          }}
        >
          {c.offline ? <CloudOff size={12} /> : <RefreshCw size={12} className={c.refreshing ? "spin" : undefined} />}
          {c.offline
            ? "Offline — showing the last reading we got"
            : `Updated ${timeAgo(c.updatedAt)} · from NOAA SWPC`}
        </div>

        {c.error && !c.kp && (
          <Btn variant="quiet" onClick={() => c.refresh()} icon={RefreshCw}>
            Try again
          </Btn>
        )}
      </div>
    </div>
  );
}
