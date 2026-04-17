import crypto from "node:crypto";
import type { AuthContext, Connection, ConnectionJob } from "@meta-elma/domain";
import type { AppContext } from "../../app-context.js";
import { hashOf } from "../../shared/utils/hash.js";
import { nowIso } from "../../shared/utils/time.js";

export async function runConnectionJob(context: AppContext, input: { job: ConnectionJob; connection: Connection; auth: AuthContext }): Promise<void> {
  const { storage, cryptoBox, elma, llm, logger } = context;
  const { job, connection, auth } = input;
  const startedAt = nowIso();
  await storage.updateJob({ ...job, status: "running", updatedAt: startedAt });
  try {
    if (job.type === "refresh_schema") {
      logger.info({ msg: "refresh_schema started", connectionId: connection.connectionId, baseUrl: connection.baseUrl });
      const credential = await storage.getForUserAndConnection(auth.userId, connection.connectionId);
      if (!credential?.isValid) {
        throw new Error("Valid ELMA credential is required");
      }
      const payload = await elma.collectStructuralSnapshot(connection.baseUrl, cryptoBox.decrypt(credential.encryptedElmaToken));
      logger.info({ msg: "refresh_schema snapshot collected", connectionId: connection.connectionId, baseUrl: connection.baseUrl });
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
        createdAt: nowIso()
      };
      await storage.saveSnapshot(snapshot);
      await storage.updateJob({
        ...job,
        status: "succeeded",
        error: null,
        result: { snapshotId: snapshot.snapshotId, version: snapshot.version },
        updatedAt: nowIso()
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
      const draft = await llm.generateSemanticDraft({ snapshot: snapshot.payload }, cryptoBox.decrypt(credential.encryptedLlmToken));
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
        createdAt: current?.createdAt ?? nowIso(),
        updatedAt: nowIso()
      };
      await storage.saveSemanticMapping(mapping);
      await storage.updateJob({
        ...job,
        status: "succeeded",
        error: null,
        result: { semanticMappingId: mapping.semanticMappingId, version: mapping.version },
        updatedAt: nowIso()
      });
    }
  } catch (error) {
    await storage.updateJob({
      ...job,
      status: "failed",
      error: error instanceof Error ? error.message : "Job failed",
      result: null,
      updatedAt: nowIso()
    });
  }
}
