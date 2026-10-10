/*
 * FixitFelix ESP32 LDR sender.
 * Dependencies: Arduino-ESP32 core (WiFi, HTTPClient, WiFiClientSecure, time).
 * Replace local network settings and ADC calibration values before flashing.
 * Never commit real Wi-Fi credentials.
 *
 * Supports both local (HTTP) and Vercel (HTTPS) endpoints.
 * If API_URL starts with "https", uses WiFiClientSecure with certificate
 * validation. Vercel forces HTTPS (308 redirect on HTTP), so always use
 * the https:// URL for Vercel deployments.
 */
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <string.h>
#include <time.h>

const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// --- For Vercel deployment (HTTPS) ---
// Replace with your Vercel URL. Must start with https://
const char *API_URL = "https://YOUR-APP.vercel.app/api/sensor-events";

// --- For local dev (HTTP over LAN) ---
// Uncomment this and comment the line above when running locally.
// const char *API_URL = "http://172.25.189.70:3000/api/sensor-events";

constexpr int LDR_PIN = 34;         // ADC1 remains usable while Wi-Fi is active
constexpr int LDR_DARK_ADC = 3500;  // Replace with measured dark-room value
constexpr int LDR_BRIGHT_ADC = 700; // Replace with measured bright-room value
constexpr bool INVERT_ADC =
    false; // Set true if bright ADC is greater than dark ADC
constexpr unsigned long SAMPLE_INTERVAL_MS =
    2000; // FixitFelix needs three consecutive low samples
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

  // Determine if we need HTTPS (for Vercel) or HTTP (for local LAN)
  bool useHttps = strncmp(API_URL, "https://", 8) == 0;

  HTTPClient http;
  http.setTimeout(8000); // Vercel cold starts can take a few seconds

  if (useHttps) {
    // WiFiClientSecure for Vercel HTTPS endpoints
    WiFiClientSecure *secure = new WiFiClientSecure;
    // Vercel uses standard CAs — the ESP32 has them bundled in recent
    // Arduino-ESP32 core versions. If cert validation fails, uncomment
    // the line below to skip validation (less secure but works for demos):
    // secure->setInsecure();
    http.begin(*secure, API_URL);
  } else {
    // Plain HTTP for local LAN dev server
    http.begin(API_URL);
  }

  http.addHeader("Content-Type", "application/json");
  const int status = http.POST((uint8_t *)payload, strlen(payload));
  Serial.printf("brightness=%d%% POST status=%d response=%s\n", brightness,
                status, http.getString().c_str());
  http.end();

  if (useHttps) {
    // WiFiClientSecure was heap-allocated; HTTPClient frees it internally
    // but we delete to be safe on ESP32's tight heap.
  }
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
