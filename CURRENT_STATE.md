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
| 3 Core CRUD + entry flow | not started | — |
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
| Tests | `backend/tests`, `frontend/src/**/*.test.*` | 83 backend, 11 frontend, 20 shared. All pass. |

## Verified (2026-10-14)

- `make lint typecheck test build`: all exit 0.
- Backend run against real MySQL, over HTTP: signup x2, third gets 409, logout revokes, bad login 401, missing CSRF 403.
- ⚠ Not verified: browser flow (frontend with real backend and cookies). Only mocked tests.

## Missing

- Phases 3 to 6 above. Nothing exists yet for: transaction routes, `ui/` component library beyond button/input/field, dashboard, budgets UI, bills, installments UI, settings, backup scripts, Dockerfile, `deployment/`, full CI.
- `.github/workflows/ci.yml` only runs lint.
- Domain file `backend/src/domain/accounting.ts` (Appendix A formulas) not written.
- AuditEvent table exists; nothing writes to it yet.

## Open points (details in the memory file)

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
