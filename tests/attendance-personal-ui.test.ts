import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PersonalFrame } from "@/components/attendance/personal-frame";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/staff/attendance",
}));
it("keeps the personal navigation focused on jornada, assigned tasks and production without exposing the QR issuer", () => {
  const html = renderToStaticMarkup(
    createElement(
      PersonalFrame,
      {
        name: "Lucía",
        branchName: "Alberdi",
      },
      createElement("h1", null, "Mi jornada"),
    ),
  );
  expect(html).toContain('href="/staff/attendance"');
  expect(html).toContain('href="/staff/work"');
  expect(html).toContain('href="/staff/work?tab=production"');
  expect(html).toContain("Lucía");
  expect(html).toContain('href="/account/password"');
  expect(html).not.toContain("/staff/attendance/qr");
  expect(html).not.toContain("Gestionar turno");
});
