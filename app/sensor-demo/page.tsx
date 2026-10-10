"use client";
import { useState, useEffect, useCallback } from "react";

const escapeHtml = (v: string) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function SensorDemoPage() {
  const [readingValue, setReadingValue] = useState("--%");
  const [readingNote, setReadingNote] = useState("Waiting for a reading");
  const [feedStatus, setFeedStatus] = useState("Connecting to sensor feed…");
  const [feedColor, setFeedColor] = useState("#6c7c89");
  const [message, setMessage] = useState({ text: "No readings sent yet.", error: false, html: false });
  const [busy, setBusy] = useState(false);

  const renderSensor = useCallback((sensor: any) => {
    setReadingValue(sensor.value + "%");
    const updatedAt = sensor.received_at || sensor.observed_at;
    const ageMs = Date.now() - Date.parse(updatedAt);
    const time = Number.isFinite(ageMs) ? new Date(updatedAt).toLocaleTimeString() : "time unavailable";
    const live = Number.isFinite(ageMs) && ageMs <= 6000;
    setReadingNote(`${sensor.location || "Unknown location"} · last received ${time} · ${sensor.low_count || 0} low / ${sensor.recovery_count || 0} recovery samples`);
    setFeedStatus(live ? "Live · receiving sensor readings" : "Waiting for the next sensor reading");
    setFeedColor(live ? "#176b4b" : "#6c7c89");
  }, []);

  const refreshSensor = useCallback(async () => {
    try {
      const response = await fetch("/api/sensor-events", { cache: "no-store" });
      if (!response.ok) throw new Error("Sensor feed returned " + response.status);
      const data = await response.json();
      const sensor = (data.sensors || []).find((item: any) => item.sensor_id === "ldr_b204");
      if (sensor) renderSensor(sensor);
      else {
        setReadingValue("--%");
        setReadingNote("No readings received yet");
        setFeedStatus("Waiting for sensor readings");
        setFeedColor("#6c7c89");
      }
    } catch {
      setFeedStatus("Sensor feed unavailable");
      setFeedColor("#8c4a0a");
    }
  }, [renderSensor]);

  const sendReading = useCallback(async (brightness: number) => {
    const response = await fetch("/api/sensor-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sensor_id: "ldr_b204", sensor_type: "ldr", metric: "brightness_pct", value: brightness, unit: "%", location: "Room B-204", observed_at: new Date().toISOString() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not send the sensor reading.");
    renderSensor(data.sensor);
    return data;
  }, [renderSensor]);

  const simulate = useCallback(async (brightness: number, label: string) => {
    setBusy(true);
    setMessage({ text: `Sending three ${label} readings…`, error: false, html: false });
    try {
      let result: any;
      for (let i = 0; i < 3; i++) result = await sendReading(brightness);
      const status = result.ticket_id ? ` Ticket ${escapeHtml(result.ticket_id)}.` : "";
      const tracker = result.tracking_url ? ` <a href="${escapeHtml(result.tracking_url)}" target="_blank" rel="noreferrer">Open its private status page</a>.` : "";
      const assignment = result.action === "created" ? " The lighting incident was routed to a technician." : result.ticket_id ? " The open lighting incident was updated." : " No open lighting incident is currently linked to this sensor.";
      setMessage({ text: escapeHtml("Three readings sent." + assignment + status) + tracker, error: false, html: true });
    } catch (error: any) {
      setMessage({ text: error.message, error: true, html: false });
    } finally {
      setBusy(false);
    }
  }, [sendReading]);

  useEffect(() => {
    refreshSensor();
    const interval = setInterval(() => refreshSensor(), 1500);
    return () => clearInterval(interval);
  }, [refreshSensor]);

  return (
    <div className="sensor-demo-page">
      <header><strong>FixitFelix</strong><p>LDR sensor demo · Room B-204</p></header>
      <main>
        <section className="card">
          <h1>Simulate room brightness</h1>
          <p className="muted">This is a manual, one-time demo. Click once to send three low readings and create a lighting ticket; nothing samples or submits in the background. The ESP32 can use the same API while powered on.</p>
          <div className="reading">
            <div>
              <span>Latest received brightness</span><br />
              <span>{readingNote}</span><br />
              <span role="status" style={{ color: feedColor }}>{feedStatus}</span>
            </div>
            <strong>{readingValue}</strong>
          </div>
          <div className="actions">
            <button disabled={busy} onClick={() => simulate(12, "low")}>Run demo — simulate dim room</button>
            <button className="secondary" disabled={busy} onClick={() => simulate(75, "bright")}>Send bright readings</button>
          </div>
          <p className="note">For the verification step, send bright readings after the technician records a repair attempt. A sensor recovery and an AI-approved completion photo are both required to close a sensor ticket.</p>
          <p className="note"><a href="/sensor-calibrate">Open the LDR calibration helper</a> · Physical sensor setup is in <code>sensor/README.md</code>.</p>
        </section>
        <section className="card">
          <h2>Latest result</h2>
          <div className={message.error ? "message error" : "message"} dangerouslySetInnerHTML={message.html ? { __html: message.text } : undefined}>{message.html ? undefined : message.text}</div>
        </section>
        <div className="footer">LDR demo controls are separate from the student portal.</div>
      </main>
      <style>{`
        .sensor-demo-page *{box-sizing:border-box}.sensor-demo-page body{margin:0;background:#f3f6f8;color:#17212b;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .sensor-demo-page header{background:#102b3f;color:white;padding:18px max(18px,calc((100vw - 760px)/2))}.sensor-demo-page header strong{font-size:21px}.sensor-demo-page header p{margin:4px 0 0;color:#c5d3dc;font-size:13px}
        .sensor-demo-page main{max-width:760px;margin:25px auto;padding:0 16px}
        .sensor-demo-page .card{background:white;border:1px solid #dce4e9;border-radius:15px;padding:22px;margin-bottom:14px}
        .sensor-demo-page h1{margin:0 0 8px;color:#102b3f;font-size:24px}.sensor-demo-page h2{font-size:17px;margin:20px 0 9px;color:#102b3f}
        .sensor-demo-page .muted{color:#6c7c89;line-height:1.5}
        .sensor-demo-page .reading{display:flex;justify-content:space-between;align-items:center;padding:17px;border-radius:11px;background:#eff8f6;margin:18px 0}.sensor-demo-page .reading strong{font-size:30px;color:#0e8a7a}.sensor-demo-page .reading span{color:#6c7c89;font-size:13px}
        .sensor-demo-page .actions{display:flex;gap:10px}.sensor-demo-page button{flex:1;border:0;border-radius:9px;padding:13px 14px;background:#0e8a7a;color:white;font:inherit;font-weight:700;cursor:pointer}.sensor-demo-page button.secondary{background:#eaf1f4;color:#102b3f}.sensor-demo-page button:disabled{opacity:.55;cursor:wait}
        .sensor-demo-page .message{min-height:55px;padding:13px;background:#f5f8fa;border-radius:9px;color:#415562;line-height:1.5;overflow-wrap:anywhere}.sensor-demo-page .message a{color:#125b43;font-weight:700}.sensor-demo-page .message.error{background:#fff0e2;color:#8c4a0a}
        .sensor-demo-page .note{font-size:12px;color:#6c7c89;line-height:1.5;margin:14px 0 0}.sensor-demo-page .note a{color:#0e8a7a}
        .sensor-demo-page .footer{text-align:center;color:#82919b;font-size:12px;padding:8px 18px 24px}
        @media(max-width:560px){.sensor-demo-page header{padding:15px 17px}.sensor-demo-page main{margin:14px auto;padding:0 10px}.sensor-demo-page .card{padding:18px}.sensor-demo-page .actions{display:grid}}
      `}</style>
    </div>
  );
}
