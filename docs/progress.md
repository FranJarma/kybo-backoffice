# Execution ledger — plan: docs/superpowers/plans/2026-09-25-base-operativa.md

Authorization: user explicitly requested continuing development after design; implement reversible work locally. No publishing or real-data migration.
Ruling: first deliverable is administration, not the operational POS release — foundations are independently testable; Fudo remains needed until POS and cutover validation.
Ruling: Drizzle replaces the spec's proposed Prisma — same required Next/TS/Neon/Shadcn stack, with portable PostgreSQL tests; changing ORM later requires repository-layer work.
Ruling: a new independent repository on feat/foundation provides isolation; no mutation of the original Sites repository.
Preflight: task 1 AppDb -> tasks 2/3/4 agrees; task 2 Actor -> task 3 access agrees; task 3 CRUD -> task 4 entities and task 5 HTTP agrees; task 4 channel-price fields -> UI agree.
Implementation split: src/db/auth-schema.ts and business-schema.ts are re-exported by schema.ts to keep independent ownership. Task 5 UI can proceed against fixed HTTP contracts while backend tests run. Root integrates and verifies all parts before completion.

Task 1: complete — c2ae45f, shared SQL migration exercised by PGlite tests, FK and numeric checks verified; production connection targets PostgreSQL through pg. No Neon credentials available or requested in chat.
Task 2: complete — c2ae45f/ed7d78a, actual Better Auth sign-in, private sessions, role/disabled checks, origin gate and durable rate limiting. Provisioning policy aligned with Better Auth after two red regressions.
Task 3: complete — c2ae45f, durable CRUD, revision conflicts, archive/restore and audit rollback verified.
Task 4: complete — c2ae45f, unknown vs zero costs, independent prices, purchase quantities and archived-reference protections verified.
Task 5: complete — responsive interface, final integrated checks and independent review closure recorded in docs/verification.md and docs/final-review.md.

Verification: latest domain/auth/origin run has 39 passing tests across 5 files. Initial production build passed; final integrated run follows UI regressions.
Review corrections: credential policy, failed logout feedback, implicit Enter selecting Cancelar, and trusted-origin consistency. Each correction has a focused regression.
Local browser setup: standard browser CDN download returned invalid archives in this environment; Chromium was obtained through the npm-distributed @sparticuz package in temporary tooling. No browser binary is shipped with the project.
Local compatibility: explicit localhost dev origin, an isolated .next-e2e output, webpack for the managed browser test server, and external PGlite assets avoid dev bundler/cache failures. Neon runtime remains the node-postgres driver.

Final gate 2026-09-25: 39 tests across 5 files passed; 7 browser flows passed. After the visual Card correction, supplier/mobile checks passed (2), then mobile capture passed (1). Final root format, unit suite, production build, lint, typecheck and git diff --check all exited 0. Independent review closed every scoped finding. Screenshots inspected at desktop and 390px mobile widths; copies are in docs/previews. No Neon connection, deployment, source-data import or live-store cutover was performed.
