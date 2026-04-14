import test from "node:test";
import assert from "node:assert/strict";
import { buildCompactPromptContext } from "./index.js";
import type { UserScopedContext } from "@meta-elma/domain";

const context: UserScopedContext = {
  connectionId: "conn-1",
  sourceUserId: "user-1",
  sourceInstanceId: "instance-1",
  fetchedAt: "2026-04-13T00:00:00.000Z",
  user: { userId: "user-1", fullName: "John Doe" },
  namespaces: [{ namespace: "crm", title: "CRM" }],
  apps: [{ namespace: "crm", code: "deals", title: "Deals" }],
  appSchemas: [],
  pages: [],
  processes: [{ namespace: "crm", code: "approve", title: "Approve" }],
  groups: [],
  roleSubjects: []
};

test("buildCompactPromptContext creates deterministic compact result", () => {
  const first = buildCompactPromptContext(context);
  const second = buildCompactPromptContext(context);
  assert.deepEqual(first, second);
});

test("buildCompactPromptContext includes limitation note about business data", () => {
  const compact = buildCompactPromptContext(context);
  assert.equal(
    compact.knownLimitations.some((item) => item.includes("No business item content")),
    true
  );
});
