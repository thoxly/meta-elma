import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../app-context.js";
import { requireAuth } from "../../shared/http/auth.js";
import { HttpError } from "../../shared/http/errors.js";

export function registerTraceRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/traces/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const trace = await context.storage.getTraceById(id);
    if (!trace || trace.companyId !== auth.companyId) throw new HttpError(404, "Trace not found", "TRACE_NOT_FOUND");
    return trace;
  });
}
