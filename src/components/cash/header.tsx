"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, ChevronRight, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/number-format";
import type { CashStatus } from "@/modules/cash/types";
import { cashBranchRequest } from "./shared";

const Opening = lazy(() =>
  import("./manager").then(({ CashManager }) => ({ default: CashManager })),
);
const openingButtonClassName = "h-11 rounded-lg px-3 shadow-none";

export function CashHeader({
  branchId,
  actorId,
}: {
  branchId: string;
  actorId: string;
}) {
  const path = usePathname();
  const [status, setStatus] = useState<CashStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [opening, setOpening] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!branchId) return;
    let active: AbortController | undefined;
    function load() {
      if (document.visibilityState === "hidden") return;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      void cashBranchRequest<CashStatus>(branchId, "/api/cash/status", {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setStatus(result);
            setUnavailable(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setStatus(null);
            setUnavailable(true);
          }
        });
    }
    function changed(event: Event) {
      if (
        (event as CustomEvent<{ branchId: string }>).detail?.branchId ===
        branchId
      )
        load();
    }
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    window.addEventListener("kybo:cash-changed", changed);
    document.addEventListener("visibilitychange", load);
    return () => {
      active?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("kybo:cash-changed", changed);
      document.removeEventListener("visibilitychange", load);
    };
  }, [branchId, actorId, path]);

  if (!branchId || (status && !status.available)) return null;
  const operationActorId = status?.actorId || actorId;
  const detail = status?.opening;
  const hour = detail
    ? new Intl.DateTimeFormat("es-AR", {
        timeZone: status!.timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(detail.openedAt))
    : "";
  const summary = detail
    ? `Caja abierta por ${detail.openedByName} a las ${hour}. Fondo inicial ${money(detail.openingCash)}.`
    : status?.open
      ? "Caja abierta"
      : "Caja cerrada";

  return (
    <div
      data-cash-header
      className="col-span-2 row-start-2 flex min-h-11 min-w-0 max-w-full items-center justify-between gap-3 sm:justify-start"
    >
      {status && !status.open && status.canOpen ? (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-muted sm:hidden xl:inline-flex">
          <span
            className="size-1.5 rounded-full bg-slate-400"
            aria-hidden="true"
          />
          Caja cerrada
        </span>
      ) : null}
      {status?.open ? (
        status.canView && detail ? (
          <Link
            href="/finance/cash"
            aria-label={`${summary} Ver caja`}
            title={summary}
            className="group flex h-11 w-full max-w-full items-center gap-3 rounded-lg px-2 py-1 text-brand transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue sm:w-auto"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <span
                  className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                Caja abierta
              </span>
              <span className="flex max-w-32 items-center gap-1 text-[11px] text-muted xl:max-w-48">
                <span className="truncate">{detail.openedByName}</span>
                <span aria-hidden="true">·</span>
                <time className="shrink-0" dateTime={detail.openedAt}>
                  {hour}
                </time>
              </span>
            </span>
            <span className="ml-auto shrink-0 pl-2 text-right sm:ml-1">
              <span className="block text-[10px] font-medium text-muted">
                Inicial
              </span>
              <strong className="block whitespace-nowrap text-xs tabular-nums">
                {money(detail.openingCash)}
              </strong>
            </span>
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ) : (
          <span className="inline-flex h-11 items-center gap-2 text-xs font-semibold text-brand">
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            Caja abierta
          </span>
        )
      ) : status?.canOpen && operationActorId ? (
        <Button
          ref={trigger}
          type="button"
          variant="outline-primary"
          className={openingButtonClassName}
          disabled={opening}
          onClick={() => {
            if (path === "/finance/cash")
              window.dispatchEvent(
                new CustomEvent("kybo:cash-open", { detail: { branchId } }),
              );
            else setOpening(true);
          }}
        >
          <Banknote size={18} aria-hidden="true" />
          {opening ? "Abriendo…" : "Abrir caja"}
        </Button>
      ) : status?.canOpen ? (
        <Button
          asChild
          variant="outline-primary"
          className={openingButtonClassName}
        >
          <Link href="/finance/cash">
            <Banknote size={18} aria-hidden="true" />
            Abrir caja
          </Link>
        </Button>
      ) : status ? (
        <span className="inline-flex min-h-11 items-center gap-2 text-xs text-muted">
          <span
            className="size-1.5 rounded-full bg-slate-400"
            aria-hidden="true"
          />
          Caja cerrada
        </span>
      ) : unavailable ? (
        <Link
          href="/finance/cash"
          className="inline-flex min-h-11 items-center gap-2 text-xs text-muted"
        >
          <WalletCards size={18} aria-hidden="true" />
          Consultar caja
        </Link>
      ) : (
        <span role="status" className="text-xs text-muted">
          Consultando caja…
        </span>
      )}
      {opening ? (
        <Suspense
          fallback={
            <span role="status" className="sr-only">
              Cargando apertura de caja…
            </span>
          }
        >
          <Opening
            key={operationActorId}
            branchId={branchId}
            actorId={operationActorId}
            openingOnly
            onDismiss={() => {
              setOpening(false);
              trigger.current?.focus();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
