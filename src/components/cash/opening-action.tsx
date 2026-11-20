"use client";

import { lazy, Suspense, useRef, useState, type ComponentProps } from "react";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";

const Opening = lazy(() =>
  import("./manager").then(({ CashManager }) => ({ default: CashManager })),
);

export function CashOpeningAction({
  branchId,
  actorId,
  className,
  variant = "outline-primary",
}: {
  branchId: string;
  actorId: string;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const [opening, setOpening] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant={variant}
        className={className}
        disabled={opening}
        onClick={() => {
          if (window.location.pathname === "/finance/cash")
            window.dispatchEvent(
              new CustomEvent("kybo:cash-open", { detail: { branchId } }),
            );
          else setOpening(true);
        }}
      >
        <Banknote size={18} aria-hidden="true" />
        {opening ? "Abriendo…" : "Abrir caja"}
      </Button>
      {opening && (
        <Suspense
          fallback={
            <span role="status" className="sr-only">
              Cargando apertura de caja…
            </span>
          }
        >
          <Opening
            key={`${actorId}:${branchId}`}
            branchId={branchId}
            actorId={actorId}
            openingOnly
            onDismiss={() => {
              setOpening(false);
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          />
        </Suspense>
      )}
    </>
  );
}
