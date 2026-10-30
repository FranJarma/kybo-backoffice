import { expect, it } from "vitest";
import {
  addressDraftReducer,
  initialAddressDraft,
  draftCoordinates,
  reconcileAddressDraft,
} from "@/components/branches/address-draft";

const selected = {
  id: "capital",
  address: "Alberdi 143, Salta, Argentina",
  latitude: -24.791624,
  longitude: -65.411158,
  source: "photon" as const,
};
it("does not silently confirm a search result", () => {
  const draft = addressDraftReducer(initialAddressDraft(null), {
    type: "select",
    value: selected,
  });
  expect(draft.confirmed).toBe(false);
  expect(draftCoordinates(draft)).toEqual({
    latitude: -24.791624,
    longitude: -65.411158,
  });
});
it("recognizes a committed save after its response was lost", () => {
  const draft = initialAddressDraft(selected);
  expect(reconcileAddressDraft(draft, selected).alreadySaved).toBe(true);
});
it("preserves the proposal and invalidates confirmation after another administrator saved a different point", () => {
  const draft = initialAddressDraft(selected);
  const result = reconcileAddressDraft(draft, { ...selected, latitude: -24.8 });
  expect(result.alreadySaved).toBe(false);
  expect(result.draft).toMatchObject({
    text: selected.address,
    latitude: "-24.791624",
    longitude: "-65.411158",
    confirmed: false,
  });
});
it("does not acknowledge an uncertain save when there is no persisted point", () => {
  const result = reconcileAddressDraft(initialAddressDraft(selected), null);
  expect(result.alreadySaved).toBe(false);
  expect(result.draft.confirmed).toBe(false);
});
it("invalidates both the old point and confirmation when the address text changes", () => {
  const draft = initialAddressDraft(selected);
  const changed = addressDraftReducer(draft, {
    type: "text",
    value: "Otra calle 143, Salta",
  });
  expect(changed.confirmed).toBe(false);
  expect(draftCoordinates(changed)).toBeNull();
  expect(addressDraftReducer(draft, { type: "text", value: draft.text })).toBe(
    draft,
  );
});
it("requires confirmation again after a manual adjustment and never turns an empty input into zero", () => {
  const draft = addressDraftReducer(initialAddressDraft(selected), {
    type: "latitude",
    value: "-24.8",
  });
  expect(draft.confirmed).toBe(false);
  expect(draft.source).toBe("manual");
  expect(draftCoordinates({ ...draft, longitude: "" })).toBeNull();
  expect(draftCoordinates({ ...draft, latitude: "Infinity" })).toBeNull();
});
