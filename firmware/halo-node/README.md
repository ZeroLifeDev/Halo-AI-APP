# Halo Node — flashing and troubleshooting

Firmware for the ESP32 that measures the local magnetic field and position and
streams it to the Halo Guard app over Bluetooth LE.

---

## Arduino IDE setup

### Libraries

Install from **Tools → Manage Libraries**:

| Library | Author |
| --- | --- |
| TinyGPSPlus | Mikal Hart |
| QMC5883LCompass | MPrograms |

`BLEDevice` and friends ship with the ESP32 board package — nothing to install.

### Board settings

**Tools →**

| Setting | Value | Why it matters |
| --- | --- | --- |
| Board | **ESP32 Dev Module** | must match the chip you actually have — see below |
| Partition Scheme | **Huge APP (3MB No OTA/1MB SPIFFS)** | BLE alone is ~1.3MB; the default scheme is tight |
| Flash Size | **4MB (32Mb)** | or whatever your module really has |
| Upload Speed | 921600 | drop to 115200 if uploads fail partway |
| Port | your COM port | close the Serial Monitor first — it holds the port |

> **Check the chip before anything else.** "ESP32 Dev Module" is for the
> original ESP32. If your board is an **ESP32-S3**, **ESP32-C3** or **ESP32-S2**,
> selecting the wrong one flashes an incompatible bootloader and partition
> table, which produces exactly the boot loop described below. The chip is
> usually printed on the metal can.

---

## Boot loop: "invalid magic number" / "load partition table error!"

```
E (57) flash_parts: partition 0 invalid magic number 0xd644
E (57) boot: Failed to verify partition table
E (57) boot: load partition table error!
ets Jul 29 2019 12:21:46
rst:0x3 (SW_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)
```

The bootloader is fine — it starts, then reads the partition table at `0x8000`
and finds something that isn't a partition table, so it resets and tries again
forever.

**This happens before a single line of the sketch runs**, so it is never caused
by the application code. The flash is in a bad state.

### The fix: erase the whole chip, then reflash

Erasing wipes the bootloader, partition table and app together, so the next
upload lays all three down consistently.

**Easiest — from the IDE:**

1. Close the **Serial Monitor** (it holds the COM port open).
2. **Tools → Erase All Flash Before Sketch Upload → Enabled**
3. Upload the sketch.
4. Afterwards set that option back to **Disabled** — leaving it on erases your
   saved settings on every upload and makes each one much slower.

**If that doesn't work — erase directly:**

```bash
# Windows, with the Arduino ESP32 core installed
python -m esptool --chip esp32 --port COM3 erase_flash
```

On esptool v4 and earlier the command is `esptool.py` instead of
`python -m esptool`. Then upload the sketch normally.

Expect to see `Chip erase completed successfully`. If the erase itself fails,
hold the **BOOT** button while it starts, then release once it prints
`Connecting...`.

### If it still loops after a clean erase

Work down this list in order:

1. **Wrong board selected.** By far the most common cause. An ESP32-S3 flashed
   with an ESP32 bootloader loops exactly like this. Verify the chip marking
   and pick the matching board.
2. **Bad USB cable.** Charge-only cables enumerate the port but corrupt data
   mid-write, so the flash ends up half-written. Try another cable.
3. **Upload speed too high.** Set Upload Speed to **115200** and retry — some
   USB-serial bridges are unreliable at 921600.
4. **Brownout during flashing.** A GPS module and three LEDs on the same USB
   supply can drop the rail. Unplug the peripherals, flash the bare board, then
   reconnect them.
5. **Genuinely worn flash.** Rare, but if a full erase reports success and the
   loop persists on an empty sketch, the module is faulty.

### Sanity check

After erasing, flash the stock **File → Examples → 01.Basics → Blink** first.
If Blink runs, the chip and toolchain are healthy and you can flash
`halo-node.ino` with confidence. If Blink *also* loops, the problem is the
board selection or the hardware — not this firmware.

---

## Wiring

| Part | ESP32 pin | Notes |
| --- | --- | --- |
| GPS TX | **GPIO17** (RX) | module transmits, ESP32 listens |
| GPS RX | **GPIO16** (TX) | ESP32 transmits, module listens |
| GPS VCC / GND | 3V3 / GND | some modules want 5V — check yours |
| Red LED — *low* | **GPIO25** | through a 220–330Ω resistor to GND |
| Yellow LED — *medium* | **GPIO26** | " |
| Blue LED — *high* | **GPIO27** | " |
| Magnetometer SDA | GPIO21 | QMC5883L or HMC5883L |
| Magnetometer SCL | GPIO22 | |
| Geiger pulse (optional) | GPIO4 | falling edge per count |
| Battery sense (optional) | GPIO34 | via a 2:1 divider |

LEDs are wired anode → GPIO, cathode → resistor → GND. GPIO34 is input-only,
which is fine for the battery divider but cannot drive anything.

---

## Reading the LEDs

| State | Animation |
| --- | --- |
| Boot | sweep red → yellow → blue, then a shared fade |
| Self test | all three flash once |
| Advertising | slow blue breath — waiting for the phone |
| Connecting | quick blue double-blink |
| Connected | sweep up, all three flash, then settle |
| Searching for GPS | chase along the row |
| GPS locked | three fast yellow blinks |
| Steady | the current level's LED breathing gently |
| Alert | that LED pulsing hard, twice a second |
| Calibrating | red ↔ blue ping-pong |
| Identify | all three strobe for five seconds |
| Low battery | red double-blink every 4s, over anything else |
| Sleeping | slow fade to dark |

A boot sweep that never reaches the blue breath means the sketch is restarting —
open the Serial Monitor at **115200** to see why.

---

## First run

1. Flash, then open the Serial Monitor at **115200 baud**.
2. You should see the banner, then `GPS on UART2 — TX 16, RX 17 @ 9600 baud`,
   then `Advertising as "Halo Sense"`.
3. The LEDs run the boot sweep and settle into the slow blue breath.
4. Open Halo Guard → **Device** → **Search for my device**.
5. GPS needs a clear view of the sky and can take several minutes on a cold
   start. The yellow chase means it is still looking; three blinks mean it has
   a fix.

If the Serial Monitor shows the banner but the app never finds the node, check
that Bluetooth **and** location are switched on on the phone — Android requires
location to be enabled for BLE scanning.
