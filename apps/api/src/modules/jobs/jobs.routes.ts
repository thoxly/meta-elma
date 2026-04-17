import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConnectionJob } from "@meta-elma/domain";
import type { AppContext } from "../../app-context.js";
import { requireAuth } from "../../shared/http/auth.js";
import { HttpError } from "../../shared/http/errors.js";
import { nowIso } from "../../shared/utils/time.js";
import { runConnectionJob } from "./jobs.service.js";

export function registerJobRoutes(app: FastifyInstance, context: AppContext): void {
  const { storage } = context;

  app.post("/connections/:id/jobs", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ type: z.enum(["refresh_schema", "generate_semantic"]) }).parse(request.body);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    const alreadyRunning = await storage.listRunningJobs(id, body.type);
    if (alreadyRunning.length > 0) throw new HttpError(409, "A job of this type is already running", "JOB_ALREADY_RUNNING");

    const job: ConnectionJob = {
      jobId: crypto.randomUUID(),
      companyId: auth.companyId,
      connectionId: id,
      userId: auth.userId,
      type: body.type,
      status: "queued",
      error: null,
      result: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await storage.createJob(job);
    setTimeout(() => {
      void runConnectionJob(context, { job, connection, auth });
    }, 0);
    return reply.code(202).send({ jobId: job.jobId, status: job.status });
  });

  app.get("/connections/:id/jobs", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const connection = await storage.getConnectionById(id);
    if (!connection || connection.companyId !== auth.companyId) throw new HttpError(404, "Connection not found", "CONNECTION_NOT_FOUND");
    const jobs = await storage.listJobsForConnection(id);
    return { items: jobs };
  });

  app.get("/jobs/:jobId", async (request, reply) => {
    const auth = await requireAuth(request, reply, context.tokenService);
    const { jobId } = z.object({ jobId: z.string().min(1) }).parse(request.params);
    const job = await storage.getJobById(jobId);
    if (!job || job.companyId !== auth.companyId) throw new HttpError(404, "Job not found", "JOB_NOT_FOUND");
    return job;
  });
}
