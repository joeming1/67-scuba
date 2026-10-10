import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadState, getEvidenceDir } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  await loadState();
  const { filename } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(filename)) {
    return new NextResponse("Not found.", { status: 404 });
  }
  try {
    const content = await readFile(join(getEvidenceDir(), filename));
    const type = filename.endsWith(".png") ? "image/png" : filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return new NextResponse(content, { headers: { "content-type": type, "cache-control": "no-store" } });
  } catch {
    return new NextResponse("Not found.", { status: 404 });
  }
}
