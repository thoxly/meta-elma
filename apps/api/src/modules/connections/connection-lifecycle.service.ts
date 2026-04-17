import type { AuthContext, Connection, ConnectionLifecycleStatus } from "@meta-elma/domain";
import { isStructuralSnapshotMeaningful } from "../../connection-schema.js";
import type { AppContext } from "../../app-context.js";

export async function deriveConnectionState(context: AppContext, auth: AuthContext, connection: Connection) {
  const { storage } = context;
  const credential = await storage.getForUserAndConnection(auth.userId, connection.connectionId);
  const snapshot = await storage.getCurrentSnapshotForConnection(connection.connectionId);
  const semantic = await storage.getCurrentSemanticMappingForConnection(connection.connectionId);
  const jobs = await storage.listJobsForConnection(connection.connectionId);
  const activeSchemaJob = jobs.find((job) => job.type === "refresh_schema" && (job.status === "queued" || job.status === "running"));
  const activeSemanticJob = jobs.find(
    (job) => job.type === "generate_semantic" && (job.status === "queued" || job.status === "running")
  );

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
