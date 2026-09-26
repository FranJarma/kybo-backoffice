# Full branch review — administration milestone

Reviewed 2026-09-25 against backend `c2ae45f`, integrated snapshot `ed7d78a`, and the credential-policy correction visible in the working tree. Scope: the approved plan's first administration milestone, including task 5 and README; not the later POS/stock/offline replacement.

## Verdict at review time

Changes are required before completing the task 5 verification gate. The backend substantially meets tasks 1–4; the UI implements the intended modules and form contracts, but two important UI defects and a conditional origin-configuration defect are identified below. Browser verification has not yet passed. This report does not approve production operation.

The previously reported P3 credential-provisioning mismatch is corrected in the inspected code: provisioning now uses `z.email()` and 8–128 password bounds, and Better Auth explicitly uses those bounds. The coordinator reports the two regression tests passing, with 37 backend tests total. I did not rerun the unchanged suite.

## Findings requiring correction

### P2 — Failed logout navigates away without ending the session

**Location:** `src/components/app-shell.tsx`, `SignOutButton.signOut`.

The function awaits `fetch` but never checks `response.ok`. A 403/500/503 response resolves normally, after which the UI navigates to `/login`. The session cookie and server session can remain valid, making a failed logout look successful on a shared device. Network rejection only resets the button and provides no visible explanation.

Check the response before navigating; retain the current screen, clear busy state and show a visible retryable error on failure. Regression: return 503 from the sign-out route, assert no login redirect and a visible error, then verify a successful retry revokes the session and navigates.

### P2 — Enter can activate Cancelar and discard an edited form

**Location:** `src/components/catalog-manager.tsx`, form footer `Cancelar`; `src/components/ui/button.tsx`, native button defaults.

`Cancelar` has no explicit type and is rendered by the official Button wrapper as a native button without a default type. It therefore becomes a submit button and precedes `Guardar`. Native implicit submission from a single-line field activates the first submit button; its click handler calls `closeForm`, which discards the dialog draft. This follows directly from the rendered button order and native form behavior; it was not presented as a completed browser reproduction.

Set `type="button"` on `Cancelar`. Regression: fill a valid new record, press Enter in its name field, and verify saving rather than cancellation. Also assert explicit cancellation makes no write request.

### P2, conditional configuration — Additional trusted origins can log in but cannot save

**Location:** `.env.example`, `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, and `src/modules/catalog/http.ts`, `requestInput`.

The configuration advertises optional exact additional origins. Auth allows the canonical origin plus `BETTER_AUTH_TRUSTED_ORIGINS`, but catalog mutations accept only the canonical origin. When an alias is configured as an additional trusted origin, the auth wrapper accepts its login and authenticated catalog reads have no origin restriction, yet every catalog mutation from that origin receives 403. The single-origin default is unaffected.

Share one exact configured origin allowlist between auth and catalog mutation validation, retaining rejection of missing and unlisted origins. Alternatively explicitly limit this setting to an auth-only integration and stop advertising it as a general application alias. Regression should cover canonical, configured additional, unlisted, and absent Origin values.

## Existing verification issue

The coordinator already identified login interaction before hydration causing native form navigation, and an implementation fix is in progress. It is not counted again as a new finding here. The inspected pending change disables the login fieldset until hydration; its browser regression and complete E2E rerun remain required.

## Compliance and quality assessment

- The reusable catalog form matches strict backend field names, sends explicit revision values for edits, converts stored decimal strings back into Argentine decimal input, and distinguishes null cost from explicit zero. Supplier/customer/payment/product/ingredient/presentation coverage matches the approved scope.
- Failed saves and revision conflicts retain draft values. Success closes the dialog only after a successful HTTP response. A lost response is described as unconfirmed, consistent with the README's limited first-milestone retry semantics.
- Archived historical references remain available in existing forms while new reference selections use active records. Reference searches and visible-count notices address the 100-row service limit. Unit labels are shown with presentation quantities.
- Server role checks remain authoritative for API reads and writes; the layout also gives staff a denied-access view. UI visibility is not used as the authorization boundary.
- The README accurately separates embedded local verification from Neon configuration and later operational delivery. It documents isolated E2E setup, migrations, secure credential handling, and that this is not yet a validated Fudo replacement. It should state the now-enforced 128-character password maximum alongside the minimum.
- The UI report records provenance of the official Shadcn registry components. The change from provisional wrappers to native registry defaults explains why form button types require explicit checking.

## Evidence and remaining gate

This pass inspected the actual UI, API boundaries, tests, E2E runner, configuration, README and prior UI report. The coordinator reports clean typecheck/lint/build. Earlier backend review included two real migrated-database reproductions; this UI review did not rerun those tests or claim browser success.

Before marking task 5 complete: fix the findings, run focused regressions plus the complete browser suite, and record final results. Neon hosting, production credentials/proxy/TLS settings and live-store readiness remain outside local verification.

## Closure review — 2026-09-25

The findings above are preserved as review history. I inspected the corrective diff and current source/tests; all scoped findings are now closed:

- **Logout:** `SignOutButton` checks `response.ok`, stays on the current page on failure, shows a visible error, and resets its busy state for retry. The browser regression injects HTTP 503 and asserts no redirect, visible error and an enabled retry control. It verifies failure handling and retry availability; it does not itself perform a successful logout retry.
- **Keyboard/cancellation:** `Cancelar` explicitly has `type="button"`; `Guardar` remains the submit button. The browser regression confirms Enter creates a supplier durably, while a cancelled draft is absent after reload.
- **Additional origins:** auth configuration, its HTTP wrapper, and catalog mutations share the exact origin allowlist from `src/lib/origins.ts`. Configured alias acceptance and rejection of a lookalike attacker prefix are covered by regression tests. Missing origins remain rejected; wildcard additional origins are not accepted.
- **Login hydration:** the server snapshot of `useSyncExternalStore` keeps the fieldset disabled until hydration. The JavaScript-disabled browser case checks disabled credential fields and submit control, and the normal browser flows exercise successful hydrated sign-in.
- **Credential setup:** the earlier aligned email/password validation remains in place, and the README now documents the 8–128-character bounds.

I directly inspected `/tmp/kybo-final-unit.log`: 5 files, 39 tests passed. The coordinator reports all 7 E2E cases passed, including the targeted UI regressions and the existing persistence/conflict/mobile/access flows. I inspected those tests and did not rerun unchanged verification. The coordinator is running the final build/typecheck/lint gate separately.

**Closing verdict:** no remaining demonstrated blocker in the scoped backend/UI review. The reviewed changes are suitable to complete this first administration milestone once the coordinator records the final build/typecheck/lint results. This verdict does not establish Neon deployment, production readiness or replacement of the live store system.
