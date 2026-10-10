/**
 * Supabase data access layer for FixitFelix.
 *
 * Maps between flat database rows and the nested TypeScript Ticket/SensorState objects.
 * All functions use snake_case field names matching the SQL schema.
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { Ticket, SensorState, TimelineEvent, Assignment, Notification, CompletionVerification, Verification } from "./types";

// ─── Type definitions for DB rows ────────────────────────────────

interface TicketRow {
  id: string;
  source: string;
  summary: string;
  description: string;
  category: string;
  priority: string;
  location: string;
  status: string;
  assignment_department_id: string | null;
  assignment_department_name: string | null;
  assignment_technician_id: string | null;
  assignment_technician_name: string | null;
  assignment_response: string | null;
  declined_technician_ids: string[] | null;
  scheduled_at: string | null;
  notification_channel: string | null;
  notification_recipient: string | null;
  notification_status: string | null;
  notification_updated_at: string | null;
  notification_provider_id: string | null;
  notification_error: string | null;
  technician_action_token: string | null;
  student_tracking_token: string;
  cv_state: string | null;
  cv_fixed: boolean | null;
  cv_confidence: number | null;
  cv_reason: string | null;
  cv_model: string | null;
  cv_photo_url: string | null;
  cv_checked_at: string | null;
  sensor_id: string | null;
  verification_type: string | null;
  verification_state: string | null;
  verification_last_value: number | null;
  verification_unit: string | null;
  student_email: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

interface TimelineEventRow {
  id: string;
  ticket_id: string;
  type: string;
  message: string;
  created_at: string;
}

interface SensorStateRow {
  sensor_id: string;
  low_count: number;
  recovery_count: number;
  value: number | null;
  location: string;
  observed_at: string | null;
  received_at: string | null;
  updated_at: string;
}

// ─── Row → Domain object mapping ─────────────────────────────────

export function rowToTicket(row: TicketRow, events: TimelineEvent[]): Ticket {
  let assignment: Assignment | null = null;
  if (row.assignment_technician_id) {
    assignment = {
      department_id: row.assignment_department_id || "",
      department_name: row.assignment_department_name || "",
      technician_id: row.assignment_technician_id,
      technician_name: row.assignment_technician_name || "",
      response: (row.assignment_response as Assignment["response"]) || "pending",
    };
  }

  let notification: Notification | null = null;
  if (row.notification_channel) {
    notification = {
      channel: row.notification_channel,
      recipient: row.notification_recipient,
      status: row.notification_status || "",
      updated_at: row.notification_updated_at || undefined,
      provider_id: row.notification_provider_id || undefined,
      error: row.notification_error || undefined,
    };
  }

  let completion_verification: CompletionVerification | null = null;
  if (row.cv_state) {
    completion_verification = {
      state: row.cv_state as CompletionVerification["state"],
      fixed: row.cv_fixed ?? undefined,
      confidence: row.cv_confidence ?? undefined,
      reason: row.cv_reason || undefined,
      model: row.cv_model || undefined,
      photo_url: row.cv_photo_url || undefined,
      checked_at: row.cv_checked_at || undefined,
    };
  }

  let verification: Verification | null = null;
  if (row.verification_type) {
    verification = {
      type: row.verification_type,
      state: row.verification_state as Verification["state"],
      last_value: row.verification_last_value ?? 0,
      unit: row.verification_unit || "%",
    };
  }

  return {
    id: row.id,
    source: row.source as Ticket["source"],
    summary: row.summary,
    description: row.description,
    category: row.category as Ticket["category"],
    priority: row.priority as Ticket["priority"],
    location: row.location,
    status: row.status as Ticket["status"],
    assignment,
    declined_technician_ids: row.declined_technician_ids || [],
    scheduled_at: row.scheduled_at,
    notification,
    technician_action_token: row.technician_action_token,
    student_tracking_token: row.student_tracking_token,
    completion_verification,
    sensor_id: row.sensor_id,
    verification,
    student_email: row.student_email,
    timeline: events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      created_at: e.created_at,
    })),
    created_at: row.created_at,
    updated_at: row.updated_at,
    rationale: row.rationale || undefined,
  };
}

export function rowToSensorState(row: SensorStateRow): SensorState {
  return {
    low_count: row.low_count,
    recovery_count: row.recovery_count,
    value: row.value,
    location: row.location,
    observed_at: row.observed_at || undefined,
    received_at: row.received_at || undefined,
  };
}

// ─── Domain object → Row mapping ─────────────────────────────────

function ticketToRow(ticket: Ticket): Omit<TicketRow, "created_at" | "updated_at"> {
  return {
    id: ticket.id,
    source: ticket.source,
    summary: ticket.summary,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    location: ticket.location,
    status: ticket.status,
    assignment_department_id: ticket.assignment?.department_id ?? null,
    assignment_department_name: ticket.assignment?.department_name ?? null,
    assignment_technician_id: ticket.assignment?.technician_id ?? null,
    assignment_technician_name: ticket.assignment?.technician_name ?? null,
    assignment_response: ticket.assignment?.response ?? null,
    declined_technician_ids: ticket.declined_technician_ids,
    scheduled_at: ticket.scheduled_at,
    notification_channel: ticket.notification?.channel ?? null,
    notification_recipient: ticket.notification?.recipient ?? null,
    notification_status: ticket.notification?.status ?? null,
    notification_updated_at: ticket.notification?.updated_at ?? null,
    notification_provider_id: ticket.notification?.provider_id ?? null,
    notification_error: ticket.notification?.error ?? null,
    technician_action_token: ticket.technician_action_token,
    student_tracking_token: ticket.student_tracking_token,
    cv_state: ticket.completion_verification?.state ?? null,
    cv_fixed: ticket.completion_verification?.fixed ?? null,
    cv_confidence: ticket.completion_verification?.confidence ?? null,
    cv_reason: ticket.completion_verification?.reason ?? null,
    cv_model: ticket.completion_verification?.model ?? null,
    cv_photo_url: ticket.completion_verification?.photo_url ?? null,
    cv_checked_at: ticket.completion_verification?.checked_at ?? null,
    sensor_id: ticket.sensor_id ?? null,
    verification_type: ticket.verification?.type ?? null,
    verification_state: ticket.verification?.state ?? null,
    verification_last_value: ticket.verification?.last_value ?? null,
    verification_unit: ticket.verification?.unit ?? null,
    student_email: ticket.student_email ?? null,
    rationale: ticket.rationale ?? null,
  };
}

// ─── CRUD operations ─────────────────────────────────────────────

export async function dbUpsertTicket(ticket: Ticket): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const row = ticketToRow(ticket);

  const { error } = await sb
    .from("tickets")
    .upsert(row, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert ticket ${ticket.id}: ${error.message}`);

  // Sync timeline events — delete then re-insert (simplest approach for correctness)
  await sb.from("timeline_events").delete().eq("ticket_id", ticket.id);
  if (ticket.timeline.length > 0) {
    const eventRows: TimelineEventRow[] = ticket.timeline.map((e) => ({
      id: e.id,
      ticket_id: ticket.id,
      type: e.type,
      message: e.message,
      created_at: e.created_at,
    }));
    const { error: evtError } = await sb.from("timeline_events").insert(eventRows);
    if (evtError) console.error(`[supabase] Failed to sync timeline for ${ticket.id}:`, evtError.message);
  }
}

export async function dbGetAllTickets(): Promise<Ticket[]> {
  if (!isSupabaseConfigured()) return [];
  const sb = getSupabase();

  const { data: rows, error } = await sb
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch tickets: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  // Fetch all timeline events for these tickets in one query
  const ticketIds = rows.map((r) => r.id);
  const { data: events, error: evtError } = await sb
    .from("timeline_events")
    .select("*")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false });

  if (evtError) console.error("[supabase] Failed to fetch timeline events:", evtError.message);

  // Group events by ticket_id
  const eventsByTicket: Record<string, TimelineEventRow[]> = {};
  for (const e of events || []) {
    if (!eventsByTicket[e.ticket_id]) eventsByTicket[e.ticket_id] = [];
    eventsByTicket[e.ticket_id].push(e);
  }

  return rows.map((row) => rowToTicket(row as TicketRow, eventsByTicket[row.id] || []));
}

export async function dbGetTicketById(id: string): Promise<Ticket | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();

  const { data: row, error } = await sb.from("tickets").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`Failed to fetch ticket ${id}: ${error.message}`);
  }
  if (!row) return null;

  const { data: events, error: evtError } = await sb
    .from("timeline_events")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: false });

  if (evtError) console.error(`[supabase] Failed to fetch timeline for ${id}:`, evtError.message);

  return rowToTicket(row as TicketRow, events || []);
}

export async function dbGetTicketByToken(token: string, tokenField: "technician_action_token" | "student_tracking_token"): Promise<Ticket | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();

  const { data: row, error } = await sb
    .from("tickets")
    .select("*")
    .eq(tokenField, token)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch ticket by ${tokenField}: ${error.message}`);
  if (!row) return null;

  const { data: events, error: evtError } = await sb
    .from("timeline_events")
    .select("*")
    .eq("ticket_id", row.id)
    .order("created_at", { ascending: false });

  if (evtError) console.error(`[supabase] Failed to fetch timeline:`, evtError.message);

  return rowToTicket(row as TicketRow, events || []);
}

export async function dbGetTicketBySensorId(sensorId: string): Promise<Ticket | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();

  const { data: row, error } = await sb
    .from("tickets")
    .select("*")
    .eq("sensor_id", sensorId)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch open ticket for sensor ${sensorId}: ${error.message}`);
  if (!row) return null;

  const { data: events } = await sb
    .from("timeline_events")
    .select("*")
    .eq("ticket_id", row.id)
    .order("created_at", { ascending: false });

  return rowToTicket(row as TicketRow, events || []);
}

// ─── Sensor state operations ─────────────────────────────────────

export async function dbUpsertSensorState(sensorId: string, state: SensorState): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();

  const { error } = await sb.from("sensor_states").upsert({
    sensor_id: sensorId,
    low_count: state.low_count,
    recovery_count: state.recovery_count,
    value: state.value,
    location: state.location,
    observed_at: state.observed_at ?? null,
    received_at: state.received_at ?? null,
  }, { onConflict: "sensor_id" });

  if (error) throw new Error(`Failed to upsert sensor state ${sensorId}: ${error.message}`);
}

export async function dbGetAllSensorStates(): Promise<Record<string, SensorState>> {
  if (!isSupabaseConfigured()) return {};
  const sb = getSupabase();

  const { data: rows, error } = await sb.from("sensor_states").select("*");
  if (error) throw new Error(`Failed to fetch sensor states: ${error.message}`);
  if (!rows) return {};

  const result: Record<string, SensorState> = {};
  for (const row of rows) {
    result[row.sensor_id] = rowToSensorState(row as SensorStateRow);
  }
  return result;
}

export async function dbInsertSensorEvent(event: {
  sensor_id: string;
  sensor_type: string;
  metric: string;
  value: number;
  location: string;
  observed_at?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();

  const { error } = await sb.from("sensor_events").insert({
    sensor_id: event.sensor_id,
    sensor_type: event.sensor_type,
    metric: event.metric,
    value: event.value,
    location: event.location,
    observed_at: event.observed_at ?? null,
  });

  if (error) console.error(`[supabase] Failed to log sensor event for ${event.sensor_id}:`, error.message);
}

// ─── Counters ────────────────────────────────────────────────────

export async function dbGetNextTicketNumber(): Promise<number> {
  if (!isSupabaseConfigured()) return 1;
  const sb = getSupabase();

  // Get the highest FX-NNNN number from existing tickets
  const { data, error } = await sb
    .from("tickets")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[supabase] Failed to get max ticket number:", error.message);
    return 1;
  }

  if (!data || data.length === 0) return 1;

  // Extract number from "FX-NNNN"
  const match = data[0].id.match(/FX-(\d+)/);
  return match ? parseInt(match[1], 10) + 1 : 1;
}
