import { test, expect } from "bun:test";
import { resolveModelFamily, estimateCost, getModelLabel } from "./tokens";

// resolveModelFamily

test("resolveModelFamily maps exact family key", () => {
  expect(resolveModelFamily("claude-opus-4")).toBe("claude-opus-4");
  expect(resolveModelFamily("claude-sonnet-4")).toBe("claude-sonnet-4");
  expect(resolveModelFamily("claude-haiku-4")).toBe("claude-haiku-4");
});

test("resolveModelFamily strips version suffixes", () => {
  expect(resolveModelFamily("claude-opus-4-6")).toBe("claude-opus-4");
  expect(resolveModelFamily("claude-sonnet-4-6")).toBe("claude-sonnet-4");
  expect(resolveModelFamily("claude-haiku-4-5-20251001")).toBe("claude-haiku-4");
});

test("resolveModelFamily falls back to sonnet for unknown models", () => {
  expect(resolveModelFamily("unknown-model")).toBe("claude-sonnet-4");
  expect(resolveModelFamily("gpt-4")).toBe("claude-sonnet-4");
});

// getModelLabel

test("getModelLabel returns readable names", () => {
  expect(getModelLabel("claude-opus-4-6")).toBe("Opus 4");
  expect(getModelLabel("claude-sonnet-4-6")).toBe("Sonnet 4");
  expect(getModelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4");
});

test("getModelLabel falls back to Sonnet for unknown models", () => {
  expect(getModelLabel("unknown-model")).toBe("Sonnet 4");
});

// estimateCost

test("estimateCost returns $0.00 for zero tokens", () => {
  const tokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };
  expect(estimateCost(tokens)).toBe("$0.00");
});

test("estimateCost uses Opus pricing for Opus model", () => {
  const tokens = {
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 1_100_000,
  };
  // input: 1M * $15/MTok = $15, output: 0.1M * $75/MTok = $7.50
  expect(estimateCost(tokens, "claude-opus-4-6")).toBe("$22.50");
});

test("estimateCost uses Sonnet pricing for Sonnet model", () => {
  const tokens = {
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 1_100_000,
  };
  // input: 1M * $3/MTok = $3, output: 0.1M * $15/MTok = $1.50
  expect(estimateCost(tokens, "claude-sonnet-4-6")).toBe("$4.50");
});

test("estimateCost uses Haiku pricing for Haiku model", () => {
  const tokens = {
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 1_100_000,
  };
  // input: 1M * $0.80/MTok = $0.80, output: 0.1M * $4/MTok = $0.40
  expect(estimateCost(tokens, "claude-haiku-4-5-20251001")).toBe("$1.20");
});

test("estimateCost defaults to Sonnet when no model provided", () => {
  const tokens = {
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 1_100_000,
  };
  expect(estimateCost(tokens)).toBe("$4.50");
});

test("estimateCost includes cache costs", () => {
  const tokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    totalTokens: 2_000_000,
  };
  // Opus: cacheWrite 1M * $18.75 = $18.75, cacheRead 1M * $1.50 = $1.50
  expect(estimateCost(tokens, "claude-opus-4")).toBe("$20.25");
});
