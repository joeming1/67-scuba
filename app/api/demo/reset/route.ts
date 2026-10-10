import { resetDemo } from "../../../../server/demo-store";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const token = process.env.FIXFLOW_DEMO_RESET_TOKEN;
    if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
      return Response.json({ error: "Demo reset is disabled or unauthorized." }, { status: 404 });
    }
  }
  resetDemo();
  return Response.json({ action: "reset", message: "Demo readings, incidents, tickets, and consecutive-reading counters cleared." });
}
