import { NextRequest, NextResponse } from "next/server";
import { loadState, findStudentTicket, publicTicket } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await loadState();
  const { token } = await params;
  const ticket = findStudentTicket(token);
  if (!ticket) return NextResponse.json({ error: "Student tracking link not found." }, { status: 404 });
  const visible = publicTicket(ticket);
  if (visible.notification) {
    visible.notification = { channel: visible.notification.channel, status: visible.notification.status };
  }
  return NextResponse.json({ ticket: visible });
}
