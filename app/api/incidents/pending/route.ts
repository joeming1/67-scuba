import { listPendingIncidents } from "../../../../server/demo-store";

export async function GET() {
  return Response.json({ incidents: listPendingIncidents() });
}
