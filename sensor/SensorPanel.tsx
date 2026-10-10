'use client';

import { useId, useState } from "react";

export type LdrSensorEvent = {
  sensor_id: string;
  sensor_type: "ldr";
  metric: "brightness_pct";
  value: number;
  unit: "%";
  location: string;
  observed_at: string;
};
export type SensorEvent = LdrSensorEvent | {
  sensor_id: string;
  sensor_type: "dht11";
  metric: "temperature_c";
  value: number;
  unit: "°C";
  location: string;
  observed_at: string;
} | {
  sensor_id: string;
  sensor_type: "dht11";
  metric: "humidity_pct";
  value: number;
  unit: "%";
  location: string;
  observed_at: string;
};

type SensorPanelProps = {
  /** Latest reading supplied by the dashboard/API, if available. */
  latestReading?: LdrSensorEvent | null;
  /** Notifies the dashboard so it can refresh its canonical sensor/ticket data. */
  onReadingSent?: (event: SensorEvent, result: unknown) => void;
  /** Expose local demo reset when the parent enables the development-only action. */
  enableDemoReset?: boolean;
  onDemoReset?: () => void;
  /** Override when the app is mounted below a non-root base path. */
  endpoint?: string;
  sensorId?: string;
  location?: string;
};

/** Sensor status and a contract-compatible simulator for the dashboard. */
export function SensorPanel({
  latestReading,
  onReadingSent,
  enableDemoReset = false,
  onDemoReset,
  endpoint = "/api/sensor-events",
  sensorId = "ldr_b204",
  location = "Room B-204",
}: SensorPanelProps) {
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const sliderId = `${panelId}-sim-value`;
  const [brightness, setBrightness] = useState(12);
  const [temperature, setTemperature] = useState(25);
  const [humidity, setHumidity] = useState(60);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [submittedReading, setSubmittedReading] = useState<LdrSensorEvent | null>(null);

  const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  async function sendReading(value: number, count = 1) {
    setBusy(true);
    setMessage("");
    let lastAction: string | undefined;
    try {
      for (let index = 0; index < count; index += 1) {
        if (index > 0) await pause(1000);
        const event: LdrSensorEvent = {
          sensor_id: sensorId,
          sensor_type: "ldr",
          metric: "brightness_pct",
          value,
          unit: "%",
          location,
          observed_at: new Date().toISOString(),
        };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });
        if (!response.ok) throw new Error(`Sensor endpoint returned ${response.status}`);
        const result: unknown = await response.json().catch(() => null);
        if (result && typeof result === "object" && "action" in result && typeof result.action === "string") lastAction = result.action;
        setSubmittedReading(event);
        onReadingSent?.(event, result);
        setMessage(`Accepted ${index + 1} of ${count} reading${count === 1 ? "" : "s"}${lastAction ? ` · API action: ${lastAction}` : ""}…`);
      }
      setMessage(`${count === 1 ? "Reading accepted" : `Accepted ${count} readings at 1-second intervals`}${lastAction ? ` · API action: ${lastAction}` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send reading.");
    } finally {
      setBusy(false);
    }
  }

  async function sendClimateReadings() {
    setBusy(true);
    setMessage("");
    const readings: SensorEvent[] = [
      { sensor_id: "dht11_b204", sensor_type: "dht11", metric: "temperature_c", value: temperature, unit: "°C", location, observed_at: new Date().toISOString() },
      { sensor_id: "dht11_b204", sensor_type: "dht11", metric: "humidity_pct", value: humidity, unit: "%", location, observed_at: new Date().toISOString() },
    ];
    try {
      for (const event of readings) {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
        if (!response.ok) throw new Error(`Sensor endpoint returned ${response.status}`);
        const result: unknown = await response.json().catch(() => null);
        onReadingSent?.(event, result);
      }
      setMessage("Temperature and humidity readings accepted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send climate readings.");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (!window.confirm("Clear demo sensor readings and pending sensor incidents?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error(`Demo reset returned ${response.status}`);
      setSubmittedReading(null);
      onDemoReset?.();
      setMessage("Demo sensor state reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset demo state.");
    } finally {
      setBusy(false);
    }
  }

  const shownReading = [latestReading, submittedReading]
    .filter((reading): reading is LdrSensorEvent => reading != null)
    .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at))[0];
  const shownValue = shownReading?.value;
  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">Room brightness</h2>
          <p className="mt-1 text-sm text-slate-500">{location} · {sensorId}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">LDR sensor</span>
      </div>

      <div className="mt-5 flex items-baseline gap-2" aria-live="polite">
        <span className="text-4xl font-semibold tabular-nums text-slate-900">
          {shownValue == null ? "—" : shownValue}
        </span>
        <span className="text-sm text-slate-500">% brightness</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {shownReading ? `Latest reading ${new Date(shownReading.observed_at).toLocaleTimeString()}${shownReading === submittedReading ? " · simulator" : ""}` : "Waiting for a reading from the sensor feed."}
      </p>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={sliderId} className="text-sm font-medium text-slate-800">Simulator fallback</label>
          <span className="text-sm tabular-nums text-slate-600">{brightness}%</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min="0"
          max="100"
          value={brightness}
          onChange={(event) => setBrightness(Number(event.target.value))}
          className="mt-3 w-full accent-blue-700"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void sendReading(brightness)} className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send reading"}
          </button>
          <button type="button" disabled={busy} onClick={() => { setBrightness(12); void sendReading(12, 3); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">3 dim samples (12%)</button>
          <button type="button" disabled={busy} onClick={() => { setBrightness(60); void sendReading(60, 3); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">3 bright samples (60%)</button>
          {enableDemoReset && <button type="button" disabled={busy} onClick={() => void resetDemo()} className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-800 disabled:opacity-50">Reset demo</button>}
        </div>
        <p className="mt-2 min-h-5 text-xs text-slate-500" role="status">{message}</p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-800">DHT11 simulator</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-600">Temperature (°C)
              <input type="number" min="0" max="50" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
            </label>
            <label className="text-xs text-slate-600">Humidity (%)
              <input type="number" min="0" max="100" step="0.1" value={humidity} onChange={(event) => setHumidity(Number(event.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
            </label>
          </div>
          <button type="button" disabled={busy} onClick={() => void sendClimateReadings()} className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Send temperature + humidity</button>
        </div>
      </div>
    </section>
  );
}
