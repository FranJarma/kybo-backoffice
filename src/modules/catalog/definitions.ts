import type { Entity, EntityDefinition } from "./types";
import { itemClasses } from "./item-classes";
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
      {
        ...name,
        hint: "El nombre que verá la caja. Por ejemplo: Efectivo, Mercado Pago QR o Transferencia Banco Nación.",
      },
      {
        key: "kind",
        label: "Tipo",
        type: "select",
        required: true,
        hint: "Indica cómo se cobra. Efectivo habilita el cálculo de vuelto; para QR elegí el tipo de la operación: transferencia o tarjeta.",
        options: [
          { value: "cash", label: "Efectivo" },
          { value: "card", label: "Tarjeta" },
          { value: "transfer", label: "Transferencia" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        key: "commissionPercent",
        label: "Comisión total (%)",
        type: "decimal",
        hint: "Costo total que te cobra el proveedor sobre el importe cobrado. Incluí los impuestos del servicio si corresponden. 0 significa sin comisión; vacío queda pendiente. No se suma al cliente.",
      },
    ],
    columns: ["name", "kind", "commissionPercent"],
  },
  items: {
    title: "Catálogo de inventario",
    singular: "artículo",
    description:
      "Todos los artículos: alimentos, bebidas, descartables y limpieza. Clasificá cada uno y definí cómo se utiliza.",
    fields: [
      name,
      {
        key: "code",
        label: "Código",
        type: "text",
        required: true,
        hint: "Al crear la ficha se completa desde el nombre, por ejemplo TE-CHAI. Podés editarlo; debe ser único y no llevar espacios, tildes ni ñ.",
      },
      {
        key: "class",
        label: "Clase",
        type: "select",
        required: true,
        options: itemClasses,
        hint: "Qué es el artículo. Su clase es independiente de sus usos y de las categorías de la carta.",
      },
      {
        key: "purchasable",
        label: "Se puede comprar",
        type: "select",
        required: true,
        options: [
          { value: "true", label: "Sí" },
          { value: "false", label: "No" },
        ],
      },
      {
        key: "recipeUsable",
        label: "Se incluye en recetas",
        hint: "Como ingrediente o descartable: suma costo. Descuenta stock si controla inventario.",
        type: "select",
        required: true,
        options: [
          { value: "true", label: "Sí" },
          { value: "false", label: "No" },
        ],
      },
      {
        key: "stockTracked",
        label: "Controlar inventario",
        type: "select",
        required: true,
        options: [
          { value: "true", label: "Sí" },
          { value: "false", label: "No" },
        ],
        hint: "Desactivá para agua de la canilla: se usa en recetas sin exigir existencias ni descontar stock.",
      },
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
    columns: ["code", "name", "class", "baseUnit", "unitCost"],
  },
  categories: {
    title: "Categorías",
    singular: "categoría",
    description: "Organizá la carta sin duplicar productos.",
    fields: [name],
    columns: ["name"],
  },
  products: {
    title: "Catálogo y precios",
    singular: "producto",
    description: "Ficha comercial, foto y precios independientes por canal.",
    fields: [
      name,
      {
        key: "kind",
        label: "Tipo de producto",
        type: "select",
        options: [
          { value: "individual", label: "Producto individual" },
          { value: "combo", label: "Combo de productos" },
        ],
      },
      {
        key: "categoryId",
        label: "Categoría principal",
        type: "reference",
        reference: "categories",
      },
      { key: "description", label: "Descripción", type: "textarea" },
      {
        key: "vatRate",
        label: "IVA del producto",
        type: "select",
        hint: "Confirmá la alícuota que corresponde al producto. Los precios se cargan sin IVA; la caja muestra el final. Sin configurar, el producto no se puede vender.",
        options: [
          { value: "0", label: "0% (sin IVA)" },
          { value: "2,5", label: "2,5%" },
          { value: "5", label: "5%" },
          { value: "10,5", label: "10,5%" },
          { value: "21", label: "21%" },
          { value: "27", label: "27%" },
        ],
      },
      ...(
        [
          ["enabledCounter", "Disponible en mostrador"],
          ["enabledPedidosYa", "Disponible en PedidosYa"],
          ["enabledUberEats", "Disponible en Uber Eats"],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        type: "select" as const,
        options: [
          { value: "true", label: "Sí" },
          { value: "false", label: "No" },
        ],
      })),
      {
        key: "priceCounter",
        label: "Precio neto mostrador",
        type: "decimal",
        required: true,
        hint: "Sin IVA. El precio final se calcula debajo.",
      },
      {
        key: "pricePedidosYa",
        label: "Precio neto PedidosYa",
        type: "decimal",
        hint: "Opcional; vacío significa sin precio definido.",
      },
      { key: "priceUberEats", label: "Precio neto Uber Eats", type: "decimal" },
    ],
    columns: [
      "name",
      "categoryName",
      "priceCounter",
      "pricePedidosYa",
      "priceUberEats",
    ],
  },
  presentations: {
    title: "Presentaciones de compra",
    singular: "presentación",
    description:
      "Definí cómo comprás cada artículo: por envase, paquete o caja. El inventario se convierte automáticamente a g, ml o unidades.",
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
        key: "itemId",
        label: "Artículo",
        type: "reference",
        reference: "items",
        required: true,
      },
      {
        key: "baseQuantity",
        label: "Contenido total de la presentación",
        type: "decimal",
        required: true,
        hint: "Usá la unidad del artículo (g, ml o unidad). Leche en ml: envase de 1 litro = 1000; caja de 12 envases de 1 litro = 12000. Configuralo una vez y en Compras cargá cuántos envases o cajas recibiste.",
      },
    ],
    columns: ["name", "supplierName", "itemName", "baseQuantity", "baseUnit"],
  },
};
