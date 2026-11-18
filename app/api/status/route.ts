import { NextResponse } from "next/server";
import { configuredProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";
export function GET() {
  const provider = configuredProvider();
  const model = provider === "gemini"
    ? process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite"
    : provider === "openrouter"
      ? "google/gemma-4-26b-a4b-it:free"
      : null;
  return NextResponse.json({ ready: Boolean(provider), provider, model }, {
    headers: { "Cache-Control": "no-store" }
  });
}
