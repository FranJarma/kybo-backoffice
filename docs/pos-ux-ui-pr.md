# Mejorar POS responsive y recuperación de cobros

El POS aplica el diseño canónico de Kybo en catálogo, modificadores, pedido y cobro. Comparte un único borrador y catálogo entre escritorio, tablet y celular. La vista móvil conserva espacio útil y permite agregar productos con la cabecera real de la aplicación, también en delivery y después de cobrar.

Las tarjetas usan fotos existentes y paletas por ID; los modificadores conservan mínimos, máximos, disponibilidad y receta. El pedido permite editar opciones, unidades, notas y precio. El cobro comparte aritmética entera, separa monto aplicado/recibido/vuelto y presenta filas compactas para pagos divididos. Transferencia verifica acreditación manual y conserva titular/referencia opcionales; tarjeta mantiene el cupón exigido por el servidor.

Los envíos tienen exclusión sincrónica y conservan el mismo comando ante incertidumbre. Respuestas de montajes antiguos no borran operaciones posteriores. Los rechazos y fallas de almacenamiento ofrecen recuperación; actualizar precios incorpora su revisión vigente. Caja y stock conservan validaciones del servidor. Impresión reintenta por separado.

## Validación

- 99/99 recorridos de Chrome con HTTP interceptado, incluidos seis con AppShell real.
- 88/88 pruebas Vitest focalizadas posteriores a la revisión; TypeScript, ESLint y Prettier pasaron.
- Build de producción con Webpack pasó. Turbopack se detuvo tras más de seis minutos sin avanzar de la compilación.
- Suite global: 1.175 pasaron, 6 fallaron, 86 omitidas. Ocho fixtures históricos y PostgreSQL dedicado fallan en preparación. Cinco aserciones encontraron restricciones de junction/localhost; la sexta mide 52 consultas ante un límite de 50, reproducida igual en el commit base.
- E2E administrado detenido antes de Next por la protección de migración genérica.

## Medición y límites

El recorrido comparable mantiene 15 GET por ancho, cuatro commits React al buscar y diez al editar. No hay refetch por filtro/viewport ni nuevas consultas por tarjeta. Script del fixture con profiling: +27.992 bytes (+1,01 %); no es el bundle optimizado de Next. Barlow agrega 424.172 bytes de archivos TTF. Los tiempos con respuestas interceptadas no representan latencia productiva.

[Verificación completa](pos-ux-ui-verification.md) · [Capturas y métricas](pos-ux-ui-evidence/README.md) · [Plan y contratos](superpowers/plans/2026-11-20-ux-ui-pos-improvements.md)

Falta verificar E2E administrado, PostgreSQL con dos conexiones, teclado móvil nativo, entrega de medios privados e impresora física. La revisión de aplicación está aprobada; esto no certifica CI global verde. Una observación menor de copy conserva el botón “Agregar” al editar, con guardado funcional correcto. No cambian dependencias, esquema, infraestructura ni políticas comerciales. No hay despliegue productivo ni merge automático.
