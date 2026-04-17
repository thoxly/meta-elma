import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../app-context.js";
import { requireAuth } from "../../shared/http/auth.js";
import { HttpError } from "../../shared/http/errors.js";
import { nowIso } from "../../shared/utils/time.js";
import { buildCompactPromptContext } from "@meta-elma/context-engine";

export function registerChatRoutes(app: FastifyInstance, context: AppContext): void {
  const { storage, elma, llm, cryptoBox } = context;

  app.post("/chat", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const body = z.object({
      connectionId: z.string().min(1),
      question: z.string().min(1),
      chatSessionId: z.string().optional(),
      entity: z.string().optional()
    }).parse(request.body);

    const connection = await storage.getConnectionById(body.connectionId);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    const credential = await storage.getForUserAndConnection(auth.userId, body.connectionId);
    if (!credential?.encryptedElmaToken || !credential.encryptedLlmToken) {
      throw new HttpError(400, "ELMA and LLM credentials are required", "CREDENTIALS_REQUIRED");
    }
    const snapshot = await storage.getCurrentSnapshotForConnection(body.connectionId);
    if (!snapshot) throw new HttpError(400, "Snapshot required before chat", "SNAPSHOT_REQUIRED");
    const semantic = await storage.getCurrentSemanticMappingForConnection(body.connectionId);
    if (!semantic || semantic.snapshotId !== snapshot.snapshotId) {
      throw new HttpError(400, "Semantic model must be generated for current snapshot", "SEMANTIC_REQUIRED");
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
        createdAt: nowIso(),
        updatedAt: nowIso()
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
      createdAt: nowIso()
    });
    await storage.saveMessage({
      chatMessageId: crypto.randomUUID(),
      chatSessionId,
      role: "assistant",
      content: generated.answer,
      createdAt: nowIso()
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
      createdAt: nowIso()
    });

    return { chatSessionId, answer: generated.answer, traceId };
  });

  app.get("/chat/sessions", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    return { items: await storage.listSessions(auth.userId) };
  });

  app.get("/chat/sessions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const session = await storage.getSession(id);
    if (!session || session.userId !== auth.userId) throw new HttpError(404, "Session not found", "SESSION_NOT_FOUND");
    return { session, messages: await storage.listMessages(id) };
  });
}
