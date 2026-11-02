import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  passwordChangeFields,
  passwordChangeLocation,
} from "@/modules/password-policy/validation";
import { PasswordForm } from "@/components/account/password-form";
import { PasswordReminder } from "@/components/account/password-notice";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/staff/attendance",
}));
const state = {
  ready: true,
  required: true,
  firstLoginAt: "2026-10-29T16:00:00.000Z",
  expiresAt: "2026-10-30T16:00:00.000Z",
  blocked: false,
};
it("checks confirmation and rejects reusing the current password before sending", () => {
  expect(
    passwordChangeFields.safeParse({
      currentPassword: "First-TestOnly-123!",
      newPassword: "Second-TestOnly-123!",
      confirmPassword: "Different-TestOnly-123!",
    }).success,
  ).toBe(false);
  expect(
    passwordChangeFields.safeParse({
      currentPassword: "First-TestOnly-123!",
      newPassword: "First-TestOnly-123!",
      confirmPassword: "First-TestOnly-123!",
    }).success,
  ).toBe(false);
  expect(
    passwordChangeFields.safeParse({
      currentPassword: "First-TestOnly-123!",
      newPassword: "Second-TestOnly-123!",
      confirmPassword: "Second-TestOnly-123!",
    }).success,
  ).toBe(true);
});

it("treats compatibility-equivalent passwords as the same credential", () => {
  expect(
    passwordChangeFields.safeParse({
      currentPassword: "Attendance-TestOnly-123!",
      newPassword: "Ａttendance-TestOnly-123!",
      confirmPassword: "Ａttendance-TestOnly-123!",
    }).success,
  ).toBe(false);
});
it("preserves allowed QR returns and cannot construct an external password-change redirect", () => {
  expect(passwordChangeLocation("https://other.example/", false)).toBe(
    "/account/password?returnTo=%2F",
  );
  expect(passwordChangeLocation("/staff/attendance", true)).toBe(
    "/account/password?returnTo=%2Fstaff%2Fattendance&onboarding=1",
  );
});
it("marks all three password inputs required and allows continuing within the grace period", () => {
  const html = renderToStaticMarkup(
    createElement(PasswordForm, {
      initial: state,
      returnTo: "/staff/attendance",
    }),
  );
  expect((html.match(/required=""/g) ?? []).length).toBe(3);
  expect(html).toContain('autoComplete="current-password"');
  expect(html).toContain('autoComplete="new-password"');
  expect(html).toContain("Continuar por ahora");
  expect(html).toContain("Confirmá la nueva contraseña");
});
it("replaces the form with administrator recovery on expiry and omits reminders for permanent accounts", () => {
  const html = renderToStaticMarkup(
    createElement(PasswordForm, { initial: { ...state, blocked: true } }),
  );
  expect(html).toContain("nueva contraseña temporal");
  expect(html).not.toContain('type="password"');
  expect(
    renderToStaticMarkup(
      createElement(PasswordReminder, { state: { ...state, required: false } }),
    ),
  ).toBe("");
  const reminder = renderToStaticMarkup(
    createElement(PasswordReminder, { state, returnTo: "/staff/attendance" }),
  );
  expect(reminder).toContain("Cambiar contraseña");
  expect(reminder).toContain("/account/password");
});
