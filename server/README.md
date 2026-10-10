# Local sensor API implementation

`demo-store.ts` is a deliberately small, process-local demo store used by the route handlers in `app/api`. It records student intake and normalized LDR/DHT11 events, triggers one pending lighting incident after three consecutive LDR readings below 25%, routes validated work orders through a fixed placeholder directory, enforces ticket transitions, verifies three post-repair LDR readings at or above 40%, serves sensor readings to the dashboard/MCP tools, and clears all local demo state on reset. DHT11 temperature/humidity are telemetry only and do not trigger maintenance incidents.

This is a local integration adapter, not the planned Supabase persistence layer. State is lost on process restart and is not shared across multiple server instances. Replace this store with the agreed Supabase repository before using multiple instances or relying on durable demo data. The reset endpoint requires a bearer token in production and is otherwise disabled there.

The MCP stdio server is in `mcp/server.ts`. It calls the API over HTTP so it remains a separate process as required by the workflow.

From the repository root, run `npm install`, start the app with `npm run dev`, then start the MCP server in a second terminal with `npm run mcp`. Set `FIXFLOW_API_BASE_URL` if the app is not at `http://localhost:3000`. All routing identities are fictional placeholders such as `Demo Electrical Technician`; replace them only after the team agrees on demo-safe labels.
