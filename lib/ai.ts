import { SYSTEM_INSTRUCTIONS } from "./instructions";
import type { PromptResult } from "./types";

class ModelRequestError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function configuredProvider(): "gemini" | "openrouter" | null {
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  return null;
}

async function readJsonOrThrow(response: Response): Promise<any> {
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new ModelRequestError("The AI provider returned an unreadable response."); }
  if (!response.ok) {
    if (response.status === 429) throw new ModelRequestError("The free model is busy or its usage limit has been reached. Please try again later.", 429);
    if (response.status === 401 || response.status === 403) throw new ModelRequestError("The server's AI connection needs attention.", 503);
    throw new ModelRequestError(typeof data?.error?.message === "string" && response.status < 500 ? "The AI provider could not process this request." : "The AI provider is temporarily unavailable.", 502);
  }
  return data;
}

async function generateWithOpenRouter(input: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Promptly"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
      temperature: 0.25,
      max_tokens: 1800,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        { role: "user", content: `Improve this input into three prompts:\n\n${input}` }
      ]
    }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store"
  });
  const data = await readJsonOrThrow(response);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part: any) => part?.text || "").join("");
  throw new ModelRequestError("The AI model returned no text.");
}

async function generateWithGemini(input: string): Promise<string> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY || "",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
      contents: [{ role: "user", parts: [{ text: `Improve this input into three prompts:\n\n${input}` }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 2400, responseMimeType: "application/json" }
    }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store"
  });
  const data = await readJsonOrThrow(response);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("");
  if (typeof text !== "string" || !text.trim()) throw new ModelRequestError("The AI model returned no text.");
  return text;
}

function parseResponse(raw: string): PromptResult {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first < 0 || last <= first) throw new ModelRequestError("The AI returned an unexpected format. Please try again.");
  let value: any;
  try { value = JSON.parse(clean.slice(first, last + 1)); }
  catch { throw new ModelRequestError("The AI returned an unexpected format. Please try again."); }
  const keys = ["simple", "professional", "advanced"] as const;
  if (!keys.every(key => typeof value[key] === "string" && value[key].trim().length >= 3 && value[key].length <= 6000)) {
    throw new ModelRequestError("The AI returned incomplete prompts. Please try again.");
  }
  return {
    simple: value.simple.trim(),
    professional: value.professional.trim(),
    advanced: value.advanced.trim(),
    category: typeof value.category === "string" ? value.category.slice(0,40) : "Other",
    suggestion: typeof value.suggestion === "string" ? value.suggestion.slice(0,260) : ""
  };
}

export async function enhancePrompt(input: string): Promise<PromptResult> {
  const provider = configuredProvider();
  if (!provider) throw new ModelRequestError("AI is not configured. Add OPENROUTER_API_KEY or GEMINI_API_KEY to the server environment.", 503);
  try {
    const raw = provider === "gemini" ? await generateWithGemini(input) : await generateWithOpenRouter(input);
    return parseResponse(raw);
  } catch (error) {
    if (error instanceof ModelRequestError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new ModelRequestError("The AI took too long to respond. Please try again.", 504);
    throw new ModelRequestError("Could not reach the AI provider. Please try again.");
  }
}

export function describeError(error: unknown): { message: string; status: number } {
  if (error instanceof ModelRequestError) return { message: error.message, status: error.status };
  return { message: "Something went wrong. Please try again.", status: 500 };
}
