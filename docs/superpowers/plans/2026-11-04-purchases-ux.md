# Compras UI/UX implementation plan

> **For agentic workers:** Use superpowers:executing-plans in the existing worktree. No commit or push.

**Goal:** Make purchase needs, supplier orders, partial receipts and payments easy to scan and complete on PC/tablet, with honest loading/error states and preserved drafts.

**Architecture:** Refine existing client components and shared OperationPanel sizing. Keep all API contracts, exact quantity/financial calculations, permissions, receipt review and idempotent commands. Lazily retain visited workspace panels instead of discarding forms on tab changes.

**Tech Stack:** Next 16.3.6, React 19, Tailwind 4, Radix shared controls, Playwright isolated fixtures.

**Spec:** User-approved continuation of the UI/UX audit with Impeccable; preserve DESIGN.md and the existing unified purchase circuit. Routine choices are delegated. Mode: Operate.

## Constraints

- Same branch codex/ui-consistency, no commit/push; preserve earlier changes and .tmp images.
- Keep localhost:3000 using the existing real configuration. No .env edits, migrations, real purchases, receipts, payments or inventory commands.
- Tests intercept all API traffic and use disposable data. Compile with the existing sanitized build wrapper; restore generated config files afterward.
- Orange confirms; blue selects/navigates/focuses. Shared SearchCombobox for relations. Explicit required/optional fields and units; 44px auxiliary and 48px operational targets.

## Spatial thesis and decisions

- Keep Para comprar / Pedidos / Recepciones. Show truthful request states; a failed or unactivated consultation must never look like no purchase is needed.
- Needs: comparable item/stock/incoming/suggested/date/action rows on wide screens, labeled groups on smaller screens; blue selection and select-all at every size.
- Orders: state and arrival lead; supplier/item search, readable badges, one clear next action. Draft editor uses aligned item/presentation/quantity rows, wider protected panels and a fixed footer.
- Detail: reduce nested framing, put the next action before long line lists, preserve secondary reschedule/cancellation and all financial history. Lock navigation while a child advance is pending or uncertain.
- Receipts: retain drafts between workspace tabs; show the existing calculated cost with confirmation, compact optional line fields, and accessible review/confirm actions on tablet/mobile. Missing price remains pending, never a fabricated zero.

## Tasks

- [x] Pin request-state, draft-preservation, pending-advance and receipt-cost behavior with failing isolated browser checks.
- [x] Refine needs and order lists, state vocabulary, search, panel sizing and aligned editor rows.
- [x] Preserve visited panels and busy protections; refine receipt summary/actions without changing payloads or financial math.
- [x] Run focused existing/new browser and domain checks, scoped lint and sanitized build. Inspect desktop/tablet/mobile in one batched pass, correct once and confirm once.
- [x] Independent review, final git/config checks and leave the real app running, unstaged and uncommitted.

## Review focus

- Slow/failed refresh keeps prior information but cannot authorize stale commands or claim a healthy stock situation.
- Tab changes preserve unsent receipts/search/filter state; hidden panels do not issue writes or steal locks from another panel.
- Presentation changes still clear incompatible quantities; exact conversions, discounts and partial receipts remain unchanged.
- Pending/uncertain advance cannot be dismissed, duplicated or bypassed by closing its parent.
- Long names, many rows, missing prices and narrow screens retain readable units, focus order and access to the confirmation/retry.

## Audit and execution ledger — 2026-11-04

| Finding | Implemented outcome |
|---|---|
| Failed needs query displayed a healthy empty state | Explicit loading/error/activation/empty states; retained stale rows stay read-only for preparation until refreshed |
| Desktop needs actions consumed an extra row; selection and select-all were inconsistent | Aligned data/actions with a container breakpoint, blue selection, visible select-all at every size |
| Receipts were discarded on workspace tab changes | Lazily mount visited panels and retain them; refresh reads on reactivation without clearing form/search state; busy flags are kept per source |
| Order editor and detail were cramped and deeply framed | Opt-in wide shared OperationPanel, divided aligned editor rows, shared state badges, supplier/item search and next action before long detail lines |
| Advance could be dismissed through the parent panel during a pending request | Propagate the advance's own operation lock to parent navigation and closing; preserve retry behavior and request payload |
| Receipt cost/confirmation were distant from review | Existing shippingPreview/cents shown with review actions; optional discount/lot/expiry fields are disclosed without discarding their values; draft review action remains visible |
| Review inherited the old long-form scroll position | Scroll/focus the non-sticky review region on entry; amount and confirmation lead the new step |

Ruling: keep the existing unified workflow and side-panel pattern, widening only the complex purchase panels — consistent with the approved design and less disruptive than adding routes or a new wizard.

Ruling: retain panels lazily, refreshing only active reads on return — preserves drafts without eagerly querying hidden purchase sections or leaving forecasts stale.

### Verification

- Seven new behavior checks were observed failing before the implementation (failed-query state, draft preservation, order search/next action, advance pending lock, review amount/actions at three sizes).
- Final isolated browser suite: **19 passed**, across purchases-ux, unified-purchases, procurement and cash-purchases. A supplementary three-case run also passed after adding the assertion that draft review is immediately in the viewport. All API traffic was intercepted; no real writes.
- Domain/integration: **25 passed** across unified-purchases, procurement-projection, purchase-shipping and cash-purchases. Disposable database authorization only; no configured database was used.
- Updated two old test selectors from button to tab to match the shared accessible Tabs already in the application. The initial baseline with obsolete selectors was interrupted; the adapted suites passed in full afterward.
- Scoped ESLint passed, including the final test-file change. Impeccable's initial and final layout scans returned `[]`.
- One batched visual inspection across PC/tablet/mobile, one correction batch (column placeholder alignment, multi-line field alignment, singular copy, redundant labels, review scroll/focus), and one confirmation batch. No further cosmetic iteration.
- Independent source review found no actionable regressions in retained drafts, request generations, advance lock propagation or financial payload/calculation reuse.
- Sanitized production build exited **0**, including TypeScript and route generation. DATABASE_URL remained blank and no .env was loaded. The account/password dynamic probe emitted the expected missing-database warning; this is compile verification, not a production database run.
- Original next-env.d.ts/tsconfig.json restored from the pre-existing session backup. Git whitespace check passed. Branch remains codex/ui-consistency at 5326cfe, nothing staged, no commit/push, no migrations/.env/.tmp changes. Prior work remains intact.
- Real development app remains on localhost:3000; read-only /inventory/purchases check returned **200**.
- Final screenshots use fixture data: `.next-e2e/purchases-needs-1440.png`, `.next-e2e/procurement-new-1024.png`, `.next-e2e/purchases-review-390.png`; copies are in the session visualization artifact folder `purchases-ux`.
