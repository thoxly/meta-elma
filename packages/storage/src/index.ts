import type {
  ConnectionRepository,
  ContextSnapshot,
  ElmaConnection,
  EntityId,
  SnapshotRepository
} from "@meta-elma/domain";

export class InMemoryConnectionRepository implements ConnectionRepository {
  private readonly rows = new Map<EntityId, ElmaConnection>();

  async create(connection: ElmaConnection): Promise<void> {
    this.rows.set(connection.connectionId, connection);
  }

  async listByOwner(ownerUserId: EntityId): Promise<ElmaConnection[]> {
    return [...this.rows.values()].filter((row) => row.ownerUserId === ownerUserId);
  }

  async getById(connectionId: EntityId): Promise<ElmaConnection | null> {
    return this.rows.get(connectionId) ?? null;
  }
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly rows = new Map<EntityId, ContextSnapshot>();

  async saveSnapshot(snapshot: ContextSnapshot): Promise<void> {
    this.rows.set(snapshot.connectionId, snapshot);
  }

  async getLatestByConnection(connectionId: EntityId): Promise<ContextSnapshot | null> {
    return this.rows.get(connectionId) ?? null;
  }
}
