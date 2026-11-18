import { NextResponse } from "next/server";
import { configuredProvider, selectedOpenRouterModel } from "@/lib/ai";

export const dynamic = "force-dynamic";
export function GET() {
  const provider = configuredProvider();
  const model = provider === "openrouter"
    ? selectedOpenRouterModel()
    : provider === "gemini"
      ? process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite"
      : null;
  return NextResponse.json({ ready: true, provider, model, basicFallback: true }, {
    headers: { "Cache-Control": "no-store" }
  });
}
