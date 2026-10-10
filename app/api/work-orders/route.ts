import { createWorkOrder, type Category, type Priority } from "../../../server/demo-store";

const categories: Category[] = ["lighting", "air_conditioning", "student_portal", "other"];
const priorities: Priority[] = ["low", "medium", "high"];

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid work order request." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.incident_id !== "string" || !categories.includes(input.category as Category) || !priorities.includes(input.priority as Priority)
      || typeof input.summary !== "string" || !input.summary.trim() || typeof input.rationale !== "string" || !input.rationale.trim()) {
    return Response.json({ error: "incident_id, valid category and priority, summary, and rationale are required." }, { status: 400 });
  }
  const result = createWorkOrder({ incident_id: input.incident_id, category: input.category as Category, priority: input.priority as Priority, summary: input.summary, rationale: input.rationale });
  if ("error" in result) return Response.json(result, { status: 409 });
  return Response.json(result, { status: result.duplicate ? 200 : 201 });
}
