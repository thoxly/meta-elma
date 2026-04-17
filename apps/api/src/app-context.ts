import type { FastifyBaseLogger } from "fastify";
import type { HttpElmaClient } from "@meta-elma/elma-adapter";
import type { OpenAIResponsesProvider } from "@meta-elma/llm-adapter";
import type { AesCredentialCrypto, BcryptPasswordHasher, JwtTokenService } from "@meta-elma/security";
import type { YdbStorage } from "@meta-elma/storage";

export type AppContext = {
  storage: YdbStorage;
  elma: HttpElmaClient;
  llm: OpenAIResponsesProvider;
  hasher: BcryptPasswordHasher;
  tokenService: JwtTokenService;
  cryptoBox: AesCredentialCrypto;
  logger: FastifyBaseLogger;
};
