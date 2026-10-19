import Link from "next/link";
export function OptionGroupTabs({
  active,
}: {
  active: "modifiers" | "products";
}) {
  return (
    <nav
      aria-label="Tipos de grupos de opciones"
      className="mb-8 flex gap-6 overflow-x-auto border-b border-line"
    >
      {(
        [
          ["modifiers", "/products/modifiers", "Modificadores"],
          ["products", "/products/combo-groups", "Productos para combos"],
        ] as const
      ).map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${active === key ? "border-blue text-blue" : "border-transparent text-muted hover:text-brand"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
