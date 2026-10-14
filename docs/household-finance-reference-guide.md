# Household Finance App — Product & Implementation Reference Guide

**Document purpose:** Single source of truth for product requirements, accounting rules, architecture, implementation priorities, testing, security, and deployment.

**Status:** Consolidated working specification  
**Initial users:** Two people in one household  
**Initial locale/currency:** Brazilian Portuguese (`pt-BR`) and Brazilian real (`BRL`)  
**Deployment target:** Ubuntu home server, private local network only  
**Repository:** Public GitHub repository is acceptable; secrets and real financial data must never be committed.

---

## 1. Product vision

Build a private, self-hosted household finance application for two people who share household expenses but also maintain individual personal allowances and balances. The app should make it easy to answer:

- How much did we earn and spend this month?
- How much household savings did we generate?
- How much unallocated household savings remains?
- How much does each person have in their personal allowance balance, including carryover?
- What bills and installments are coming up?
- How much have we earmarked for each shared savings goal?
- Are we on track with category and overall budgets?

The product should prioritize reliable accounting semantics, clear explanations, privacy, and low-friction manual entry. It is not intended to be a bank, investment platform, accounting package, or public SaaS.

### Product principles

1. **Correct accounting before visual polish.**
2. **No double-counting:** internal transfers and allocations are not income or expenses.
3. **Preserve history:** avoid destructive deletion of confirmed financial records.
4. **Separate actuals from plans:** projections must never be confused with confirmed transactions.
5. **Explicit scope:** every financial record must clearly belong to household or personal finances.
6. **Private by default:** no public access, third-party financial integrations, analytics trackers, or cloud dependency in the initial release.
7. **Locale-aware from the beginning:** display and parse Brazilian formats correctly.
8. **Incremental delivery:** implement and test a small reliable MVP before imports and advanced reporting.

---

## 2. Scope and priorities

### P0 — MVP

- Two individual user accounts and secure login/logout.
- Household configuration, user display names, and unique configurable user colors.
- Responsive interface with PT-BR labels, dates, and BRL formatting.
- Manual creation, viewing, editing, and cancellation/voiding of:
  - expenses;
  - income;
  - other receipts/adjustments;
  - refunds;
  - transfers;
  - planned bills and expenses.
- Categories, financial accounts, and payment methods.
- Household versus personal scope and personal expense ownership.
- Monthly personal allowance allocations with **unspent balances carrying over indefinitely**.
- Monthly category budgets and an explicit overall household budget.
- Dashboard showing actuals, plans, projections, household savings, personal balances, and upcoming obligations.
- Recurring subscriptions and known future bills that generate planned occurrences.
- Credit-card installment plans with individual future installments.
- Confirmation prompts for risky edits and cancellations.
- Audit-friendly metadata and no destructive deletion of confirmed transactions.
- Database backup and a documented, tested restore procedure.
- Automated tests and CI from the beginning.
- Private Ubuntu deployment with no public internet ingress.

### P1 — Important follow-up

- Append-only audit history viewer.
- Shared savings goals (trip, wedding, emergency fund, etc.) with independent balances.
- Monthly savings target.
- CSV export.
- More complete personal budget screens and reporting.
- Month-over-month trends and carefully qualified spending pace.
- Better duplicate/correction workflows and more complete change history.

The data model should accommodate P1 shared savings goals from the beginning, even if their user interface ships later.

### P2 — Later

- CSV bank/card import with mapping, preview, and duplicate detection.
- Receipt attachments.
- Advanced credit-card statement reconciliation and complex interest/fee handling.
- Multi-household support, granular roles, and more complex sharing.
- Bank integrations or external services, only if deliberately chosen later.

### Explicit non-goals for the initial release

- Publicly accessible service.
- Mobile native application.
- Automatic bank synchronization.
- Investment tracking.
- Multi-currency conversion and foreign exchange.
- Automatic confirmation of planned bills merely because their dates have passed.
- Treating transfers, personal allowance allocations, or goal allocations as ordinary income/expense.

---

## 3. Users, privacy, and access

The app initially serves two people in one household. Each person has their own login. Do not rely on a shared account.

### Authentication and sessions

- Use server-managed sessions with an opaque session cookie.
- Cookie should be `HttpOnly` and `SameSite`; use `Secure` when HTTPS is configured.
- Implement CSRF protection for state-changing requests.
- Provide logout and server-side session revocation.
- Set appropriate session expiry; a persistent session of up to seven days is a reasonable initial default.
- Support password managers with correct `autocomplete` attributes.
- Never store passwords in plaintext; use Django’s password hashing.
- Do not put long-lived authentication tokens in browser local storage.
- Rate-limit or otherwise protect login attempts where practical.

### User identity and colors

- Each user has a display name and a configurable color.
- Defaults may be blue for one user and red for the other; these are not tied to gender or role.
- Enforce distinct user colors on the server.
- Color changes should apply consistently to historical views, while the user’s name remains visible.
- Never use color as the only identifier; pair it with a name or label.

### Privacy requirements

- Keep the service accessible only on the home LAN.
- Do not configure router port forwarding or public tunnels.
- Do not include third-party analytics, advertising, or external financial services in the MVP.
- Keep the database listening only on the required private interface or internal container network.
- Use host firewall rules to restrict access.
- Do not expose MySQL directly to the LAN unless there is a deliberate administrative need.
- If “no public connectivity” means no outbound traffic at all, enforce and test that at the host/network layer; application design alone cannot guarantee it.
- Treat backups as sensitive financial data and protect them accordingly.

---

## 4. Locale and currency

Use Brazilian Portuguese from the first release.

- Language/locale: `pt-BR`.
- Initial currency: `BRL`.
- Amount display: `R$ 1.234,56`.
- Date display: `dd/MM/yyyy`.
- Use Brazilian month names and terminology.
- Define the application timezone explicitly; choose the household’s intended timezone (likely `America/Sao_Paulo`) rather than relying on server defaults.
- Store currency as an explicit ISO currency code on financial records or at a suitable ledger level.
- Store dates/timestamps in a consistent format and convert for display in the configured timezone.
- Store numeric amounts, never formatted strings.
- Never use binary floating point for financial arithmetic. Use database decimal fields and Python `Decimal`, or integer minor units with a clearly documented policy.
- Parse user input using locale-aware validation. Do not assume `1.234,56` and `1,234.56` mean the same thing.
- Initial multi-currency conversion is out of scope. If non-BRL transactions are ever allowed, define conversion rates and reporting-currency rules explicitly before implementing them.

---

## 5. Accounting vocabulary and core distinctions

Keep the following concepts separate in the data model and UI.

### Transaction type

- **Expense:** consumption or cost.
- **Income:** salary or another receipt counted as income.
- **Other receipt/adjustment:** a positive receipt that should not automatically count as income; treatment depends on its classification.
- **Refund:** money returned for an earlier expense, ideally linked to the original.
- **Transfer:** movement between accounts or budget pools, not income or expense.

### Lifecycle status

- **Planned:** expected but not yet confirmed.
- **Confirmed:** happened and should count in actuals.
- **Cancelled:** a planned occurrence that will not happen.
- **Voided:** a confirmed record invalidated through an auditable correction process.

Do not use one field to represent both financial type and lifecycle status.

### Scope and ownership

- **Household:** shared finances and shared expenses.
- **Personal:** belongs to one individual and their personal allowance balance.
- **Payer:** who physically paid or initiated the payment.
- **Owner:** whose personal budget/balance owns a personal expense.
- **Created by:** who entered the record; this is not necessarily the payer or owner.

### Dates

- **Transaction date:** when a confirmed financial event actually happened.
- **Expected date:** when a planned obligation is expected to happen or be due.
- **Created/updated timestamps:** when the app record was created or changed.

Confirmed actual reports use transaction date, not entry date. Planned views use expected date.

---

## 6. Personal allowance accounting — mandatory behavior

Each person receives a monthly personal allowance allocation (for example, R$ 1.000 each). The allowance is a virtual earmarking of household funds unless the users explicitly choose to model an actual bank transfer later.

### Allocation and spending rules

1. Each month, create or record an allowance allocation for each person.
2. The allocation reduces **unallocated household savings** for the period, but is not a household consumption expense.
3. A personal purchase reduces only the owner’s personal balance.
4. A personal purchase must not reduce the partner’s balance.
5. A personal purchase must not reduce household savings a second time after the allowance has already been allocated.
6. Unused personal allowance **carries over month to month indefinitely**. It is not reset at the start of a month.
7. Personal expenses are reported separately from shared household category budgets, unless a purchase is explicitly classified as a shared household expense.
8. Personal receipts or corrections, if supported, must be classified explicitly and must not silently alter household income.
9. Record allocation and expense history so balances can be reconstructed and audited.

### Personal balance calculation

For a person and a given period:

`Closing personal balance = Opening personal balance + allowance allocations + explicitly classified personal receipts/credits − personal expenses − personal transfers out`

The next period’s opening balance is the previous period’s closing balance. Do not reset the balance each month.

### Household savings calculation

For a period:

`Household savings before goal allocations = household income − shared household expenses net of linked refunds − personal allowance allocations`

Personal purchases are **excluded** from shared household expenses because the allowance allocation already accounts for that money. Internal transfers and shared goal allocations are also excluded from income/expense totals.

This measure is a budgeting measure, not necessarily the bank’s actual cash balance. Display it with a clear label such as “household savings available before goal allocations.”

### Example

Assume monthly household income is R$ 10.000, shared expenses are R$ 5.000, and each person receives R$ 1.000.

- Household savings before goal allocations: R$ 10.000 − R$ 5.000 − R$ 2.000 = R$ 3.000.
- Person A spends R$ 250 on a videogame. Their personal balance becomes R$ 750 if their opening balance was zero.
- Person B’s balance remains R$ 1.000.
- Household savings remain R$ 3.000; do not subtract the R$ 250 again.
- Next month, Person A receives another R$ 1.000 allocation and has R$ 1.750 before new spending.

### Suggested data model

A personal allowance period/allocation should include at least:

- owner/user;
- period month;
- amount and currency;
- created timestamp and actor;
- optional notes or correction reference.

Enforce one primary allocation per user per period, or explicitly support multiple adjustment entries while preserving a clear period total. Personal transactions should identify their owner and, where useful, the allowance period/fund they affect.

Do not infer allowance allocations from personal spending. Allocations and purchases are separate records.

---

## 7. Shared savings goals — planned P1 feature

Support multiple independent shared goals such as a trip, wedding, emergency reserve, or home improvement. The database model should be designed for this from the beginning, even if the UI is deferred.

### What a goal is

A shared savings goal is a named pool of household savings earmarked for a purpose. It is not a spending category, not a recurring bill, and not an expense merely because money is allocated to it.

Examples:
- Trip fund
- Wedding fund
- Emergency reserve

Each goal has its own balance that accumulates over time and is independent of the personal allowance balances.

### Goal fields

- Name and optional description.
- Optional target amount and optional target date.
- Currency.
- Status: active, completed, archived.
- Created/updated timestamps and actors.
- Ledger of allocations, withdrawals back to household funds, and auditable corrections.

Current balance should be derived from the goal’s ledger rather than freely overwritten:

`Goal balance = opening balance + allocations into goal − withdrawals to household funds ± authorized corrections`

A goal may be created without a target. Multiple goals must be supported.

### Allocation and withdrawal behavior

- An allocation is a one-time user decision, not recurring by default.
- Allocation reduces unallocated household savings and increases the goal balance by the same amount.
- A withdrawal is allowed from the goal’s own menu and transfers value **only back to unallocated household funds** in the initial design.
- A withdrawal increases unallocated household savings and decreases the goal balance.
- Neither allocation nor withdrawal is household income or consumption expense.
- If the withdrawn money is later spent on a trip or wedding, record the actual purchase separately as a household expense. This prevents double-counting.
- Require confirmation for withdrawals and corrections; record who did what and when.
- Do not allow a withdrawal that exceeds the available goal balance.
- Show the goal’s current balance, target/progress when applicable, and allocation/withdrawal history.
- Closing or archiving a goal must preserve its history. Define how to handle a nonzero balance before allowing final closure.

### Example

Household income R$ 10.000 − shared expenses R$ 5.000 − allowances R$ 2.000 = R$ 3.000 household savings available before goal allocations.

Allocate R$ 1.000 to a trip goal and R$ 500 to a wedding goal:
- Trip balance increases by R$ 1.000.
- Wedding balance increases by R$ 500.
- Unallocated household savings remaining is R$ 1.500.
- Combined earmarked and unallocated savings remain R$ 3.000.

Personal purchases do not affect either shared goal. Personal balances, unallocated household savings, and shared goal balances must be displayed as separate concepts.

### Accounting/reporting safeguards

- Goal allocations must not count as household expenses.
- Goal withdrawals must not count as income.
- Actual household expenses paid after a withdrawal must be counted once, when the expense occurs.
- Do not add goal balances to “unallocated household savings” without clearly distinguishing the combined total. If showing total household savings, calculate and label it explicitly as unallocated household savings plus goal balances.
- The initial model assumes virtual earmarking, not movement between actual bank accounts. If physical transfers are later modeled, keep bank-account reconciliation separate from budget allocation logic.

---

## 8. Transactions, categories, accounts, and payment methods

### Manual transaction entry

A transaction form should capture only relevant fields for the selected type and scope. Common fields:

- type;
- status;
- amount;
- currency;
- description;
- transaction date or expected date;
- category;
- account;
- payment method;
- scope;
- payer;
- owner, for personal records;
- optional notes;
- related transaction, for refunds/corrections;
- recurrence or installment reference when applicable.

Validate on the server, not just in the browser. Use decimal-safe parsing and clear errors. Require confirmation before changes that alter existing financial history or cancel/void a record.

### Initial categories

Suggested initial category set:
- Groceries
- Restaurants and food delivery
- Home supplies
- Appliances and furniture
- Housing and utilities
- Transport
- Health and personal care
- Hobbies and entertainment
- Travel
- Subscriptions
- Gifts
- Miscellaneous

Categories should be editable and may be grouped later. A category used by historical transactions should not be destructively deleted. Prefer archive/inactive status. Category budgets apply to household spending by default; personal expenses belong in personal reports and should not affect shared category budgets unless explicitly configured as shared.

### Accounts

Accounts represent where money is held or a liability exists, for example:
- checking/bank account;
- cash;
- credit card;
- other account types if needed.

Do not assume an account balance is authoritative unless all relevant transactions are tracked and reconciled. In the MVP, account selection may support classification and future expansion without claiming full bank reconciliation.

### Payment methods

Examples: PIX, debit card, credit card, cash, bank transfer, boleto, other. Keep payment method separate from account; a method describes how a payment occurred, while an account identifies the financial account or liability.

### Transaction semantics

- Expenses increase spending.
- Income increases income.
- Other receipts do not automatically count as income; classification and reports must make their treatment explicit.
- Refunds reduce net spending when linked to an expense; show gross spending and refunds separately when useful.
- Transfers between the household’s own accounts are not income or expenses.
- A payment of a credit-card bill is a liability settlement/transfer, not a second expense for the purchases already recorded.
- Do not record a personal purchase as a shared household expense merely because it was paid from a shared bank account; the budget scope and payment source are distinct concepts.

### Corrections and deletion

- Do not hard-delete confirmed transactions through ordinary UI flows.
- For an incorrect confirmed record, use void/reversal/correction with a reason and preserved history.
- Planned records may be cancelled.
- Confirmation dialogs are required before editing, cancelling, voiding, or withdrawing money from a goal.
- New records may save after successful validation without an extra confirmation.
- Audit metadata is mandatory; an append-only audit-event table is recommended for P1.

---

## 9. Budgets and dashboard calculations

### Budgets

- Category budgets are monthly.
- No category-budget carryover in the initial release.
- Editing a budget affects the chosen period according to an explicit rule; it must not rewrite prior periods silently.
- A category with no budget should show spending without a false “over budget” warning.
- An overall household budget is configured explicitly. Do not assume it equals the sum of category budgets.
- Personal allowance is separate from category budgets.
- Shared savings goals are separate from expense budgets.

### Core definitions

- **Actual income:** confirmed income with transaction date in the selected period.
- **Actual household expenses:** confirmed household expenses net of linked refunds, by transaction date.
- **Actual personal expenses:** confirmed personal expenses by owner and transaction date.
- **Personal balance:** carried-over opening balance plus allocations/credits minus personal spending/transfers out.
- **Household savings before goal allocations:** household income minus shared household expenses net refunds minus personal allowance allocations.
- **Unallocated household savings remaining:** household savings before goal allocations minus net allocations into shared goals (plus withdrawals back from goals).
- **Goal balance:** accumulated goal ledger balance.
- **Projected household position:** actuals plus remaining planned commitments, with plans shown separately from actuals.
- **Remaining planned amount:** planned records not confirmed or cancelled.
- **Projected spending:** actual spending plus remaining planned expenses, avoiding any planned item being counted again after confirmation.
- **Savings rate:** only calculate when income is greater than zero; otherwise show “—”.

A report must make clear whether it displays actuals, projections, or balances. Do not silently mix planned and confirmed transactions.

### Unknown planned amounts

A planned bill with an unknown amount:
- appears in upcoming obligations;
- is labelled as amount not yet known;
- is excluded from numeric monetary projections until an amount is supplied;
- must not be treated as zero in a way that implies the future has no cost.

### Dashboard content

MVP dashboard should show:
- selected month;
- household income;
- shared household expenses net refunds;
- personal allowance allocations;
- household savings before goal allocations;
- unallocated household savings remaining after goal allocations (when goal feature exists);
- each person’s personal carried-over balance;
- category budget actuals and remaining/exceeded values;
- upcoming planned bills and installment obligations;
- actual versus projected totals, clearly separated.

Shared goal balances can appear as a separate panel once the feature ships. If displaying total earmarked savings, show unallocated household savings and each goal balance separately.

### Trends and pacing

Month-over-month trends are useful but should be implemented after the accounting model is correct. Comparing the current month with the same elapsed portion of the previous month is preferable to comparing partial current-month spending against a full previous month. Simple linear projections can mislead when rent, subscriptions, and other expenses occur early in the month; label estimates and defer advanced pacing to P1.

---

## 10. Planned bills and recurring obligations

Known future bills and subscriptions must be visible even before payment. The app should not require a transaction to be confirmed before it can be planned.

### One-off planned expense

Fields:
- description;
- expected date;
- optional expected amount;
- category;
- account/payment method if known;
- payer;
- household/personal scope and owner;
- notes;
- status.

Example: a utility bill arrives on the 15th and is due on the 5th of the next month. Record the planned obligation against the expected/due month. When paid, confirm it with the actual transaction date and actual amount.

### Recurring rules

A recurring rule contains:
- description;
- category;
- account/payment method;
- expected amount or variable/unknown amount;
- frequency (monthly in MVP);
- day of month;
- start date and optional end date;
- payer;
- scope and personal owner where relevant;
- active/paused/ended state.

The rule generates individual planned occurrences. It does not itself count as spending. A sensible generation horizon is the current month plus the next three months.

### Idempotency and edits

- Running occurrence generation more than once must not create duplicates.
- Enforce a unique rule/period occurrence key at the database level.
- Confirming one occurrence does not disable the recurrence rule.
- Pausing or ending a rule does not delete past occurrences.
- By default, editing a rule affects future unconfirmed occurrences only.
- If already-generated future occurrences will change, explain the impact and ask for confirmation.
- Preserve confirmed historical transactions.
- Do not auto-confirm a planned occurrence merely because its date passed.
- For monthly rules set to days 29–31, use the last day of shorter months, consistently and with tests.

Variable/unknown bills are shown as obligations but excluded from numerical projections until an amount is supplied.

---

## 11. Credit-card installments

The MVP should support known installment commitments without implementing full statement reconciliation.

### Entry flow

When a credit card is selected, ask whether the purchase is in installments. If yes, collect:
- purchase description;
- total purchase amount;
- number of installments;
- first installment due date;
- credit-card account;
- category;
- payer;
- household/personal scope and owner;
- optional notes.

Create a parent installment plan and individual installment occurrences. Each installment is a planned obligation for its due month. Do not add the full purchase total to every month.

### Amounts and lifecycle

- The sum of all installments must equal the purchase total exactly.
- Use decimal-safe arithmetic and a deterministic rounding rule; assign residual cents consistently (for example, to the final installment).
- Each installment is confirmed individually under the initial monthly-commitment model.
- A credit-card bill payment is not another expense.
- Corrections or cancellation require confirmation and must preserve history.
- Editing a plan should not silently rewrite confirmed installments.
- Interest, fees, variable installments, complex statement reconciliation, and installment changes after purchase are later features.

The MVP does not track unposted/pending card purchases automatically. It tracks confirmed financial events and planned known future commitments.

---

## 12. Suggested data model

The exact schema may evolve, but the domain model should preserve these concepts and relationships.

### Core entities

**User**
- id, username/login, password hash managed by framework, display name, unique color, active state, timestamps.

**Category**
- id, name, optional parent, active state, optional default scope/type.

**Account**
- id, name, type (bank, cash, credit card, etc.), currency, active state.

**PaymentMethod**
- id, name, active state.

**Transaction**
- id;
- type;
- lifecycle status;
- amount;
- currency code;
- description;
- transaction date;
- expected date;
- category;
- account;
- payment method;
- payer;
- scope (household/personal);
- owner (required for personal scope);
- created_by / updated_by;
- created_at / updated_at;
- source (manual/import);
- optional external reference;
- optional related transaction (refund/correction);
- optional recurrence occurrence reference;
- optional installment plan/occurrence reference;
- notes;
- optional void/cancellation reason.

**MonthlyBudget**
- period month;
- category or explicit overall-budget marker;
- amount/currency;
- timestamps and actor.
- Enforce uniqueness for the budget key per period.

**PersonalAllowanceAllocation**
- owner;
- period month;
- amount/currency;
- actor and timestamps;
- optional correction/notes.
- Enforce a clear uniqueness/adjustment policy.

**RecurrenceRule**
- recurrence fields listed above;
- state;
- creator/updater;
- timestamps.

**InstallmentPlan / InstallmentOccurrence**
- parent purchase details;
- count and total;
- occurrence sequence, due date, planned amount, status, linked transaction.

**SavingsGoal** (P1, model early)
- name, description, optional target amount/date, currency, status, actors/timestamps.

**SavingsGoalEntry** (P1, model early)
- goal;
- entry type (allocation, withdrawal, correction);
- amount/currency;
- effective date;
- actor;
- notes/reason;
- optional linked household pool movement;
- created timestamp.
- Prefer append-only entries; correct by reversing/adding entries instead of overwriting ledger history.

**AuditEvent** (P1)
- actor, timestamp, entity type/id, action, before/after snapshots or structured change, optional reason.

### Integrity constraints

- Foreign keys for all references.
- Use transactions for multi-row operations.
- Use unique constraints to prevent duplicate recurrence occurrences and duplicate installment sequence numbers.
- Validate scope/owner consistency.
- Do not delete categories/accounts that are referenced by historical records; archive them.
- Validate goal withdrawals against available balance in a transaction-safe way.
- Preserve exact currency arithmetic and consistent decimal scale.
- Make ledger-derived balances reproducible from immutable or auditable entries.
- Enforce permission and ownership checks on the server for every relevant operation.

---

## 13. Architecture and technology choices

### Recommended stack

- **Backend:** Node.js, Express, TypeScript, Prisma.
- **Frontend:** React, TypeScript, Vite.
- **UI:** Tailwind CSS and shadcn/ui (or a similarly accessible component system).
- **Database:** MySQL.
- **Tests:** Vitest (backend and frontend) and React Testing Library; Playwright for browser end-to-end tests.
- **Deployment:** Docker Compose is a practical option for repeatable deployment on Ubuntu, but is not mandatory.
- **CI:** GitHub Actions running checks and tests against a disposable MySQL service.

This stack reuses the author's Express and TypeScript experience, with MySQL as the database and Prisma for typed queries and migrations. Regular household workflows use the custom React UI.

### Responsibilities

- Backend owns business rules, authorization, validation, accounting calculations, and persistence.
- Frontend handles forms, navigation, responsive layout, accessible presentation, and client-side feedback.
- Never rely on the browser alone to enforce financial or authorization rules.
- Keep calculations in a domain/service layer rather than scattering them across views.
- Keep API DTOs and UI types aligned; document API behavior.
- Use database constraints in addition to application validation.

### Suggested repository layout

```text
spendual/
├── backend/
│   ├── prisma/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── users/
│   │   │   ├── transactions/
│   │   │   ├── budgets/
│   │   │   ├── allowances/
│   │   │   ├── recurring/
│   │   │   ├── installments/
│   │   │   ├── savings-goals/
│   │   │   └── audit/
│   │   └── index.ts
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── tests/
│   └── package.json
├── deployment/
│   ├── compose.yaml
│   └── README.md
├── docs/
│   └── implementation-guide.md
├── .env.example
├── .gitignore
├── README.md
└── ...
```

This is a suggested organization, not a rigid requirement. Keep modules cohesive and avoid premature abstraction.

---

## 14. User experience and accessibility

- Mobile-first responsive layout with good desktop support.
- Navigation labels and validation messages in PT-BR.
- Fast entry for frequent transactions.
- Form fields should appear conditionally based on type and scope.
- Show a clear distinction between “household” and each person’s “personal” records.
- Show payer, owner, and creator separately where relevant.
- Display actual and planned values in separate visual groups.
- Confirmation dialog text should explain the consequence, not merely ask “Are you sure?”
- Support keyboard navigation, visible focus, readable contrast, and screen-reader labels.
- User colors supplement labels and icons; they do not replace text.
- Provide empty states, loading states, validation errors, and recovery from failed saves.
- Prevent accidental double submission for operations that create financial entries.
- Use optimistic UI only when rollback/error handling is reliable; correctness is more important than animation.

---

## 15. Testing strategy

Tests are part of the first implementation, not a final polish phase. Use synthetic fixtures only.

### Backend unit/domain tests

Test:
- decimal arithmetic and currency formatting boundaries;
- expense/income/refund/transfer semantics;
- actual versus planned calculations;
- household savings formula;
- personal allowance carryover;
- personal expense not affecting partner/household savings a second time;
- shared goal allocations and withdrawals;
- goal balance and unallocated household savings reconciliation;
- refund linkage and net spending;
- card payment not double-counting purchases;
- monthly budgets and zero-income savings rate;
- unknown-amount plans excluded from numerical projection;
- recurring occurrence idempotency;
- day 29–31 month-end behavior;
- installment rounding and exact total;
- cancellation/voiding and historical preservation;
- permission checks for each user and sensitive action.

### API/integration tests

- Authentication, logout, session expiry, and CSRF behavior.
- Required field and amount validation.
- Unauthorized or malformed ownership/scope references are rejected.
- Database uniqueness constraints work under repeated requests.
- Multi-row creation of installment plans and recurring occurrences is atomic.
- Concurrent goal withdrawals cannot overspend the balance.
- Error responses do not leak secrets or sensitive internals.

### Frontend tests

- PT-BR amount/date formatting.
- Conditional transaction form fields.
- Actual/planned labels.
- Confirmation dialogs.
- Personal balance and savings goal displays.
- Validation and server-error states.
- Accessible labels, keyboard interactions, and user-color labels.

### End-to-end tests

At minimum, automate these flows:
1. Log in as each user.
2. Create a shared expense and confirm dashboard totals.
3. Create monthly allowance allocations and verify carryover.
4. Record a personal purchase and verify it affects only the owner’s personal balance.
5. Create a planned bill, then confirm it without double-counting.
6. Generate recurring occurrences twice and verify there are no duplicates.
7. Create a credit-card installment plan and verify monthly amounts.
8. Allocate money to two savings goals and withdraw part of one goal.
9. Verify household savings, goal balances, and personal balances reconcile.
10. Cancel/void a record and verify history remains.
11. Export or back up synthetic data and perform a restore test.

### Continuous integration

On each pull request:
- install locked dependencies;
- lint/format check;
- TypeScript check;
- backend tests against a disposable MySQL instance;
- frontend tests;
- build frontend/backend artifacts;
- run a secret scan where available.
Do not use real financial data or production credentials in CI.

---

## 16. Security and Git hygiene

The GitHub repository may be public. Therefore:

- Commit `.env.example` with fake placeholders only.
- Ignore `.env`, local overrides, database files/dumps, backups, logs, uploaded receipts, certificates, private keys, and build artifacts.
- Never commit real names if they are not intended to be public, actual transactions, balances, credentials, session keys, or server addresses that reveal sensitive details.
- Keep dependency lockfiles in Git.
- Use environment variables or untracked deployment configuration for secrets.
- Add secret scanning and dependency vulnerability checks when practical.
- If a secret is committed, removing it in a later commit is insufficient: revoke/rotate it and clean repository history if needed.
- Keep production `DEBUG` disabled.
- Restrict allowed hosts and CORS origins; do not use permissive wildcards without reason.
- Apply database migrations deliberately and back up before risky production migrations.
- Do not log passwords, session IDs, secret values, or full financial payloads unnecessarily.
- Validate all API inputs and enforce permissions server-side.
- Keep the app and dependencies updated.

---

## 17. Deployment and operations on Ubuntu

### Private network access

- Bind the service only to the intended LAN interface or keep it behind a LAN-only reverse proxy.
- Do not expose MySQL to the LAN by default.
- Do not configure router port forwarding or public tunnels.
- Use the Ubuntu firewall to allow only the necessary local ports from the intended LAN.
- Confirm that access from outside the LAN fails.
- A local hostname such as `our_shared_expenses.local` may work through mDNS, but `.local` support varies by operating system and network. Test every intended device. Local DNS/router DNS may be more reliable.
- HTTPS on a private LAN can require local certificate/trust configuration. If HTTPS is omitted on a trusted LAN, document the risk and ensure the service is not exposed outside it. Cookie `Secure` behavior depends on HTTPS.
- Do not claim the app has no internet connectivity merely because it is not publicly reachable. Restrict outbound networking separately if required.

### Deployment process

1. Install and update Ubuntu.
2. Install the chosen container/runtime tooling if using containers.
3. Configure secrets outside Git.
4. Start the database on an internal/private network.
5. Apply database migrations.
6. Create the two users and initial categories/accounts/payment methods.
7. Build and serve the frontend and backend.
8. Configure firewall and hostname.
9. Verify login, transaction entry, and backup.
10. Reboot the server and confirm services restart correctly.

### Backups

Backups are P0.
- Define automated database backup cadence and retention.
- Keep at least one backup separate from the main database storage.
- Protect backups with appropriate file permissions and encryption if they leave the host.
- Do not commit backups to Git.
- Document a restore procedure.
- Test restoration regularly, ideally to a separate test database.
- Back up deployment configuration needed for recovery, excluding secrets from source control.
- A backup is not considered reliable until a restore has been tested.

### Operations checklist

- [ ] Service is LAN-only.
- [ ] MySQL is not publicly or unnecessarily exposed.
- [ ] Secrets are outside Git.
- [ ] `DEBUG` is disabled in production.
- [ ] Firewall rules are active.
- [ ] Automatic restart after reboot is tested.
- [ ] Backup schedule and retention are documented.
- [ ] Restore test succeeded.
- [ ] Logs rotate and do not reveal secrets.
- [ ] Updates and migration procedure are documented.

---

## 18. CSV import roadmap

CSV import is later, but transaction provenance should support it from the beginning.

A safe import flow:
1. Upload/select a local CSV file.
2. Choose the source/bank/card format or map columns.
3. Preview parsed rows using Brazilian number/date rules.
4. Validate dates, amounts, descriptions, and currency.
5. Suggest categories without silently committing changes.
6. Detect likely duplicates using source account, date, amount, description, and external reference where available.
7. Show all rows and warnings to the user.
8. Let the user confirm the import.
9. Save provenance and an optional external source reference.
10. Report imported, skipped, and rejected rows.

Do not send financial CSVs to third-party services. Duplicate detection is advisory unless a stable external transaction ID is available. Imported transactions should still follow the same accounting and lifecycle rules as manually entered records.

---

## 19. Implementation sequence

Recommended order:

### Phase 0 — Foundations
- Create repository, README, `.gitignore`, `.env.example`, and coding standards.
- Set up Django, React/TypeScript/Vite, MySQL, migrations, and local development environment.
- Set up CI and tests immediately.
- Implement users, authentication, sessions, and locale/timezone configuration.

### Phase 1 — Core ledger
- Categories, accounts, payment methods.
- Transaction model and type/status/scope semantics.
- Manual entry, list, detail, edit, cancel/void.
- Refunds, transfers, and transaction validation.
- Backend domain calculations and tests.

### Phase 2 — Budgets and personal allowance
- Monthly category and explicit overall budgets.
- Monthly personal allowance allocations.
- Carryover balances and personal expense tracking.
- Household savings calculation that subtracts allocations once, not personal purchases twice.
- Dashboard with actuals and projections.

### Phase 3 — Planned obligations
- One-off planned bills.
- Recurrence rules and idempotent occurrence generation.
- Upcoming obligations and unknown-amount warnings.
- Confirmation flow from planned to confirmed.

### Phase 4 — Credit-card installments
- Parent installment plans and individual occurrences.
- Decimal-safe distribution and rounding tests.
- Monthly projection and bill-payment semantics.

### Phase 5 — Private deployment and reliability
- Ubuntu deployment.
- LAN firewall and host setup.
- Backup/restore.
- End-to-end testing on intended devices.
- Security review.

### Phase 6 — Shared savings goals (P1)
- Savings goal and ledger models.
- Allocation and withdrawal operations.
- Goal history and balances.
- Dashboard separation of unallocated household savings and goal balances.
- Reconciliation tests ensuring allocations do not count as expenses or income.

### Phase 7 — Reporting and imports
- CSV export and monthly trend views.
- CSV import with preview and duplicate detection.
- Additional audit viewer and quality-of-life improvements.

The phases can overlap where sensible, but do not ship accounting features without tests for their effect on all relevant balances.

---

## 20. Definition of done for MVP

The MVP is ready when:

- Both users can log in separately from intended LAN devices.
- PT-BR formatting and BRL display are correct.
- Manual transactions support the required types, status, scope, and ownership.
- Planned items do not count as actuals until confirmed.
- Refunds and transfers do not distort income/expense totals.
- Category budgets and the explicit overall budget are understandable.
- Personal allowance allocations reduce household savings once.
- Personal balances carry over indefinitely.
- Personal purchases affect only the owner’s personal balance after allocation and do not reduce household savings again.
- Recurring obligations generate no duplicate occurrences.
- Unknown planned amounts are visible but not treated as zero-cost obligations.
- Installments reconcile exactly to the purchase total and appear in the appropriate due months.
- Credit-card bill payments do not double-count purchase expenses.
- Risky changes require confirmation and confirmed history is preserved.
- Automated tests and CI pass.
- The app is not publicly accessible.
- Backup and restore have both been tested.
- No real financial data or secrets are in Git.

Shared savings goals are not required for the first MVP UI, but when implemented they must:
- support multiple independent goals;
- accumulate allocations over time;
- allow withdrawals only back to unallocated household funds in the initial design;
- keep goal balances separate from personal balances and unallocated household savings;
- avoid counting allocations/withdrawals as income/expenses;
- preserve ledger history and pass reconciliation tests.

---

## Appendix A — Core accounting formulas

For a selected month:

```text
household_income
  = sum(confirmed household income)

shared_household_expenses_net
  = confirmed household expenses
    - linked refunds that reduce those expenses

personal_allowance_allocations
  = sum(allowance allocations made for the period)

household_savings_before_goal_allocations
  = household_income
    - shared_household_expenses_net
    - personal_allowance_allocations

goal_allocations_net
  = goal allocations into goals
    - withdrawals back to household funds

unallocated_household_savings_remaining
  = household_savings_before_goal_allocations
    - goal_allocations_net

personal_closing_balance
  = personal_opening_balance
    + allowance allocations
    + explicitly classified personal credits
    - personal expenses
    - personal transfers out

goal_closing_balance
  = goal_opening_balance
    + allocations into goal
    - withdrawals to household funds
    +/- authorized corrections
```

These are budget calculations. If actual bank-account balances are tracked in the future, they must be reconciled separately and must not be conflated with these earmarked budget pools.

## Appendix B — Non-negotiable safeguards

- Never use floating-point arithmetic for money.
- Never count an internal transfer as income or expense.
- Never count a personal purchase against household savings a second time after allowance allocation.
- Never reset unused personal allowance at month-end.
- Never count shared goal allocation as consumption expense.
- Never count a goal withdrawal as income.
- Never count a credit-card bill payment as a second expense for already-recorded purchases.
- Never count a planned record as confirmed actual spending.
- Never let recurrence generation create duplicates.
- Never destroy confirmed history through ordinary deletion.
- Never commit secrets or real financial data to the repository.
- Never assume LAN-only automatically means outbound-network-isolated.
