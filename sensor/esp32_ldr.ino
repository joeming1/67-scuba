/*
 * FixFlow ESP32 LDR sender.
 * Dependencies: Arduino-ESP32 core (WiFi, HTTPClient, time).
 * Replace local network settings and ADC calibration values before flashing.
 * Never commit real Wi-Fi credentials.
 */
#include <HTTPClient.h>
#include <WiFi.h>
#include <string.h>
#include <time.h>

const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// Use the computer's LAN IP; localhost will point back to the ESP32.
// Port 3000 = Next.js dev server. Ensure the server is started with -H 0.0.0.0
// (or check that it listens on 0.0.0.0) so the ESP32 can reach it over LAN.
const char *API_URL = "http://172.25.189.70:3000/api/sensor-events";

constexpr int LDR_PIN = 34;         // ADC1 remains usable while Wi-Fi is active
constexpr int LDR_DARK_ADC = 3500;  // Replace with measured dark-room value
constexpr int LDR_BRIGHT_ADC = 700; // Replace with measured bright-room value
constexpr bool INVERT_ADC =
    false; // Set true if bright ADC is greater than dark ADC
constexpr unsigned long SAMPLE_INTERVAL_MS =
    2000; // FixFlow needs three consecutive low samples
constexpr int ADC_FILTER_SAMPLES = 10;
const char *LDR_SENSOR_ID = "ldr_b204";
const char *LOCATION = "Room B-204";

String utcTimestamp() {
  struct tm utc;
  const time_t current = time(nullptr);
  if (current < 100000)
    return ""; // Wait for NTP synchronization.
  gmtime_r(&current, &utc);
  char stamp[25];
  strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(stamp);
}

int brightnessPercent(int raw) {
  long pct;
  if (INVERT_ADC) {
    if (LDR_BRIGHT_ADC == LDR_DARK_ADC)
      return 0;
    pct = (long)(raw - LDR_DARK_ADC) * 100L / (LDR_BRIGHT_ADC - LDR_DARK_ADC);
  } else {
    if (LDR_DARK_ADC == LDR_BRIGHT_ADC)
      return 0;
    pct = (long)(LDR_DARK_ADC - raw) * 100L / (LDR_DARK_ADC - LDR_BRIGHT_ADC);
  }
  return constrain((int)pct, 0, 100);
}

int readAveragedAdc() {
  uint32_t total = 0;
  for (int i = 0; i < ADC_FILTER_SAMPLES; ++i) {
    total += analogRead(LDR_PIN);
    delay(5);
  }
  return (int)(total / ADC_FILTER_SAMPLES);
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED)
    return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000)
    delay(250);
  return WiFi.status() == WL_CONNECTED;
}

void postReading(int brightness, const String &observedAt) {
  char payload[320];
  snprintf(payload, sizeof(payload),
           "{\"sensor_id\":\"%s\",\"sensor_type\":\"ldr\",\"metric\":"
           "\"brightness_pct\",\"value\":%d,\"unit\":\"%%\",\"location\":\"%"
           "s\",\"observed_at\":\"%s\"}",
           LDR_SENSOR_ID, brightness, LOCATION, observedAt.c_str());

  HTTPClient http;
  http.setTimeout(5000);
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST((uint8_t *)payload, strlen(payload));
  Serial.printf("brightness=%d%% POST status=%d response=%s\n", brightness,
                status, http.getString().c_str());
  http.end();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(LDR_PIN, ADC_11db);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  connectWiFi();
}

void loop() {
  static unsigned long lastSample = 0;
  if (millis() - lastSample < SAMPLE_INTERVAL_MS) {
    delay(10);
    return;
  }
  lastSample = millis();

  const int raw = readAveragedAdc();
  const int brightness = brightnessPercent(raw);
  const String observedAt = utcTimestamp();
  Serial.printf("ADC=%d brightness=%d%%\n", raw, brightness);
  if (observedAt.isEmpty()) {
    Serial.println("Waiting for NTP time sync; reading not sent.");
    return;
  }
  if (!connectWiFi()) {
    Serial.println("Wi-Fi unavailable; reading skipped.");
    return;
  }
  postReading(brightness, observedAt);
}
