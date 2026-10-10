import { NextRequest, NextResponse } from "next/server";
import { loadState, findStudentTicket, publicTicket } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { dbGetTicketByToken } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // On Vercel (or any serverless), query Supabase directly by token
  // instead of loading ALL tickets into memory.
  if (isSupabaseConfigured()) {
    const ticket = await dbGetTicketByToken(token, "student_tracking_token");
    if (!ticket) {
      return NextResponse.json({ error: "Student tracking link not found." }, { status: 404 });
    }
    const visible = publicTicket(ticket);
    if (visible.notification) {
      visible.notification = { channel: visible.notification.channel, status: visible.notification.status };
    }
    return NextResponse.json({ ticket: visible });
  }

  // Fallback: in-memory lookup (local dev with JSON file)
  await loadState();
  const ticket = findStudentTicket(token);
  if (!ticket) {
    return NextResponse.json({ error: "Student tracking link not found." }, { status: 404 });
  }
  const visible = publicTicket(ticket);
  if (visible.notification) {
    visible.notification = { channel: visible.notification.channel, status: visible.notification.status };
  }
  return NextResponse.json({ ticket: visible });
}
