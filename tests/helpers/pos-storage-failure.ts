import type { Page } from "@playwright/test";

export async function failSaleCleanupOnce(page: Page) {
  await page.evaluate(() => {
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (this === sessionStorage && key.endsWith(":sale")) {
        Storage.prototype.removeItem = removeItem;
        throw new DOMException("Storage unavailable", "SecurityError");
      }
      removeItem.call(this, key);
    };
  });
}
