export type RejectedOperationState = {
  pending: boolean;
  busy: boolean;
  status: number | null;
};
export function canDiscardRejectedOperation(state: RejectedOperationState) {
  return (
    state.pending &&
    !state.busy &&
    (state.status === 401 || state.status === 403)
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
