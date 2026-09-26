# Database and authentication implementation report

## Delivered contracts

- `getDb(): Promise<AppDb>` selects PostgreSQL from `DATABASE_URL`. An explicit `KYBO_LOCAL_DB` path selects PGlite only outside production. Without either configuration it fails, and production never silently uses PGlite. The connection promise is held on `globalThis` so Next development module reloads reuse the same embedded database handle. `closeDb()` supports CLI shutdown.
- `createTestDb()` creates a fresh in-memory PGlite instance and applies the same versioned `drizzle/` migration as the application. It returns `{ db, close }` and does not seed operational users.
- `schema.ts` re-exports `auth-schema.ts` and `business-schema.ts`. Better Auth tables are `user`, `session`, `account`, `verification`, and `rate_limit`. `operational_users` stores a server-owned enum role plus a disabled flag separately from editable Better Auth profile fields.
- `getAuth()` configures Better Auth 1.7.6 with the official Drizzle adapter, email/password, no public signup, required secret and base URL, secure cookies in production, trusted origins, and a database-backed rate limit of five sign-in requests per minute. `requireActor()` fetches the current operational role and disabled state from the database for every request. Missing or disabled users receive 401; staff and unexpected role values receive 403 from `requireCatalogAccess()`.
- The auth API route applies an exact Origin allowlist to every non-GET request and `private, no-store` responses. This additional gate was necessary: in the integration test, Better Auth's direct handler returned 200 for a cross-origin sign-in POST even with `trustedOrigins` configured. The route wrapper returns 403 and does not create a session.
- `provisionUser()` inserts the user, official Better Auth password hash, credential account and operational role in one transaction. `scripts/create-user.ts` requires name, email, role and an ephemeral `KYBO_NEW_USER_PASSWORD` environment variable; rejects positional passwords and sanitizes errors. It does not expose a public account-creation endpoint.

## Verification

- `npm test -- tests/auth.test.ts tests/access.test.ts`: 2 files, 10 tests passed. The authentication tests use a real migrated PGlite database and exercise invalid passwords, persisted rate-limit counters, cross-origin rejection, valid session lookup, immediate disabled-user denial, public signup denial, and self-update role isolation.
- `npm test`: 4 files, 37 tests passed after provisioning validation regression tests.
- `npm run typecheck`: exit 0 after the integration files settled.
- `npm run lint`: exit 0 with one warning in preexisting `postcss.config.mjs` (`import/no-anonymous-default-export`).
- Isolated CLI smoke test ran `node --import tsx scripts/migrate.ts` and `node --import tsx scripts/create-user.ts` with generated temporary credentials against an isolated PGlite directory: both exited 0; directory removed after test.

## Integration notes

- Root owns generation of `drizzle/0000_awesome_warlock.sql` after both schemas landed. The auth migration creates the relevant tables and constraints.
- In this execution sandbox, the `tsx` executable used by the current npm script fails while opening `/tmp/tsx-0/*.pipe` with `EPERM`. Invoking `node --import tsx scripts/...` worked. The package scripts should use this invocation for `db:migrate` and `user:create`.
- The CLI reads `.env` through `dotenv/config` or exported process environment. It does not load `.env.local` automatically.
- Provisioning now matches Better Auth's sign-in checks: Zod `z.email()` validation and explicit 8–128 character password bounds. Regression tests first demonstrated that a 129-character password and `a..b@example.test` were previously accepted into unusable accounts; both now fail with `INVALID_INPUT` before a user row is written.
- The local PGlite and Node PostgreSQL drivers share Drizzle's PostgreSQL query API, but `AppDb` is the Node PostgreSQL type and local PGlite is cast to that API. Integration was tested on PGlite, not Neon.
