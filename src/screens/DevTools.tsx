import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  Copy,
  Eraser,
  RefreshCw,
  Trash2,
  Volume2,
  XCircle,
} from "lucide-react";
import { Preferences } from "@capacitor/preferences";
import { Btn, Card, ScreenHeader, timeAgo } from "../components/ui";
import { feedDiagnostics, type FeedStatus } from "../lib/swpc";
import { activeModel } from "../lib/gemini";
import { fireTestAlert, notificationsEnabled, pendingAlertCount, requestNotificationPermission, resetAlertHistory, type TestAlertKind } from "../lib/notify";
import { googleSignInAvailable } from "../lib/firebase";
import { useConditions } from "../lib/conditions";
import { useStore } from "../lib/store";
import { estimateLocal } from "../lib/estimate";

/**
 * Hidden diagnostics, reached by tapping the version row seven times.
 * Exists so a "no reading" or a silent notification can be diagnosed on the
 * device instead of guessed at from a screenshot.
 */
export function DevTools({ onBack }: { onBack: () => void }) {
  const c = useConditions();
  const { place, settings } = useStore();
  const [feeds, setFeeds] = useState<FeedStatus[]>([]);
  const [notifOk, setNotifOk] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);
  const [googleOk, setGoogleOk] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refreshAll = () => {
    setFeeds(feedDiagnostics());
    notificationsEnabled().then(setNotifOk);
    pendingAlertCount().then(setPending);
    googleSignInAvailable().then(setGoogleOk);
  };

  useEffect(refreshAll, [c.updatedAt]);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  async function test(kind: TestAlertKind, delay = 0) {
    if (!(await requestNotificationPermission())) {
      say("Notifications are switched off for this app");
      return;
    }
    await fireTestAlert(kind, delay);
    say(delay ? `${kind} alert in ${delay}s — background the app` : `${kind} alert sent`);
    pendingAlertCount().then(setPending);
  }

  const est = place ? estimateLocal(place.lat, place.lon, c.kp) : null;

  const diagnosticsText = [
    `model: ${activeModel()}`,
    `kp: ${c.kp ?? "null"}  flare: ${c.flareClass}  wind: ${c.wind?.speed ?? "null"}`,
    `aurora: ${c.auroraChance ?? "null"}  alerts: ${c.alerts.length}`,
    `place: ${place ? `${place.label} ${place.lat.toFixed(3)},${place.lon.toFixed(3)}` : "none"}`,
    `offline: ${c.offline}  error: ${c.error ?? "none"}`,
    "",
    ...feeds.map((f) => `${f.ok ? "OK " : "ERR"} ${f.key} ${f.status} rows=${f.rows} ${f.ms}ms ${f.error ?? ""}`),
  ].join("\n");

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 40 }}>
      <ScreenHeader
        eyebrow="Not for normal use"
        title="Developer"
        onBack={onBack}
        right={<Activity size={20} color="var(--violet)" />}
      />

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        {toast && (
          <div
            className="fade-up"
            style={{
              background: "rgba(45,212,191,0.10)",
              border: "1px solid rgba(45,212,191,0.35)",
              borderRadius: 12,
              padding: "11px 13px",
              fontSize: 13,
              color: "var(--teal)",
            }}
          >
            {toast}
          </div>
        )}

        {/* notifications */}
        <Section title="Test notifications">
          <Card>
            <StatusLine
              ok={notifOk === true}
              label={notifOk ? "Permission granted" : "Permission not granted"}
              detail={`${pending} scheduled · channel halo-alerts-v2 · sound halo_alert.mp3`}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 14 }}>
              <DevButton icon={Bell} label="Storm" onClick={() => test("storm")} />
              <DevButton icon={Bell} label="Aurora" onClick={() => test("aurora")} />
              <DevButton icon={Bell} label="Flare" onClick={() => test("flare")} />
              <DevButton icon={Volume2} label="Sound only" onClick={() => test("sound")} />
            </div>
            <div style={{ marginTop: 9 }}>
              <DevButton
                icon={Bell}
                label="Storm alert in 8 seconds (lock the phone)"
                wide
                onClick={() => test("storm", 8)}
              />
            </div>
            <div style={{ marginTop: 9 }}>
              <DevButton
                icon={Eraser}
                label="Clear alert dedupe memory"
                wide
                onClick={async () => {
                  await resetAlertHistory();
                  say("Dedupe cleared — real alerts can fire again");
                }}
              />
            </div>
            <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.55, margin: "12px 0 0" }}>
              The tone only plays if the phone isn't silenced and the app is in the background. Android
              caches channel settings, so reinstall if you change the sound.
            </p>
          </Card>
        </Section>

        {/* live feeds */}
        <Section title="NOAA feeds">
          <Card>
            {feeds.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--mid)" }}>No fetches recorded yet.</div>
            ) : (
              feeds.map((f, i) => (
                <div
                  key={f.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 0",
                    borderTop: i === 0 ? "none" : "1px solid var(--line)",
                  }}
                >
                  {f.ok ? (
                    <CheckCircle2 size={15} color="var(--teal)" style={{ flex: "none", marginTop: 2 }} />
                  ) : (
                    <XCircle size={15} color="var(--red)" style={{ flex: "none", marginTop: 2 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 12.5 }}>
                      {f.key}
                      <span style={{ color: "var(--dim)" }}>
                        {" "}
                        · {f.rows} rows · {f.ms}ms
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: f.ok ? "var(--dim)" : "var(--red)", marginTop: 2, wordBreak: "break-word" }}>
                      {f.ok
                        ? `HTTP ${f.status} · ${timeAgo(f.at)}`
                        : `${f.error}${f.fromCache ? " · serving cache" : " · no cache"}`}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
              <DevButton icon={RefreshCw} label="Refetch everything" wide onClick={() => c.refresh().then(refreshAll)} />
              <DevButton
                icon={Copy}
                label="Copy diagnostics"
                wide
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(diagnosticsText);
                    say("Copied to clipboard");
                  } catch {
                    say("Clipboard blocked — screenshot instead");
                  }
                }}
              />
            </div>
          </Card>
        </Section>

        {/* assistant + auth */}
        <Section title="Services">
          <Card>
            <KV k="Gemini model" v={activeModel()} />
            <KV k="Google sign-in" v={googleOk ? "configured" : "no google-services.json"} />
            <KV k="Reading mode" v={settings.mode} />
            <KV k="Alert threshold" v={`Kp ${settings.alertThreshold}`} />
            <KV
              k="Quiet hours"
              v={settings.quietHoursFrom == null ? "off" : `${settings.quietHoursFrom}:00–${settings.quietHoursTo}:00`}
            />
          </Card>
        </Section>

        {/* position + estimate */}
        <Section title="Position and estimate">
          <Card>
            {place ? (
              <>
                <KV k="Place" v={place.label} />
                <KV k="Coordinates" v={`${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`} />
                <KV k="Fix age" v={timeAgo(place.at)} />
                {est && (
                  <>
                    <KV k="Magnetic latitude" v={`${est.magneticLatitude.toFixed(2)}°`} />
                    <KV k="Field estimate" v={`${est.fieldUT.toFixed(2)} µT`} />
                    <KV k="Exposure" v={est.exposure.toFixed(2)} />
                    <KV k="GPS error" v={`± ${est.gpsErrorM.toFixed(1)} m`} />
                    <KV k="Zone" v={est.zone} />
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--mid)" }}>No position yet.</div>
            )}
          </Card>
        </Section>

        {/* storage */}
        <Section title="Storage">
          <Card>
            <DevButton
              icon={Trash2}
              label="Clear cached feed data"
              wide
              onClick={async () => {
                const { keys } = await Preferences.keys();
                await Promise.all(keys.filter((k) => k.startsWith("swpc:")).map((key) => Preferences.remove({ key })));
                say("Feed cache cleared");
                c.refresh().then(refreshAll);
              }}
            />
            <div style={{ height: 9 }} />
            <DevButton
              icon={Trash2}
              label="Reset onboarding and settings"
              wide
              danger
              onClick={async () => {
                await Promise.all(
                  ["halo:settings", "halo:onboarded", "halo:place", "halo:lessons"].map((key) =>
                    Preferences.remove({ key }),
                  ),
                );
                say("Cleared — restart the app to see onboarding");
              }}
            />
          </Card>
        </Section>

        <div style={{ marginTop: 4 }}>
          <Btn variant="quiet" onClick={onBack}>
            Back to settings
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      {ok ? (
        <CheckCircle2 size={16} color="var(--teal)" style={{ flex: "none", marginTop: 1 }} />
      ) : (
        <XCircle size={16} color="var(--amber)" style={{ flex: "none", marginTop: 1 }} />
      )}
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 3, wordBreak: "break-word" }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "7px 0", alignItems: "baseline" }}>
      <span style={{ fontSize: 13, color: "var(--mid)", flex: "none" }}>{k}</span>
      <span className="mono" style={{ fontSize: 12, textAlign: "right", wordBreak: "break-word" }}>
        {v}
      </span>
    </div>
  );
}

function DevButton({
  icon: Icon,
  label,
  onClick,
  wide,
  danger,
}: {
  icon: typeof Bell;
  label: string;
  onClick: () => void;
  wide?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        gridColumn: wide ? "1 / -1" : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "11px 12px",
        borderRadius: 11,
        border: `1px solid ${danger ? "rgba(255,93,108,0.4)" : "var(--line-2)"}`,
        background: danger ? "rgba(255,93,108,0.07)" : "var(--panel-2)",
        color: danger ? "var(--red)" : "var(--hi)",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <Icon size={14} style={{ flex: "none" }} />
      {label}
    </button>
  );
}
