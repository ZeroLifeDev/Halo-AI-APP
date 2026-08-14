/**
 * Live space-weather data from NOAA's Space Weather Prediction Center.
 *
 * Every value in this app comes from these public feeds — there is no
 * generated or placeholder telemetry anywhere. Responses are cached to disk
 * so the app still shows the last real reading when the phone is offline.
 */
import { Preferences } from "@capacitor/preferences";

const BASE = "https://services.swpc.noaa.gov";

/* ---------------- caching fetch ---------------- */

type Cached<T> = { at: number; data: T };

/* ---------------- feed diagnostics ----------------
 * Every fetch records what happened. When a screen says "no reading" the
 * developer tab can show exactly which feed failed and why, instead of the
 * failure being swallowed by a catch block. */

export type FeedStatus = {
  key: string;
  url: string;
  ok: boolean;
  /** HTTP status, or 0 when the request never completed */
  status: number;
  rows: number;
  error: string | null;
  fromCache: boolean;
  at: number;
  ms: number;
};

const feedStatus = new Map<string, FeedStatus>();

export function feedDiagnostics(): FeedStatus[] {
  return [...feedStatus.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const { value } = await Preferences.get({ key: `swpc:${key}` });
    return value ? (JSON.parse(value) as Cached<T>) : null;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T) {
  try {
    await Preferences.set({
      key: `swpc:${key}`,
      value: JSON.stringify({ at: Date.now(), data } satisfies Cached<T>),
    });
  } catch {
    /* storage full / unavailable — live data still works */
  }
}

export type Fetched<T> = {
  data: T | null;
  /** true when the network failed and this came from the on-device cache */
  stale: boolean;
  /** epoch ms the data was retrieved */
  at: number | null;
  error: string | null;
};

async function get<T>(
  paths: string | string[],
  key: string,
  parse: (raw: any) => T,
): Promise<Fetched<T>> {
  const candidates = Array.isArray(paths) ? paths : [paths];
  let lastError = "";
  let lastStatus = 0;

  for (const path of candidates) {
    const url = `${BASE}${path}`;
    const started = Date.now();
    try {
      // A hung request must not wedge the whole refresh.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);

      lastStatus = res.status;
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const raw = path.endsWith(".txt") ? await res.text() : await res.json();
      const data = parse(raw);
      const rows = Array.isArray(data) ? data.length : data ? 1 : 0;

      if (rows === 0) {
        lastError = "Feed returned no usable rows";
        continue;
      }

      feedStatus.set(key, {
        key,
        url,
        ok: true,
        status: res.status,
        rows,
        error: null,
        fromCache: false,
        at: Date.now(),
        ms: Date.now() - started,
      });
      await writeCache(key, data);
      return { data, stale: false, at: Date.now(), error: null };
    } catch (e) {
      const err = e as Error;
      lastError = err.name === "AbortError" ? "Timed out after 15s" : err.message || String(err);
    }
  }

  // Everything failed — fall back to the last good copy on disk.
  const cached = await readCache<T>(key);
  feedStatus.set(key, {
    key,
    url: `${BASE}${candidates[0]}`,
    ok: false,
    status: lastStatus,
    rows: cached ? (Array.isArray(cached.data) ? (cached.data as unknown[]).length : 1) : 0,
    error: lastError || "Request failed",
    fromCache: !!cached,
    at: Date.now(),
    ms: 0,
  });

  if (cached) return { data: cached.data, stale: true, at: cached.at, error: null };
  return { data: null, stale: false, at: null, error: lastError || "Request failed" };
}

/**
 * NOAA writes timestamps as "2026-08-14 21:00:00.000" (UTC, space separated).
 * Normalised explicitly rather than trusting each engine's lenient parsing.
 */
function parseUtc(value: string): number {
  if (!value) return NaN;
  const iso = value.trim().replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

/* ---------------- Kp index (geomagnetic activity) ---------------- */

export type KpPoint = { time: number; kp: number };

/** Observed planetary Kp, 3-hourly, last several days. */
export function fetchKp() {
  return get<KpPoint[]>("/products/noaa-planetary-k-index.json", "kp", (rows: string[][]) =>
    rows
      .slice(1)
      .map((r) => ({ time: parseUtc(r[0]), kp: parseFloat(r[1]) }))
      .filter((p) => Number.isFinite(p.kp)),
  );
}

/** Forecast Kp for the coming days (observed + estimated + predicted). */
export function fetchKpForecast() {
  return get<KpPoint[]>(
    "/products/noaa-planetary-k-index-forecast.json",
    "kp-forecast",
    (rows: string[][]) =>
      rows
        .slice(1)
        .map((r) => ({ time: parseUtc(r[0]), kp: parseFloat(r[1]) }))
        .filter((p) => Number.isFinite(p.kp)),
  );
}

/* ---------------- solar wind (DSCOVR) ---------------- */

export type SolarWind = {
  time: number;
  /** km/s */
  speed: number;
  /** protons/cm³ */
  density: number;
  /** Kelvin */
  temperature: number;
};

export function fetchSolarWind() {
  return get<SolarWind[]>(
    ["/products/solar-wind/plasma-1-day.json", "/products/solar-wind/plasma-2-hour.json"],
    "wind", (rows: string[][]) =>
    rows
      .slice(1)
      .map((r) => ({
        time: parseUtc(r[0]),
        density: parseFloat(r[1]),
        speed: parseFloat(r[2]),
        temperature: parseFloat(r[3]),
      }))
      .filter((p) => Number.isFinite(p.speed)),
  );
}

export type MagField = {
  time: number;
  /** north-south component; sustained negative Bz lets storms in */
  bz: number;
  /** total field strength, nT */
  bt: number;
};

export function fetchMagField() {
  return get<MagField[]>(
    ["/products/solar-wind/mag-1-day.json", "/products/solar-wind/mag-2-hour.json"],
    "mag", (rows: string[][]) =>
    rows
      .slice(1)
      .map((r) => ({
        time: parseUtc(r[0]),
        bz: parseFloat(r[3]),
        bt: parseFloat(r[6]),
      }))
      .filter((p) => Number.isFinite(p.bz)),
  );
}

/* ---------------- X-ray flux (GOES) — flares ---------------- */

export type XrayPoint = { time: number; flux: number };

/** Long-band (0.1–0.8 nm) X-ray flux, which defines flare class. */
export function fetchXray() {
  return get<XrayPoint[]>(
    ["/json/goes/primary/xrays-6-hour.json", "/json/goes/primary/xrays-1-day.json"],
    "xray", (rows: any[]) =>
    rows
      .filter((r) => r.energy === "0.1-0.8nm")
      .map((r) => ({ time: parseUtc(r.time_tag), flux: Number(r.flux) }))
      .filter((p) => Number.isFinite(p.flux)),
  );
}

/** Converts raw W/m² X-ray flux to the familiar A/B/C/M/X flare class. */
export function fluxToClass(flux: number): string {
  if (!Number.isFinite(flux) || flux <= 0) return "—";
  const table: [number, string][] = [
    [1e-4, "X"],
    [1e-5, "M"],
    [1e-6, "C"],
    [1e-7, "B"],
  ];
  for (const [threshold, letter] of table) {
    if (flux >= threshold) return `${letter}${(flux / threshold).toFixed(1)}`;
  }
  return `A${(flux / 1e-8).toFixed(1)}`;
}

/* ---------------- official alerts ---------------- */

export type Alert = {
  id: string;
  issued: number;
  /** e.g. "WARNING", "ALERT", "SUMMARY", "WATCH" */
  kind: string;
  headline: string;
  body: string;
};

/** NOAA's own watches, warnings and alerts — the real event feed. */
export function fetchAlerts() {
  return get<Alert[]>("/products/alerts.json", "alerts", (rows: any[]) =>
    rows
      .map((r) => {
        const msg: string = r.message ?? "";
        const headline =
          msg
            .split("\n")
            .map((l) => l.trim())
            .find((l) => /^(SPACE WEATHER MESSAGE|ALERT|WARNING|WATCH|SUMMARY|EXTENDED WARNING)/i.test(l) && l.length > 12) ??
          msg.split("\n").find((l) => l.trim().length > 12)?.trim() ??
          "Space weather message";
        const kindMatch = msg.match(/\b(WARNING|ALERT|WATCH|SUMMARY)\b/i);
        return {
          id: String(r.product_id ?? r.issue_datetime),
          issued: parseUtc(r.issue_datetime ?? ""),
          kind: (kindMatch?.[1] ?? "NOTICE").toUpperCase(),
          headline: headline.replace(/^(ALERT|WARNING|WATCH|SUMMARY):\s*/i, ""),
          body: msg.trim(),
        };
      })
      .filter((a) => Number.isFinite(a.issued))
      .sort((a, b) => b.issued - a.issued),
  );
}

/* ---------------- aurora forecast (OVATION) ---------------- */

export type AuroraGrid = {
  observed: string;
  forecast: string;
  /** [longitude -180..180, latitude -90..90, probability 0..100] */
  points: [number, number, number][];
};

export function fetchAurora() {
  return get<AuroraGrid>("/json/ovation_aurora_latest.json", "aurora", (raw: any) => ({
    observed: raw["Observation Time"],
    forecast: raw["Forecast Time"],
    points: (raw.coordinates as [number, number, number][]).filter((c) => c[2] > 0),
  }));
}

/** Chance of visible aurora at a specific place, straight from the OVATION grid. */
export function auroraChanceAt(grid: AuroraGrid, lat: number, lon: number): number {
  const nLon = ((lon % 360) + 360) % 360; // grid is 0..359
  const tLat = Math.round(lat);
  const tLon = Math.round(nLon);
  let best = 0;
  for (const [gLon, gLat, prob] of grid.points) {
    if (Math.abs(gLat - tLat) <= 1 && Math.abs(gLon - tLon) <= 1) best = Math.max(best, prob);
  }
  return best;
}

/* ---------------- interpretation ---------------- */

export type Severity = "quiet" | "unsettled" | "minor" | "moderate" | "strong" | "severe";

export type Status = {
  severity: Severity;
  /** G-scale label NOAA uses, or "Quiet" */
  label: string;
  color: string;
  /** 0..1 position along the Spectrum Line */
  scale: number;
};

export function kpToStatus(kp: number | null | undefined): Status {
  if (kp == null || !Number.isFinite(kp))
    return { severity: "quiet", label: "No reading", color: "#5c6884", scale: 0 };
  const scale = Math.max(0, Math.min(kp / 9, 1));
  if (kp < 4) return { severity: "quiet", label: "Quiet", color: "#2dd4bf", scale };
  if (kp < 5) return { severity: "unsettled", label: "Unsettled", color: "#ffd166", scale };
  if (kp < 6) return { severity: "minor", label: "Minor storm (G1)", color: "#ff9f43", scale };
  if (kp < 7) return { severity: "moderate", label: "Moderate storm (G2)", color: "#ff7a5c", scale };
  if (kp < 8) return { severity: "strong", label: "Strong storm (G3)", color: "#ff5d6c", scale };
  return { severity: "severe", label: "Severe storm (G4+)", color: "#c060ff", scale };
}

/** Plain-language summary — no jargon, tells the user what to actually do. */
export function plainSummary(kp: number | null, flareClass: string): string {
  const s = kpToStatus(kp);
  const flaring = /^[MX]/.test(flareClass);
  switch (s.severity) {
    case "quiet":
      return flaring
        ? "Space is mostly calm, but the Sun just let off a strong flare. Radio and GPS might wobble for a few minutes. Nothing you need to do."
        : "Space is calm today. Your GPS, calls and internet should all work normally. Nothing you need to do.";
    case "unsettled":
      return "Space is a little restless. You probably won't notice anything, though GPS may be slightly less precise than usual.";
    case "minor":
      return "A small storm is happening. GPS might drift by a few metres and radio can crackle. If you're far north or south, look up — you may see the northern lights.";
    case "moderate":
      return "A moderate storm is underway. Expect GPS to be less accurate and some radio dropouts. Charge your devices and download maps before you travel.";
    case "strong":
      return "A strong storm is hitting Earth. GPS navigation can be unreliable and radio may cut out. Avoid relying on satnav for anything precise, and keep a charged power bank handy.";
    case "severe":
      return "A severe storm is in progress. GPS and radio may fail for hours and power flickers are possible. Charge everything now, keep offline maps, and check on anyone who relies on medical or radio equipment.";
  }
}

/** The technical read for users who switch to Scientific mode. */
export function technicalSummary(
  kp: number | null,
  wind: SolarWind | null,
  mag: MagField | null,
  flareClass: string,
): string {
  const parts: string[] = [];
  parts.push(kp != null ? `Planetary Kp ${kp.toFixed(2)} (${kpToStatus(kp).label}).` : "Kp unavailable.");
  if (wind) parts.push(`Solar wind ${wind.speed.toFixed(0)} km/s, density ${wind.density.toFixed(1)} p/cm³.`);
  if (mag) parts.push(`IMF Bt ${mag.bt.toFixed(1)} nT, Bz ${mag.bz.toFixed(1)} nT ${mag.bz < -5 ? "(southward — coupling favourable for storming)" : "(no sustained southward turning)"}.`);
  if (flareClass !== "—") parts.push(`GOES long-band X-ray at ${flareClass}.`);
  return parts.join(" ");
}

/** How solar activity is affecting satellite navigation, derived from Kp. */
export function gpsImpact(kp: number | null): { label: string; detail: string; color: string } {
  const s = kpToStatus(kp);
  if (s.severity === "quiet") return { label: "Normal", detail: "Full accuracy", color: "#2dd4bf" };
  if (s.severity === "unsettled") return { label: "Normal", detail: "Slight drift possible", color: "#2dd4bf" };
  if (s.severity === "minor") return { label: "Reduced", detail: "Metres of drift", color: "#ff9f43" };
  if (s.severity === "moderate") return { label: "Reduced", detail: "Noticeable drift", color: "#ff9f43" };
  return { label: "Degraded", detail: "Do not rely on it", color: "#ff5d6c" };
}

/** HF radio conditions, driven mainly by X-ray flare activity. */
export function radioImpact(flareClass: string, kp: number | null): { label: string; detail: string; color: string } {
  if (/^X/.test(flareClass)) return { label: "Blackout", detail: "Sunlit-side HF out", color: "#ff5d6c" };
  if (/^M/.test(flareClass)) return { label: "Degraded", detail: "Fades on HF bands", color: "#ff9f43" };
  const s = kpToStatus(kp);
  if (s.severity === "strong" || s.severity === "severe")
    return { label: "Degraded", detail: "Storm absorption", color: "#ff9f43" };
  return { label: "Stable", detail: "Clear on all bands", color: "#2dd4bf" };
}
