import { updateTicketAction } from "../../../../../server/demo-store";

type RouteContext = { params: { id: string } | Promise<{ id: string }> };
const actions = ["accept", "start_work", "repair_attempted"] as const;

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid action." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (!actions.includes(input.action as typeof actions[number]) || typeof input.note !== "string") {
    return Response.json({ error: "Allowed actions are accept, start_work, and repair_attempted; note must be a string." }, { status: 400 });
  }
  const result = updateTicketAction(id, input.action as typeof actions[number], input.note);
  return "error" in result ? Response.json(result, { status: 409 }) : Response.json(result);
}
