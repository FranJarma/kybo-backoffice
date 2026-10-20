import { expect, it } from "vitest";
import {
  expenseCommandSchema,
  expenseValidationFeedback,
} from "@/modules/overheads/validation";
const base = {
  action: "save",
  month: "2026-10",
  revision: 0,
  expectedUnits: null,
  entries: [
    {
      category: "rent",
      concept: "Alquiler",
      budget: "2.000.000",
      actual: "",
      notes: "",
    },
  ],
};
it("keeps actual amounts and budgets optional while planning", () => {
  expect(expenseCommandSchema.parse(base).entries![0].actual).toBe("");
  expect(
    expenseCommandSchema.parse({
      ...base,
      entries: [{ ...base.entries[0], budget: "" }],
    }).entries![0].budget,
  ).toBe("");
});
it("requires a description only for other expenses and identifies invalid amounts", () => {
  const concept = expenseCommandSchema.safeParse({
    ...base,
    entries: [{ ...base.entries[0], category: "other", concept: " " }],
  });
  expect(concept.success).toBe(false);
  if (!concept.success)
    expect(expenseValidationFeedback(concept.error)).toMatchObject({
      error: "Descripción del gasto 1: Describí el gasto al elegir «Otros».",
      fields: { "entries.0.concept": "Describí el gasto al elegir «Otros»." },
    });
  const money = expenseCommandSchema.safeParse({
    ...base,
    entries: [{ ...base.entries[0], budget: "2,000,000" }],
  });
  expect(money.success).toBe(false);
  if (!money.success)
    expect(expenseValidationFeedback(money.error).error).toContain(
      "Presupuesto del gasto 1: Usá coma decimal y punto para miles.",
    );
  expect(
    expenseCommandSchema.safeParse({ ...base, expectedUnits: 1.5 }).success,
  ).toBe(false);
  expect(
    expenseCommandSchema.safeParse({ ...base, iibbRate: "100,01" }).success,
  ).toBe(false);
});
it("automatically names standard expense types without requiring a concept", () => {
  const entry = {
    category: "rent",
    budget: "2.000.000",
    actual: "",
    notes: "",
  };
  expect(
    expenseCommandSchema.parse({ ...base, entries: [entry] }).entries![0],
  ).toMatchObject({ category: "rent", concept: "Alquiler", notes: "" });
  expect(
    expenseCommandSchema.parse({
      ...base,
      entries: [{ ...entry, category: "electricity", concept: " " }],
    }).entries![0].concept,
  ).toBe("Luz");
  expect(
    expenseCommandSchema.parse({
      ...base,
      entries: [
        { ...entry, concept: "Alquiler depósito", notes: "Contrato anterior" },
      ],
    }).entries![0],
  ).toMatchObject({ concept: "Alquiler depósito", notes: "Contrato anterior" });
});
it("requires known actual amounts only when revising a closed month", () => {
  const revision = {
    ...base,
    action: "revise",
    reason: "Corrección",
    confirmed: true,
  };
  const result = expenseCommandSchema.safeParse(revision);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues[0].path).toEqual(["entries", 0, "actual"]);
  expect(
    expenseCommandSchema.safeParse({
      ...revision,
      entries: [{ ...base.entries[0], actual: "0" }],
    }).success,
  ).toBe(true);
});
