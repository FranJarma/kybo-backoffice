# Toma de pedidos rápida y coherente

El usuario define el flujo: Autocomplete compartido para clientes, sin modal ni búsqueda separada de un select; email opcional para clientes nuevos; localizador automático junto al cliente; grupos visibles «Lugar de consumo», «Forma de consumo» y «Acciones»; coherencia de colores Kybo.

## Diseño

- Lugar de consumo: Mostrador / Mesa / Delivery, con iconos y el mismo estado seleccionado naranja.
- Forma de consumo: Para llevar / En el local para Mostrador; En el local para Mesa; entrega o retiro para Delivery, conservando las reglas actuales.
- Acciones: cliente mediante `SearchCombobox` y localizador en una fila adaptable. Nombre nuevo y email opcional se editan en línea. Escribir un nombre no coincidente y salir del campo basta; también se puede elegir o confirmar con Enter.
- El cliente nuevo se registra dentro de la transacción del pedido, evitando otro envío y clientes huérfanos si el cobro falla. Sin nombre sigue siendo cliente ocasional. Se reutiliza una coincidencia exacta de nombre/contacto; no se modifica una ficha existente ni se confunden homónimos con emails diferentes.
- Se muestra el primer localizador disponible como vista previa y se asigna uno realmente libre al guardar. No se reserva un equipo por cada carrito abandonado. Permitir «Cambiar» para elegir uno concreto y volver a automático. Si todos están ocupados: «Sin localizadores disponibles».
- Naranja: selección o asignación activa; azul: foco y enlaces; controles vacíos blancos y bordes coherentes. Botones de al menos 44 px; el catálogo y el pedido conservan desplazamiento propio en tablet.

## Alternativas y decisiones de implementación

El usuario ya eligió Autocomplete en línea y automatización frente al modal. Se reutilizan los componentes existentes. Crear el cliente en cada pulsación provocaría registros incompletos y peticiones extra; guardarlo con el pedido satisface la creación automática y la rapidez. El número mostrado es una vista previa: el servidor resuelve la disponibilidad en la misma transacción, con la restricción única existente y reintentos si otro operador gana el equipo.

No cambiar esquema, aplicar migraciones, modificar `.env`, registrar ventas ficticias en Neon, hacer commit o push. Conservar selección manual y las APIs anteriores para historial, devoluciones e idempotencia.
