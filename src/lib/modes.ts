/**
 * Modes.
 *
 * The same storm means completely different things to different people. A Kp 6
 * is a great night out for an aurora photographer, a rerouted flight for an
 * airline, a lost RTK lock for a surveyor, and nothing at all for most people.
 *
 * A mode changes what the app leads with, which numbers it puts on the
 * dashboard, how sensitive alerts are by default, and how the assistant talks.
 * It never changes the underlying data — only the emphasis.
 */

export type ModeId =
  | "everyday"
  | "aurora"
  | "radio"
  | "aviation"
  | "precision"
  | "marine"
  | "grid"
  | "scientific";

/** Which live metrics a mode wants on the dashboard, in priority order. */
export type MetricId =
  | "kp"
  | "gps"
  | "radio"
  | "wind"
  | "flare"
  | "aurora"
  | "bz"
  | "density"
  | "protons";

export type Mode = {
  id: ModeId;
  /** Short name for chips and the picker. */
  label: string;
  /** One line: who this is for. */
  who: string;
  /** Lucide icon name, resolved in the UI layer. */
  icon: string;
  accent: string;
  /** Metrics surfaced on the dashboard, most important first. */
  metrics: MetricId[];
  /** Kp at which this user actually wants to be told. */
  defaultThreshold: number;
  /** Steers the assistant's framing and vocabulary. */
  assistantBrief: string;
  /**
   * The headline reading for this mode, given live conditions.
   * Returns null when the mode has nothing distinctive to add.
   */
  summarise: (c: ModeConditions) => string;
  /** Concrete things to do, in this user's language. Empty when calm. */
  advice: (c: ModeConditions) => string[];
};

export type ModeConditions = {
  kp: number | null;
  flareClass: string;
  windSpeed: number | null;
  bz: number | null;
  auroraChance: number | null;
  gpsErrorM: number | null;
  place: string | null;
};

const storming = (kp: number | null) => (kp ?? 0) >= 5;
const rough = (kp: number | null) => (kp ?? 0) >= 6;
const flaring = (f: string) => /^[MX]/.test(f);
const bigFlare = (f: string) => /^X/.test(f);

export const MODES: Mode[] = [
  {
    id: "everyday",
    label: "Everyday",
    who: "Most people, most days",
    icon: "Home",
    accent: "#2dd4bf",
    metrics: ["kp", "gps", "radio", "aurora"],
    defaultThreshold: 6,
    assistantBrief:
      "The user is a general member of the public with no technical background. Never use jargon. Focus on whether anything they own will misbehave, and reassure when nothing will.",
    summarise: (c) => {
      if (c.kp == null) return "We can't get a reading right now.";
      if (rough(c.kp))
        return "A strong storm is running. Your maps may be off by a fair way and calls or radio could get patchy. Nothing dangerous — just don't trust satnav for anything precise today.";
      if (storming(c.kp))
        return "There's a storm on. You might notice your maps being slightly off. Everything else should work as normal.";
      if (flaring(c.flareClass))
        return "Space is calm, though the Sun let off a flare a moment ago. Nothing you'll notice on the ground.";
      return "Space is calm. Your phone, maps and internet will all work normally today.";
    },
    advice: (c) =>
      rough(c.kp)
        ? ["Download offline maps before you travel", "Charge your phone and a power bank"]
        : [],
  },

  {
    id: "aurora",
    label: "Aurora",
    who: "Chasing the northern lights",
    icon: "Sparkles",
    accent: "#a78bfa",
    metrics: ["aurora", "kp", "bz", "wind"],
    defaultThreshold: 4,
    assistantBrief:
      "The user is an aurora photographer or chaser. They care about visibility tonight, how far south the oval will reach, darkness, and how long the activity will hold. Talk about Bz and solar wind speed freely — they know what those mean.",
    summarise: (c) => {
      if (c.auroraChance != null && c.auroraChance >= 40)
        return `Strong chance overhead — ${c.auroraChance}% right now. This is a night to be out.`;
      if (c.auroraChance != null && c.auroraChance >= 15)
        return `${c.auroraChance}% overhead. Worth watching, especially toward the pole and away from town.`;
      if (c.bz != null && c.bz < -5)
        return `The field has turned south (Bz ${c.bz.toFixed(1)} nT), which is what feeds a display. Activity could build over the next few hours.`;
      if (storming(c.kp)) return "Storm conditions are running — check the oval for your latitude.";
      return "Quiet. Nothing likely tonight unless the wind picks up or the field turns south.";
    },
    advice: (c) => {
      const out: string[] = [];
      if ((c.auroraChance ?? 0) >= 15) {
        out.push("Get well away from streetlights and let your eyes adjust for 20 minutes");
        out.push("Face the pole — the glow usually starts low on the horizon");
        out.push("Phone on night mode picks it up before your eyes do");
      }
      if (c.bz != null && c.bz < -5) out.push("Bz is southward — keep checking, this can escalate fast");
      return out;
    },
  },

  {
    id: "radio",
    label: "Radio",
    who: "HF and amateur operators",
    icon: "Radio",
    accent: "#ff9f43",
    metrics: ["flare", "radio", "kp", "wind"],
    defaultThreshold: 4,
    assistantBrief:
      "The user is an amateur radio or HF operator. Talk about band conditions, D-layer absorption, MUF, greyline and blackout classes. Use proper terminology — they want the technical read, not reassurance.",
    summarise: (c) => {
      if (bigFlare(c.flareClass))
        return `${c.flareClass} flare — expect a full HF blackout on the sunlit side. Lower bands hit hardest, recovery in tens of minutes.`;
      if (flaring(c.flareClass))
        return `${c.flareClass} flare in progress. Watch for sudden fades on the lower bands.`;
      if (rough(c.kp))
        return "Storm-level absorption. Polar and high-latitude paths will be badly degraded; expect flutter and deep QSB.";
      if (storming(c.kp))
        return "Unsettled to storm conditions. High-latitude paths degraded, but low-latitude work should still get through.";
      return "Quiet geomagnetic field and background X-ray. Conditions should be stable across the bands.";
    },
    advice: (c) => {
      const out: string[] = [];
      if (flaring(c.flareClass)) out.push("Sunlit-side paths will be unreliable — work the dark side or wait it out");
      if (storming(c.kp)) out.push("Avoid polar paths; try lower-latitude routing instead");
      if (rough(c.kp)) out.push("Greyline may still deliver when nothing else does");
      return out;
    },
  },

  {
    id: "aviation",
    label: "Aviation",
    who: "Pilots and aircrew",
    icon: "Plane",
    accent: "#57f1db",
    metrics: ["flare", "radio", "protons", "kp"],
    defaultThreshold: 5,
    assistantBrief:
      "The user is a pilot, dispatcher or aircrew member. Focus on HF availability on oceanic and polar routes, GNSS integrity, and radiation dose at altitude. Be precise and operational, never alarmist.",
    summarise: (c) => {
      if (bigFlare(c.flareClass))
        return `${c.flareClass} flare — HF unusable on sunlit routes right now. Expect SATCOM fallback and possible polar reroutes.`;
      if (rough(c.kp))
        return "Storm conditions. Polar routes are the exposed ones: degraded HF, reduced GNSS integrity, elevated dose at altitude.";
      if (storming(c.kp))
        return "Minor to moderate storm. Some HF degradation on high-latitude sectors; GNSS accuracy slightly reduced.";
      return "Nominal. HF, GNSS and dose rates are all in their usual range.";
    },
    advice: (c) => {
      const out: string[] = [];
      if (rough(c.kp) || bigFlare(c.flareClass)) {
        out.push("Expect polar route restrictions — check dispatch for reroute guidance");
        out.push("Plan for SATCOM as primary if HF degrades further");
      }
      if (storming(c.kp)) out.push("Brief crew on possible comms degradation at high latitude");
      return out;
    },
  },

  {
    id: "precision",
    label: "Precision GPS",
    who: "Survey, drones, auto-steer",
    icon: "Crosshair",
    accent: "#ffd166",
    metrics: ["gps", "kp", "bz", "wind"],
    defaultThreshold: 4,
    assistantBrief:
      "The user depends on centimetre-level GNSS: surveying, RTK agriculture, drone mapping. Focus on ionospheric gradients, RTK baseline reliability, and when to postpone work. They understand the technology.",
    summarise: (c) => {
      const err = c.gpsErrorM;
      if (rough(c.kp))
        return `Severe ionospheric disturbance${err ? ` — expect around ±${err.toFixed(0)} m on uncorrected single-frequency` : ""}. RTK fixes will drop and long baselines will not hold.`;
      if (storming(c.kp))
        return `Disturbed ionosphere${err ? ` — roughly ±${err.toFixed(0)} m uncorrected` : ""}. RTK initialisation will be slower and long baselines less reliable.`;
      if ((c.kp ?? 0) >= 4)
        return "Slightly unsettled. Precision work is fine, though initialisation may take a little longer than usual.";
      return "Quiet ionosphere. Full precision available — a good day for control work.";
    },
    advice: (c) => {
      const out: string[] = [];
      if (storming(c.kp)) {
        out.push("Shorten RTK baselines — gradients grow with distance from base");
        out.push("Re-observe control points rather than trusting a single epoch");
      }
      if (rough(c.kp)) out.push("Consider postponing anything requiring centimetre accuracy");
      return out;
    },
  },

  {
    id: "marine",
    label: "Marine",
    who: "Sailing and offshore",
    icon: "Anchor",
    accent: "#7dd3c0",
    metrics: ["gps", "radio", "kp", "aurora"],
    defaultThreshold: 5,
    assistantBrief:
      "The user is navigating at sea. Focus on GNSS reliability, HF and MF radio for long-range comms, and the value of a paper backup. Practical and calm.",
    summarise: (c) => {
      if (rough(c.kp))
        return "Strong storm. Satellite position can wander and long-range radio will be unreliable. This is what paper charts are for.";
      if (storming(c.kp))
        return "Storm conditions. Expect some GNSS drift and patchy HF. Coastal VHF is unaffected.";
      return "Quiet. Navigation and long-range comms should behave normally.";
    },
    advice: (c) => {
      const out: string[] = [];
      if (storming(c.kp)) {
        out.push("Cross-check position by eye, radar or paper before relying on it");
        out.push("Expect HF schedules to be unreliable — VHF and satellite are unaffected");
      }
      if (rough(c.kp)) out.push("Log positions manually more often while this holds");
      return out;
    },
  },

  {
    id: "grid",
    label: "Preparedness",
    who: "Power, comms and resilience",
    icon: "Zap",
    accent: "#ff5d6c",
    metrics: ["kp", "bz", "wind", "density"],
    defaultThreshold: 6,
    assistantBrief:
      "The user cares about infrastructure resilience: induced currents in long conductors, transformer stress, and continuity of comms. Reference real events like Quebec 1989 where useful. Factual, never doom-laden.",
    summarise: (c) => {
      if ((c.kp ?? 0) >= 7)
        return "Severe storm. This is the level where induced currents genuinely stress transformers and grid operators start acting.";
      if (rough(c.kp))
        return "Strong storm. Measurable induced currents in long transmission lines; operators will be watching load closely.";
      if (storming(c.kp))
        return "Storm conditions, but well below anything that threatens infrastructure. Worth watching, not acting on.";
      return "Quiet. No meaningful induced current in long conductors.";
    },
    advice: (c) => {
      const out: string[] = [];
      if (rough(c.kp)) {
        out.push("Charge everything now, including backup power");
        out.push("Expect brief flickers on rural or long-line supplies");
      }
      if ((c.kp ?? 0) >= 7) out.push("Check on anyone dependent on mains-powered medical equipment");
      return out;
    },
  },

  {
    id: "scientific",
    label: "Scientific",
    who: "Full technical readout",
    icon: "Activity",
    accent: "#cebdff",
    metrics: ["kp", "bz", "wind", "density", "flare", "protons"],
    defaultThreshold: 4,
    assistantBrief:
      "The user wants the unfiltered physics. Use correct terminology without hedging, cite the actual measured values, and note the provenance of each (DSCOVR, GOES, OVATION) where relevant.",
    summarise: (c) => {
      const parts: string[] = [];
      if (c.kp != null) parts.push(`Kp ${c.kp.toFixed(2)}`);
      if (c.windSpeed != null) parts.push(`Vsw ${c.windSpeed.toFixed(0)} km/s`);
      if (c.bz != null)
        parts.push(`Bz ${c.bz.toFixed(1)} nT ${c.bz < -5 ? "(southward, coupling favourable)" : "(no sustained southward turning)"}`);
      if (c.flareClass !== "—") parts.push(`GOES long-band ${c.flareClass}`);
      return parts.length ? `${parts.join(" · ")}.` : "No telemetry available.";
    },
    advice: () => [],
  },
];

export const DEFAULT_MODE: ModeId = "everyday";

export function getMode(id: string | null | undefined): Mode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

/**
 * Older builds stored only "simple" or "scientific". Map them forward so an
 * upgrade doesn't reset the user to defaults.
 */
export function migrateMode(stored: string | null | undefined): ModeId {
  if (!stored) return DEFAULT_MODE;
  if (stored === "simple") return "everyday";
  if (MODES.some((m) => m.id === stored)) return stored as ModeId;
  return DEFAULT_MODE;
}

export const METRIC_LABELS: Record<MetricId, string> = {
  kp: "Storm level",
  gps: "Satellite navigation",
  radio: "Radio signal",
  wind: "Solar wind speed",
  flare: "Strongest recent flare",
  aurora: "Aurora overhead",
  bz: "Field direction (Bz)",
  density: "Solar wind density",
  protons: "Radiation at altitude",
};
