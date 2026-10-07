import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { shellActor, requirePageActor } from "@/modules/branches/page-context";
import { requireCatalogRead } from "@/modules/branches/context";
import { AppError } from "@/lib/errors";
export async function requireCatalogPage() {
  const actor = await shellActor(await requireActor());
  try {
    await requireCatalogRead(await getDb(), actor);
  } catch (error) {
    if (error instanceof AppError && error.status === 403) redirect("/sales");
    throw error;
  }
  return actor;
}
export async function requireManagerPage() {
  const actor = await requirePageActor();
  if (actor.role === "staff") redirect("/sales");
  return actor;
}
