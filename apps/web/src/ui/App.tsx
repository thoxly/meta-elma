import { useState } from "react";

const ENV_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
const API_BASE_URL =
  ENV_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" ? "/api" : "http://localhost:8080");

type UserScopedContext = {
  fetchedAt: string;
  namespaces: Array<{ namespace: string; title: string }>;
  apps: Array<{ namespace: string; code: string; title: string }>;
  processes: Array<{ namespace: string; code: string; title: string }>;
  groups: Array<{ groupId: string; title: string }>;
  appSchemas: Array<{
    namespace: string;
    appCode: string;
    fields: Array<{ code: string; title: string; type: string; required: boolean }>;
  }>;
};

export function App() {
  const [ownerUserId, setOwnerUserId] = useState("user-1");
  const [connectionId, setConnectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [traceId, setTraceId] = useState("");
  const [context, setContext] = useState<UserScopedContext | null>(null);
  const [contextError, setContextError] = useState("");
  const [isContextLoading, setIsContextLoading] = useState(false);

  async function createConnection() {
    const res = await fetch(`${API_BASE_URL}/connections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerUserId,
        sourceInstanceId: "elma-instance-1",
        sourceUserId: ownerUserId,
        displayName: "Primary ELMA Connection"
      })
    });
    const json = await res.json();
    setConnectionId(json.connectionId);
  }

  async function refreshContext() {
    if (!connectionId) return;
    await fetch(`${API_BASE_URL}/context/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId })
    });
  }

  async function loadContextDetails() {
    if (!connectionId) return;
    setIsContextLoading(true);
    setContextError("");
    try {
      const res = await fetch(`${API_BASE_URL}/debug/context?connectionId=${encodeURIComponent(connectionId)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as UserScopedContext;
      setContext(json);
    } catch (error) {
      setContext(null);
      setContextError(error instanceof Error ? error.message : "Failed to load context");
    } finally {
      setIsContextLoading(false);
    }
  }

  async function askQuestion() {
    if (!connectionId || !question) return;
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerUserId,
        connectionId,
        mode: "ask_system",
        question
      })
    });
    const json = await res.json();
    setAnswer(json.answer);
    setTraceId(json.traceId);
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Meta ELMA GPT v1</h1>
      <p>Usable prototype UI for user-scoped ELMA context chat.</p>

      <section>
        <h2>Connection</h2>
        <input value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} />
        <button onClick={createConnection}>Create connection</button>
        <p>Connection ID: {connectionId || "none"}</p>
      </section>

      <section>
        <h2>Context Summary</h2>
        <button onClick={refreshContext} disabled={!connectionId}>
          Manual refresh context
        </button>
        <button onClick={loadContextDetails} disabled={!connectionId || isContextLoading}>
          {isContextLoading ? "Loading context..." : "Load context details"}
        </button>
        {contextError ? <p style={{ color: "crimson" }}>Context error: {contextError}</p> : null}
        {context ? (
          <div style={{ marginTop: 12 }}>
            <p>Fetched at: {context.fetchedAt}</p>
            <p>
              Namespaces: {context.namespaces.length} | Apps: {context.apps.length} | Processes:{" "}
              {context.processes.length} | Groups: {context.groups.length} | Schemas: {context.appSchemas.length}
            </p>

            <h3>Namespaces</h3>
            <pre>{JSON.stringify(context.namespaces.slice(0, 20), null, 2)}</pre>

            <h3>Apps</h3>
            <pre>{JSON.stringify(context.apps.slice(0, 50), null, 2)}</pre>

            <h3>Processes</h3>
            <pre>{JSON.stringify(context.processes.slice(0, 50), null, 2)}</pre>

            <h3>Groups</h3>
            <pre>{JSON.stringify(context.groups.slice(0, 50), null, 2)}</pre>

            <h3>App Schemas (first 10, fields only)</h3>
            <pre>
              {JSON.stringify(
                context.appSchemas.slice(0, 10).map((schema) => ({
                  namespace: schema.namespace,
                  appCode: schema.appCode,
                  fieldCount: schema.fields.length,
                  fields: schema.fields.slice(0, 20)
                })),
                null,
                2
              )}
            </pre>
          </div>
        ) : null}
      </section>

      <section>
        <h2>Chat</h2>
        <textarea
          rows={4}
          style={{ width: "100%" }}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your ELMA system"
        />
        <button onClick={askQuestion} disabled={!connectionId || !question}>
          Send
        </button>
        <pre>{answer}</pre>
      </section>

      <section>
        <h2>Debug / Trace view</h2>
        <p>Last trace ID: {traceId || "none"}</p>
      </section>
    </main>
  );
}
