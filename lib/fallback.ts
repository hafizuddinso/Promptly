import type { PromptResult, TargetAI } from "./types";

// Rule-based prompt drafts used when no free AI request is available.
// No external calls, paid models, tracking, or fabricated context.
function readable(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  const capped = trimmed.replace(/^i\b/, "I");
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}
function sentence(input: string): string {
  const text = readable(input);
  return /[.!?]$/.test(text) ? text : text + ".";
}
function categoryOf(input: string): PromptResult["category"] {
  if (/\b(video|film|reel|clip|animation|movie|footage)\b/i.test(input)) return "Video";
  if (/\b(image|photo|picture|logo|illustration|draw|render|graphic|poster)\b/i.test(input)) return "Images";
  if (/\b(code|program|debug|website|app|script|function|software)\b/i.test(input)) return "Coding";
  if (/\b(translate|translation|rewrite|email|essay|letter|article|caption|write)\b/i.test(input)) return "Writing";
  if (/\b(research|study|paper|citation|literature)\b/i.test(input)) return "Research";
  if (/\b(learn|explain|teach|understand)\b/i.test(input)) return "Learning";
  if (/\b(plan|schedule|organize|trip|travel|itinerary)\b/i.test(input)) return "Planning";
  if (/\b(hello|hi|hey|how are you|good morning|good evening)\b/i.test(input)) return "Conversation";
  return "Other";
}
export function basicPrompt(input: string, target: TargetAI, notice = "Free AI is unavailable. Showing a basic built-in draft."): PromptResult {
  const clean = readable(input);
  const normalized = sentence(input);
  const category = categoryOf(input);
  const targetHint = target === "universal" ? "an AI assistant" : target === "image" ? "an image-generation assistant" : target === "gpt" ? "ChatGPT" : target.charAt(0).toUpperCase() + target.slice(1);
  const isGreeting = /^(hello|hi|hey|good morning|good evening|how are you)[!?.\s]*$/i.test(clean);
  const reference = /\b(similar|same|like this|like that|reference)\b/i.test(clean);
  if (isGreeting) {
    return {
      simple: normalized,
      professional: clean.toLowerCase().startsWith("how are you") ? "Hello! How are you doing?" : "Hello! I'd like to start a friendly conversation.",
      advanced: clean.toLowerCase().startsWith("how are you")
        ? "Hello! How are you today? Please respond in a warm, natural conversational tone."
        : "Hello! Let's have a friendly, natural conversation.",
      category: "Conversation", suggestion: "", source: "offline", notice
    };
  }
  if (category === "Video" || category === "Images") {
    const thing = category === "Video" ? "video" : "image";
    const ref = reference ? " Use [reference] to guide the result; ask me to provide it if it is missing." : "";
    return {
      simple: normalized,
      professional: `Help me with this ${thing} request: ${normalized}${ref} Keep the original intent and ask about any essential missing details.`,
      advanced: `Task: ${normalized}\nReference: ${reference ? "[reference to be provided]" : "None provided"}\nDeliverable: A clear, practical ${thing} creation prompt suited to ${targetHint}.\nConstraints: Preserve the intended subject and style. Do not invent important details; use [placeholders] for missing information.`,
      category, suggestion: reference ? "Add the reference to make a similar result." : "Include a subject, style, or other relevant details for a more specific result.", source: "offline", notice
    };
  }
  return {
    simple: normalized,
    professional: `Please help me with this request: ${normalized} Keep the answer clear, relevant, and faithful to the details I provided.`,
    advanced: `Task: ${normalized}\nGoal: Address my original request without changing its meaning.\nApproach: Provide a practical, well-structured response suitable for ${targetHint}.\nRequirements: Use my stated details. If essential information is missing, ask for it rather than guessing.`,
    category, suggestion: "Add your goal or any important context for a more tailored prompt.", source: "offline", notice
  };
}
