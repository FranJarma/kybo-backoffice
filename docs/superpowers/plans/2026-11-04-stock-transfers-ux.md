# Stock por ubicación y Traslados

> **For agentic workers:** Use superpowers:executing-plans in the existing worktree. No commit or push.

**Goal:** Compare available stock and actual location policies, identify replenishment needs, and prepare one clear batch transfer.

**Architecture:** Preserve exact balance aggregation and transfer commands. Expose existing enabled location minimum/target values in the manager's read snapshot. Refine stock presentation and transfer draft/history separation using shared controls and tabs.

**Tech Stack:** Next 16.3.6, React 19, Tailwind 4, Radix Tabs, shared SearchCombobox, Vitest/Playwright.

**Spec:** Approved continuation of the manager journey after Operación del día. Preserve DESIGN.md and all earlier work in codex/ui-consistency.

## Constraints and decisions

- Keep localhost:3000 with its real project configuration. No real stock/task commands, migrations, .env edits, commit/push or .tmp image changes.
- Stock totals still aggregate balances before pagination; minimum/target values belong to individual locations and are never summed into a branch-wide minimum.
- Additional policy metadata is read-only and limited to manager/admin snapshots. Staff access is not expanded.
- Use liters/kg/units consistently in displays and entry, preserving exact canonical quantities, including tiny amounts.
- Preserve depot default, editable per-item destinations, unique eligible policy suggestion, same-item+destination merging, reasons and atomic batch confirmation.
- Keep searched relations on SearchCombobox. Auxiliary targets ≥44px; operating controls ≥48px.
- No invented automatic stock availability, assumed lead times or derived minimums. Missing policy means unconfigured, not “healthy.”

## Spatial thesis

- Stock: a compact item list with aligned available figures; disclose complete location balances and show location-specific minimum/target and shortages. A filter isolates items requiring replenishment. Explicit formula/help explains reserved and unusable amounts.
- Transfers: New transfer, Pending and History tabs separate entry from follow-up. Keep the draft mounted across tab changes. Use compact editable batch rows and clear automatic/manual/missing destination feedback; confirmation remains accessible after review.
- Selecting an item focuses its quantity input; adding returns focus to Autocomplete. No writes occur until Confirmar traslado.

## Tasks

- [x] Add red/green tests for policy metadata and per-location shortage decisions without changing balances or writes.
- [x] Refine stock list, units, shortage filter, pagination and manager link to Traslados; preserve location selection/search behavior.
- [x] Refine transfer tabs, draft row density, destination explanation, keyboard entry and persistent errors; preserve payloads and drafts.
- [x] Run existing/new isolated browser checks, focused domain/integration tests, lint and sanitized build.
- [x] Inspect desktop/tablet/mobile in a bounded batch, correct once and confirm once. Independent review and git/config checks; leave app running with no commit/push.

## Review focus

- Ample depot stock must never hide a shortage at Barra/Cocina.
- Equality with a configured minimum follows the existing engine: only below-minimum needs replenishment.
- Unconfigured or disabled policies are not shortage rules; policy visibility does not grant staff configuration access.
- Switching transfer tabs preserves unsent rows; stale/failed directory reads pause commands and can be retried.
- Default/automatic/manual destinations and units remain truthful; no confirmation is inferred from adding a row.

## Verification ledger — 2026-11-04

- Domain/integration: 25 tests across stock summary, daily-operation reconciliation, transfer draft and quantity conversion passed using disposable databases only. New policy metadata and location-shortage expectations were first observed failing before implementation.
- Isolated browser checks: 25 passed across stock-location-ux, transfers-ui and daily-operations. Covers 390/768/1440 stock layouts, 600/1024 transfer layouts, focus, destinations, tab-preserved drafts, failed-directory recovery, one batch confirmation and idempotent retry after a lost response. Fixture API routes intercept all operations; no real stock was moved.
- Independent read-only review found two messages to correct: unknown confirmation outcome and manually cleared destination. Both expectations failed before correction, then passed with the complete browser suite. Reviewer confirmed both findings resolved.
- Scoped ESLint passed. Impeccable layout detector returned no findings. One batched visual inspection, one correction batch and one confirmation batch completed; no further cosmetic iteration.
- Final fixture screenshots (test data): `.next-e2e/stock-location-ux/stock-390.png`, `stock-768.png`, `stock-1440.png`, `.next-e2e/transfers-batch-600.png`, `transfers-batch-1024.png`.
- Read-only check of `http://localhost:3000/login` returned 200. The real development server remains running.
- Sanitized Next production build exited 0, including TypeScript and route generation, with DATABASE_URL blank and no .env reads. The account/password dynamic probe logged the expected missing-database warning; this was compile verification, not a production database run. Original next-env.d.ts and tsconfig.json were restored from the pre-existing session backup afterward.
- Git whitespace check passed. Branch stays `codex/ui-consistency`, HEAD `5326cfe`, nothing staged, no commits or pushes. No .env, migration or .tmp image changes. The pre-existing next-env.d.ts modification and all earlier unrelated work are preserved.
