import { describe, expect, it, vi } from "vitest";
import { ReadyTracker } from "../src/components/notifications/ready-tracker";
import {
  ReadySoundPlayer,
  type ReadySoundState,
} from "../src/components/notifications/ready-sound";

describe("ready notifications", () => {
  it("silently learns historical ready orders throughout initial pagination", () => {
    const tracker = new ReadyTracker();
    expect(tracker.observe("queue", [{ id: "old", ready: true }])).toBe(false);
    expect(
      tracker.observe("queue", [{ id: "other-page", ready: true }], {
        baseline: true,
      }),
    ).toBe(false);
    expect(tracker.observe("queue", [{ id: "pending", ready: false }])).toBe(
      false,
    );
    expect(tracker.observe("queue", [{ id: "pending", ready: true }])).toBe(
      true,
    );
  });

  it("announces an order first seen ready after the initial traversal, then deduplicates it", () => {
    const tracker = new ReadyTracker();
    tracker.observe("queue", [{ id: "old", ready: true }]);
    expect(tracker.observe("queue", [{ id: "new", ready: true }])).toBe(true);
    expect(tracker.observe("queue", [{ id: "new", ready: true }])).toBe(false);
  });

  it("announces a batch once and remembers it through missing pages, reconnections and stale data", () => {
    const tracker = new ReadyTracker();
    tracker.observe("queue", [
      { id: "a", ready: false },
      { id: "b", ready: false },
    ]);
    expect(
      tracker.observe("queue", [
        { id: "a", ready: true },
        { id: "b", ready: true },
      ]),
    ).toBe(true);
    expect(tracker.observe("queue", [])).toBe(false);
    expect(tracker.observe("queue", [{ id: "a", ready: false }])).toBe(false);
    expect(
      tracker.observe("queue", [
        { id: "a", ready: true },
        { id: "b", ready: true },
      ]),
    ).toBe(false);
  });

  it("deduplicates a confirmed action and its subsequent poll or retry", () => {
    const tracker = new ReadyTracker();
    tracker.observe("active", [{ id: "a", ready: false }]);
    expect(tracker.confirm("a")).toBe(true);
    expect(tracker.confirm("a")).toBe(false);
    expect(tracker.observe("active", [{ id: "a", ready: true }])).toBe(false);
    tracker.observe("filtered", [{ id: "a", ready: false }]);
    expect(tracker.confirm("a")).toBe(false);
  });

  it("does not announce a ready task discovered after changing filters or returning from history", () => {
    const tracker = new ReadyTracker();
    tracker.observe("active", [{ id: "a", ready: false }]);
    expect(tracker.observe("history", [])).toBe(false);
    expect(tracker.observe("active", [{ id: "a", ready: true }])).toBe(false);
  });

  it("deduplicates a poll that reaches ready before the POST response", () => {
    const tracker = new ReadyTracker();
    tracker.observe("active", [{ id: "a", ready: false }]);
    expect(tracker.observe("active", [{ id: "a", ready: true }])).toBe(true);
    expect(tracker.confirm("a")).toBe(false);
  });
});

function audioFixture(options: { blocked?: boolean; rejected?: boolean } = {}) {
  const tones: { frequency?: number; start?: number; stop?: number }[] = [];
  const gainValues: number[] = [];
  const context = {
    state: "suspended",
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      if (options.rejected) throw new Error("NotAllowedError");
      if (!options.blocked) context.state = "running";
    }),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
    suspend: vi.fn(async () => {
      context.state = "suspended";
    }),
    createOscillator: () => {
      const tone: (typeof tones)[number] = {};
      tones.push(tone);
      return {
        frequency: {
          setValueAtTime: (value: number) => {
            tone.frequency = value;
          },
        },
        connect: () => {},
        disconnect: () => {},
        start: (at: number) => {
          tone.start = at;
        },
        stop: (at: number) => {
          tone.stop = at;
        },
        onended: null,
      };
    },
    createGain: () => ({
      gain: {
        setValueAtTime: (value: number) => {
          gainValues.push(value);
        },
        linearRampToValueAtTime: (value: number) => {
          gainValues.push(value);
        },
      },
      connect: () => {},
      disconnect: () => {},
    }),
  };
  const states: ReadySoundState[] = [];
  const factory = vi.fn(() => context as unknown as AudioContext);
  const player = new ReadySoundPlayer(factory, (state) => states.push(state));
  return { player, context, states, tones, gainValues, factory };
}

describe("ready sound", () => {
  it("stays silent until explicitly enabled, plays one short gentle tone, and mutes immediately", async () => {
    const { player, tones, factory, gainValues, states } = audioFixture();
    player.play();
    expect(factory).not.toHaveBeenCalled();
    await player.enable();
    expect(states.at(-1)).toBe("on");
    expect(tones).toHaveLength(0);
    player.play();
    expect(tones).toHaveLength(1);
    expect(tones[0].frequency).toBeGreaterThan(400);
    expect(tones[0].stop! - tones[0].start!).toBeLessThanOrEqual(0.25);
    expect(Math.max(...gainValues)).toBeLessThanOrEqual(0.1);
    player.mute();
    player.play();
    expect(tones).toHaveLength(1);
    expect(states.at(-1)).toBe("off");
  });

  it.each([{ blocked: true }, { rejected: true }])(
    "never claims sound is enabled when the browser blocks it: %j",
    async (options) => {
      const { player, states, tones } = audioFixture(options);
      await player.enable();
      expect(states.at(-1)).toBe("blocked");
      player.play();
      expect(tones).toHaveLength(0);
    },
  );

  it("reports unsupported audio and lets the display continue", async () => {
    const states: ReadySoundState[] = [];
    const player = new ReadySoundPlayer(
      () => undefined,
      (state) => states.push(state),
    );
    await player.enable();
    player.play();
    expect(states.at(-1)).toBe("unsupported");
  });

  it("allows another activation attempt if the browser never resolves resume", async () => {
    vi.useFakeTimers();
    try {
      const states: ReadySoundState[] = [];
      const context = {
        state: "suspended",
        resume: () => new Promise<void>(() => {}),
        close: vi.fn(async () => {}),
      };
      const player = new ReadySoundPlayer(
        () => context as unknown as AudioContext,
        (state) => states.push(state),
      );
      void player.enable();
      await vi.advanceTimersByTimeAsync(3100);
      expect(states.at(-1)).toBe("blocked");
      player.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a new gesture if an enabled audio context is suspended", async () => {
    const { player, context, states, tones } = audioFixture();
    await player.enable();
    context.state = "suspended";
    player.play();
    expect(states.at(-1)).toBe("blocked");
    expect(tones).toHaveLength(0);
    await player.enable();
    player.play();
    expect(tones).toHaveLength(1);
  });

  it("closes its audio context and cannot play after unmount", async () => {
    const { player, context, tones } = audioFixture();
    await player.enable();
    player.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    player.play();
    expect(tones).toHaveLength(0);
  });
});
