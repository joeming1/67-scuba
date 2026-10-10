import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ticket, SensorState, PublicTicket, Assignment, Notification } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "demo", "data");
const dataFile = join(dataDir, "tickets.json");
const evidenceDir = join(dataDir, "evidence");

export const LOW_LIGHT_THRESHOLD = 25;
export const RECOVERY_THRESHOLD = 40;
export const REQUIRED_SAMPLES = 3;

export const departments = {
  lighting: { id: "facilities_electrical", name: "Facilities - Electrical" },
  air_conditioning: { id: "facilities_mechanical", name: "Facilities - Mechanical" },
  student_portal: { id: "it_services", name: "IT Services" },
  other: { id: "helpdesk_triage", name: "Helpdesk Triage" },
} as const;

export const technicians = [
  { id: "tech_01", name: "Aina Rahman", department_id: "facilities_electrical", available: true },
  { id: "tech_04", name: "Amir Hassan", department_id: "facilities_electrical", available: true },
  { id: "tech_05", name: "Sofia Lim", department_id: "facilities_electrical", available: true },
  { id: "tech_02", name: "Daniel Lee", department_id: "facilities_mechanical", available: true },
  { id: "tech_06", name: "Priya Nair", department_id: "facilities_mechanical", available: true },
  { id: "tech_03", name: "Mei Tan", department_id: "it_services", available: true },
  { id: "tech_07", name: "Arun Kumar", department_id: "it_services", available: true },
  { id: "tech_00", name: "Helpdesk Team", department_id: "helpdesk_triage", available: true },
];

let tickets: Ticket[] = [];
let latestSensors: Record<string, SensorState> = {};
let nextNumber = 1;
let loaded = false;

export function now(): string {
  return new Date().toISOString();
}

export function addEvent(ticket: Ticket, message: string, type = "update"): void {
  ticket.timeline.unshift({ id: randomUUID(), type, message, created_at: now() });
  ticket.updated_at = now();
}

export function chooseTechnician(departmentId: string, excluded: string[] = [], currentTicketId: string | null = null) {
  return technicians.find((tech) => {
    if (tech.department_id !== departmentId || !tech.available || excluded.includes(tech.id)) return false;
    return !tickets.some(
      (ticket) =>
        ticket.id !== currentTicketId &&
        ticket.status !== "closed" &&
        ticket.status !== "unassigned" &&
        ticket.assignment?.technician_id === tech.id
    );
  });
}

export function publicTicket(ticket: Ticket): PublicTicket {
  const { technician_action_token, student_tracking_token, student_email, notification, ...visible } = ticket;
  return {
    ...visible,
    notification: notification ? { channel: notification.channel, status: notification.status } : null,
  };
}

export function classify(description: string): Ticket["category"] {
  const text = description.toLowerCase();
  if (/\b(light|lights|lighting|dark|dim|brightness)\b/.test(text)) return "lighting";
  if (/\b(ac|air.?con|temperature|hot|warm|cooling)\b/.test(text)) return "air_conditioning";
  if (/\b(portal|login|log in|password|student account)\b/.test(text)) return "student_portal";
  return "other";
}

export function createTicket(opts: {
  source: string;
  description: string;
  location: string;
  category: Ticket["category"];
  sensorId?: string;
  sensorValue?: number;
  studentEmail?: string;
}): Ticket {
  const department = departments[opts.category] || departments.other;
  const technician = chooseTechnician(department.id);
  const ticket: Ticket = {
    id: `FX-${String(nextNumber++).padStart(4, "0")}`,
    source: opts.source as Ticket["source"],
    summary:
      opts.source === "sensor" ? `Low light detected in ${opts.location}` : opts.description.trim().slice(0, 90),
    description:
      opts.source === "sensor"
        ? `Room brightness stayed below ${LOW_LIGHT_THRESHOLD}% for ${REQUIRED_SAMPLES} consecutive readings.`
        : opts.description.trim(),
    category: opts.category,
    priority: /cannot access|urgent|completely down/i.test(opts.description) ? "high" : "medium",
    location: opts.location.trim(),
    student_email: opts.studentEmail || null,
    status: "assigned",
    assignment: technician
      ? {
          department_id: department.id,
          department_name: department.name,
          technician_id: technician.id,
          technician_name: technician.name,
          response: "pending",
        }
      : null,
    declined_technician_ids: [],
    scheduled_at: null,
    notification: null,
    technician_action_token: null,
    student_tracking_token: randomBytes(24).toString("base64url"),
    completion_verification: null,
    sensor_id: opts.sensorId || null,
    verification:
      opts.source === "sensor"
        ? { type: "ldr_brightness", state: "pending", last_value: opts.sensorValue ?? 0, unit: "%" }
        : null,
    timeline: [],
    created_at: now(),
    updated_at: now(),
  };
  tickets.unshift(ticket);
  addEvent(
    ticket,
    opts.source === "sensor"
      ? `Auto-created after ${REQUIRED_SAMPLES} low-light readings (${opts.sensorValue}%).`
      : `Student report received and categorized as ${opts.category.replaceAll("_", " ")}.`,
    "created"
  );
  if (technician) addEvent(ticket, `Assigned to ${technician.name} in ${department.name}; awaiting response.`, "assigned");
  else ticket.status = "unassigned";
  return ticket;
}

export function openSensorTicket(sensorId: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.sensor_id === sensorId && ticket.status !== "closed");
}

export function findTechnicianActionTicket(token: string): Ticket | undefined {
  return tickets.find(
    (ticket) => ticket.technician_action_token === token && ticket.status === "assigned" && ticket.assignment?.response === "pending"
  );
}

export function findTechnicianWorkspaceTicket(token: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.technician_action_token === token && ticket.assignment);
}

export function findStudentTicket(token: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.student_tracking_token === token);
}

export function findTicketById(id: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.id === id);
}

export function getTickets(): Ticket[] {
  return tickets;
}

export function getLatestSensors(): Record<string, SensorState> {
  return latestSensors;
}

export function getSensor(sensorId: string): SensorState | undefined {
  return latestSensors[sensorId];
}

export function setSensor(sensorId: string, sensor: SensorState): void {
  latestSensors[sensorId] = sensor;
}

export function getEvidenceDir(): string {
  return evidenceDir;
}

export function getDataFile(): string {
  return dataFile;
}

export async function loadState(): Promise<void> {
  if (loaded) return;
  loaded = true;
  await mkdir(dataDir, { recursive: true });
  try {
    const saved = JSON.parse(await readFile(dataFile, "utf8"));
    tickets = Array.isArray(saved.tickets) ? saved.tickets : [];
    nextNumber = Number(saved.next_number) || tickets.length + 1;
    for (const ticket of tickets) {
      if (ticket.status === "assigned" && ticket.assignment && !ticket.assignment.response) {
        ticket.assignment.response = "pending";
      }
      ticket.declined_technician_ids ||= [];
      ticket.scheduled_at ??= null;
      ticket.notification ??= null;
      ticket.technician_action_token ??= null;
      ticket.student_tracking_token ||= randomBytes(24).toString("base64url");
      ticket.completion_verification ??= null;
    }
  } catch {
    await saveState();
  }
}

export async function saveState(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify({ next_number: nextNumber, tickets }, null, 2));
}

// Notification helpers
export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FIXFLOW_FROM_EMAIL;
  if (!apiKey || !from || !to) return { status: "not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok
      ? { status: "sent" as const, id: payload.id || null }
      : { status: "failed" as const, error: payload.message || `Email provider returned ${response.status}.` };
  } catch {
    return { status: "failed" as const, error: "Email provider request failed." };
  }
}

export async function emailStudentUpdate(ticket: Ticket, message: string, baseUrl: string) {
  const recipient = ticket.student_email || process.env.FIXFLOW_NOTIFY_TO;
  const origin = (baseUrl || process.env.FIXFLOW_PUBLIC_URL || `http://localhost:3000`).replace(/\/+$/, "");
  const result = await sendEmail({
    to: recipient || "",
    subject: `FixFlow update for ${ticket.id}: ${ticket.status.replaceAll("_", " ")}`,
    text: [
      `Update for FixFlow ticket ${ticket.id}`,
      `Status: ${ticket.status.replaceAll("_", " ")}`,
      message,
      ticket.scheduled_at ? `Scheduled visit: ${new Date(ticket.scheduled_at).toLocaleString()}` : "",
      `Track this ticket: ${origin}/student/${ticket.student_tracking_token}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  ticket.notification = {
    channel: "email",
    recipient: recipient || null,
    status: result.status,
    updated_at: now(),
    ...(result.id ? { provider_id: result.id } : {}),
    ...("error" in result && result.error ? { error: result.error } : {}),
  } as Notification;
  return result;
}

export async function notifyAssignment(ticket: Ticket, reason: string, baseUrl: string) {
  const recipient = process.env.FIXFLOW_WHATSAPP_TO;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim();
  const whatsappEnabled = process.env.FIXFLOW_WHATSAPP_ENABLED === "true";
  const emailRecipient = process.env.FIXFLOW_NOTIFY_TO;
  const result: Notification = {
    channel: whatsappEnabled ? "whatsapp" : "email",
    recipient: whatsappEnabled ? recipient || null : emailRecipient || null,
    status: "not_configured",
    updated_at: now(),
  };
  ticket.technician_action_token = randomBytes(32).toString("base64url");
  const origin = (baseUrl || `http://localhost:3000`).replace(/\/+$/, "");
  const technicianUrl = `${origin}/technician/${ticket.technician_action_token}`;
  const acceptUrl = `${origin}/technician-actions/${ticket.technician_action_token}?choice=accept`;
  const declineUrl = `${origin}/technician-actions/${ticket.technician_action_token}?choice=decline`;
  if (!whatsappEnabled) {
    const email = await sendEmail({
      to: emailRecipient || "",
      subject: `FixFlow assignment: ${ticket.id}`,
      text: [
        `FixFlow ticket ${ticket.id} assigned to ${ticket.assignment?.technician_name}.`,
        `Issue: ${ticket.summary}`,
        `Location: ${ticket.location}`,
        `Department: ${ticket.assignment?.department_name}`,
        `Reason: ${reason}`,
        `Open your technician workspace to accept and schedule the visit, start work, record an attempt, or submit a completion photo: ${technicianUrl}`,
      ].join("\n\n"),
    });
    result.status = email.status;
    if ("id" in email && email.id) result.provider_id = email.id;
    if ("error" in email && email.error) result.error = email.error;
  } else if (accountSid && authToken && from && recipient) {
    try {
      const formFields: Record<string, string> = {
        From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
        To: recipient.startsWith("whatsapp:") ? recipient : `whatsapp:${recipient}`,
      };
      if (contentSid) {
        formFields.ContentSid = contentSid;
        formFields.ContentVariables = JSON.stringify({
          "1": ticket.id,
          "2": ticket.assignment?.technician_name || "",
          "3": ticket.summary,
          "4": ticket.location,
          "5": ticket.assignment?.department_name || "",
          "6": reason,
          "7": acceptUrl,
          "8": declineUrl,
        });
      } else {
        formFields.Body = [
          `FixFlow ticket ${ticket.id} assigned to ${ticket.assignment?.technician_name}.`,
          `Issue: ${ticket.summary}`,
          `Location: ${ticket.location}`,
          `Department: ${ticket.assignment?.department_name}`,
          `Reason: ${reason}`,
          `Accept and schedule: ${acceptUrl}`,
          `Decline: ${declineUrl}`,
        ].join("\n");
      }
      const form = new URLSearchParams(formFields);
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(8000),
      });
      const payload = await response.json().catch(() => ({}));
      result.status = response.ok ? "sent" : "failed";
      if (!response.ok) result.error = payload.message || `WhatsApp provider returned ${response.status}.`;
      else result.provider_id = payload.sid || null;
    } catch {
      result.status = "failed";
      result.error = "WhatsApp provider request failed.";
    }
  }
  ticket.notification = result;
  const channelLabel = result.channel === "email" ? "Email" : "WhatsApp";
  addEvent(
    ticket,
    result.status === "sent"
      ? `${channelLabel} assignment with technician response links sent to ${result.recipient}.`
      : result.status === "failed"
        ? `${channelLabel} assignment could not be sent to ${result.recipient}; ticket remains awaiting technician response.`
        : `${channelLabel} notifications are not configured; ticket remains awaiting technician response.`,
    "notification"
  );
  return result;
}

// AI Photo Verification
export async function verifyRepairWithAI(ticket: Ticket, evidence: { data_url: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Photo verification is unavailable until GEMINI_API_KEY is configured.");
    (error as any).status = 503;
    throw error;
  }
  if (!evidence || !/^data:image\/(jpeg|png|webp);base64,/.test(evidence.data_url || "")) {
    const error = new Error("Attach a JPEG, PNG, or WebP completion photo.");
    (error as any).status = 400;
    throw error;
  }
  const imageData = evidence.data_url;
  if (Buffer.byteLength(imageData, "utf8") > 8_000_000) {
    const error = new Error("Completion photo must be under 6 MB.");
    (error as any).status = 413;
    throw error;
  }
  const model = process.env.FIXFLOW_VISION_MODEL || "gemini-2.5-flash";
  const fallbackModels = (process.env.FIXFLOW_VISION_FALLBACK_MODELS || "gemini-2.0-flash,gemini-1.5-flash")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const models = [...new Set([model, ...fallbackModels])];
  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: `Assess whether the maintenance issue is visibly fixed based on this completion photo.\nIssue: ${ticket.summary}\nDetails: ${ticket.description}\nLocation: ${ticket.location}\nReturn JSON with keys fixed (boolean), confidence (number 0 to 1), and reason (short string). Set fixed true only when the photo clearly shows the reported issue is resolved. If the image is inconclusive, unrelated, or does not show the repair, set fixed false.`,
          },
          { inline_data: { mime_type: imageData.slice("data:".length, imageData.indexOf(";")), data: imageData.slice(imageData.indexOf(",") + 1) } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { fixed: { type: "BOOLEAN" }, confidence: { type: "NUMBER" }, reason: { type: "STRING" } },
        required: ["fixed", "confidence", "reason"],
      },
      maxOutputTokens: 300,
    },
  });
  const failures: string[] = [];
  let verdict: { fixed: boolean; confidence: number; reason: string } | undefined;
  let modelUsed: string | undefined;
  for (const candidateModel of models) {
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`,
        { method: "POST", headers: { "x-goog-api-key": apiKey, "content-type": "application/json" }, body: requestBody, signal: AbortSignal.timeout(12000) }
      );
    } catch {
      failures.push(`${candidateModel} (timeout/network)`);
      continue;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const retryable = response.status === 403 || response.status === 404 || response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (retryable) {
        failures.push(`${candidateModel} (HTTP ${response.status})`);
        continue;
      }
      const error = new Error(`The AI photo check was rejected (HTTP ${response.status}). The ticket remains open.`);
      (error as any).status = 502;
      throw error;
    }
    const outputText = payload?.candidates?.[0]?.content?.parts?.find((part: any) => typeof part.text === "string")?.text;
    let candidateVerdict: { fixed: boolean; confidence: number; reason: string } | null;
    try {
      candidateVerdict = JSON.parse(outputText);
    } catch {
      candidateVerdict = null;
    }
    if (!candidateVerdict || typeof candidateVerdict.fixed !== "boolean" || !Number.isFinite(candidateVerdict.confidence) || typeof candidateVerdict.reason !== "string") {
      failures.push(`${candidateModel} (invalid response)`);
      continue;
    }
    verdict = candidateVerdict;
    modelUsed = candidateModel;
    break;
  }
  if (!verdict) {
    const error = new Error(`The AI photo check failed on all configured Gemini models: ${failures.join(", ")}. The ticket remains open.`);
    (error as any).status = 503;
    throw error;
  }
  const confidence = Math.max(0, Math.min(1, verdict.confidence));
  const passed = verdict.fixed && confidence >= Number(process.env.FIXFLOW_VERIFICATION_CONFIDENCE || 0.7);
  await mkdir(evidenceDir, { recursive: true });
  const extension = imageData.startsWith("data:image/png;") ? "png" : imageData.startsWith("data:image/webp;") ? "webp" : "jpg";
  const filename = `${ticket.id.toLowerCase()}-${randomUUID()}.${extension}`;
  await writeFile(join(evidenceDir, filename), Buffer.from(imageData.slice(imageData.indexOf(",") + 1), "base64"));
  return {
    state: passed ? ("passed" as const) : ("failed" as const),
    fixed: verdict.fixed,
    confidence,
    reason: verdict.reason.slice(0, 400),
    model: modelUsed,
    photo_url: `/evidence/${filename}`,
    checked_at: now(),
  };
}

// Assignment response handler
export async function applyAssignmentResponse(ticket: Ticket, action: string, scheduledAt: string, baseUrl: string) {
  if (ticket.status !== "assigned" || ticket.assignment?.response !== "pending") {
    const error = new Error("This assignment is no longer awaiting a response.");
    (error as any).status = 409;
    throw error;
  }
  if (action === "accept") {
    const scheduledTime = Date.parse(scheduledAt);
    if (typeof scheduledAt !== "string" || !Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
      const error = new Error("Choose a future date and time before accepting.");
      (error as any).status = 400;
      throw error;
    }
    ticket.assignment.response = "accepted";
    ticket.scheduled_at = new Date(scheduledAt).toISOString();
    ticket.status = "scheduled";
    addEvent(ticket, `${ticket.assignment.technician_name} accepted and scheduled the fix for ${new Date(ticket.scheduled_at).toLocaleString()}.`, "scheduled");
    return { ticket, outcome: "accepted" as const };
  }
  if (action === "decline") {
    const previous = ticket.assignment;
    ticket.declined_technician_ids.push(previous.technician_id);
    const next = chooseTechnician(previous.department_id, ticket.declined_technician_ids, ticket.id);
    ticket.assignment.response = "declined";
    if (next) {
      ticket.assignment = { ...ticket.assignment, technician_id: next.id, technician_name: next.name, response: "pending" };
      addEvent(ticket, `${previous.technician_name} declined. Reassigned to ${next.name}; awaiting response.`, "reassigned");
      await notifyAssignment(ticket, "reassigned", baseUrl);
      return { ticket, outcome: "reassigned" as const, nextTechnician: next.name };
    }
    ticket.assignment = null;
    ticket.status = "unassigned";
    ticket.technician_action_token = null;
    addEvent(ticket, `${previous.technician_name} declined. No other available technician in this department; ticket needs helpdesk reassignment.`, "unassigned");
    return { ticket, outcome: "unassigned" as const };
  }
  const error = new Error("That action is not valid for this ticket state.");
  (error as any).status = 400;
  throw error;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function requestBaseUrl(request: Request): string {
  const configured = process.env.FIXFLOW_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const protocol = forwardedProto === "https" ? "https" : "http";
  return `${protocol}://${forwardedHost || request.headers.get("host") || "localhost:3000"}`;
}
