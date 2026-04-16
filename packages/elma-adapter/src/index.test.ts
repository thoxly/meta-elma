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

test("validateCredential uses provided connection baseUrl", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response(JSON.stringify([{ id: "u2" }]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const client = new HttpElmaClient({ baseUrl: "https://default.example.test" });
    const result = await client.validateCredential("https://custom-tenant.elma365.ru", "token");
    assert.equal(result.ok, true);
    assert.equal(capturedUrl.startsWith("https://custom-tenant.elma365.ru"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
