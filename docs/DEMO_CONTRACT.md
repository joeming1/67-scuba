# FixFlow Demo Contract

This file is the agreement between the two engineers for the 24-hour demo. The backend owns classification, assignment, duplicate detection, ticket state, and sensor verification. The frontend submits inputs and renders the ticket returned by the backend; it must not invent its own status or assignment values.

## Demo scope

- Primary flow: an LDR detects a room that is too dark, automatically creates and routes a lighting ticket, and verifies the repair from later sensor readings.
- Secondary flow: a student enters a short free-text issue (for example, a portal login problem). The backend classifies it and fills in the category, department, and technician.
- Technician notifications and follow-up messages may be represented in the ticket timeline; sending real email or messages is out of scope.
- The DHT/air-conditioning scenario is a future extension. Do not build it before both flows above work.

## Shared conventions

- JSON field names use `snake_case`.
- Timestamps are ISO 8601 UTC strings, for example `2026-10-10T06:30:00Z`.
- IDs are strings. The backend may use UUIDs; examples use readable IDs.
- Missing optional values are omitted or `null`, consistently. Do not send empty strings as missing values.
- Sensor units are explicit. The LDR reading sent to the API is normalized to `brightness_pct` from `0` (dark) to `100` (bright); do not send raw ADC counts to ticket logic.
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

The backend derives category, priority, and assignment. The response is the canonical ticket object above. The UI should not ask students to select a department or technician.

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

Response: `{ "ticket": <canonical ticket or null>, "action": "created|updated|ignored" }`. `null` means the reading did not meet the trigger condition. Repeated readings for the same active issue should update its evidence, not create duplicate tickets.

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

## LDR demo parameters

Use these as initial demo values and calibrate against the actual board and room before presenting:

| Parameter | Initial value | Meaning |
|---|---:|---|
| `LDR_SAMPLE_INTERVAL_MS` | `1000` | Read the sensor once per second. |
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

- **Backend engineer:** implements these request/response shapes, classification and routing, duplicate handling, state transitions, verification, and the event timeline.
- **Frontend engineer:** builds the student text-entry form, ticket dashboard, technician actions, sensor display/simulator, and timeline using only the API contract above.
- If a field or status needs to change, update this contract first and tell the other engineer before changing implementation.
