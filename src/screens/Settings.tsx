import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  BellRing,
  Globe,
  Info,
  LogOut,
  MapPin,
  Moon,
  Ruler,
  Shield,
  Sliders,
  Smartphone,
  User,
} from "lucide-react";
import { Btn, Card, Row, ScreenHeader, Segmented, SpectrumLine, Toggle, tap } from "../components/ui";
import { useStore } from "../lib/store";
import { auth, signOut } from "../lib/firebase";
import { notificationsEnabled, requestNotificationPermission, sendTestAlert } from "../lib/notify";
import { kpToStatus } from "../lib/swpc";
import { LANGUAGES } from "./Onboarding";

export function Settings({ onBack, onOpenDev }: { onBack: () => void; onOpenDev: () => void }) {
  const { settings, setSetting, place, refreshLocation, locating } = useStore();
  const [notifOk, setNotifOk] = useState<boolean | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [showLangs, setShowLangs] = useState(false);
  // Seven taps on the version line opens the developer tab.
  const [taps, setTaps] = useState(0);
  const devUnlocked = taps >= 7;

  useEffect(() => {
    notificationsEnabled().then(setNotifOk);
  }, []);

  const user = auth.currentUser;
  const threshold = kpToStatus(settings.alertThreshold);

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader eyebrow="Your preferences" title="Settings" onBack={onBack} right={<Sliders size={20} color="var(--teal)" />} />

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* account */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 48,
                height: 48,
                flex: "none",
                borderRadius: 14,
                background: "linear-gradient(135deg,var(--teal),var(--violet))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User size={22} color="var(--void)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="display" style={{ fontWeight: 700, fontSize: 16 }}>
                {user?.displayName || "Your account"}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.email}
              </div>
            </div>
          </div>
        </Card>

        {/* alerts */}
        <Section title="Alerts" icon={Bell}>
          {notifOk === false && (
            <Card style={{ borderColor: "rgba(255,159,67,0.4)", background: "rgba(255,159,67,0.06)", marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 12 }}>
                Notifications are switched off, so we can't warn you when a storm is coming.
              </div>
              <Btn
                onClick={async () => {
                  const ok = await requestNotificationPermission();
                  setNotifOk(ok);
                }}
                icon={BellRing}
              >
                Turn on alerts
              </Btn>
            </Card>
          )}

          <Card>
            <div style={{ fontSize: 14.5, fontWeight: 500 }}>How sensitive should alerts be?</div>
            <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>
              We'll only message you when the storm level reaches{" "}
              <strong style={{ color: threshold.color }}>{settings.alertThreshold}</strong> —{" "}
              {threshold.label.toLowerCase()}.
            </div>

            <div style={{ margin: "18px 0 8px" }}>
              <SpectrumLine value={settings.alertThreshold / 9} height={8} />
            </div>
            <input
              type="range"
              min={3}
              max={8}
              step={1}
              value={settings.alertThreshold}
              onChange={(e) => setSetting("alertThreshold", Number(e.target.value))}
              style={{ width: "100%", accentColor: "#2dd4bf" }}
            />
            <div
              className="mono"
              style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)" }}
            >
              <span>TELL ME EVERYTHING</span>
              <span>ONLY BIG STORMS</span>
            </div>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Toggle
              on={settings.notifyStorms}
              onChange={(v) => setSetting("notifyStorms", v)}
              label="Storm warnings"
              detail="When solar activity may affect your GPS, radio or power"
            />
            <Divider />
            <Toggle
              on={settings.notifyAurora}
              onChange={(v) => setSetting("notifyAurora", v)}
              label="Northern lights"
              detail="When there's a real chance of seeing the aurora where you are"
            />
            <Divider />
            <Toggle
              on={settings.notifyFlares}
              onChange={(v) => setSetting("notifyFlares", v)}
              label="Big solar flares"
              detail="Every major flare, even if it won't affect you. For enthusiasts."
            />
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Moon size={15} color="var(--violet)" />
              <span style={{ fontSize: 14.5, fontWeight: 500 }}>Quiet hours</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 14, lineHeight: 1.5 }}>
              {settings.quietHoursFrom != null
                ? `We won't buzz your phone between ${settings.quietHoursFrom}:00 and ${settings.quietHoursTo}:00.`
                : "Your phone can be alerted at any hour."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <TimeSelect
                label="From"
                value={settings.quietHoursFrom}
                onChange={(v) => setSetting("quietHoursFrom", v)}
              />
              <TimeSelect label="To" value={settings.quietHoursTo} onChange={(v) => setSetting("quietHoursTo", v)} />
            </div>
            {settings.quietHoursFrom != null && (
              <div style={{ marginTop: 12 }}>
                <Btn
                  variant="quiet"
                  onClick={() => {
                    setSetting("quietHoursFrom", null);
                    setSetting("quietHoursTo", null);
                  }}
                >
                  Clear quiet hours
                </Btn>
              </div>
            )}
          </Card>

          <div style={{ marginTop: 12 }}>
            <Btn
              variant="ghost"
              icon={BellRing}
              onClick={async () => {
                await sendTestAlert();
                setTestSent(true);
                setTimeout(() => setTestSent(false), 4000);
              }}
            >
              {testSent ? "Sent — check your notifications" : "Show me what an alert looks like"}
            </Btn>
          </div>
        </Section>

        {/* app */}
        <Section title="App" icon={Smartphone}>
          <Card>
            <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 12 }}>How should we explain things?</div>
            <Segmented
              value={settings.mode}
              onChange={(m) => setSetting("mode", m)}
              options={[
                { value: "simple", label: "Simple" },
                { value: "scientific", label: "Scientific" },
              ]}
            />
            <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 12, lineHeight: 1.5 }}>
              {settings.mode === "simple"
                ? "Plain English, no jargon. Recommended for most people."
                : "Full technical detail with real units and values."}
            </div>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Toggle
              on={settings.hapticsOn}
              onChange={(v) => setSetting("hapticsOn", v)}
              label="Vibration feedback"
              detail="A small buzz when you tap things"
            />
            <Divider />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Ruler size={15} color="var(--dim)" />
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>Units</span>
              </div>
              <div style={{ width: 168 }}>
                <Segmented
                  value={settings.units}
                  onChange={(u) => setSetting("units", u)}
                  options={[
                    { value: "metric", label: "Metric" },
                    { value: "imperial", label: "Imperial" },
                  ]}
                />
              </div>
            </div>
          </Card>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <Row
              icon={Globe}
              title="Language"
              detail={LANGUAGES.find((l) => l.code === settings.language)?.native ?? "English"}
              onClick={() => setShowLangs((s) => !s)}
            />
            {showLangs && (
              <Card>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        tap();
                        setSetting("language", l.code);
                        setShowLangs(false);
                      }}
                      style={{
                        padding: "9px 13px",
                        borderRadius: 999,
                        border: `1px solid ${settings.language === l.code ? "var(--teal)" : "var(--line-2)"}`,
                        background: settings.language === l.code ? "rgba(45,212,191,0.12)" : "transparent",
                        color: settings.language === l.code ? "var(--teal)" : "var(--mid)",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {l.native}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <Row
              icon={MapPin}
              title="Location"
              detail={locating ? "Finding you…" : (place?.label ?? "Not set — tap to enable")}
              onClick={() => refreshLocation()}
              right={
                <span className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>
                  {place ? "UPDATE" : "SET"}
                </span>
              }
            />
          </div>
        </Section>

        {/* about */}
        <Section title="About" icon={Info}>
          <Card>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--mid)" }}>
              All readings come from the <strong style={{ color: "var(--hi)" }}>NOAA Space Weather Prediction
              Center</strong>, a public service of the US government. Halo Guard doesn't generate or estimate any
              measurement itself.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: "var(--dim)", fontSize: 12 }}>
              <Shield size={13} /> Your location never leaves your phone.
            </div>
          </Card>

          <button
            onClick={() => {
              tap();
              setTaps((t) => t + 1);
            }}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              color: "var(--dim)",
              fontSize: 11.5,
              fontFamily: "var(--mono)",
              padding: "16px 0 6px",
              cursor: "default",
              textAlign: "center",
            }}
          >
            HALO GUARD 1.0
            {taps > 2 && taps < 7 ? ` · ${7 - taps} more` : ""}
          </button>

          {devUnlocked && (
            <div className="fade-up" style={{ marginBottom: 12 }}>
              <Row
                icon={Activity}
                tint="var(--violet)"
                title="Developer"
                detail="Test notifications, feed status, diagnostics"
                onClick={onOpenDev}
              />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <Btn
              variant="quiet"
              icon={LogOut}
              onClick={() => {
                signOut();
              }}
            >
              Sign out
            </Btn>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bell;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon size={14} color="var(--dim)" />
        <span className="eyebrow">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--line)", margin: "2px 0" }} />;
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label style={{ flex: 1 }}>
      <div className="field-label">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        style={{
          width: "100%",
          background: "var(--panel-2)",
          border: "1px solid var(--line-2)",
          borderRadius: 12,
          padding: "12px 12px",
          color: "var(--hi)",
          fontFamily: "var(--mono)",
        }}
      >
        <option value="">—</option>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}:00
          </option>
        ))}
      </select>
    </label>
  );
}
