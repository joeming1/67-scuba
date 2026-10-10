"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface TimelineEvent { message: string; created_at: string; }
interface Assignment { department_name?: string; technician_name?: string; technician_id?: string; }
interface CompletionVerification { state: string; reason?: string; photo_url?: string; }
interface Ticket {
  id: string;
  summary: string;
  description: string;
  status: string;
  location: string;
  scheduled_at: string | null;
  assignment: Assignment | null;
  timeline: TimelineEvent[];
  completion_verification?: CompletionVerification | null;
}

const escapeHtml = (v: string) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const statusText = (s: string) => String(s || "").replaceAll("_", " ");

export default function TechnicianPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notice, setNotice] = useState({ text: "", type: "" });
  const [busy, setBusy] = useState(false);
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const lastUpdatedRef = useRef("");

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  const fetchTicket = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/technician/tickets/${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load this ticket.");
    if (data.ticket.updated_at !== lastUpdatedRef.current) {
      lastUpdatedRef.current = data.ticket.updated_at;
      setTicket(data.ticket);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchTicket().catch((err) => setNotice({ text: err.message, type: "error" }));
    const interval = setInterval(() => fetchTicket().catch(() => {}), 5000);
    return () => clearInterval(interval);
  }, [token, fetchTicket]);

  const showNoticeMsg = (text: string, type = "") => setNotice({ text, type });

  async function photoDataUrl(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) throw new Error("Choose a photo from the camera or photo library.");
    if (typeof window === "undefined" || !window.createImageBitmap) throw new Error("This browser cannot prepare the photo. Try a recent version of Safari or Chrome.");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("Could not prepare the photo. Please choose another image.");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read the photo."));
      reader.readAsDataURL(blob);
    });
  }

  async function handleAction(action: string) {
    if (action === "showPhoto") {
      setShowPhotoPanel(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    setNotice({ text: "", type: "" });
    try {
      const payload: any = { action, technician_token: token };
      if (action === "accept") {
        const date = scheduledAt ? new Date(scheduledAt) : null;
        if (!date || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Choose a future visit date and time.");
        payload.scheduled_at = date.toISOString();
      }
      if (action === "decline" && !confirm("Decline this assignment and send it to the next technician?")) {
        setBusy(false);
        return;
      }
      if (action === "repair_attempted") payload.note = workNote || "";
      if (action === "complete_work") {
        if (!photoFile) throw new Error("Take or choose a completion photo first.");
        showNoticeMsg("Checking the photo with AI…");
        payload.evidence = { data_url: await photoDataUrl(photoFile) };
      }
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticket!.id)}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.ticket) {
        setTicket(data.ticket);
        lastUpdatedRef.current = data.ticket.updated_at;
      }
      if (!response.ok) throw new Error(data.error || "Could not update this ticket.");
      showNoticeMsg(action === "complete_work" ? "Photo passed AI verification. The ticket is complete." : "Ticket updated. The student has been notified by email.", "success");
      await fetchTicket();
    } catch (error: any) {
      showNoticeMsg(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return null;
  if (!ticket) return (
    <div className="ldr-page">
      <header><strong>FixitFelix</strong><p>Technician workspace</p></header>
      <main><section className="card"><p className="muted">Loading assigned ticket…</p></section></main>
      <Styles />
    </div>
  );

  const schedule = ticket.scheduled_at ? new Date(ticket.scheduled_at).toLocaleString() : "Not scheduled";
  const completion = ticket.completion_verification;
  const completionInfo = completion ? (
    <div className={`notice ${completion.state === "passed" ? "success" : "error"}`}>
      <strong>Photo check: {statusText(completion.state)}</strong><br />
      {completion.reason || ""}
    </div>
  ) : null;
  const photo = completion?.photo_url ? <img className="proof" src={completion.photo_url} alt="Submitted completion photo" /> : null;
  const events = (ticket.timeline || []).map((event, i) => (
    <div className="event" key={i}>{event.message}<small>{new Date(event.created_at).toLocaleString()}</small></div>
  ));

  let controls: React.ReactNode = null;
  if (ticket.status === "assigned") {
    controls = (
      <>
        <h2>Accept this assignment</h2>
        <p className="muted">Choose the planned visit time. The student will receive an email update.</p>
        <div className="field"><label htmlFor="scheduledAt">Visit date and time</label><input id="scheduledAt" type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
        <div className="actions"><button onClick={() => handleAction("accept")} disabled={busy}>Accept and schedule</button><button className="secondary" onClick={() => handleAction("decline")} disabled={busy}>Decline assignment</button></div>
      </>
    );
  } else if (ticket.status === "scheduled") {
    controls = (
      <>
        <h2>Work visit</h2>
        <p className="muted">Scheduled for {schedule}. Tap when you arrive to notify the student that work has started.</p>
        <div className="actions"><button onClick={() => handleAction("start_work")} disabled={busy}>I arrived — start work</button></div>
      </>
    );
  } else if (ticket.status === "in_progress") {
    controls = (
      <>
        <h2>Repair update</h2>
        <div className="field"><label htmlFor="workNote">Optional note for the student</label><textarea id="workNote" placeholder="Briefly describe what you found or tried" value={workNote} onChange={(e) => setWorkNote(e.target.value)} /></div>
        <div className="actions"><button className="secondary" onClick={() => handleAction("repair_attempted")} disabled={busy}>Record repair attempt</button><button onClick={() => handleAction("showPhoto")} disabled={busy}>Finish work with a photo</button></div>
        {showPhotoPanel && (
          <div className="field">
            <label htmlFor="completionPhoto">Completion photo</label>
            <input id="completionPhoto" type="file" accept="image/*" capture="environment" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            <span className="camera-note">On supported phones, this opens the rear camera. You can also choose an existing photo.</span>
            <button onClick={() => handleAction("complete_work")} disabled={busy || !photoFile}>Submit photo for AI check</button>
          </div>
        )}
      </>
    );
  } else if (ticket.status === "follow_up") {
    controls = (
      <>
        <h2>Follow-up needed</h2>
        <p className="muted">The issue is still open. Resume work, or submit a completion photo if it is now fixed.</p>
        <div className="actions"><button onClick={() => handleAction("start_work")} disabled={busy}>Resume work</button><button onClick={() => handleAction("showPhoto")} disabled={busy}>Finish work with a photo</button></div>
        {showPhotoPanel && (
          <div className="field">
            <label htmlFor="completionPhoto">Completion photo</label>
            <input id="completionPhoto" type="file" accept="image/*" capture="environment" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            <span className="camera-note">On supported phones, this opens the rear camera. You can also choose an existing photo.</span>
            <button onClick={() => handleAction("complete_work")} disabled={busy || !photoFile}>Submit photo for AI check</button>
          </div>
        )}
      </>
    );
  } else if (ticket.status === "verification_pending") {
    controls = (
      <>
        <h2>Verify the repair</h2>
        <p className="muted">Submit a clear photo of the repaired issue. Sensor tickets also need sensor confirmation.</p>
        <div className="field">
          <label htmlFor="completionPhoto">Completion photo</label>
          <input id="completionPhoto" type="file" accept="image/*" capture="environment" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          <span className="camera-note">On supported phones, this opens the rear camera. You can also choose an existing photo.</span>
          <button onClick={() => handleAction("complete_work")} disabled={busy || !photoFile}>Submit photo for AI check</button>
        </div>
      </>
    );
  } else if (ticket.status === "closed") {
    controls = <div className="notice success">This repair is complete and passed photo verification.</div>;
  }

  return (
    <div className="ldr-page">
      <header><strong>FixitFelix</strong><p>Technician workspace</p></header>
      <main>
        {notice.text && <div className={`notice ${notice.type}`} aria-live="polite">{notice.text}</div>}
        <section className="card">
          <div className="ticketline">
            <div>
              <div className="muted">{ticket.id} · {ticket.assignment?.department_name || ""}</div>
              <h1>{ticket.summary}</h1>
            </div>
            <span className={`pill status-${ticket.status}`}>{statusText(ticket.status)}</span>
          </div>
          <p className="muted">{ticket.description}</p>
          <div className="details">
            <div className="detail">Location<strong>{ticket.location}</strong></div>
            <div className="detail">Assigned technician<strong>{ticket.assignment?.technician_name || "Unassigned"}</strong></div>
            <div className="detail">Scheduled visit<strong>{schedule}</strong></div>
          </div>
          {completionInfo}
          {photo}
          {controls}
          <h2>Ticket activity</h2>
          {events.length > 0 ? events : <p className="muted">No updates yet.</p>}
        </section>
        <div className="footer">Use this private link to update the ticket. Students see the status and timeline on their own tracking page.</div>
      </main>
      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .ldr-page *{box-sizing:border-box}.ldr-page body{margin:0;background:#f3f6f8;color:#17212b;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .ldr-page header{background:#102b3f;color:white;padding:18px max(18px,calc((100vw - 760px)/2))}.ldr-page header strong{font-size:21px}.ldr-page header p{margin:4px 0 0;color:#c5d3dc;font-size:13px}
      .ldr-page main{max-width:760px;margin:24px auto;padding:0 16px}
      .ldr-page .card{background:white;border:1px solid #dce4e9;border-radius:15px;padding:22px;margin-bottom:14px;box-shadow:0 5px 20px #102b3f08}
      .ldr-page h1{margin:0 0 7px;color:#102b3f;font-size:24px}.ldr-page h2{font-size:17px;margin:20px 0 9px;color:#102b3f}
      .ldr-page .muted{color:#6c7c89;line-height:1.5}
      .ldr-page .ticketline{display:flex;justify-content:space-between;align-items:center;gap:12px}
      .ldr-page .pill{display:inline-block;padding:6px 10px;border-radius:20px;background:#e6f2ff;color:#236196;font-size:12px;font-weight:700;text-transform:capitalize;white-space:nowrap}
      .ldr-page .status-scheduled{background:#e9f7ef;color:#176b4b}.ldr-page .status-in_progress{background:#fff3db;color:#926112}.ldr-page .status-follow_up{background:#fff0e2;color:#9a510c}.ldr-page .status-closed{background:#e5f6ee;color:#147550}.ldr-page .status-verification_pending{background:#f1ebff;color:#6541a0}
      .ldr-page .details{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:17px}.ldr-page .detail{background:#f5f8fa;border-radius:9px;padding:11px;color:#6c7c89;font-size:12px}.ldr-page .detail strong{display:block;color:#243b49;font-size:14px;margin-top:4px;overflow-wrap:anywhere}
      .ldr-page .field{display:grid;gap:7px;margin:14px 0}.ldr-page .field label{font-weight:700;font-size:13px;color:#405462}.ldr-page .field input,.ldr-page .field textarea{width:100%;border:1px solid #cbd7de;border-radius:9px;padding:12px;font:inherit;color:#17212b;background:#fbfcfd}.ldr-page .field textarea{min-height:75px;resize:vertical}
      .ldr-page .camera-note{font-size:11px;color:#82919b;display:block;margin-top:5px}
      .ldr-page button{border:0;border-radius:9px;padding:12px 15px;background:#0e8a7a;color:white;font:inherit;font-weight:700;cursor:pointer}.ldr-page button.secondary{background:#fff0e2;color:#8c4a0a}.ldr-page button:disabled{opacity:.55;cursor:wait}
      .ldr-page .actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}.ldr-page .actions button{flex:1}
      .ldr-page .event{border-top:1px solid #edf1f3;padding:11px 0;color:#415562;line-height:1.45}.ldr-page .event small{display:block;color:#82919b;margin-top:3px}
      .ldr-page .notice{padding:12px;border-radius:9px;margin-bottom:12px;line-height:1.5}.ldr-page .notice.success{background:#e9f7ef;color:#176b4b}.ldr-page .notice.error{background:#fff0e2;color:#8c4a0a}
      .ldr-page .proof{max-width:100%;max-height:360px;border-radius:10px;margin-top:12px}
      .ldr-page .footer{text-align:center;color:#82919b;font-size:12px;padding:8px 18px 24px}
      @media(max-width:560px){.ldr-page header{padding:15px 17px}.ldr-page main{margin:13px auto;padding:0 10px}.ldr-page .card{padding:18px}.ldr-page .details{grid-template-columns:1fr}.ldr-page .ticketline{align-items:flex-start;flex-direction:column}.ldr-page .actions{display:grid;grid-template-columns:1fr}.ldr-page .actions button{width:100%}}
    `}</style>
  );
}
