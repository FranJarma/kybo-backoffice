import { CircleAlert } from "lucide-react";

export function StockShortageNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p role="alert" className="flex items-center gap-2 font-semibold">
        <CircleAlert size={20} aria-hidden="true" /> Falta stock para completar
        el pedido.
      </p>
      <details>
        <summary className="min-h-12 cursor-pointer content-center font-semibold underline underline-offset-4">
          Ver detalle de insumos faltantes
        </summary>
        <p className="whitespace-pre-line break-words">{message}</p>
      </details>
      <p>
        Volvé al pedido para ajustar las cantidades o revisar la reposición.
      </p>
    </div>
  );
}
