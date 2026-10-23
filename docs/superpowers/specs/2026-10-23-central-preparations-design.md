# Preparaciones centrales y mínimos iniciales

## Resultado acordado

Operación del día prepara en la ubicación activa `DEPOSITO` de la sucursal.
Agrupa por preparado las necesidades de Barra y Cocina, descuenta las órdenes
pendientes y redondea a tandas completas de la receta vigente. Solo propone
trasladar existencias físicas disponibles; una producción pendiente no es stock.
Al finalizar la producción, la siguiente actualización propone la reposición.

El encargado asigna y confirma la sugerencia como una orden programada real.
Se conservan permisos, revisión, auditoría e idempotencia de las órdenes actuales.
Las órdenes antiguas conservan su ubicación. Sin Depósito configurado se muestra
una sugerencia bloqueada por configuración, sin producir en otra ubicación.

## Activación

Cargar mediante el servicio auditado los mínimos y objetivos acordados, tomando
las recetas vigentes y las estimaciones del usuario como base inicial. Separar
queso de relleno (Cocina) y masa (Depósito), y leche de bebidas (Barra) y masa
(Depósito). La tapioca cruda se conserva en Depósito; la cocida se repone a Barra.
Los umbrales de compras anticipadas de importados no deben bloquear los traslados:
quedan como referencias para la siguiente etapa de compras por cobertura.

No crear existencias, ejecutar preparaciones ni despachar traslados en la base
configurada. No modificar el entorno ni aplicar migraciones nuevas.

## Evidencia requerida

Pruebas de presupuesto compartido, producción central agregada, tandas completas,
órdenes pendientes, permisos y ciclo preparar/finalizar/reponer. Verificación
visual del detalle y consulta posterior de políticas y tareas en Neon.
