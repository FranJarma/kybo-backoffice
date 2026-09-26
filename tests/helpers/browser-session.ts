import { readFile, writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

// The managed runner removes this private temporary file together with its DB.
// Reuse an authenticated fixture instead of repeatedly hitting the login limit.
export async function saveAdminSession(page: Page) {
  const path = process.env.E2E_SESSION_FILE;
  if (path)
    await writeFile(path, JSON.stringify(await page.context().cookies()), {
      mode: 0o600,
    });
}
export async function restoreAdminSession(page: Page): Promise<boolean> {
  const path = process.env.E2E_SESSION_FILE;
  if (!path) return false;
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    return false;
  }
  await page.context().addCookies(JSON.parse(contents));
  return true;
}
export async function saveStaffSession(page: Page) {
  const path = process.env.E2E_SESSION_FILE;
  if (path)
    await writeFile(
      `${path}.staff`,
      JSON.stringify(await page.context().cookies()),
      { mode: 0o600 },
    );
}
export async function restoreStaffSession(page: Page): Promise<boolean> {
  const path = process.env.E2E_SESSION_FILE;
  if (!path) return false;
  let contents: string;
  try {
    contents = await readFile(`${path}.staff`, "utf8");
  } catch {
    return false;
  }
  await page.context().addCookies(JSON.parse(contents));
  return true;
}
