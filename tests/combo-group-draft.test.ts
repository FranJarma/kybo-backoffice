import { expect, it } from "vitest";
import {
  applyGroupVersion,
  compareGroupVersion,
  type ComboGroupDraft,
} from "../src/modules/combos/group-draft";
import type { ProductGroupDefinition } from "../src/modules/combos/product-groups";
const previous: ComboGroupDraft = {
  draftId: "local-first",
  name: "Gaseosa",
  quantity: 2,
  options: [
    {
      productId: "a",
      name: "Pepsi",
      counter: "100",
      pedidosya: "200",
      ubereats: "300",
    },
    {
      productId: "b",
      name: "7up",
      counter: "50",
      pedidosya: "0",
      ubereats: "0",
    },
  ],
};
const next: ProductGroupDefinition = {
  id: "g",
  versionId: "v2",
  name: "Gaseosas",
  revision: 2,
  latestRevision: 2,
  archivedAt: null,
  options: [
    { productId: "a", name: "Pepsi", archived: false },
    { productId: "c", name: "Max", archived: false },
  ],
};
it("preserves local quantities and surcharges when explicitly adopting a shared version", () => {
  const result = applyGroupVersion(next, previous);
  expect(result.quantity).toBe(2);
  expect(result.draftId).toBe(previous.draftId);
  expect(result.options[0]).toEqual(previous.options[0]);
  expect(result.options[1]).toMatchObject({
    productId: "c",
    counter: "0",
    pedidosya: "0",
    ubereats: "0",
  });
  expect(result.source).toMatchObject({
    groupId: "g",
    versionId: "v2",
    revision: 2,
  });
  expect(previous.options).toHaveLength(2);
  expect(previous.name).toBe("Gaseosa");
});
it("shows exactly what changes before adoption, including rename and removed products", () => {
  expect(compareGroupVersion(previous, next)).toEqual({
    renamed: true,
    added: ["Max"],
    removed: ["7up"],
  });
  expect(applyGroupVersion(next).quantity).toBe(1);
});
