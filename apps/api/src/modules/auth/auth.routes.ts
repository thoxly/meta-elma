import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../app-context.js";
import { nowIso } from "../../shared/utils/time.js";
import { HttpError } from "../../shared/http/errors.js";

const registerSchema = z.object({
  companyName: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1)
});

export function registerAuthRoutes(app: FastifyInstance, context: AppContext): void {
  const { storage, hasher, tokenService } = context;

  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await storage.getByEmail(body.email);
    if (existing) throw new HttpError(409, "Email already exists", "EMAIL_EXISTS");

    const companyId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await storage.createCompany({ companyId, name: body.companyName, createdAt: nowIso() });
    await storage.createUser({
      userId,
      companyId,
      email: body.email,
      fullName: body.fullName,
      passwordHash: await hasher.hash(body.password),
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    const sessionId = crypto.randomUUID();
    const tokens = tokenService.createTokens({ userId, companyId, email: body.email, sessionId });
    await storage.createRefreshSession({
      sessionId,
      userId,
      refreshTokenHash: tokenService.hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: nowIso()
    });
    return reply.code(201).send({ tokens, user: { userId, companyId, email: body.email, fullName: body.fullName } });
  });

  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const user = await storage.getByEmail(body.email);
    if (!user || !(await hasher.verify(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }
    const sessionId = crypto.randomUUID();
    const tokens = tokenService.createTokens({ userId: user.userId, companyId: user.companyId, email: user.email, sessionId });
    await storage.createRefreshSession({
      sessionId,
      userId: user.userId,
      refreshTokenHash: tokenService.hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: nowIso()
    });
    return { tokens, user: { userId: user.userId, companyId: user.companyId, email: user.email, fullName: user.fullName } };
  });

  app.post("/auth/refresh", async (request) => {
    const body = refreshSchema.parse(request.body);
    const payload = tokenService.verifyRefreshToken(body.refreshToken);
    const session = await storage.getRefreshSessionById(payload.sessionId);
    if (!session || session.userId !== payload.userId) {
      throw new HttpError(401, "Invalid refresh session", "INVALID_REFRESH_SESSION");
    }
    if (session.revokedAt) {
      throw new HttpError(401, "Refresh session revoked", "REFRESH_REVOKED");
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(401, "Refresh session expired", "REFRESH_EXPIRED");
    }
    const incomingHash = tokenService.hashRefreshToken(body.refreshToken);
    if (incomingHash !== session.refreshTokenHash) {
      throw new HttpError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }

    await storage.revoke(session.sessionId);
    const nextSessionId = crypto.randomUUID();
    const tokens = tokenService.createTokens({
      userId: payload.userId,
      companyId: payload.companyId,
      email: payload.email,
      sessionId: nextSessionId
    });
    await storage.createRefreshSession({
      sessionId: nextSessionId,
      userId: payload.userId,
      refreshTokenHash: tokenService.hashRefreshToken(tokens.refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: nowIso()
    });
    return { tokens };
  });

  app.post("/auth/logout", async (request) => {
    const body = logoutSchema.parse(request.body);
    const payload = tokenService.verifyRefreshToken(body.refreshToken);
    await storage.revoke(payload.sessionId);
    return { ok: true };
  });
}
