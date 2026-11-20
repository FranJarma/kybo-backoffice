import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { PrepList } from "@/modules/preparation/types";

const chrome =
  process.env.E2E_BROWSER_PATH ||
  (existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "");
let browser: Browser | undefined;
let bundle = "";

beforeAll(async () => {
  if (!chrome) return;
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
        import { usePreparationFeed } from "./src/components/preparation/use-feed";
        const nativeFetch = window.fetch.bind(window);
        window.reads = [];
        window.fetch = (url, options) => {
          const read = { url: String(url), aborted: false };
          window.reads.push(read);
          options?.signal?.addEventListener("abort", () => read.aborted = true);
          return nativeFetch(url, options);
        };
        function Probe() {
          const [scope, setScope] = useState({ url: "/api/preparation?station=one", revision: 0 });
          window.setPreparation = (url, revision) => setScope({ url, revision });
          const feed = usePreparationFeed(scope.url, scope.revision);
          return <output id="state" data-fresh={String(feed.fresh)} data-error={feed.error}>
            {feed.data?.serverNow ?? "pending"}
          </output>;
        }
        createRoot(document.getElementById("root")).render(<Probe />);
      `,
      resolveDir: process.cwd(),
      sourcefile: "preparation-browser-fixture.tsx",
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

function reply(response: ServerResponse, serverNow: string) {
  const data: PrepList = {
    rows: [],
    total: 0,
    offset: 0,
    stations: [],
    serverNow,
    counts: { pending: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0 },
  };
  if (response.destroyed) return;
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

async function harness() {
  const pending: { url: string; response: ServerResponse }[] = [];
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/")) {
      pending.push({ url: request.url, response });
    } else if (request.url === "/app.js") {
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
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  );
  return {
    page,
    pending,
    errors,
    async close() {
      await context.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

type FixtureWindow = {
  reads: { url: string; aborted: boolean }[];
  setPreparation: (url: string, revision: number) => void;
};
const reads = (page: Page) =>
  page.evaluate(() => (window as unknown as FixtureWindow).reads);
const wake = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });

it.skipIf(!chrome)(
  "coalesces wake events into one active preparation HTTP read",
  async () => {
    const app = await harness();
    try {
      await vi.waitFor(() => expect(app.pending).toHaveLength(1));
      await wake(app.page);
      expect(await reads(app.page)).toEqual([
        { url: "/api/preparation?station=one", aborted: false },
      ]);
      expect(app.pending).toHaveLength(1);
      reply(app.pending[0].response, "2026-11-20T12:00:00.000Z");
      await app.page.waitForFunction(
        () =>
          document.querySelector("#state")?.getAttribute("data-fresh") ===
          "true",
      );
      await wake(app.page);
      await app.page.waitForFunction(
        () => (window as unknown as FixtureWindow).reads.length === 2,
      );
      expect((await reads(app.page)).every((read) => !read.aborted)).toBe(true);
      await vi.waitFor(() => expect(app.pending).toHaveLength(2));
      reply(app.pending[1].response, "2026-11-20T12:01:00.000Z");
      await app.page.waitForFunction(
        () =>
          document.querySelector("#state")?.textContent?.trim() ===
          "2026-11-20T12:01:00.000Z",
      );
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);

it.skipIf(!chrome)(
  "replaces pending reads on revision and URL changes without accepting old responses",
  async () => {
    const app = await harness();
    try {
      await vi.waitFor(() => expect(app.pending).toHaveLength(1));
      await app.page.evaluate(() =>
        (window as unknown as FixtureWindow).setPreparation(
          "/api/preparation?station=one",
          1,
        ),
      );
      await app.page.waitForFunction(
        () => (window as unknown as FixtureWindow).reads.length === 2,
      );
      expect(await reads(app.page)).toEqual([
        { url: "/api/preparation?station=one", aborted: true },
        { url: "/api/preparation?station=one", aborted: false },
      ]);
      expect(await app.page.locator("#state").getAttribute("data-fresh")).toBe(
        "false",
      );
      await vi.waitFor(() => expect(app.pending).toHaveLength(2));
      reply(app.pending[1].response, "2026-11-20T12:02:00.000Z");
      await app.page.waitForFunction(
        () =>
          document.querySelector("#state")?.getAttribute("data-fresh") ===
          "true",
      );
      await app.page.evaluate(() =>
        (window as unknown as FixtureWindow).setPreparation(
          "/api/preparation?station=two",
          0,
        ),
      );
      await app.page.waitForFunction(
        () => (window as unknown as FixtureWindow).reads.length === 3,
      );
      expect((await reads(app.page))[2]).toEqual({
        url: "/api/preparation?station=two",
        aborted: false,
      });
      await vi.waitFor(() => expect(app.pending).toHaveLength(3));
      reply(app.pending[2].response, "2026-11-20T12:03:00.000Z");
      reply(app.pending[0].response, "2026-11-20T11:59:00.000Z");
      await app.page.waitForFunction(
        () =>
          document.querySelector("#state")?.textContent?.trim() ===
          "2026-11-20T12:03:00.000Z",
      );
      expect(await app.page.locator("#state").getAttribute("data-fresh")).toBe(
        "true",
      );
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);
