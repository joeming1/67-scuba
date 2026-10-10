import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, 'public');
const dataDir = join(here, 'data');
const dataFile = join(dataDir, 'tickets.json');
const evidenceDir = join(dataDir, 'evidence');
const envFile = join(here, '.env');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const LOW_LIGHT_THRESHOLD = 25;
const RECOVERY_THRESHOLD = 40;
const REQUIRED_SAMPLES = 3;

const departments = {
  lighting: { id: 'facilities_electrical', name: 'Facilities - Electrical' },
  air_conditioning: { id: 'facilities_mechanical', name: 'Facilities - Mechanical' },
  student_portal: { id: 'it_services', name: 'IT Services' },
  other: { id: 'helpdesk_triage', name: 'Helpdesk Triage' },
};

const technicians = [
  { id: 'tech_01', name: 'Aina Rahman', department_id: 'facilities_electrical', available: true },
  { id: 'tech_04', name: 'Amir Hassan', department_id: 'facilities_electrical', available: true },
  { id: 'tech_05', name: 'Sofia Lim', department_id: 'facilities_electrical', available: true },
  { id: 'tech_02', name: 'Daniel Lee', department_id: 'facilities_mechanical', available: true },
  { id: 'tech_06', name: 'Priya Nair', department_id: 'facilities_mechanical', available: true },
  { id: 'tech_03', name: 'Mei Tan', department_id: 'it_services', available: true },
  { id: 'tech_07', name: 'Arun Kumar', department_id: 'it_services', available: true },
  { id: 'tech_00', name: 'Helpdesk Team', department_id: 'helpdesk_triage', available: true },
];

let tickets = [];
let latestSensors = {};
let nextNumber = 1;

async function loadLocalEnv() {
  try {
    const lines = (await readFile(envFile, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function loadState() {
  await mkdir(dataDir, { recursive: true });
  try {
    const saved = JSON.parse(await readFile(dataFile, 'utf8'));
    tickets = Array.isArray(saved.tickets) ? saved.tickets : [];
    nextNumber = Number(saved.next_number) || tickets.length + 1;
    for (const ticket of tickets) {
      if (ticket.status === 'assigned' && ticket.assignment && !ticket.assignment.response) {
        ticket.assignment.response = 'pending';
      }
      ticket.declined_technician_ids ||= [];
      ticket.scheduled_at ??= null;
      ticket.notification ??= null;
      ticket.technician_action_token ??= ticket.email_action_token ?? null;
      ticket.student_tracking_token ||= randomBytes(24).toString('base64url');
      ticket.completion_verification ??= null;
      delete ticket.email_notification;
      delete ticket.email_action_token;
    }
  } catch {
    await saveState();
  }
}

async function saveState() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify({ next_number: nextNumber, tickets }, null, 2));
}

function now() {
  return new Date().toISOString();
}

function addEvent(ticket, message, type = 'update') {
  ticket.timeline.unshift({ id: randomUUID(), type, message, created_at: now() });
  ticket.updated_at = now();
}

function chooseTechnician(departmentId, excluded = [], currentTicketId = null) {
  return technicians.find((tech) => {
    if (tech.department_id !== departmentId || !tech.available || excluded.includes(tech.id)) return false;
    return !tickets.some((ticket) => ticket.id !== currentTicketId
      && ticket.status !== 'closed'
      && ticket.status !== 'unassigned'
      && ticket.assignment?.technician_id === tech.id);
  });
}

function publicTicket(ticket) {
  const { email_action_token, technician_action_token, student_tracking_token, student_email, notification, ...visible } = ticket;
  return {
    ...visible,
    notification: notification ? { channel: notification.channel, status: notification.status } : null,
  };
}

function requestBaseUrl(request) {
  const configured = process.env.FIXFLOW_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const forwardedProto = request.headers['x-forwarded-proto']?.split(',')[0].trim();
  const forwardedHost = request.headers['x-forwarded-host']?.split(',')[0].trim();
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  return `${protocol}://${forwardedHost || request.headers.host || `localhost:${PORT}`}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FIXFLOW_FROM_EMAIL;
  if (!apiKey || !from || !to) return { status: 'not_configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok
      ? { status: 'sent', id: payload.id || null }
      : { status: 'failed', error: payload.message || `Email provider returned ${response.status}.` };
  } catch {
    return { status: 'failed', error: 'Email provider request failed.' };
  }
}

async function emailStudentUpdate(ticket, message, baseUrl) {
  const recipient = ticket.student_email || process.env.FIXFLOW_NOTIFY_TO;
  const origin = (baseUrl || process.env.FIXFLOW_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  const result = await sendEmail({
    to: recipient,
    subject: `FixFlow update for ${ticket.id}: ${ticket.status.replaceAll('_', ' ')}`,
    text: [
      `Update for FixFlow ticket ${ticket.id}`,
      `Status: ${ticket.status.replaceAll('_', ' ')}`,
      message,
      ticket.scheduled_at ? `Scheduled visit: ${new Date(ticket.scheduled_at).toLocaleString()}` : '',
      `Track this ticket: ${origin}/student/${ticket.student_tracking_token}`,
    ].filter(Boolean).join('\n\n'),
  });
  ticket.email_update = { status: result.status, updated_at: now(), ...(result.id ? { id: result.id } : {}), ...(result.error ? { error: result.error } : {}) };
  return result;
}

async function notifyAssignment(ticket, reason, baseUrl) {
  const recipient = process.env.FIXFLOW_WHATSAPP_TO;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const contentSid = process.env.TWILIO_WHATSAPP_CONTENT_SID?.trim();
  const whatsappEnabled = process.env.FIXFLOW_WHATSAPP_ENABLED === 'true';
  const emailRecipient = process.env.FIXFLOW_NOTIFY_TO;
  const result = {
    channel: whatsappEnabled ? 'whatsapp' : 'email',
    recipient: whatsappEnabled ? recipient || null : emailRecipient || null,
    status: 'not_configured',
    updated_at: now(),
  };
  ticket.technician_action_token = randomBytes(32).toString('base64url');
  const origin = (baseUrl || `http://localhost:${PORT}`).replace(/\/+$/, '');
  const technicianUrl = `${origin}/technician/${ticket.technician_action_token}`;
  const acceptUrl = `${origin}/technician-actions/${ticket.technician_action_token}?choice=accept`;
  const declineUrl = `${origin}/technician-actions/${ticket.technician_action_token}?choice=decline`;
  if (!whatsappEnabled) {
    const email = await sendEmail({
      to: emailRecipient,
      subject: `FixFlow assignment: ${ticket.id}`,
      text: [
        `FixFlow ticket ${ticket.id} assigned to ${ticket.assignment.technician_name}.`,
        `Issue: ${ticket.summary}`,
        `Location: ${ticket.location}`,
        `Department: ${ticket.assignment.department_name}`,
        `Reason: ${reason}`,
        `Open your technician workspace to accept and schedule the visit, start work, record an attempt, or submit a completion photo: ${technicianUrl}`,
      ].join('\n\n'),
    });
    result.status = email.status;
    if (email.id) result.provider_id = email.id;
    if (email.error) result.error = email.error;
  } else if (accountSid && authToken && from && recipient) {
    try {
      const formFields = {
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        To: recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`,
      };
      if (contentSid) {
        formFields.ContentSid = contentSid;
        formFields.ContentVariables = JSON.stringify({
          1: ticket.id,
          2: ticket.assignment.technician_name,
          3: ticket.summary,
          4: ticket.location,
          5: ticket.assignment.department_name,
          6: reason,
          7: acceptUrl,
          8: declineUrl,
        });
      } else {
        formFields.Body = [
          `FixFlow ticket ${ticket.id} assigned to ${ticket.assignment.technician_name}.`,
          `Issue: ${ticket.summary}`,
          `Location: ${ticket.location}`,
          `Department: ${ticket.assignment.department_name}`,
          `Reason: ${reason}`,
          `Accept and schedule: ${acceptUrl}`,
          `Decline: ${declineUrl}`,
        ].join('\n');
      }
      const form = new URLSearchParams(formFields);
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(8000),
      });
      const payload = await response.json().catch(() => ({}));
      result.status = response.ok ? 'sent' : 'failed';
      if (!response.ok) result.error = payload.message || `WhatsApp provider returned ${response.status}.`;
      else result.provider_id = payload.sid || null;
    } catch {
      result.status = 'failed';
      result.error = 'WhatsApp provider request failed.';
    }
  }
  ticket.notification = result;
  const channelLabel = result.channel === 'email' ? 'Email' : 'WhatsApp';
  addEvent(ticket, result.status === 'sent'
    ? `${channelLabel} assignment with technician response links sent to ${result.recipient}.`
    : result.status === 'failed'
      ? `${channelLabel} assignment could not be sent to ${result.recipient}; ticket remains awaiting technician response.`
      : `${channelLabel} notifications are not configured; ticket remains awaiting technician response.`, 'notification');
  return result;
}

function classify(description) {
  const text = description.toLowerCase();
  if (/\b(light|lights|lighting|dark|dim|brightness)\b/.test(text)) return 'lighting';
  if (/\b(ac|air.?con|temperature|hot|warm|cooling)\b/.test(text)) return 'air_conditioning';
  if (/\b(portal|login|log in|password|student account)\b/.test(text)) return 'student_portal';
  return 'other';
}

function createTicket({ source, description, location, category, sensorId, sensorValue, studentEmail }) {
  const department = departments[category] || departments.other;
  const technician = chooseTechnician(department.id);
  const ticket = {
    id: `FX-${String(nextNumber++).padStart(4, '0')}`,
    source,
    summary: source === 'sensor' ? `Low light detected in ${location}` : description.trim().slice(0, 90),
    description: source === 'sensor'
      ? `Room brightness stayed below ${LOW_LIGHT_THRESHOLD}% for ${REQUIRED_SAMPLES} consecutive readings.`
      : description.trim(),
    category,
    priority: /cannot access|urgent|completely down/i.test(description) ? 'high' : 'medium',
    location: location.trim(),
    student_email: studentEmail || null,
    status: 'assigned',
    assignment: technician ? {
      department_id: department.id,
      department_name: department.name,
      technician_id: technician.id,
      technician_name: technician.name,
      response: 'pending',
    } : null,
    declined_technician_ids: [],
    scheduled_at: null,
    notification: null,
    technician_action_token: null,
    student_tracking_token: randomBytes(24).toString('base64url'),
    completion_verification: null,
    sensor_id: sensorId || null,
    verification: source === 'sensor'
      ? { type: 'ldr_brightness', state: 'pending', last_value: sensorValue, unit: '%' }
      : null,
    timeline: [],
    created_at: now(),
    updated_at: now(),
  };
  tickets.unshift(ticket);
  addEvent(ticket, source === 'sensor'
    ? `Auto-created after ${REQUIRED_SAMPLES} low-light readings (${sensorValue}%).`
    : `Student report received and categorized as ${category.replaceAll('_', ' ')}.`, 'created');
  if (technician) addEvent(ticket, `Assigned to ${technician.name} in ${department.name}; awaiting response.`, 'assigned');
  else ticket.status = 'unassigned';
  return ticket;
}

function openSensorTicket(sensorId) {
  return tickets.find((ticket) => ticket.sensor_id === sensorId && ticket.status !== 'closed');
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 12_000_000) throw new Error('Request body is too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

async function readFormBody(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('Request body is too large.');
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function send(response, status, payload, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(contentType.startsWith('application/json') ? JSON.stringify(payload) : payload);
}

async function verifyRepairWithAI(ticket, evidence) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Photo verification is unavailable until GEMINI_API_KEY is configured.');
    error.status = 503;
    throw error;
  }
  if (!evidence || !/^data:image\/(jpeg|png|webp);base64,/.test(evidence.data_url || '')) {
    const error = new Error('Attach a JPEG, PNG, or WebP completion photo.');
    error.status = 400;
    throw error;
  }
  const imageData = evidence.data_url;
  if (Buffer.byteLength(imageData, 'utf8') > 8_000_000) {
    const error = new Error('Completion photo must be under 6 MB.');
    error.status = 413;
    throw error;
  }
  const model = process.env.FIXFLOW_VISION_MODEL || 'gemini-3.8-flash';
  const fallbackModels = (process.env.FIXFLOW_VISION_FALLBACK_MODELS
    || 'gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite')
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const models = [...new Set([model, ...fallbackModels])];
  const requestBody = JSON.stringify({
    contents: [{
      parts: [
        { text: `Assess whether the maintenance issue is visibly fixed based on this completion photo.\nIssue: ${ticket.summary}\nDetails: ${ticket.description}\nLocation: ${ticket.location}\nReturn JSON with keys fixed (boolean), confidence (number 0 to 1), and reason (short string). Set fixed true only when the photo clearly shows the reported issue is resolved. If the image is inconclusive, unrelated, or does not show the repair, set fixed false.` },
        { inline_data: { mime_type: imageData.slice('data:'.length, imageData.indexOf(';')), data: imageData.slice(imageData.indexOf(',') + 1) } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          fixed: { type: 'BOOLEAN' },
          confidence: { type: 'NUMBER' },
          reason: { type: 'STRING' },
        },
        required: ['fixed', 'confidence', 'reason'],
      },
      maxOutputTokens: 300,
    },
  });
  const failures = [];
  let verdict;
  let modelUsed;
  for (const candidateModel of models) {
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: requestBody,
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      failures.push(`${candidateModel} (timeout/network)`);
      continue;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const retryable = response.status === 403 || response.status === 404
        || response.status === 408 || response.status === 425 || response.status === 429
        || response.status >= 500;
      if (retryable) {
        failures.push(`${candidateModel} (HTTP ${response.status})`);
        continue;
      }
      const error = new Error(`The AI photo check was rejected (HTTP ${response.status}). The ticket remains open.`);
      error.status = 502;
      throw error;
    }

    const outputText = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
    let candidateVerdict;
    try { candidateVerdict = JSON.parse(outputText); } catch { candidateVerdict = null; }
    if (!candidateVerdict || typeof candidateVerdict.fixed !== 'boolean' || !Number.isFinite(candidateVerdict.confidence) || typeof candidateVerdict.reason !== 'string') {
      failures.push(`${candidateModel} (invalid response)`);
      continue;
    }
    verdict = candidateVerdict;
    modelUsed = candidateModel;
    break;
  }
  if (!verdict) {
    const error = new Error(`The AI photo check failed on all configured Gemini models: ${failures.join(', ')}. The ticket remains open.`);
    error.status = 503;
    throw error;
  }
  const confidence = Math.max(0, Math.min(1, verdict.confidence));
  const passed = verdict.fixed && confidence >= Number(process.env.FIXFLOW_VERIFICATION_CONFIDENCE || 0.7);
  await mkdir(evidenceDir, { recursive: true });
  const extension = imageData.startsWith('data:image/png;') ? 'png' : imageData.startsWith('data:image/webp;') ? 'webp' : 'jpg';
  const filename = `${ticket.id.toLowerCase()}-${randomUUID()}.${extension}`;
  await writeFile(join(evidenceDir, filename), Buffer.from(imageData.slice(imageData.indexOf(',') + 1), 'base64'));
  return {
    state: passed ? 'passed' : 'failed',
    fixed: verdict.fixed,
    confidence,
    reason: verdict.reason.slice(0, 400),
    model: modelUsed,
    photo_url: `/evidence/${filename}`,
    checked_at: now(),
  };
}

function findTechnicianActionTicket(token) {
  return tickets.find((ticket) => ticket.technician_action_token === token
    && ticket.status === 'assigned'
    && ticket.assignment?.response === 'pending');
}

function findTechnicianWorkspaceTicket(token) {
  return tickets.find((ticket) => ticket.technician_action_token === token && ticket.assignment);
}

function technicianActionPage({ ticket, token, choice, message = '', status = 200, success = false, scheduledAt = '' }) {
  const isAccept = choice === 'accept';
  const actionTitle = isAccept ? 'Accept and schedule this fix' : 'Decline this ticket';
  const safeMessage = message ? `<div class="message">${escapeHtml(message)}</div>` : '';
  const ticketDetails = ticket
    ? `<dl><dt>Ticket</dt><dd>${escapeHtml(ticket.id)}</dd><dt>Issue</dt><dd>${escapeHtml(ticket.summary)}</dd><dt>Location</dt><dd>${escapeHtml(ticket.location)}</dd><dt>Assigned to</dt><dd>${escapeHtml(ticket.assignment.technician_name)}</dd></dl>`
    : '';
  let content;
  if (success) {
    content = `<div class="success">${escapeHtml(message)}</div><p>You can close this page.</p>`;
  } else if (ticket && isAccept) {
    content = `${safeMessage}${ticketDetails}<form method="post" action="/technician-actions/${encodeURIComponent(token)}">`
      + `<input type="hidden" name="action" value="accept"><input type="hidden" id="scheduled_at" name="scheduled_at">`
      + `<label for="scheduled_local">Choose a visit date and time</label>`
      + `<input id="scheduled_local" type="datetime-local" required value="${escapeHtml(scheduledAt)}">`
      + `<p style="color:#6c7c89;font-size:12px">Time is interpreted in this device’s local timezone.</p>`
      + `<button type="submit">Accept &amp; schedule</button></form>`;
  } else if (ticket) {
    content = `${safeMessage}${ticketDetails}<form method="post" action="/technician-actions/${encodeURIComponent(token)}">`
      + `<input type="hidden" name="action" value="decline"><p>Declining sends the ticket to the next available technician in this department.</p>`
      + `<button class="decline" type="submit">Confirm decline</button></form>`;
  } else {
    content = `<div class="message">${message ? escapeHtml(message) : 'This assignment was already handled, reassigned, or reset. Open the latest assignment email if one was sent.'}</div>`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FixFlow technician response</title><style>`
    + `*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#17212b;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{max-width:520px;margin:7vh auto;padding:26px;background:white;border:1px solid #dce4e9;border-radius:16px;box-shadow:0 8px 30px #102b3f12}h1{margin:0 0 8px;color:#102b3f;font-size:24px}.lead{color:#6c7c89;line-height:1.5;margin:0 0 20px}dl{display:grid;grid-template-columns:110px 1fr;gap:9px;margin:18px 0;padding:15px;background:#eff6f8;border-radius:10px}dt{font-size:13px;color:#6c7c89}dd{margin:0;font-size:14px;font-weight:650;overflow-wrap:anywhere}label{display:block;margin:14px 0 7px;font-weight:650;font-size:14px}input[type=datetime-local]{width:100%;padding:12px;border:1px solid #cbd7de;border-radius:8px;font:inherit}button{width:100%;margin-top:15px;padding:13px;border:0;border-radius:9px;background:#0e8a7a;color:white;font-size:16px;font-weight:700}.decline{background:#a75d17}.message{padding:12px;background:#fff3db;border-radius:9px;color:#744710;line-height:1.5}.success{padding:14px;background:#e9f7ef;border-radius:9px;color:#176b4b;font-weight:700}`
    + `@media(max-width:560px){.card{margin:0;min-height:100vh;border:0;border-radius:0;padding:24px 20px}}`;
  const timezoneScript = isAccept && !success
    ? `<script>document.querySelector('form').addEventListener('submit',function(event){const local=document.getElementById('scheduled_local');const date=new Date(local.value);if(!local.value||Number.isNaN(date.getTime())){event.preventDefault();return}document.getElementById('scheduled_at').value=date.toISOString()})</script>`
    : '';
  const completeHtml = `${html}</style></head><body><main class="card"><h1>${escapeHtml(actionTitle)}</h1><p class="lead">FixFlow technician response</p>${content}</main>${timezoneScript}</body></html>`;
  return { status, html: completeHtml };
}

async function applyAssignmentResponse(ticket, action, scheduledAt, baseUrl) {
  if (ticket.status !== 'assigned' || ticket.assignment?.response !== 'pending') {
    const error = new Error('This assignment is no longer awaiting a response.');
    error.status = 409;
    throw error;
  }
  if (action === 'accept') {
    const scheduledTime = Date.parse(scheduledAt);
    if (typeof scheduledAt !== 'string' || !Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
      const error = new Error('Choose a future date and time before accepting.');
      error.status = 400;
      throw error;
    }
    ticket.assignment.response = 'accepted';
    ticket.scheduled_at = new Date(scheduledAt).toISOString();
    ticket.status = 'scheduled';
    addEvent(ticket, `${ticket.assignment.technician_name} accepted and scheduled the fix for ${new Date(ticket.scheduled_at).toLocaleString()}.`, 'scheduled');
    return { ticket, outcome: 'accepted' };
  }
  if (action === 'decline') {
    const previous = ticket.assignment;
    ticket.declined_technician_ids.push(previous.technician_id);
    const next = chooseTechnician(previous.department_id, ticket.declined_technician_ids, ticket.id);
    ticket.assignment.response = 'declined';
    if (next) {
      ticket.assignment = { ...ticket.assignment, technician_id: next.id, technician_name: next.name, response: 'pending' };
      addEvent(ticket, `${previous.technician_name} declined. Reassigned to ${next.name}; awaiting response.`, 'reassigned');
      await notifyAssignment(ticket, 'reassigned', baseUrl);
      return { ticket, outcome: 'reassigned', nextTechnician: next.name };
    }
    ticket.assignment = null;
    ticket.status = 'unassigned';
    ticket.technician_action_token = null;
    addEvent(ticket, `${previous.technician_name} declined. No other available technician in this department; ticket needs helpdesk reassignment.`, 'unassigned');
    return { ticket, outcome: 'unassigned' };
  }
  const error = new Error('That action is not valid for this ticket state.');
  error.status = 400;
  throw error;
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/sensor-events') {
    const sensors = Object.entries(latestSensors).map(([sensor_id, sensor]) => ({ sensor_id, ...sensor }));
    return send(response, 200, { sensors, server_time: now() });
  }

  const technicianTicketMatch = pathname.match(/^\/api\/technician\/tickets\/([A-Za-z0-9_-]+)$/);
  if (request.method === 'GET' && technicianTicketMatch) {
    const ticket = findTechnicianWorkspaceTicket(technicianTicketMatch[1]);
    if (!ticket) return send(response, 404, { error: 'Technician link is invalid or expired.' });
    return send(response, 200, { ticket: publicTicket(ticket) });
  }

  const studentTicketMatch = pathname.match(/^\/api\/student\/tickets\/([A-Za-z0-9_-]+)$/);
  if (request.method === 'GET' && studentTicketMatch) {
    const ticket = tickets.find((item) => item.student_tracking_token === studentTicketMatch[1]);
    if (!ticket) return send(response, 404, { error: 'Student tracking link not found.' });
    const visibleTicket = publicTicket(ticket);
    if (visibleTicket.notification) {
      visibleTicket.notification = { channel: visibleTicket.notification.channel, status: visibleTicket.notification.status };
    }
    return send(response, 200, { ticket: visibleTicket });
  }

  if (request.method === 'POST' && pathname === '/api/student-reports') {
    const body = await readBody(request);
    if (typeof body.description !== 'string' || body.description.trim().length < 4) {
      return send(response, 400, { error: 'Describe the issue in at least four characters.' });
    }
    const studentEmail = typeof body.email === 'string' ? body.email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
      return send(response, 400, { error: 'Enter a valid email address so we can send you ticket updates.' });
    }
    const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : 'Not specified';
    const category = classify(body.description);
    const ticket = createTicket({ source: 'student_report', description: body.description, location, category, studentEmail });
    if (ticket.assignment) await notifyAssignment(ticket, 'assigned', requestBaseUrl(request));
    await saveState();
    return send(response, 201, {
      ticket: publicTicket(ticket),
      notification: ticket.notification ? { channel: ticket.notification.channel, status: ticket.notification.status } : null,
      tracking_url: `${requestBaseUrl(request)}/student/${ticket.student_tracking_token}`,
    });
  }

  if (request.method === 'POST' && pathname === '/api/sensor-events') {
    const body = await readBody(request);
    if (body.sensor_type !== 'ldr' || body.metric !== 'brightness_pct' || !Number.isFinite(body.value) || body.value < 0 || body.value > 100) {
      return send(response, 400, { error: 'Send an LDR brightness_pct value from 0 to 100.' });
    }
    const sensorId = typeof body.sensor_id === 'string' && body.sensor_id.trim() ? body.sensor_id.trim() : 'ldr_b204';
    const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : 'Room B-204';
    const value = Math.round(body.value);
    const sensor = latestSensors[sensorId] || { low_count: 0, recovery_count: 0, value: null, location };
    sensor.value = value;
    sensor.location = location;
    sensor.observed_at = body.observed_at || now();
    sensor.received_at = now();
    sensor.low_count = value < LOW_LIGHT_THRESHOLD ? sensor.low_count + 1 : 0;
    sensor.recovery_count = value >= RECOVERY_THRESHOLD ? sensor.recovery_count + 1 : 0;
    latestSensors[sensorId] = sensor;

    let ticket = openSensorTicket(sensorId);
    let action = 'ignored';
    if (!ticket && sensor.low_count >= REQUIRED_SAMPLES) {
      ticket = createTicket({ source: 'sensor', description: `LDR reported ${value}% brightness.`, location, category: 'lighting', sensorId, sensorValue: value });
      action = 'created';
      if (ticket.assignment) await notifyAssignment(ticket, 'assigned', requestBaseUrl(request));
    } else if (ticket) {
      action = 'updated';
      if (ticket.verification) ticket.verification.last_value = value;
      const sensorVerificationStarted = ticket.status === 'verification_pending'
        || ticket.status === 'follow_up'
        || (ticket.status === 'in_progress' && ticket.completion_verification?.state === 'passed');
      if (sensorVerificationStarted) {
        if (value < RECOVERY_THRESHOLD) {
          ticket.status = 'follow_up';
          if (ticket.verification) ticket.verification.state = 'failed';
          if (ticket.timeline[0]?.message !== `Verification still low at ${value}%; technician follow-up required.`) {
            addEvent(ticket, `Verification still low at ${value}%; technician follow-up required.`, 'follow_up');
          }
        } else if (sensor.recovery_count >= REQUIRED_SAMPLES && ticket.verification?.state !== 'passed') {
          if (ticket.verification) ticket.verification.state = 'passed';
          if (ticket.completion_verification?.state === 'passed') {
            ticket.status = 'closed';
            addEvent(ticket, `Repair completed and verified by LDR recovery (${value}%) and AI photo check.`, 'closed');
            await emailStudentUpdate(ticket, 'The room sensor confirmed brightness recovery and the completion photo passed AI verification. The repair is complete.', requestBaseUrl(request));
          } else {
            ticket.status = 'verification_pending';
            addEvent(ticket, `Sensor confirms brightness recovered to ${value}%; technician photo verification is still required before completion.`, 'verification');
          }
        }
      }
    }
    await saveState();
    return send(response, 201, {
      action,
      ticket_id: ticket?.id || null,
      tracking_url: ticket ? `${requestBaseUrl(request)}/student/${ticket.student_tracking_token}` : null,
      sensor,
      notification: action === 'created' && ticket?.notification
        ? { channel: ticket.notification.channel, status: ticket.notification.status }
        : undefined,
    });
  }

  const actionMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/actions$/);
  if (request.method === 'POST' && actionMatch) {
    const ticket = tickets.find((item) => item.id === decodeURIComponent(actionMatch[1]));
    if (!ticket) return send(response, 404, { error: 'Ticket not found.' });
    const body = await readBody(request);
    const action = body.action;
    if (!ticket.technician_action_token || body.technician_token !== ticket.technician_action_token) {
      return send(response, 403, { error: 'Open this ticket from the technician link in your assignment email.' });
    }
    if (action === 'accept' || action === 'decline') {
      try {
        const result = await applyAssignmentResponse(ticket, action, body.scheduled_at, requestBaseUrl(request));
        if (result.outcome === 'accepted') {
          await emailStudentUpdate(ticket, `The technician accepted the visit and scheduled the repair for ${new Date(ticket.scheduled_at).toLocaleString()}.`, requestBaseUrl(request));
        }
        await saveState();
        return send(response, 200, { ticket: publicTicket(ticket), outcome: result.outcome });
      } catch (error) {
        return send(response, error.status || 400, { error: error.message, ticket: publicTicket(ticket) });
      }
    }
    let studentUpdateMessage = '';
    if (ticket.status === 'closed') {
      return send(response, 409, { error: 'This ticket is already closed.' });
    } else if (action === 'start_work' && ticket.status === 'scheduled') {
      ticket.status = 'in_progress';
      const scheduled = ticket.scheduled_at
        ? ` The visit was scheduled for ${new Date(ticket.scheduled_at).toLocaleString()}.`
        : '';
      addEvent(ticket, `${ticket.assignment?.technician_name || 'Technician'} arrived and started work.${scheduled}`, 'work_started');
      studentUpdateMessage = `${ticket.assignment?.technician_name || 'Technician'} arrived and started work.${scheduled}`;
    } else if (action === 'start_work' && ticket.status === 'follow_up') {
      ticket.status = 'in_progress';
      addEvent(ticket, `${ticket.assignment?.technician_name || 'Technician'} resumed work after follow-up.`, 'work_started');
      studentUpdateMessage = `${ticket.assignment?.technician_name || 'Technician'} resumed work after follow-up.`;
    } else if (action === 'repair_attempted' && ticket.status === 'in_progress') {
      if (ticket.source === 'sensor') {
        ticket.status = 'verification_pending';
        if (ticket.verification) ticket.verification.state = 'pending';
        const sensor = latestSensors[ticket.sensor_id];
        if (sensor) sensor.recovery_count = 0;
        addEvent(ticket, 'Technician reported a repair attempt. Waiting for the LDR to verify room brightness.', 'verification');
        if (sensor && sensor.value < RECOVERY_THRESHOLD) {
          ticket.status = 'follow_up';
          if (ticket.verification) ticket.verification.state = 'failed';
          addEvent(ticket, `Repair not verified: brightness is still ${sensor.value}%. Follow-up required.`, 'follow_up');
        }
      } else {
        ticket.status = 'follow_up';
        addEvent(ticket, 'Technician attempted the repair, but follow-up is needed before the issue can be marked complete.', 'follow_up');
      }
      studentUpdateMessage = ticket.source === 'sensor'
        ? 'The technician attempted the repair. FixFlow is checking the room sensor and will keep the ticket open until the repair is verified.'
        : 'The technician attempted the repair, but follow-up is needed before the issue can be marked complete.';
    } else if (action === 'complete_work' && ['in_progress', 'verification_pending', 'follow_up'].includes(ticket.status)) {
      let verification;
      try {
        verification = await verifyRepairWithAI(ticket, body.evidence);
      } catch (error) {
        ticket.completion_verification = { state: 'unavailable', reason: error.message, checked_at: now() };
        await emailStudentUpdate(ticket, 'The technician submitted a completion photo, but FixFlow could not verify the repair yet. The ticket remains open.', requestBaseUrl(request));
        await saveState();
        return send(response, error.status || 502, { error: error.message, ticket: publicTicket(ticket) });
      }
      ticket.completion_verification = verification;
      if (verification.state !== 'passed') {
        addEvent(ticket, `AI photo check did not confirm completion (${Math.round(verification.confidence * 100)}% confidence): ${verification.reason}`, 'verification_failed');
        await emailStudentUpdate(ticket, 'The technician submitted a completion photo, but FixFlow could not confirm the repair. The ticket remains open for follow-up.', requestBaseUrl(request));
        await saveState();
        return send(response, 422, { error: 'The photo did not verify that the issue is fixed. Add a clearer photo or continue the repair.', ticket: publicTicket(ticket) });
      }
      if (ticket.source === 'sensor' && ticket.verification?.state !== 'passed') {
        ticket.status = 'verification_pending';
        if (ticket.verification) ticket.verification.state = 'pending';
        const sensor = latestSensors[ticket.sensor_id];
        if (sensor) sensor.recovery_count = 0;
        addEvent(ticket, `AI photo check passed, but the light sensor has not confirmed recovery: ${verification.reason}`, 'verification');
        await emailStudentUpdate(ticket, 'The completion photo passed, but the room sensor has not confirmed the repair. The ticket remains open.', requestBaseUrl(request));
        await saveState();
        return send(response, 422, { error: 'The photo passed, but the sensor still needs to confirm recovery.', ticket: publicTicket(ticket) });
      }
      ticket.status = 'closed';
      addEvent(ticket, `Repair completed and verified by AI photo check (${Math.round(verification.confidence * 100)}% confidence): ${verification.reason}`, 'closed');
      studentUpdateMessage = 'The repair is complete and the completion photo passed verification.';
    } else {
      return send(response, 400, { error: 'That action is not valid for this ticket state.' });
    }
    if (typeof body.note === 'string' && body.note.trim()) addEvent(ticket, body.note.trim(), 'note');
    if (studentUpdateMessage) await emailStudentUpdate(ticket, studentUpdateMessage, requestBaseUrl(request));
    await saveState();
    return send(response, 200, { ticket: publicTicket(ticket) });
  }

  return send(response, 404, { error: 'API route not found.' });
}

async function handleTechnicianAction(request, response, pathname, searchParams) {
  const match = pathname.match(/^\/(?:technician-actions|email-actions)\/([A-Za-z0-9_-]+)$/);
  if (!match) return send(response, 404, 'Not found.', 'text/plain; charset=utf-8');
  const token = match[1];
  const choice = request.method === 'GET' ? searchParams.get('choice') : null;
  if (request.method === 'GET') {
    if (choice !== 'accept' && choice !== 'decline') {
      const page = technicianActionPage({ token, choice: 'accept', message: 'This link is missing its action. Return to the assignment email and open Accept or Decline.', status: 400 });
      return send(response, page.status, page.html, 'text/html; charset=utf-8');
    }
    const ticket = findTechnicianActionTicket(token);
    const page = technicianActionPage({ ticket, token, choice, status: ticket ? 200 : 410 });
    return send(response, page.status, page.html, 'text/html; charset=utf-8');
  }
  if (request.method !== 'POST') return send(response, 405, 'Method not allowed.', 'text/plain; charset=utf-8');

  const body = await readFormBody(request);
  const action = body.action;
  const ticket = findTechnicianActionTicket(token);
  if (!ticket) {
    const page = technicianActionPage({ token, choice: action === 'decline' ? 'decline' : 'accept', status: 410 });
    return send(response, page.status, page.html, 'text/html; charset=utf-8');
  }
  try {
    const result = await applyAssignmentResponse(ticket, action, body.scheduled_at, requestBaseUrl(request));
    if (result.outcome === 'accepted') {
      await emailStudentUpdate(ticket, `The technician accepted the visit and scheduled the repair for ${new Date(ticket.scheduled_at).toLocaleString()}.`, requestBaseUrl(request));
    }
    await saveState();
    const message = result.outcome === 'accepted'
      ? `Ticket ${ticket.id} accepted and scheduled for ${new Date(ticket.scheduled_at).toLocaleString()}.`
      : result.outcome === 'reassigned'
        ? `Ticket ${ticket.id} declined and reassigned to ${result.nextTechnician}. A new notification was sent.`
        : `Ticket ${ticket.id} declined. No other technician is available, so it needs helpdesk reassignment.`;
    const page = technicianActionPage({ token, choice: action, message, success: true });
    return send(response, page.status, page.html, 'text/html; charset=utf-8');
  } catch (error) {
    const page = technicianActionPage({
      ticket,
      token,
      choice: action === 'decline' ? 'decline' : 'accept',
      message: error.message,
      scheduledAt: body.scheduled_at || '',
      status: error.status || 400,
    });
    return send(response, page.status, page.html, 'text/html; charset=utf-8');
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (pathname.startsWith('/technician-actions/') || pathname.startsWith('/email-actions/')) return await handleTechnicianAction(request, response, pathname, url.searchParams);
    if (pathname.startsWith('/api/')) return await handleApi(request, response, pathname);
    if (pathname.startsWith('/technician/')) {
      const token = pathname.slice('/technician/'.length);
      if (!/^[A-Za-z0-9_-]+$/.test(token) || !findTechnicianWorkspaceTicket(token)) {
        return send(response, 404, 'Technician link is invalid or expired.', 'text/plain; charset=utf-8');
      }
      return send(response, 200, await readFile(join(publicDir, 'technician.html')), 'text/html; charset=utf-8');
    }
    if (pathname.startsWith('/student/')) {
      const token = pathname.slice('/student/'.length);
      if (!/^[A-Za-z0-9_-]+$/.test(token) || !tickets.some((ticket) => ticket.student_tracking_token === token)) {
        return send(response, 404, 'Student tracking link not found.', 'text/plain; charset=utf-8');
      }
      return send(response, 200, await readFile(join(publicDir, 'student.html')), 'text/html; charset=utf-8');
    }
    if (pathname === '/demo/sensors' || pathname === '/demo/sensors/') {
      return send(response, 200, await readFile(join(publicDir, 'sensor-demo.html')), 'text/html; charset=utf-8');
    }
    if (pathname.startsWith('/evidence/')) {
      const filename = pathname.slice('/evidence/'.length);
      if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(filename)) return send(response, 404, 'Not found.', 'text/plain; charset=utf-8');
      const content = await readFile(join(evidenceDir, filename));
      const type = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return send(response, 200, content, type);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, { error: 'Method not allowed.' });
    const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    if (requestedPath.includes('..') || requestedPath.includes('\\')) return send(response, 400, { error: 'Invalid path.' });
    const content = await readFile(join(publicDir, requestedPath));
    const type = requestedPath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    return send(response, 200, request.method === 'HEAD' ? '' : content, type);
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    return send(response, status, { error: status === 400 ? 'Request body must be valid JSON.' : 'Unexpected server error.' });
  }
});

await loadState();
await loadLocalEnv();
server.listen(PORT, HOST, () => console.log(`FixFlow demo running at http://localhost:${PORT}`));
