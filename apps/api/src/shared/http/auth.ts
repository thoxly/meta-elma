import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "@meta-elma/domain";
import type { JwtTokenService } from "@meta-elma/security";
import { HttpError } from "./errors.js";

export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
  tokenService: JwtTokenService
): Promise<AuthContext> {
  const raw = String(request.headers.authorization ?? "");
  if (!raw.startsWith("Bearer ")) {
    throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  }
  try {
    return tokenService.verifyAccessToken(raw.slice(7));
  } catch {
    throw new HttpError(401, "Invalid token", "INVALID_TOKEN");
  }
}
