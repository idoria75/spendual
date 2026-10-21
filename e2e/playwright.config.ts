import { defineConfig, devices } from "@playwright/test";

// The webServer command runs `migrate reset --force`, which wipes the database.
// Only a database whose name contains "e2e" is allowed. Anything else is ignored (default)
// or refused, never used.
const defaultUrl = "mysql://root:root@mysql:3306/spendual_e2e";
const databaseName = (url: string) => new URL(url).pathname.slice(1);
const fromEnv = process.env.DATABASE_URL;
const databaseUrl = fromEnv && databaseName(fromEnv).includes("e2e") ? fromEnv : defaultUrl;
if (!databaseName(databaseUrl).includes("e2e")) {
  throw new Error(
    `Refusing to reset database "${databaseName(databaseUrl)}": name must contain "e2e".`,
  );
}
// One id per run, shared by the spec files (the config loads before the workers start).
process.env.E2E_RUN_ID ??= String(Date.now());
const env = {
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-only-secret-0123456789-0123456789",
  TZ: "America/Sao_Paulo",
};

export default defineConfig({
  testDir: "./tests",
  // One shared database and a 2-account signup cap: tests run one at a time.
  workers: 1,
  fullyParallel: false,
  // No retries: the database is reset once per run, so a retry would start dirty.
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5173",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Reset the e2e database first: sessions live in MySQL and signup is capped at 2.
      command:
        "npx prisma generate && npx prisma migrate reset --force --skip-generate --skip-seed && npm run seed && npx tsx src/index.ts",
      cwd: "../backend",
      url: "http://localhost:3000/health",
      env,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      cwd: "../frontend",
      url: "http://localhost:5173/entrar",
      // The backend listens on IPv4 only; "localhost" may resolve to ::1 inside the proxy.
      env: { ...env, API_PROXY_TARGET: "http://127.0.0.1:3000" },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
