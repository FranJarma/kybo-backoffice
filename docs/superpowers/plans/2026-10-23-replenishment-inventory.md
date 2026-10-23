# Replenishment Inventory Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded relocation inline.

**Goal:** Manage replenishment minimums from Inventory, exclusively as manager/admin, preserving POS alerts.
**Architecture:** Extract the existing editor into inventory components and share the existing snapshot loader. A guarded server page and manager-only navigation entry expose settings; sales keeps read-only alerts.
**Tech Stack:** Installed Next.js16.3.6/React19, TypeScript, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-23-replenishment-inventory-design.md

## Global Constraints
- Continue the authorized codex/order-pickup workflow, including push. No migrations, real inventory mutations or .env changes.
- Reuse exact existing policy validation/payload/retry behavior; keep ml/g/unit entry as labeled.
- Personal cannot navigate to or edit settings, including direct page access. Alert reads remain allowed.

## Review Focus
- Staff with catalog permissions must not gain minimum administration.
- Managers retain alerts in POS but have no inline rule editor there.
- Failed loads must not show a misleading empty state or permit stale edits.
- Failed saves retain user input; uncertain retries retain request identity.
- Branch changes continue to use the existing guarded branch context.

## Task1: Relocate and secure the existing configuration
**Files:** new inventory/replenishment page and manager/editor/snapshot components; sales/replenishment-panel; navigation; daily-operations/manager; tests/navigation.unit.test.ts, page-access.unit.test.ts; new browser fixture/spec.
**Interfaces:** ReplenishmentManager({actorId:string}); useReplenishmentSnapshot(refresh:number) exposes snapshot/loading/error/reload; ReplenishmentPolicyEditor retains the existing policy form contract. ReplenishmentPanel keeps its existing caller contract and only renders alerts.
- [x] Add failing manager/staff navigation coverage and direct-page permission coverage.
- [x] Add browser coverage for create/edit/disable, validation and save failure retention, load failure, and POS alerts without inline settings.
- [x] Extract and relocate existing components, add the guarded page/navigation and update Operación del día link.
- [x] Run targeted navigation/access/replenishment unit/HTTP checks and browser cases. Check TypeScript, scoped lint, formatting and tablet layout.
- [x] Review the completed diff; a fresh read-only reviewer found no blockers.

Validation: 34 targeted unit/HTTP checks and five browser cases pass. Final POS copy also passed its seven existing render checks. TypeScript, scoped ESLint and formatting checks pass. Tablet screenshot inspected at768px with no horizontal overflow.

Delivery: commit/push and verify the working tree and remote head; record completion in the local ledger.
