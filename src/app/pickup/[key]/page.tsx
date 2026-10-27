import type { Metadata } from "next";
import { PickupDisplay } from "@/components/pickup/public-display";
export const metadata: Metadata = {
  title: "Retirá tu pedido · Kybo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  return <PickupDisplay queueKey={(await params).key} />;
}
