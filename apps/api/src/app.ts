import Fastify from "fastify";
import { HttpElmaClient } from "@meta-elma/elma-adapter";
import { OpenAIResponsesProvider } from "@meta-elma/llm-adapter";
import { AesCredentialCrypto, BcryptPasswordHasher, JwtTokenService } from "@meta-elma/security";
import { YdbStorage } from "@meta-elma/storage";
import { readEnv } from "./config/env.js";
import type { AppContext } from "./app-context.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerConnectionRoutes } from "./modules/connections/connections.routes.js";
import { registerJobRoutes } from "./modules/jobs/jobs.routes.js";
import { registerSchemaRoutes } from "./modules/schema/schema.routes.js";
import { registerChatRoutes } from "./modules/chat/chat.routes.js";
import { registerTraceRoutes } from "./modules/traces/traces.routes.js";
import { asErrorPayload } from "./shared/http/errors.js";

export function createApp() {
  const env = readEnv();
  const app = Fastify({ logger: true });
  const context: AppContext = {
    storage: new YdbStorage({
      endpoint: env.YDB_ENDPOINT,
      database: env.YDB_DATABASE,
      authToken: env.YDB_TOKEN
    }),
    elma: new HttpElmaClient({ baseUrl: env.ELMA_BASE_URL }),
    llm: new OpenAIResponsesProvider({ model: env.OPENAI_MODEL }),
    hasher: new BcryptPasswordHasher(),
    tokenService: new JwtTokenService(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET),
    cryptoBox: new AesCredentialCrypto(env.CREDENTIAL_MASTER_SECRET),
    logger: app.log
  };

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = asErrorPayload(error);
    if (statusCode >= 500) {
      app.log.error({ err: error }, "Unhandled API error");
    }
    reply.code(statusCode).send(body);
  });

  registerHealthRoutes(app, context);
  registerAuthRoutes(app, context);
  registerConnectionRoutes(app, context);
  registerJobRoutes(app, context);
  registerSchemaRoutes(app, context);
  registerChatRoutes(app, context);
  registerTraceRoutes(app, context);

  return { app, env };
}
