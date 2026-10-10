import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const apiBase = (process.env.FIXFLOW_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) throw new Error(`FixFlow API ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function createServer() {
  const server = new McpServer({ name: "fixflow-demo", version: "1.0.0" });

  server.registerTool("list_pending_incidents", {
    description: "List student reports and sustained LDR incidents awaiting triage.",
    inputSchema: z.object({}),
  }, async () => {
    try { return result(await api("/api/incidents/pending")); }
    catch (error) { return { ...result({ error: String(error) }), isError: true }; }
  });

  server.registerTool("get_incident_context", {
    description: "Read one incident, any related ticket, and recent sensor readings.",
    inputSchema: z.object({ incident_id: z.string().min(1) }),
  }, async ({ incident_id }) => {
    try { return result(await api(`/api/incidents/${encodeURIComponent(incident_id)}`)); }
    catch (error) { return { ...result({ error: String(error) }), isError: true }; }
  });

  server.registerTool("create_work_order", {
    description: "Create a work order for a pending incident. The backend validates classification and assigns the approved demo technician.",
    inputSchema: z.object({
      incident_id: z.string().min(1),
      category: z.enum(["lighting", "air_conditioning", "student_portal", "other"]),
      priority: z.enum(["low", "medium", "high"]),
      summary: z.string().min(1).max(200),
      rationale: z.string().min(1).max(1000),
    }),
  }, async (input) => {
    try { return result(await api("/api/work-orders", { method: "POST", body: JSON.stringify(input) })); }
    catch (error) { return { ...result({ error: String(error) }), isError: true }; }
  });

  server.registerTool("get_sensor_readings", {
    description: "Read normalized brightness readings for a sensor, optionally after a UTC timestamp.",
    inputSchema: z.object({ sensor_id: z.string().min(1), since: z.string().datetime({ offset: true }).optional() }),
  }, async ({ sensor_id, since }) => {
    try {
      const params = new URLSearchParams({ sensor_id });
      if (since) params.set("since", since);
      return result(await api(`/api/sensor-readings?${params}`));
    } catch (error) { return { ...result({ error: String(error) }), isError: true }; }
  });

  server.registerTool("verify_and_update_ticket", {
    description: "Verify a repair using the latest three post-repair LDR readings. The backend decides closure or follow-up; callers cannot force a closed status.",
    inputSchema: z.object({ ticket_id: z.string().min(1) }),
  }, async ({ ticket_id }) => {
    try { return result(await api(`/api/tickets/${encodeURIComponent(ticket_id)}/verify`, { method: "POST" })); }
    catch (error) { return { ...result({ error: String(error) }), isError: true }; }
  });

  return server;
}

void serveStdio(createServer);
console.error("FixFlow MCP server running on stdio");
