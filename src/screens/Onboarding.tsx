import { useState } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  Compass,
  Globe,
  MapPin,
  Radio,
  Shield,
  Sun,
  Zap,
} from "lucide-react";
import { Btn, Card, SpectrumLine, tap } from "../components/ui";
import { useStore } from "../lib/store";
import { requestNotificationPermission } from "../lib/notify";

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

type Step = "welcome" | "language" | "what" | "location" | "alerts";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const { settings, setSetting, refreshLocation, locating, place } = useStore();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {step === "welcome" && <Welcome onNext={() => setStep("language")} />}
      {step === "language" && (
        <LanguagePicker
          value={settings.language}
          onPick={(c) => setSetting("language", c)}
          onNext={() => setStep("what")}
        />
      )}
      {step === "what" && <WhatItDoes onNext={() => setStep("location")} />}
      {step === "location" && (
        <LocationStep
          locating={locating}
          placeLabel={place?.label ?? null}
          onAllow={async () => {
            const p = await refreshLocation();
            setSetting("useLocation", !!p);
            setStep("alerts");
          }}
          onSkip={() => {
            setSetting("useLocation", false);
            setStep("alerts");
          }}
        />
      )}
      {step === "alerts" && (
        <AlertsStep
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

/* ---------------- steps ---------------- */

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div
      className="fade-up"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "32px 28px calc(var(--sab) + 32px)",
        background:
          "radial-gradient(120% 70% at 50% 0%, rgba(45,212,191,0.14) 0%, rgba(167,139,250,0.06) 40%, transparent 72%)",
      }}
    >
      <div
        className="pulse"
        style={{
          width: 76,
          height: 76,
          borderRadius: 22,
          background: "linear-gradient(135deg, var(--teal), var(--violet))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
        }}
      >
        <Sun size={36} color="var(--void)" />
      </div>

      <div className="eyebrow">Real-time telemetry</div>
      <h1
        className="display"
        style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", margin: "8px 0 0", lineHeight: 1.05 }}
      >
        Halo Guard
      </h1>
      <div style={{ width: 96, margin: "16px 0 20px" }}>
        <SpectrumLine height={3} />
      </div>
      <p style={{ color: "var(--mid)", fontSize: 16, lineHeight: 1.55, margin: 0 }}>
        The Sun has storms too. When one is heading our way, your GPS, phone signal and power can
        wobble.
        <br />
        <br />
        We'll warn you before it happens — in plain English, with simple steps to follow.
      </p>

      <div style={{ flex: 1, minHeight: 24 }} />
      <Btn onClick={onNext} icon={ArrowRight}>
        Get started
      </Btn>
    </div>
  );
}

function LanguagePicker({
  value,
  onPick,
  onNext,
}: {
  value: string;
  onPick: (c: string) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "calc(var(--sat) + 28px) 24px calc(var(--sab) + 24px)" }}>
      <Globe size={26} color="var(--teal)" />
      <h2 className="display" style={{ fontSize: 25, fontWeight: 700, margin: "14px 0 4px" }}>
        Choose your language
      </h2>
      <p style={{ color: "var(--mid)", fontSize: 14, margin: 0 }}>You can change this at any time.</p>

      <div className="scroll" style={{ flex: 1, margin: "20px 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
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
    </div>
  );
}

function WhatItDoes({ onNext }: { onNext: () => void }) {
  const items = [
    {
      icon: Sun,
      tint: "var(--amber)",
      title: "We watch the Sun for you",
      body: "Live readings from NOAA's space weather satellites, updated every few minutes.",
    },
    {
      icon: Bell,
      tint: "var(--teal)",
      title: "You get told before it matters",
      body: "A clear alert when something is likely to affect where you are — not a stream of noise.",
    },
    {
      icon: Zap,
      tint: "var(--violet)",
      title: "You know what to do",
      body: "Every warning comes with simple steps. No science degree required.",
    },
    {
      icon: Radio,
      tint: "var(--red)",
      title: "Add your own sensor",
      body: "Pair a Halo node to measure what's happening right where you live.",
    },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "calc(var(--sat) + 28px) 24px calc(var(--sab) + 24px)" }}>
      <Shield size={26} color="var(--teal)" />
      <h2 className="display" style={{ fontSize: 25, fontWeight: 700, margin: "14px 0 4px" }}>
        What Halo Guard does
      </h2>
      <p style={{ color: "var(--mid)", fontSize: 14, margin: 0 }}>Four things, and that's it.</p>

      <div className="scroll" style={{ flex: 1, margin: "22px 0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((it, i) => (
          <Card key={it.title} style={{ animationDelay: `${i * 60}ms` }}>
            <div style={{ display: "flex", gap: 13 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  flex: "none",
                  borderRadius: 11,
                  background: `${it.tint}1f`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <it.icon size={19} color={it.tint} />
              </div>
              <div>
                <div className="display" style={{ fontWeight: 600, fontSize: 15 }}>
                  {it.title}
                </div>
                <div style={{ color: "var(--mid)", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{it.body}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Btn onClick={onNext} icon={ArrowRight}>
        Continue
      </Btn>
    </div>
  );
}

function LocationStep({
  onAllow,
  onSkip,
  locating,
  placeLabel,
}: {
  onAllow: () => void;
  onSkip: () => void;
  locating: boolean;
  placeLabel: string | null;
}) {
  return (
    <PermissionStep
      icon={MapPin}
      title="Where are you?"
      body="Solar storms affect some parts of the world more than others. With your location we can tell you what's happening above you specifically — including whether you might see the northern lights tonight."
      note="Your location stays on your phone. We never share or sell it."
      primaryLabel={locating ? "Finding you…" : placeLabel ? `Found you: ${placeLabel}` : "Use my location"}
      onPrimary={onAllow}
      onSkip={onSkip}
      skipLabel="Not now"
      busy={locating}
    />
  );
}

function AlertsStep({ onAllow, onSkip }: { onAllow: () => void; onSkip: () => void }) {
  return (
    <PermissionStep
      icon={Bell}
      title="Get warned in time"
      body="We'll send you a message before a solar storm reaches you, with plain steps to protect your devices and your connection. That's the whole point of the app — most days you'll hear nothing at all."
      note="You choose how sensitive alerts are, and can set quiet hours later."
      primaryLabel="Turn on alerts"
      onPrimary={onAllow}
      onSkip={onSkip}
      skipLabel="Maybe later"
    />
  );
}

function PermissionStep({
  icon: Icon,
  title,
  body,
  note,
  primaryLabel,
  onPrimary,
  onSkip,
  skipLabel,
  busy,
}: {
  icon: typeof Bell;
  title: string;
  body: string;
  note: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip: () => void;
  skipLabel: string;
  busy?: boolean;
}) {
  return (
    <div
      className="fade-up"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "32px 28px calc(var(--sab) + 28px)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 26,
          background: "rgba(45,212,191,0.12)",
          border: "1px solid rgba(45,212,191,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 26px",
        }}
      >
        <Icon size={38} color="var(--teal)" />
      </div>
      <h2 className="display" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
        {title}
      </h2>
      <p style={{ color: "var(--mid)", fontSize: 14.5, lineHeight: 1.6, margin: "12px 0 0" }}>{body}</p>
      <div style={{ margin: "22px auto 0", maxWidth: 300 }}>
        <div className="chip" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--body)", fontSize: 11.5, lineHeight: 1.4, padding: "8px 12px", height: "auto", display: "block", color: "var(--dim)" }}>
          {note}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 20 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={onPrimary} icon={busy ? undefined : Compass} disabled={busy}>
          {primaryLabel}
        </Btn>
        <button
          onClick={() => {
            tap();
            onSkip();
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--dim)",
            fontSize: 13.5,
            padding: 12,
            cursor: "pointer",
          }}
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
}
