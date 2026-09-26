import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Package,
  Truck,
  ShoppingCart,
  Plus,
  CircleAlert,
  Check,
  CircleDollarSign,
  ChevronRight,
  Layers3,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { createCatalogService } from "@/modules/catalog/service";
import { createInventoryService } from "@/modules/inventory/service";
import { user } from "@/db/auth-schema";
import { eq } from "drizzle-orm";
const amount = (value: string | null) =>
  value === null
    ? "Pendiente"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 2,
      }).format(Number(value));
const qty = (value: string, unit: string) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 }).format(Number(value))} ${unit === "unit" ? "unid." : unit}`;
export default async function HomePage() {
  const actor = await requireActor();
  // Layouts do not serialize child rendering; enforce access before querying user data.
  if (actor.role === "staff") redirect("/sales");
  const db = await getDb();
  const catalog = createCatalogService(db);
  const inventory = createInventoryService(db);
  const [ingredients, products, suppliers, stock, receipts, profiles] =
    await Promise.all([
      catalog.listRecords(actor, "ingredients"),
      catalog.listRecords(actor, "products"),
      catalog.listRecords(actor, "suppliers"),
      inventory.getStock(actor),
      inventory.listReceipts(actor),
      db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, actor.id))
        .limit(1),
    ]);
  const name = profiles[0]?.name?.split(" ")[0] ?? "equipo";
  const attention = stock.rows.filter(
    (r) =>
      Number(r.expiredQuantity) > 0 ||
      Number(r.blockedQuantity) > 0 ||
      r.stockValue === null ||
      Number(r.usableQuantity) === 0,
  );
  const metrics = [
    {
      label: "Insumos",
      value: ingredients.total,
      hint: "En tu catálogo activo",
      icon: Boxes,
      bg: "bg-blue-50 text-blue",
    },
    {
      label: "Productos",
      value: products.total,
      hint: "Con precios por canal",
      icon: Package,
      bg: "bg-violet-50 text-violet-600",
    },
    {
      label: "Compras registradas",
      value: receipts.total,
      hint: "Recepciones de mercadería",
      icon: ShoppingCart,
      bg: "bg-orange-50 text-orange-600",
    },
    {
      label: "Proveedores",
      value: suppliers.total,
      hint: "Contactos activos",
      icon: Truck,
      bg: "bg-emerald-50 text-emerald-600",
    },
  ];
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <h1 className="page-title">Buen día, {name}</h1>
          <p className="page-description">
            El estado de tu operación, de un vistazo.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/purchases">
            <Plus size={18} />
            Registrar compra
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        {metrics.map(({ label, value, hint, icon: Icon, bg }) => (
          <div
            key={label}
            className="surface-panel flex items-start gap-4 p-4 sm:p-5"
          >
            <span
              className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex ${bg}`}
            >
              <Icon size={23} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">{label}</p>
              <p className="my-1.5 text-[30px] font-extrabold leading-none tracking-tight text-brand tabular-nums">
                {value}
              </p>
              <p className="text-[11px] leading-5 text-muted">{hint}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section className="surface-panel overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-5">
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-brand">
                Inventario a mano
              </h2>
              <p className="mt-1 text-xs text-muted">
                Existencias disponibles y valor de tus insumos.
              </p>
            </div>
            <Link
              href="/inventory"
              aria-label="Ver todo el inventario"
              className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-blue"
            >
              Ver todo
              <ArrowRight size={14} />
            </Link>
          </div>
          {stock.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-y border-line bg-[#f8fafc] text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Insumo</th>
                    <th className="px-4 py-3 font-medium">Utilizable</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Valor físico
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stock.rows.slice(0, 5).map((r) => (
                    <tr key={r.ingredientId}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="icon-tile hidden sm:flex">
                            <Boxes size={19} strokeWidth={1.6} />
                          </span>
                          <span className="font-bold text-brand">{r.name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-muted tabular-nums">
                        {qty(r.usableQuantity, r.baseUnit)}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-brand tabular-nums">
                        {r.stockValue === null ? (
                          <span className="status-pill bg-slate-100 text-slate-600">
                            Pendiente
                          </span>
                        ) : (
                          amount(r.stockValue)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
                {Math.min(5, stock.rows.length)} de {stock.total} insumos con
                historial de stock
              </p>
            </div>
          ) : (
            <div className="mx-5 mb-5 rounded-xl border border-dashed border-line px-6 py-12 text-center">
              <span className="icon-tile mx-auto">
                <Boxes size={22} />
              </span>
              <h3 className="mt-4 font-bold text-brand">
                Tu inventario empieza acá
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-6 text-muted">
                Registrá la mercadería que recibiste o cargá el stock inicial de
                tus insumos.
              </p>
              <Button variant="outline" asChild className="mt-5">
                <Link href="/inventory">
                  Ir a inventario
                  <ArrowRight size={15} />
                </Link>
              </Button>
            </div>
          )}
        </section>
        <section className="surface-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold tracking-tight text-brand">
              Atención requerida
            </h2>
            <span className="status-pill bg-orange-50 text-orange-800">
              {attention.length}
            </span>
          </div>
          <p className="mb-4 text-xs leading-5 text-muted">
            Revisión de {stock.rows.length} insumos consultados
            {stock.total > stock.rows.length ? ` de ${stock.total}` : ""}.
          </p>
          <div className="space-y-3">
            {attention.slice(0, 4).map((r) => {
              const expired = Number(r.expiredQuantity) > 0;
              const blocked = Number(r.blockedQuantity) > 0;
              const empty = Number(r.usableQuantity) === 0;
              const label = expired
                ? "Stock vencido"
                : blocked
                  ? "Lotes bloqueados"
                  : empty
                    ? "Sin disponible"
                    : "Costo pendiente";
              return (
                <Link
                  href="/inventory"
                  key={r.ingredientId}
                  className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-surface"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${expired || empty ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}
                  >
                    <CircleAlert size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-brand">
                      {r.name}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">{label}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              );
            })}
            {!attention.length && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
                <Check size={22} className="mb-3 text-emerald-600" />
                <p className="text-sm font-bold text-brand">
                  {stock.rows.length
                    ? "Sin alertas en lo consultado"
                    : "Todo listo para empezar"}
                </p>
                <p className="mt-2 text-xs leading-6 text-muted">
                  {stock.rows.length
                    ? "Los costos pendientes, lotes vencidos o bloqueados aparecerán acá."
                    : "Cuando registres stock, vas a ver acá los insumos que necesitan revisión."}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="surface-panel overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-5">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-brand">
              Últimas compras
            </h2>
            <p className="mt-1 text-xs text-muted">
              Mercadería recibida y saldo con proveedores.
            </p>
          </div>
          <Link
            href="/purchases"
            className="flex items-center gap-1.5 text-xs font-bold text-blue"
          >
            Ver todas
            <ArrowRight size={14} />
          </Link>
        </div>
        {receipts.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="border-y border-line bg-[#f8fafc] text-muted">
                <tr>
                  {["Proveedor", "Fecha", "Comprobante", "Total", "Saldo"].map(
                    (t) => (
                      <th key={t} className="px-5 py-3 font-medium">
                        {t}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {receipts.rows.slice(0, 4).map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-4 font-bold text-brand">
                      {r.supplierName}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {r.receivedOn.split("-").reverse().join("/")}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {r.documentNumber ?? "Sin referencia"}
                    </td>
                    <td className="px-5 py-4 font-bold tabular-nums">
                      {amount(r.totalAmount)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`status-pill ${r.balanceDue !== null && Number(r.balanceDue) === 0 ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-800"}`}
                      >
                        {r.balanceDue !== null && Number(r.balanceDue) === 0
                          ? "Pagado"
                          : amount(r.balanceDue)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-4 border-t border-line px-5 py-7">
            <span className="icon-tile bg-orange-50 text-orange-600">
              <ShoppingCart size={21} />
            </span>
            <div>
              <p className="text-sm font-semibold">
                Todavía no hay compras registradas
              </p>
              <p className="mt-1 text-xs text-muted">
                Al recibir mercadería, la compra y sus lotes van a quedar
                vinculados.
              </p>
            </div>
          </div>
        )}
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            href: "/ingredients",
            label: "Gestionar insumos",
            desc: "Unidades y costos de reposición",
            icon: CircleDollarSign,
          },
          {
            href: "/presentations",
            label: "Presentaciones de compra",
            desc: "Paquetes, bolsas y conversiones",
            icon: Layers3,
          },
          {
            href: "/payment-methods",
            label: "Medios de pago",
            desc: "Organizá las formas de pago",
            icon: WalletCards,
          },
        ].map(({ href, label, desc, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className="group flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-4 transition-colors hover:border-blue/30"
          >
            <Icon size={20} strokeWidth={1.7} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-brand">{label}</p>
              <p className="mt-1 text-[11px] text-muted">{desc}</p>
            </div>
            <ArrowRight
              size={15}
              className="text-muted group-hover:text-blue"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
