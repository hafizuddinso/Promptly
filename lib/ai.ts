import { getSystemInstructionsForTarget } from "./instructions";
import type { PromptResult, TargetAI } from "./types";

class ModelRequestError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function configuredProvider(): "gemini" | "openrouter" | null {
  // Prefer the Gemini API when the site owner has configured its key.
  // OpenRouter stays available as an alternative only when Gemini is absent.
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  return null;
}

async function readJsonOrThrow(response: Response, provider: "gemini" | "openrouter"): Promise<any> {
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new ModelRequestError("The AI provider returned an unreadable response."); }
  if (!response.ok) {
    if (response.status === 429) throw new ModelRequestError("The free model is busy or its usage limit has been reached. Please try again later.", 429);
    if (response.status === 401) {
      throw new ModelRequestError(provider === "openrouter"
        ? "OpenRouter rejected the API key (401). Replace OPENROUTER_API_KEY in Vercel with a current key, then redeploy."
        : "Gemini rejected the API key (401). Check GEMINI_API_KEY in Vercel and redeploy.", 401);
    }
    if (response.status === 403) {
      throw new ModelRequestError(provider === "openrouter"
        ? "OpenRouter denied access (403). Check your API key permissions, account restrictions and model availability in OpenRouter."
        : "Gemini denied access (403). Check API key restrictions and model access in Google AI Studio.", 403);
    }
    if (response.status === 402) {
      throw new ModelRequestError("The AI provider requires credits for this request. Select an available free model.", 402);
    }
    // Keep provider errors actionable without exposing raw third-party messages
    // (which can contain request details or account information).
    const providerName = provider === "gemini" ? "Gemini" : "OpenRouter";
    const providerCode = typeof data?.error?.status === "string" ? data.error.status : "";
    console.error("Promptly provider request failed", { provider, httpStatus: response.status, providerCode });
    if (response.status === 400) {
      throw new ModelRequestError(
        `${providerName} rejected the request (400). Verify the model name and request settings in Vercel.`, 400);
    }
    if (response.status === 404) {
      throw new ModelRequestError(
        `${providerName} could not find the selected model (404). Check GEMINI_MODEL or the model's availability.`, 404);
    }
    if (response.status === 422) {
      throw new ModelRequestError(
        `${providerName} could not validate the request (422). Check the selected model and format.`, 422);
    }
    throw new ModelRequestError(
      `${providerName} returned HTTP ${response.status}. Check the Vercel function logs for the provider error code.`,
      response.status >= 500 ? 502 : response.status);
  }
  return data;
}

async function generateWithOpenRouter(input: string, targetAI: TargetAI): Promise<PromptResult> {
  // A fixed, lightweight instruction-tuned free model is more predictable
  // than selecting a random free model for every request.
  const fastModel = "google/gemma-4-26b-a4b-it:free";
  const configuredBackup = process.env.OPENROUTER_MODEL?.trim();
  // The override is allowed only for free models; never charge visitors.
  const backupModel = configuredBackup === "openrouter/free" || configuredBackup?.endsWith(":free")
    ? configuredBackup
    : "openrouter/free";
  const models = [fastModel, backupModel === fastModel ? "openrouter/free" : backupModel];
  const timeoutMs = [12_000, 12_000];
  const maxTokens = input.length > 1200 ? 1700 : 1100;

  let lastError: unknown;
  let sawTimeout = false;
  for (let attempt = 0; attempt < models.length; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Promptly"
        },
        body: JSON.stringify({
          model: models[attempt],
          temperature: 0.2,
          max_tokens: maxTokens,
          provider: { sort: "latency" },
          messages: [
            { role: "system", content: getSystemInstructionsForTarget(targetAI) },
            { role: "user", content: `Rewrite this into three concise, useful prompts. Return the JSON only:\n\n${input}` }
          ]
        }),
        signal: AbortSignal.timeout(timeoutMs[attempt]),
        cache: "no-store"
      });
      const data = await readJsonOrThrow(response, "openrouter");
      const content = data?.choices?.[0]?.message?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part: any) => typeof part === "string" ? part : part?.text || "").join("")
          : "";
      if (!text.trim()) throw new ModelRequestError("Empty model output.");
      // Validate before accepting: malformed JSON and blank answers can be
      // recovered by trying the alternative free model.
      return parseResponse(text);
    } catch (error) {
      // Key and account billing restrictions cannot be fixed by another model.
      // An individual free model's 429 response can sometimes be recovered
      // by trying a different free model once.
      if (error instanceof ModelRequestError && [401, 402, 403].includes(error.status)) {
        throw error;
      }
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
        sawTimeout = true;
      }
      lastError = error;
    }
  }
  if (sawTimeout) {
    throw new ModelRequestError("Free AI models are taking longer than usual. Please retry in a moment.", 504);
  }
  if (lastError instanceof ModelRequestError && lastError.status === 429) {
    throw new ModelRequestError("Free AI requests are rate-limited right now. Please try again shortly.", 429);
  }
  throw new ModelRequestError("Both free models are unavailable or returned incomplete prompts. Please retry.", 502);
}

async function generateWithGemini(input: string, targetAI: TargetAI): Promise<string> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY || "",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: getSystemInstructionsForTarget(targetAI) }] },
      contents: [{ role: "user", parts: [{ text: `Improve this input into three prompts:\n\n${input}` }] }],
      generationConfig: {
  temperature: 0.25,
  maxOutputTokens: 2400
}
    }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store"
  });
  const data = await readJsonOrThrow(response, "gemini");
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

export async function enhancePrompt(input: string, targetAI: TargetAI = "universal"): Promise<PromptResult> {
  const provider = configuredProvider();
  if (!provider) throw new ModelRequestError("Prompt generation is not connected yet. The site owner needs to configure the AI connection and redeploy.", 503);
  try {
    if (provider === "gemini") return parseResponse(await generateWithGemini(input, targetAI));
    return await generateWithOpenRouter(input, targetAI);
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
