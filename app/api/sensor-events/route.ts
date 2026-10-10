import { NextRequest, NextResponse } from "next/server";
import {
  loadState,
  getLatestSensors,
  setSensor,
  getOpenSensorTickets,
  createTicket,
  notifyAssignment,
  requestBaseUrl,
  persistTicket,
  logSensorEvent,
  getTickets,
  LOW_LIGHT_THRESHOLD,
  RECOVERY_THRESHOLD,
  REQUIRED_SAMPLES,
} from "@/lib/store";
import { addEvent, emailStudentUpdate } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { dbGetOpenTicketsBySensorId, dbGetSensorState } from "@/lib/db";
import type { Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * When Supabase is configured (Vercel), load open sensor tickets directly from DB.
 * Also inject them into the in-memory array so mutation functions and
 * hasActiveSensorTicket checks work correctly.
 * Falls back to in-memory getOpenSensorTickets() for local dev.
 */
async function loadOpenSensorTickets(sensorId: string): Promise<Ticket[]> {
  if (isSupabaseConfigured()) {
    const dbTickets = await dbGetOpenTicketsBySensorId(sensorId);
    // Inject into in-memory array so mutations work and getOpenSensorTickets sees them
    const tickets = getTickets();
    for (const t of dbTickets) {
      const existingIdx = tickets.findIndex((existing) => existing.id === t.id);
      if (existingIdx >= 0) {
        tickets[existingIdx] = t;
      } else {
        tickets.unshift(t);
      }
    }
    // Return them sorted by verification priority (same logic as getOpenSensorTickets)
    return getOpenSensorTickets(sensorId);
  }
  // Local dev fallback
  await loadState();
  return getOpenSensorTickets(sensorId);
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    await loadState();
  }
  const sensors = Object.entries(getLatestSensors()).map(([sensor_id, sensor]) => ({ sensor_id, ...sensor }));
  return NextResponse.json({ sensors, server_time: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (body.sensor_type !== "ldr" || body.metric !== "brightness_pct" || !Number.isFinite(body.value) || body.value < 0 || body.value > 100) {
    return NextResponse.json({ error: "Send an LDR brightness_pct value from 0 to 100." }, { status: 400 });
  }
  const sensorId = typeof body.sensor_id === "string" && body.sensor_id.trim() ? body.sensor_id.trim() : "ldr_b204";
  const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : "Room B-204";
  const value = Math.round(body.value);

  // On Vercel (Supabase mode), load sensor state from DB on cold start.
  // On local dev, loadState() populates in-memory cache.
  if (isSupabaseConfigured()) {
    // Ensure loadState has run (for nextNumber etc. when creating tickets)
    await loadState();
    // Load this specific sensor's state from DB if not already in memory
    const sensors = getLatestSensors();
    if (!sensors[sensorId]) {
      const dbSensor = await dbGetSensorState(sensorId);
      if (dbSensor) {
        sensors[sensorId] = dbSensor;
      }
    }
  } else {
    await loadState();
  }

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

  // Load open sensor tickets from Supabase (Vercel) or in-memory (local dev)
  const openTickets = await loadOpenSensorTickets(sensorId);
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
