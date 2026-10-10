import { NextRequest, NextResponse } from "next/server";
import { loadState, classify, createTicket, notifyAssignment, emailStudentUpdate, publicTicket, requestBaseUrl, saveState } from "@/lib/store";

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
  const baseUrl = requestBaseUrl(request);
  if (ticket.assignment) await notifyAssignment(ticket, "assigned", baseUrl);
  // Send confirmation email to the student with their ticket ID and tracking link
  await emailStudentUpdate(
    ticket,
    `Your report has been received and categorized as ${category.replaceAll("_", " ")}. ${ticket.assignment ? `It has been assigned to ${ticket.assignment.technician_name} in ${ticket.assignment.department_name}.` : "It is awaiting triage."} You will receive further updates as the technician works on your issue.`,
    baseUrl
  );
  await saveState();
  return NextResponse.json(
    {
      ticket: publicTicket(ticket),
      notification: ticket.notification ? { channel: ticket.notification.channel, status: ticket.notification.status } : null,
      tracking_url: `${baseUrl}/student/${ticket.student_tracking_token}`,
    },
    { status: 201 }
  );
}
