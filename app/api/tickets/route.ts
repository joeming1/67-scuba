import { createStudentIncident, listTickets } from "../../../server/demo-store";

export async function GET() {
  return Response.json({ tickets: listTickets() });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Expected description and location." }, { status: 400 });
  const { description, location } = body as Record<string, unknown>;
  if (typeof description !== "string" || !description.trim() || description.length > 2000 || typeof location !== "string" || !location.trim() || location.length > 200) {
    return Response.json({ error: "Description (1–2000 characters) and location (1–200 characters) are required." }, { status: 400 });
  }
  return Response.json({ incident: createStudentIncident(description.trim(), location.trim()) }, { status: 201 });
}
