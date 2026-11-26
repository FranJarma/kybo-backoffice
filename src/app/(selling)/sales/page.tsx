import { requirePageActor as requireActor } from "@/modules/branches/page-context";
import { SalesManager } from "@/components/sales/sales-manager";
import localFont from "next/font/local";
import "@/components/sales/pos.css";

const barlow = localFont({
  src: [
    {
      path: "../../../../public/fonts/barlow-regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../../public/fonts/barlow-medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../../public/fonts/barlow-semibold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../../public/fonts/barlow-bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pos",
  display: "swap",
});
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor(),
    query = await searchParams;
  return (
    <SalesManager
      key={`${actor.branchId}:${query.table ?? ""}`}
      actorId={actor.id}
      branchId={actor.branchId!}
      role={actor.role}
      accountKind={actor.accountKind}
      fontClassName={`${barlow.variable} ${barlow.className}`}
      initialAccount={
        typeof query.account === "string" ? query.account : undefined
      }
      initialTable={typeof query.table === "string" ? query.table : undefined}
    />
  );
}
