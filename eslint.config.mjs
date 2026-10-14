import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // TODO(track B): add the frontend i18n rule (no hardcoded UI strings) here,
  // scoped to "frontend/src/**/*.{ts,tsx}".
  prettier,
);
