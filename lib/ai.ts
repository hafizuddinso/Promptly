import { getSystemInstructionsForTarget } from "./instructions";
import { basicPrompt } from "./fallback";
import type { PromptResult, TargetAI } from "./types";

class ModelRequestError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function configuredProvider(): "gemini" | "openrouter" | null {
  // Promptly uses OpenRouter whenever its API key is configured.
  // Gemini is retained only for deployments without an OpenRouter key.
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
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
    // Google's HTTP status alone is not enough to identify invalid fields,
    // unavailable regions or unsupported model settings.
    const providerMessage = typeof data?.error?.message === "string"
      ? data.error.message
          .replace(/AIza[A-Za-z0-9_-]{15,}/g, "[redacted API key]")
          .replace(/sk-(?:or-v1-)?[A-Za-z0-9_-]{12,}/g, "[redacted API key]")
          .slice(0, 350)
      : "";
    console.error("Promptly provider request failed", {
      provider, httpStatus: response.status, providerCode, providerMessage
    });
    if (response.status === 400) {
      if (/location|region|country.+not supported/i.test(providerMessage)) {
        throw new ModelRequestError(
          "Gemini API access is unavailable for this account or region. Check Google AI Studio access.", 400);
      }
      if (/model.+(?:not found|not supported|unavailable)/i.test(providerMessage)) {
        throw new ModelRequestError(
          "Gemini cannot use the configured model. Check GEMINI_MODEL in Vercel.", 400);
      }
      throw new ModelRequestError(
        `${providerName} rejected the request (400). Check the providerMessage in Vercel Function Logs.`, 400);
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

const FREE_FAST_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free"
] as const;

export function selectedOpenRouterModel(): string {
  const configured = process.env.OPENROUTER_MODEL?.trim();
  if (configured && configured !== "openrouter/free" && configured.endsWith(":free")) {
    return configured;
  }
  // Start with a known instruction-tuned free model instead of a random pick.
  return FREE_FAST_MODELS[0];
}

function freeModelFallbacks(): string[] {
  const selected = selectedOpenRouterModel();
  return [selected, ...FREE_FAST_MODELS.filter(m => m !== selected)];
}

function compactPromptInstructions(targetAI: TargetAI): string {
  return `You are a prompt editor. Rewrite the user's text into three independently usable prompts, preserving the original intention and facts. Never answer the request. For very short everyday inputs, keep responses brief. Do not invent missing details or pretend to see a reference video/image. For references not provided, use [reference].
Target AI: ${targetAI}.
Return ONLY one JSON object with string fields: "simple" (short and direct), "professional" (polished), "advanced" (specific and structured), "category" (one word), "suggestion" (short tip or empty). No Markdown.`;
}

let openRouterCooldownUntil = 0;

async function generateWithOpenRouter(input: string, targetAI: TargetAI): Promise<PromptResult> {
  // Limit repeated calls while the free tier is reporting 429.
  if (Date.now() < openRouterCooldownUntil) {
    throw new ModelRequestError("OpenRouter free requests are temporarily limited.", 429);
  }
  const models = freeModelFallbacks();
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Promptly"
      },
      body: JSON.stringify({
        // OpenRouter automatically falls back to the next *free* model on errors.
        // All IDs are explicitly free to prevent accidental paid requests.
        models,
        temperature: 0.2,
        max_tokens: input.length > 1200 ? 1000 : 650,
        messages: [
          { role: "system", content: compactPromptInstructions(targetAI) },
          { role: "user", content: input }
        ]
      }),
      signal: AbortSignal.timeout(18_000),
      cache: "no-store"
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new ModelRequestError("The free OpenRouter model is busy. Please try again shortly.", 504);
    }
    throw error;
  }
  if (response.status === 429) {
    // This cooldown applies only inside the current serverless instance.
    const retry = Number(response.headers.get("retry-after") || "120");
    openRouterCooldownUntil = Date.now() + Math.max(30000, Math.min(600000, Number.isFinite(retry) ? retry * 1000 : 120000));
  }
  const data = await readJsonOrThrow(response, "openrouter");
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part: any) => typeof part === "string" ? part : part?.text || "").join("")
      : "";
  if (!text.trim()) {
    throw new ModelRequestError("The selected free AI model returned no text. Please try again.", 502);
  }
  return parseResponse(text);
}

async function generateWithGemini(input: string, targetAI: TargetAI): Promise<string> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const systemText = getSystemInstructionsForTarget(targetAI);
  const headers = {
    "x-goog-api-key": process.env.GEMINI_API_KEY || "",
    "Content-Type": "application/json"
  };

  const sendRequest = (body: unknown) => fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
    cache: "no-store"
  });
  const mainBody = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: `Improve this input into three prompts:\n\n${input}` }] }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 2400 }
  };
  let response = await sendRequest(mainBody);

  // Some accounts/models return a 400 for optional generation settings.
  // Retry only once with the smallest valid GenerateContent request. Do not
  // retry keys/regions that Google explicitly says cannot use the service.
  if (response.status === 400) {
    let detail = "";
    try {
      const data = await response.clone().json();
      detail = typeof data?.error?.message === "string" ? data.error.message : "";
    } catch {}
    if (!/location|region|country.+not supported/i.test(detail)) {
      console.warn("Promptly Gemini minimal-payload retry", { model, httpStatus: 400 });
      response = await sendRequest({
        contents: [{
          parts: [{ text: `${systemText}\n\nUser input:\n${input}\n\nReturn the required JSON object only.` }]
        }]
      });
    }
  }
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
  // A working, no-cost draft is always available, even without a key.
  if (!provider) return basicPrompt(input, targetAI, "No AI key configured. Showing a basic built-in draft.");
  try {
    const generated = provider === "gemini"
      ? parseResponse(await generateWithGemini(input, targetAI))
      : await generateWithOpenRouter(input, targetAI);
    return { ...generated, source: "ai" };
  } catch (error) {
    // No paid requests or repeated account-wide 429 retries.
    const status = error instanceof ModelRequestError ? error.status : 502;
    console.warn("Promptly AI fallback", {
      provider, model: provider === "openrouter" ? selectedOpenRouterModel() : undefined,
      status, reason: error instanceof ModelRequestError ? error.message : error instanceof Error ? error.name : "UnknownError"
    });
    let reason: string;
    if (status === 429) {
      reason = "OpenRouter returned 429 (free rate limit). Basic built-in draft shown.";
    } else if (status === 504) {
      reason = "OpenRouter did not respond in time. Basic built-in draft shown.";
    } else if ([401, 402, 403].includes(status)) {
      reason = `OpenRouter API access failed (HTTP ${status}). Check your key and usage. Basic built-in draft shown.`;
    } else if (error instanceof ModelRequestError && /unexpected format|incomplete prompts|no text/i.test(error.message)) {
      reason = "The free AI returned an invalid or empty answer. Basic built-in draft shown.";
    } else {
      reason = `Free AI failed (HTTP ${status}). See Vercel Logs for the cause. Basic built-in draft shown.`;
    }
    return basicPrompt(input, targetAI, reason);
  }
}

export function describeError(error: unknown): { message: string; status: number } {
  if (error instanceof ModelRequestError) return { message: error.message, status: error.status };
  return { message: "Something went wrong. Please try again.", status: 500 };
}
