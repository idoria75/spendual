import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import i18n from "./frontend/eslint.i18n.config.js";

// Type-aware rules run on source only. Tests are looser (mocks, supertest bodies are `any`).
const TESTS = ["**/*.test.{ts,tsx}", "backend/tests/**/*.ts", "frontend/src/test/**", "e2e/**/*.ts"];
const TYPED_SRC = ["{backend,frontend,packages/shared}/src/**/*.{ts,tsx}"];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: TYPED_SRC,
    ignores: TESTS,
  })),
  {
    files: [...TYPED_SRC, ...TESTS],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Tests: only the promise rules, so a missing await cannot hide a failing test.
    files: TESTS,
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    // Config files are not in any tsconfig; skip type-aware rules there.
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  ...i18n,
  prettier,
);
