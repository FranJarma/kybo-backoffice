import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/errors";
const mocks = vi.hoisted(() => ({
  actor: { id: "test", role: "staff", catalogManager: false },
  read: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/auth", () => ({ requireActor: async () => mocks.actor }));
vi.mock("@/modules/branches/page-context", () => ({
  shellActor: async () => mocks.actor,
  requirePageActor: async () => mocks.actor,
}));
vi.mock("@/modules/branches/context", () => ({
  requireCatalogRead: mocks.read,
}));
import { requireCatalogPage, requireManagerPage } from "../src/lib/page-access";
describe("acceso directo a páginas", () => {
  beforeEach(() => {
    mocks.actor.role = "staff";
    mocks.actor.catalogManager = false;
    mocks.read.mockReset();
  });
  it("no permite producción a personal aunque gestione catálogo", async () => {
    mocks.actor.catalogManager = true;
    await expect(requireManagerPage()).rejects.toThrow("redirect:/sales");
  });
  it("permite operación a encargados", async () => {
    mocks.actor.role = "manager";
    await expect(requireManagerPage()).resolves.toBe(mocks.actor);
  });
  it("consulta la autorización real del catálogo antes de mostrarlo", async () => {
    mocks.read.mockRejectedValue(new AppError("FORBIDDEN", "denied", 403));
    await expect(requireCatalogPage()).rejects.toThrow("redirect:/sales");
    expect(mocks.read).toHaveBeenCalledWith({}, mocks.actor);
  });
  it("no oculta errores internos como una denegación de acceso", async () => {
    mocks.read.mockRejectedValue(new Error("database unavailable"));
    await expect(requireCatalogPage()).rejects.toThrow("database unavailable");
  });
});
