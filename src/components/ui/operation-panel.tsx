"use client";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";

export function OperationPanel({
  title,
  description,
  label,
  children,
  footer,
  locked = false,
  onClose,
}: {
  title: string;
  description: string;
  label?: string;
  children: ReactNode;
  footer?: ReactNode;
  locked?: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        style={{ borderRadius: 0 }}
        showCloseButton={false}
        className="inset-y-0 right-0 left-auto flex h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 bg-white p-0 sm:max-w-[600px] data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-line px-5 py-6 sm:px-7">
          <div className="min-w-0 space-y-2">
            {label && (
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}
              </p>
            )}
            <DialogTitle className="text-left text-xl leading-snug font-bold text-brand">
              {title}
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              {description}
            </DialogDescription>
          </div>
          <button
            type="button"
            disabled={locked}
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-brand hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
            {footer}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
