type Option = { id: string; name: string; description?: string | null };
export function filterComboboxOptions<T extends Option>(
  options: T[],
  query: string,
  mode: "local" | "remote" = "local",
): T[] {
  if (mode === "remote") return options;
  return options.filter((option) =>
    `${option.name} ${option.description ?? ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
}
