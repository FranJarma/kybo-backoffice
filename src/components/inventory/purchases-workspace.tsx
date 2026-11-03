"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { PurchaseOrdersManager } from "./purchase-orders-manager";
import { PurchasesManager } from "./purchases-manager";
import { PurchaseNeeds } from "./purchase-needs";
import type { PurchaseSeed } from "@/modules/supply-alerts/presentation";
export function PurchasesWorkspace({
  actorId,
  timeZone,
  initialOrderId,
  initialLines,
  initialConfigurationId,
  initialNotice,
}: {
  actorId: string;
  timeZone: string;
  initialOrderId?: string;
  initialLines?: PurchaseSeed[];
  initialConfigurationId?: string;
  initialNotice?: string;
}) {
  const [tab, setTab] = useState(
      initialOrderId || initialLines ? "orders" : "needs",
    ),
    [draft, setDraft] = useState<PurchaseSeed[] | undefined>(initialLines),
    [sequence, setSequence] = useState(0),
    [locked, setLocked] = useState(false);
  const prepare = useCallback((lines: PurchaseSeed[]) => {
    setDraft(lines);
    setSequence((n) => n + 1);
    setTab("orders");
  }, []);
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8 text-brand">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Inventario y compras
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Compras</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Organizá lo que falta pedir y acompañá cada entrega.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {locked ? (
            <Button variant="outline" className="min-h-12" disabled>
              <Settings2 className="size-4" />
              Configurar insumos
            </Button>
          ) : (
            <Link
              href="/inventory/items"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold"
            >
              <Settings2 className="size-4" />
              Configurar insumos
            </Link>
          )}
          <Button
            className="min-h-12"
            disabled={locked}
            onClick={() => prepare([])}
          >
            <Plus className="size-4" />
            Nuevo pedido
          </Button>
        </div>
      </header>
      <Tabs.Root
        value={tab}
        className="space-y-6"
        onValueChange={(id) => {
          if (locked) return;
          setTab(id);
          if (id !== "orders") setDraft(undefined);
        }}
      >
        <Tabs.List aria-label="Compras">
          {[
            ["needs", "Para comprar"],
            ["orders", "Pedidos"],
            ["receipts", "Recepciones"],
          ].map(([id, label]) => (
            <Tabs.Trigger key={id} value={id} disabled={locked}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value={tab} className="space-y-6">
          {initialNotice && (
            <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm">
              {initialNotice}
            </p>
          )}
          {tab === "needs" ? (
            <PurchaseNeeds
              actorId={actorId}
              timeZone={timeZone}
              onPrepare={prepare}
              initialConfigurationId={initialConfigurationId}
              onBusy={setLocked}
            />
          ) : tab === "orders" ? (
            <PurchaseOrdersManager
              key={`orders:${sequence}`}
              actorId={actorId}
              timeZone={timeZone}
              initialOrderId={initialOrderId}
              initialDraft={draft}
              embedded
              onBusy={setLocked}
            />
          ) : (
            <PurchasesManager
              actorId={actorId}
              timeZone={timeZone}
              embedded
              onBusy={setLocked}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
