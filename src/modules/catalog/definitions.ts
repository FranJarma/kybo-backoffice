import type { Entity, EntityDefinition } from "./types";
export type { Entity, CatalogRow, FieldDefinition } from "./types";
const name = {
  key: "name",
  label: "Nombre",
  type: "text",
  required: true,
} as const;
const contact = [
  { key: "email", label: "Email", type: "email" },
  {
    key: "phone",
    label: "Teléfono",
    type: "text",
    hint: "Opcional. Formato internacional, por ejemplo +54 9 387 123 4567.",
  },
] as const;
export const definitions: Record<Entity, EntityDefinition> = {
  suppliers: {
    title: "Proveedores",
    singular: "proveedor",
    description: "Contactos y presentaciones para organizar tus compras.",
    fields: [
      name,
      ...contact,
      { key: "notes", label: "Notas", type: "textarea" },
    ],
    columns: ["name", "phone", "email"],
  },
  customers: {
    title: "Clientes",
    singular: "cliente",
    description:
      "Una base de clientes para conocer mejor a quienes eligen Kybo.",
    fields: [name, ...contact],
    columns: ["name", "phone", "email"],
  },
  "payment-methods": {
    title: "Medios de pago",
    singular: "medio de pago",
    description: "Cómo cobrás. Los canales de venta se registran por separado.",
    fields: [
      name,
      {
        key: "kind",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          { value: "cash", label: "Efectivo" },
          { value: "card", label: "Tarjeta" },
          { value: "transfer", label: "Transferencia" },
          { value: "other", label: "Otro" },
        ],
      },
    ],
    columns: ["name", "kind"],
  },
  ingredients: {
    title: "Insumos",
    singular: "insumo",
    description: "Unidades claras y costos pendientes a la vista.",
    fields: [
      name,
      {
        key: "baseUnit",
        label: "Unidad base",
        type: "select",
        required: true,
        options: [
          { value: "g", label: "Gramo (g)" },
          { value: "ml", label: "Mililitro (ml)" },
          { value: "unit", label: "Unidad" },
        ],
      },
      {
        key: "unitCost",
        label: "Costo por unidad base",
        type: "decimal",
        hint: "ARS por g, ml o unidad. Dejá vacío si todavía no lo sabés. Usá coma para decimales.",
      },
    ],
    columns: ["name", "baseUnit", "unitCost"],
  },
  products: {
    title: "Productos",
    singular: "producto",
    description: "Precios independientes para mostrador y cada plataforma.",
    fields: [
      name,
      {
        key: "priceCounter",
        label: "Precio mostrador",
        type: "decimal",
        required: true,
        hint: "ARS. Usá coma para decimales.",
      },
      {
        key: "pricePedidosYa",
        label: "Precio PedidosYa",
        type: "decimal",
        hint: "Opcional; vacío significa sin precio definido.",
      },
      { key: "priceUberEats", label: "Precio Uber Eats", type: "decimal" },
    ],
    columns: ["name", "priceCounter", "pricePedidosYa", "priceUberEats"],
  },
  presentations: {
    title: "Presentaciones",
    singular: "presentación",
    description:
      "Relacioná cada presentación de compra con su proveedor e insumo.",
    fields: [
      name,
      {
        key: "supplierId",
        label: "Proveedor",
        type: "reference",
        reference: "suppliers",
        required: true,
      },
      {
        key: "ingredientId",
        label: "Insumo",
        type: "reference",
        reference: "ingredients",
        required: true,
      },
      {
        key: "baseQuantity",
        label: "Cantidad en unidad base",
        type: "decimal",
        required: true,
        hint: "Por ejemplo: un paquete de 800 g equivale a 800 si el insumo está en gramos.",
      },
    ],
    columns: [
      "name",
      "supplierName",
      "ingredientName",
      "baseQuantity",
      "baseUnit",
    ],
  },
};
