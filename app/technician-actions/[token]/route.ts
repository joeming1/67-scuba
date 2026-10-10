import { NextRequest, NextResponse } from "next/server";
import {
  loadState,
  persistTicket,
  findTechnicianActionTicket,
  applyAssignmentResponse,
  emailStudentUpdate,
  escapeHtml,
  requestBaseUrl,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function technicianActionPage({ ticket = null, token, choice, message = "", status = 200, success = false, scheduledAt = "" }: {
  ticket?: any;
  token: string;
  choice: string;
  message?: string;
  status?: number;
  success?: boolean;
  scheduledAt?: string;
}) {
  const isAccept = choice === "accept";
  const actionTitle = isAccept ? "Accept and schedule this fix" : "Decline this ticket";
  const safeMessage = message ? `<div class="message">${escapeHtml(message)}</div>` : "";
  const ticketDetails = ticket
    ? `<dl><dt>Ticket</dt><dd>${escapeHtml(ticket.id)}</dd><dt>Issue</dt><dd>${escapeHtml(ticket.summary)}</dd><dt>Location</dt><dd>${escapeHtml(ticket.location)}</dd><dt>Assigned to</dt><dd>${escapeHtml(ticket.assignment.technician_name)}</dd></dl>`
    : "";
  let content: string;
  if (success) {
    content = `<div class="success">${escapeHtml(message)}</div><p>You can close this page.</p>`;
  } else if (ticket && isAccept) {
    content = `${safeMessage}${ticketDetails}<form method="post" action="/technician-actions/${encodeURIComponent(token)}"><input type="hidden" name="action" value="accept"><input type="hidden" id="scheduled_at" name="scheduled_at"><label for="scheduled_local">Choose a visit date and time</label><input id="scheduled_local" type="datetime-local" required value="${escapeHtml(scheduledAt)}"><p style="color:#6c7c89;font-size:12px">Time is interpreted in this device's local timezone.</p><button type="submit">Accept &amp; schedule</button></form>`;
  } else if (ticket) {
    content = `${safeMessage}${ticketDetails}<form method="post" action="/technician-actions/${encodeURIComponent(token)}"><input type="hidden" name="action" value="decline"><p>Declining sends the ticket to the next available technician in this department.</p><button class="decline" type="submit">Confirm decline</button></form>`;
  } else {
    content = `<div class="message">${message ? escapeHtml(message) : "This assignment was already handled, reassigned, or reset. Open the latest assignment email if one was sent."}</div>`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FixitFelix technician response</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#17212b;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{max-width:520px;margin:7vh auto;padding:26px;background:white;border:1px solid #dce4e9;border-radius:16px;box-shadow:0 8px 30px #102b3f12}h1{margin:0 0 8px;color:#102b3f;font-size:24px}.lead{color:#6c7c89;line-height:1.5;margin:0 0 20px}dl{display:grid;grid-template-columns:110px 1fr;gap:9px;margin:18px 0;padding:15px;background:#eff6f8;border-radius:10px}dt{font-size:13px;color:#6c7c89}dd{margin:0;font-size:14px;font-weight:650;overflow-wrap:anywhere}label{display:block;margin:14px 0 7px;font-weight:650;font-size:14px}input[type=datetime-local]{width:100%;padding:12px;border:1px solid #cbd7de;border-radius:8px;font:inherit}button{width:100%;margin-top:15px;padding:13px;border:0;border-radius:9px;background:#0e8a7a;color:white;font-size:16px;font-weight:700}.decline{background:#a75d17}.message{padding:12px;background:#fff3db;border-radius:9px;color:#744710;line-height:1.5}.success{padding:14px;background:#e9f7ef;border-radius:9px;color:#176b4b;font-weight:700}@media(max-width:560px){.card{margin:0;min-height:100vh;border:0;border-radius:0;padding:24px 20px}}</style></head><body><main class="card"><h1>${escapeHtml(actionTitle)}</h1><p class="lead">FixitFelix technician response</p>${content}</main>${isAccept && !success ? `<script>document.querySelector('form').addEventListener('submit',function(event){const local=document.getElementById('scheduled_local');const date=new Date(local.value);if(!local.value||Number.isNaN(date.getTime())){event.preventDefault();return}document.getElementById('scheduled_at').value=date.toISOString()})</script>` : ""}</body></html>`;
  return { status, html };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await loadState();
  const { token } = await params;
  const url = new URL(request.url);
  const choice = url.searchParams.get("choice");
  if (choice !== "accept" && choice !== "decline") {
    const page = technicianActionPage({ token, choice: "accept", message: "This link is missing its action. Return to the assignment email and open Accept or Decline.", status: 400 });
    return new NextResponse(page.html, { status: page.status, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const ticket = findTechnicianActionTicket(token);
  const page = technicianActionPage({ ticket, token, choice, status: ticket ? 200 : 410 });
  return new NextResponse(page.html, { status: page.status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await loadState();
  const { token } = await params;
  const formData = await request.formData();
  const action = formData.get("action") as string;
  const ticket = findTechnicianActionTicket(token);
  if (!ticket) {
    const page = technicianActionPage({ token, choice: action === "decline" ? "decline" : "accept", status: 410 });
    return new NextResponse(page.html, { status: page.status, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  try {
    const result = await applyAssignmentResponse(ticket, action, formData.get("scheduled_at") as string, requestBaseUrl(request));
    if (result.outcome === "accepted") {
      await emailStudentUpdate(ticket, `The technician accepted the visit and scheduled the repair for ${new Date(ticket.scheduled_at!).toLocaleString()}.`, requestBaseUrl(request));
    }
    await persistTicket(ticket);
    const message =
      result.outcome === "accepted"
        ? `Ticket ${ticket.id} accepted and scheduled for ${new Date(ticket.scheduled_at!).toLocaleString()}.`
        : result.outcome === "reassigned"
          ? `Ticket ${ticket.id} declined and reassigned to ${result.nextTechnician}. A new notification was sent.`
          : `Ticket ${ticket.id} declined. No other technician is available, so it needs helpdesk reassignment.`;
    const page = technicianActionPage({ token, choice: action, message, success: true });
    return new NextResponse(page.html, { status: page.status, headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (error: any) {
    const page = technicianActionPage({
      ticket,
      token,
      choice: action === "decline" ? "decline" : "accept",
      message: error.message,
      scheduledAt: (formData.get("scheduled_at") as string) || "",
      status: error.status || 400,
    });
    return new NextResponse(page.html, { status: page.status, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
