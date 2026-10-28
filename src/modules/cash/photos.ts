import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq, isNotNull, or } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { OperationalContext } from "@/modules/operations/types";
import { cashPhotos, cashSessions } from "@/db/cash-schema";
import { branches } from "@/db/branch-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import type { PhotoStorage } from "@/modules/media/storage";
import { authorizeCashCommand, authorizeCashRead } from "./access";
import { cashAvailable, lockCashConfiguration } from "./integration";
export const MAX_CASH_PHOTO_BYTES = 10 * 1024 * 1024;
async function requirePhotoTarget(
  tx: Tx,
  ctx: OperationalContext,
  sessionId: string,
  lock = false,
) {
  const query = tx
    .select()
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.id, sessionId),
        eq(cashSessions.branchId, ctx.branchId),
      ),
    );
  const [session] = await (lock ? query.for("update") : query);
  if (session?.state === "open") {
    await authorizeCashCommand(tx, ctx, { action: "close" });
    return;
  }
  if (
    session?.state === "closed" &&
    session.reviewRequired &&
    !session.reviewedAt &&
    ctx.role !== "staff"
  )
    return;
  throw new AppError(
    "CASH_CLOSED",
    "El comprobante requiere una jornada abierta o un cierre pendiente de revisión por el encargado.",
    409,
  );
}
async function authorizeUpload(db: AppDb, actor: Actor, sessionId: string) {
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    if (!(await cashAvailable(tx)))
      throw new AppError("MIGRATION_REQUIRED", "Falta habilitar Caja.", 409);
    await requirePhotoTarget(tx, ctx, sessionId);
    return ctx;
  });
}
async function normalizeReceipt(raw: Buffer) {
  if (!raw.length || raw.length > MAX_CASH_PHOTO_BYTES)
    throw new AppError("PHOTO_SIZE", "Elegí una foto de hasta 10 MB.", 413);
  try {
    const image = sharp(raw, { limitInputPixels: 40_000_000, animated: true }),
      metadata = await image.metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("invalid image");
    const { data, info } = await image
      .rotate()
      .resize({
        width: 2400,
        height: 4200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new AppError(
      "PHOTO_FORMAT",
      "Usá una foto JPG, PNG o WebP sin animación, de hasta 40 megapíxeles.",
      400,
    );
  }
}
export async function uploadCashPhoto(
  db: AppDb,
  actor: Actor,
  sessionId: string,
  raw: Buffer,
  storage: PhotoStorage,
) {
  const ctx = await authorizeUpload(db, actor, sessionId);
  // Normalize and upload outside the cash transaction: charging never waits for a photo.
  const image = await normalizeReceipt(raw),
    id = randomUUID(),
    key = `cash/${ctx.branchId}/${sessionId}/${id}.webp`;
  await storage.put(key, image.data);
  try {
    await db.transaction(async (tx) => {
      // Keep the branch -> cash lock order used by other operations. Resolve
      // permissions only after any wait for closing or configuration changes.
      await tx
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.id, ctx.branchId))
        .for("share");
      await lockCashConfiguration(tx, ctx.branchId);
      const current = await requireOperationalContext(tx, actor, ctx.branchId);
      await requirePhotoTarget(tx, current, sessionId, true);
      await tx.insert(cashPhotos).values({
        id,
        branchId: ctx.branchId,
        sessionId,
        creatorId: actor.id,
        storageKey: key,
        width: image.width,
        height: image.height,
        bytes: image.data.length,
      });
    });
  } catch (error) {
    try {
      await storage.delete(key);
    } catch {
      /* UUID key identifies an unclaimed provider object if cleanup fails. */
    }
    throw error;
  }
  return { id, url: `/api/cash/photos/${id}?branchId=${ctx.branchId}` };
}
export async function readCashPhoto(
  db: AppDb,
  actor: Actor,
  id: string,
  storage: PhotoStorage,
) {
  const asset = await db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    if (!(await cashAvailable(tx))) return null;
    await authorizeCashRead(tx, ctx);
    const [photo] = await tx
      .select({ storageKey: cashPhotos.storageKey })
      .from(cashPhotos)
      .innerJoin(
        cashSessions,
        and(
          eq(cashSessions.id, cashPhotos.sessionId),
          eq(cashSessions.branchId, cashPhotos.branchId),
        ),
      )
      .where(
        and(
          eq(cashPhotos.id, id),
          eq(cashPhotos.branchId, ctx.branchId),
          or(
            isNotNull(cashPhotos.claimedAt),
            eq(cashPhotos.creatorId, ctx.actorId),
          ),
        ),
      );
    return photo ?? null;
  });
  return asset ? storage.get(asset.storageKey) : null;
}
