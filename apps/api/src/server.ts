import Fastify from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildCompactPromptContext } from "@meta-elma/context-engine";
import { HttpElmaClient } from "@meta-elma/elma-adapter";
import { OpenAIResponsesProvider } from "@meta-elma/llm-adapter";
import { AesCredentialCrypto, BcryptPasswordHasher, JwtTokenService } from "@meta-elma/security";
import { YdbStorage } from "@meta-elma/storage";
import type { AuthContext, SemanticMappingDraft } from "@meta-elma/domain";

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

  const tokens = tokenService.createTokens({ userId, companyId, email: body.email });
  await storage.createRefreshSession({
    sessionId: crypto.randomUUID(),
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
  const tokens = tokenService.createTokens({ userId: user.userId, companyId: user.companyId, email: user.email });
  await storage.createRefreshSession({
    sessionId: crypto.randomUUID(),
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
  const body = z.object({ displayName: z.string().min(1), baseUrl: z.string().url() }).parse(request.body);
  const connection = {
    connectionId: crypto.randomUUID(),
    companyId: auth.companyId,
    system: "elma365" as const,
    displayName: body.displayName,
    baseUrl: body.baseUrl,
    createdByUserId: auth.userId,
    createdAt: now(),
    updatedAt: now()
  };
  await storage.createConnection(connection);
  return reply.code(201).send(connection);
});

app.get("/connections", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const all = await storage.listByCompany(auth.companyId);
  const userCreds = await storage.listForUser(auth.userId);
  const visible = all.filter((connection) => userCreds.some((cred) => cred.connectionId === connection.connectionId));
  return { items: visible };
});

app.put("/connections/:id/credentials", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const params = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = z.object({ elmaToken: z.string().min(1), llmToken: z.string().optional() }).parse(request.body);
  const connection = await storage.getConnectionById(params.id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });

  const validation = await elma.validateCredential(connection.baseUrl, body.elmaToken);
  if (!validation.ok) return reply.code(400).send({ error: "ELMA token validation failed" });

  const current = await storage.getForUserAndConnection(auth.userId, params.id);
  await storage.upsert({
    credentialId: current?.credentialId ?? crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: params.id,
    userId: auth.userId,
    encryptedElmaToken: cryptoBox.encrypt(body.elmaToken),
    encryptedLlmToken: body.llmToken ? cryptoBox.encrypt(body.llmToken) : null,
    encryptionVersion: cryptoBox.version(),
    isValid: true,
    createdAt: current?.createdAt ?? now(),
    updatedAt: now()
  });
  return { ok: true };
});

app.post("/connections/:id/snapshot/refresh", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const connection = await storage.getConnectionById(id);
  if (!connection || connection.companyId !== auth.companyId) return reply.code(404).send({ error: "Connection not found" });
  const credential = await storage.getForUserAndConnection(auth.userId, id);
  if (!credential?.isValid) return reply.code(400).send({ error: "Attach valid credential first" });

  const payload = await elma.collectStructuralSnapshot(connection.baseUrl, cryptoBox.decrypt(credential.encryptedElmaToken));
  const current = await storage.getCurrentSnapshotForConnection(id);
  const snapshot = {
    snapshotId: crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: id,
    version: (current?.version ?? 0) + 1,
    schemaHash: hashOf(payload),
    status: "ready" as const,
    payload,
    createdByUserId: auth.userId,
    createdAt: now()
  };
  await storage.saveSnapshot(snapshot);
  return { snapshotId: snapshot.snapshotId, version: snapshot.version };
});

app.post("/connections/:id/semantic/generate", async (request, reply) => {
  const auth = await requireAuth(request as never, reply as never);
  if (!auth) return;
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const snapshot = await storage.getCurrentSnapshotForConnection(id);
  if (!snapshot || snapshot.companyId !== auth.companyId) return reply.code(404).send({ error: "Snapshot not found" });
  const credential = await storage.getForUserAndConnection(auth.userId, id);
  if (!credential?.encryptedLlmToken) return reply.code(400).send({ error: "LLM token is required" });

  const draft = await llm.generateSemanticDraft(
    { snapshot: snapshot.payload },
    cryptoBox.decrypt(credential.encryptedLlmToken)
  );
  const current = await storage.getCurrentSemanticMappingForConnection(id);
  await storage.saveSemanticMapping({
    semanticMappingId: current?.semanticMappingId ?? crypto.randomUUID(),
    companyId: auth.companyId,
    connectionId: id,
    snapshotId: snapshot.snapshotId,
    version: (current?.version ?? 0) + 1,
    draft,
    isEdited: false,
    createdByUserId: auth.userId,
    createdAt: current?.createdAt ?? now(),
    updatedAt: now()
  });
  return { ok: true };
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
