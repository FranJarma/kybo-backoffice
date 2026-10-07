// The multi-location cutover requires an explicit, reviewed data mapping.
// Prevent an ordinary migration command from applying expansion without backfill.
throw new Error(
  "Data-model transition requires scripts/data-model-preflight.ts and the reviewed transition runner. Generic migration is disabled for this release.",
);
export {};
