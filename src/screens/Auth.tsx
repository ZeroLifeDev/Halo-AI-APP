import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, ArrowLeft, Calendar, Lock, Mail, Phone, User } from "lucide-react";
import { HaloBadge } from "../components/HaloMark";
import { Btn, Field, SpectrumLine, tap } from "../components/ui";
import {
  authErrorMessage,
  googleErrorMessage,
  googleSignInAvailable,
  resetPassword,
  signIn,
  signInWithGoogle,
  signUp,
} from "../lib/firebase";

type Mode = "choose" | "signin" | "signup" | "reset";

export function Auth() {
  const [mode, setMode] = useState<Mode>("choose");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", dob: "" });
  const [busy, setBusy] = useState<"google" | "form" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => {
    googleSignInAvailable().then(setGoogleOn);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const emailOk = /\S+@\S+\.\S+/.test(form.email);
  const canSubmit =
    mode === "reset"
      ? emailOk
      : mode === "signin"
        ? emailOk && form.password.length >= 6
        : form.name.trim().length > 1 && emailOk && form.password.length >= 6;

  async function google() {
    if (busy) return;
    setBusy("google");
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const msg = googleErrorMessage(e);
      if (msg) setError(msg);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy("form");
    setError(null);
    try {
      if (mode === "signin") await signIn(form.email.trim(), form.password);
      else if (mode === "signup")
        await signUp(form.email.trim(), form.password, form.name.trim(), {
          phone: form.phone,
          dob: form.dob,
        });
      else {
        await resetPassword(form.email.trim());
        setSent(true);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  /* ---------------- the opening choice ---------------- */

  if (mode === "choose") {
    return (
      <Shell>
        <div style={{ flex: 1 }} />

        <HaloBadge size={56} />
        <div className="eyebrow" style={{ marginTop: 24 }}>Halo Guard</div>
        <h1
          className="display"
          style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", margin: "8px 0 0", lineHeight: 1.15 }}
        >
          Know before
          <br />
          the storm hits
        </h1>
        <div style={{ width: 78, margin: "18px 0 16px" }}>
          <SpectrumLine height={3} />
        </div>
        <p style={{ color: "var(--mid)", fontSize: 15, lineHeight: 1.6, margin: "0 0 34px" }}>
          Sign in so your alerts and settings follow you, on any phone.
        </p>

        {error && <ErrorNote text={error} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {googleOn && (
            <button
              onClick={() => {
                tap();
                google();
              }}
              disabled={busy !== null}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: 14,
                border: "none",
                background: "#ffffff",
                color: "#1f1f1f",
                fontFamily: "var(--display)",
                fontWeight: 600,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 11,
                cursor: "pointer",
                opacity: busy === "google" ? 0.6 : 1,
              }}
            >
              <GoogleMark />
              {busy === "google" ? "Signing in…" : "Continue with Google"}
            </button>
          )}

          <Btn onClick={() => setMode("signup")} icon={ArrowRight}>
            Create an account
          </Btn>

          <button
            onClick={() => {
              tap();
              setMode("signin");
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--mid)",
              fontSize: 14,
              padding: 14,
              cursor: "pointer",
            }}
          >
            I already have an account — <strong style={{ color: "var(--teal)" }}>Sign in</strong>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: "var(--dim)", fontSize: 11.5, marginTop: 10 }}>
          <Lock size={12} /> Encrypted, and never sold.
        </div>
      </Shell>
    );
  }

  /* ---------------- email forms ---------------- */

  const title =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  const blurb =
    mode === "signin"
      ? "Sign in with the email you used before."
      : mode === "signup"
        ? "Just an email and a password — the rest is optional."
        : "We'll email you a link to set a new one.";

  return (
    <Shell>
      <button
        onClick={() => {
          tap();
          setMode("choose");
          setError(null);
          setSent(false);
        }}
        style={{
          background: "none",
          border: "none",
          color: "var(--dim)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 0 20px",
          fontSize: 13.5,
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="display" style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
        {title}
      </h1>
      <p style={{ color: "var(--mid)", fontSize: 14, margin: "0 0 22px", lineHeight: 1.55 }}>{blurb}</p>

      {sent && mode === "reset" ? (
        <div
          style={{
            background: "rgba(45,212,191,0.08)",
            border: "1px solid rgba(45,212,191,0.35)",
            borderRadius: 14,
            padding: 16,
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Check your inbox — we've sent a reset link to <strong>{form.email}</strong>.
        </div>
      ) : (
        <>
          {mode === "signup" && (
            <Field
              label="Your name"
              icon={User}
              placeholder="Jordan Okafor"
              value={form.name}
              onChange={set("name")}
              autoCapitalize="words"
            />
          )}

          <Field
            label="Email"
            icon={Mail}
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@email.com"
            value={form.email}
            onChange={set("email")}
          />

          {mode !== "reset" && (
            <Field
              label="Password"
              icon={Lock}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="At least 6 characters"
              value={form.password}
              onChange={set("password")}
              hint={mode === "signup" ? "Six characters or more is all we ask." : undefined}
            />
          )}

          {mode === "signup" && (
            <details style={{ margin: "2px 0 16px" }}>
              <summary style={{ color: "var(--dim)", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
                Add a phone number or birthday (optional)
              </summary>
              <div style={{ marginTop: 12 }}>
                <Field
                  label="Phone number"
                  icon={Phone}
                  type="tel"
                  inputMode="tel"
                  placeholder="+20 10 000 0000"
                  value={form.phone}
                  onChange={set("phone")}
                />
                <Field label="Date of birth" icon={Calendar} type="date" value={form.dob} onChange={set("dob")} />
              </div>
            </details>
          )}

          {error && <ErrorNote text={error} />}

          <div style={{ marginTop: 6 }}>
            <Btn onClick={submit} disabled={!canSubmit || busy !== null} icon={busy ? undefined : ArrowRight}>
              {busy === "form"
                ? "Just a moment…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </Btn>
          </div>

          {mode === "signin" && (
            <button
              onClick={() => {
                tap();
                setMode("reset");
                setError(null);
              }}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                color: "var(--mid)",
                fontSize: 13.5,
                padding: 16,
                cursor: "pointer",
              }}
            >
              Forgot your password?
            </button>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="scroll"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "calc(var(--sat) + 32px) 26px calc(var(--sab) + 28px)",
        background: "radial-gradient(110% 50% at 50% 0%, rgba(45,212,191,0.10) 0%, transparent 62%)",
      }}
    >
      {children}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div
      className="fade-up"
      style={{
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        background: "rgba(255,93,108,0.08)",
        border: "1px solid rgba(255,93,108,0.35)",
        borderRadius: 12,
        padding: "11px 13px",
        margin: "0 0 16px",
      }}
    >
      <AlertCircle size={16} color="var(--red)" style={{ flex: "none", marginTop: 1 }} />
      <div style={{ fontSize: 13, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.1-3.8 6.6-9.5 6.6-16.4z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.6 15.4 46 24 46z"
      />
      <path fill="#FBBC05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4A22 22 0 0 0 2 24c0 3.6.9 6.9 2.4 9.9l7.3-5.7z" />
      <path
        fill="#EA4335"
        d="M24 9.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 2.9 29.9 1 24 1 15.4 1 8 5.4 4.4 12.1l7.3 5.7c1.7-5.2 6.6-9.3 12.3-9.3z"
      />
    </svg>
  );
}
