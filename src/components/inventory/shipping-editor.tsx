"use client";
import { allocateShipping } from "@/modules/inventory/shipping";
import {
  cents,
  decimal,
  integer,
  roundedDivision,
} from "@/modules/inventory/decimal";
import { Input } from "@/components/ui/input";
import { money, SearchSelect } from "./shared";
export type ShippingDraft = {
  amount: string;
  recipient: "supplier" | "carrier";
  carrierId: string;
  carrierName: string;
  allocation: "value" | "manual";
  amounts: string[];
};
export const blankShipping = (): ShippingDraft => ({
  amount: "",
  recipient: "supplier",
  carrierId: "",
  carrierName: "",
  allocation: "value",
  amounts: [],
});
type Line = {
  quantity: string;
  unitPrice: string;
  discount: string;
  item?: { name: string };
};
export function shippingPreview(lines: Line[], draft: ShippingDraft) {
  const net = lines.map((line) => {
    const price = decimal(line.unitPrice.trim(), 6, false);
    const discount = integer(decimal(line.discount.trim() || "0", 2)!);
    if (price === null) {
      if (discount)
        throw new Error("No podés descontar de un precio pendiente.");
      return null;
    }
    const value =
      roundedDivision(
        integer(decimal(line.quantity, 6, true, true)!) * integer(price),
        10n ** 10n,
      ) - discount;
    if (value < 0n)
      throw new Error("El descuento supera el importe del artículo.");
    return value;
  });
  const cost = integer(decimal(draft.amount.trim() || "0", 2)!);
  const allocations = allocateShipping(
    cost,
    net,
    cost > 0n && draft.allocation === "manual"
      ? lines.map((_, i) => integer(decimal(draft.amounts[i] || "0", 2)!))
      : undefined,
  );
  const total = net.some((v) => v === null)
    ? null
    : net.reduce<bigint>((a, b) => a + b!, 0n);
  return {
    cost,
    net,
    allocations,
    total,
    landed: total === null ? null : total + cost,
  };
}
export function ShippingEditor({
  lines,
  draft,
  onChange,
  supplierName,
  readOnly = false,
}: {
  lines: Line[];
  draft: ShippingDraft;
  onChange: (v: ShippingDraft) => void;
  supplierName: string;
  readOnly?: boolean;
}) {
  let preview: ReturnType<typeof shippingPreview> | undefined,
    error = "";
  try {
    preview = shippingPreview(lines, draft);
  } catch (e) {
    error = e instanceof Error ? e.message : "Revisá los importes.";
  }
  let hasCost = false;
  try {
    hasCost = integer(decimal(draft.amount.trim() || "0", 2)!) > 0n;
  } catch {
    /* The preview displays the input error. */
  }
  return (
    <section
      className="space-y-5 rounded-xl border border-line bg-white p-5 sm:p-6"
      aria-label="Envío y costo final"
    >
      <div>
        <h2 className="text-lg font-bold text-brand">Envío y costo final</h2>
        <p className="mt-1 text-sm text-muted">
          El envío se suma al costo del inventario y conserva el precio original
          de la mercadería.
        </p>
      </div>
      {!readOnly && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Costo de envío (ARS)
            <Input
              className="mt-2"
              inputMode="decimal"
              placeholder="Sin envío: dejá vacío"
              value={draft.amount}
              onChange={(e) => onChange({ ...draft, amount: e.target.value })}
            />
          </label>
          {hasCost && (
            <>
              <label className="text-sm font-medium">
                Quién cobra el envío
                <select
                  className="form-control mt-2"
                  value={draft.recipient}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      recipient: e.target.value as ShippingDraft["recipient"],
                    })
                  }
                >
                  <option value="supplier">El proveedor de mercadería</option>
                  <option value="carrier">
                    Otro proveedor / transportista
                  </option>
                </select>
              </label>
              {draft.recipient === "carrier" && (
                <SearchSelect
                  entity="suppliers"
                  label="Transportista"
                  value={draft.carrierId}
                  onChange={(id, row) =>
                    onChange({
                      ...draft,
                      carrierId: id,
                      carrierName: row?.name ?? "",
                    })
                  }
                  required
                />
              )}
              <label className="text-sm font-medium">
                Reparto del envío
                <select
                  className="form-control mt-2"
                  value={draft.allocation}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      allocation: e.target.value as ShippingDraft["allocation"],
                      amounts:
                        preview?.allocations.map((v) =>
                          cents(v).replace(".", ","),
                        ) ?? draft.amounts,
                    })
                  }
                >
                  <option value="value">
                    Automático por valor de mercadería
                  </option>
                  <option value="manual">Asignación manual por artículo</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}
      {hasCost && (
        <>
          <p className="text-sm text-muted">
            Cobra:{" "}
            {draft.recipient === "supplier"
              ? supplierName || "Proveedor de mercadería"
              : draft.carrierName || "Elegí un transportista"}
            . Reparto{" "}
            {draft.allocation === "value"
              ? "proporcional al valor después de descuentos"
              : "manual"}
            .
          </p>
          <div className="space-y-4">
            {lines.map((line, i) => (
              <div
                key={i}
                className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2"
              >
                <span className="text-sm font-medium">
                  {line.item?.name || `Artículo ${i + 1}`}
                </span>
                {!readOnly && draft.allocation === "manual" ? (
                  <label className="text-sm">
                    Envío para {line.item?.name || `artículo ${i + 1}`} (ARS)
                    <Input
                      className="mt-2"
                      inputMode="decimal"
                      value={draft.amounts[i] ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...draft,
                          amounts: lines.map((_, j) =>
                            j === i ? e.target.value : (draft.amounts[j] ?? ""),
                          ),
                        })
                      }
                    />
                  </label>
                ) : (
                  <span className="text-sm">
                    Envío:{" "}
                    {preview ? money(cents(preview.allocations[i])) : "—"}
                  </span>
                )}
                {preview && (
                  <span className="text-sm text-muted sm:col-span-2">
                    Mercadería:{" "}
                    {money(
                      preview.net[i] === null ? null : cents(preview.net[i]!),
                    )}{" "}
                    · Costo final:{" "}
                    {money(
                      preview.net[i] === null
                        ? null
                        : cents(preview.net[i]! + preview.allocations[i]),
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {error && (
        <p role="status" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      {preview && (
        <dl className="grid gap-3 rounded-lg bg-surface p-4 text-sm sm:grid-cols-3">
          <div>
            <dt>Mercadería</dt>
            <dd className="font-semibold">
              {money(preview.total === null ? null : cents(preview.total))}
            </dd>
          </div>
          <div>
            <dt>Envío</dt>
            <dd className="font-semibold">{money(cents(preview.cost))}</dd>
          </div>
          <div>
            <dt>Costo final</dt>
            <dd className="font-semibold">
              {money(preview.landed === null ? null : cents(preview.landed))}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
