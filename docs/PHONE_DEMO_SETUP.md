# Phone Demo Setup

Technicians can open FixFlow action links on another network when the app has a public HTTPS URL. For a local hackathon demo, use a temporary Cloudflare Quick Tunnel or a deployed HTTPS host.

## WhatsApp settings

Create/configure a Twilio WhatsApp sender (the sandbox works for rehearsals) and set these values in `demo/.env`:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
FIXFLOW_WHATSAPP_TO=whatsapp:+60123456789
TWILIO_WHATSAPP_CONTENT_SID=HX...
FIXFLOW_PUBLIC_URL=https://your-public-host.example
```

The recipient must have joined the Twilio WhatsApp sandbox when using the sandbox sender. For assignment messages that FixFlow initiates, create and approve a template with these placeholders, then set its Content SID in `TWILIO_WHATSAPP_CONTENT_SID`:

```text
FixFlow repair assignment update for ticket {{1}}. The assigned technician is {{2}}. The reported issue is {{3}}. The repair location is {{4}}. The responsible department is {{5}}. Assignment note: {{6}}. Use the following links to respond: accept the assignment here {{7}}, or decline it here {{8}}. These links are intended for the assigned technician only.
```

FixFlow fills the placeholders in this order: ticket ID, technician, issue, location, department, assignment reason, accept link, and decline link. Provide realistic sample values for all eight variables in Twilio when submitting the template for approval. The currently configured static template has no placeholders, so it cannot include ticket details. All fictional technicians share the one configured demo recipient.

## Email notifications

WhatsApp is paused unless `FIXFLOW_WHATSAPP_ENABLED=true`. FixFlow uses Resend for assignment emails and student status updates. Set these values in `demo/.env`:

```dotenv
RESEND_API_KEY=re_...
FIXFLOW_FROM_EMAIL=FixFlow <notifications@your-verified-domain.example>
FIXFLOW_NOTIFY_TO=technician@example.com
```

Students must provide an email address with their report. The assignment email goes to the technician address in `FIXFLOW_NOTIFY_TO` and contains a private mobile technician workspace link. From that link, the technician can accept and schedule, start work on arrival, record an attempt, resume follow-up, and submit a completion photo. Student status updates go to the student's own email address.

## AI photo verification

Set a Gemini API key on the server. The server sends the completion photo and issue description to Gemini's `generateContent` vision API; only a passing verdict at or above the configured confidence threshold closes the ticket.

```dotenv
GEMINI_API_KEY=...
FIXFLOW_VISION_MODEL=gemini-3.8-flash
FIXFLOW_VISION_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite
FIXFLOW_VERIFICATION_CONFIDENCE=0.7
```

The server tries the primary model first, then each comma-separated fallback when a model is rate-limited, unavailable, overloaded, times out, or returns an unusable response. A valid `fixed: false` verdict is kept as a failed photo check. The fallback list is configurable; use models enabled for your Gemini API project.

## Run

1. Start FixFlow with `node demo/server.mjs`.
2. Start the public HTTPS tunnel and set its URL as `FIXFLOW_PUBLIC_URL` before creating a ticket.
3. Create a student report from the public FixFlow URL so the technician action links use the public host.
4. Open the technician assignment email on the technician's phone and use its workspace link to accept and schedule, then start work at the visit.
5. In the technician workspace, use the camera/photo control to attach a clear completion photo. The student’s private tracking page shows ticket status, timeline updates, and the completion photo.

Keep the app and tunnel running during the demo. Never commit `demo/.env`.
