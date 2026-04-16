export type EntityId = string;
export type IsoTimestamp = string;

export type ExternalSystem = "elma365";

export interface Company {
  companyId: EntityId;
  name: string;
  createdAt: IsoTimestamp;
}

export interface User {
  userId: EntityId;
  companyId: EntityId;
  email: string;
  passwordHash: string;
  fullName: string;
  isActive: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface RefreshSession {
  sessionId: EntityId;
  userId: EntityId;
  refreshTokenHash: string;
  expiresAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
}

export interface Connection {
  connectionId: EntityId;
  companyId: EntityId;
  system: ExternalSystem;
  displayName: string;
  baseUrl: string;
  createdByUserId: EntityId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface UserConnectionCredential {
  credentialId: EntityId;
  companyId: EntityId;
  connectionId: EntityId;
  userId: EntityId;
  encryptedElmaToken: string;
  encryptedLlmToken: string | null;
  encryptionVersion: string;
  isValid: boolean;
  invalidReason?: string;
  lastValidatedAt?: IsoTimestamp;
  lastValidationError?: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
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

export interface ConnectionCapabilities {
  canSaveElmaToken: boolean;
  canRefreshSchema: boolean;
  canSaveLlmToken: boolean;
  canGenerateSemantic: boolean;
  canChat: boolean;
}

export interface ConnectionLatestState {
  snapshotVersion: number | null;
  snapshotUpdatedAt: IsoTimestamp | null;
  semanticVersion: number | null;
  semanticUpdatedAt: IsoTimestamp | null;
  semanticSnapshotId: EntityId | null;
}

export interface ConnectionState {
  connection: Connection;
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
  capabilities: ConnectionCapabilities;
  latest: ConnectionLatestState;
}

export type ConnectionJobType = "refresh_schema" | "generate_semantic";
export type ConnectionJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface ConnectionJob {
  jobId: EntityId;
  companyId: EntityId;
  connectionId: EntityId;
  userId: EntityId;
  type: ConnectionJobType;
  status: ConnectionJobStatus;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface SnapshotNamespace {
  namespace: string;
  title: string;
}

export interface SnapshotField {
  code: string;
  title: string;
  type: string;
  required: boolean;
  relationHint?: string;
}

export interface SnapshotApp {
  namespace: string;
  code: string;
  title: string;
  fields: SnapshotField[];
  statuses: Array<{ code: string; title: string }>;
}

export interface SnapshotPage {
  pageId: string;
  title: string;
}

export interface SnapshotProcess {
  namespace: string;
  code: string;
  title: string;
}

export interface SnapshotGroup {
  groupId: string;
  title: string;
}

export interface StructuralSnapshotPayload {
  namespaces: SnapshotNamespace[];
  apps: SnapshotApp[];
  pages: SnapshotPage[];
  processes: SnapshotProcess[];
  groups: SnapshotGroup[];
  relationHints: Array<{ from: string; to: string; reason: string }>;
}

export interface Snapshot {
  snapshotId: EntityId;
  companyId: EntityId;
  connectionId: EntityId;
  version: number;
  schemaHash: string;
  status: "ready" | "failed";
  payload: StructuralSnapshotPayload;
  createdByUserId: EntityId;
  createdAt: IsoTimestamp;
}

export interface SemanticMappingDraft {
  entities: Array<{
    entityKey: string;
    businessName: string;
    description: string;
    confidence: number;
  }>;
  relationNotes: Array<{ from: string; to: string; meaning: string }>;
}

export interface SemanticMapping {
  semanticMappingId: EntityId;
  companyId: EntityId;
  connectionId: EntityId;
  snapshotId: EntityId;
  version: number;
  draft: SemanticMappingDraft;
  isEdited: boolean;
  createdByUserId: EntityId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ChatSession {
  chatSessionId: EntityId;
  companyId: EntityId;
  userId: EntityId;
  connectionId: EntityId;
  title: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ChatMessage {
  chatMessageId: EntityId;
  chatSessionId: EntityId;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: IsoTimestamp;
}

export interface CompactContext {
  snapshotId: EntityId;
  summary: string;
  appOverview: Array<{ key: string; title: string }>;
  processOverview: Array<{ key: string; title: string }>;
}

export interface Trace {
  traceId: EntityId;
  companyId: EntityId;
  userId: EntityId;
  connectionId: EntityId;
  chatSessionId: EntityId;
  snapshotId: EntityId | null;
  question: string;
  plannerOutput: Record<string, unknown>;
  selectedTools: string[];
  compactContext: CompactContext | null;
  responseMeta: Record<string, unknown>;
  error: string | null;
  createdAt: IsoTimestamp;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthContext {
  userId: EntityId;
  companyId: EntityId;
  email: string;
}

export interface RefreshTokenPayload extends AuthContext {
  sessionId: EntityId;
  type: "refresh";
}

export interface LiveRecord {
  entity: string;
  id: string;
  fields: Record<string, unknown>;
}

export interface LiveQueryResult {
  summary: string;
  records: LiveRecord[];
}

export interface LlmGenerateInput {
  question: string;
  compactContext: CompactContext;
  liveFacts: LiveQueryResult[];
}

export interface LlmGenerateOutput {
  answer: string;
  usedModel: string;
}

export interface LlmSemanticInput {
  snapshot: StructuralSnapshotPayload;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface TokenService {
  createTokens(input: { userId: EntityId; companyId: EntityId; email: string; sessionId: EntityId }): AuthTokens;
  verifyAccessToken(accessToken: string): AuthContext;
  verifyRefreshToken(refreshToken: string): RefreshTokenPayload;
  hashRefreshToken(refreshToken: string): string;
}

export interface CredentialCrypto {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
  version(): string;
}

export interface ElmaConnector {
  validateCredential(baseUrl: string, token: string): Promise<{ ok: boolean; externalUserId?: string }>;
  collectStructuralSnapshot(baseUrl: string, token: string): Promise<StructuralSnapshotPayload>;
  searchRecords(input: { baseUrl: string; token: string; entity: string; query: string }): Promise<LiveRecord[]>;
  getRelatedRecords(input: {
    baseUrl: string;
    token: string;
    entity: string;
    recordId: string;
    relatedEntity: string;
  }): Promise<LiveRecord[]>;
}

export interface LlmProvider {
  generateAnswer(input: LlmGenerateInput, llmToken: string): Promise<LlmGenerateOutput>;
  generateSemanticDraft(input: LlmSemanticInput, llmToken: string): Promise<SemanticMappingDraft>;
}

export interface CompanyRepository {
  createCompany(company: Company): Promise<void>;
  getCompanyById(companyId: EntityId): Promise<Company | null>;
}

export interface UserRepository {
  createUser(user: User): Promise<void>;
  getByEmail(email: string): Promise<User | null>;
  getUserById(userId: EntityId): Promise<User | null>;
}

export interface RefreshSessionRepository {
  createRefreshSession(session: RefreshSession): Promise<void>;
  getRefreshSessionById(sessionId: EntityId): Promise<RefreshSession | null>;
  revoke(sessionId: EntityId): Promise<void>;
}

export interface ConnectionRepository {
  createConnection(connection: Connection): Promise<void>;
  listByCompany(companyId: EntityId): Promise<Connection[]>;
  getConnectionById(connectionId: EntityId): Promise<Connection | null>;
}

export interface CredentialRepository {
  upsert(credential: UserConnectionCredential): Promise<void>;
  getForUserAndConnection(userId: EntityId, connectionId: EntityId): Promise<UserConnectionCredential | null>;
  listForUser(userId: EntityId): Promise<UserConnectionCredential[]>;
}

export interface SnapshotRepository {
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  getCurrentSnapshotForConnection(connectionId: EntityId): Promise<Snapshot | null>;
}

export interface SemanticMappingRepository {
  saveSemanticMapping(mapping: SemanticMapping): Promise<void>;
  getCurrentSemanticMappingForConnection(connectionId: EntityId): Promise<SemanticMapping | null>;
}

export interface ChatRepository {
  createSession(session: ChatSession): Promise<void>;
  getSession(chatSessionId: EntityId): Promise<ChatSession | null>;
  listSessions(userId: EntityId): Promise<ChatSession[]>;
  saveMessage(message: ChatMessage): Promise<void>;
  listMessages(chatSessionId: EntityId): Promise<ChatMessage[]>;
}

export interface TraceRepository {
  saveTrace(trace: Trace): Promise<void>;
  getTraceById(traceId: EntityId): Promise<Trace | null>;
}

export interface ConnectionJobRepository {
  createJob(job: ConnectionJob): Promise<void>;
  updateJob(job: ConnectionJob): Promise<void>;
  getJobById(jobId: EntityId): Promise<ConnectionJob | null>;
  listJobsForConnection(connectionId: EntityId): Promise<ConnectionJob[]>;
  listRunningJobs(connectionId: EntityId, type: ConnectionJobType): Promise<ConnectionJob[]>;
}
