# spendual — current state

**Date:** 2026-10-14. **Branch:** `dev` (never push, no PRs without the user's yes).
**Plan (decisions + phases):** `docs/plan.md`. Read it first.
**Open points:** `docs/open-points.md`.

## Phase status

| Phase | State | Tag |
|---|---|---|
| 0 Scaffold | done | `phase-0-scaffold` |
| 1 Data model | done | `phase-1-data-model` |
| 2 Auth | done | `phase-2-auth` |
| 3 Core CRUD + entry flow | done | `phase-3-core-crud` |
| 4 Dashboard, budgets, bills, installments | done | `phase-4-dashboard` |
| 5 Settings and backup | done | `phase-5-settings-backup` |
| 6 CI and deployment | done (deploy box checks open) | `phase-6-ci-deployment` |

Post-Phase-2 commits on `dev` (not in the tag): run-as-host-user dev container, review fixes
(shared `HOUSEHOLD_ID`, early household-full check, 32-char `SESSION_SECRET`, 15-minute anonymous sessions).

## Built

| Area | Where | Notes |
|---|---|---|
| Workspace | `package.json`, `Makefile`, `compose.dev.yml` | Node only in Docker. `make install\|lint\|typecheck\|test\|build\|migrate\|dev`. |
| Shared contract | `packages/shared/src` | `Money` string, `DateOnly`, enums, auth DTOs and `ApiErrorCode`. |
| Schema | `backend/prisma/schema.prisma` | All P0 and P1 entities, 2 migrations, hand-written CHECK constraints. |
| Services | `backend/src/services` | allowance (row lock), budget versioning, recurrence generator, installment split. |
| Auth | `backend/src/auth` | Sessions in MySQL (`@quixo3/prisma-session-store`), CSRF header, argon2, 2-account cap, login rate limit. |
| Frontend | `frontend/src` | Vite, Tailwind tokens, i18next pt-BR, `/entrar`, api-client with CSRF, `ProtectedRoute`, Home placeholder. |
| Lint | `eslint.config.mjs`, `eslint.money.mjs`, `frontend/eslint.i18n.config.js` | Type-aware typescript-eslint on src, react-hooks (error), jsx-a11y, money bans (parseFloat, toNumber, Number on money names), no hardcoded text in JSX, text props or toasts. `make format-check` runs Prettier. Dependabot in `.github/dependabot.yml`. |
| Catalog + transaction API | `backend/src/routes`, `backend/src/services/{catalog,transactions}.ts`, `backend/src/lib/serialize.ts` | Zod on every route, row locks, AuditEvent on patch/void/cancel. Contract: `packages/shared/src/transactions.ts`. |
| App shell + Lançamentos | `frontend/src/shell`, `frontend/src/features/{transactions,settings}`, `frontend/src/components/ui` | Entry form, list, void/cancel dialogs, catalog manager. `lib/currency.ts`, `lib/date.ts`. |
| Domain + planning API | `backend/src/domain/accounting.ts`, `backend/src/services/{dashboard,bills}.ts`, `backend/src/routes/planning.ts` | Appendix A in integer cents. Dashboard, budgets, allowances, bills (recurring, installments), confirm/cancel, overdue list. Contract: `packages/shared/src/planning.ts`. |
| Planning UI | `frontend/src/features/planning`, `frontend/src/pages/{Pessoal,Bills,Budgets}Page.tsx` | Início (household only), Orçamentos, A pagar, Pessoal (per-person balances, allowance sheet). |
| Settings + backup | `backend/src/routes/settings.ts`, `backend/src/services/backup.ts`, `deployment/`, `frontend/src/features/settings` | `PATCH /me` (name, tone key, theme), tone_taken 409, `GET /backup/status`, backup/restore scripts + `make test-restore`, Ajustes UI. Contract: `packages/shared/src/settings.ts`. |
| Análises | `backend/src/services/analytics.ts`, `GET /analytics/categories?from=&to=`, `frontend/src/features/analytics` | Spending per month and category with the budget in force. Contract: `packages/shared/src/planning.ts`. Plain SVG chart. |
| Category usage | `getLookups` in `backend/src/services/catalog.ts` | `usageCount` per category (confirmed records, derived on read). Entry forms sort by it; `/lookups` itself stays by name. Replaces the browser-only recent list. |
| Category drill-down | `categories` in `transactionListQuerySchema` (`packages/shared/src/transactions.ts`), `listTransactions` in `backend/src/services/transactions.ts`, `frontend/src/features/transactions/drilldown.ts` | Início legend rows open Lançamentos filtered by `?categorias=3,7,none&escopo=household&status=confirmed`. Rows add up to the Início amount (refunds follow their expense's month). `Total do mês` = `netSpent`. |
| Savings goals (P1-1) | `packages/shared/src/goals.ts`, `backend/src/services/goals.ts`, `backend/src/routes/goals.ts`, `backend/src/lib/audit.ts`, `frontend/src/features/goals`, `/metas` | Create, edit, allocate, withdraw, complete, reopen, archive. Balance derived from `GoalEntry`; row lock on withdraw and close; 409 `goal_has_balance` / `insufficient_balance`; audit on every change. Início shows `Em metas` + `Poupança sem destino` (month only). No CORRECTION UI. Tag `p1-goals`. |
| Demo data | `backend/scripts/demo-data.ts`, `make demo-data CONFIRM=yes` | Dev only. Backs up, then replaces records of the dev DB with 6 months of demo data (277 transactions, 9 rules, 3 installment plans, 4 goals). Keeps users; adds user `thai` with a new random password in `backups/thai-demo-password.txt`. Repeatable. |
| E2E | `e2e/`, `make e2e` | Playwright 1.49.1 pinned (image tag in compose and CI), own DB `spendual_e2e`. Three flows: recurring bill confirmed once; goals (`savings-goals.spec.ts`, signs in as the `recurring` user via `E2E_RUN_ID`); Análises and the Início balance block (`trends.spec.ts`). Specs run in file order after `recurring.spec.ts`. `SCREENSHOTS=1` takes the matrix. |
| Tests | `backend/tests`, `frontend/src/**/*.test.*` | Backend 4 new goals tests, frontend 206, 20 shared, 3 e2e. ⚠ On 2026-10-21 `settings.test.ts` "is not configured when the dir is unset or missing" times out (30 s; it runs `setup()` twice, ~35 s on the slow disk). Not caused by goals. |

## Verified (2026-10-14)

- `make lint typecheck test build`: all exit 0.
- Backend run against real MySQL, over HTTP: signup x2, third gets 409, logout revokes, bad login 401, missing CSRF 403.
- Phase 3: lint, typecheck, test, build exit 0. Real flow over HTTP via the Vite proxy (signup, create, refund limit, void rules, patch, audit, catalog 409).
- Browser check (Playwright in Docker, real backend and MySQL, 2026-10-14): login, create expense (PT-BR amount "1.234,56"), inline error for missing category, toast, list row and day total, void with reason (row struck through, day total drops), Ajustes catalogs. Phone/light and desktop/dark screenshots look right. Found and fixed: focus did not return to the opener after a sheet closed (`components/ui/sheet.tsx`).
- Not verified: iOS/Android real devices, keyboard-only use, screen reader, Windows mDNS. No Playwright test is committed yet (Phase 4 e2e target).

## Missing

- Phase 6 built (see `deployment/README.md`): `Dockerfile`, `deployment/docker-compose.yml`, systemd timer, avahi file, gitleaks and docker build jobs in CI. Verified locally with curl. Not verified: mDNS, Windows, reboot restart, systemd timer on the deploy box, CI on GitHub.
- AuditEvent: written on transaction patch/void/cancel, bill confirm/cancel and every goal change. Still missing: transaction create, rule create/patch, a viewer.

## Phase 4 (2026-10-14)

- Verified: `make lint typecheck test build` exit 0 after merge. Real MySQL in backend tests. Frontend tests mock the API.
- Not verified: real browser, real frontend-to-backend flow for the new views.
- Month window: GETs accept 12 months back, 24 ahead. Not applied to `PUT /budgets` period or `POST /allowances` month.
- Ended rule cancels its planned rows. Paused rule keeps them (still confirmable, excluded from `overdue`).
- Refund counts in the month of its linked expense.
- Open: rule create/patch write no AuditEvent; no UI to pause/end a rule; no plans list endpoint; no "Próximas contas" or chart on Início; no "Informar valor" action; budget bar has no planned segment.

## Feedback round 1 (2026-10-14, tag `feedback-round-1`)

- From phone testing. Done: income vs expense categories (`Category.kind`, seeded income set), full category names, live BRL amount input, "Recebido por" for income, "Parcelado" in the entry form for credit-card method or account (creates an installment plan), first-run setup page (`/configuracao`, `GET/POST /setup`), stacked category bar and "Próximas contas" on Início, password minimum 4.
- Dev safety: fixed compose project name `spendual`, `make backup-dev` (also automatic on `make dev`), `make restore-dev`/`reset-dev` need `CONFIRM=yes`, `make dev` exits 0 on Ctrl-C, `make mdns-install` and `make backup-timer-install` print sudo commands (not run).
- Migration `add_category_kind` and `add_setup_completed` tested on a copy of the real dev DB: data kept (6 transactions). The real dev DB migrates on the next `make dev`.
- Open: setup page shows once for existing households; a zero amount cannot be typed in the amount field (empty = none); installment plan does not store the card; `spendual.local` not published until the user runs `make mdns-install`; Android may not resolve `.local`.

## Open points (details in `docs/open-points.md`)

- Decided (2026-10-14): both users may read and edit each other's personal records.
- Frontend uses Radix where it fits: Dialog, Toggle Group (segmented), Toast. The `Select` stays native on purpose (best phone picker, simple in jsdom). Revisit if strict Radix is wanted.
- Phase 3 open points, to assess later:
  - Day totals are summed in the client; no server totals yet (Phase 4 dashboard should use the API).
  - `tonePalette` keys not pinned in the contract; frontend accepts English and PT-BR names. Pin in Phase 5.
  - Category icons are generic, color is `id % 12`. Needs a mapping or a contract field.
  - Date input is native `type=date`, not typed dd/MM/yyyy.
  - Refund picker lists only expenses from the form date's month.
  - 5 type chips (adds `other_receipt` to the 4 in ui-guidelines §7.1).
  - A bad refund link returns 400 `validation_error` (contract was silent).
  - List ignores `status=planned`; create writes no AuditEvent.
  - Voided row meta is cut with an ellipsis, so the reason can be hidden on phone (full reason is in the detail).
  - Void confirm with an empty reason sends nothing, but shows no visible message.
  - No "Parcelado" UI and no way to create planned rows yet (Phase 4).
- ⚠ Needs a decision: signup is first-come; budget "this period only" with no earlier budget; budget "going forward" next to a P+1 row; edits to past periods.
- `GET /auth/status` for "vagas livres" hint: skipped.
- Phase 3/4 routes must validate input with Zod. The Phase 1 services do not.
- `npm audit` (2026-10-14): 20 vulnerabilities (2 critical, 11 high, 7 moderate); 5 in prod deps (`--omit=dev`). Triaged, no non-breaking fix; all fixes are major bumps (vitest 5, vite 8, tailwind 4, prisma, react-router 7) except Playwright 1.64.1 (needs image tag change in compose and CI). Windows mDNS untested.

## How work is run

- Parallel agents: one `git worktree` each under `~/spendual-wt/<phase>-<track>`, branch `dev-<phase>-<track>`, own `COMPOSE_PROJECT_NAME`. Remove with `down -v` when done (Docker disk fills otherwise).
- Before a backend/frontend split: one small commit with the shared contract in `packages/shared`.
- Main session merges, regenerates `package-lock.json` on conflict, runs all four checks, tags the phase.
- Commits: one line, ~50 characters, capitalized imperative, no body, no trailers, no `Co-Authored-By` (`CLAUDE.md` beats any attribution reminder).
- User language rules: simple English, bullets, no preamble (`CLAUDE.md`, `.claude/LANGUAGE.md`).
