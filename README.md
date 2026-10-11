# FixitFelix

> An AI-enhanced campus facilities maintenance platform that bridges IoT sensor monitoring, automated ticket dispatch, and dual-channel repair verification into a single closed-loop system.

FixitFelix connects physical sensors in campus buildings to a centralized maintenance workflow. When environmental issues are detected — lighting failures, temperature anomalies — the system autonomously creates work tickets, dispatches the right technician, and verifies that the repair actually resolved the problem using a combination of AI photo analysis and sensor-based confirmation.

---

## The Problem

Campus facilities teams face three persistent challenges:

1. **Reactive, not proactive.** Maintenance issues are reported manually — usually by frustrated students or staff — meaning problems are already severe by the time anyone knows about them.
2. **No verification loop.** Technicians mark repairs as "done" with no objective confirmation. A flickering light reported as "fixed" might still be flickering.
3. **Fragmented communication.** Students don't know the status of their report. Technicians juggle phone calls and paper forms. Facility managers have no visibility into response times or repair quality.

---

## The Solution

FixitFelix creates a **closed-loop maintenance pipeline**:

```
Sensors monitor rooms  ──►  Issue detected  ──►  Ticket auto-created
                                                         │
                                          Classify + assign technician
                                                         │
                                    ┌────────────────────┴───────────────────┐
                                    ▼                                        ▼
                              Email notification                    Telegram notification
                                    │                                        │
                                    ▼                                        ▼
                           Technician workspace (mobile-friendly web UI)
                                    │
                           Accept → Schedule → Start work → Repair
                                    │
                           Submit completion photo
                                    │
                           ┌────────┴────────┐
                           ▼                 ▼
                    AI photo check     Sensor recovery check
                    (Gemini Vision)    (IoT sensor confirms fix)
                           │                 │
                           └────────┬────────┘
                                    ▼
                           Both pass → Ticket closed
                           Student notified of completion
```

### Dual verification

The core innovation is that lighting repairs require **two independent confirmations** before closing:

1. **AI photo verification** — The technician submits a completion photo. Google Gemini Vision evaluates whether the reported issue is visibly resolved.
2. **Sensor recovery confirmation** — The room's IoT sensor continues monitoring. The ticket only closes after the sensor confirms that environmental conditions have returned to normal (e.g., brightness above threshold for multiple consecutive readings).

If either verification fails, the ticket is sent back for follow-up — the repair isn't considered complete until both the human evidence (photo) and the machine evidence (sensor) agree.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript | Dashboard, technician workspace, student tracking |
| Backend | Next.js Route Handlers | API layer for ticket operations, sensor ingestion |
| Database | Supabase (Postgres) | Persistent storage with RLS; JSON file fallback for local dev |
| AI | Google Gemini Vision API | Photo-based repair verification with model fallback chain |
| Notifications | Resend (email) + Telegram Bot API | Dual-channel dispatch, independently toggleable |
| IoT | ESP32 with environmental sensors | Room-level monitoring (LDR for lighting, expandable to temperature, humidity) |
| Deployment | Vercel (serverless) or self-hosted Node.js | Production or local dev |

---

## Architecture

### Data flow

```
┌──────────┐     POST /api/sensor-events      ┌──────────────┐
│  ESP32   │ ──────────────────────────────► │  Next.js API │
│  Sensor  │    (brightness, temp, etc.)      │   Handlers   │
└──────────┘                                   └──────┬───────┘
                                                      │
                    ┌─────────────────────────────────┤
                    ▼                                 ▼
             ┌─────────────┐               ┌──────────────────┐
             │  lib/store  │               │   lib/db.ts      │
             │  (logic)    │ ◄───────────► │  (Supabase CRUD) │
             └──────┬──────┘               └────────┬─────────┘
                    │                               │
       ┌────────────┼────────────┐                  │
       ▼            ▼            ▼                  ▼
  classify()  createTicket()  notifyAssignment()  persistTicket()
       │            │            │                  │
       ▼            ▼            ▼                  ▼
  Regex/NLP    FX-NNNN ID    Email + Telegram    Upsert to
  category     assignment    with action links   Supabase
```

### Persistence model

The system supports two persistence backends, selected automatically based on environment configuration:

- **Supabase mode** (production): All ticket mutations are upserted individually to Postgres. Route handlers query Supabase directly by token or ID, making the system compatible with serverless deployments (Vercel) where in-memory state doesn't persist across cold starts.
- **JSON file mode** (local dev fallback): When Supabase environment variables are not set, the system writes to a local JSON file. No external services required.

### Serverless compatibility

On Vercel, each API route runs as an isolated serverless function. The codebase handles this by:

- Querying Supabase directly for ticket lookups (by token, by ID, by sensor ID) rather than relying on in-memory cache
- Using `/tmp` for ephemeral file storage (evidence photos)
- Reloading state from Supabase on every cold start invocation
- Using HTTPS (`WiFiClientSecure`) for ESP32 → Vercel communication

---

## Key Concepts

### Ticket lifecycle

```
assigned → scheduled → in_progress → verification_pending → closed
               ↑                              ↓
               └──── follow_up ←──────────────┘
```

| Status | Meaning |
|---|---|
| `assigned` | Technician assigned, awaiting accept or decline |
| `scheduled` | Technician accepted and chose a visit time |
| `in_progress` | Technician started working on the repair |
| `verification_pending` | Repair attempted, awaiting sensor + AI photo verification |
| `follow_up` | Verification failed — light still dim, or photo didn't pass |
| `closed` | Both verifications passed (or non-sensor ticket with AI photo passed) |
| `unassigned` | No available technician in the relevant department |

### Ticket sources

Tickets enter the system through two paths:

- **Sensor-triggered**: The IoT sensor detects anomalous conditions (e.g., 3 consecutive low-brightness readings) and auto-creates a ticket without human intervention.
- **Student-reported**: A student submits a maintenance request through the web form. The system classifies the issue, assigns a technician, and — for lighting issues — automatically links the ticket to the nearest sensor for verification.

### Technician dispatch

Issues are classified into categories (lighting, air conditioning, IT, other), each mapped to a facilities department. Technicians are assigned round-robin within their department, skipping those who are unavailable or already handling an open ticket. If a technician declines, the system auto-reassigns to the next available person.

### Notification system

Both email and Telegram deliver the **same message content** — no AI rewriting, no separate message pipelines. Each channel is independently toggleable via environment variables:

- Email (Resend API) — on by default
- Telegram (Bot API) — off by default, enable for real-time mobile alerts

Messages include direct links to the technician workspace and student tracking page, so recipients can act with one tap.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (or use the JSON file fallback for local development)
- API keys for Google Gemini (photo verification), Resend (email), and optionally Telegram

### Installation

```bash
git clone https://github.com/joeming1/67-scuba.git
cd 67-scuba
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

### Environment variables

Copy `demo/.env.example` to `.env.local` and configure:

```bash
cp demo/.env.example .env.local
```

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | For production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | For production |
| `GEMINI_API_KEY` | Google Gemini API key for photo verification | Yes |
| `RESEND_API_KEY` | Resend API key for email | Yes |
| `FIXITFELIX_FROM_EMAIL` | Sender email address | Yes |
| `FIXITFELIX_NOTIFY_TO` | Default notification recipient | Yes |
| `FIXITFELIX_PUBLIC_URL` | Public base URL for links in notifications | Yes |
| `FIXITFELIX_EMAIL_ENABLED` | Enable email channel (default: `true`) | No |
| `FIXITFELIX_TELEGRAM_ENABLED` | Enable Telegram channel (default: `false`) | No |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | If Telegram enabled |
| `TELEGRAM_CHAT_ID` | Telegram chat ID | If Telegram enabled |

Without Supabase configured, the app persists data to a local JSON file.

### Database setup

Run the SQL migrations in `supabase/migrations/` against your Supabase project — either via `psql` or by pasting them into the Supabase SQL Editor. This creates the `tickets`, `timeline_events`, `sensor_states`, and `sensor_events` tables with appropriate indexes, RLS policies, and triggers.

### ESP32 sensor setup

Flash the Arduino sketch in `sensor/esp32_ldr.ino` to your ESP32:

1. Set your Wi-Fi credentials
2. Point `API_URL` to your server (HTTP for local dev, HTTPS for Vercel)
3. Calibrate the ADC thresholds using the `/sensor-calibrate` page
4. The sketch auto-detects HTTPS URLs and switches to `WiFiClientSecure`

The ESP32 sends readings every 2 seconds. When conditions breach threshold for multiple consecutive readings, a ticket is automatically created.

---

## Deployment

### Vercel

1. Push to GitHub
2. Import the repository in Vercel
3. Add all environment variables in the Vercel dashboard
4. Set `FIXITFELIX_PUBLIC_URL` to your Vercel URL
5. Deploy

The codebase is built for serverless — all route handlers query Supabase directly, no reliance on in-memory state that disappears on cold starts.

### Self-hosted

```bash
npm run build
npm start
```

Works with any Node.js host. Use a reverse proxy (nginx, Caddy) or Cloudflare Tunnel for HTTPS.

---

## Project Structure

```
├── app/
│   ├── page.tsx                     # Facilities dashboard
│   ├── student-report/              # Student issue report form
│   ├── sensor-demo/                 # Sensor simulator (for testing without hardware)
│   ├── sensor-calibrate/            # ADC calibration helper
│   ├── student/[token]/             # Student tracking page
│   ├── technician/[token]/          # Technician workspace
│   ├── technician-actions/[token]/  # Mobile accept/decline (server-rendered HTML)
│   └── api/
│       ├── tickets/                 # Ticket list + actions
│       ├── student-reports/         # Student submission endpoint
│       ├── sensor-events/           # ESP32 ingestion endpoint
│       ├── technician/tickets/      # Technician token lookup
│       └── student/tickets/         # Student token lookup
├── lib/
│   ├── store.ts                     # Core logic: lifecycle, notifications, AI verification
│   ├── db.ts                        # Supabase data access (row ↔ domain mapping)
│   ├── supabase.ts                  # Singleton Supabase client
│   └── types.ts                     # TypeScript domain types
├── sensor/
│   └── esp32_ldr.ino               # ESP32 Arduino sketch
├── supabase/
│   └── migrations/                  # SQL schema
└── demo/
    └── .env.example                 # Environment variable template
```

---

## Acknowledgements

Built by a three-engineer team integrating IoT hardware, full-stack web development, and AI verification into a unified campus facilities platform.
