import { useMemo } from "react";
import { Eye, MapPin, Moon, TrendingUp } from "lucide-react";
import { Card, EmptyState, ScreenHeader, Sparkline, SpectrumLine } from "../components/ui";
import { useConditions } from "../lib/conditions";
import { useStore, geomagneticLatitude } from "../lib/store";
import { kpToStatus } from "../lib/swpc";

export function Forecast() {
  const c = useConditions();
  const { place } = useStore();

  /** Group the forecast into days, keeping the worst Kp expected in each. */
  const days = useMemo(() => {
    const now = Date.now();
    const buckets = new Map<string, { label: string; peak: number; points: number[] }>();
    for (const p of c.kpForecast) {
      if (p.time < now - 3 * 3600_000) continue;
      const d = new Date(p.time);
      const key = d.toISOString().slice(0, 10);
      const label =
        key === new Date(now).toISOString().slice(0, 10)
          ? "Today"
          : key === new Date(now + 86400_000).toISOString().slice(0, 10)
            ? "Tomorrow"
            : d.toLocaleDateString(undefined, { weekday: "long" });
      const b = buckets.get(key) ?? { label, peak: 0, points: [] };
      b.peak = Math.max(b.peak, p.kp);
      b.points.push(p.kp);
      buckets.set(key, b);
    }
    return [...buckets.values()].slice(0, 4);
  }, [c.kpForecast]);

  const magLat = place ? geomagneticLatitude(place.lat, place.lon) : null;

  /** The Kp needed before aurora typically becomes visible at this latitude. */
  const kpNeeded = useMemo(() => {
    if (magLat == null) return null;
    const abs = Math.abs(magLat);
    // Auroral oval reaches roughly 66° magnetic at Kp 0, moving ~2° equatorward per Kp step.
    const needed = Math.ceil((66 - abs) / 2);
    return Math.max(0, Math.min(needed, 10));
  }, [magLat]);

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader eyebrow="Next 3 days" title="Forecast" right={<TrendingUp size={20} color="var(--teal)" />} />

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {c.loading ? (
          <>
            <div className="skeleton" style={{ height: 92 }} />
            <div className="skeleton" style={{ height: 92 }} />
          </>
        ) : days.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No forecast available"
            detail="We couldn't reach NOAA's forecast feed. It'll appear here as soon as your connection is back."
          />
        ) : (
          days.map((d) => {
            const st = kpToStatus(d.peak);
            return (
              <Card key={d.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div className="display" style={{ fontWeight: 700, fontSize: 16 }}>
                    {d.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
                      {d.peak.toFixed(1)}
                    </span>
                    <span style={{ color: st.color, fontSize: 12.5, fontWeight: 600 }}>{st.label}</span>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <SpectrumLine value={st.scale} height={8} />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 11, lineHeight: 1.5 }}>
                  {dayAdvice(d.peak)}
                </div>
              </Card>
            );
          })
        )}

        {/* aurora outlook for this user */}
        <Card priority>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 }}>
            <Eye size={16} color="var(--violet)" />
            <span className="eyebrow">Aurora where you are</span>
          </div>

          {!place ? (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--mid)", fontSize: 13.5, lineHeight: 1.55 }}>
              <MapPin size={16} style={{ flex: "none", marginTop: 2 }} />
              Turn on your location and we'll tell you whether the northern lights can reach you.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span className="mono" style={{ fontSize: 34, fontWeight: 600 }}>
                  {c.auroraChance != null ? `${c.auroraChance}%` : "—"}
                </span>
                <span style={{ color: "var(--mid)", fontSize: 13 }}>chance overhead right now</span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--mid)", marginTop: 12, lineHeight: 1.6 }}>
                {auroraAdvice(c.auroraChance, kpNeeded, c.kp, place.label)}
              </div>
              {kpNeeded != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: "var(--dim)", fontSize: 11.5 }}>
                  <Moon size={13} />
                  Best viewed well after dark, away from streetlights.
                </div>
              )}
            </>
          )}
        </Card>

        {/* solar wind trend */}
        {c.windHistory.length > 3 && (
          <Card>
            <div className="eyebrow" style={{ marginBottom: 3 }}>Solar wind speed · 24 h</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              {c.wind ? `${c.wind.speed.toFixed(0)} km/s` : "—"}
            </div>
            <Sparkline points={c.windHistory.slice(-120).map((p) => p.speed)} color="var(--violet)" height={60} />
            <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 10, lineHeight: 1.5 }}>
              This is how fast material from the Sun is streaming past Earth. Faster wind usually means
              a bumpier magnetic field.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function dayAdvice(kp: number): string {
  if (kp < 4) return "A calm day. Nothing to plan around.";
  if (kp < 5) return "Slightly unsettled. You almost certainly won't notice anything.";
  if (kp < 6) return "A minor storm is likely. Expect small GPS drift, and watch for aurora if you're far north.";
  if (kp < 7) return "A moderate storm is likely. Charge your devices and download maps if you're travelling.";
  return "A strong storm is expected. Don't rely on precise satnav, and keep a power bank charged.";
}

function auroraAdvice(
  chance: number | null,
  kpNeeded: number | null,
  kpNow: number | null,
  place: string,
): string {
  if (kpNeeded != null && kpNeeded > 9)
    return `${place} is too close to the equator to see the aurora — it doesn't reach this far, even in the biggest storms.`;
  if (chance != null && chance >= 30)
    return "Good chance tonight. Get somewhere dark, look toward the pole, and give your eyes twenty minutes to adjust. Your phone camera on night mode will pick it up before your eyes do.";
  if (chance != null && chance >= 10)
    return "A slim chance tonight — worth a look if you're somewhere really dark, especially toward the horizon.";
  if (kpNeeded != null)
    return `Not tonight. From ${place}, the storm level needs to reach about ${kpNeeded} on the 0–9 scale${
      kpNow != null ? `, and it's ${kpNow.toFixed(1)} right now` : ""
    }. We'll alert you if it gets there.`;
  return "No aurora expected overhead right now.";
}
