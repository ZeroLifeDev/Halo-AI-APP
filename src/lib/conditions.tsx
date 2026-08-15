/**
 * One shared live view of current space weather, so every screen (and the
 * Gemini assistant) reads exactly the same numbers.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import {
  fetchAlerts,
  fetchAurora,
  fetchKp,
  fetchKpForecast,
  fetchMagField,
  fetchSolarWind,
  fetchXray,
  fluxToClass,
  auroraChanceAt,
  kpToStatus,
  type Alert,
  type AuroraGrid,
  type KpPoint,
  type MagField,
  type SolarWind,
  type XrayPoint,
} from "./swpc";
import { useStore } from "./store";
import { maybeAlert } from "./notify";
import { pushLevelToNode } from "./device";

export type Conditions = {
  kp: number | null;
  kpHistory: KpPoint[];
  kpForecast: KpPoint[];
  wind: SolarWind | null;
  windHistory: SolarWind[];
  mag: MagField | null;
  xray: XrayPoint[];
  /** Strongest flare class in the last 6 hours, e.g. "M1.2". */
  flareClass: string;
  alerts: Alert[];
  aurora: AuroraGrid | null;
  /** Percentage chance of aurora at the user's location, from OVATION. */
  auroraChance: number | null;
  loading: boolean;
  refreshing: boolean;
  /** true when some feed came from cache because the network failed */
  offline: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Conditions | null>(null);

const REFRESH_MS = 5 * 60 * 1000;

export function ConditionsProvider({ children }: { children: React.ReactNode }) {
  const { place, settings } = useStore();
  const [state, setState] = useState<Omit<Conditions, "refresh">>({
    kp: null,
    kpHistory: [],
    kpForecast: [],
    wind: null,
    windHistory: [],
    mag: null,
    xray: [],
    flareClass: "—",
    alerts: [],
    aurora: null,
    auroraChance: null,
    loading: true,
    refreshing: false,
    offline: false,
    error: null,
    updatedAt: null,
  });
  const inFlight = useRef(false);
  const placeRef = useRef(place);
  placeRef.current = place;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, refreshing: true }));

    const [kp, kpF, wind, mag, xray, alerts, aurora] = await Promise.all([
      fetchKp(),
      fetchKpForecast(),
      fetchSolarWind(),
      fetchMagField(),
      fetchXray(),
      fetchAlerts(),
      fetchAurora(),
    ]);

    const kpHistory = kp.data ?? [];
    const latestKp = kpHistory.length ? kpHistory[kpHistory.length - 1].kp : null;
    const windHistory = wind.data ?? [];
    const latestWind = windHistory.length ? windHistory[windHistory.length - 1] : null;
    const magHistory = mag.data ?? [];
    const latestMag = magHistory.length ? magHistory[magHistory.length - 1] : null;
    const xrayPoints = xray.data ?? [];
    const peakFlux = xrayPoints.length ? Math.max(...xrayPoints.map((p) => p.flux)) : NaN;
    const flareClass = fluxToClass(peakFlux);

    const p = placeRef.current;
    const auroraChance =
      aurora.data && p ? auroraChanceAt(aurora.data, p.lat, p.lon) : null;

    const feeds = [kp, kpF, wind, mag, xray, alerts, aurora];
    const offline = feeds.some((f) => f.stale);
    const allFailed = feeds.every((f) => f.data == null);

    setState({
      kp: latestKp,
      kpHistory,
      kpForecast: kpF.data ?? [],
      wind: latestWind,
      windHistory,
      mag: latestMag,
      xray: xrayPoints,
      flareClass,
      alerts: alerts.data ?? [],
      aurora: aurora.data,
      auroraChance,
      loading: false,
      refreshing: false,
      offline,
      error: allFailed ? "Couldn't reach the space weather service." : null,
      updatedAt: Date.now(),
    });

    inFlight.current = false;

    // Keep a connected node's LEDs in step with the planetary reading.
    pushLevelToNode(latestKp).catch(() => {});

    // Raise a notification if this refresh crossed the user's threshold.
    maybeAlert({
      kp: latestKp,
      flareClass,
      auroraChance,
      settings: settingsRef.current,
      placeLabel: p?.label,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    // Refresh the moment the user comes back to the app.
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) refresh();
    });
    return () => {
      clearInterval(id);
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, [refresh]);

  // Recompute the aurora chance when the user's location changes.
  useEffect(() => {
    setState((s) =>
      s.aurora && place
        ? { ...s, auroraChance: auroraChanceAt(s.aurora, place.lat, place.lon) }
        : s,
    );
  }, [place]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConditions() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConditions must be used inside ConditionsProvider");
  return v;
}

export { kpToStatus };
