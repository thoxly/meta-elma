import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { CircleCheck, Database, Link2, LogOut, MessageSquare, Search, Workflow } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";

type Connection = { connectionId: string; displayName: string; baseUrl: string };

function PageHeader(props: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl">{props.title}</h1>
        <p className="mt-1 text-sm text-muted">{props.description}</p>
      </div>
      {props.action}
    </div>
  );
}

function Panel(props: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-surface p-5 shadow-panel">
      {props.title && <h2 className="text-base">{props.title}</h2>}
      {props.description && <p className="mt-1 text-sm text-muted">{props.description}</p>}
      <div className={props.title ? "mt-4" : ""}>{props.children}</div>
    </section>
  );
}

function EmptyState(props: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-slate-50 p-6 text-center">
      <p className="font-medium text-foreground">{props.title}</p>
      <p className="mt-1 text-sm text-muted">{props.description}</p>
    </div>
  );
}

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
    <main className="mx-auto mt-14 max-w-md px-4">
      <Panel title="Meta ELMA" description="Internal assistant for ELMA365">
        <div className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          {isRegister ? "Create company workspace" : "Sign in to workspace"}
        </div>
        <div className="grid gap-3">
          {isRegister && (
            <input className="field" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
          )}
          {isRegister && <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />}
          <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={submit}>
            {isRegister ? "Create account" : "Login"}
          </button>
          <button className="btn-secondary" onClick={() => setIsRegister((v) => !v)}>
            {isRegister ? "Use login" : "Use register"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Panel>
    </main>
  );
}

function AppLayout() {
  const { auth, logout } = useAuth();
  const location = useLocation();
  if (!auth) return <Navigate to="/" replace />;

  const navItems = [
    { to: "/app/connections", label: "Connections", icon: Link2 },
    { to: "/app/chat", label: "Chat", icon: MessageSquare }
  ];

  return (
    <main className="min-h-screen">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border bg-surface p-3 shadow-panel">
          <div className="mb-4 border-b pb-3">
            <p className="text-sm font-semibold">Meta ELMA</p>
            <p className="mt-1 text-xs text-muted">{auth.user.companyId}</p>
          </div>
          <nav className="grid gap-1">
            {navItems.map((item) => {
              const ActiveIcon = item.icon;
              const isActive = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-slate-100 hover:text-foreground"
                  }`}
                >
                  <ActiveIcon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 border-t pt-3">
            <button className="btn-ghost w-full justify-start gap-2" onClick={logout}>
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </aside>
        <div>
          <Routes>
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="connections/:id/semantic" element={<SemanticPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="trace/:id" element={<TracePage />} />
          </Routes>
        </div>
      </div>
    </main>
  );
}

function ConnectionsPage() {
  const { auth } = useAuth();
  const [items, setItems] = useState<Array<Connection>>([]);
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
      <PageHeader
        title="Connections"
        description="Manage ELMA integrations, credentials, and semantic model generation."
        action={
          <button className="btn-secondary gap-2">
            <Database className="size-4" />
            {items.length} total
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="New connection" description="Create a shared ELMA endpoint for your company.">
          <div className="grid gap-3">
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Connection name" />
            <input className="field" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="ELMA base URL" />
            <div>
              <button className="btn-primary" onClick={createConnection}>
                Create connection
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Connection list" description="Pick a connection to update credentials and run workflows.">
          {items.length === 0 ? (
            <EmptyState title="No connections yet" description="Create your first connection to start setup." />
          ) : (
            <div className="grid gap-2">
              {items.map((item) => {
                const isSelected = selectedConnectionId === item.connectionId;
                return (
                  <button
                    key={item.connectionId}
                    onClick={() => setSelectedConnectionId(item.connectionId)}
                    className={`focus-ring rounded-lg border px-3 py-2 text-left transition ${
                      isSelected ? "border-accent bg-accent-soft" : "hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-medium">{item.displayName}</p>
                    <p className="text-xs text-muted">{item.baseUrl}</p>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Credentials" description="Credentials are stored per user and per connection.">
          <div className="grid gap-3">
            <input className="field" value={elmaToken} onChange={(e) => setElmaToken(e.target.value)} placeholder="ELMA token" />
            <input className="field" value={llmToken} onChange={(e) => setLlmToken(e.target.value)} placeholder="LLM token" />
            <div>
              <button className="btn-primary" onClick={saveCredentials} disabled={!selectedConnectionId}>
                Save credentials
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Workflows" description="Refresh structures and generate semantic mapping.">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary gap-2" onClick={refreshSnapshot} disabled={!selectedConnectionId}>
              <Search className="size-4" />
              Refresh snapshot
            </button>
            <button className="btn-secondary gap-2" onClick={generateSemantic} disabled={!selectedConnectionId}>
              <Workflow className="size-4" />
              Generate semantic
            </button>
          </div>
        </Panel>
      </div>
      {message && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm text-success shadow-panel">
          <CircleCheck className="size-4" />
          {message}
        </div>
      )}
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
      <PageHeader title="Semantic mapping" description="Review generated entities and relations, then save approved draft." />
      <Panel>
        <textarea
          rows={24}
          className="focus-ring w-full rounded-lg border bg-surface p-3 font-mono text-sm"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-2">
          <button className="btn-primary" onClick={save}>
            Save mapping
          </button>
          {message && <p className="text-sm text-success">{message}</p>}
        </div>
      </Panel>
    </section>
  );
}

function ChatPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Array<Connection>>([]);
  const [connectionId, setConnectionId] = useState("");
  const [entity, setEntity] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | undefined>();
  const activeConnection = useMemo(() => connections.find((item) => item.connectionId === connectionId), [connections, connectionId]);

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
      <PageHeader title="Chat" description="Ask grounded questions and inspect trace for each answer." />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Panel title="Query setup" description="Select connection and optional entity filter.">
          <div className="grid gap-3">
            <select className="field" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
              {connections.map((item) => (
                <option key={item.connectionId} value={item.connectionId}>
                  {item.displayName}
                </option>
              ))}
            </select>
            <input className="field" value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Entity (optional)" />
            <p className="text-xs text-muted">{activeConnection ? activeConnection.baseUrl : "No connection selected"}</p>
          </div>
        </Panel>
        <Panel title="Question" description="Use concise task-focused prompts for better traceability.">
          <textarea
            rows={7}
            className="focus-ring w-full rounded-lg border bg-surface p-3 text-sm"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What data do we have for ..."
          />
          <div className="mt-3">
            <button className="btn-primary" onClick={ask}>
              Ask
            </button>
          </div>
        </Panel>
      </div>
      <Panel title="Answer" description="Latest model response for the current session.">
        {answer ? <pre className="overflow-auto whitespace-pre-wrap text-sm text-foreground">{answer}</pre> : <EmptyState title="No answer yet" description="Submit a question to see response and trace link." />}
      </Panel>
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
      <PageHeader title="Trace" description="Raw trace payload for troubleshooting and reproducibility." />
      <Panel>
        <pre className="overflow-auto rounded-lg border bg-slate-50 p-3 text-xs">{trace}</pre>
      </Panel>
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
