import { expect, it } from "vitest";
import {
  canDiscardRejectedOperation,
  discardRejectedOperation,
} from "@/components/inventory/operation-recovery";

function storedRequest() {
  const key = "kybo:pending:employee:branch:preparation";
  const body = JSON.stringify({
    url: "/api/preparation/task",
    payload: { requestId: "same-original-id", action: "start" },
  });
  const storage = new Map([[key, body]]);
  return {
    key,
    body,
    storage,
    adapter: {
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  };
}
it("keeps the exact pending request after a lost response until a received permission rejection permits explicit discard", () => {
  const saved = storedRequest();
  const lost = { pending: true, busy: false, status: null };
  expect(canDiscardRejectedOperation(lost)).toBe(false);
  expect(discardRejectedOperation(saved.adapter, saved.key, lost)).toBe(false);
  expect(saved.storage.get(saved.key)).toBe(saved.body);
  const rejected = { pending: true, busy: false, status: 403 };
  expect(canDiscardRejectedOperation(rejected)).toBe(true);
  // Merely receiving a rejection must not silently create a new operation.
  expect(saved.storage.get(saved.key)).toBe(saved.body);
  expect(discardRejectedOperation(saved.adapter, saved.key, rejected)).toBe(
    true,
  );
  expect(saved.storage.has(saved.key)).toBe(false);
});
it.each([null, 409, 429, 500])(
  "does not allow discarding a response that does not establish lost access (%s)",
  (status) => {
    const saved = storedRequest();
    expect(
      discardRejectedOperation(saved.adapter, saved.key, {
        pending: true,
        busy: false,
        status,
      }),
    ).toBe(false);
    expect(saved.storage.get(saved.key)).toBe(saved.body);
  },
);
it("keeps a rejected request while its retry is in progress", () => {
  const saved = storedRequest();
  expect(
    discardRejectedOperation(saved.adapter, saved.key, {
      pending: true,
      busy: true,
      status: 401,
    }),
  ).toBe(false);
  expect(saved.storage.has(saved.key)).toBe(true);
});
it("does not report a successful discard when browser storage cannot remove the request", () => {
  expect(() =>
    discardRejectedOperation(
      {
        removeItem() {
          throw Error("storage unavailable");
        },
      },
      "key",
      { pending: true, busy: false, status: 403 },
    ),
  ).toThrow("storage unavailable");
});
