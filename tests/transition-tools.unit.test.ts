import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("pg", () => ({ Pool: vi.fn() }));
import { Pool } from "pg";
import { runTransition } from "../scripts/data-model-transition";
import { runPreflight } from "../scripts/data-model-preflight";
afterEach(() => vi.unstubAllEnvs());
describe("herramientas de transición sin efectos al importar", () => {
  it("importarlas no abre conexiones", () => {
    expect(Pool).not.toHaveBeenCalled();
  });
  it("el modo informe exige un destino explícito", async () => {
    vi.stubEnv("KYBO_TRANSITION_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgres://application.invalid/active");
    await expect(runPreflight([])).rejects.toThrow(
      "KYBO_TRANSITION_DATABASE_URL",
    );
    expect(Pool).not.toHaveBeenCalled();
  });
  it("el runner sin --apply utiliza el informe y tampoco usa la conexión de la aplicación", async () => {
    vi.stubEnv("KYBO_TRANSITION_DATABASE_URL", "");
    await expect(runTransition([])).rejects.toThrow(
      "KYBO_TRANSITION_DATABASE_URL",
    );
    expect(Pool).not.toHaveBeenCalled();
  });
});
