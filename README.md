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
| **Onboarding** | A live reading on the welcome screen, language, a hands-on drag-through of the storm scale, then location and alerts — each earning its permission by showing what it buys you. |
| **Sign in** | Google, or email and password: create an account, sign in, reset a forgotten password. Settings follow the account across devices. |
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

### In CI — the quickest way to get it on a phone

`.github/workflows/android.yml` builds on every push and publishes the APK two ways:

- **As a release** at [Releases](../../releases), tagged `build-<run number>`.
  This is the one to use: open that page on the phone, tap `halo-guard.apk`,
  and allow installing from this source if Android asks.
- **As a workflow artifact** called `halo-guard-apk`, on the run's summary page
  in the Actions tab (needs you to be signed in to GitHub).

Without signing secrets the APK is debug-signed, which sideloads and runs
normally. To get a properly signed release build, add these repository secrets
and the workflow switches automatically:

| Secret | What it is |
| --- | --- |
| `KEYSTORE_BASE64` | your `.jks` keystore, base64-encoded |
| `KEYSTORE_PASSWORD` | the keystore password |
| `KEY_ALIAS` | the key alias inside it |
| `KEY_PASSWORD` | that key's password |

Create one with:

```bash
keytool -genkeypair -v -keystore halo-release.jks -keyalg RSA \
        -keysize 2048 -validity 10000 -alias halo
base64 -w0 halo-release.jks   # paste into KEYSTORE_BASE64
```

Keep the keystore file itself somewhere safe and out of the repository — losing
it means you can never update an app already installed under that signature.

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

## Firebase Android config

Everything in the app works without it **except** Google sign-in and server-sent
push. Both need `android/app/google-services.json`, which only you can generate.

This is deliberate and load-bearing: the Firebase Android SDKs build a
`FirebaseAuth` / `FirebaseMessaging` instance during Capacitor plugin `load()`,
at app startup. Without the config file that throws
`Default FirebaseApp is not initialized in this process` on the main thread and
the process dies before the first screen paints. So neither native plugin is
installed by default, and the app reaches those APIs through
`registerPlugin()` at runtime — absent plugin means a rejected promise, not a
crash.

### Turning on Google sign-in

1. Firebase console → Project settings → Your apps → **Add app → Android**.
   Package name: `app.haloguard.mobile`.
2. Add your signing certificate's **SHA-1** on that same screen. For the CI
   debug builds:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
           -alias androiddebugkey -storepass android -keypass android
   ```
   Use your release keystore's SHA-1 instead once you sign properly. Google
   sign-in fails with `DEVELOPER_ERROR` if the fingerprint doesn't match the key
   that signed the APK — this step is the one people skip.
3. Enable **Authentication → Sign-in method → Google**.
4. Download `google-services.json` into `android/app/`.
5. Install the native plugin and rebuild:
   ```bash
   npm i @capacitor-firebase/authentication
   npm run build && npx cap sync android
   ```

The Google button appears automatically: the Vite build sets
`VITE_GOOGLE_SIGNIN` from whether `android/app/google-services.json` exists, and
the sign-in screen hides the button when it doesn't, rather than offering
something that cannot succeed.

### Push notifications

Storm alerts are raised by the app itself as local notifications and work out of
the box — the app checks conditions on every refresh and on resume. Server-sent
push (`@capacitor/push-notifications`) needs the same `google-services.json`
plus a token-fanout backend; it is not wired up.

---

## The hardware

`firmware/halo-node/halo-node.ino` is the ESP32 firmware.

### Wiring

| Part | ESP32 pin | Notes |
| --- | --- | --- |
| GPS TX | **GPIO17** (RX) | module transmits, ESP32 listens |
| GPS RX | **GPIO16** (TX) | ESP32 transmits, module listens |
| GPS VCC / GND | 3V3 / GND | some modules want 5V — check yours |
| Red LED — *low* | **GPIO25** | through a 220–330Ω resistor to GND |
| Yellow LED — *medium* | **GPIO26** | " |
| Blue LED — *high* | **GPIO27** | " |
| Magnetometer | GPIO21 SDA, GPIO22 SCL | QMC5883L or HMC5883L |
| Geiger pulse (optional) | GPIO4 | falling edge per count |
| Battery sense (optional) | GPIO34 | via a 2:1 divider |

UART2 runs at 9600 baud, the NEO-series default.

### What the LEDs are saying

The three LEDs are the node's entire user interface, so every state is
distinct at a glance:

| State | Animation |
| --- | --- |
| Boot | single sweep red → yellow → blue, then a shared fade |
| Self test | all three flash once — every channel works |
| Advertising | slow blue breath, waiting for the phone |
| Connecting | quick blue double-blink |
| Connected | sweep up, all three flash, then settle |
| Searching for GPS | yellow-led chase along the row |
| GPS locked | three fast yellow blinks |
| Steady | the current level's LED breathing gently |
| Alert | that LED pulsing hard, twice a second |
| Calibrating | red ↔ blue ping-pong |
| Identify | all three strobe for five seconds |
| Low battery | red double-blink every 4s, over anything else |
| Sleeping | slow fade to dark |

Animations run from a non-blocking scheduler with gamma-corrected PWM — the
main loop never blocks for a light show, so BLE and GPS keep running
throughout.

### BLE service

| Characteristic | Direction | Contents |
| --- | --- | --- |
| `…0002` telemetry | notify | magnetic field XYZ + magnitude + drift, radiation cpm, temperature |
| `…0003` GPS | notify | latitude, longitude, altitude, HDOP, satellite count, fix flag |
| `…0004` status | read | battery %, firmware version, uptime |
| `…0005` command | write | see below |

Commands are one byte, some with an argument byte:

| Byte | Command | Argument |
| --- | --- | --- |
| `1` | calibrate the magnetometer | — |
| `2` | flash the LEDs to identify | — |
| `3` | deep sleep | — |
| `4` | set displayed level | `0` low · `1` medium · `2` high |
| `5` | set alert pulse | `0` off · `1` on |

The app pushes `4` and `5` on every refresh, so a node sitting on a shelf
shows the same picture as the phone: red while things are quiet, yellow when
unsettled, blue and pulsing once it is actually storming.

The packed structs in the sketch are the contract with `src/lib/device.ts` —
change one, change both.

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
