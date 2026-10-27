# Resultado: alertas de compras de Bolivia

## Entrega

Configuración en Inventario → Compras de Bolivia y tareas en Operación del día.
Cada insumo muestra stock recibido utilizable, consumo diario manual, cobertura
aproximada, fecha de trámite y cantidad sugerida para el objetivo. Detalle del
cálculo desplegable; edición exclusiva del encargado/administrador.

Prioridad inicial: crítica hasta 7 días, alta por encima de 7 y hasta 10,
programada por encima de 10. Objetivo de 17 días. Los parámetros son editables y
la urgencia sigue los valores de cada regla; la guía visual identifica los iniciales.
Los vencimientos se proyectan por FEFO; reservas de traslados internos permanecen
en el stock de la sucursal. Las reservas de consumo, bloqueos y vencidos se excluyen.

Los avisos no generan pedidos a proveedores, pagos ni entradas de stock. Se calculan
con mercadería recibida; el encargado debe revisar pedidos ya en trámite. El modelo
de documentos de compra/ETA/packs sigue siendo una entrega independiente.

## Activación autorizada y verificada en Neon

El usuario autorizó expresamente aplicar únicamente 0026 y activar ocho reglas.
La migración agregó `supply_alert_policies` y verificó el historial y la conservación
del contenido de las tablas anteriores. Los guardados usan transacción auditada,
revisión e idempotencia. No se modificaron `.env`, stock ni mínimos por ubicación.

Estimaciones iniciales: vasos y sorbetes 150 unid./día cada uno; cinco sabores de
perlas explosivas 421,052632 g/día cada uno; tapioca cruda 560,407229 g/día.
Son aproximaciones basadas en lo acordado y las recetas; ajustarlas con consumo real.

Estado verificado el 23/10/2026:

| Insumos                                     | Cobertura aproximada | Resultado                                              |
| ------------------------------------------- | -------------------: | ------------------------------------------------------ |
| Vasos y sorbetes                            |              10 días | Alta; tramitar hoy; sugerencia de 1.050 unid. cada uno |
| Explosivas frutilla, mango, maracuyá y mora |           14,25 días | Programadas para el 27/10                              |
| Explosivas chocolate                        |           23,75 días | Objetivo cubierto                                      |
| Tapioca cruda                               |           17,84 días | Objetivo cubierto                                      |

Ocho reglas verificadas, seis tareas nuevas. Las cantidades reflejan el stock leído
en ese momento y se recalculan al actualizar el tablero.

## Evidencia

- 38 pruebas en ocho archivos focalizados: FEFO, límites 7/10, tasa vacía/cero,
  permisos y replay, traslado interno, reglas incompletas, deduplicación, asignación,
  migración pendiente y regresiones de producción/reposición.
- Tres pruebas de navegador a 600, 768 y 1024 px; revisión visual del resultado.
- Tipos, ESLint y formato verificados; revisión independiente sin problemas
  críticos o importantes. La observación de leyenda está aclarada en la interfaz.
- Compilación completa con `next build --webpack`, incluidos tipos y rutas.
  Turbopack falló al conectar con el proceso de compilación de la fuente Manrope,
  tanto aislado como fuera del aislamiento; no se modificó el compilador por defecto.
- La lectura posterior verificó las ocho políticas y las urgencias; la comparación
  de saldos, movimientos y reglas operativas confirmó conservación exacta.
