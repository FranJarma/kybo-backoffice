"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { decimal } from "@/modules/inventory/decimal";
import { inputDecimal } from "@/components/recipes/shared";

export function ProductionDifferenceForm({
  plannedQuantity,
  baseUnit,
  revision,
  locked,
  onReport,
}: {
  plannedQuantity: string;
  baseUnit: string;
  revision: number;
  locked: boolean;
  onReport: (report: {
    expectedRevision: number;
    actualQuantity: string;
    reason: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [actual, setActual] = useState(() => inputDecimal(plannedQuantity));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const changed = draftRevision !== null && draftRevision !== revision;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || changed || draftRevision === null) return;
    try {
      if (!reason.trim())
        throw Error("Contá qué pasó para que el encargado lo revise.");
      const actualQuantity = decimal(actual, 6)!;
      setError("");
      onReport({
        expectedRevision: draftRevision,
        actualQuantity,
        reason: reason.trim(),
      });
    } catch (error) {
      setError((error as Error).message);
    }
  }
  if (!open)
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full"
        disabled={locked}
        onClick={() => {
          if (draftRevision === null) setActual(inputDecimal(plannedQuantity));
          setDraftRevision(revision);
          setError("");
          setOpen(true);
        }}
      >
        Informar diferencia
      </Button>
    );
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
      <h4 className="font-semibold text-brand">Informar al encargado</h4>
      <p className="text-sm text-muted">
        Informá lo que obtuviste. El encargado revisará el resultado y los
        insumos antes de actualizar el stock.
      </p>
      {changed && (
        <p role="status" className="text-sm text-amber-950">
          La producción cambió mientras escribías. Conservamos tu aviso. Cancelá
          y volvé a abrirlo para revisar los datos actuales antes de enviarlo.
        </p>
      )}
      <fieldset disabled={locked} className="space-y-3">
        <label className="block text-sm font-semibold">
          <FieldCaption required>Cantidad obtenida ({baseUnit})</FieldCaption>
          <Input
            autoFocus
            inputMode="decimal"
            required
            value={actual}
            onChange={(event) => setActual(event.target.value)}
          />
        </label>
        <p className="text-sm text-muted">
          Si no se obtuvo producto, ingresá 0.
        </p>
        <label className="block text-sm font-semibold">
          <FieldCaption required>Qué pasó</FieldCaption>
          <textarea
            className="form-control mt-2 min-h-24"
            required
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={changed}>
            Enviar al encargado
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
