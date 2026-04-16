type SnapshotPayloadLike = {
  namespaces: unknown[];
  apps: Array<{ fields: unknown[] }>;
  pages: unknown[];
  processes: unknown[];
  groups: unknown[];
  relationHints: Array<{ from: string; to: string; reason: string }>;
  stats?: { namespaces?: number; apps?: number; fields?: number };
};

type SnapshotLike = {
  snapshotId: string;
  version: number;
  createdAt: string;
  payload: SnapshotPayloadLike;
};

export function isStructuralSnapshotMeaningful(payload: SnapshotPayloadLike): boolean {
  const namespacesCount = payload.stats?.namespaces ?? payload.namespaces.length;
  const appsCount = payload.stats?.apps ?? payload.apps.length;
  const fieldsCount = payload.stats?.fields ?? payload.apps.reduce((sum, app) => sum + app.fields.length, 0);
  return namespacesCount > 0 && appsCount > 0 && fieldsCount > 0;
}

export function toConnectionSchemaResponse(snapshot: SnapshotLike): {
  snapshotId: string;
  version: number;
  createdAt: string;
  payload: SnapshotPayloadLike;
} {
  return {
    snapshotId: snapshot.snapshotId,
    version: snapshot.version,
    createdAt: snapshot.createdAt,
    payload: snapshot.payload
  };
}
