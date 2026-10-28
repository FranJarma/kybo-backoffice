import { afterAll, beforeAll, expect, it } from "vitest";
import sharp from "sharp";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "@/db/client";
import * as s from "@/db/schema";
import { createDataModelTestContext } from "./helpers/data-model-database";
import type { Actor } from "@/lib/access";
import type { PhotoStorage } from "@/modules/media/storage";
import { runCashCommand } from "@/modules/cash/service";
import { recordCashMovement } from "@/modules/cash/integration";
import { requireOperationalContext } from "@/modules/branches/context";
import { uploadCashPhoto, readCashPhoto } from "@/modules/cash/photos";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>,
  sessionId: string,
  image: Buffer;
const actor: Actor = { id: "cash-photo-admin", role: "admin" },
  files = new Map<string, Buffer>();
const storage: PhotoStorage = {
  async put(key, data) {
    files.set(key, data);
  },
  async get(key) {
    const data = files.get(key);
    return data
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        })
      : null;
  },
  async delete(key) {
    files.delete(key);
  },
};
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(s.user)
    .values({ id: actor.id, name: "Foto", email: "photo@test.local" });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  sessionId = (
    await runCashCommand(c.db, actor, uid(), { action: "open", amount: "0.00" })
  ).current!.id;
  image = await sharp({
    create: { width: 600, height: 1200, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
}, 60000);
afterAll(() => c?.close());
it("rejects invalid or oversized files without storing evidence", async () => {
  await expect(
    uploadCashPhoto(
      c.db,
      actor,
      sessionId,
      Buffer.from("not an image"),
      storage,
    ),
  ).rejects.toMatchObject({ code: "PHOTO_FORMAT" });
  await expect(
    uploadCashPhoto(
      c.db,
      actor,
      sessionId,
      Buffer.alloc(10 * 1024 * 1024 + 1),
      storage,
    ),
  ).rejects.toMatchObject({ code: "PHOTO_SIZE" });
  expect(files.size).toBe(0);
});
it("bounds database round trips when attaching evidence without changing the cash session", async () => {
  let statements = 0;
  let persisting = false;
  const locks: string[] = [];
  const measured = drizzle({
    client: c.client,
    schema: s,
    logger: {
      logQuery(sql) {
        statements++;
        if (
          persisting &&
          sql.includes('"branches"') &&
          sql.endsWith("for share")
        )
          locks.push("branch");
        if (persisting && sql.includes("pg_advisory_xact_lock"))
          locks.push("cash");
      },
    },
  }) as unknown as AppDb;
  let photo: Awaited<ReturnType<typeof uploadCashPhoto>> | undefined;
  try {
    photo = await uploadCashPhoto(measured, actor, sessionId, image, {
      ...storage,
      async put(key, data) {
        await storage.put(key, data);
        persisting = true;
      },
    });
    expect(statements).toBeLessThanOrEqual(12);
    expect(locks.slice(0, 2)).toEqual(["branch", "cash"]);
  } finally {
    if (photo) {
      await c.db.delete(s.cashPhotos).where(eq(s.cashPhotos.id, photo.id));
      for (const key of files.keys())
        if (key.endsWith(`/${photo.id}.webp`)) files.delete(key);
    }
  }
});
it("rechecks current permission after storage and removes unclaimed evidence on rejection", async () => {
  const before = files.size;
  try {
    await expect(
      uploadCashPhoto(c.db, actor, sessionId, image, {
        ...storage,
        async put(key, data) {
          await storage.put(key, data);
          await c.db
            .update(s.operationalUsers)
            .set({ disabled: true })
            .where(eq(s.operationalUsers.userId, actor.id));
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(files.size).toBe(before);
  } finally {
    await c.db
      .update(s.operationalUsers)
      .set({ disabled: false })
      .where(eq(s.operationalUsers.userId, actor.id));
  }
});
it("keeps a private normalized receipt bound to its branch and session after closing", async () => {
  const photo = await uploadCashPhoto(c.db, actor, sessionId, image, storage);
  expect(photo.url).toBe(
    `/api/cash/photos/${photo.id}?branchId=${actor.branchId}`,
  );
  expect(files.size).toBe(1);
  expect(await readCashPhoto(c.db, actor, photo.id, storage)).not.toBeNull();
  await c.db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, actor, actor.branchId!);
    await recordCashMovement(tx, ctx, {
      kind: "collection",
      amount: "500.00",
      sourceType: "photo-test-payment",
      sourceId: uid(),
      methodKind: "card",
      methodName: "Tarjeta",
      concept: "Venta",
    });
  });
  const [session] = await c.db
    .select()
    .from(s.cashSessions)
    .where(eq(s.cashSessions.id, sessionId));
  await runCashCommand(c.db, actor, uid(), {
    action: "close",
    sessionId,
    expectedRevision: session.revision,
    counted: "0.00",
    withdrawal: "0.00",
    reason: "",
    posnet: {
      mode: "registered",
      lots: [
        {
          number: "382",
          closedAt: new Date().toISOString(),
          operations: 1,
          total: "500.00",
          photoId: photo.id,
        },
      ],
    },
  });
  const [saved] = await c.db
    .select()
    .from(s.cashPhotos)
    .where(eq(s.cashPhotos.id, photo.id));
  expect(saved.claimedAt).not.toBeNull();
  expect(await readCashPhoto(c.db, actor, photo.id, storage)).not.toBeNull();
  await expect(
    uploadCashPhoto(c.db, actor, sessionId, image, storage),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  expect(files.size).toBe(1);
  const other = uid();
  await c.db.insert(s.branches).values({
    id: other,
    code: "PHOTO-OTHER",
    name: "Otra",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  expect(
    await readCashPhoto(c.db, { ...actor, branchId: other }, photo.id, storage),
  ).toBeNull();
});
it("does not attach evidence if the session closes while its image is being stored", async () => {
  const branchId = uid();
  await c.db.insert(s.branches).values({
    id: branchId,
    code: "PHOTO-LATE",
    name: "Foto tardía",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const who = { ...actor, branchId };
  const opened = await runCashCommand(c.db, who, uid(), {
    action: "open",
    amount: "0.00",
  });
  const session = opened.current!;
  const before = files.size;
  await expect(
    uploadCashPhoto(c.db, who, session.id, image, {
      ...storage,
      async put(key, data) {
        await storage.put(key, data);
        await runCashCommand(c.db, who, uid(), {
          action: "close",
          sessionId: session.id,
          expectedRevision: session.revision,
          counted: "0.00",
          withdrawal: "0.00",
          reason: "",
          posnet: { mode: "none", lots: [] },
        });
      },
    }),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  expect(files.size).toBe(before);
  expect(
    await c.db
      .select()
      .from(s.cashPhotos)
      .where(eq(s.cashPhotos.sessionId, session.id)),
  ).toEqual([]);
});
it("adds a missing batch and private photo during review without replacing the original close", async () => {
  const branchId = uid();
  await c.db.insert(s.branches).values({
    id: branchId,
    code: "RECEIPT-REVIEW",
    name: "Revisión",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const who = { ...actor, branchId };
  const opened = await runCashCommand(c.db, who, uid(), {
    action: "open",
    amount: "100.00",
  });
  const session = opened.current!;
  await c.db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, who, branchId);
    await recordCashMovement(tx, ctx, {
      kind: "collection",
      amount: "500.00",
      sourceType: "review-photo-payment",
      sourceId: uid(),
      methodKind: "card",
      methodName: "Tarjeta",
      concept: "Venta",
    });
  });
  const [changed] = await c.db
    .select()
    .from(s.cashSessions)
    .where(eq(s.cashSessions.id, session.id));
  await runCashCommand(c.db, who, uid(), {
    action: "close",
    sessionId: session.id,
    expectedRevision: changed.revision,
    counted: "100.00",
    withdrawal: "0.00",
    reason: "",
    posnet: {
      mode: "pending",
      lots: [],
      reason: "El equipo no tenía conexión",
    },
  });
  const staff: Actor = { id: "pending-photo-staff", role: "staff", branchId };
  await c.db.insert(s.user).values({
    id: staff.id,
    name: "Personal",
    email: "pending-photo-staff@test.local",
  });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: staff.id, role: "staff" });
  await c.db
    .insert(s.branchMemberships)
    .values({ userId: staff.id, branchId, role: "staff" });
  await c.db.insert(s.cashPermissions).values({
    userId: staff.id,
    branchId,
    canClose: true,
    updatedBy: actor.id,
  });
  await expect(
    uploadCashPhoto(c.db, staff, session.id, image, storage),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  const photo = await uploadCashPhoto(c.db, who, session.id, image, storage);
  const reviewed = await runCashCommand(c.db, who, uid(), {
    action: "review",
    sessionId: session.id,
    note: "Se recuperó la conexión y se verificó el ticket",
    posnet: {
      mode: "registered",
      lots: [
        {
          number: "RECUPERADO",
          closedAt: new Date().toISOString(),
          operations: 1,
          total: "500.00",
          photoId: photo.id,
        },
      ],
    },
  });
  expect(reviewed.lastClosed).toMatchObject({
    counted: "100.00",
    fund: "100.00",
    difference: "0.00",
    posnet: { mode: "pending" },
    posnetReview: { mode: "registered", difference: "0.00" },
  });
  expect(await readCashPhoto(c.db, who, photo.id, storage)).not.toBeNull();
});
