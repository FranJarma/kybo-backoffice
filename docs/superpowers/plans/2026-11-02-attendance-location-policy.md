# Attendance Location Policy Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with one final independent review.

**Goal:** Make attendance proximity optional per branch while preserving identity, QR, permissions and truthful history.

**Architecture:** Add requireLocation, default true, to attendance settings through migration0034. Centralize backward-compatible policy selection using whole-row JSON extraction until the column exists. Validate the current server-side flag before location evaluation and carry an explicit historical marker in event evidence and public snapshots.

**Tech Stack:** Next.js16, React19, Drizzle/PostgreSQL, Vitest/PGlite, Playwright.

**Spec:** docs/superpowers/specs/2026-11-02-attendance-location-policy-design.md

## Global Constraints

- No configured database migration without specific approval; disposable in-memory migrations are already authorized.
- No .env changes, stock changes, real punches, credential changes, commit or push.
- Admin-only settings, default true, no QR or verification bypass. Missing flag fails closed.

## Review Focus

- Old databases continue to read policies and require location.
- Missing client GPS cannot bypass a newly enabled policy; revision-bound QR rejects stale attempts.
- New and old historical records retain correct location labels regardless of current settings.
- Disabled proximity requests no browser location and stores no fabricated coordinates.
- Enabling attendance without coordinates is allowed only with proximity disabled.

## Task 1: Policy, migration and service

- [x] Add integration tests for default, permissions, branch isolation, off/on punches, proof/QR enforcement, policy races and pre-migration reads; observe RED.
- [x] Add migration0034, schema field/check and disposable fixture migration.
- [x] Add policy selection/readiness helpers, expose flag, enforce current flag and record historical verification state; observe GREEN.

## Task 2: Controls, phone flow and history

- [x] Add UI assertions for disabled proximity and truthful historical labels; observe RED.
- [x] Add admin checkbox and conditional address/radius controls. Skip currentLocation when off; keep proof/QR flow.
- [x] Update phone, QR, onboarding and report wording to reflect optional/current/historical location requirements.
- [x] Verify browser location is not requested when off and server still rejects outside-zone punches when on. Run targeted regression, typecheck, lint and independent review.

## Rollout

- [x] Prepare bounded 0034 runner and verify configured Neon history in a read-only transaction:34 existing entries match; only0034pending; .envunchanged.
- [x] Apply only0034 after specific user approval. Preserve default proximity on; do not toggle existing branches, commit or push without instructions.

Verification:68focused tests passed across8files; actual browser flow passed both API-configured and UI-configured settings, recording a UV-verified QR punch without any geolocation call and rejecting an outside-zone punch after restoring proximity. Typecheck and targeted ESLint exit0. Fresh reviewer /root/attendance_location_review found no actionable issues. No configured DB changes performed.

2026-11-02 rollout: user explicitly approved only0034. Guarded Neon apply exit0; existing public-table fingerprints preserved (excluding only the new defaulttrue field), no attendance or stock changes, .envbytes unchanged. Independent read-only verification finds35matching historical entries and no pending0034. Proximity remains enabled. Code is still local; no commit or push performed.
