/*
 * Halo Node — ESP32 firmware for Halo Guard
 * ==========================================================================
 * Measures the local magnetic field, streams it to the Halo Guard app over
 * Bluetooth LE, and shows what it is doing on three LEDs.
 *
 * There is deliberately no GPS module. Position comes from the phone, which
 * has a far better receiver, an assisted almanac and no cold-start wait — a
 * bare NEO-6M next to a laptop indoors will often never see a satellite at
 * all. The app pairs its own fix with this node's readings.
 *
 * ------------------------------ WIRING ------------------------------------
 *
 *   Status LEDs — each through its own 220Ω–330Ω resistor to GND
 *     GPIO25  ──[R]──>  RED     LED   "low"
 *     GPIO26  ──[R]──>  YELLOW  LED   "medium"
 *     GPIO27  ──[R]──>  BLUE    LED   "high"
 *
 *   Magnetometer (QMC5883L / HMC5883L), I2C
 *     GPIO21 SDA, GPIO22 SCL, 3V3, GND
 *
 *   Optional — OFF by default, switch on in the configuration block below
 *     GPIO4   Geiger tube pulse output (falling edge per count)
 *     GPIO34  Battery sense, through a 2:1 divider
 *
 *   Only enable those once the part is physically fitted. A floating analog
 *   pin reads noise, which the node would otherwise interpret as a flat
 *   battery and blink the low-battery warning forever.
 *
 * ------------------------------ LED LANGUAGE ------------------------------
 *
 * The three LEDs are the whole user interface, so every state looks distinct
 * even from across a room:
 *
 *   Boot            a single sweep red → yellow → blue, then all fade out
 *   Self test       all three flash together — every channel is alive
 *   Advertising     slow blue breath — waiting for the phone
 *   Connecting      quick blue double-blink
 *   Connected       sweep up, all three flash together, then settle
 *   Level display   the LED for the current level, breathing gently
 *   Alert           the level LED pulses hard, twice a second
 *   Calibrating     red↔blue ping-pong for the duration
 *   Identify        all three strobe for five seconds
 *   Low battery     red double-blink every few seconds, over anything else
 *   Sleeping        a slow fade to dark on all three
 *
 * Animations are driven from a non-blocking scheduler — nothing here calls
 * delay() in the main loop, so BLE never stalls for a light show.
 * Commands from the phone are queued by the BLE callback and executed from
 * loop() for the same reason: the callback runs on the Bluetooth task, and
 * blocking it risks a watchdog reset.
 *
 * Note on temperature: the original ESP32 has no usable internal sensor, so
 * the telemetry packet reports 0 °C there. Wire a real sensor and fill it in
 * readTemperatureCx100() if you need it.
 *
 * ------------------------------ LIBRARIES ---------------------------------
 *   ESP32 BLE Arduino   (bundled with the Espressif ESP32 board package)
 *   QMC5883LCompass     by MPrograms
 *
 * Board: "ESP32 Dev Module". Packet layouts below are the contract with
 * src/lib/device.ts in the app — change one, change both.
 */

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_sleep.h>
#include <QMC5883LCompass.h>
#include <math.h>

/* ============================ configuration ============================= */

#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_TELEMETRY_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
// 6e400003-… was the GPS characteristic. Retired, not reused, so an older
// app build talking to new firmware simply finds it absent.
#define CHAR_STATUS_UUID    "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_COMMAND_UUID   "6e400005-b5a3-f393-e0a9-e50e24dcca9e"

#define DEVICE_NAME "Halo Sense"
#define FW_MAJOR 1
#define FW_MINOR 1

// LEDs. Named by the level each one represents, per the hardware build.
static const int PIN_LED_LOW    = 25;   // red
static const int PIN_LED_MEDIUM = 26;   // yellow
static const int PIN_LED_HIGH   = 27;   // blue

static const int PIN_GEIGER  = 4;
static const int PIN_BATTERY = 34;

/*
 * Optional hardware. Leave these at 0 unless the part is actually fitted:
 * an unconnected analog pin floats and reads noise, which previously made the
 * node believe its battery was flat and blink the low-battery warning forever.
 */
#define HAS_BATTERY_SENSE 0
#define HAS_GEIGER        0

/*
 * The original ESP32 has no usable internal temperature sensor —
 * temperatureRead() either fails to link or returns a constant. Enable this
 * only on S2/S3/C3, or wire a real sensor and read it here.
 */
#if defined(CONFIG_IDF_TARGET_ESP32S2) || defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32C3)
  #define HAS_TEMPERATURE 1
#else
  #define HAS_TEMPERATURE 0
#endif

/* How long deep sleep lasts before the node wakes itself again. */
static const uint64_t SLEEP_SECONDS = 300;

static const uint32_t TELEMETRY_INTERVAL_MS = 2000;
static const uint8_t  LOW_BATTERY_PERCENT   = 15;

/* ============================ LED driver =============================== */

/*
 * ESP32 core 3.x replaced ledcSetup/ledcAttachPin with a single ledcAttach.
 * Supporting both keeps this sketch compiling on whichever core is installed.
 */
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  #define LED_ATTACH(pin, channel) ledcAttach((pin), 5000, 8)
  #define LED_WRITE(pin, channel, duty) ledcWrite((pin), (duty))
#else
  #define LED_ATTACH(pin, channel) do { ledcSetup((channel), 5000, 8); ledcAttachPin((pin), (channel)); } while (0)
  #define LED_WRITE(pin, channel, duty) ledcWrite((channel), (duty))
#endif

/* ---------------------------------------------------------------------------
 * Types come first, and deliberately so.
 *
 * The Arduino IDE generates prototypes for every function in a .ino and
 * injects them immediately before the first function definition. Any enum or
 * struct used in a signature must therefore be declared above that point, or
 * the generated prototype refers to a type the compiler has not seen yet and
 * the build fails with "'Level' does not name a type".
 * ------------------------------------------------------------------------- */

/** The three status LEDs, in the order they sit on the board. */
enum Led : uint8_t { LED_LOW = 0, LED_MEDIUM = 1, LED_HIGH = 2, LED_COUNT = 3 };

/** Which animation the LEDs are currently playing. */
enum LedMode : uint8_t {
  MODE_BOOT,          // startup sweep
  MODE_SELFTEST,      // sensors reporting in
  MODE_ADVERTISING,   // waiting for a phone
  MODE_CONNECTING,    // link being established
  MODE_CONNECTED,     // celebratory sweep, then falls through to level
  MODE_LEVEL,         // steady state: show the current level
  MODE_ALERT,         // storm level reached
  MODE_CALIBRATING,
  MODE_IDENTIFY,
  MODE_SLEEPING,
};

/** Which LED represents the current reading. */
enum Level : uint8_t { LEVEL_LOW = 0, LEVEL_MEDIUM = 1, LEVEL_HIGH = 2 };

static const int LED_PINS[LED_COUNT] = { PIN_LED_LOW, PIN_LED_MEDIUM, PIN_LED_HIGH };

/** Current duty for each LED, 0–255. */
static uint8_t ledLevel[LED_COUNT] = { 0, 0, 0 };

/*
 * Perceptual correction — raw PWM looks far too bright at the low end, which
 * makes the breathing animations look like stutters. Built once into a table
 * rather than calling powf() three times per frame.
 */
static uint8_t gammaTable[256];

static void buildGammaTable() {
  for (int i = 0; i < 256; i++) {
    gammaTable[i] = (uint8_t)(powf(i / 255.0f, 2.2f) * 255.0f + 0.5f);
  }
}

static void ledInit() {
  buildGammaTable();
  for (int i = 0; i < LED_COUNT; i++) {
    LED_ATTACH(LED_PINS[i], i);
    LED_WRITE(LED_PINS[i], i, 0);
  }
}

static void ledSet(Led led, uint8_t brightness) {
  ledLevel[led] = brightness;
  LED_WRITE(LED_PINS[led], led, gammaTable[brightness]);
}

static void ledSetAll(uint8_t brightness) {
  for (int i = 0; i < LED_COUNT; i++) ledSet((Led)i, brightness);
}

/* ============================ animations =============================== */

static LedMode ledMode = MODE_BOOT;
static Level   currentLevel = LEVEL_LOW;
static uint32_t modeStartedAt = 0;
/** Mode to fall back to when a one-shot animation finishes. */
static LedMode modeAfter = MODE_ADVERTISING;
static bool batteryLow = false;

static void setLedMode(LedMode mode, LedMode after = MODE_LEVEL) {
  ledMode = mode;
  modeAfter = after;
  modeStartedAt = millis();
  ledSetAll(0);
}

/** 0→255→0 over `period`, smoothed into a sine so it breathes rather than ramps. */
static uint8_t breathe(uint32_t elapsed, uint32_t period) {
  float phase = (float)(elapsed % period) / (float)period;
  return (uint8_t)((sinf(phase * 2.0f * PI - PI / 2.0f) * 0.5f + 0.5f) * 255.0f);
}

static uint8_t triangle(uint32_t elapsed, uint32_t period) {
  uint32_t t = elapsed % period;
  uint32_t half = period / 2;
  return t < half ? (uint8_t)(255 * t / half) : (uint8_t)(255 * (period - t) / half);
}

static bool blinkPhase(uint32_t elapsed, uint32_t onMs, uint32_t periodMs) {
  return (elapsed % periodMs) < onMs;
}

/**
 * Advances whichever animation is running. Called every loop; never blocks.
 */
static void ledTick() {
  const uint32_t now = millis();
  const uint32_t t = now - modeStartedAt;

  switch (ledMode) {
    case MODE_BOOT: {
      // Sweep red → yellow → blue, 300ms each, then a shared fade out.
      const uint32_t step = 300;
      if (t < step * 3) {
        int active = t / step;
        for (int i = 0; i < LED_COUNT; i++) {
          ledSet((Led)i, i == active ? triangle(t - active * step, step) : 0);
        }
      } else if (t < step * 3 + 400) {
        uint8_t fade = 255 - (uint8_t)(255 * (t - step * 3) / 400);
        ledSetAll(fade);
      } else {
        setLedMode(MODE_SELFTEST);
      }
      break;
    }

    case MODE_SELFTEST: {
      // Brief all-on confirmation that every channel works.
      if (t < 260) ledSetAll(200);
      else if (t < 420) ledSetAll(0);
      else setLedMode(MODE_ADVERTISING);
      break;
    }

    case MODE_ADVERTISING: {
      // Slow blue breath: powered, waiting to be found.
      ledSet(LED_LOW, 0);
      ledSet(LED_MEDIUM, 0);
      ledSet(LED_HIGH, breathe(t, 2600) / 3);
      break;
    }

    case MODE_CONNECTING: {
      ledSet(LED_LOW, 0);
      ledSet(LED_MEDIUM, 0);
      ledSet(LED_HIGH, blinkPhase(t, 90, 260) ? 255 : 0);
      break;
    }

    case MODE_CONNECTED: {
      // Sweep up, then all three flash together, then hand over to the level.
      const uint32_t step = 140;
      if (t < step * 3) {
        int active = t / step;
        for (int i = 0; i < LED_COUNT; i++) ledSet((Led)i, i <= active ? 255 : 0);
      } else if (t < step * 3 + 500) {
        uint32_t f = t - step * 3;
        ledSetAll(blinkPhase(f, 80, 160) ? 255 : 0);
      } else {
        setLedMode(MODE_LEVEL);
      }
      break;
    }

    case MODE_LEVEL: {
      // Steady state. The level's own LED breathes gently, others dark.
      uint8_t b = 40 + breathe(t, 4000) / 2;
      for (int i = 0; i < LED_COUNT; i++) {
        ledSet((Led)i, i == (int)currentLevel ? b : 0);
      }
      break;
    }

    case MODE_ALERT: {
      // Hard, urgent pulse on the level LED — visible from across a room.
      uint8_t b = blinkPhase(t, 220, 500) ? 255 : 20;
      for (int i = 0; i < LED_COUNT; i++) {
        ledSet((Led)i, i == (int)currentLevel ? b : 0);
      }
      break;
    }

    case MODE_CALIBRATING: {
      // Red ↔ blue ping-pong: hold still while this runs.
      const uint32_t period = 700;
      uint8_t ramp = triangle(t, period);
      ledSet(LED_LOW, ramp);
      ledSet(LED_MEDIUM, 0);
      ledSet(LED_HIGH, 255 - ramp);
      break;
    }

    case MODE_IDENTIFY: {
      if (t < 5000) {
        ledSetAll(blinkPhase(t, 70, 160) ? 255 : 0);
      } else {
        setLedMode(modeAfter);
      }
      break;
    }

    case MODE_SLEEPING: {
      if (t < 900) {
        ledSetAll(255 - (uint8_t)(255 * t / 900));
      } else {
        ledSetAll(0);
      }
      break;
    }
  }

  // Low battery overrides everything with a red double-blink every 4s.
  if (batteryLow && ledMode != MODE_SLEEPING && ledMode != MODE_IDENTIFY) {
    uint32_t c = now % 4000;
    if (c < 140 || (c > 240 && c < 380)) ledSet(LED_LOW, 255);
  }
}

/* ============================ packet layouts =========================== */

struct __attribute__((packed)) TelemetryPacket {
  float    bx;            // 0   microtesla
  float    by;            // 4
  float    bz;            // 8
  float    magnitude;     // 12
  float    delta;         // 16  change from the calibrated baseline
  uint16_t cpm;           // 20  radiation counts per minute
  int16_t  tempCx100;     // 22  °C × 100
};                        // 24 bytes

struct __attribute__((packed)) StatusPacket {
  uint8_t  battery;       // 0   percent
  uint8_t  fwMajor;       // 1
  uint8_t  fwMinor;       // 2
  uint32_t uptimeSec;     // 3
};                        // 7 bytes

/* ============================ commands ================================= */

static const uint8_t CMD_CALIBRATE = 1;
static const uint8_t CMD_IDENTIFY  = 2;
static const uint8_t CMD_SLEEP     = 3;
/** Second byte 0/1/2 — lets the app drive the LEDs from the planetary index. */
static const uint8_t CMD_SET_LEVEL = 4;
/** Second byte 0/1 — turn the alert pulse on or off. */
static const uint8_t CMD_SET_ALERT = 5;

/* ============================ state ==================================== */

QMC5883LCompass compass;

BLECharacteristic *telemetryChar;
BLECharacteristic *statusChar;

bool connected = false;

float baselineField = 0.0f;
bool  baselineSet   = false;

volatile uint32_t pulseCount = 0;
uint16_t currentCpm = 0;
uint32_t lastCpmWindow = 0;

uint32_t lastTelemetry = 0;
uint8_t  batteryPercent = 100;
bool     alertActive = false;

void IRAM_ATTR onGeigerPulse() { pulseCount++; }

/* ============================ sensors ================================== */

static float readFieldMagnitude(float &bx, float &by, float &bz) {
  compass.read();
  // QMC5883L at ±2G over 12 bits: roughly 0.083 µT per count.
  const float scale = 0.083f;
  bx = compass.getX() * scale;
  by = compass.getY() * scale;
  bz = compass.getZ() * scale;
  return sqrtf(bx * bx + by * by + bz * bz);
}

/*
 * Calibration averages a burst of samples so one noisy reading can't skew the
 * zero. It is spread across successive loop() iterations rather than run in a
 * tight delay() loop: it used to be called straight from the BLE write
 * callback, which blocked the Bluetooth stack for the better part of a second
 * and could trip the watchdog.
 */
static bool     calibrating = false;
static float    calibrationSum = 0;
static uint16_t calibrationSamples = 0;
static uint32_t lastCalibrationSample = 0;

static const uint16_t CALIBRATION_SAMPLES = 24;
static const uint32_t CALIBRATION_SPACING_MS = 15;

static void beginCalibration() {
  calibrating = true;
  calibrationSum = 0;
  calibrationSamples = 0;
  lastCalibrationSample = 0;
  setLedMode(MODE_CALIBRATING);
}

/** One step of an in-progress calibration. Returns quickly, every time. */
static void serviceCalibration() {
  if (!calibrating) return;

  const uint32_t now = millis();
  if (now - lastCalibrationSample < CALIBRATION_SPACING_MS) return;
  lastCalibrationSample = now;

  float bx, by, bz;
  calibrationSum += readFieldMagnitude(bx, by, bz);
  calibrationSamples++;

  if (calibrationSamples >= CALIBRATION_SAMPLES) {
    baselineField = calibrationSum / calibrationSamples;
    baselineSet = true;
    calibrating = false;
    setLedMode(connected ? MODE_LEVEL : MODE_ADVERTISING);
    Serial.printf("Calibrated. Baseline = %.2f uT\n", baselineField);
  }
}

static uint8_t readBatteryPercent() {
#if HAS_BATTERY_SENSE
  // Average a few reads — the ESP32 ADC is noisy enough to swing the estimate.
  uint32_t sum = 0;
  for (int i = 0; i < 8; i++) sum += analogRead(PIN_BATTERY);
  float voltage = (sum / 8.0f / 4095.0f) * 3.3f * 2.0f;
  float pct = (voltage - 3.30f) / (4.20f - 3.30f) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (uint8_t)pct;
#else
  return 100;   // no divider fitted — report full rather than inventing a level
#endif
}

static int16_t readTemperatureCx100() {
#if HAS_TEMPERATURE
  return (int16_t)(temperatureRead() * 100.0f);
#else
  return 0;     // no sensor on this chip; the app shows a dash for zero
#endif
}

static void updateCpm() {
  uint32_t now = millis();
  if (now - lastCpmWindow < 60000) return;
  noInterrupts();
  uint32_t counted = pulseCount;
  pulseCount = 0;
  interrupts();
  currentCpm = counted > 65535 ? 65535 : (uint16_t)counted;
  lastCpmWindow = now;
}

/** Maps how far the local field has moved onto the three LED levels. */
static Level levelFromDelta(float delta) {
  float d = fabsf(delta);
  if (d >= 1.5f) return LEVEL_HIGH;
  if (d >= 0.5f) return LEVEL_MEDIUM;
  return LEVEL_LOW;
}

/* ============================ BLE ====================================== */

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    connected = true;
    setLedMode(MODE_CONNECTED);
    Serial.println("Phone connected");
  }
  void onDisconnect(BLEServer *server) override {
    connected = false;
    setLedMode(MODE_ADVERTISING);
    Serial.println("Phone disconnected — advertising again");
    server->startAdvertising();
  }
};

/*
 * The write callback runs on the Bluetooth stack's own task, so it only
 * records what was asked for — the work happens in loop(). Doing it here
 * blocked BLE long enough to risk a watchdog reset.
 *
 * getData()/getLength() are used instead of getValue() because that returns
 * std::string on ESP32 core 2.x and Arduino String on 3.x; reading the raw
 * bytes compiles identically on both.
 */
static volatile uint8_t pendingCommand = 0;
static volatile uint8_t pendingArg = 0;

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    const uint8_t *data = characteristic->getData();
    const size_t len = characteristic->getLength();
    if (data == nullptr || len < 1) return;

    pendingArg = len > 1 ? data[1] : 0;
    pendingCommand = data[0];      // set last: loop() polls this
  }
};

/** Runs any command the phone sent, on the main task where blocking is safe. */
static void serviceCommands() {
  const uint8_t cmd = pendingCommand;
  if (cmd == 0) return;
  const uint8_t arg = pendingArg;
  pendingCommand = 0;

  switch (cmd) {
    case CMD_CALIBRATE:
      beginCalibration();
      break;

    case CMD_IDENTIFY:
      setLedMode(MODE_IDENTIFY, connected ? MODE_LEVEL : MODE_ADVERTISING);
      break;

    case CMD_SET_LEVEL:
      currentLevel = (Level)(arg > 2 ? 2 : arg);
      if (ledMode == MODE_LEVEL || ledMode == MODE_ALERT) {
        setLedMode(alertActive ? MODE_ALERT : MODE_LEVEL);
      }
      break;

    case CMD_SET_ALERT:
      alertActive = arg != 0;
      setLedMode(alertActive ? MODE_ALERT : MODE_LEVEL);
      break;

    case CMD_SLEEP: {
      // Fade out, then sleep with a timer wake — without a wake source the
      // node would never come back without a physical reset.
      setLedMode(MODE_SLEEPING);
      const uint32_t until = millis() + 1000;
      while (millis() < until) {
        ledTick();
        delay(20);
      }
      ledSetAll(0);
      Serial.printf("Sleeping for %llu seconds\n", (unsigned long long)SLEEP_SECONDS);
      Serial.flush();
      esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
      esp_deep_sleep_start();
      break;
    }
  }
}

/* ============================ setup ==================================== */

void setup() {
  Serial.begin(115200);
  delay(150);
  Serial.println("\nHalo Node " __DATE__);

  ledInit();
  setLedMode(MODE_BOOT);

#if HAS_GEIGER
  pinMode(PIN_GEIGER, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_GEIGER), onGeigerPulse, FALLING);
#endif

  // Start I2C explicitly so the pins are unambiguous across library versions.
  Wire.begin(21, 22);
  compass.init();

  BLEDevice::init(DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  telemetryChar = service->createCharacteristic(
      CHAR_TELEMETRY_UUID, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  telemetryChar->addDescriptor(new BLE2902());

  statusChar = service->createCharacteristic(CHAR_STATUS_UUID, BLECharacteristic::PROPERTY_READ);

  BLECharacteristic *commandChar = service->createCharacteristic(
      CHAR_COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  commandChar->setCallbacks(new CommandCallbacks());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("Advertising as \"" DEVICE_NAME "\" — open Halo Guard and search.");
}

/* ============================ loop ===================================== */

void loop() {
  const uint32_t now = millis();

  serviceCommands();
  serviceCalibration();
  updateCpm();
  ledTick();

  if (connected && now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = now;

    TelemetryPacket packet;
    float bx, by, bz;
    packet.magnitude = readFieldMagnitude(bx, by, bz);
    packet.bx = bx;
    packet.by = by;
    packet.bz = bz;
    packet.delta = baselineSet ? (packet.magnitude - baselineField) : 0.0f;
    packet.cpm = currentCpm;
    packet.tempCx100 = readTemperatureCx100();

    // Local reading drives the LEDs unless the phone has overridden the level.
    if (baselineSet && ledMode == MODE_LEVEL) currentLevel = levelFromDelta(packet.delta);

    telemetryChar->setValue((uint8_t *)&packet, sizeof(packet));
    telemetryChar->notify();
  }

  // Status is read on demand, so keep it current and watch the battery.
  static uint32_t lastStatus = 0;
  if (now - lastStatus > 1000) {
    lastStatus = now;
    batteryPercent = readBatteryPercent();
    batteryLow = batteryPercent > 0 && batteryPercent <= LOW_BATTERY_PERCENT;

    StatusPacket status;
    status.battery   = batteryPercent;
    status.fwMajor   = FW_MAJOR;
    status.fwMinor   = FW_MINOR;
    status.uptimeSec = now / 1000;
    statusChar->setValue((uint8_t *)&status, sizeof(status));
  }
}
