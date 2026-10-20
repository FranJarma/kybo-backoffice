/** Memory only: each mounted register owns its cache, scoped by branch/channel/version. */
export class PosRequestCache<T> {
  private entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(
    private ttl = 60_000,
    private maximum = 100,
  ) {}
  get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
    const previous = this.entries.get(key);
    if (previous && previous.expires > now) return previous.value;
    const entry = { expires: now + this.ttl, value: load() };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maximum)
      this.entries.delete(this.entries.keys().next().value!);
    void entry.value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.value;
  }
  clear() {
    this.entries.clear();
  }
}
