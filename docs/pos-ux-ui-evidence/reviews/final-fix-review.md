# Independent scoped re-review of the final POS fixes

Reviewed c6c295f127a6540e85fefda5f935a8840c730011 to be21941c921a788c1c8124386eb8c3fa349863fd on feature/ux-ui-pos-improvements. This pass covers the four Important findings in final-review.md and the nine files in the corrective diff.

| Original finding | Verdict | Evidence |
| --- | --- | --- |
| Mobile shell concealed the catalogue | ADDRESSED | The mobile surface scrolls vertically in both active panels. Products reserve 272 px for filters and the card viewport. Six Chromium cases mount the real AppShell, verify its header and main heights, find 44 consecutive pixels receiving pointer input on a card, click those coordinates and check the correct single line. Delivery and post-receipt states are both covered at 320×720, 360×740 and 390×844. The standalone profile retains its original host. |
| Definitive permission rejection trapped a sale detail or cancellation | ADDRESSED | Both notices now receive the existing discard predicate and callback. The denied-cancellation case returns to the original sale and a separate draft after exactly one 403 cancellation. The deep-link cases compare the retry against the original saved payload and verify that a 401 offers discard only when the earlier outcome was known. |
| Price refresh retained the obsolete revision | ADDRESSED | SalesManager copies expectedPricingRevision from the same fresh lookup row as expectedPrice. The regression compares both submissions following a 409. The refreshed payload carries 3900.00 and revision 2, retains two units and preserves the edited note. |
| Local cleanup failure left dead checkout controls | ADDRESSED | The hook retains the pending command, locks new submissions and exposes recovery. Safe discard requires a definitive client rejection and a known outcome. A failed attempt to store that outcome conservatively retains uncertainty. The 400/409 hook cases verify byte-identical retry and subsequent admission of a fresh request ID. The checkout case verifies one stock-rejected POST, blocked confirmation, safe local discard, and preservation of both tender and the editable cart. |

## Evidence and assessment

The initial RED run failed 11 of 13 focused cases; the separate price rerun demonstrated the intended stale-revision failure. The final logs record 13/13 focused browser cases, 99/99 full intercepted browser cases (63 surface, 20 operation, 16 receipt), 88/88 focused Vitest cases, and successful typecheck, lint, formatting and diff checks. The Webpack production build completed, compiled TypeScript and enumerated the application routes. Its log includes missing local auth/database configuration while collecting pages. It establishes compilation and route generation; it does not exercise a configured authenticated runtime.

The broad Vitest run before this wave recorded 1,175 passed, 6 failed and 86 skipped. The checkout round-trip count reproduced unchanged on the exact original base, 52 against a limit of 50. The remaining failures and skips are attributed in the global report to fixture guards, sandbox restrictions and missing dedicated PostgreSQL configuration. The default Turbopack build was interrupted after over six minutes without further output. Managed Next E2E did not start because the generic migration guard blocked its setup. Physical printing, native mobile keyboards, private media delivery and two-connection PostgreSQL were unverified.

**Specification gate PASS. Quality gate PASS. Ready to merge from application review: Yes, with the verification limits recorded above.** No additional Critical, Important or Minor issue surfaced in this fix diff. The earlier optional edit-button wording remains deferred. This assessment does not certify a green all-repository CI run.

**Declined to judge:** None within this corrective scope.
