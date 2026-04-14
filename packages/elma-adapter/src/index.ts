import type {
  ElmaApp,
  ElmaAppSchema,
  ElmaConnection,
  ElmaField,
  ElmaForm,
  ElmaGroup,
  ElmaNamespace,
  ElmaPage,
  ElmaProcess,
  ElmaStatusGroup,
  ElmaUser,
  UserScopedContext
} from "@meta-elma/domain";

type RequestOptions = {
  method?: "GET" | "POST";
  token: string;
  body?: unknown;
};

export interface ElmaClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  retryCount?: number;
}

type RawElmaAppDetails = {
  fields?: Array<{ code?: string; name?: string; title?: string; type?: string; required?: boolean }>;
  statuses?: Array<{ code?: string; title?: string; statuses?: Array<{ code?: string; title?: string }> }>;
  forms?: Array<{ id?: string; code?: string; title?: string; name?: string }>;
};

type RawElmaEntity = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export class ElmaApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly payload?: unknown
  ) {
    super(message);
  }
}

async function parseJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseCollection(payload: unknown): RawElmaEntity[] {
  if (Array.isArray(payload)) return payload as RawElmaEntity[];
  if (payload && typeof payload === "object") {
    const candidates = ["result", "data", "items", "rows"];
    for (const key of candidates) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as RawElmaEntity[];
    }
  }
  return [];
}

function parseObject(payload: unknown): RawElmaEntity {
  if (payload && typeof payload === "object") return payload as RawElmaEntity;
  return {};
}

function parseFields(raw: RawElmaAppDetails): ElmaField[] {
  return (raw.fields ?? []).map((field) => ({
    code: asString(field.code ?? field.name, "unknown"),
    title: asString(field.title ?? field.name, "Unnamed field"),
    type: asString(field.type, "unknown"),
    required: Boolean(field.required)
  }));
}

function parseStatusGroups(raw: RawElmaAppDetails): ElmaStatusGroup[] {
  return (raw.statuses ?? []).map((group) => ({
    code: asString(group.code, "default"),
    title: asString(group.title, "Default statuses"),
    statuses: (group.statuses ?? []).map((status) => ({
      code: asString(status.code, "unknown"),
      title: asString(status.title, "Unnamed status")
    }))
  }));
}

function parseForms(raw: RawElmaAppDetails): ElmaForm[] {
  return (raw.forms ?? []).map((form) => ({
    formId: asString(form.id ?? form.code, crypto.randomUUID()),
    title: asString(form.title ?? form.name, "Unnamed form")
  }));
}

export interface ElmaClient {
  getCurrentUser(connection: ElmaConnection, token: string): Promise<ElmaUser>;
  listNamespaces(_connection: ElmaConnection, token: string): Promise<ElmaNamespace[]>;
  listApps(_connection: ElmaConnection, token: string, namespace: string): Promise<ElmaApp[]>;
  listPages(_connection: ElmaConnection, token: string, namespace: string): Promise<ElmaPage[]>;
  listProcesses(_connection: ElmaConnection, token: string, namespace: string): Promise<ElmaProcess[]>;
  listGroups(_connection: ElmaConnection, token: string): Promise<ElmaGroup[]>;
  getAppSchema(
    _connection: ElmaConnection,
    token: string,
    namespace: string,
    code: string
  ): Promise<ElmaAppSchema>;
  collectUserScopedContext(connection: ElmaConnection, token: string): Promise<UserScopedContext>;
}

export class HttpElmaClient implements ElmaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(config: ElmaClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.retryCount = config.retryCount ?? 2;
  }

  private async request(path: string, options: RequestOptions): Promise<unknown> {
    const url = toUrl(this.baseUrl, path);
    const method = options.method ?? "GET";
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${options.token}`,
            "content-type": "application/json"
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal
        });
        clearTimeout(timeout);
        const payload = await parseJsonOrText(response);
        if (!response.ok) {
          throw new ElmaApiError(`ELMA API request failed: ${path}`, response.status, payload);
        }
        return payload;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (attempt < this.retryCount) {
          await sleep(200 * (attempt + 1));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("ELMA request failed");
  }

  async getCurrentUser(connection: ElmaConnection, token: string): Promise<ElmaUser> {
    const payload = await this.request("/pub/v1/user/list", { token, method: "POST", body: {} });
    const users = parseCollection(payload);
    const current =
      users.find((item) => asString(item.id) === connection.sourceUserId) ??
      users.find((item) => asString(item.code) === connection.sourceUserId) ??
      users[0];
    return {
      userId: connection.sourceUserId,
      fullName: asString(current?.["fullName"] ?? current?.["name"], connection.displayName),
      email: asString(current?.["email"])
    };
  }

  async listNamespaces(_connection: ElmaConnection, token: string): Promise<ElmaNamespace[]> {
    const payload = await this.request("/pub/v1/scheme/namespaces", { token });
    return parseCollection(payload).map((item) => ({
      namespace: asString(item.code, asString(item.namespace, "default")),
      title: asString(item.title, asString(item.name, "Default"))
    }));
  }

  async listApps(_connection: ElmaConnection, token: string, namespace: string): Promise<ElmaApp[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/apps`, { token });
    return parseCollection(payload).map((item) => ({
      namespace,
      code: asString(item.code, asString(item.id, "unknown")),
      title: asString(item.title, asString(item.name, "Unnamed app"))
    }));
  }

  async listPages(_connection: ElmaConnection, token: string, namespace: string): Promise<ElmaPage[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/pages`, { token });
    return parseCollection(payload).map((item) => ({
      pageId: asString(item.id, asString(item.code, crypto.randomUUID())),
      title: asString(item.title, asString(item.name, "Unnamed page"))
    }));
  }

  async listProcesses(_connection: ElmaConnection, token: string, namespace: string): Promise<ElmaProcess[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/processes`, { token });
    return parseCollection(payload).map((item) => ({
      namespace,
      code: asString(item.code, asString(item.id, "unknown")),
      title: asString(item.title, asString(item.name, "Unnamed process"))
    }));
  }

  async listGroups(_connection: ElmaConnection, token: string): Promise<ElmaGroup[]> {
    const payload = await this.request("/pub/v1/scheme/groups/list", { token, method: "POST", body: {} });
    return parseCollection(payload).map((item) => ({
      groupId: asString(item.id, asString(item.code, crypto.randomUUID())),
      title: asString(item.title, asString(item.name, "Unnamed group"))
    }));
  }

  async getAppSchema(
    _connection: ElmaConnection,
    token: string,
    namespace: string,
    code: string
  ): Promise<ElmaAppSchema> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/apps/${code}`, { token });
    const raw = parseObject(payload) as RawElmaAppDetails;
    return {
      namespace,
      appCode: code,
      fields: parseFields(raw),
      statusGroups: parseStatusGroups(raw),
      forms: parseForms(raw)
    };
  }

  async collectUserScopedContext(connection: ElmaConnection, token: string): Promise<UserScopedContext> {
    const user = await this.getCurrentUser(connection, token);
    const namespaces = await this.listNamespaces(connection, token);
    const apps: ElmaApp[] = [];
    const pages: ElmaPage[] = [];
    const processes: ElmaProcess[] = [];
    for (const namespace of namespaces) {
      apps.push(...(await this.listApps(connection, token, namespace.namespace)));
      pages.push(...(await this.listPages(connection, token, namespace.namespace)));
      processes.push(...(await this.listProcesses(connection, token, namespace.namespace)));
    }
    const appSchemas: ElmaAppSchema[] = [];
    for (const app of apps.slice(0, 50)) {
      appSchemas.push(await this.getAppSchema(connection, token, app.namespace, app.code));
    }
    const groups = await this.listGroups(connection, token);
    return {
      connectionId: connection.connectionId,
      sourceUserId: connection.sourceUserId,
      sourceInstanceId: connection.sourceInstanceId,
      fetchedAt: new Date().toISOString(),
      user,
      namespaces,
      apps,
      appSchemas,
      pages,
      processes,
      groups,
      roleSubjects: groups.map((group) => ({
        subjectType: "group",
        subjectId: group.groupId,
        displayName: group.title
      }))
    };
  }
}
