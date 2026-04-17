import { startServer } from "./main.js";

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
