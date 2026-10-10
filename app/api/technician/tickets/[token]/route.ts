import { NextRequest, NextResponse } from "next/server";
import { loadState, findTechnicianWorkspaceTicket, publicTicket } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { dbGetTicketByToken } from "@/lib/db";
import type { Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // On Vercel (or any serverless), query Supabase directly by token
  // instead of loading ALL tickets into memory.
  if (isSupabaseConfigured()) {
    const ticket = await dbGetTicketByToken(token, "technician_action_token");
    if (!ticket) {
      return NextResponse.json({ error: "Technician link is invalid or expired." }, { status: 404 });
    }
    return NextResponse.json({ ticket: publicTicket(ticket) });
  }

  // Fallback: in-memory lookup (local dev with JSON file)
  await loadState();
  const ticket = findTechnicianWorkspaceTicket(token);
  if (!ticket) {
    return NextResponse.json({ error: "Technician link is invalid or expired." }, { status: 404 });
  }
  return NextResponse.json({ ticket: publicTicket(ticket) });
}
