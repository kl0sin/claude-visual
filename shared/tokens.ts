import type { TokenUsage } from "./types";

/**
 * Deep-search for token usage data anywhere in an event payload.
 * Claude Code hook events may nest usage data at various levels.
 */
export function extractTokenUsage(data: unknown, depth = 0): TokenUsage | null {
  if (!data || typeof data !== "object" || depth > 5) return null;

  const obj = data as Record<string, any>;

  // Check for snake_case token fields (API format)
  if (typeof obj.input_tokens === "number" || typeof obj.output_tokens === "number") {
    const input = obj.input_tokens ?? 0;
    const output = obj.output_tokens ?? 0;
    if (input > 0 || output > 0) {
      return {
        inputTokens: input,
        outputTokens: output,
        cacheCreationTokens: obj.cache_creation_input_tokens ?? 0,
        cacheReadTokens: obj.cache_read_input_tokens ?? 0,
        totalTokens: input + output,
      };
    }
  }

  // Check for camelCase token fields (frontend format)
  if (typeof obj.inputTokens === "number" || typeof obj.outputTokens === "number") {
    const input = obj.inputTokens ?? 0;
    const output = obj.outputTokens ?? 0;
    if (input > 0 || output > 0) {
      return {
        inputTokens: input,
        outputTokens: output,
        cacheCreationTokens: obj.cacheCreationTokens ?? 0,
        cacheReadTokens: obj.cacheReadTokens ?? 0,
        totalTokens: input + output,
      };
    }
  }

  // Check for prompt_tokens/completion_tokens (OpenAI format)
  if (typeof obj.prompt_tokens === "number" || typeof obj.completion_tokens === "number") {
    const input = obj.prompt_tokens ?? 0;
    const output = obj.completion_tokens ?? 0;
    if (input > 0 || output > 0) {
      return {
        inputTokens: input,
        outputTokens: output,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: input + output,
      };
    }
  }

  // Recurse into known keys first (most likely locations)
  const priorityKeys = ["usage", "token_usage", "tokens", "message", "result", "response", "data", "stats", "metadata"];
  for (const key of priorityKeys) {
    if (key in obj && obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
      const found = extractTokenUsage(obj[key], depth + 1);
      if (found) return found;
    }
  }

  // Broader recursive search for remaining object keys
  for (const key of Object.keys(obj)) {
    if (priorityKeys.includes(key)) continue;
    const val = obj[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = extractTokenUsage(val, depth + 1);
      if (found) return found;
    }
  }

  return null;
}
