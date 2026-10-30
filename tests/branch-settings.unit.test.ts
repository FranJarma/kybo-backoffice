import { describe, expect, it } from "vitest";
import {
  memberAccess,
  resolveBranchSelection,
} from "@/components/branches/presentation";

describe("selección de la sucursal administrada", () => {
  const rows = [{ id: "alberdi" }, { id: "centro" }];
  it("abre la sucursal operativa actual aunque no sea la primera", () => {
    expect(resolveBranchSelection(rows, "", "centro")).toBe("centro");
  });
  it("conserva la selección administrativa al actualizar el listado", () => {
    expect(resolveBranchSelection(rows, "alberdi", "centro")).toBe("alberdi");
  });
  it("descarta preferencias y selecciones que dejaron de estar disponibles", () => {
    expect(resolveBranchSelection(rows, "archivada", "centro")).toBe("centro");
    expect(resolveBranchSelection(rows, "archivada", "otra")).toBe("alberdi");
  });
  it("no conserva un destino de escritura cuando no hay sucursales", () => {
    expect(resolveBranchSelection([], "alberdi", "centro")).toBe("");
  });
});

describe("acceso efectivo mostrado en una sucursal", () => {
  it("reconoce al administrador sin depender de una membresía local", () => {
    expect(
      memberAccess({ accountRole: "admin", role: null, revokedAt: null }),
    ).toEqual({ enabled: true, global: true, label: "Administrador" });
  });
  it("no muestra una revocación local como restricción de un administrador", () => {
    expect(
      memberAccess({
        accountRole: "admin",
        role: "staff",
        revokedAt: "2026-10-28",
      }).enabled,
    ).toBe(true);
  });
  it("distingue una persona sin acceso de un encargado habilitado", () => {
    expect(
      memberAccess({ accountRole: "staff", role: null, revokedAt: null }),
    ).toEqual({ enabled: false, global: false, label: "Sin acceso" });
    expect(
      memberAccess({ accountRole: "staff", role: "manager", revokedAt: null }),
    ).toEqual({ enabled: true, global: false, label: "Encargado" });
  });
  it("un rol revocado no se cuenta como acceso vigente", () => {
    expect(
      memberAccess({
        accountRole: "manager",
        role: "manager",
        revokedAt: "2026-10-28",
      }),
    ).toEqual({ enabled: false, global: false, label: "Sin acceso" });
  });
});
