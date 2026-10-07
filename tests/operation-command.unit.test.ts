import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "../src/modules/operations/command";
import type { AppDb } from "../src/db/client";
vi.mock("../src/modules/branches/context", () => ({
  requireOperationalContext: vi.fn(),
}));
import { requireOperationalContext } from "../src/modules/branches/context";
const requestId = "a27393b4-48cb-4a22-8223-6fb257a05a70";
const actor = { id: "actor", role: "manager" as const };
describe("command replay authorization", () => {
  it("rejects privileged replays after a manager becomes staff", async () => {
    const insert = vi.fn(),
      select = vi.fn(),
      run = vi.fn();
    const db = {
      transaction: (callback: (tx: unknown) => unknown) =>
        callback({ insert, select }),
    } as unknown as AppDb;
    vi.mocked(requireOperationalContext).mockResolvedValueOnce({
      actorId: actor.id,
      branchId: "branch",
      timeZone: "UTC",
      role: "staff",
    });
    await expect(
      executeCommand(
        db,
        actor,
        "branch",
        { requestId },
        "transfer-dispatch",
        {},
        run,
      ),
    ).rejects.toThrow("permiso");
    expect(insert).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects revoked membership before looking up an old result", async () => {
    const select = vi.fn();
    const tx = { select };
    const db = {
      transaction: (run: (tx: unknown) => unknown) => run(tx),
    } as unknown as AppDb;
    vi.mocked(requireOperationalContext).mockRejectedValueOnce(
      new Error("membership revoked"),
    );
    const run = vi.fn();
    await expect(
      executeCommand(db, actor, "branch", { requestId }, "complete", {}, run),
    ).rejects.toThrow("membership revoked");
    expect(select).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects an invalid request key before opening a transaction", async () => {
    const transaction = vi.fn();
    await expect(
      executeCommand(
        { transaction } as unknown as AppDb,
        actor,
        "branch",
        { requestId: "" },
        "complete",
        {},
        vi.fn(),
      ),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
