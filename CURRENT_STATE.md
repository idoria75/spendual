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
| 4 Dashboard, budgets, bills, installments | not started | — |
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
| Tests | `backend/tests`, `frontend/src/**/*.test.*` | 147 backend, 51 frontend, 20 shared. All pass. |

## Verified (2026-10-14)

- `make lint typecheck test build`: all exit 0.
- Backend run against real MySQL, over HTTP: signup x2, third gets 409, logout revokes, bad login 401, missing CSRF 403.
- Phase 3: lint, typecheck, test, build exit 0. Real flow over HTTP via the Vite proxy (signup, create, refund limit, void rules, patch, audit, catalog 409).
- ⚠ Not verified: the browser UI (layout, dark theme, focus return). Only mocked tests and HTTP checks.

## Missing

- Phases 4 to 6 above. Nothing exists yet for: dashboard, budgets UI, bills, installments UI, settings, backup scripts, Dockerfile, `deployment/`, full CI.
- `.github/workflows/ci.yml` only runs lint.
- Domain file `backend/src/domain/accounting.ts` (Appendix A formulas) not written.
- AuditEvent table exists; nothing writes to it yet.

## Open points (details in the memory file)

- Phase 3 notes: any user can read and write the other user's personal records (no rule in the guide); list ignores `status=planned`; create writes no AuditEvent; the dev DB volume has 2 old accounts (use another `COMPOSE_PROJECT_NAME` for a clean DB).
- Phase 3 frontend: native select and plain segmented buttons instead of Radix Select/Tabs; custom toast; native date input; generic category icon; `tonePalette` keys not pinned; 5 type chips (adds `other_receipt`); refund picker loads only the form month; no installment UI yet.
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
