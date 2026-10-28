"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import type { PreparationGuide } from "@/modules/recipes/preparation-guide";

export const emptyPreparation: PreparationGuide = {
  steps: [],
  estimatedMinutes: null,
  observations: "",
};
export function PreparationFields({
  value,
  onChange,
}: {
  value: PreparationGuide;
  onChange: (value: PreparationGuide) => void;
}) {
  const update = (steps: string[]) => onChange({ ...value, steps });
  const move = (from: number, to: number) => {
    const steps = [...value.steps];
    [steps[from], steps[to]] = [steps[to], steps[from]];
    update(steps);
  };
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-brand">Cómo se prepara</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Indicaciones para el equipo. Se guardan con esta versión de la receta
          y se consultan desde la comanda. Los pedidos ya confirmados conservan
          sus instrucciones.
        </p>
      </div>
      <label className="block max-w-xs space-y-2 text-sm font-medium">
        <FieldCaption optional>Tiempo estimado (minutos)</FieldCaption>
        <Input
          type="number"
          min={1}
          max={1440}
          step={1}
          value={value.estimatedMinutes ?? ""}
          placeholder="Por ejemplo, 3"
          onChange={(e) =>
            onChange({
              ...value,
              estimatedMinutes:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </label>
      <div className="space-y-5">
        <h4 className="text-sm font-semibold">
          <FieldCaption optional>Paso a paso</FieldCaption>
        </h4>
        {!value.steps.length && (
          <p className="text-sm text-muted">
            Agregá los pasos en el orden en que se prepara la receta.
          </p>
        )}
        {value.steps.map((step, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                <FieldCaption optional>Paso {index + 1}</FieldCaption>
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  aria-label={`Subir paso ${index + 1}`}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === value.steps.length - 1}
                  aria-label={`Bajar paso ${index + 1}`}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar paso ${index + 1}`}
                  onClick={() =>
                    update(value.steps.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
            <textarea
              aria-label={`Instrucción del paso ${index + 1}`}
              className="form-control min-h-24 resize-y"
              maxLength={1000}
              value={step}
              onChange={(e) =>
                update(
                  value.steps.map((text, i) =>
                    i === index ? e.target.value : text,
                  ),
                )
              }
              placeholder="Describí qué debe hacer el equipo…"
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={value.steps.length >= 50}
          onClick={() => update([...value.steps, ""])}
        >
          <Plus size={16} /> Agregar paso
        </Button>
      </div>
      <label className="block space-y-2 text-sm font-medium">
        <FieldCaption optional>Observaciones para el equipo</FieldCaption>
        <textarea
          className="form-control min-h-28 resize-y"
          maxLength={2000}
          value={value.observations}
          onChange={(e) => onChange({ ...value, observations: e.target.value })}
          placeholder="Presentación, recomendaciones u otros detalles…"
        />
      </label>
      <p className="text-xs text-muted">
        Usá las cantidades y opciones indicadas en la receta y en el pedido. El
        tiempo es orientativo; no modifica los tiempos medidos de la comanda.
      </p>
    </div>
  );
}
