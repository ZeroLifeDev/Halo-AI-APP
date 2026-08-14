/**
 * Alerting. Two paths:
 *  - Local notifications, raised by the app whenever it refreshes and sees
 *    conditions cross the user's threshold.
 *  - Push (FCM), so NOAA-driven alerts can reach the phone when the app is shut.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { kpToStatus } from "./swpc";
import type { Settings } from "./store";

const CHANNEL = "halo-storms";
const LAST_KEY = "halo:lastAlert";

export async function ensureChannel() {
  if (Capacitor.getPlatform() !== "android") return;
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: "Storm alerts",
    description: "Warnings when solar weather may affect you",
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#2DD4BF",
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureChannel();
    const local = await LocalNotifications.requestPermissions();
    const granted = local.display === "granted";
    if (granted && Capacitor.isNativePlatform()) registerPush().catch(() => {});
    return granted;
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

/** Registers with FCM and stores the token against the user for server-side pushes. */
export async function registerPush() {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
  PushNotifications.addListener("registration", async (token) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(
        doc(db, "users", uid),
        { fcmTokens: { [token.value]: { platform: Capacitor.getPlatform(), at: Date.now() } } },
        { merge: true },
      );
    } catch {
      /* offline; token re-registers on next launch */
    }
  });
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
        schedule: { at: new Date(Date.now() + 3000) },
      },
    ],
  });
}
