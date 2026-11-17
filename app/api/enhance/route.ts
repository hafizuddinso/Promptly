import { NextResponse } from "next/server";
import { enhancePrompt, describeError } from "@/lib/ai";
import type { TargetAI } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort per-instance throttling for a public, anonymous demo.
// Serverless instances do not share this map; use a distributed limiter for heavy traffic.
const requests = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 12;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (requests.size > 10000) requests.clear();
  const previous = (requests.get(ip) || []).filter(time => now - time < WINDOW_MS);
  if (previous.length >= MAX_REQUESTS) {
    requests.set(ip, previous);
    return true;
  }
  previous.push(now);
  requests.set(ip, previous);
  return false;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Send JSON input." }, { status: 415 });
  }
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 12000) return NextResponse.json({ error: "Input is too long." }, { status: 413 });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const input = (data && typeof data === "object" && "input" in data) ? (data as { input: unknown }).input : null;
  if (typeof input !== "string" || input.trim().length < 2) {
    return NextResponse.json({ error: "Write at least a few words to improve." }, { status: 400 });
  }
  if (input.length > 3000) return NextResponse.json({ error: "Please keep the input under 3,000 characters." }, { status: 400 });
  const allowedTargets: TargetAI[] = ["universal", "gpt", "claude", "gemini", "deepseek", "qwen", "grok", "image"];
  const rawTarget = (data && typeof data === "object" && "targetAI" in data)
    ? (data as { targetAI: unknown }).targetAI : "universal";
  if (typeof rawTarget !== "string" || !allowedTargets.includes(rawTarget as TargetAI)) {
    return NextResponse.json({ error: "Select a supported target AI." }, { status: 400 });
  }
  const targetAI = rawTarget as TargetAI;

  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many requests from this connection. Please try again later." }, { status: 429 });
  try {
    const result = await enhancePrompt(input.trim(), targetAI);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { message, status } = describeError(error);
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
