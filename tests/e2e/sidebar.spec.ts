import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
type FixtureBuild = {
  onResolve(
    options: { filter: RegExp },
    callback: (args: { path: string }) => { path: string; namespace: string },
  ): void;
  onLoad(
    options: { filter: RegExp; namespace: string },
    callback: (args: { path: string }) => {
      loader: string;
      resolveDir: string;
      contents: string;
    },
  ): void;
};
let css = "",
  script = "";
test.use({ actionTimeout: 5000 });
test.beforeAll(async () => {
  await createRequire(require.resolve("tsx"))("esbuild").build({
    entryPoints: ["tests/helpers/sidebar-ui.tsx"],
    outfile: ".next-e2e/sidebar-fixture.js",
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
    plugins: [
      {
        name: "fixture-next-adapters",
        setup(build: FixtureBuild) {
          build.onResolve(
            { filter: /^next\/(navigation|link|image)$/ },
            ({ path }) => ({ path, namespace: "fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "jsx",
            resolveDir: process.cwd(),
            contents:
              path === "next/navigation"
                ? `export const usePathname = () => new URLSearchParams(location.search).get("path") || "/inventory";
               export const useRouter = () => ({replace: () => {}, refresh: () => {}});`
                : path === "next/link"
                  ? `import React from "react"; export default function Link({prefetch, scroll, replace, ...props}) { return <a {...props}/>; }`
                  : `import React from "react"; export default function Image({priority, ...props}) { return <img {...props}/>; }`,
          }));
        },
      },
    ],
  });
  script = await readFile(".next-e2e/sidebar-fixture.js", "utf8");
  css = (
    await createRequire(require.resolve("@tailwindcss/postcss"))("postcss")([
      require("@tailwindcss/postcss")(),
    ]).process(await readFile("src/app/globals.css", "utf8"), {
      from: "src/app/globals.css",
    })
  ).css;
  css += `\n${await readFile("src/components/cash/cash.css", "utf8")}`;
});

async function setup(page: Page, path = "/inventory") {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__sidebar") {
      const collapsed = /(?:^|;\s*)kybo-sidebar=collapsed(?:;|$)/.test(
        route.request().headers().cookie ?? "",
      );
      return route.fulfill({
        contentType: "text/html",
        body: `<html lang="es" data-sidebar-initial="${collapsed}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/__sidebar-fixture.js"></script></body></html>`,
      });
    }
    if (url.pathname === "/__sidebar-fixture.js")
      return route.fulfill({ contentType: "text/javascript", body: script });
    if (url.pathname === "/assets/kybo-logo.png")
      return route.fulfill({
        contentType: "image/png",
        body: await readFile("public/assets/kybo-logo.png"),
      });
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ status: 500, json: { error: "Error simulado" } });
    return route.abort();
  });
  await page.goto(`/__sidebar?path=${encodeURIComponent(path)}`);
  await expect(
    page.getByRole("heading", { name: "Contenido de prueba" }),
  ).toBeVisible();
}

test("collapsing recovers working space without losing the current form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.getByLabel("Pedido en curso").fill("Pedido 1234 — Martina");
  const before = (await page.locator("main").boundingBox())!.width;
  await page
    .getByRole("button", { name: "Colapsar menú lateral", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Expandir menú lateral" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(72);
  expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(
    before + 150,
  );
  await expect(page.getByLabel("Pedido en curso")).toHaveValue(
    "Pedido 1234 — Martina",
  );
  await page.screenshot({
    path: ".next-e2e/sidebar-collapsed-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Expandir menú lateral" }).click();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(264);
  await expect(page.getByLabel("Pedido en curso")).toHaveValue(
    "Pedido 1234 — Martina",
  );
});

test("the browser preference restores the initial width after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await setup(page);
  await page.getByRole("button", { name: "Colapsar menú lateral" }).click();
  expect(
    (await page.context().cookies()).find((c) => c.name === "kybo-sidebar")
      ?.value,
  ).toBe("collapsed");
  await page.reload();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())?.width)
    .toBe(72);
  await page.getByRole("button", { name: "Expandir menú lateral" }).click();
  await page.reload();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())?.width)
    .toBe(264);
});

test("cached layouts cannot restore an obsolete sidebar preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await setup(page);
  const cachedLayout = (path: string) =>
    page.evaluate((nextPath) => {
      window.dispatchEvent(
        new CustomEvent("fixture-sidebar-layout", {
          detail: { path: nextPath, collapsed: false },
        }),
      );
    }, path);
  await cachedLayout("/sales/tables");
  await page.getByRole("button", { name: "Colapsar menú lateral" }).click();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(72);
  await cachedLayout("/inventory");
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(72);
  await cachedLayout("/sales/tables");
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(72);
});

test("layout changes keep the active section visible without scrolling the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.locator("main").evaluate((element) => {
    element.style.minHeight = "1800px";
  });
  await page.evaluate(() => scrollTo(0, 200));
  const position = await page.evaluate(() => scrollY);
  const stock = page.getByRole("link", { name: "Stock actual", exact: true });
  await page.getByRole("button", { name: "Colapsar menú lateral" }).click();
  await expect(stock).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(position);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(stock).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Expandir menú lateral" }).click();
  await expect(stock).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(position);
});

test("compact navigation retains active links and mouse and keyboard labels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await setup(page);
  await page
    .getByRole("button", { name: "Colapsar menú lateral" })
    .press("Enter");
  const stock = page.getByRole("link", { name: "Stock actual", exact: true });
  await expect(stock).toHaveAttribute("aria-current", "page");
  await stock.hover();
  await expect(page.getByRole("tooltip")).toContainText("Stock actual");
  await page
    .getByRole("link", { name: "Insumos y artículos", exact: true })
    .focus();
  await expect(page.getByRole("tooltip")).toContainText("Insumos y artículos");
  expect((await stock.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('aside a[aria-current="page"]')).toHaveCount(1);
});

test("the compact preference keeps the mobile drawer complete and dismissible", async ({
  page,
  baseURL,
}) => {
  await page
    .context()
    .addCookies([{ name: "kybo-sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 768, height: 1024 });
  await setup(page);
  await expect(page.locator("aside")).toBeHidden();
  const menu = page.getByRole("button", { name: "Abrir menú", exact: true });
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Menú de Kybo" });
  await expect(dialog).toBeVisible();
  expect(
    (await dialog
      .getByRole("link", { name: "Stock actual", exact: true })
      .boundingBox())!.width,
  ).toBeGreaterThan(200);
  await expect(dialog.getByText("Francisco", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();
});

test("rotation closes the drawer and keeps the compact desktop preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await setup(page);
  await page.getByRole("button", { name: "Colapsar menú lateral" }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(72);
  await expect(
    page.getByRole("button", { name: "Expandir menú lateral" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".next-e2e/sidebar-collapsed-1024.png",
    fullPage: true,
  });
});

test("the POS keeps its full width and opens complete navigation", async ({
  page,
  baseURL,
}) => {
  await page
    .context()
    .addCookies([{ name: "kybo-sidebar", value: "collapsed", url: baseURL! }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, "/sales");
  await expect(page.locator("aside")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Expandir menú lateral" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Francisco", { exact: true })).toBeVisible();
  expect(
    (await dialog
      .getByRole("link", { name: "Stock actual", exact: true })
      .boundingBox())!.width,
  ).toBeGreaterThan(200);
});

test("sign out remains accessible in the rail and reports a failed request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await setup(page);
  await page.getByRole("button", { name: "Colapsar menú lateral" }).click();
  const signOut = page.getByRole("button", {
    name: "Cerrar sesión",
    exact: true,
  });
  await expect(signOut).toBeInViewport();
  await signOut.click();
  await expect(
    page.getByText("No pudimos cerrar sesión", { exact: true }),
  ).toBeVisible();
  await expect(signOut).toBeEnabled();
});

test("blocking preference cookies still allows changing the layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() =>
    Object.defineProperty(document, "cookie", {
      configurable: true,
      set() {
        throw new DOMException("Cookies disabled", "SecurityError");
      },
    }),
  );
  await page.getByRole("button", { name: "Colapsar menú lateral" }).click();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(72);
  await page.getByRole("button", { name: "Expandir menú lateral" }).click();
  await expect
    .poll(async () => (await page.locator("aside").boundingBox())!.width)
    .toBe(264);
  expect(errors).toEqual([]);
});

async function setupCashHeader(
  page: Page,
  options: {
    opened?: boolean;
    canView?: boolean;
    canOpen?: boolean;
    failFirst?: boolean;
    path?: string;
    cachedShell?: boolean;
    lastFund?: string;
    snapshotDelayMs?: number;
  } = {},
) {
  await setup(page, options.path ?? "/sales");
  let opened = options.opened ?? false;
  const posted: {
    requestId: string;
    command: { action: string; amount: string };
  }[] = [];
  const current = {
    id: "header-session",
    branchId: "test-branch",
    businessDate: "2026-10-27",
    state: "open",
    openedBy: "header-operator",
    openedByName: "María Fernández",
    openedAt: "2026-10-27T12:15:00Z",
    openingCash: "12500.50",
    openingReason: "",
    closeTime: "23:00",
    targetFund: null,
    timeZone: "America/Argentina/Buenos_Aires",
    revision: 1,
  };
  await page.route("**/api/cash**", async (route) => {
    expect(route.request().headers()["x-kybo-branch-id"]).toBe("test-branch");
    if (new URL(route.request().url()).pathname === "/api/cash/status")
      return route.fulfill({
        json: {
          available: true,
          actorId: "header-operator",
          activated: opened,
          branchId: "test-branch",
          timeZone: current.timeZone,
          open: opened,
          sessionId: opened ? current.id : null,
          canView: options.canView ?? true,
          canOpen: options.canOpen ?? true,
          opening:
            opened && options.canView !== false
              ? {
                  openedByName: current.openedByName,
                  openedAt: current.openedAt,
                  openingCash: current.openingCash,
                }
              : null,
        },
      });
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      if (options.failFirst && posted.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Conexión interrumpida" },
        });
      opened = true;
      current.openingCash = posted.at(-1)!.command.amount;
    }
    if (route.request().method() === "GET" && options.snapshotDelayMs)
      await new Promise((resolve) =>
        setTimeout(resolve, options.snapshotDelayMs),
      );
    return route.fulfill({
      json: {
        available: true,
        activated: opened,
        branchId: "test-branch",
        branchName: "Sucursal de prueba",
        timeZone: current.timeZone,
        capabilities: {
          open: options.canOpen ?? true,
          close: true,
          expense: true,
          externalExpense: true,
          withdraw: true,
          supplier: true,
          review: true,
          admin: true,
        },
        settings: { closeTime: "23:00", targetFund: null, revision: 0 },
        current: opened ? current : null,
        selected: opened ? current : null,
        lastClosed:
          options.lastFund === undefined
            ? null
            : {
                ...current,
                id: "previous-session",
                state: "closed",
                businessDate: "2026-10-26",
                closedAt: "2026-10-27T02:00:00Z",
                counted: "12500.50",
                withdrawal: "2500.00",
                fund: options.lastFund,
              },
        sessions: opened ? [current] : [],
        movements: [],
        pendingReviews: 0,
        totals: {
          expectedCash: "12500.50",
          opening: "12500.50",
          cashCollections: "0.00",
          cashRefunds: "0.00",
          expenses: "0.00",
          supplierPayments: "0.00",
          withdrawals: "0.00",
          cardTotal: "0.00",
          cardOperations: 0,
          transferTotal: "0.00",
          otherTotal: "0.00",
        },
      },
    });
  });
  if (options.cachedShell) {
    const url = new URL(page.url());
    url.searchParams.set("cached-shell", "1");
    await page.goto(url.href);
  } else await page.reload();
  return posted;
}

for (const opened of [false, true]) {
  test(`home header and brand stay aligned with cash ${opened ? "open" : "closed"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1906, height: 900 });
    await setupCashHeader(page, { path: "/", opened });
    await expect(page.locator("[data-cash-header]")).toBeVisible();
    const brand = (await page
      .locator("aside [data-brand-header]")
      .boundingBox())!;
    const topbar = (await page.locator("[data-topbar]").boundingBox())!;
    expect(
      Math.abs(brand.y + brand.height - topbar.y - topbar.height),
    ).toBeLessThanOrEqual(1);
    const selector = (await page
      .getByRole("combobox", { name: "Sucursal", exact: true })
      .boundingBox())!;
    const branch = page
      .getByRole("combobox", { name: "Sucursal", exact: true })
      .locator("..");
    await expect(
      branch.getByText("Kalú Gamezone", { exact: true }),
    ).toBeVisible();
    await expect(
      branch.getByText("Peatonal Alberdi", { exact: true }),
    ).toBeVisible();
    const cash = (await page.locator("[data-cash-header]").boundingBox())!;
    expect(
      Math.abs(selector.y + selector.height / 2 - cash.y - cash.height / 2),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `.next-e2e/header-home-${opened ? "open" : "closed"}-1906.png`,
      fullPage: true,
    });
    await page.screenshot({
      path: `.next-e2e/header-home-${opened ? "open" : "closed"}-strip.png`,
      clip: { x: 0, y: 0, width: 1906, height: 90 },
    });
  });
}

test("cash access survives a cached layout without the newly added actor prop", async ({
  page,
}) => {
  const posted = await setupCashHeader(page, { path: "/", cachedShell: true });
  await page
    .locator("[data-topbar]")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Fondo inicial contado" })
    .fill("500");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(posted).toHaveLength(1);
});

test("header opens cash in place and preserves the order while showing who opened it", async ({
  page,
}) => {
  const posted = await setupCashHeader(page);
  await page.getByLabel("Pedido en curso").fill("Pedido 1234 — Martina");
  const before = page.url();
  await page
    .locator("header[data-topbar]")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Fondo inicial contado" })
    .fill("12500,50");
  await dialog.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(dialog).toBeHidden();
  const status = page.locator("[data-cash-header]");
  await expect(status).toContainText("María Fernández");
  await expect(status).toContainText("09:15");
  await expect(status).toContainText("12.500,50");
  await expect(status).toContainText("Inicial");
  await expect(page.getByLabel("Pedido en curso")).toHaveValue(
    "Pedido 1234 — Martina",
  );
  expect(page.url()).toBe(before);
  expect(posted).toHaveLength(1);
  expect(posted[0].command).toMatchObject({
    action: "open",
    amount: "12500.50",
  });
});

test("cash opening keeps its primary outline colors at rest, hover and keyboard focus", async ({
  page,
}) => {
  await setupCashHeader(page, { path: "/" });
  const button = page
    .locator("[data-topbar]")
    .getByRole("button", { name: "Abrir caja", exact: true });
  const primary = "rgb(255, 133, 0)";
  await button.hover();
  await expect(button).toHaveCSS("color", primary);
  await expect(button).toHaveCSS("border-top-color", primary);
  await expect(button.locator("svg")).toHaveCSS("stroke", primary);
  await expect(button).not.toHaveCSS("background-color", "rgb(237, 245, 255)");
  await expect(button).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
  await button.screenshot({ path: ".next-e2e/cash-opening-primary-hover.png" });
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await button.screenshot({ path: ".next-e2e/cash-opening-primary-rest.png" });
  await button.focus();
  await expect(button).toHaveCSS("color", primary);
  await expect(button).toHaveCSS("border-top-color", primary);
  await expect(button.locator("svg")).toHaveCSS("stroke", primary);
});

test("header opening keeps the same request after an uncertain result", async ({
  page,
}) => {
  const posted = await setupCashHeader(page, { failFirst: true });
  await page
    .locator("header[data-topbar]")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Fondo inicial contado" })
    .fill("500");
  await dialog.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Reintentar la misma operación" })
    .click();
  await expect(dialog).toBeHidden();
  expect(posted).toHaveLength(2);
  expect(posted[0]).toEqual(posted[1]);
});

for (const path of ["/sales", "/finance/cash"]) {
  test(`opening focuses and selects the initial fund and shows the last retained fund from ${path}`, async ({
    page,
  }) => {
    const posted = await setupCashHeader(page, {
      path,
      lastFund: "10000.50",
      snapshotDelayMs: path === "/sales" ? 350 : 0,
    });
    if (path === "/finance/cash")
      await expect(
        page
          .locator("main")
          .getByRole("button", { name: "Abrir caja", exact: true }),
      ).toBeEnabled();
    await page
      .locator("[data-topbar]")
      .getByRole("button", { name: "Abrir caja", exact: true })
      .click();
    const input = page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Fondo inicial contado" });
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("10000,50");
    const history = page.locator("[data-cash-opening-history]");
    await expect(history).toContainText("10.000,50");
    expect((await history.boundingBox())!.y).toBeGreaterThan(
      (await input.boundingBox())!.y,
    );
    await page.keyboard.type("15000");
    await expect(input).toHaveValue("15000");
    expect(posted).toHaveLength(0);
  });
}

test("first opening focuses the amount and explains that no prior closing exists", async ({
  page,
}) => {
  await setupCashHeader(page, { snapshotDelayMs: 350 });
  await page
    .locator("[data-topbar]")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Fondo inicial contado" }),
  ).toBeFocused();
  await expect(page.locator("[data-cash-opening-history]")).toContainText(
    "No hay cierres anteriores",
  );
});

test("the header reuses the existing opening form on the cash page", async ({
  page,
}) => {
  const posted = await setupCashHeader(page, { path: "/finance/cash" });
  await page
    .locator("header[data-topbar]")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Fondo inicial contado" })
    .fill("500");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abrir caja", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("[data-cash-header]")).toContainText(
    "María Fernández",
  );
  expect(posted).toHaveLength(1);
});

test("header hides financial opening details and opening controls without permission", async ({
  page,
}) => {
  await setupCashHeader(page, { opened: true, canView: false, canOpen: false });
  const status = page.locator("[data-cash-header]");
  await expect(status).toContainText("Caja abierta");
  await expect(status).not.toContainText("María");
  await expect(status).not.toContainText("12.500,50");
  await expect(status.getByRole("link")).toHaveCount(0);
  await expect(status.getByRole("button", { name: "Abrir caja" })).toHaveCount(
    0,
  );
});

for (const width of [390, 768, 1024, 1440]) {
  test(`cash header stays readable without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupCashHeader(page, { opened: true });
    await expect(page.locator("[data-cash-header]")).toContainText(
      "María Fernández",
    );
    await expect(page.locator("[data-cash-header]")).toContainText("12.500,50");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.next-e2e/cash-header-${width}.png`,
      fullPage: true,
    });
  });
}
