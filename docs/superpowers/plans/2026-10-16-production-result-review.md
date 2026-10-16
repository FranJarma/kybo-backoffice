# Revisar resultado de órdenes de producción

Diseño autorizado en conversación: el encargado corrige el total producido y el total consumido por ingrediente; se registran únicamente diferencias, responsable, motivo y valores anteriores/nuevos. El empleado mantiene Comenzar/Terminar.

- Implementar revisión transaccional e idempotente, restringida a encargado y sucursal; bloqueo/revisión optimista de orden.
- Recuperar último resultado desde auditoría. Mantener receta y finalización originales. Devolver menor consumo a los lotes originales con su valor histórico proporcional; consumir extras por FEFO y disponibilidad libre. Artículos sin inventario solo afectan costo/auditoría.
- Ajustar cantidad del mismo lote producido y su valor mediante movimiento de valoración explícito (cantidad cero, acción production_review). Migración 0016 permite exclusivamente estos movimientos; nunca modificar movimientos anteriores.
- Bloquear revisiones si el lote de salida tuvo movimientos ajenos a esta orden, está reservado/bloqueado/vencido o su saldo no coincide. No propagar cambios retroactivos a ventas/transferencias/preparaciones.
- Permitir resultado cero como pérdida total, conservando lote y auditoría; cantidades negativas, componentes extra/duplicados y faltantes se rechazan.
- UI Revisar resultado en historial, cantidades actuales, diferencias, motivo, confirmación y toast; historia antes/después y costo actualizado.
- Verificar: diferencias positivas/negativas, revisión sucesiva/reintento, valoración con otros lotes, agua, falta de stock, permisos, concurrencia, uso posterior del lote, cero. Tipos/lint. Aplicar migración aditiva después de pruebas.

## Resultado
Implementado en Registro de producción → Historial → Revisar resultado, solo para encargados. Resultado vigente y comparaciones anterior/nuevo en el historial; cada revisión conserva la finalización original y sus autores. Los movimientos de devolución distinguen ingredientes devueltos de preparado producido.

Verificación: 33 pruebas aprobadas (8 casos de revisión, 1 renderizado, 24 regresiones de órdenes/merma/artículos sin stock). Tipos, lint y diff sin errores. Migración 0016 aplicada en desarrollo con historial/hash y función de validación comprobados. No se ejecutaron producciones reales de prueba. Comprobación visual con sesión autenticada pendiente. Sin commit/push ni cambios de .env.

Límite deliberado: no se corrige stock reservado, bloqueado, vencido, trasladado o usado posteriormente. También se bloquea cuando otro lote del mismo preparado ya tuvo salidas después de esta producción, porque su costo promedio ya se usó. La UI y el error explican que deben revisarse las operaciones posteriores; no hay recálculo retroactivo de ventas.
