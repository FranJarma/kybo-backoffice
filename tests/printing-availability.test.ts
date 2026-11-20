import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { enqueueOrderPrints } from "@/modules/printing/snapshot";
import { getPrintingSnapshot } from "@/modules/printing/service";
import { user, operationalUsers } from "@/db/schema";
it("keeps order confirmation compatible before the additive printing migration", async () => {
  const c = await createDataModelTestContext({ legacyPrinting: true });
  try {
    const actor = {
      id: "printing-legacy-admin",
      role: "admin" as const,
      branchId: c.mapping.initialBranch.id,
    };
    await c.db
      .insert(user)
      .values({ id: actor.id, name: "Test", email: "legacy-print@test.local" });
    await c.db
      .insert(operationalUsers)
      .values({ userId: actor.id, role: "admin" });
    await expect(
      c.db.transaction((tx) => enqueueOrderPrints(tx, actor, randomUUID())),
    ).resolves.toBeUndefined();
    expect(await getPrintingSnapshot(c.db, actor)).toMatchObject({
      ready: false,
      jobs: [],
    });
  } finally {
    await c.close();
  }
});
