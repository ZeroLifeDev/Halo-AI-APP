# Halo Guard

Solar weather warnings in plain English, for Android.

The Sun has storms. When one reaches Earth it can push your GPS off by metres,
make long-distance radio drop out, and — rarely — flicker the power grid. Halo
Guard watches for that, tells you in ordinary words what it means for you, and
tells you what to do about it.

---

## What's in the box

| Area | What it does |
| --- | --- |
| **Onboarding** | Welcome, language, what the app does, then location and alert permissions — each explained before it's asked for. |
| **Sign in** | Firebase email/password: create an account, sign in, reset a forgotten password. Settings follow the account across devices. |
| **Now** | Live storm level, what it means for your GPS and radio, solar wind speed, strongest recent flare, aurora chance overhead. |
| **Forecast** | The next three days, plus whether the northern lights can actually reach your latitude. |
| **Event log** | Every official NOAA watch, warning and alert — each with a plain-English translation next to the original text. |
| **Learn** | Fourteen written lessons with quizzes, from "what is solar weather" to building your own storm plan. |
| **Ask Halo** | Gemini, wired to the app's own controls — it can change your settings and drive your hardware, not just answer. |
| **My device** | Pair an ESP32 Halo node over Bluetooth for local magnetic-field, radiation and GPS readings. |
| **Settings** | Alert sensitivity, alert types, quiet hours, language, units, location, sign out. |

## No invented data

Every number the app displays comes from a real source:

- **NOAA SWPC** — planetary Kp (observed and forecast), DSCOVR solar wind and
  magnetic field, GOES X-ray flux, the OVATION aurora model, and the official
  alerts feed. See `src/lib/swpc.ts`.
- **Your phone** — GPS position via Capacitor Geolocation.
- **Your Halo node** — magnetometer, radiation counts and its own GPS fix, over BLE.

When a feed can't be reached, the last real reading is served from the on-device
cache and clearly labelled as such. Nothing is ever fabricated to fill a gap.

## Gemini can actually do things

The assistant isn't a chat box bolted on the side. It's given the app's real
action registry (`src/lib/actions.ts`), so:

> "turn on aurora alerts and only bug me about big storms"

changes both settings and confirms it. It can also navigate screens, refresh
your location from GPS, read current conditions before answering, send a preview
notification, open a lesson, and scan for, connect to, calibrate or flash your
ESP32 node. Every tool call surfaces in the chat as a small confirmation chip.

---

## Building the APK

### On Windows, with everything installed to `D:\`

Nothing lands on `C:` — the JDK, Android SDK, Gradle home, npm cache and temp
directory all live under `D:\halo-toolchain`.

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\build-windows.ps1          # first run: installs the toolchain, then builds
.\build-windows.ps1 -BuildOnly   # later runs
```

The finished APK is copied to `D:\halo-toolchain\halo-guard.apk`. Install it
with `adb install -r D:\halo-toolchain\halo-guard.apk`, or copy it to the phone
and tap it (you'll need to allow installing from unknown sources).

Change the location with `-Root D:\somewhere-else`.

### In CI

`.github/workflows/android.yml` builds on every push and uploads the APK as a
workflow artifact called **halo-guard-apk**. Open the run in the Actions tab and
download it from the summary page.

### Manually, anywhere

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Requires JDK 21 and the Android SDK (platform 36, build-tools 36).

---

## Push notifications

Storm alerts raised by the app itself (local notifications) work out of the box.

For server-sent pushes, add a `google-services.json` for the Android app
`app.haloguard.mobile` — download it from the Firebase console under Project
settings → Your apps → Add app → Android — and drop it in `android/app/`. The
app registers its FCM token against the signed-in user in Firestore
(`users/{uid}.fcmTokens`) as soon as the file is present. Without it, everything
else still works.

---

## The hardware

`firmware/halo-node/halo-node.ino` is the ESP32 firmware. It advertises a BLE
service the app knows how to read:

| Characteristic | Direction | Contents |
| --- | --- | --- |
| `…0002` telemetry | notify | magnetic field XYZ + magnitude + drift, radiation cpm, temperature |
| `…0003` GPS | notify | latitude, longitude, altitude, HDOP, satellite count, fix flag |
| `…0004` status | read | battery %, firmware version, uptime |
| `…0005` command | write | `1` calibrate · `2` flash the light · `3` sleep |

Wiring, parts and library list are documented at the top of the sketch. The
packed structs there are the contract with `src/lib/device.ts` — change one, change
both.

---

## Project layout

```
src/
  lib/
    swpc.ts         live NOAA feeds, caching, and plain-language interpretation
    conditions.tsx  one shared live view of conditions, refreshed every 5 min
    gemini.ts       Gemini with tool-calling
    actions.ts      the registry of things Gemini is allowed to do
    device.ts       BLE client for the ESP32 node
    firebase.ts     auth + profile + settings sync
    notify.ts       local alerts, thresholds, quiet hours, FCM registration
    store.tsx       settings, location, lesson progress
  screens/          one file per screen
  content/lessons.ts  the written lessons and quizzes
  components/ui.tsx   design-system primitives
firmware/halo-node/   ESP32 sketch
```

Design tokens live in `src/theme.css` — the "Aetheric Command" palette, the
three typefaces, and the Spectrum Line gradient used as both the Kp gauge and
the rule under every header.
