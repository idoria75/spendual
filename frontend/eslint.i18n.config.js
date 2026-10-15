import react from "eslint-plugin-react";
import { moneySelectors } from "../eslint.money.mjs";

const TEXT_ATTRS = "/^(placeholder|aria-label|title|alt)$/";
const TOAST_FNS = "/^(toast|showToast)$/";
const attrMessage = "Hardcoded UI text in an attribute. Use t() with a key in pt-BR.json.";
const toastMessage = "Hardcoded toast text. Use t() with a key in pt-BR.json.";

/** Text shown to the user must come from t(). `react/jsx-no-literals` does not see props. */
const i18nSelectors = [
  {
    selector: `JSXAttribute[name.name=${TEXT_ATTRS}] > Literal`,
    message: attrMessage,
  },
  {
    selector: `JSXAttribute[name.name=${TEXT_ATTRS}] > JSXExpressionContainer > Literal`,
    message: attrMessage,
  },
  {
    selector: `JSXAttribute[name.name=${TEXT_ATTRS}] > JSXExpressionContainer > TemplateLiteral[expressions.length=0]`,
    message: attrMessage,
  },
  {
    selector: `CallExpression[callee.name=${TOAST_FNS}] > Literal.arguments`,
    message: toastMessage,
  },
  {
    selector: `CallExpression[callee.name=${TOAST_FNS}] > TemplateLiteral.arguments[expressions.length=0]`,
    message: toastMessage,
  },
  {
    selector: `CallExpression[callee.property.name=${TOAST_FNS}] > Literal.arguments`,
    message: toastMessage,
  },
];


/** Flat config block: no hardcoded UI text in JSX. Spread into the root config. */
export default [
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { react },
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      // Money bans apply to the frontend too; they are listed here so they are not replaced.
      "no-restricted-syntax": ["error", ...moneySelectors, ...i18nSelectors],
    },
  },
];
