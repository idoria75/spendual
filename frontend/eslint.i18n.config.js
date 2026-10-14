import i18next from "eslint-plugin-i18next";

/** Flat config block. Track A's root config can spread this in. */
export default [
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
    },
  },
];
