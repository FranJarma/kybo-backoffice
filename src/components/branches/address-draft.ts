type AddressValue = {
  address: string;
  latitude: number;
  longitude: number;
  source: "photon" | "manual";
};
export type AddressDraft = {
  text: string;
  selectedId: string;
  latitude: string;
  longitude: string;
  source: "photon" | "manual";
  confirmed: boolean;
};
type Action =
  | { type: "text" | "latitude" | "longitude"; value: string }
  | { type: "select"; value: AddressValue & { id: string } }
  | { type: "confirm"; value: boolean }
  | { type: "reconcile"; value: AddressValue | null };
export function initialAddressDraft(value: AddressValue | null): AddressDraft {
  return {
    text: value?.address ?? "",
    selectedId: value ? "saved" : "",
    latitude: value?.latitude.toString() ?? "",
    longitude: value?.longitude.toString() ?? "",
    source: value?.source ?? "manual",
    confirmed: !!value,
  };
}
export function draftCoordinates(draft: AddressDraft) {
  const latitude = Number(draft.latitude),
    longitude = Number(draft.longitude);
  return !draft.latitude.trim() ||
    !draft.longitude.trim() ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
    ? null
    : { latitude, longitude };
}
export function addressDraftReducer(
  state: AddressDraft,
  action: Action,
): AddressDraft {
  if (action.type === "reconcile")
    return reconcileAddressDraft(state, action.value).draft;
  if (action.type === "select")
    return {
      text: action.value.address,
      selectedId: action.value.id,
      latitude: action.value.latitude.toString(),
      longitude: action.value.longitude.toString(),
      source: action.value.source,
      confirmed: false,
    };
  if (action.type === "confirm")
    return {
      ...state,
      confirmed:
        action.value &&
        !!draftCoordinates(state) &&
        state.text.trim().length >= 5,
    };
  if (action.type === "text")
    return action.value === state.text
      ? state
      : { ...initialAddressDraft(null), text: action.value };
  return {
    ...state,
    [action.type]: action.value,
    source: "manual",
    selectedId: "",
    confirmed: false,
  };
}

export function reconcileAddressDraft(
  draft: AddressDraft,
  saved: AddressValue | null,
) {
  const point = draftCoordinates(draft);
  const alreadySaved =
    !!saved &&
    !!point &&
    saved.address.trim() === draft.text.trim() &&
    saved.latitude === point.latitude &&
    saved.longitude === point.longitude &&
    saved.source === draft.source;
  return {
    alreadySaved,
    draft: alreadySaved ? draft : { ...draft, confirmed: false },
  };
}
