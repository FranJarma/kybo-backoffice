# Kybo UI consistency implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Execute sequentially in the existing isolated worktree. Do not commit or push.

**Goal:** Resolve the nine findings in the November 3 UI/UX audit while preserving Kybo's identity and fast operating workflows.

**Architecture:** Keep the existing React/Radix/Tailwind system. Make shared components authoritative for button variants, focus and local tabs; retain valid per-surface density. Simplify administrative presentation without changing APIs or business validation.

**Tech Stack:** Next 16.3.6, React 19.3, Tailwind 4.3, Radix UI 1.6.7, Playwright and Vitest.

**Spec:** `.impeccable/critique/2026-11-03T18-28-00Z__src-components.md`, approved by the user with “Avancemos como vos me recomiendes”.

## Global Constraints

- Preserve orange #ff8500, navy #071b42, blue #0669db, Manrope and existing logo/photos.
- Use accessible orange ink #9a4b00 for outlined orange text/borders and blue for selection/focus.
- Shared Autocomplete remains the only searchable relation selector. Preserve inline POS controls.
- No business operations, real account changes, migrations, .env edits, commits or push.
- Keep the real app on localhost:3000. Browser regression fixtures intercept requests; never run transactional tests against Neon.
- Preserve production drafts, operation locks, prices and validation. Do not reset drafts on purely visual navigation changes.
- Reversible visual edits use visual verification; meaningful interaction changes get browser regression coverage.

## Review Focus

- Lazy header modal: closing after loading returns focus even when the opener was temporarily disabled.
- Tabs: keyboard, disabled operations, overflow on narrow phones, and existing draft persistence.
- Price channels: hidden optional controls retain existing values and the submitted payload; required counter price remains discoverable.
- Ingredient menu: accessible labels, keyboard activation, archive/restore and duplication remain available.
- Global component styling: explicit 48px utilities and POS targets survive shared changes; mobile keyboard does not strand form actions.

## Tasks

### 1. Shared foundations

Files: globals.css, ui/button.tsx, cash/cash.css, DESIGN.md, .impeccable/design.json.

- [x] Define semantic orange ink/focus tokens and document the incumbent system plus adopted audit rules.
- [x] Move button height/variant authority to Button; eliminate global 42/34px overrides. Default/auxiliary controls 44px; operative profiles remain 48px.
- [x] Give outline-primary accessible ink and borders; use blue for links and neutral secondary hover.
- [x] Use full-strength shared focus in cash fields and legible legacy placeholder text.
- [x] Verify computed colors, focus and minimum heights in the isolated browser fixture.

### 2. Tabs and keyboard consistency

Files: ui/tabs.tsx; production, inventory/purchases-workspace, daily-operations, attendance and branches workspace; catalog-manager and recipe tab styling.

- [x] Add shared Radix Root/List/Trigger/Content with consistent blue selection and visible focus.
- [x] Adopt in production/branches; replace incomplete attendance, purchase and daily-operation tab semantics.
- [x] Preserve existing valid manual keyboard behavior in catalogue/recipe forms while sharing their visual class.
- [x] Regression: arrows/Home/End, one selected tab, associated panel, disabled tabs and content/draft continuity.

### 3. Modal focus continuity

Files: ui/dialog.tsx, cash/header.tsx; focused interaction fixture/tests.

- [x] Capture the actual active opener before dialog autofocus, restore after Escape/Cancel/X unless caller overrides restoration.
- [x] Explicitly restore the lazy cash header opener after dismissal, without removing input autofocus.
- [x] Regression: controlled opening, nested dialog, disconnected opener and custom initial focus.

### 4. Administrative forms and tables

Files: catalog-manager.tsx, catalog/ingredient-actions.tsx, branches/branches.css, attendance/attendance.css. Keep the secondary menu specific to the ingredient row; preserve the existing price-preview component and render it only for entered valid prices.

- [x] Keep ingredient Edit visible; move Duplicate and Archive/Restore into an accessible secondary menu to reduce row height.
- [x] Make product modal header/footer fixed within its scroll container; retain short-viewport escape hatch.
- [x] Consolidate VAT explanation and reveal optional channel price fields when enabled, retaining draft values and counter price requirements.
- [x] Correct Create labels and remove raw accessible session UUID from daily operations.
- [x] Increase address edit/shift addition/close hit areas and keep icon sizes independent.
- [x] Regression: menu keyboard and return focus, visible required counter price, optional draft retention, reachable actions at narrow/short viewports.

### 5. Verify and review

- [x] Run focused isolated browser checks and existing cash/production/schedule regressions, TypeScript, scoped ESLint, Prettier and build.
- [x] Inspect desktop and mobile together once, fix observed defects in one batch, confirm once.
- [x] Independent whole-change review; resolve important findings and run relevant verification.
- [x] Keep localhost:3000 serving real project data, stop only owned test helpers, leave code uncommitted.

## Decisions

The user delegated priority and implementation decisions. Apply all nine findings in the proposed order without another approval round. This plan records the implementation scope; the archived audit remains the design specification. Existing worktree reused; local branch codex/ui-consistency separates these changes from the previously pushed production work.
