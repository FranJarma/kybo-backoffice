"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Keep the editor mounted when switching views, so unpublished edits survive.
export function ProductCostDetails({
  active,
  title,
  children,
}: {
  active: boolean;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className={active ? "mt-4 rounded-xl border border-line" : undefined}>
      {active && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-5 py-3 text-left text-sm font-medium text-brand hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue"
          onClick={() => setOpen((value) => !value)}
        >
          {title}
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
      <div
        id={id}
        hidden={active && !open}
        className={active ? "p-4 pt-0" : undefined}
      >
        {active && (
          <p className="mb-4 text-xs leading-relaxed text-muted">
            El resumen usa los datos guardados y la configuración publicada del
            producto. Las simulaciones de este detalle no modifican esos datos.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
