"use client";
import { useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldCaption } from "@/components/ui/field-caption";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { LocatorFleet } from "@/modules/pickup/types";
import { locatorSelection } from "@/modules/pickup/selection";
import { LocatorGrid } from "./locator-grid";
export function LocatorPicker({
  value,
  onChange,
  disabled,
  fleet,
  issue,
  automatic = false,
  onAutomatic,
}: {
  value: number | null;
  onChange: (number: number | null) => void;
  disabled: boolean;
  fleet?: LocatorFleet;
  issue: string;
  automatic?: boolean;
  onAutomatic?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-semibold text-brand">
        <FieldCaption
          required={
            !automatic && !!fleet && locatorSelection(fleet, null).required
          }
          optional={
            !automatic && !!fleet && !locatorSelection(fleet, null).required
          }
        >
          Localizador
        </FieldCaption>
      </p>
      <Button
        type="button"
        variant="outline"
        className={`min-h-12 w-full gap-2 whitespace-normal rounded-lg px-3 text-xs shadow-none sm:text-sm ${value !== null ? "border-orange-300 bg-orange-50/40 hover:bg-orange-50" : "border-line bg-white"}`}
        disabled={disabled || !fleet}
        onClick={() => setOpen(true)}
      >
        <Radio className="size-5 shrink-0" aria-hidden="true" />
        <span>
          {automatic
            ? !fleet
              ? "Se asigna al confirmar"
              : value === null
                ? "Sin localizadores disponibles"
                : `Localizador ${value} · Automático · Cambiar`
            : value === null
              ? !fleet
                ? "Consultando localizadores…"
                : locatorSelection(fleet, null).required
                  ? "Elegir localizador · Obligatorio"
                  : "Sin localizador · No hay disponibles"
              : `Localizador ${value} · Cambiar`}
        </span>
      </Button>
      {automatic && value !== null && (
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Se confirma al guardar el pedido.
        </p>
      )}
      {issue && (
        <p
          role="status"
          className="mb-3 text-xs leading-relaxed text-muted-foreground"
        >
          {issue}
        </p>
      )}
      {open && (
        <PickerDialog
          value={value}
          fleet={fleet}
          issue={issue}
          automatic={automatic}
          onAutomatic={
            onAutomatic
              ? () => {
                  onAutomatic();
                  setOpen(false);
                }
              : undefined
          }
          onClose={() => setOpen(false)}
          onChange={(number) => {
            onChange(number);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
function PickerDialog({
  value,
  fleet,
  issue,
  onClose,
  onChange,
  automatic,
  onAutomatic,
}: {
  value: number | null;
  fleet?: LocatorFleet;
  issue: string;
  onClose: () => void;
  onChange: (number: number | null) => void;
  automatic: boolean;
  onAutomatic?: () => void;
}) {
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
          <DialogTitle className="flex items-center gap-2">
            <Radio className="size-5 shrink-0" aria-hidden="true" />
            Localizador del pedido
          </DialogTitle>
          <DialogDescription>
            Elegí el equipo que entregarás. Se reserva al guardar el pedido.
          </DialogDescription>
        </DialogHeader>
        {issue && <p className="text-sm text-muted-foreground">{issue}</p>}
        {onAutomatic && (
          <Button
            variant="outline"
            className={`min-h-12 border-orange-300 ${automatic ? "bg-orange-50" : "bg-white"}`}
            onClick={onAutomatic}
          >
            <Radio className="size-4" aria-hidden="true" />
            {automatic
              ? "Mantener asignación automática"
              : "Volver a asignación automática"}
          </Button>
        )}
        <LocatorGrid
          fleet={fleet}
          requireWhenAvailable
          value={value}
          onChange={onChange}
        />
        <p className="text-xs text-muted">
          {fleet && !locatorSelection(fleet, null).required
            ? "Todos están ocupados. Podés registrar este pedido sin localizador. "
            : "La selección es obligatoria mientras haya equipos disponibles. "}
          Los ocupados se liberan al confirmar su devolución.
        </p>
      </DialogContent>
    </Dialog>
  );
}
