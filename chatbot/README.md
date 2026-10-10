# Fix It Felix — AI Dispatch Chatbot

Fix It Felix is a Telegram bot that bridges a backend workflow system (like WorkBuddy) and a technician. A backend sends Felix a prompt, Felix uses Google Gemini AI to craft a natural message, sends it to the technician via Telegram, and when the technician replies, Felix evaluates the response with AI to determine next steps.

## Architecture

```text
WorkBuddy → POST /prompt → Felix (Gemini crafts message) → Telegram API → Technician
                                                                                ↓
WorkBuddy ← Task status ← Felix (Gemini evaluates) ← Telegram polling ← Technician replies
```

## Why Telegram

Telegram Bot API is free, requires no business verification, no phone number, and no public webhook URL. Messages are delivered instantly via long-polling. This avoids the Meta WhatsApp Cloud API limitations that require business verification and a publicly accessible webhook endpoint.

## Shared conventions

- JSON field names use `snake_case`, matching the FixFlow demo contract.
- Timestamps are ISO 8601 UTC strings, for example `2026-10-10T15:54:56Z`.
- IDs are strings. The task manager generates readable IDs.
- Missing optional values are `null`, not empty strings.
- The bot token and API keys live in `.env`; the `.env.example` template is committed.

## Setup

### Step 1: Create a Telegram bot

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Name it `Fix It Felix`.
4. Choose a username ending in `bot`, for example `fix_it_felix_bot`.
5. Copy the API token.

### Step 2: Get a Gemini API key

1. Go to https://aistudio.google.com/apikey.
2. Create an API key. AQ. prefix auth keys require the `x-goog-api-key` header.
3. The model used is `gemini-3.5-flash-lite`.

### Step 3: Configure

Copy `.env.example` to `.env` and fill in:

```env
GEMINI_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
API_PORT=3001
```

### Step 4: Install and run

```powershell
cd chatbot
npm install
npm start
```

Or double-click `START-FELIX.bat`.

### Step 5: Start chatting

1. Find the bot on Telegram.
2. Send `/start`.
3. Send any message; Felix responds with AI.

## API contract

### `POST /prompt` — send a dispatch prompt

Request body (see `contracts/examples/prompt-request.json`):

```json
{
  "message": "Ask the technician if he is available tomorrow at 2pm for a plumbing job in Petaling Jaya.",
  "context": {
    "job_type": "plumbing",
    "location": "Petaling Jaya",
    "priority": "high"
  },
  "chat_id": null
}
```

If `chat_id` is null, Felix sends to the first known chat or the configured `TECHNICIAN_CHAT_ID`. Response (see `contracts/examples/prompt-response.json`):

```json
{
  "success": true,
  "task_id": "task_1791647694040_ib9r6x",
  "sent_message": "Hey boss! Got an urgent plumbing job in PJ tomorrow at 2pm...",
  "status": "waiting_for_reply",
  "created_at": "2026-10-10T15:54:56Z"
}
```

### Technician reply evaluation

When the technician replies on Telegram, Felix evaluates the reply with Gemini and returns a JSON object (see `contracts/examples/evaluation-response.json`):

```json
{
  "status": "confirmed",
  "reasoning": "Technician agreed to the booking.",
  "followup_message": "Thanks boss! See you there!",
  "summary": "Technician confirmed plumbing job for tomorrow 2pm in PJ.",
  "extracted_data": {
    "available_date": "2026-10-11",
    "available_time": "14:00",
    "estimated_duration": null,
    "price_quoted": null,
    "alternative_times": []
  }
}
```

`status` is `confirmed`, `declined`, `needs_followup`, `needs_more_info`, or `escalate`.

### Other endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | List all tasks |
| GET | `/task/:id` | Get a specific task |
| GET | `/health` | Check bot status |

## Task lifecycle

```text
active → completed    (confirmed)
active → failed       (declined)
active → escalated    (needs human intervention)
active → active       (needs_followup / needs_more_info — continues conversation)
```

## File structure

```text
chatbot/
├── src/
│   ├── index.js          # Telegram polling + HTTP API server
│   ├── brain.js          # Gemini AI brain (craftMessage + evaluateReply)
│   └── task-manager.js   # Task tracking and persistence
├── contracts/
│   └── examples/
│       ├── prompt-request.json        # POST /prompt request shape
│       ├── prompt-response.json       # POST /prompt response shape
│       └── evaluation-response.json  # AI evaluation result shape
├── .env.example
├── .gitignore
├── package.json
├── START-FELIX.bat       # Windows launcher
└── README.md
```

## Integration with FixFlow

Felix can serve as the technician notification layer in the FixFlow demo. When WorkBuddy creates a work order through the MCP tools, the backend can POST a prompt to Felix. Felix crafts a natural message and sends it to the assigned technician via Telegram. The technician's reply is evaluated by AI, and the task status (confirmed, declined, escalated) can be fed back into the FixFlow ticket lifecycle.

The `context` field in the prompt request can carry the FixFlow `incident_id`, `ticket_id`, or `technician_id` so the backend can correlate Felix tasks with canonical FixFlow records.
