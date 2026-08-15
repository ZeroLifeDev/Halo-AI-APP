/**
 * Gemini, wired to the app's own action registry so the assistant can change
 * settings, open screens and talk to the hardware — not just answer questions.
 */
import { TOOL_DECLARATIONS, runAction, type ActionResult } from "./actions";
import { getMode } from "./modes";

const API_KEY = "AQ.Ab8RN6JbE8kVTqSYG7vUwj_ahpn-BAKSU318jzCOHgFYdv1axQ";
/**
 * Tried in order. Google retires models without warning — 2.5-flash started
 * returning "no longer available to new users" — so a failure that looks like
 * a missing model falls through to the next one instead of dead-ending.
 */
const MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];

const endpointFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Remembered for the rest of the session once one works. */
let workingModel: string | null = null;

export function activeModel(): string {
  return workingModel ?? MODELS[0];
}

/** True when the failure means "try a different model" rather than "give up". */
function isModelUnavailable(status: number, body: string): boolean {
  if (status === 404) return true;
  return status === 400 && /no longer available|not found|not supported|unsupported/i.test(body);
}

/**
 * POSTs to the first model that answers, remembering which one worked.
 */
async function callGemini(body: unknown, signal?: AbortSignal): Promise<any> {
  const order = workingModel ? [workingModel, ...MODELS.filter((m) => m !== workingModel)] : MODELS;
  let lastStatus = 0;
  let lastDetail = "";

  for (const model of order) {
    const res = await fetch(`${endpointFor(model)}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      workingModel = model;
      return res.json();
    }

    lastStatus = res.status;
    lastDetail = await res.text().catch(() => "");
    if (!isModelUnavailable(res.status, lastDetail)) break;
  }

  throw new Error(errorMessage(lastStatus, lastDetail));
}

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
  | { functionCall: { name: string; args: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } };

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
  opts: { onAction?: (r: ActionResult) => void; signal?: AbortSignal; mode?: string } = {},
): Promise<{ text: string; actions: ActionResult[] }> {
  const mode = getMode(opts.mode);
  const systemPrompt = `${SYSTEM_PROMPT}\n\nThe user is in "${mode.label}" mode — ${mode.who}. ${mode.assistantBrief}`;
  const contents: Content[] = history
    .filter((m) => m.text)
    .slice(-12)
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text: userText }] });

  const performed: ActionResult[] = [];

  // The model may chain tools; cap the loop so a bad response can't spin.
  for (let hop = 0; hop < 5; hop++) {
    const data = await callGemini(
      {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
      },
      opts.signal,
    );
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

    // Echo the model's turn back verbatim. Gemini 3.x attaches a
    // thoughtSignature to each functionCall and rejects the follow-up if it
    // is stripped, so push the original parts rather than rebuilt ones.
    contents.push({ role: "model", parts: candidate.content.parts });
    const responseParts: Part[] = [];
    for (const call of calls) {
      const result = await runAction(call.functionCall.name, call.functionCall.args);
      performed.push(result);
      opts.onAction?.(result);
      responseParts.push({
        functionResponse: {
          // 3.x pairs calls to responses by id; harmless when absent.
          ...(call.functionCall.id ? { id: call.functionCall.id } : {}),
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
  mode: string;
}): Promise<string | null> {
  const mode = getMode(input.mode);
  const ask = `The user is in "${mode.label}" mode — ${mode.who}. ${mode.assistantBrief} In at most three sentences, tell them what these readings mean for what they actually do.`;

  try {
    const data = await callGemini({
        systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${mode.assistantBrief}` }] },
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
    });
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("").trim();
    return text || null;
  } catch {
    return null;
  }
}
