import { NextResponse } from "next/server";
import { configuredProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ ready: Boolean(configuredProvider()), provider: configuredProvider() }, {
    headers: { "Cache-Control": "no-store" }
  });
}
