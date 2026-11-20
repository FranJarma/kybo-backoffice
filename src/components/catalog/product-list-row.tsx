"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ProductPhoto } from "@/components/products/photo";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/number-format";
import type { CatalogRow } from "@/modules/catalog/types";
import { ProductPrices } from "./product-price";

export function ProductListRow({
  row,
  reorderHandle,
  cost,
  actions,
  status,
  style,
}: {
  row: CatalogRow;
  reorderHandle: ReactNode;
  cost: ReactNode;
  actions: ReactNode;
  status: ReactNode;
  style?: CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const channelsId = useId();
  return (
    <article data-catalog-row={row.id} style={style} className="p-4">
      <div className="flex items-center gap-3">
        {reorderHandle}
        <span className="size-12 shrink-0">
          <ProductPhoto
            id={String(row.imageAssetId ?? "") || null}
            name={row.name}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-semibold leading-snug text-brand">
            {row.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="min-w-0 max-w-full break-words">
              {row.categoryName || "Sin categoría"}
            </span>
            {row.archivedAt && status}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Mostrador</dt>
          <dd className="mt-1 text-lg font-bold text-brand tabular-nums">
            {row.priceCounter === null ? (
              <span className="text-sm font-normal text-muted">Sin precio</span>
            ) : (
              money(String(row.priceCounter))
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Costo estimado</dt>
          <dd className="mt-1">{cost}</dd>
        </div>
      </dl>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0 text-sm text-blue hover:text-blue has-[>svg]:px-0"
          aria-expanded={expanded}
          aria-controls={channelsId}
          onClick={() => setExpanded((value) => !value)}
        >
          Otros canales
          <ChevronDown
            aria-hidden="true"
            className={expanded ? "rotate-180" : undefined}
          />
        </Button>
        {actions}
      </div>
      <div id={channelsId} hidden={!expanded}>
        <div className="mt-2 border-t border-line pt-3">
          <ProductPrices
            counter={null}
            pedidosya={row.pricePedidosYa as string | null}
            ubereats={row.priceUberEats as string | null}
            deliveryOnly
          />
        </div>
      </div>
    </article>
  );
}
