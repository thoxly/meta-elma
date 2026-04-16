import type { ElmaConnector, LiveRecord, SnapshotApp, SnapshotField, SnapshotGroup, SnapshotNamespace, SnapshotPage, SnapshotProcess, StructuralSnapshotPayload } from "@meta-elma/domain";

type RequestOptions = { method?: "GET" | "POST"; token: string; body?: unknown };

export interface ElmaClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  retryCount?: number;
}

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

export class HttpElmaClient implements ElmaConnector {
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

  async validateCredential(_baseUrl: string, token: string): Promise<{ ok: boolean; externalUserId?: string }> {
    try {
      const payload = await this.request("/pub/v1/user/list", { token, method: "POST", body: {} });
      const users = parseCollection(payload);
      const first = users[0];
      return { ok: true, externalUserId: asString(first?.["id"], asString(first?.["code"], "unknown")) };
    } catch {
      return { ok: false };
    }
  }

  private async listNamespaces(token: string): Promise<SnapshotNamespace[]> {
    const payload = await this.request("/pub/v1/scheme/namespaces", { token });
    return parseCollection(payload).map((item) => ({
      namespace: asString(item.code, asString(item.namespace, "default")),
      title: asString(item.title, asString(item.name, "Default"))
    }));
  }

  private async listApps(token: string, namespace: string): Promise<Array<{ namespace: string; code: string; title: string }>> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/apps`, { token });
    return parseCollection(payload).map((item) => ({
      namespace,
      code: asString(item.code, asString(item.id, "unknown")),
      title: asString(item.title, asString(item.name, "Unnamed app"))
    }));
  }

  private async listPages(token: string, namespace: string): Promise<SnapshotPage[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/pages`, { token });
    return parseCollection(payload).map((item) => ({
      pageId: asString(item.id, asString(item.code, crypto.randomUUID())),
      title: asString(item.title, asString(item.name, "Unnamed page"))
    }));
  }

  private async listProcesses(token: string, namespace: string): Promise<SnapshotProcess[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/processes`, { token });
    return parseCollection(payload).map((item) => ({
      namespace,
      code: asString(item.code, asString(item.id, "unknown")),
      title: asString(item.title, asString(item.name, "Unnamed process"))
    }));
  }

  private async listGroups(token: string): Promise<SnapshotGroup[]> {
    const payload = await this.request("/pub/v1/scheme/groups/list", { token, method: "POST", body: {} });
    return parseCollection(payload).map((item) => ({
      groupId: asString(item.id, asString(item.code, crypto.randomUUID())),
      title: asString(item.title, asString(item.name, "Unnamed group"))
    }));
  }

  private async getAppSchema(token: string, namespace: string, code: string): Promise<{ fields: SnapshotField[]; statuses: Array<{ code: string; title: string }> }> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/apps/${code}`, { token });
    const raw = parseObject(payload) as {
      fields?: Array<{ code?: string; name?: string; title?: string; type?: string; required?: boolean; linkTo?: string }>;
      statuses?: Array<{ code?: string; title?: string; statuses?: Array<{ code?: string; title?: string }> }>;
    };
    return {
      fields: (raw.fields ?? []).map((field) => ({
        code: asString(field.code ?? field.name, "unknown"),
        title: asString(field.title ?? field.name, "Unnamed field"),
        type: asString(field.type, "unknown"),
        required: Boolean(field.required),
        relationHint: asString(field.linkTo)
      })),
      statuses: (raw.statuses ?? []).flatMap((group) =>
        (group.statuses ?? []).map((status) => ({
          code: asString(status.code, asString(group.code, "default")),
          title: asString(status.title, asString(group.title, "Default"))
        }))
      )
    };
  }

  async collectStructuralSnapshot(_baseUrl: string, token: string): Promise<StructuralSnapshotPayload> {
    const namespaces = await this.listNamespaces(token);
    const apps: SnapshotApp[] = [];
    const pages: SnapshotPage[] = [];
    const processes: SnapshotProcess[] = [];
    for (const namespace of namespaces) {
      const namespaceApps = await this.listApps(token, namespace.namespace);
      pages.push(...(await this.listPages(token, namespace.namespace)));
      processes.push(...(await this.listProcesses(token, namespace.namespace)));
      for (const app of namespaceApps.slice(0, 50)) {
        const schema = await this.getAppSchema(token, app.namespace, app.code);
        apps.push({
          namespace: app.namespace,
          code: app.code,
          title: app.title,
          fields: schema.fields,
          statuses: schema.statuses
        });
      }
    }
    const groups = await this.listGroups(token);
    const relationHints = apps.flatMap((app) =>
      app.fields
        .filter((field) => field.relationHint)
        .map((field) => ({
          from: `${app.namespace}.${app.code}.${field.code}`,
          to: String(field.relationHint),
          reason: "reference_field"
        }))
    );
    return {
      namespaces,
      apps,
      pages,
      processes,
      groups,
      relationHints
    };
  }

  async searchRecords(input: { baseUrl: string; token: string; entity: string; query: string }): Promise<LiveRecord[]> {
    const payload = await this.request("/pub/v1/app/search", {
      token: input.token,
      method: "POST",
      body: { entity: input.entity, query: input.query }
    });
    return parseCollection(payload).slice(0, 30).map((row) => ({
      entity: input.entity,
      id: asString(row.id, crypto.randomUUID()),
      fields: row
    }));
  }

  async getRelatedRecords(input: {
    baseUrl: string;
    token: string;
    entity: string;
    recordId: string;
    relatedEntity: string;
  }): Promise<LiveRecord[]> {
    const payload = await this.request("/pub/v1/app/related", {
      token: input.token,
      method: "POST",
      body: {
        entity: input.entity,
        recordId: input.recordId,
        relatedEntity: input.relatedEntity
      }
    });
    return parseCollection(payload).slice(0, 30).map((row) => ({
      entity: input.relatedEntity,
      id: asString(row.id, crypto.randomUUID()),
      fields: row
    }));
  }
}
