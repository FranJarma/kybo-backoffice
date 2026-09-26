# Verificación de ventas y mesas — 25/09/2026

## Cobertura

- Migración SQL real aplicada a PostgreSQL embebido nuevo; esquema relacional de ventas, comandas, renglones, cobros/devoluciones y mesas.
- Mostrador requiere cobro completo, con atomicidad ante validaciones fallidas y sin movimientos de inventario.
- Cuentas de mesa con pedidos sucesivos, revisión concurrente, pagos parciales, rechazo de sobrepago y liberación al completar el cobro.
- Precios observados y efectivos separados, motivo de ajuste, importes exactos y rechazo de una carta desactualizada. Ausencia de precio distinta de cero.
- Plataforma separada de medio de pago local; duplicados de número externo rechazados sin duplicar venta ni modificar la carta.
- Reintentos tras revisiones cambiadas, respuesta perdida y recarga con clave estable; recuperación de una venta confirmada mediante su URL.
- Anulación con motivo y confirmación de devolución, compensaciones vinculadas al cobro original e historial conservado.
- Mesas sin superposición; archivo bloqueado mientras haya cuenta abierta.
- Personal accede al POS y consulta mesas; APIs de catálogo/recetas y cambios de mesas mantienen restricciones. Solicitudes de otro origen rechazadas.
- Encabezados alineados, escritorio 1440 px, móvil 390 px sin desborde de página; mesas operativas en tarjetas móviles y disposición en grilla editable.

## Evidencia

- `npm test`: **89/89** pruebas aprobadas.
- Suite completa `npm run test:e2e` con Chromium instalado: **17/17** aprobadas.
- Reejecución final de los tres flujos de ventas tras el ajuste de legibilidad y capturas: **3/3** aprobados.
- `npm run build`, `npm run typecheck`, `npm run lint`: sin errores.
- RED→GREEN específico para acceso de personal: el layout administrativo inicial mostraba acceso denegado; ahora redirige al POS sin ampliar permisos de catálogo.
- RED→GREEN de recarga: una venta recién confirmada perdía el detalle al recargar; la URL ahora conserva su ID y vuelve a consultar el registro.
- Una ejecución intermedia 15/17 activó el límite de inicio de sesión al repetir autenticaciones de fixtures. El runner conserva una sesión temporal del administrador; la protección de autenticación de producción no fue alterada. La siguiente suite completa pasó 17/17.
- En la corrida de desarrollo aparecieron avisos de entorno NO_COLOR/http-proxy y de captura/navegación en módulos anteriores (stream cerrado y atributo caret-color añadido al capturar una pantalla durante hidratación). No se ocultaron; los flujos correspondientes aprobaron.
- `docs/previews/sales-*.png` y `tables-*.png` usan datos ficticios en bases temporales. No se importan a la instalación del usuario.

## Límites de la evidencia

No valida múltiples conexiones reales a Neon, hardware, plataformas, procesamiento de pagos, impresora ni modo offline. La entrega registra ventas/cobros; no envía a cocina ni reserva/consume inventario. Los cobros de plataforma no equivalen a una liquidación ni a ganancia. Las limitaciones aparecen también en la interfaz y README.

Revisión independiente estática de `8a348d4..02e6db0`: sin hallazgos críticos/importantes y dos menores diferidos, detallados en `docs/sales-review.md`. El revisor no repitió las pruebas ejecutadas por el implementador.
