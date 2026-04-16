import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";
import { MetadataCredentialsProvider } from "@ydbjs/auth/metadata";
import { Driver } from "@ydbjs/core";
import { query, type QueryClient } from "@ydbjs/query";
import type {
  ChatMessage,
  ChatRepository,
  ChatSession,
  Company,
  CompanyRepository,
  Connection,
  ConnectionRepository,
  CredentialRepository,
  EntityId,
  RefreshSession,
  RefreshSessionRepository,
  SemanticMapping,
  SemanticMappingRepository,
  Snapshot,
  SnapshotRepository,
  Trace,
  TraceRepository,
  User,
  UserConnectionCredential,
  UserRepository
} from "@meta-elma/domain";

const TABLES = {
  companies: "`companies`",
  users: "`users`",
  refreshSessions: "`refresh_sessions`",
  connections: "`connections`",
  credentials: "`user_connection_credentials`",
  snapshots: "`snapshots`",
  semanticMappings: "`semantic_mappings`",
  chatSessions: "`chat_sessions`",
  chatMessages: "`chat_messages`",
  traces: "`traces`"
} as const;

function toKey(userId: string, connectionId: string): string {
  return `${userId}:${connectionId}`;
}

function toConnectionString(endpoint: string, database: string): string {
  const normalizedEndpoint = endpoint.replace(/\/$/, "");
  const withProtocol = /^(grpc|grpcs|http|https):\/\//.test(normalizedEndpoint)
    ? normalizedEndpoint
    : `grpcs://${normalizedEndpoint}`;
  return `${withProtocol}${database.startsWith("/") ? database : `/${database}`}`;
}

function parsePayload<T>(rows: unknown[][] | unknown[][][]): T[] {
  const dataRows: unknown[][] = Array.isArray(rows[0]?.[0]) ? (rows[0] as unknown[][]) : (rows as unknown[][]);
  return dataRows.flatMap((row) => {
    const payload = row[0];
    if (payload === null || payload === undefined) {
      return [];
    }
    return [JSON.parse(String(payload)) as T];
  });
}

export class YdbStorage
  implements
    CompanyRepository,
    UserRepository,
    RefreshSessionRepository,
    ConnectionRepository,
    CredentialRepository,
    SnapshotRepository,
    SemanticMappingRepository,
    ChatRepository,
    TraceRepository
{
  private readonly driver: Driver;
  private readonly sql: QueryClient;
  private ready: Promise<void> | null = null;

  constructor(config: { endpoint: string; database: string; authToken?: string }) {
    const credentialsProvider = config.authToken
      ? new AccessTokenCredentialsProvider({ token: config.authToken })
      : new MetadataCredentialsProvider();
    this.driver = new Driver(toConnectionString(config.endpoint, config.database), {
      credentialsProvider
    });
    this.sql = query(this.driver);
    this.ready = null;
  }

  private async initialize(): Promise<void> {
    await this.driver.ready();
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.companies} (
        company_id Utf8,
        data_json Utf8,
        PRIMARY KEY (company_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.users} (
        user_id Utf8,
        company_id Utf8,
        email Utf8,
        data_json Utf8,
        PRIMARY KEY (user_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.refreshSessions} (
        session_id Utf8,
        user_id Utf8,
        data_json Utf8,
        PRIMARY KEY (session_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.connections} (
        connection_id Utf8,
        company_id Utf8,
        data_json Utf8,
        PRIMARY KEY (connection_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.credentials} (
        credential_key Utf8,
        user_id Utf8,
        connection_id Utf8,
        data_json Utf8,
        PRIMARY KEY (credential_key)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.snapshots} (
        connection_id Utf8,
        data_json Utf8,
        PRIMARY KEY (connection_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.semanticMappings} (
        connection_id Utf8,
        data_json Utf8,
        PRIMARY KEY (connection_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.chatSessions} (
        chat_session_id Utf8,
        user_id Utf8,
        data_json Utf8,
        PRIMARY KEY (chat_session_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.chatMessages} (
        chat_session_id Utf8,
        chat_message_id Utf8,
        data_json Utf8,
        PRIMARY KEY (chat_session_id, chat_message_id)
      )
    `);
    await this.sql(`
      CREATE TABLE IF NOT EXISTS ${TABLES.traces} (
        trace_id Utf8,
        company_id Utf8,
        data_json Utf8,
        PRIMARY KEY (trace_id)
      )
    `);
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initialize().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    await this.ready;
  }

  private literal(value: string): string {
    const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "''");
    return `CAST('${escaped}' AS Utf8)`;
  }

  private async selectAllPayload(table: string): Promise<unknown[][] | unknown[][][]> {
    return this.sql(`
      SELECT data_json
      FROM ${table};
    `).values();
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async ping(): Promise<void> {
    await this.ensureReady();
    await this.sql("SELECT 1");
  }

  async createCompany(company: Company): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.companies} (company_id, data_json)
      VALUES (${this.literal(company.companyId)}, ${this.literal(JSON.stringify(company))});
    `);
  }

  async getCompanyById(companyId: EntityId): Promise<Company | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.companies);
    return parsePayload<Company>(rows).find((item) => item.companyId === companyId) ?? null;
  }

  async createUser(user: User): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.users} (user_id, company_id, email, data_json)
      VALUES (
        ${this.literal(user.userId)},
        ${this.literal(user.companyId)},
        ${this.literal(user.email.toLowerCase())},
        ${this.literal(JSON.stringify(user))}
      );
    `);
  }

  async getByEmail(email: string): Promise<User | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.users);
    return parsePayload<User>(rows).find((item) => item.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getUserById(userId: EntityId): Promise<User | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.users);
    return parsePayload<User>(rows).find((item) => item.userId === userId) ?? null;
  }

  async createRefreshSession(session: RefreshSession): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.refreshSessions} (session_id, user_id, data_json)
      VALUES (
        ${this.literal(session.sessionId)},
        ${this.literal(session.userId)},
        ${this.literal(JSON.stringify(session))}
      );
    `);
  }

  async getRefreshSessionById(sessionId: EntityId): Promise<RefreshSession | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.refreshSessions);
    return parsePayload<RefreshSession>(rows).find((item) => item.sessionId === sessionId) ?? null;
  }

  async revoke(sessionId: EntityId): Promise<void> {
    await this.ensureReady();
    const current = await this.getRefreshSessionById(sessionId);
    if (!current) return;
    const next: RefreshSession = { ...current, revokedAt: new Date().toISOString() };
    await this.createRefreshSession(next);
  }

  async createConnection(connection: Connection): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.connections} (connection_id, company_id, data_json)
      VALUES (
        ${this.literal(connection.connectionId)},
        ${this.literal(connection.companyId)},
        ${this.literal(JSON.stringify(connection))}
      );
    `);
  }

  async listByCompany(companyId: EntityId): Promise<Connection[]> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.connections);
    return parsePayload<Connection>(rows).filter((item) => item.companyId === companyId);
  }

  async getConnectionById(connectionId: EntityId): Promise<Connection | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.connections);
    return parsePayload<Connection>(rows).find((item) => item.connectionId === connectionId) ?? null;
  }

  async upsert(credential: UserConnectionCredential): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.credentials} (credential_key, user_id, connection_id, data_json)
      VALUES (
        ${this.literal(toKey(credential.userId, credential.connectionId))},
        ${this.literal(credential.userId)},
        ${this.literal(credential.connectionId)},
        ${this.literal(JSON.stringify(credential))}
      );
    `);
  }

  async getForUserAndConnection(userId: EntityId, connectionId: EntityId): Promise<UserConnectionCredential | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.credentials);
    return parsePayload<UserConnectionCredential>(rows).find(
      (item) => item.userId === userId && item.connectionId === connectionId
    ) ?? null;
  }

  async listForUser(userId: EntityId): Promise<UserConnectionCredential[]> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.credentials);
    return parsePayload<UserConnectionCredential>(rows).filter((item) => item.userId === userId);
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.snapshots} (connection_id, data_json)
      VALUES (${this.literal(snapshot.connectionId)}, ${this.literal(JSON.stringify(snapshot))});
    `);
  }

  async getCurrentSnapshotForConnection(connectionId: EntityId): Promise<Snapshot | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.snapshots);
    return parsePayload<Snapshot>(rows).find((item) => item.connectionId === connectionId) ?? null;
  }

  async saveSemanticMapping(mapping: SemanticMapping): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.semanticMappings} (connection_id, data_json)
      VALUES (${this.literal(mapping.connectionId)}, ${this.literal(JSON.stringify(mapping))});
    `);
  }

  async getCurrentSemanticMappingForConnection(connectionId: EntityId): Promise<SemanticMapping | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.semanticMappings);
    return parsePayload<SemanticMapping>(rows).find((item) => item.connectionId === connectionId) ?? null;
  }

  async createSession(session: ChatSession): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.chatSessions} (chat_session_id, user_id, data_json)
      VALUES (
        ${this.literal(session.chatSessionId)},
        ${this.literal(session.userId)},
        ${this.literal(JSON.stringify(session))}
      );
    `);
  }

  async getSession(chatSessionId: EntityId): Promise<ChatSession | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.chatSessions);
    return parsePayload<ChatSession>(rows).find((item) => item.chatSessionId === chatSessionId) ?? null;
  }

  async listSessions(userId: EntityId): Promise<ChatSession[]> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.chatSessions);
    return parsePayload<ChatSession>(rows).filter((item) => item.userId === userId);
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.chatMessages} (chat_session_id, chat_message_id, data_json)
      VALUES (
        ${this.literal(message.chatSessionId)},
        ${this.literal(message.chatMessageId)},
        ${this.literal(JSON.stringify(message))}
      );
    `);
  }

  async listMessages(chatSessionId: EntityId): Promise<ChatMessage[]> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.chatMessages);
    return parsePayload<ChatMessage>(rows).filter((item) => item.chatSessionId === chatSessionId);
  }

  async saveTrace(trace: Trace): Promise<void> {
    await this.ensureReady();
    await this.sql(`
      UPSERT INTO ${TABLES.traces} (trace_id, company_id, data_json)
      VALUES (
        ${this.literal(trace.traceId)},
        ${this.literal(trace.companyId)},
        ${this.literal(JSON.stringify(trace))}
      );
    `);
  }

  async getTraceById(traceId: EntityId): Promise<Trace | null> {
    await this.ensureReady();
    const rows = await this.selectAllPayload(TABLES.traces);
    return parsePayload<Trace>(rows).find((trace) => trace.traceId === traceId) ?? null;
  }
}
