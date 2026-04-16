import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { CircleAlert, CircleCheck, Database, Link2, LoaderCircle, LogOut, MessageSquare, Search, Trash2, Workflow } from "lucide-react";
import { api, type ConnectionState } from "../api";
import { useAuth } from "../auth";

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

  function onAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <main className="mx-auto mt-14 max-w-md px-4">
      <Panel title="Meta ELMA" description="Internal assistant for ELMA365">
        <div className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          {isRegister ? "Create company workspace" : "Sign in to workspace"}
        </div>
        <form onSubmit={onAuthSubmit}>
          <div className="grid gap-3">
            {isRegister && (
              <input
                className="field"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name"
                autoComplete="organization"
              />
            )}
            {isRegister && (
              <input
                className="field"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
              />
            )}
            <input
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete={isRegister ? "email" : "username"}
            />
            <input
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1" type="submit">
              {isRegister ? "Create account" : "Login"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setIsRegister((v) => !v)}>
              {isRegister ? "Use login" : "Use register"}
            </button>
          </div>
        </form>
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
  const [items, setItems] = useState<ConnectionState[]>([]);
  const [displayName, setDisplayName] = useState("ELMA Production");
  const [baseUrl, setBaseUrl] = useState("https://example.elma365.ru/");
  const [elmaToken, setElmaToken] = useState("");
  const [llmToken, setLlmToken] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [activeJobId, setActiveJobId] = useState("");
  const navigate = useNavigate();

  const selected = useMemo(
    () => items.find((item) => item.connection.connectionId === selectedConnectionId) ?? null,
    [items, selectedConnectionId]
  );

  function statusLabel(status: ConnectionState["status"]): string {
    const labels: Record<ConnectionState["status"], string> = {
      requires_elma_token: "Needs ELMA token",
      elma_invalid: "ELMA token invalid",
      schema_missing: "Schema not loaded",
      schema_syncing: "Schema syncing",
      llm_missing: "LLM not configured",
      semantic_missing: "Semantic not generated",
      semantic_generating: "Semantic generating",
      ready_for_chat: "Ready for chat",
      requires_action: "Requires action"
    };
    return labels[status];
  }

  async function load() {
    if (!auth) return;
    const response = await api.listConnections(auth.tokens.accessToken);
    setItems(response.items);
    if (!selectedConnectionId && response.items[0]) {
      setSelectedConnectionId(response.items[0].connection.connectionId);
    }
  }

  useEffect(() => {
    void load();
  }, [auth]);

  async function createConnection() {
    if (!auth) return;
    setError("");
    setLoadingAction("create");
    try {
      const created = await api.createConnection(auth.tokens.accessToken, { displayName, baseUrl, elmaToken: elmaToken.trim() });
      setSelectedConnectionId(created.connectionId);
      setMessage("Connection created and ELMA access verified");
      setElmaToken("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setLoadingAction("");
    }
  }

  async function saveElmaCredentials() {
    if (!auth || !selectedConnectionId) return;
    setError("");
    setLoadingAction("save_elma");
    await api.saveElmaCredentials(auth.tokens.accessToken, selectedConnectionId, { elmaToken });
    setMessage("ELMA token saved");
    setLoadingAction("");
    await load();
  }

  async function validateElmaCredentials() {
    if (!auth || !selectedConnectionId) return;
    setError("");
    setLoadingAction("validate_elma");
    try {
      // If user entered a token but didn't click Save yet,
      // persist it first so validation uses the latest value.
      if (elmaToken.trim().length > 0) {
        await api.saveElmaCredentials(auth.tokens.accessToken, selectedConnectionId, { elmaToken: elmaToken.trim() });
      }
      await api.validateElmaCredentials(auth.tokens.accessToken, selectedConnectionId);
      setMessage("ELMA token validated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    }
    setLoadingAction("");
    await load();
  }

  async function deleteConnection(connectionId = selectedConnectionId) {
    if (!auth || !connectionId) return;
    const confirmed = window.confirm("Delete this connection and all lifecycle data (credentials, jobs, snapshots, semantic, chat history)?");
    if (!confirmed) return;
    setError("");
    setLoadingAction("delete_connection");
    try {
      await api.deleteConnection(auth.tokens.accessToken, connectionId);
      setMessage("Connection deleted");
      const deletedId = connectionId;
      await load();
      setSelectedConnectionId((current) => (current === deletedId ? "" : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete connection");
    } finally {
      setLoadingAction("");
    }
  }

  async function saveLlmToken() {
    if (!auth || !selectedConnectionId) return;
    setError("");
    setLoadingAction("save_llm");
    await api.saveLlmSettings(auth.tokens.accessToken, selectedConnectionId, { llmToken });
    setMessage("LLM token saved");
    setLoadingAction("");
    await load();
  }

  async function startJob(type: "refresh_schema" | "generate_semantic") {
    if (!auth || !selectedConnectionId) return;
    setError("");
    setLoadingAction(type);
    const job = await api.createJob(auth.tokens.accessToken, selectedConnectionId, { type });
    setActiveJobId(job.jobId);
    setMessage(type === "refresh_schema" ? "Schema refresh started" : "Semantic generation started");
    setLoadingAction("");
    await load();
  }

  useEffect(() => {
    if (!auth || !activeJobId) return;
    const pollId = window.setInterval(async () => {
      const job = await api.getJob(auth.tokens.accessToken, activeJobId);
      if (job.status === "failed" || job.status === "succeeded" || job.status === "canceled") {
        window.clearInterval(pollId);
        setActiveJobId("");
        if (job.status === "failed") {
          setError(job.error ?? "Background job failed");
        } else if (job.status === "succeeded") {
          setMessage("Background job completed");
        }
        await load();
      }
    }, 1200);
    return () => window.clearInterval(pollId);
  }, [auth, activeJobId]);

  return (
    <section>
      <PageHeader
        title="Connections"
        description="Control ELMA connection lifecycle: connection, schema sync, LLM setup, semantic readiness."
        action={
          <button className="btn-secondary gap-2">
            <Database className="size-4" />
            {items.length} total
          </button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Create ELMA connection" description="Add URL + ELMA token and verify access immediately during creation.">
          <div className="grid gap-3">
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Connection name" />
            <input className="field" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-elma-domain.ru/" />
            <input className="field" value={elmaToken} onChange={(e) => setElmaToken(e.target.value)} placeholder="ELMA token (required)" />
            <p className="text-xs text-muted">Base URL accepts standard `*.elma365.ru` and custom ELMA domains.</p>
            <div>
              <button className="btn-primary" onClick={createConnection} disabled={loadingAction === "create" || !elmaToken.trim()}>
                Create connection
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Connection lifecycle" description="Observe current state and what action is needed next.">
          {items.length === 0 ? (
            <EmptyState title="No connections yet" description="Create your first ELMA connection to start setup." />
          ) : (
            <div className="grid gap-2">
              {items.map((item) => {
                const isSelected = selectedConnectionId === item.connection.connectionId;
                return (
                  <div
                    key={item.connection.connectionId}
                    className={`focus-ring rounded-lg border px-3 py-2 transition ${
                      isSelected ? "border-accent bg-accent-soft" : "hover:bg-slate-50"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedConnectionId(item.connection.connectionId)}
                      className="w-full text-left"
                    >
                      <p className="text-sm font-medium">{item.connection.displayName}</p>
                      <p className="text-xs text-muted">{item.connection.baseUrl}</p>
                      <p className="mt-1 text-xs text-accent">{statusLabel(item.status)}</p>
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="btn-secondary gap-2 text-xs"
                        onClick={() => navigate(`/app/connections/${item.connection.connectionId}/semantic`)}
                      >
                        <Link2 className="size-3.5" />
                        Open semantic
                      </button>
                      <button
                        className="btn-secondary gap-2 text-xs text-danger"
                        onClick={() => void deleteConnection(item.connection.connectionId)}
                        disabled={loadingAction === "delete_connection"}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <Panel title="ELMA connection" description="Use this if you need to rotate token for an existing connection.">
          <div className="grid gap-3">
            <input className="field" value={elmaToken} onChange={(e) => setElmaToken(e.target.value)} placeholder="ELMA token (required)" />
            <div>
              <button className="btn-primary" onClick={saveElmaCredentials} disabled={!selectedConnectionId || loadingAction === "save_elma"}>
                Save ELMA token
              </button>
              <button className="btn-secondary ml-2" onClick={validateElmaCredentials} disabled={!selectedConnectionId || loadingAction === "validate_elma"}>
                Validate token
              </button>
            </div>
            {selected && <p className="text-xs text-muted">Current state: {statusLabel(selected.status)}</p>}
          </div>
        </Panel>

        <Panel title="Schema" description="Refresh snapshot from ELMA after credential is valid.">
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary gap-2"
              onClick={() => startJob("refresh_schema")}
              disabled={!selectedConnectionId || !selected?.capabilities.canRefreshSchema || loadingAction === "refresh_schema"}
            >
              <Search className="size-4" />
              Refresh schema
            </button>
            <p className="text-xs text-muted">
              {selected?.latest.snapshotVersion ? `Snapshot v${selected.latest.snapshotVersion}` : "No snapshot available"}
            </p>
          </div>
        </Panel>

        <Panel title="LLM and semantic" description="Optional layer over ELMA. Required only for semantic generation and chat.">
          <div className="grid gap-2">
            <input className="field" value={llmToken} onChange={(e) => setLlmToken(e.target.value)} placeholder="LLM token (optional)" />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={saveLlmToken} disabled={!selectedConnectionId || loadingAction === "save_llm"}>
                Save LLM token
              </button>
              <button
                className="btn-secondary gap-2"
                onClick={() => startJob("generate_semantic")}
                disabled={!selectedConnectionId || !selected?.capabilities.canGenerateSemantic || loadingAction === "generate_semantic"}
              >
                <Workflow className="size-4" />
                Generate semantic
              </button>
            </div>
            <p className={`text-xs ${selected?.capabilities.canChat ? "text-success" : "text-muted"}`}>
              {selected?.capabilities.canChat ? "Chat ready for this connection" : "Complete ELMA + schema + LLM + semantic to unlock chat"}
            </p>
          </div>
        </Panel>
      </div>
      {activeJobId && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm text-muted shadow-panel">
          <LoaderCircle className="size-4 animate-spin" />
          Background job in progress
        </div>
      )}
      {message && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm text-success shadow-panel">
          <CircleCheck className="size-4" />
          {message}
        </div>
      )}
      {error && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm text-danger shadow-panel">
          <CircleAlert className="size-4" />
          {error}
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
  const [connections, setConnections] = useState<Array<{ connectionId: string; displayName: string; baseUrl: string }>>([]);
  const [connectionId, setConnectionId] = useState("");
  const [entity, setEntity] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | undefined>();
  const activeConnection = useMemo(() => connections.find((item) => item.connectionId === connectionId), [connections, connectionId]);

  useEffect(() => {
    if (!auth) return;
    void api.listConnectionsForChat(auth.tokens.accessToken).then((res) => {
      const ready = res.items
        .filter((item) => item.capabilities.canChat)
        .map((item) => ({
          connectionId: item.connection.connectionId,
          displayName: item.connection.displayName,
          baseUrl: item.connection.baseUrl
        }));
      setConnections(ready);
      setConnectionId(ready[0]?.connectionId ?? "");
    });
  }, [auth]);

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
        <Panel title="Query setup" description="Only chat-ready connections are available.">
          <div className="grid gap-3">
            <select className="field" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
              {connections.map((item) => (
                <option key={item.connectionId} value={item.connectionId}>
                  {item.displayName}
                </option>
              ))}
            </select>
            <input className="field" value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Entity (optional)" />
            <p className="text-xs text-muted">{activeConnection ? activeConnection.baseUrl : "No chat-ready connection selected"}</p>
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
            <button className="btn-primary" onClick={ask} disabled={!connectionId}>
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
