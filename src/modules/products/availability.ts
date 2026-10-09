type CommercialProduct = {
  archivedAt: unknown;
  enabledCounter: boolean;
  enabledPedidosYa: boolean;
  enabledUberEats: boolean;
};
export function channelEnabled(p: CommercialProduct, channel: string) {
  return channel === "counter"
    ? p.enabledCounter
    : channel === "pedidosya"
      ? p.enabledPedidosYa
      : channel === "ubereats"
        ? p.enabledUberEats
        : false;
}
export function canSellProduct(
  p: CommercialProduct,
  local: { enabled: boolean; temporarilySoldOut: boolean } | undefined,
  channel: string,
) {
  return (
    !p.archivedAt &&
    channelEnabled(p, channel) &&
    !!local?.enabled &&
    !local.temporarilySoldOut
  );
}
