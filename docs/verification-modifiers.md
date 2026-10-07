# Verificación de modificadores — 28/09/2026

Entrega: **0.6.0-rc.1**, para validación en una instalación de prueba. No se aplicaron migraciones a Neon ni se desplegó el código en Kybo.

Entorno: Node 24, instalación con package-lock.json, PostgreSQL embebido PGlite. No se utilizaron credenciales ni datos productivos.

## Resultados finales

| Control | Resultado |
| --- | --- |
| `npm test` | 133 aprobadas; 3 omitidas por falta de `KYBO_TEST_DATABASE_URL`; 0 fallidas |
| `npm run typecheck` | Aprobado |
| `npm run lint` | Aprobado |
| `npm run build` | Aprobado |
| `git diff --check` | Aprobado |
| `npm run test:e2e -- tests/e2e/modifiers.spec.ts` | 2 pruebas bloqueadas al iniciar navegador: falta Chromium; ninguna ejecutó sus assertions |

La migración se ensayó sobre una base PGlite poblada hasta 0005: conserva recetas y ventas y agrega `legacy` / `legacy_unknown` sin inventar componentes históricos. Esto no equivale a probar la base real de Kybo.

Las pruebas cubren herencia, factor, reemplazo, repetición, rendimiento, precios por canal, costos pendientes, permisos, pertenencia por claves compuestas, historial y reintentos. La revisión final corrigió normalización del rendimiento al convertir, publicación atómica del borrador, protección de unidades usadas por modificadores, bloqueo de ingredientes heredados y comparación visible de versiones. El reintento se prueba después de modificar grupo y receta.

## Validación pendiente antes de uso productivo

Chromium no está instalado. Dos descargas devolvieron archivos truncados y la alternativa de instalación del sistema fue bloqueada por las capacidades del entorno. No se verificaron apariencia ni interacción en navegador. Las capturas de `docs/previews` corresponden a entregas anteriores.

Para ejecutar el recorrido en un equipo con navegador disponible:

```bash
npx playwright install chromium
npm run test:e2e -- tests/e2e/modifiers.spec.ts
```

No se proporcionó una conexión PostgreSQL/Neon de pruebas. Las tres pruebas en `tests/modifiers-concurrency.test.ts` usan conexiones independientes para reintento simultáneo, venta frente a publicación y venta frente a archivo de insumo. Configurar `KYBO_TEST_DATABASE_URL` únicamente con una base de prueba dedicada y ejecutar:

```bash
npm test -- tests/modifiers-concurrency.test.ts
```

El test crea y elimina su propio esquema aleatorio. PGlite valida transacciones y restricciones, pero no demuestra concurrencia entre conexiones PostgreSQL independientes.

## Ajustes menores pendientes de la revisión

- La interfaz todavía no ofrece navegación completa del historial de grupos ni de los productos que los usan. Las versiones permanecen almacenadas y consultables por API.
- Falta el aviso específico en POS para convertir recetas antiguas; conservan su comportamiento previo.
- Las selecciones no se ordenan antes de comparar reintentos: reenviar exactamente el mismo contenido funciona; cambiar el orden de las opciones con la misma clave de operación puede producir conflicto.
- El simulador muestra cantidades agregadas por insumo; el desglose visual por fuente de aporte queda pendiente.

Fudo, Mercado Pago y los movimientos de inventario por ventas siguen fuera de esta entrega. No se considera todavía un reemplazo productivo validado de Fudo.
