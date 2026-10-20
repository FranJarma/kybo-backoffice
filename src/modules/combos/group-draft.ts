import type { ProductGroupDefinition } from "./product-groups";
export type ComboOptionDraft = {
  productId: string;
  name: string;
  counter: string;
  pedidosya: string;
  ubereats: string;
};
export type ComboGroupDraft = {
  draftId?: string;
  name: string;
  quantity: number;
  options: ComboOptionDraft[];
  source?: {
    groupId: string;
    versionId: string;
    revision: number;
    latestRevision: number;
    archived: boolean;
  } | null;
};
export function applyGroupVersion(
  definition: ProductGroupDefinition,
  current?: ComboGroupDraft,
): ComboGroupDraft {
  const existing = new Map(current?.options.map((o) => [o.productId, o]));
  return {
    draftId: current?.draftId,
    name: definition.name,
    quantity: current?.quantity ?? 1,
    source: {
      groupId: definition.id,
      versionId: definition.versionId,
      revision: definition.revision,
      latestRevision: definition.latestRevision,
      archived: !!definition.archivedAt,
    },
    options: definition.options.map((p) => ({
      productId: p.productId,
      name: p.name,
      counter: existing.get(p.productId)?.counter ?? "0",
      pedidosya: existing.get(p.productId)?.pedidosya ?? "0",
      ubereats: existing.get(p.productId)?.ubereats ?? "0",
    })),
  };
}
export function compareGroupVersion(
  current: ComboGroupDraft,
  next: ProductGroupDefinition,
) {
  const oldIds = new Set(current.options.map((o) => o.productId)),
    newIds = new Set(next.options.map((o) => o.productId));
  return {
    renamed: current.name !== next.name,
    added: next.options
      .filter((o) => !oldIds.has(o.productId))
      .map((o) => o.name),
    removed: current.options
      .filter((o) => !newIds.has(o.productId))
      .map((o) => o.name),
  };
}
