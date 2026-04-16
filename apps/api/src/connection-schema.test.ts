import test from "node:test";
import assert from "node:assert/strict";
import { isStructuralSnapshotMeaningful, toConnectionSchemaResponse } from "./connection-schema.js";

function makeSnapshot(payloadOverrides: Record<string, unknown>) {
  return {
    snapshotId: "snap-1",
    companyId: "comp-1",
    connectionId: "conn-1",
    version: 2,
    schemaHash: "hash",
    status: "ready",
    createdByUserId: "user-1",
    createdAt: "2026-04-16T00:00:00.000Z",
    payload: {
      namespaces: [{ namespace: "analytics", title: "Analytics" }],
      apps: [{ namespace: "analytics", code: "task", title: "Задачи", fields: [{ code: "__name", title: "Название", type: "STRING", required: true }], statuses: null }],
      pages: [],
      processes: [],
      groups: [],
      relationHints: [],
      ...payloadOverrides
    }
  };
}

test("isStructuralSnapshotMeaningful is false for empty snapshot", () => {
  const snapshot = makeSnapshot({ namespaces: [], apps: [] });
  assert.equal(isStructuralSnapshotMeaningful(snapshot.payload), false);
});

test("isStructuralSnapshotMeaningful is true for non-empty snapshot", () => {
  const snapshot = makeSnapshot({});
  assert.equal(isStructuralSnapshotMeaningful(snapshot.payload), true);
});

test("toConnectionSchemaResponse returns non-empty payload after refresh result", () => {
  const snapshot = makeSnapshot({});
  const response = toConnectionSchemaResponse(snapshot);
  assert.equal(response.snapshotId, "snap-1");
  assert.equal(response.payload.apps.length > 0, true);
  assert.equal(response.payload.apps[0]?.fields.length > 0, true);
});
