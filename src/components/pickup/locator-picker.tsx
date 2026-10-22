"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useLocators } from "./use-locators";
import { LocatorGrid } from "./locator-grid";
export function LocatorPicker({
  value,
  onChange,
  disabled,
  refresh,
}: {
  value: number | null;
  onChange: (number: number | null) => void;
  disabled: boolean;
  refresh: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="mb-2 min-h-12 w-full"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {value === null
          ? "Sin localizador · Elegir"
          : `Localizador ${value} · Cambiar`}
      </Button>
      {open && (
        <PickerDialog
          value={value}
          refresh={refresh}
          onClose={() => setOpen(false)}
          onChange={(number) => {
            onChange(number);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
function PickerDialog({
  value,
  refresh,
  onClose,
  onChange,
}: {
  value: number | null;
  refresh: number;
  onClose: () => void;
  onChange: (number: number | null) => void;
}) {
  const { fleet, error } = useLocators(refresh);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-pickup-controls
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Localizador del pedido</DialogTitle>
          <DialogDescription>
            Elegí el equipo que entregarás. Se reserva al guardar el pedido.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error} Podés continuar sin localizador.
          </p>
        )}
        <LocatorGrid
          fleet={error ? undefined : fleet}
          value={value}
          onChange={onChange}
        />
        <p className="text-xs text-muted">
          Los ocupados se liberan al confirmar su devolución.
        </p>
      </DialogContent>
    </Dialog>
  );
}
