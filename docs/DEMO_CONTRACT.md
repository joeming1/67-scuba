# FixFlow Demo Contract

This file is the agreement for the three-engineer, 24-hour demo. Tencent WorkBuddy is the workflow agent: it reads pending incidents, classifies and prioritizes them, and chooses the next action using FixFlow MCP tools. The backend/MCP server owns persistence, the approved routing directory, duplicate prevention, valid state transitions, and sensor verification. The frontend submits inputs and renders canonical records; it must not invent statuses or assignments.

## Demo scope

- Primary flow: an LDR detects a room that is too dark and records a pending incident. WorkBuddy processes it through MCP, routes a lighting work order, and verifies the repair from later sensor readings.
- Secondary flow: a student enters a short free-text issue (for example, a portal login problem). WorkBuddy classifies it and proposes the department and technician through MCP.
- WorkBuddy must perform live classification and workflow actions through the FixFlow MCP server during the demo. Do not replace WorkBuddy calls with a mocked agent response.
- Technician notifications and follow-up messages may be represented in the ticket timeline; sending real email or messages is out of scope.
- DHT11 temperature/humidity are accepted as telemetry and displayed on the sensor dashboard. They do not create incidents or air-conditioning tickets in this demo.

## Shared conventions

- JSON field names use `snake_case`.
- Timestamps are ISO 8601 UTC strings, for example `2026-10-10T06:30:00Z`.
- IDs are strings. The backend may use UUIDs; examples use readable IDs.
- Missing optional values are omitted or `null`, consistently. Do not send empty strings as missing values.
- Sensor units are explicit. LDR readings use `brightness_pct` from `0` (dark) to `100` (bright); DHT11 readings use `temperature_c` (0–50 °C) and `humidity_pct` (0–100%). Do not send raw ADC counts to ticket logic.
- Demo-only routing is a fixed local directory, not the real university helpdesk.

## Ticket shape

```json
{
  "id": "ticket_001",
  "source": "sensor",
  "summary": "Low light detected in Room B-204",
  "description": "Room brightness stayed below the configured threshold.",
  "category": "lighting",
  "priority": "medium",
  "location": "Room B-204",
  "status": "assigned",
  "assignment": {
    "department_id": "facilities_electrical",
    "department_name": "Facilities - Electrical",
    "technician_id": "tech_01",
    "technician_name": "Demo Technician"
  },
  "verification": {
    "type": "ldr_brightness",
    "state": "pending",
    "last_value": 12,
    "unit": "%"
  },
  "created_at": "2026-10-10T06:30:00Z",
  "updated_at": "2026-10-10T06:30:00Z"
}
```

`source` is `student_report` or `sensor`. `category` is `lighting`, `air_conditioning`, `student_portal`, or `other`. `priority` is `low`, `medium`, or `high`. `verification.state` is `pending`, `passed`, or `failed`.

## API contract

All routes can live in the Next.js app. Keep the API surface small:

### `POST /api/tickets` — student report

Request:

```json
{
  "description": "I cannot log in to the student portal.",
  "location": "Online"
}
```

The backend stores this as a pending intake item. WorkBuddy reads it through MCP, derives category and priority, and requests a work order. The MCP server validates the category and priority, maps the category to the approved demo directory, persists the assignment, and returns the canonical ticket object above. The UI should not ask students to select a department or technician.

`GET /api/tickets` returns `{ "tickets": Ticket[] }` for the dashboard. New reports remain pending triage until WorkBuddy creates a work order.

### `POST /api/sensor-events` — sensor reading

Request:

```json
{
  "sensor_id": "ldr_b204",
  "sensor_type": "ldr",
  "metric": "brightness_pct",
  "value": 12,
  "unit": "%",
  "location": "Room B-204",
  "observed_at": "2026-10-10T06:30:00Z"
}
```

The endpoint stores readings for sensor evidence. A sustained low reading creates a pending incident; later readings update evidence on the active lighting ticket, including bright readings used for recovery verification. Response: `{ "incident_id": "incident_001", "action": "created|updated|ignored" }`. A missing `incident_id` means the reading was neither a trigger nor evidence for an open ticket. Repeated low readings for the same active issue should update its evidence, not create duplicate tickets.

The same endpoint also accepts DHT11 telemetry. Send one metric per event, with `sensor_type: "dht11"`, a stable sensor ID, location, and ISO timestamp. Temperature example:

```json
{
  "sensor_id": "dht11_b204",
  "sensor_type": "dht11",
  "metric": "temperature_c",
  "value": 25.0,
  "unit": "°C",
  "location": "Room B-204",
  "observed_at": "2026-10-10T06:30:00Z"
}
```

Humidity uses `metric: "humidity_pct"`, `unit: "%"`, and a value from 0 to 100. DHT11 responses use `{ "action": "recorded" }`; these events are stored and shown on the dashboard but never enter the LDR incident/repair-verification rules.

### `GET /api/sensor-events` — dashboard sensor feed

Returns `{ "latest_event": SensorEvent | null, "events": SensorEvent[], "pending_incidents": SensorIncident[] }`. `events` can contain LDR, DHT11 temperature, and DHT11 humidity events. The dashboard uses the newest event for each metric; only LDR brightness participates in ticket verification.

### `POST /api/demo/reset` — local demo reset

Clears all process-local demo readings, incidents, tickets, and consecutive-reading counters. The local demo implementation enables this route outside production. In production it is disabled unless `FIXFLOW_DEMO_RESET_TOKEN` is configured and the caller supplies it as a bearer token. Reset is a demo operator action and must not be exposed as an unauthenticated production operation.

## Internal workflow API

The local MCP server calls these app routes; the UI should continue to use only the public request shapes above:

- `GET /api/incidents/pending` returns `{ "incidents": Incident[] }`.
- `GET /api/incidents/{incident_id}` returns the incident, related ticket if one exists, and recent sensor readings.
- `POST /api/work-orders` accepts `{ "incident_id", "category", "priority", "summary", "rationale" }`. The backend validates enums, enforces `lighting` for sensor incidents, prevents duplicates, and selects the technician from the fixed placeholder directory.
- `GET /api/sensor-readings?sensor_id={id}&since={utc_timestamp}` returns recent normalized readings.
- `POST /api/tickets/{ticket_id}/verify` checks three post-repair readings against the recovery threshold; the caller cannot choose the resulting status.

The current local implementation uses process memory to unblock integration. It is disposable demo storage and must be replaced with the planned Supabase persistence adapter before multi-instance or durable use.

### `PATCH /api/tickets/{id}/status` — technician action

Request:

```json
{
  "action": "repair_attempted",
  "note": "Replaced the room light."
}
```

Allowed actions are `accept`, `start_work`, and `repair_attempted`. `repair_attempted` moves the ticket to verification; the server decides whether the ticket closes or needs follow-up based on sensor evidence. The frontend must not directly set `status` to `closed`.

## Ticket lifecycle

```text
new -> assigned -> in_progress -> verification_pending -> closed
                                               \-> follow_up -> in_progress
```

- Student reports and qualifying sensor events create `new` tickets; successful routing moves them to `assigned`.
- Technician actions move a ticket to `in_progress` and then `verification_pending`.
- Failed verification moves it to `follow_up`; a successful check moves it to `closed`.
- Every transition and sensor check should appear in the incident timeline, even if notifications are simulated.

## WorkBuddy MCP contract

WorkBuddy is the agent used during the demo. It calls the FixFlow MCP server to read incident context and request workflow actions; the server validates and records those actions. The initial tool set is:

| Tool | Purpose |
|---|---|
| `list_pending_incidents` | Return student reports and sensor incidents that have not been triaged. |
| `get_incident_context` | Return the incident, related open tickets, and recent sensor readings. |
| `create_work_order` | Accept WorkBuddy's category, priority, summary, and rationale; validate them and map the category through the fixed demo routing table. |
| `get_sensor_readings` | Return recent normalized readings for a sensor linked to an open ticket. |
| `verify_and_update_ticket` | Check the server-side repair evidence and move the ticket to `closed` or `follow_up`; WorkBuddy cannot force closure. |

For the 24-hour demo, a person can start processing by prompting WorkBuddy. Sensor events enter the pending queue automatically, but do not claim that a sensor webhook starts a WorkBuddy run unless that trigger is confirmed in the chosen WorkBuddy setup.

## LDR demo parameters

Use these as initial demo values and calibrate against the actual board and room before presenting:

| Parameter | Initial value | Meaning |
|---|---:|---|
| `LDR_SAMPLE_INTERVAL_MS` | `2000` | Read LDR and DHT11 sensors every two seconds. |
| `LDR_LOW_LIGHT_THRESHOLD_PCT` | `25` | Below this is considered too dark. |
| `LDR_RECOVERY_THRESHOLD_PCT` | `40` | At or above this is considered bright enough; the gap prevents flickering around one threshold. |
| `LDR_REQUIRED_CONSECUTIVE_SAMPLES` | `3` | Require three qualifying readings before creating or verifying a ticket. |

Create a lighting ticket when brightness is below `25` for three consecutive readings. After a technician reports a repair attempt, close only when brightness is at least `40` for three consecutive readings. Otherwise set `follow_up` and record a failed verification event. These values are demo parameters, not university maintenance policy.

## Fixed demo routing

| Category | Department | Technician |
|---|---|---|
| `lighting` | `facilities_electrical` | `tech_01` |
| `air_conditioning` | `facilities_mechanical` | `tech_02` |
| `student_portal` | `it_services` | `tech_03` |
| `other` | `helpdesk_triage` | `tech_00` |

For this demo, a low-confidence or unmatched student report goes to `other`; do not guess an owner. Names and assignments are fictional demo data.

## Engineer ownership

- **Engineer 1 — WorkBuddy and workflow backend:** implements the MCP server and tools, pending-incident store, routing directory, duplicate handling, allowed state transitions, verification, and audit timeline. WorkBuddy makes the triage decision; this engineer makes tool actions safe and persistent.
- **Engineer 2 — student and technician web UI:** builds the free-text intake, ticket queue and detail view, technician actions, and event timeline using only the API contract above.
- **Engineer 3 — IoT and demo integration:** calibrates the LDR, sends LDR and DHT11 readings to the sensor endpoint, builds a sensor simulator fallback, and owns the sensor panel and end-to-end demo reset/runbook. DHT11 values are telemetry-only for this demo. The sensor panel should be a separate component that Engineer 2 can place in the dashboard.
- All three agree before changing fields or statuses. Engineer 1 owns the MCP/API contract; Engineer 2 and Engineer 3 consume it. If a field or status needs to change, update this contract first and tell the others.
