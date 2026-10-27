# Resultado: aviso sonoro y confirmación de preparación

## Comportamiento

- Comandas y pantalla de clientes tienen un control visible «Activar sonido» / «Silenciar sonido». Actualización solicitada por el usuario el 26/10: el sonido se intenta habilitar por defecto al abrir ambas pantallas. Si el navegador exige interacción, el primer clic/toque o tecla reintenta la activación automáticamente; el control también permite activarlo explícitamente. Solo se muestra habilitado cuando Web Audio está funcionando. Silenciarlo se respeta durante la apertura actual. Ver [ajuste de activación](2026-10-26-default-ready-sound.md).
- Aviso discreto de 180 ms. En Comandas suena al confirmar realmente una tarea lista, incluida una transición detectada en la actualización de la cola. En la pantalla de clientes suena cuando el pedido completo aparece listo.
- La pantalla pública conserva su consulta periódica cada cinco segundos; puede existir esa demora adicional para detectar el cambio.
- La primera carga, las páginas históricas, los filtros, los reintentos y la reconexión no repiten avisos. Activar el sonido no reproduce avisos pendientes. Bloqueos o falta de soporte del navegador se informan junto al control.
- La tarjeta de Comandas incorpora la respuesta confirmada sin esperar otra consulta. La cola se refresca en segundo plano y mantiene bloqueadas las acciones hasta recuperar una versión vigente.

## Rendimiento

Pedido representativo: dos bebidas de receta con seis insumos controlados compartidos.

| Medida del servicio al marcar listo | Antes | Después |
| --- | ---: | ---: |
| Sentencias SQL | 230 | 49 |
| Tiempo con 62 ms simulados por sentencia | 16.274 ms | 3.531 ms |

Se eliminaron 181 consultas (78,7 %), agrupando bloqueos, consumo de reservas, actualizaciones y movimientos. Cada movimiento conserva su valorización y redondeo en el orden original; stock, reservas, eventos y estado continúan dentro de una misma transacción.

La latencia de referencia se obtuvo con `SELECT 1` de solo lectura en Neon: primer acceso 512 ms, siguientes 62–63 ms, mediana 62 ms. La comparación de la tabla usa PGlite descartable con espera añadida por sentencia; no es una medición de una venta real ni de extremo a extremo del navegador. No incluye autenticación HTTP, compilación, adquisición de conexión o contención entre sesiones. El código anterior se cargó desde HEAD mediante una configuración de prueba descartable y falló deliberadamente el presupuesto de 60 consultas. La implementación actual cumple ese presupuesto.

La conexión remota actual todavía aporta varios segundos: este resultado no garantiza una confirmación inferior a un segundo.

## Verificación

- 67 pruebas en 12 archivos: sonido, deduplicación, activación, reintentos, confirmación visual, pedidos, stock, combos, cobros y cantidades. Incluyen preparación parcial, valorización desconocida, redondeo por movimiento y rollback ante un lote bloqueado.
- 20 pruebas de navegador con respuestas simuladas: ambas pantallas, activación/silencio, errores, reconexión, confirmaciones pendientes, reintentos y regresiones del punto de venta. La pantalla pública real se abrió con su API simulada y se verificó sin desbordamiento horizontal.
- TypeScript y ESLint de los archivos de esta tarea: correctos. `git diff --check`: correcto.
- Revisión independiente de consumo, bloqueos y actualización de tarjeta: sin hallazgos críticos o importantes. Se corrigió un contador de tareas entregadas dentro de la lista activa y se probó la recuperación si el navegador deja pendiente la activación del audio.
- Concurrencia PostgreSQL revisada estáticamente; no se probó contención con conexiones independientes. El audio se comprobó mediante Web Audio simulado, sin verificar parlantes físicos.

Registros locales descartables: `.next-e2e/ready-final-vitest.log`, `ready-final-browser.log`, `ready-types-final.log`, `ready-lint-final.log`, `ready-profile-baseline.log` y `ready-profile-after.log`.

Sin migraciones, cambios de `.env`, ventas o movimientos ficticios en Neon, commit ni push. Se conservaron los cambios anteriores.
