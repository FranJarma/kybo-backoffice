export function comboProgress(
  quantity: number,
  children: {
    quantity: number;
    progress: {
      mode: string;
      completed: number;
      delivered: number;
      cancelled: number;
    };
  }[],
) {
  if (!children.length)
    return { ordered: quantity, completed: 0, delivered: 0, cancelled: 0 };
  const count = (key: "completed" | "delivered" | "cancelled") =>
    Math.min(
      ...children.map((c) => {
        const perCombo = c.quantity / quantity;
        return Math.floor(
          (key === "completed" && c.progress.mode === "direct"
            ? c.progress.delivered
            : c.progress[key]) / perCombo,
        );
      }),
    );
  return {
    ordered: quantity,
    completed: count("completed"),
    delivered: count("delivered"),
    cancelled: count("cancelled"),
  };
}
