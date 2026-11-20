import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCatalogueLoader,
  type CatalogueState,
} from "@/components/sales/catalogue-loader";
import { filterCatalogue } from "@/components/sales/touch-selection";
import type { SaleLookup } from "@/modules/sales/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const row = (id: string, name = id): SaleLookup["rows"][number] => ({
  id,
  name,
  price: "1200.00",
  categoryId: "tea",
});
const page = (rows: SaleLookup["rows"], total: number) =>
  new Response(
    JSON.stringify({ rows, total, categories: [{ id: "tea", name: "Té" }] }),
    { headers: { "Content-Type": "application/json" } },
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the POS catalogue resource", () => {
  it("publishes usable first-page rows while later pages are still pending, then searches the whole catalogue locally", async () => {
    const second = deferred<Response>();
    const nextStarted = deferred<void>();
    const fetch = vi.fn().mockResolvedValueOnce(page([row("first")], 2));
    fetch.mockImplementationOnce(() => {
      nextStarted.resolve();
      return second.promise;
    });
    vi.stubGlobal("fetch", fetch);
    const states: CatalogueState[] = [];
    const complete = vi.fn();
    const loader = createCatalogueLoader({
      channel: "counter",
      onChange: (state) => states.push(state),
      onComplete: complete,
    });
    const loading = loader.load();
    await nextStarted.promise;
    const first = states.at(-1)!;
    expect(first.data.rows.map((product) => product.id)).toEqual(["first"]);
    expect(first.loading).toBe(true);
    expect(first.complete).toBe(false);
    expect(first.data.categories).toEqual([{ id: "tea", name: "Té" }]);
    expect(complete).not.toHaveBeenCalled();
    second.resolve(page([row("second", "Té frío")], 2));
    await loading;
    const loaded = states.at(-1)!;
    expect(loaded.complete).toBe(true);
    expect(loaded.loading).toBe(false);
    expect(filterCatalogue(loaded.data.rows, "te frio", "tea")).toEqual([
      row("second", "Té frío"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledWith(loaded.data.rows);
  });

  it("keeps first-page products on a late-page failure and retries only the failed offset", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row("first")], 2))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Sin conexión" }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(page([row("second")], 2));
    vi.stubGlobal("fetch", fetch);
    const states: CatalogueState[] = [];
    const loader = createCatalogueLoader({
      channel: "pedidosya",
      onChange: (state) => states.push(state),
    });
    await loader.load();
    expect(states.at(-1)).toMatchObject({
      data: { rows: [row("first")], total: 2 },
      loading: false,
      complete: false,
      error: "Sin conexión",
    });
    await loader.load();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/sales/lookup?kind=products&channel=pedidosya&offset=0",
      "/api/sales/lookup?kind=products&channel=pedidosya&offset=1",
      "/api/sales/lookup?kind=products&channel=pedidosya&offset=1",
    ]);
    expect(states.at(-1)?.data.rows).toEqual([row("first"), row("second")]);
    expect(states.at(-1)?.error).toBe("");
    expect(states.at(-1)?.complete).toBe(true);
  });

  it("restarts from zero when a later page reports a lower total and completes only with freshly read products", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row("archived")], 2))
      .mockResolvedValueOnce(page([], 1))
      .mockResolvedValueOnce(page([row("current")], 1));
    vi.stubGlobal("fetch", fetch);
    const states: CatalogueState[] = [];
    const complete = vi.fn();
    const loader = createCatalogueLoader({
      channel: "counter",
      onChange: (state) => states.push(state),
      onComplete: complete,
    });
    await loader.load();
    expect(
      fetch.mock.calls.map(([url]) =>
        new URL(url, "http://local").searchParams.get("offset"),
      ),
    ).toEqual(["0", "1", "0"]);
    expect(states.at(-1)).toMatchObject({
      data: { rows: [row("current")], total: 1 },
      complete: true,
      loading: false,
      error: "",
    });
    expect(complete).toHaveBeenCalledExactlyOnceWith([row("current")]);
    expect(
      states
        .filter((state) => state.complete)
        .every((state) => state.data.rows[0]?.id === "current"),
    ).toBe(true);
  });

  it("bounds restarts when the total keeps changing and allows a fresh retry from zero", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row("old")], 2))
      .mockResolvedValueOnce(page([], 3))
      .mockResolvedValueOnce(page([row("temporary")], 3))
      .mockResolvedValueOnce(page([], 4))
      .mockResolvedValueOnce(page([row("settled")], 1));
    vi.stubGlobal("fetch", fetch);
    const states: CatalogueState[] = [];
    const complete = vi.fn();
    const loader = createCatalogueLoader({
      channel: "counter",
      onChange: (state) => states.push(state),
      onComplete: complete,
    });
    await loader.load();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(states.at(-1)).toMatchObject({
      data: { rows: [] },
      complete: false,
      loading: false,
    });
    expect(states.at(-1)?.error).not.toBe("");
    expect(complete).not.toHaveBeenCalled();
    await loader.load();
    expect(
      fetch.mock.calls.map(([url]) =>
        new URL(url, "http://local").searchParams.get("offset"),
      ),
    ).toEqual(["0", "1", "0", "1", "0"]);
    expect(states.at(-1)).toMatchObject({
      data: { rows: [row("settled")], total: 1 },
      complete: true,
      loading: false,
      error: "",
    });
    expect(complete).toHaveBeenCalledExactlyOnceWith([row("settled")]);
  });

  it("aborts a disposed scope and ignores its late result instead of publishing into a new channel or branch", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetch);
    const states: CatalogueState[] = [];
    const complete = vi.fn();
    const loader = createCatalogueLoader({
      channel: "counter",
      onChange: (state) => states.push(state),
      onComplete: complete,
    });
    const loading = loader.load();
    const signal = fetch.mock.calls[0][1]?.signal as AbortSignal | undefined;
    const changes = states.length;
    loader.dispose();
    expect(signal?.aborted).toBe(true);
    pending.resolve(page([row("stale")], 1));
    await loading;
    expect(states).toHaveLength(changes);
    expect(complete).not.toHaveBeenCalled();
  });

  it("does not report complete local search when a page is empty before the advertised total", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(page([row("first")], 2))
        .mockResolvedValueOnce(page([], 2)),
    );
    const states: CatalogueState[] = [];
    const loader = createCatalogueLoader({
      channel: "counter",
      onChange: (state) => states.push(state),
    });
    await loader.load();
    expect(states.at(-1)?.complete).toBe(false);
    expect(states.at(-1)?.data.rows).toEqual([row("first")]);
    expect(states.at(-1)?.error).not.toBe("");
  });
});
