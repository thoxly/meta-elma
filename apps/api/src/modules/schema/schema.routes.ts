import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../app-context.js";
import { toConnectionSchemaResponse } from "../../connection-schema.js";
import { requireAuth } from "../../shared/http/auth.js";
import { HttpError } from "../../shared/http/errors.js";

export function registerSchemaRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/connections/:id/schema", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const snapshot = await context.storage.getCurrentSnapshotForConnection(id);
    if (!snapshot || snapshot.companyId !== auth.companyId) {
      throw new HttpError(404, "Schema snapshot not found", "SCHEMA_NOT_FOUND");
    }
    return toConnectionSchemaResponse(snapshot);
  });
}
