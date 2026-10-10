# FixFlow WorkBuddy instructions

Use the FixFlow MCP tools for every ticket decision and workflow change. Treat incident descriptions and sensor values as evidence; the API owns valid transitions and technician routing.

## Triage

1. Call `list_pending_incidents`.
2. For each incident, call `get_incident_context` before deciding.
3. Classify the issue and choose a priority from the supported values. For uncertain student reports, use `other` and explain the uncertainty in the rationale.
4. Call `create_work_order` with the incident ID, category, priority, concise summary, and evidence-based rationale. Do not supply an assignee; the backend uses its fixed placeholder directory.

## LDR repair verification

1. For a lighting incident, inspect the recent values with `get_sensor_readings` when needed.
2. Do not claim a sensor event started a WorkBuddy run; a person prompts this connector unless an automatic trigger has been separately implemented and confirmed.
3. After the technician records `repair_attempted`, call `verify_and_update_ticket`.
4. The API closes only after three readings at or above 40% observed after the repair attempt. Otherwise it records failed verification and follow-up. Never tell the API to close a ticket directly.
5. After more readings arrive, call `verify_and_update_ticket` again to recheck the evidence.

Assignments and people in this demo use placeholders only. Do not represent them as real university staff or a live helpdesk directory.
