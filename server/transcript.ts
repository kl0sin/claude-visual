import type { TokenUsage } from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";

export interface TranscriptData {
  tokens: TokenUsage;
  model?: string; // last seen model ID, e.g. "claude-opus-4-6"
  latestResponse?: string; // text of the most recent assistant message (new since last read)
  latestThinking?: string; // text of the most recent thinking block (new since last read)
}

/**
 * Reads token usage data from Claude Code transcript JSONL files.
 *
 * Uses a full-read-and-diff approach: each call reads the entire file,
 * computes total tokens, then returns only the increment since last read.
 * This avoids the offset-based approach where partial lines at EOF
 * would be permanently skipped.
 *
 * Transcript entries with type "assistant" contain:
 *   message.usage.input_tokens
 *   message.usage.output_tokens
 *   message.usage.cache_creation_input_tokens
 *   message.usage.cache_read_input_tokens
 *   message.model  (e.g. "claude-opus-4-6")
 */
export class TranscriptTokenReader {
  private lastTotals = new Map<string, TokenUsage>();
  private lastResponses = new Map<string, string>();
  private lastThinkings = new Map<string, string>();

  /**
   * Read the transcript file fully, compute total tokens,
   * and return only the increment since the last read.
   * Returns null if nothing new.
   */
  async readNewData(transcriptPath: string): Promise<TranscriptData | null> {
    const current = await this.readAllData(transcriptPath);
    if (!current) return null;

    const prev = this.lastTotals.get(transcriptPath) || EMPTY_TOKENS;
    this.lastTotals.set(transcriptPath, current.tokens);

    const diff: TokenUsage = {
      inputTokens: current.tokens.inputTokens - prev.inputTokens,
      outputTokens: current.tokens.outputTokens - prev.outputTokens,
      cacheCreationTokens: current.tokens.cacheCreationTokens - prev.cacheCreationTokens,
      cacheReadTokens: current.tokens.cacheReadTokens - prev.cacheReadTokens,
      totalTokens: current.tokens.totalTokens - prev.totalTokens,
    };

    const hasTokenChanges =
      diff.inputTokens > 0 ||
      diff.outputTokens > 0 ||
      diff.cacheCreationTokens > 0 ||
      diff.cacheReadTokens > 0;

    // Only return latestResponse if it's new
    const prevResponse = this.lastResponses.get(transcriptPath) ?? "";
    const latestResponse =
      current.latestResponse && current.latestResponse !== prevResponse
        ? current.latestResponse
        : undefined;
    if (latestResponse) this.lastResponses.set(transcriptPath, latestResponse);

    // Only return latestThinking if it's new
    const prevThinking = this.lastThinkings.get(transcriptPath) ?? "";
    const latestThinking =
      current.latestThinking && current.latestThinking !== prevThinking
        ? current.latestThinking
        : undefined;
    if (latestThinking) this.lastThinkings.set(transcriptPath, latestThinking);

    if (!hasTokenChanges && !latestResponse && !latestThinking) return null;
    return { tokens: diff, model: current.model, latestResponse, latestThinking };
  }

  /**
   * Read ALL token usage from a transcript file.
   * Skips partial/malformed lines safely — they'll be complete on next read.
   */
  async readAllData(transcriptPath: string): Promise<TranscriptData | null> {
    try {
      const file = Bun.file(transcriptPath);
      if (!(await file.exists())) return null;

      const text = await file.text();
      const tokens: TokenUsage = { ...EMPTY_TOKENS };
      let model: string | undefined;
      let latestResponse: string | undefined;
      let latestThinking: string | undefined;
      let found = false;

      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === "assistant" && entry.message) {
            const msg = entry.message;

            if (msg.usage) {
              const u = msg.usage;
              const input = u.input_tokens || 0;
              const output = u.output_tokens || 0;
              const cacheCreation = u.cache_creation_input_tokens || 0;
              const cacheRead = u.cache_read_input_tokens || 0;
              tokens.inputTokens += input;
              tokens.outputTokens += output;
              tokens.cacheCreationTokens += cacheCreation;
              tokens.cacheReadTokens += cacheRead;
              tokens.totalTokens += input + output + cacheCreation + cacheRead;
              found = true;
            }

            if (msg.model) model = msg.model;

            if (Array.isArray(msg.content)) {
              // Extract text blocks (final response)
              const responseText = msg.content
                .filter((b: any) => b.type === "text")
                .map((b: any) => (b.text as string) || "")
                .join("\n\n")
                .trim();
              if (responseText) latestResponse = responseText;

              // Extract thinking blocks
              const thinkingText = msg.content
                .filter((b: any) => b.type === "thinking")
                .map((b: any) => (b.thinking as string) || "")
                .join("\n\n")
                .trim();
              if (thinkingText) latestThinking = thinkingText;
            }
          }
        } catch {
          // Partial line at EOF — will be complete on next read
        }
      }

      return found ? { tokens, model, latestResponse, latestThinking } : null;
    } catch {
      return null;
    }
  }

  // Backward-compatible aliases
  async readNewTokens(transcriptPath: string): Promise<TokenUsage | null> {
    const data = await this.readNewData(transcriptPath);
    return data ? data.tokens : null;
  }

  async readAllTokens(transcriptPath: string): Promise<TokenUsage | null> {
    const data = await this.readAllData(transcriptPath);
    return data ? data.tokens : null;
  }

  /** Reset tracked state (e.g. on clear) */
  clear() {
    this.lastTotals.clear();
    this.lastResponses.clear();
    this.lastThinkings.clear();
  }
}
