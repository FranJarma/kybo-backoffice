import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PoolClient } from "pg";
import type { AppDb } from "../../src/db/client";
import type { Actor } from "../../src/lib/access";
import * as s from "../../src/db/schema";
import { provisionUser } from "../../src/lib/auth";
import {
  backfill,
  reconcileCutover,
} from "../../src/modules/transition/backfill";
import { createRecipeService } from "../../src/modules/recipes/service";
import { createInventoryService } from "../../src/modules/inventory/service";
import { publishCombo } from "../../src/modules/combos/service";
import { requireManualRun, ownedPath } from "./environment";

const { root, run } = requireManualRun();
const database = ownedPath(root, "database");
if (existsSync(database))
  throw Error("El ensayo ya tiene una base. No se reinicia ni sobrescribe.");
const credentials = JSON.parse(
  await readFile(resolve(root, "credentials.json"), "utf8"),
) as {
  username: string;
  name: string;
  role: Actor["role"];
  password: string;
}[];
if (
  credentials.length !== 5 ||
  credentials.some(
    (u) => !u.username.startsWith("qa_") || !u.name.startsWith("QA · "),
  )
)
  throw Error("Las cuentas deben ser exclusivamente ficticias.");

const client = new PGlite(database);
try {
  const tables = await client.query<{ count: number }>(
    "select count(*)::int as count from pg_tables where schemaname='public'",
  );
  if (tables.rows[0].count !== 0)
    throw Error("Se requiere una base nueva y vacía.");
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  const apply = async (tag: string) => {
    for (const statement of (
      await readFile(`drizzle/${tag}.sql`, "utf8")
    ).split("--> statement-breakpoint"))
      if (statement.trim()) await client.exec(statement);
  };
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const branchId = randomUUID(),
    depotId = randomUUID();
  const mapping = {
    initialBranch: {
      id: branchId,
      code: "QA-JORNADA",
      name: "PRUEBAS · Kybo ficticio",
      timeZone: "America/Argentina/Buenos_Aires",
    },
    initialLocation: {
      id: depotId,
      code: "DEPOSITO",
      name: "Depósito principal",
    },
    memberships: [],
    catalogManagers: [],
    itemClassifications: [],
    cutoverAt: now.toISOString(),
  };
  await client.exec("begin");
  try {
    for (const entry of journal.entries.filter((e) => e.idx <= 7))
      await apply(entry.tag);
    await backfill(
      client as unknown as PoolClient,
      mapping,
      `manual-${run.runId}`,
    );
    await reconcileCutover(client as unknown as PoolClient, mapping);
    await apply("0008_data_model_finalize");
    await client.exec("update data_model_state set status='ready' where id=1");
    await client.exec("commit");
  } catch (error) {
    await client.exec("rollback");
    throw error;
  }
  for (const entry of journal.entries.filter((e) => e.idx >= 9))
    await apply(entry.tag);
  const db = drizzle({ client, schema: s }) as unknown as AppDb;
  const users: Record<string, string> = {};
  for (const person of credentials)
    users[person.username] = await provisionUser(db, {
      ...person,
      ...(person.role === "admin" ? {} : { branchId }),
    });
  const admin: Actor = { id: users.qa_admin, role: "admin", branchId };
  await db
    .insert(s.workplaceStoreAccounts)
    .values({ userId: users.qa_local, branchId, createdBy: admin.id });
  const [bar, kitchen] = await db
    .insert(s.locations)
    .values([
      { branchId, code: "BARRA", name: "Barra" },
      { branchId, code: "COCINA", name: "Cocina" },
    ])
    .returning();
  const [barStation, kitchenStation] = await db
    .insert(s.preparationStations)
    .values([
      { branchId, name: "Barra", consumptionLocationId: bar.id },
      { branchId, name: "Cocina", consumptionLocationId: kitchen.id },
    ])
    .returning();
  await db.insert(s.cashSettings).values({
    branchId,
    closeTime: "23:00",
    targetFund: "50000",
    activatedAt: now,
    updatedBy: admin.id,
  });
  await db.insert(s.attendanceSettings).values({
    branchId,
    enabled: true,
    requireLocation: false,
    requireStepUp: false,
    codeValidityMinutes: 10,
    updatedBy: admin.id,
  });
  await db.insert(s.attendanceShifts).values([
    {
      branchId,
      name: "Mañana",
      start: "09:00",
      end: "17:00",
      pauseMinutes: 30,
      updatedBy: admin.id,
    },
    {
      branchId,
      name: "Tarde",
      start: "17:00",
      end: "23:00",
      pauseMinutes: 30,
      updatedBy: admin.id,
    },
  ]);
  for (const id of [
    admin.id,
    users.qa_encargada,
    users.qa_barra,
    users.qa_cocina,
  ])
    await db
      .insert(s.attendanceParticipants)
      .values({ branchId, userId: id, enabled: true, updatedBy: admin.id });
  for (const [username, station] of [
    ["qa_barra", barStation],
    ["qa_cocina", kitchenStation],
  ] as const) {
    const [assignment] = await db
      .insert(s.attendanceAssignments)
      .values({
        branchId,
        userId: users[username],
        businessDate: today,
        kind: "work",
        name: "QA · Ventana de ensayo",
        startsAt: new Date(`${today}T00:00:00-03:00`),
        endsAt: new Date(`${today}T23:59:00-03:00`),
        pauseMinutes: 30,
        timeZone: mapping.initialBranch.timeZone,
        updatedBy: admin.id,
        reason:
          "Solo pruebas: permite recorrer los puestos durante el día sin esperar el turno real.",
      })
      .returning();
    await db.insert(s.workplaceStationAssignments).values({
      assignmentId: assignment.id,
      branchId,
      stationId: station.id,
      updatedBy: admin.id,
    });
  }
  await db.insert(s.paymentMethods).values([
    { name: "QA · Efectivo", kind: "cash", commissionPercent: "0" },
    { name: "QA · Tarjeta", kind: "card", commissionPercent: "0" },
    {
      name: "QA · Transferencia ficticia",
      kind: "transfer",
      commissionPercent: "0",
    },
  ]);
  await db
    .insert(s.customers)
    .values({ name: "Ana Prueba", email: "ana@qa.invalid" });
  await db
    .insert(s.diningTables)
    .values({ branchId, name: "QA · Mesa 1", capacity: 4, x: 0, y: 0 });
  await db.insert(s.printingSettings).values({
    branchId,
    enabled: false,
    printerName: "QA-SIN-IMPRESORA-REAL",
    updatedBy: admin.id,
  });

  const definitions = [
    ["MILK", "Leche", "ml", "beverage", "1"],
    ["TEA", "Té seco", "g", "food", "10"],
    ["WATER", "Agua", "ml", "beverage", "0"],
    ["CHAI", "Concentrado de té", "ml", "beverage", "1"],
    ["WAFFLE", "Tapa de waffle", "unit", "food", "500"],
    ["HAM", "Jamón", "g", "food", "8"],
    ["CHEESE", "Queso", "g", "food", "10"],
    ["CUP", "Vaso descartable", "unit", "packaging", "80"],
    ["STRAW", "Sorbete", "unit", "packaging", "10"],
    ["COCOA", "Cacao", "g", "food", "12"],
  ] as const;
  const items: Record<string, typeof s.items.$inferSelect> = {};
  for (const [key, name, baseUnit, itemClass, unitCost] of definitions) {
    const [item] = await db
      .insert(s.items)
      .values({
        code: `QA-${key}`,
        name: `QA · ${name}`,
        class: itemClass,
        baseUnit,
        unitCost,
        purchasable: key !== "WATER" && key !== "CHAI",
        recipeUsable: true,
        stockTracked: key !== "WATER",
      })
      .returning();
    items[key] = item;
  }
  const inventory = createInventoryService(db);
  for (const [key, locationId, quantity] of [
    ["MILK", depotId, "20000"],
    ["MILK", bar.id, "1000"],
    ["TEA", depotId, "1000"],
    ["WAFFLE", depotId, "30"],
    ["WAFFLE", kitchen.id, "2"],
    ["HAM", depotId, "3000"],
    ["HAM", kitchen.id, "200"],
    ["CHEESE", depotId, "4000"],
    ["CHEESE", kitchen.id, "200"],
    ["CUP", depotId, "80"],
    ["CUP", bar.id, "10"],
    ["STRAW", depotId, "90"],
    ["STRAW", bar.id, "10"],
    ["COCOA", depotId, "200"],
  ])
    await inventory.adjust(admin, {
      requestId: randomUUID(),
      kind: "opening",
      itemId: items[key].id,
      locationId,
      quantity,
      unitCost: items[key].unitCost?.replace(".", ",") ?? null,
      receivedOn: today,
      expiresOn: null,
      reason: "Saldos iniciales ficticios del ensayo manual",
    });

  const recipes = createRecipeService(db);
  await recipes.save(admin, {
    requestId: randomUUID(),
    kind: "preparation",
    targetId: items.CHAI.id,
    yieldQuantity: "1000",
    lines: [
      { options: [{ itemId: items.TEA.id, quantity: "50" }] },
      { options: [{ itemId: items.WATER.id, quantity: "1000" }] },
    ],
    preparation: {
      steps: [
        "Infusionar el té con el agua.",
        "Filtrar y dejar enfriar. Es una preparación ficticia.",
      ],
      estimatedMinutes: 15,
      observations: "Producir en Depósito; después trasladar a Barra.",
    },
  });
  async function product(
    name: string,
    price: string,
    stationId: string,
    locationId: string,
    components: [string, string][],
  ) {
    const [p] = await db
      .insert(s.products)
      .values({ name: `QA · ${name}`, vatRate: "0" })
      .returning();
    await db.insert(s.branchProducts).values({
      branchId,
      productId: p.id,
      enabled: true,
      dispatchLocationId: locationId,
    });
    await db.insert(s.productPrices).values(
      ["counter", "pedidosya", "ubereats"].map((channel) => ({
        productId: p.id,
        channel,
        amount: price,
      })),
    );
    const recipe = await recipes.save(admin, {
      requestId: randomUUID(),
      kind: "product",
      targetId: p.id,
      yieldQuantity: "1",
      compositionModel: "configurable",
      lines: components.map(([key, quantity]) => ({
        options: [{ itemId: items[key].id, quantity }],
      })),
    });
    await db
      .insert(s.preparationRoutes)
      .values({ branchId, productId: p.id, stationId });
    return { product: p, recipe };
  }
  const tea = await product("Bebida", "5000", barStation.id, bar.id, [
    ["MILK", "200"],
    ["CHAI", "50"],
    ["CUP", "1"],
    ["STRAW", "1"],
  ]);
  const waffle = await product(
    "Waffle",
    "8000",
    kitchenStation.id,
    kitchen.id,
    [
      ["WAFFLE", "1"],
      ["HAM", "40"],
      ["CHEESE", "50"],
    ],
  );
  await product("Cacao (control de faltante)", "4000", barStation.id, bar.id, [
    ["COCOA", "20"],
    ["WATER", "200"],
    ["CUP", "1"],
    ["STRAW", "1"],
  ]);
  const [group] = await db
    .insert(s.modifierGroups)
    .values({ name: "QA · Hielo" })
    .returning();
  const [groupVersion] = await db
    .insert(s.modifierGroupVersions)
    .values({
      groupId: group.id,
      version: 1,
      name: group.name,
      actorId: admin.id,
    })
    .returning();
  const [option] = await db
    .insert(s.modifierOptions)
    .values({
      groupVersionId: groupVersion.id,
      key: "no-ice",
      name: "Sin hielo",
      kind: "instruction",
      instruction: "PREPARAR SIN HIELO",
      position: 0,
    })
    .returning();
  const [binding] = await db
    .insert(s.recipeModifierGroups)
    .values({
      recipeVersionId: tea.recipe.versionId,
      groupId: group.id,
      groupVersionId: groupVersion.id,
      name: "Hielo",
      position: 0,
      min: 0,
      max: 1,
      factor: "1",
    })
    .returning();
  const [selection] = await db
    .insert(s.recipeModifierOptions)
    .values({
      recipeModifierGroupId: binding.id,
      groupVersionId: groupVersion.id,
      optionId: option.id,
      recipeVersionId: tea.recipe.versionId,
      enabled: true,
      defaultCount: 0,
      maxCount: 1,
      mode: "inherit",
    })
    .returning();
  await db.insert(s.recipeModifierOptionPrices).values(
    ["counter", "pedidosya", "ubereats"].map((channel) => ({
      recipeModifierOptionId: selection.id,
      channel,
      surcharge: "0",
    })),
  );
  const [combo] = await db
    .insert(s.products)
    .values({ name: "QA · Combo bebida y waffle", kind: "combo", vatRate: "0" })
    .returning();
  await db
    .insert(s.branchProducts)
    .values({ branchId, productId: combo.id, enabled: true });
  await db.insert(s.productPrices).values(
    ["counter", "pedidosya", "ubereats"].map((channel) => ({
      productId: combo.id,
      channel,
      amount: "12000",
    })),
  );
  await publishCombo(db, admin, combo.id, {
    requestId: randomUUID(),
    revision: 0,
    groups: [
      { name: "Bebida", quantity: 1, options: [{ productId: tea.product.id }] },
      {
        name: "Comida",
        quantity: 1,
        options: [{ productId: waffle.product.id }],
      },
    ],
  });

  for (const [key, locationId, minimumQuantity, targetQuantity] of [
    ["MILK", bar.id, "2000", "5000"],
    ["CHAI", bar.id, "200", "500"],
    ["WAFFLE", kitchen.id, "5", "10"],
    ["HAM", kitchen.id, "500", "1000"],
    ["CHEESE", kitchen.id, "500", "1000"],
    ["CUP", bar.id, "20", "50"],
    ["STRAW", bar.id, "20", "50"],
  ])
    await db.insert(s.replenishmentPolicies).values({
      branchId,
      locationId,
      itemId: items[key].id,
      minimumQuantity,
      targetQuantity,
      updatedBy: admin.id,
      preparationMinutes: key === "CHAI" ? 15 : null,
    });
  await db.insert(s.supplyAlertPolicies).values({
    branchId,
    itemId: items.CUP.id,
    dailyConsumption: "10",
    leadDays: 7,
    safetyDays: 3,
    targetDays: 17,
    updatedBy: admin.id,
  });
  for (const [
    name,
    key,
    presentationName,
    baseQuantity,
    price,
    leadTimeDays,
  ] of [
    ["QA · Proveedor Bolivia", "CUP", "Paquete de 25 vasos", "25", "2000", 7],
    [
      "QA · Proveedor local",
      "MILK",
      "Caja de leche de 1 litro",
      "1000",
      "1000",
      1,
    ],
  ] as const) {
    const [supplier] = await db
      .insert(s.suppliers)
      .values({
        name,
        notes: "Ficticio. No enviar pedidos ni transferencias reales.",
      })
      .returning();
    const [presentation] = await db
      .insert(s.purchasePresentations)
      .values({
        supplierId: supplier.id,
        itemId: items[key].id,
        name: presentationName,
        baseQuantity,
      })
      .returning();
    await db
      .insert(s.itemSuppliers)
      .values({ supplierId: supplier.id, itemId: items[key].id });
    await db.insert(s.supplierQuotes).values({
      supplierId: supplier.id,
      itemId: items[key].id,
      presentationId: presentation.id,
      supplierName: name,
      presentationName,
      baseQuantity,
      baseUnit: items[key].baseUnit,
      price,
      quotedOn: today,
      leadTimeDays,
      actorId: admin.id,
    });
  }
  await writeFile(
    resolve(root, "dataset.json"),
    JSON.stringify(
      {
        branchId,
        businessDate: today,
        depotId,
        barId: bar.id,
        kitchenId: kitchen.id,
        users,
        publicQueueUrl: `${run.origin}/pickup/${(await db.select().from(s.branches))[0].publicQueueKey}`,
        version: run.revision,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    "Base ficticia preparada: 5 cuentas, 3 ubicaciones, 4 productos, 10 insumos. Sin ventas, compras ni caja abierta.",
  );
} finally {
  await client.close();
}
