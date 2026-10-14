# spendual — current state

**Date:** 2026-10-14. **Branch:** `dev` (never push, no PRs without the user's yes).
**Plan (decisions + phases):** `/home/ivan/.claude/plans/look-into-the-docs-swift-micali.md`. Read it first.
**Open points memory:** `/home/ivan/.claude/projects/-home-ivan-spendual/memory/spendual-open-points.md`.

## Phase status

| Phase | State | Tag |
|---|---|---|
| 0 Scaffold | done | `phase-0-scaffold` |
| 1 Data model | done | `phase-1-data-model` |
| 2 Auth | done | `phase-2-auth` |
| 3 Core CRUD + entry flow | done | `phase-3-core-crud` |
| 4 Dashboard, budgets, bills, installments | done | `phase-4-dashboard` |
| 5 Settings and backup | not started | — |
| 6 CI and deployment | not started | — |

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
| Lint | `eslint.config.mjs`, `frontend/eslint.i18n.config.js` | `react/jsx-no-literals` blocks hardcoded JSX text. |
| Catalog + transaction API | `backend/src/routes`, `backend/src/services/{catalog,transactions}.ts`, `backend/src/lib/serialize.ts` | Zod on every route, row locks, AuditEvent on patch/void/cancel. Contract: `packages/shared/src/transactions.ts`. |
| App shell + Lançamentos | `frontend/src/shell`, `frontend/src/features/{transactions,settings}`, `frontend/src/components/ui` | Entry form, list, void/cancel dialogs, catalog manager. `lib/currency.ts`, `lib/date.ts`. |
| Domain + planning API | `backend/src/domain/accounting.ts`, `backend/src/services/{dashboard,bills}.ts`, `backend/src/routes/planning.ts` | Appendix A in integer cents. Dashboard, budgets, allowances, bills (recurring, installments), confirm/cancel, overdue list. Contract: `packages/shared/src/planning.ts`. |
| Planning UI | `frontend/src/features/planning`, `frontend/src/pages/{Pessoal,Bills,Budgets}Page.tsx` | Início (household only), Orçamentos, A pagar, Pessoal (per-person balances, allowance sheet). |
| Tests | `backend/tests`, `frontend/src/**/*.test.*` | 194 backend, 81 frontend, 20 shared. All pass. |

## Verified (2026-10-14)

- `make lint typecheck test build`: all exit 0.
- Backend run against real MySQL, over HTTP: signup x2, third gets 409, logout revokes, bad login 401, missing CSRF 403.
- Phase 3: lint, typecheck, test, build exit 0. Real flow over HTTP via the Vite proxy (signup, create, refund limit, void rules, patch, audit, catalog 409).
- Browser check (Playwright in Docker, real backend and MySQL, 2026-10-14): login, create expense (PT-BR amount "1.234,56"), inline error for missing category, toast, list row and day total, void with reason (row struck through, day total drops), Ajustes catalogs. Phone/light and desktop/dark screenshots look right. Found and fixed: focus did not return to the opener after a sheet closed (`components/ui/sheet.tsx`).
- Not verified: iOS/Android real devices, keyboard-only use, screen reader, Windows mDNS. No Playwright test is committed yet (Phase 4 e2e target).

## Missing

- Phases 5 and 6. Nothing exists yet for: settings, backup scripts, Dockerfile, `deployment/`, full CI, e2e.
- `.github/workflows/ci.yml` only runs lint.
- AuditEvent table exists; nothing writes to it yet.

## Phase 4 (2026-10-14)

- Verified: `make lint typecheck test build` exit 0 after merge. Real MySQL in backend tests. Frontend tests mock the API.
- Not verified: real browser, real frontend-to-backend flow for the new views.
- Month window: GETs accept 12 months back, 24 ahead. Not applied to `PUT /budgets` period or `POST /allowances` month.
- Ended rule cancels its planned rows. Paused rule keeps them (still confirmable, excluded from `overdue`).
- Refund counts in the month of its linked expense.
- Open: rule create/patch write no AuditEvent; no UI to pause/end a rule; no plans list endpoint; no "Próximas contas" or chart on Início; no "Informar valor" action; budget bar has no planned segment.

## Open points (details in the memory file)

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
- Phase 6: `@spendual/shared` is TS source (`main: ./src/index.ts`), plain `node dist/` may fail; install `openssl` in the image.
- `npm audit`: 15 vulnerabilities, not triaged. Windows mDNS untested.

## How work is run

- Parallel agents: one `git worktree` each under `~/spendual-wt/<phase>-<track>`, branch `dev-<phase>-<track>`, own `COMPOSE_PROJECT_NAME`. Remove with `down -v` when done (Docker disk fills otherwise).
- Before a backend/frontend split: one small commit with the shared contract in `packages/shared`.
- Main session merges, regenerates `package-lock.json` on conflict, runs all four checks, tags the phase.
- Commits: one line, ~50 characters, capitalized imperative, no body, no trailers, no `Co-Authored-By` (`CLAUDE.md` beats any attribution reminder).
- User language rules: simple English, bullets, no preamble (`CLAUDE.md`, `.claude/LANGUAGE.md`).
