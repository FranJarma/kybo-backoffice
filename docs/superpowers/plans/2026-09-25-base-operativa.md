# Kybo: base operativa Implementation Plan

**Estado al 25/09/2026:** tareas 1–5 completadas para este incremento. Los pasos originales se conservan abajo; resultados, consolidación de archivos/commits y límites verificados están en `docs/progress.md` y `docs/verification.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar un primer incremento ejecutable con acceso privado y gestión persistente de proveedores, clientes, medios de pago, insumos, presentaciones y productos.

**Architecture:** Monolito modular Next.js App Router, con autorización en servidor, PostgreSQL relacional y migraciones. Drizzle permite usar el mismo esquema PostgreSQL en Neon mediante node-postgres y en pruebas locales con PGlite; este último queda expresamente inhabilitado en producción. Better Auth resuelve las sesiones; los permisos operativos se consultan en cada solicitud.

**Tech Stack:** Next.js 16, TypeScript, React, Tailwind, Shadcn, Neon/PostgreSQL, Drizzle, Better Auth, Zod, Vitest y Playwright. Node 24; versiones exactas resueltas y fijadas en package-lock.json.

**Spec:** ../specs/2026-09-24-kybo-operations-design.md, versión 0.10. Este plan implementa el comienzo de A, no toda A ni la versión que reemplazará Fudo.

## Global Constraints

- La aplicación será un sistema interno en español de Argentina, con importes en ARS, usando Next.js, TypeScript, Neon y Shadcn.
- Un costo desconocido permanece pendiente.
- Cambiar un costo o una receta no modifica el precio de venta ni reescribe el costo histórico de operaciones confirmadas.
- Archivar registros usados en operaciones; preservar sus referencias históricas.
- Tablas normalizadas para entidades operativas.
- Timestamps en UTC y visualización en la zona horaria de Salta.
- Crear un cliente no implica consentimiento para promociones.
- No modificar ni desplegar el sitio Kybo Operations existente.
- Instrucción del 25/09: postergar recopilación de costos y continuar el desarrollo; ningún importe faltante bloquea este incremento.

## Review Focus

1. Una petición directa sin sesión o desde personal no autorizado no debe leer ni modificar datos administrativos: tarea 2 y prueba HTTP de tarea 5.
2. Vacío, cero y decimal argentino son entradas diferentes: tarea 3 prueba persistencia de null, cero explícito y 54.208,00.
3. Dos personas editan la misma ficha: tarea 3 prueba que la segunda escritura con revisión antigua falla sin borrar la primera.
4. Archivar un proveedor relacionado no rompe presentaciones existentes; crear nuevas relaciones con archivados se rechaza: tarea 4.
5. Error de red o base durante guardar no muestra éxito ni cierra el formulario; volver a cargar confirma persistencia: tarea 5.

## Límites y próximas entregas

Este incremento no recibe dinero ni descuenta stock. La siguiente entrega corresponde a compras, lotes y movimientos; luego recetas y producción; luego POS propio con mostrador, mesas y delivery, offline, preparación, caja, fichaje e impresión. El alcance aprobado de ventas propias permanece intacto. OCR, emisión fiscal e integraciones externas conservan sus etapas del documento general. No importar automáticamente ejemplos del sitio actual ni inventar históricos.

La conexión a Neon usa DATABASE_URL del entorno del servidor. Sin credenciales se puede verificar el incremento con PostgreSQL embebido en un directorio local identificado para desarrollo. La validación local no equivale a una validación sobre Neon ni a una habilitación para operar el local.

## Contratos de archivos y datos

Nuevo proyecto independiente: /workspace/scratch/812565614d36/kybo-operations-next, rama feat/foundation. El repositorio existente queda intacto.

| Archivo / directorio | Responsabilidad |
| --- | --- |
| src/db/schema.ts | Tablas de negocio, autenticación y auditoría |
| src/db/client.ts | Conexión PostgreSQL; modo local explícito solo desarrollo |
| drizzle/ | SQL de migraciones versionadas |
| scripts/migrate.ts | Aplicar migraciones al destino seleccionado |
| scripts/create-user.ts | Alta administrativa por CLI, sin registro público |
| src/lib/auth.ts, src/lib/access.ts | Sesiones y capacidades |
| src/modules/catalog/definitions.ts | Entidades y campos de UI, sin secretos ni SQL |
| src/modules/catalog/validation.ts | Validación, decimales, teléfonos y entradas estrictas |
| src/modules/catalog/service.ts | Consultas, transacciones, revisiones y auditoría |
| src/app/api/catalog/[entity]/route.ts | Listado y alta autenticados |
| src/app/api/catalog/[entity]/[id]/route.ts | Actualización y archivo autenticados |
| src/components/catalog-manager.tsx | Listado, búsqueda, formulario, archivo y estados de error |
| src/app/(operations)/ | Layout privado, inicio y páginas de cada módulo |
| src/components/ui/ | Componentes Shadcn instalados y versionados |
| tests/ | Pruebas de dominio, persistencia, autenticación y navegador |

Entidades: suppliers, customers, payment-methods, ingredients, products, presentations. IDs UUID de negocio. Campos comunes: id, revision (entero inicial 1), archivedAt nullable, createdAt, updatedAt. Nombres no vacíos de hasta 160 caracteres. Archivo lógico reversible. Búsqueda paginada o limitada a 100 filas con aviso; nunca anunciar que se muestran todos si hay más.

Tablas separadas: suppliers(name,email,phone,notes), customers(name,email,phone), payment_methods(name,kind), ingredients(name,base_unit,unit_cost), products(name), product_prices(product_id,channel,amount), purchase_presentations(name,supplier_id,ingredient_id,base_quantity). El consentimiento no se presume: customers incorpora marketing_opt_in=false y no se ofrece activarlo sin flujo de evidencia. Canales de precio: counter, pedidosya, ubereats. Métodos de pago: cash, card, transfer, other. La plataforma no es un tipo de medio de pago.

Base de insumos: g, ml, unit. Presentación expresa cantidad positiva de esa misma unidad base; no hay conversión implícita masa/volumen. unit_cost: numeric(18,6) nullable, ARS por unidad base. amount: numeric(14,2), nunca flotantes para persistencia. Precio mostrador requerido; precios delivery opcionales; no heredar un precio ausente sin mostrarlo. IDs/revisión/autor provienen del servidor o de parámetros explícitos validados, nunca del conjunto editable.

Contratos comunes:

```ts
type Entity = 'suppliers' | 'customers' | 'payment-methods' | 'ingredients' | 'products' | 'presentations';
type CatalogRow = { id: string; name: string; revision: number; archivedAt: string | null; [key: string]: string | number | boolean | null };
type Actor = { id: string; role: 'admin' | 'manager' | 'staff' };
type ListResult = { rows: CatalogRow[]; total: number };
// Todas las funciones de servicio validan permiso y entradas.
listRecords(actor: Actor, entity: Entity, search?: string, archived?: boolean): Promise<ListResult>;
createRecord(actor: Actor, entity: Entity, input: unknown): Promise<CatalogRow>;
updateRecord(actor: Actor, entity: Entity, id: string, input: unknown): Promise<CatalogRow>;
// update: { revision, ...campos } o { revision, archived: boolean }.
```

HTTP GET devuelve ListResult; POST/PATCH devuelven {row}. Errores: {error,code}; 401 sesión ausente, 403 permiso, 400 entrada, 404 referencia, 409 revisión o relación archivada, 503 persistencia indisponible. No exponer errores SQL ni contraseñas. Todas las respuestas privadas sin caché compartida. Mutaciones con comprobación de Origin y solicitudes JSON.

### Task 1: PostgreSQL y esquema reproducible

**Files:** Create package.json, tsconfig.json, next.config.ts, drizzle.config.ts, src/db/schema.ts, src/db/client.ts, scripts/migrate.ts, .env.example, tests/helpers/database.ts, tests/database.test.ts.

**Interfaces:** Produce getDb(), el tipo AppDb y el esquema exportado. La factoría de pruebas crea PGlite aislado y aplica el mismo SQL de migraciones; devuelve {db,close}. La aplicación de producción requiere DATABASE_URL y nunca selecciona desarrollo por ausencia silenciosa de URL.

- [ ] Crear configuración Next/TS y dependencias estables fijadas; instalar Shadcn. Ejecutar npm install y conservar lockfile.
- [ ] Escribir prueba que inserta proveedor e insumo, crea una presentación y rechaza proveedor inexistente y cantidad cero. Ejemplo de expectativa sobre la base real:

```ts
await expect(db.insert(purchasePresentations).values({
  id: crypto.randomUUID(), name: 'Bolsa', supplierId: crypto.randomUUID(),
  ingredientId, baseQuantity: '800'
})).rejects.toThrow();
```

- [ ] Ejecutar npm test -- tests/database.test.ts; debe fallar por ausencia de esquema/migración, no por acceso de red.
- [ ] Implementar tablas, FK restrictivas, CHECK de números no negativos y cantidades positivas, unique de precio por producto/canal; generar SQL y aplicar en pruebas. Las tablas de autenticación se amplían en tarea 2.
- [ ] Ejecutar npm test -- tests/database.test.ts y npm run typecheck; ambas pasan. Commit: feat: add relational PostgreSQL foundation.

### Task 2: Inicio de sesión y permisos

**Files:** Create src/lib/auth.ts, src/lib/access.ts, src/app/api/auth/[...all]/route.ts, scripts/create-user.ts, tests/access.test.ts, tests/auth.test.ts; modify src/db/schema.ts y migrations.

**Interfaces:** Consume AppDb. Produce getAuth() y requireActor(): Promise<Actor>, requireCatalogAccess(actor: Actor | null): void. Admin y manager gestionan catálogo; staff no accede a datos administrativos. El rol se lee desde servidor y no es editable por endpoints de cuenta del usuario.

- [ ] Escribir pruebas: requireCatalogAccess(null) rechaza; staff rechaza; admin y manager permiten. Autenticación real: contraseña errónea no entrega sesión; sesión válida permite consulta; deshabilitar usuario invalida acceso de negocio; registro público y cambio de rol propio se rechazan.

```ts
expect(() => requireCatalogAccess(null)).toThrow();
expect(() => requireCatalogAccess({id:'employee',role:'staff'})).toThrow();
expect(() => requireCatalogAccess({id:'owner',role:'admin'})).not.toThrow();
```

- [ ] Ejecutar npm test -- tests/access.test.ts tests/auth.test.ts y comprobar fallos de comportamiento.
- [ ] Configurar Better Auth con adaptador Drizzle/pg, email/contraseña, registro público desactivado, cookies seguras en producción, secreto obligatorio, trustedOrigins configurado y límite persistente de intentos. CLI usa API interna/contexto para crear usuario y cuenta con hash oficial; contraseña por entrada oculta o variable temporal, jamás argumentos de comando ni logs. Permitir rol explícito validado. No incluir contraseña predeterminada.
- [ ] Ejecutar las pruebas y typecheck. Commit: feat: secure catalog access with private sessions.

### Task 3: CRUD de proveedores, clientes y medios de pago

**Files:** Create src/modules/catalog/types.ts, definitions.ts, validation.ts, service.ts, tests/catalog.test.ts; rutas api/catalog.

**Interfaces:** Consume getDb, requireActor. Produce listRecords/createRecord/updateRecord con los contratos anteriores. DefineCatalog exporta metadatos serializables para los formularios.

- [ ] Escribir pruebas de alta/edición/listado/archivo/recuperación con DB real; comprobar que una escritura antigua rechaza sin modificar el registro y que datos+auditoría se confirman atómicamente. Cliente sin teléfono válido; cliente con teléfono no obtiene consentimiento. Whitelist estricta impide escribir role, id o marketingOptIn. Teléfono internacional opcional; el formulario indica +54 y no adivina el área. Vacío se transforma en null.

```ts
const created = await createRecord(admin,'suppliers',{name:'Proveedor de prueba',phone:'',email:'',notes:''});
await updateRecord(admin,'suppliers',created.id,{revision:1,name:'Nombre actualizado',phone:'',email:'',notes:''});
await expect(updateRecord(admin,'suppliers',created.id,{revision:1,name:'Edición vieja',phone:'',email:'',notes:''})).rejects.toMatchObject({code:'CONFLICT'});
expect((await listRecords(admin,'suppliers')).rows[0].name).toBe('Nombre actualizado');
```

- [ ] Ejecutar npm test -- tests/catalog.test.ts; comprobar el fallo antes de implementar.
- [ ] Implementar servicios con transacción por escritura, actualización WHERE id AND revision, incremento de revisión y evento de auditoría. El actor del evento es el autenticado. Archivo no elimina fila; restauración también exige revisión. Búsquedas limitadas y orden estable. API comprueba permisos para GET también; valida Origin en POST/PATCH.
- [ ] Ejecutar suite y typecheck. Commit: feat: add audited supplier customer and payment management.

### Task 4: Insumos, productos por canal y presentaciones

**Files:** Modify schema/definitions/validation/service; Create tests/ingredients.test.ts, tests/products.test.ts, tests/presentations.test.ts.

**Interfaces:** Mismo contrato CRUD. UI campos ingredient: baseUnit, unitCost. Product: priceCounter, pricePedidosYa, priceUberEats; DB guarda precios en tabla hija. Presentation: supplierId, ingredientId, baseQuantity; unidad visible es la del insumo.

- [ ] Escribir pruebas con expectativas literales: vacío persiste null incluso después de editar nombre; cero explícito persiste cero; costo unitario '54,208' se interpreta 54.208 ARS/base; '54.208,00' equivale 54208 ARS; no aceptar formatos ambiguos mal agrupados ni negativos. La UI explica entrada es ARS por g/ml/unidad, no precio del paquete. Cambio de costo no cambia precio de producto.

```ts
const milk = await createRecord(admin,'ingredients',{name:'Leche',baseUnit:'ml',unitCost:''});
expect(milk.unitCost).toBeNull();
const pack = await createRecord(admin,'presentations',{name:'Paquete 800 g',supplierId,ingredientId,baseQuantity:'800'});
expect(pack.baseQuantity).toBe('800.000000');
```

- [ ] Ejecutar pruebas, ver fallos, implementar validadores decimales sin Number para guardar, relaciones activas y transacciones de precios. Bloquear cambio de unidad base si hay presentaciones; al archivar proveedor mantener las ya creadas. No reactivar referencias archivadas al editar campos ajenos, ni permitir seleccionar nuevas referencias archivadas.
- [ ] Ejecutar suite completa y typecheck. Commit: feat: add ingredients products and purchase presentations.

### Task 5: Interfaz operativa y verificación integral

**Files:** Create src/app/layout.tsx, globals.css, login/page.tsx, (operations)/layout.tsx, (operations)/page.tsx, (operations)/[entity]/page.tsx, src/components/app-shell.tsx, catalog-manager.tsx, login-form.tsx; src/components/ui/*, tests/e2e/catalog.spec.ts, playwright.config.ts, README.md.

**Interfaces:** Consume API de tareas 2–4 y definitions. Formularios conservan datos y error al fallar; éxito solo tras respuesta durable. Búsqueda, filtros activos/archivados, estados vacíos y recuentos. Mostrar costos como Pendiente, precios por canal con guion si ausentes. No mostrar facturación simulada.

- [ ] Escribir flujo Playwright que ingresa con usuario de prueba efímero, crea proveedor, recarga, edita, archiva y restaura; crea cliente sin promociones y leche con costo vacío. En segunda pestaña provoca conflicto de revisión. Prueba request directo sin sesión =401; origen ajeno =403.

```ts
await page.getByRole('button',{name:'Nuevo proveedor'}).click();
await page.getByLabel('Nombre',{exact:true}).fill('Proveedor E2E');
await page.getByRole('button',{name:'Guardar',exact:true}).click();
await expect(page.getByText('Proveedor E2E',{exact:true})).toBeVisible();
await page.reload();
await expect(page.getByText('Proveedor E2E',{exact:true})).toBeVisible();
```

- [ ] Ejecutar prueba navegador y confirmar falta de interfaz; implementar navegación responsive y formularios Shadcn accesibles, labels, mensajes en español y acciones táctiles. Mantener marca Kybo y una UI administrativa sobria. Estados activos/archivados y cantidad visible de registros; no enlaces a módulos todavía inexistentes.
- [ ] Verificar desktop y viewport 390px. Fallar una solicitud de guardado en navegador: conservar formulario y no mostrar éxito. Comprobar nueva lectura desde servidor y ausencia de overflow horizontal de página.
- [ ] Ejecutar npm test, npm run typecheck, npm run lint, npm run build y npm run test:e2e. Registrar salidas reales. README incluye comandos de inicio, DB local y Neon, creación segura de usuarios y alcance implementado; no afirmar que hay Neon configurado si no se probó.
- [ ] Revisión independiente de código completo, corregir hallazgos importantes con prueba de regresión; empaquetar fuente, lockfile, migraciones, pruebas, plan y especificación. Excluir secretos, base local, node_modules y compilación. Commit: feat: deliver Kybo administration interface.

## Revisión del plan

Cobertura: secciones 1–4 y 10 del diseño cubiertas para maestros, privacidad de acceso y datos pendientes. Secciones 5–9 y 11, migración de datos reales, recetas y producción quedan en las siguientes entregas descritas arriba; este plan no declara completada toda la etapa A. Los cinco riesgos tienen pruebas asignadas; interfaces de servicios coinciden con las rutas y UI. Las versiones exactas dependen de lo instalado y fijado, no se usa una versión inventada. Drizzle concreta la decisión de ORM que en el diseño general figuraba como propuesta de Prisma.

Fuentes técnicas consultadas 25/09/2026: https://nextjs.org/docs/app/getting-started/installation · https://better-auth.com/docs/adapters/drizzle · https://better-auth.com/docs/authentication/email-password · https://orm.drizzle.team/docs/get-started-postgresql · https://orm.drizzle.team/docs/connect-pglite · https://ui.shadcn.com/docs/installation/next .
