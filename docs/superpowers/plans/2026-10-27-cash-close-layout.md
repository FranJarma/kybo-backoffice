# Cierre de caja: jerarquía de montos y espacio

Pedido: ampliar y dar aire al modal en escritorio; en celular, presentar el efectivo esperado por el sistema junto al monto a ingresar, al inicio del paso Efectivo.

Dirección: un bloque de comparación al inicio, con el importe esperado y el campo de efectivo contado. El desglose de movimientos pasa a ser información de apoyo y no repite el total. En escritorio, modal de hasta 1280 px, márgenes y columnas más amplios; en tablet/celular, orden de lectura continuo y controles accesibles.

- [x] Observar una prueba fallida que compruebe que ambos montos están visibles al abrir, también con poca altura disponible.
- [x] Reorganizar el paso Efectivo y ajustar exclusivamente sus estilos y el espacio general del cierre.
- [x] Verificar las vistas de celular, tablet y escritorio, conservar borradores/validaciones y revisar capturas.

Se mantienen los cálculos, permisos, comandos y registros existentes. No se necesitan migraciones ni movimientos reales para probarlo. Esta revisión visual queda local hasta una nueva indicación de publicación.

Resultado: modal de hasta 1280 px y márgenes/columnas más amplios; comparación al inicio con un único importe esperado y el campo de conteo destacado. En celular el esperado se muestra sobre el campo dentro del mismo bloque; el desglose queda como apoyo debajo del formulario. El conteo sigue vacío inicialmente y los importes no se copian automáticamente.

Verificación: prueba inicial fallida por ausencia de la comparación. Las cinco vistas nuevas (375×667, 390×520, 768×900, 1440×1000 y 1920×1080) muestran ambos montos completos al abrir y por encima del pie fijo; en escritorio se verifica el mayor ancho. La suite de interfaz de Caja completa aprobó sus **29 pruebas**, incluyendo borradores, conflictos, fotos y permisos. TypeScript, ESLint de los archivos afectados y `git diff --check`: correctos. Se inspeccionaron capturas de escritorio y celular, también con altura reducida. No se ejecutaron comandos financieros reales ni se hizo commit/push.

## Seguimiento del 28/10: foco del efectivo contado

Al abrir el cierre o volver al paso Efectivo, el campo de efectivo contado recibe el foco. Un borrador conserva su importe y lo selecciona para reemplazarlo al escribir. Los demás pasos conservan el foco en su encabezado y no se cambia el paso al retomar un borrador. El foco no se reasigna al editar otros campos. Con la reorganización posterior de Posnet, el cuerpo tiene desplazamiento propio y presenta su inicio al abrir o cambiar de paso.

Se observó primero la prueba fallida con el campo sin foco. Aprobaron seis pruebas de navegador: escritura directa en las cinco dimensiones anteriores y reapertura/navegación con borrador, incluyendo la edición de otro campo. TypeScript, ESLint y comprobación del diff aprobados. Sin nuevas operaciones financieras, commit ni push.
