import { eq, and } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import * as s from "@/db/schema";
export async function seedPrintingRecipe(
  db: AppDb,
  actor: Actor,
  itemId: string,
  locationId: string,
  name = "Kybo Tea",
  stationName = "Barra",
) {
  const [item] = await db.select().from(s.items).where(eq(s.items.id, itemId));
  let [station] = await db
    .select()
    .from(s.preparationStations)
    .where(
      and(
        eq(s.preparationStations.branchId, actor.branchId!),
        eq(s.preparationStations.name, stationName),
      ),
    );
  if (!station)
    [station] = await db
      .insert(s.preparationStations)
      .values({
        branchId: actor.branchId!,
        name: stationName,
        consumptionLocationId: locationId,
      })
      .returning();
  const [product] = await db.insert(s.products).values({ name }).returning();
  await db
    .insert(s.branchProducts)
    .values({
      branchId: actor.branchId!,
      productId: product.id,
      enabled: true,
      dispatchLocationId: locationId,
    });
  await db
    .insert(s.productPrices)
    .values({ productId: product.id, channel: "counter", amount: "100" });
  const [recipe] = await db
    .insert(s.recipes)
    .values({ kind: "product", productId: product.id })
    .returning();
  const [version] = await db
    .insert(s.recipeVersions)
    .values({
      recipeId: recipe.id,
      version: 1,
      compositionModel: "configurable",
      outputName: name,
      outputUnit: "unit",
      yieldQuantity: "1",
      actorId: actor.id,
    })
    .returning();
  const [line] = await db
    .insert(s.recipeLines)
    .values({ versionId: version.id, position: 0 })
    .returning();
  await db
    .insert(s.recipeOptions)
    .values({
      lineId: line.id,
      position: 0,
      itemId: item.id,
      itemName: item.name,
      baseUnit: item.baseUnit,
      quantity: "0.1",
    });
  const [group] = await db
    .insert(s.modifierGroups)
    .values({ name: "Hielo" })
    .returning();
  const [groupVersion] = await db
    .insert(s.modifierGroupVersions)
    .values({ groupId: group.id, version: 1, name: "Hielo", actorId: actor.id })
    .returning();
  const [option] = await db
    .insert(s.modifierOptions)
    .values({
      groupVersionId: groupVersion.id,
      key: "no-ice",
      name: "Sin hielo",
      kind: "instruction",
      instruction: "Preparar sin hielo",
      position: 0,
    })
    .returning();
  const [binding] = await db
    .insert(s.recipeModifierGroups)
    .values({
      recipeVersionId: version.id,
      groupId: group.id,
      groupVersionId: groupVersion.id,
      name: "Hielo",
      position: 0,
      min: 1,
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
      recipeVersionId: version.id,
      enabled: true,
      defaultCount: 1,
      maxCount: 1,
      mode: "inherit",
    })
    .returning();
  await db
    .insert(s.recipeModifierOptionPrices)
    .values({
      recipeModifierOptionId: selection.id,
      channel: "counter",
      surcharge: "0",
    });
  const [fulfillment] = await db
    .insert(s.productFulfillmentVersions)
    .values({
      productId: product.id,
      version: 1,
      mode: "recipe",
      recipeVersionId: version.id,
    })
    .returning();
  await db
    .insert(s.productFulfillments)
    .values({ productId: product.id, versionId: fulfillment.id });
  await db
    .insert(s.preparationRoutes)
    .values({
      branchId: actor.branchId!,
      productId: product.id,
      stationId: station.id,
    });
  return {
    product,
    version,
    option,
    station,
    line: {
      productId: product.id,
      expectedFulfillmentVersionId: fulfillment.id,
      expectedRecipeVersionId: version.id,
      quantity: 1,
      price: "100",
      expectedPrice: "100.00",
      modifiers: [{ recipeModifierOptionId: selection.id, count: 1 }],
    },
  };
}
