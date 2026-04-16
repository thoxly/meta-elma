FROM node:22-alpine AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/elma-adapter/package.json packages/elma-adapter/package.json
COPY packages/context-engine/package.json packages/context-engine/package.json
COPY packages/llm-adapter/package.json packages/llm-adapter/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/security/package.json packages/security/package.json

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @meta-elma/api exec tsc -p /app/packages/domain/tsconfig.json \
  && pnpm --filter @meta-elma/api exec tsc -p /app/packages/storage/tsconfig.json \
  && pnpm --filter @meta-elma/api exec tsc -p /app/packages/security/tsconfig.json \
  && pnpm --filter @meta-elma/api exec tsc -p /app/packages/elma-adapter/tsconfig.json \
  && pnpm --filter @meta-elma/api exec tsc -p /app/packages/context-engine/tsconfig.json \
  && pnpm --filter @meta-elma/api exec tsc -p /app/packages/llm-adapter/tsconfig.json \
  && pnpm --filter @meta-elma/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages

EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
