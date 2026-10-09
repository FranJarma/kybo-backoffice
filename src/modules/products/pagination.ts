export function pageOffset(offset: number, total: number) {
  return Math.min(offset, Math.max(0, Math.ceil(total / 30) - 1) * 30);
}
