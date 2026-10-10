"use client";
import { useState } from "react";

const escapeHtml = (v: string) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export default function StudentReportPage() {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; html: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/student-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description, location, email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit the issue.");
      setResult({
        ok: true,
        html: `<strong>${escapeHtml(data.ticket.id)} submitted.</strong><br>We'll send updates to your email. <a href="${escapeHtml(data.tracking_url)}" target="_blank" rel="noreferrer">Open your private ticket status page</a>`,
      });
      setDescription("");
      setLocation("");
      setEmail("");
    } catch (error: any) {
      setResult({ ok: false, html: escapeHtml(error.message) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ldr-page">
      <header><strong>FixFlow</strong><p>Campus maintenance help for students</p></header>
      <main>
        <section className="card">
          <h1>Report a maintenance issue</h1>
          <p className="muted">Tell us what needs fixing and where. We'll route it to the right technician and email you as the visit and repair progress.</p>
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="description">What is wrong?</label><textarea id="description" required minLength={4} placeholder="Example: The light in my room is not working." value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="field"><label htmlFor="location">Where is it?</label><input id="location" required placeholder="Building, room, or online service" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            <div className="field"><label htmlFor="email">Your email for updates</label><input id="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button type="submit" disabled={submitting}>Submit issue</button>
          </form>
          {result && <div className={result.ok ? "result" : "error"} aria-live="polite" dangerouslySetInnerHTML={{ __html: result.html }} />}
        </section>
        <section className="card">
          <h2>See the automatic lighting report</h2>
          <p className="muted">Run a one-time LDR demo: three dim readings create and route a lighting ticket automatically. No sensor demo runs until you start it.</p>
          <a className="demo-link" href="/sensor-demo">Run the LDR sensor demo</a>
        </section>
        <section className="card">
          <h2>Track your ticket</h2>
          <p className="muted" style={{ marginBottom: 0 }}>After submitting, use your private tracking link to see the scheduled visit, technician updates, and completion photo. Technicians receive their work controls separately by email.</p>
        </section>
      </main>
      <div className="footer">FixFlow · Student maintenance portal</div>
      <style>{`
        .ldr-page .demo-link{display:inline-block;border-radius:9px;padding:12px 16px;background:#0e8a7a;color:#fff;text-decoration:none;font-weight:700}
        .ldr-page *{box-sizing:border-box}.ldr-page body{margin:0;background:#f3f6f8;color:#17212b;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .ldr-page header{background:#102b3f;color:white;padding:22px max(20px,calc((100vw - 760px)/2))}.ldr-page header strong{font-size:22px}.ldr-page header p{margin:5px 0 0;color:#c5d3dc;font-size:13px}
        .ldr-page main{max-width:760px;margin:34px auto;padding:0 18px}
        .ldr-page .card{background:white;border:1px solid #dce4e9;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 5px 20px #102b3f08}
        .ldr-page h1{margin:0 0 8px;color:#102b3f;font-size:25px}.ldr-page h2{font-size:18px;margin:0 0 8px;color:#102b3f}
        .ldr-page .muted{color:#6c7c89;line-height:1.55;margin:0 0 20px}
        .ldr-page .field{display:grid;gap:7px;margin:16px 0}.ldr-page .field label{font-weight:700;font-size:13px;color:#405462}.ldr-page .field input,.ldr-page .field textarea{width:100%;border:1px solid #cbd7de;border-radius:9px;padding:12px;font:inherit;color:#17212b;background:#fbfcfd}.ldr-page .field textarea{min-height:110px;resize:vertical}
        .ldr-page button{width:100%;border:0;border-radius:9px;padding:13px;background:#0e8a7a;color:white;font:inherit;font-weight:700;cursor:pointer}.ldr-page button:disabled{opacity:.55;cursor:wait}
        .ldr-page .result{padding:14px;background:#e9f7ef;border-radius:10px;color:#176b4b;line-height:1.55;overflow-wrap:anywhere}.ldr-page .result a{color:#125b43;font-weight:700}
        .ldr-page .error{padding:12px;background:#fff0e2;border-radius:9px;color:#8c4a0a}
        .ldr-page .footer{text-align:center;color:#82919b;font-size:12px;padding:8px 18px 26px}
        @media(max-width:560px){.ldr-page header{padding:18px}.ldr-page .card{padding:20px;margin-bottom:12px}.ldr-page main{margin:20px auto;padding:0 12px}.ldr-page h1{font-size:22px}}
      `}</style>
    </div>
  );
}
