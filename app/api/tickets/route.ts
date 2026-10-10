import { NextResponse } from "next/server";
import { loadState, getTickets, publicTicket } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { dbGetAllTickets } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // On Vercel (Supabase mode), query all tickets directly from DB
  // instead of relying on in-memory cache which may be empty on cold start.
  if (isSupabaseConfigured()) {
    const tickets = await dbGetAllTickets();
    return NextResponse.json({
      tickets: tickets.map(publicTicket),
      count: tickets.length,
      server_time: new Date().toISOString(),
    });
  }

  // Fallback: in-memory (local dev with JSON file)
  await loadState();
  const tickets = getTickets();
  return NextResponse.json({
    tickets,
    count: tickets.length,
    server_time: new Date().toISOString(),
  });
}
