import { randomUUID } from "node:crypto";

type SensorEventBase = { sensor_id: string; location: string; observed_at: string; value: number };
export type SensorEvent = SensorEventBase & (
  | { sensor_type: "ldr"; metric: "brightness_pct"; unit: "%" }
  | { sensor_type: "dht11"; metric: "temperature_c"; unit: "°C" }
  | { sensor_type: "dht11"; metric: "humidity_pct"; unit: "%" }
);

export type Incident = {
  incident_id: string;
  source: "sensor" | "student_report";
  summary: string;
  description: string;
  location: string;
  sensor_id?: string;
  status: "pending_triage" | "assigned" | "closed";
  ticket_id?: string;
  recent_readings: SensorEvent[];
  created_at: string;
  updated_at: string;
};

export type TicketStatus = "assigned" | "in_progress" | "verification_pending" | "follow_up" | "closed";
export type Category = "lighting" | "air_conditioning" | "student_portal" | "other";
export type Priority = "low" | "medium" | "high";

export type Ticket = {
  id: string;
  incident_id: string;
  source: Incident["source"];
  summary: string;
  description: string;
  category: Category;
  priority: Priority;
  rationale: string;
  location: string;
  sensor_id?: string;
  status: TicketStatus;
  assignment: { department_id: string; department_name: string; technician_id: string; technician_name: string };
  verification: { type: "ldr_brightness" | "none"; state: "pending" | "passed" | "failed"; last_value: number | null; unit: "%" | null };
  created_at: string;
  updated_at: string;
  timeline: Array<{ event: string; note: string; created_at: string }>;
  repair_attempted_at?: string;
};

type DemoState = { events: SensorEvent[]; incidents: Incident[]; tickets: Ticket[]; lowStreaks: Record<string, number>; lastObservedAt: Record<string, string> };
const STATE_KEY = "__fixflowDemoState" as const;
const globalState = globalThis as typeof globalThis & { [STATE_KEY]?: DemoState };

const routing: Record<Category, Ticket["assignment"]> = {
  lighting: { department_id: "facilities_electrical", department_name: "Facilities - Electrical", technician_id: "tech_01", technician_name: "Demo Electrical Technician" },
  air_conditioning: { department_id: "facilities_mechanical", department_name: "Facilities - Mechanical", technician_id: "tech_02", technician_name: "Demo Mechanical Technician" },
  student_portal: { department_id: "it_services", department_name: "IT Services", technician_id: "tech_03", technician_name: "Demo IT Technician" },
  other: { department_id: "helpdesk_triage", department_name: "Helpdesk Triage", technician_id: "tech_00", technician_name: "Demo Triage Technician" },
};

function state(): DemoState {
  if (!globalState[STATE_KEY]) globalState[STATE_KEY] = { events: [], incidents: [], tickets: [], lowStreaks: {}, lastObservedAt: {} };
  return globalState[STATE_KEY];
}
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
const now = () => new Date().toISOString();

export function recordSensorEvent(event: SensorEvent) {
  const db = state();
  const streamId = `${event.sensor_id}:${event.metric}`;
  if (event.observed_at <= (db.lastObservedAt[streamId] ?? "")) return { action: "ignored" as const };
  db.lastObservedAt[streamId] = event.observed_at;
  db.events.push(event);
  if (db.events.length > 1000) db.events.splice(0, db.events.length - 1000);
  // Climate readings are stored and displayed, but only LDR brightness drives lighting incidents.
  if (event.metric !== "brightness_pct") return { action: "recorded" as const };
  const active = [...db.incidents].reverse().find((item) => item.sensor_id === event.sensor_id && item.status !== "closed");
  if (active) {
    active.recent_readings.push(event);
    if (active.recent_readings.length > 20) active.recent_readings.shift();
    active.updated_at = event.observed_at;
    const ticket = db.tickets.find((item) => item.id === active.ticket_id);
    if (ticket) {
      ticket.verification.last_value = event.value;
      ticket.updated_at = event.observed_at;
      if (ticket.repair_attempted_at && event.observed_at > ticket.repair_attempted_at) {
        ticket.timeline.push({ event: "sensor_reading", note: `Brightness reading: ${event.value}%.`, created_at: event.observed_at });
      }
    }
    return { incident_id: active.incident_id, action: "updated" as const };
  }
  const streak = event.value < 25 ? (db.lowStreaks[event.sensor_id] ?? 0) + 1 : 0;
  db.lowStreaks[event.sensor_id] = streak;
  if (streak < 3) return { action: "ignored" as const };
  const incident: Incident = {
    incident_id: id("incident"), source: "sensor", summary: `Low light detected in ${event.location}`,
    description: "Room brightness stayed below the configured threshold.", location: event.location,
    sensor_id: event.sensor_id, status: "pending_triage",
    recent_readings: db.events.filter((item) => item.sensor_id === event.sensor_id).slice(-3),
    created_at: event.observed_at, updated_at: event.observed_at,
  };
  db.incidents.push(incident);
  return { incident_id: incident.incident_id, action: "created" as const };
}

export function createStudentIncident(description: string, location: string): Incident {
  const timestamp = now();
  const incident: Incident = { incident_id: id("incident"), source: "student_report", summary: description.slice(0, 120), description, location, status: "pending_triage", recent_readings: [], created_at: timestamp, updated_at: timestamp };
  state().incidents.push(incident);
  return incident;
}

export function listPendingIncidents() {
  return state().incidents.filter((incident) => incident.status === "pending_triage");
}

export function listTickets() {
  return [...state().tickets].reverse();
}

export function getIncidentContext(incidentId: string) {
  const db = state();
  const incident = db.incidents.find((item) => item.incident_id === incidentId);
  if (!incident) return null;
  return { incident, ticket: db.tickets.find((item) => item.id === incident.ticket_id) ?? null, recent_sensor_readings: incident.sensor_id ? db.events.filter((event) => event.sensor_id === incident.sensor_id).slice(-20) : [] };
}

export function createWorkOrder(input: { incident_id: string; category: Category; priority: Priority; summary: string; rationale: string }) {
  const db = state();
  const incident = db.incidents.find((item) => item.incident_id === input.incident_id);
  if (!incident) return { error: "Incident not found." } as const;
  if (incident.ticket_id) return { ticket: db.tickets.find((ticket) => ticket.id === incident.ticket_id)!, duplicate: true } as const;
  if (incident.status !== "pending_triage") return { error: "Incident is no longer pending triage." } as const;
  if (incident.source === "sensor" && input.category !== "lighting") return { error: "Sensor incidents must be classified as lighting." } as const;
  const timestamp = now();
  const ticket: Ticket = {
    id: id("ticket"), incident_id: incident.incident_id, source: incident.source,
    summary: input.summary.trim(), description: incident.description, category: input.category,
    priority: input.priority, rationale: input.rationale.trim(), location: incident.location,
    sensor_id: incident.sensor_id, status: "assigned", assignment: routing[input.category],
    verification: { type: incident.sensor_id ? "ldr_brightness" : "none", state: "pending", last_value: incident.recent_readings.at(-1)?.value ?? null, unit: incident.sensor_id ? "%" : null },
    created_at: timestamp, updated_at: timestamp,
    timeline: [{ event: "work_order_created", note: input.rationale.trim(), created_at: timestamp }],
  };
  db.tickets.push(ticket);
  incident.ticket_id = ticket.id;
  incident.status = "assigned";
  incident.updated_at = timestamp;
  return { ticket, duplicate: false } as const;
}

export function updateTicketAction(ticketId: string, action: "accept" | "start_work" | "repair_attempted", note: string) {
  const ticket = state().tickets.find((item) => item.id === ticketId);
  if (!ticket) return { error: "Ticket not found." } as const;
  const timestamp = now();
  if (action === "accept" && ticket.status !== "assigned") return { error: "Only assigned tickets can be accepted." } as const;
  if (action === "start_work" && !["assigned", "follow_up"].includes(ticket.status)) return { error: "Ticket cannot start work from its current status." } as const;
  if (action === "repair_attempted" && ticket.status !== "in_progress") return { error: "Repair can only be attempted while work is in progress." } as const;
  if (action === "start_work") ticket.status = "in_progress";
  if (action === "repair_attempted") { ticket.status = "verification_pending"; ticket.repair_attempted_at = timestamp; }
  ticket.updated_at = timestamp;
  ticket.timeline.push({ event: action, note: note.trim(), created_at: timestamp });
  return { ticket } as const;
}

export function getSensorReadings(sensorId: string, since?: string) {
  return state().events.filter((event) => event.sensor_id === sensorId && (!since || event.observed_at > since)).slice(-100);
}

export function verifyTicket(ticketId: string) {
  const db = state();
  const ticket = db.tickets.find((item) => item.id === ticketId);
  if (!ticket) return { error: "Ticket not found." } as const;
  if (ticket.status !== "verification_pending" || !ticket.repair_attempted_at) return { error: "Ticket has no repair attempt awaiting verification." } as const;
  const repairAttemptedAt = ticket.repair_attempted_at;
  const readings = ticket.sensor_id ? db.events.filter((event) => event.sensor_id === ticket.sensor_id && event.observed_at > repairAttemptedAt).sort((a, b) => a.observed_at.localeCompare(b.observed_at)).slice(-3) : [];
  const passed = readings.length === 3 && readings.every((event) => event.value >= 40);
  const timestamp = now();
  ticket.status = passed ? "closed" : "follow_up";
  ticket.verification.state = passed ? "passed" : "failed";
  ticket.verification.last_value = readings.at(-1)?.value ?? ticket.verification.last_value;
  ticket.updated_at = timestamp;
  ticket.timeline.push({ event: passed ? "verification_passed" : "verification_failed", note: passed ? "Three consecutive readings met the recovery threshold." : "Recovery evidence did not meet the three-reading threshold; follow-up required.", created_at: timestamp });
  if (passed) {
    const incident = db.incidents.find((item) => item.incident_id === ticket.incident_id);
    if (incident) incident.status = "closed";
  }
  return { ticket, readings, passed } as const;
}

export function getSensorSnapshot() {
  const db = state();
  return { latest_event: db.events.at(-1) ?? null, events: [...db.events].reverse(), pending_incidents: listPendingIncidents() };
}

export function resetDemo() {
  globalState[STATE_KEY] = { events: [], incidents: [], tickets: [], lowStreaks: {}, lastObservedAt: {} };
}
