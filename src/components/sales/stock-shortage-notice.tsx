"use client";
import { useState } from "react";
import { CircleAlert, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export function StockShortageNotice({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
      <div
        role="alert"
        className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"
      >
        <CircleAlert size={20} className="shrink-0" aria-hidden="true" />
        <p>Falta stock para completar el pedido.</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 shrink-0"
            aria-label="Ver detalle de insumos faltantes"
          >
            <CircleHelp size={18} aria-hidden="true" />
            Ver detalle
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Insumos faltantes</DialogTitle>
            <DialogDescription>
              Detalle por ubicación para poder completar el pedido.
            </DialogDescription>
          </DialogHeader>
          <p className="max-h-[55dvh] overflow-y-auto whitespace-pre-line break-words text-sm leading-6 text-brand">
            {message}
          </p>
          <Button
            type="button"
            className="min-h-12"
            onClick={() => setOpen(false)}
          >
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
