import { test, expect, beforeEach, afterAll } from "bun:test";
import { TranscriptTokenReader } from "./transcript";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpDir: string;
let reader: TranscriptTokenReader;

function assistantEntry(input: number, output: number, cacheCreate = 0, cacheRead = 0, model?: string) {
  const msg: Record<string, any> = {
    usage: {
      input_tokens: input,
      output_tokens: output,
      cache_creation_input_tokens: cacheCreate,
      cache_read_input_tokens: cacheRead,
    },
  };
  if (model) msg.model = model;
  return JSON.stringify({ type: "assistant", message: msg });
}

function userEntry() {
  return JSON.stringify({ type: "human", message: { content: "hello" } });
}

async function writeTranscript(name: string, lines: string[]) {
  const path = join(tmpDir, name);
  await Bun.write(path, lines.join("\n") + "\n");
  return path;
}

async function appendToTranscript(path: string, lines: string[]) {
  const existing = await Bun.file(path).text();
  await Bun.write(path, existing + lines.join("\n") + "\n");
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "transcript-test-"));
  reader = new TranscriptTokenReader();
});

afterAll(async () => {
  // Clean up temp dirs
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

test("readNewTokens returns tokens from assistant entries", async () => {
  const path = await writeTranscript("basic.jsonl", [
    userEntry(),
    assistantEntry(100, 50),
  ]);

  const tokens = await reader.readNewTokens(path);
  expect(tokens).not.toBeNull();
  expect(tokens!.inputTokens).toBe(100);
  expect(tokens!.outputTokens).toBe(50);
  expect(tokens!.totalTokens).toBe(150);
});

test("readNewTokens returns only incremental tokens on subsequent calls", async () => {
  const path = await writeTranscript("incremental.jsonl", [
    assistantEntry(100, 50),
  ]);

  const first = await reader.readNewTokens(path);
  expect(first!.totalTokens).toBe(150);

  // Append more entries
  await appendToTranscript(path, [
    userEntry(),
    assistantEntry(200, 80),
  ]);

  const second = await reader.readNewTokens(path);
  expect(second).not.toBeNull();
  expect(second!.inputTokens).toBe(200);
  expect(second!.outputTokens).toBe(80);
  expect(second!.totalTokens).toBe(280);
});

test("readNewTokens returns null when no new tokens", async () => {
  const path = await writeTranscript("nonew.jsonl", [
    assistantEntry(100, 50),
  ]);

  await reader.readNewTokens(path);
  const second = await reader.readNewTokens(path);
  expect(second).toBeNull();
});

test("readNewTokens handles partial line at EOF without losing data", async () => {
  // This is the critical bug fix test:
  // If the last line is incomplete JSON, it should NOT be permanently lost.

  const path = await writeTranscript("partial.jsonl", [
    assistantEntry(100, 50),
  ]);

  // Append a partial line (incomplete JSON)
  const file = Bun.file(path);
  const existing = await file.text();
  await Bun.write(path, existing + '{"type":"assistant","message":{"usage":{"input_tok');

  // First read: should get the complete entry, skip the partial one
  const first = await reader.readNewTokens(path);
  expect(first!.inputTokens).toBe(100);
  expect(first!.outputTokens).toBe(50);

  // Now "complete" the partial line by rewriting the file with the full entry
  await Bun.write(
    path,
    existing + assistantEntry(300, 120) + "\n"
  );

  // Second read: should now pick up the previously-partial entry
  const second = await reader.readNewTokens(path);
  expect(second).not.toBeNull();
  expect(second!.inputTokens).toBe(300);
  expect(second!.outputTokens).toBe(120);
  expect(second!.totalTokens).toBe(420);
});

test("readNewTokens accumulates multiple assistant entries", async () => {
  const path = await writeTranscript("multi.jsonl", [
    assistantEntry(100, 50),
    userEntry(),
    assistantEntry(200, 80),
    userEntry(),
    assistantEntry(300, 120),
  ]);

  const tokens = await reader.readNewTokens(path);
  expect(tokens!.inputTokens).toBe(600);
  expect(tokens!.outputTokens).toBe(250);
  expect(tokens!.totalTokens).toBe(850);
});

test("readNewTokens tracks cache tokens", async () => {
  const path = await writeTranscript("cache.jsonl", [
    assistantEntry(100, 50, 30, 20),
  ]);

  const tokens = await reader.readNewTokens(path);
  expect(tokens!.cacheCreationTokens).toBe(30);
  expect(tokens!.cacheReadTokens).toBe(20);
});

test("readAllTokens always returns full total", async () => {
  const path = await writeTranscript("all.jsonl", [
    assistantEntry(100, 50),
    assistantEntry(200, 80),
  ]);

  // Read incrementally first
  await reader.readNewTokens(path);

  // readAllTokens should still return the full total
  const all = await reader.readAllTokens(path);
  expect(all!.inputTokens).toBe(300);
  expect(all!.outputTokens).toBe(130);
  expect(all!.totalTokens).toBe(430);
});

test("readNewTokens returns null for nonexistent file", async () => {
  const result = await reader.readNewTokens("/nonexistent/path.jsonl");
  expect(result).toBeNull();
});

test("clear resets state so next read returns full total", async () => {
  const path = await writeTranscript("clear.jsonl", [
    assistantEntry(100, 50),
  ]);

  await reader.readNewTokens(path);
  reader.clear();

  // After clear, should return the full total again
  const tokens = await reader.readNewTokens(path);
  expect(tokens!.inputTokens).toBe(100);
  expect(tokens!.totalTokens).toBe(150);
});

test("readNewTokens skips non-assistant entries", async () => {
  const path = await writeTranscript("mixed.jsonl", [
    userEntry(),
    JSON.stringify({ type: "system", content: "hello" }),
    assistantEntry(100, 50),
    JSON.stringify({ type: "tool_result", content: "done" }),
  ]);

  const tokens = await reader.readNewTokens(path);
  expect(tokens!.inputTokens).toBe(100);
  expect(tokens!.totalTokens).toBe(150);
});

test("readNewData returns model from transcript", async () => {
  const path = await writeTranscript("model.jsonl", [
    assistantEntry(100, 50, 0, 0, "claude-opus-4-6"),
  ]);

  const data = await reader.readNewData(path);
  expect(data).not.toBeNull();
  expect(data!.model).toBe("claude-opus-4-6");
  expect(data!.tokens.inputTokens).toBe(100);
});

test("readAllData returns last seen model", async () => {
  const path = await writeTranscript("model-multi.jsonl", [
    assistantEntry(100, 50, 0, 0, "claude-sonnet-4-6"),
    userEntry(),
    assistantEntry(200, 80, 0, 0, "claude-opus-4-6"),
  ]);

  const data = await reader.readAllData(path);
  expect(data).not.toBeNull();
  expect(data!.model).toBe("claude-opus-4-6");
});

test("readAllData returns undefined model when not present", async () => {
  const path = await writeTranscript("no-model.jsonl", [
    assistantEntry(100, 50),
  ]);

  const data = await reader.readAllData(path);
  expect(data).not.toBeNull();
  expect(data!.model).toBeUndefined();
});
