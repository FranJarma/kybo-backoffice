export type ReadySoundState =
  "off" | "enabling" | "on" | "blocked" | "unsupported";

export class ReadySoundPlayer {
  private context?: AudioContext;
  private state: ReadySoundState = "off";
  private generation = 0;
  private disposed = false;

  constructor(
    private createContext: () => AudioContext | undefined,
    private onState: (state: ReadySoundState) => void,
  ) {}

  // Try on mount; a trusted interaction retries if autoplay requires activation.
  async enable() {
    if (
      this.disposed ||
      this.state === "unsupported" ||
      (this.state === "on" && this.context?.state === "running")
    )
      return;
    const generation = ++this.generation;
    this.setState("enabling");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.context || this.context.state === "closed")
        this.context = this.createContext();
      if (!this.context) {
        this.setState("unsupported");
        return;
      }
      if (this.context.state !== "running")
        await Promise.race([
          this.context.resume(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Audio activation timed out")),
              3000,
            );
          }),
        ]);
      if (this.disposed || generation !== this.generation) return;
      this.setState(this.context.state === "running" ? "on" : "blocked");
    } catch {
      if (!this.disposed && generation === this.generation)
        this.setState("blocked");
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  play() {
    if (this.disposed || this.state !== "on" || !this.context) return;
    if (this.context.state !== "running") {
      this.setState("blocked");
      return;
    }
    try {
      const context = this.context,
        oscillator = context.createOscillator(),
        gain = context.createGain(),
        start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07, start + 0.012);
      gain.gain.linearRampToValueAtTime(0, start + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    } catch {
      this.setState("blocked");
    }
  }

  mute() {
    if (this.disposed) return;
    ++this.generation;
    this.closeContext();
    this.setState("off");
  }

  dispose() {
    this.disposed = true;
    ++this.generation;
    this.closeContext();
  }

  private setState(state: ReadySoundState) {
    this.state = state;
    this.onState(state);
  }

  private closeContext() {
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
}
