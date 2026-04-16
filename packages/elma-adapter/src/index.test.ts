import test from "node:test";
import assert from "node:assert/strict";
import { HttpElmaClient } from "./index.js";

test("validateCredential returns ok on successful user list call", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([{ id: "u1" }]), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

  try {
    const client = new HttpElmaClient({ baseUrl: "https://example.test" });
    const result = await client.validateCredential("https://example.test", "token");
    assert.equal(result.ok, true);
    assert.equal(result.externalUserId, "u1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
