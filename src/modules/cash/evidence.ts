import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { cashPhotos } from "@/db/cash-schema";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "@/modules/operations/types";
import type { CashPosnetClose } from "./types";
export async function claimCashEvidence(
  tx: Tx,
  ctx: OperationalContext,
  sessionId: string,
  posnet: CashPosnetClose,
  now: Date,
) {
  for (const lot of posnet.lots) {
    if (new Date(lot.closedAt).getTime() > now.getTime() + 60000)
      throw new AppError(
        "VALIDATION",
        "La fecha del comprobante no puede ser futura.",
        400,
      );
    const [photo] = await tx
      .select()
      .from(cashPhotos)
      .where(
        and(
          eq(cashPhotos.id, lot.photoId),
          eq(cashPhotos.branchId, ctx.branchId),
          eq(cashPhotos.sessionId, sessionId),
          eq(cashPhotos.creatorId, ctx.actorId),
          isNull(cashPhotos.claimedAt),
        ),
      )
      .for("update");
    if (!photo)
      throw new AppError(
        "PHOTO_UNAVAILABLE",
        "El comprobante no está disponible para esta jornada. Volvé a cargarlo.",
        409,
      );
    await tx
      .update(cashPhotos)
      .set({ claimedAt: now })
      .where(eq(cashPhotos.id, photo.id));
  }
}
