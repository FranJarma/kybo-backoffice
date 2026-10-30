import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PersonalFrame } from "@/components/attendance/personal-frame";
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
  expect(html).not.toContain("/staff/attendance/qr");
  expect(html).not.toContain("Gestionar turno");
});
