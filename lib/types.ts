export type PromptStyle = "simple" | "professional" | "advanced";

export type TargetAI = "universal" | "gpt" | "claude" | "gemini" | "deepseek" | "qwen" | "grok" | "image";

export interface PromptResult {
  simple: string;
  professional: string;
  advanced: string;
  category: string;
  suggestion?: string;
}

export interface SavedPrompt {
  id: string;
  input: string;
  result: PromptResult;
  targetAI?: TargetAI;
  date: number;
}
