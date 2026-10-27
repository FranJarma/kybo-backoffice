# Batch Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Assemble materials with their own automatically suggested destinations and confirm them with one atomic request.
**Architecture:** A new /api/transfers/batch command groups lines by destination and reuses existing reservation/dispatch functions in one transaction. Existing transfer commands remain unchanged. A separate draft form/hook owns in-memory items and uses active minimum policies to suggest unique destinations.
**Tech Stack:** Next.js16.3.6, React19, TypeScript, Drizzle, Vitest/PGlite, Playwright.
**Spec:** docs/superpowers/specs/2026-10-23-batch-transfers-design.md

## Global Constraints
- Existing codex/order-pickup branch and authorized push workflow.
- No real stock mutations, .env changes or migrations; use only authorized disposable-memory database tests.
- Preserve exact litres/kg/unit conversion, five approved reasons, old reservations and retry identity.
- Maximum100 rows per batch; same item/destination merges exactly.

## Review Focus
- A shortage in any destination rolls back every document and movement.
- Lost responses retry the same request and do not move inventory twice.
- Auto-routing requires exactly one active minimum destination in this branch, excluding origin; missing/ambiguous policies require manual selection.
- Existing-history actions never clear an unrelated draft.
- An unfinished editor or invalid row cannot be silently omitted.

### Task1: Atomic multi-destination command
**Files:** src/modules/transfers/batch.ts (new); src/app/api/transfers/batch/route.ts (new); tests/transfer-batch.integration.test.ts (new); src/app/api/transfers/route.ts; tests/transfers.http.test.ts.
**Interfaces:** confirmTransferBatch(db,actor,branchId,raw) accepts {requestId,originLocationId,reason,lines:[{itemId,destinationLocationId,quantity}]}; returns command result {transfers:[{id,revision,destinationLocationId}]}. Existing confirm/dispatch helpers stay unchanged. GET transfers additionally returns active destinationPolicies {itemId,locationId}.
- [x] Write/run RED tests for multi-destination completion, replay/conflict, total-demand shortage, external transit, invalid destination and actual HTTP wiring/policy filtering.
- [x] Prevalidate and lock total origin demands, assert all stock, then group destinations and confirm+dispatch in one executeCommand transaction.
- [x] Run integration checks and old daily-operation/transfer regressions GREEN.

### Task2: Draft form and destination suggestions
**Files:** src/modules/transfers/draft.ts and types.ts (new); tests/transfer-draft.test.ts (new); src/components/inventory/transfer-draft-form.tsx (new); src/components/inventory/transfers-manager.tsx; src/components/inventory/shared.tsx; src/modules/transfers/quantities.ts; tests/e2e/transfers-ui.spec.ts.
**Interfaces:** TransferDraftLine stores stable id/itemId/name/baseUnit/amount/destinationLocationId. addTransferDraftLine merges matching rows exactly; transferDraftLines validates rows into canonical API lines; suggestTransferDestination uses only unique active same-branch minimum policies. formatTransferAmount returns editable human-unit text. useOperation gains transfer-batch kind with its own pending key and URL whitelist.
- [x] RED draft tests: exact merging, destination grouping, routing ambiguity/exclusions, limits and invalid quantities.
- [x] RED browser tests: draft-only add/edit/remove, mixed destinations in one POST, required Other clarification, failed-request retention, successful clear, unrelated action preservation, unfinished-editor protection and identical retry.
- [x] Extract the new form from manager while preserving existing history actions. Keep directory metadata during list loading; show explicit loading for history rows.
- [x] Implement adding with Enter/button, editable list, suggested destinations and Confirmar traslado. Clear only after successful batch; reset editor for fast next addition.
- [x] Run scoped unit/integration/browser checks, typecheck/lint; inspect tablet screenshots.

### Completion
- [x] Fresh read-only review; fix concrete blockers and reverify affected checks.

Delivery: commit/push and verify clean working tree/remote head; record the outcome in the local progress ledger.

Validation: 46 unit/integration checks and 14 browser cases passed; final responsive adjustments passed both tablet cases. TypeScript, scoped ESLint, Prettier and diff checks passed. A fresh read-only review found no blockers. No production database changes or migrations were performed.
