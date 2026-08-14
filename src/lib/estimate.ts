/**
 * Standing in for a Halo node, using only the phone's GPS.
 *
 * Without hardware we can't *measure* the local field — but position plus the
 * global readings is enough to work out a genuinely useful local picture:
 * Earth's field strength where you're standing, how exposed you are to a given
 * storm, and what to expect from GPS. Everything here is derived from a real
 * model and is labelled in the UI as an estimate, never as a measurement.
 */
import { geomagneticLatitude } from "./store";

export type LocalEstimate = {
  /** Geomagnetic latitude — what actually decides your exposure. */
  magneticLatitude: number;
  /** Earth's field strength here, microtesla, from the dipole model. */
  fieldUT: number;
  /** How much a storm of the current strength is felt at this latitude, 0–1. */
  exposure: number;
  /** Storm level at which aurora typically becomes visible here (0–9). */
  auroraThreshold: number | null;
  /** Expected horizontal GPS error right now, metres. */
  gpsErrorM: number;
  /** One-line, plain-language read of the local situation. */
  summary: string;
  zone: "equatorial" | "mid" | "auroral" | "polar";
};

/**
 * Earth's field as a tilted dipole: |B| = B0·√(1 + 3sin²(λm)).
 * Good to roughly 10% away from the South Atlantic Anomaly, which is plenty
 * for telling someone what to expect.
 */
const EQUATORIAL_FIELD_UT = 31;

export function estimateLocal(lat: number, lon: number, kp: number | null): LocalEstimate {
  const magLat = geomagneticLatitude(lat, lon);
  const absLat = Math.abs(magLat);
  const rad = (magLat * Math.PI) / 180;

  const fieldUT = EQUATORIAL_FIELD_UT * Math.sqrt(1 + 3 * Math.sin(rad) ** 2);

  // The auroral oval sits near 66° magnetic when quiet and pushes about 2°
  // equatorward per step of storm level.
  const auroraEdge = 66 - 2 * (kp ?? 0);
  const rawThreshold = Math.ceil((66 - absLat) / 2);
  const auroraThreshold = rawThreshold > 9 ? null : Math.max(0, rawThreshold);

  // Exposure rises steeply as you approach the oval.
  const distanceToOval = Math.max(0, auroraEdge - absLat);
  const exposure = Math.max(0, Math.min(1, 1 - distanceToOval / 45));

  const zone: LocalEstimate["zone"] =
    absLat >= 75 ? "polar" : absLat >= 60 ? "auroral" : absLat >= 35 ? "mid" : "equatorial";

  // Quiet-day GPS is ~2 m; ionospheric disturbance scales with both storm
  // strength and how exposed the latitude is.
  const severity = Math.max(0, (kp ?? 0) - 3) / 6;
  const gpsErrorM = 2 + 28 * severity * (0.35 + 0.65 * exposure);

  return {
    magneticLatitude: magLat,
    fieldUT,
    exposure,
    auroraThreshold,
    gpsErrorM,
    zone,
    summary: summarise(zone, kp, auroraThreshold, exposure),
  };
}

function summarise(
  zone: LocalEstimate["zone"],
  kp: number | null,
  auroraThreshold: number | null,
  exposure: number,
): string {
  const stormy = (kp ?? 0) >= 5;

  if (zone === "equatorial") {
    return stormy
      ? "You're near the equator, so storms reach you weakly. Expect a little GPS drift and nothing more."
      : "You're near the equator — the most sheltered part of the planet for solar storms. Very little reaches you here.";
  }
  if (zone === "mid") {
    return stormy
      ? `A storm is running and you're exposed enough to notice it — GPS will wander a bit.${
          auroraThreshold != null ? ` Aurora needs level ${auroraThreshold} to reach you.` : ""
        }`
      : `You're at middle latitudes. Everyday storms pass you by${
          auroraThreshold != null ? `, and the sky only lights up around level ${auroraThreshold}` : ""
        }.`;
  }
  if (zone === "auroral") {
    return stormy
      ? "You're right under the auroral oval during a storm. Expect real GPS drift and patchy radio — and a very good chance the sky is worth watching."
      : "You're close to the auroral oval, so even a modest storm shows up here — in your GPS and in the sky.";
  }
  return exposure > 0.7
    ? "You're inside the polar cap, the most exposed place on Earth. GPS and long-range radio suffer here first and worst."
    : "You're inside the polar cap. Solar particles funnel down here, so effects arrive earlier and stronger than anywhere else.";
}

/** Confidence wording — an estimate should say how much to trust it. */
export function accuracyNote(hasGpsFix: boolean): string {
  return hasGpsFix
    ? "Worked out from your position and the global readings. A Halo node would measure it directly instead."
    : "Based on your last known position. Turn on location for a sharper picture.";
}
