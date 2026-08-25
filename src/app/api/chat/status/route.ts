import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const aiEnabled = await isAiConfigured();
    return NextResponse.json({ aiEnabled });
  } catch {
    return NextResponse.json({ aiEnabled: false });
  }
}
