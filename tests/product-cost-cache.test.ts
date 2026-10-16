import { expect, it, vi } from "vitest";
import { createProductCostLoader } from "../src/components/catalog/product-cost-cache";
import type { ProductCost } from "../src/modules/catalog/product-cost-model";

const response = (ids: string[]) => ({
  branchName: "Barra",
  products: ids.map((productId) => ({ productId, min: "1" }) as ProductCost),
});

it("reutiliza costos al filtrar, reordenar y volver a mostrar productos", async () => {
  const fetcher = vi.fn(async (ids: string[]) => response(ids));
  const load = createProductCostLoader(fetcher);
  await load(["a", "b"]);
  await load(["b"]);
  await load(["b", "a"]);
  await load(["a", "c"]);
  expect(fetcher.mock.calls).toEqual([[["a", "b"]], [["c"]]]);
});

it("comparte solicitudes pendientes entre consumidores", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<ReturnType<typeof response>>((resolve) => {
        finish = resolve;
      }),
  );
  const load = createProductCostLoader(fetcher);
  const first = load(["a"]);
  const second = load(["a"]);
  finish(response(["a"]));
  expect(await first).toEqual(await second);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("una nueva generación consulta datos frescos y los errores permiten reintentar", async () => {
  const fetcher = vi.fn(async (ids: string[]) => response(ids));
  fetcher.mockRejectedValueOnce(new Error("Sin conexión"));
  const load = createProductCostLoader(fetcher);
  await expect(load(["a"])).rejects.toThrow("Sin conexión");
  await load(["a"]);
  await createProductCostLoader(fetcher)(["a"]);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("limita cada solicitud a diez productos", async () => {
  const fetcher = vi.fn(async (ids: string[]) => response(ids));
  const ids = Array.from({ length: 23 }, (_, i) => String(i));
  expect((await createProductCostLoader(fetcher)(ids)).products).toHaveLength(
    23,
  );
  expect(fetcher.mock.calls.map(([batch]) => batch.length)).toEqual([
    10, 10, 3,
  ]);
});
