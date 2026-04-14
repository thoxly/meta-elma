export type EntityId = string;
export type IsoTimestamp = string;

export interface ElmaConnection {
  connectionId: EntityId;
  ownerUserId: EntityId;
  sourceInstanceId: string;
  sourceUserId: string;
  displayName: string;
  isActive: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ElmaUser {
  userId: string;
  fullName: string;
  email?: string;
}

export interface ElmaNamespace {
  namespace: string;
  title: string;
}

export interface ElmaApp {
  namespace: string;
  code: string;
  title: string;
}

export interface ElmaField {
  code: string;
  title: string;
  type: string;
  required: boolean;
}

export interface ElmaStatus {
  code: string;
  title: string;
}

export interface ElmaStatusGroup {
  code: string;
  title: string;
  statuses: ElmaStatus[];
}

export interface ElmaForm {
  formId: string;
  title: string;
}

export interface ElmaProcess {
  namespace: string;
  code: string;
  title: string;
}

export interface ElmaPage {
  pageId: string;
  title: string;
}

export interface ElmaGroup {
  groupId: string;
  title: string;
}

export interface ElmaRoleSubject {
  subjectType: "role" | "group" | "user" | "unknown";
  subjectId: string;
  displayName: string;
}

export interface ElmaAppSchema {
  namespace: string;
  appCode: string;
  fields: ElmaField[];
  statusGroups: ElmaStatusGroup[];
  forms: ElmaForm[];
}

export interface UserScopedContext {
  connectionId: EntityId;
  sourceUserId: string;
  sourceInstanceId: string;
  fetchedAt: IsoTimestamp;
  user: ElmaUser;
  namespaces: ElmaNamespace[];
  apps: ElmaApp[];
  appSchemas: ElmaAppSchema[];
  pages: ElmaPage[];
  processes: ElmaProcess[];
  groups: ElmaGroup[];
  roleSubjects: ElmaRoleSubject[];
}

export interface CompactPromptContext {
  compactVersion: string;
  summary: string;
  appOverview: Array<{ namespace: string; appCode: string; title: string }>;
  processOverview: Array<{ namespace: string; code: string; title: string }>;
  knownLimitations: string[];
}

export interface ContextSnapshot {
  snapshotId: EntityId;
  connectionId: EntityId;
  sourceUserId: string;
  sourceInstanceId: string;
  contextVersion: string;
  schemaHash: string;
  fetchedAt: IsoTimestamp;
  mode: "raw_debug" | "normalized_full" | "compact_for_prompt";
  status: "created" | "ready" | "failed";
}

export interface ChatSession {
  sessionId: EntityId;
  ownerUserId: EntityId;
  connectionId: EntityId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ChatMessage {
  messageId: EntityId;
  sessionId: EntityId;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: IsoTimestamp;
}

export interface PromptTrace {
  traceId: EntityId;
  sessionId: EntityId;
  snapshotId: EntityId;
  promptMode: "ask_system" | "solution_assistant" | "context_inspect";
  provider: string;
  model: string;
  latencyMs: number;
  createdAt: IsoTimestamp;
  tokenMetadata?: Record<string, unknown>;
  errorMetadata?: Record<string, unknown>;
}

export interface ModelResponse {
  answer: string;
  rawOutput?: unknown;
  usedModel: string;
}

export interface ContextGapReport {
  missingEntities: string[];
  assumptions: string[];
  recommendations: string[];
}

export interface IdentityResolver {
  resolveCurrentUserId(): Promise<EntityId>;
}

export interface TokenProvider {
  getTokenForConnection(connectionId: EntityId): Promise<string>;
}

export interface ConnectionRepository {
  create(connection: ElmaConnection): Promise<void>;
  listByOwner(ownerUserId: EntityId): Promise<ElmaConnection[]>;
  getById(connectionId: EntityId): Promise<ElmaConnection | null>;
}

export interface ContextPolicy {
  isSnapshotStale(snapshot: ContextSnapshot): boolean;
}

export interface PromptPolicy {
  buildSystemPrompt(mode: PromptTrace["promptMode"]): string;
}

export interface LLMProvider {
  createResponse(input: {
    mode: PromptTrace["promptMode"];
    question: string;
    compactContext: CompactPromptContext;
  }): Promise<ModelResponse>;
}

export interface SnapshotRepository {
  saveSnapshot(snapshot: ContextSnapshot): Promise<void>;
  getLatestByConnection(connectionId: EntityId): Promise<ContextSnapshot | null>;
}
