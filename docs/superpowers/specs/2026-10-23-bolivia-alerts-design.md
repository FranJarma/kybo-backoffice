# Alertas de compra de Bolivia

Continuación del diseño de Operación del día aprobado: avisar al encargado con
7 días corridos de plazo y 3 de margen, ordenando crítica (cobertura ≤7), alta
(>7 y ≤10) y programada (>10). Objetivo inicial: 17 días.

## Enfoque

Políticas de compra por sucursal/artículo, independientes de los mínimos por
ubicación. Usar mínimos retenidos en Depósito impediría traslados; el módulo
completo de pedidos y recepciones parciales excede esta entrega de alertas.
Reutilizar tareas y recepción existentes, con un cálculo puro y estimaciones
manuales editables. No inferir proveedores, packs, pedidos ni consumo histórico.

El stock utilizable suma todas las ubicaciones activas de la sucursal, excluye
vencidos/bloqueados y reservas de consumo, y conserva las reservas de traslados
internos dentro de esa misma sucursal. Proyectar FEFO por día para detectar
vencimientos anteriores al consumo. Una estimación vacía se muestra incompleta;
cero explícito significa sin consumo estimado. Ninguno equivale a cobertura infinita.

Mostrar disponible, consumo estimado por día, cobertura aproximada, fecha de
trámite, cantidad sugerida en unidad base y fuente manual. Cantidad: faltante para
atender 17 días con stock utilizable antes de vencer. No descontar pedidos aún
no recibidos: recordar revisar trámites pendientes antes de comprar.

Una necesidad de compra por artículo reemplaza compras genéricas por ubicación
cuando tiene estimación positiva; no altera traslados o producción. Reconciliar
sin duplicados, conservar responsable y actualizar urgencia, fecha y cantidad.
Stock suficiente para el objetivo no requiere tarea; la configuración muestra
su cobertura. Las programadas aparecen cuando hay faltante al objetivo pero
todavía no se alcanzó el umbral de 10 días.

## Configuración y activación

Pantalla de Inventario accesible solo al encargado/administrador. Ocho reglas
iniciales explícitas: vasos y sorbetes 150 unid./día cada uno; cinco sabores de
perlas explosivas 421,052632 g/día cada uno; tapioca cruda 560,407229 g/día.
Valores estimados de la conversación y recetas, revisables con consumo real.

Migración aditiva 0026: políticas, sin modificar stock. Preparar y probar en
memoria; pedir autorización específica antes de aplicarla en Neon conforme al
protocolo del proyecto. Mientras falta activación, el tablero existente funciona
y comunica que esta función está pendiente. No enviar pedidos ni registrar pagos.
