# Revisión final de ventas — 25/09/2026

Revisión independiente, de solo lectura, de `8a348d4..02e6db0`. Se revisaron especificación, plan, esquema/migración, transacciones, servicios, permisos, API, interfaz, recuperación y pruebas.

## Resultado

Sin hallazgos críticos ni importantes. Adecuado para el incremento local documentado, con dos menores pendientes. Las escrituras conservan protección por revisión, restricciones e idempotencia; el resultado no acredita el reemplazo operativo de Fudo.

## Menores diferidos

1. **Instantánea de un reintento concurrente.** Las ramas de reintento de create/addOrder/pay/cancel construyen el detalle antes de bloquear la venta, dentro de una transacción READ COMMITTED. Si un segundo equipo termina de cobrar entre la consulta de cabecera y la de pagos, la respuesta podría combinar saldo/estado anterior con pagos nuevos. Las escrituras posteriores siguen rechazando revisiones obsoletas y no duplican el cobro registrado. El GET del detalle usa REPEATABLE READ y permite consultar una instantánea coherente. Pendiente: bloquear la venta al recuperar un resultado o usar una lectura coherente equivalente. Validar con múltiples conexiones antes de habilitar operación real simultánea.
2. **Tamaño máximo de pedido.** La validación permite 50 renglones con 500 caracteres de observaciones y 240 de motivo de precio por renglón; algunas combinaciones válidas superan el límite HTTP compartido de 20.000 bytes. Se rechazan con 413 sin guardar ni perder el borrador de pantalla. Pendiente: alinear un límite agregado visible o un límite HTTP acotado al esquema. Hasta entonces, acortar las observaciones de pedidos excepcionalmente largos.

La clasificación se mantiene por su efecto en este incremento: el primer caso no altera la integridad de las escrituras pero puede confundir la lectura, y el segundo impide confirmar un pedido extremo sin truncar/guardar silenciosamente datos. Ambos deben resolverse antes de considerar habilitado el circuito operativo completo.

## Fuera de esta revisión

- Publicación a cocina, reservas/consumo de stock, procesamiento de pagos, integraciones, emisión fiscal, offline, tiempos y despliegue: alcance expresamente aplazado.
- Intercalados reales de Neon y equipamiento del local: requieren validación al integrar; solo se analizó estáticamente la estrategia de transacciones.
- Apariencia de capturas y repetición independiente de pruebas/build: verificados por el implementador en la sesión, no repetidos por el revisor.
