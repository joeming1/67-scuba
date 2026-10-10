# FixFlow Demo Contract

The standalone app owns student intake, demo classification, technician routing, ticket state, WhatsApp assignment notifications, AI photo verification, and the activity timeline. The browser renders server responses; it does not invent assignments or statuses.

## Demo scope

- Three sustained low-light LDR readings create one lighting ticket and route it to a technician. The technician receives WhatsApp action links to accept and schedule or decline; declines move the ticket to the next available technician.
- Students receive a private tracking URL after submitting a report. Its page polls for status and timeline updates and displays the verified completion photo.
- A technician starts work, may report a sensor repair attempt, and submits a completion photo. The configured Gemini vision model must return `fixed: true` with confidence at or above `FIXFLOW_VERIFICATION_CONFIDENCE` (default `0.7`) before completion is accepted. An unavailable AI service, inconclusive image, or failed verdict leaves the ticket open.
- Sensor tickets also require three recovery readings at or above 40%. The sensor and AI photo check must both pass before closure.
- Department assignments and technician identities are fictional. University integration, technician accounts, and production authentication are out of scope.

## Shared conventions

- JSON field names use snake_case; timestamps use ISO 8601; ticket IDs use `FX-0001` format.
- Sensor readings use normalized brightness_pct from 0 (dark) to 100 (bright), never raw ADC counts.
- The private student tracking token and technician action token are not included in ordinary ticket API responses.

## Ticket shape

    {
      "id": "FX-0001",
      "source": "student_report",
      "summary": "Cannot log in to the student portal",
      "location": "Online",
      "status": "scheduled",
      "notification": { "channel": "whatsapp", "recipient": "whatsapp:+60123456789", "status": "sent" },
      "completion_verification": null,
      "timeline": [],
      "created_at": "2026-10-10T06:30:00.000Z",
      "updated_at": "2026-10-10T06:30:00.000Z"
    }

Possible status values are `assigned`, `scheduled`, `in_progress`, `verification_pending`, `follow_up`, `unassigned`, and `closed`.

## API

### `GET /api/state`

Returns current tickets, sensors, technicians, and thresholds for the demo dashboard.

### `POST /api/student-reports`

Request: `{ "description": "I cannot log in to the student portal.", "location": "Online" }`.

Creates and routes a ticket, sends the WhatsApp assignment when configured, and returns `tracking_url`. Share this private URL with the reporting student.

### `GET /student/{token}` and `GET /api/student/tickets/{token}`

The student page polls its token-scoped API for ticket status, timeline events, and completion evidence. It does not expose other tickets.

### `POST /api/sensor-events`

Three consecutive values below 25 create one sensor ticket. After a repair attempt, three values at or above 40 set sensor verification to passed. They do not close the ticket without the technician photo check.

### `POST /api/tickets/{id}/actions`

Supported actions:

    { "action": "start_work" }
    { "action": "repair_attempted", "note": "Replaced the room light." }
    { "action": "complete_work", "evidence": { "data_url": "data:image/jpeg;base64,..." } }

`complete_work` requires a photo. The server sends it with the ticket context to the configured Gemini `generateContent` vision model. Only a positive verdict above the confidence threshold can close a ticket. Sensor tickets also require passed LDR recovery verification. A failed check is recorded in the timeline and the ticket remains open.

Technicians accept or decline through the mobile action page linked in WhatsApp. The action token is private and invalidated after acceptance or reassignment.

### `POST /api/demo/reset`

Clears tickets and sensor state for the next rehearsal.

## Configuration

Copy `demo/.env.example` to `demo/.env` and configure Twilio WhatsApp credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `FIXFLOW_WHATSAPP_TO`) and `GEMINI_API_KEY`. Optional model settings are `FIXFLOW_VISION_MODEL`, the comma-separated `FIXFLOW_VISION_FALLBACK_MODELS`, and `FIXFLOW_VERIFICATION_CONFIDENCE`. On rate limits, unavailable models, overload, timeouts, or unusable responses, photo verification tries the fallback models in order. Set `FIXFLOW_PUBLIC_URL` to the HTTPS app URL before creating tickets so WhatsApp links work on the technician's phone. Credentials and photos stay on the server; do not commit `.env`.

## Fixed demo routing

| Category | Department | Technician order |
|---|---|---|
| lighting | Facilities - Electrical | Aina Rahman → Amir Hassan → Sofia Lim |
| air_conditioning | Facilities - Mechanical | Daniel Lee → Priya Nair |
| student_portal | IT Services | Mei Tan → Arun Kumar |
| other | Helpdesk Triage | Helpdesk Team |
