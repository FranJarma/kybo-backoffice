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
        body: `<html lang="es" data-sidebar-initial="${collapsed}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/__sidebar-fixture.js"></script></body></html>`,
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
