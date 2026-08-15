import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { auth, saveSettings } from "./firebase";

import { DEFAULT_MODE, migrateMode, type ModeId } from "./modes";

export type ReadingMode = ModeId;

export type Settings = {
  language: string;
  mode: ModeId;
  /** Send a notification when Kp reaches at least this value. */
  alertThreshold: number;
  notifyStorms: boolean;
  notifyAurora: boolean;
  notifyFlares: boolean;
  /** Don't buzz the phone between these hours (24h local time). */
  quietHoursFrom: number | null;
  quietHoursTo: number | null;
  useLocation: boolean;
  units: "metric" | "imperial";
  hapticsOn: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  mode: DEFAULT_MODE,
  alertThreshold: 5,
  notifyStorms: true,
  notifyAurora: true,
  notifyFlares: false,
  quietHoursFrom: null,
  quietHoursTo: null,
  useLocation: true,
  units: "metric",
  hapticsOn: true,
};

export type Place = {
  lat: number;
  lon: number;
  label: string;
  /** true when the coordinates came from the device GPS rather than a saved value */
  live: boolean;
  at: number;
};

type Store = {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  place: Place | null;
  locating: boolean;
  locationError: string | null;
  refreshLocation: () => Promise<Place | null>;
  onboarded: boolean;
  completeOnboarding: () => void;
  lessonsDone: number[];
  markLessonDone: (id: number) => void;
  ready: boolean;
};

const Ctx = createContext<Store | null>(null);

const KEY = "halo:settings";
const KEY_ONBOARD = "halo:onboarded";
const KEY_PLACE = "halo:place";
const KEY_LESSONS = "halo:lessons";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [lessonsDone, setLessonsDone] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  // hydrate from disk
  useEffect(() => {
    (async () => {
      const [s, o, p, l] = await Promise.all([
        Preferences.get({ key: KEY }),
        Preferences.get({ key: KEY_ONBOARD }),
        Preferences.get({ key: KEY_PLACE }),
        Preferences.get({ key: KEY_LESSONS }),
      ]);
      if (s.value) {
        const saved = JSON.parse(s.value);
        // Older builds stored mode as "simple" | "scientific".
        saved.mode = migrateMode(saved.mode);
        setSettings({ ...DEFAULT_SETTINGS, ...saved });
      }
      if (o.value === "1") setOnboarded(true);
      if (p.value) setPlace(JSON.parse(p.value));
      if (l.value) setLessonsDone(JSON.parse(l.value));
      loaded.current = true;
      setReady(true);
    })();
  }, []);

  // persist settings locally + to the signed-in account
  useEffect(() => {
    if (!loaded.current) return;
    Preferences.set({ key: KEY, value: JSON.stringify(settings) });
    const uid = auth.currentUser?.uid;
    if (uid) saveSettings(uid, settings);
  }, [settings]);

  useEffect(() => {
    if (!loaded.current) return;
    Preferences.set({ key: KEY_LESSONS, value: JSON.stringify(lessonsDone) });
  }, [lessonsDone]);

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const refreshLocation = async (): Promise<Place | null> => {
    setLocating(true);
    setLocationError(null);
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const asked = await Geolocation.requestPermissions();
        if (asked.location !== "granted") throw new Error("Location permission was declined.");
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
      const { latitude: lat, longitude: lon } = pos.coords;
      const label = await reverseGeocode(lat, lon);
      const next: Place = { lat, lon, label, live: true, at: Date.now() };
      setPlace(next);
      await Preferences.set({ key: KEY_PLACE, value: JSON.stringify(next) });
      return next;
    } catch (e) {
      setLocationError((e as Error).message || "Couldn't get your location.");
      return null;
    } finally {
      setLocating(false);
    }
  };

  const completeOnboarding = () => {
    setOnboarded(true);
    Preferences.set({ key: KEY_ONBOARD, value: "1" });
  };

  const markLessonDone = (id: number) =>
    setLessonsDone((d) => (d.includes(id) ? d : [...d, id]));

  const value = useMemo(
    () => ({
      settings,
      setSetting,
      place,
      locating,
      locationError,
      refreshLocation,
      onboarded,
      completeOnboarding,
      lessonsDone,
      markLessonDone,
      ready,
    }),
    [settings, place, locating, locationError, onboarded, lessonsDone, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}

/** Free, key-less reverse geocoding so the header can show a real place name. */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    const j = await res.json();
    const city = j.city || j.locality || j.principalSubdivision;
    const country = j.countryCode;
    return city && country ? `${city}, ${country}` : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

/** Magnetic latitude drives how far south aurora can be seen — real approximation. */
export function geomagneticLatitude(lat: number, lon: number): number {
  // North geomagnetic pole (IGRF-13 epoch 2025): 80.7°N, 72.7°W
  const poleLat = (80.7 * Math.PI) / 180;
  const poleLon = (-72.7 * Math.PI) / 180;
  const rLat = (lat * Math.PI) / 180;
  const rLon = (lon * Math.PI) / 180;
  const sin =
    Math.sin(rLat) * Math.sin(poleLat) +
    Math.cos(rLat) * Math.cos(poleLat) * Math.cos(rLon - poleLon);
  return (Math.asin(Math.max(-1, Math.min(1, sin))) * 180) / Math.PI;
}
