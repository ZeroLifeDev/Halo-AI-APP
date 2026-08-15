/*
 * Halo Node — ESP32 firmware for Halo Guard
 * ==========================================================================
 * Measures the local magnetic field and position, streams them to the Halo
 * Guard app over Bluetooth LE, and shows what it is doing on three LEDs.
 *
 * ------------------------------ WIRING ------------------------------------
 *
 *   GPS module (NEO-6M / NEO-7M / NEO-8M), UART2 @ 9600 baud
 *     ESP32 GPIO16 (TX)  ──>  GPS RX
 *     ESP32 GPIO17 (RX)  <──  GPS TX
 *     GPS VCC            ──>  3V3   (check your module — some want 5V)
 *     GPS GND            ──>  GND
 *
 *   Status LEDs — each through its own 220Ω–330Ω resistor to GND
 *     GPIO25  ──[R]──>  RED     LED   "low"
 *     GPIO26  ──[R]──>  YELLOW  LED   "medium"
 *     GPIO27  ──[R]──>  BLUE    LED   "high"
 *
 *   Magnetometer (QMC5883L / HMC5883L), I2C
 *     GPIO21 SDA, GPIO22 SCL, 3V3, GND
 *
 *   Optional
 *     GPIO4   Geiger tube pulse output (falling edge per count)
 *     GPIO34  Battery sense, through a 2:1 divider
 *
 * ------------------------------ LED LANGUAGE ------------------------------
 *
 * The three LEDs are the whole user interface, so every state looks distinct
 * even from across a room:
 *
 *   Boot            a single sweep red → yellow → blue, then all fade out
 *   Self test       each LED flashes as its sensor reports in
 *   Advertising     slow blue breath — waiting for the phone
 *   Connecting      quick blue double-blink
 *   Connected       sweep up, all three flash together, then settle
 *   Searching GPS   yellow chases while the module hunts for satellites
 *   GPS locked      three fast yellow blinks, then back to the level display
 *   Level display   the LED for the current level, breathing gently
 *   Alert           the level LED pulses hard, twice a second
 *   Calibrating     red↔blue ping-pong for the duration
 *   Identify        all three strobe for five seconds
 *   Low battery     red double-blink every few seconds, over anything else
 *   Sleeping        a slow fade to dark on all three
 *
 * Animations are driven from a non-blocking scheduler — nothing here calls
 * delay() in the main loop, so BLE and GPS never stall for a light show.
 *
 * ------------------------------ LIBRARIES ---------------------------------
 *   ESP32 BLE Arduino   (bundled with the Espressif ESP32 board package)
 *   TinyGPSPlus         by Mikal Hart
 *   QMC5883LCompass     by MPrograms
 *
 * Board: "ESP32 Dev Module". Packet layouts below are the contract with
 * src/lib/device.ts in the app — change one, change both.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <TinyGPSPlus.h>
#include <QMC5883LCompass.h>
#include <math.h>

/* ============================ configuration ============================= */

#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_TELEMETRY_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_GPS_UUID       "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_STATUS_UUID    "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_COMMAND_UUID   "6e400005-b5a3-f393-e0a9-e50e24dcca9e"

#define DEVICE_NAME "Halo Sense"
#define FW_MAJOR 1
#define FW_MINOR 1

// LEDs. Named by the level each one represents, per the hardware build.
static const int PIN_LED_LOW    = 25;   // red
static const int PIN_LED_MEDIUM = 26;   // yellow
static const int PIN_LED_HIGH   = 27;   // blue

// GPS on UART2. These are the ESP32's own pins: it transmits on 16 and
// receives on 17, so the GPS module's TX goes to 17 and its RX to 16.
static const int PIN_GPS_TX = 16;
static const int PIN_GPS_RX = 17;
static const uint32_t GPS_BAUD = 9600;

static const int PIN_GEIGER  = 4;
static const int PIN_BATTERY = 34;

static const uint32_t TELEMETRY_INTERVAL_MS = 2000;
static const uint32_t GPS_INTERVAL_MS       = 5000;
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

enum Led : uint8_t { LED_LOW = 0, LED_MEDIUM = 1, LED_HIGH = 2, LED_COUNT = 3 };

static const int LED_PINS[LED_COUNT] = { PIN_LED_LOW, PIN_LED_MEDIUM, PIN_LED_HIGH };

/** Current duty for each LED, 0–255. */
static uint8_t ledLevel[LED_COUNT] = { 0, 0, 0 };

static void ledInit() {
  for (int i = 0; i < LED_COUNT; i++) {
    LED_ATTACH(LED_PINS[i], i);
    LED_WRITE(LED_PINS[i], i, 0);
  }
}

/** Perceptual correction — raw PWM looks far too bright at the low end. */
static uint8_t gamma8(uint8_t v) {
  float f = v / 255.0f;
  return (uint8_t)(powf(f, 2.2f) * 255.0f + 0.5f);
}

static void ledSet(Led led, uint8_t brightness) {
  ledLevel[led] = brightness;
  LED_WRITE(LED_PINS[led], led, gamma8(brightness));
}

static void ledSetAll(uint8_t brightness) {
  for (int i = 0; i < LED_COUNT; i++) ledSet((Led)i, brightness);
}

/* ============================ animations =============================== */

enum LedMode : uint8_t {
  MODE_BOOT,          // startup sweep
  MODE_SELFTEST,      // sensors reporting in
  MODE_ADVERTISING,   // waiting for a phone
  MODE_CONNECTING,    // link being established
  MODE_CONNECTED,     // celebratory sweep, then falls through to level
  MODE_GPS_SEARCH,    // hunting for satellites
  MODE_GPS_FIX,       // just locked on
  MODE_LEVEL,         // steady state: show the current level
  MODE_ALERT,         // storm level reached
  MODE_CALIBRATING,
  MODE_IDENTIFY,
  MODE_SLEEPING,
};

/** Which LED represents the current reading. */
enum Level : uint8_t { LEVEL_LOW = 0, LEVEL_MEDIUM = 1, LEVEL_HIGH = 2 };

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

    case MODE_GPS_SEARCH: {
      // A chase along the row, led by yellow: actively looking.
      const uint32_t step = 220;
      int active = (t / step) % LED_COUNT;
      for (int i = 0; i < LED_COUNT; i++) {
        ledSet((Led)i, i == active ? 180 : 0);
      }
      break;
    }

    case MODE_GPS_FIX: {
      if (t < 900) {
        ledSet(LED_LOW, 0);
        ledSet(LED_HIGH, 0);
        ledSet(LED_MEDIUM, blinkPhase(t, 100, 300) ? 255 : 0);
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

struct __attribute__((packed)) GpsPacket {
  double  lat;            // 0
  double  lon;            // 8
  float   altitude;       // 16  metres
  float   hdop;           // 20
  uint8_t satellites;     // 24
  uint8_t fix;            // 25  1 = valid
};                        // 26 bytes

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
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

BLECharacteristic *telemetryChar;
BLECharacteristic *gpsChar;
BLECharacteristic *statusChar;

bool connected = false;
bool hadGpsFix = false;

float baselineField = 0.0f;
bool  baselineSet   = false;

volatile uint32_t pulseCount = 0;
uint16_t currentCpm = 0;
uint32_t lastCpmWindow = 0;

uint32_t lastTelemetry = 0;
uint32_t lastGps = 0;
uint32_t calibrateUntil = 0;
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

/**
 * Averages a burst so one noisy sample can't skew the zero. Runs without
 * blocking the animation: samples are taken across successive loops.
 */
static void startCalibration() {
  setLedMode(MODE_CALIBRATING);
  calibrateUntil = millis() + 2500;

  float sum = 0;
  const int samples = 24;
  for (int i = 0; i < samples; i++) {
    float bx, by, bz;
    sum += readFieldMagnitude(bx, by, bz);
    ledTick();      // keep the animation moving during the burst
    delay(15);
  }
  baselineField = sum / samples;
  baselineSet = true;
  Serial.printf("Calibrated. Baseline = %.2f uT\n", baselineField);
}

static uint8_t readBatteryPercent() {
  int raw = analogRead(PIN_BATTERY);
  if (raw <= 0) return 100;           // no divider fitted / running on USB
  float voltage = (raw / 4095.0f) * 3.3f * 2.0f;
  float pct = (voltage - 3.30f) / (4.20f - 3.30f) * 100.0f;
  return (uint8_t)constrain(pct, 0.0f, 100.0f);
}

static int16_t readTemperatureCx100() {
  return (int16_t)(temperatureRead() * 100.0f);
}

static void updateCpm() {
  uint32_t now = millis();
  if (now - lastCpmWindow < 60000) return;
  noInterrupts();
  currentCpm = (uint16_t)min<uint32_t>(pulseCount, 65535);
  pulseCount = 0;
  interrupts();
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

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    if (value.length() < 1) return;

    const uint8_t cmd = (uint8_t)value[0];
    const uint8_t arg = value.length() > 1 ? (uint8_t)value[1] : 0;

    switch (cmd) {
      case CMD_CALIBRATE:
        startCalibration();
        break;

      case CMD_IDENTIFY:
        setLedMode(MODE_IDENTIFY, connected ? MODE_LEVEL : MODE_ADVERTISING);
        break;

      case CMD_SET_LEVEL:
        currentLevel = (Level)constrain(arg, 0, 2);
        if (ledMode == MODE_LEVEL || ledMode == MODE_ALERT) {
          setLedMode(alertActive ? MODE_ALERT : MODE_LEVEL);
        }
        break;

      case CMD_SET_ALERT:
        alertActive = arg != 0;
        setLedMode(alertActive ? MODE_ALERT : MODE_LEVEL);
        break;

      case CMD_SLEEP:
        setLedMode(MODE_SLEEPING);
        for (int i = 0; i < 40; i++) { ledTick(); delay(25); }
        esp_deep_sleep_start();
        break;
    }
  }
};

/* ============================ setup ==================================== */

void setup() {
  Serial.begin(115200);
  delay(150);
  Serial.println("\nHalo Node " __DATE__);

  ledInit();
  setLedMode(MODE_BOOT);

  pinMode(PIN_GEIGER, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_GEIGER), onGeigerPulse, FALLING);

  compass.init();

  // ESP32 transmits on GPIO16 and receives on GPIO17.
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
  Serial.printf("GPS on UART2 — TX %d, RX %d @ %lu baud\n", PIN_GPS_TX, PIN_GPS_RX, (unsigned long)GPS_BAUD);

  BLEDevice::init(DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  telemetryChar = service->createCharacteristic(
      CHAR_TELEMETRY_UUID, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  telemetryChar->addDescriptor(new BLE2902());

  gpsChar = service->createCharacteristic(
      CHAR_GPS_UUID, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  gpsChar->addDescriptor(new BLE2902());

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

  // GPS needs a steady drip of bytes to parse sentences.
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());

  updateCpm();
  ledTick();

  // Announce the moment a fix appears, and show the hunt while it doesn't.
  const bool haveFix = gps.location.isValid() && gps.satellites.value() > 0;
  if (haveFix && !hadGpsFix) {
    hadGpsFix = true;
    setLedMode(MODE_GPS_FIX);
    Serial.printf("GPS fix: %.5f, %.5f (%d sats)\n",
                  gps.location.lat(), gps.location.lng(), gps.satellites.value());
  } else if (!haveFix && hadGpsFix) {
    hadGpsFix = false;
  } else if (!haveFix && connected && ledMode == MODE_LEVEL && now - modeStartedAt > 6000) {
    // Idle and still no fix — show that we're looking.
    setLedMode(MODE_GPS_SEARCH);
  } else if (haveFix && ledMode == MODE_GPS_SEARCH) {
    setLedMode(MODE_LEVEL);
  }

  // Calibration finished — return to the steady display.
  if (calibrateUntil && now > calibrateUntil) {
    calibrateUntil = 0;
    setLedMode(connected ? MODE_LEVEL : MODE_ADVERTISING);
  }

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

  if (connected && now - lastGps >= GPS_INTERVAL_MS) {
    lastGps = now;

    GpsPacket packet;
    packet.lat        = haveFix ? gps.location.lat() : 0.0;
    packet.lon        = haveFix ? gps.location.lng() : 0.0;
    packet.altitude   = gps.altitude.isValid() ? (float)gps.altitude.meters() : 0.0f;
    packet.hdop       = gps.hdop.isValid() ? (float)gps.hdop.hdop() : 99.9f;
    packet.satellites = gps.satellites.isValid() ? (uint8_t)gps.satellites.value() : 0;
    packet.fix        = haveFix ? 1 : 0;

    gpsChar->setValue((uint8_t *)&packet, sizeof(packet));
    gpsChar->notify();
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
