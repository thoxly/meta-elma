export type Tokens = { accessToken: string; refreshToken: string };
export type LoginResponse = {
  tokens: Tokens;
  user: { userId: string; companyId: string; email: string; fullName: string };
};

let apiAuthState: LoginResponse | null = null;
let apiAuthStateChangedListener: ((auth: LoginResponse | null) => void) | null = null;

export function setApiAuthState(auth: LoginResponse | null): void {
  apiAuthState = auth;
  apiAuthStateChangedListener?.(auth);
}

export function setApiAuthStateChangedListener(listener: ((auth: LoginResponse | null) => void) | null): void {
  apiAuthStateChangedListener = listener;
}
export type ConnectionLifecycleStatus =
  | "requires_elma_token"
  | "elma_invalid"
  | "schema_missing"
  | "schema_syncing"
  | "llm_missing"
  | "semantic_missing"
  | "semantic_generating"
  | "ready_for_chat"
  | "requires_action";

export type ConnectionState = {
  connection: { connectionId: string; displayName: string; baseUrl: string; system: "elma365" };
  status: ConnectionLifecycleStatus;
  nextActions: string[];
  health: {
    hasElmaToken: boolean;
    hasLlmToken: boolean;
    credentialsValid: boolean;
    snapshotReady: boolean;
    semanticReady: boolean;
    semanticMatchesSnapshot: boolean;
  };
  capabilities: {
    canSaveElmaToken: boolean;
    canRefreshSchema: boolean;
    canSaveLlmToken: boolean;
    canGenerateSemantic: boolean;
    canChat: boolean;
  };
  latest: {
    snapshotVersion: number | null;
    snapshotUpdatedAt: string | null;
    semanticVersion: number | null;
    semanticUpdatedAt: string | null;
    semanticSnapshotId: string | null;
  };
};

export type ConnectionJob = {
  jobId: string;
  type: "refresh_schema" | "generate_semantic";
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  error: string | null;
  createdAt: string;
  updatedAt: string;
  result: Record<string, unknown> | null;
};

export type ConnectionSchemaSnapshot = {
  snapshotId: string;
  version: number;
  createdAt: string;
  payload: Record<string, unknown>;
};

const ENV_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const API_URL =
  ENV_API_URL ||
  (typeof window !== "undefined" && isLocalHost(window.location.hostname) ? "http://localhost:8080" : "/api");

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const hasBody = options.body !== undefined && options.body !== null;
  const resolvedAccessToken = accessToken ?? apiAuthState?.tokens.accessToken;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(resolvedAccessToken ? { Authorization: `Bearer ${resolvedAccessToken}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const payload: unknown = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Request failed")
        : typeof payload === "string" && payload.trim().length > 0
          ? payload
          : "Request failed";
    throw new Error(errorMessage);
  }

  if (!isJson) {
    throw new Error(`Expected JSON response for ${path}, received ${contentType || "unknown content type"}`);
  }

  return payload as T;
}

export const api = {
  register(input: { companyName: string; fullName: string; email: string; password: string }) {
    return request<LoginResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) });
  },
  login(input: { email: string; password: string }) {
    return request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });
  },
  listConnections(accessToken: string) {
    return request<{ items: ConnectionState[] }>("/connections", {}, accessToken);
  },
  createConnection(accessToken: string, input: { displayName: string; baseUrl: string; elmaToken: string }) {
    return request<{ connectionId: string }>("/connections", { method: "POST", body: JSON.stringify(input) }, accessToken);
  },
  deleteConnection(accessToken: string, connectionId: string) {
    return request<{ ok: boolean }>(`/connections/${connectionId}`, { method: "DELETE" }, accessToken);
  },
  getConnectionState(accessToken: string, connectionId: string) {
    return request<ConnectionState>(`/connections/${connectionId}/state`, {}, accessToken);
  },
  saveElmaCredentials(accessToken: string, connectionId: string, input: { elmaToken: string }) {
    return request<{ ok: boolean }>(`/connections/${connectionId}/elma-credentials`, { method: "PUT", body: JSON.stringify(input) }, accessToken);
  },
  validateElmaCredentials(accessToken: string, connectionId: string) {
    return request<{ ok: boolean; externalUserId?: string }>(`/connections/${connectionId}/elma-credentials/validate`, { method: "POST" }, accessToken);
  },
  saveLlmSettings(accessToken: string, connectionId: string, input: { llmToken: string }) {
    return request<{ ok: boolean }>(`/connections/${connectionId}/llm-settings`, { method: "PUT", body: JSON.stringify(input) }, accessToken);
  },
  validateLlmSettings(accessToken: string, connectionId: string) {
    return request<{ ok: boolean }>(`/connections/${connectionId}/llm-settings/validate`, { method: "POST" }, accessToken);
  },
  createJob(accessToken: string, connectionId: string, input: { type: "refresh_schema" | "generate_semantic" }) {
    return request<{ jobId: string; status: "queued" }>(`/connections/${connectionId}/jobs`, { method: "POST", body: JSON.stringify(input) }, accessToken);
  },
  listJobs(accessToken: string, connectionId: string) {
    return request<{ items: ConnectionJob[] }>(`/connections/${connectionId}/jobs`, {}, accessToken);
  },
  getJob(accessToken: string, jobId: string) {
    return request<ConnectionJob>(`/jobs/${jobId}`, {}, accessToken);
  },
  getConnectionSchema(accessToken: string, connectionId: string) {
    return request<ConnectionSchemaSnapshot>(`/connections/${connectionId}/schema`, {}, accessToken);
  },
  generateSemantic(accessToken: string, connectionId: string) {
    return request<{ ok: boolean }>(`/connections/${connectionId}/semantic/generate`, { method: "POST" }, accessToken);
  },
  getSemantic(accessToken: string, connectionId: string) {
    return request<{
      draft: {
        entities: Array<{ entityKey: string; businessName: string; description: string; confidence: number }>;
        relationNotes: Array<{ from: string; to: string; meaning: string }>;
      };
    }>(`/connections/${connectionId}/semantic`, {}, accessToken);
  },
  saveSemantic(
    accessToken: string,
    connectionId: string,
    draft: {
      entities: Array<{ entityKey: string; businessName: string; description: string; confidence: number }>;
      relationNotes: Array<{ from: string; to: string; meaning: string }>;
    }
  ) {
    return request<{ ok: boolean }>(`/connections/${connectionId}/semantic`, { method: "PUT", body: JSON.stringify(draft) }, accessToken);
  },
  askChat(accessToken: string, input: { connectionId: string; question: string; chatSessionId?: string; entity?: string }) {
    return request<{ chatSessionId: string; answer: string; traceId: string }>(
      "/chat",
      { method: "POST", body: JSON.stringify(input) },
      accessToken
    );
  },
  listChatSessions(accessToken: string) {
    return request<{ items: Array<{ chatSessionId: string; title: string; updatedAt: string }> }>("/chat/sessions", {}, accessToken);
  },
  listConnectionsForChat(accessToken: string) {
    return request<{ items: ConnectionState[] }>("/connections", {}, accessToken);
  },
  getChatSession(accessToken: string, id: string) {
    return request<{
      session: { chatSessionId: string; title: string };
      messages: Array<{ role: string; content: string; createdAt: string }>;
    }>(`/chat/sessions/${id}`, {}, accessToken);
  },
  getTrace(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/traces/${id}`, {}, accessToken);
  }
};
