import { NextRequest, NextResponse } from "next/server";
import { loadState, findTechnicianWorkspaceTicket, publicTicket } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  await loadState();
  const { token } = await params;
  const ticket = findTechnicianWorkspaceTicket(token);
  if (!ticket) return NextResponse.json({ error: "Technician link is invalid or expired." }, { status: 404 });
  return NextResponse.json({ ticket: publicTicket(ticket) });
}
