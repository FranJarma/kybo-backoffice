# Resultado: preparaciones centrales y mínimos iniciales

- Las necesidades de un preparado se agrupan en Depósito (`DEPOSITO`) y se
  redondean a tandas completas de la receta vigente.
- Las órdenes previstas reducen nuevas sugerencias de producción, pero no suman
  stock disponible para traslados. El traslado aparece después de registrar la
  producción terminada y actualizar Operación del día.
- El encargado asigna y confirma la preparación desde el detalle. El comando
  vuelve a comprobar stock y órdenes bajo los bloqueos de inventario existentes.
- Se preservan las ubicaciones y documentos anteriores, los permisos del empleado,
  las revisiones, la auditoría y los reintentos sin duplicados.
- La actualización de una tarea desactualizada vuelve a calcular las necesidades
  conservando el motivo escrito.

## Activación autorizada

Se guardaron 26 reglas mediante el servicio auditado en la base Neon configurada.
La lectura posterior confirmó mínimos, objetivos y habilitación de cada regla.
Se generaron 27 tareas nuevas; las dos tareas previas se conservaron. La comparación
de saldos por lote, saldos por ubicación y movimientos confirmó stock intacto.
No se iniciaron producciones ni se confirmaron o despacharon traslados.

La leche de masa queda en Depósito (2,1 / 4,2 l) y la leche de bebidas en Barra
(16 / 32 l). El queso se separa entre masa en Depósito (0,55 / 1,1 kg) y relleno
en Cocina (2,6 / 5,2 kg). La tapioca cruda queda en Depósito (6 / 10 kg).
Son valores iniciales estimados; ajustarlos con ventas y consumo observados.

Las referencias de compras importadas por cobertura se reservan para la etapa de
compras anticipadas. No se cargan como objetivos retenidos de productos que deben
salir de Depósito, porque esos objetivos impedirían reponer Barra.
La planificación manual sigue permitiendo órdenes adicionales explícitas.

## Verificación

- 37 pruebas en 9 archivos focalizados, después de corregir los hallazgos de revisión.
- 4 pruebas de navegador: confirmación central y vistas de 600, 768 y 1024 px.
- Regresiones previas de asignaciones y revisión del resultado de producción verdes.
- Tipos, análisis estático, formato y comprobación del diff.
- Aplicación local: `/login` responde HTTP 200.

La revisión independiente detectó dos problemas importantes: doble cómputo de
traslados hacia Depósito y confirmación de sugerencias con abastecimiento nuevo.
Ambos tienen regresiones observadas fallar y luego pasar. No quedaron hallazgos
críticos, importantes ni menores diferidos.
