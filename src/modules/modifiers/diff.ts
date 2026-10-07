type GroupVersion = {
  name: string;
  options: {
    key: string;
    name: string;
    kind: string;
    instruction: string | null;
    components: {
      itemId: string;
      name: string;
      baseUnit: string;
      quantity: string;
    }[];
  }[];
};
export function diffGroupVersions(
  before: GroupVersion,
  after: GroupVersion,
): string[] {
  const changes: string[] = [];
  if (before.name !== after.name)
    changes.push(`Grupo: ${before.name} → ${after.name}`);
  for (const old of before.options) {
    const next = after.options.find((o) => o.key === old.key);
    if (!next) {
      changes.push(`Retirada: ${old.name}`);
      continue;
    }
    if (old.name !== next.name)
      changes.push(`Opción: ${old.name} → ${next.name}`);
    if (old.kind !== next.kind)
      changes.push(`${next.name}: ${old.kind} → ${next.kind}`);
    if (old.instruction !== next.instruction)
      changes.push(
        `${next.name}: indicación ${old.instruction ?? "sin indicación"} → ${next.instruction ?? "sin indicación"}`,
      );
    for (const id of new Set(
      [...old.components, ...next.components].map((c) => c.itemId),
    )) {
      const a = old.components.find((c) => c.itemId === id),
        b = next.components.find((c) => c.itemId === id);
      if (a?.quantity !== b?.quantity || a?.baseUnit !== b?.baseUnit)
        changes.push(
          `${next.name} · ${b?.name ?? a?.name}: ${a ? `${a.quantity} ${a.baseUnit}` : "sin ingrediente"} → ${b ? `${b.quantity} ${b.baseUnit}` : "sin ingrediente"}`,
        );
    }
  }
  for (const o of after.options)
    if (!before.options.some((p) => p.key === o.key))
      changes.push(`Agregada: ${o.name}`);
  return changes;
}
