export type Screen =
  | "now"
  | "forecast"
  | "events"
  | "learn"
  | "lesson"
  | "assistant"
  | "device"
  | "shop"
  | "settings"
  | "profile"
  | "dev";

/** Screens reachable from the bottom bar, in order. */
export const TABS = ["now", "forecast", "assistant", "learn", "device"] as const;

export type Tab = (typeof TABS)[number];
