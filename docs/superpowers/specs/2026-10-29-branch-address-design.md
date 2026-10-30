# Dirección y punto de la sucursal

El 29/10/2026 el usuario aprobó centralizar dirección y punto del mapa en Sucursales y ubicaciones para que Asistencia los use automáticamente. Dirección indicada como caso real: Alberdi 143, Salta Capital, Salta, Argentina. Se conserva la instrucción sin commit ni push.

## Diseño aprobado y decisiones de implementación

- La ficha de sucursal muestra la dirección y una acción para configurarla. Un único Autocomplete SearchCombobox permite buscar la dirección y elegir una coincidencia que incluye ciudad y provincia.
- Seleccionar un resultado muestra un mapa con el marcador. Es obligatorio confirmar que corresponde a la entrada del local antes de guardar. Cambiar dirección/punto invalida la confirmación. Latitud y longitud quedan en Ajuste avanzado.
- La dirección es un dato del local, distinto de las ubicaciones de inventario Barra/Cocina/Depósito. La selección administrativa no cambia la sucursal operativa.
- Asistencia muestra la dirección guardada, enlace a editarla y el radio/precisión de fichaje. Las coordenadas dejan de ser el formulario principal de Asistencia. Se conservan temporalmente los puntos anteriores hasta centralizarlos, sin inventar posiciones ni habilitar fichajes.
- Guardar un punto nuevo sincroniza en la misma transacción las coordenadas de una configuración de asistencia existente e incrementa su revisión. Configurar Asistencia siempre toma el punto central si existe, aunque el cliente intente enviar otro.
- Solo administradores reales vigentes pueden consultar/buscar/guardar direcciones. Guardado con revisión optimista, bloqueo por sucursal y auditoría de antes/después. No crear asistencia ni activar participantes/step-up por guardar una dirección.

## Persistencia y compatibilidad

Una tabla branch_addresses con una fila por sucursal contiene dirección legible, coordenadas confirmadas, fuente, revisión, persona e instante de confirmación. La migración 0031 es aditiva y no carga direcciones reales. Los endpoints detectan si falta la tabla y explican la activación pendiente; no se agregan columnas a branches que rompan consultas previas.

Aplicar 0031 en Neon requiere autorización específica posterior. Las pruebas usan únicamente bases descartables ya autorizadas. No modificar .env.

## Búsqueda y mapa

Decisión del implementador: Photon/Komoot para el pequeño volumen administrativo, con endpoint configurable del servidor, caché acotada, consultas compartidas, límite de frecuencia, timeout y atribución OpenStreetMap. No se usa el API público de Nominatim. Un mapa embebido OpenStreetMap evita instalar otra librería. La búsqueda no prueba presencia ni sustituye la validación GPS de cada fichaje.

Georef oficial fue la primera alternativa investigada, pero la consulta agotó 20 segundos. Photon respondió en la prueba real y devolvió tanto una dirección de General Güemes como Peatonal Juan Bautista Alberdi 143, Salta, Capital; por eso no se elige el primer resultado automáticamente. Las posiciones son aproximadas y se deben confirmar en el mapa.

Referencias consultadas:
- https://github.com/komoot/photon/blob/master/README.md
- https://github.com/komoot/photon/blob/master/docs/api-v1.md
- https://www.argentina.gob.ar/node/473623

## Criterios de aceptación

1. Buscar Alberdi 143, Salta; distinguir ciudades; elegir el resultado de Capital y ver su marcador sin guardar automáticamente.
2. Confirmación obligatoria que se invalida al modificar dirección o coordenadas; errores y carga de búsqueda visibles.
3. Aislar respuestas tardías entre búsquedas y sucursales y conservar valores ya guardados ante un fallo del proveedor.
4. Sin la 0031, la aplicación y Asistencia existentes siguen funcionando y muestran el estado pendiente de la dirección.
5. Guardar solo como administrador real; rechazar revocación, sucursal archivada, revisión vieja y coordenadas inválidas.
6. El punto central gobierna Asistencia; guardar un nuevo punto actualiza su revisión y coordenadas conjuntamente sin alterar radio, participantes ni habilitación.
7. Probar interfaz con teclado, escritorio y móvil, junto a los casos de servidor y proveedor. No consultar Photon en bucles de pruebas ni registrar datos reales en Neon.

## Entrega

Implementado y probado. El usuario autorizó y se aplicó únicamente0031 en Neon el29/10/2026, con tabla nueva vacía. No se cargó automáticamente la dirección real ni se alteró el punto de fichaje. Administración debe buscar y confirmar la entrada en el mapa antes de guardar. La autorización no se extiende a futuras migraciones. Sin commit ni push.
