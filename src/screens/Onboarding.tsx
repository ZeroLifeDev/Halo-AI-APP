import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, Check, MapPin } from "lucide-react";
import { HaloBadge } from "../components/HaloMark";
import { Btn, SpectrumLine, tap } from "../components/ui";
import { useStore, geomagneticLatitude } from "../lib/store";
import { requestNotificationPermission } from "../lib/notify";
import { fetchKp, kpToStatus } from "../lib/swpc";
import { MODES, getMode, type ModeId } from "../lib/modes";
import { modeIcon } from "../components/ModePicker";

export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "sw", label: "Swahili", native: "Kiswahili" },
];

const STEPS = ["welcome", "language", "mode", "scale", "location", "alerts"] as const;
type Step = (typeof STEPS)[number];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const { settings, setSetting, refreshLocation, locating, place } = useStore();

  const index = STEPS.indexOf(step);
  const go = (s: Step) => {
    tap();
    setStep(s);
  };
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  const back = () => go(STEPS[Math.max(index - 1, 0)]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {step !== "welcome" && <Progress index={index} onBack={back} />}

      {step === "welcome" && <Welcome onNext={next} />}

      {step === "language" && (
        <LanguageStep value={settings.language} onPick={(c) => setSetting("language", c)} onNext={next} />
      )}

      {step === "mode" && (
        <ModeStep
          value={settings.mode}
          onPick={(m) => {
            setSetting("mode", m);
            setSetting("alertThreshold", getMode(m).defaultThreshold);
          }}
          onNext={next}
        />
      )}

      {step === "scale" && <ScaleStep onNext={next} />}

      {step === "location" && (
        <LocationStep
          locating={locating}
          place={place}
          onAllow={async () => {
            const p = await refreshLocation();
            setSetting("useLocation", !!p);
          }}
          onNext={next}
        />
      )}

      {step === "alerts" && (
        <AlertsStep
          placeLabel={place?.label ?? null}
          onAllow={async () => {
            await requestNotificationPermission();
            onDone();
          }}
          onSkip={onDone}
        />
      )}
    </div>
  );
}

/* ---------------- chrome ---------------- */

function Progress({ index, onBack }: { index: number; onBack: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "calc(var(--sat) + 18px) 24px 0",
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--dim)",
          padding: 4,
          cursor: "pointer",
          display: "flex",
        }}
        aria-label="Back"
      >
        <ArrowLeft size={19} />
      </button>
      <div style={{ flex: 1, display: "flex", gap: 5 }}>
        {STEPS.slice(1).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 3,
              background: i < index ? "var(--teal)" : "var(--raised)",
              transition: "background 300ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------- 1 · welcome ---------------- */

function Welcome({ onNext }: { onNext: () => void }) {
  const [kp, setKp] = useState<number | null>(null);

  // Show a real reading straight away — the app proves itself before it asks
  // for anything.
  useEffect(() => {
    fetchKp().then((r) => {
      const rows = r.data ?? [];
      if (rows.length) setKp(rows[rows.length - 1].kp);
    });
  }, []);

  const status = kpToStatus(kp);

  return (
    <div
      className="fade-up"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "calc(var(--sat) + 40px) 28px calc(var(--sab) + 28px)",
        background:
          "radial-gradient(120% 62% at 50% 0%, rgba(45,212,191,0.16) 0%, rgba(167,139,250,0.07) 42%, transparent 74%)",
      }}
    >
      <HaloBadge size={60} />

      <div style={{ flex: 1, minHeight: 28 }} />

      <h1
        className="display"
        style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.1 }}
      >
        The Sun has
        <br />
        storms too.
      </h1>
      <div style={{ width: 86, margin: "20px 0 18px" }}>
        <SpectrumLine height={3} />
      </div>
      <p style={{ color: "var(--mid)", fontSize: 16, lineHeight: 1.62, margin: 0 }}>
        When one reaches Earth, your GPS drifts, radio crackles, and the sky can light up. Halo Guard
        tells you when it's coming — and what, if anything, to do.
      </p>

      {/* live proof that this is real data, not a brochure */}
      <div
        style={{
          marginTop: 30,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderRadius: 14,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          minHeight: 66,
        }}
      >
        {kp == null ? (
          <div className="skeleton" style={{ height: 15, flex: 1 }} />
        ) : (
          <>
            <span className="dot pulse" style={{ background: status.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow">Above you right now</div>
              <div style={{ fontSize: 14, marginTop: 3 }}>
                <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
                <span style={{ color: "var(--dim)" }}> · measured minutes ago</span>
              </div>
            </div>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {kp.toFixed(1)}
            </span>
          </>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <Btn onClick={onNext} icon={ArrowRight}>
          Set up in a minute
        </Btn>
      </div>
    </div>
  );
}

/* ---------------- 2 · language ---------------- */

function LanguageStep({
  value,
  onPick,
  onNext,
}: {
  value: string;
  onPick: (c: string) => void;
  onNext: () => void;
}) {
  return (
    <Body title="What language should we use?" blurb="You can change this later in settings.">
      <div className="scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
        {LANGUAGES.map((l) => {
          const on = value === l.code;
          return (
            <button
              key={l.code}
              onClick={() => {
                tap();
                onPick(l.code);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 12,
                background: on ? "rgba(45,212,191,0.10)" : "var(--panel)",
                border: `1px solid ${on ? "var(--teal)" : "var(--line)"}`,
                cursor: "pointer",
                textAlign: "left",
                color: "var(--hi)",
              }}
            >
              <span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{l.native}</span>
                {l.native !== l.label && (
                  <span style={{ fontSize: 12.5, color: "var(--dim)", marginLeft: 8 }}>{l.label}</span>
                )}
              </span>
              {on && <Check size={17} color="var(--teal)" />}
            </button>
          );
        })}
      </div>
      <Btn onClick={onNext} icon={ArrowRight}>
        Continue
      </Btn>
    </Body>
  );
}

/* ---------------- 3 · what are you using this for ---------------- */

function ModeStep({
  value,
  onPick,
  onNext,
}: {
  value: ModeId;
  onPick: (m: ModeId) => void;
  onNext: () => void;
}) {
  return (
    <Body
      title="What will you use this for?"
      blurb="This decides what we put first and how much detail you get. You can change it whenever you like."
    >
      <div className="scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {MODES.map((m) => {
          const Icon = modeIcon(m.icon);
          const on = value === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                tap();
                onPick(m.id);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 15px",
                borderRadius: 13,
                background: on ? `${m.accent}16` : "var(--panel)",
                border: `1px solid ${on ? m.accent : "var(--line)"}`,
                cursor: "pointer",
                textAlign: "left",
                color: "var(--hi)",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  background: `${m.accent}1f`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={16} color={m.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: "var(--mid)", marginTop: 1 }}>{m.who}</div>
              </div>
              {on && <Check size={16} color={m.accent} style={{ flex: "none" }} />}
            </button>
          );
        })}
      </div>
      <Btn onClick={onNext} icon={ArrowRight}>
        Continue
      </Btn>
    </Body>
  );
}

/* ---------------- 4 · the scale, hands-on ---------------- */

const LEVELS: { kp: number; head: string; body: string }[] = [
  { kp: 2, head: "A normal day", body: "Nothing happening. Your phone, maps and internet all behave exactly as usual. Most days look like this." },
  { kp: 4, head: "A bit restless", body: "You wouldn't notice. Maps might place you a metre or two off, and that's the whole story." },
  { kp: 5, head: "A small storm", body: "Satnav drifts a few metres and long-distance radio gets patchy. Far enough north or south, the sky starts to glow." },
  { kp: 6, head: "A real storm", body: "Worth planning around. Download maps before you travel and charge your things — GPS gets noticeably vague." },
  { kp: 7, head: "A big one", body: "Don't trust satnav for anything precise. Radio drops out. Aurora reaches much further from the poles than usual." },
  { kp: 9, head: "The rare kind", body: "Hours of unreliable GPS and radio, and power flickers are possible. A handful of times per decade." },
];

function ScaleStep({ onNext }: { onNext: () => void }) {
  const [i, setI] = useState(0);
  const level = LEVELS[i];
  const status = kpToStatus(level.kp);

  return (
    <Body
      title="One number, and what it means"
      blurb="Halo Guard boils everything down to a single storm level. Drag to see what each one actually does to you."
    >
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: 20,
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span className="mono" style={{ fontSize: 42, fontWeight: 600, lineHeight: 1 }}>
            {level.kp}
          </span>
          <span style={{ color: status.color, fontWeight: 600, fontSize: 15 }}>{status.label}</span>
        </div>

        <div style={{ margin: "20px 0 10px" }}>
          <SpectrumLine value={level.kp / 9} height={10} />
        </div>

        <input
          type="range"
          min={0}
          max={LEVELS.length - 1}
          step={1}
          value={i}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v !== i) tap();
            setI(v);
          }}
          style={{ width: "100%", accentColor: "#2dd4bf", margin: "2px 0 14px" }}
        />

        <div key={i} className="fade-up">
          <div className="display" style={{ fontWeight: 700, fontSize: 17 }}>
            {level.head}
          </div>
          <p style={{ color: "var(--mid)", fontSize: 14, lineHeight: 1.6, margin: "7px 0 0", minHeight: 66 }}>
            {level.body}
          </p>
        </div>
      </div>

      <p style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.55, margin: "0 0 16px" }}>
        You'll never have to remember any of this — every screen says it in words too.
      </p>

      <div style={{ flex: 1 }} />
      <Btn onClick={onNext} icon={ArrowRight}>
        Got it
      </Btn>
    </Body>
  );
}

/* ---------------- 4 · location ---------------- */

function LocationStep({
  onAllow,
  onNext,
  locating,
  place,
}: {
  onAllow: () => void;
  onNext: () => void;
  locating: boolean;
  place: { lat: number; lon: number; label: string } | null;
}) {
  // Once we know where they are, we can say something true and specific about
  // their location rather than a generic "we use your location" line.
  const kpNeeded = place
    ? Math.max(0, Math.min(Math.ceil((66 - Math.abs(geomagneticLatitude(place.lat, place.lon))) / 2), 10))
    : null;

  return (
    <Body
      title={place ? `You're in ${place.label}` : "Where are you?"}
      blurb={
        place
          ? "Now your forecasts are about the sky above you, not the planet in general."
          : "Storms hit some parts of the world far harder than others. With your location we can tell you what's happening above you specifically."
      }
    >
      {place ? (
        <div
          className="fade-up"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 18,
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Check size={16} color="var(--teal)" />
            <span className="eyebrow">What this tells us</span>
          </div>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62, color: "var(--hi)" }}>
            {kpNeeded != null && kpNeeded > 9
              ? "You're close enough to the equator that the northern lights never reach you — so we'll skip aurora alerts and focus on GPS and radio."
              : `The northern lights become visible from here once the storm level passes about ${kpNeeded}. We'll let you know when that happens.`}
          </p>
        </div>
      ) : (
        <div
          style={{
            background: "var(--panel)",
            border: "1px dashed var(--line-2)",
            borderRadius: 16,
            padding: 18,
            marginBottom: 18,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <MapPin size={18} color="var(--dim)" style={{ flex: "none", marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--mid)" }}>
            Your coordinates stay on this phone. We never upload them, share them or sell them.
          </p>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {place ? (
        <Btn onClick={onNext} icon={ArrowRight}>
          Continue
        </Btn>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn onClick={onAllow} disabled={locating} icon={locating ? undefined : MapPin}>
            {locating ? "Finding you…" : "Use my location"}
          </Btn>
          <button
            onClick={() => {
              tap();
              onNext();
            }}
            style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 13.5, padding: 12, cursor: "pointer" }}
          >
            Skip — show me the global picture
          </button>
        </div>
      )}
    </Body>
  );
}

/* ---------------- 5 · alerts ---------------- */

function AlertsStep({
  onAllow,
  onSkip,
  placeLabel,
}: {
  onAllow: () => void;
  onSkip: () => void;
  placeLabel: string | null;
}) {
  return (
    <Body
      title="This is the whole point"
      blurb="One message, before it matters. Most weeks you'll hear nothing at all."
    >
      {/* a realistic preview of the thing they're being asked to allow */}
      <div
        className="fade-up"
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--line-2)",
          borderRadius: 16,
          padding: 14,
          display: "flex",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <HaloBadge size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Halo Guard</span>
            <span style={{ fontSize: 11, color: "var(--dim)" }}>now</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>Minor storm arriving tonight</div>
          <div style={{ fontSize: 12.5, color: "var(--mid)", marginTop: 2, lineHeight: 1.45 }}>
            {placeLabel ? `Reaching ${placeLabel} around 11pm. ` : "Arriving around 11pm. "}
            Your maps may drift a few metres — and the sky is worth a look.
          </div>
        </div>
      </div>

      <p style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
        You choose how sensitive alerts are, and can set quiet hours, at any time in settings.
      </p>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Btn onClick={onAllow} icon={Bell}>
          Turn on alerts
        </Btn>
        <button
          onClick={() => {
            tap();
            onSkip();
          }}
          style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 13.5, padding: 12, cursor: "pointer" }}
        >
          Not now
        </button>
      </div>
    </Body>
  );
}

/* ---------------- shared layout ---------------- */

function Body({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fade-up"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "26px 24px calc(var(--sab) + 24px)",
      }}
    >
      <h2
        className="display"
        style={{ fontSize: 25, fontWeight: 700, margin: 0, letterSpacing: "-0.015em", lineHeight: 1.2 }}
      >
        {title}
      </h2>
      <p style={{ color: "var(--mid)", fontSize: 14.5, lineHeight: 1.6, margin: "10px 0 22px" }}>{blurb}</p>
      {children}
    </div>
  );
}
