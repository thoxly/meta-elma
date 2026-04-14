import test from "node:test";
import assert from "node:assert/strict";
import { StaticPromptPolicy } from "./index.js";

test("StaticPromptPolicy for ask_system contains no-hallucination rule", () => {
  const policy = new StaticPromptPolicy();
  const prompt = policy.buildSystemPrompt("ask_system");
  assert.equal(prompt.includes("Do not invent ELMA features"), true);
});

test("StaticPromptPolicy for context_inspect focuses on gaps", () => {
  const policy = new StaticPromptPolicy();
  const prompt = policy.buildSystemPrompt("context_inspect");
  assert.equal(prompt.includes("gaps"), true);
});
