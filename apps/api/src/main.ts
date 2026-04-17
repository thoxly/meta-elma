import { createApp } from "./app.js";

export async function startServer(): Promise<void> {
  const { app, env } = createApp();
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}
