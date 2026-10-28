"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated receipt endpoint; never optimized or cached publicly. */
import { useRef, useState } from "react";
import { Camera, ImagePlus, X, ZoomIn, ZoomOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cashBranchRequest, cashPhotoUrl } from "./shared";
import type { LotDraft } from "./draft";
import { cashUploadImage } from "./photo-upload";

export function CashPhotoPicker({
  sessionId,
  branchId,
  photo,
  index,
  disabled,
  onChange,
  onError,
  onUploading,
}: {
  sessionId: string;
  branchId: string;
  photo: LotDraft["photo"];
  index: number;
  disabled: boolean;
  onChange: (photo: LotDraft["photo"]) => void;
  onError: (message: string) => void;
  onUploading: (busy: boolean) => void;
}) {
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false),
    [zoom, setZoom] = useState(false);
  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return onError("Elegí una foto JPG, PNG o WebP.");
    if (file.size > 10 * 1024 * 1024)
      return onError("La foto supera los 10 MB. Elegí una más pequeña.");
    setUploading(true);
    onUploading(true);
    onError("");
    try {
      const image = await cashUploadImage(file);
      const uploaded = await cashBranchRequest<{ id: string; url: string }>(
        branchId,
        `/api/cash/photos?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": image.type },
          body: image,
        },
      );
      onChange({ id: uploaded.id, url: cashPhotoUrl(uploaded.id, branchId) });
      setZoom(false);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setUploading(false);
      onUploading(false);
    }
  }
  return (
    <div className="cash-photo-picker">
      <input
        ref={camera}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label={`Tomar foto del lote ${index + 1}`}
        disabled={disabled || uploading}
        onChange={choose}
      />
      <input
        ref={gallery}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Elegir foto del lote ${index + 1}`}
        disabled={disabled || uploading}
        onChange={choose}
      />
      {photo ? (
        <>
          <div className="cash-photo-heading">
            <span>
              <Check size={16} /> Comprobante agregado
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Quitar foto del lote ${index + 1}`}
              disabled={disabled || uploading}
              onClick={() => onChange(null)}
            >
              <X />
            </Button>
          </div>
          <button
            type="button"
            className={`cash-photo-preview ${zoom ? "cash-photo-expanded" : ""}`}
            onClick={() => setZoom(!zoom)}
            aria-label={`${zoom ? "Reducir" : "Ampliar"} foto del lote ${index + 1}`}
            aria-pressed={zoom}
          >
            <img src={photo.url} alt={`Comprobante del lote ${index + 1}`} />
            <span>
              {zoom ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
              {zoom ? "Reducir" : "Ampliar foto"}
            </span>
          </button>
        </>
      ) : (
        <div className="cash-photo-prompt">
          <Camera size={28} />
          <div>
            <b>Foto del cierre de lote</b>
            <p>Que se vean el número de lote y el total.</p>
          </div>
        </div>
      )}
      <div className="cash-photo-actions">
        <Button
          type="button"
          variant="outline"
          onClick={() => camera.current?.click()}
          disabled={disabled || uploading}
        >
          <Camera />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => gallery.current?.click()}
          disabled={disabled || uploading}
        >
          <ImagePlus />
          Elegir foto
        </Button>
      </div>
      <small aria-live="polite">
        {uploading
          ? "Guardando comprobante…"
          : "Comprobante privado · JPG, PNG o WebP · hasta 10 MB"}
      </small>
    </div>
  );
}
