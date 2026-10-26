export type ReadyRow = { id: string; ready: boolean };

export type ReadyObservation = { baseline?: boolean };

export class ReadyTracker {
  private scope: string | null = null;
  private completed = new Set<string>();

  observe(
    scope: string,
    rows: readonly ReadyRow[],
    options: ReadyObservation = {},
  ) {
    const baseline = options.baseline || scope !== this.scope;
    this.scope = scope;
    let changed = false;
    for (const row of rows) {
      if (row.ready) {
        if (!baseline && !this.completed.has(row.id)) changed = true;
        this.completed.add(row.id);
      }
    }
    return changed;
  }

  confirm(id: string) {
    const changed = !this.completed.has(id);
    this.completed.add(id);
    return changed;
  }
}
