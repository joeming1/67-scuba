# Engineer 3: LDR, DHT11, and demo integration

This folder contains the sensor assets for the FixFlow demo. The repo includes Next.js route modules for `POST`/`GET /api/sensor-events` and `POST /api/demo/reset`, plus a small root app that mounts the panel and refreshes the latest reading.

- `SensorPanel.tsx` is a dashboard component. Mount it in Engineer 2's dashboard and pass the latest normalized event from the app's existing sensor-reading data source as `latestReading`. The panel's fallback controls POST directly to `POST /api/sensor-events`, show accepted submissions immediately, and can notify the parent through `onReadingSent` so it can refresh canonical ticket and sensor data.
- `simulator.html` is a standalone browser fallback. Serve it from the app origin (or set its endpoint to the full API URL and enable the app's normal CORS policy). It simulates brightness, temperature, and humidity; its dim and bright presets send three brightness readings one second apart to exercise the agreed consecutive-sample rule.
- `calibrate.html` converts measured dark and bright ADC readings into the three firmware calibration constants and previews normalized percentages. It is a helper only; readings still need to be collected from the physical board.
- `esp32_ldr.ino` averages ten quick ADC reads, normalizes brightness to 0–100%, reads DHT11 temperature and humidity, and POSTs each metric to the shared sensor event API. It requires the Adafruit DHT sensor library and does not implement ticket thresholds; the backend owns lighting incident creation and verification.

## Hardware and calibration

1. Wire the LDR and a fixed resistor as a voltage divider between 3.3 V and GND. Connect the divider midpoint to GPIO 34 (ADC1). Do not feed 5 V into an ESP32 ADC pin.
2. Connect the DHT11 VCC to 3.3 V, GND to GND, and DATA to GPIO 4 (or change `DHT_PIN` to your chosen GPIO). Use a pull-up resistor on DATA if your DHT11 module does not include one. Do not connect sensor pins to 5 V unless the exact board/module wiring is confirmed safe for ESP32 GPIO.
3. Install the Arduino Library Manager package **DHT sensor library by Adafruit** and its Adafruit Unified Sensor dependency. Set `WIFI_SSID`, `WIFI_PASSWORD`, and `API_URL` in the sketch. Keep credentials local; do not commit real Wi-Fi secrets.
4. With the board powered and the sensor in the intended room, record the serial monitor's raw `ADC=` value under bright room lighting and in the dim demo condition. Repeat several times and use representative stable values for `LDR_BRIGHT_ADC` and `LDR_DARK_ADC`.
5. Enter the representative bright and dark values in `calibrate.html`. Copy the generated `LDR_DARK_ADC`, `LDR_BRIGHT_ADC`, and `INVERT_ADC` values into `esp32_ldr.ino`. The mapping is clamped to 0–100 and the endpoint values are calibration anchors, not universal lux values.
6. Flash the sketch and confirm normalized readings move toward 100 in brighter conditions and toward 0 in darker conditions. Confirm the API receives three metric events: `brightness_pct` (`%`), `temperature_c` (`°C`), and `humidity_pct` (`%`), each with an ISO UTC timestamp. Temperature and humidity are posted with the DHT device ID `dht11_b204`; raw ADC data is not sent.

The sketch samples every two seconds, skips transmission until NTP supplies a valid UTC timestamp, and skips samples when Wi-Fi is disconnected. It does not buffer offline readings; the API/backend is responsible for consecutive brightness-sample thresholds. DHT11 read failures skip the climate events for that cycle while brightness still sends.

## Demo runbook

1. Start the app and confirm `GET` and `POST /api/sensor-events` work. Confirm the dashboard can display the latest event using the feed wired by Engineer 2.
2. Power the ESP32 and confirm live normalized readings, or open `simulator.html` from the app origin when hardware/Wi-Fi is unavailable.
3. Use the **Reset demo** control to clear the local sensor readings and pending sensor incidents before rehearsal. It asks for confirmation. The route is intentionally unavailable in production unless the backend has an explicit reset token configured.
4. Use **Send 3 dim samples (12%)** or hold the physical LDR below 25% for at least three seconds. Confirm one pending lighting incident is created, with later low events updating evidence rather than creating duplicates.
5. Have the technician record a repair attempt while readings remain below 40%. Confirm verification fails and the incident moves to follow-up.
6. Raise the physical light level or use **Send 3 bright samples (60%)**. Ask WorkBuddy to recheck, then confirm the backend records verified closure and the dashboard timeline reflects it.

Use the API response and dashboard as the source of truth. Each POST response reports `created`, `updated`, or `ignored`; the first two below-threshold samples are ignored while the third sustained low sample creates the pending incident. Receiving sensor data does not by itself start a WorkBuddy run or create an assigned ticket.

## Dashboard integration

The dashboard shows the latest temperature and humidity events alongside the LDR panel. Events use one metric per POST; the LDR stream remains the only stream that creates lighting incidents.

```json
{"sensor_id":"dht11_b204","sensor_type":"dht11","metric":"temperature_c","value":25.0,"unit":"°C","location":"Room B-204","observed_at":"2026-10-10T10:00:00Z"}
```

Humidity uses the same shape with `metric: "humidity_pct"`, a percentage value from 0–100, and `unit: "%"`.

```tsx
<SensorPanel latestReading={latestLdrEvent} />
```

`latestLdrEvent` should be `latest_event` from `GET /api/sensor-events`. After a simulator POST, `onReadingSent` can trigger a refresh. Pass `enableDemoReset` only in the local demo and clear the parent's cached event in `onDemoReset`. Keep this component separate from the ticket queue/detail component.
