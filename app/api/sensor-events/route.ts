import { NextRequest, NextResponse } from "next/server";
import {
  loadState,
  saveState,
  getLatestSensors,
  setSensor,
  openSensorTicket,
  createTicket,
  notifyAssignment,
  publicTicket,
  requestBaseUrl,
  LOW_LIGHT_THRESHOLD,
  RECOVERY_THRESHOLD,
  REQUIRED_SAMPLES,
} from "@/lib/store";

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
  setSensor(sensorId, sensor);

  let ticket = openSensorTicket(sensorId);
  let action = "ignored";
  if (!ticket && sensor.low_count >= REQUIRED_SAMPLES) {
    ticket = createTicket({ source: "sensor", description: `LDR reported ${value}% brightness.`, location, category: "lighting", sensorId, sensorValue: value });
    action = "created";
    if (ticket.assignment) await notifyAssignment(ticket, "assigned", requestBaseUrl(request));
  } else if (ticket) {
    action = "updated";
    if (ticket.verification) ticket.verification.last_value = value;
    const sensorVerificationStarted =
      ticket.status === "verification_pending" ||
      ticket.status === "follow_up" ||
      (ticket.status === "in_progress" && ticket.completion_verification?.state === "passed");
    if (sensorVerificationStarted) {
      if (value < RECOVERY_THRESHOLD) {
        ticket.status = "follow_up";
        if (ticket.verification) ticket.verification.state = "failed";
        if (ticket.timeline[0]?.message !== `Verification still low at ${value}%; technician follow-up required.`) {
          const { addEvent } = await import("@/lib/store");
          addEvent(ticket, `Verification still low at ${value}%; technician follow-up required.`, "follow_up");
        }
      } else if (sensor.recovery_count >= REQUIRED_SAMPLES && ticket.verification?.state !== "passed") {
        if (ticket.verification) ticket.verification.state = "passed";
        if (ticket.completion_verification?.state === "passed") {
          ticket.status = "closed";
          const { addEvent } = await import("@/lib/store");
          addEvent(ticket, `Repair completed and verified by LDR recovery (${value}%) and AI photo check.`, "closed");
          await (await import("@/lib/store")).emailStudentUpdate(ticket, "The room sensor confirmed brightness recovery and the completion photo passed AI verification. The repair is complete.", requestBaseUrl(request));
        } else {
          ticket.status = "verification_pending";
          const { addEvent } = await import("@/lib/store");
          addEvent(ticket, `Sensor confirms brightness recovered to ${value}%; technician photo verification is still required before completion.`, "verification");
        }
      }
    }
  }
  await saveState();
  return NextResponse.json(
    {
      action,
      ticket_id: ticket?.id || null,
      tracking_url: ticket ? `${requestBaseUrl(request)}/student/${ticket.student_tracking_token}` : null,
      sensor,
      notification: action === "created" && ticket?.notification ? { channel: ticket.notification.channel, status: ticket.notification.status } : undefined,
    },
    { status: 201 }
  );
}
