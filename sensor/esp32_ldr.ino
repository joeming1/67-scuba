/*
 * FixFlow ESP32 sender for LDR + DHT11.
 * Dependencies: Arduino-ESP32 core (WiFi, HTTPClient, time) and Adafruit DHT sensor library.
 * Set Wi-Fi, API URL, and calibrated ADC endpoints before flashing.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <string.h>
#include <DHT.h>

const char *WIFI_SSID = "Yue Herng";
const char *WIFI_PASSWORD = "toomingyap123";
const char *API_URL = "http://172.25.189.117:3000/api/sensor-events";

constexpr int LDR_PIN = 34;                       // ADC1 pin; safe while Wi-Fi is active
constexpr int DHT_PIN = 18;                        // Change to match your DHT11 data wire
constexpr int LDR_DARK_ADC = 3500;                // Replace with measured dark-room value
constexpr int LDR_BRIGHT_ADC = 700;               // Replace with measured bright-room value
constexpr bool INVERT_ADC = false;                // Set true if bright ADC > dark ADC
constexpr unsigned long SAMPLE_INTERVAL_MS = 2000; // DHT11 should not be sampled faster than ~1 Hz
constexpr int ADC_FILTER_SAMPLES = 10;
const char *LDR_SENSOR_ID = "ldr_b204";
const char *DHT_SENSOR_ID = "dht11_b204";
const char *LOCATION = "Room B-204";

DHT dht(DHT_PIN, DHT11);

String utcTimestamp() {
  struct tm utc;
  const time_t now = time(nullptr);
  if (now < 100000) return ""; // NTP has not synchronized yet
  gmtime_r(&now, &utc);
  char stamp[25];
  strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(stamp);
}

int brightnessPercent(int raw) {
  long pct;
  if (INVERT_ADC) {
    if (LDR_BRIGHT_ADC == LDR_DARK_ADC) return 0;
    pct = (long)(raw - LDR_DARK_ADC) * 100L / (LDR_BRIGHT_ADC - LDR_DARK_ADC);
  } else {
    if (LDR_DARK_ADC == LDR_BRIGHT_ADC) return 0;
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

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000) delay(250);
}

void postReading(const char *sensorId, const char *sensorType, const char *metric,
                 double value, const char *unit, const String &observedAt) {
  char payload[320];
  snprintf(payload, sizeof(payload),
    "{\"sensor_id\":\"%s\",\"sensor_type\":\"%s\",\"metric\":\"%s\",\"value\":%.1f,\"unit\":\"%s\",\"location\":\"%s\",\"observed_at\":\"%s\"}",
    sensorId, sensorType, metric, value, unit, LOCATION, observedAt.c_str());

  HTTPClient http;
  http.setTimeout(3000);
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST((uint8_t *)payload, strlen(payload));
  Serial.printf("%s %s=%.1f POST status=%d response=%s\n", sensorId, metric, value, status, http.getString().c_str());
  http.end();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(LDR_PIN, ADC_11db);
  dht.begin();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  connectWiFi();
}

void loop() {
  static unsigned long lastSample = 0;
  if (millis() - lastSample < SAMPLE_INTERVAL_MS) { delay(10); return; }
  lastSample = millis();

  const int raw = readAveragedAdc();
  const int brightness = brightnessPercent(raw);
  const float temperature = dht.readTemperature(); // Celsius
  const float humidity = dht.readHumidity();
  const String observedAt = utcTimestamp();
  Serial.printf("ADC=%d brightness=%d%% temperature=%.1fC humidity=%.1f%%\n", raw, brightness, temperature, humidity);
  if (observedAt.isEmpty()) {
    Serial.println("Waiting for NTP time sync; readings not sent.");
    return;
  }

  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) { Serial.println("Wi-Fi unavailable; sample skipped."); return; }

  // Send separate events with stable per-sensor IDs so existing LDR incident rules remain isolated.
  postReading(LDR_SENSOR_ID, "ldr", "brightness_pct", brightness, "%", observedAt);
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("DHT11 read failed; climate readings skipped this cycle.");
  } else {
    postReading(DHT_SENSOR_ID, "dht11", "temperature_c", temperature, "°C", observedAt);
    postReading(DHT_SENSOR_ID, "dht11", "humidity_pct", humidity, "%", observedAt);
  }
}
