import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  YDB_ENDPOINT: z.string().default("grpc://localhost:2136"),
  YDB_DATABASE: z.string().default("/local"),
  YDB_TOKEN: z.string().optional(),
  ELMA_BASE_URL: z.string().url().default("https://api.elma365.com"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  CREDENTIAL_MASTER_SECRET: z.string().optional()
});

const DEV_FALLBACKS = {
  JWT_ACCESS_SECRET: "dev-access-secret-change-me",
  JWT_REFRESH_SECRET: "dev-refresh-secret-change-me",
  CREDENTIAL_MASTER_SECRET: "dev-master-secret-change-me"
} as const;

export type ApiEnv = Omit<z.infer<typeof baseEnvSchema>, keyof typeof DEV_FALLBACKS> & {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  CREDENTIAL_MASTER_SECRET: string;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = baseEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid API environment: ${parsed.error.message}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";

  const jwtAccessSecret = env.JWT_ACCESS_SECRET ?? (!isProd ? DEV_FALLBACKS.JWT_ACCESS_SECRET : undefined);
  const jwtRefreshSecret = env.JWT_REFRESH_SECRET ?? (!isProd ? DEV_FALLBACKS.JWT_REFRESH_SECRET : undefined);
  const credentialMasterSecret = env.CREDENTIAL_MASTER_SECRET ?? (!isProd ? DEV_FALLBACKS.CREDENTIAL_MASTER_SECRET : undefined);

  if (!jwtAccessSecret || !jwtRefreshSecret || !credentialMasterSecret) {
    throw new Error("JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and CREDENTIAL_MASTER_SECRET are required in production");
  }

  return {
    ...env,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    CREDENTIAL_MASTER_SECRET: credentialMasterSecret
  };
}
