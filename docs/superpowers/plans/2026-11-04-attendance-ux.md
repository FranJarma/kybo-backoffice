# Asistencia y Turnos — UI/UX refinement

**Publication update (2026-11-04):** the user subsequently authorized commit and push of this scope on the same branch. Earlier no-commit/no-staging statements refer to the implementation phase.

User-approved continuation of Impeccable in Operate mode, on codex/ui-consistency. Preserve DESIGN.md, previous work and localhost:3000 with the existing real configuration. No commit/push, migrations, .env changes or real attendance/schedule writes.

## Direction

The personal phone view should lead with identity, current state, the applicable schedule and one clear next action. Compact QR/proximity success feedback; keep errors and the need to scan visible. Verification/location/QR requirements remain server-enforced and unchanged. A missing/expired QR must not leave an apparently actionable punch button.

Weekly planning should read as a usable calendar: compact cells, readable pause/time text, clear today column, named employee/date controls, and an explicit contained-scroll cue on narrow screens. Preserve the existing weekly model, per-day edits, habitual shifts, multi-day preview, occupied-day skipping and command payloads.

Separate loading/read failures from command progress. Keep the previous snapshot visible during week changes, but disable edits until the matching snapshot arrives. Initial failures show local retry rather than indefinite loading. Automatic background reads preserve form drafts.

Use shared Dialog focus return for attendance drawers, freeze all controls during a submitted command, and let an expanded Autocomplete consume Escape first. Multi-day preview/result transitions receive focus, with reachable review/confirm actions.

## Tasks

- [x] Add isolated browser fixtures and failing checks for read failure/range locking, drawer focus/pending protection, preview/result transitions, QR gating and mobile action visibility.
- [x] Refine attendance manager/personal presentation and weekly calendar without backend/security changes.
- [x] Refine shared attendance drawers and multi-day assignment feedback while preserving retries and revisions.
- [x] Run focused browser/unit checks, lint, sanitized build, one batched responsive inspection and at most one correction/confirmation pass.
- [x] Independent code review and final git/config checks; keep all work uncommitted and app running.

## Initial evidence

Independent source assessment and live inspection identified old-week controls staying interactive during range fetches, excessive stacked mobile guidance, 130px empty calendar cells/10px pause text, repeated unqualified shift names, missing controlled-dialog opener recovery, and editable submitted form fields. The initial Impeccable layout detector returned `[]`; these are hierarchy/interaction defects that require source and rendered review.

## Delivered behavior

- Personal attendance groups full identity, current status, schedule and QR feedback around the next action. A missing/expired QR disables all punch actions. Proximity success keeps distance/radius/revalidation and an accessible 44px refresh control; location errors retain their full recovery guidance. Secondary verification explanation is disclosed after the action. Both optional and required-location phone fixtures keep entry visible in the first 390x844 viewport.
- Weekly planning groups week navigation, copy and multi-day assignment; adds local name filtering, scoped calendar headers, a today treatment, 12px pause information, contextual edit names and labeled 44px assignment controls. Empty rows are 88px rather than 130px. Narrow calendars scroll within a named/focusable region with a visible cue; the document does not overflow.
- Foreground/range reads retain the old snapshot with editing locked, separate loading feedback and local retry. Background reads retain drafts; read failures disable commands but allow drawers to close. Closing a read-blocked drawer focuses the retry control instead of a disabled opener. Query and command errors/progress remain separate.
- Attendance drawers reuse shared Dialog focus restoration. Their fields freeze during a command; the header exposes pending status; expanded Autocomplete handles the first Escape. Native autofocus was removed from habitual-shift and manual-code inputs so Drawer owns initial focus consistently. No manual approval or verification policy changed.
- Multi-day preview/result headings receive focus; a fixed footer keeps review/confirm/close reachable. Existing payloads, preview invalidation, server rechecks, occupied dates and uncertain-send retries remain intact.
- A further concurrency regression demonstrated that a background update could pair an old draft with a newer revision. Assignment and habitual-shift forms now capture their opening record together with the draft, preserving conflict detection rather than overwriting another edit.

## Verification and review

- Initial assertions reproduced indefinite loading after failed reads and missing range feedback. A later read-error drawer regression failed focus recovery before the targeted close handler, then passed. The concurrent-assignment regression first sent expectedRevision=2 for a revision-1 draft, then passed with the opening revision retained.
- Final browser checks: **27 passed** across attendance-ux and ui-consistency. Every request in the attendance fixture is intercepted; no real attendance/schedule/identity writes occur. Coverage includes range failure/retry, frozen command values, drawer focus/Escape, read-error dismissal, preview/result transitions, stale revisions, QR expiry, entry/pause/resume/exit availability, and required proximity.
- Focused unit checks: **55 passed** across attendance-ui, attendance-personal-ui, attendance-rules, attendance-attempts, attendance-qr-clock, attendance-location-feedback and attendance-period. Scoped ESLint exited **0** without warnings.
- Sanitized Turbopack production build exited **0**, including TypeScript and all 99 static pages, without loading environment files or connecting to Neon. Expected missing-database messages from the dynamic password route did not fail compilation. Original generated next-env.d.ts/tsconfig.json content restored afterward.
- Independent review confirmed the autofocus, retry-focus and opening-revision fixes; no remaining actionable findings. Initial/final Impeccable layout scans returned `[]`.
- Bounded visual inspection/one correction/one confirmation covered 390/768/1440 layouts, required proximity and the multi-day preview. Representative **test-data** captures are in the session visualization directory `attendance-ux/` and ignored `.next-e2e/` artifacts.
- Live localhost:3000 confirmation used the existing real account/data, opened the multi-day form and cancelled it. Employee Autocomplete received focus; the first Escape closed its options and the second closed the drawer and restored the calendar opener. The updated schedule tab remains open. No real writes, migrations, environment changes, commit, staging or push were performed.

## Publication selection

The selected change contains nine attendance UI/style files, the isolated browser specification/helper and this implementation record. The 27 browser checks and 55 focused unit checks were repeated successfully before publication. Other pending modules, generated/environment files, migrations and .tmp assets remain outside this commit.
