# spendual — open points

User said (2026-10-14): skip open points, note them here, keep going unless reverting would be too expensive. Revisit at the end of the plan.

Open points:
- `GET /auth/status` (free signup slots) for the "1 de 2 vagas livres" hint in the mockup. Skipped; frontend shows a static hint. Needs a contract change in `packages/shared/src/auth.ts` + backend + frontend.
- Browser flow (frontend with real backend, cookies, CSRF) never checked by hand; only mocked tests and curl-like checks on the backend.
- Production build: backend imports `@spendual/shared` as TS source (`main: ./src/index.ts`); plain `node dist/` may fail. Fix in Phase 6 Dockerfile (compile shared, or tsx).
- Prisma OpenSSL warning in `node:22-bookworm-slim`; install `openssl` in the Phase 6 image.
- `npm audit`: 15 vulnerabilities (2 critical, 6 high) at Phase 0; not triaged.
- `withRetry` tests use fake 1213/1205 errors; no real deadlock forced.
- Planned `Transaction` rows require `amount`; nullable `expectedAmount` lives only on occurrence tables. Check against the guide in Phase 4.
- Windows mDNS (`spendual.local`) untested on the real device.
- Root-owned `node_modules` folders left by Docker in `~/spendual-wt/*`; user removes with sudo.

- Signup is first-come: any LAN device can take slot 2. Options: invite code in `.env`, or signup #2 only while logged in as #1. (code review, 2026-10-14)
- `editBudget` "this period only" with no earlier budget adds no revert row, so the amount applies to all later months. Needs a rule for "no budget".
- `editBudget` "going forward" next to an existing P+1 revert row keeps the old P+1 amount. Rule not stated. Also nothing blocks editing past periods.
- Phase 1 services (`createAllocation`, `editBudget`, installments) do not validate input; Phase 3/4 routes must validate with Zod (`moneySchema`, period format, ALLOCATION amount > 0).
- Minor: no `helmet`; logout without token returns csrf_invalid before unauthenticated.

Phase 3 (2026-10-14):
- DECIDED: both users may read and edit personal records. Radix wanted where possible (Select kept native, see CURRENT_STATE).
- `tonePalette` keys are not pinned in the contract; frontend accepts English and PT-BR names. Phase 5 must pin them.
- Category icons and colors: generic icon, color by `id % 12`. Needs a field or mapping.
- Date input is native `type=date`, not typed dd/MM/yyyy.
- Day totals are computed in the client from the list; no server totals yet. Phase 4 dashboard should use the API.
- Refund picker lists only expenses from the form date's month.
- Installment ("Parcelado") entry UI and planned-row creation are Phase 4.
- Browser UI never checked by eye.
- Bad refund link returns 400 validation_error (contract was silent).

**Why:** user prefers momentum over blocking on small decisions.
**How to apply:** when a phase ends, append new open points here; before declaring the plan done, list them to the user.

Phase 4 (2026-10-14):
- DECIDED: per-person balances live on Pessoal (not Início). Overdue bills come as `overdue` on BillList.
- Checks assessment (not done yet): frontend test mocks leak ZodError/ApiError traces (`App.test.tsx`, add default handlers + fail on unexpected console.error); CI runs only lint (add typecheck/test/build + MySQL service, drop double runs); no Playwright e2e yet (new `e2e/` workspace, pinned image, `make e2e`, separate DB); ESLint lacks type-aware rules, react-hooks, jsx-a11y, no-float-money, and misses placeholder/aria-label strings; `npm audit` now 18 (2 critical in vitest chain, dev-only); add prettier check and Dependabot.
- Month window not applied to `PUT /budgets` period and `POST /allowances` month (9999-12 can overflow).
- Rule create/patch write no AuditEvent; Phase 3 create writes none either.
- Frontend gaps: no pause/end rule UI, no plans list endpoint (Parcelas is month-only), no "Próximas contas"/chart on Início, no "Informar valor", no planned segment in budget bar, native category select in create sheet.
- Browser check of Phase 4 UI not done.
- Stale docker containers may remain (`p4-a-mysql-1`, `p3-b-mysql-1`); worktrees in `~/spendual-wt/` still exist.

Phase 5 (2026-10-14):
- DONE since Phase 4: CI runs typecheck/test/build/e2e; stray console.error fails frontend tests; tone keys pinned; e2e exists.
- CI (incl. e2e job) never run on GitHub. Only chromium tested.
- Not done from checks assessment: ESLint type-aware/react-hooks/jsx-a11y/no-float-money rules, prettier check in CI, Dependabot, npm audit triage (18 vulns).
- Phase 6 list: mount BACKUP_DIR read-only in backend container, systemd timer, backup dir perms (750 + group or same UID).
- Ajustes: no allowance row (Pessoal has it); `ls -t` rotation in backup.sh; test-restore needs seed data; no restore test on other MySQL versions.
- Sheet sticky-bar fix and Ajustes/theme not checked in a real browser (run `SCREENSHOTS=1 make e2e` and look).
- Disk: /home 98% full. Old worktrees in ~/spendual-wt and stale containers (p4-a-mysql-1, p3-b-mysql-1) to remove.

Análises, Início balance block, category usage (2026-10-20):
- DONE: Análises page, `Saldo atual` card on Início (replaces the `Orçamento do mês` card and the separate chart card), categories sorted by use in the entry forms.
- Backend tests are slow on this box (about 11 s per test, `TRUNCATE` is slow on the disk). `resetDb` now uses a 60 s transaction timeout. Check on the deploy disk.
- Análises: the average skips months before the first spending. A category with a budget change in the middle shows a step. Categories without data in the range are not listed.
- Análises: no personal spending, no goals, no planned bills. Range is 6 or 12 months, never later than the current month.
- `Saldo atual` = overall budget minus household net spending of the month. Planned bills are not subtracted. Not decided: should it also subtract planned bills?
- Category usage counts confirmed records only (not planned bills, recurrence rules or installment plans). Archived categories keep their count.
- Not checked by eye: Análises and `Saldo atual` in a real phone browser. Screenshots from Playwright only (`test-results/shots/`).

Category drill-down from Início (2026-10-20):
- DONE: legend rows link to Lançamentos (`categorias=` list, `none` = no category); `Total do mês` on category filters.
- `categories` (from Início) follows the linked expense for refunds, like the dashboard. The old dropdown `categoryId` uses the refund's own category, so its total can differ from Início when a refund has another category.
- Filters are read from the URL once; changing them in the UI does not write the URL back. Reload resets them.
- The new `categories` filter ignores `type`.

Início merge and P1 next steps (2026-10-21):
- DONE: `Realizado` is folded into `Saldo atual` (details element); one dashed `Próximas contas` card; no greeting. Commit `d35b9b1`.
- ⚠ `Saldo atual` (budget minus spending), `Poupança do mês` (income − expenses − allowances) and `Sem destino` (savings − goal allocations) differ. `Sem destino` equals the savings until goals exist, so Início hides it when equal.
- Not decided: rename `Poupança do mês`.
- P1 list: [guide](household-finance-reference-guide.md), "P1 — Important follow-up" and phases 6–7. Proposed order:
  1. Shared savings goals (`/metas`). Tables `SavingsGoal` and `GoalEntry` exist (`backend/prisma/schema.prisma:354`); `domain/accounting.ts` and `services/dashboard.ts` already read `goalAllocationsNet` (always 0). Missing:
     - services and routes: create, edit, close, archive; allocate, withdraw; history and balances
     - rules: allocation and withdrawal are not income or expense; withdraw only back to unallocated money; closing with money left asks for a transfer
     - reconciliation tests (the guide requires them)
     - `/metas` page (`Alocar` / `Retirar`) and a goals line on Início
  2. Audit history: `AuditEvent` exists but nothing writes to it (see Phase 4 note above). Write events on edit, void, cancel; then a viewer.
  3. Monthly savings target (not started).
  4. CSV export (not started); CSV import with preview and duplicate detection is Phase 7.
  5. Later: fuller personal budget screens, spending pace (this month vs same elapsed part of last month), duplicate and correction workflows.
- Questions to answer before planning Metas: target amount and date from the start? Who may close a goal? Can a goal be reopened?
  - DECIDED (2026-10-21): target amount and date optional and editable; either user may close or archive; `completed` can reopen, `archived` is final. Plan: [plan.md](plan.md), section "P1-1 — Shared savings goals".
- DECIDED (2026-10-21): "Poupança sem destino" stays the amount left for the month, not a total over all months (a total needs exact sync with the bank account). Revisit how to show it later.
- DECIDED (2026-10-21): stay on the dev stack (hot reload) until the P1 features are done; check the prod build after.
- Audit note above ("nothing writes to it") is out of date. `services/transactions.ts` and `services/bills.ts` write events on patch, void and cancel. Still missing: transaction create, rule create/patch, a viewer.
- Not checked: production build (`make build`; `npm run -w frontend build` fails in the container with "Failed to resolve entry for @spendual/shared"), anything on a real phone.
- DONE (2026-10-21): the `spendual_stacktest` stack (port 8080) was removed with `down -v`, volume included.

Deploy box learnings (2026-10-21). Measured on host `jobs`. ⚠ Assumes this box is the production host; unconfirmed:
- Hardware: 4 CPUs, 7.2 GiB RAM, one 2.5" spinning disk (`sda`, 466 GB, `ROTA=1`, Apple/Hitachi HTS547). `/` has 204 GB free (13% used). Ubuntu 26.04, kernel 7.0, Docker 29.9, Compose 5.6, MySQL image `mysql:8.4`.
- ⚠ Disk is slow on sync writes: `dd bs=4k oflag=dsync` gives about 120 kB/s (about 30 syncs/s, about 34 ms each). `/tmp` is tmpfs, so do not measure there.
- Effect: MySQL with `innodb_flush_log_at_trx_commit=1` and `sync_binlog=1` makes each commit wait on the disk. Backend tests take about 11 s each, `TRUNCATE` is slow. Normal use (a few writes per click) should be fine; bulk work (CSV import, big backfills) will be slow.
- Decision needed for production: keep durable settings (1/1, safe on power loss) or relax them. Dev containers were relaxed to 2/0 for test runs only, then restored. Do not relax in production without the user's yes. For CSV import, write rows in one transaction (one sync), not one commit per row.
- Dev runs here too: `spendual-mysql-1` and `spendual-app-run-*` use this disk and 7 GiB of RAM. Stop them when not needed.
- `avahi-daemon` is inactive, so `spendual.local` is not published. `make mdns-install` prints the sudo commands (not run).
- Not checked here: reboot restart of the containers, the systemd backup timer (`make backup-timer-install`), restore from a backup on this disk, the production build (`make build`), CI on GitHub (remote is `git@github.com:idoria75/spendual.git`, nothing pushed).
- Other containers share the host (Plex, Metabase, smart_house, b1a-devc images are present). Ports and RAM are shared; check `docker ps` before choosing a port.
- DECIDED (2026-10-21): `jobs` is the production host. Move the dev data to prod with backup, then restore.
- ⚠ Dev (`compose.dev.yml`) and prod (`deployment/docker-compose.yml`) both use project name `spendual`, so both use the volume `spendual_mysql_data`. Give prod its own name (e.g. `spendual-prod`) before the first prod run on this host.
