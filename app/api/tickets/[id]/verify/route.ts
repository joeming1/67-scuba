import { verifyTicket } from "../../../../../server/demo-store";

type RouteContext = { params: { id: string } | Promise<{ id: string }> };
export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = verifyTicket(id);
  return "error" in result ? Response.json(result, { status: 409 }) : Response.json(result);
}
