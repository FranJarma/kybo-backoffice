import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { branches } from "@/db/branch-schema";
import { branchAddresses } from "@/db/branch-address-schema";
import { attendanceSettings } from "@/db/attendance-schema";
import { auditEvents } from "@/db/business-schema";
import { requireAdministrator, requireOperationalContext } from "./context";

export const branchAddressInput = z
  .object({
    address: z.string().trim().min(5).max(500),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    source: z.enum(["photon", "manual"]),
    expectedRevision: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
export type SavedBranchAddress = Omit<
  typeof branchAddresses.$inferSelect,
  "confirmedAt"
> & { confirmedAt: string };
export type BranchAddressSnapshot = {
  ready: boolean;
  address: SavedBranchAddress | null;
};

export async function branchAddressSchemaReady(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.branch_addresses') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
export async function getSavedBranchAddress(db: AppDb | Tx, branchId: string) {
  if (!(await branchAddressSchemaReady(db))) return null;
  const [row] = await db
    .select()
    .from(branchAddresses)
    .where(eq(branchAddresses.branchId, branchId));
  return row ?? null;
}
export async function readBranchAddress(
  db: AppDb,
  actor: Actor,
  branchId: string,
): Promise<BranchAddressSnapshot> {
  await requireAdministrator(db, actor);
  await requireOperationalContext(db, actor, branchId);
  if (!(await branchAddressSchemaReady(db)))
    return { ready: false, address: null };
  const [row] = await db
    .select()
    .from(branchAddresses)
    .where(eq(branchAddresses.branchId, branchId));
  return {
    ready: true,
    address: row
      ? { ...row, confirmedAt: row.confirmedAt.toISOString() }
      : null,
  };
}
export async function saveBranchAddress(
  db: AppDb,
  actor: Actor,
  branchId: string,
  raw: unknown,
): Promise<SavedBranchAddress> {
  const input = branchAddressInput.parse(raw);
  return db.transaction(async (tx) => {
    await requireAdministrator(tx, actor);
    if (!(await branchAddressSchemaReady(tx)))
      throw new AppError(
        "BRANCH_ADDRESS_SETUP",
        "Administración debe completar la activación de direcciones antes de guardar.",
        503,
      );
    const [branch] = await tx
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, branchId), isNull(branches.archivedAt)))
      .for("update");
    if (!branch)
      throw new AppError(
        "BRANCH_UNAVAILABLE",
        "La sucursal no está disponible.",
        409,
      );
    const ctx = await requireOperationalContext(tx, actor, branchId);
    const [policy] = await tx
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.branchId, branchId))
      .for("update");
    const [previous] = await tx
      .select()
      .from(branchAddresses)
      .where(eq(branchAddresses.branchId, branchId));
    if ((previous?.revision ?? 0) !== input.expectedRevision)
      throw new AppError(
        "CONFLICT",
        "La dirección cambió. Actualizá antes de volver a guardar.",
        409,
      );
    const now = new Date();
    const values = {
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      source: input.source,
      revision: (previous?.revision ?? 0) + 1,
      confirmedBy: actor.id,
      confirmedAt: now,
    };
    const [row] = previous
      ? await tx
          .update(branchAddresses)
          .set(values)
          .where(eq(branchAddresses.branchId, branchId))
          .returning()
      : await tx
          .insert(branchAddresses)
          .values({ branchId, ...values })
          .returning();
    if (policy)
      await tx
        .update(attendanceSettings)
        .set({
          latitude: input.latitude,
          longitude: input.longitude,
          revision: policy.revision + 1,
          updatedAt: now,
          updatedBy: actor.id,
        })
        .where(eq(attendanceSettings.branchId, branchId));
    await tx
      .insert(auditEvents)
      .values({
        actorId: ctx.actorId,
        entity: "branch_addresses",
        recordId: branchId,
        action: previous ? "update" : "create",
        before: previous ?? null,
        after: { ...row, branchId },
        createdAt: now,
      });
    return { ...row, confirmedAt: row.confirmedAt.toISOString() };
  });
}
