import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decodeProjectPath } from "./history";

// Root temp directory — mkdtemp uses alphanumeric suffix, no hyphens.
let root: string;

/** Encode an absolute path the same way Claude Code does. */
function encode(absPath: string): string {
  return absPath.replace(/\/_/g, "--").replace(/\//g, "-");
}

beforeAll(async () => {
  root = join(tmpdir(), "cvhisttest" + Date.now());
  await mkdir(join(root, "work", "my-project"), { recursive: true });
  await mkdir(join(root, "work", "other"), { recursive: true });
  await mkdir(join(root, "_Projects", "claude-visual"), { recursive: true });
  await mkdir(join(root, "_Projects", "no-hyphens"), { recursive: true });
  await mkdir(join(root, "simple"), { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test("decodes a simple path with no hyphens in any component", async () => {
  const encoded = encode(join(root, "simple"));
  expect(await decodeProjectPath(encoded)).toBe(join(root, "simple"));
});

test("decodes a path where the project directory contains a hyphen", async () => {
  const expected = join(root, "work", "my-project");
  const encoded = encode(expected);
  expect(await decodeProjectPath(encoded)).toBe(expected);
});

test("decodes a path with an _-prefixed intermediate directory and hyphens in the project name", async () => {
  const expected = join(root, "_Projects", "claude-visual");
  const encoded = encode(expected);
  expect(await decodeProjectPath(encoded)).toBe(expected);
});

test("decodes a path with an _-prefixed directory and no hyphens in the project name", async () => {
  const expected = join(root, "_Projects", "no-hyphens");
  const encoded = encode(expected);
  expect(await decodeProjectPath(encoded)).toBe(expected);
});

test("falls back to naive decode when path does not exist on disk", async () => {
  const encoded = "-nonexistent-path-that-does-not-exist";
  // Should not throw; returns naive decode
  const result = await decodeProjectPath(encoded);
  expect(typeof result).toBe("string");
  expect(result.length).toBeGreaterThan(0);
});

test("prefers existing path over naive decode", async () => {
  // The naively-decoded path /root/work/my/project does not exist,
  // but /root/work/my-project does — ensure we return the correct one.
  const expected = join(root, "work", "my-project");
  const encoded = encode(expected);
  const naive = encoded.replace(/--/g, "/_").replace(/-/g, "/").replace(/^\//, "/");
  // Confirm naive would be wrong (contains /my/project instead of /my-project)
  expect(naive).not.toBe(expected);
  expect(await decodeProjectPath(encoded)).toBe(expected);
});
