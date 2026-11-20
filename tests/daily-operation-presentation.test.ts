import { expect, it } from "vitest";
import {
  taskNextStep,
  taskIsClosed,
} from "@/modules/daily-operations/presentation";
import type { TaskRow } from "@/modules/daily-operations/types";
const base = {
  kind: "production",
  state: "pending",
  assignedTo: "person",
  documentId: null,
  assigneeUnavailable: false,
} as TaskRow;
it("distingue asignación, sugerencia y preparación en curso sin inventar una ejecución", () => {
  expect(taskNextStep({ ...base, assignedTo: null }, true)).toBe(
    "Asignar responsable",
  );
  expect(taskNextStep({ ...base, assignedTo: null }, false)).toBe(
    "Esperar asignación",
  );
  expect(taskNextStep(base, true)).toBe("Confirmar preparación en Depósito");
  expect(
    taskNextStep({ ...base, documentId: "order", state: "in_progress" }, true),
  ).toBe("Registrar resultado de producción");
  expect(
    taskNextStep(
      { ...base, documentId: "order", assigneeUnavailable: true },
      true,
    ),
  ).toBe("Reasignar responsable");
});
it("las tareas cerradas o bloqueadas no anuncian una nueva operación", () => {
  expect(taskIsClosed({ ...base, state: "done" })).toBe(true);
  expect(taskNextStep({ ...base, state: "done" }, true)).toBe(
    "Consultar resultado",
  );
  expect(taskNextStep({ ...base, state: "blocked" }, true)).toBe(
    "Revisar impedimento",
  );
  expect(taskNextStep({ ...base, state: "awaiting_review" }, true)).toBe(
    "Revisar resultado",
  );
});
it("conserva compras unificadas y no inventa una acción para controles de inventario", () => {
  expect(
    taskNextStep({ ...base, kind: "purchase", documentId: "order" }, true),
  ).toBe("Seguir pedido en Compras");
  expect(
    taskNextStep({ ...base, kind: "purchase", quantity: "12" }, true),
  ).toBe("Preparar pedido de compra");
  expect(taskNextStep({ ...base, kind: "count" }, true)).toBe(
    "Ver detalle del control",
  );
});
