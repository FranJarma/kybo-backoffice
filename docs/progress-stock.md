# SDD ledger — plan: docs/superpowers/plans/2026-09-25-compras-stock.md

Authorization: user said “Sigamos, despues hacemos la integracion” after the completed first increment and next-block proposal. Continue local reversible development; do not repeat approval menus or connect/deploy services. Integration remains deferred.
Isolation: independent new app repo; new branch feat/purchases-stock starts at0700c12. Existing Sites repo remains untouched. No remote.
Ruling: implement the already-proposed next subsystem with a concrete sub-spec and plan; existing user authorization applies to this local implementation. Preserve future POS/production scope.
Ruling: parallel backend/UI ownership against fixed types and HTTP contracts is safe; root owns routes/integration. No overlapping source edits; root alone coordinates test servers/build and final commit.

| Pair/task | Producer / consumer | Check |
| --- | --- | --- |
| 1→2 | createInventoryService methods / routes | Names and responses fixed in spec |
| 1→3 | types.ts / typed frontend | Root creates contract; backend may not rename without notifying root/UI |
| 2→3 | HTTP JSON paths / fetches | Paths and wrappers in spec agree |
| Task1 | Schema/transactions/tests | Assertions cover physical and valued balance separately |
| Task2 | Permissions/Origin/routes | Same private response helpers as catalog |
| Task3 | Forms/E2E | Incoming quantities mean received; uncertain retries lock payload |
| Task4 | Packaging/docs | No claim Neon or POS ready |

Baseline:39 tests passed in18.96s before implementation. Task1backend andTask3UI inprogress in separateownership; Task2HTTP implemented (5RED expected501→5GREEN), integrationtypecheck pending service.

Ruling: list search query is `q`, matching existingcatalog andUI; lots/movements add offsetpagination so old exhaustedlots cannot hide actionable stock. Paymentfingerprint includesreceiptId. Serialize idempotencykey before resource locks and stale-statechecks. Reject futureactual received/paid dates; allow genuinelyexpired receivedgoods, markedunavailable. Shared math mustnormalize AR inputs for preview; unitcost display retains6 decimals.

Task 1: implemented; root full test run64/64, followed by independent review P2 for positive count on archived ingredient. Backend agent fixing with regression.
Task 2: implemented; five boundary tests RED501 then GREEN, included in64. HTTP paths and q searches match UI.
Task 3: implemented; integrated browser verification and review fixes in progress. TDD deviation: initial browser attempts failed before feature assertions; recorded honestly in UI report, not counted as a valid RED.
Task 4: review found three defects in docs/stock-review.md; fixes assigned. No repeated broad review planned, scoped closure after regressions.
Ruling: add per-user sessionStorage recovery for one pending command per operation kind before sending. Prevent duplicate commands after reload/navigation and wrong-target payment drafts. This is tab recovery, not the deferred offline POS queue. Authentication denial cannot settle a previously uncertain command, so retain its original key.

Final closure: all four tasks completed. Independent reviewer closed all three findings after scoped inspection. UI regression now starts with a nonempty payment draft before creating another receipt. Root final gates after formatting: 67/67 tests in seven files, build/typecheck/lint/diff check exit 0. Eleven distinct browser scenarios verified via 10 passing in the full run plus the corrected mobile case; strengthened payment draft case additionally passed. Desktop and populated mobile screenshots visually inspected. Exact evidence and current limitations are in docs/verification-stock.md. Deliver version 0.2.0 source archive; external integration and deployment remain deferred.
