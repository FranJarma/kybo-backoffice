import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { requireManualRun, ownedPath } from "./environment";

/** Selected only by the manual snapshot's Webpack configuration. */
export function photoStorage() {
  const { root } = requireManualRun();
  function file(key: string) {
    requireManualRun(root);
    if (!/^[a-zA-Z0-9/_-]+\.(webp|png|jpg)$/.test(key) || key.length > 500)
      throw Error("Clave de comprobante inválida.");
    return ownedPath(root, "uploads", key);
  }
  return {
    async put(key: string, data: Buffer) {
      const target = file(key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data, { flag: "wx" });
    },
    async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
      try {
        const data = await readFile(file(key));
        return new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key: string) {
      try {
        await unlink(file(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
