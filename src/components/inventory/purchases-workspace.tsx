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
    [visited, setVisited] = useState(
      () => new Set([initialOrderId || initialLines ? "orders" : "needs"]),
    ),
    [busy, setBusy] = useState({
      needs: false,
      orders: false,
      receipts: false,
    });
  const locked = Object.values(busy).some(Boolean);
  const needsBusy = useCallback(
    (value: boolean) =>
      setBusy((old) => (old.needs === value ? old : { ...old, needs: value })),
    [],
  );
  const ordersBusy = useCallback(
    (value: boolean) =>
      setBusy((old) =>
        old.orders === value ? old : { ...old, orders: value },
      ),
    [],
  );
  const receiptsBusy = useCallback(
    (value: boolean) =>
      setBusy((old) =>
        old.receipts === value ? old : { ...old, receipts: value },
      ),
    [],
  );
  const prepare = useCallback((lines: PurchaseSeed[]) => {
    setDraft(lines);
    setSequence((n) => n + 1);
    setVisited((old) => new Set([...old, "orders"]));
    setTab("orders");
  }, []);
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8 text-brand">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compras</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
            <Button variant="outline" className="min-h-12" asChild>
              <Link href="/inventory/items" prefetch={false}>
                <Settings2 className="size-4" />
                Configurar insumos
              </Link>
            </Button>
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
          setVisited((old) => new Set([...old, id]));
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
        {initialNotice && (
          <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm">
            {initialNotice}
          </p>
        )}
        {visited.has("needs") && (
          <Tabs.Content
            value="needs"
            forceMount
            hidden={tab !== "needs"}
            className="space-y-6"
          >
            <PurchaseNeeds
              active={tab === "needs"}
              actorId={actorId}
              timeZone={timeZone}
              onPrepare={prepare}
              initialConfigurationId={initialConfigurationId}
              onBusy={needsBusy}
            />
          </Tabs.Content>
        )}
        {visited.has("orders") && (
          <Tabs.Content
            value="orders"
            forceMount
            hidden={tab !== "orders"}
            className="space-y-6"
          >
            <PurchaseOrdersManager
              active={tab === "orders"}
              key={`orders:${sequence}`}
              actorId={actorId}
              timeZone={timeZone}
              initialOrderId={initialOrderId}
              initialDraft={draft}
              embedded
              onBusy={ordersBusy}
            />
          </Tabs.Content>
        )}
        {visited.has("receipts") && (
          <Tabs.Content
            value="receipts"
            forceMount
            hidden={tab !== "receipts"}
            className="space-y-6"
          >
            <PurchasesManager
              active={tab === "receipts"}
              actorId={actorId}
              timeZone={timeZone}
              embedded
              onBusy={receiptsBusy}
            />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </div>
  );
}
