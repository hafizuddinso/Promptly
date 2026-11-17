export type PromptStyle = "simple" | "professional" | "advanced";

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
  date: number;
}
