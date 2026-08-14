import { useEffect, useState } from "react";
import {
  Battery,
  Bluetooth,
  BluetoothConnected,
  Compass,
  Crosshair,
  Magnet,
  Radio,
  RefreshCw,
  Satellite,
  Thermometer,
  Trash2,
  Zap,
  Globe2,
  MapPin,
  Sparkles,
} from "lucide-react";
import type { BleDevice } from "@capacitor-community/bluetooth-le";
import { Btn, Card, Row, ScreenHeader, Sparkline, SpectrumLine, StatTile, timeAgo } from "../components/ui";
import {
  CMD_CALIBRATE,
  CMD_IDENTIFY,
  connectNode,
  disconnectNode,
  forgetNode,
  interpretLocalField,
  scanForNodes,
  sendCommand,
  subscribeNode,
  type NodeState,
} from "../lib/device";
import { useConditions } from "../lib/conditions";
import { useStore } from "../lib/store";
import { accuracyNote, estimateLocal } from "../lib/estimate";

export function Device() {
  const c = useConditions();
  const { place, refreshLocation, locating } = useStore();
  const [node, setNode] = useState<NodeState | null>(null);
  const [found, setFound] = useState<{ device: BleDevice; rssi: number }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => subscribeNode(setNode), []);

  // Keep a rolling trace of the local field so the chart shows real movement.
  useEffect(() => {
    if (node?.telemetry) {
      setHistory((h) => [...h, node.telemetry!.magnitudeUT].slice(-60));
    }
  }, [node?.telemetry?.at]);

  async function scan() {
    setError(null);
    setFound([]);
    setScanning(true);
    try {
      await scanForNodes((device, rssi) => setFound((f) => [...f, { device, rssi }]));
    } catch (e) {
      setError(bleError(e));
    } finally {
      setScanning(false);
    }
  }

  async function connect(d: BleDevice) {
    setError(null);
    setBusy("Connecting…");
    try {
      await connectNode(d.deviceId, d.name);
      setFound([]);
    } catch (e) {
      setError(bleError(e));
    } finally {
      setBusy(null);
    }
  }

  async function command(cmd: number, label: string) {
    setBusy(label);
    setError(null);
    try {
      await sendCommand(cmd);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTimeout(() => setBusy(null), 1200);
    }
  }

  const connected = !!node?.connected;
  const reading = node?.telemetry ?? null;
  const gps = node?.gps ?? null;
  const local = interpretLocalField(reading, c.kp);

  return (
    <div className="scroll" style={{ height: "100%", paddingBottom: 96 }}>
      <ScreenHeader
        eyebrow={connected ? "Connected" : "Not connected"}
        title="My device"
        right={
          connected ? (
            <BluetoothConnected size={20} color="var(--teal)" />
          ) : (
            <Bluetooth size={20} color="var(--dim)" />
          )
        }
      />

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {error && (
          <Card style={{ borderColor: "rgba(255,93,108,0.4)", background: "rgba(255,93,108,0.06)" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{error}</div>
          </Card>
        )}

        {!connected ? (
          <>
            {found.length === 0 && !scanning && (
              <>
                <LocalEstimateCard
                  place={place}
                  kp={c.kp}
                  locating={locating}
                  onLocate={refreshLocation}
                />

                <Card>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        flex: "none",
                        borderRadius: 11,
                        background: "rgba(45,212,191,0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Radio size={17} color="var(--teal)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="display" style={{ fontWeight: 700, fontSize: 15 }}>
                        Add a Halo node
                      </div>
                      <div style={{ fontSize: 13, color: "var(--mid)", marginTop: 5, lineHeight: 1.55 }}>
                        A node replaces the estimate above with a real measurement of the magnetic
                        field and radiation where you are, plus its own GPS fix.
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 15 }}>
                    <Btn onClick={scan} icon={Bluetooth}>
                      Search for my device
                    </Btn>
                  </div>
                </Card>
              </>
            )}

            {scanning && (
              <Card style={{ textAlign: "center", padding: 28 }}>
                <Bluetooth size={30} color="var(--teal)" className="pulse" style={{ marginBottom: 14 }} />
                <div className="display" style={{ fontWeight: 600, fontSize: 15 }}>
                  Looking for your device…
                </div>
                <div style={{ fontSize: 13, color: "var(--mid)", marginTop: 6, lineHeight: 1.5 }}>
                  Make sure it's switched on and within a few metres.
                </div>
              </Card>
            )}

            {found.map(({ device, rssi }) => (
              <Row
                key={device.deviceId}
                icon={Radio}
                title={device.name ?? "Halo node"}
                detail={`${signalWords(rssi)} · ${device.deviceId.slice(0, 8)}`}
                onClick={() => connect(device)}
                right={
                  <span className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>
                    {busy ? "…" : "CONNECT"}
                  </span>
                }
              />
            ))}

            {found.length > 0 && !scanning && (
              <Btn variant="quiet" onClick={scan} icon={RefreshCw}>
                Search again
              </Btn>
            )}
          </>
        ) : (
          <>
            {/* live local reading */}
            <Card priority>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span className="chip">
                  <span className="dot" style={{ background: local?.color ?? "var(--teal)" }} />
                  {node?.device?.name ?? "Halo node"}
                </span>
                {node?.status && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--mid)", fontSize: 12 }}>
                    <Battery size={14} color={node.status.battery < 20 ? "var(--red)" : "var(--teal)"} />
                    {node.status.battery}%
                  </span>
                )}
              </div>

              {reading ? (
                <>
                  <div style={{ textAlign: "center", padding: "18px 0 4px" }}>
                    <div className="mono" style={{ fontSize: 42, fontWeight: 600, lineHeight: 1 }}>
                      {reading.magnitudeUT.toFixed(1)}
                    </div>
                    <div className="eyebrow" style={{ marginTop: 8 }}>
                      microtesla · local magnetic field
                    </div>
                  </div>

                  {history.length > 2 && (
                    <div style={{ marginTop: 12 }}>
                      <Sparkline points={history} color={local?.color ?? "var(--teal)"} height={48} />
                    </div>
                  )}

                  {local && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ color: local.color, fontWeight: 600, fontSize: 14 }}>{local.label}</div>
                      <div style={{ fontSize: 13, color: "var(--mid)", marginTop: 5, lineHeight: 1.55 }}>
                        {local.detail}
                      </div>
                    </div>
                  )}
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--dim)", marginTop: 12, textAlign: "center" }}>
                    UPDATED {timeAgo(reading.at).toUpperCase()}
                  </div>
                </>
              ) : (
                <div style={{ padding: "26px 0", textAlign: "center", color: "var(--mid)", fontSize: 13.5 }}>
                  Connected — waiting for the first reading…
                </div>
              )}
            </Card>

            {reading && (
              <div style={{ display: "flex", gap: 12 }}>
                <StatTile
                  icon={Zap}
                  label="Radiation count"
                  value={`${reading.cpm} cpm`}
                  status={reading.cpm > 60 ? "Elevated" : "Normal"}
                  statusColor={reading.cpm > 60 ? "var(--amber)" : "var(--teal)"}
                />
                <StatTile icon={Thermometer} label="Board temperature" value={`${reading.tempC.toFixed(1)} °C`} />
              </div>
            )}

            {/* GPS from the node */}
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Satellite size={15} color={gps?.fix ? "var(--teal)" : "var(--dim)"} />
                <span className="eyebrow">Device GPS</span>
              </div>
              {gps?.fix ? (
                <>
                  <div className="mono" style={{ fontSize: 15, letterSpacing: "0.03em" }}>
                    {gps.lat.toFixed(5)}°, {gps.lon.toFixed(5)}°
                  </div>
                  <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
                    <Metric label="Satellites" value={String(gps.satellites)} />
                    <Metric label="Altitude" value={`${gps.altitude.toFixed(0)} m`} />
                    <Metric label="Precision" value={hdopWords(gps.hdop)} />
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13.5, color: "var(--mid)", lineHeight: 1.55 }}>
                  {gps
                    ? `Searching for satellites — ${gps.satellites} found so far. This works best near a window or outdoors.`
                    : "No GPS data yet. Give the device a minute with a clear view of the sky."}
                </div>
              )}
            </Card>

            {/* controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Row
                icon={Magnet}
                title="Calibrate the sensor"
                detail="Re-zero the magnetometer. Keep the device still and away from metal."
                onClick={() => command(CMD_CALIBRATE, "Calibrating…")}
                right={<span className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>{busy === "Calibrating…" ? "…" : "RUN"}</span>}
              />
              <Row
                icon={Crosshair}
                title="Find my device"
                detail="Makes the light flash so you can spot it"
                tint="var(--violet)"
                onClick={() => command(CMD_IDENTIFY, "Flashing…")}
                right={<span className="mono" style={{ fontSize: 11, color: "var(--violet)" }}>{busy === "Flashing…" ? "…" : "FLASH"}</span>}
              />
              <Row
                icon={Compass}
                title="Compare with the global picture"
                detail={
                  c.kp != null
                    ? `Planet-wide level is ${c.kp.toFixed(1)} right now`
                    : "Global reading unavailable"
                }
                tint="var(--amber)"
              />
              <Row
                icon={Trash2}
                title="Disconnect"
                detail="Forget this device on your phone"
                tint="var(--red)"
                onClick={async () => {
                  await disconnectNode();
                  await forgetNode();
                }}
              />
            </div>

            {node?.status && (
              <div className="mono" style={{ fontSize: 10.5, color: "var(--dim)", textAlign: "center" }}>
                FIRMWARE {node.status.firmware} · UP {Math.floor(node.status.uptimeSec / 3600)}H
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function signalWords(rssi: number): string {
  if (rssi > -60) return "Very close";
  if (rssi > -75) return "Nearby";
  return "Far away";
}

function hdopWords(hdop: number): string {
  if (hdop <= 1) return "Excellent";
  if (hdop <= 2) return "Good";
  if (hdop <= 5) return "Fair";
  return "Poor";
}

function bleError(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  if (/permission/i.test(m)) return "Halo Guard needs Bluetooth permission to find your device. You can grant it in your phone's settings.";
  if (/enabled|disabled|off/i.test(m)) return "Bluetooth is switched off. Turn it on and try again.";
  if (/location/i.test(m)) return "Android needs location switched on to scan for Bluetooth devices. Turn it on and try again.";
  return "Couldn't search for devices. Check Bluetooth is on and try again.";
}

/**
 * What we can say about conditions where the user is standing without any
 * hardware — derived from their GPS position and the global readings, and
 * labelled as an estimate so it is never mistaken for a measurement.
 */
function LocalEstimateCard({
  place,
  kp,
  locating,
  onLocate,
}: {
  place: { lat: number; lon: number; label: string } | null;
  kp: number | null;
  locating: boolean;
  onLocate: () => void;
}) {
  if (!place) {
    return (
      <Card priority>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 12 }}>
          <MapPin size={15} color="var(--violet)" />
          <span className="eyebrow">Estimate from your phone</span>
        </div>
        <div style={{ fontSize: 14, color: "var(--mid)", lineHeight: 1.6, marginBottom: 15 }}>
          Even without a Halo node we can work out what's happening where you are — turn on location
          and we'll use your phone's GPS.
        </div>
        <Btn onClick={onLocate} disabled={locating} icon={locating ? undefined : MapPin}>
          {locating ? "Finding you…" : "Use my location"}
        </Btn>
      </Card>
    );
  }

  const est = estimateLocal(place.lat, place.lon, kp);

  return (
    <Card priority>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 4,
          marginBottom: 14,
        }}
      >
        <span className="chip">
          <Sparkles size={11} style={{ marginRight: 1 }} />
          Estimated
        </span>
        <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{place.label}</span>
      </div>

      <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
        <div className="mono" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }}>
          {est.fieldUT.toFixed(1)}
        </div>
        <div className="eyebrow" style={{ marginTop: 8 }}>
          microtesla · earth's field here
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 20, flexWrap: "wrap" }}>
        <Metric label="Magnetic latitude" value={`${est.magneticLatitude.toFixed(1)}°`} />
        <Metric label="GPS error now" value={`± ${est.gpsErrorM.toFixed(0)} m`} />
        <Metric
          label="Aurora needs"
          value={est.auroraThreshold == null ? "Out of reach" : `Level ${est.auroraThreshold}`}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 7 }}>How exposed you are</div>
        <SpectrumLine value={est.exposure} height={8} />
      </div>

      <div style={{ fontSize: 13.5, color: "var(--hi)", marginTop: 16, lineHeight: 1.6 }}>
        {est.summary}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--line)",
          color: "var(--dim)",
          fontSize: 11.5,
          lineHeight: 1.5,
        }}
      >
        <Globe2 size={13} style={{ flex: "none", marginTop: 1 }} />
        {accuracyNote(true)}
      </div>
    </Card>
  );
}
