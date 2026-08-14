/*
 * Halo Node — ESP32 firmware for Halo Guard
 * ------------------------------------------------------------------
 * Measures the local magnetic field, background radiation and position,
 * and streams them to the Halo Guard Android app over Bluetooth LE.
 *
 * The packet layouts below are the contract with src/lib/device.ts in the
 * app. If you change a struct here, change the decoder there too.
 *
 * Hardware this targets
 *   ESP32 dev board (any with BLE — ESP32-WROOM-32, ESP32-C3, ESP32-S3)
 *   QMC5883L or HMC5883L magnetometer   → I2C  SDA 21, SCL 22
 *   NEO-6M / NEO-8M GPS module          → UART2  RX 16, TX 17 @ 9600
 *   Geiger tube pulse output (optional) → GPIO 4, interrupt on falling edge
 *   Status LED                          → GPIO 2
 *   Battery sense divider (optional)    → GPIO 34 (ADC1)
 *
 * Libraries (Arduino Library Manager)
 *   ESP32 BLE Arduino      (bundled with the ESP32 board package)
 *   TinyGPSPlus            by Mikal Hart
 *   QMC5883LCompass        by MPrograms
 *
 * Board package: esp32 by Espressif. Select "ESP32 Dev Module".
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <TinyGPSPlus.h>
#include <QMC5883LCompass.h>
#include <math.h>

/* ---------------- UUIDs — must match the app ---------------- */

#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_TELEMETRY_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_GPS_UUID       "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_STATUS_UUID    "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
#define CHAR_COMMAND_UUID   "6e400005-b5a3-f393-e0a9-e50e24dcca9e"

#define DEVICE_NAME "Halo Sense"
#define FW_MAJOR 1
#define FW_MINOR 0

/* ---------------- pins ---------------- */

static const int PIN_LED        = 2;
static const int PIN_GEIGER     = 4;
static const int PIN_BATTERY    = 34;
static const int GPS_RX         = 16;   // ESP32 RX  <- GPS TX
static const int GPS_TX         = 17;   // ESP32 TX  -> GPS RX

/* ---------------- packet layouts (little-endian, packed) ---------------- */

struct __attribute__((packed)) TelemetryPacket {
  float    bx;            // 0   microtesla
  float    by;            // 4
  float    bz;            // 8
  float    magnitude;     // 12  total field strength
  float    delta;         // 16  change since the calibrated baseline
  uint16_t cpm;           // 20  radiation counts per minute
  int16_t  tempCx100;     // 22  °C × 100
};                        // 24 bytes

struct __attribute__((packed)) GpsPacket {
  double  lat;            // 0
  double  lon;            // 8
  float   altitude;       // 16  metres
  float   hdop;           // 20  dilution of precision
  uint8_t satellites;     // 24
  uint8_t fix;            // 25  1 = valid fix
};                        // 26 bytes

struct __attribute__((packed)) StatusPacket {
  uint8_t  battery;       // 0   percent
  uint8_t  fwMajor;       // 1
  uint8_t  fwMinor;       // 2
  uint32_t uptimeSec;     // 3
};                        // 7 bytes

/* ---------------- commands from the app ---------------- */

static const uint8_t CMD_CALIBRATE = 1;
static const uint8_t CMD_IDENTIFY  = 2;
static const uint8_t CMD_SLEEP     = 3;

/* ---------------- state ---------------- */

QMC5883LCompass compass;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

BLECharacteristic *telemetryChar;
BLECharacteristic *gpsChar;
BLECharacteristic *statusChar;

bool connected = false;

// Magnetometer baseline, set by calibration. Field changes are reported
// relative to this so the app can spot a real disturbance.
float baselineField = 0.0f;
bool  baselineSet   = false;

// Geiger pulse counting, kept in a rolling one-minute window.
volatile uint32_t pulseCount = 0;
uint16_t          currentCpm = 0;
uint32_t          lastCpmWindow = 0;

uint32_t lastTelemetry = 0;
uint32_t lastGps       = 0;
uint32_t identifyUntil = 0;

static const uint32_t TELEMETRY_INTERVAL_MS = 2000;
static const uint32_t GPS_INTERVAL_MS       = 5000;

void IRAM_ATTR onGeigerPulse() {
  pulseCount++;
}

/* ---------------- BLE callbacks ---------------- */

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    connected = true;
    digitalWrite(PIN_LED, HIGH);
  }
  void onDisconnect(BLEServer *server) override {
    connected = false;
    digitalWrite(PIN_LED, LOW);
    // Advertise again so the app can reconnect without a power cycle.
    server->startAdvertising();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    if (value.length() < 1) return;

    switch ((uint8_t)value[0]) {
      case CMD_CALIBRATE:
        calibrateBaseline();
        break;
      case CMD_IDENTIFY:
        identifyUntil = millis() + 5000;
        break;
      case CMD_SLEEP:
        esp_deep_sleep_start();
        break;
    }
  }
};

/* ---------------- sensor helpers ---------------- */

float readFieldMagnitude(float &bx, float &by, float &bz) {
  compass.read();
  // QMC5883L reports in raw LSB; 12-bit ±2G range gives ~0.083 µT per LSB.
  const float scale = 0.083f;
  bx = compass.getX() * scale;
  by = compass.getY() * scale;
  bz = compass.getZ() * scale;
  return sqrtf(bx * bx + by * by + bz * bz);
}

void calibrateBaseline() {
  // Average a short burst so a single noisy sample can't skew the zero.
  float sum = 0;
  const int samples = 32;
  for (int i = 0; i < samples; i++) {
    float bx, by, bz;
    sum += readFieldMagnitude(bx, by, bz);
    delay(20);
  }
  baselineField = sum / samples;
  baselineSet = true;

  // Two quick blinks to confirm.
  for (int i = 0; i < 2; i++) {
    digitalWrite(PIN_LED, LOW);
    delay(120);
    digitalWrite(PIN_LED, HIGH);
    delay(120);
  }
  Serial.printf("Calibrated. Baseline field = %.2f uT\n", baselineField);
}

uint8_t readBatteryPercent() {
  // 2:1 divider from a single Li-ion cell into a 3.3 V ADC.
  int raw = analogRead(PIN_BATTERY);
  if (raw <= 0) return 100;  // no divider fitted / USB powered
  float voltage = (raw / 4095.0f) * 3.3f * 2.0f;
  float pct = (voltage - 3.30f) / (4.20f - 3.30f) * 100.0f;
  if (pct > 100) pct = 100;
  if (pct < 0) pct = 0;
  return (uint8_t)pct;
}

int16_t readTemperatureCx100() {
  // ESP32 internal sensor. Swap for a DS18B20/BME280 read if one is fitted.
  return (int16_t)(temperatureRead() * 100.0f);
}

void updateCpm() {
  uint32_t now = millis();
  if (now - lastCpmWindow < 60000) return;
  noInterrupts();
  currentCpm = (uint16_t)min<uint32_t>(pulseCount, 65535);
  pulseCount = 0;
  interrupts();
  lastCpmWindow = now;
}

/* ---------------- setup ---------------- */

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nHalo Node starting…");

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  pinMode(PIN_GEIGER, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_GEIGER), onGeigerPulse, FALLING);

  compass.init();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  // Take an initial baseline so the first readings are meaningful even
  // before the user calibrates manually.
  calibrateBaseline();

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
  // Helps iOS/Android find the device promptly.
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("Advertising as \"" DEVICE_NAME "\" — open Halo Guard and search.");
}

/* ---------------- loop ---------------- */

void loop() {
  // Feed the GPS parser continuously; it needs a steady stream.
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  updateCpm();

  // "Find my device" — flash while the identify window is open.
  if (identifyUntil > millis()) {
    digitalWrite(PIN_LED, (millis() / 150) % 2);
  } else if (connected) {
    digitalWrite(PIN_LED, HIGH);
  }

  uint32_t now = millis();

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

    telemetryChar->setValue((uint8_t *)&packet, sizeof(packet));
    telemetryChar->notify();
  }

  if (connected && now - lastGps >= GPS_INTERVAL_MS) {
    lastGps = now;

    GpsPacket packet;
    bool valid = gps.location.isValid() && gps.satellites.isValid();
    packet.lat        = valid ? gps.location.lat() : 0.0;
    packet.lon        = valid ? gps.location.lng() : 0.0;
    packet.altitude   = gps.altitude.isValid() ? (float)gps.altitude.meters() : 0.0f;
    packet.hdop       = gps.hdop.isValid() ? (float)gps.hdop.hdop() : 99.9f;
    packet.satellites = gps.satellites.isValid() ? (uint8_t)gps.satellites.value() : 0;
    packet.fix        = valid ? 1 : 0;

    gpsChar->setValue((uint8_t *)&packet, sizeof(packet));
    gpsChar->notify();
  }

  // Status is read on demand, so just keep it fresh.
  StatusPacket status;
  status.battery   = readBatteryPercent();
  status.fwMajor   = FW_MAJOR;
  status.fwMinor   = FW_MINOR;
  status.uptimeSec = millis() / 1000;
  statusChar->setValue((uint8_t *)&status, sizeof(status));

  delay(50);
}
