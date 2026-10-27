import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SellingLayout from "../src/app/(selling)/layout";
import OperationsLayout from "../src/app/(operations)/layout";

vi.stubGlobal("React", React);
const { actor, branches, sidebarCookie } = vi.hoisted(() => ({
  sidebarCookie: { value: undefined as string | undefined },
  actor: { id: "user-1", role: "admin", branchId: "centro" },
  branches: [
    { id: "principal", name: "Principal" },
    { id: "centro", name: "Centro" },
  ],
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "kybo-sidebar" && sidebarCookie.value
        ? { value: sidebarCookie.value }
        : undefined,
  }),
}));
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
  beforeEach(() => {
    sidebarCookie.value = undefined;
  });
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
  it.each([
    ["collapsed", true],
    ["expanded", false],
    ["invalid", false],
    [undefined, false],
  ] as const)(
    "restaura el ancho inicial con la cookie %s en ambas áreas",
    async (value, expected) => {
      sidebarCookie.value = value;
      for (const layout of [SellingLayout, OperationsLayout]) {
        const shell = await layout({ children: "Contenido" });
        expect(shell.props.initialSidebarCollapsed).toBe(expected);
      }
    },
  );
});
