# Independent whole-branch POS review

Application range b5946319f0f875854d52a981338157aea3368981 to 6052754c49fafe2056b39522bba1e040bedf4544. The additional c6c295f evidence commit contains documentation and artifacts. Reviewed the seven-task plan, requirements and local design guide, production changes, browser and unit cases, baseline and final metrics, screenshots and the prior scoped reviews. The application scan is complete. The controller stopped the default build after six minutes without progress. The exact base reproduces the query-count failure. A post-fix Webpack build is pending. No application, test, index or branch changes were made.

## Strengths

- One SalesManager owns lines and context. The catalogue and cart preserve their identity through CSS layout changes, and the configurator commits a separate draft. Product and modifier appearances use stable IDs and keys with explicit fallbacks. The canonical palette audit covers all nine approved cards. The account link and explicit clear cancellation have touch and focus coverage. The loaded-font checks compare the resolved font in the surface and the locator and sale-detail portals.
- Checkout keeps applied amounts, tender and change separate using integer arithmetic. It preserves optional transfer details and required card references. Stock recovery uses inline detail and printing has independent retries. Confirmed returns use actual sale details. The shared operation hook fences retained actions and asynchronous completions by attempt and mount.
- Existing cached requests, two-worker preloading, single pickup source and branch/channel/version keys remain. The comparable isolated journeys show 15 GETs each before and after. The branch changes no dependency version, lockfile, database schema, transaction or deployment infrastructure.

## Issues

### Critical

None found.

### Important

1. **The real mobile register can have no tappable catalogue.** At `src/components/sales/pos.css:511` only the order panel receives a scrollable outer surface and minimum workspace. The isolated page at `tests/e2e/pos-surface.spec.ts:641` grants the register the entire viewport. I ran an independent, in-memory Chromium probe mounting the actual AppShell and SalesManager under the sales pathname, with the same entirely intercepted API fixtures, an admin and one active branch. The real header occupied 117 px. Selecting Delivery at 360×740 gave a 12 px product viewport, consumed by its own padding, and 623 px for both client and scroll height of main. At 320×720 the product viewport was also 12 px. At 390×844 it was 37.7 px. None had a card with 44 consecutive tappable vertical pixels. After a successful counter sale with receipt at 360/320, the product viewport again measured 12 px. An operator cannot add the first delivery product on the narrow displays. Guarantee usable catalogue space with scrollable context or an outer layout that can scroll. Test the actual shell or a faithful equivalent and physically click a card on Delivery at 320/360 and after checkout at 390.

2. **Definitive permission rejection can trap the cashier in sale detail.** `src/components/sales/sales-manager.tsx:1380` and `:1495` omit `canDiscard` and `onDiscard` from OperationNotice. The normal checkout and workspace pass both today. In the real-component browser probe, the first cancel POST returned 403, the saved command correctly had `outcomeUncertain: false`, Escape could not close the dialog, and the only enabled button was “Reintentar mismo envío”. A saved, definitely rejected command retried from an account deep link has the same missing affordance. Forward the safe-discard predicate and callback in both places. Assert that discarding releases the modal and retains the underlying sale and draft without a second POST. Uncertain commands must retain their current retry-only policy.

3. **Refreshing a stale simple product keeps the obsolete revision.** `src/components/sales/sales-manager.tsx:731` updates unit price and expected price from refreshed data without replacing `expectedPricingRevision`. Server checks at `src/modules/sales/service.ts:226` and `:371` then reject a second checkout. My browser probe started with 3500/revision 1, received a conflict, refreshed with 3900/revision 2 and observed the next outgoing line carry 3900/3900.00 but revision 1. This path also exists on the base commit. It directly affects the promised checkout recovery and forces the operator to reconstruct an otherwise valid line. Capture the revision from the same fresh product row as its price and verify the submitted revision after recovery.

4. **A rejected request with a local cleanup failure leaves the UI accepting dead clicks.** At `src/components/inventory/shared.tsx:343` a failing removeItem after an ordinary definitive 4xx returns while the previous pending command is still set and uncertainty can remain false. The finalizer clears busy, so checkout appears unlocked while `submit` refuses every new operation. I injected a one-shot removeItem failure after an intercepted stock rejection. Confirmar was enabled, another click sent zero requests, the command remained stored and no same-command retry was available. Reloading to restore it loses the editable checkout. Keep the in-memory command locked and recoverable until cleanup succeeds. Test the one-shot storage failure, visible recovery and restored editability with the same draft.

### Minor

- `src/components/sales/order-configuration-dialog.tsx:63` supplies an initial selection but leaves the default “Agregar al pedido” label in edit mode. The combo path similarly says “Agregar combo” when changing an existing line. The underlying edits correctly preserve one line. A distinct “Guardar cambios” button would describe the effect. The current browser helper accepts either wording.

## Validation and limits

Reviewed the fresh 86/86 intercepted browser results (52 surface, 18 operation, 16 payment), 9/9 final presentation cases, successful typecheck and lint, the earlier focused checkout and unit results, and the before/after evidence. The three focused read-only probes above added actual shell geometry, denied cancellation, one-shot cleanup failure and price-revision payload checks. Every browser API operation was intercepted. The geometry fixture retained the actual AppShell, a pathname context and a minimal router context. The durable screenshots came from the standalone SalesManager fixture and omit shell height.

The broad Vitest run finished with 204 files passed, 13 failed, 2 skipped out of 219. Tests were 1,175 passed, 6 failed and 86 skipped out of 1,267. Nine setup-file failures concern legacy fixture/mapping guards or missing dedicated PostgreSQL. One assertion encountered a junction permission failure, four browser cases hit localhost access restrictions, and the checkout query count was 52 against a limit of 50. An exact b5946319 source archive reproduced 52 queries against 50 at the same line (five cases passed; one failed in 10.62 seconds). Reservations and financial assertions before the count passed. The measured delta is zero queries. Default Turbopack stopped after more than six minutes at the optimized-build message. Earlier baseline logs recorded a PostCSS worker communication failure. The stopped build does not establish the same cause. Managed Next E2E stopped before the application on the generic migration guard. No evidence covers two concurrent PostgreSQL connections, native mobile keyboards, private image delivery or physical printing. These limits are independent of the four observed application failures.

## Declined to judge

No in-scope behavior was set aside as outside the specification. Production network, physical hardware and optimized build verification limits are recorded above.

## Provisional assessment

Application specification and quality gates require fixes for the four Important findings. Re-review the four fixes together, including the real-shell geometry and final full-gate outcomes. The exact base comparison is complete. Post-fix build evidence and the focused re-review remain pending. This is the complete finding list for the one corrective wave.
