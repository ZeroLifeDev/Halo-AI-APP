import { useEffect, useRef, useState } from "react";
import { Check, Send, Sparkles, Wand2 } from "lucide-react";
import { ScreenHeader, tap } from "../components/ui";
import { askHalo, type ChatMessage } from "../lib/gemini";
import { useStore } from "../lib/store";
import type { ActionResult } from "../lib/actions";

const OPENERS = [
  "What's happening right now?",
  "Will my GPS work today?",
  "Can I see the northern lights?",
  "Turn on aurora alerts",
  "Explain solar flares simply",
  "Set up my Halo device",
];

export function Assistant() {
  const { settings } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      text: "Hi, I'm Halo. Ask me anything about what the Sun is doing, or just tell me what you want changed — I can adjust your alerts, open screens and talk to your device for you.",
      at: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveActions, setLiveActions] = useState<ActionResult[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, liveActions]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    tap();
    const history = messages;
    setMessages((m) => [...m, { role: "user", text: trimmed, at: Date.now() }]);
    setInput("");
    setBusy(true);
    setLiveActions([]);

    try {
      const { text: reply, actions } = await askHalo(history, trimmed, {
        onAction: (r) => setLiveActions((a) => [...a, r]),
        mode: settings.mode,
      });
      setMessages((m) => [...m, { role: "model", text: reply, actions, at: Date.now() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "model", text: (e as Error).message, at: Date.now() }]);
    } finally {
      setBusy(false);
      setLiveActions([]);
    }
  }

  const showOpeners = messages.length === 1 && !busy;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", paddingBottom: 82 }}>
      <ScreenHeader eyebrow="Your assistant" title="Ask Halo" right={<Sparkles size={20} color="var(--violet)" />} />

      <div className="scroll" style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "86%" }}>
            <div
              className="fade-up"
              style={{
                padding: "12px 14px",
                borderRadius: 16,
                borderBottomRightRadius: m.role === "user" ? 5 : 16,
                borderBottomLeftRadius: m.role === "user" ? 16 : 5,
                background:
                  m.role === "user" ? "linear-gradient(135deg,var(--teal),var(--teal-soft))" : "var(--panel)",
                border: m.role === "user" ? "none" : "1px solid var(--line)",
                color: m.role === "user" ? "var(--void)" : "var(--hi)",
                fontSize: 14.5,
                lineHeight: 1.58,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
            {m.actions?.filter((a) => a.ok).map((a, j) => (
              <ActionChip key={j} label={a.summary} />
            ))}
          </div>
        ))}

        {liveActions.map((a, i) => (
          <div key={`live-${i}`} style={{ alignSelf: "flex-start" }}>
            <ActionChip label={a.summary} />
          </div>
        ))}

        {busy && (
          <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, color: "var(--dim)" }}>
            <Sparkles size={13} className="spin" />
            <span className="mono" style={{ fontSize: 11.5 }}>
              Halo is thinking…
            </span>
          </div>
        )}

        {showOpeners && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {OPENERS.map((o) => (
              <button
                key={o}
                onClick={() => send(o)}
                style={{
                  padding: "9px 13px",
                  borderRadius: 999,
                  border: "1px solid var(--line-2)",
                  background: "var(--panel)",
                  color: "var(--mid)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {o}
              </button>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div style={{ padding: "10px 20px 4px", display: "flex", gap: 9, alignItems: "flex-end" }}>
        <div className="field-box" style={{ flex: 1, padding: "11px 14px" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(input);
            }}
            placeholder="Ask, or tell me what to change…"
            enterKeyHint="send"
          />
        </div>
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          style={{
            width: 46,
            height: 46,
            flex: "none",
            borderRadius: 13,
            border: "none",
            background: busy || !input.trim() ? "var(--raised)" : "linear-gradient(135deg,var(--teal),var(--teal-soft))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: busy || !input.trim() ? "default" : "pointer",
          }}
        >
          <Send size={18} color={busy || !input.trim() ? "var(--dim)" : "var(--void)"} />
        </button>
      </div>
    </div>
  );
}

/** Small confirmation shown when Gemini actually changed something in the app. */
function ActionChip({ label }: { label: string }) {
  return (
    <div
      className="fade-up"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        marginTop: 6,
        padding: "7px 11px",
        borderRadius: 999,
        background: "rgba(45,212,191,0.10)",
        border: "1px solid rgba(45,212,191,0.32)",
        color: "var(--teal)",
        fontSize: 12,
      }}
    >
      <Wand2 size={12} style={{ flex: "none" }} />
      {label}
      <Check size={12} style={{ flex: "none" }} />
    </div>
  );
}
