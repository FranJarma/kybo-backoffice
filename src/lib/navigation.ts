export type NavigationAccess = { role: string; catalogManager?: boolean };
export const navigation = [
  {
    id: "home",
    area: "Negocio",
    label: "Inicio",
    href: "/",
    icon: "House",
    access: "manager",
  },
  {
    id: "daily-operations",
    area: "Negocio",
    label: "Operación del día",
    href: "/operations/day",
    icon: "ListChecks",
    access: "all",
  },
  {
    id: "cash",
    area: "Negocio",
    label: "Caja",
    href: "/finance/cash",
    icon: "WalletCards",
    access: "all",
  },
  {
    id: "sales",
    area: "Ventas",
    label: "Punto de venta",
    href: "/sales",
    icon: "Store",
    access: "all",
  },
  {
    id: "tables",
    area: "Ventas",
    label: "Mesas",
    href: "/sales/tables",
    icon: "LayoutGrid",
    access: "all",
    parent: "sales",
  },
  {
    id: "customers",
    area: "Ventas",
    label: "Clientes",
    href: "/sales/customers",
    icon: "Users",
    access: "catalog",
    parent: "sales",
  },
  {
    id: "kitchen",
    area: "Cocina",
    label: "Comandas",
    href: "/kitchen",
    icon: "ListChecks",
    access: "all",
  },
  {
    id: "production",
    area: "Cocina",
    label: "Registro de producción",
    href: "/kitchen/production",
    icon: "ChefHat",
    access: "all",
    parent: "kitchen",
  },
  {
    id: "products",
    area: "Productos",
    label: "Catálogo y precios",
    href: "/products",
    icon: "Package",
    access: "catalog",
  },
  {
    id: "categories",
    area: "Productos",
    label: "Categorías",
    href: "/products/categories",
    icon: "Layers3",
    access: "catalog",
    parent: "products",
  },
  {
    id: "ingredients",
    area: "Productos",
    label: "Ingredientes",
    href: "/products/ingredients",
    icon: "Boxes",
    access: "catalog",
    parent: "products",
  },
  {
    id: "recipes",
    area: "Productos",
    label: "Recetas",
    href: "/products/recipes",
    icon: "ChefHat",
    access: "catalog",
    parent: "products",
  },
  {
    id: "modifiers",
    area: "Productos",
    label: "Grupos de opciones",
    breadcrumb: "Modificadores",
    href: "/products/modifiers",
    icon: "Layers3",
    access: "catalog",
    parent: "products",
  },
  {
    id: "combo-groups",
    area: "Productos",
    label: "Productos para combos",
    href: "/products/combo-groups",
    icon: "Layers3",
    access: "catalog",
    parent: "products",
    sidebar: false,
  },
  {
    id: "inventory",
    area: "Inventario y compras",
    label: "Stock actual",
    href: "/inventory",
    icon: "Warehouse",
    access: "manager",
  },
  {
    id: "items",
    area: "Inventario y compras",
    label: "Insumos y artículos",
    href: "/inventory/items",
    icon: "Boxes",
    access: "catalog",
    parent: "inventory",
  },
  {
    id: "purchases",
    area: "Inventario y compras",
    label: "Compras",
    href: "/inventory/purchases",
    icon: "ShoppingCart",
    access: "manager",
    parent: "inventory",
  },
  {
    id: "replenishment",
    area: "Inventario y compras",
    label: "Mínimos de reposición",
    href: "/inventory/replenishment",
    icon: "ListChecks",
    access: "manager",
    parent: "inventory",
  },
  {
    id: "supply-alerts",
    area: "Inventario y compras",
    label: "Compras anticipadas",
    href: "/inventory/supply-alerts",
    icon: "ShoppingCart",
    access: "manager",
    parent: "inventory",
    sidebar: false,
  },
  {
    id: "presentations",
    area: "Inventario y compras",
    label: "Presentaciones de compra",
    href: "/inventory/presentations",
    icon: "Layers3",
    access: "catalog",
    parent: "inventory",
  },
  {
    id: "suppliers",
    area: "Inventario y compras",
    label: "Proveedores",
    href: "/inventory/suppliers",
    icon: "Truck",
    access: "catalog",
    parent: "inventory",
  },
  {
    id: "transfers",
    area: "Inventario y compras",
    label: "Traslados",
    href: "/inventory/transfers",
    icon: "Truck",
    access: "manager",
    parent: "inventory",
  },
  {
    id: "internal-use",
    area: "Inventario y compras",
    label: "Consumo interno",
    href: "/inventory/internal-use",
    icon: "Boxes",
    access: "manager",
    parent: "inventory",
  },
  {
    id: "expenses",
    area: "Finanzas",
    label: "Gastos del negocio",
    href: "/finance/expenses",
    icon: "WalletCards",
    access: "manager",
  },
  {
    id: "cash-settings",
    area: "Configuración",
    label: "Configuración de caja",
    href: "/settings/cash",
    icon: "WalletCards",
    access: "admin",
  },
  {
    id: "payment-methods",
    area: "Configuración",
    label: "Medios de pago",
    href: "/settings/payment-methods",
    icon: "WalletCards",
    access: "admin",
  },
  {
    id: "users",
    area: "Configuración",
    label: "Usuarios",
    href: "/settings/users",
    icon: "Users",
    access: "admin",
  },
  {
    id: "branches",
    area: "Configuración",
    label: "Sucursales y ubicaciones",
    href: "/settings/branches",
    icon: "Store",
    access: "admin",
  },
] as const;
export type NavigationId = (typeof navigation)[number]["id"];
export function canNavigate(
  entry: (typeof navigation)[number],
  actor: NavigationAccess,
) {
  if (entry.access === "admin") return actor.role === "admin";
  return (
    entry.access === "all" ||
    actor.role === "admin" ||
    actor.role === "manager" ||
    (entry.access === "catalog" && !!actor.catalogManager)
  );
}
export function visibleNavigation(actor: NavigationAccess) {
  return navigation.filter(
    (n) => canNavigate(n, actor) && !("sidebar" in n && !n.sidebar),
  );
}
export function navigationIsActive(href: string, path: string) {
  return (
    href === path ||
    (href === "/products/modifiers" && path === "/products/combo-groups")
  );
}
export function resolveNavigation(path: string) {
  return navigation.find(
    (n) => n.href === path.replace(/\/$/, "") || n.href === path,
  );
}
export const paths = Object.fromEntries(
  navigation.map((n) => [n.id, n.href]),
) as Record<NavigationId, string>;
export type Crumb = { label: string; href?: string };
export function breadcrumbs(path: string, actor: NavigationAccess): Crumb[] {
  const current = resolveNavigation(path);
  if (!current) return [{ label: "Página no encontrada" }];
  if (current.id === "home") return [{ label: current.label }];
  const result: Crumb[] =
    actor.role === "staff" ? [] : [{ label: "Inicio", href: paths.home }];
  if ("parent" in current) {
    const parent = navigation.find((n) => n.id === current.parent)!;
    result.push({
      label: current.area,
      ...(canNavigate(parent, actor) ? { href: parent.href } : {}),
    });
  } else if (current.area === "Configuración")
    result.push({ label: "Configuración" });
  result.push({
    label: "breadcrumb" in current ? current.breadcrumb : current.label,
  });
  return result;
}
export const legacyRedirects = [
  ["recipes", "recipes"],
  ["modifiers", "modifiers"],
  ["production", "production"],
  ["items", "items"],
  ["ingredients", "items"],
  ["purchases", "purchases"],
  ["presentations", "presentations"],
  ["suppliers", "suppliers"],
  ["tables", "tables"],
  ["customers", "customers"],
  ["payment-methods", "payment-methods"],
  ["branches", "branches"],
  ["transfers", "transfers"],
  ["internal-use", "internal-use"],
  ["recipes/modifiers", "modifiers"],
  ["inventory/ingredients", "items"],
].map(([source, id]) => ({
  source: `/${source}`,
  destination: paths[id as NavigationId],
  permanent: true,
}));
