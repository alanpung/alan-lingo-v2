import { createProviderRegistry } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "dummy",
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
});

const anthropic = createAnthropic({
  baseURL: process.env.LLM_PROXY_URL,
  apiKey: process.env.LLM_PROXY_API_KEY || process.env.ANTHROPIC_API_KEY || "dummy",
});

const registry = createProviderRegistry({ google, openai, anthropic });

export const AVAILABLE_MODELS: {
  id: string;
  label: string;
  provider: string;
}[] = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "google" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
];

/** Models available in the chat UI */
export const CHAT_AVAILABLE_MODELS = AVAILABLE_MODELS;

/** Comma-separated list of admin emails loaded from env. */
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Returns the model list appropriate for the given user email. */
export function getModelsForUser(_email: string | null | undefined) {
  return CHAT_AVAILABLE_MODELS;
}

export function getModel(id: string) {
  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === id);
  const resolved = modelInfo ? `${modelInfo.provider}:${modelInfo.id}` : `google:gemini-3.5-flash`;
  return registry.languageModel(
    resolved as Parameters<typeof registry.languageModel>[0],
  );
}
