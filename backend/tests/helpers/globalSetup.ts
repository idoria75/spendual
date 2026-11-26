import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./testDb.js";

/** Apply all migrations to the test database (it is created if missing). */
export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    cwd: new URL("../..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
