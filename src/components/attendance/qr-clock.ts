/** Anchor server-relative lifetime before the request, never after network delay. */
export function qrClientDeadline(
  serverNow: string,
  expiresAt: string,
  requestStarted: number,
) {
  const lifetime = Date.parse(expiresAt) - Date.parse(serverNow);
  return (
    requestStarted + (Number.isFinite(lifetime) ? Math.max(0, lifetime) : 0)
  );
}
export function qrSecondsRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
