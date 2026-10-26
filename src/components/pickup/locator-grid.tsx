"use client";
import { Button } from "@/components/ui/button";
import type { LocatorFleet } from "@/modules/pickup/types";
import { locatorSelection } from "@/modules/pickup/selection";
export function LocatorGrid({
  fleet,
  value,
  onChange,
  disabled = false,
  currentId,
  requireWhenAvailable = false,
}: {
  fleet?: LocatorFleet;
  value: number | null;
  onChange: (number: number | null) => void;
  disabled?: boolean;
  currentId?: string;
  requireWhenAvailable?: boolean;
}) {
  return (
    <div data-pickup-controls className="space-y-3">
      <div
        className="grid grid-cols-4 gap-2"
        role="group"
        aria-label="Número de localizador"
      >
        {Array.from(
          { length: fleet?.count ?? 16 },
          (_, index) => index + 1,
        ).map((number) => {
          const occupied = fleet?.occupied.find(
            (a) => a.number === number && a.id !== currentId,
          );
          return (
            <Button
              data-pickup-number
              key={number}
              type="button"
              variant={value === number ? "default" : "outline"}
              className="min-h-16 flex-col gap-0 text-2xl tabular-nums"
              disabled={disabled || !fleet || !!occupied}
              aria-pressed={value === number}
              aria-label={`Localizador ${number}${occupied ? ", ocupado" : ""}`}
              onClick={() => onChange(number)}
            >
              {number}
              {occupied && (
                <span className="text-[10px] font-medium">Ocupado</span>
              )}
            </Button>
          );
        })}
      </div>
      {(!requireWhenAvailable ||
        (fleet && !locatorSelection(fleet, null).required)) && (
        <Button
          type="button"
          variant={value === null ? "default" : "outline"}
          className="min-h-12 w-full"
          disabled={disabled}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          Sin localizador
        </Button>
      )}
    </div>
  );
}
