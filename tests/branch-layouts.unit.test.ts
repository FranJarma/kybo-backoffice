import React from "react";
import { describe, expect, it, vi } from "vitest";
import SellingLayout from "../src/app/(selling)/layout";
import OperationsLayout from "../src/app/(operations)/layout";

vi.stubGlobal("React", React);
const { actor, branches } = vi.hoisted(() => ({
  actor: { id: "user-1", role: "admin", branchId: "centro" },
  branches: [
    { id: "principal", name: "Principal" },
    { id: "centro", name: "Centro" },
  ],
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/lib/auth", () => ({ requireActor: async () => actor }));
vi.mock("@/modules/branches/page-context", () => ({
  shellActor: async () => actor,
}));
vi.mock("@/modules/branches/list", () => ({
  listAccessibleBranches: async () => branches,
}));
vi.mock("@/db/client", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ name: "Prueba" }] }),
      }),
    }),
  }),
}));

describe("sucursal entre áreas", () => {
  it.each([
    ["Punto de venta y Mesas", SellingLayout],
    ["Operaciones", OperationsLayout],
  ] as const)(
    "%s conserva las opciones y la selección validada",
    async (_, layout) => {
      const shell = await layout({ children: "Contenido" });
      expect(shell.props.branches).toEqual(branches);
      expect(shell.props.selectedBranchId).toBe("centro");
    },
  );
});
