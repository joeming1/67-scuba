import { getIncidentContext } from "../../../../server/demo-store";

type RouteContext = { params: { id: string } | Promise<{ id: string }> };
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = getIncidentContext(id);
  return result ? Response.json(result) : Response.json({ error: "Incident not found." }, { status: 404 });
}
