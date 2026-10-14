import { createApp } from "./app.js";
import { createPrisma } from "./lib/prisma.js";

const port = Number(process.env.PORT ?? 3000);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error("SESSION_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const loginMax = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10);

createApp({
  prisma: createPrisma(),
  sessionSecret,
  loginLimit: { windowMs: 15 * 60 * 1000, max: loginMax },
  sessionCleanupSeconds: 10 * 60,
}).listen(port, "0.0.0.0", () => {
  console.log(`spendual backend listening on ${port}`);
});
