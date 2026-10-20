import type { ProductCost } from "@/modules/catalog/product-cost-model";

type Result = { branchName: string; products: ProductCost[] };

// One instance per mounted catalog and data generation, never a global cache.
export function createProductCostLoader(
  fetcher: (ids: string[]) => Promise<Result>,
  onBatch?: (result: Result) => void,
) {
  const entries = new Map<
    string,
    Promise<{ branchName: string; product: ProductCost }>
  >();
  return async (ids: string[]): Promise<Result> => {
    const unique = [...new Set(ids)];
    const missing = unique.filter((id) => !entries.has(id));
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      const request = fetcher(batch).then((result) => {
        onBatch?.(result);
        return result;
      });
      for (const id of batch) {
        const entry = request
          .then((result) => {
            const product = result.products.find((p) => p.productId === id);
            if (!product)
              throw new Error(
                "El producto ya no está disponible. Actualizá la lista.",
              );
            return { branchName: result.branchName, product };
          })
          .catch((error: unknown) => {
            entries.delete(id);
            throw error;
          });
        entries.set(id, entry);
      }
    }
    const values = await Promise.all(unique.map((id) => entries.get(id)!));
    return {
      branchName: values[0]?.branchName ?? "",
      products: values.map((v) => v.product),
    };
  };
}
