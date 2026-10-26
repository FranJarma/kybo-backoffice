import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { PrepTask, PrepList } from "../../src/modules/preparation/types";
import type { PublicQueue } from "../../src/modules/pickup/types";

const require = createRequire(import.meta.url),
  bundle = ".next-e2e/ready-sound-fixture.js",
  taskId = "11111111-1111-4111-8111-111111111111";

test.beforeAll(async () => {
  const { build } = createRequire(require.resolve("tsx"))("esbuild");
  await build({
    entryPoints: ["tests/helpers/ready-sound-ui.tsx"],
    outfile: bundle,
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    alias: { "next/image": resolve("tests/helpers/ready-sound-image.ts") },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{"NODE_ENV":"production"}',
    },
  });
});

type AudioStats = {
  created: number;
  played: number;
  closed: number;
  durations: number[];
};
async function audioStats(page: Page) {
  return page.evaluate(
    () => (window as unknown as { readyAudio: AudioStats }).readyAudio,
  );
}
async function mount(
  page: Page,
  view: "public" | "board" = "public",
  mode: "normal" | "blocked" | "unsupported" | "gesture" = "normal",
) {
  page.on("pageerror", (error) =>
    console.error("Ready sound fixture:", error.stack),
  );
  await page.clock.install();
  await page.addInitScript((mode) => {
    // Script injection can set Chromium's userActivation flag; require a real UI event in this fixture.
    let interacted = false;
    const interaction = (event: Event) => {
      if (event.isTrusted) interacted = true;
    };
    document.addEventListener("click", interaction, true);
    document.addEventListener("keydown", interaction, true);
    const stats = {
      created: 0,
      played: 0,
      closed: 0,
      durations: [] as number[],
    };
    (window as unknown as { readyAudio: AudioStats }).readyAudio = stats;
    class TestAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      constructor() {
        stats.created++;
      }
      async resume() {
        if (mode === "gesture" && !interacted)
          return new Promise<void>(() => {});
        if (mode !== "blocked") this.state = "running";
      }
      async close() {
        this.state = "closed";
        stats.closed++;
      }
      createOscillator() {
        let start = 0;
        return {
          type: "sine",
          frequency: { setValueAtTime() {} },
          connect() {},
          disconnect() {},
          onended: null,
          start(at: number) {
            start = at;
            stats.played++;
          },
          stop(at: number) {
            stats.durations.push(at - start);
          },
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {},
          disconnect() {},
        };
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: mode === "unsupported" ? undefined : TestAudioContext,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      value: undefined,
    });
  }, mode);
  await page.route("**/__ready-sound-fixture*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
    }),
  );
  await page.goto(`/__ready-sound-fixture#${view}`);
  await page.addScriptTag({ path: bundle });
  await page.clock.runFor(20);
}

const preparing = (label: string): PublicQueue["rows"][number] => ({
  label,
  locatorNumber: null,
  customerName: null,
  state: "preparing",
});
const ready = (label: string): PublicQueue["rows"][number] => ({
  ...preparing(label),
  state: "ready",
});

test("public display chimes once for a newly ready order, with no initial, page, poll or reconnect repeats", async ({
  page,
}) => {
  let rows = [ready("1.1"), preparing("2.1")],
    offline = false,
    polls = 0;
  await page.route("**/api/public/pickup/**", async (route) => {
    polls++;
    if (offline) return route.abort();
    await route.fulfill({
      json: { branchName: "Kybo prueba", nextOffset: polls % 2 ? 30 : 0, rows },
    });
  });
  await mount(page);
  await expect(page.getByText("2.1", { exact: true })).toBeVisible();
  expect((await audioStats(page)).created).toBe(1);
  await expect(
    page.getByRole("button", { name: "Silenciar sonido", exact: true }),
  ).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
  rows = [ready("3.1")];
  await page.clock.fastForward(5001);
  await expect(page.getByText("3.1", { exact: true })).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
  rows = [ready("2.1")];
  await page.clock.fastForward(5001);
  await expect(
    page
      .getByRole("region", { name: "Listos para retirar" })
      .getByText("2.1", { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await audioStats(page)).played).toBe(1);
  await page.clock.fastForward(5001);
  await expect.poll(() => polls).toBe(4);
  expect((await audioStats(page)).played).toBe(1);
  offline = true;
  await page.clock.fastForward(5001);
  await expect(page.getByText("Estamos reconectando")).toBeVisible();
  offline = false;
  await page.clock.fastForward(5001);
  await expect(page.getByText("2.1", { exact: true })).toBeVisible();
  expect((await audioStats(page)).played).toBe(1);
  expect((await audioStats(page)).durations[0]).toBeLessThanOrEqual(0.25);
  // This order was created and completed between polls.
  rows = [ready("4.1")];
  await page.clock.fastForward(5001);
  await expect(page.getByText("4.1", { exact: true })).toBeVisible();
  await expect.poll(async () => (await audioStats(page)).played).toBe(2);
  await page.getByRole("button", { name: "Cerrar vista de prueba" }).click();
  await expect.poll(async () => (await audioStats(page)).closed).toBe(1);
});

test("muted transitions stay silent, re-enabling has no backlog, and a new queue starts quietly", async ({
  page,
}) => {
  let rows = [preparing("1.1")];
  await page.route("**/api/public/pickup/**", (route) =>
    route.fulfill({ json: { branchName: "Kybo prueba", nextOffset: 0, rows } }),
  );
  await mount(page);
  await expect(page.getByText("1.1", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Silenciar sonido", exact: true })
    .click();
  await page.getByText("Tu pedido, recién hecho.", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Activar sonido", exact: true }),
  ).toBeVisible();
  expect((await audioStats(page)).created).toBe(1);
  rows = [ready("1.1")];
  await page.clock.fastForward(5001);
  await expect(
    page
      .getByRole("region", { name: "Listos para retirar" })
      .getByText("1.1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Activar sonido", exact: true })
    .click();
  await page.clock.fastForward(5001);
  expect((await audioStats(page)).played).toBe(0);
  await page
    .getByRole("button", { name: "Cambiar pantalla de prueba" })
    .click();
  await expect(page.getByText("1.1", { exact: true })).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
});

for (const mode of ["blocked", "unsupported"] as const) {
  test(`public display reports ${mode} audio without hiding the queue`, async ({
    page,
  }) => {
    await page.route("**/api/public/pickup/**", (route) =>
      route.fulfill({
        json: {
          branchName: "Kybo prueba",
          nextOffset: 0,
          rows: [ready("1.1")],
        },
      }),
    );
    await mount(page, "public", mode);
    await expect(
      page.getByText(
        mode === "blocked"
          ? "Para habilitar el sonido, tocá la pantalla."
          : "Este navegador no permite avisos de sonido.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Silenciar sonido", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("1.1", { exact: true })).toBeVisible();
    expect((await audioStats(page)).played).toBe(0);
  });
}

function task(status: PrepTask["status"] = "preparing"): PrepTask {
  return {
    id: taskId,
    revision: status === "preparing" ? 1 : 2,
    orderId: "22222222-2222-4222-8222-222222222222",
    saleId: "33333333-3333-4333-8333-333333333333",
    saleNumber: 42,
    sequence: 1,
    origin: "counter",
    channel: "counter",
    tableName: null,
    externalId: null,
    fulfillment: "takeaway",
    customerName: "Prueba",
    notes: null,
    saleCancelled: false,
    stationId: null,
    stationName: "General",
    status,
    assigneeId: "fixture",
    assigneeName: "Operador",
    enqueuedAt: "2026-10-26T12:00:00Z",
    startedAt: "2026-10-26T12:01:00Z",
    readyAt: status === "ready" ? "2026-10-26T12:02:00Z" : null,
    deliveredAt: null,
    cancelledAt: null,
    lines: [
      {
        id: "line",
        name: "Café de prueba",
        quantity: 1,
        modifiers: [],
        notes: null,
      },
    ],
    siblings: [{ id: taskId, stationName: "General", status }],
    timing: {
      waitSeconds: 60,
      prepSeconds: status === "ready" ? 60 : null,
      handoffSeconds: null,
      totalSeconds: null,
    },
    orderTiming: {
      waitSeconds: 60,
      prepSeconds: status === "ready" ? 60 : null,
      handoffSeconds: null,
      totalSeconds: null,
    },
  };
}
function feed(row: PrepTask): PrepList {
  return {
    rows: [row],
    total: 1,
    offset: 0,
    counts: {
      pending: 0,
      preparing: row.status === "preparing" ? 1 : 0,
      ready: row.status === "ready" ? 1 : 0,
      delivered: 0,
      cancelled: 0,
    },
    serverNow: "2026-10-26T12:02:00Z",
    stations: [],
  };
}

for (const view of ["public", "board"] as const) {
  test(`${view} unlocks default sound with the first ordinary interaction when autoplay needs a gesture`, async ({
    page,
  }) => {
    let rows = [preparing("1.1")],
      row = task();
    await page.route("**/api/public/pickup/**", (route) =>
      route.fulfill({
        json: { branchName: "Kybo prueba", nextOffset: 0, rows },
      }),
    );
    await page.route("**/api/preparation**", (route) => {
      if (route.request().method() === "POST") {
        row = task("ready");
        return route.fulfill({ json: { task: row, events: [] } });
      }
      return route.fulfill({ json: feed(row) });
    });
    await mount(page, view, "gesture");
    expect((await audioStats(page)).created).toBe(1);
    expect((await audioStats(page)).played).toBe(0);
    await page.clock.fastForward(3100);
    await expect(
      page.getByRole("button", { name: "Activar sonido", exact: true }),
    ).toBeVisible();
    if (view === "public") {
      await page.getByText("Tu pedido, recién hecho.", { exact: true }).click();
      rows = [ready("1.1")];
      await page.clock.fastForward(5001);
    } else {
      await page
        .getByRole("button", { name: "Marcar listo", exact: true })
        .click();
    }
    await expect(
      page.getByRole("button", { name: "Silenciar sonido", exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await audioStats(page)).played).toBe(1);
  });
}

test("the explicit sound control unlocks blocked autoplay without muting itself", async ({
  page,
}) => {
  await page.route("**/api/public/pickup/**", (route) =>
    route.fulfill({
      json: { branchName: "Kybo prueba", nextOffset: 0, rows: [] },
    }),
  );
  await mount(page, "public", "gesture");
  await page.clock.fastForward(3100);
  await page
    .getByRole("button", { name: "Activar sonido", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Silenciar sonido", exact: true }),
  ).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
  await page
    .getByRole("button", { name: "Silenciar sonido", exact: true })
    .click();
  await page.getByText("Tu pedido, recién hecho.", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Activar sonido", exact: true }),
  ).toBeVisible();
});

test("Comandas chimes only after confirmed success and does not repeat on refresh or filters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let row = task(),
    confirm!: () => void,
    refresh!: () => void,
    holdRefresh = false;
  const release = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  const releaseRefresh = new Promise<void>((resolve) => {
    refresh = resolve;
  });
  await page.route("**/api/preparation**", async (route) => {
    if (route.request().method() === "POST") {
      await release;
      row = task("ready");
      holdRefresh = true;
      return route.fulfill({ json: { task: row, events: [] } });
    }
    if (holdRefresh) await releaseRefresh;
    return route.fulfill({ json: feed(row) });
  });
  await mount(page, "board");
  const markReady = page.getByRole("button", {
    name: "Marcar listo",
    exact: true,
  });
  await expect(markReady).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Silenciar sonido", exact: true }),
  ).toBeVisible();
  await markReady.click();
  expect((await audioStats(page)).played).toBe(0);
  confirm();
  await expect(
    page.getByText("Tarea lista para entregar.", { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await audioStats(page)).played).toBe(1);
  await expect(
    page.getByRole("button", { name: "Entregar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entregar", exact: true }),
  ).toBeDisabled();
  await expect(markReady).toHaveCount(0);
  holdRefresh = false;
  refresh();
  await expect(
    page.getByRole("button", { name: "Entregar", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entregar", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Estación", exact: true })
    .selectOption("general");
  await expect(
    page.getByRole("button", { name: "Entregar", exact: true }),
  ).toBeEnabled();
  expect((await audioStats(page)).played).toBe(1);
});

test("Comandas confirms the same uncertain request on retry and chimes only once", async ({
  page,
}) => {
  let row = task();
  const requests: { requestId: string }[] = [];
  await page.route("**/api/preparation**", (route) => {
    if (route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) return route.abort();
      row = task("ready");
      return route.fulfill({ json: { task: row, events: [] } });
    }
    return route.fulfill({ json: feed(row) });
  });
  await mount(page, "board");
  await expect(
    page.getByRole("button", { name: "Marcar listo", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Silenciar sonido", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Marcar listo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reintentar mismo envío", exact: true }),
  ).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
  await page
    .getByRole("button", { name: "Reintentar mismo envío", exact: true })
    .click();
  await expect(
    page.getByText("Tarea lista para entregar.", { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await audioStats(page)).played).toBe(1);
  expect(requests).toHaveLength(2);
  expect(requests[0].requestId).toBe(requests[1].requestId);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.clock.fastForward(5001);
  expect((await audioStats(page)).played).toBe(1);
});

test("Comandas never chimes for a rejected action", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/preparation**", (route) =>
    route.fulfill(
      route.request().method() === "POST"
        ? { status: 409, json: { error: "La tarea cambió. Actualizá." } }
        : { json: feed(task()) },
    ),
  );
  await mount(page, "board");
  await expect(
    page.getByRole("button", { name: "Marcar listo", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Silenciar sonido", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Marcar listo", exact: true }).click();
  await expect(
    page.getByText("La tarea cambió. Actualizá.", { exact: true }).first(),
  ).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
});

test("Comandas suppresses existing ready tasks and announces a later observed transition once", async ({
  page,
}) => {
  let row = task("ready");
  await page.route("**/api/preparation**", (route) =>
    route.fulfill({ json: feed(row) }),
  );
  await mount(page, "board");
  await expect(
    page.getByRole("button", { name: "Silenciar sonido", exact: true }),
  ).toBeVisible();
  expect((await audioStats(page)).played).toBe(0);
  row = { ...task(), id: "44444444-4444-4444-8444-444444444444" };
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Marcar listo", exact: true }),
  ).toBeEnabled();
  row = { ...row, status: "ready", revision: 2 };
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect.poll(async () => (await audioStats(page)).played).toBe(1);
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  expect((await audioStats(page)).played).toBe(1);
});
