'use client';

import { useCallback, useEffect, useState } from "react";
import { SensorPanel, type LdrSensorEvent, type SensorEvent } from "../sensor/SensorPanel";

type Snapshot = { latest_event: SensorEvent | null; events: SensorEvent[]; pending_incidents: Array<{ incident_id: string; summary: string }> };

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ latest_event: null, events: [], pending_incidents: [] });
  const [feedError, setFeedError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/sensor-events", { cache: "no-store" });
      if (!response.ok) throw new Error(`Sensor feed returned ${response.status}`);
      setSnapshot(await response.json() as Snapshot);
      setFeedError("");
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : "Sensor feed is unavailable.");
    }
  }, []);

  const latestClimate = (metric: "temperature_c" | "humidity_pct") => snapshot.events.find((event) => event.metric === metric);
  const temperature = latestClimate("temperature_c");
  const humidity = latestClimate("humidity_pct");
  const latestBrightness = snapshot.events.find((event): event is LdrSensorEvent => event.metric === "brightness_pct") ?? null;

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">FixFlow · Sensor integration</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">Room sensor demo</h1>
        <p className="mt-2 max-w-2xl text-slate-600">LDR readings can trigger a lighting incident after three low samples. DHT11 temperature and humidity are displayed as room telemetry.</p>
      </header>
      <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
        <SensorPanel
          latestReading={latestBrightness}
          enableDemoReset={process.env.NODE_ENV !== "production"}
          onReadingSent={() => void refresh()}
          onDemoReset={() => { setSnapshot({ latest_event: null, events: [], pending_incidents: [] }); void refresh(); }}
        />
        <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Sensor feed</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Temperature</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{temperature ? `${temperature.value} °C` : "—"}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Humidity</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{humidity ? `${humidity.value}%` : "—"}</p></div>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Events received</dt><dd className="font-semibold tabular-nums">{snapshot.events.length}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Pending sensor incidents</dt><dd className="font-semibold tabular-nums">{snapshot.pending_incidents.length}</dd></div>
          </dl>
          {feedError && <p className="mt-4 text-sm text-rose-700" role="alert">{feedError}</p>}
          {snapshot.pending_incidents.length > 0 && <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">{snapshot.pending_incidents.map((incident) => <li key={incident.incident_id} className="text-slate-700">{incident.summary}</li>)}</ul>}
        </aside>
      </section>
      <p className="mt-8 text-xs text-slate-500">Demo identities and locations are placeholders. This screen is only the sensor integration surface; ticket queue and technician views remain separate.</p>
    </main>
  );
}
