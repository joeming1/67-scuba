# FixFlow

FixFlow is a 24-hour hackathon demo for shortening the campus maintenance helpdesk process. Students submit a short issue description, or a sensor detects a fault; the app routes a ticket to a demo technician and follows its progress.

## Run the demo

Requires Node.js 20 or newer. No package install is needed.

```sh
node demo/server.mjs
```

Open [http://localhost:3000](http://localhost:3000).

## Walkthrough

1. Submit a student issue from the website with an email address. The site returns a private tracking page.
2. The technician receives an assignment email with a private mobile workspace link. They accept and schedule the visit there.
3. At the visit, the technician taps **I arrived — start work**. If the repair needs follow-up, they record an attempt and can resume later.
4. To finish, the technician takes or chooses a completion photo in that workspace. Gemini checks the photo; only a passing check closes the ticket.
5. The student tracking page and student email show the schedule, work updates, outcome, and completion photo.

Ticket state is stored in `demo/data/tickets.json`; **Reset demo** clears it.

## Demo boundaries

- The LDR simulator sends the same normalized sensor events expected from an ESP32. Hardware can be connected later.
- Open `/demo/sensors` to run the Room B-204 LDR simulator; those controls are kept separate from the student portal.
- Student reports are classified by small deterministic keyword rules for a reliable demo.
- Department and technician assignments are fictional local demo data.
- The student website is for reports and private status tracking. Technician actions are only available through the private link in the assignment email.
- The technician link lets the assignee schedule, start work, record an attempt, and submit a completion photo. It acts as a bearer link; forward it only to the assigned technician.
- WhatsApp delivery uses Twilio. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, and `FIXFLOW_WHATSAPP_TO` in `demo/.env`.
- Completion photos are checked with the Gemini API. Set `GEMINI_API_KEY`; optionally set `FIXFLOW_VISION_MODEL`, `FIXFLOW_VISION_FALLBACK_MODELS`, and `FIXFLOW_VERIFICATION_CONFIDENCE`. Rate limits, unavailable models, overload, and timeouts trigger the configured fallback models in order. No ticket can be completed if every photo check fails.
- To open technician links from any internet connection, expose the local app with a public HTTPS tunnel and set `FIXFLOW_PUBLIC_URL`. Follow [the phone demo setup](docs/PHONE_DEMO_SETUP.md). Keep the app and tunnel running during the demo.
- There is no WorkBuddy/MCP dependency, real university integration, technician login, or production authentication.

WhatsApp is paused by default. If the Resend email settings are missing, the ticket is still created but no technician assignment email is sent. If Gemini is not configured, technicians cannot complete tickets with photos.

See [the demo contract](docs/DEMO_CONTRACT.md) and [the three-engineer plan](docs/THREE_ENGINEER_WORKFLOW.md).
