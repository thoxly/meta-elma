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

test("collectStructuralSnapshot parses nested ELMA namespace/app/page/process payloads", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/pub/v1/scheme/namespaces")) {
      return new Response(
        JSON.stringify({
          result: {
            result: [{ code: "analytics", name: "Analytics" }]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/analytics/pages")) {
      return new Response(
        JSON.stringify([
          {
            __id: "page-1",
            name: "Почта",
            namespace: "analytics",
            code: "_postman",
            hidden: false,
            __createdAt: "2026-04-16T00:00:00.000Z"
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/analytics/processes")) {
      return new Response(
        JSON.stringify([
          {
            namespace: "analytics.requests",
            code: "pomenyat_status",
            __name: "Поменять статус",
            version: 1,
            __updatedAt: "2026-04-16T00:00:00.000Z"
          }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/analytics/apps")) {
      return new Response(
        JSON.stringify([
          { namespace: "analytics", code: "task", name: "Задачи", type: "STANDARD" },
          { namespace: "analytics", code: "vacation", name: "Отпуск", type: "EVENT" }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/analytics/apps/task")) {
      return new Response(
        JSON.stringify({
          success: true,
          application: {
            namespace: "analytics",
            code: "task",
            name: "Задачи",
            elementName: "Задачи",
            type: "STANDARD",
            fields: [
              {
                code: "__name",
                type: "STRING",
                required: true,
                searchable: true,
                indexed: true,
                array: false,
                single: false,
                view: { name: "Название" }
              }
            ],
            permissions: { read: true },
            params: { archived: false }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/analytics/apps/vacation")) {
      return new Response(
        JSON.stringify({
          success: true,
          application: {
            namespace: "analytics",
            code: "vacation",
            name: "Отпуск",
            elementName: "Отпуск",
            type: "EVENT",
            fields: [
              { code: "__status", type: "STATUS", required: true, view: { name: "Статус" } },
              {
                code: "__externalParticipants",
                type: "SYS_COLLECTION",
                required: false,
                data: { namespace: "_clients", code: "_contacts" },
                view: { name: "Внешние участники" }
              }
            ],
            forms: { start: { title: "Старт" } },
            permissions: { read: true },
            params: { hasCalendar: true }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/analytics/apps/vacation/statuses")) {
      return new Response(
        JSON.stringify({
          success: true,
          statusItems: [{ id: 1, code: "opened", name: "Открыто", groupId: "g-1" }],
          groupItems: [{ id: "g-1", code: "__default", name: "" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/groups/list")) {
      return new Response(
        JSON.stringify([{ id: "group-1", name: "Группа 1", usersCount: 10 }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: `Unexpected URL: ${url}` }), { status: 404 });
  }) as typeof fetch;

  try {
    const client = new HttpElmaClient({ baseUrl: "https://tenant.elma365.ru" });
    const payload = await client.collectStructuralSnapshot("https://tenant.elma365.ru", "token");
    assert.equal(payload.namespaces.length, 1);
    assert.equal(payload.namespaces[0]?.namespace, "analytics");
    assert.equal(payload.namespaces[0]?.apps?.length, 2);
    assert.equal(payload.pages[0]?.pageId, "page-1");
    assert.equal(payload.processes[0]?.title, "Поменять статус");
    assert.equal(payload.apps.find((app) => app.code === "task")?.fields[0]?.searchable, true);
    assert.deepEqual(payload.apps.find((app) => app.code === "vacation")?.forms, { start: { title: "Старт" } });
    assert.deepEqual(payload.apps.find((app) => app.code === "vacation")?.statuses, {
      statusItems: [{ id: 1, code: "opened", name: "Открыто", groupId: "g-1" }],
      groupItems: [{ id: "g-1", code: "__default", name: "" }]
    });
    assert.equal(payload.relationHints[0]?.to, "_clients._contacts");
    assert.equal(payload.stats?.statusEnabledApps, 1);
    assert.equal(payload.groups[0]?.raw?.usersCount, 10);
    assert.equal(calls.some((url) => url.endsWith("/pub/v1/scheme/namespaces/analytics/apps/vacation/statuses")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collectStructuralSnapshot continues when one app schema fails with 429", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/pub/v1/scheme/namespaces")) {
      return new Response(JSON.stringify({ result: { result: [{ code: "service_desk", name: "Service Desk" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/service_desk/apps")) {
      return new Response(
        JSON.stringify([
          { namespace: "service_desk", code: "ok_app", name: "OK app", type: "STANDARD" },
          { namespace: "service_desk", code: "rfc", name: "RFC", type: "STANDARD" }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/service_desk/pages") || url.endsWith("/pub/v1/scheme/namespaces/service_desk/processes")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/service_desk/apps/ok_app")) {
      return new Response(
        JSON.stringify({
          success: true,
          application: { code: "ok_app", namespace: "service_desk", name: "OK app", fields: [{ code: "__name", type: "STRING", required: true }] }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url.endsWith("/pub/v1/scheme/namespaces/service_desk/apps/rfc")) {
      return new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/plain" } });
    }
    if (url.endsWith("/pub/v1/scheme/groups/list")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: `Unexpected URL: ${url}` }), { status: 404 });
  }) as typeof fetch;

  try {
    const client = new HttpElmaClient({ baseUrl: "https://tenant.elma365.ru", retryCount: 0 });
    const payload = await client.collectStructuralSnapshot("https://tenant.elma365.ru", "token");
    assert.equal(payload.apps.length, 1);
    assert.equal(payload.apps[0]?.code, "ok_app");
    assert.equal(payload.stats?.apps, 1);
    assert.equal(payload.observedRuntimeNotes?.some((note) => note === "app_schema_failed:service_desk.rfc"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
