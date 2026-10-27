# Compras unificada y tareas claras

Propuesta visual aprobada el 23/10/2026 con la instrucción «Aplicá la propuesta de Compras unificada, con anticipación por insumo y el nuevo diseño de las tareas». Referencia local: `.superpowers/brainstorm/1568-1792794065/content/compras-unificadas-v2.html`.

## Objetivo

El encargado debe poder reconocer qué comprar, preparar un pedido con las cantidades propuestas y seguir sus entregas desde Compras. Las tareas muestran primero qué hacer; los cálculos se consultan a demanda.

## Enfoque

Se integra la configuración y previsión existentes en Compras. Mantener un módulo por país duplicaría el circuito; rehacer compras perdería recepción parcial, lotes, costos e idempotencia ya implementados. Se reutilizan esos servicios y las reglas actuales de cada insumo y sucursal, incluidos los ocho valores de Bolivia (7 días + 3 de margen, objetivo 17). No requiere migración ni carga de datos.

## Pantallas

- Compras: encabezado único y pestañas «Para comprar», «Pedidos» (incluye borradores y pedidos en camino) y «Recepciones». Necesidades ordenadas por urgencia; filtros, búsqueda, disponible, ya pedido y cantidad sugerida; selección múltiple y «Preparar pedido».
- Un pedido preparado sigue siendo borrador hasta confirmarlo. La selección precarga cantidades base exactas, nunca las interpreta como presentaciones. No se elige proveedor automáticamente ni se crea un pedido por navegar. Los pedidos confirmados y las recepciones parciales siguen usando los servicios vigentes.
- Insumo: pestaña «Reposición y compras», solo para encargado/administrador. Plazo, margen, consumo estimado y objetivo con unidades explícitas y explicación de la anticipación. Permite activar/desactivar avisos y conserva control de revisión/reintentos. Configuración para la sucursal actual; la recepción de compras sigue siendo independiente de mínimos por ubicación.
- Tarea: panel lateral adaptable con cantidad, urgencia, fecha comprensible, disponible/pedido/cobertura cuando existen datos de previsión. «Ver cómo se calcula» cerrado inicialmente. Responsable y bloqueo secundarios. Una compra sugerida prepara pedido; una compra vinculada abre el pedido existente. Cancelar un pedido se hace en Compras. Se conservan todas las acciones de preparación y traslados y su protección frente a estado desactualizado.
- Menú: recomendación adoptada por criterio de diseño: sección «Negocio», primero «Inicio», después «Operación del día». Mantener resumen y ejecución separados; no agregar pantallas sin contenido. Se mantienen los permisos actuales (personal sin Inicio). Desaparece el acceso separado «Compras de Bolivia»; la ruta anterior redirige a Compras.

## Restricciones y verificación

Naranja/azul Kybo, superficies claras, controles de al menos 44 px y lectura en 600/768/1024 px. Evitar `bg-muted`: el token actual es un color de texto. Reutilizar tipografía y logo de la aplicación. No parsear párrafos para deducir métricas: exponer datos estructurados desde la lectura de tareas. Historial y tareas sin estimación deben conservar información honesta, sin ceros inventados ni compras duplicadas.

No modificar `.env`, aplicar migraciones, crear compras de demostración ni mover stock real. Trabajar en la rama actual que sirve la app local, sin commit ni push en esta iteración. Probar solo sobre base descartable autorizada y respuestas ficticias para UI. Revisar permisos, cantidades decimales/unidades enteras, enlaces a documentos, errores/reintentos y recepción parcial.
