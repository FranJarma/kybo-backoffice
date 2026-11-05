import { describe, expect, it } from "vitest";
import {
  closeDraftKey,
  readCloseDraft,
  writeCloseDraft,
} from "@/components/cash/close-draft-storage";
import { newCloseDraft } from "@/components/cash/draft";

function store() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe("cash close recovery", () => {
  it("restores the same journey and stores only private photo identities, rebuilding URLs for its branch", () => {
    const storage = store(),
      key = closeDraftKey("employee", "branch");
    const draft = newCloseDraft("America/Argentina/Buenos_Aires");
    draft.counted = "23.500,10";
    draft.lots[0].photo = {
      id: "private-photo",
      url: "https://untrusted.invalid/photo",
    };
    writeCloseDraft(storage, key, "day-one", draft);
    expect(storage.getItem(key)).not.toContain("https:");
    expect(readCloseDraft(storage, key, "day-one", "branch")).toEqual({
      ...draft,
      lots: [
        {
          ...draft.lots[0],
          photo: {
            id: "private-photo",
            url: "/api/cash/photos/private-photo?branchId=branch",
          },
        },
      ],
    });
    expect(
      readCloseDraft(
        storage,
        closeDraftKey("other", "branch"),
        "day-one",
        "branch",
      ),
    ).toBeNull();
    expect(
      readCloseDraft(
        storage,
        closeDraftKey("employee", "other-branch"),
        "day-one",
        "other-branch",
      ),
    ).toBeNull();
  });
  it.each([null, "day-two"])(
    "never transfers a close draft into a closed or different journey (%s)",
    (sessionId) => {
      const storage = store(),
        key = closeDraftKey("employee", "branch");
      writeCloseDraft(storage, key, "day-one", newCloseDraft("UTC"));
      expect(readCloseDraft(storage, key, sessionId, "branch")).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    },
  );
  it.each([
    "broken-json",
    '{"version":0}',
    '{"version":1,"sessionId":"day-one","draft":{}}',
  ])("discards invalid stored data without creating a command", (raw) => {
    const storage = store();
    storage.setItem("key", raw);
    expect(readCloseDraft(storage, "key", "day-one", "branch")).toBeNull();
    expect(storage.getItem("key")).toBeNull();
  });
  it("surfaces unavailable storage so the UI can explain that the draft was not saved", () => {
    expect(() =>
      writeCloseDraft(
        {
          setItem() {
            throw Error("Storage unavailable");
          },
        },
        "key",
        "day-one",
        newCloseDraft("UTC"),
      ),
    ).toThrow("Storage unavailable");
  });
});
