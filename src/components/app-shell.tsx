"use client";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  ChefHat,
  Store,
  LayoutGrid,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Dialog, Tooltip } from "radix-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BranchSelector,
  type BranchChoice,
} from "@/components/branches/selector";
import {
  visibleNavigation,
  breadcrumbs,
  navigationIsActive,
} from "@/lib/navigation";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useSidebarPreference } from "@/lib/sidebar-preference";
const icons = {
  House,
  Package,
  Users,
  Truck,
  WalletCards,
  Boxes,
  Layers3,
  ShoppingCart,
  Warehouse,
  ChefHat,
  Store,
  LayoutGrid,
  ListChecks,
};
function SidebarHint({
  compact,
  label,
  children,
}: {
  compact: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!compact) return children;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={12}
          className="z-[100] max-w-64 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white shadow-lg"
        >
          {label}
          <Tooltip.Arrow className="fill-brand" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function SignOutButton({ compact = false }: { compact?: boolean }) {
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
      <SidebarHint
        compact={compact}
        label={busy ? "Saliendo…" : "Cerrar sesión"}
      >
        <Button
          type="button"
          variant="ghost"
          onClick={signOut}
          disabled={busy}
          aria-label={busy ? "Saliendo…" : "Cerrar sesión"}
          className={cn(
            "h-12 w-full justify-start text-xs font-medium text-muted",
            compact && "mx-auto w-12 justify-center px-0",
          )}
        >
          <LogOut size={16} aria-hidden="true" />
          {!compact && (busy ? "Saliendo…" : "Cerrar sesión")}
        </Button>
      </SidebarHint>
      <OperationAlert
        title="No pudimos cerrar sesión"
        message={error}
        tone="error"
      />
    </div>
  );
}
export function AppShell({
  children,
  role,
  name,
  catalogManager = false,
  branches,
  selectedBranchId,
  initialSidebarCollapsed = false,
}: {
  children: React.ReactNode;
  role: string;
  name: string;
  dateLabel: string;
  catalogManager?: boolean;
  branches: BranchChoice[];
  selectedBranchId: string;
  initialSidebarCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, toggleSidebar] = useSidebarPreference(
    initialSidebarCollapsed,
  );
  const menuButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const desktopSidebar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!selectedBranchId) return;
    const saved = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("kybo-branch="))
      ?.split("=")[1];
    if (saved !== selectedBranchId)
      document.cookie = `kybo-branch=${encodeURIComponent(selectedBranchId)}; Path=/; Max-Age=2592000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  }, [selectedBranchId]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);
  const path = usePathname();
  const register = path === "/sales";
  useLayoutEffect(() => {
    const nav = desktopSidebar.current?.querySelector("nav");
    if (!nav || register) return;
    const revealActive = () => {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || !nav.clientHeight) return;
      const bounds = nav.getBoundingClientRect();
      const link = active.getBoundingClientRect();
      // Scroll only the navigation, keeping the page's working position.
      if (link.top < bounds.top) nav.scrollTop += link.top - bounds.top;
      else if (link.bottom > bounds.bottom)
        nav.scrollTop += link.bottom - bounds.bottom;
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [collapsed, path, register]);
  const entries = visibleNavigation({ role, catalogManager });
  const visibleGroups = [...new Set(entries.map((n) => n.area))].map(
    (label) => ({
      label,
      links: entries
        .filter((n) => n.area === label)
        .map((n) => ({ ...n, icon: icons[n.icon] })),
    }),
  );
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const roleLabel =
    role === "admin"
      ? "Administrador"
      : role === "staff"
        ? "Personal"
        : "Encargado";
  const renderNavigation = (compact: boolean) => (
    <>
      <div
        data-brand-header
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-line",
          compact ? "justify-center px-2" : "gap-3 px-6",
        )}
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
            className={cn(
              "h-auto object-contain",
              compact ? "w-12" : "w-[82px]",
            )}
            priority
          />
        </Link>
        {!compact && (
          <span className="border-l border-line pl-3 text-[11px] font-extrabold tracking-tight text-brand">
            OPERATIONS
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("ml-auto min-h-12 min-w-12", !register && "lg:hidden")}
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        >
          <X size={19} />
        </Button>
      </div>
      <nav
        aria-label="Principal"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          compact ? "space-y-2 px-2 py-3" : "space-y-4 px-3 py-4",
        )}
      >
        {visibleGroups.map((g) => (
          <div
            key={g.label}
            className={cn(
              compact
                ? "border-b border-line pb-2 last:border-b-0"
                : "rounded-lg border-l-2 pl-1",
              !compact &&
                (g.links.some((l) => navigationIsActive(l.href, path))
                  ? "border-blue"
                  : "border-transparent"),
            )}
          >
            <p className={compact ? "sr-only" : "eyebrow mb-1.5 px-3"}>
              {g.label}
            </p>
            <div className="space-y-0.5">
              {g.links.map(({ href, label, icon: Icon }) => (
                <SidebarHint key={href} compact={compact} label={label}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={
                      navigationIsActive(href, path) ? "page" : undefined
                    }
                    className={cn(
                      "flex min-h-12 items-center rounded-[9px] text-[13px] leading-5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
                      compact
                        ? "mx-auto h-12 w-12 justify-center"
                        : "gap-3 px-3 py-2",
                      navigationIsActive(href, path)
                        ? "bg-[#e7f3ff] text-brand"
                        : "text-muted hover:bg-surface hover:text-brand",
                    )}
                  >
                    <Icon
                      size={19}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={cn(
                        "shrink-0",
                        navigationIsActive(href, path) && "text-blue",
                      )}
                    />
                    <span className={compact ? "sr-only" : undefined}>
                      {label}
                    </span>
                  </Link>
                </SidebarHint>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div
        className={cn(
          "shrink-0 border-t border-line pb-3 pt-4",
          compact ? "px-2" : "px-4",
        )}
      >
        <SidebarHint compact={compact} label={`${name} · ${roleLabel}`}>
          <div
            className={cn(
              "mb-2 flex items-center",
              compact ? "justify-center" : "gap-3 px-2",
            )}
            tabIndex={compact ? 0 : undefined}
            role={compact ? "img" : undefined}
            aria-label={compact ? `${name} · ${roleLabel}` : undefined}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3f9] text-xs font-bold text-brand">
              {initials || "K"}
            </span>
            {!compact && (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-brand">{name}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {roleLabel} · Kybo
                </p>
              </div>
            )}
          </div>
        </SidebarHint>
        <SignOutButton compact={compact} />
      </div>
    </>
  );
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={200}>
      <div
        data-app-shell
        data-sidebar-collapsed={collapsed}
        className={cn(
          "min-h-screen",
          !register &&
            (collapsed
              ? "lg:grid lg:grid-cols-[72px_minmax(0,1fr)]"
              : "lg:grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]"),
        )}
      >
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-white p-3 focus:not-sr-only"
        >
          Ir al contenido
        </a>
        <aside
          id="desktop-sidebar"
          ref={desktopSidebar}
          className={cn(
            "sticky top-0 hidden h-dvh flex-col overflow-hidden border-r border-line bg-white",
            !register && "lg:flex",
          )}
        >
          {renderNavigation(collapsed)}
        </aside>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay
              className={cn(
                "fixed inset-0 z-40 bg-brand/35 backdrop-blur-[2px]",
                !register && "lg:hidden",
              )}
            />
            <Dialog.Content
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (
                  register ||
                  !window.matchMedia("(min-width: 1024px)").matches
                )
                  menuButton.current?.focus();
                else collapseButton.current?.focus();
              }}
              className={cn(
                "fixed inset-y-0 left-0 z-50 flex w-[min(88vw,300px)] flex-col border-r border-line bg-white shadow-xl outline-none",
                !register && "lg:hidden",
              )}
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">Menú de Kybo</Dialog.Title>
              {renderNavigation(false)}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div
          className={cn(
            "min-w-0",
            register && "flex h-dvh min-h-dvh flex-col overflow-hidden",
          )}
        >
          <header
            data-topbar
            className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-3 backdrop-blur-sm sm:flex-nowrap sm:px-7"
          >
            <div className="flex min-w-0 items-center gap-3">
              {!register && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  ref={collapseButton}
                  className="hidden size-11 text-muted lg:inline-flex"
                  aria-controls="desktop-sidebar"
                  aria-expanded={!collapsed}
                  aria-label={
                    collapsed
                      ? "Expandir menú lateral"
                      : "Colapsar menú lateral"
                  }
                  title={
                    collapsed
                      ? "Expandir menú lateral"
                      : "Colapsar menú lateral"
                  }
                  onClick={toggleSidebar}
                >
                  {collapsed ? (
                    <PanelLeftOpen size={21} aria-hidden="true" />
                  ) : (
                    <PanelLeftClose size={21} aria-hidden="true" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className={cn("min-h-12 min-w-12", !register && "lg:hidden")}
                aria-label="Abrir menú"
                ref={menuButton}
                aria-expanded={open}
                onClick={() => setOpen(true)}
              >
                <Menu size={21} />
              </Button>
              <Breadcrumb items={breadcrumbs(path, { role, catalogManager })} />
            </div>
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:shrink-0">
              {role === "staff" ? (
                <p
                  className="truncate text-sm text-muted"
                  title="Sucursal asignada"
                >
                  {
                    branches.find((branch) => branch.id === selectedBranchId)
                      ?.name
                  }
                </p>
              ) : (
                <BranchSelector rows={branches} selected={selectedBranchId} />
              )}
            </div>
          </header>
          <main
            id="main-content"
            className={
              register
                ? "min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4"
                : "page-container"
            }
          >
            {children}
          </main>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
