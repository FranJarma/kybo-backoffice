import {
  cents,
  integer,
  roundedDivision,
  six,
} from "@/modules/inventory/decimal";
import {
  defaultSelections,
  resolveComposition,
} from "@/modules/recipes/composition";
import type { Configuration } from "@/modules/modifiers/types";
import type { SaleChannel } from "@/modules/sales/types";
import { paymentFee, priceWithVat } from "./amounts";

export const profitabilityChannels = [
  "counter",
  "pedidosya",
  "ubereats",
] as const;
export type ProfitabilityBasis = {
  cost: string | null;
  extras: Partial<Record<SaleChannel, string | null>>;
  labels: string[];
};
export type ProfitabilityData = {
  productId: string;
  vatRate: string | null;
  channels: { id: SaleChannel; enabled: boolean; netBase: string | null }[];
  basis: ProfitabilityBasis;
  groups: {
    id: string;
    name: string;
    quantity: number;
    options: { id: string; name: string; basis: ProfitabilityBasis }[];
  }[];
  methods: { id: string; name: string; percent: string | null }[];
};

/** Matches the published default composition; absent channel prices stay unknown. */
export function referenceBasis(
  cost: string | null,
  config?: Configuration,
): ProfitabilityBasis {
  const selections = config ? defaultSelections(config) : [];
  return {
    cost,
    labels:
      config?.groups.flatMap((g) =>
        g.options
          .filter((o) => o.enabled && o.defaultCount > 0)
          .map((o) => `${o.defaultCount} × ${o.name}`),
      ) ?? [],
    extras: Object.fromEntries(
      profitabilityChannels.map((channel) => {
        try {
          return [
            channel,
            !config || config.model === "legacy"
              ? "0.00"
              : resolveComposition(config, selections, channel).surcharge,
          ];
        } catch {
          return [channel, null];
        }
      }),
    ),
  };
}

/** One item or combo, paid entirely by each method; never modifies its sale price. */
export function estimateProfitability(
  data: ProfitabilityData,
  channel: SaleChannel,
  choices: Record<string, string>,
) {
  const selected: { basis: ProfitabilityBasis; quantity: number }[] = [
    { basis: data.basis, quantity: 1 },
  ];
  let complete = true;
  const labels = [...data.basis.labels];
  for (const group of data.groups) {
    const option = group.options.find(
      (o) => o.id === (choices[group.id] ?? group.options[0]?.id),
    );
    if (!option) {
      complete = false;
      continue;
    }
    selected.push({ basis: option.basis, quantity: group.quantity });
    labels.push(`${group.quantity} × ${option.name}`, ...option.basis.labels);
  }
  const price = data.channels.find((c) => c.id === channel);
  let netPrice: string | null = null;
  let finalPrice: string | null = null;
  let priceError = "";
  if (
    complete &&
    price?.enabled &&
    price.netBase !== null &&
    selected.every((s) => s.basis.extras[channel] != null)
  ) {
    try {
      netPrice = cents(
        selected.reduce(
          (total, s) =>
            total + integer(s.basis.extras[channel]!) * BigInt(s.quantity),
          integer(price.netBase),
        ),
      );
      finalPrice = priceWithVat(netPrice, data.vatRate);
    } catch {
      netPrice = null;
      priceError = "El precio configurado excede el límite permitido.";
    }
  }
  const cost =
    complete && selected.every((s) => s.basis.cost !== null)
      ? six(
          selected.reduce(
            (total, s) => total + integer(s.basis.cost!) * BigInt(s.quantity),
            0n,
          ),
        )
      : null;
  return {
    netPrice,
    finalPrice,
    cost,
    labels,
    priceError,
    methods: data.methods.map((method) => {
      const commission =
        finalPrice === null
          ? null
          : paymentFee(finalPrice, method.percent).commissionAmount;
      let margin: string | null = null;
      if (netPrice !== null && cost !== null && commission !== null) {
        const amount =
          (integer(netPrice) - integer(commission)) * 10000n - integer(cost);
        margin = cents(
          (amount < 0n ? -1n : 1n) *
            roundedDivision(amount < 0n ? -amount : amount, 10000n),
        );
      }
      return { ...method, commission, margin };
    }),
  };
}
