/**
 * Alerting, via local notifications raised whenever the app refreshes and sees
 * conditions cross the user's threshold.
 *
 * Deliberately no FCM here. The push plugin calls into FirebaseMessaging, which
 * throws "Default FirebaseApp is not initialized" on the main thread when no
 * google-services.json is bundled — that kills the process rather than
 * rejecting a promise. See README for adding push properly once that file and
 * the Android app exist in the Firebase console.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { kpToStatus } from "./swpc";
import type { Settings } from "./store";

/**
 * Android freezes a channel's sound and importance at creation, so changing
 * either needs a fresh id — hence the version suffix.
 */
const CHANNEL = "halo-alerts-v2";

/** res/raw/halo_alert.mp3 — calm but attention-getting. */
const ALERT_SOUND = "halo_alert";
const LAST_KEY = "halo:lastAlert";

export async function ensureChannel() {
  if (Capacitor.getPlatform() !== "android") return;
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: "Storm alerts",
    description: "Warnings when solar weather may affect you",
    importance: 5,
    visibility: 1,
    sound: ALERT_SOUND,
    vibration: true,
    lights: true,
    lightColor: "#2DD4BF",
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureChannel();
    const local = await LocalNotifications.requestPermissions();
    return local.display === "granted";
  } catch {
    return false;
  }
}

export async function notificationsEnabled(): Promise<boolean> {
  try {
    const s = await LocalNotifications.checkPermissions();
    return s.display === "granted";
  } catch {
    return false;
  }
}

function inQuietHours(s: Settings): boolean {
  if (s.quietHoursFrom == null || s.quietHoursTo == null) return false;
  const h = new Date().getHours();
  const { quietHoursFrom: a, quietHoursTo: b } = s;
  return a <= b ? h >= a && h < b : h >= a || h < b; // handles overnight windows
}

/**
 * Raises an alert if conditions warrant one. Deduplicates so the user isn't
 * buzzed repeatedly for the same ongoing storm.
 */
export async function maybeAlert(opts: {
  kp: number | null;
  flareClass: string;
  auroraChance: number | null;
  settings: Settings;
  placeLabel?: string;
}) {
  const { kp, flareClass, auroraChance, settings, placeLabel } = opts;
  if (inQuietHours(settings)) return;
  if (!(await notificationsEnabled())) return;

  let title: string | null = null;
  let body = "";
  let tag = "";

  if (settings.notifyStorms && kp != null && kp >= settings.alertThreshold) {
    const st = kpToStatus(kp);
    title = `${st.label} happening now`;
    body = placeLabel
      ? `Solar activity is affecting ${placeLabel}. GPS may drift and radio may crackle. Tap for what to do.`
      : "Solar activity is raised. GPS may drift and radio may crackle. Tap for what to do.";
    tag = `storm:${Math.floor(kp)}`;
  } else if (settings.notifyFlares && /^X/.test(flareClass)) {
    title = "Strong solar flare detected";
    body = `The Sun just released an ${flareClass} flare. Radio signals may fade briefly on the daylight side of Earth.`;
    tag = `flare:${flareClass}`;
  } else if (settings.notifyAurora && auroraChance != null && auroraChance >= 30) {
    title = "You might see the northern lights";
    body = `There's a ${Math.round(auroraChance)}% chance of aurora over you tonight. Find a dark spot away from streetlights and look toward the pole.`;
    tag = `aurora:${Math.round(auroraChance / 10)}`;
  }

  if (!title) return;

  const { value: last } = await Preferences.get({ key: LAST_KEY });
  if (last) {
    const prev = JSON.parse(last) as { tag: string; at: number };
    // same situation within 6 hours → stay quiet
    if (prev.tag === tag && Date.now() - prev.at < 6 * 3600_000) return;
  }

  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Date.now() % 100000),
        title,
        body,
        channelId: CHANNEL,
        smallIcon: "ic_stat_halo",
        iconColor: "#2DD4BF",
        sound: ALERT_SOUND,
        extra: { tag },
      },
    ],
  });
  await Preferences.set({ key: LAST_KEY, value: JSON.stringify({ tag, at: Date.now() }) });
}

/** Used by the "show me what an alert looks like" preview in settings. */
export async function sendTestAlert() {
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 99001,
        title: "This is what an alert looks like",
        body: "When a real storm is on the way, you'll get a message like this with simple steps to follow.",
        channelId: CHANNEL,
        smallIcon: "ic_stat_halo",
        iconColor: "#2DD4BF",
        sound: ALERT_SOUND,
        schedule: { at: new Date(Date.now() + 3000) },
      },
    ],
  });
}

/* ---------------- developer tools ---------------- */

export type TestAlertKind = "storm" | "aurora" | "flare" | "sound";

/** Fires a specific alert immediately, for testing from the developer tab. */
export async function fireTestAlert(kind: TestAlertKind, delaySeconds = 0) {
  await ensureChannel();

  const presets: Record<TestAlertKind, { title: string; body: string }> = {
    storm: {
      title: "Moderate storm (G2) happening now",
      body: "Solar activity is affecting your area. GPS may drift and radio may crackle. Tap for what to do.",
    },
    aurora: {
      title: "You might see the northern lights",
      body: "There's a 45% chance of aurora over you tonight. Find a dark spot away from streetlights and look toward the pole.",
    },
    flare: {
      title: "Strong solar flare detected",
      body: "The Sun just released an X1.4 flare. Radio signals may fade briefly on the daylight side of Earth.",
    },
    sound: {
      title: "Sound check",
      body: "This is the Halo Guard alert tone at full notification volume.",
    },
  };

  const preset = presets[kind];
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 90000 + Math.floor(Math.random() * 9000),
        title: preset.title,
        body: preset.body,
        channelId: CHANNEL,
        smallIcon: "ic_stat_halo",
        iconColor: "#2DD4BF",
        sound: ALERT_SOUND,
        ...(delaySeconds > 0 ? { schedule: { at: new Date(Date.now() + delaySeconds * 1000) } } : {}),
      },
    ],
  });
}

/** Clears the dedupe memory so the same alert can be tested repeatedly. */
export async function resetAlertHistory() {
  await Preferences.remove({ key: LAST_KEY });
}

export async function pendingAlertCount(): Promise<number> {
  try {
    const { notifications } = await LocalNotifications.getPending();
    return notifications.length;
  } catch {
    return 0;
  }
}
