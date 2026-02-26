import type { TokenUsage } from "../shared/types";
import { EMPTY_TOKENS } from "../shared/types";

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
 */
export class TranscriptTokenReader {
  private lastTotals = new Map<string, TokenUsage>();

  /**
   * Read the transcript file fully, compute total tokens,
   * and return only the increment since the last read.
   * Returns null if nothing new.
   */
  async readNewTokens(transcriptPath: string): Promise<TokenUsage | null> {
    const currentTotal = await this.readAllTokens(transcriptPath);
    if (!currentTotal) return null;

    const prev = this.lastTotals.get(transcriptPath) || EMPTY_TOKENS;
    this.lastTotals.set(transcriptPath, currentTotal);

    const diff: TokenUsage = {
      inputTokens: currentTotal.inputTokens - prev.inputTokens,
      outputTokens: currentTotal.outputTokens - prev.outputTokens,
      cacheCreationTokens: currentTotal.cacheCreationTokens - prev.cacheCreationTokens,
      cacheReadTokens: currentTotal.cacheReadTokens - prev.cacheReadTokens,
      totalTokens: currentTotal.totalTokens - prev.totalTokens,
    };

    const hasChanges =
      diff.inputTokens > 0 ||
      diff.outputTokens > 0 ||
      diff.cacheCreationTokens > 0 ||
      diff.cacheReadTokens > 0;
    return hasChanges ? diff : null;
  }

  /**
   * Read ALL token usage from a transcript file.
   * Skips partial/malformed lines safely — they'll be complete on next read.
   */
  async readAllTokens(transcriptPath: string): Promise<TokenUsage | null> {
    try {
      const file = Bun.file(transcriptPath);
      if (!(await file.exists())) return null;

      const text = await file.text();
      const tokens: TokenUsage = { ...EMPTY_TOKENS };
      let found = false;

      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === "assistant" && entry.message?.usage) {
            const u = entry.message.usage;
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
        } catch {
          // Partial line at EOF — will be complete on next read
        }
      }

      return found ? tokens : null;
    } catch {
      return null;
    }
  }

  /** Reset tracked state (e.g. on clear) */
  clear() {
    this.lastTotals.clear();
  }
}
