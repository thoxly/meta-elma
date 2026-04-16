import { YdbStorage } from "../packages/storage/dist/index.js";

const endpoint = process.env.YDB_ENDPOINT ?? "grpc://localhost:2136";
const database = process.env.YDB_DATABASE ?? "/local";

function now(): string {
  return new Date().toISOString();
}

async function seed(storage: YdbStorage) {
  const ts = now();
  await storage.createCompany({ companyId: "c-smoke", name: "Smoke Co", createdAt: ts });
  await storage.createUser({
    userId: "u-smoke",
    companyId: "c-smoke",
    email: "smoke@example.com",
    passwordHash: "hash",
    fullName: "Smoke User",
    isActive: true,
    createdAt: ts,
    updatedAt: ts
  });
  await storage.createRefreshSession({
    sessionId: "rs-smoke",
    userId: "u-smoke",
    refreshTokenHash: "refresh-hash",
    expiresAt: ts,
    revokedAt: null,
    createdAt: ts
  });
  await storage.createConnection({
    connectionId: "conn-smoke",
    companyId: "c-smoke",
    system: "elma365",
    displayName: "Smoke Connection",
    baseUrl: "https://example.com",
    createdByUserId: "u-smoke",
    createdAt: ts,
    updatedAt: ts
  });
  await storage.upsert({
    credentialId: "cred-smoke",
    companyId: "c-smoke",
    connectionId: "conn-smoke",
    userId: "u-smoke",
    encryptedElmaToken: "enc-elma",
    encryptedLlmToken: "enc-llm",
    encryptionVersion: "v1",
    isValid: true,
    createdAt: ts,
    updatedAt: ts
  });
  await storage.saveSnapshot({
    snapshotId: "snap-smoke",
    companyId: "c-smoke",
    connectionId: "conn-smoke",
    version: 1,
    schemaHash: "hash",
    status: "ready",
    payload: {
      namespaces: [],
      apps: [],
      pages: [],
      processes: [],
      groups: [],
      relationHints: []
    },
    createdByUserId: "u-smoke",
    createdAt: ts
  });
  await storage.saveSemanticMapping({
    semanticMappingId: "sem-smoke",
    companyId: "c-smoke",
    connectionId: "conn-smoke",
    snapshotId: "snap-smoke",
    version: 1,
    draft: { entities: [], relationNotes: [] },
    isEdited: false,
    createdByUserId: "u-smoke",
    createdAt: ts,
    updatedAt: ts
  });
  await storage.createSession({
    chatSessionId: "chat-smoke",
    companyId: "c-smoke",
    userId: "u-smoke",
    connectionId: "conn-smoke",
    title: "Smoke chat",
    createdAt: ts,
    updatedAt: ts
  });
  await storage.saveMessage({
    chatMessageId: "msg-smoke",
    chatSessionId: "chat-smoke",
    role: "user",
    content: "hello",
    createdAt: ts
  });
  await storage.saveTrace({
    traceId: "trace-smoke",
    companyId: "c-smoke",
    userId: "u-smoke",
    connectionId: "conn-smoke",
    chatSessionId: "chat-smoke",
    snapshotId: "snap-smoke",
    question: "hello",
    plannerOutput: {},
    selectedTools: [],
    compactContext: null,
    responseMeta: {},
    error: null,
    createdAt: ts
  });
}

async function check(storage: YdbStorage) {
  const company = await storage.getCompanyById("c-smoke");
  const user = await storage.getByEmail("smoke@example.com");
  const refresh = await storage.getRefreshSessionById("rs-smoke");
  const connection = await storage.getConnectionById("conn-smoke");
  const credential = await storage.getForUserAndConnection("u-smoke", "conn-smoke");
  const snapshot = await storage.getCurrentSnapshotForConnection("conn-smoke");
  const semantic = await storage.getCurrentSemanticMappingForConnection("conn-smoke");
  const session = await storage.getSession("chat-smoke");
  const messages = await storage.listMessages("chat-smoke");
  const trace = await storage.getTraceById("trace-smoke");

  const missing = {
    company: !company,
    user: !user,
    refresh: !refresh,
    connection: !connection,
    credential: !credential,
    snapshot: !snapshot,
    semantic: !semantic,
    session: !session,
    messages: messages.length === 0,
    trace: !trace
  };

  if (Object.values(missing).some(Boolean)) {
    console.error(JSON.stringify(missing));
    throw new Error("YDB smoke check failed: missing persisted records");
  }

  console.log(
    JSON.stringify({
      companyId: company.companyId,
      userId: user.userId,
      refreshSessionId: refresh.sessionId,
      connectionId: connection.connectionId,
      credentialId: credential.credentialId,
      snapshotId: snapshot.snapshotId,
      semanticMappingId: semantic.semanticMappingId,
      chatSessionId: session.chatSessionId,
      messageCount: messages.length,
      traceId: trace.traceId
    })
  );
}

async function main() {
  const mode = process.argv[2] ?? "seed";
  const storage = new YdbStorage({ endpoint, database, authToken: process.env.YDB_TOKEN });
  try {
    if (mode === "seed") {
      await seed(storage);
      console.log("seed-ok");
      return;
    }
    if (mode === "check") {
      await check(storage);
      console.log("check-ok");
      return;
    }
    throw new Error(`Unknown mode: ${mode}`);
  } finally {
    await storage.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
