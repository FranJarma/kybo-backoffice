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

it("agrupa el resumen en lotes de hasta cincuenta productos", async () => {
  const fetcher = vi.fn(async (ids: string[]) => response(ids));
  const ids = Array.from({ length: 73 }, (_, i) => String(i));
  expect((await createProductCostLoader(fetcher)(ids)).products).toHaveLength(
    73,
  );
  expect(fetcher.mock.calls.map(([batch]) => batch.length)).toEqual([50, 23]);
});

it("entrega cada lote listo sin esperar a los demás", async () => {
  const finishes: ((result: ReturnType<typeof response>) => void)[] = [];
  const batches: string[][] = [];
  const fetcher = vi.fn((ids: string[]) => {
    batches.push(ids);
    return new Promise<ReturnType<typeof response>>((resolve) =>
      finishes.push(resolve),
    );
  });
  const onBatch = vi.fn();
  const load = createProductCostLoader(fetcher, onBatch);
  const complete = vi.fn();
  const pending = load(Array.from({ length: 60 }, (_, i) => String(i))).then(
    complete,
  );
  finishes[1](response(batches[1]));
  await vi.waitFor(() => expect(onBatch).toHaveBeenCalledTimes(1));
  expect(onBatch.mock.calls[0][0].products).toHaveLength(10);
  expect(complete).not.toHaveBeenCalled();
  finishes[0](response(batches[0]));
  await pending;
  expect(onBatch).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenCalledTimes(1);
});
