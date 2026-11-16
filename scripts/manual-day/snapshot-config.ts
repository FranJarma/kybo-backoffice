/** Changes infrastructure only in a disposable copy; never call on the real config. */
export function manualSnapshotConfig(original: string) {
  if (!original.includes("const config: NextConfig = {"))
    throw Error(
      "La configuración de la instantánea cambió; no se parchea automáticamente.",
    );
  return (
    `import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { requireManualRun } from "./scripts/manual-day/environment";
requireManualRun();
const manualBundlerRoot = dirname(realpathSync(fileURLToPath(new URL("./node_modules", import.meta.url))));
const manualPhotoPath = fileURLToPath(new URL("./scripts/manual-day/photo-storage.ts", import.meta.url));
const manualPhotoAlias = "./scripts/manual-day/photo-storage.ts";
` +
    original.replace(
      "const config: NextConfig = {",
      `const config: NextConfig = {
  outputFileTracingRoot: manualBundlerRoot,
  // The dependency junction and the copied app must both be inside Turbopack's root.
  turbopack: { root: manualBundlerRoot, resolveAlias: { "@/modules/media/storage": manualPhotoAlias } },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, "@/modules/media/storage": manualPhotoPath };
    return config;
  },`,
    )
  );
}
