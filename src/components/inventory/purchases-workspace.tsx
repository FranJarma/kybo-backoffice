"use client";
import { useState } from "react";
import { PurchaseOrdersManager } from "./purchase-orders-manager";
import { PurchasesManager } from "./purchases-manager";
export function PurchasesWorkspace({
  actorId,
  timeZone,
  initialOrderId,
}: {
  actorId: string;
  timeZone: string;
  initialOrderId?: string;
}) {
  const [tab, setTab] = useState("orders");
  return (
    <div className="space-y-6">
      <nav
        aria-label="Compras"
        className="flex gap-2 overflow-x-auto border-b border-line pb-3"
      >
        {[
          { id: "orders", label: "Pedidos a proveedores" },
          { id: "receipts", label: "Recepciones" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            className={`min-h-12 shrink-0 rounded-lg px-4 text-sm font-semibold ${tab === t.id ? "bg-blue-50 text-blue-700" : "text-muted-foreground"}`}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "orders" ? (
        <div>
          <PurchaseOrdersManager
            actorId={actorId}
            timeZone={timeZone}
            initialOrderId={initialOrderId}
          />
        </div>
      ) : (
        <div>
          <PurchasesManager actorId={actorId} timeZone={timeZone} />
        </div>
      )}
    </div>
  );
}
