"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ProductPhoto({
  id,
  name,
}: {
  id?: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-muted">
      {id && failed !== id ? (
        <Image
          unoptimized
          src={`/api/media/${id}`}
          alt={name}
          fill
          sizes="(max-width: 640px) 40vw, 200px"
          className="object-cover"
          onError={() => setFailed(id)}
        />
      ) : (
        <ImageIcon size={28} aria-label="Sin foto" />
      )}
    </span>
  );
}
export function PhotoEditor({
  value,
  onChange,
  onBusy,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <fieldset
      className="space-y-5 rounded-xl border border-line p-5 sm:p-6"
      disabled={disabled}
    >
      <legend className="px-2 font-semibold text-brand">Foto principal</legend>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className="w-28 shrink-0 sm:w-32">
          <ProductPhoto id={value} name="Vista previa del producto" />
        </div>
        <div className="min-w-0 w-full space-y-4">
          <label className="block text-sm font-semibold">
            {value ? "Reemplazar foto" : "Subir foto"}
            <input
              className="mt-2 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:p-2 file:text-brand"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError("");
                if (
                  file.size > 4 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  setError(
                    "Usá JPEG, PNG o WebP de hasta 4 MB. Si es HEIC, convertí la foto a JPEG.",
                  );
                  return;
                }
                onBusy(true);
                try {
                  const res = await fetch("/api/media", {
                    method: "POST",
                    headers: { "Content-Type": file.type },
                    body: file,
                  });
                  const data = await res.json();
                  if (!res.ok)
                    throw new Error(data.error ?? "No se pudo subir la foto.");
                  onChange(data.id);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No se pudo subir la foto.",
                  );
                } finally {
                  onBusy(false);
                }
              }}
            />
          </label>
          <p className="text-xs text-muted">
            JPEG, PNG o WebP · hasta 4 MB. Guardá la ficha para confirmar el
            cambio.
          </p>
          {value && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(null)}
            >
              Quitar foto
            </Button>
          )}
        </div>
      </div>
      {disabled && (
        <p role="status" className="text-sm text-muted">
          Procesando…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
