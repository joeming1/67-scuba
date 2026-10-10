import { NextResponse } from "next/server";
import { loadState, getTickets } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await loadState();
  const tickets = getTickets();
  return NextResponse.json({
    tickets,
    count: tickets.length,
    server_time: new Date().toISOString(),
  });
}
