# FixitFelix Dashboard

Campus facilities incident management dashboard for the 67-scuba hackathon demo.

## Run

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

## Structure

- `app/page.tsx` — Facilities manager dashboard (ticket queue, detail, new report modal)
- `app/student-report/page.tsx` — Student maintenance report form
- `app/sensor-demo/page.tsx` — LDR sensor simulator (creates lighting tickets)
- `app/sensor-calibrate/page.tsx` — ESP32 LDR calibration helper
- `app/student/[token]/page.tsx` — Private student ticket tracking page
- `app/technician/[token]/page.tsx` — Technician workspace (accept, start work, repair, photo)
- `app/technician-actions/[token]/route.ts` — Server-rendered mobile accept/decline page
- `app/site/page.tsx` — Static marketing/plan page
- `app/api/student-reports/route.ts` — POST student issue reports
- `app/api/sensor-events/route.ts` — GET/POST LDR sensor readings
- `app/api/technician/tickets/[token]/route.ts` — GET technician ticket data
- `app/api/student/tickets/[token]/route.ts` — GET student ticket data
- `app/api/tickets/[id]/actions/route.ts` — POST technician actions (accept, start_work, repair_attempted, complete_work)
- `app/evidence/[filename]/route.ts` — Serve saved completion photos
- `lib/store.ts` — Shared data store, ticket logic, notifications, AI photo verification
- `lib/types.ts` — TypeScript types
- `demo/data/` — JSON persistence and evidence photos

## Configuration

Copy `demo/.env.example` to `.env.local` and fill in:

- `GEMINI_API_KEY` — for AI photo verification
- `RESEND_API_KEY` + `FIXITFELIX_FROM_EMAIL` — for email notifications
- `TWILIO_*` + `FIXITFELIX_WHATSAPP_ENABLED=true` — for WhatsApp notifications (disabled by default)
