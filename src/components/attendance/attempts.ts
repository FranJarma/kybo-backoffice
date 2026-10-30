export class AttendanceAttempts {
  private pending: { key: string; id: string } | null = null;
  private key(command: Record<string, unknown>, origin: string) {
    const intent = { ...command };
    delete intent.verificationId;
    delete intent.location;
    delete intent.code;
    return JSON.stringify({ intent, origin });
  }
  begin(command: Record<string, unknown>, origin: string) {
    const key = this.key(command, origin);
    if (this.pending?.key !== key)
      this.pending = { key, id: crypto.randomUUID() };
    return this.pending.id;
  }
  forget(command: Record<string, unknown>, origin: string) {
    if (this.pending?.key === this.key(command, origin)) this.pending = null;
  }
}
