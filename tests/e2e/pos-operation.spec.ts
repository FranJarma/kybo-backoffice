import { expect, test, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const storageKey = "kybo:pending:cashier:branch:sale";
let script: string;

test.beforeAll(async () => {
  const esbuild = createRequire(require.resolve("tsx"))("esbuild");
  const bundle = await esbuild.build({
    entryPoints: ["tests/helpers/pos-operation-ui.tsx"],
    write: false,
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  script = bundle.outputFiles[0].text;
});

type Dispatch = { body: string; saved: string | null };
declare global {
  interface Window {
    posDispatches: Dispatch[];
  }
}
async function fixture(page: Page, respond: (route: Route) => Promise<void>) {
  await page.addInitScript((key: string) => {
    window.posDispatches = [];
    const fetch = window.fetch.bind(window);
    window.fetch = (url, init) => {
      if (url === "/api/sales" && init?.method === "POST")
        window.posDispatches.push({
          body: String(init.body),
          saved: sessionStorage.getItem(key),
        });
      return fetch(url, init);
    };
  }, storageKey);
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/__operation")
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<main id="fixture"></main><script src="/fixture.js"></script>',
      });
    if (path === "/fixture.js")
      return route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: script,
      });
    if (path === "/api/sales" && route.request().method() === "POST")
      return respond(route);
    return route.abort();
  });
  await page.goto("/__operation");
  await expect(
    page.getByRole("button", { name: "Enviar", exact: true }),
  ).toBeEnabled();
}
const dispatches = (page: Page) => page.evaluate(() => window.posDispatches);
const saved = (page: Page) =>
  page.evaluate((key) => sessionStorage.getItem(key), storageKey);
const confirmedSale = {
  id: "10000000-0000-4000-8000-000000000001",
  number: 1,
  revision: 1,
  origin: "counter",
  channel: "counter",
  status: "closed",
  fulfillment: "takeaway",
  totalAmount: "150.00",
  paidAmount: "150.00",
  balanceDue: "0.00",
  localCollected: "150.00",
  platformCollected: "0.00",
  createdAt: "2026-10-01T12:00:00.000Z",
  orders: [
    {
      id: "order",
      sequence: 1,
      totalAmount: "150.00",
      createdAt: "2026-10-01T12:00:00.000Z",
      lines: [
        {
          id: "line",
          quantity: 1,
          name: "Café",
          unitPrice: "150.00",
          lineTotal: "150.00",
          modifiers: [],
        },
      ],
    },
  ],
  payments: [
    {
      id: "payment",
      kind: "collection",
      collector: "local",
      methodName: "Efectivo",
      amount: "150.00",
      createdAt: "2026-10-01T12:00:00.000Z",
    },
  ],
};
const confirm = (route: Route) => route.fulfill({ json: confirmedSale });

test("admits one immediate submit and persists it while the response is slow", async ({
  page,
}) => {
  let release!: () => void;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  await fixture(page, async (route) => {
    await slow;
    await confirm(route);
  });
  try {
    await page.getByRole("button", { name: "Doble envío" }).click();
    await expect(page.getByTestId("state")).toHaveText("enviando");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    const sent = await dispatches(page);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].saved!)).toMatchObject({
      outcomeUncertain: true,
      payload: JSON.parse(sent[0].body),
    });
    expect(await saved(page)).toBe(sent[0].saved);
  } finally {
    release();
  }
  await expect(page.getByTestId("confirmed")).toHaveText("1");
  expect(await saved(page)).toBeNull();
});

test("admits one immediate retry of the same request", async ({ page }) => {
  const bodies: string[] = [];
  await fixture(page, async (route) => {
    bodies.push(route.request().postData()!);
    if (bodies.length === 1) return route.abort();
    return confirm(route);
  });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("state")).toHaveText("incierto");
  await page.getByRole("button", { name: "Doble reintento" }).click();
  const sent = await dispatches(page);
  expect(sent.map((call) => call.body)).toEqual([bodies[0], bodies[0]]);
  await expect(page.getByTestId("confirmed")).toHaveText("1");
  expect(await saved(page)).toBeNull();
});

test("replays the same request after network loss, 503 and truncated JSON across reloads", async ({
  page,
}) => {
  const bodies: string[] = [];
  await fixture(page, async (route) => {
    bodies.push(route.request().postData()!);
    switch (bodies.length) {
      case 1:
        return route.abort();
      case 2:
        return route.fulfill({ status: 503, json: { error: "Temporal" } });
      case 3:
        return route.fulfill({ contentType: "application/json", body: "{" });
      default:
        return confirm(route);
    }
  });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await expect(page.getByTestId("state")).toHaveText("incierto");
    expect(JSON.parse((await saved(page))!)).toMatchObject({
      outcomeUncertain: true,
      payload: JSON.parse(bodies[0]),
    });
    await page.reload();
    await expect(page.getByTestId("state")).toHaveText("incierto");
    expect(bodies).toHaveLength(attempt);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    expect(await dispatches(page)).toHaveLength(0);
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  }
  await expect(page.getByTestId("confirmed")).toHaveText("1");
  expect(bodies).toEqual(Array(4).fill(bodies[0]));
  expect(await saved(page)).toBeNull();
});

test("blocks discard immediately when retry begins", async ({ page }) => {
  let attempts = 0;
  let release!: () => void;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  await fixture(page, async (route) => {
    if (++attempts === 1)
      return route.fulfill({ status: 403, json: { error: "Sin permiso" } });
    await slow;
    return confirm(route);
  });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("discard")).toHaveText("true");
  try {
    await page.getByRole("button", { name: "Reintentar y descartar" }).click();
    await expect(page.getByTestId("state")).toHaveText("enviando");
    expect(await saved(page)).not.toBeNull();
  } finally {
    release();
  }
  await expect(page.getByTestId("confirmed")).toHaveText("1");
});

for (const [label, json] of Object.entries({
  empty: {},
  order: { ...confirmedSale, orders: [{}] },
  line: {
    ...confirmedSale,
    orders: [{ ...confirmedSale.orders[0], lines: [null] }],
  },
  payment: { ...confirmedSale, payments: [{ amount: 0 }] },
})) {
  test(`preserves the request after malformed 200 sale data (${label})`, async ({
    page,
  }) => {
    let attempts = 0;
    await fixture(page, (route) =>
      ++attempts === 1 ? route.fulfill({ json }) : confirm(route),
    );
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByTestId("state")).toHaveText("incierto", {
      timeout: 1000,
    });
    await expect(page.getByTestId("confirmed")).toHaveText("0");
    expect(await saved(page)).not.toBeNull();
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(page.getByTestId("confirmed")).toHaveText("1");
    const sent = await dispatches(page);
    expect(sent.map((call) => call.body)).toEqual([sent[0].body, sent[0].body]);
  });
}

test("releases admission when saving the initial request fails", async ({
  page,
}) => {
  await fixture(page, confirm);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      Storage.prototype.setItem = original;
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByText(/No pudimos asegurar el reintento/),
  ).toBeVisible();
  expect(await dispatches(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("confirmed")).toHaveText("1");
  expect(await dispatches(page)).toHaveLength(1);
});

test("rejects a retained submit while the original request is uncertain", async ({
  page,
}) => {
  await fixture(page, (route) => route.abort());
  await page.getByRole("button", { name: "Guardar acciones" }).click();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("state")).toHaveText("incierto");
  const original = await saved(page);
  await page.getByRole("button", { name: "Enviar anterior" }).click();
  expect(await dispatches(page)).toHaveLength(1);
  expect(await saved(page)).toBe(original);
});

test("rejects a retained retry after its request has been confirmed", async ({
  page,
}) => {
  let attempts = 0;
  await fixture(page, (route) =>
    ++attempts === 1 ? route.abort() : confirm(route),
  );
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("state")).toHaveText("incierto");
  await page.getByRole("button", { name: "Guardar acciones" }).click();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByTestId("confirmed")).toHaveText("1");
  await page.getByRole("button", { name: "Reintentar anterior" }).click();
  expect(await dispatches(page)).toHaveLength(2);
  expect(await saved(page)).toBeNull();
});

test("rejects a retained permission discard after an uncertain retry", async ({
  page,
}) => {
  let attempts = 0;
  await fixture(page, (route) =>
    ++attempts === 1
      ? route.fulfill({ status: 403, json: { error: "Sin permiso" } })
      : route.abort(),
  );
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("discard")).toHaveText("true");
  await page.getByRole("button", { name: "Guardar acciones" }).click();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByTestId("discard")).toHaveText("false");
  await expect(page.getByTestId("state")).toHaveText("incierto");
  const pending = await saved(page);
  expect(JSON.parse(pending!)).toMatchObject({ outcomeUncertain: true });
  await page.getByRole("button", { name: "Descartar anterior" }).click();
  expect(await saved(page)).toBe(pending);
  await expect(page.getByTestId("state")).toHaveText("incierto");
});
