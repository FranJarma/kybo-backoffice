import { CatalogPage } from "@/components/catalog-page";
import { requireActor } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function Page() {
  if ((await requireActor()).role !== "admin") redirect("/");
  return <CatalogPage entity="payment-methods" />;
}
