# FixitFelix

> AI-powered campus facilities maintenance system with IoT sensor integration, dual-channel notifications, and automated repair verification.

FixitFelix is a full-stack campus maintenance helpdesk that automatically detects lighting failures via ESP32 LDR sensors, dispatches technicians via email and Telegram, and verifies repairs using Google Gemini AI photo checks plus sensor-based brightness recovery confirmation.

## How It Works

```
ESP32 LDR Sensor ──► 3 low readings ──► Auto-create ticket
                                            │
                                    Classify + Assign technician
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                        Email notification          Telegram notification
                              │                           │
                              ▼                           ▼
                     Technician opens workspace (mobile-friendly)
                              │
                     Accept → Schedule → Start work → Repair attempt
                              │
                     Submit completion photo
                              │
                     ┌───────┴────────┐
                     ▼                ▼
              Gemini AI photo    LDR sensor recovery
              verification       verification
                     │                │
                     └───────┬────────┘
                             ▼
                     Both pass → Ticket closed
```

### Dual verification system

For lighting tickets linked to a sensor, FixitFelix requires **both** verifications to close:

1. **AI photo check** — Technician submits a completion photo. Google Gemini Vision API evaluates whether the issue is visibly resolved.
2. **LDR sensor recovery** — The ESP32 continues polling. The ticket closes only after 3 consecutive readings above 40% brightness, confirming the repair actually fixed the lighting.

Student-reported lighting tickets are automatically linked to the nearest LDR sensor via fuzzy location matching, so they also go through sensor verification.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Backend | Next.js Route Handlers (API routes) |
| Database | Supabase (Postgres) with JSON file fallback for local dev |
| AI | Google Gemini Vision API (photo verification with model fallback chain) |
| Notifications | Resend (email) + Telegram Bot API (same message content) |
| IoT Sensor | ESP32 with LDR (light-dependent resistor) |
| Deployment | Vercel (serverless) or local dev server |

## Project Structure

```
67-scuba-frontend-integration/
├── app/
│   ├── page.tsx                        # Facilities dashboard (ticket queue, LDR panel, detail view)
│   ├── student-report/page.tsx        # Student maintenance report form
│   ├── sensor-demo/page.tsx           # LDR sensor simulator (for demos without hardware)
│   ├── sensor-calibrate/page.tsx      # ESP32 ADC calibration helper
│   ├── student/[token]/page.tsx       # Student ticket tracking page
│   ├── technician/[token]/page.tsx    # Technician workspace (accept, start, repair, photo)
│   ├── technician-actions/[token]/    # Server-rendered mobile accept/decline page
│   ├── site/page.tsx                  # Static info/landing page
│   └── api/
│       ├── tickets/route.ts           # GET all tickets (dashboard polling)
│       ├── student-reports/route.ts   # POST student issue reports
│       ├── sensor-events/route.ts     # GET/POST LDR sensor readings
│       ├── technician/tickets/[token]/route.ts
│       ├── student/tickets/[token]/route.ts
│       └── tickets/[id]/actions/route.ts  # POST accept/start/repair/complete
├── lib/
│   ├── store.ts                       # Core: ticket lifecycle, notifications, AI verification
│   ├── db.ts                          # Supabase data access layer (row ↔ domain mapping)
│   ├── supabase.ts                    # Singleton Supabase client (service role key)
│   └── types.ts                       # TypeScript domain types
├── sensor/
│   └── esp32_ldr.ino                  # ESP32 Arduino sketch (LDR → API)
├── supabase/
│   └── migrations/                    # SQL schema (tickets, timeline, sensors, events, evidence)
├── demo/
│   └── .env.example                   # Environment variable template
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- A Supabase project (or use JSON file fallback for local dev)
- API keys for: Google Gemini, Resend, Telegram Bot (optional)

### 1. Install & Run

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

> **Note:** If running inside WorkBuddy, prefix commands with `NODE_OPTIONS=""` to bypass the FS broker shim:
> ```bash
> NODE_OPTIONS="" npm run dev
> ```

### 2. Environment Variables

Copy `demo/.env.example` to `.env.local` and fill in your keys:

```bash
cp demo/.env.example .env.local
```

| Variable | Description | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Yes (for Vercel) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) | Yes (for Vercel) |
| `GEMINI_API_KEY` | Google Gemini API key for AI photo verification | Yes |
| `RESEND_API_KEY` | Resend API key for email notifications | Yes |
| `FIXITFELIX_FROM_EMAIL` | Sender email address | Yes |
| `FIXITFELIX_NOTIFY_TO` | Default recipient (technician email) | Yes |
| `FIXITFELIX_PUBLIC_URL` | Public base URL for links in notifications | Yes |
| `FIXITFELIX_EMAIL_ENABLED` | Enable email notifications (default: `true`) | No |
| `FIXITFELIX_TELEGRAM_ENABLED` | Enable Telegram notifications (default: `false`) | No |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token | If Telegram enabled |
| `TELEGRAM_CHAT_ID` | Telegram chat/user ID to send to | If Telegram enabled |

Without Supabase configured, the app falls back to a local JSON file (`demo/data/tickets.json`) for persistence.

### 3. Database Setup (Supabase)

Run the SQL migrations in the Supabase SQL Editor:

```bash
# Via psql (replace <password> with your database password)
psql "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" \
  -f supabase/migrations/combined_schema.sql
```

Or paste the contents of `supabase/migrations/combined_schema.sql` into the Supabase dashboard SQL Editor.

This creates 5 tables: `tickets`, `timeline_events`, `sensor_states`, `sensor_events`, `evidence` — with RLS enabled and auto-updating `updated_at` triggers.

### 4. ESP32 Sensor Setup

Flash `sensor/esp32_ldr.ino` to your ESP32:

1. Update `WIFI_SSID` and `WIFI_PASSWORD`
2. Set `API_URL` to your server URL:
   - **Local dev:** `http://<your-LAN-IP>:3000/api/sensor-events`
   - **Vercel:** `https://your-app.vercel.app/api/sensor-events`
3. Calibrate `LDR_DARK_ADC` and `LDR_BRIGHT_ADC` values (use the `/sensor-calibrate` page)
4. For Vercel HTTPS, the sketch auto-switches to `WiFiClientSecure`

The ESP32 sends a brightness reading every 2 seconds. Three consecutive readings below 25% trigger a new ticket.

## Deploy to Vercel

1. Push to GitHub `main` branch
2. Import the repo in Vercel
3. Add all environment variables in Vercel dashboard → Settings → Environment Variables
4. Set `FIXITFELIX_PUBLIC_URL` to your Vercel URL (e.g., `https://your-app.vercel.app`)
5. Deploy

Vercel serverless compatibility is built in — all route handlers query Supabase directly (no reliance on in-memory cache that gets wiped on cold starts).

## Ticket Lifecycle

```
assigned → scheduled → in_progress → verification_pending → closed
                ↑                                ↓
                └─── follow_up ←────────────────┘
```

| Status | Meaning |
|---|---|
| `assigned` | Technician assigned, awaiting accept/decline |
| `scheduled` | Technician accepted, visit scheduled |
| `in_progress` | Technician started work |
| `verification_pending` | Repair attempted, awaiting LDR + AI photo verification |
| `follow_up` | Verification failed (light still dim or photo didn't pass) |
| `closed` | Both verifications passed (or non-lighting ticket with AI photo passed) |
| `unassigned` | No available technician in the department |

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tickets` | List all tickets (dashboard polling) |
| `POST` | `/api/student-reports` | Submit a student maintenance report |
| `GET` | `/api/sensor-events` | Get latest sensor states |
| `POST` | `/api/sensor-events` | Submit a sensor reading (from ESP32) |
| `GET` | `/api/technician/tickets/[token]` | Get ticket by technician action token |
| `GET` | `/api/student/tickets/[token]` | Get ticket by student tracking token |
| `POST` | `/api/tickets/[id]/actions` | Perform action (accept, start_work, repair_attempted, complete_work) |
| `GET` | `/technician-actions/[token]?choice=accept` | Mobile-friendly accept page |
| `GET` | `/technician-actions/[token]?choice=decline` | Mobile-friendly decline page |
| `POST` | `/technician-actions/[token]` | Submit accept/decline from mobile page |

## Notification Channels

Both email and Telegram send the **same message content** — no AI rewriting. Each channel can be independently toggled:

- `FIXITFELIX_EMAIL_ENABLED=true` — Email via Resend API
- `FIXITFELIX_TELEGRAM_ENABLED=true` — Telegram via Bot API direct

Both can be enabled simultaneously for redundant delivery.

## Acknowledgements

Built for the 67-scuba hackathon at Northbridge Campus.
