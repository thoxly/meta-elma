export type Tokens = { accessToken: string; refreshToken: string };
export type LoginResponse = {
  tokens: Tokens;
  user: { userId: string; companyId: string; email: string; fullName: string };
};

const ENV_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

const API_URL =
  ENV_API_URL ||
  (typeof window !== "undefined" && isLocalHost(window.location.hostname) ? "http://localhost:8080" : "/api");

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
    return request<{ items: Array<{ connectionId: string; displayName: string; baseUrl: string }> }>("/connections", {}, accessToken);
  },
  createConnection(accessToken: string, input: { displayName: string; baseUrl: string }) {
    return request<{ connectionId: string }>("/connections", { method: "POST", body: JSON.stringify(input) }, accessToken);
  },
  upsertCredentials(accessToken: string, connectionId: string, input: { elmaToken: string; llmToken?: string }) {
    return request<{ ok: boolean }>(`/connections/${connectionId}/credentials`, { method: "PUT", body: JSON.stringify(input) }, accessToken);
  },
  refreshSnapshot(accessToken: string, connectionId: string) {
    return request<{ snapshotId: string; version: number }>(`/connections/${connectionId}/snapshot/refresh`, { method: "POST" }, accessToken);
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
