import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export function App() {
  const [ownerUserId, setOwnerUserId] = useState("user-1");
  const [connectionId, setConnectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [traceId, setTraceId] = useState("");

  async function createConnection() {
    const res = await fetch(`${API_URL}/connections`, {
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
    await fetch(`${API_URL}/context/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId })
    });
  }

  async function askQuestion() {
    if (!connectionId || !question) return;
    const res = await fetch(`${API_URL}/chat`, {
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
