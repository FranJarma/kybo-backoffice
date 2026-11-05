type Modifier = {
  optionName: string;
  count: number;
  instruction: string | null;
};

export function PreparationModifiers({
  modifiers,
  quantity,
}: {
  modifiers: Modifier[];
  quantity: number;
}) {
  if (!modifiers.length) return null;
  return (
    <ul
      aria-label="Modificadores"
      className="mt-2 space-y-2 text-sm leading-relaxed"
    >
      {modifiers.map((modifier, index) => (
        <li key={index}>
          <p className="break-words font-semibold text-blue">
            {modifier.optionName}
          </p>
          <p className="font-medium tabular-nums text-brand">
            {`${modifier.count} por unidad${quantity > 1 ? ` · ${modifier.count * quantity} en total` : ""}`}
          </p>
          {modifier.instruction &&
            modifier.instruction !== modifier.optionName && (
              <p className="whitespace-pre-wrap break-words text-muted">
                {modifier.instruction}
              </p>
            )}
        </li>
      ))}
    </ul>
  );
}
