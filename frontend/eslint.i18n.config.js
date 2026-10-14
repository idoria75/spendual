import react from "eslint-plugin-react";

/** Flat config block: no hardcoded UI text in JSX. Spread into the root config. */
export default [
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { react },
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
];
