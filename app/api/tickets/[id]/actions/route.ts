import { NextRequest, NextResponse } from "next/server";
import {
  loadState,
  saveState,
  findTicketById,
  applyAssignmentResponse,
  emailStudentUpdate,
  verifyRepairWithAI,
  addEvent,
  publicTicket,
  requestBaseUrl,
  RECOVERY_THRESHOLD,
  getSensor,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await loadState();
  const { id } = await params;
  const ticket = findTicketById(decodeURIComponent(id));
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!ticket.technician_action_token || body.technician_token !== ticket.technician_action_token) {
    return NextResponse.json({ error: "Open this ticket from the technician link in your assignment email." }, { status: 403 });
  }

  // Accept / Decline
  if (action === "accept" || action === "decline") {
    try {
      const result = await applyAssignmentResponse(ticket, action, body.scheduled_at, requestBaseUrl(request));
      if (result.outcome === "accepted") {
        await emailStudentUpdate(ticket, `The technician accepted the visit and scheduled the repair for ${new Date(ticket.scheduled_at!).toLocaleString()}.`, requestBaseUrl(request));
      }
      await saveState();
      return NextResponse.json({ ticket: publicTicket(ticket), outcome: result.outcome });
    } catch (error: any) {
      return NextResponse.json({ error: error.message, ticket: publicTicket(ticket) }, { status: error.status || 400 });
    }
  }

  let studentUpdateMessage = "";
  if (ticket.status === "closed") {
    return NextResponse.json({ error: "This ticket is already closed." }, { status: 409 });
  } else if (action === "start_work" && ticket.status === "scheduled") {
    ticket.status = "in_progress";
    const scheduled = ticket.scheduled_at ? ` The visit was scheduled for ${new Date(ticket.scheduled_at).toLocaleString()}.` : "";
    addEvent(ticket, `${ticket.assignment?.technician_name || "Technician"} arrived and started work.${scheduled}`, "work_started");
    studentUpdateMessage = `${ticket.assignment?.technician_name || "Technician"} arrived and started work.${scheduled}`;
  } else if (action === "start_work" && ticket.status === "follow_up") {
    ticket.status = "in_progress";
    addEvent(ticket, `${ticket.assignment?.technician_name || "Technician"} resumed work after follow-up.`, "work_started");
    studentUpdateMessage = `${ticket.assignment?.technician_name || "Technician"} resumed work after follow-up.`;
  } else if (action === "repair_attempted" && ticket.status === "in_progress") {
    if (ticket.source === "sensor") {
      ticket.status = "verification_pending";
      if (ticket.verification) ticket.verification.state = "pending";
      const sensor = getSensor(ticket.sensor_id || "");
      if (sensor) sensor.recovery_count = 0;
      addEvent(ticket, "Technician reported a repair attempt. Waiting for the LDR to verify room brightness.", "verification");
      if (sensor && sensor.value !== null && sensor.value < RECOVERY_THRESHOLD) {
        ticket.status = "follow_up";
        if (ticket.verification) ticket.verification.state = "failed";
        addEvent(ticket, `Repair not verified: brightness is still ${sensor.value}%. Follow-up required.`, "follow_up");
      }
    } else {
      ticket.status = "follow_up";
      addEvent(ticket, "Technician attempted the repair, but follow-up is needed before the issue can be marked complete.", "follow_up");
    }
    studentUpdateMessage =
      ticket.source === "sensor"
        ? "The technician attempted the repair. FixFlow is checking the room sensor and will keep the ticket open until the repair is verified."
        : "The technician attempted the repair, but follow-up is needed before the issue can be marked complete.";
  } else if (action === "complete_work" && ["in_progress", "verification_pending", "follow_up"].includes(ticket.status)) {
    let verification;
    try {
      verification = await verifyRepairWithAI(ticket, body.evidence);
    } catch (error: any) {
      ticket.completion_verification = { state: "unavailable", reason: error.message, checked_at: new Date().toISOString() };
      await emailStudentUpdate(ticket, "The technician submitted a completion photo, but FixFlow could not verify the repair yet. The ticket remains open.", requestBaseUrl(request));
      await saveState();
      return NextResponse.json({ error: error.message, ticket: publicTicket(ticket) }, { status: error.status || 502 });
    }
    ticket.completion_verification = verification;
    if (verification.state !== "passed") {
      addEvent(ticket, `AI photo check did not confirm completion (${Math.round(verification.confidence! * 100)}% confidence): ${verification.reason}`, "verification_failed");
      await emailStudentUpdate(ticket, "The technician submitted a completion photo, but FixFlow could not confirm the repair. The ticket remains open for follow-up.", requestBaseUrl(request));
      await saveState();
      return NextResponse.json({ error: "The photo did not verify that the issue is fixed. Add a clearer photo or continue the repair.", ticket: publicTicket(ticket) }, { status: 422 });
    }
    if (ticket.source === "sensor" && ticket.verification?.state !== "passed") {
      ticket.status = "verification_pending";
      if (ticket.verification) ticket.verification.state = "pending";
      const sensor = getSensor(ticket.sensor_id || "");
      if (sensor) sensor.recovery_count = 0;
      addEvent(ticket, `AI photo check passed, but the light sensor has not confirmed recovery: ${verification.reason}`, "verification");
      await emailStudentUpdate(ticket, "The completion photo passed, but the room sensor has not confirmed the repair. The ticket remains open.", requestBaseUrl(request));
      await saveState();
      return NextResponse.json({ error: "The photo passed, but the sensor still needs to confirm recovery.", ticket: publicTicket(ticket) }, { status: 422 });
    }
    ticket.status = "closed";
    addEvent(ticket, `Repair completed and verified by AI photo check (${Math.round(verification.confidence! * 100)}% confidence): ${verification.reason}`, "closed");
    studentUpdateMessage = "The repair is complete and the completion photo passed verification.";
  } else {
    return NextResponse.json({ error: "That action is not valid for this ticket state." }, { status: 400 });
  }
  if (typeof body.note === "string" && body.note.trim()) addEvent(ticket, body.note.trim(), "note");
  if (studentUpdateMessage) await emailStudentUpdate(ticket, studentUpdateMessage, requestBaseUrl(request));
  await saveState();
  return NextResponse.json({ ticket: publicTicket(ticket) });
}
