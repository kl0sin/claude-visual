import type { TokenUsage } from "./types";

export interface ModelPricing {
  input: number;    // $/MTok
  output: number;   // $/MTok
  cacheWrite: number; // $/MTok
  cacheRead: number;  // $/MTok
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4":   { input: 15,  output: 75, cacheWrite: 18.75, cacheRead: 1.5  },
  "claude-sonnet-4": { input: 3,   output: 15, cacheWrite: 3.75,  cacheRead: 0.3  },
  "claude-haiku-4":  { input: 0.8, output: 4,  cacheWrite: 1,     cacheRead: 0.08 },
};

const DEFAULT_FAMILY = "claude-sonnet-4";

/**
 * Maps a full model ID (e.g. "claude-opus-4-6") to its pricing family key.
 * Strips version suffixes like "-6", "-20251001", etc.
 */
export function resolveModelFamily(modelId: string): string {
  for (const family of Object.keys(MODEL_PRICING)) {
    if (modelId === family || modelId.startsWith(family + "-")) {
      return family;
    }
  }
  return DEFAULT_FAMILY;
}

/**
 * Estimate cost based on token usage and model.
 * Falls back to Sonnet pricing if model is unknown.
 */
export function estimateCost(tokens: TokenUsage, modelId?: string): string {
  const family = modelId ? resolveModelFamily(modelId) : DEFAULT_FAMILY;
  const pricing = MODEL_PRICING[family] || MODEL_PRICING[DEFAULT_FAMILY]!;

  const inputCost = (tokens.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (tokens.outputTokens / 1_000_000) * pricing.output;
  const cacheWriteCost = (tokens.cacheCreationTokens / 1_000_000) * pricing.cacheWrite;
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * pricing.cacheRead;
  const total = inputCost + outputCost + cacheWriteCost + cacheReadCost;

  if (total < 0.01) return "$0.00";
  return `$${total.toFixed(2)}`;
}

/**
 * Returns a human-readable label for a model ID.
 * e.g. "claude-opus-4-6" → "Opus 4", "claude-haiku-4-5-20251001" → "Haiku 4"
 */
export function getModelLabel(modelId: string): string {
  const family = resolveModelFamily(modelId);
  const labels: Record<string, string> = {
    "claude-opus-4": "Opus 4",
    "claude-sonnet-4": "Sonnet 4",
    "claude-haiku-4": "Haiku 4",
  };
  return labels[family] || modelId;
}
