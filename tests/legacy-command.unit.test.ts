import { it, expect, vi } from "vitest";
import type { Tx } from "../src/db/types";
vi.mock("../src/modules/branches/context", () => ({
  requireOperationalContext: vi.fn(),
}));
import { requireOperationalContext } from "../src/modules/branches/context";
import { claim } from "../src/modules/inventory/service";
it("una baja a personal impide repetir compras y producción antes de consultar el resultado", async () => {
  const insert = vi.fn(),
    select = vi.fn(),
    tx = { insert, select } as unknown as Tx;
  vi.mocked(requireOperationalContext).mockResolvedValue({
    actorId: "actor",
    branchId: "branch",
    timeZone: "UTC",
    role: "staff",
  });
  for (const kind of [
    "production",
    "receive",
    "pay",
    "prep-station",
    "prep-route",
    "sale-table",
    "sale-cancel",
  ]) {
    await expect(
      claim(
        tx,
        { id: "actor", role: "manager", branchId: "branch" },
        kind,
        "request",
        "hash",
        "result",
      ),
    ).rejects.toThrow("permiso vigente");
  }
  expect(insert).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
