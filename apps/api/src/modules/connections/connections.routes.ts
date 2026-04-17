import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SemanticMappingDraft } from "@meta-elma/domain";
import type { AppContext } from "../../app-context.js";
import { requireAuth } from "../../shared/http/auth.js";
import { HttpError } from "../../shared/http/errors.js";
import { nowIso } from "../../shared/utils/time.js";
import { deriveConnectionState } from "./connection-lifecycle.service.js";

function normalizeElmaBaseUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") {
    throw new HttpError(400, "ELMA base URL must use https", "ELMA_HTTPS_REQUIRED");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function registerConnectionRoutes(app: FastifyInstance, context: AppContext): void {
  const { storage, elma, cryptoBox } = context;

  app.post("/connections", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const body = z.object({ displayName: z.string().min(1), baseUrl: z.string().url(), elmaToken: z.string().min(1) }).parse(request.body);
    const normalizedBaseUrl = normalizeElmaBaseUrl(body.baseUrl);
    const validation = await elma.validateCredential(normalizedBaseUrl, body.elmaToken);
    if (!validation.ok) {
      throw new HttpError(400, "ELMA URL or token is invalid", "INVALID_ELMA_CREDENTIAL");
    }
    const connection = {
      connectionId: crypto.randomUUID(),
      companyId: auth.companyId,
      system: "elma365" as const,
      displayName: body.displayName,
      baseUrl: normalizedBaseUrl,
      createdByUserId: auth.userId,
      createdAt: nowIso(),
      updatedAt: nowIso()
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
      lastValidatedAt: nowIso(),
      lastValidationError: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    return reply.code(201).send(connection);
  });

  app.delete("/connections/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    await storage.deleteConnectionLifecycle(id);
    return { ok: true };
  });

  app.get("/connections", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const all = await storage.listByCompany(auth.companyId);
    const items = await Promise.all(all.map((connection) => deriveConnectionState(context, auth, connection)));
    return { items };
  });

  app.get("/connections/:id/state", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    return deriveConnectionState(context, auth, connection);
  });

  app.put("/connections/:id/elma-credentials", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ elmaToken: z.string().min(1) }).parse(request.body);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
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
      createdAt: current?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    });
    return { ok: true };
  });

  app.post("/connections/:id/elma-credentials/validate", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    const current = await storage.getForUserAndConnection(auth.userId, id);
    if (!current?.encryptedElmaToken) throw new HttpError(400, "ELMA token is required", "ELMA_TOKEN_REQUIRED");

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
      lastValidatedAt: nowIso(),
      lastValidationError: errorMessage,
      createdAt: current?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    });
    if (!isValid) throw new HttpError(400, String(errorMessage), "ELMA_TOKEN_INVALID");
    return { ok: true, externalUserId: validation.externalUserId };
  });

  app.put("/connections/:id/llm-settings", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ llmToken: z.string().min(1) }).parse(request.body);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    const credential = await storage.getForUserAndConnection(auth.userId, id);
    if (!credential?.encryptedElmaToken) throw new HttpError(400, "ELMA token is required first", "ELMA_TOKEN_REQUIRED");

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
      updatedAt: nowIso()
    });
    return { ok: true };
  });

  app.post("/connections/:id/llm-settings/validate", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const snapshot = await storage.getCurrentSnapshotForConnection(id);
    if (!snapshot || snapshot.companyId !== auth.companyId) throw new HttpError(404, "Snapshot not found", "SNAPSHOT_NOT_FOUND");
    const credential = await storage.getForUserAndConnection(auth.userId, id);
    if (!credential?.encryptedLlmToken) throw new HttpError(400, "LLM token is required", "LLM_TOKEN_REQUIRED");
    await context.llm.generateSemanticDraft(
      { snapshot: { ...snapshot.payload, apps: snapshot.payload.apps.slice(0, 1) } },
      cryptoBox.decrypt(credential.encryptedLlmToken)
    );
    return { ok: true };
  });

  app.get("/connections/:id/semantic", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const mapping = await storage.getCurrentSemanticMappingForConnection(id);
    if (!mapping || mapping.companyId !== auth.companyId) throw new HttpError(404, "Semantic mapping not found", "SEMANTIC_NOT_FOUND");
    return mapping;
  });

  app.put("/connections/:id/semantic", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({
      entities: z.array(z.object({ entityKey: z.string(), businessName: z.string(), description: z.string(), confidence: z.number() })),
      relationNotes: z.array(z.object({ from: z.string(), to: z.string(), meaning: z.string() }))
    }).parse(request.body) as SemanticMappingDraft;
    const current = await storage.getCurrentSemanticMappingForConnection(id);
    if (!current || current.companyId !== auth.companyId) throw new HttpError(404, "Semantic mapping not found", "SEMANTIC_NOT_FOUND");
    await storage.saveSemanticMapping({ ...current, draft: body, isEdited: true, updatedAt: nowIso() });
    return { ok: true };
  });
}
