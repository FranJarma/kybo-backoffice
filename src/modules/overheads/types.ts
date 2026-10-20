export const expenseCategories = {
  rent: "Alquiler",
  electricity: "Luz",
  utilities: "Agua y gas",
  internet: "Internet y telefonía",
  payroll: "Sueldos",
  taxes: "Impuestos y tasas",
  maintenance: "Mantenimiento",
  other: "Otros",
} as const;
export type ExpenseEntry = {
  category: keyof typeof expenseCategories;
  concept: string;
  budget: string | null;
  actual: string | null;
  notes: string;
};
export type OverheadBasis = {
  month: string;
  budgetTotal: string | null;
  expectedUnits: number | null;
  iibbRate?: string | null;
  entries?: Pick<ExpenseEntry, "category" | "concept" | "budget">[];
};
