"use client";
import { useState, useEffect, useCallback } from "react";

interface TimelineEvent { message: string; created_at: string; }
interface Ticket {
  id: string;
  summary: string;
  status: string;
  location: string;
  description: string;
  scheduled_at: string | null;
  timeline: TimelineEvent[];
  completion_verification?: { state: string; reason?: string; photo_url?: string } | null;
}

const escapeHtml = (v: string) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function StudentTicketPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/student/tickets/${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load this ticket.");
    setTicket(data.ticket);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refresh().catch((err) => setError(err.message));
    const interval = setInterval(() => refresh().catch(() => {}), 2500);
    return () => clearInterval(interval);
  }, [token, refresh]);

  if (error) return <div className="ldr-page"><div className="card"><p className="error">{error}</p></div><Styles /></div>;
  if (!ticket) return <div className="ldr-page"><header><strong>FixitFelix</strong><div>Student ticket updates</div></header><main><div className="card"><p className="muted">Loading your ticket…</p></div></main><Styles /></div>;

  const statusText = ticket.status.replaceAll("_", " ");
  const events = ticket.timeline.map((event, i) => (
    <div className="event" key={i}>{event.message}<small>{new Date(event.created_at).toLocaleString()}</small></div>
  ));
  const photo = ticket.completion_verification?.photo_url ? <img className="proof" src={ticket.completion_verification.photo_url} alt="Technician completion photo" /> : null;
  const schedule = ticket.scheduled_at ? <p className="muted"><strong>Scheduled visit:</strong> {new Date(ticket.scheduled_at).toLocaleString()}</p> : null;

  return (
    <div className="ldr-page">
      <header><strong>FixitFelix</strong><div>Student ticket updates</div></header>
      <main>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "15px", alignItems: "center" }}>
            <div>
              <div className="muted">{ticket.id}</div>
              <h1>{ticket.summary}</h1>
            </div>
            <span className={`pill status-${ticket.status}`}>{statusText}</span>
          </div>
          <p className="muted">Location: {ticket.location}</p>
          {schedule}
          <p className="muted">{ticket.status === "closed" ? "Your reported issue is complete." : "This page updates automatically as the technician works on your issue."}</p>
          {photo && <><h3>Completion evidence</h3>{photo}</>}
          <div className="timeline"><h3>Updates</h3>{events}</div>
        </div>
      </main>
      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .ldr-page *{box-sizing:border-box}.ldr-page body{margin:0;background:#f3f6f8;color:#17212b;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .ldr-page header{padding:20px max(20px,calc((100vw - 760px)/2));background:#102b3f;color:white}.ldr-page header strong{font-size:20px}
      .ldr-page main{max-width:760px;margin:28px auto;padding:0 18px}
      .ldr-page .card{background:white;border:1px solid #dce4e9;border-radius:14px;padding:22px;margin-bottom:14px}
      .ldr-page h1{margin:0 0 8px;color:#102b3f;font-size:22px}.ldr-page h3{margin:16px 0 8px;color:#102b3f;font-size:15px}
      .ldr-page .muted{color:#6c7c89;line-height:1.5}
      .ldr-page .pill{display:inline-block;padding:6px 11px;border-radius:20px;background:#e6f2ff;color:#236196;font-size:12px;font-weight:700;text-transform:capitalize}
      .ldr-page .status-closed{background:#e5f6ee;color:#147550}.ldr-page .status-follow_up{background:#fff0e2;color:#9a510c}.ldr-page .status-in_progress{background:#fff3db;color:#926112}.ldr-page .status-verification_pending{background:#f1ebff;color:#6541a0}.ldr-page .status-scheduled{background:#e9f7ef;color:#176b4b}.ldr-page .status-assigned{background:#e6f2ff;color:#236196}
      .ldr-page .timeline{border-top:1px solid #edf1f3;padding-top:12px}.ldr-page .event{padding:9px 0;border-bottom:1px solid #f0f3f5;color:#415562;line-height:1.45}.ldr-page .event small{display:block;color:#82919b;margin-top:3px}
      .ldr-page .proof{max-width:100%;max-height:360px;border-radius:10px;margin-top:12px}
      .ldr-page .error{color:#a13232}
    `}</style>
  );
}
