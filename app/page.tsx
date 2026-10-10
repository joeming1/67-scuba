"use client";
import { useMemo, useState, useEffect, useCallback } from "react";

type Status = "new" | "assigned" | "scheduled" | "in_progress" | "verification_pending" | "follow_up" | "closed" | "unassigned";
type Ticket = {
  id: string;
  source: string;
  summary: string;
  description: string;
  category: string;
  priority: string;
  location: string;
  status: Status;
  assignment?: { department_id: string; department_name: string; technician_id: string; technician_name: string; response?: string };
  verification?: { type: string; state: string; last_value: number; unit: string };
  completion_verification?: { state: string; reason?: string; photo_url?: string; confidence?: number } | null;
  timeline: { id: string; type: string; message: string; created_at: string }[];
  scheduled_at?: string | null;
  notification?: { channel: string; status: string } | null;
};

interface SensorState {
  sensor_id: string;
  value: number | null;
  location: string;
  low_count: number;
  recovery_count: number;
  observed_at: string;
  received_at: string;
}

const labels: Record<string, string> = {
  new: "Pending triage",
  assigned: "Assigned",
  scheduled: "Scheduled",
  in_progress: "In progress",
  verification_pending: "Verifying repair",
  follow_up: "Follow-up needed",
  closed: "Closed",
  unassigned: "Unassigned",
};

const categories: Record<string, string> = {
  lighting: "Lighting",
  air_conditioning: "Air conditioning",
  student_portal: "Student portal",
  other: "Other",
};

const time = (s: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(new Date(s));

export default function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [id, setId] = useState("");
  const [filter, setFilter] = useState("All tickets");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState("");
  const [email, setEmail] = useState("");
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ticketId: string; trackingUrl: string } | null>(null);

  // LDR sensor state
  const [sensor, setSensor] = useState<SensorState | null>(null);
  const [sensorBusy, setSensorBusy] = useState(false);
  const [sensorMsg, setSensorMsg] = useState({ text: "No readings sent yet.", error: false });

  const selected = tickets.find((t) => t.id === id) ?? tickets[0] ?? null;

  // Fetch tickets from API
  const refreshTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/sensor-events", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const s = (data.sensors || []).find((item: any) => item.sensor_id === "ldr_b204");
        if (s) setSensor(s);
      }
    } catch {}
  }, []);

  // Poll sensor state every 1.5s
  useEffect(() => {
    refreshTickets();
    const interval = setInterval(() => refreshTickets(), 1500);
    return () => clearInterval(interval);
  }, [refreshTickets]);

  const visible = useMemo(
    () =>
      tickets.filter(
        (t) =>
          (filter === "All tickets" ||
            (filter === "Needs attention" ? ["new", "follow_up", "verification_pending", "unassigned"].includes(t.status) : t.status === filter)) &&
          `${t.id} ${t.summary} ${t.location} ${t.category}`.toLowerCase().includes(query.toLowerCase())
      ),
    [tickets, filter, query]
  );

  const counts = {
    open: tickets.filter((t) => t.status !== "closed").length,
    triage: tickets.filter((t) => t.status === "new" || t.status === "unassigned").length,
    working: tickets.filter((t) => ["assigned", "scheduled", "in_progress", "verification_pending", "follow_up"].includes(t.status)).length,
    closed: tickets.filter((t) => t.status === "closed").length,
  };

  function notice(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 5000);
  }

  // Submit a student report
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { description: desc.trim(), location: loc.trim(), email: email.trim() };
    if (!body.description || !body.location || !body.email) return;
    try {
      const r = await fetch("/api/student-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not submit.");
      setSubmitResult({ ticketId: data.ticket.id, trackingUrl: data.tracking_url });
      notice(`Report submitted: ${data.ticket.id}`);
      // Add to local ticket list
      const newTicket: Ticket = { ...data.ticket, timeline: data.ticket.timeline || [] };
      setTickets((p) => [newTicket, ...p]);
      setId(data.ticket.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not connect to the server.";
      notice(`Submission failed: ${msg}`);
    }
    setDesc("");
    setLoc("");
    setEmail("");
    setModal(false);
  }

  // LDR sensor demo controls
  const sendReading = useCallback(async (brightness: number) => {
    const response = await fetch("/api/sensor-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sensor_id: "ldr_b204",
        sensor_type: "ldr",
        metric: "brightness_pct",
        value: brightness,
        unit: "%",
        location: "Room B-204",
        observed_at: new Date().toISOString(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not send the sensor reading.");
    if (data.sensor) setSensor(data.sensor);
    return data;
  }, []);

  const simulate = useCallback(
    async (brightness: number, label: string) => {
      setSensorBusy(true);
      setSensorMsg({ text: `Sending three ${label} readings...`, error: false });
      try {
        let result: any;
        for (let i = 0; i < 3; i++) result = await sendReading(brightness);
        const assignment =
          result.action === "created"
            ? " Lighting ticket created and routed to a technician."
            : result.ticket_id
              ? " Open lighting incident was updated."
              : " No open lighting incident is currently linked to this sensor.";
        const tracker = result.tracking_url ? ` Track it: ${result.tracking_url}` : "";
        setSensorMsg({ text: `Three readings sent.${assignment}${tracker}`, error: false });
      } catch (error: any) {
        setSensorMsg({ text: error.message, error: true });
      } finally {
        setSensorBusy(false);
      }
    },
    [sendReading]
  );

  const sensorValue = sensor?.value ?? null;
  const sensorLive = sensor ? Date.now() - Date.parse(sensor.received_at || sensor.observed_at) <= 6000 : false;

  return (
    <main className="shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">f</span>
          <div>
            <b>fixflow</b>
            <small>CAMPUS OPS</small>
          </div>
        </div>
        <div className="workspace">
          <span className="campus">N</span>
          <div>
            <b>Northbridge Campus</b>
            <small>Facilities workspace</small>
          </div>
          <span className="down">⌄</span>
        </div>
        <div className="navlabel">WORKSPACE</div>
        <nav>
          <a className="active">▦ <span>Overview</span></a>
          <a onClick={() => setFilter("All tickets")}>▤ <span>All tickets</span><i>{counts.open}</i></a>
          <a onClick={() => setFilter("verification_pending")}>☼ <span>LDR sensors</span></a>
          <a>♧ <span>Technicians</span></a>
        </nav>
        <div className="navlabel views">VIEWS</div>
        <nav>
          <a onClick={() => setFilter("Needs attention")}>● <span>Needs attention</span><i>{counts.triage + tickets.filter((t) => t.status === "follow_up").length}</i></a>
          <a onClick={() => setFilter("closed")}>● <span>Recently closed</span></a>
        </nav>
        <div className="sidebottom">
          <div className="help">
            <b>Need a hand?</b>
            <p>See how FixFlow keeps campus moving.</p>
            <a>Explore the guide ↗</a>
          </div>
          <div className="profile">
            <span className="avatar">JD</span>
            <div>
              <b>Jordan Davis</b>
              <small>Facilities manager</small>
            </div>
          </div>
        </div>
      </aside>

      {/* Main section */}
      <section className="main">
        <header className="topbar">
          <a className="brandWord" href="#"><span className="brandGlyph">F</span>FixFlow</a>
          <nav className="topnav">
            <button className="topnavActive" onClick={() => setFilter("All tickets")}>Overview</button>
            <button onClick={() => setFilter("All tickets")}>Queue</button>
            <button onClick={() => setFilter("Needs attention")}>Needs attention</button>
            <button onClick={() => setFilter("closed")}>Resolved</button>
          </nav>
          <div className="headerRight">
            <span className="live">Demo live</span>
            <button className="downloadButton" onClick={() => { setSubmitResult(null); setModal(true); }}>New report</button>
          </div>
        </header>

        <div className="content">
          {/* Hero */}
          <div className="welcome">
            <div className="heroCopy">
              <div className="eyebrow">FIXFLOW | NORTHBRIDGE CAMPUS</div>
              <h1>Campus, under control<span>.</span></h1>
              <p>One place to report issues, track repairs, and keep campus moving.</p>
            </div>
            <button className="primary" onClick={() => { setSubmitResult(null); setModal(true); }}>Submit a request</button>
          </div>

          {/* Stats */}
          <div className="stats">
            <article><small>Open tickets</small><b>{counts.open}</b><span>Across campus</span></article>
            <article><small>Awaiting triage</small><b>{counts.triage}</b><span>Ready for routing</span></article>
            <article><small>In progress</small><b>{counts.working}</b><span>Assigned or being repaired</span></article>
            <article><small>Resolved</small><b>{counts.closed}</b><span>Verified and closed</span></article>
          </div>

          {/* LDR Sensor Demo Panel — integrated into dashboard */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 420px", border: "1px solid #e8e8e5", borderRadius: "8px", padding: "20px", background: "#fbfffc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <b style={{ fontSize: "16px" }}>LDR Sensor Demo</b>
                  <br />
                  <small style={{ color: "#777", fontSize: "12px" }}>Room B-204 · Simulate brightness readings</small>
                </div>
                <span style={{ fontSize: "11px", color: sensorLive ? "#176b4b" : "#777", background: sensorLive ? "#e5f6ee" : "#f0f0ed", padding: "5px 10px", borderRadius: "20px", fontWeight: 600 }}>
                  {sensorLive ? "● Live" : "○ Waiting"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", borderRadius: "11px", background: "#eff8f6", marginBottom: "14px" }}>
                <div>
                  <span style={{ color: "#6c7c89", fontSize: "12px" }}>Latest brightness</span>
                  <br />
                  <span style={{ color: "#6c7c89", fontSize: "11px" }}>
                    {sensor ? `${sensor.location} · ${sensor.low_count} low / ${sensor.recovery_count} recovery samples` : "No readings yet"}
                  </span>
                </div>
                <strong style={{ fontSize: "28px", color: "#0e8a7a" }}>{sensorValue !== null ? `${sensorValue}%` : "--%"}</strong>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  disabled={sensorBusy}
                  onClick={() => simulate(12, "low")}
                  style={{ flex: 1, border: 0, borderRadius: "9px", padding: "12px", background: "#0e8a7a", color: "white", fontWeight: 700, cursor: sensorBusy ? "wait" : "pointer", opacity: sensorBusy ? 0.55 : 1, fontSize: "13px" }}
                >
                  Run demo — simulate dim room
                </button>
                <button
                  disabled={sensorBusy}
                  onClick={() => simulate(75, "bright")}
                  style={{ flex: 1, border: 0, borderRadius: "9px", padding: "12px", background: "#eaf1f4", color: "#102b3f", fontWeight: 700, cursor: sensorBusy ? "wait" : "pointer", opacity: sensorBusy ? 0.55 : 1, fontSize: "13px" }}
                >
                  Send bright readings
                </button>
              </div>
              {sensorMsg.text !== "No readings sent yet." && (
                <div style={{ marginTop: "10px", padding: "10px", background: sensorMsg.error ? "#fff0e2" : "#f5f8fa", borderRadius: "9px", color: sensorMsg.error ? "#8c4a0a" : "#415562", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {sensorMsg.text}
                </div>
              )}
              <p style={{ fontSize: "11px", color: "#6c7c89", marginTop: "10px", lineHeight: 1.5 }}>
                After a technician records a repair attempt, send bright readings to verify recovery. A sensor recovery AND an AI-approved completion photo are both required to close a sensor ticket.
              </p>
            </div>
          </div>

          {/* Grid: ticket queue + detail */}
          <div className="grid">
            {/* Ticket queue */}
            <section className="panel queue">
              <div className="panelhead">
                <div><b>Ticket queue <em>{visible.length}</em></b><small>Track and manage campus requests</small></div>
                <button className="quiet">···</button>
              </div>
              <div className="tools">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="⌕  Search tickets..." />
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option>All tickets</option>
                  <option>Needs attention</option>
                  <option value="new">Pending triage</option>
                  <option value="assigned">Assigned</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In progress</option>
                  <option value="verification_pending">Verifying</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="rows">
                {visible.length === 0 ? (
                  <div style={{ padding: "30px", textAlign: "center", color: "#999" }}>No tickets yet. Submit a report or run the LDR demo.</div>
                ) : (
                  visible.map((t) => (
                    <button key={t.id} className={`row ${id === t.id ? "chosen" : ""}`} onClick={() => { setId(t.id); setMobile(true); }}>
                      <span className={`glyph ${t.category}`}>{t.category === "lighting" ? "☼" : t.category === "student_portal" ? "▣" : t.category === "air_conditioning" ? "❄" : "✳"}</span>
                      <span className="rowmain"><b>{t.summary}</b><small>{t.id} · {t.location} · {time(t.created_at)}</small></span>
                      <span className={`priority ${t.priority}`}>{t.priority}</span>
                      <span className={`status ${t.status}`}>{t.status === "new" ? "● " : ""}{labels[t.status] || t.status}</span>
                      <span className="arrow">›</span>
                    </button>
                  ))
                )}
              </div>
              <footer>Showing <b>{visible.length}</b> of <b>{tickets.length}</b> tickets <button onClick={() => { setFilter("All tickets"); setQuery(""); }}>View all →</button></footer>
            </section>

            {/* Detail panel */}
            <section className={`panel detail ${mobile ? "mobileShow" : ""}`}>
              {selected ? (
                <>
                  <div className="detailtop">
                    <span>REQUEST <em>{selected.id}</em></span>
                    <button className="back" onClick={() => setMobile(false)}>← Queue</button>
                    <button className="quiet">···</button>
                  </div>
                  <h2>{selected.summary}</h2>
                  <div className="badges">
                    <span className={`status ${selected.status}`}>{labels[selected.status] || selected.status}</span>
                    <span className={`priority ${selected.priority}`}>{selected.priority} priority</span>
                  </div>

                  {/* Sensor verification status — shows the full LDR verification flow */}
                  {selected.verification && (
                    <div className="evidence">
                      <span>☼</span>
                      <div>
                        <b>Repair verification (LDR sensor)</b>
                        <small>Latest brightness reading</small>
                      </div>
                      <strong>{selected.verification.last_value}{selected.verification.unit}
                        <small className={selected.verification.state}>{selected.verification.state}</small>
                      </strong>
                    </div>
                  )}

                  {/* AI photo verification status */}
                  {selected.completion_verification && (
                    <div className="evidence" style={{ background: selected.completion_verification.state === "passed" ? "#e5f6ee" : "#fff0e2" }}>
                      <span>📸</span>
                      <div>
                        <b>AI photo check</b>
                        <small>{selected.completion_verification.reason || selected.completion_verification.state}</small>
                        {selected.completion_verification.photo_url && (
                          <div style={{ marginTop: "8px" }}>
                            <img src={selected.completion_verification.photo_url} alt="Completion evidence" style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px" }} />
                          </div>
                        )}
                      </div>
                      <strong style={{ fontSize: "13px" }}>{selected.completion_verification.state}</strong>
                    </div>
                  )}

                  {/* Verification flow explanation */}
                  {selected.source === "sensor" && selected.status === "verification_pending" && (
                    <div className="triage">
                      <span>☼</span>
                      <div>
                        <b>Awaiting LDR sensor verification</b>
                        <small>The technician submitted a repair. Send 3 bright readings (&ge;40%) from the LDR demo above to verify recovery and close this ticket.</small>
                      </div>
                    </div>
                  )}
                  {selected.source === "sensor" && selected.completion_verification?.state === "passed" && selected.verification?.state !== "passed" && (
                    <div className="triage">
                      <span>📸</span>
                      <div>
                        <b>AI photo passed — awaiting sensor recovery</b>
                        <small>The completion photo was approved, but the LDR sensor hasn't confirmed brightness recovery yet. Send bright readings to verify.</small>
                      </div>
                    </div>
                  )}

                  <div className="section">
                    <b>Request details</b>
                    <p>{selected.description}</p>
                    <div className="metas">
                      <div><small>⌖ Location</small><b>{selected.location}</b></div>
                      <div><small>▦ Category</small><b>{categories[selected.category] || selected.category}</b></div>
                      <div><small>♙ Source</small><b>{selected.source === "sensor" ? "Room sensor" : "Student report"}</b></div>
                    </div>
                  </div>

                  <div className="section">
                    <b>Assignment</b>
                    {selected.assignment ? (
                      <div className="assign">
                        <span>⌂</span>
                        <div><b>{selected.assignment.department_name}</b><small>Department</small></div>
                        <div className="tech"><b>{selected.assignment.technician_name}</b><small>{selected.assignment.technician_id}</small></div>
                      </div>
                    ) : (
                      <p className="empty">No technician assigned yet.</p>
                    )}
                  </div>

                  {/* Real timeline from API */}
                  <div className="section activity">
                    <b>Activity <em>{selected.timeline?.length || 0}</em></b>
                    <div className="events">
                      {(selected.timeline || []).map((e, i) => (
                        <div className="event" key={i}>
                          <span className={e.type}>{e.type === "created" ? "✓" : e.type === "assigned" ? "⌂" : e.type === "notification" ? "✉" : e.type === "scheduled" ? "◷" : e.type === "work_started" ? "✴" : e.type === "verification" ? "☼" : e.type === "follow_up" ? "↻" : e.type === "closed" ? "✓" : "•"}</span>
                          <div><b>{e.message}</b></div>
                          <time>{new Date(e.created_at).toLocaleString()}</time>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
                  <p>No ticket selected.</p>
                  <p style={{ fontSize: "12px", marginTop: "8px" }}>Submit a request or run the LDR demo to create a ticket.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </section>

      {/* Modal: submit report */}
      {modal && (
        <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <form className="modal" onSubmit={submit}>
            <button type="button" className="close" onClick={() => setModal(false)}>×</button>
            <small>CAMPUS HELP</small>
            <h2>Submit a request</h2>
            <p>Tell us what's happening and where. We'll route it to the right team.</p>
            <label>What needs attention?<textarea required maxLength={600} rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the issue in a few words..." /></label>
            <label>Where is it happening?<input required maxLength={120} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Building, room, or 'Online'" /></label>
            <label>Your email for updates<input required type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <div className="modalfoot"><span>✳ Routed by FixFlow</span><button className="primary">Send report →</button></div>
          </form>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">✓ &nbsp;{toast}</div>}

      {/* Success result */}
      {submitResult && (
        <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) setSubmitResult(null); }}>
          <div className="modal">
            <button type="button" className="close" onClick={() => setSubmitResult(null)}>×</button>
            <small>CAMPUS HELP</small>
            <h2>Report submitted</h2>
            <p style={{ color: "#6c7c89", lineHeight: 1.55, margin: "0 0 12px" }}>Your ticket <strong style={{ color: "#17212b" }}>{submitResult.ticketId}</strong> has been created and routed to the right team.</p>
            <div style={{ padding: "14px", background: "#e9f7ef", borderRadius: "10px", color: "#176b4b", lineHeight: "1.55", marginBottom: "12px" }}>
              <strong>Track your ticket:</strong><br />
              <a href={submitResult.trackingUrl} target="_blank" rel="noreferrer" style={{ color: "#125b43", fontWeight: 700, wordBreak: "break-all" }}>{submitResult.trackingUrl}</a>
            </div>
            <p style={{ color: "#6c7c89", lineHeight: 1.55, margin: "0 0 16px" }}>Updates will be sent to your email as the technician works on your issue.</p>
            <button className="primary" onClick={() => setSubmitResult(null)}>Done</button>
          </div>
        </div>
      )}
    </main>
  );
}
