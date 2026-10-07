export const entities = [
  "suppliers",
  "customers",
  "payment-methods",
  "items",
  "products",
  "presentations",
] as const;
export type Entity = (typeof entities)[number];
export type CatalogRow = {
  id: string;
  name: string;
  revision: number;
  archivedAt: string | null;
  [key: string]: string | number | boolean | null;
};
export type ListResult = { rows: CatalogRow[]; total: number };
export type FieldDefinition = {
  key: string;
  label: string;
  type: "text" | "email" | "textarea" | "decimal" | "select" | "reference";
  required?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
  reference?: Entity;
};
export type EntityDefinition = {
  title: string;
  singular: string;
  description: string;
  fields: FieldDefinition[];
  columns: string[];
};
