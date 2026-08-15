/**
 * The in-app action registry.
 *
 * Gemini is given these as callable tools, so "turn on aurora alerts" or
 * "switch to scientific mode and take me to my device" actually changes the
 * app rather than just describing how to do it. Handlers are registered at
 * runtime by App.tsx, which owns the navigation and settings state.
 */

export type ActionResult = {
  ok: boolean;
  /** Shown to the user as a small confirmation under the assistant's reply. */
  summary: string;
  /** Extra data handed back to the model so it can talk about the result. */
  data?: Record<string, unknown>;
};

export type ActionName =
  | "navigate"
  | "set_reading_mode"
  | "set_alert_threshold"
  | "set_notification"
  | "set_quiet_hours"
  | "set_language"
  | "set_units"
  | "set_theme"
  | "update_location"
  | "get_conditions"
  | "preview_alert"
  | "find_device"
  | "device_readings"
  | "calibrate_device"
  | "identify_device"
  | "disconnect_device"
  | "open_lesson"
  | "sign_out";

type Handler = (args: any) => Promise<ActionResult> | ActionResult;

const registry = new Map<ActionName, Handler>();

export function registerAction(name: ActionName, fn: Handler) {
  registry.set(name, fn);
}

export function registerActions(map: Partial<Record<ActionName, Handler>>) {
  (Object.entries(map) as [ActionName, Handler][]).forEach(([k, v]) => registry.set(k, v));
}

export async function runAction(name: string, args: any): Promise<ActionResult> {
  const fn = registry.get(name as ActionName);
  if (!fn) return { ok: false, summary: `I can't do "${name}" from here.` };
  try {
    return await fn(args ?? {});
  } catch (e) {
    return { ok: false, summary: (e as Error).message || "That didn't work." };
  }
}

/* ---------------- tool declarations sent to Gemini ---------------- */

const S = (description: string) => ({ type: "STRING", description });
const N = (description: string) => ({ type: "NUMBER", description });
const B = (description: string) => ({ type: "BOOLEAN", description });

export const TOOL_DECLARATIONS = [
  {
    name: "navigate",
    description:
      "Open a screen in the app. Use this whenever the user asks to go somewhere, see something, or when showing them a screen answers their question better than words.",
    parameters: {
      type: "OBJECT",
      properties: {
        screen: {
          type: "STRING",
          description: "Which screen to open.",
          enum: [
            "now",
            "forecast",
            "events",
            "learn",
            "assistant",
            "device",
            "shop",
            "settings",
            "profile",
          ],
        },
      },
      required: ["screen"],
    },
  },
  {
    name: "set_reading_mode",
    description:
      "Switch the app's mode. Each one changes which readings lead the dashboard, how sensitive alerts are, and how technical the explanations get. Pick the one matching what the user actually does — everyday for the general public, aurora for chasers and photographers, radio for HF and amateur operators, aviation for pilots and aircrew, precision for surveying, drones and RTK farming, marine for sailing, grid for infrastructure and preparedness, scientific for the raw physics.",
    parameters: {
      type: "OBJECT",
      properties: {
        mode: {
          type: "STRING",
          enum: ["everyday", "aurora", "radio", "aviation", "precision", "marine", "grid", "scientific"],
          description: "Which mode to switch to.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "set_alert_threshold",
    description:
      "Set how strong a geomagnetic storm must be before the app sends a notification, on the Kp scale of 0 to 9. Lower means more alerts.",
    parameters: {
      type: "OBJECT",
      properties: { kp: N("Kp threshold between 1 and 9.") },
      required: ["kp"],
    },
  },
  {
    name: "set_notification",
    description: "Turn a specific kind of alert on or off.",
    parameters: {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", enum: ["storms", "aurora", "flares"], description: "Alert category." },
        enabled: B("true to turn on, false to turn off."),
      },
      required: ["kind", "enabled"],
    },
  },
  {
    name: "set_quiet_hours",
    description:
      "Set hours when the app must not buzz the phone. Pass nulls to clear quiet hours entirely.",
    parameters: {
      type: "OBJECT",
      properties: {
        from: N("Hour quiet time starts, 0-23. Omit to clear."),
        to: N("Hour quiet time ends, 0-23. Omit to clear."),
      },
    },
  },
  {
    name: "set_language",
    description: "Change the app language.",
    parameters: {
      type: "OBJECT",
      properties: { code: S("Language code such as en, ar, es, fr, zh, ja, de, pt, it.") },
      required: ["code"],
    },
  },
  {
    name: "set_theme",
    description:
      "Switch the app between light and dark appearance, or have it follow the phone's own setting. Use when the user mentions brightness, glare, reading it outdoors, or night vision.",
    parameters: {
      type: "OBJECT",
      properties: {
        theme: {
          type: "STRING",
          enum: ["light", "dark", "system"],
          description: "light, dark, or system to follow the phone.",
        },
      },
      required: ["theme"],
    },
  },
  {
    name: "set_units",
    description: "Switch between metric and imperial units.",
    parameters: {
      type: "OBJECT",
      properties: { units: { type: "STRING", enum: ["metric", "imperial"] } },
      required: ["units"],
    },
  },
  {
    name: "update_location",
    description:
      "Read the phone's GPS to refresh the user's location, so forecasts and aurora chances are for where they actually are.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "get_conditions",
    description:
      "Read the current live space weather measurements the app is showing: Kp index, solar wind, flare class, aurora chance and the user's location. Call this before answering anything about what is happening right now.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "preview_alert",
    description: "Send the user a sample notification so they can see what a real alert looks like.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "find_device",
    description:
      "Scan for nearby Halo hardware nodes over Bluetooth and connect to one if found. Use when the user wants to pair, set up or reconnect their device.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "device_readings",
    description:
      "Read the latest measurements coming from the user's connected Halo node, including its GPS fix and battery.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "calibrate_device",
    description:
      "Tell the connected node to re-zero its magnetometer. The device must be still and away from metal.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "identify_device",
    description: "Make the connected node flash its light so the user can find it.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "disconnect_device",
    description: "Disconnect the currently connected Halo node.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "open_lesson",
    description: "Open a specific lesson in the learning section by its title or number.",
    parameters: {
      type: "OBJECT",
      properties: { query: S("Lesson title or topic the user asked about.") },
      required: ["query"],
    },
  },
  {
    name: "sign_out",
    description: "Sign the user out of their account. Confirm with them before calling this.",
    parameters: { type: "OBJECT", properties: {} },
  },
];
