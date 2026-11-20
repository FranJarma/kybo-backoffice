# Speed and Container Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the verified request/SQL amplification without changing stock, pricing or authorization semantics, and prepare a reviewable Docker deployment path.

**Architecture:** Preserve the modular monolith, pg/Drizzle and current interfaces. Batch page-scoped reads, share a request-local cost estimator and existing POS data, and progressively load the catalogue. Container preparation does not migrate data or choose a production hosting provider.

**Tech Stack:** Next.js 16.3.6, React 19.3, TypeScript, Drizzle, pg, PGlite/Vitest, Node 24, Docker/PostgreSQL 18.

**Spec:** `docs/production-readiness-audit.md`, findings A06–A09, and the user's implementation request of 2026-11-19.

## Global Constraints

- Initial deployment serves one branch in Argentina; preserve future branch isolation.
- Preserve preexisting changes, including next-env.d.ts and untracked menu/audit files. Work on the existing checkout; no branch switch, merge, commit or production mutation.
- No schema migrations, new indexes, global financial cache, lock removal or dependency upgrades.
- Keep decimal/null/archived cost semantics, reservations, expiry, permissions and response shapes.
- Tests use disposable PGlite only, blank application/test database URLs, and the existing explicit fixture guard.
- Code and variable names remain English; user-facing UI stays Spanish and follows existing inline controls.
- Docker files contain no real secrets and do not read/migrate production automatically.

## Review Focus

- Aggregation must keep branch/location scope and distinguish blocked, expired, reserved and unknown-cost stock.
- Configurable and legacy recipes must produce the same costs, including modifiers and missing ingredients.
- A stale catalogue load must never overwrite a newer channel/refresh; a later page error must remain visible.
- Sharing POS fleet must preserve the display link, error state and independent management dialog use.
- Container startup against an empty database must not be presented as a completed deployment; backups, restores, secrets and database initialization remain explicit operations.

## Task 1: Inventory page batching

**Files:** `src/modules/inventory/scoped-queries.ts`; `tests/inventory-query-performance.integration.test.ts`.

**Interfaces:** Keep `stockByBranch`, `scopedLot` and `lotsByBranch` signatures/output. Return page-scoped stock through one batched lot read; map joined lot-page rows directly.

- [x] Write failing real-fixture tests for bounded SELECT counts and hand-checked quantities/costs across branch/location, expiry/blocking/reservations and empty/paginated pages.
- [x] Verify RED on the existing 2+N readers.
- [x] Batch stock lots and map joined lot rows while preserving transaction isolation and standalone detail behavior.
- [x] Verify GREEN with targeted Vitest thread pool and relevant existing inventory tests.

## Task 2: Recipe list cost/configuration reuse

**Files:** `src/modules/recipes/service.ts`, `src/modules/recipes/costing.ts`; `tests/recipe-list-performance.integration.test.ts`.

**Interfaces:** Preserve `costComposition` callers and recipe-list result shape. Reuse the existing batched configuration reader and one request/transaction-local estimator; no persistent cost caching.

- [x] Write failing page-size/query-budget tests and literal cost assertions for configurable/legacy/modifier/missing-cost fixtures.
- [x] Verify RED and record the old query count.
- [x] Extract estimator-based composition calculation, batch configurations and reuse the existing context.
- [x] Verify GREEN and run related cost/modifier/recipe suites.

## Task 3: POS request deduplication and progressive catalogue

**Files:** sales `sales-manager.tsx`, `cart.tsx` and a small page loader if needed; pickup `locator-manager.tsx`/`use-locators.ts`; focused tests.

**Interfaces:** Pass existing fleet/error into POS tools rather than starting another reader. Keep independent locator manager behavior. Publish page one before waiting on remaining pages; preserve complete-search status/error and old-load cancellation.

- [x] Write failing observable tests for provided fleet and first-page progress before a deferred later response, including late failure/cancellation.
- [x] Verify RED without source-text assertions.
- [x] Remove the duplicate POS fleet reader and integrate progressive loading; keep concurrency bounded.
- [x] Verify GREEN and run existing POS/cache tests. Independent review also found and verified a bounded restart for catalogue-total changes.

## Task 4: Container preparation and Dokploy assessment

**Files:** `next.config.ts`, `Dockerfile`, `.dockerignore`, a dedicated Compose laboratory definition/environment example, `docs/deploy-alternatives.md` as warranted by runtime availability.

**Interfaces:** Opt-in standalone output for container builds; runtime Node 24 and app port 3000. Build receives no application credentials. PostgreSQL is an isolated named-volume service using the PostgreSQL 18 volume layout and private networking.

- [x] Read installed Next standalone/self-hosting guides and official Dokploy/PostgreSQL documentation.
- [x] Prepare a small multi-stage non-root app image, exclude secrets/local/test artifacts from context, and preserve the normal Vercel build path.
- [x] Validate Compose interpolation and attempt Docker image/runtime; the unavailable daemon prevented the latter. Exact limits recorded in docs/deploy-alternatives.md.
- [x] Document managed DB versus self-hosted tradeoffs, region, SPOF, off-host backups/restore, runtime variables/Blob, and a reversible staging migration procedure without performing it.

## Task 5: Integration verification and result

- [x] Re-run the same synthetic SELECT-count harness and record before/after counts; wall times remain local samples, not production p95.
- [x] Run types, lint, targeted critical tests and the complete project suite; identify preexisting failures by file/name. Full suite: 987 passed, 3 failed, 86 skipped; all 25 new tests passed. Eleven affected files reproduced on an isolated HEAD snapshot (legacy setup, date-dependent assertions, stale validation expectation, missing dedicated PostgreSQL). See result document for exact limits.
- [x] Attempt production/standalone build with isolated output and restore generated config byte-for-byte. Both attempts failed with the filesystem EPERM also observed before these changes.
- [x] Request independent review of the final diff, fix material findings and rerun affected checks.
- [x] Save measurements and container decision/limits in documentation and deliver a concise result with exact verification boundaries. Results: docs/speed-improvements.md; deployment alternatives: docs/deploy-alternatives.md; sanitized JSON under docs/performance/.

## Follow-up: performance first and separate deliverables

The user's follow-up prioritizes application speed and requests exactly two reports: `speed-improvements.md` and `deploy-alternatives.md`. Existing source optimizations remain the implementation baseline; they must not be repeated or reverted during document reorganization. Deployment remains a later decision.

- [x] Confirm existing stock, recipe and POS changes and preserve local work.
- [x] Rename the two reports, separate performance from deployment content and update cross-references.
- [x] Verify the document separation, historical evidence and file links; independently review the focused follow-up. No review findings or obsolete references; fresh focused verification passed 69/69 tests in 12 files (91.66 s), including Chrome. No application changes were added during this follow-up.
- [x] Refresh accessible copies under the requested filenames while preserving their existing identities. Both renamed reports saved successfully as version 1; prior links retain their identities.
