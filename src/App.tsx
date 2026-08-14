import { useEffect, useRef, useState } from "react";
import { BookOpen, MessageCircle, Radio, Sun, TrendingUp } from "lucide-react";
import type { User } from "firebase/auth";

import { StoreProvider, useStore } from "./lib/store";
import { ConditionsProvider, useConditions } from "./lib/conditions";
import { registerActions } from "./lib/actions";
import { signOut, watchAuth } from "./lib/firebase";
import { sendTestAlert, requestNotificationPermission } from "./lib/notify";
import {
  CMD_CALIBRATE,
  CMD_IDENTIFY,
  connectNode,
  disconnectNode,
  nodeState,
  reconnectSavedNode,
  scanForNodes,
  sendCommand,
} from "./lib/device";
import { kpToStatus } from "./lib/swpc";
import { findLesson, type Lesson } from "./content/lessons";
import { TABS, type Screen, type Tab } from "./nav";
import { tap } from "./components/ui";

import { Onboarding } from "./screens/Onboarding";
import { Auth } from "./screens/Auth";
import { Now } from "./screens/Now";
import { Forecast } from "./screens/Forecast";
import { Events } from "./screens/Events";
import { Learn, LessonView } from "./screens/Learn";
import { Assistant } from "./screens/Assistant";
import { Device } from "./screens/Device";
import { Shop } from "./screens/Shop";
import { Settings } from "./screens/Settings";

import "./theme.css";

export default function App() {
  return (
    <StoreProvider>
      <ConditionsProvider>
        <Shell />
      </ConditionsProvider>
    </StoreProvider>
  );
}

function Shell() {
  const { onboarded, completeOnboarding, ready, settings, setSetting, refreshLocation, place } = useStore();
  const conditions = useConditions();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("now");
  const [lesson, setLesson] = useState<Lesson | null>(null);

  // Keep the newest values available to the Gemini tool handlers.
  const live = useRef({ conditions, settings, place });
  live.current = { conditions, settings, place };

  useEffect(() => watchAuth((u) => {
    setUser(u);
    setAuthReady(true);
  }), []);

  // Reconnect a previously paired node in the background on launch.
  useEffect(() => {
    if (user) reconnectSavedNode().catch(() => {});
  }, [user]);

  /* ---------- give Gemini real control of the app ---------- */
  useEffect(() => {
    registerActions({
      navigate: ({ screen: s }) => {
        const target = s as Screen;
        setScreen(target);
        return { ok: true, summary: `Opened ${labelFor(target)}` };
      },

      set_reading_mode: ({ mode }) => {
        setSetting("mode", mode === "scientific" ? "scientific" : "simple");
        return { ok: true, summary: `Switched to ${mode} explanations` };
      },

      set_alert_threshold: ({ kp }) => {
        const v = Math.max(1, Math.min(9, Math.round(Number(kp))));
        setSetting("alertThreshold", v);
        return {
          ok: true,
          summary: `Alerts now start at level ${v} (${kpToStatus(v).label.toLowerCase()})`,
          data: { threshold: v },
        };
      },

      set_notification: ({ kind, enabled }) => {
        const key =
          kind === "aurora" ? "notifyAurora" : kind === "flares" ? "notifyFlares" : "notifyStorms";
        setSetting(key, !!enabled);
        const name = kind === "aurora" ? "Northern lights alerts" : kind === "flares" ? "Solar flare alerts" : "Storm warnings";
        return { ok: true, summary: `${name} turned ${enabled ? "on" : "off"}` };
      },

      set_quiet_hours: ({ from, to }) => {
        if (from == null || to == null) {
          setSetting("quietHoursFrom", null);
          setSetting("quietHoursTo", null);
          return { ok: true, summary: "Quiet hours cleared" };
        }
        const f = Math.max(0, Math.min(23, Math.round(Number(from))));
        const t = Math.max(0, Math.min(23, Math.round(Number(to))));
        setSetting("quietHoursFrom", f);
        setSetting("quietHoursTo", t);
        return { ok: true, summary: `Quiet from ${f}:00 to ${t}:00` };
      },

      set_language: ({ code }) => {
        setSetting("language", String(code).slice(0, 5));
        return { ok: true, summary: `Language set to ${code}` };
      },

      set_units: ({ units }) => {
        setSetting("units", units === "imperial" ? "imperial" : "metric");
        return { ok: true, summary: `Using ${units} units` };
      },

      update_location: async () => {
        const p = await refreshLocation();
        if (!p) return { ok: false, summary: "Couldn't read your location" };
        setSetting("useLocation", true);
        return {
          ok: true,
          summary: `Location set to ${p.label}`,
          data: { place: p.label, latitude: p.lat, longitude: p.lon },
        };
      },

      get_conditions: () => {
        const c = live.current.conditions;
        const st = kpToStatus(c.kp);
        return {
          ok: true,
          summary: "Read the current conditions",
          data: {
            kp: c.kp,
            storm_level: st.label,
            strongest_recent_flare: c.flareClass,
            solar_wind_km_s: c.wind?.speed ?? null,
            magnetic_field_bz_nT: c.mag?.bz ?? null,
            aurora_chance_percent: c.auroraChance,
            location: live.current.place?.label ?? null,
            latest_noaa_alert: c.alerts[0]?.headline ?? null,
            data_is_from_cache: c.offline,
          },
        };
      },

      preview_alert: async () => {
        const ok = await requestNotificationPermission();
        if (!ok) return { ok: false, summary: "Notifications are switched off on this phone" };
        await sendTestAlert();
        return { ok: true, summary: "Sample alert sent" };
      },

      find_device: async () => {
        setScreen("device");
        const seen: { id: string; name?: string }[] = [];
        await scanForNodes((d) => {
          if (seen.length === 0) seen.push({ id: d.deviceId, name: d.name });
        }, 6);
        const first = seen[0];
        if (!first) return { ok: false, summary: "No Halo device found nearby" };
        await connectNode(first.id, first.name);
        return { ok: true, summary: `Connected to ${first.name ?? "your device"}` };
      },

      device_readings: () => {
        const n = nodeState();
        if (!n.connected) return { ok: false, summary: "No device is connected" };
        return {
          ok: true,
          summary: "Read your device",
          data: {
            magnetic_field_uT: n.telemetry?.magnitudeUT ?? null,
            field_change_uT: n.telemetry?.deltaUT ?? null,
            radiation_cpm: n.telemetry?.cpm ?? null,
            temperature_c: n.telemetry?.tempC ?? null,
            gps_fix: n.gps?.fix ?? false,
            satellites: n.gps?.satellites ?? 0,
            battery_percent: n.status?.battery ?? null,
          },
        };
      },

      calibrate_device: async () => {
        await sendCommand(CMD_CALIBRATE);
        return { ok: true, summary: "Calibration started — keep the device still" };
      },

      identify_device: async () => {
        await sendCommand(CMD_IDENTIFY);
        return { ok: true, summary: "Your device is flashing now" };
      },

      disconnect_device: async () => {
        await disconnectNode();
        return { ok: true, summary: "Device disconnected" };
      },

      open_lesson: ({ query }) => {
        const l = findLesson(String(query ?? ""));
        if (!l) return { ok: false, summary: `No lesson found about "${query}"` };
        setLesson(l);
        setScreen("lesson");
        return { ok: true, summary: `Opened "${l.title}"`, data: { title: l.title, takeaway: l.takeaway } };
      },

      sign_out: async () => {
        await signOut();
        return { ok: true, summary: "Signed out" };
      },
    });
  }, [setSetting, refreshLocation]);

  if (!ready || !authReady) return <Splash />;
  if (!onboarded) return <Frame><Onboarding onDone={completeOnboarding} /></Frame>;
  if (!user) return <Frame><Auth /></Frame>;

  const body = (() => {
    switch (screen) {
      case "now":
        return <Now go={setScreen} />;
      case "forecast":
        return <Forecast />;
      case "events":
        return <Events onBack={() => setScreen("now")} />;
      case "learn":
        return (
          <Learn
            openLesson={(l) => {
              setLesson(l);
              setScreen("lesson");
            }}
          />
        );
      case "lesson":
        return lesson ? (
          <LessonView lesson={lesson} onBack={() => setScreen("learn")} />
        ) : (
          <Learn openLesson={(l) => { setLesson(l); setScreen("lesson"); }} />
        );
      case "assistant":
        return <Assistant />;
      case "device":
        return <Device />;
      case "shop":
        return <Shop onBack={() => setScreen("now")} />;
      case "settings":
        return <Settings onBack={() => setScreen("now")} />;
      default:
        return <Now go={setScreen} />;
    }
  })();

  const hideNav = screen === "lesson" || screen === "events" || screen === "shop" || screen === "settings";

  return (
    <Frame>
      {body}
      {!hideNav && <BottomNav screen={screen} go={setScreen} onMore={() => setScreen("settings")} />}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>{children}</div>;
}

function Splash() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--void)",
      }}
    >
      <div
        className="pulse"
        style={{
          width: 66,
          height: 66,
          borderRadius: 20,
          background: "linear-gradient(135deg,var(--teal),var(--violet))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sun size={32} color="var(--void)" />
      </div>
    </div>
  );
}

const NAV_META: Record<Tab, { label: string; icon: typeof Sun }> = {
  now: { label: "Now", icon: Sun },
  forecast: { label: "Forecast", icon: TrendingUp },
  assistant: { label: "Ask Halo", icon: MessageCircle },
  learn: { label: "Learn", icon: BookOpen },
  device: { label: "Device", icon: Radio },
};

function BottomNav({
  screen,
  go,
  onMore,
}: {
  screen: Screen;
  go: (s: Screen) => void;
  onMore: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(13,19,31,0.86)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        padding: "8px 4px calc(var(--sab) + 10px)",
      }}
    >
      {TABS.map((t) => {
        const { label, icon: Icon } = NAV_META[t];
        const active = screen === t || (t === "learn" && screen === "lesson");
        return (
          <button
            key={t}
            onClick={() => {
              tap();
              go(t);
            }}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 0",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {active && (
              <div
                style={{
                  position: "absolute",
                  top: -9,
                  width: 22,
                  height: 2.5,
                  borderRadius: 3,
                  background: "var(--teal)",
                }}
              />
            )}
            <Icon size={20} color={active ? "var(--teal)" : "var(--dim)"} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: active ? "var(--teal)" : "var(--dim)",
                whiteSpace: "nowrap",
              }}
              onDoubleClick={onMore}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function labelFor(s: Screen): string {
  switch (s) {
    case "now":
      return "the dashboard";
    case "forecast":
      return "the forecast";
    case "events":
      return "the event log";
    case "learn":
      return "the lessons";
    case "assistant":
      return "the assistant";
    case "device":
      return "your device";
    case "shop":
      return "the shop";
    case "settings":
    case "profile":
      return "settings";
    default:
      return s;
  }
}
