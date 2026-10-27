"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReadySoundState } from "./ready-sound";

export function SoundControl({
  state,
  enable,
  mute,
}: {
  state: ReadySoundState;
  enable: () => void;
  mute: () => void;
}) {
  const enabled = state === "on";
  return (
    <div
      data-ready-sound-control
      className="flex max-w-full flex-wrap items-center gap-2"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9"
        aria-pressed={enabled}
        disabled={state === "enabling" || state === "unsupported"}
        onClick={enabled ? mute : enable}
      >
        {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        {enabled
          ? "Silenciar sonido"
          : state === "enabling"
            ? "Activando sonido…"
            : state === "unsupported"
              ? "Sonido no disponible"
              : "Activar sonido"}
      </Button>
      {(state === "blocked" || state === "unsupported") && (
        <p
          role="status"
          className="max-w-64 text-xs font-medium text-amber-800"
        >
          {state === "blocked"
            ? "Para habilitar el sonido, tocá la pantalla."
            : "Este navegador no permite avisos de sonido."}
        </p>
      )}
    </div>
  );
}
