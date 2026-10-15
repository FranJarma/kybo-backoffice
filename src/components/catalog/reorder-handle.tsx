"use client";
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DropPosition = { id: string; placement: "before" | "after" };
export function ReorderHandle({
  id,
  name,
  disabled,
  onTarget,
  onDrop,
  onStep,
}: {
  id: string;
  name: string;
  disabled: boolean;
  onTarget: (target: DropPosition | null) => void;
  onDrop: (target: DropPosition) => void;
  onStep: (direction: "up" | "down") => void;
}) {
  const drag = useRef<{
    x: number;
    y: number;
    active: boolean;
    target: DropPosition | null;
  } | null>(null);
  const [active, setActive] = useState(false);
  function clear() {
    drag.current = null;
    setActive(false);
    onTarget(null);
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      data-reorder-id={id}
      className={`shrink-0 touch-none select-none px-2 text-muted ${active ? "cursor-grabbing bg-blue-50 text-blue" : "cursor-grab"}`}
      aria-label={`Reordenar ${name}. Arrastrá o usá las flechas arriba y abajo.`}
      title="Arrastrá para ordenar. Con teclado, usá ↑ y ↓."
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clear();
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          onStep(event.key === "ArrowUp" ? "up" : "down");
        }
      }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          active: false,
          target: null,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        if (
          !current.active &&
          Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6
        )
          return;
        current.active = true;
        setActive(true);
        const element = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-catalog-row]");
        const rect = element?.getBoundingClientRect();
        const target =
          element && rect && element.dataset.catalogRow !== id
            ? {
                id: element.dataset.catalogRow!,
                placement:
                  event.clientY < rect.top + rect.height / 2
                    ? ("before" as const)
                    : ("after" as const),
              }
            : null;
        current.target = target;
        onTarget(target);
        // Scroll the closest scrollable container near its edge, including touch.
        let scroller: HTMLElement | null = element?.parentElement ?? null;
        while (
          scroller &&
          !(
            scroller.scrollHeight > scroller.clientHeight &&
            /auto|scroll/.test(getComputedStyle(scroller).overflowY)
          )
        )
          scroller = scroller.parentElement;
        if (scroller) {
          const bounds = scroller.getBoundingClientRect();
          scroller.scrollBy(
            0,
            event.clientY < bounds.top + 48
              ? -20
              : event.clientY > bounds.bottom - 48
                ? 20
                : 0,
          );
        } else
          window.scrollBy(
            0,
            event.clientY < 64
              ? -20
              : event.clientY > window.innerHeight - 64
                ? 20
                : 0,
          );
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        clear();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (current?.active && current.target) onDrop(current.target);
      }}
      onPointerCancel={clear}
      onLostPointerCapture={clear}
    >
      <GripVertical size={18} aria-hidden="true" />
    </Button>
  );
}
