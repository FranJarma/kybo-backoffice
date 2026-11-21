# Task 6 independent re-review, round 1

Reviewed `b96ab8e..105f01de9283383f91c3404185be618dc60c79f1` on `feature/ux-ui-pos-improvements` against the four findings in `task-6-review.md`.

**Specification verdict — PASS. Quality verdict — PASS.** All four findings are addressed. No additional blocking defect surfaced in the fix diff.

| Previous finding | Verdict | Basis |
| --- | --- | --- |
| Critical — an obsolete POS mount could clear or overwrite the newer command and invoke its old callback | ADDRESSED | In `src/components/inventory/shared.tsx`, layout cleanup invalidates both the action snapshot and the active attempt. The hook checks the attempt after identity, network and body awaits, including errors. The finalizer also checks ownership before releasing busy state. Both Chrome remount tests hold Y in flight while stale X finishes with 200 or 503. They assert Y's storage bytes, current busy state, callback count and navigation identity, then lose Y's response and confirm the identical Y body after reload. The branch-switch test also requires zero obsolete cash POSTs after identity verification completes. |
| Important — a newer sale revision could show the earlier status and receipt | ADDRESSED | `src/components/sales/sales-manager.tsx:246` expires the entire earlier confirmation upon accepting a newer revision for that sale. An outdated GET cannot expire a newer result. Table settlement and counter cancellation tests check the fetched status, absence of the old notice and cash figures in the detail, absence of the notice on return, and one sale POST. |
| Important — failure to remove a command after failed identity verification could leave the UI busy | ADDRESSED | The pre-dispatch removal has its own catch. The hook retains the pending command, explains how to retry, and releases the current attempt in its shared finalizer. The storage-failure test checks zero cash POSTs at failure, preserved original unsent state, recovery after explicit retry, one resulting POST, and zero unhandled page errors. |
| Important — invalid commission or VAT percentages could pass the result guard | ADDRESSED | `src/components/sales/sale-result.ts` requires a finite decimal string for percentages rendered by sale detail. Staff redaction and historical null costs remain accepted. Malformed commission and VAT cases assert ongoing uncertainty, no premature success and byte-identical retry. A valid admin case renders the 2.5% commission and 21% VAT with their associated amounts. |

**Evidence.** On the prior implementation the authors recorded six failing hook cases, two failing stale-revision UI cases and one passing admin control. The new reports document 18/18 real-hook Chrome cases, 28 selected Vitest checks and successful typecheck, lint, formatting and diff checks. The final checkout log records a fresh 21/21 run in 43.6 seconds. I checked the fix and test assertions and the checkout log; no suite was rerun during re-review.

**Remaining verification limits.** The dedicated two-connection PostgreSQL run still requires KYBO_TEST_DATABASE_URL. Managed Next sales/pickup E2E remains unverified under the earlier database/socket restrictions. Chrome used intercepted requests. Physical printing is outside that evidence. Task 7 visual completion is outside this review.

