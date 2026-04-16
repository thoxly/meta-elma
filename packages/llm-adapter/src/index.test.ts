import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIResponsesProvider } from "./index.js";

test("generateAnswer returns warning when llm token missing", async () => {
  const provider = new OpenAIResponsesProvider();
  const result = await provider.generateAnswer(
    {
      question: "test",
      compactContext: { snapshotId: "s1", summary: "summary", appOverview: [], processOverview: [] },
      liveFacts: []
    },
    ""
  );
  assert.equal(result.answer.includes("LLM token is missing"), true);
});

test("generateSemanticDraft maps apps to semantic entities", async () => {
  const provider = new OpenAIResponsesProvider();
  const result = await provider.generateSemanticDraft(
    {
      snapshot: {
        namespaces: [],
        apps: [{ namespace: "crm", code: "deals", title: "Deals", fields: [], statuses: [] }],
        pages: [],
        processes: [],
        groups: [],
        relationHints: []
      }
    },
    ""
  );
  assert.equal(result.entities.length, 1);
});
