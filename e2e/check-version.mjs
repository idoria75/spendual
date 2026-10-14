/* global console, process, URL */
// Fails if the Playwright image tag in compose.dev.yml or ci.yml differs from the
// @playwright/test version pinned in e2e/package.json.
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const pinned = JSON.parse(read("./package.json")).devDependencies["@playwright/test"];
let bad = false;
for (const file of ["../compose.dev.yml", "../.github/workflows/ci.yml"]) {
  const tags = [...read(file).matchAll(/playwright:v([0-9.]+)-/g)].map((m) => m[1]);
  if (tags.length === 0 || tags.some((t) => t !== pinned)) {
    console.error(`${file}: image tags [${tags.join(", ")}] do not match @playwright/test ${pinned}`);
    bad = true;
  }
}
if (bad) process.exit(1);
console.log(`Playwright version check ok: ${pinned}`);
