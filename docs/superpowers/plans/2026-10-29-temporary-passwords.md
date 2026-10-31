# Temporary passwords and team setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. Steps use checkbox (`- [x]`) syntax for tracking. The human approved the short design and explicitly requested applying this circuit. Continue without another execution-method approval. No merge, production migration or premature employee-password activation.

**Goal:** Provision the requested team without duplicate identities and enforce a 24-hour temporary-password deadline starting at first successful login.

**Architecture:** Add optional per-user password-policy state, verify it at password login and every protected access, and offer a private self-service password change. Existing permanent admin/store credentials stay permanent. Reuse live account administration, attendance participation, Better Auth crypto and idempotency/audit services.

**Tech Stack:** Existing Next16.3.6, React19.3, Better Auth1.7.6, Drizzle/PostgreSQL, Vitest/PGlite. Read installed Next guides before route/UI code.

**Spec:** `docs/superpowers/specs/2026-10-29-temporary-passwords-design.md`, approved by the human.

## Global Constraints

- Deadline is exactly24hours from first correct login, never renewed by sessions/retries; no deadline before that login.
- During the window show a reminder and allow work. At expiry deny login, existing sessions, personal verification and manager authorization.
- Changing password requires current password, a different valid new one, bounded attempts, server-side authorization and revocation of other sessions; audit no credentials.
- No provided credentials in source/docs/logs/Git. Private temporary provisioning input may only live in ignored local files and is removed after verified use.
- Keep Abigail and Ignacio IDs/history; admin password unchanged; preserve Ignacio catalog-management access; station assignment remains daily, no new security roles.
- Neon migration0033 requires new specific approval after implementation/tests. Employee temporary passwords are activated only after enforcement is deployed.
- Preserve ignored other-chat images/manuals. Do not merge production; the human handles merges.

## Review Focus

- Existing session or manager grant survives deadline: reject on every live server access, not only UI/login.
- Two first logins or password reset races: one fixed firstLoginAt and deadline; stale password cannot extend/clear a new policy.
- Wrong/repeated password and reset by another admin: rate-limit without a rolled-back failure count; no password in errors/audits.
- QR return and invitation enrollment after login: preserve allowed internal destination and existing guided enrollment; avoid open redirects.
- New auth queries slow checkout/photo upload: join state to existing operational queries and rerun fixed query budgets.

### Task1: Approved independent QR setup

**Files:** ignored setup helpers and credential file under `.local/`; existing `workplace/service.ts`, `attendance/service.ts` are consumed without source edits.

- [x] Read real accounts/branch, identify admin, Abi and Nacho IDs without password hashes.
- [x] Prepare idempotent local-account creation and own attendance enablement through existing audited services; use generated independent local credential.
- [x] Apply only these authorized changes, verify account restrictions and admin participation, no real attendance events.

### Task2: Temporary policy, issuance and password change

**Files:** new `src/db/password-policy-schema.ts`, `src/modules/password-policy/{service,types}.ts`, `drizzle/0033_temporary_passwords.sql`; modify auth wrapper, user service/validation/types, invitations, context and fixture. Tests `tests/password-policy.integration.test.ts`, `tests/password-policy-http.test.ts`.

**Interfaces:** `passwordPolicyState(db,userId,now?) -> {required:boolean,firstLoginAt:string|null,expiresAt:string|null,blocked:boolean}`; `requirePasswordAccess(db,userId,now?) -> Promise<void>`; `beginTemporaryPasswordLogin(tx,userId,now) -> Promise<state>` under existing account locks; `issueTemporaryPassword(tx,userId,actorId,now) -> Promise<void>`; `changeOwnPassword(db,actor,{currentPassword,newPassword},now?) -> Promise<void>`.

- [x] RED: no deadline until correct login; repeated login preserves exact24hour expiry; expiry equality blocks; successful change clears policy and other sessions; wrong/reused password rejected and throttle persists; reset clears previous first login; admin/store permanent unchanged.
- [x] Implement additive schema/state and helper services using official Better Auth hash/verify and account/policy locks. New temporary issuance is atomic with account updates; existing password state not discarded by a stale reset.
- [x] Extend tracked test fixture to apply0033 in disposable databases only; execute tests GREEN with no Neon URL.
- [x] Wire login finalization with policy state; reject expired before forwarding cookies, recheck policy for existing sessions and all live contexts including manager authorization. Preserve absence compatibility on old databases; no temporary issuance without ready schema.
- [x] Add private GET/POST `/api/account/password` with exact Origin checks, own session, body bound and private/no-store responses. GET exposes own state only; POST changes own password only.
- [x] GREEN HTTP and domain-access tests, including stale Actor/session and revocation races; retain checkout/photo query budgets.

### Task3: Password UI and user administration

**Files:** new `src/components/account/{password-form,password-notice}.tsx`, `/account/password` page; modify login-form, AppShell, PersonalFrame, user manager/types. Tests `tests/password-policy-ui.test.ts`.

- [x] RED: first temporary login preserves QR return and exposes change action; notice shows deadline and mobile layout; blocked state offers admin recovery; own password form labels all required inputs.
- [x] Implement a focused password form with current/new/confirmation and return only to allowed internal paths. No password echo/storage; cancel/continue permitted before expiry.
- [x] Show notice in desktop and personal shells using own private state; administrative form supports marking entered replacement as temporary and displays pending/expired status.
- [x] Run focused UI/auth tests, typecheck and lint. Verify actual browser with disposable data; physical phone is the owner's action.

### Task4: Verification, migration approval and requested accounts

**Files:** test regressions, spec/plan and ignored provisioning helpers.

- [x] Fresh security review of expiry/access/issuance/password changes and fix Important findings with RED/GREEN.
- [x] Focused tests plus checkout/photo/identity/invitation/user regressions, typecheck, lint, production build. Document historical full-suite failures; do not claim physical phone tests.
- [x] Prepare guarded migration0033 only, request specific Neon approval and keep permanent admin/store usable.
- [ ] After schema approval and deployed enforcement, provision/update six personal users exactly as requested with their IDs/roles, preserve admin credential and enable team attendance. Do not guess daily shift assignments or record real punches.
- [ ] Verify requested passwords against stored hashes without outputting them; verify policy pending and unchanged personal histories; remove private provided-password input. Explain owner QR/login steps and exact remaining deployment/input blockers.
