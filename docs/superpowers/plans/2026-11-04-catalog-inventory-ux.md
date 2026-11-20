# Catálogo e Inventario UI/UX implementation plan

**Delivery update (2026-11-04):** the user subsequently authorized commit and push of Catálogo/Inventario in the same branch. Earlier no-commit/no-staging statements below describe the implementation phase.

> **For agentic workers:** Use superpowers:executing-plans inline in the existing worktree. No commit or push.

**Goal:** Find and edit catalog records quickly, understand usable stock honestly, inspect lots/history without losing context, and record adjustments in a protected, accessible form.

**Architecture:** Refine existing client managers and reuse shared Autocomplete, Tabs, OperationPanel and exact read-only quantity formatting. Preserve all catalog/adjustment payloads, revision checks, permissions, cost caching, reservations, location scoping and idempotent adjustment recovery.

**Tech Stack:** Next 16.3.6 / React 19 / Tailwind 4 / Radix shared controls / isolated Playwright fixtures.

**Spec:** User-approved continuation of the Impeccable audit; same branch, delegated routine choices. Mode: Operate. Preserve DESIGN.md and earlier work.

## Constraints

- Branch codex/ui-consistency, no commit/push or staging. Preserve previous changes, .tmp images, .env and database schema.
- Keep localhost:3000 with existing real configuration. No real catalog writes, inventory adjustments, migrations or financial operations.
- Verify through isolated request-intercepted browser fixtures and disposable database tests only. Build with existing sanitized wrapper and restore generated config files afterward.
- Orange confirms, blue selects/navigates/focuses; explicit units and required/optional fields. Shared Autocomplete for searched relations; shared dialogs for protected work.

## Spatial thesis and decisions

- Catalog: one clear search/filter toolbar, truthful result states and readable unit costs. Keep Edit visible, secondary actions in the existing action-menu pattern; use container width to avoid a wide table on tablet. Mobile prices lead with Mostrador and disclose remaining channels without deleting their information.
- Preserve all product/item forms and recipe/purchase flows; remove redundant dialog labels and retain fields, tab drafts, price validation, photos, cost cache and focus recovery.
- Inventory: replace decorative metric cards with a compact scoped summary; make physical/usable/restricted quantities and read units explicit. Usable stock comes from the server, never inferred from physical stock.
- Selecting lots moves focus/viewport to the inline detail and closing restores the opener. Shared tabs separate Lotes from Movimientos while retaining offsets.
- Manual entry/count/waste/block uses the shared protected panel with a fixed footer. Pending or unknown outcomes cannot dismiss it; existing same-request retry and payloads remain unchanged.
- Loading, failed reads, stale rows and empty filters are distinct. Retry is local; stale reads cannot authorize adjustments.

## Tasks

- [x] Add failing browser checks for honest stock state, read failures, detail focus/recovery, adjustment dismissal/pending protection, catalog recovery and row actions.
- [x] Refine catalog toolbar/list/card density, unit labels, menus and protected editor behavior without changing write contracts.
- [x] Refine inventory summary/status/detail/tabs/panel and loading/error feedback while preserving commands and exact quantities.
- [x] Run affected isolated browser and domain checks, scoped lint and sanitized build. One batched visual inspection, one correction batch, one confirmation batch across phone/tablet/desktop.
- [x] Independent review and final git/config checks. Leave the app running on port 3000, unstaged and uncommitted.

## Review focus

- Fully reserved stock is never labeled available when server usableQuantity is zero.
- Delayed/failed queries retain context and allow retry without false empty/healthy states or stale command targets.
- Dialog Escape, outside close, focus return and pending/uncertain locks work from both list and lot details.
- Compact catalog rows retain all values and secondary actions; relation controls remain Autocomplete, and product cost caching/price drafts remain intact.
- Long names, tiny quantities, large results and narrow/short viewports do not hide units, controls or actionable errors.

## Audit and execution ledger — 2026-11-04

| Finding | Implemented outcome |
|---|---|
| Reserved items could be labeled available with usable zero | State follows server usableQuantity; physical, restrictions and usable stock remain separate |
| Lot detail was far below long lists with no focus handoff | Heading receives focus/scroll; close restores the row opener; Lotes and Movimientos share accessible tabs and retain offsets |
| Adjustment was a hand-built overlay with no reliable focus/Escape or fixed footer | Shared OperationPanel with explicit first field, protected pending/unknown outcomes, fixed actions and existing payload/retry contracts |
| Loading, failed and empty queries could contradict each other | Explicit loading/error/retry, retained previous data and stale-command locks; request generations invalidate superseded detail reads |
| Tablet catalog tables and repeated row actions were crowded | Container-aware table/card layouts, visible Edit plus shared secondary-action menu; ingredient duplication and focus behavior preserved |
| Mobile products repeated photos/icons and all channel rows | Single image/name header, Mostrador first and other channels disclosed with every original value retained |
| Cost labels omitted the relevant unit | Read-only costs shown per litre/kg/unit using existing exact conversion helpers; stock quantities preserve tiny values |

Ruling: keep inventory detail inline with focus recovery instead of adding another route/modal — preserves list/search context and leaves room to compare stock.

Ruling: keep adjustment input contracts in canonical g/ml/units — show the exact physical quantity in that same unit inside the adjustment; read-only stock lists use kg/litres. No automatic input conversion or command shape change.

### Verification and review

- All eight initial browser checks were observed failing before implementation. After the first implementation pass, 18 of 19 checks passed; the remaining initial-focus behavior was corrected with an opt-in OperationPanel callback.
- Independent review found Escape could dismiss the panel before an expanded Autocomplete handled it. A regression expectation failed before the shared panel guard, then passed. First Escape now closes options, second closes the panel, preserving other draft fields.
- Review also caught rounding of tiny physical balances in the adjustment context. A 0.004000 ml fixture failed before the exact stockBaseQuantity formatter; the passing expectation verifies both displayed 0,004 ml and unchanged count payload.
- Final isolated browser suite: **39 passed**, including catalog-inventory-ux, ui-consistency, purchases-ux, procurement, cash-purchases and unified-purchases. All API traffic was intercepted. Product fixtures use the actual ProductCost array shape and verify no uncaught page errors after costs finish loading.
- Domain/integration: **19 passed** across inventory-core, item-entry-units, opening-reference-cost and opening-units. Disposable database authorization only; no configured database writes.
- Initial/final Impeccable layout detector returned `[]`. Visual checks cover 390/768/1440, long lists, card/table variants and visible adjustment actions. Bounded inspection and confirmation completed; no ongoing cosmetic loop.
- Final sanitized production build exited **0**, including TypeScript and static route generation, with DATABASE_URL blank and no .env reads. Expected missing-database warnings came from the account/password dynamic probe; this is compile verification, not production DB verification.
- Reviewer confirmed Escape and precise-base-quantity findings resolved; no new actionable findings in payloads, units, locks, generations, costs/cache or menus.
- Original next-env.d.ts/tsconfig.json restored from the pre-existing session backup. Git whitespace check passed. Branch remains codex/ui-consistency at 5326cfe, nothing staged, no commits/pushes, no .env/schema/.tmp changes. Earlier work remains intact.
- Fixture screenshots are under `.next-e2e/catalog-items-*.png`, `catalog-products-*.png`, `inventory-stock-*.png`, `inventory-lots-*.png`, `inventory-adjustment-*.png`; representative copies are in the session visualization folder `catalog-inventory-ux` and contain test data.
- Final scoped ESLint exited **0** without warnings. Read-only checks of `/products`, `/inventory/items` and `/inventory` on localhost:3000 each returned **200**; the real development app remains running.

## Product list density correction — user feedback, 2026-11-04

The live 700px catalog still devotes roughly 400px to one product. The user's screenshot rejects this structure. A generic record card separates identity, category, prices, cost and actions into too many vertical groups; a clean detector did not catch the poor density.

Spatial thesis: scan photo/name/category first, compare Mostrador price with estimated cost second, edit or inspect other channels third. Use compact product-specific rows below the table breakpoint, a single photo, category beside the identity, no repeated Active badge in the Active filter, no duplicate cost caption, and one footer for other channels and actions. Secondary channel details expand inline only on request. Preserve the wide table, reorder behavior, all prices including zero/missing, cost states/cache, filters and editing contracts.

- [x] Pin realistic multi-product density and channel-disclosure checks at phone/tablet widths; observe failure.
- [x] Implement the narrow product row without changing other entities or data contracts.
- [x] One batched responsive inspection/correction/confirmation, focused review, scoped tests/lint and sanitized build. Keep localhost:3000 running, nothing staged or committed.

### Correction verification

- The initial density expectations failed at 390/727px: the first product was 406.7px high. The dedicated ProductListRow now groups photo/name/category, pairs Mostrador with estimated cost, and combines Other channels/Edit/menu in a single footer. The representative tablet row is about 188px high; three products fit in the 1000px fixture viewport.
- Secondary prices expand inline, preserve the trigger's focus, expose aria-expanded/aria-controls and retain zero and missing prices. The wide table, catalog writes, reorder handlers, forms, cost loading and cache remain unchanged. Archived rows retain their status badge; the Active filter avoids repeating the same badge on every narrow row.
- Bounded inspection covered live real catalog at the normal ~700px width, plus isolated 320/390/727/768/1440 checks. Temporary browser viewport overrides were reset; the live catalog tab remains available. No real writes were performed.
- One correction aligned the Other channels button with the values while retaining its 44px target and ensured categories can wrap. Independent source review then reported no actionable findings.
- Final verification: **23 isolated browser tests + 8 cost/cache tests passed**, scoped ESLint exited 0, initial/final Impeccable layout detector returned `[]`, and sanitized production build exited 0. The build used no configured DB connection; expected missing-database messages from the dynamic password page did not fail the build. Original generated configuration files restored afterward. No commit/push or staging.

## Publication selection and verification — 2026-11-04

- User authorized committing/pushing this scope on codex/ui-consistency. The selection contains catalog/product UI, inventory stock/adjustment UI, exact quantity/cost formatting, shared panel focus/Escape/width support, and abortable getJson reads. Unrelated transaction-recovery changes in shared.tsx remain outside the selection, along with other pending modules and .tmp assets.
- A separate source snapshot was exported from the Git index to verify the selected code without depending on the other working-tree changes. No configured environment files or database connection were used; the live localhost:3000 process was left untouched.
- The initial dependent browser run exposed two existing selectors expecting the Pedidos tab to be a button. Updating those two references to role=tab made the five affected cases pass. No purchase behavior was changed by these test corrections.
- Final selected-code checks: **33 browser tests passed** (catalog-inventory-ux, ui-consistency, unified-purchases, procurement and cash-purchases), **8 cost/cache tests passed**, scoped source/test lint passed, and sanitized production compilation/static generation exited **0**. The isolated build used --webpack because Turbopack rejects the temporary dependency junction outside its root; the junction is only part of the verification setup and is not committed.
- The publication whitelist excludes next-env.d.ts, tsconfig.json, environment files, migrations and .tmp. Other pending changes stay in the working tree.
