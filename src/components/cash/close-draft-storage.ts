import { z } from "zod";
import type { CloseDraft } from "./draft";
import { cashPhotoUrl } from "./shared";

const text = z.string().max(4000);
const savedClose = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1).max(200),
  draft: z.object({
    recordUnexpectedLot: z.boolean().optional(),
    counted: text,
    withdrawal: text,
    reason: text,
    mode: z.enum(["registered", "pending"]),
    posnetReason: text,
    lots: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          number: text,
          closedAt: text,
          operations: text,
          total: text,
          photo: z.object({ id: z.string().min(1).max(200) }).nullable(),
        }),
      )
      .max(50),
  }),
});

export function closeDraftKey(actorId: string, branchId: string) {
  return `kybo:cash-close:v1:${JSON.stringify([actorId, branchId])}`;
}

export function readCloseDraft(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  sessionId: string | null,
  branchId: string,
): CloseDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    if (raw.length > 200_000) throw Error("Borrador demasiado grande");
    const saved = savedClose.parse(JSON.parse(raw));
    if (saved.sessionId === sessionId)
      return {
        ...saved.draft,
        lots: saved.draft.lots.map((lot) => ({
          ...lot,
          photo: lot.photo
            ? { id: lot.photo.id, url: cashPhotoUrl(lot.photo.id, branchId) }
            : null,
        })),
      };
  } catch {
    // Invalid browser data is never used to construct a cash command.
  }
  storage.removeItem(key);
  return null;
}

export function writeCloseDraft(
  storage: Pick<Storage, "setItem">,
  key: string,
  sessionId: string,
  draft: CloseDraft,
) {
  // Parse strips unrecognized fields, including any temporary upload data.
  const saved = savedClose.parse({ version: 1, sessionId, draft });
  storage.setItem(key, JSON.stringify(saved));
}
