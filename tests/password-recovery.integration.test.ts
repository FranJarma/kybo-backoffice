import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import {
  account,
  operationalUsers,
  session,
  user,
  userPasswordPolicies,
  userInvitations,
  workplaceStoreAccounts,
  passwordRecoveryChallenges,
  passwordRecoveryLimits,
} from "@/db/schema";
import { createAttendanceContext, testPassword } from "./helpers/attendance";
import {
  getRecoveryContact,
  saveRecoveryContact,
} from "@/modules/password-recovery/contacts";
import { createRecoveryService } from "@/modules/password-recovery/service";
import {
  issueTemporaryPassword,
  beginTemporaryPasswordLogin,
  passwordPolicyState,
} from "@/modules/password-policy/service";
import * as authModule from "@/lib/auth";
import * as databaseModule from "@/db/client";
import { PUT as updateBranchAccess } from "@/app/api/branches/[id]/members/route";

const config = {
  secret: "test-only-password-recovery-private-key-32",
  accessToken: "not-used",
  phoneNumberId: "123456789012345",
  apiVersion: "v25.0",
  templateName: "test_recovery",
  language: "es_AR",
};
let c: Awaited<ReturnType<typeof createAttendanceContext>>;
let originalHash: string;
let now: Date;
let deliveries: { recipient: string; code: string }[];
const makeService = (fails = false) =>
  createRecoveryService(
    c.db,
    config,
    {
      sendCode: async (message: { recipient: string; code: string }) => {
        if (fails) throw new Error("secret provider error");
        deliveries.push(message);
      },
    },
    () => now,
  );
beforeAll(async () => {
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-only-user-administration-secret-32-characters",
  );
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  c = await createAttendanceContext(undefined, {
    attendanceAccess: true,
    passwordPolicy: true,
  });
  await c.client.exec(
    await readFile("drizzle/0036_whatsapp_password_recovery.sql", "utf8"),
  );
  originalHash = (
    await c.db
      .select()
      .from(account)
      .where(eq(account.userId, c.actors.staff.id))
  )[0].password!;
}, 60000);
afterAll(async () => {
  await c?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  now = new Date("2026-11-05T18:00:00Z");
  deliveries = [];
  await c.db.execute(
    sql`truncate password_recovery_challenges, password_recovery_limits, password_recovery_contacts`,
  );
  await c.db.delete(userPasswordPolicies);
  await c.db
    .delete(userInvitations)
    .where(eq(userInvitations.userId, c.actors.staff.id));
  await c.db
    .delete(workplaceStoreAccounts)
    .where(eq(workplaceStoreAccounts.userId, c.actors.staff.id));
  await c.db
    .update(account)
    .set({ password: originalHash, updatedAt: now })
    .where(eq(account.userId, c.actors.staff.id));
  await c.db
    .update(operationalUsers)
    .set({ disabled: false, updatedAt: now })
    .where(eq(operationalUsers.userId, c.actors.staff.id));
  await c.db
    .update(user)
    .set({ username: "recovery_staff", updatedAt: now })
    .where(eq(user.id, c.actors.staff.id));
  await saveRecoveryContact(c.db, c.actors.admin, c.actors.staff.id, {
    phone: "+5491100000001",
    enabled: true,
    confirmed: true,
    version: null,
  });
});
const start = async (
  service = makeService(),
  identifier = "recovery_staff",
) => {
  const result = await service.request(identifier, "test-client");
  await result.deliver();
  return { service, result, code: deliveries.at(-1)?.code ?? "000000" };
};

it("completes a recovery, revokes every session and cannot reuse the grant", async () => {
  await c.db
    .insert(session)
    .values({
      id: "recovery-old-session",
      userId: c.actors.staff.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(+now + 86400000),
    })
    .onConflictDoNothing();
  const { service, result, code } = await start();
  expect(deliveries[0].recipient).toBe("+5491100000001");
  const grant = await service.verify(result.challengeId, code, "test-client");
  await service.reset(
    result.challengeId,
    grant.token,
    "A-different-password-123!",
    "test-client",
  );
  const changed = (
    await c.db
      .select()
      .from(account)
      .where(eq(account.userId, c.actors.staff.id))
  )[0];
  expect(
    await verifyPassword({
      hash: changed.password!,
      password: "A-different-password-123!",
    }),
  ).toBe(true);
  expect(
    await verifyPassword({ hash: changed.password!, password: testPassword }),
  ).toBe(false);
  expect(
    await c.db
      .select()
      .from(session)
      .where(eq(session.userId, c.actors.staff.id)),
  ).toHaveLength(0);
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Another-password-456!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("has the same public request shape for unknown and disabled accounts", async () => {
  const service = makeService();
  const real = await service.request("recovery_staff", "test-client");
  await c.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, c.actors.staff.id));
  const disabled = await service.request("recovery_staff", "test-client");
  const unknown = await service.request("not_a_real_account", "test-client");
  const publicPart = (response: typeof real) =>
    Object.fromEntries(
      Object.entries(response).filter(
        ([field]) => field !== "challengeId" && field !== "deliver",
      ),
    );
  expect(publicPart(real)).toEqual(publicPart(disabled));
  expect(publicPart(real)).toEqual(publicPart(unknown));
  await disabled.deliver();
  await unknown.deliver();
  expect(deliveries).toHaveLength(0);
});
it("persists five wrong attempts instead of rolling their counter back", async () => {
  const { service, result, code } = await start();
  const wrong = code === "000000" ? "111111" : "000000";
  for (let n = 0; n < 5; n++)
    await expect(
      service.verify(result.challengeId, wrong, "test-client"),
    ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await expect(
    service.verify(result.challengeId, code, "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("cannot use an expired code, including the exact expiry boundary", async () => {
  const { service, result, code } = await start();
  now = new Date(+now + 300000);
  await expect(
    service.verify(result.challengeId, code, "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("never accepts a code if provider delivery failed", async () => {
  const { service, result } = await start(makeService(true));
  await expect(
    service.verify(result.challengeId, "000000", "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  expect(deliveries).toHaveLength(0);
});
it("requires administrative contact confirmation and enforces optimistic revisions", async () => {
  const contact = await getRecoveryContact(
    c.db,
    c.actors.admin,
    c.actors.staff.id,
  );
  await expect(
    saveRecoveryContact(c.db, c.actors.manager, c.actors.staff.id, {
      phone: "+5491100000002",
      enabled: true,
      confirmed: true,
      version: contact.version,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    saveRecoveryContact(c.db, c.actors.admin, c.actors.staff.id, {
      phone: "+5491100000002",
      enabled: true,
      confirmed: false,
      version: contact.version,
    }),
  ).rejects.toThrow();
  await expect(
    saveRecoveryContact(c.db, c.actors.admin, c.actors.staff.id, {
      phone: "+5491100000002",
      enabled: true,
      confirmed: true,
      version: null,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("rejects a grant after its contact changes", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  const contact = await getRecoveryContact(
    c.db,
    c.actors.admin,
    c.actors.staff.id,
  );
  await saveRecoveryContact(c.db, c.actors.admin, c.actors.staff.id, {
    phone: "+5491100000002",
    enabled: true,
    confirmed: true,
    version: contact.version,
  });
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Different-password-789!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("resolves a temporary password even when its first-login deadline expired", async () => {
  await c.db.transaction((tx) =>
    issueTemporaryPassword(
      tx,
      c.actors.staff.id,
      c.actors.admin.id,
      new Date(+now - 86400001),
    ),
  );
  await c.db.transaction((tx) =>
    beginTemporaryPasswordLogin(
      tx,
      c.actors.staff.id,
      new Date(+now - 86400001),
    ),
  );
  expect(
    (await passwordPolicyState(c.db, c.actors.staff.id, now)).blocked,
  ).toBe(true);
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  await service.reset(
    result.challengeId,
    grant.token,
    "My-new-password-789!",
    "test-client",
  );
  expect(await passwordPolicyState(c.db, c.actors.staff.id, now)).toMatchObject(
    { required: false, blocked: false },
  );
});
it("does not deliver twice if the same post-response job runs twice", async () => {
  const service = makeService(),
    result = await service.request("recovery_staff", "test-client");
  await result.deliver();
  await result.deliver();
  expect(deliveries).toHaveLength(1);
});
it("waits 60 seconds to resend, rotates the code and invalidates an earlier grant", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  now = new Date(+now + 59999);
  await (await service.request("recovery_staff", "test-client")).deliver();
  expect(deliveries).toHaveLength(1);
  now = new Date(+now + 1);
  const next = await service.request("recovery_staff", "test-client");
  await next.deliver();
  expect(deliveries).toHaveLength(2);
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Other-new-password-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await expect(
    service.verify(result.challengeId, code, "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("limits actual emissions by account even when switching between username and email", async () => {
  const service = makeService();
  for (let n = 0; n < 4; n++) {
    const request = await service.request(
      n % 2 ? `${c.actors.staff.id}@test.local` : "recovery_staff",
      "test-client",
    );
    await request.deliver();
    now = new Date(+now + 60000);
  }
  expect(deliveries).toHaveLength(3);
});
it("limits anonymous requests without relying on the existence of a user", async () => {
  const service = makeService();
  for (let n = 0; n < 10; n++)
    await service.request(`unknown-${n}`, "test-client");
  await expect(
    service.request("unknown-final", "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_RATE_LIMIT" });
  const rows = await c.db.select().from(passwordRecoveryLimits);
  expect(JSON.stringify(rows)).not.toContain("unknown-");
});
it("caps requests globally across clients and starts a fresh window at the boundary", async () => {
  const service = makeService();
  for (let n = 0; n < 100; n++)
    await service.request(`unknown-global-${n}`, `client-${n}`);
  await expect(
    service.request("unknown-global-over-limit", "client-other"),
  ).rejects.toMatchObject({ code: "RECOVERY_RATE_LIMIT" });
  now = new Date(+now + 60000);
  await expect(
    service.request("unknown-global-next-window", "client-next"),
  ).resolves.toHaveProperty("challengeId");
});
it("does not persist codes, reset grants or provider credentials in challenges or audit", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  const [row] = await c.db
    .select()
    .from(passwordRecoveryChallenges)
    .where(eq(passwordRecoveryChallenges.id, result.challengeId));
  expect(row.codeDigest).toHaveLength(64);
  expect(row.grantDigest).toHaveLength(64);
  expect(JSON.stringify(row)).not.toContain(JSON.stringify(code));
  expect(JSON.stringify(row)).not.toContain(grant.token);
  expect(JSON.stringify(row)).not.toContain(config.secret);
  await service.reset(
    result.challengeId,
    grant.token,
    "Safe-new-password-123!",
    "test-client",
  );
  const audit = await c.db.execute(
    sql`select after from audit_events where entity='password-recovery' and record_id=${result.challengeId}`,
  );
  expect(JSON.stringify(audit.rows)).not.toMatch(
    /5491100000001|Safe-new-password|fake-private|codeDigest|grantDigest/,
  );
});
it("expires a reset grant at its exact five-minute boundary", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  now = new Date(+now + 300000);
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Another-new-password-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("never uses a proof twice or accepts a fabricated grant", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  await expect(
    service.verify(result.challengeId, code, "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await expect(
    service.reset(
      result.challengeId,
      "z".repeat(43),
      "Another-new-password-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await service.reset(
    result.challengeId,
    grant.token,
    "Another-new-password-123!",
    "test-client",
  );
});
it("rejects the current password but allows choosing another with the same valid grant", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  await expect(
    service.reset(result.challengeId, grant.token, testPassword, "test-client"),
  ).rejects.toMatchObject({ code: "PASSWORD_REUSED" });
  await service.reset(
    result.challengeId,
    grant.token,
    "Valid-alternative-password-123!",
    "test-client",
  );
});
it("invalidates an issued grant if credentials or operational access changed", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  await c.db
    .update(account)
    .set({ password: "a-replaced-credential-hash" })
    .where(eq(account.userId, c.actors.staff.id));
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Another-new-password-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await c.db
    .update(account)
    .set({ password: originalHash })
    .where(eq(account.userId, c.actors.staff.id));
  await c.db
    .update(operationalUsers)
    .set({ disabled: true, updatedAt: new Date(+now + 1) })
    .where(eq(operationalUsers.userId, c.actors.staff.id));
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Another-new-password-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  await c.db
    .update(operationalUsers)
    .set({ disabled: false, updatedAt: new Date(+now + 2) })
    .where(eq(operationalUsers.userId, c.actors.staff.id));
  await expect(
    service.reset(
      result.challengeId,
      grant.token,
      "Another-new-password-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("does not recover a shared store account or accept its phone configuration", async () => {
  await c.db.insert(workplaceStoreAccounts).values({
    userId: c.actors.staff.id,
    branchId: c.branchId,
    createdBy: c.actors.admin.id,
  });
  const { service, result } = await start();
  expect(deliveries).toHaveLength(0);
  await expect(
    service.verify(result.challengeId, "123456", "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  const contact = await getRecoveryContact(
    c.db,
    c.actors.admin,
    c.actors.staff.id,
  );
  await expect(
    saveRecoveryContact(c.db, c.actors.admin, c.actors.staff.id, {
      phone: "+5491100000002",
      enabled: true,
      confirmed: true,
      version: contact.version,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("does not bypass a pending invitation", async () => {
  await c.db.insert(userInvitations).values({
    userId: c.actors.staff.id,
    tokenHash: crypto.randomUUID(),
    generation: crypto.randomUUID(),
    branchId: c.branchId,
    expiresAt: new Date(+now + 86400000),
    createdBy: c.actors.admin.id,
  });
  const { service, result } = await start();
  expect(deliveries).toHaveLength(0);
  await expect(
    service.verify(result.challengeId, "123456", "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  expect(
    (
      await c.db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.userId, c.actors.staff.id))
    )[0].activatedAt,
  ).toBeNull();
});
it("does not send to an unconfirmed or disabled contact and disallows shared recovery numbers", async () => {
  await expect(
    saveRecoveryContact(c.db, c.actors.admin, c.actors.manager.id, {
      phone: "+5491100000001",
      enabled: true,
      confirmed: true,
      version: null,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const contact = await getRecoveryContact(
    c.db,
    c.actors.admin,
    c.actors.staff.id,
  );
  await saveRecoveryContact(c.db, c.actors.admin, c.actors.staff.id, {
    phone: contact.phone,
    enabled: false,
    confirmed: false,
    version: contact.version,
  });
  await start();
  expect(deliveries).toHaveLength(0);
});
it("admits exactly one reset when the same grant is submitted concurrently", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  const attempts = await Promise.allSettled([
    service.reset(
      result.challengeId,
      grant.token,
      "Concurrent-password-A-123!",
      "client-a",
    ),
    service.reset(
      result.challengeId,
      grant.token,
      "Concurrent-password-B-123!",
      "client-b",
    ),
  ]);
  expect(
    attempts.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
});
function delayedChallengeService() {
  let transactions = 0;
  const delayed = new Proxy(c.db, {
    get(target, property) {
      if (property === "transaction")
        return (callback: Parameters<typeof c.db.transaction>[0]) => {
          if (++transactions === 2) now = new Date(+now + 300000);
          return target.transaction(callback);
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return createRecoveryService(
    delayed,
    config,
    { sendCode: async () => {} },
    () => now,
  );
}
it("rechecks code expiry after waiting to acquire the challenge transaction", async () => {
  const { result, code } = await start();
  await expect(
    delayedChallengeService().verify(result.challengeId, code, "test-client"),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("rechecks grant expiry after waiting to acquire the challenge transaction", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  await expect(
    delayedChallengeService().reset(
      result.challengeId,
      grant.token,
      "Must-not-be-accepted-123!",
      "test-client",
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
});
it("revokes a recovery grant through actual branch-access revocation and restoration", async () => {
  const { service, result, code } = await start();
  const grant = await service.verify(result.challengeId, code, "test-client");
  const actor = vi
    .spyOn(authModule, "requireActor")
    .mockResolvedValue(c.actors.admin);
  const database = vi.spyOn(databaseModule, "getDb").mockResolvedValue(c.db);
  try {
    for (const revoked of [true, false]) {
      const request = new Request(
        `http://localhost:3000/api/branches/${c.branchId}/members`,
        {
          method: "PUT",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: c.actors.staff.id,
            role: "staff",
            revoked,
          }),
        },
      );
      expect(
        (
          await updateBranchAccess(request, {
            params: Promise.resolve({ id: c.branchId }),
          })
        ).status,
      ).toBe(200);
    }
    await expect(
      service.reset(
        result.challengeId,
        grant.token,
        "Must-not-survive-access-revocation-123!",
        "test-client",
      ),
    ).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  } finally {
    actor.mockRestore();
    database.mockRestore();
  }
});
