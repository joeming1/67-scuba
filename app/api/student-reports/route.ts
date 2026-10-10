import { NextRequest, NextResponse } from "next/server";
import { loadState, classify, createTicket, notifyAssignment, publicTicket, requestBaseUrl, saveState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await loadState();
  const body = await request.json().catch(() => ({}));
  if (typeof body.description !== "string" || body.description.trim().length < 4) {
    return NextResponse.json({ error: "Describe the issue in at least four characters." }, { status: 400 });
  }
  const studentEmail = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
    return NextResponse.json({ error: "Enter a valid email address so we can send you ticket updates." }, { status: 400 });
  }
  const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : "Not specified";
  const category = classify(body.description);
  const ticket = createTicket({ source: "student_report", description: body.description, location, category, studentEmail });
  if (ticket.assignment) await notifyAssignment(ticket, "assigned", requestBaseUrl(request));
  await saveState();
  return NextResponse.json(
    {
      ticket: publicTicket(ticket),
      notification: ticket.notification ? { channel: ticket.notification.channel, status: ticket.notification.status } : null,
      tracking_url: `${requestBaseUrl(request)}/student/${ticket.student_tracking_token}`,
    },
    { status: 201 }
  );
}
