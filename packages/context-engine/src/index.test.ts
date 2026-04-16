import test from "node:test";
import assert from "node:assert/strict";
import { buildCompactPromptContext } from "./index.js";
import type { Snapshot } from "@meta-elma/domain";

const snapshot: Snapshot = {
  snapshotId: "snap-1",
  companyId: "comp-1",
  connectionId: "conn-1",
  version: 1,
  schemaHash: "abc",
  status: "ready",
  createdByUserId: "user-1",
  createdAt: "2026-04-13T00:00:00.000Z",
  payload: {
    namespaces: [{ namespace: "crm", title: "CRM" }],
    apps: [{ namespace: "crm", code: "deals", title: "Deals", fields: [], statuses: [] }],
    pages: [],
    processes: [{ namespace: "crm", code: "approve", title: "Approve" }],
    groups: [],
    relationHints: []
  }
};

test("buildCompactPromptContext creates deterministic compact result", () => {
  const first = buildCompactPromptContext(snapshot);
  const second = buildCompactPromptContext(snapshot);
  assert.deepEqual(first, second);
});

test("buildCompactPromptContext includes app overview", () => {
  const compact = buildCompactPromptContext(snapshot);
  assert.equal(compact.appOverview[0]?.key, "crm.deals");
});
