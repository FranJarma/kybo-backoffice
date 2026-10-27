# Resultado: confirmación de cobro

## Resultado medido

Para un pedido de dos bebidas con seis insumos controlados compartidos, efectivo y localizador:

| Medida | Antes | Después |
| --- | ---: | ---: |
| Sentencias SQL del servicio | 309 | 49 |
| Tiempo con 59 ms simulados por sentencia | 20.337 ms | 3.547–3.633 ms |

Reducción de consultas: 84,1 %. La latencia de referencia se midió con siete `SELECT 1` de solo lectura en Neon: primer acceso 476 ms y accesos calientes 58–61 ms (mediana 59 ms).

Los tiempos del cuadro son de una prueba controlada en PGlite con datos ficticios y demora añadida en el logger, **no un cobro real ni una medición de extremo a extremo del navegador**. No incluyen autenticación HTTP, compilación de Next, adquisición de conexión o contención entre conexiones independientes. El código anterior se cargó desde HEAD en memoria mediante una configuración de Vitest descartable, conservando la obligación vigente de seleccionar localizador. Falló deliberadamente el presupuesto de 50 sentencias con 309; la implementación actual lo cumple.

La mejora elimina la espera excesiva causada por viajes repetidos, pero no alcanza todavía una confirmación inferior a un segundo con la conexión remota actual desde localhost. No presentar el resultado como inmediato o garantizado en producción.

## Cambios

- Bloqueos y disponibilidad por conjunto de insumos/ubicaciones, con orden determinista.
- Reserva del pedido completo, manteniendo documento y reserva independientes por línea, asignación por vencimiento y actualización conjunta de contadores.
- Reutilización de la composición validada y carga de la receta sin consultar datos de edición e historial innecesarios.
- Catálogo leído en conjunto, **después** de adquirir el bloqueo de los productos en otra sentencia para evitar precios o versiones anteriores al desbloqueo.
- Respuesta de alta construida con `INSERT RETURNING`, usando el mismo serializador que el historial y los reintentos. Cobros divididos ordenados de forma consistente.
- Permisos consultados después del bloqueo de sucursal; sin cachés de autorización o stock entre pedidos.
- El bloqueo global del grafo de recetas se conserva; esta modificación no elimina esa posible fuente de contención.

## Verificación

- 75 pruebas en 16 archivos: cobros, IVA, combos, localizadores, faltantes, lotes compartidos, anulaciones, idempotencia, permisos, traslados, recepciones y preparaciones centrales.
- 7 pruebas de interfaz del punto de venta con APIs simuladas.
- TypeScript y ESLint de todos los archivos modificados: correctos.
- Revisión independiente: detectó el problema de instantánea al unir precio y bloqueo, ya corregido; también se corrigió el orden de los cobros divididos y se agregó cobertura de lotes compartidos y liberación.
- Concurrencia PostgreSQL revisada estáticamente; no probada con sesiones independientes de PostgreSQL. PGlite no demuestra ese comportamiento.

Registros descartables en `.next-e2e/checkout-{final-tests,ui-final,types-final,lint-final,profile-baseline,profile-final,profile-green}.log`. Después de medir el código anterior se volvió a ejecutar la implementación actual: 49 consultas y presupuesto de rendimiento correcto.

Sin migraciones, cambios de `.env`, ventas o movimientos de prueba en Neon, commit ni push. Se conservaron los cambios anteriores del usuario.
