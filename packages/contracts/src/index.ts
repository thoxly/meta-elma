import type { ConnectionState, ConnectionJob, SemanticMappingDraft } from "@meta-elma/domain";

export type Tokens = { accessToken: string; refreshToken: string };

export type LoginResponse = {
  tokens: Tokens;
  user: { userId: string; companyId: string; email: string; fullName: string };
};

export type CreateConnectionRequest = { displayName: string; baseUrl: string; elmaToken: string };
export type CreateConnectionResponse = {
  connectionId: string;
  companyId: string;
  system: "elma365";
  displayName: string;
  baseUrl: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type ErrorResponse = { error: string; code?: string; details?: unknown };
export type ListConnectionsResponse = { items: ConnectionState[] };
export type ListJobsResponse = { items: ConnectionJob[] };
export type GetSemanticResponse = {
  semanticMappingId: string;
  companyId: string;
  connectionId: string;
  snapshotId: string;
  version: number;
  draft: SemanticMappingDraft;
  isEdited: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
