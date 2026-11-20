import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { existsSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const chrome =
  process.env.E2E_BROWSER_PATH ||
  (existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "");
let browser: Browser | undefined;
let bundle = "";

beforeAll(async () => {
  if (!chrome) return;
  // esbuild already ships with the project's tsx dependency. Bundle the actual
  // client components for an isolated local page, without starting Next or a DB.
  const localRequire = createRequire(import.meta.url);
  const tsxRequire = createRequire(localRequire.resolve("tsx"));
  const esbuild = (await import(
    pathToFileURL(tsxRequire.resolve("esbuild")).href
  )) as {
    build(
      options: Record<string, unknown>,
    ): Promise<{ outputFiles: { text: string }[] }>;
  };
  const built = await esbuild.build({
    stdin: {
      contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { useLocators } from "./src/components/pickup/use-locators";
        import { LocatorFleetProvider } from "./src/components/pickup/locator-fleet-context";
        import { PickupActions, LocatorManager } from "./src/components/pickup/locator-manager";
        import { ProductPicker } from "./src/components/sales/cart";
        function PickupOwner() {
          const [version, setVersion] = useState(0);
          const state = useLocators(version);
          return <LocatorFleetProvider value={state}>
            <PickupActions actorId="test" onChanged={() => setVersion(v => v + 1)} />
          </LocatorFleetProvider>;
        }
        function Catalogue() {
          const [added, setAdded] = useState("");
          return <><ProductPicker channel="counter" refresh={0} locked={false}
            onAdd={row => setAdded(row.name)} /><output>{added}</output></>;
        }
        const root = createRoot(document.getElementById("root"));
        window.show = (mode, branch = "one") => {
          document.cookie = "kybo-branch=" + branch + "; path=/";
          root.render(mode === "catalogue" ? <Catalogue key={branch} /> :
            mode === "standalone" ? <LocatorManager key={branch} actorId="test" /> :
            <PickupOwner key={branch} />);
        };
        window.show(new URLSearchParams(location.search).get("mode") || "pickup");
      `,
      resolveDir: process.cwd(),
      sourcefile: "pos-browser-fixture.tsx",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env": JSON.stringify({ NODE_ENV: "test" }) },
    logLevel: "silent",
  });
  bundle = built.outputFiles[0].text;
  browser = await chromium.launch({ executablePath: chrome, headless: true });
}, 60000);

afterAll(async () => browser?.close());

function json(response: ServerResponse, data: unknown, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

async function harness(
  mode: string,
  api: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/")) return api(request, response);
    if (request.url === "/app.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(bundle);
    } else {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        '<!doctype html><html><body><main id="root"></main><script src="/app.js"></script></body></html>',
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const context = await browser!.newContext();
  // Every browser request stays on this disposable local HTTP server.
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1")
      return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${(server.address() as { port: number }).port}/?mode=${mode}`,
  );
  return {
    page,
    errors,
    async close() {
      await context.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it.skipIf(!chrome)(
  "shares one real pickup request across the POS actions and dialog, with standalone fallback and branch isolation",
  async () => {
    const branches: string[] = [];
    const app = await harness("pickup", (request, response) => {
      const branch = String(request.headers["x-kybo-branch-id"]);
      branches.push(branch);
      json(response, {
        count: 16,
        occupied: [],
        publicPath: `/pickup/${branch}`,
      });
    });
    try {
      await app.page
        .getByRole("link", { name: /Pantalla de clientes/ })
        .waitFor();
      expect(branches).toEqual(["one"]);
      await app.page
        .getByRole("button", { name: "Localizadores", exact: true })
        .click();
      await app.page
        .getByText("No hay equipos pendientes de devolución.")
        .waitFor();
      expect(branches).toEqual(["one"]);
      await app.page.evaluate(() =>
        (
          window as unknown as { show: (mode: string, branch: string) => void }
        ).show("standalone", "two"),
      );
      await app.page
        .getByRole("button", { name: "Localizadores", exact: true })
        .click();
      await app.page
        .getByRole("link", { name: /Abrir pantalla de clientes/ })
        .waitFor();
      expect(branches).toEqual(["one", "two"]);
      expect(
        await app.page
          .getByRole("link", { name: /Abrir pantalla de clientes/ })
          .getAttribute("href"),
      ).toBe("/pickup/two");
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);

it.skipIf(!chrome)(
  "lets a cashier use the first catalogue page and retains it through a late-page error and retry",
  async () => {
    const offsets: string[] = [];
    let pending: ServerResponse | undefined;
    const app = await harness("catalogue", (request, response) => {
      const offset = new URL(request.url!, "http://local").searchParams.get(
        "offset",
      )!;
      offsets.push(offset);
      if (offset === "0")
        json(response, {
          rows: [{ id: "first", name: "Té temprano", price: "1200.00" }],
          total: 2,
        });
      else if (offsets.length === 2) pending = response;
      else
        json(response, {
          rows: [{ id: "second", name: "Té tardío", price: "1500.00" }],
          total: 2,
        });
    });
    try {
      await app.page
        .getByRole("button", { name: "Agregar Té temprano" })
        .waitFor({ timeout: 3000 });
      await app.page
        .getByRole("button", { name: "Agregar Té temprano" })
        .click();
      expect(await app.page.locator("output").textContent()).toBe(
        "Té temprano",
      );
      expect(
        await app.page
          .getByRole("status")
          .filter({ hasText: "Completando" })
          .textContent(),
      ).toContain("Completando");
      json(pending!, { error: "Conexión interrumpida" }, 503);
      await app.page
        .getByRole("button", { name: "Reintentar carta" })
        .waitFor();
      expect(
        await app.page
          .getByRole("button", { name: "Agregar Té temprano" })
          .isEnabled(),
      ).toBe(true);
      await app.page.getByRole("button", { name: "Reintentar carta" }).click();
      await app.page
        .getByRole("button", { name: "Agregar Té tardío" })
        .waitFor();
      await app.page
        .getByRole("textbox", { name: "Buscar productos" })
        .fill("te tardio");
      expect(
        await app.page
          .getByRole("button", { name: "Agregar Té tardío" })
          .isVisible(),
      ).toBe(true);
      expect(
        await app.page
          .getByRole("button", { name: "Agregar Té temprano" })
          .count(),
      ).toBe(0);
      expect(offsets).toEqual(["0", "1", "1"]);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);
