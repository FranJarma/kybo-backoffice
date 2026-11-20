import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { LoginForm } from "@/components/login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

it("asks for a username rather than an email address when signing in", () => {
  const html = renderToStaticMarkup(createElement(LoginForm));
  expect(html).toContain('for="username"');
  expect(html).toMatch(/<input[^>]*id="username"[^>]*autoComplete="username"/);
  expect(html).toContain('placeholder="Tu nombre de usuario"');
  expect(html).not.toContain("Usuario o correo");
  expect(html).not.toContain('id="email"');
});

it("keeps password visibility and recovery available with the intended return page", () => {
  const html = renderToStaticMarkup(
    createElement<{ returnTo: string }>(LoginForm, {
      returnTo: "/staff/attendance",
    }),
  );
  expect(html).toContain('aria-label="Mostrar contraseña"');
  expect(html).toContain('autoComplete="current-password"');
  expect(html).toContain("Olvidé mi contraseña");
  expect(html).toContain("/recover-password?returnTo=%2Fstaff%2Fattendance");
});
