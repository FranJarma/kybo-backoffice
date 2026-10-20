import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ExpensesManager } from "@/components/finance/expenses-manager";
vi.stubGlobal("React", React);
it("waits for the initial monthly document before accepting month changes", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExpensesManager, { initialMonth: "2026-10" }),
  );
  expect(html).toMatch(/<input(?=[^>]*type="month")(?=[^>]*disabled)[^>]*>/);
});
