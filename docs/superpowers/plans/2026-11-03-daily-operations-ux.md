# Operación del día: recorrido de la encargada

> **For agentic workers:** Use superpowers:executing-plans in the existing worktree. No commit or push.

**Goal:** Recognize urgency, responsibility and the next step without opening every task, while keeping filters and updates trustworthy.

**Architecture:** Refine the existing manager/list/detail components and extract the asynchronous read lifecycle into a focused hook. Preserve backend task generation, authorization, idempotency, stock semantics and the separate Stock/History views.

**Tech Stack:** Next 16.3.6, React 19, Radix, Tailwind 4, SearchCombobox, Playwright/Vitest.

**Spec / approved direction:** The user approved the manager journey (Operación del día → Stock/traslados → Compras), prioritizing urgency, ownership, next actions, tablet use and continuity. This pass covers Operación del día; the stock table and purchasing workflow remain the next focused passes. Preserve DESIGN.md.

## Global constraints

- Same codex/ui-consistency branch; preserve all existing uncommitted work and next-env.d.ts baseline. No commit/push, migrations, .env changes, business data commands or .tmp image changes.
- Brand orange for confirmation, blue for selection/focus, semantic status text, Manrope, 44px auxiliary/48px operating controls.
- Shared SearchCombobox for searchable people fields. No new modal or business state.
- Real localhost:3000 remains running. Browser tests intercept all API traffic; loading this real page currently reconciles tasks automatically, so use disposable UI fixtures for behavioral/visual checks.

## Spatial and interaction decisions

- Lead with title/date and concise refresh feedback, then the existing section tabs.
- Compact priority controls use labels and counts; the task list remains the dominant content.
- Give filters visible labels and an explicit reset. Separate task-only filters from Stock and History.
- Each task exposes kind, amount/unit, route, owner, state and a truthful next-step hint. Closed history never claims to be overdue.
- Task detail retains protected focus, assignment, confirmation, blocker reporting and links to specialist modules. Replace assignee selects with shared Autocomplete; preserve written reasons on conflicts.
- Initial/filter reads are visibly loading and cannot act on a previous query. Background reads preserve the current list and edits. Filter changes do not trigger task generation; reconcile remains initial/periodic/manual, with its request ID reused on uncertain outcomes.

## Tasks

### 1. Reliable reads and filters

- [x] Add meaningful browser regressions for old-query hiding, stale responses/errors, read failures, recovery, and filter changes without repeated reconciliation.
- [x] Extract read/update coordination with cancellation/timeouts, correct query identity and separation of refresh from filtering.
- [x] Preserve automatic/manual task generation and task detail refresh; ensure errors are cleared only by a current successful read.

### 2. Scanable work list and detail

- [x] Replace large metric cards with compact urgency controls and labeled filters.
- [x] Add next-step hints based on existing task semantics, clear owner/status labels and meaningful pagination.
- [x] Use Autocomplete for people in filters and detail; retain all permissions and stock/production confirmation steps.
- [x] Keep open-task edits safe when background data changes; display a current-revision notice rather than silently replacing them.

### 3. Verify and record

- [x] Run isolated interaction regressions and focused presentation tests; preserve earlier staff-journey checks.
- [x] Inspect desktop/tablet/mobile in one batch; one fix batch and one confirmation maximum.
- [x] Fresh review, scoped lint, sanitized compilation and git diff checks. Restore generated config changes after compilation.
- [x] Leave app running and record actual remaining limitations. No commit/push.

## Review focus

- No stale query can produce a clickable task from a different filter or display an irrelevant error.
- Choosing filters must not perform business task generation.
- Refresh failures retain readable data but pause task commands; success clears the current connection error.
- Closed tasks show outcomes, not misleading deadlines or execution prompts.
- Changing task revision does not erase an assignee/reason draft or enable an outdated command.

## Execution ledger

- Ruling: retain one-minute reconciliation and keep stock/purchasing domain behavior unchanged; the request is a UI/UX pass, not a change to inventory policy.
- Ruling: execute directly under the user's approved direction and delegated routine choices; no additional design approval round is needed.
- Ruling: a confirmed snapshot that omits an open task also pauses its commands; absence may mean a different state, owner or page, so the notice makes no claim that it was deleted.
- Ruling: closed tasks show neutral planned dates, and uncertain task/reconciliation retries retain their original payload and request ID after a later permission rejection.

## Verification outcome

- 25 unique isolated browser regressions passed: 12 daily-operation UX cases, 4 existing daily-operation flows and 9 prior staff-journey polish cases. The last reconciliation-ID case passed separately after its red/green check.
- 17 presentation, priority, stock-summary and suggestion unit tests passed; scoped ESLint passed with zero warnings.
- Sanitized production compilation completed with exit 0, including TypeScript. It intentionally has no configured database and leaves dynamic routes for runtime; generated tsconfig/next-env changes were restored to their original baseline.
- Independent layout assessment and implementation review completed. Both implementation findings were reproduced with failing regressions and fixed; the recheck found no remaining blocker.
- Desktop 1440px, tablet 768px and mobile 390px were inspected together, corrected once and confirmed once. Screenshots use clearly fictional fixture data; no real task generation, assignment, purchase, stock or cash command was run.
- Stock calculations/table and domain command permissions remain unchanged. The existing real app continues on localhost:3000; no commit or push.
