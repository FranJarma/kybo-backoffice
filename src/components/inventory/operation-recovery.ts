export type RejectedOperationState = {
  pending: boolean;
  busy: boolean;
  status: number | null;
  outcomeUncertain?: boolean;
};
export function isDefinitiveClientRejection(status: number | null) {
  return status !== null && status >= 400 && status < 500 && status !== 429;
}
export function canDiscardRejectedOperation(state: RejectedOperationState) {
  return (
    state.pending &&
    !state.busy &&
    state.outcomeUncertain === false &&
    isDefinitiveClientRejection(state.status)
  );
}
export function discardRejectedOperation(
  storage: Pick<Storage, "removeItem">,
  key: string,
  state: RejectedOperationState,
) {
  if (!canDiscardRejectedOperation(state)) return false;
  storage.removeItem(key);
  return true;
}
