import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

function AuthPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [isRegister, setIsRegister] = useState(true);
  const [companyName, setCompanyName] = useState("Demo Company");
  const [fullName, setFullName] = useState("Demo User");
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  async function submit() {
    try {
      const result = isRegister
        ? await api.register({ companyName, fullName, email, password })
        : await api.login({ email, password });
      setAuth(result);
      navigate("/app/connections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Meta ELMA MVP</h1>
      <h2>{isRegister ? "Register company" : "Login"}</h2>
      {isRegister && <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />}
      {isRegister && <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />}
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
      <button onClick={submit}>{isRegister ? "Create account" : "Login"}</button>
      <button onClick={() => setIsRegister((v) => !v)}>{isRegister ? "Use login" : "Use register"}</button>
      {error && <p>{error}</p>}
    </main>
  );
}

function AppLayout() {
  const { auth, logout } = useAuth();
  if (!auth) return <Navigate to="/" replace />;
  return (
    <main style={{ maxWidth: 960, margin: "24px auto", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link to="/app/connections">Connections</Link>
        <Link to="/app/chat">Chat</Link>
        <button onClick={logout}>Logout</button>
      </header>
      <Routes>
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="connections/:id/semantic" element={<SemanticPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="trace/:id" element={<TracePage />} />
      </Routes>
    </main>
  );
}

function ConnectionsPage() {
  const { auth } = useAuth();
  const [items, setItems] = useState<Array<{ connectionId: string; displayName: string; baseUrl: string }>>([]);
  const [displayName, setDisplayName] = useState("Primary ELMA");
  const [baseUrl, setBaseUrl] = useState("https://api.elma365.com");
  const [elmaToken, setElmaToken] = useState("");
  const [llmToken, setLlmToken] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function load() {
    if (!auth) return;
    const response = await api.listConnections(auth.tokens.accessToken);
    setItems(response.items);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createConnection() {
    if (!auth) return;
    const created = await api.createConnection(auth.tokens.accessToken, { displayName, baseUrl });
    setSelectedConnectionId(created.connectionId);
    await load();
  }

  async function saveCredentials() {
    if (!auth || !selectedConnectionId) return;
    await api.upsertCredentials(auth.tokens.accessToken, selectedConnectionId, { elmaToken, llmToken });
    setMessage("Credentials saved");
  }

  async function refreshSnapshot() {
    if (!auth || !selectedConnectionId) return;
    const result = await api.refreshSnapshot(auth.tokens.accessToken, selectedConnectionId);
    setMessage(`Snapshot version ${result.version} refreshed`);
  }

  async function generateSemantic() {
    if (!auth || !selectedConnectionId) return;
    await api.generateSemantic(auth.tokens.accessToken, selectedConnectionId);
    navigate(`/app/connections/${selectedConnectionId}/semantic`);
  }

  return (
    <section>
      <h2>Connections</h2>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Connection name" />
      <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="ELMA base URL" />
      <button onClick={createConnection}>Create connection</button>
      <ul>
        {items.map((item) => (
          <li key={item.connectionId}>
            <button onClick={() => setSelectedConnectionId(item.connectionId)}>
              {item.displayName} ({item.connectionId})
            </button>
          </li>
        ))}
      </ul>
      <h3>Credentials</h3>
      <input value={elmaToken} onChange={(e) => setElmaToken(e.target.value)} placeholder="ELMA token" />
      <input value={llmToken} onChange={(e) => setLlmToken(e.target.value)} placeholder="LLM token" />
      <button onClick={saveCredentials} disabled={!selectedConnectionId}>
        Save credentials
      </button>
      <button onClick={refreshSnapshot} disabled={!selectedConnectionId}>
        Refresh snapshot
      </button>
      <button onClick={generateSemantic} disabled={!selectedConnectionId}>
        Generate semantic
      </button>
      {message && <p>{message}</p>}
    </section>
  );
}

function SemanticPage() {
  const { auth } = useAuth();
  const { id } = useParams();
  const [jsonText, setJsonText] = useState("{}");
  const [message, setMessage] = useState("");

  async function load() {
    if (!auth || !id) return;
    const mapping = await api.getSemantic(auth.tokens.accessToken, id);
    setJsonText(JSON.stringify(mapping.draft, null, 2));
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function save() {
    if (!auth || !id) return;
    await api.saveSemantic(auth.tokens.accessToken, id, JSON.parse(jsonText));
    setMessage("Semantic mapping saved");
  }

  return (
    <section>
      <h2>Semantic mapping editor</h2>
      <textarea rows={24} style={{ width: "100%" }} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
      <button onClick={save}>Save mapping</button>
      {message && <p>{message}</p>}
    </section>
  );
}

function ChatPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Array<{ connectionId: string; displayName: string; baseUrl: string }>>([]);
  const [connectionId, setConnectionId] = useState("");
  const [entity, setEntity] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | undefined>();

  useEffect(() => {
    if (!auth) return;
    void api.listConnections(auth.tokens.accessToken).then((res) => {
      setConnections(res.items);
      setConnectionId(res.items[0]?.connectionId ?? "");
    });
  }, []);

  async function ask() {
    if (!auth || !connectionId) return;
    const result = await api.askChat(auth.tokens.accessToken, { connectionId, question, entity: entity || undefined, chatSessionId });
    setAnswer(result.answer);
    setChatSessionId(result.chatSessionId);
    navigate(`/app/trace/${result.traceId}`);
  }

  return (
    <section>
      <h2>Chat</h2>
      <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
        {connections.map((item) => (
          <option key={item.connectionId} value={item.connectionId}>
            {item.displayName}
          </option>
        ))}
      </select>
      <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Entity (optional)" />
      <textarea rows={6} style={{ width: "100%" }} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button onClick={ask}>Ask</button>
      <pre>{answer}</pre>
    </section>
  );
}

function TracePage() {
  const { auth } = useAuth();
  const { id } = useParams();
  const [trace, setTrace] = useState("{}");

  useEffect(() => {
    if (!auth || !id) return;
    void api.getTrace(auth.tokens.accessToken, id).then((result) => setTrace(JSON.stringify(result, null, 2)));
  }, [id]);

  return (
    <section>
      <h2>Trace</h2>
      <pre>{trace}</pre>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route path="/app/*" element={<AppLayout />} />
    </Routes>
  );
}
