"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  House,
  Menu,
  X,
  Package,
  Users,
  Truck,
  WalletCards,
  Boxes,
  Layers3,
  ShoppingCart,
  Warehouse,
  LogOut,
  ChevronRight,
  UserRound,
  ChefHat,
  Store,
  LayoutGrid,
  ListChecks,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const groups = [
  {
    label: "Operación",
    links: [
      { href: "/", label: "Inicio", icon: House },
      { href: "/sales", label: "Ventas", icon: Store },
      { href: "/kitchen", label: "Comandas", icon: ListChecks },
      { href: "/tables", label: "Mesas", icon: LayoutGrid },
      { href: "/inventory", label: "Inventario", icon: Warehouse },
      { href: "/recipes", label: "Productos y recetas", icon: Package },
      { href: "/production", label: "Registrar producción", icon: ChefHat },
      { href: "/purchases", label: "Compras", icon: ShoppingCart },
    ],
  },
  {
    label: "Administración",
    links: [
      { href: "/products", label: "Precios de venta", icon: Package },
      { href: "/ingredients", label: "Insumos", icon: Boxes },
      { href: "/presentations", label: "Presentaciones", icon: Layers3 },
      { href: "/suppliers", label: "Proveedores", icon: Truck },
      { href: "/customers", label: "Clientes", icon: Users },
      { href: "/payment-methods", label: "Medios de pago", icon: WalletCards },
    ],
  },
];
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Sign-out not confirmed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError(
        "No pudimos cerrar sesión o confirmar el resultado. Probá de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        onClick={signOut}
        disabled={busy}
        className="w-full justify-start text-xs font-medium text-muted"
      >
        <LogOut size={16} />
        {busy ? "Saliendo…" : "Cerrar sesión"}
      </Button>
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
export function AppShell({
  children,
  role,
  name,
  dateLabel,
}: {
  children: React.ReactNode;
  role: string;
  name: string;
  dateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);
  const path = usePathname();
  const visibleGroups =
    role === "staff"
      ? [
          {
            label: "Operación",
            links: groups[0].links.filter((l) =>
              ["/sales", "/tables", "/kitchen"].includes(l.href),
            ),
          },
        ]
      : groups;
  const current =
    groups.flatMap((g) => g.links).find((l) => l.href === path)?.label ??
    "Kybo";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const navigation = (
    <>
      <div
        data-brand-header
        className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-6"
      >
        <Link
          href={role === "staff" ? "/sales" : "/"}
          aria-label="Kybo, inicio"
          onClick={() => setOpen(false)}
          className="shrink-0"
        >
          <Image
            src="/assets/kybo-logo.png"
            alt="Kybo"
            width={90}
            height={50}
            className="h-auto w-[82px] object-contain"
            priority
          />
        </Link>
        <span className="border-l border-line pl-3 text-[11px] font-extrabold tracking-tight text-brand">
          OPERATIONS
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        >
          <X size={19} />
        </Button>
      </div>
      <nav
        aria-label="Principal"
        className="flex-1 space-y-7 overflow-y-auto px-4 py-6"
      >
        {visibleGroups.map((g, i) => (
          <div key={g.label}>
            {i > 0 && <p className="eyebrow mb-3 px-3">{g.label}</p>}
            <div className="space-y-1.5">
              {g.links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={path === href ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-[9px] px-3 text-[13px] font-semibold transition-colors",
                    path === href
                      ? "bg-[#e7f3ff] text-brand"
                      : "text-muted hover:bg-surface hover:text-brand",
                  )}
                >
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className={path === href ? "text-blue" : ""}
                  />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-line px-4 pb-3 pt-4">
        <div className="mb-2 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3f9] text-xs font-bold text-brand">
            {initials || "K"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-brand">{name}</p>
            <p className="mt-1 text-[11px] text-muted">
              {role === "admin"
                ? "Administrador"
                : role === "staff"
                  ? "Personal"
                  : "Encargado"}{" "}
              · Kybo
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-white p-3 focus:not-sr-only"
      >
        Ir al contenido
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white lg:flex">
        {navigation}
      </aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-brand/35 backdrop-blur-[2px] lg:hidden" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!window.matchMedia("(min-width: 1024px)").matches)
                menuButton.current?.focus();
            }}
            className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,300px)] flex-col border-r border-line bg-white shadow-xl outline-none lg:hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">Menú de Kybo</Dialog.Title>
            {navigation}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="min-w-0">
        <header
          data-topbar
          className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/95 px-4 backdrop-blur-sm sm:px-7"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menú"
              ref={menuButton}
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </Button>
            <div
              aria-label="Ubicación"
              className="flex min-w-0 items-center gap-3 text-xs"
            >
              <Link
                href={role === "staff" ? "/sales" : "/"}
                className="hidden text-muted sm:inline"
              >
                Kybo
              </Link>
              <ChevronRight
                size={13}
                className="hidden text-[#adbbcd] sm:block"
              />
              <span className="truncate font-bold text-brand">{current}</span>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden text-xs font-medium text-muted sm:block">
              {dateLabel}
            </span>
            <span
              title={name}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f5fa] text-muted"
            >
              <UserRound size={18} aria-hidden="true" />
              <span className="sr-only">{name}</span>
            </span>
          </div>
        </header>
        <main id="main-content" className="page-container">
          {children}
        </main>
      </div>
    </div>
  );
}
