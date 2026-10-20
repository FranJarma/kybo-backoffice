import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { chromium, type Browser } from "@playwright/test";
import { expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/modules/media/service", () => ({ readPhoto: mocks.read }));
vi.mock("@/modules/media/storage", () => ({ photoStorage: () => ({}) }));
import { GET } from "@/app/api/media/[id]/route";
import { ProductPhoto } from "@/components/products/photo";

it.skipIf(!process.env.E2E_BROWSER_PATH)(
  "reuses native browser cache after remount/navigation, loads replacements and rejects fresh anonymous reads",
  async () => {
    vi.stubGlobal("React", React);
    const photo = await sharp({
      create: { width: 128, height: 128, channels: 3, background: "#ffaa22" },
    })
      .webp()
      .toBuffer();
    let cookie = "";
    mocks.actor.mockImplementation(async () => {
      if (!cookie.includes("session=owner"))
        throw new AppError("UNAUTHORIZED", "Ingresá", 401);
      return { id: "owner", role: "admin" };
    });
    mocks.read.mockImplementation(
      async () => new Response(new Uint8Array(photo)).body,
    );
    const firstId = randomUUID(),
      replacementId = randomUUID();
    const imageRequests: number[] = [];
    const server = createServer(async (req, res) => {
      try {
        const requestURL = new URL(req.url!, `http://${req.headers.host}`);
        if (requestURL.pathname.startsWith("/api/media/")) {
          cookie = req.headers.cookie ?? "";
          const response = await GET(
            new Request(requestURL, { headers: { Cookie: cookie } }),
            {
              params: Promise.resolve({
                id: requestURL.pathname.split("/").at(-1)!,
              }),
            },
          );
          imageRequests.push(response.status);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } else {
          const id = requestURL.searchParams.has("replacement")
            ? replacementId
            : firstId;
          const markup = renderToStaticMarkup(
            React.createElement(ProductPhoto, { id, name: "Foto de prueba" }),
          );
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
          });
          res.end(
            `<html><head><style>main>span{display:block;position:relative;width:64px;height:64px}</style></head><body><main>${markup}</main></body></html>`,
          );
        }
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseURL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({
        executablePath: process.env.E2E_BROWSER_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      const context = await browser.newContext();
      await context.addCookies([
        { name: "session", value: "owner", url: baseURL },
      ]);
      const page = await context.newPage();
      const loaded = () =>
        page.waitForFunction(() => {
          const img = document.querySelector("img");
          return img?.complete && img.naturalWidth === 128;
        });
      await page.goto(baseURL);
      await loaded();
      expect(await page.locator("img").getAttribute("src")).toBe(
        `/api/media/${firstId}?size=thumbnail`,
      );
      expect(imageRequests).toEqual([200]);
      await page.evaluate(() => {
        const parent = document.querySelector("main")!;
        const markup = parent.innerHTML;
        parent.replaceChildren();
        parent.innerHTML = markup;
      });
      await loaded();
      expect(imageRequests).toEqual([200]);
      await page.goto(`${baseURL}/another-page`);
      await loaded();
      expect(imageRequests).toEqual([200]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseURL}/?replacement=1`);
      await loaded();
      expect(imageRequests).toEqual([200, 200]);
      expect(await page.locator("img").getAttribute("src")).toContain(
        replacementId,
      );
      await context.clearCookies();
      // A new HTTP read checks Vary; already decoded pixels are local browser data.
      const status = await page.evaluate(
        async (url) => (await fetch(url)).status,
        `/api/media/${firstId}?size=thumbnail`,
      );
      expect(status).toBe(401);
      const anonymous = await browser.newContext();
      const anonymousPage = await anonymous.newPage();
      const denied = anonymousPage.waitForResponse((response) =>
        response.url().includes(`/api/media/${firstId}`),
      );
      await anonymousPage.goto(baseURL);
      expect((await denied).status()).toBe(401);
      expect(imageRequests).toEqual([200, 200, 401, 401]);
    } finally {
      await browser?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      vi.unstubAllGlobals();
    }
  },
  60000,
);
