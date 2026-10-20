type Options = {
  maxBytes?: number;
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
};

/** Immutable image bytes only. Access checks must run before every lookup. */
export function createPhotoCache({
  maxBytes = 32 * 1024 * 1024,
  maxEntries = 256,
  ttlMs = 15 * 60 * 1000,
  now = Date.now,
}: Options = {}) {
  const entries = new Map<string, { data: Buffer; expires: number }>();
  const pending = new Map<string, Promise<Buffer | null>>();
  let bytes = 0;
  function remove(key: string) {
    const entry = entries.get(key);
    if (entry) bytes -= entry.data.byteLength;
    entries.delete(key);
  }
  return {
    async read(
      key: string,
      load: () => Promise<Buffer | null>,
    ): Promise<Buffer | null> {
      const cached = entries.get(key);
      if (cached && cached.expires > now()) {
        entries.delete(key);
        entries.set(key, cached);
        return cached.data;
      }
      if (cached) remove(key);
      const running = pending.get(key);
      if (running) return running;
      const request = Promise.resolve()
        .then(load)
        .then((data) => {
          if (
            data?.byteLength &&
            data.byteLength <= maxBytes &&
            maxEntries > 0
          ) {
            while (
              entries.size &&
              (entries.size >= maxEntries || bytes + data.byteLength > maxBytes)
            ) {
              remove(entries.keys().next().value!);
            }
            entries.set(key, { data, expires: now() + ttlMs });
            bytes += data.byteLength;
          }
          return data;
        });
      pending.set(key, request);
      try {
        return await request;
      } finally {
        pending.delete(key);
      }
    },
  };
}

export type PhotoCache = ReturnType<typeof createPhotoCache>;
export const productPhotoCache = createPhotoCache();
