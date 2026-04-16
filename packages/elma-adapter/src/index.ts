import type {
  ElmaConnector,
  LiveRecord,
  SnapshotApp,
  SnapshotField,
  SnapshotGroup,
  SnapshotNamespace,
  SnapshotPage,
  SnapshotProcess,
  StructuralSnapshotPayload
} from "@meta-elma/domain";

type RequestOptions = { method?: "GET" | "POST"; token: string; body?: unknown; baseUrl?: string };

export interface ElmaClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  retryCount?: number;
}

type RawElmaEntity = Record<string, unknown>;
const ELMA_SCHEMA_DEBUG = process.env.ELMA_SCHEMA_DEBUG === "1";

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
    const objectPayload = payload as Record<string, unknown>;
    const nestedResult = objectPayload.result;
    if (nestedResult && typeof nestedResult === "object") {
      const nestedValue = (nestedResult as Record<string, unknown>).result;
      if (Array.isArray(nestedValue)) return nestedValue as RawElmaEntity[];
    }
    const candidates = ["result", "data", "items", "rows"];
    for (const key of candidates) {
      const value = objectPayload[key];
      if (Array.isArray(value)) return value as RawElmaEntity[];
    }
  }
  return [];
}

function parseObject(payload: unknown): RawElmaEntity {
  if (payload && typeof payload === "object") return payload as RawElmaEntity;
  return {};
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function collectMeta(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const keys = ["__createdAt", "__updatedAt", "__deletedAt", "__createdBy", "__updatedBy", "version"];
  const meta = Object.fromEntries(keys.flatMap((key) => (input[key] !== undefined ? [[key, input[key]]] : [])));
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function debugSchemaLog(message: string, payload: Record<string, unknown>): void {
  if (!ELMA_SCHEMA_DEBUG) return;
  // Minimal diagnostics only: no tokens/body dumps, only shape/counts.
  console.info(`[elma-schema-debug] ${message}`, payload);
}

export class HttpElmaClient implements ElmaConnector {
  private readonly defaultBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(config: ElmaClientConfig) {
    this.defaultBaseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.retryCount = config.retryCount ?? 2;
  }

  private async request(path: string, options: RequestOptions): Promise<unknown> {
    const url = toUrl(options.baseUrl ?? this.defaultBaseUrl, path);
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
        if (path.startsWith("/pub/v1/scheme/")) {
          const payloadObject = parseObject(payload);
          const collection = parseCollection(payload);
          const firstItem = collection[0];
          debugSchemaLog("scheme response", {
            path,
            status: response.status,
            topLevelKeys: Object.keys(payloadObject),
            collectionLength: collection.length,
            firstItemKeys: firstItem ? Object.keys(firstItem) : []
          });
        }
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

  async validateCredential(baseUrl: string, token: string): Promise<{ ok: boolean; externalUserId?: string }> {
    try {
      const payload = await this.request("/pub/v1/user/list", { token, method: "POST", body: {}, baseUrl });
      const users = parseCollection(payload);
      const first = users[0];
      return { ok: true, externalUserId: asString(first?.["id"], asString(first?.["code"], "unknown")) };
    } catch {
      return { ok: false };
    }
  }

  private async listNamespaces(token: string, baseUrl: string): Promise<SnapshotNamespace[]> {
    const payload = await this.request("/pub/v1/scheme/namespaces", { token, baseUrl });
    return parseCollection(payload).map((item) => ({
      namespace: asString(item.code, asString(item.namespace, "default")),
      title: asString(item.name, asString(item.title, "Default")),
      name: asString(item.name, asString(item.title, "Default"))
    }));
  }

  private async listApps(
    token: string,
    namespace: string,
    baseUrl: string
  ): Promise<Array<{ namespace: string; code: string; title: string; name?: string; type?: string; meta?: Record<string, unknown> }>> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/apps`, { token, baseUrl });
    return parseCollection(payload).map((item) => ({
      namespace: asString(item.namespace, namespace),
      code: asString(item.code, asString(item.id, "unknown")),
      title: asString(item.name, asString(item.title, "Unnamed app")),
      name: asString(item.name, asString(item.title, "Unnamed app")),
      type: asString(item.type),
      meta: collectMeta(item)
    }));
  }

  private async listPages(token: string, namespace: string, baseUrl: string): Promise<SnapshotPage[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/pages`, { token, baseUrl });
    return parseCollection(payload).map((item) => ({
      pageId: asString(item.__id, asString(item.id, asString(item.code, crypto.randomUUID()))),
      title: asString(item.name, asString(item.title, "Unnamed page")),
      namespace: asString(item.namespace, namespace),
      code: asString(item.code),
      hidden: typeof item.hidden === "boolean" ? item.hidden : undefined,
      meta: collectMeta(item)
    }));
  }

  private async listProcesses(token: string, namespace: string, baseUrl: string): Promise<SnapshotProcess[]> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/processes`, { token, baseUrl });
    return parseCollection(payload).map((item) => ({
      namespace: asString(item.namespace, namespace),
      code: asString(item.code, asString(item.id, "unknown")),
      title: asString(item.__name, asString(item.name, asString(item.title, "Unnamed process"))),
      meta: collectMeta(item)
    }));
  }

  private async listGroups(token: string, baseUrl: string): Promise<SnapshotGroup[]> {
    const payload = await this.request("/pub/v1/scheme/groups/list", { token, method: "POST", body: {}, baseUrl });
    return parseCollection(payload).map((item) => ({
      groupId: asString(item.id, asString(item.code, crypto.randomUUID())),
      title: asString(item.name, asString(item.title, "Unnamed group")),
      raw: item
    }));
  }

  private normalizeField(field: Record<string, unknown>): SnapshotField {
    const view = toRecord(field.view);
    const data = toRecord(field.data);
    return {
      code: asString(field.code ?? field.name, "unknown"),
      title: asString(view?.name, asString(field.name, asString(field.title, "Unnamed field"))),
      name: asString(view?.name, asString(field.name, asString(field.title, "Unnamed field"))),
      type: asString(field.type, "unknown"),
      required: Boolean(field.required),
      relationHint: asString(field.linkTo),
      array: Boolean(field.array),
      single: Boolean(field.single),
      searchable: Boolean(field.searchable),
      indexed: Boolean(field.indexed),
      deleted: Boolean(field.deleted),
      defaultValue: field.defaultValue,
      calcByFormula: Boolean(field.calcByFormula),
      formula: asString(field.formula),
      view,
      data,
      raw: field
    };
  }

  private hasStatusField(fields: SnapshotField[]): boolean {
    return fields.some((field) => field.type === "STATUS" || field.code === "__status");
  }

  private async loadAppStatuses(token: string, namespace: string, code: string, baseUrl: string): Promise<{ statusItems: Record<string, unknown>[]; groupItems: Record<string, unknown>[] } | null> {
    const candidatePaths = [
      `/pub/v1/scheme/namespaces/${namespace}/apps/${code}/statuses`,
      `/pub/v1/scheme/namespaces/${namespace}/apps/${code}/status`
    ];
    for (const path of candidatePaths) {
      try {
        const payload = parseObject(await this.request(path, { token, baseUrl }));
        const statusItems = Array.isArray(payload.statusItems) ? (payload.statusItems as Record<string, unknown>[]) : [];
        const groupItems = Array.isArray(payload.groupItems) ? (payload.groupItems as Record<string, unknown>[]) : [];
        if (statusItems.length > 0 || groupItems.length > 0) {
          return { statusItems, groupItems };
        }
      } catch {
        // Try fallback endpoint if primary one is unavailable for tenant version.
      }
    }
    return null;
  }

  private async getAppSchema(
    token: string,
    namespace: string,
    code: string,
    baseUrl: string
  ): Promise<{
    name: string;
    elementName?: string;
    type?: string;
    fields: SnapshotField[];
    forms: Record<string, unknown> | null;
    permissions: Record<string, unknown> | null;
    params: Record<string, unknown> | null;
    statuses: { statusItems: Record<string, unknown>[]; groupItems: Record<string, unknown>[] } | null;
    meta?: Record<string, unknown>;
  }> {
    const payload = await this.request(`/pub/v1/scheme/namespaces/${namespace}/apps/${code}`, { token, baseUrl });
    const raw = parseObject(payload);
    const app = toRecord(raw.application) ?? raw;
    const fields = Array.isArray(app.fields) ? app.fields.map((field) => this.normalizeField(parseObject(field))) : [];
    const statuses = this.hasStatusField(fields) ? await this.loadAppStatuses(token, namespace, code, baseUrl) : null;
    return {
      name: asString(app.name, asString(app.elementName, code)),
      elementName: asString(app.elementName),
      type: asString(app.type),
      fields,
      forms: toRecord(app.forms),
      permissions: toRecord(app.permissions),
      params: toRecord(app.params),
      statuses,
      meta: collectMeta(app)
    };
  }

  async collectStructuralSnapshot(baseUrl: string, token: string): Promise<StructuralSnapshotPayload> {
    const namespaces = await this.listNamespaces(token, baseUrl);
    const apps: SnapshotApp[] = [];
    const pages: SnapshotPage[] = [];
    const processes: SnapshotProcess[] = [];
    const namespaceViews: SnapshotNamespace[] = [];
    for (const namespace of namespaces) {
      const namespaceApps = await this.listApps(token, namespace.namespace, baseUrl);
      const namespacePages = await this.listPages(token, namespace.namespace, baseUrl);
      const namespaceProcesses = await this.listProcesses(token, namespace.namespace, baseUrl);
      pages.push(...namespacePages);
      processes.push(...namespaceProcesses);
      const namespaceAppsDetailed: SnapshotApp[] = [];
      for (const app of namespaceApps.slice(0, 50)) {
        const schema = await this.getAppSchema(token, app.namespace, app.code, baseUrl);
        const appSnapshot: SnapshotApp = {
          namespace: app.namespace,
          code: app.code,
          title: schema.name || app.title,
          name: schema.name || app.name,
          elementName: schema.elementName,
          type: schema.type || app.type,
          meta: { ...(app.meta ?? {}), ...(schema.meta ?? {}) },
          fields: schema.fields,
          forms: schema.forms,
          permissions: schema.permissions,
          params: schema.params,
          statuses: schema.statuses,
          relationHints: []
        };
        apps.push(appSnapshot);
        namespaceAppsDetailed.push(appSnapshot);
      }
      namespaceViews.push({
        ...namespace,
        apps: namespaceAppsDetailed,
        pages: namespacePages,
        processes: namespaceProcesses
      });
    }
    const groups = await this.listGroups(token, baseUrl);
    const relationHints = apps.flatMap((app) => {
      const appRelationHints = app.fields.flatMap((field) => {
        const fieldData = field.data ?? {};
        const targetNamespace = asString(fieldData.namespace);
        const targetCode = asString(fieldData.code);
        if (targetNamespace && targetCode) {
          return [{
            from: `${app.namespace}.${app.code}.${field.code}`,
            to: `${targetNamespace}.${targetCode}`,
            reason: "field_data_reference"
          }];
        }
        if (field.relationHint) {
          return [{
            from: `${app.namespace}.${app.code}.${field.code}`,
            to: String(field.relationHint),
            reason: "legacy_reference_field"
          }];
        }
        return [];
      });
      app.relationHints = appRelationHints;
      return appRelationHints;
    });
    const fieldsCount = apps.reduce((sum, app) => sum + app.fields.length, 0);
    const statusEnabledApps = apps.filter((app) => app.statuses && "statusItems" in app.statuses).length;
    debugSchemaLog("snapshot build complete", {
      baseUrl,
      namespaces: namespaceViews.length,
      apps: apps.length,
      pages: pages.length,
      processes: processes.length,
      groups: groups.length,
      fields: fieldsCount,
      statusEnabledApps,
      relationHints: relationHints.length
    });
    return {
      baseUrl,
      collectedAt: new Date().toISOString(),
      namespaces: namespaceViews,
      apps,
      pages,
      processes,
      groups,
      relationHints,
      stats: {
        namespaces: namespaceViews.length,
        apps: apps.length,
        pages: pages.length,
        processes: processes.length,
        groups: groups.length,
        fields: fieldsCount,
        statusEnabledApps,
        relationHints: relationHints.length
      },
      observedRuntimeNotes: [
        "schema_and_runtime_are_separate_layers",
        "runtime_items_can_be_sparse_vs_schema",
        "sys_user_can_be_uuid_or_uuid_array",
        "datetime_values_are_iso_strings",
        "__version_can_be_technical_numeric_value"
      ]
    };
  }

  async searchRecords(input: { baseUrl: string; token: string; entity: string; query: string }): Promise<LiveRecord[]> {
    const payload = await this.request("/pub/v1/app/search", {
      baseUrl: input.baseUrl,
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
      baseUrl: input.baseUrl,
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
