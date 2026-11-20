# Speed Follow-up Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution and one fresh final review. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove the remaining demonstrated duplicate recipe reads and preparation request restarts, then verify the existing speed work and document environmental limits.

**Architecture:** Keep the current modular monolith and database contracts. Reuse a transaction-local recipe graph; only one preparation HTTP read stays active for a mounted resource. No new cache, dependency, schema, deployment or production writes.

**Tech Stack:** Next.js 16.3.6, React 19.3, TypeScript, Drizzle/pg, PGlite, Vitest and installed Chrome.

**Spec:** `docs/speed-improvements.md`, requested for implementation by the user on 2026-11-20; original correctness constraints in `docs/production-readiness-audit.md`.

## Global Constraints

- Preserve all preexisting local source/config/documentation changes. No Git commits, branch changes or infrastructure mutation.
- Keep decimal/null costs, recursive preparations, permissions and branch isolation, repeatable-read transactions and write/idempotency semantics.
- Use only disposable PGlite and localhost browser fixtures; blank database URLs and explicit disposable migration guard.
- Existing Docker artifacts remain unchanged. Remote latency, pool/lock behavior and failover need an appropriate separate test environment.
- Node/TypeScript names remain English; product UI stays Spanish and inline.

## Review Focus

- A shared graph must include off-page preparations while excluding product recipes from preparation lookup.
- Empty recipe searches must still authorize and return the correct total for out-of-range pages.
- Wake events during a pending preparation request must not abort/restart it; explicit URL/revision changes must still replace the resource.
- A superseded request must not overwrite a newer scope, including offline/reconnect and unmount.
- Passing local tests must not be presented as a successful production build or remote latency measurement.

### Task 1: Recipe reads

**Files:** `src/modules/recipes/service.ts`; `tests/recipe-list-performance.integration.test.ts`.

**Interfaces:** Preserve exported `costContext(db, branchId?)`, service list arguments and response. Add only an internal context loader that can consume the graph already read by the list, and omit unused modifier surcharge reads.

- [x] Strengthen the real-fixture list query budget from 25 to 17 SELECTs, retaining literal cost/branch/default assertions. Add an empty-search/out-of-range result with bounded reads and correct totals.
- [x] Run that file with `--pool=threads --maxWorkers=1`; RED observed: 20 SELECTs exceeded 17, and empty-search 14 exceeded 8; three semantic tests passed.
- [x] Share the list graph only inside its read-only transaction, skip unused modifier prices, and return empty pages before unnecessary costing.
- [x] Verify the file and related recursive-cost/modifier suites pass; full run includes those suites. Same service profile confirms simple recipes19→17 SELECT; stock/lots remain3/2.

### Task 2: Preparation polling

**Files:** `src/components/preparation/use-feed.ts`; new `tests/preparation-feed-browser.test.ts`.

**Interfaces:** Keep `usePreparationFeed`/`usePreparationDetail` results and freshness clock, 9-second timeout, 5-second poll interval and committed-task patching.

- [x] Exercise the real hook in React/Chrome with a held localhost response. Send focus/visibility/online events and assert a single request continues and its result becomes usable. Cover changing revision/URL and stale response rejection.
- [x] Observe RED against the existing restart-on-wake behavior: four fetch attempts and three aborts instead of one pending read; revision/URL behavior passed. Fixed a test-listener race before this confirmed RED run.
- [x] Keep an active request until completion or existing explicit cancellation; clear its ownership only if it is still current.
- [x] Verify browser regressions and existing preparation/confirmed-task tests; both new browser cases and current preparation suites pass in the full run. The legacy preparation fixture still fails its preexisting transition setup.

### Task 3: Verification signal and delivery

**Files:** existing attendance scheduling/validation test expectations; `docs/speed-improvements.md`, its existing accessible copy and verification metadata.

- [x] Make the three previously reproduced assertion failures deterministic: observed all three RED again, then all 28 tests in their two files passed with the literal date filter and stockTracked default. Production behavior and original business assertions preserved.
- [x] Run focused correctness tests, TypeScript and ESLint, then the complete project suite. Full run198 files,994 passed assertions,85 omissions,0 failed assertions; nine setup failures (eight legacy fixtures and the missing dedicated PostgreSQL URL) remain explicitly named in docs/performance/verification-2026-11-20.json. No migration guard weakened.
- [x] Attempt one isolated production build using the documented non-worker Webpack mode. It still failed with EPERM creating `.next-e2e/speed-20261120/server/app/api/cash`; restored next.config, next-env and tsconfig byte-for-byte. No production build claimed.
- [x] Fresh independent review: no Critical/Important findings. Minor deferred: browser coverage does not hold the HTTP request during the URL change or exercise offline→online before the old rejection settles; it does verify real transport cancellation and revision replacement. No new production failure was found.
- [x] Update `docs/speed-improvements.md` with actual before/after results and remaining environment-dependent tasks; saved its existing accessible identity as version2. `deploy-alternatives.md` remains unchanged. Raw synthetic profile and sanitized full/focused verification summaries are under docs/performance/ for2026-11-20.

## Execution record

- Baseline: HEAD `2b283401c7b9ce515c9a278ed5fb795010d8a0e8`, same uncommitted speed implementation as 2026-11-19. This plan continues that work instead of repeating it.
- Execution choice: inline implementation, matching the user's instruction to proceed; no extra approval round for routine implementation choices within the already approved speed scope.
- Focused GREEN: 35/35 tests in four files, 25.19 s. Recipe budgets 17/17/17 for 1/10/40 rows and 8 for both empty/out-of-range pages.
- Same synthetic service profile: stock 3 SELECTs, lots 2, simple 10-recipe list 17 (previous19), product lookup5 and locator service4. Three local samples, no remote timing claim.
- ESLint passed over the repository (ignored scratch excluded). Initial typecheck found the temporary Next config backup's relative import; renamed that scratch backup to `.txt` and reran, without changing application imports or TypeScript config.
- Full TypeScript check passed after correcting the scratch backup extension. The complete test command finished with994 passed assertions,85 omissions and0 failed assertions; exit1 because nine files cannot complete setup. No source changes after the full run started.
