import { failSaleCleanupOnce } from "../helpers/pos-storage-failure";
import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SaleDetail, SaleLookup } from "../../src/modules/sales/types";
import type { ComboSaleConfiguration } from "../../src/components/sales/combo-configurator";
import type { PrintingSnapshot } from "../../src/modules/printing/types";
const require = createRequire(import.meta.url);
const reportDirectory = process.env.POS_SURFACE_REPORT_DIR;
const posFonts = [
  { file: "barlow-regular.ttf", weight: 400 },
  { file: "barlow-medium.ttf", weight: 500 },
  { file: "barlow-semibold.ttf", weight: 600 },
  { file: "barlow-bold.ttf", weight: 700 },
];
const posFontCss = posFonts
  .filter((font) => existsSync(`public/fonts/${font.file}`))
  .map(
    (font) =>
      `@font-face{font-family:Barlow;src:url(/fonts/${font.file});font-weight:${font.weight};font-display:swap}`,
  )
  .join("\n");
let css = "",
  script = "",
  shellScript = "",
  scriptBytes = 0;
const id = (number: number) =>
  `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const rows = [
  {
    id: id(1),
    name: "Oreo Iced Latte",
    price: "7500.00",
    categoryId: "lattes",
  },
  { id: id(2), name: "Shake Oreo", price: "7900.00", categoryId: "shakes" },
  { id: id(3), name: "Soft Frutilla", price: "3500.00", categoryId: "soft" },
  { id: id(4), name: "Kybo Tea", price: "6900.00", categoryId: "lattes" },
  {
    id: id(5),
    name: "Taro Iced Latte",
    price: "7900.00",
    categoryId: "lattes",
  },
  {
    id: id(6),
    name: "Matcha Iced Latte",
    price: "7900.00",
    categoryId: "lattes",
  },
  { id: id(7), name: "Kybo Frozen", price: "4900.00", categoryId: "shakes" },
  { id: id(8), name: "Cappuccino", price: "3500.00", categoryId: "lattes" },
  {
    id: id(9),
    name: "Waffle con jamón y queso",
    price: "6500.00",
    categoryId: "salados",
  },
].map((row) => ({
  ...row,
  configured: true,
  vatPending: false,
  pricingRevision: 1,
  fulfillmentVersionId: id(100 + Number(row.id.slice(-3))),
}));
// Handed-off ZIP references; independent of the production presentation resolver.
const canonicalProducts = [
  {
    id: "d8667694-d0b4-49ff-90cb-e72f3cc6aa17",
    name: "Oreo Iced Latte",
    categoryId: "lattes",
    photo: "oreo-iced-latte.webp",
    bands: [
      "CE9D76",
      "CE9D76",
      "F8A63A",
      "F8A63A",
      "F8A63A",
      "F8A63A",
      "33231D",
      "33231D",
    ],
  },
  {
    id: "36145bed-d3f4-4ddc-9289-1097992cd692",
    name: "Kybo Shake",
    categoryId: "shakes",
    photo: "kybo-shake-americana.webp",
    bands: [
      "E1C9AE",
      "EDD5BF",
      "EDD5BF",
      "EDD5BF",
      "EDD5BF",
      "EDD5BF",
      "2B1A14",
      "2B1A14",
    ],
  },
  {
    id: "a83e25f6-8b50-493f-a9fe-57ba74a03533",
    name: "Kybo Shake Oreo",
    categoryId: "shakes",
    photo: "kybo-shake-oreo.webp",
    bands: [
      "C3A191",
      "D5B7A9",
      "D5B7A9",
      "D5B7A9",
      "D5B7A9",
      "D5B7A9",
      "231412",
      "231412",
    ],
  },
  {
    id: "d47f268b-2d57-4642-a9ff-5695aa0c2ce7",
    name: "Kybo Shake Taro",
    categoryId: "shakes",
    photo: "kybo-shake-taro.webp",
    bands: [
      "D2252A",
      "A692AD",
      "A692AD",
      "A692AD",
      "A692AD",
      "A692AD",
      "22151A",
      "22151A",
    ],
  },
  {
    id: "30a9fd90-2f51-41b1-839c-8760f54b20a6",
    name: "Kybo Frozen",
    categoryId: "shakes",
    photo: "frozen-mango-y-durazno.webp",
    bands: [
      "ED8C0B",
      "FFB722",
      "FFB722",
      "FFB722",
      "FFB722",
      "FFB722",
      "BD0407",
      "BD0407",
    ],
  },
  {
    id: "35f4099a-a0d5-4f0d-afa5-ab5dfff9b1c9",
    name: "Kybo Soft Sundae Chocolate",
    categoryId: "soft",
    photo: "kybo-soft-chocolate.webp",
    bands: [
      "561C0F",
      "561C0F",
      "E6D5CC",
      "E6D5CC",
      "E6D5CC",
      "E6D5CC",
      "E6D5CC",
      "60251A",
    ],
  },
  {
    id: "1685d383-5581-459f-a5c4-2777331c243e",
    name: "Kybo Soft Sundae Frutilla",
    categoryId: "soft",
    photo: "kybo-soft-frutilla.webp",
    bands: [
      "B3050C",
      "B3050C",
      "ECD6CC",
      "ECD6CC",
      "ECD6CC",
      "ECD6CC",
      "ECD6CC",
      "A10B17",
    ],
  },
  {
    id: "1bee7489-5ee8-4e93-a586-d85629cef23f",
    name: "Kybo Soft Sundae Frutos rojos",
    categoryId: "soft",
    photo: "kybo-soft-frutos-rojos.webp",
    bands: [
      "5C0B26",
      "5C0B26",
      "EBD7D3",
      "EBD7D3",
      "EBD7D3",
      "EBD7D3",
      "EBD7D3",
      "6E041E",
    ],
  },
  {
    id: "3efc7be3-52af-402e-9990-350d0f1599f4",
    name: "Cappuccino",
    categoryId: "lattes",
    photo: "cappuccino.webp",
    bands: [
      "E58B25",
      "E58B25",
      "E58B25",
      "FBE5C7",
      "FBE5C7",
      "FBE5C7",
      "E58B25",
      "E58B25",
    ],
  },
  {
    id: "c8f9f85d-fe9b-4b2b-9acc-11df3e7ad4a8",
    name: "Taro Iced Latte",
    categoryId: "lattes",
    photo: "taro-iced-latte.webp",
    bands: [
      "B178CC",
      "C398D9",
      "C398D9",
      "C398D9",
      "C398D9",
      "C398D9",
      "33242C",
      "33242C",
    ],
  },
  {
    id: "9bb0cebb-c87b-48ce-8e17-d596ef1ec71c",
    name: "Matcha Iced Latte",
    categoryId: "lattes",
    photo: "iced-matcha.webp",
    bands: [
      "9EB93D",
      "ACC055",
      "ACC055",
      "ACC055",
      "ACC055",
      "ACC055",
      "2A271F",
      "2A271F",
    ],
  },
  {
    id: "4690a82f-c39d-4b89-9f0b-b386c727d8f9",
    name: "Kybo Tea",
    categoryId: "lattes",
    photo: "kybo-tea.webp",
    bands: [
      "B04F0B",
      "B04F0B",
      "FBD8B1",
      "FBD8B1",
      "FBD8B1",
      "FBD8B1",
      "341B10",
      "341B10",
    ],
  },
  {
    id: "a7af601e-e6cd-4ec9-9a2e-383c9ba68dc9",
    name: "Waffle Clásico",
    categoryId: "salados",
    photo: "waffle-salado.webp",
    bands: [
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
    ],
  },
  {
    id: "8401749e-cd0d-40b8-b002-e98a483c47ba",
    name: "Combo 2 medialunas + Café",
    categoryId: "salados",
    photo: "medialunas-cafe.webp",
    bands: [
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
      "FFF1D4",
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000900",
    name: "Producto con foto del catálogo",
    categoryId: "lattes",
    photo: null,
    bands: [
      "E7EDF0",
      "E7EDF0",
      "D5E1E8",
      "D5E1E8",
      "C5D4DC",
      "C5D4DC",
      "B6C9D4",
      "B6C9D4",
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000901",
    name: "Producto sin foto",
    categoryId: "lattes",
    photo: null,
    bands: [
      "E7EDF0",
      "E7EDF0",
      "D5E1E8",
      "D5E1E8",
      "C5D4DC",
      "C5D4DC",
      "B6C9D4",
      "B6C9D4",
    ],
  },
] as const;
// Diagnostic 2 × 4 RGBA PNG used only in the canonical catalogue scenario.
const fixtureThumbnail = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAAECAYAAACk7+45AAAAFElEQVR4nGP438DwnyG98z8DbgYAPhURtRUA6msAAAAASUVORK5CYII=",
  "base64",
);

const categories = [
  { id: "lattes", name: "Lattes" },
  { id: "shakes", name: "Shakes" },
  { id: "soft", name: "Soft" },
  { id: "salados", name: "Salados" },
];
const comboRow: SaleLookup["rows"][number] = {
  id: id(10),
  name: "Combo merienda",
  kind: "combo",
  price: "9000.00",
  categoryId: "combos",
  configured: true,
  vatPending: false,
  pricingRevision: 1,
};
const comboConfiguration: ComboSaleConfiguration = {
  basePrice: "9000.00",
  catalogBasePrice: "9000.00",
  vatRate: "0.00",
  pricingRevision: 1,
  unavailableProductIds: [],
  definition: {
    id: id(700),
    productId: comboRow.id,
    revision: 1,
    actorId: "fixture-catalog-manager",
    createdAt: new Date("2026-11-20T12:00:00.000Z"),
    groups: [
      {
        id: id(701),
        versionId: id(700),
        name: "Bebida",
        position: 0,
        quantity: 1,
        sourceGroupId: null,
        sourceGroupVersionId: null,
        source: null,
        options: [
          {
            id: id(711),
            groupId: id(701),
            productId: id(2),
            position: 0,
            name: "Shake Oreo",
            archived: false,
            counter: "0.00",
            pedidosya: "0.00",
            ubereats: "0.00",
          },
          {
            id: id(712),
            groupId: id(701),
            productId: id(8),
            position: 1,
            name: "Cappuccino",
            archived: false,
            counter: "500.00",
            pedidosya: "500.00",
            ubereats: "500.00",
          },
        ],
      },
      {
        id: id(702),
        versionId: id(700),
        name: "Salado",
        position: 1,
        quantity: 1,
        sourceGroupId: null,
        sourceGroupVersionId: null,
        source: null,
        options: [
          {
            id: id(713),
            groupId: id(702),
            productId: id(9),
            position: 0,
            name: "Waffle con jamón y queso",
            archived: false,
            counter: "0.00",
            pedidosya: "0.00",
            ubereats: "0.00",
          },
        ],
      },
    ],
  },
};
const historicalSale: SaleDetail = {
  id: id(800),
  number: 42,
  revision: 1,
  origin: "counter",
  channel: "counter",
  fulfillment: "takeaway",
  status: "closed",
  tableId: null,
  tableName: null,
  customerId: id(854),
  customerName: "Cliente del historial",
  externalId: null,
  totalAmount: "3500.00",
  paidAmount: "3500.00",
  balanceDue: "0.00",
  localCollected: "3500.00",
  platformCollected: "0.00",
  orderCount: 1,
  businessDate: "2026-11-20",
  createdAt: "2026-11-20T17:00:00.000Z",
  closedAt: "2026-11-20T17:00:00.000Z",
  notes: null,
  cancelReason: null,
  orders: [
    {
      id: id(801),
      locatorNumber: 12,
      sequence: 1,
      totalAmount: "3500.00",
      notes: null,
      createdAt: "2026-11-20T17:00:00.000Z",
      lines: [
        {
          id: id(802),
          productId: id(8),
          name: "Cappuccino",
          lineKind: "product",
          parentLineId: null,
          quantity: 1,
          listPrice: "3500.00",
          unitPrice: "3500.00",
          lineTotal: "3500.00",
          priceReason: null,
          notes: null,
          recipeVersionId: null,
          compositionStatus: "not_required",
          modifiers: [],
          vatRate: "0.00",
          netTotal: "3500.00",
          vatTotal: "0.00",
        },
      ],
    },
  ],
  payments: [
    {
      id: id(803),
      kind: "collection",
      collector: "local",
      methodName: "Efectivo",
      methodKind: "cash",
      amount: "3500.00",
      reference: null,
      originalPaymentId: null,
      createdAt: "2026-11-20T17:00:00.000Z",
      actorId: "history-cashier",
      commissionPercent: "0.00",
      commissionAmount: "0.00",
      settlementNet: "3500.00",
    },
  ],
};
const printingSnapshot: PrintingSnapshot = {
  ready: false,
  canConfigure: false,
  canManage: false,
  settings: { enabled: false, revision: 1, printerName: "" },
  connector: null,
  jobs: [],
  message: "Impresión desactivada en el fixture.",
};
function configuration(productId: string, modifierScenario = false) {
  const product = rows.find((row) => row.id === productId)!;
  if (modifierScenario && [id(1), id(2)].includes(productId)) {
    const firstProduct = productId === id(1);
    return {
      basePrice: product.price,
      catalogBasePrice: product.price,
      vatRate: "0.00",
      fulfillmentVersionId: product.fulfillmentVersionId,
      recipeVersionId: firstProduct ? id(300) : id(301),
      pricingRevision: 1,
      model: "configurable",
      groups: [
        {
          id: id(400),
          name: "Perlas",
          min: 1,
          max: 1,
          options: [
            {
              id: id(401),
              key: "chocolate",
              name: "Chocolate",
              defaultCount: firstProduct ? 1 : 0,
              maxCount: 1,
              price: "0.00",
              available: true,
            },
            {
              id: id(402),
              key: "mango",
              name: "Mango",
              defaultCount: firstProduct ? 0 : 1,
              maxCount: 1,
              price: "0.00",
              available: true,
            },
            {
              id: id(403),
              key: "no-pearls",
              name: "Sin perlas",
              defaultCount: 0,
              maxCount: 1,
              price: "0.00",
              available: true,
            },
            {
              id: id(404),
              key: "blackberry",
              name: "Mora",
              defaultCount: 0,
              maxCount: 1,
              price: "0.00",
              available: false,
            },
          ],
        },
        {
          id: id(420),
          name: "Toppings",
          min: 1,
          max: 3,
          options: [
            {
              id: id(421),
              key: "crumbles",
              name: "Crocantes",
              defaultCount: 1,
              maxCount: 2,
              price: "100.00",
              available: true,
            },
            {
              id: id(422),
              key: "coconut",
              name: "Coco",
              defaultCount: 0,
              maxCount: 2,
              price: "200.00",
              available: true,
            },
            {
              id: id(423),
              key: "sprinkles",
              name: "Sprinkles",
              defaultCount: 0,
              maxCount: 3,
              price: "0.00",
              available: true,
            },
          ],
        },
        {
          id: id(410),
          name: "Salsas",
          min: 0,
          max: 2,
          options: [
            {
              id: id(411),
              key: "caramel",
              name: "Caramelo",
              defaultCount: 0,
              maxCount: 1,
              price: "100.00",
              available: true,
            },
            {
              id: id(412),
              key: "strawberry",
              name: "Frutilla",
              defaultCount: 0,
              maxCount: 1,
              price: "0.00",
              available: true,
            },
          ],
        },
      ],
    };
  }
  return {
    basePrice: product.price,
    catalogBasePrice: product.price,
    vatRate: "0.00",
    fulfillmentVersionId: product.fulfillmentVersionId,
    recipeVersionId: productId === id(1) ? id(300) : null,
    pricingRevision: 1,
    model: productId === id(1) ? "configurable" : "unavailable",
    groups:
      productId === id(1)
        ? [
            {
              id: id(400),
              name: "Perlas",
              min: 1,
              max: 1,
              options: [
                {
                  id: id(401),
                  key: "chocolate",
                  name: "Chocolate",
                  defaultCount: 1,
                  maxCount: 1,
                  price: "0.00",
                  available: true,
                },
                {
                  id: id(402),
                  key: "mango",
                  name: "Mango",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "0.00",
                  available: true,
                },
                {
                  id: id(403),
                  key: "no-pearls",
                  name: "Sin perlas",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "0.00",
                  available: true,
                },
                {
                  id: id(404),
                  key: "blackberry",
                  name: "Mora",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "0.00",
                  available: false,
                },
              ],
            },
            {
              id: id(410),
              name: "Salsas",
              min: 0,
              max: 2,
              options: [
                {
                  id: id(411),
                  key: "caramel",
                  name: "Caramelo",
                  defaultCount: 0,
                  maxCount: 2,
                  price: "100.00",
                  available: true,
                },
                {
                  id: id(412),
                  key: "strawberry",
                  name: "Frutilla",
                  defaultCount: 0,
                  maxCount: 1,
                  price: "100.00",
                  available: true,
                },
              ],
            },
          ]
        : [],
  };
}
test.beforeAll(async () => {
  test.setTimeout(120000);
  await mkdir(".next-e2e", { recursive: true });
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: {
      "pos-surface-fixture": "tests/helpers/pos-surface-ui.tsx",
      "pos-shell-fixture": "tests/helpers/pos-shell-ui.tsx",
    },
    outdir: ".next-e2e",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: {
      "react-dom/client": "react-dom/profiling",
      "next/image": join(
        process.cwd(),
        "tests/helpers/pos-surface-next-image.ts",
      ),
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
  script = await readFile(".next-e2e/pos-surface-fixture.js", "utf8");
  if (process.env.POS_SURFACE_USE_FROZEN_SOURCE === "1" && reportDirectory)
    script = await readFile(join(reportDirectory, "fixture.js"), "utf8");
  shellScript = await readFile(".next-e2e/pos-shell-fixture.js", "utf8");
  scriptBytes = Buffer.byteLength(script);
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))(
    "postcss",
  );
  css = (
    await postcss([require("@tailwindcss/postcss")()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
  if (
    existsSync("src/components/sales/pos.css") &&
    process.env.POS_SURFACE_USE_FROZEN_SOURCE !== "1"
  )
    css += "\n" + (await readFile("src/components/sales/pos.css", "utf8"));
});
type Call = { method: string; path: string; elapsedMs: number };
const longProductName =
  "Waffle de chipá con jamón, queso y una descripción extendida para comprobar el ajuste de nombres " +
  "superextensosininterrupciones".repeat(3);
type SurfaceFixtureOptions = {
  shell?: boolean;
  edgeCases?: boolean;
  modifiers?: boolean;
  combos?: boolean;
  navigation?: boolean;
  cashOpen?: boolean;
  freeCappuccino?: boolean;
  tables?: boolean;
  tableAccount?: SaleDetail;
  canonicalCatalogue?: boolean;
};
async function mount(page: Page, options: SurfaceFixtureOptions = {}) {
  const {
    edgeCases = false,
    modifiers = false,
    combos = false,
    navigation = false,
    cashOpen = true,
    freeCappuccino = false,
    tables = false,
    tableAccount,
    canonicalCatalogue = false,
  } = options;
  const calls: Call[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const host = options.shell
    ? '<div id="fixture"></div>'
    : '<main id="fixture"></main>';
  const started = performance.now();
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__pos-surface" || url.pathname === "/sales")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Manrope;src:url(/fonts/manrope.ttf)}${posFontCss}:root{--font-manrope:Manrope;--font-barlow:Barlow} ${css} html,body{height:100%;margin:0}${options.shell ? "" : "#fixture{height:100dvh;padding:16px;min-width:0;overflow:hidden}"}</style></head><body>${host}<script src="/__pos-surface.js"></script></body></html>`,
      });
    if (url.pathname === "/__pos-surface.js")
      return route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: options.shell ? shellScript : script,
      });
    if (url.pathname === "/fonts/manrope.ttf")
      return route.fulfill({
        contentType: "font/ttf",
        body: await readFile("public/fonts/manrope.ttf"),
      });
    const posFont = posFonts.find(
      (font) => url.pathname === `/fonts/${font.file}`,
    );
    if (posFont)
      return route.fulfill({
        contentType: "font/ttf",
        body: await readFile(`public/fonts/${posFont.file}`),
      });
    const photoPath =
      url.pathname === "/_next/image"
        ? url.searchParams.get("url")
        : url.pathname;
    if (
      photoPath &&
      /^\/images\/pos-products\/[a-z0-9-]+\.webp$/.test(photoPath)
    )
      return route.fulfill({
        contentType: "image/webp",
        body: await readFile("public" + photoPath),
      });
    if (!url.pathname.startsWith("/api/")) return route.abort();
    calls.push({
      method: route.request().method(),
      path: url.pathname + url.search,
      elapsedMs: performance.now() - started,
    });
    if (url.pathname === "/api/cash/status")
      return route.fulfill({
        json: {
          available: true,
          activated: true,
          open: cashOpen,
          sessionId: cashOpen ? id(500) : null,
          canOpen: true,
        },
      });
    if (url.pathname === "/api/pickup")
      return route.fulfill({
        json: {
          count: 16,
          occupied: [],
          publicPath: "/pickup/surface-fixture",
        },
      });
    if (url.pathname === "/api/inventory/replenishment")
      return route.fulfill({
        json: {
          policies: [],
          alerts: [],
          locations: [],
          items: [],
          asOf: "2026-11-20T20:00:00.000Z",
        },
      });
    if (url.pathname === "/api/sales/lookup") {
      const kind = url.searchParams.get("kind");
      if (kind === "products")
        return route.fulfill({
          json: {
            rows: [
              ...(canonicalCatalogue
                ? canonicalProducts.map(
                    ({ id: productId, name, categoryId }, index) => ({
                      ...(rows[index] ?? rows[0]),
                      id: productId,
                      name,
                      categoryId,
                      imageAssetId:
                        productId === id(900)
                          ? id(981)
                          : productId === id(901)
                            ? id(982)
                            : "old-white-background",
                    }),
                  )
                : edgeCases
                  ? rows.map((row, index) =>
                      index === rows.length - 1
                        ? { ...row, name: longProductName, imageAssetId: null }
                        : row,
                    )
                  : rows.map((row) =>
                      freeCappuccino && row.id === id(8)
                        ? { ...row, price: "0.00" }
                        : row,
                    )),
              ...(combos ? [comboRow] : []),
            ],
            categories: edgeCases
              ? [...categories, { id: "empty", name: "Sin productos" }]
              : categories,
            total:
              (canonicalCatalogue ? canonicalProducts.length : rows.length) +
              Number(combos),
            offset: 0,
          },
        });
      if (kind === "payment-methods")
        return route.fulfill({
          json: {
            rows: [
              { id: id(601), name: "Efectivo", kind: "cash" },
              { id: id(602), name: "Débito", kind: "card" },
              { id: id(603), name: "Crédito", kind: "card" },
              { id: id(604), name: "Transferencia", kind: "transfer" },
            ],
            total: 4,
          },
        });
      if (kind === "customers" && navigation)
        return route.fulfill({
          json: {
            rows: [
              {
                id: id(850),
                name: "Cliente de prueba",
                email: "cliente@example.test",
              },
            ],
            total: 1,
          },
        });
      return route.fulfill({ json: { rows: [], total: 0 } });
    }
    if (tables && url.pathname === "/api/sales/tables")
      return route.fulfill({
        json: [
          {
            id: id(950),
            name: "Mesa 4",
            capacity: 4,
            x: 0,
            y: 0,
            revision: 1,
            archived: false,
            saleId: tableAccount?.id ?? null,
            saleNumber: tableAccount?.number ?? null,
            balanceDue: tableAccount?.balanceDue ?? null,
            orderCount: tableAccount?.orderCount ?? 0,
          },
        ],
      });
    if (
      navigation &&
      url.pathname === "/api/sales" &&
      route.request().method() === "GET"
    )
      return route.fulfill({
        json: { rows: [historicalSale], total: 1, offset: 0 },
      });
    if (navigation && url.pathname === "/api/sales/" + historicalSale.id)
      return route.fulfill({ json: historicalSale });
    if (navigation && url.pathname === "/api/fulfillment/state")
      return route.fulfill({
        json: {
          capabilities: { deliver: false },
          combos: [],
          rows: [
            {
              lineId: id(802),
              name: "Cappuccino",
              orderId: id(801),
              returnLots: [],
              progress: {
                mode: "direct",
                ordered: 1,
                completed: 1,
                delivered: 1,
                cancelled: 0,
              },
              task: null,
              notes: null,
            },
          ],
          cancelled: false,
          resolution: null,
        },
      });
    if (navigation && url.pathname === "/api/printing")
      return route.fulfill({ json: printingSnapshot });
    if (combos && url.pathname === `/api/sales/products/${comboRow.id}/combo`)
      return route.fulfill({ json: comboConfiguration });
    const config = url.pathname.match(
      /^\/api\/sales\/products\/([^/]+)\/configuration$/,
    );
    if (config) {
      const canonicalIndex = canonicalCatalogue
        ? canonicalProducts.findIndex((product) => product.id === config[1])
        : -1;
      const result = configuration(
        rows[canonicalIndex]?.id ??
          (canonicalIndex >= 0 ? rows[0].id : config[1]),
        modifiers,
      );
      return route.fulfill({
        json:
          freeCappuccino && config[1] === id(8)
            ? { ...result, basePrice: "0.00", catalogBasePrice: "0.00" }
            : result,
      });
    }
    if (canonicalCatalogue && url.pathname === "/api/media/" + id(981))
      return route.fulfill({
        contentType: "image/png",
        body: fixtureThumbnail,
      });
    if (url.pathname.startsWith("/api/media/"))
      return route.fulfill({ status: 404, body: "Missing fixture photo" });
    // The fixture has no external transport: unneeded read endpoints remain empty.
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { rows: [], total: 0, offset: 0, orders: [] },
      });
    return route.fulfill({
      status: 409,
      json: { error: "Esta prueba no registra operaciones reales." },
    });
  });
  await page.goto(options.shell ? "/sales" : "/__pos-surface");
  await expect(
    page.getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true }),
  )
    .toBeEnabled()
    .catch((error) => {
      throw new Error(
        `${error.message}\nRuntime errors: ${JSON.stringify(errors)}\nAPI calls: ${JSON.stringify(calls)}`,
      );
    });
  const catalogueReadyMs = performance.now() - started;
  return { calls, errors, catalogueReadyMs };
}
const profiles: unknown[] = [];
async function showOrder(page: Page) {
  const summary = page.getByRole("button", { name: /^Ver pedido/ });
  if (await summary.isVisible()) await summary.click();
  await expect(page.getByTestId("cart-lines")).toBeVisible();
  return page.locator("[data-pos-order]");
}
async function showProducts(page: Page) {
  const back = page.getByRole("button", {
    name: "Seguir agregando",
    exact: true,
  });
  if (await back.isVisible()) await back.click();
}
async function addDefaultOrder(page: Page) {
  const options = await openProductOptions(page);
  await options
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar Shake Oreo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar Soft Frutilla", exact: true })
    .click();
}
async function saveOptions(dialog: Locator) {
  await dialog
    .getByRole("button", {
      name: /^(Agregar al pedido|Guardar opciones|Guardar cambios)$/,
    })
    .click();
}
async function expectTouchControl(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function expectOrderWidth(page: Page) {
  const viewport = page.viewportSize()!;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
  const widths = await page
    .locator("[data-pos-order], [data-testid=cart-line]")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
      })),
    );
  for (const width of widths)
    expect(width.content).toBeLessThanOrEqual(width.width + 1);
}
const businessRequests = (calls: Call[]) => ({
  catalogue: calls.filter((call) => call.path.includes("kind=products")).length,
  configuration: calls.filter((call) => call.path.includes("/configuration"))
    .length,
  combos: calls.filter((call) => /\/combo[?]/.test(call.path)).length,
});

type CheckoutFailure =
  | "stock"
  | "cash"
  | "conflict"
  | "network"
  | "invalid-json"
  | "invalid-result"
  | "server-error"
  | "slow";
type CapturedSubmission = {
  body: string;
  payload: Record<string, unknown>;
};
function confirmedFixtureSale(
  kind:
    | "paid"
    | "pending-table"
    | "pending-delivery"
    | "free"
    | "platform" = "paid",
): SaleDetail {
  const pending = kind.startsWith("pending-");
  const free = kind === "free";
  const delivery = kind === "pending-delivery" || kind === "platform";
  const amount = free ? "0.00" : "3500.00";
  return {
    ...historicalSale,
    id: id(900),
    number: 73,
    origin: delivery
      ? "delivery"
      : kind === "pending-table"
        ? "table"
        : "counter",
    channel: delivery ? "pedidosya" : "counter",
    fulfillment: delivery
      ? "delivery"
      : kind === "pending-table"
        ? "dine_in"
        : "takeaway",
    status: pending ? "open" : "closed",
    tableId: kind === "pending-table" ? id(950) : null,
    tableName: kind === "pending-table" ? "Mesa 4" : null,
    customerId: null,
    customerName: null,
    externalId: delivery ? "PED-73" : null,
    totalAmount: amount,
    paidAmount: pending ? "0.00" : amount,
    balanceDue: pending ? amount : "0.00",
    localCollected: pending || kind === "platform" ? "0.00" : amount,
    platformCollected: kind === "platform" ? amount : "0.00",
    closedAt: pending ? null : historicalSale.closedAt,
    orders: [
      {
        ...historicalSale.orders[0],
        id: id(901),
        locatorNumber: 3,
        totalAmount: amount,
        lines: [
          {
            ...historicalSale.orders[0].lines[0],
            id: id(902),
            listPrice: amount,
            unitPrice: amount,
            lineTotal: amount,
            netTotal: amount,
          },
        ],
      },
    ],
    payments:
      pending || free
        ? []
        : [
            {
              ...historicalSale.payments[0],
              id: id(903),
              collector: kind === "platform" ? "platform" : "local",
              methodName: kind === "platform" ? null : "Efectivo",
              methodKind: kind === "platform" ? null : "cash",
            },
          ],
  };
}
async function mountCheckout(
  page: Page,
  {
    sale = confirmedFixtureSale(),
    firstResponse,
    printFailure = false,
    ...surface
  }: SurfaceFixtureOptions & {
    sale?: SaleDetail;
    firstResponse?: CheckoutFailure;
    printFailure?: boolean;
  } = {},
) {
  const app = await mount(page, surface);
  const submissions: CapturedSubmission[] = [];
  const printingSubmissions: CapturedSubmission[] = [];
  const cashStatusReads: boolean[] = [];
  let detailSale = sale;
  let cashIsOpen = surface.cashOpen ?? true;
  let releaseSlow = () => {};
  const slowResponse = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  await page.route("**/api/cash/status", (route) => {
    cashStatusReads.push(cashIsOpen);
    return route.fulfill({
      json: {
        available: true,
        activated: true,
        open: cashIsOpen,
        sessionId: cashIsOpen ? id(500) : null,
        canOpen: true,
      },
    });
  });
  await page.route("**/api/sales", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    submissions.push({
      body: route.request().postData()!,
      payload: route.request().postDataJSON(),
    });
    if (submissions.length === 1) {
      if (firstResponse === "slow") await slowResponse;
      if (firstResponse === "network") return route.abort("failed");
      if (firstResponse === "invalid-json")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"id":',
        });
      if (firstResponse === "invalid-result")
        return route.fulfill({ json: { id: sale.id, number: sale.number } });
      if (firstResponse === "server-error")
        return route.fulfill({
          status: 503,
          json: { error: "No se pudo confirmar el resultado del cobro." },
        });
      if (firstResponse === "stock")
        return route.fulfill({
          status: 400,
          json: {
            error:
              "No hay stock disponible suficiente para reservar:\nLeche entera · Barra · Faltan 0,250 L.",
          },
        });
      if (firstResponse === "conflict")
        return route.fulfill({
          status: 409,
          json: { error: "Revisá el precio de Cappuccino antes de continuar." },
        });
      if (firstResponse === "cash") {
        cashIsOpen = false;
        return route.fulfill({
          status: 409,
          json: {
            code: "CASH_CLOSED",
            error:
              "Abrí la caja antes de registrar cobros o salidas de efectivo.",
          },
        });
      }
    }
    return route.fulfill({ json: sale });
  });
  await page.route(`**/api/sales/${sale.id}`, (route) =>
    route.fulfill({ json: detailSale }),
  );
  await page.route("**/api/fulfillment/state**", (route) =>
    route.fulfill({
      json: {
        capabilities: { deliver: false },
        combos: [],
        rows: [
          {
            lineId: sale.orders[0].lines[0].id,
            name: "Cappuccino",
            orderId: sale.orders[0].id,
            returnLots: [],
            progress: {
              mode: "direct",
              ordered: 1,
              completed: 1,
              delivered: 1,
              cancelled: 0,
            },
            task: null,
            notes: null,
          },
        ],
        cancelled: false,
        resolution: null,
      },
    }),
  );
  await page.route("**/api/printing**", (route) => {
    if (route.request().method() === "POST") {
      printingSubmissions.push({
        body: route.request().postData()!,
        payload: route.request().postDataJSON(),
      });
      return printingSubmissions.length === 1
        ? route.fulfill({
            status: 503,
            json: { error: "La impresora no respondió." },
          })
        : route.fulfill({ json: { id: id(960) } });
    }
    const snapshot: PrintingSnapshot = {
      ready: true,
      canConfigure: false,
      canManage: true,
      settings: { enabled: true, revision: 1, printerName: "Barra fixture" },
      connector: {
        id: id(965),
        name: "Conector fixture",
        connected: true,
        lastSeenAt: "2026-11-20T17:00:00.000Z",
        printerStatus: "ready",
        printerMessage: null,
      },
      jobs: printFailure
        ? [
            {
              id: id(960),
              ticketId: id(961),
              saleId: sale.id,
              orderId: sale.orders[0].id,
              saleNumber: sale.number,
              sequence: 1,
              stationName: "Barra",
              kind: "original",
              copyNumber: 0,
              state: printingSubmissions.length > 1 ? "pending" : "error",
              createdAt: "2026-11-20T17:00:00.000Z",
              sentAt: null,
              error:
                printingSubmissions.length > 1
                  ? null
                  : "La impresora no respondió.",
              spoolState: "not_submitted",
              canReprint: false,
              canRetry: printingSubmissions.length < 2,
              reason: null,
              requestedBy: "surface-cashier",
              document: {
                version: 1,
                widthDots: 576,
                logo: true,
                lines: [
                  { text: "Pedido 73.1 · Localizador 3", style: "title" },
                  { text: "1 × Cappuccino", style: "normal" },
                ],
              },
            },
          ]
        : [],
    };
    return route.fulfill({ json: snapshot });
  });
  return {
    ...app,
    submissions,
    printingSubmissions,
    cashStatusReads,
    releaseSlow,
    setDetailSale: (next: SaleDetail) => {
      detailSale = next;
    },
  };
}
async function prepareCappuccino(page: Page) {
  await page.getByRole("button", { name: /^Localizador 1\b/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Localizador 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Agregar Cappuccino", exact: true })
    .click();
  return showOrder(page);
}
async function openCashCheckout(page: Page) {
  await page
    .getByRole("button", { name: "Continuar al cobro", exact: true })
    .click();
  const payment = page.getByRole("dialog");
  await payment.getByRole("button", { name: "Efectivo", exact: true }).click();
  await payment
    .getByRole("textbox", { name: "Efectivo recibido 1", exact: true })
    .fill("5000");
  return payment;
}
const confirmCheckout = (payment: Locator) =>
  payment.getByRole("button", { name: /^Confirmar cobro/ });
const confirmationRegion = (page: Page) =>
  page.getByRole("region", { name: "Confirmación de venta", exact: true });
async function captureCheckout(page: Page, name: string) {
  if (!reportDirectory) return;
  await mkdir(reportDirectory, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: join(reportDirectory, `${name}.png`) });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
])
  test(`checkout confirms paid cash and starts a new draft at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const app = await mountCheckout(page);
    await prepareCappuccino(page);
    const payment = await openCashCheckout(page);
    await confirmCheckout(payment).click();
    const confirmation = confirmationRegion(page);
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(/Venta cobrada.*#73/);
    await expect(confirmation).toContainText(/Total.*3[.]500/);
    await expect(confirmation).toContainText("Localizador 3");
    await expect(confirmation).toContainText(/Efectivo.*3[.]500/);
    await expect(confirmation).toContainText(
      /Recibido.*5[.]000.*Vuelto.*1[.]500/,
    );
    await expect(page.getByTestId("cart-line")).toHaveCount(0);
    expect(app.submissions).toHaveLength(1);
    expect(app.submissions[0].payload).toMatchObject({
      origin: "counter",
      channel: "counter",
      locatorMode: "manual",
      locatorNumber: 3,
      payments: [
        {
          collector: "local",
          methodId: id(601),
          amount: "3500",
          reference: "",
        },
      ],
    });
    expect(
      Object.keys((app.submissions[0].payload.payments as object[])[0]).sort(),
    ).toEqual(["amount", "collector", "methodId", "reference"]);
    await captureCheckout(page, `confirmed-paid-${viewport.width}`);
    await confirmation
      .getByRole("button", { name: "Nueva venta", exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await page
      .getByRole("button", { name: "Agregar Soft Frutilla", exact: true })
      .click();
    await showOrder(page);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-line")).toContainText("Soft Frutilla");
    await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
    expect(app.submissions).toHaveLength(1);
    expect(app.errors).toEqual([]);
  });

test("checkout confirmation lists each split payment and known cash change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const sale = confirmedFixtureSale();
  sale.payments = [
    { ...sale.payments[0], amount: "2000.00", settlementNet: "2000.00" },
    {
      ...sale.payments[0],
      id: id(904),
      methodName: "Débito",
      methodKind: "card",
      amount: "1500.00",
      settlementNet: "1500.00",
      reference: "000073",
    },
  ];
  const app = await mountCheckout(page, { sale });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await payment
    .getByRole("button", { name: "Dividir cobro", exact: true })
    .click();
  await payment
    .getByRole("textbox", { name: "Importe 1", exact: true })
    .fill("2000");
  await payment
    .getByRole("textbox", { name: "Importe 2", exact: true })
    .fill("1500");
  await payment
    .getByRole("combobox", { name: "Medio de pago 2", exact: true })
    .selectOption(id(602));
  await payment
    .getByRole("textbox", {
      name: "Número de comprobante del pago 2",
      exact: true,
    })
    .fill("000073");
  await confirmCheckout(payment).click();
  const confirmation = confirmationRegion(page);
  await expect(confirmation).toContainText(/Efectivo.*2[.]000/);
  await expect(confirmation).toContainText(/Débito.*1[.]500/);
  await expect(confirmation).toContainText(
    /Recibido.*5[.]000.*Vuelto.*3[.]000/,
  );
  expect(app.submissions).toHaveLength(1);
  expect(app.submissions[0].payload.payments).toEqual([
    { collector: "local", methodId: id(601), amount: "2000", reference: "" },
    {
      collector: "local",
      methodId: id(602),
      amount: "1500",
      reference: "000073",
    },
  ]);
  await captureCheckout(page, "confirmed-split");
  expect(app.errors).toEqual([]);
});

async function measureTouchTarget(target: Locator) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect.soft(box?.width).toBeGreaterThanOrEqual(44);
  expect.soft(box?.height).toBeGreaterThanOrEqual(44);
}

async function expectLoadedPosFont(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  const posFamily = await page
    .locator("[data-pos]")
    .evaluate((node) =>
      getComputedStyle(node)
        .fontFamily.split(",")[0]
        .trim()
        .replace(/["']/g, ""),
    );
  const actual = await target.evaluate(async (node) => {
    await document.fonts.ready;
    const family = getComputedStyle(node)
      .fontFamily.split(",")[0]
      .trim()
      .replace(/["']/g, "");
    return {
      family,
      loaded: Array.from(document.fonts).some(
        (face) =>
          face.family.replace(/["']/g, "") === family &&
          face.status === "loaded",
      ),
    };
  });
  expect.soft(actual).toEqual({ family: posFamily, loaded: true });
}

async function visibleTouchPoint(target: Locator) {
  return target.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2;
    let hittable = 0;
    for (
      let y = Math.max(0, Math.ceil(rect.top));
      y < Math.min(innerHeight, rect.bottom);
      y++
    ) {
      if (node.contains(document.elementFromPoint(x, y))) {
        hittable++;
        if (hittable === 44) return { x, y: y - 21 };
      } else hittable = 0;
    }
    return null;
  });
}

test("Task 7 keeps a catalogue product physically reachable after mobile payment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mountCheckout(page);
  await prepareCappuccino(page);
  await confirmCheckout(await openCashCheckout(page)).click();
  await expect(confirmationRegion(page)).toContainText(/Venta cobrada.*#73/);
  const product = page.getByRole("button", {
    name: "Agregar Cappuccino",
    exact: true,
  });
  await expect(product).toBeEnabled();
  await captureCheckout(page, "mobile-confirmation-catalogue");
  const tap = await visibleTouchPoint(product);
  if (!tap)
    throw new Error(
      "A visible product needs 44 contiguous hittable pixels while the receipt is present.",
    );
  await page.mouse.click(tap.x, tap.y);
  await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

test("Task 7 keeps the existing table account link touch-sized with a native destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const sale = confirmedFixtureSale("pending-table");
  const app = await mountCheckout(page, {
    sale,
    tables: true,
    tableAccount: sale,
  });
  await page.getByRole("button", { name: "Mesa", exact: true }).click();
  await page.getByRole("combobox", { name: /^Mesa/ }).selectOption(id(950));
  const account = page.getByRole("link", {
    name: "Abrir venta #73",
    exact: true,
  });
  await expect(account).toHaveAttribute("href", "/sales?account=" + sale.id);
  await measureTouchTarget(account);
  await captureCheckout(page, "320-table-account-link");
  await account.click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Venta #73", exact: true }),
  ).toBeVisible();
  expect(app.submissions).toHaveLength(0);
  expect(app.errors).toEqual([]);
});

test("Task 7 keeps clear-order cancellation reachable by touch and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const app = await mountCheckout(page);
  await prepareCappuccino(page);
  const clear = page.getByRole("button", {
    name: "Vaciar pedido",
    exact: true,
  });
  await clear.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "¿Vaciar el pedido?", exact: true }),
  ).toBeVisible();
  const keep = dialog.getByRole("button", {
    name: "Conservar pedido",
    exact: true,
  });
  await measureTouchTarget(keep);
  await measureTouchTarget(
    dialog.getByRole("button", { name: "Vaciar pedido", exact: true }),
  );
  const iconClose = dialog.getByRole("button", {
    name: "Cerrar formulario",
    exact: true,
  });
  if (await iconClose.isVisible()) await measureTouchTarget(iconClose);
  await captureCheckout(page, "320-clear-order");
  await keep.click();
  await expect(dialog).toBeHidden();
  await expect(clear).toBeFocused();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  expect(app.submissions).toHaveLength(0);
  expect(app.errors).toEqual([]);
});

test("Task 7 uses the loaded POS font and touch targets in locator and sale detail portals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const sale = confirmedFixtureSale("pending-table");
  const app = await mountCheckout(page, {
    sale,
    tables: true,
    tableAccount: sale,
  });
  const locator = page.getByRole("button", { name: /^Localizador 1\b/ });
  await locator.click();
  const dialog = page.getByRole("dialog");
  const locatorTitle = dialog.getByRole("heading", {
    name: "Localizador del pedido",
    exact: true,
  });
  await expectLoadedPosFont(page, locatorTitle);
  const locatorClose = dialog.getByRole("button", {
    name: /^Cerrar(?: formulario)?$/,
  });
  await measureTouchTarget(locatorClose);
  await captureCheckout(page, "320-locator");
  await locatorClose.click();
  await expect(dialog).toBeHidden();
  await expect(locator).toBeFocused();

  await page.getByRole("button", { name: "Mesa", exact: true }).click();
  await page.getByRole("combobox", { name: /^Mesa/ }).selectOption(id(950));
  await page
    .getByRole("link", { name: "Abrir venta #73", exact: true })
    .click();
  const detailTitle = dialog.getByRole("heading", {
    name: "Venta #73",
    exact: true,
  });
  await expectLoadedPosFont(page, detailTitle);
  const detailClose = dialog.getByRole("button", {
    name: "Cerrar detalle de venta",
    exact: true,
  });
  await measureTouchTarget(detailClose);
  await captureCheckout(page, "320-sale-detail");
  await detailClose.click();
  await expect(dialog).toBeHidden();
  expect(app.errors).toEqual([]);
});

test("Task 7 keeps cash actions usable after a keyboard-sized viewport reduction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mountCheckout(page);
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  const received = payment.getByRole("textbox", {
    name: "Efectivo recibido 1",
    exact: true,
  });
  await received.fill("");
  await expect(received).toBeFocused();
  await page.setViewportSize({ width: 390, height: 540 });
  await received.pressSequentially("5000");
  await expect(received).toHaveValue("5000");
  expect(await visibleTouchPoint(received)).not.toBeNull();
  const submit = confirmCheckout(payment);
  const back = payment.getByRole("button", {
    name: /^(Volver al pedido|Cancelar)$/,
  });
  await expect(submit).toBeEnabled();
  expect(await visibleTouchPoint(submit)).not.toBeNull();
  expect(await visibleTouchPoint(back)).not.toBeNull();
  await measureTouchTarget(submit);
  await measureTouchTarget(back);
  await captureCheckout(page, "390-payment-keyboard-equivalent");
  await back.click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  expect(app.submissions).toHaveLength(0);
  expect(app.errors).toEqual([]);
});

test("Task 7 renders supplied transparent product photos, exact bands and catalogue fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mount(page, { canonicalCatalogue: true });
  for (const product of canonicalProducts) {
    const stripe = page
      .getByRole("button", { name: "Agregar " + product.name, exact: true })
      .locator(".pos-product-stripes");
    const actual = await stripe.evaluate((element) => {
      const { width, height, backgroundImage } = getComputedStyle(element);
      // Chromium serializes hard stops either as a two-position color or two equal colors.
      const stops = Array.from(
        backgroundImage.matchAll(
          /rgb\((\d+), (\d+), (\d+)\) ([\d.]+)%(?: ([\d.]+)%)?/g,
        ),
        ([, red, green, blue, from, to]) => ({
          color: [red, green, blue]
            .map((value) => Number(value).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase(),
          from: Number(from),
          to: Number(to),
        }),
      );
      const bands = Array.from({ length: 8 }, (_, row) => {
        const position = (row + 0.5) * 12.5;
        return stops.find(
          ({ from, to }, index) =>
            from <= position &&
            position <
              (Number.isNaN(to) ? (stops[index + 1]?.from ?? 100) : to),
        )?.color;
      });
      return {
        width,
        height,
        repeats: backgroundImage.startsWith("repeating-"),
        bands,
      };
    });
    expect.soft(actual, product.name).toEqual({
      width: "152px",
      height: "152px",
      repeats: false,
      bands: product.bands,
    });
  }
  for (const product of canonicalProducts.filter((p) => p.photo)) {
    const card = page.getByRole("button", {
      name: "Agregar " + product.name,
      exact: true,
    });
    await card.scrollIntoViewIfNeeded();
    const photo = card.getByRole("img", { name: product.name, exact: true });
    await expect
      .poll(() =>
        photo.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
    expect(
      new URL(
        await photo.evaluate((image: HTMLImageElement) => image.currentSrc),
      ).searchParams.get("url"),
    ).toBe("/images/pos-products/" + product.photo);
    await expect(photo).toHaveCSS("object-fit", "contain");
    await expect(photo).toHaveCSS("filter", "none");
    await expect(card.locator(".pos-product-photo > span")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  const persisted = page
    .getByRole("button", {
      name: "Agregar Producto con foto del catálogo",
      exact: true,
    })
    .getByRole("img", { name: "Producto con foto del catálogo", exact: true });
  await expect
    .poll(() =>
      persisted.evaluate((image: HTMLImageElement) => [
        image.naturalWidth,
        image.naturalHeight,
      ]),
    )
    .toEqual([2, 4]);
  await expect(
    page
      .getByRole("button", { name: "Agregar Producto sin foto", exact: true })
      .getByLabel("Sin foto"),
  ).toBeVisible();
  const media = () =>
    app.calls
      .filter(({ path }) => path.startsWith("/api/media/"))
      .map(({ path }) => path)
      .sort();
  const mediaRequests = [id(981), id(982)]
    .map((asset) => "/api/media/" + asset + "?size=thumbnail")
    .sort();
  expect(media()).toEqual(mediaRequests);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page
      .getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true })
      .scrollIntoViewIfNeeded();
    await captureCheckout(page, "supplied-catalogue-" + viewport.width);
  }
  expect(media()).toEqual(mediaRequests);
  expect(
    app.calls.filter(({ path }) => path.includes("kind=products")),
  ).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

for (const change of ["table-paid", "paid-cancelled"] as const)
  test(`checkout expires the previous confirmation after a newer ${change} revision`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const previous = confirmedFixtureSale(
      change === "table-paid" ? "pending-table" : "paid",
    );
    const app = await mountCheckout(page, { sale: previous, tables: true });
    if (change === "table-paid") {
      await page.getByRole("button", { name: "Mesa", exact: true }).click();
      await page.getByRole("combobox", { name: /^Mesa/ }).selectOption(id(950));
    }
    await prepareCappuccino(page);
    if (change === "table-paid") {
      await page
        .getByRole("button", { name: "Abrir cuenta", exact: true })
        .click();
      await expect(confirmationRegion(page)).toContainText(
        "Venta pendiente de cobro",
      );
      await page
        .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
        .click();
    } else {
      const payment = await openCashCheckout(page);
      await confirmCheckout(payment).click();
      await expect(confirmationRegion(page)).toContainText(
        /Recibido.*5[.]000.*Vuelto.*1[.]500/,
      );
    }
    const current: SaleDetail =
      change === "table-paid"
        ? {
            ...previous,
            revision: 2,
            status: "closed",
            paidAmount: "3500.00",
            balanceDue: "0.00",
            localCollected: "3500.00",
            closedAt: "2026-11-20T17:05:00.000Z",
            payments: confirmedFixtureSale().payments,
          }
        : {
            ...previous,
            revision: 2,
            status: "cancelled",
            paidAmount: "0.00",
            balanceDue: "0.00",
            localCollected: "0.00",
            cancelReason: "Anulada desde otra caja",
            payments: [
              ...previous.payments,
              {
                ...previous.payments[0],
                id: id(905),
                kind: "refund",
                originalPaymentId: previous.payments[0].id,
                createdAt: "2026-11-20T17:05:00.000Z",
              },
            ],
          };
    app.setDetailSale(current);
    await page
      .getByRole("button", { name: "Última venta #73", exact: true })
      .click();
    const detail = page.getByRole("dialog");
    await expect(
      detail.getByRole("heading", { name: "Venta #73", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByText(change === "table-paid" ? "Cobrada" : "Anulada", {
        exact: true,
      }),
    ).toBeVisible();
    await captureCheckout(page, `revision-${change}-detail`);
    await expect.soft(confirmationRegion(page)).toHaveCount(0);
    await expect.soft(detail).not.toContainText(/Recibido|Vuelto/);
    await detail
      .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
      .click();
    await captureCheckout(page, `revision-${change}-return`);
    await expect.soft(confirmationRegion(page)).toHaveCount(0);
    expect(app.submissions).toHaveLength(1);
    expect(app.errors).toEqual([]);
  });

test("checkout renders accepted admin commission and VAT decimal fields without errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sale = confirmedFixtureSale();
  sale.payments[0] = {
    ...sale.payments[0],
    methodName: "Débito",
    methodKind: "card",
    reference: "000073",
    commissionPercent: "2.50",
    commissionAmount: "87.50",
    settlementNet: "3412.50",
  };
  sale.orders[0].lines[0] = {
    ...sale.orders[0].lines[0],
    vatRate: "21.00",
    netTotal: "2892.56",
    vatTotal: "607.44",
  };
  const app = await mountCheckout(page, { sale });
  await prepareCappuccino(page);
  await page
    .getByRole("button", { name: "Continuar al cobro", exact: true })
    .click();
  const payment = page.getByRole("dialog");
  await payment.getByRole("button", { name: "Débito", exact: true }).click();
  await payment
    .getByRole("textbox", { name: "Número de comprobante", exact: true })
    .fill("000073");
  await confirmCheckout(payment).click();
  await expect(confirmationRegion(page)).toContainText(/Venta cobrada.*#73/);
  await expect(confirmationRegion(page)).toContainText(/Débito.*3[.]500/);
  await page
    .getByRole("button", { name: "Última venta #73", exact: true })
    .click();
  const detail = page.getByRole("dialog");
  await detail.getByText("Comisiones e impuestos", { exact: true }).click();
  const costs = detail
    .locator("details")
    .filter({ hasText: "Comisiones e impuestos" });
  await expect(costs).toContainText(
    /comisión 2,5%:.*87,50.*Neto estimado:.*3[.]412,50/,
  );
  await expect(costs).toContainText(/Neto:.*2[.]892,56.*IVA 21%:.*607,44/);
  await expect(detail).not.toContainText("NaN");
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
  await captureCheckout(page, "admin-commission-vat");
});

for (const origin of ["table", "delivery"] as const)
  test(`checkout labels an unpaid ${origin} sale as pending`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const app = await mountCheckout(page, {
      sale: confirmedFixtureSale(
        origin === "table" ? "pending-table" : "pending-delivery",
      ),
      tables: true,
    });
    await page
      .getByRole("button", {
        name: origin === "table" ? "Mesa" : "Delivery",
        exact: true,
      })
      .click();
    if (origin === "table")
      await page.getByRole("combobox", { name: /^Mesa/ }).selectOption(id(950));
    else
      await page
        .getByRole("textbox", {
          name: "Número del pedido externo",
          exact: false,
        })
        .fill("PED-73");
    await prepareCappuccino(page);
    await page
      .getByRole("button", {
        name:
          origin === "table" ? "Abrir cuenta" : "Registrar pendiente de cobro",
        exact: true,
      })
      .click();
    const confirmation = confirmationRegion(page);
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(/Venta pendiente de cobro.*#73/);
    await expect(confirmation).toContainText(/Total.*3[.]500.*Saldo.*3[.]500/);
    await expect(confirmation).not.toContainText("Venta cobrada");
    await expect(confirmation).not.toContainText("Recibido");
    await expect(confirmation).not.toContainText("Vuelto");
    expect(app.submissions).toHaveLength(1);
    expect(app.submissions[0].payload).toMatchObject({ origin, payments: [] });
    await captureCheckout(page, `confirmed-pending-${origin}`);
    expect(app.errors).toEqual([]);
  });

test("checkout labels a zero total sale as free without invented payment values", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mountCheckout(page, {
    freeCappuccino: true,
    sale: confirmedFixtureSale("free"),
  });
  await prepareCappuccino(page);
  await page
    .getByRole("button", { name: "Registrar sin cargo", exact: true })
    .click();
  const confirmation = confirmationRegion(page);
  await expect(confirmation).toContainText(/Venta sin cargo.*#73/);
  await expect(confirmation).toContainText(/Total.*0,00/);
  await expect(confirmation).not.toContainText("Recibido");
  await expect(confirmation).not.toContainText("Vuelto");
  expect(app.submissions).toHaveLength(1);
  expect(app.submissions[0].payload.payments).toEqual([]);
  await captureCheckout(page, "confirmed-free-390");
  expect(app.errors).toEqual([]);
});

test("checkout blocks known closed cash and returns to the intact order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mountCheckout(page, { cashOpen: false });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await expect(payment).toContainText("Caja cerrada");
  await expect(confirmCheckout(payment)).toBeDisabled();
  await captureCheckout(page, "cash-known-closed");
  await payment
    .getByRole("button", { name: "Volver al pedido", exact: true })
    .click();
  await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
  await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
  await expect(
    page.getByRole("button", { name: "Abrir caja", exact: true }),
  ).toBeVisible();
  expect(app.submissions).toHaveLength(0);
  expect(app.errors).toEqual([]);
});

test("checkout allows platform collection when local cash is closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mountCheckout(page, {
    cashOpen: false,
    sale: confirmedFixtureSale("platform"),
  });
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Número del pedido externo", exact: false })
    .fill("PED-73");
  await prepareCappuccino(page);
  await page
    .getByRole("button", { name: "Continuar al cobro", exact: true })
    .click();
  const payment = page.getByRole("dialog");
  await payment
    .getByRole("combobox", { name: "Cobrado por 1", exact: false })
    .selectOption("platform");
  await expect(confirmCheckout(payment)).toBeEnabled();
  await confirmCheckout(payment).click();
  const confirmation = confirmationRegion(page);
  await expect(confirmation).toContainText(/Venta cobrada.*#73/);
  await expect(confirmation).toContainText(/PedidosYa.*3[.]500/);
  await expect(confirmation).not.toContainText("Recibido");
  expect(app.submissions).toHaveLength(1);
  expect(app.submissions[0].payload.payments).toEqual([
    { collector: "platform", amount: "3500", reference: "" },
  ]);
  await captureCheckout(page, "confirmed-platform-cash-closed");
  expect(app.errors).toEqual([]);
});

test("checkout stock rejection keeps the draft and exposes inline shortage details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mountCheckout(page, { firstResponse: "stock" });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await confirmCheckout(payment).click();
  await expect(payment).toContainText("Falta stock para completar el pedido");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await payment
    .getByText("Ver detalle de insumos faltantes", { exact: true })
    .click();
  await expect(
    payment.getByText(/Leche entera.*Barra.*Faltan 0,250 L/),
  ).toBeVisible();
  await expect(confirmationRegion(page)).toHaveCount(0);
  await expect(
    payment.getByRole("textbox", { name: "Efectivo recibido 1", exact: true }),
  ).toHaveValue("5000");
  await captureCheckout(page, "stock-inline-recovery");
  await payment.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
  await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

test("checkout refreshes stale open cash after server rejection without losing the draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mountCheckout(page, { firstResponse: "cash" });
  await page.evaluate(() => {
    const tracker = { count: 0 };
    Object.assign(window, { surfaceCashEvents: tracker });
    window.addEventListener("kybo:cash-changed", () => tracker.count++);
  });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await expect(confirmCheckout(payment)).toBeEnabled();
  const readsBefore = app.cashStatusReads.length;
  await confirmCheckout(payment).click();
  await expect(payment).toContainText("Caja cerrada");
  await expect(confirmCheckout(payment)).toBeDisabled();
  await expect.poll(() => app.cashStatusReads).toContain(false);
  expect(app.cashStatusReads).toHaveLength(readsBefore + 1);
  expect(
    await page.evaluate(
      () => Reflect.get(window, "surfaceCashEvents").count as number,
    ),
  ).toBe(1);
  await captureCheckout(page, "cash-closed-after-open-status");
  await payment
    .getByRole("button", { name: "Volver al pedido", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir caja", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
  await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
  await page
    .getByRole("button", { name: "Aumentar Cappuccino", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/7[.]000/);
  expect(app.cashStatusReads).toHaveLength(readsBefore + 1);
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

test("checkout leaves cash status unchanged for an unrelated server conflict", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mountCheckout(page, { firstResponse: "conflict" });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  const readsBefore = app.cashStatusReads.length;
  await confirmCheckout(payment).click();
  await expect(payment.getByRole("alert")).toContainText(
    "Revisá el precio de Cappuccino antes de continuar.",
  );
  await expect(confirmCheckout(payment)).toBeEnabled();
  expect(app.cashStatusReads).toHaveLength(readsBefore);
  await payment.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
  await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

test("checkout waits for a slow definitive response with one physical sale request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mountCheckout(page, { firstResponse: "slow" });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await confirmCheckout(payment).click();
  await expect.poll(() => app.submissions.length).toBe(1);
  await expect(
    payment.getByRole("button", { name: /Guardando/ }),
  ).toBeDisabled();
  await expect(
    payment.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
  await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
  await expect(confirmationRegion(page)).toHaveCount(0);
  await captureCheckout(page, "slow-pending-response");
  expect(app.submissions).toHaveLength(1);
  app.releaseSlow();
  await expect(confirmationRegion(page)).toContainText("Venta cobrada");
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

for (const failure of [
  "network",
  "invalid-json",
  "invalid-result",
  "server-error",
] as const)
  test(`checkout replays the exact uncertain ${failure} request and preserves the draft`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const app = await mountCheckout(page, { firstResponse: failure });
    await prepareCappuccino(page);
    const payment = await openCashCheckout(page);
    await confirmCheckout(payment).click();
    const retry = payment.getByRole("button", {
      name: "Reintentar mismo envío",
      exact: true,
    });
    await expect(retry).toBeEnabled();
    await expect(confirmCheckout(payment)).toBeDisabled();
    await expect(payment).toContainText("pendiente de confirmar");
    await expect(confirmationRegion(page)).toHaveCount(0);
    await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
    await expect(page.getByTestId("cart-total")).toHaveText(/3[.]500/);
    await expect(
      payment.getByRole("textbox", {
        name: "Efectivo recibido 1",
        exact: true,
      }),
    ).toHaveValue("5000");
    expect(app.submissions).toHaveLength(1);
    await captureCheckout(page, `uncertain-${failure}`);
    await retry.click();
    await expect(confirmationRegion(page)).toContainText("Venta cobrada");
    await expect(confirmationRegion(page)).toContainText(
      /Recibido.*5[.]000.*Vuelto.*1[.]500/,
    );
    expect(app.submissions).toHaveLength(2);
    expect(app.submissions[1].body).toBe(app.submissions[0].body);
    expect(app.submissions[0].payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      new Set(app.submissions.map(({ payload }) => payload.requestId)).size,
    ).toBe(1);
    if (reportDirectory)
      await writeFile(
        join(reportDirectory, `replay-${failure}.json`),
        JSON.stringify(app.submissions, null, 2),
      );
    expect(app.errors).toEqual([]);
  });

test("checkout printing recovery keeps the sale confirmed and never repeats its payment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const app = await mountCheckout(page, { printFailure: true });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await confirmCheckout(payment).click();
  await expect(confirmationRegion(page)).toContainText("Venta cobrada");
  await expect(
    page.getByText(
      "La impresión necesita revisión. La venta sigue confirmada.",
      { exact: true },
    ),
  ).toBeVisible();
  await captureCheckout(page, "printing-failure-confirmed-sale");
  await page.getByRole("button", { name: "Ver tickets", exact: true }).click();
  const detail = page.getByRole("dialog");
  await expect(
    detail.getByRole("heading", { name: "Venta #73", exact: true }),
  ).toBeVisible();
  const printing = detail.getByRole("region", {
    name: "Impresión de comandas",
    exact: true,
  });
  await printing
    .getByRole("button", { name: "Reintentar", exact: true })
    .click();
  await expect(
    detail.getByRole("alert").filter({
      hasText: /La impresora no respondió.*La venta sigue confirmada/,
    }),
  ).toBeVisible();
  const retry = detail.getByRole("button", {
    name: "Reintentar la misma operación",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  expect(app.submissions).toHaveLength(1);
  await captureCheckout(page, "printing-own-recovery");
  await retry.click();
  await expect(printing).toContainText("Pendiente");
  expect(app.printingSubmissions).toHaveLength(2);
  expect(app.printingSubmissions[1].body).toBe(app.printingSubmissions[0].body);
  expect(app.submissions).toHaveLength(1);
  expect(app.errors).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 720 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 390, height: 640 },
])
  test(`order layout remains physically usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const app = await mount(page);
    await addDefaultOrder(page);
    const order = await showOrder(page);
    await expect(page.getByTestId("cart-line")).toHaveCount(3);
    await expect
      .poll(
        async () =>
          (await page.getByTestId("cart-lines").boundingBox())?.height ?? 0,
      )
      .toBeGreaterThanOrEqual(44);
    const plus = order.getByRole("button", {
      name: "Aumentar Oreo Iced Latte",
      exact: true,
    });
    const minus = order.getByRole("button", {
      name: "Disminuir Oreo Iced Latte",
      exact: true,
    });
    await plus.click();
    await expectTouchControl(page, plus);
    await expect(page.getByTestId("cart-total")).toHaveText(/26[.]400/);
    await minus.click();
    await expectTouchControl(page, minus);
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    await order
      .getByRole("button", {
        name: "Editar opciones de Oreo Iced Latte",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    const checkout = order.getByRole("button", {
      name: "Continuar al cobro",
      exact: true,
    });
    await expectTouchControl(page, checkout);
    await expectOrderWidth(page);
    await expect(page.locator("[data-pos-catalogue]")).toHaveCount(1);
    await expect(page.getByTestId("cart-lines")).toHaveCount(1);
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await page.screenshot({
        path: join(
          reportDirectory,
          `order-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }
    await checkout.click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: "Registrar cobro", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^(Cancelar|Volver al pedido)$/ })
      .click();
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    await showProducts(page);
    await expect(
      page
        .getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true })
        .getByText("1 en pedido", { exact: true }),
    ).toBeVisible();
    expect(app.errors).toEqual([]);
  });

test("order line edits, notes, removal and undo retain the configured draft on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mount(page, { modifiers: true });
  let options = await openProductOptions(page);
  await saveOptions(options);
  const order = await showOrder(page);
  const line = page.getByTestId("cart-line");
  await order
    .getByRole("button", { name: "Aumentar Oreo Iced Latte", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]200/);
  const editNotes = () =>
    line
      .getByRole("button", {
        name: "Editar observaciones de Oreo Iced Latte",
        exact: true,
      })
      .click();
  await editNotes();
  let note = page.getByRole("dialog");
  await note
    .getByRole("textbox", {
      name: "Observaciones de Oreo Iced Latte",
      exact: true,
    })
    .fill("Nota descartada");
  await note.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(line).not.toContainText("Nota descartada");
  await editNotes();
  note = page.getByRole("dialog");
  await note
    .getByRole("textbox", {
      name: "Observaciones de Oreo Iced Latte",
      exact: true,
    })
    .fill("Sin hielo");
  await note
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(line).toContainText("Sin hielo");
  await line
    .getByRole("button", {
      name: "Editar opciones de Oreo Iced Latte",
      exact: true,
    })
    .click();
  options = page.getByRole("dialog");
  await modifierLabel(options, "Mango").click();
  await options
    .getByRole("button", { name: "Aumentar Coco", exact: true })
    .click();
  await options.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(line).toContainText(/1 [x×] Chocolate/);
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]200/);
  await line
    .getByRole("button", {
      name: "Editar opciones de Oreo Iced Latte",
      exact: true,
    })
    .click();
  options = page.getByRole("dialog");
  await expect(modifierRadio(options, "Chocolate")).toBeChecked();
  await modifierLabel(options, "Mango").click();
  await options
    .getByRole("button", { name: "Aumentar Coco", exact: true })
    .click();
  await saveOptions(options);
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]600/);
  await expect(line).toContainText(/1 [x×] Mango/);
  await expect(line).toContainText(/1 [x×] Coco/);
  await expect(line).toContainText("Sin hielo");
  await line
    .getByRole("button", { name: "Quitar Oreo Iced Latte", exact: true })
    .click();
  await expect(line).toHaveCount(0);
  await expect(page.getByTestId("cart-total")).toHaveText(/0[,.]00/);
  await order.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Sin hielo");
  await expect(line).toContainText(/1 [x×] Mango/);
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]600/);
  await order
    .getByRole("button", { name: "Disminuir Oreo Iced Latte", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/7[.]800/);
  expect(app.errors).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 640 },
])
  test(`order line removal leaves surviving actions usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const app = await mount(page);
    for (const name of ["Shake Oreo", "Cappuccino", "Soft Frutilla"])
      await page
        .getByRole("button", { name: `Agregar ${name}`, exact: true })
        .click();

    const order = await showOrder(page);
    const lines = order.getByTestId("cart-line");
    const total = order.getByTestId("cart-total");
    await expect(lines).toHaveCount(3);
    await order
      .getByRole("button", { name: "Quitar Shake Oreo", exact: true })
      .click();
    await expect(lines).toHaveCount(2);
    await expect(total).toHaveText(/7[.]000/);

    await order
      .getByRole("button", { name: "Aumentar Cappuccino", exact: true })
      .click({ timeout: 5000 });
    await expect(total).toHaveText(/10[.]500/);
    await order
      .getByRole("button", {
        name: "Editar observaciones de Cappuccino",
        exact: true,
      })
      .click({ timeout: 5000 });
    const editor = page.getByRole("dialog");
    await editor
      .getByRole("textbox", {
        name: "Observaciones de Cappuccino",
        exact: true,
      })
      .fill("Bien caliente");
    await editor
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();

    await order.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect(lines).toHaveCount(3);
    await expect(lines.filter({ hasText: "Shake Oreo" })).toHaveCount(1);
    await expect(lines.filter({ hasText: "Cappuccino" })).toContainText(
      "Bien caliente",
    );
    await expect(total).toHaveText(/18[.]400/);
    expect(app.errors).toEqual([]);
  });

test("order draft retains customer, locator, notes and quantities through history detail and breakpoints", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mount(page, { navigation: true });
  const customer = page.getByRole("combobox", { name: "Cliente", exact: true });
  await customer.fill("Cliente de prueba");
  await page.getByRole("option", { name: /Cliente de prueba/ }).click();
  await page.getByRole("button", { name: /^Localizador 1\b/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Localizador 3", exact: true })
    .click();
  await addDefaultOrder(page);
  await showOrder(page);
  await page
    .getByRole("button", { name: "Aumentar Oreo Iced Latte", exact: true })
    .click();
  await page.getByRole("button", { name: /Agregar nota al pedido/ }).click();
  const note = page.getByRole("dialog");
  await note.getByRole("textbox").fill("Llevar todo junto");
  await note.getByRole("button", { name: /Guardar/ }).click();
  await expect
    .poll(() => businessRequests(app.calls).configuration)
    .toBe(rows.length);
  const initial = businessRequests(app.calls);
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 360, height: 740 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await showOrder(page);
    await expect(page.getByTestId("cart-total")).toHaveText(/26[.]400/);
    await expect(page.getByTestId("cart-line")).toHaveCount(3);
    await expect(customer).toHaveValue("Cliente de prueba");
    await expect(
      page.getByRole("button", { name: /^Localizador 3\b/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Nota: Llevar todo junto/ }),
    ).toBeVisible();
    await expect(page.locator("[data-pos-catalogue]")).toHaveCount(1);
    await expect(page.getByTestId("cart-lines")).toHaveCount(1);
    expect(businessRequests(app.calls)).toEqual(initial);
  }
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /#42/ }).click();
  const detail = page.getByRole("dialog");
  await expect(
    detail.getByRole("heading", { name: "Venta #42", exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Cerrar detalle de venta", exact: true })
    .click();
  await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
  await showOrder(page);
  await expect(page.getByTestId("cart-total")).toHaveText(/26[.]400/);
  await expect(customer).toHaveValue("Cliente de prueba");
  await expect(
    page.getByRole("button", { name: /^Localizador 3\b/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Nota: Llevar todo junto/ }),
  ).toBeVisible();
  expect(businessRequests(app.calls)).toEqual(initial);
  expect(app.errors).toEqual([]);
});

test("order combo editing preserves quantity notes and confirmed component choices", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 768, height: 1024 });
  const app = await mount(page, { combos: true });
  for (let index = 0; index < 2; index++) {
    const options = await openProductOptions(page, "Combo merienda");
    await options
      .getByRole("button", { name: "Shake Oreo", exact: true })
      .click();
    await options
      .getByRole("button", { name: "Waffle con jamón y queso", exact: true })
      .click();
    await options
      .getByRole("button", { name: "Agregar combo", exact: true })
      .click();
  }
  const order = await showOrder(page);
  const line = page.getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(page.getByTestId("cart-total")).toHaveText(/18[.]000/);
  await line
    .getByRole("button", {
      name: "Editar observaciones de Combo merienda",
      exact: true,
    })
    .click();
  const note = page.getByRole("dialog");
  await note
    .getByRole("textbox", {
      name: "Observaciones de Combo merienda",
      exact: true,
    })
    .fill("Para compartir");
  await note
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await line
    .getByRole("button", {
      name: "Editar opciones de Combo merienda",
      exact: true,
    })
    .click();
  let options = page.getByRole("dialog");
  await expect(
    options.getByRole("button", { name: "Shake Oreo", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await options.getByRole("button", { name: /^Cappuccino/ }).click();
  await options.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("cart-total")).toHaveText(/18[.]000/);
  await expect(line).toContainText("Shake Oreo");
  await expect(line).not.toContainText("Cappuccino");
  await line
    .getByRole("button", {
      name: "Editar opciones de Combo merienda",
      exact: true,
    })
    .click();
  options = page.getByRole("dialog");
  await expect(
    options.getByRole("button", { name: "Shake Oreo", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await options.getByRole("button", { name: /^Cappuccino/ }).click();
  await options
    .getByRole("button", { name: "Agregar combo", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/19[.]000/);
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Cappuccino");
  await expect(line).toContainText("Para compartir");
  await expect(
    order.getByRole("button", { name: "Aumentar Combo merienda", exact: true }),
  ).toBeVisible();
  expect(app.errors).toEqual([]);
});

test("order scroll keeps its heading total and checkout action reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = await mount(page);
  for (const row of rows.slice(1))
    await page
      .getByRole("button", { name: `Agregar ${row.name}`, exact: true })
      .click();
  const order = await showOrder(page);
  const heading = order.getByRole("heading", {
    name: "Pedido actual",
    exact: true,
  });
  const checkout = order.getByRole("button", {
    name: "Continuar al cobro",
    exact: true,
  });
  const lines = page.getByTestId("cart-lines");
  const before = {
    heading: await heading.boundingBox(),
    checkout: await checkout.boundingBox(),
    total: await page.getByTestId("cart-total").textContent(),
  };
  expect(
    await lines.evaluate((element) => element.scrollHeight),
  ).toBeGreaterThan(await lines.evaluate((element) => element.clientHeight));
  await lines.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => lines.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const after = {
    heading: await heading.boundingBox(),
    checkout: await checkout.boundingBox(),
    total: await page.getByTestId("cart-total").textContent(),
  };
  for (const region of ["heading", "checkout"] as const)
    for (const value of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(after[region]![value] - before[region]![value]),
      ).toBeLessThanOrEqual(1);
  expect(after.total).toBe(before.total);
  await expectTouchControl(page, checkout);
  await expectOrderWidth(page);
  if (reportDirectory) {
    await mkdir(reportDirectory, { recursive: true });
    await page.screenshot({
      path: join(reportDirectory, "order-scroll-390.png"),
    });
    await writeFile(
      join(reportDirectory, "order-scroll.json"),
      JSON.stringify({ before, after }, null, 2),
    );
  }
  expect(app.errors).toEqual([]);
});
test("modifiers keep header and footer fixed while option groups scroll", async ({
  page,
}) => {
  const viewport = { width: 390, height: 640 };
  await page.setViewportSize(viewport);
  const app = await mount(page, { modifiers: true });
  const dialog = await openProductOptions(page);
  const header = dialog.locator(".pos-configuration-header");
  const groups = dialog.locator(".pos-modifier-groups");
  const footer = dialog.locator(".pos-modifier-footer");
  const firstOption = groups.locator(".pos-modifier-option").first();
  const confirm = footer.getByRole("button", {
    name: "Agregar al pedido",
    exact: true,
  });
  await expect(header).toBeVisible();
  await expect(groups).toBeVisible();
  await expect(footer).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const geometry = async () => ({
    header: await header.boundingBox(),
    groups: await groups.boundingBox(),
    footer: await footer.boundingBox(),
    firstOption: await firstOption.boundingBox(),
    groupScroll: await groups.evaluate((element) => ({
      top: element.scrollTop,
      height: element.clientHeight,
      total: element.scrollHeight,
    })),
    outerScroll: await dialog.evaluate((element) => ({
      dialog: element.scrollTop,
      document: document.documentElement.scrollTop,
      window: window.scrollY,
    })),
  });
  const before = await geometry();
  expect(before.groupScroll.total).toBeGreaterThan(before.groupScroll.height);
  expect(before.groupScroll.top).toBe(0);
  expect(before.header!.y).toBeGreaterThanOrEqual(0);
  expect(before.footer!.y + before.footer!.height).toBeLessThanOrEqual(
    viewport.height,
  );
  expect(before.groups!.y).toBeGreaterThanOrEqual(
    before.header!.y + before.header!.height,
  );
  expect(before.groups!.y + before.groups!.height).toBeLessThanOrEqual(
    before.footer!.y,
  );
  if (reportDirectory) {
    await mkdir(reportDirectory, { recursive: true });
    await page.screenshot({
      path: join(reportDirectory, "configuration-fixed-before-390x640.png"),
    });
  }
  // Scroll only the options, without focusing or scrolling the footer into view.
  await groups.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => groups.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const after = await geometry();
  expect(after.firstOption!.y).toBeLessThan(before.firstOption!.y);
  for (const region of ["header", "groups", "footer"] as const)
    for (const value of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(after[region]![value] - before[region]![value]),
        `${region} ${value}`,
      ).toBeLessThanOrEqual(1);
  expect(after.outerScroll).toEqual(before.outerScroll);
  expect(after.footer!.y + after.footer!.height).toBeLessThanOrEqual(
    viewport.height,
  );
  await expect(confirm).toBeEnabled();
  if (reportDirectory) {
    await page.screenshot({
      path: join(reportDirectory, "configuration-fixed-after-390x640.png"),
    });
    await writeFile(
      join(reportDirectory, "fixed-regions.json"),
      JSON.stringify({ viewport, before, after }, null, 2),
    );
  }
  await footer.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(app.errors).toEqual([]);
});
const modifierRadio = (dialog: Locator, name: string) =>
  dialog.getByRole("radio", { name: new RegExp("^" + name) });
const modifierLabel = (dialog: Locator, name: string) =>
  modifierRadio(dialog, name).locator("xpath=ancestor::label[1]");
async function openProductOptions(page: Page, name = "Oreo Iced Latte") {
  await page
    .getByRole("button", { name: `Agregar ${name}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
])
  test(`modifiers preserve product defaults, recipe membership and accessible actions at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const app = await mount(page, { modifiers: true });
    let dialog = await openProductOptions(page);
    await expect(modifierRadio(dialog, "Chocolate")).toBeChecked();
    await expect(modifierRadio(dialog, "Mango")).not.toBeChecked();
    await expect(modifierRadio(dialog, "Mora")).toBeDisabled();
    await expect(
      modifierLabel(dialog, "Chocolate").getByText(
        "Viene incluida en la receta",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      modifierLabel(dialog, "Mango").getByText("Viene incluida en la receta", {
        exact: true,
      }),
    ).toHaveCount(0);
    await modifierLabel(dialog, "Mango").click();
    await expect(modifierRadio(dialog, "Mango")).toBeChecked();
    await expect(modifierRadio(dialog, "Chocolate")).not.toBeChecked();
    await expect(
      modifierLabel(dialog, "Chocolate").getByText(
        "Viene incluida en la receta",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      modifierLabel(dialog, "Mango").getByText("Viene incluida en la receta", {
        exact: true,
      }),
    ).toHaveCount(0);
    const confirm = dialog.getByRole("button", {
      name: "Agregar al pedido",
      exact: true,
    });
    await expect(confirm).toBeEnabled();
    const bounds = await confirm.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await page.screenshot({
        path: join(reportDirectory, `modifiers-${viewport.width}.png`),
      });
    }
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    dialog = await openProductOptions(page);
    await expect(modifierRadio(dialog, "Chocolate")).toBeChecked();
    await expect(modifierRadio(dialog, "Mango")).not.toBeChecked();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    dialog = await openProductOptions(page, "Shake Oreo");
    await expect(modifierRadio(dialog, "Mango")).toBeChecked();
    await expect(modifierRadio(dialog, "Chocolate")).not.toBeChecked();
    await expect(
      modifierLabel(dialog, "Mango").getByText("Viene incluida en la receta", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      modifierLabel(dialog, "Chocolate").getByText(
        "Viene incluida en la receta",
        { exact: true },
      ),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByTestId("cart-line")).toHaveCount(0);
    expect(app.errors).toEqual([]);
  });

test("modifiers enforce multiple selection, per-option maxima and group minimum and maximum", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mount(page, { modifiers: true });
  const dialog = await openProductOptions(page);
  const confirm = dialog.getByRole("button", {
    name: "Agregar al pedido",
    exact: true,
  });
  const quantity = (name: string) =>
    dialog.getByLabel(`Cantidad ${name}`, { exact: true });
  const add = (name: string) =>
    dialog.getByRole("button", { name: `Aumentar ${name}`, exact: true });
  const remove = (name: string) =>
    dialog.getByRole("button", { name: `Disminuir ${name}`, exact: true });
  await expect(quantity("Crocantes")).toHaveText("1");
  await expect(quantity("Coco")).toHaveText("0");
  await add("Crocantes").click();
  await expect(quantity("Crocantes")).toHaveText("2");
  await expect(add("Crocantes")).toBeDisabled();
  await add("Coco").click();
  await expect(quantity("Crocantes")).toHaveText("2");
  await expect(quantity("Coco")).toHaveText("1");
  await expect(add("Coco")).toBeDisabled();
  await expect(add("Sprinkles")).toBeDisabled();
  await remove("Crocantes").click();
  await add("Coco").click();
  await expect(quantity("Crocantes")).toHaveText("1");
  await expect(quantity("Coco")).toHaveText("2");
  await expect(confirm).toBeEnabled();
  await remove("Crocantes").click();
  await remove("Coco").click();
  await remove("Coco").click();
  await expect(quantity("Crocantes")).toHaveText("0");
  await expect(quantity("Coco")).toHaveText("0");
  await expect(confirm).toBeDisabled();
  await add("Sprinkles").click();
  await expect(confirm).toBeEnabled();
  const optionalGroup = dialog.locator("details").filter({ hasText: "Salsas" });
  if (await optionalGroup.count())
    await optionalGroup.locator("summary").click();
  await add("Caramelo").click();
  await add("Frutilla").click();
  await expect(quantity("Caramelo")).toHaveText("1");
  await expect(quantity("Frutilla")).toHaveText("1");
  await remove("Caramelo").click();
  await remove("Frutilla").click();
  await expect(confirm).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(0);
  expect(app.errors).toEqual([]);
});

test("modifiers keep confirmed quantity and notes through cancellation and update price and labels only when saved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mount(page, { modifiers: true });
  for (let index = 0; index < 2; index++) {
    const options = await openProductOptions(page);
    await options
      .getByRole("button", { name: "Agregar al pedido", exact: true })
      .click();
  }
  const line = page.getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]200/);
  await line
    .getByRole("button", {
      name: "Editar observaciones de Oreo Iced Latte",
      exact: true,
    })
    .click();
  const note = page.getByRole("dialog");
  await note
    .getByRole("textbox", {
      name: "Observaciones de Oreo Iced Latte",
      exact: true,
    })
    .fill("Sin hielo");
  await note
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  const edit = line.getByRole("button", {
    name: "Editar opciones de Oreo Iced Latte",
    exact: true,
  });
  await edit.click();
  let options = page.getByRole("dialog");
  await modifierLabel(options, "Mango").click();
  await options
    .getByRole("button", { name: "Aumentar Coco", exact: true })
    .click();
  await options.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]200/);
  await expect(line).toContainText(/1 [x×] Chocolate/);
  await expect(line).not.toContainText(/1 [x×] Mango/);
  await expect(line).toContainText("Sin hielo");
  await edit.click();
  options = page.getByRole("dialog");
  await expect(modifierRadio(options, "Chocolate")).toBeChecked();
  await expect(
    options.getByLabel("Cantidad Crocantes", { exact: true }),
  ).toHaveText("1");
  await expect(options.getByLabel("Cantidad Coco", { exact: true })).toHaveText(
    "0",
  );
  await modifierLabel(options, "Mango").click();
  await options
    .getByRole("button", { name: "Aumentar Coco", exact: true })
    .click();
  await options
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(page.getByTestId("cart-total")).toHaveText(/15[.]600/);
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(/1 [x×] Mango/);
  await expect(line).toContainText(/1 [x×] Crocantes/);
  await expect(line).toContainText(/1 [x×] Coco/);
  await expect(line).not.toContainText(/1 [x×] Chocolate/);
  await expect(line).toContainText("Sin hielo");
  await expect(
    page
      .getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true })
      .getByText("2 en pedido", { exact: true }),
  ).toBeVisible();
  expect(app.errors).toEqual([]);
});
async function expectUnclippedKeyboardFocus(button: Locator) {
  await expect(button).toBeFocused();
  const focus = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const extent =
      parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const clipped: { ancestor: string; edge: string; clearance: number }[] = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      const ancestorStyle = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      const left = bounds.left + ancestor.clientLeft;
      const top = bounds.top + ancestor.clientTop;
      const right = left + ancestor.clientWidth;
      const bottom = top + ancestor.clientHeight;
      if (
        ["auto", "scroll", "hidden", "clip"].includes(ancestorStyle.overflowX)
      ) {
        if (rect.left - extent < left - 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "left",
            clearance: rect.left - extent - left,
          });
        if (rect.right + extent > right + 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "right",
            clearance: right - rect.right - extent,
          });
      }
      if (
        ["auto", "scroll", "hidden", "clip"].includes(ancestorStyle.overflowY)
      ) {
        if (rect.top - extent < top - 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "top",
            clearance: rect.top - extent - top,
          });
        if (rect.bottom + extent > bottom + 0.5)
          clipped.push({
            ancestor: ancestor.className || ancestor.tagName,
            edge: "bottom",
            clearance: bottom - rect.bottom - extent,
          });
      }
      ancestor = ancestor.parentElement;
    }
    return {
      visible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      extent,
      clipped,
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.extent).toBeGreaterThanOrEqual(4);
  expect(focus.clipped).toEqual([]);
}
for (const region of ["categories", "products"] as const)
  test(`catalogue focus ring stays visible at the first and last ${region} when using the keyboard`, async ({
    page,
  }) => {
    // The baseline 844px height cannot fit one complete card until Task4.
    // Keep this check about the focus halo, with room for a full card.
    await page.setViewportSize({ width: 390, height: 1024 });
    await mount(page);
    const catalogue = page.locator("[data-pos-catalogue]");
    const categoryButtons = catalogue
      .getByRole("group", { name: "Categorías de productos" })
      .getByRole("button");
    const cards = catalogue.locator(".pos-product-card");
    await catalogue
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    if (region === "categories") {
      await expectUnclippedKeyboardFocus(categoryButtons.first());
      for (let index = 1; index < (await categoryButtons.count()); index++)
        await page.keyboard.press("Tab");
      await expectUnclippedKeyboardFocus(categoryButtons.last());
    } else {
      for (let index = 0; index < (await categoryButtons.count()); index++)
        await page.keyboard.press("Tab");
      await expectUnclippedKeyboardFocus(cards.first());
      for (let index = 1; index < (await cards.count()); index++)
        await page.keyboard.press("Tab");
      await expectUnclippedKeyboardFocus(cards.last());
    }
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await page.screenshot({
        path: join(reportDirectory, `focus-${region}-390.png`),
      });
    }
  });

test("catalogue handles an empty category and a long product name with a missing photo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const app = await mount(page, { edgeCases: true });
  const catalogue = page.locator("[data-pos-catalogue]");
  const longCard = catalogue.getByRole("button", {
    name: `Agregar ${longProductName}`,
    exact: true,
  });
  await longCard.scrollIntoViewIfNeeded();
  await expect(longCard.getByLabel("Sin foto", { exact: true })).toBeVisible();
  const nameGeometry = await longCard
    .locator(".pos-product-name")
    .evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
  expect(nameGeometry.scrollWidth).toBeLessThanOrEqual(
    nameGeometry.clientWidth,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await captureCheckout(page, "320-long-name");
  const before = app.calls.filter((call) =>
    call.path.includes("kind=products"),
  ).length;
  await catalogue
    .getByRole("button", { name: "Sin productos", exact: true })
    .click();
  await expect(
    catalogue.getByText("No hay productos con estos filtros", { exact: true }),
  ).toBeVisible();
  await expect(catalogue.locator(".pos-product-card")).toHaveCount(0);
  await catalogue.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(longCard).toBeVisible();
  expect(
    app.calls.filter((call) => call.path.includes("kind=products")).length,
  ).toBe(before);
  expect(app.errors).toEqual([]);
});
test.use({ actionTimeout: 15000 });
test.afterAll(async () => {
  if (!reportDirectory) return;
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    join(reportDirectory, "metrics.json"),
    JSON.stringify(
      {
        source:
          "SalesManager isolated browser fixture; mocked API, no DB; production profiling build",
        node: process.version,
        scriptBytes,
        runs: profiles,
      },
      null,
      2,
    ),
  );
});
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
])
  test(`POS baseline preserves one draft and cached options at ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const app = await mount(page);
    await expect
      .poll(
        () =>
          app.calls.filter((call) => call.path.includes("/configuration"))
            .length,
      )
      .toBe(rows.length);
    const configStart = performance.now();
    await page
      .getByRole("button", { name: "Agregar Oreo Iced Latte", exact: true })
      .click();
    const options = page.getByRole("dialog");
    await expect(
      options.getByText("Perlas", { exact: false }).first(),
    ).toBeVisible();
    const configurationReadyMs = performance.now() - configStart;
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await page.screenshot({
        path: join(reportDirectory, `modifiers-${viewport.width}.png`),
      });
    }
    await options
      .getByRole("button", { name: "Agregar al pedido", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar Shake Oreo", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar Soft Frutilla", exact: true })
      .click();
    const catalogueCalls = () =>
      app.calls.filter((call) => call.path.includes("kind=products")).length;
    const configurationCalls = () =>
      app.calls.filter((call) => call.path.includes("/configuration")).length;
    const before = {
      catalogue: catalogueCalls(),
      configuration: configurationCalls(),
    };
    const beforeSearch = await page.evaluate(() => window.posProfile);
    await page
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .fill("taro");
    await expect(
      page.getByRole("button", {
        name: "Agregar Taro Iced Latte",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar productos", exact: true })
      .fill("");
    await page.getByRole("button", { name: "Shakes", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Agregar Shake Oreo", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Todas", exact: true }).click();
    const afterSearch = await page.evaluate(() => window.posProfile);
    if (reportDirectory)
      await page.screenshot({
        path: join(reportDirectory, `catalogue-${viewport.width}.png`),
      });
    if (viewport.width < 1024)
      await page.getByRole("button", { name: /Ver pedido/ }).click();
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    if (reportDirectory)
      await page.screenshot({
        path: join(reportDirectory, `order-${viewport.width}.png`),
      });
    const lineArea = await page.getByTestId("cart-lines").boundingBox();
    const collapsedBaseline =
      process.env.POS_SURFACE_USE_FROZEN_SOURCE === "1" &&
      (lineArea?.height ?? 0) < 44;
    const beforeEdit = await page.evaluate(() => window.posProfile);
    if (!collapsedBaseline) {
      expect(lineArea?.height).toBeGreaterThanOrEqual(44);
      await page
        .getByRole("button", {
          name: "Editar opciones de Oreo Iced Latte",
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
    }
    const afterEdit = await page.evaluate(() => window.posProfile);
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    await page.setViewportSize({
      width: viewport.width === 1280 ? 390 : 1280,
      height: viewport.height,
    });
    await expect(page.getByTestId("cart-lines")).toHaveCount(1);
    await page.setViewportSize(viewport);
    expect(catalogueCalls()).toBe(before.catalogue);
    expect(configurationCalls()).toBe(before.configuration);
    await page
      .getByRole("button", { name: "Continuar al cobro", exact: true })
      .click();
    const payment = page.getByRole("dialog");
    await payment
      .getByRole("button", { name: "Efectivo", exact: true })
      .click();
    await payment
      .getByRole("textbox", { name: "Efectivo recibido 1", exact: true })
      .fill("20000");
    if (reportDirectory)
      await page.screenshot({
        path: join(reportDirectory, `payment-${viewport.width}.png`),
      });
    await payment
      .getByRole("button", { name: /^(Volver al pedido|Cancelar)$/ })
      .click();
    await expect(page.getByTestId("cart-total")).toHaveText(/18[.]900/);
    expect(app.errors).toEqual([]);
    profiles.push({
      viewport,
      catalogueReadyMs: app.catalogueReadyMs,
      configurationReadyMs,
      calls: app.calls,
      renderProfile: await page.evaluate(() => window.posProfile),
      searchProfile: {
        commits: afterSearch.commits - beforeSearch.commits,
        actualDurationMs:
          afterSearch.actualDurationMs - beforeSearch.actualDurationMs,
      },
      editProfile: collapsedBaseline
        ? null
        : {
            commits: afterEdit.commits - beforeEdit.commits,
            actualDurationMs:
              afterEdit.actualDurationMs - beforeEdit.actualDurationMs,
          },
      lineAreaHeight: lineArea?.height,
      baselineIssues: collapsedBaseline
        ? [
            "Order lines collapse to zero height at this viewport; options cannot be edited.",
          ]
        : [],
    });
  });
test("catalogue uses one responsive grid, real quantities and cached data across filters and widths", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const app = await mount(page);
  await expect
    .poll(
      () =>
        app.calls.filter((call) => call.path.includes("/configuration")).length,
    )
    .toBe(rows.length);
  const counts = () => ({
    catalogue: app.calls.filter((call) => call.path.includes("kind=products"))
      .length,
    configurations: app.calls.filter((call) =>
      call.path.includes("/configuration"),
    ).length,
  });
  const initialCalls = counts();
  expect(initialCalls).toEqual({ catalogue: 1, configurations: rows.length });
  const catalogue = page.locator("[data-pos-catalogue]");
  const grid = catalogue.locator(".pos-product-grid");
  const frames: { width: number; columns: number; gridWidth: number }[] = [];
  for (const viewport of [
    { width: 1280, height: 800, columns: 3 },
    { width: 768, height: 1024, columns: 2 },
    { width: 390, height: 844, columns: 1 },
    { width: 360, height: 740, columns: 1 },
    { width: 320, height: 720, columns: 1 },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await expect(grid).toHaveCount(1);
    await expect
      .poll(() =>
        grid.evaluate(
          (element) =>
            getComputedStyle(element)
              .gridTemplateColumns.split(" ")
              .filter(Boolean).length,
        ),
      )
      .toBe(viewport.columns);
    const box = await grid.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    frames.push({
      width: viewport.width,
      columns: viewport.columns,
      gridWidth: box!.width,
    });
    expect(counts()).toEqual(initialCalls);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const first = catalogue.getByRole("button", {
    name: "Agregar Oreo Iced Latte",
    exact: true,
  });
  await first.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(first).toHaveAttribute("data-in-order", "true");
  await expect(first.getByText("1 en pedido", { exact: true })).toBeVisible();
  await first.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agregar al pedido", exact: true })
    .click();
  await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(grid).toHaveCount(1);
    await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
    await expect(page.getByTestId("cart-lines")).toHaveCount(1);
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-total")).toHaveText(/15[.]000/);
    expect(counts()).toEqual(initialCalls);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole("button", {
      name: "Editar opciones de Oreo Iced Latte",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("radio", { name: /Chocolate/ }),
  ).toBeChecked();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
  expect(counts()).toEqual(initialCalls);
  await catalogue
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("taro");
  await expect(
    catalogue.getByRole("button", {
      name: "Agregar Taro Iced Latte",
      exact: true,
    }),
  ).toBeVisible();
  await expect(first).toHaveCount(0);
  await catalogue
    .getByRole("textbox", { name: "Buscar productos", exact: true })
    .fill("");
  await catalogue.getByRole("button", { name: "Shakes", exact: true }).click();
  await expect(
    catalogue.getByRole("button", { name: "Agregar Shake Oreo", exact: true }),
  ).toBeVisible();
  await expect(first).toHaveCount(0);
  await catalogue.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(first.getByText("2 en pedido", { exact: true })).toBeVisible();
  expect(counts()).toEqual(initialCalls);
  expect(app.errors).toEqual([]);
  expect(
    await page
      .locator("[data-pos]")
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Barlow");
  if (reportDirectory) {
    await mkdir(reportDirectory, { recursive: true });
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.screenshot({
        path: join(reportDirectory, `catalogue-${viewport.width}.png`),
      });
    }
  }
  profiles.push({
    scope: "catalogue",
    frames,
    calls: app.calls,
    renderProfile: await page.evaluate(() => window.posProfile),
  });
});

for (const viewport of [
  { width: 320, height: 720 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  for (const state of ["delivery", "receipt"] as const) {
    test(`shell catalogue has a physical product target at ${viewport.width} with ${state}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const app = await mountCheckout(page, { shell: true });
      const main = page.locator("main#main-content");
      const header = await page.locator("[data-topbar]").boundingBox();
      expect(header!.height).toBeGreaterThanOrEqual(110);
      expect(await main.evaluate((node) => node.clientHeight)).toBeCloseTo(
        viewport.height - header!.height,
        0,
      );
      if (state === "delivery") {
        await page
          .getByRole("button", { name: "Delivery", exact: true })
          .click();
      } else {
        await prepareCappuccino(page);
        await confirmCheckout(await openCashCheckout(page)).click();
        await expect(confirmationRegion(page)).toContainText(
          /Venta cobrada.*#73/,
        );
      }
      const product = page.getByRole("button", {
        name: "Agregar Cappuccino",
        exact: true,
      });
      await expect(product).toBeEnabled();
      await product.evaluate((node) =>
        node.scrollIntoView({ block: "center" }),
      );
      const tap = await visibleTouchPoint(product);
      expect(
        tap,
        "44 consecutive product pixels must receive pointer input inside the actual shell",
      ).toBeTruthy();
      await page.mouse.click(tap!.x, tap!.y);
      await expect(page.getByTestId("cart-line")).toHaveCount(1);
      await expect(page.getByTestId("cart-line")).toContainText("Cappuccino");
      expect(app.submissions).toHaveLength(state === "receipt" ? 1 : 0);
      expect(app.errors).toEqual([]);
    });
  }
}

const rejectedDiscard = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Descartar envío rechazado" });
const sameCommand = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Reintentar mismo envío" });

test("cancel permission rejection releases sale detail and retains the new draft", async ({
  page,
}) => {
  const app = await mountCheckout(page, { navigation: true });
  await prepareCappuccino(page);
  await confirmCheckout(await openCashCheckout(page)).click();
  await expect(confirmationRegion(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Agregar Soft Frutilla", exact: true })
    .click();
  await page.getByRole("button", { name: /Última venta/ }).click();
  const detail = page.locator("[data-sale-detail]");
  await detail
    .getByRole("button", { name: "Anular venta", exact: true })
    .click();
  const cancellation = page.getByRole("dialog", { name: "Anular venta #73" });
  await cancellation.getByRole("textbox").fill("Pedido equivocado");
  await cancellation.getByRole("checkbox").check();
  let attempts = 0;
  await page.route("**/cancel", (route) => {
    attempts++;
    return route.fulfill({ status: 403, json: { error: "Sin permiso" } });
  });
  await cancellation
    .getByRole("button", { name: "Confirmar anulación" })
    .click();
  await expect(sameCommand(cancellation)).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(rejectedDiscard(cancellation)).toBeEnabled();
  await rejectedDiscard(cancellation).click();
  await page.keyboard.press("Escape");
  await expect(cancellation).toHaveCount(0);
  await expect(
    detail.getByRole("heading", { name: "Venta #73" }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Cerrar detalle de venta" }).click();
  await expect(page.getByTestId("cart-line")).toContainText("Soft Frutilla");
  expect(attempts).toBe(1);
  expect(app.submissions).toHaveLength(1);
});

for (const uncertain of [false, true])
  test(`account deep link preserves the discard policy for a saved command (uncertain=${uncertain})`, async ({
    page,
  }) => {
    const app = await mountCheckout(page, { shell: true });
    const sale = confirmedFixtureSale();
    const url = `/api/sales/${sale.id}/cancel`;
    const payload = {
      requestId: id(999),
      revision: 1,
      reason: "Pedido equivocado",
      refundConfirmed: true,
    };
    await page.evaluate(
      ({ url, payload, uncertain }) => {
        sessionStorage.setItem(
          "kybo:pending:surface-cashier:10000000-0000-4000-8000-000000000001:sale",
          JSON.stringify({ url, payload, outcomeUncertain: uncertain }),
        );
      },
      { url, payload, uncertain },
    );
    const attempts: string[] = [];
    await page.route("**/cancel", (route) => {
      attempts.push(route.request().postData()!);
      return route.fulfill({
        status: 401,
        json: { error: "Autenticación requerida" },
      });
    });
    await page.goto("/sales?account=" + sale.id);
    const detail = page.locator("[data-sale-detail]");
    await expect(
      detail.getByRole("heading", { name: "Venta #73" }),
    ).toBeVisible();
    await sameCommand(detail).click();
    await expect.poll(() => attempts).toEqual([JSON.stringify(payload)]);
    await expect(sameCommand(detail)).toBeEnabled();
    if (uncertain) {
      await expect(rejectedDiscard(detail)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(detail).toBeVisible();
    } else {
      await rejectedDiscard(detail).click({ timeout: 5000 });
      await detail
        .getByRole("button", { name: "Cerrar detalle de venta" })
        .click();
      await expect(detail).toHaveCount(0);
    }
    expect(attempts).toHaveLength(1);
    expect(app.submissions).toHaveLength(0);
  });

test("price refresh sends the current revision and preserves the edited line", async ({
  page,
}) => {
  const app = await mountCheckout(page, { firstResponse: "conflict" });
  await prepareCappuccino(page);
  const line = page.getByTestId("cart-line");
  await line.getByRole("button", { name: "Aumentar Cappuccino" }).click();
  await line
    .getByRole("button", { name: "Editar observaciones de Cappuccino" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Observaciones de Cappuccino" })
    .fill("Sin azúcar");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar cambios" })
    .click();
  const payment = await openCashCheckout(page);
  const received = payment.getByRole("textbox", {
    name: "Efectivo recibido 1",
  });
  await received.fill("10000");
  await confirmCheckout(payment).click();
  await expect(payment).toContainText("Revisá el precio");
  await payment.getByRole("button", { name: "Cancelar", exact: true }).click();
  const fresh = { ...rows[7], price: "3900.00", pricingRevision: 2 };
  await page.route("**/api/sales/lookup?**", (route) =>
    new URL(route.request().url()).searchParams.get("q") === fresh.id
      ? route.fulfill({ json: { rows: [fresh], total: 1, offset: 0 } })
      : route.fallback(),
  );
  await page.route(
    `**/api/sales/products/${fresh.id}/configuration?**`,
    (route) =>
      route.fulfill({
        json: {
          ...configuration(fresh.id),
          basePrice: fresh.price,
          catalogBasePrice: fresh.price,
          pricingRevision: 2,
        },
      }),
  );
  await page.getByRole("button", { name: "Actualizar precios" }).click();
  await expect(page.getByTestId("cart-total")).toHaveText(/7[.]800/);
  await expect(line).toContainText("Sin azúcar");
  await openCashCheckout(page);
  await received.fill("10000");
  await confirmCheckout(payment).click();
  await expect.poll(() => app.submissions.length).toBe(2);
  const original = { productId: fresh.id, quantity: 2, notes: "Sin azúcar" };
  expect(app.submissions[0].payload.lines).toMatchObject([
    { ...original, expectedPrice: "3500.00", expectedPricingRevision: 1 },
  ]);
  expect(app.submissions[1].payload.lines).toMatchObject([
    {
      ...original,
      price: "3900",
      expectedPrice: "3900.00",
      expectedPricingRevision: 2,
    },
  ]);
});

test("checkout can safely discard after a stock rejection and failed local cleanup", async ({
  page,
}) => {
  const app = await mountCheckout(page, { firstResponse: "stock" });
  await prepareCappuccino(page);
  const payment = await openCashCheckout(page);
  await failSaleCleanupOnce(page);
  await confirmCheckout(payment).click();
  await expect(sameCommand(payment)).toBeEnabled();
  await expect(confirmCheckout(payment)).toBeDisabled();
  await expect(
    payment.getByRole("textbox", { name: "Efectivo recibido 1" }),
  ).toHaveValue("5000");
  await rejectedDiscard(payment).click();
  await expect(confirmCheckout(payment)).toBeEnabled();
  await payment.getByRole("button", { name: "Cancelar", exact: true }).click();
  const line = page.getByTestId("cart-line");
  await expect(line).toContainText("Cappuccino");
  await line.getByRole("button", { name: "Aumentar Cappuccino" }).click();
  await expect(page.getByTestId("cart-total")).toHaveText(/7[.]000/);
  expect(app.submissions).toHaveLength(1);
});
