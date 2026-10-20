# Formularios: obligatorios, errores flotantes y gastos pendientes

**Solicitud:** solucionar el guardado de gastos, permitir Real pendiente mientras se presupuesta, señalar obligatorios en toda la aplicación y mostrar errores mediante notificaciones flotantes, evitando alertas estáticas de operación.

**Restricciones:** conservar cambios locales y `.env`. No cargar gastos ficticios en desarrollo, migrar, commitear ni pushear. No alterar cálculos, permisos, idempotencia ni reglas de negocio. Los avisos operativos persistentes de inventario/estado y sus acciones de recuperación no equivalen a errores de un formulario y deben conservarse.

**Enfoque:** los formularios existentes mantienen sus estados de error, presentados con `OperationAlert` (toast flotante existente). Se introduce `FieldCaption({children, required?})` y se amplía `Label` con `required?`, para marcar obligatorios sin alterar los nombres accesibles de controles. La raíz maneja validación HTML nativa con un toast y foco en el primer campo inválido. Finanzas comparte validación de formulario y servidor, con mensajes concretos y foco por campo; Real y presupuesto vacíos siguen siendo pendientes.

## Interfaces compartidas

- `src/components/ui/field-caption.tsx`: `FieldCaption({children, required?}: {children: ReactNode; required?: boolean})`, devuelve un span de texto y un asterisco decorativo si corresponde.
- `src/components/ui/label.tsx`: `Label` acepta el prop adicional `required?: boolean`; renderiza la marca sin propagarlo al DOM del label. No duplicar marcas ya existentes.
- `OperationAlert` ya representa un toast; usarlo en lugar de los párrafos de error estáticos. Después de la revisión inicial se añadió `eventKey` y `useErrorFeedback()` para volver a abrir la notificación cuando se repite el mismo error, incluso con actualizaciones agrupadas por React. `useOperation` expone `errorAttempt` para propagarlo a la notificación.

## Tareas

- [x] Raíz: reproducir guardado con Real vacío y error por concepto vacío. Validación compartida de gastos, errores precisos y foco; borrar alertas estáticas duplicadas de Finanzas. Añadir helpers, feedback nativo, login y AppShell.
- [x] Inventario: revisar `components/inventory/*` e `items/*`; marcar campos realmente requeridos, convertir errores de operación a toast y conservar reintentos/estados persistentes relevantes.
- [x] Catálogo y recetas: revisar `catalog-manager.tsx`, `products/*`, `recipes/*`, `modifiers/*`; mismos criterios, sin cambiar modelos/cálculos.
- [x] Operación: revisar `branches/*`, `production/*`, `preparation/*`, `sales/*`; mismos criterios, conservar alertas de stock y estados del negocio.
- [x] Verificación integrada: pruebas de validación y permisos de gastos, guardado de presupuesto sin Real, errores y foco del navegador, formularios representativos, tipos, lint, formato y revisión de diferencias.

Las tres revisiones por área modifican archivos disjuntos. La raíz mantiene los componentes compartidos, la validación y Finanzas. No se requieren migraciones ni dependencias nuevas: la notificación existente ya tiene la interacción solicitada de un toast estilo Sonner.

## Verificación realizada

- 50 pruebas focalizadas en 9 archivos: validación de importes/campos, gastos pendientes, permisos, cierre y revisión, rentabilidad y formularios de ventas/reposición. Todas pasaron con base temporal de pruebas.
- 4 flujos Chrome con base descartable: presupuesto sin Real, error específico y foco, repetición del mismo error tras cerrar el toast, fallo de conexión sin perder datos; obligatorios y validación HTML; cierre/revisión mensual; apertura de receta y costeo sin claves duplicadas.
- TypeScript y formato correctos; ESLint sin errores (conserva dos avisos previos de símbolos sin usar en AppShell). Revisión de espacios correcta.
- Revisión independiente corrigió la repetición de errores y la visibilidad de errores iniciales de recetas; sin hallazgos importantes pendientes.
- Captura revisada: `docs/previews/expenses-field-feedback.png`.
- No se modificó `.env`, no se escribieron gastos de prueba en desarrollo ni se ejecutaron migraciones sobre esa base. Sin commits ni push.
