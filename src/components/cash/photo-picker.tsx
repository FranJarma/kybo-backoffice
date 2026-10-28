"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated receipt endpoint; never optimized or cached publicly. */
import { useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  X,
  ZoomIn,
  ZoomOut,
  Check,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldCaption } from "@/components/ui/field-caption";
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
  const [stage, setStage] = useState<"preparing" | "uploading" | null>(null),
    [zoom, setZoom] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    photoId: string | null;
  } | null>(null);
  const localUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    },
    [],
  );
  function clearPreview() {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = null;
    setPreview(null);
  }
  const uploading = stage !== null;
  const displayedUrl =
    preview && (uploading || preview.photoId === photo?.id)
      ? preview.url
      : photo?.url;
  const requirementId = useId();
  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return onError("Elegí una foto JPG, PNG o WebP.");
    if (file.size > 10 * 1024 * 1024)
      return onError("La foto supera los 10 MB. Elegí una más pequeña.");
    setStage("preparing");
    onUploading(true);
    onError("");
    try {
      const url = URL.createObjectURL(file);
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
      localUrl.current = url;
      setPreview({ url, photoId: null });
      const image = await cashUploadImage(file);
      setStage("uploading");
      const uploaded = await cashBranchRequest<{ id: string; url: string }>(
        branchId,
        `/api/cash/photos?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": image.type },
          body: image,
        },
      );
      setPreview({ url, photoId: uploaded.id });
      onChange({ id: uploaded.id, url: cashPhotoUrl(uploaded.id, branchId) });
      setZoom(false);
    } catch (error) {
      clearPreview();
      onError((error as Error).message);
    } finally {
      setStage(null);
      onUploading(false);
    }
  }
  return (
    <div
      className={`cash-photo-picker ${displayedUrl ? "cash-photo-has-image" : ""}`}
      role="group"
      aria-busy={uploading}
      aria-label={`Foto del cierre de lote ${index + 1}`}
      aria-describedby={requirementId}
    >
      <input
        ref={camera}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label={`Tomar foto del lote ${index + 1}`}
        aria-required={!photo}
        aria-describedby={requirementId}
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
        aria-required={!photo}
        aria-describedby={requirementId}
        disabled={disabled || uploading}
        onChange={choose}
      />
      {displayedUrl ? (
        <>
          <div
            className="cash-photo-heading"
            data-pending={uploading || undefined}
          >
            <span>
              {uploading ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              {uploading ? "Foto seleccionada" : "Comprobante agregado"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Quitar foto del lote ${index + 1}`}
              disabled={disabled || uploading}
              onClick={() => {
                clearPreview();
                onChange(null);
              }}
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
            <img src={displayedUrl} alt={`Comprobante del lote ${index + 1}`} />
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
            <b>
              <FieldCaption required>Foto del cierre de lote</FieldCaption>
            </b>
            <p>Que se vean el número de lote y el total.</p>
          </div>
        </div>
      )}
      <div className="cash-photo-actions">
        <Button
          type="button"
          variant="outline"
          aria-describedby={requirementId}
          onClick={() => camera.current?.click()}
          disabled={disabled || uploading}
        >
          <Camera />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-describedby={requirementId}
          onClick={() => gallery.current?.click()}
          disabled={disabled || uploading}
        >
          <ImagePlus />
          Elegir foto
        </Button>
      </div>
      <small id={requirementId} aria-live="polite">
        {uploading
          ? stage === "preparing"
            ? "Preparando imagen…"
            : "Guardando comprobante…"
          : `${photo ? "JPG, PNG o WebP" : "Obligatoria para registrar el lote · JPG, PNG o WebP"} · hasta 10 MB`}
      </small>
    </div>
  );
}
