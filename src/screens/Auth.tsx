import { useState } from "react";
import { AlertCircle, ArrowRight, Calendar, Lock, Mail, Phone, Sun, User } from "lucide-react";
import { Btn, Field, SpectrumLine, tap } from "../components/ui";
import { authErrorMessage, resetPassword, signIn, signUp } from "../lib/firebase";

type Mode = "signin" | "signup" | "reset";

export function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", dob: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSubmit =
    mode === "reset"
      ? /\S+@\S+\.\S+/.test(form.email)
      : mode === "signin"
        ? /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 6
        : form.name.trim().length > 1 && /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 6;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn(form.email.trim(), form.password);
      } else if (mode === "signup") {
        await signUp(form.email.trim(), form.password, form.name.trim(), {
          phone: form.phone,
          dob: form.dob,
        });
      } else {
        await resetPassword(form.email.trim());
        setSent(true);
      }
      // On success the auth listener in App swaps this screen out.
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="scroll"
      style={{
        height: "100%",
        padding: "calc(var(--sat) + 36px) 26px calc(var(--sab) + 28px)",
        background:
          "radial-gradient(110% 55% at 50% 0%, rgba(45,212,191,0.12) 0%, transparent 65%)",
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 16,
          background: "linear-gradient(135deg, var(--teal), var(--violet))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sun size={26} color="var(--void)" />
      </div>

      <h1 className="display" style={{ fontSize: 27, fontWeight: 700, margin: "20px 0 6px", letterSpacing: "-0.01em" }}>
        {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
      </h1>
      <p style={{ color: "var(--mid)", fontSize: 14, margin: "0 0 6px", lineHeight: 1.55 }}>
        {mode === "signin"
          ? "Sign in to get alerts and keep your settings across devices."
          : mode === "signup"
            ? "So we know where and how to reach you when a storm is coming."
            : "We'll email you a link to set a new password."}
      </p>
      <div style={{ width: 72, margin: "10px 0 24px" }}>
        <SpectrumLine height={2} />
      </div>

      {sent && mode === "reset" ? (
        <div
          style={{
            background: "rgba(45,212,191,0.08)",
            border: "1px solid rgba(45,212,191,0.35)",
            borderRadius: 14,
            padding: 16,
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--hi)",
          }}
        >
          Check your inbox — we've sent a reset link to <strong>{form.email}</strong>.
        </div>
      ) : (
        <>
          {mode === "signup" && (
            <Field label="Your name" icon={User} placeholder="Jordan Okafor" value={form.name} onChange={set("name")} autoCapitalize="words" />
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
            />
          )}

          {mode === "signup" && (
            <>
              <Field
                label="Phone number (optional)"
                icon={Phone}
                type="tel"
                inputMode="tel"
                placeholder="+20 10 000 0000"
                value={form.phone}
                onChange={set("phone")}
              />
              <Field label="Date of birth (optional)" icon={Calendar} type="date" value={form.dob} onChange={set("dob")} />
            </>
          )}
        </>
      )}

      {error && (
        <div
          style={{
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
            background: "rgba(255,93,108,0.08)",
            border: "1px solid rgba(255,93,108,0.35)",
            borderRadius: 12,
            padding: "11px 13px",
            margin: "4px 0 16px",
          }}
        >
          <AlertCircle size={16} color="var(--red)" style={{ flex: "none", marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--hi)", lineHeight: 1.45 }}>{error}</div>
        </div>
      )}

      {!(sent && mode === "reset") && (
        <div style={{ marginTop: 8 }}>
          <Btn onClick={submit} disabled={!canSubmit || busy} icon={busy ? undefined : ArrowRight}>
            {busy
              ? "Just a moment…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </Btn>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 18 }}>
        {mode === "signin" && (
          <>
            <LinkBtn onClick={() => { setMode("signup"); setError(null); }}>
              New here? <strong style={{ color: "var(--teal)" }}>Create an account</strong>
            </LinkBtn>
            <LinkBtn onClick={() => { setMode("reset"); setError(null); }}>Forgot your password?</LinkBtn>
          </>
        )}
        {mode === "signup" && (
          <LinkBtn onClick={() => { setMode("signin"); setError(null); }}>
            Already have an account? <strong style={{ color: "var(--teal)" }}>Sign in</strong>
          </LinkBtn>
        )}
        {mode === "reset" && (
          <LinkBtn onClick={() => { setMode("signin"); setError(null); setSent(false); }}>Back to sign in</LinkBtn>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          color: "var(--dim)",
          fontSize: 11.5,
          marginTop: 26,
        }}
      >
        <Lock size={12} /> Your data is encrypted and never sold.
      </div>
    </div>
  );
}

function LinkBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={() => {
        tap();
        onClick();
      }}
      style={{
        background: "none",
        border: "none",
        color: "var(--mid)",
        fontSize: 13.5,
        padding: "8px 4px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
