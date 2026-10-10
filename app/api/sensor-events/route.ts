import { NextRequest, NextResponse } from "next/server";
import {
  loadState,
  getLatestSensors,
  setSensor,
  getOpenSensorTickets,
  openSensorTicket,
  createTicket,
  notifyAssignment,
  publicTicket,
  requestBaseUrl,
  persistTicket,
  logSensorEvent,
  LOW_LIGHT_THRESHOLD,
  RECOVERY_THRESHOLD,
  REQUIRED_SAMPLES,
} from "@/lib/store";
import { addEvent, emailStudentUpdate } from "@/lib/store";
import type { Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await loadState();
  const sensors = Object.entries(getLatestSensors()).map(([sensor_id, sensor]) => ({ sensor_id, ...sensor }));
  return NextResponse.json({ sensors, server_time: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  await loadState();
  const body = await request.json().catch(() => ({}));
  if (body.sensor_type !== "ldr" || body.metric !== "brightness_pct" || !Number.isFinite(body.value) || body.value < 0 || body.value > 100) {
    return NextResponse.json({ error: "Send an LDR brightness_pct value from 0 to 100." }, { status: 400 });
  }
  const sensorId = typeof body.sensor_id === "string" && body.sensor_id.trim() ? body.sensor_id.trim() : "ldr_b204";
  const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : "Room B-204";
  const value = Math.round(body.value);
  const sensors = getLatestSensors();
  const sensor = sensors[sensorId] || { low_count: 0, recovery_count: 0, value: null, location };
  sensor.value = value;
  sensor.location = location;
  sensor.observed_at = body.observed_at || new Date().toISOString();
  sensor.received_at = new Date().toISOString();
  sensor.low_count = value < LOW_LIGHT_THRESHOLD ? sensor.low_count + 1 : 0;
  sensor.recovery_count = value >= RECOVERY_THRESHOLD ? sensor.recovery_count + 1 : 0;
  await setSensor(sensorId, sensor);
  await logSensorEvent({ sensor_id: sensorId, sensor_type: "ldr", metric: "brightness_pct", value, location, observed_at: sensor.observed_at });

  // Check if we need to create a new sensor ticket
  // Create a new one when low_count reaches threshold AND there's no existing
  // sensor-triggered ticket that's still being worked on for this sensor.
  // Student-reported tickets (even if open) don't block new sensor tickets.
  const openTickets = getOpenSensorTickets(sensorId);
  const hasActiveSensorTicket = openTickets.some(
    (t) => t.source === "sensor" && t.status !== "unassigned" && t.status !== "closed"
  );
  let action = "ignored";
  let createdTicket: Ticket | null = null;

  if (!hasActiveSensorTicket && sensor.low_count >= REQUIRED_SAMPLES) {
    createdTicket = createTicket({ source: "sensor", description: `LDR reported ${value}% brightness.`, location, category: "lighting", sensorId, sensorValue: value });
    action = "created";
    if (createdTicket.assignment) await notifyAssignment(createdTicket, "assigned", requestBaseUrl(request));
    await persistTicket(createdTicket);
    openTickets.push(createdTicket);
  }

  // Process ALL non-closed tickets linked to this sensor
  const baseUrl = requestBaseUrl(request);
  const processedTicketIds: string[] = [];

  for (const ticket of openTickets) {
    if (ticket.status === "closed") continue; // may have been closed in a previous iteration
    if (processedTicketIds.includes(ticket.id)) continue;
    processedTicketIds.push(ticket.id);

    if (action === "ignored") action = "updated";
    if (ticket.verification) ticket.verification.last_value = value;

    const sensorVerificationStarted =
      ticket.status === "verification_pending" ||
      ticket.status === "follow_up" ||
      (ticket.status === "in_progress" && ticket.completion_verification?.state === "passed");

    if (sensorVerificationStarted) {
      if (value < RECOVERY_THRESHOLD) {
        // Brightness still low — mark as follow_up
        if (ticket.verification) ticket.verification.state = "failed";
        ticket.status = "follow_up";
        if (ticket.timeline[0]?.message !== `Verification still low at ${value}%; technician follow-up required.`) {
          addEvent(ticket, `Verification still low at ${value}%; technician follow-up required.`, "follow_up");
        }
      } else if (ticket.verification?.state !== "passed" && sensor.recovery_count >= REQUIRED_SAMPLES) {
        // LDR recovery confirmed (3+ readings above threshold) — mark verification as passed
        if (ticket.verification) ticket.verification.state = "passed";
        if (ticket.completion_verification?.state === "passed") {
          // Both LDR and AI photo passed — close the ticket
          ticket.status = "closed";
          addEvent(ticket, `Repair completed and verified by LDR recovery (${value}%) and AI photo check.`, "closed");
          await emailStudentUpdate(ticket, "The room sensor confirmed brightness recovery and the completion photo passed AI verification. The repair is complete.", baseUrl);
        } else if (ticket.completion_verification?.state === "failed") {
          // LDR passed but AI photo failed — send back to technician for a new photo
          ticket.status = "follow_up";
          addEvent(ticket, `Sensor confirms brightness recovered to ${value}%, but the AI photo check failed earlier. Technician needs to submit a new completion photo.`, "follow_up");
        } else {
          // LDR passed, no AI photo yet — waiting for technician photo
          ticket.status = "verification_pending";
          addEvent(ticket, `Sensor confirms brightness recovered to ${value}%; technician photo verification is still required before completion.`, "verification");
        }
      } else if (ticket.verification?.state === "passed" && ticket.completion_verification?.state === "failed" && ticket.status === "verification_pending") {
        // LDR already passed earlier, but AI photo failed — move to follow_up so technician re-submits photo
        ticket.status = "follow_up";
        addEvent(ticket, `LDR sensor verified brightness recovery (${value}%), but the AI photo check failed earlier. Technician needs to submit a new completion photo showing the repaired lighting.`, "follow_up");
      } else if (ticket.verification?.state === "passed" && ticket.completion_verification?.state === "passed" && ticket.status === "verification_pending") {
        // Both passed but ticket wasn't closed yet (edge case) — close it now
        ticket.status = "closed";
        addEvent(ticket, `Repair completed and verified by LDR recovery (${value}%) and AI photo check.`, "closed");
        await emailStudentUpdate(ticket, "The room sensor confirmed brightness recovery and the completion photo passed AI verification. The repair is complete.", baseUrl);
      }
    }

    await persistTicket(ticket);
  }

  // For the API response, return the first non-closed ticket (or the created one)
  const responseTicket = createdTicket || openTickets.find(t => t.status !== "closed") || openTickets[0];

  return NextResponse.json(
    {
      action,
      ticket_id: responseTicket?.id || null,
      processed_tickets: processedTicketIds,
      tracking_url: responseTicket ? `${baseUrl}/student/${responseTicket.student_tracking_token}` : null,
      sensor,
      notification: action === "created" && createdTicket?.notification ? { channel: createdTicket.notification.channel, status: createdTicket.notification.status } : undefined,
    },
    { status: 201 }
  );
}
