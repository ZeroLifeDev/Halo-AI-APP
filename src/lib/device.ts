/**
 * Halo Sense / Halo Prime — ESP32 node over Bluetooth Low Energy.
 *
 * The firmware in `firmware/halo-node` advertises the service below. Nothing
 * here fabricates readings: if no node is connected the UI says so, and every
 * number shown comes off the characteristic notifications.
 *
 * GATT layout (see firmware/halo-node/README.md for the matching Arduino code):
 *
 *   Service  6e400001-b5a3-f393-e0a9-e50e24dcca9e
 *     ├ 6e400002-…  TELEMETRY   notify   packed struct, little-endian
 *     ├ 6e400003-…  GPS         notify   packed struct, little-endian
 *     ├ 6e400004-…  STATUS      read     battery %, firmware, uptime
 *     └ 6e400005-…  COMMAND     write    1=calibrate 2=identify 3=sleep
 */
import { BleClient, numbersToDataView, type BleDevice } from "@capacitor-community/bluetooth-le";
import { Preferences } from "@capacitor/preferences";

export const HALO_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_TELEMETRY = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_GPS = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_STATUS = "6e400004-b5a3-f393-e0a9-e50e24dcca9e";
export const CHAR_COMMAND = "6e400005-b5a3-f393-e0a9-e50e24dcca9e";

export type Telemetry = {
  /** local magnetic field magnitude, microtesla (magnetometer) */
  magnitudeUT: number;
  /** per-axis magnetic field, microtesla */
  bx: number;
  by: number;
  bz: number;
  /** broadband radiation counts per minute (Geiger / PIN diode) */
  cpm: number;
  /** board temperature, °C */
  tempC: number;
  /** rate of change of the local field — the "storm twitch" indicator */
  deltaUT: number;
  at: number;
};

export type NodeGps = {
  lat: number;
  lon: number;
  /** metres above sea level */
  altitude: number;
  /** satellites currently locked */
  satellites: number;
  /** horizontal dilution of precision — lower is better */
  hdop: number;
  fix: boolean;
  at: number;
};

export type NodeStatus = {
  battery: number;
  firmware: string;
  uptimeSec: number;
};

export type NodeState = {
  device: BleDevice | null;
  connected: boolean;
  telemetry: Telemetry | null;
  gps: NodeGps | null;
  status: NodeStatus | null;
  rssi: number | null;
};

const PAIRED_KEY = "halo:node";

let listeners: ((s: NodeState) => void)[] = [];
let state: NodeState = {
  device: null,
  connected: false,
  telemetry: null,
  gps: null,
  status: null,
  rssi: null,
};

function emit(patch: Partial<NodeState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribeNode(cb: (s: NodeState) => void) {
  listeners.push(cb);
  cb(state);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function nodeState() {
  return state;
}

export async function initBle() {
  await BleClient.initialize({ androidNeverForLocation: false });
}

/** Scans for nearby Halo nodes. Returns each device once, as it is found. */
export async function scanForNodes(
  onFound: (d: BleDevice, rssi: number) => void,
  seconds = 8,
): Promise<void> {
  await initBle();
  const seen = new Set<string>();
  await BleClient.requestLEScan({ services: [HALO_SERVICE] }, (result) => {
    if (seen.has(result.device.deviceId)) return;
    seen.add(result.device.deviceId);
    onFound(result.device, result.rssi ?? -100);
  });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  await BleClient.stopLEScan();
}

/* ---------- packet decoding (little-endian, matches the firmware structs) ---------- */

function decodeTelemetry(v: DataView): Telemetry {
  return {
    bx: v.getFloat32(0, true),
    by: v.getFloat32(4, true),
    bz: v.getFloat32(8, true),
    magnitudeUT: v.getFloat32(12, true),
    deltaUT: v.getFloat32(16, true),
    cpm: v.getUint16(20, true),
    tempC: v.getInt16(22, true) / 100,
    at: Date.now(),
  };
}

function decodeGps(v: DataView): NodeGps {
  return {
    lat: v.getFloat64(0, true),
    lon: v.getFloat64(8, true),
    altitude: v.getFloat32(16, true),
    hdop: v.getFloat32(20, true),
    satellites: v.getUint8(24),
    fix: v.getUint8(25) === 1,
    at: Date.now(),
  };
}

function decodeStatus(v: DataView): NodeStatus {
  return {
    battery: v.getUint8(0),
    firmware: `${v.getUint8(1)}.${v.getUint8(2)}`,
    uptimeSec: v.getUint32(3, true),
  };
}

/* ---------- connection ---------- */

export async function connectNode(deviceId: string, name?: string) {
  await initBle();
  await BleClient.connect(deviceId, () => emit({ connected: false }));

  emit({ device: { deviceId, name: name ?? "Halo node" }, connected: true });
  await Preferences.set({ key: PAIRED_KEY, value: JSON.stringify({ deviceId, name }) });

  await BleClient.startNotifications(deviceId, HALO_SERVICE, CHAR_TELEMETRY, (v) => {
    if (v.byteLength >= 24) emit({ telemetry: decodeTelemetry(v) });
  });
  await BleClient.startNotifications(deviceId, HALO_SERVICE, CHAR_GPS, (v) => {
    if (v.byteLength >= 26) emit({ gps: decodeGps(v) });
  });

  try {
    const s = await BleClient.read(deviceId, HALO_SERVICE, CHAR_STATUS);
    if (s.byteLength >= 7) emit({ status: decodeStatus(s) });
  } catch {
    /* status is optional on older firmware */
  }

  pollRssi(deviceId);
}

async function pollRssi(deviceId: string) {
  while (state.connected && state.device?.deviceId === deviceId) {
    try {
      const rssi = await BleClient.getConnectedDevices([HALO_SERVICE]).then(() => null);
      emit({ rssi });
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export async function disconnectNode() {
  const id = state.device?.deviceId;
  if (!id) return;
  try {
    await BleClient.disconnect(id);
  } finally {
    lastPushedLevel = null;
    lastPushedAlert = null;
    emit({ connected: false, telemetry: null, gps: null, status: null });
  }
}

export async function forgetNode() {
  await disconnectNode();
  await Preferences.remove({ key: PAIRED_KEY });
  emit({ device: null });
}

/** Reconnects to the node the user paired previously, on app start. */
export async function reconnectSavedNode(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: PAIRED_KEY });
    if (!value) return false;
    const { deviceId, name } = JSON.parse(value);
    await connectNode(deviceId, name);
    return true;
  } catch {
    return false;
  }
}

export async function savedNode(): Promise<{ deviceId: string; name?: string } | null> {
  const { value } = await Preferences.get({ key: PAIRED_KEY });
  return value ? JSON.parse(value) : null;
}

export const CMD_CALIBRATE = 1;
export const CMD_IDENTIFY = 2;
export const CMD_SLEEP = 3;
export const CMD_SET_LEVEL = 4;
export const CMD_SET_ALERT = 5;

export async function sendCommand(cmd: number, arg?: number) {
  const id = state.device?.deviceId;
  if (!id || !state.connected) throw new Error("No node connected.");
  const bytes = arg === undefined ? [cmd] : [cmd, arg];
  await BleClient.write(id, HALO_SERVICE, CHAR_COMMAND, numbersToDataView(bytes));
}

/**
 * Mirrors the planetary storm level onto the node's three LEDs, so the device
 * on the shelf shows the same picture as the app: red for quiet, yellow for
 * unsettled, blue once it is actually storming.
 */
export async function pushLevelToNode(kp: number | null) {
  if (!state.connected || kp == null) return;

  const level = kp >= 5 ? 2 : kp >= 4 ? 1 : 0;
  const alerting = kp >= 5;

  // Only talk to the node when something actually changed.
  if (level === lastPushedLevel && alerting === lastPushedAlert) return;
  lastPushedLevel = level;
  lastPushedAlert = alerting;

  try {
    await sendCommand(CMD_SET_LEVEL, level);
    await sendCommand(CMD_SET_ALERT, alerting ? 1 : 0);
  } catch {
    /* node went away mid-write; the next refresh retries */
  }
}

let lastPushedLevel: number | null = null;
let lastPushedAlert: boolean | null = null;

/**
 * Compares what the node measures locally against the planetary Kp index.
 * A local disturbance well above the global picture usually means something
 * nearby (a motor, a magnet, a phone) rather than the Sun.
 */
export function interpretLocalField(t: Telemetry | null, kp: number | null) {
  if (!t) return null;
  const quiet = Math.abs(t.deltaUT) < 0.3;
  const disturbed = Math.abs(t.deltaUT) >= 1.5;
  const globallyCalm = kp != null && kp < 4;
  if (disturbed && globallyCalm)
    return {
      label: "Local interference",
      detail:
        "Your node is picking up a changing magnetic field, but space is calm — something electrical or metal is probably close by. Try moving it away from appliances.",
      color: "#ff9f43",
    };
  if (disturbed)
    return {
      label: "Storm signature",
      detail: "Your node is measuring the same disturbance the global network sees. This is the storm, locally confirmed.",
      color: "#ff5d6c",
    };
  if (quiet)
    return { label: "Steady", detail: "The magnetic field where you are is holding steady.", color: "#2dd4bf" };
  return { label: "Slight movement", detail: "Small changes in the local field — normal day-to-day variation.", color: "#ffd166" };
}
