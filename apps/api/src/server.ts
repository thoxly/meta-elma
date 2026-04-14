import Fastify from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildCompactPromptContext } from "@meta-elma/context-engine";
import type {
  ChatMessage,
  ChatSession,
  ContextSnapshot,
  ElmaConnection,
  TokenProvider,
  UserScopedContext
} from "@meta-elma/domain";
import { HttpElmaClient } from "@meta-elma/elma-adapter";
import { OpenAIResponsesProvider } from "@meta-elma/llm-adapter";
import {
  InMemoryConnectionRepository,
  InMemorySnapshotRepository
} from "@meta-elma/storage";

const app = Fastify({ logger: true });
const connectionRepo = new InMemoryConnectionRepository();
const snapshotRepo = new InMemorySnapshotRepository();
const llm = new OpenAIResponsesProvider();
const sessions = new Map<string, ChatSession>();
const messages = new Map<string, ChatMessage[]>();
const traces = new Map<string, Record<string, unknown>>();
const contexts = new Map<string, UserScopedContext>();

class EnvTokenProvider implements TokenProvider {
  async getTokenForConnection(_connectionId: string): Promise<string> {
    const token = process.env.ELMA_USER_TOKEN;
    if (!token) {
      throw new Error("ELMA_USER_TOKEN is not configured");
    }
    return token;
  }
}

const tokenProvider = new EnvTokenProvider();
const elmaClient = new HttpElmaClient({
  baseUrl: process.env.ELMA_BASE_URL ?? "https://api.elma365.com"
});

function fallbackContext(connection: ElmaConnection): UserScopedContext {
  return {
    connectionId: connection.connectionId,
    sourceUserId: connection.sourceUserId,
    sourceInstanceId: connection.sourceInstanceId,
    fetchedAt: new Date().toISOString(),
    user: { userId: connection.sourceUserId, fullName: connection.displayName },
    namespaces: [],
    apps: [],
    appSchemas: [],
    pages: [],
    processes: [],
    groups: [],
    roleSubjects: []
  };
}

function computeSchemaHash(context: UserScopedContext): string {
  const payload = JSON.stringify({
    namespaces: context.namespaces.map((item) => item.namespace).sort(),
    apps: context.apps.map((item) => `${item.namespace}:${item.code}`).sort(),
    processes: context.processes.map((item) => `${item.namespace}:${item.code}`).sort()
  });
  return createHash("sha256").update(payload).digest("hex");
}

app.addHook("onRequest", async (req) => {
  req.headers["x-request-id"] = req.headers["x-request-id"] ?? crypto.randomUUID();
});

app.get("/health", async () => ({ status: "ok" }));
app.get("/ready", async () => ({ status: "ready", checks: ["api"] }));

app.post("/connections", async (req, reply) => {
  const schema = z.object({
    ownerUserId: z.string().min(1),
    sourceInstanceId: z.string().min(1),
    sourceUserId: z.string().min(1),
    displayName: z.string().min(1)
  });
  const body = schema.parse(req.body);
  const now = new Date().toISOString();
  const connection = {
    connectionId: crypto.randomUUID(),
    ...body,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
  await connectionRepo.create(connection);
  return reply.code(201).send(connection);
});

app.get("/connections", async (req) => {
  const ownerUserId = String(req.query ? (req.query as Record<string, string>).ownerUserId ?? "" : "");
  return connectionRepo.listByOwner(ownerUserId);
});

app.post("/context/refresh", async (req, reply) => {
  const schema = z.object({ connectionId: z.string().min(1) });
  const body = schema.parse(req.body);
  const connection = await connectionRepo.getById(body.connectionId);
  if (!connection) {
    return reply.code(404).send({ error: "Connection not found" });
  }

  let context = fallbackContext(connection);
  let status: ContextSnapshot["status"] = "ready";
  try {
    const token = await tokenProvider.getTokenForConnection(connection.connectionId);
    context = await elmaClient.collectUserScopedContext(connection, token);
  } catch (error) {
    status = "failed";
    req.log.error({ error }, "Context refresh failed, using fallback context");
  }
  contexts.set(connection.connectionId, context);
  const snapshot: ContextSnapshot = {
    snapshotId: crypto.randomUUID(),
    connectionId: connection.connectionId,
    sourceUserId: connection.sourceUserId,
    sourceInstanceId: connection.sourceInstanceId,
    contextVersion: "v1",
    schemaHash: computeSchemaHash(context),
    fetchedAt: new Date().toISOString(),
    mode: "normalized_full",
    status
  };
  await snapshotRepo.saveSnapshot(snapshot);
  return { snapshotId: snapshot.snapshotId, status: snapshot.status };
});

app.get("/context/current", async (req, reply) => {
  const connectionId = String((req.query as Record<string, string>)?.connectionId ?? "");
  const snapshot = await snapshotRepo.getLatestByConnection(connectionId);
  if (!snapshot) {
    return reply.code(404).send({ error: "No snapshot found" });
  }
  return snapshot;
});

app.get("/context/current/compact", async (req, reply) => {
  const connectionId = String((req.query as Record<string, string>)?.connectionId ?? "");
  const context = contexts.get(connectionId);
  if (!context) {
    return reply.code(404).send({ error: "No context found. Call /context/refresh first." });
  }
  return buildCompactPromptContext(context);
});

app.post("/chat", async (req, reply) => {
  const schema = z.object({
    ownerUserId: z.string().min(1),
    connectionId: z.string().min(1),
    mode: z.enum(["ask_system", "solution_assistant", "context_inspect"]),
    question: z.string().min(1),
    sessionId: z.string().optional()
  });
  const body = schema.parse(req.body);

  const connection = await connectionRepo.getById(body.connectionId);
  if (!connection) {
    return reply.code(404).send({ error: "Connection not found" });
  }

  const sessionId = body.sessionId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      ownerUserId: body.ownerUserId,
      connectionId: body.connectionId,
      createdAt: now,
      updatedAt: now
    });
  }

  const compactContext = buildCompactPromptContext(
    contexts.get(connection.connectionId) ?? fallbackContext(connection)
  );

  const modelResponse = await llm.createResponse({
    mode: body.mode,
    question: body.question,
    compactContext
  });

  const traceId = crypto.randomUUID();
  traces.set(traceId, {
    traceId,
    sessionId,
    mode: body.mode,
    provider: "openai",
    model: modelResponse.usedModel,
    snapshotId: (await snapshotRepo.getLatestByConnection(connection.connectionId))?.snapshotId ?? null,
    compactContext,
    createdAt: now
  });

  const sessionMessages = messages.get(sessionId) ?? [];
  sessionMessages.push(
    { messageId: crypto.randomUUID(), sessionId, role: "user", content: body.question, createdAt: now },
    {
      messageId: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      content: modelResponse.answer,
      createdAt: new Date().toISOString()
    }
  );
  messages.set(sessionId, sessionMessages);

  return { sessionId, traceId, answer: modelResponse.answer };
});

app.get("/chat/sessions", async (req) => {
  const ownerUserId = String((req.query as Record<string, string>)?.ownerUserId ?? "");
  return [...sessions.values()].filter((session) => session.ownerUserId === ownerUserId);
});

app.get("/chat/sessions/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const session = sessions.get(id);
  if (!session) {
    return reply.code(404).send({ error: "Session not found" });
  }
  return {
    session,
    messages: messages.get(id) ?? []
  };
});

app.get("/debug/prompt/:traceId", async (req, reply) => {
  const { traceId } = req.params as { traceId: string };
  const trace = traces.get(traceId);
  if (!trace) {
    return reply.code(404).send({ error: "Trace not found" });
  }
  return trace;
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ host: "0.0.0.0", port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
