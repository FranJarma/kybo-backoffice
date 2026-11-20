import { afterEach, describe, expect, it, vi } from "vitest";
import { startLocatorPolling } from "@/components/pickup/locator-polling";

const fleet = { count: 16, publicPath: "/pickup/test", occupied: [] };
const reply = () => new Response(JSON.stringify(fleet));
function visibility() {
  let available = true;
  let changed: (() => void) | undefined;
  const unsubscribe = vi.fn();
  return {
    environment: {
      available: () => available,
      subscribe: (callback: () => void) => {
        changed = callback;
        return unsubscribe;
      },
    },
    set(value: boolean) {
      available = value;
      changed?.();
    },
    unsubscribe,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the locator polling resource", () => {
  it("cancels an outstanding HTTP request and unsubscribes when its owning scope unmounts", async () => {
    const fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const state = visibility();
    const stop = startLocatorPolling({
      onFleet: vi.fn(),
      onError: vi.fn(),
      environment: state.environment,
    });
    const signal = fetch.mock.calls[0][1]?.signal as AbortSignal | undefined;
    stop();
    expect(signal?.aborted).toBe(true);
    expect(state.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does no work while hidden/offline and refreshes once immediately on return", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => reply());
    vi.stubGlobal("fetch", fetch);
    const state = visibility();
    state.set(false);
    const onFleet = vi.fn();
    const stop = startLocatorPolling({
      onFleet,
      onError: vi.fn(),
      environment: state.environment,
    });
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).not.toHaveBeenCalled();
    state.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect(onFleet).toHaveBeenCalledWith(fleet);
    state.set(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetch).toHaveBeenCalledOnce();
    state.set(true);
    state.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it("times out a hung HTTP request, backs off failures and restores the 5-second cadence after recovery", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, options?: RequestInit) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(options.signal!.reason),
              { once: true },
            );
          }),
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async () => reply());
    vi.stubGlobal("fetch", fetch);
    const onFleet = vi.fn(),
      onError = vi.fn();
    const state = visibility();
    const stop = startLocatorPolling({
      onFleet,
      onError,
      environment: state.environment,
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect(onError).toHaveBeenCalledWith(
      "No se pudo actualizar la disponibilidad de localizadores.",
    );
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onFleet).toHaveBeenCalledWith(fleet);
    expect(onError).toHaveBeenLastCalledWith("");
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(4);
    stop();
  });
});
