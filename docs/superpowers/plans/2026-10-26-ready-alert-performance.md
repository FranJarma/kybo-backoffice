# Aviso sonoro y confirmación de preparación rápida

Pedido: un pip al marcar listo y reducir la demora de esa acción. El usuario confirmó que el sonido debe estar en Comandas y en la pantalla de clientes.

## Criterios

- Aviso corto y discreto, control visible para activar/silenciar. Actualización posterior solicitada por el usuario: habilitar por defecto y reintentar desde la primera interacción cuando el navegador lo requiera; ver `2026-10-26-default-ready-sound.md`.
- Comandas avisa después de confirmación real, nunca al enviar ni ante errores; pantalla pública avisa cuando el pedido completo pasa a listo. No repetir avisos por polling, reintentos, reconexión o primera carga con pedidos históricos.
- Medir SQL/tiempo de un pedido representativo antes de optimizar. Mantener consumo, reservas, valorización, auditoría, permisos e idempotencia en la misma transacción.
- Sin ventas o consumos ficticios en Neon, cambios de `.env`, migraciones, commit o push. Pruebas en PGlite descartable autorizadas previamente.

## Ejecución

1. Crear prueba descartable de dos bebidas con seis insumos compartidos. Medir «ready» y fijar un presupuesto de consultas, verificando stock y ausencia de consumo duplicado.
2. Agrupar el consumo reservado de la venta, evitando bloquear/releer/escribir los mismos registros por cada insumo y línea. Preservar el orden de valorización y el redondeo por movimiento.
3. En paralelo, incorporar audio compartido a las dos pantallas con pruebas de transiciones y de navegador con APIs simuladas. Esta tarea solo modifica componentes/ayudas de audio y sus pruebas; no modifica stock.
4. Verificar suites afectadas, tipos/lint, revisión independiente de cálculo/locks/estado y restricciones del navegador; registrar comparación y límites.
