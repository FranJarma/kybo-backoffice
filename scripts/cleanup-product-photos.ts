import "dotenv/config";
import { getDb } from "../src/db/client";
import { cleanPhotos } from "../src/modules/media/service";
import { photoStorage } from "../src/modules/media/storage";
const args = process.argv.slice(2);
if (args.some((a) => a !== "--apply"))
  throw new Error(
    "Uso: cleanup-product-photos.ts [--apply]. Sin opciones sólo informa.",
  );
const report = await cleanPhotos(
  await getDb(),
  photoStorage(),
  args.includes("--apply"),
);
console.log(
  JSON.stringify({ apply: args.includes("--apply"), assets: report }, null, 2),
);
