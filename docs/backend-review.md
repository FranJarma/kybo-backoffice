# Backend review — first administration milestone

Reviewed 2026-09-25. Base `422a4e9`; backend head `c2ae45f`. Scope: plan tasks 1–4, backend interfaces, migrations and existing tests. UI, browser flows and the complete operational/POS specification are excluded from this verdict.

## Verdict

The backend substantially meets the approved first administration milestone. No critical or important authorization, transaction, decimal-persistence, stale-write or archival-reference defect was demonstrated. One minor credential-provisioning defect should be corrected. This is not approval for live operation or confirmation of Neon validation.

## Finding

### P3 — Provisioning accepts credentials that the login endpoint rejects

**Location:** `src/lib/auth.ts`, `provisionUser` input validation.

Provisioning enforces a minimum password length of eight but no maximum; the configured Better Auth login has a default maximum of 128. Provisioning also uses a permissive email regular expression, whereas Better Auth login validates with `z.email()`. Consequently the CLI can report successful account creation for an account that cannot sign in using its supplied credentials.

Two isolated reproductions used the real migrated PGlite database, `provisionUser`, `createAuth`, and `auth.handler`:

- A 129-character password: provisioning succeeded; login returned HTTP 400, `PASSWORD_TOO_LONG`.
- `double..dot@example.test` with an otherwise valid password: provisioning succeeded; login returned HTTP 400, `INVALID_EMAIL`.

Use the same normalized email validator and explicit password bounds for provisioning and Better Auth configuration. Add a regression assertion that these inputs fail before creating user/account/operational-user rows. This is an administrative setup correctness issue, not a demonstrated privilege escalation.

## Spec compliance and code quality

- Business data is normalized into PostgreSQL tables with numeric precision, restrictive foreign keys, channel uniqueness, and quantity/cost checks. The same SQL migration is used for local integration tests. Production cannot silently fall back to PGlite.
- HTTP catalog reads and writes resolve sessions and server-owned operational roles; staff lacks catalog permissions. Editable data cannot write identity, role, revision, or marketing consent. Mutations check Origin and JSON input, and catalog error responses avoid echoing SQL/provider details.
- Decimal input parsing preserves absent costs as null, explicit zero as zero, and Argentine decimal/grouping semantics without floating-point persistence. Product channel prices are independent from ingredient costs.
- Writes and audit records share transactions. Updates lock the target row and check its revision. Product price replacement occurs inside that transaction. Parent reference locks serialize presentation creation against archival and ingredient unit changes.
- Existing archived references remain readable and can be retained while editing unrelated presentation fields. New archived references and restoring a presentation with archived parents are rejected. Archival does not delete referenced records.
- The existing tests cover real persistence, rollback on audit failure, stale edits, direct auth behavior, strict fields, consent defaults, decimals, and historical references. Prior reported full-suite/typecheck results were inspected rather than rerun unchanged. Only the two targeted credential reproductions above were executed for this review.

## Limits

PostgreSQL concurrency reasoning was reviewed from lock order and transaction code; simultaneous Neon sessions were not exercised. Production proxy/client-IP forwarding, TLS and credentials still need deployment-specific verification. Browser behavior and task 5 integration require the subsequent full-branch review.
