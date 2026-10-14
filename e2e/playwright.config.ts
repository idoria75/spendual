import { defineConfig, devices } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://root:root@mysql:3306/spendual_e2e";
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
  retries: process.env.CI ? 1 : 0,
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
