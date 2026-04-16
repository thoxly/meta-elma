import Fastify from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildCompactPromptContext } from "@meta-elma/context-engine";
import { HttpElmaClient } from "@meta-elma/elma-adapter";
import { OpenAIResponsesProvider } from "@meta-elma/llm-adapter";
import { AesCredentialCrypto, BcryptPasswordHasher, JwtTokenService } from "@meta-elma/security";
import { YdbStorage } from "@meta-elma/storage";
import type { AuthContext, Connection, ConnectionJob, ConnectionLifecycleStatus, SemanticMappingDraft } from "@meta-elma/domain";
import { isStructuralSnapshotMeaningful, toConnectionSchemaResponse } from "./connection-schema.js";

const app = Fastify({ logger: true });
const storage = new YdbStorage({
  endpoint: process.env.YDB_ENDPOINT ?? "grpc://localhost:2136",
  database: process.env.YDB_DATABASE ?? "/local",
  authToken: process.env.YDB_TOKEN
});
const elma = new HttpElmaClient({ baseUrl: process.env.ELMA_BASE_URL ?? "https://api.elma365.com" });
const llm = new OpenAIResponsesProvider({ model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" });
const hasher = new BcryptPasswordHasher();
const tokenService = new JwtTokenService(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
  process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret"
);
const cryptoBox = new AesCredentialCrypto(process.env.CREDENTIAL_MASTER_SECRET ?? "dev-master-secret");

function now(): string {
  return new Date().toISOString();
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeElmaBaseUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") {
    throw new Error("ELMA base URL must use https");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

async function runConnectionJob(input: {
  job: ConnectionJob;
  connection: Connection;
  auth: AuthContext;
}): Promise<void> {
  const { job, connection, auth } = input;
  const startedAt = now();
  await storage.updateJob({ ...job, status: "running", updatedAt: startedAt });
  try {
    if (job.type === "refresh_schema") {
      const credential = await storage.getForUserAndConnection(auth.userId, connection.connectionId);
      if (!credential?.isValid) {
        throw new Error("Valid ELMA credential is required");
      }
      const payload = await elma.collectStructuralSnapshot(connection.baseUrl, cryptoBox.decrypt(credential.encryptedElmaToken));
      const current = await storage.getCurrentSnapshotForConnection(connection.connectionId);
      const snapshot = {
        snapshotId: crypto.randomUUID(),
        companyId: auth.companyId,
        connectionId: connection.connectionId,
        version: (current?.version ?? 0) + 1,
        schemaHash: hashOf(payload),
        status: "ready" as const,
        payload,
        createdByUserId: auth.userId,
        createdAt: now()
      };
      await storage.saveSnapshot(snapshot);
      await storage.updateJob({
        ...job,
        status: "succeeded",
        error: null,
        result: { snapshotId: snapshot.snapshotId, version: snapshot.version },
        updatedAt: now()
      });
      return;
    }

    if (job.type === "generate_semantic") {
      const snapshot = await storage.getCurrentSnapshotForConnection(connection.connectionId);
      if (!snapshot || snapshot.companyId !== auth.companyId) {
        throw new Error("Snapshot is required");
      }
      const credential = await storage.getForUserAndConnection(auth.userId, connection.connectionId);
      if (!credential?.encryptedLlmToken) {
        throw new Error("LLM token is required");
      }
      const draft = await llm.generateSemanticDraft(
        { snapshot: snapshot.payload },
        cryptoBox.decrypt(credential.encryptedLlmToken)
      );
      const current = await storage.getCurrentSemanticMappingForConnection(connection.connectionId);
      const mapping = {
        semanticMappingId: current?.semanticMappingId ?? crypto.randomUUID(),
        companyId: auth.companyId,
        connectionId: connection.connectionId,
        snapshotId: snapshot.snapshotId,
        version: (current?.version ?? 0) + 1,
        draft,
        isEdited: false,
        createdByUserId: auth.userId,
        createdAt: current?.createdAt ?? now(),
        updatedAt: now()
      };
      await storage.saveSemanticMapping(mapping);
      await storage.updateJob({
        ...job,
        status: "succeeded",
        error: null,
        result: { semanticMappingId: mapping.semanticMappingId, version: mapping.version },
        updatedAt: now()
      });
      return;
    }
  } catch (error) {
    await storage.updateJob({
      ...job,
      status: "failed",
      error: error instanceof Error ? error.message : "Job failed",
      result: null,
      updatedAt: now()
    });
  }
}

async function deriveConnectionState(auth: AuthContext, connection: Connection) {
  const credential = await storage.getForUserAndConnection(auth.userId, connection.connectionId);
  const snapshot = await storage.getCurrentSnapshotForConnection(connection.connectionId);
  const semantic = await storage.getCurrentSemanticMappingForConnection(connection.connectionId);
  const jobs = await storage.listJobsForConnection(connection.connectionId);
  const activeSchemaJob = jobs.find((job) => job.type === "refresh_schema" && (job.status === "queued" || job.status === "running"));
  const activeSemanticJob = jobs.find((job) => job.type === "generate_semantic" && (job.status === "queued" || job.status === "running"));

  const hasElmaToken = Boolean(credential?.encryptedElmaToken);
  const hasLlmToken = Boolean(credential?.encryptedLlmToken);
  const credentialsValid = Boolean(credential?.isValid);
  const snapshotReady = Boolean(snapshot?.status === "ready" && isStructuralSnapshotMeaningful(snapshot.payload));
  const semanticMatchesSnapshot = Boolean(semantic && snapshot && semantic.snapshotId === snapshot.snapshotId);
  const semanticReady = Boolean(semantic && semanticMatchesSnapshot);

  let status: ConnectionLifecycleStatus = "requires_action";
  if (!hasElmaToken) {
    status = "requires_elma_token";
  } else if (!credentialsValid) {
    status = "elma_invalid";
  } else if (activeSchemaJob) {
    status = "schema_syncing";
  } else if (!snapshotReady) {
    status = "schema_missing";
  } else if (!hasLlmToken) {
    status = "llm_missing";
  } else if (activeSemanticJob) {
    status = "semantic_generating";
  } else if (!semanticReady) {
    status = "semantic_missing";
  } else {
    status = "ready_for_chat";
  }

  const nextActions: string[] = [];
  if (!hasElmaToken) nextActions.push("add_elma_token");
  if (hasElmaToken && !credentialsValid) nextActions.push("validate_elma_token");
  if (credentialsValid && !snapshotReady && !activeSchemaJob) nextActions.push("refresh_schema");
  if (snapshotReady && !hasLlmToken) nextActions.push("add_llm_token");
  if (snapshotReady && hasLlmToken && !semanticReady && !activeSemanticJob) nextActions.push("generate_semantic");
  if (status === "ready_for_chat") nextActions.push("open_chat");

  return {
    connection,
    status,
    nextActions,
    health: {
      hasElmaToken,
      hasLlmToken,
      credentialsValid,
      snapshotReady,
      semanticReady,
      semanticMatchesSnapshot
    },
    capabilities: {
      canSaveElmaToken: true,
      canRefreshSchema: credentialsValid && !Boolean(activeSchemaJob),
      canSaveLlmToken: snapshotReady,
      canGenerateSemantic: snapshotReady && hasLlmToken && !Boolean(activeSemanticJob),
      canChat: snapshotReady && hasLlmToken && semanticReady
    },
    latest: {
      snapshotVersion: snapshot?.version ?? null,
      snapshotUpdatedAt: snapshot?.createdAt ?? null,
      semanticVersion: semantic?.version ?? null,
      semanticUpdatedAt: semantic?.updatedAt ?? null,
      semanticSnapshotId: semantic?.snapshotId ?? null
    }
  };
}

async function requireAuth(request: { headers: Record<string, unknown> }, reply: { code: (x: number) => { send: (x: unknown) => void } }): Promise<AuthContext | null> {
  const raw = String(request.headers.authorization ?? "");
  if (!raw.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  try {
    return tokenService.verifyAccessToken(raw.slice(7));
  } catch {
    reply.code(401).send({ error: "Invalid token" });
    return null;
  }
}

app.get("/health", async () => ({ status: "ok" }));
app.get("/ready", async (_request, reply) => {
  try {
    await storage.ping();
    return { status: "ready", checks: ["api", "ydb"] };
  } catch {
    return reply.code(503).send({ status: "not_ready", checks: ["api"], failed: ["ydb"] });
  }
});

app.post("/auth/register", async (request, reply) => {
  const body = z.object({
    companyName: z.string().min(1),
    fullName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8)
  }).parse(request.body);

  const existing = await storage.getByEmail(body.email);
  if (existing) return reply.code(409).send({ error: "Email already exists" });

  const companyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await storage.createCompany({ companyId, name: body.companyName, createdAt: now() });
  await storage.createUser({
    userId,
    companyId,
    email: body.email,
    fullName: body.fullName,
    passwordHash: await hasher.hash(body.password),
    isActive: true,
    createdAt: now(),
    updatedAt: now()
  });

  const sessionId = crypto.randomUUID();
  const tokens = tokenService.createTokens({ userId, companyId, email: body.email, sessionId });
  await storage.createRefreshSession({
    sessionId,
    userId,
    refreshTokenHash: tokenService.hashRefreshToken(tokens.refreshToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    createdAt: now()
  });

  return reply.code(201).send({ tokens, user: { userId, companyId, email: body.email, fullName: body.fullName } });
});

app.post("/auth/login", async (request, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const user = await storage.getByEmail(body.email);
  if (!user || !(await hasher.verify(body.password, user.passwordHash))) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }
  const sessionId = crypto.randomUUID();
  const tokens = tokenService.createTokens({ userId: user.userId, companyId: user.companyId, email: user.email, sessionId });
  await storage.createRefreshSession({
    sessionId,
    userId: user.userId,
    refreshTokenHash: tokenService.hashRefreshToken(tokens.refreshToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    createdAt: now()
  });
  return { tokens, user: { userId: user.userId, companyId: user.companyId, email: user.email, fullName: user.fullName } };
});

app.post("/connections", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const body = z.object({ displayName: z.string().min(1), baseUrl: z.string().url(), elmaToken: z.string().min(1) }).parse(request.body);
  const normalizedBaseUrl = normalizeElmaBaseUrl(body.baseUrl);
  const validation = await elma.validateCredential(normalizedBaseUrl, body.elmaToken);
  if (!validation.ok) {
    return reply.code(400).send({ error: "ELMA URL or token is invalid" });
  }
  const connection = {
    connectionId: crypto.randomUUID(),
    companyId: auth.companyId,
    system: "elma365" as const,
    displayName: body.displayName,
    baseUrl: normalizedBaseUrl,
    createdByUserId: auth.userId,
    createdAt: now(),
    updatedAt: now()
  };
  await storage.createConnection(connection);
  await storage.upsert({
    credentialId: crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: connection.connectionId,
    userId: auth.userId,
    encryptedElmaToken: cryptoBox.encrypt(body.elmaToken),
    encryptedLlmToken: null,
    encryptionVersion: cryptoBox.version(),
    isValid: true,
    invalidReason: undefined,
    lastValidatedAt: now(),
    lastValidationError: undefined,
    createdAt: now(),
    updatedAt: now()
  });
  return reply.code(201).send(connection);
});

app.delete("/connections/:id", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  await storage.deleteConnectionLifecycle(id);
  return { ok: true };
});

app.get("/connections", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const all = await storage.listByCompany(auth.companyId);
  const items = await Promise.all(all.map((connection) => deriveConnectionState(auth, connection)));
  return { items };
});

app.get("/connections/:id/state", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  return deriveConnectionState(auth, connection);
});

app.put("/connections/:id/elma-credentials", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({ elmaToken: z.string().min(1) }).parse(request.body);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const current = await storage.getForUserAndConnection(auth.userId, id);
  await storage.upsert({
    credentialId: current?.credentialId ?? crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: id,
    userId: auth.userId,
    encryptedElmaToken: cryptoBox.encrypt(body.elmaToken),
    encryptedLlmToken: current?.encryptedLlmToken ?? null,
    encryptionVersion: cryptoBox.version(),
    isValid: current?.isValid ?? false,
    invalidReason: current?.invalidReason,
    lastValidatedAt: current?.lastValidatedAt,
    lastValidationError: current?.lastValidationError,
    createdAt: current?.createdAt ?? now(),
    updatedAt: now()
  });
  return { ok: true };
});

app.post("/connections/:id/elma-credentials/validate", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const current = await storage.getForUserAndConnection(auth.userId, id);
  if (!current?.encryptedElmaToken) return reply.code(400).send({ error: "ELMA token is required" });

  const validation = await elma.validateCredential(connection.baseUrl, cryptoBox.decrypt(current.encryptedElmaToken));
  const isValid = validation.ok;
  const errorMessage = validation.ok ? undefined : "ELMA token validation failed";
  await storage.upsert({
    credentialId: current?.credentialId ?? crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: id,
    userId: auth.userId,
    encryptedElmaToken: current.encryptedElmaToken,
    encryptedLlmToken: current.encryptedLlmToken,
    encryptionVersion: cryptoBox.version(),
    isValid,
    invalidReason: errorMessage,
    lastValidatedAt: now(),
    lastValidationError: errorMessage,
    createdAt: current?.createdAt ?? now(),
    updatedAt: now()
  });
  if (!isValid) {
    return reply.code(400).send({ error: errorMessage });
  }
  return { ok: true, externalUserId: validation.externalUserId };
});

app.put("/connections/:id/llm-settings", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({ llmToken: z.string().min(1) }).parse(request.body);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const credential = await storage.getForUserAndConnection(auth.userId, id);
  if (!credential?.encryptedElmaToken) return reply.code(400).send({ error: "ELMA token is required first" });

  await storage.upsert({
    credentialId: credential.credentialId,
    companyId: auth.companyId,
    connectionId: id,
    userId: auth.userId,
    encryptedElmaToken: credential.encryptedElmaToken,
    encryptedLlmToken: cryptoBox.encrypt(body.llmToken),
    encryptionVersion: cryptoBox.version(),
    isValid: credential.isValid,
    invalidReason: credential.invalidReason,
    lastValidatedAt: credential.lastValidatedAt,
    lastValidationError: credential.lastValidationError,
    createdAt: credential.createdAt,
    updatedAt: now()
  });
  return { ok: true };
});

app.post("/connections/:id/llm-settings/validate", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const snapshot = await storage.getCurrentSnapshotForConnection(id);
  if (!snapshot || snapshot.companyId !== auth.companyId) return reply.code(404).send({ error: "Snapshot not found" });
  const credential = await storage.getForUserAndConnection(auth.userId, id);
  if (!credential?.encryptedLlmToken) return reply.code(400).send({ error: "LLM token is required" });
  await llm.generateSemanticDraft({ snapshot: { ...snapshot.payload, apps: snapshot.payload.apps.slice(0, 1) } }, cryptoBox.decrypt(credential.encryptedLlmToken));
  return { ok: true };
});

app.post("/connections/:id/jobs", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({ type: z.enum(["refresh_schema", "generate_semantic"]) }).parse(request.body);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const alreadyRunning = await storage.listRunningJobs(id, body.type);
  if (alreadyRunning.length > 0) {
    return reply.code(409).send({ error: "A job of this type is already running" });
  }
  const job: ConnectionJob = {
    jobId: crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: id,
    userId: auth.userId,
    type: body.type,
    status: "queued",
    error: null,
    result: null,
    createdAt: now(),
    updatedAt: now()
  };
  await storage.createJob(job);
  setTimeout(() => {
    void runConnectionJob({ job, connection, auth });
  }, 0);
  return reply.code(202).send({ jobId: job.jobId, status: job.status });
});

app.get("/connections/:id/jobs", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const jobs = await storage.listJobsForConnection(id);
  return { items: jobs };
});

app.get("/jobs/:jobId", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { jobId } = z.object({ jobId: z.string().min(1) }).parse(request.params);
  const job = await storage.getJobById(jobId);
  if (!job || job.companyId !== auth.companyId) return reply.code(404).send({ error: "Job not found" });
  return job;
});

app.get("/connections/:id/schema", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const snapshot = await storage.getCurrentSnapshotForConnection(id);
  if (!snapshot || snapshot.companyId !== auth.companyId) return reply.code(404).send({ error: "Schema snapshot not found" });
  return toConnectionSchemaResponse(snapshot);
});

app.get("/connections/:id/semantic", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const mapping = await storage.getCurrentSemanticMappingForConnection(id);
  if (!mapping || mapping.companyId !== auth.companyId) return reply.code(404).send({ error: "Semantic mapping not found" });
  return mapping;
});

app.put("/connections/:id/semantic", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({
    entities: z.array(z.object({ entityKey: z.string(), businessName: z.string(), description: z.string(), confidence: z.number() })),
    relationNotes: z.array(z.object({ from: z.string(), to: z.string(), meaning: z.string() }))
  }).parse(request.body) as SemanticMappingDraft;
  const current = await storage.getCurrentSemanticMappingForConnection(id);
  if (!current || current.companyId !== auth.companyId) return reply.code(404).send({ error: "Semantic mapping not found" });
  await storage.saveSemanticMapping({ ...current, draft: body, isEdited: true, updatedAt: now() });
  return { ok: true };
});

app.post("/chat", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const body = z.object({
    connectionId: z.string().min(1),
    question: z.string().min(1),
    chatSessionId: z.string().optional(),
    entity: z.string().optional()
  }).parse(request.body);
  const connection = await storage.getConnectionById(body.connectionId);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const credential = await storage.getForUserAndConnection(auth.userId, body.connectionId);
  if (!credential?.encryptedElmaToken || !credential.encryptedLlmToken) {
    return reply.code(400).send({ error: "ELMA and LLM credentials are required" });
  }
  const snapshot = await storage.getCurrentSnapshotForConnection(body.connectionId);
  if (!snapshot) return reply.code(400).send({ error: "Snapshot required before chat" });
  const semantic = await storage.getCurrentSemanticMappingForConnection(body.connectionId);
  if (!semantic || semantic.snapshotId !== snapshot.snapshotId) {
    return reply.code(400).send({ error: "Semantic model must be generated for current snapshot" });
  }

  const chatSessionId = body.chatSessionId ?? crypto.randomUUID();
  const existingSession = await storage.getSession(chatSessionId);
  if (!existingSession) {
    await storage.createSession({
      chatSessionId,
      companyId: auth.companyId,
      userId: auth.userId,
      connectionId: body.connectionId,
      title: body.question.slice(0, 60),
      createdAt: now(),
      updatedAt: now()
    });
  }

  const compactContext = buildCompactPromptContext(snapshot);
  const liveFacts = body.entity
    ? [
        {
          summary: `Search in ${body.entity}`,
          records: await elma.searchRecords({
            baseUrl: connection.baseUrl,
            token: cryptoBox.decrypt(credential.encryptedElmaToken),
            entity: body.entity,
            query: body.question
          })
        }
      ]
    : [];
  const generated = await llm.generateAnswer(
    { question: body.question, compactContext, liveFacts },
    cryptoBox.decrypt(credential.encryptedLlmToken)
  );
  await storage.saveMessage({
    chatMessageId: crypto.randomUUID(),
    chatSessionId,
    role: "user",
    content: body.question,
    createdAt: now()
  });
  await storage.saveMessage({
    chatMessageId: crypto.randomUUID(),
    chatSessionId,
    role: "assistant",
    content: generated.answer,
    createdAt: now()
  });

  const traceId = crypto.randomUUID();
  await storage.saveTrace({
    traceId,
    companyId: auth.companyId,
    userId: auth.userId,
    connectionId: body.connectionId,
    chatSessionId,
    snapshotId: snapshot.snapshotId,
    question: body.question,
    plannerOutput: { strategy: body.entity ? "lookup_plus_summary" : "summary_only" },
    selectedTools: body.entity ? ["searchRecords"] : [],
    compactContext,
    responseMeta: { usedModel: generated.usedModel, factsCount: liveFacts.length },
    error: null,
    createdAt: now()
  });

  return { chatSessionId, answer: generated.answer, traceId };
});

app.get("/chat/sessions", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  return { items: await storage.listSessions(auth.userId) };
});

app.get("/chat/sessions/:id", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const session = await storage.getSession(id);
  if (!session || session.userId !== auth.userId) return reply.code(404).send({ error: "Session not found" });
  return { session, messages: await storage.listMessages(id) };
});

app.get("/traces/:id", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const trace = await storage.getTraceById(id);
  if (!trace || trace.companyId !== auth.companyId) return reply.code(404).send({ error: "Trace not found" });
  return trace;
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
