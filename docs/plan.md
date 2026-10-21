# Interview: spendual open points

## Context

`spendual` is a pre-implementation, spec-only repo. The only product doc is
`docs/household-finance-reference-guide.md` (1035 lines). It describes a private,
self-hosted household finance tracker for a 2-person household in Brazil:
manual expense/income tracking, personal allowance with carryover, household
budgets, recurring bills, credit-card installments, shared savings goals. Stack:
Django/DRF backend, React/TS/Vite frontend, MySQL, Docker Compose on a LAN-only
Ubuntu box. No source code, README, package.json, CI config, or license exists
yet — Phase 0 of the doc's own implementation sequence has not been started.

Goal of this task: interview the user on the open points the doc leaves
unresolved, before any implementation planning starts. This is not yet an
implementation plan — it is a record of decisions as they're made.

## Open points found in the docs (explicit)

1. Timezone not finalized (doc says "likely America/Sao_Paulo").
2. Amount storage: DB decimal + Python `Decimal` vs. integer minor units — undecided.
3. Allocation uniqueness policy (one primary allocation per user/period vs. multiple
   adjustment entries) — undecided, affects MonthlyBudget and PersonalAllowanceAllocation.
4. HTTPS on LAN — explicitly deferred ("document the risk if omitted"), no decision made.
5. Local hostname/mDNS reliability — flagged as needing per-device testing, unresolved.
6. Goal closure with nonzero balance — behavior unspecified.
7. Budget edit semantics — doc refers to "an explicit rule" that is never actually stated.
8. Docker Compose — called "practical... but not mandatory," no final deployment mechanism chosen.
9. Suggested repo layout (`backend/`, `frontend/`, etc.) does not exist yet; Phase 0 not executed.
10. Repo name "spendual" vs. doc's internal name "Household Finance App" — naming inconsistency.

## Inferred gaps (not in docs at all)

- Auth bootstrap: how the two initial user accounts/passwords get created.
- Ops specifics: reverse proxy, process manager, cert authority for optional local HTTPS,
  safe migration/update rollout process.
- No LICENSE file despite repo being public.
- No CI config (`.github/workflows`) despite CI being called P0.
- What happens if household composition changes (breakup/new member) — deferred to P2
  "multi-household" with zero detail.

## Decisions made

- **Amount storage**: DB decimal fields + Python `Decimal` throughout.
- **Allocation uniqueness**: design for one primary allocation per user per period now,
  but keep the schema/logic open to support multiple adjustment entries later (don't
  hard-code a strict one-row constraint that would be painful to lift).
- **Timezone**: `America/Sao_Paulo`, confirmed.
- **LAN HTTPS**: plain HTTP for MVP; revisit HTTPS later (P1+).
- **Goal closure with nonzero balance**: closing/archiving a goal with money left is blocked;
  the UI must prompt the user to do a manual transfer of the remainder before closure is
  allowed (not a silent auto-sweep to household savings).
- **Budget edit semantics**: no single hard-coded rule. When a user edits a budget
  mid-period, the UI/flow must ask the user whether the change applies "this period only"
  or "going forward from now" — the system should prompt at edit time, not assume.
- **Deployment**: commit to Docker Compose as the standard way to run backend+frontend+MySQL.
- **Naming**: repo name "spendual" is the real product name; the doc should be updated to
  use "spendual" instead of "Household Finance App" (doc text, not code, needs the fix).
- **Backend stack (overrides the doc)**: Express + TypeScript + Prisma, not Django/DRF.
  Reason: user's Python knowledge is old/non-Django, while Express is a skill they're
  actively building at work — reuse that momentum. MySQL stays as the DB (per doc), Prisma
  handles typed queries + migrations. Frontend stays React/TS/Vite (doc's choice, already
  compatible). This is a real doc override, not a detail — §13 of the reference guide needs
  updating, and CI/test tooling (pytest → Vitest/Jest on the backend too) follows from it.
- **License**: AGPL-3.0.
- **Account creation**: self-serve login/signup screen (not admin-provisioned accounts),
  but the server caps the household at 2 accounts total — signup fails once 2 exist.
- **LAN access**: mDNS hostname (e.g. `spendual.local`), needs to work across Windows,
  macOS, Ubuntu, Android, iOS on recent versions. Risk to flag: Windows 10 (1803+) and 11
  resolve `.local` natively (fairly sure, not tested), but results vary by network profile
  and firewall — test on the actual target Windows device; keep a documented static-IP
  fallback.

## Remaining / deliberately deferred (not blocking)

- Household composition change (breakup/new member) — stays a P2 "multi-household" concern,
  no decision needed now.
- Phase 0 (repo scaffold: README, `.env.example`, `backend/`, `frontend/`, CI) has not been
  started at all — next concrete step if/when the user wants to move from decisions to
  actual implementation.
- CI tooling needs to shift from the doc's Python/pytest assumption to a Node/Vitest(or Jest)
  setup on the backend too, as a consequence of the Express decision above.

- **Plan review (2026-10-14)**: dev runs inside Docker only (no Node on the host); the deploy
  box is a different machine from the dev box; amounts travel in JSON as decimal strings;
  UI text uses react-i18next from day one.

## Interview status: CLOSED

All open points from the doc, plus the stack/license/signup questions the user raised,
are resolved — see "Decisions made" above. User confirmed nothing further to raise.

## UI guidelines added (2026-10-14)

User added `docs/ui-guidelines.md` and `docs/ui-mockups.html` — the agreed visual design:
navigation shell (phone bottom-tab / desktop sidebar), design tokens (colors, type, spacing),
component specs (category tiles, actual-vs-planned cards, budget bars, record rows, bottom
sheets, confirmation dialogs), the full view list with routes, and the `Novo lançamento`
field sequence. Stack for the frontend side of this: Tailwind CSS mapped to the token
variables, Radix UI primitives, shadcn/ui-style components (copied into the repo, not an
npm dependency), Lucide icons, self-hosted Figtree font (no CDN at runtime — the mockup
HTML's Google Fonts link is just for the throwaway mockup, not a rule for the real app).

Minor doc-only fix still pending: `ui-mockups.html` uses a Google Fonts CDN link for
Figtree; harmless for a static mockup but worth a comment noting it doesn't apply to the
real app, if anyone revisits that file.

## Implementation plan (P0 MVP)

This is now an actual implementation plan, built from the decisions above plus the
reference guide and UI guidelines. Scope: P0 (manual CRUD, budgets, allowance, recurring
bills, installments, dashboard, audit-friendly edits, backup/restore, CI, LAN deployment).
P1 (Metas/goals, audit history viewer) is not blocking MVP, but schema leaves room for it.

### Phase 0 — Repo scaffold

Deliverable: `npm install` + `npm run dev` work; lint/typecheck pass; CI stub exists.

- Root: npm workspaces (`backend`, `frontend`, `packages/shared`), single `package-lock.json`.
- `packages/shared/src/` — hand-written TS enums/DTOs mirrored from the Prisma schema, so the
  frontend never imports `@prisma/client` directly and API shapes can't silently drift.
- `LICENSE` (AGPL-3.0), `README.md`, `.env.example`, eslint/prettier config.
- `.github/workflows/ci.yml` stub (install + lint only; filled in in Phase 6).
- **First commits, before any split**: `compose.dev.yml`, `Makefile`, `.nvmrc` and the root
  `package.json` land first (one agent/main session). Tracks A and B start after.
- **Dev inside Docker only** (no Node on the host): `compose.dev.yml` with an `app` service
  (`node:22-bookworm-slim`), `mysql:8.4`, source bind mount, `node_modules` in a named volume,
  Vite on `--host 0.0.0.0`. All commands go through `docker compose run --rm app npm ...`,
  wrapped in a root `Makefile` (`make install`, `make test`, `make lint`, `make migrate`) so
  agents and the user type the same thing. Playwright runs in a separate service on the
  `mcr.microsoft.com/playwright` image, same version as the npm package. Node version pinned
  in `.nvmrc` and `engines` for CI and the Dockerfile.
- **Money contract** in `packages/shared`: `type Money = string`, format
  `^-?\d{1,10}\.\d{2}$`, one shared Zod `moneySchema`. Amounts travel in JSON as decimal
  strings, never numbers (Prisma `Decimal` is not JSON-safe).
- **Date contract** in `packages/shared`: date-only fields travel as `"YYYY-MM-DD"` strings.
- **UI text**: `i18next` + `react-i18next`, one locale `pt-BR`, resources bundled at build (no
  HTTP backend, no CDN). `frontend/src/i18n/index.ts` + `frontend/src/i18n/pt-BR.json`, split
  by view. Typed resources so a missing key fails `tsc`. Lint rule
  `react/jsx-no-literals` on JSX (the i18next plugin rule did not fire; checked 2026-10-14). Money and dates stay with `Intl`, not i18next.
- Doc fix: add an HTML comment above the Google Fonts link in `docs/ui-mockups.html:2` — the
  real app self-hosts Figtree; the CDN link is for the mockup only.
- Doc fix: update `docs/household-finance-reference-guide.md` §13 — "spendual" not
  "Household Finance App", Express/Prisma instead of Django/DRF.

### Phase 1 — Data model

Deliverable: `backend/prisma/schema.prisma` migrated against local MySQL; client generates;
seed script creates categories/accounts/payment methods.

- **Money**: `Decimal @db.Decimal(12,2)` everywhere, plus a `currency` column fixed to `"BRL"`.
  Never `Float`.
- **Transaction**: separate `type` enum (expense/income/other receipt/refund/transfer) and
  `status` enum (planned/confirmed/cancelled/voided) — never collapsed into one field. Plus
  `scope` (household/personal), `ownerId`, `payerId`, `createdById`/`updatedById`,
  `transactionDate`, `expectedDate`, `relatedTransactionId`, `voidReason`.
- **PersonalAllowanceEntry**: append-only ledger (`ALLOCATION|ADJUSTMENT|CORRECTION` rows per
  owner/period), balance always derived by summing, never a mutable stored balance. Matches
  the "design for one, allow many later" decision: enforce "at most one `ALLOCATION` per
  owner/period" in the service layer, **not** a DB unique constraint — leaves room for
  unlimited adjustments without a migration. Lock: inside `$transaction`, `SELECT ... FOR
  UPDATE` on the owner's `User` row (`$queryRaw`), then check for an existing `ALLOCATION`,
  then insert.
- **Household**: one seeded row, used only as the lock row for the 2-account cap (Phase 2).
- **Lock retry**: small `withRetry` helper, retries on MySQL errors 1213 (deadlock) and 1205
  (lock wait timeout), max 3 tries. Used by every `FOR UPDATE` transaction.
- **Date-only fields**: `transactionDate`, `expectedDate`, occurrence dates are `@db.Date`,
  not DATETIME — a DATETIME at local midnight shifts a day when read as UTC.
- **MonthlyBudget**: versioned list (`scope` enum `OVERALL|CATEGORY`, `categoryId` nullable,
  `categoryKey` string = `"overall"` or the category id, `effectiveFrom` as period key
  `YYYY-MM`, `amount`); `@@unique([categoryKey, effectiveFrom])`. `categoryKey` exists because
  MySQL `UNIQUE` lets many NULLs through, so a nullable `categoryId` cannot be unique.
  "Budget for period X" = latest row with `effectiveFrom <= X`. Edit rules, in one transaction:
  - "Going forward" at P: upsert the row at P.
  - "This period only" at P: upsert the row at P; then, only if no row exists at P+1, insert
    a row at P+1 with the amount in force before the edit. If a row at P+1 exists, leave it —
    it already defines P+1.
  Past periods are never mutated.
- **RecurrenceRule/Occurrence**: unique `(ruleId, periodKey)` for idempotent generation; day
  29–31 rules resolve to the last day of shorter months.
- **InstallmentPlan/Occurrence**: unique `(planId, sequenceNumber)`; integer-cent division,
  remainder cents go to the last installment; test `sum(occurrences) === total` for counts 1–60.
- **SavingsGoal/GoalEntry** (P1, modeled now): same append-only ledger pattern, so Phase 6+
  (goals UI) is additive, not a migration surprise. Matches the "block closure, prompt for
  transfer" decision — no auto-sweep logic needed in the schema itself.
- **AuditEvent** (P1 viewer, table created now): written starting Phase 3 on every
  edit/void/cancel, even though the viewer ships later.
- **Category/Account/PaymentMethod**: `active` boolean, never hard-deleted once referenced.

Testing: Vitest against a real MySQL (docker service): constraints fire correctly, budget
"this period only" row pair resolves correctly (incl. P+1 already has a row, and two edits at
the same P), installment rounding totals, recurrence idempotency (generator run twice → no
duplicate rows), concurrent allocation inserts → exactly one `ALLOCATION`; `withRetry` retries on a forced
1213/1205 error and rethrows on the third failure.

### Phase 2 — Auth

Deliverable: `/entrar` works end to end — signup blocked after 2 accounts, login sets a
session cookie, protected routes reject unauthenticated requests, logout revokes server-side.

- **Session cookie, not JWT**: matches the guide's server-managed-session + CSRF model; JWT
  would need extra machinery just to get revocation back, for no benefit at this scale.
  `express-session` + a MySQL-backed store (sessions in the same MySQL instance, no Redis).
  Checked 2026-10-14: `express-mysql-session` last release 2024-07-10 (over 2 years) — do not
  use it. Use `@quixo3/prisma-session-store` or a small custom store.
  Cookie: `HttpOnly`, `SameSite=Lax`, `Secure: false` (no HTTPS at MVP), 7-day rolling expiry.
- **CSRF**: `csurf` is deprecated. Synchronizer token kept in the session, sent in an
  `X-CSRF-Token` header on state-changing requests; `GET /auth/csrf` returns it. No dependency.
- Password hashing: `@node-rs/argon2` (prebuilt binaries, no node-gyp). Decided here, tested
  inside the dev container in this phase, so Phase 6's Dockerfile has no surprise.
- **2-account cap**: inside `$transaction`, `SELECT ... FOR UPDATE` on the single `Household`
  row, count users, insert or reject; wrapped in `withRetry`. Not SERIALIZABLE over an empty
  table — InnoDB gap locks can give a deadlock error instead of a clean reject.
- Rate-limit `/auth/login` (`express-rate-limit`, in-memory store is fine for a single-process
  LAN app).

Testing: Vitest + supertest — signup succeeds twice then 3rd rejected; race test fires 5
signups at once and expects exactly 2 users, every other reply the clean "household full"
error (not 500); login/logout, session expiry, CSRF rejection, password never in any response.

### Phase 3 — Core CRUD + entry flow

Deliverable: create/view/edit/cancel/void expenses, income, other receipts, refunds,
transfers through the real UI; categories/accounts/payment methods manageable; every edit
writes an `AuditEvent`.

- Zod schemas per transaction type/scope combination (shared shape with `packages/shared`
  enums) so "fields show only when type/scope need them" is enforced server-side too.
- Void/cancel always requires a `reason` string — rejected with 400 if missing, even though
  the client also validates.
- No hard delete: confirmed records get `VOIDED` + reason, planned records get `CANCELLED`.
- Timezone centralized in one backend util (`luxon`/`date-fns-tz`, `America/Sao_Paulo`),
  never scattered `new Date()` calls.
- Money: every amount validated with the shared `moneySchema`, parsed with
  `new Prisma.Decimal()`. One backend serializer turns `Decimal` into `toFixed(2)`; no
  `JSON.stringify` of raw `Decimal` anywhere. Frontend `currency.ts` parses PT-BR input
  (`1.234,56`) to the API string and never does float math on amounts; display sums come
  from the API.
- Frontend: `frontend/src/components/ui/` (shadcn-style Radix wrappers: dialog, sheet,
  select, tabs, toast, button — built once, reused everywhere), `frontend/src/lib/currency.ts`
  (the one shared `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})` formatter
  from ui-guidelines §5), `frontend/src/lib/date.ts`.

Testing: Vitest unit tests on the transaction service (refund linkage, scope/owner
consistency, double-submit prevention); Vitest+RTL for conditional field rendering and
PT-BR amount parsing; supertest for unauthorized ownership/scope combos.

### Phase 4 — Dashboard, budgets, bills, installments

Deliverable: `Início`, `Orçamentos`, `A pagar` views live with real numbers; recurring rules
generate planned occurrences; installment plans sum correctly; confirming a planned item
never double-counts.

- `backend/src/domain/accounting.ts` — pure functions for the guide's Appendix A formulas
  (household savings, personal closing balance, unallocated savings, savings rate),
  unit-testable with plain numbers, no DB access.
- Recurrence generation triggered on-demand (login/dashboard load) rather than a separate
  worker — 2 users, no job queue needed. A read request now writes data, so: the generator
  runs in one transaction and inserts with `createMany({ skipDuplicates: true })` (INSERT
  IGNORE), so two parallel loads never fail on the Phase 1 unique constraint.
- Unknown-amount planned bills: `expectedAmount = null` is distinct from `0` — every
  aggregation explicitly skips nulls, UI renders `valor ?`, never `R$ 0,00`.
- "Confirmar pagamento" reuses the Phase 3 entry-flow component, pre-filled from the
  occurrence — this is where planned becomes confirmed; never auto-confirm on date passing.

Testing: Vitest against the guide's own worked example (R$10.000 income / R$5.000 expenses /
2×R$1.000 allowances → R$3.000 savings); recurrence idempotency + month-end matrix; two
parallel dashboard loads → no duplicates, no 500;
installment sum-matches-total across counts/amounts. First Playwright e2e target here: log
in, create a recurring rule, generate twice, confirm one occurrence, verify the dashboard
total updates exactly once.

### Phase 5 — Settings and backup

Deliverable: `Ajustes` lets a user set name/tone/theme and manage categories/accounts/payment
methods (archive, not delete); a documented, tested backup/restore procedure exists.

- Backup: `deployment/backup.sh` and `deployment/restore.sh` hold the logic. A host systemd
  timer on the deploy box calls `backup.sh`, which runs
  `docker compose exec -T mysql mysqldump ...` (MySQL password from a root-only file, not the
  command line), writing to a host-mounted directory **outside** the
  MySQL data volume (so a corrupted data volume doesn't also lose backups). Gitignored,
  `600` permissions, non-root owner.
- "Backup status" row in Ajustes reads the backup directory's last file mtime/size.
- User tone conflict: plain DB `UNIQUE` constraint on `User.tonePalette` (only 2 users, no
  future multi-value need here, unlike the allowance case).

Testing: Vitest/supertest for tone conflict + archive-not-delete; scripted restore test
(`backup.sh` → recreate a throwaway DB → `restore.sh` → assert row counts match) run against
the disposable CI MySQL service.

### Phase 6 — CI and deployment

Deliverable: every PR runs lint/typecheck/tests/build in GitHub Actions; `docker compose up`
on the Ubuntu box serves the app at `spendual.local` on the LAN, no public ingress.

- **Single app container**: Express serves the built frontend as static files plus the API
  (multi-stage Dockerfile: build frontend, copy `dist` into the backend image) — one
  container, one port, simplest firewall rule and simplest mDNS story.
- **MySQL**: internal Compose network only, no port published to the host/LAN.
- **Restart on boot**: `restart: unless-stopped` on every Compose service, plus
  `systemctl enable docker` on the deploy box (sign-off step 13 depends on both).
- **mDNS (`spendual.local`)**: the deploy box is a different machine from the dev box. First
  step: on the deploy box run `systemctl is-active avahi-daemon` and `ss -ulpn | grep 5353`.
  - Host avahi active: publish with a host service file `/etc/avahi/services/spendual.service`,
    no container (a second avahi on 5353 may clash).
  - Not active: containerized avahi with `network_mode: host`.
  - Document the result in `deployment/README.md`.
  - Windows: Windows 10 (1803+) and 11 resolve `.local` natively (fairly sure, not tested),
    but results vary by network profile and firewall. Test on the actual target Windows
    device; keep a documented static-IP + hosts-file fallback.
- **No HTTPS at MVP**: cookie `Secure` off, risk documented in `deployment/README.md`, host
  firewall restricts to the LAN subnet.
- CI: lint, `tsc --noEmit` (both workspaces), Vitest backend against a disposable `mysql:8.4`
  service container, Vitest+RTL frontend, Playwright against a built preview, `npm run build`
  both workspaces, secret scan (gitleaks/trufflehog). No real data/credentials in CI.

### P1-1 — Shared savings goals (`Metas`) (planned 2026-10-21, not started)

Deliverable: `/metas` lists goals with balances; users allocate to and withdraw from a goal;
Início shows unallocated savings and the amount in goals. Built and checked on the dev stack
(hot reload). The prod build and first prod run wait until the P1 features are done.

Decisions (user, 2026-10-21):
- Either user may close or archive a goal. Every change records its actor.
- `completed` can go back to `active`. `archived` is final and read-only.
- Target amount and target date are optional and editable (schema columns are nullable).
- `/metas` card "Poupança sem destino" is the amount left for the current month, the same
  number as Início. It is not a total over all months: a total would have to match the bank
  account exactly. Revisit how to show it later.

Rules (guide §7):
- Balance = ALLOCATION − WITHDRAWAL ± CORRECTION, derived on read, never stored.
- Allocation and withdrawal are never income or expense.
- A withdrawal goes only back to unallocated savings and must not exceed the goal's balance.
- Allocate and withdraw only on `active` goals.
- `complete` and `archive` need a zero balance, else 409 `goal_has_balance`. The UI offers
  "Retirar tudo e concluir": one WITHDRAWAL, then close.
- CORRECTION entries: no UI this round.

Schema exists: `SavingsGoal`, `GoalEntry` (`backend/prisma/schema.prisma:354`, append-only). No
migration needed; a CHECK `amount > 0` on ALLOCATION and WITHDRAWAL is optional.

Work items, one commit or more each, in this order:
1. Contract: `packages/shared/src/goals.ts`, exported from `index.ts`. Goal DTO (`balance`,
   `status`, optional target), entry DTO, Zod schemas for create, patch, allocate, withdraw
   (`positiveMoneySchema`, `effectiveDate` inside the month window, `notes`). Error code
   `goal_has_balance`. Fix the "Goals are not in P0" comment in `planning.ts`.
2. Service: `backend/src/services/goals.ts`. Pattern from `services/allowance.ts`: `withRetry`
   plus `SELECT … FOR UPDATE` on the goal row before a withdrawal or a close. Move the audit
   helper from `services/transactions.ts` to `backend/src/lib/audit.ts` and share it with
   `services/bills.ts`.
3. Dashboard: replace `const goalNet = 0n` in `backend/src/services/dashboard.ts` with
   ALLOCATION − WITHDRAWAL whose `effectiveDate` is in the month. `unallocatedSavings` in
   `domain/accounting.ts` already takes it.
4. Routes: `backend/src/routes/goals.ts`, mounted like `planning.ts`.
   - `GET /goals` (with balances), `POST /goals`, `PATCH /goals/:id`
   - `POST /goals/:id/allocations`, `POST /goals/:id/withdrawals`
   - `POST /goals/:id/complete`, `/reopen`, `/archive`
   - `GET /goals/:id/entries`
5. Frontend: `frontend/src/features/goals`, `frontend/src/pages/MetasPage.tsx`, route `/metas`
   in `App.tsx`, item in `MaisPage.tsx` and the desktop sidebar (ui-guidelines §2).
   - Cards: "Poupança sem destino", then one card per goal (balance, progress bar only with a
     target, history).
   - `Alocar` and `Retirar` sheets. Withdrawal needs a confirmation dialog (ui-guidelines §6.8).
   - Closing with money left offers to withdraw the rest first.
   - Início: add an "Em metas" line next to "Poupança sem destino" (`DashboardView.tsx`).
   - pt-BR strings in `frontend/src/i18n/pt-BR.json`.
6. E2E: `e2e/tests/goals.spec.ts`: create a goal, allocate, check Início, withdraw, close.
7. Docs: `CURRENT_STATE.md`, `docs/open-points.md`. Tag `p1-goals`.

Testing: `backend/tests/goals.test.ts`. The disk is slow (about 11 s per test), so few tests
with many asserts each.
- Guide §7 example: 10.000 − 5.000 − 2.000 = 3.000; allocate 1.000 and 500; unallocated 1.500;
  unallocated + goals = 3.000.
- Withdrawal over the balance is rejected. Two parallel withdrawals: one fails.
- Close with money left gives 409. Reopen works. Archived rejects every write.
- Goals change no income, expense, analytics or category total.
- Sign-off: `make lint typecheck test e2e` exit 0. On the dev stack, after `make backup-dev`, run
  the §7 numbers by hand and check Início and `/metas` on the phone.

Way of working: one session on `dev`, no worktrees unless the user asks (slow disk, shared RAM).

Later P1 items (order from `docs/open-points.md`): audit history (events on transaction create
and rule create/patch, then a viewer), monthly savings target, CSV export. Then the prod work:
own project name, build check, first run on `jobs`, move dev data with backup and restore,
mDNS, backup timer, reboot test.

## Version control workflow

- Work happens on a new branch off `main`: `dev`. Nothing lands on `main` directly during
  implementation.
- Commits are broken down within each phase — not one giant commit per phase. Each commit is
  a reviewable, reasonably-scoped unit (e.g. "add Prisma schema for Transaction model", "add
  recurrence idempotency test" — not the whole Phase 1 in one commit), so the branch can be
  audited commit-by-commit later.
- Commit message format follows the project's hard rules (`CLAUDE.md`): one line, ~50
  characters aim (72 cap), capitalized imperative, no period, no body, no trailers, no
  attribution line, no `Co-Authored-By` (CLAUDE.md, LANGUAGE.md §8).
- Once all commits for a phase are done, tag the branch tip to delimit the phase boundary
  (e.g. `phase-0-scaffold`, `phase-1-data-model`, `phase-2-auth`, `phase-3-core-crud`,
  `phase-4-dashboard`, `phase-5-settings-backup`, `phase-6-ci-deployment`) before starting the
  next phase's commits.
- No pushing to GitHub and no PRs as part of this plan — local branch + tags only, per the
  project rule to never post to GitHub without an explicit yes.

## Parallel agent breakdown

Goal: split implementation work across multiple Sonnet agents running in parallel, not one
agent working the whole plan serially. Real constraint: most phases build directly on the
previous phase's schema/services, so phases themselves stay mostly sequential — the
parallelism is **within** each phase, splitting backend vs. frontend (or, in Phase 1,
splitting by risk of file contention), not across phases.

Rule for every phase that has both a backend and a frontend track: before splitting, one
agent drafts the shared contract first — the `packages/shared` enum/DTO shapes and the
route list/request/response shapes for that phase — as a small, fast, first commit. Only
after that lands do the backend and frontend agents start in parallel against it, so neither
is guessing at the other's shape.

| Phase | Agent tracks | Can start after |
|---|---|---|
| 0 — Scaffold | **A:** root workspace, `backend/` skeleton, CI stub, `LICENSE`, `.env.example`. **B:** `frontend/` skeleton, `packages/shared` skeleton. Independent file trees, safe to run together. | nothing (first work) |
| 1 — Data model | **Single agent** drafts `schema.prisma` in full — it's one file; two agents editing it concurrently is a merge-conflict risk, not a parallelism win. Once the schema shell (entity/field names) is drafted (not yet migrated), a **second agent** can start the seed script and the Vitest test scaffolding against the draft shapes, while the first agent finalizes migrations and the trickier constraints (budget versioning, allocation uniqueness-in-service-layer, installment rounding). | Phase 0 |
| 2 — Auth | **A (backend):** session/CSRF middleware, auth service, 2-account-cap transaction logic. **B (frontend):** `/entrar` screen, `api-client.ts`. Split once the shared DTO contract (signup/login request/response, error shapes) is drafted. | Phase 1 schema merged |
| 3 — Core CRUD + entry flow | **A (backend):** transaction/category/account/payment-method routes + services + audit writes. **B (frontend):** `Lançamentos` list, `Novo lançamento` sheet, the shared `ui/` component library (dialog/sheet/select/tabs/toast/button), `currency.ts`/`date.ts`. Split once Zod/DTO shapes for each transaction type are drafted. | Phase 2 |
| 4 — Dashboard, budgets, bills, installments | **A (backend):** `accounting.ts` domain functions, dashboard/budgets/recurring/installments services + routes. **B (frontend):** `Início`, `Orçamentos`, `A pagar` views, the budget edit sheet, "Confirmar pagamento" flow reusing Phase 3's entry component. | Phase 3 (needs the entry-flow component and real transaction data to render against) |
| 5 — Settings and backup | **A (backend):** settings routes (tone/theme), `backup.sh`/`restore.sh`. **B (frontend):** `Ajustes` view. Low coupling to Phase 4 — can realistically start in parallel with Phase 4 once Phase 3 is merged, if agent capacity allows, since neither settings nor backup depends on the dashboard. | Phase 3 (not strictly Phase 4) |
| 6 — CI and deployment | **Single agent.** Integration work touching the multi-stage Dockerfile, `docker-compose.yml`, CI workflow, and the avahi container — needs working build artifacts from both backend and frontend to wire together and test, so it's done once Phases 3–5 are substantially merged, not split further. | Phases 3–5 |

Coordination notes:
- One git worktree per agent (`../spendual-wt/<phase>-<track>`, branch
  `dev-<phase>-<track>`) — agents sharing one working tree and index collide on commits.
  Branches stay short-lived.
- Each worktree sets its own `COMPOSE_PROJECT_NAME` (e.g. `spendual_p3a`), so containers,
  volumes and the test DB are not shared and tests do not clobber each other.
- The main session merges track branches into `dev` (fast-forward or rebase), runs the full
  test suite, then tags the phase.
- Commit granularity and tagging rules (above) apply per agent's commits the same way they'd
  apply to one agent working alone — the phase tag only gets created once **all** tracks for
  that phase are merged into `dev`.
- If two tracks in the same phase both need to touch `packages/shared` after the initial
  contract commit (e.g. a type was missing), make that a small commit on `dev`, then each
  track rebases — never each agent maintaining its own divergent copy.

## End-to-end verification (MVP sign-off)

1. `docker compose up -d`; confirm MySQL has no LAN-reachable port.
2. From a second LAN device, resolve `http://spendual.local` — check the actual Windows
   device specifically; confirm/document the static-IP fallback if it fails anywhere.
3. Sign up account 1 and account 2; confirm a 3rd signup attempt is rejected.
4. Log in as each user; confirm cookie session, logout, re-login.
5. Enter a shared expense, a personal expense (different owner), an income, a transfer, and a
   refund linked to the expense; confirm signs/colors and refund netting in `Lançamentos`.
6. Create both users' monthly allowance allocations; confirm household savings subtracts them
   once, confirm each personal balance is correct and independent of the partner's spending.
7. Create a one-off planned bill and a monthly recurring rule; trigger generation twice;
   confirm no duplicate occurrences; confirm it's excluded from actuals until confirmed.
8. Confirm the planned bill via "Confirmar pagamento"; verify it appears once in actuals and
   once (not twice) in the dashboard total.
9. Create a 3x installment plan; confirm the three occurrences land in the right months and
   sum exactly to the purchase total.
10. Check a category budget bar reflects actual+planned; edit it mid-month both ways ("só
    este mês" / "indo em diante"); confirm past months are untouched.
11. Void a confirmed transaction with a reason; confirm it stays visible (struck through) and
    an `AuditEvent` row exists.
12. Run `backup.sh`, tear down a **test** copy of the stack, recreate, run `restore.sh`,
    confirm all data above is intact.
13. Reboot the host; confirm Compose services restart automatically without manual steps.

## Critical files

- `backend/prisma/schema.prisma`
- `backend/src/domain/accounting.ts`
- `backend/src/services/transactions.service.ts`
- `frontend/src/lib/currency.ts`
- `deployment/docker-compose.yml`
- `.github/workflows/ci.yml`
