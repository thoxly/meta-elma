import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../app-context.js";

export function registerHealthRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await context.storage.ping();
      return { status: "ready", checks: ["api", "ydb"] };
    } catch {
      return reply.code(503).send({ status: "not_ready", checks: ["api"], failed: ["ydb"] });
    }
  });
}
