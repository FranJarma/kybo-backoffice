"use client";
import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { cashBranchRequest } from "./shared";
import { CashOpeningAction } from "./opening-action";

type Status = {
  available: boolean;
  activated: boolean;
  open: boolean;
  sessionId: string | null;
  canOpen: boolean;
  actorId?: string;
};
export function CashStatusGate({
  branchId,
  actorId,
}: {
  branchId: string;
  actorId?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      void cashBranchRequest<Status>(branchId, "/api/cash/status", {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) setStatus(result);
        })
        .catch(() => {
          /* Collection commands remain authoritative when the status is unavailable. */
        });
    };
    load();
    const changed = (event: Event) => {
      if (
        (event as CustomEvent<{ branchId: string }>).detail?.branchId ===
        branchId
      )
        load();
    };
    window.addEventListener("focus", load);
    window.addEventListener("kybo:cash-changed", changed);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
      window.removeEventListener("kybo:cash-changed", changed);
    };
  }, [branchId]);
  if (!status?.available || !status.activated || status.open) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-1 text-sm text-amber-950"
    >
      <Banknote className="size-5 shrink-0" />
      <span>
        <strong>Caja cerrada.</strong>{" "}
        {status.canOpen
          ? "Abrila antes de registrar cobros locales."
          : "Una persona autorizada debe abrirla antes de registrar cobros locales."}
      </span>
      {status.canOpen && (status.actorId || actorId) ? (
        <CashOpeningAction
          branchId={branchId}
          actorId={status.actorId || actorId!}
          variant="ghost"
          className="font-semibold text-inherit underline underline-offset-4"
        />
      ) : null}
    </div>
  );
}
