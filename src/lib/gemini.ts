/**
 * Gemini, wired to the app's own action registry so the assistant can change
 * settings, open screens and talk to the hardware — not just answer questions.
 */
import { TOOL_DECLARATIONS, runAction, type ActionResult } from "./actions";

const API_KEY = "AQ.Ab8RN6JbE8kVTqSYG7vUwj_ahpn-BAKSU318jzCOHgFYdv1axQ";
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type ChatRole = "user" | "model";

export type ChatMessage = {
  role: ChatRole;
  text: string;
  /** Actions the assistant carried out while producing this reply. */
  actions?: ActionResult[];
  at: number;
};

type Part =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type Content = { role: "user" | "model"; parts: Part[] };

const SYSTEM_PROMPT = `You are Halo, the assistant inside the Halo Guard app. Halo Guard warns ordinary people when solar weather (activity from the Sun) might affect their GPS, phone signal, radio or power.

How to talk:
- Plain, warm, everyday English. Short sentences. No jargon unless the user clearly wants it.
- Never say "Kp index", "geomagnetic", "coronal mass ejection" or similar without immediately explaining it in ordinary words.
- Be brief: usually 2-4 sentences. Lead with the answer.
- Never invent measurements. If you need current numbers, call get_conditions first and use exactly what it returns. If a value is missing, say you can't read it right now.

What you can do:
- You have tools that genuinely control this app. If the user asks for something you can do, DO IT with a tool rather than explaining where the button is.
- After acting, confirm in one short sentence what changed.
- Ask before anything destructive or surprising (signing out, disconnecting hardware).
- If the user asks about a screen, you may navigate them there while you answer.

You are talking to someone who may know nothing about space weather. Your job is to make them feel informed and safe, never alarmed.`;

/** One turn: may loop through several tool calls before the model replies. */
export async function askHalo(
  history: ChatMessage[],
  userText: string,
  opts: { onAction?: (r: ActionResult) => void; signal?: AbortSignal } = {},
): Promise<{ text: string; actions: ActionResult[] }> {
  const contents: Content[] = history
    .filter((m) => m.text)
    .slice(-12)
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text: userText }] });

  const performed: ActionResult[] = [];

  // The model may chain tools; cap the loop so a bad response can't spin.
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
        safetySettings: [],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(errorMessage(res.status, detail));
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts: Part[] = candidate?.content?.parts ?? [];

    const calls = parts.filter((p): p is Extract<Part, { functionCall: any }> => "functionCall" in p);

    if (calls.length === 0) {
      const text = parts
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("")
        .trim();
      return {
        text: text || "I'm not sure how to answer that — could you rephrase it?",
        actions: performed,
      };
    }

    // Run every requested tool, then feed the results back for the next hop.
    contents.push({ role: "model", parts: calls });
    const responseParts: Part[] = [];
    for (const call of calls) {
      const result = await runAction(call.functionCall.name, call.functionCall.args);
      performed.push(result);
      opts.onAction?.(result);
      responseParts.push({
        functionResponse: {
          name: call.functionCall.name,
          response: { ok: result.ok, summary: result.summary, ...(result.data ?? {}) },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    text: "I did what I could, but I got stuck working out the rest. Could you try asking a different way?",
    actions: performed,
  };
}

function errorMessage(status: number, detail: string): string {
  if (status === 429) return "I'm getting a lot of questions right now — give me a minute and try again.";
  if (status === 403) return "I can't reach my language service (the API key was rejected).";
  if (status >= 500) return "My language service is having trouble. Try again shortly.";
  try {
    const j = JSON.parse(detail);
    if (j?.error?.message) return `I couldn't answer: ${j.error.message}`;
  } catch {
    /* fall through */
  }
  return "I couldn't reach my language service. Check your connection and try again.";
}

/**
 * A one-shot rewrite used on the dashboard: turns the live measurements into
 * a sentence tailored to this user's situation. Falls back to the built-in
 * plain-language summary if the model is unreachable.
 */
export async function explainConditions(input: {
  kp: number | null;
  flareClass: string;
  windSpeed: number | null;
  auroraChance: number | null;
  place: string | null;
  mode: "simple" | "scientific";
}): Promise<string | null> {
  const ask =
    input.mode === "simple"
      ? "In at most two short sentences of everyday English, tell the user what this means for them today and whether they need to do anything. No numbers unless they matter."
      : "In at most three sentences, give a technical readout an amateur radio operator or space weather enthusiast would want, using the real values.";

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Current live readings:
Kp index: ${input.kp ?? "unavailable"}
Strongest recent solar flare: ${input.flareClass}
Solar wind speed: ${input.windSpeed ? `${input.windSpeed.toFixed(0)} km/s` : "unavailable"}
Chance of aurora overhead: ${input.auroraChance != null ? `${input.auroraChance}%` : "unavailable"}
User's location: ${input.place ?? "unknown"}

${ask}`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 220 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("").trim();
    return text || null;
  } catch {
    return null;
  }
}
