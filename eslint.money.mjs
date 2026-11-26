/**
 * Money is a decimal string (Money type) or integer cents (bigint/number in domain code).
 * Never go through floating point. Selectors for `no-restricted-syntax`.
 *
 * Allowed on purpose: `Number(s) > 0` / `>= 0` sign checks in packages/shared schemas. They
 * take a plain parameter name (not money-named), so no override is needed. A new legit use
 * goes in an override block in eslint.config.mjs with a comment that says why.
 */
const MONEY = "/amount|price|total|balance|cents|money/i";

export const moneySelectors = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: "No parseFloat for money. Use the Money string or integer cents.",
  },
  {
    selector: "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
    message: "No parseFloat for money. Use the Money string or integer cents.",
  },
  {
    selector: "CallExpression[callee.property.name='toNumber']",
    message: "No .toNumber() for money. Keep Decimal as a string or convert to integer cents.",
  },
  {
    selector: `CallExpression[callee.name='Number'][arguments.0.name=${MONEY}]`,
    message: "No Number() on money values. Use the Money string or integer cents.",
  },
  {
    selector: `CallExpression[callee.name='Number'][arguments.0.property.name=${MONEY}]`,
    message: "No Number() on money values. Use the Money string or integer cents.",
  },
  {
    selector: `UnaryExpression[operator='+'][argument.name=${MONEY}]`,
    message: "No unary + on money values. Use the Money string or integer cents.",
  },
  {
    selector: `UnaryExpression[operator='+'][argument.property.name=${MONEY}]`,
    message: "No unary + on money values. Use the Money string or integer cents.",
  },
];
