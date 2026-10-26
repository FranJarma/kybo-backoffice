"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReadyTracker,
  type ReadyRow,
  type ReadyObservation,
} from "./ready-tracker";
import { ReadySoundPlayer, type ReadySoundState } from "./ready-sound";

export function useReadySound(resource: string) {
  const [state, setState] = useState<ReadySoundState>("enabling");
  const player = useRef<ReadySoundPlayer | null>(null);
  const wanted = useRef(true);
  const tracking = useMemo(
    () => ({ resource, tracker: new ReadyTracker() }),
    [resource],
  );

  useEffect(() => {
    const sound = new ReadySoundPlayer(() => {
      const Context =
        window.AudioContext ||
        (
          window as Window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      return Context ? new Context() : undefined;
    }, setState);
    player.current = sound;
    void sound.enable();
    const unlock = (event: Event) => {
      if (!event.isTrusted || !wanted.current) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-ready-sound-control]")
      )
        return;
      if (
        event instanceof KeyboardEvent &&
        (event.key === "Escape" ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey)
      )
        return;
      void sound.enable();
    };
    document.addEventListener("click", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("click", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      player.current = null;
      sound.dispose();
    };
  }, []);

  const observe = useCallback(
    (scope: string, rows: readonly ReadyRow[], options?: ReadyObservation) => {
      if (tracking.tracker.observe(scope, rows, options))
        player.current?.play();
    },
    [tracking],
  );
  const notify = useCallback(
    (id: string) => {
      if (tracking.tracker.confirm(id)) player.current?.play();
    },
    [tracking],
  );
  const enable = useCallback(() => {
    wanted.current = true;
    void player.current?.enable();
  }, []);
  const mute = useCallback(() => {
    wanted.current = false;
    player.current?.mute();
  }, []);

  return { state, enable, mute, observe, notify };
}
