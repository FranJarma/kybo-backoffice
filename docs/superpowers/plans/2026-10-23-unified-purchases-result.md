# Compras unificada — resultado

Implementado en el checkout local `codex/order-pickup`, sin commit ni push. Se mantuvieron los servicios de compras y recepciones, las tablas existentes y la configuración cargada. No hubo migraciones, cambios a `.env`, compras de muestra ni movimientos de stock real.

## Uso

- Inventario y compras → Compras: Para comprar / Pedidos / Recepciones. Las necesidades muestran disponible, ya pedido, cantidad sugerida y cuándo comprar; se pueden seleccionar varios insumos para un borrador.
- Catálogo de inventario → Editar insumo → Reposición y compras: anticipación, margen, consumo manual y objetivo para la sucursal seleccionada. Solo encargado/administrador; el permiso de catálogo del personal no habilita esta sección.
- Operación del día: tareas con superficies claras, unidades legibles, fecha de sucursal y panel lateral con detalles desplegables. Las compras sugeridas preparan un pedido; las vinculadas abren el existente.
- Menú Negocio: Inicio primero, Operación del día después. Se conservan resumen y ejecución separados. La ruta antigua de alertas redirige a Compras.

## Decisiones y revisión

La orden puede contener borradores, por eso la pestaña se llama «Pedidos». Los enlaces de una sugerencia vuelven a consultar la previsión vigente antes de precargar; navegar no crea compras. Si cambia el insumo o la presentación se exige revisar la cantidad; una cantidad de unidades nunca pasa a significar cajas automáticamente.

Una revisión fresca detectó tres casos corregidos con pruebas RED → GREEN: recepción directa tras fallar la lectura, respuesta lenta que podía reemplazar otro borrador y cambio de presentación de una precarga. También se verificó la fecha en tareas de recepción sin cantidad y el enlace al documento correcto. No quedaron hallazgos importantes pendientes.

Se mantuvo el checkout actual para reflejar el cambio en la app local. Las reglas comerciales anteriores se conservaron, no se recalibraron; la verificación de operaciones reales queda para el usuario. No se inició un proceso de merge ni publicación.

## Verificación

- Vitest afectado: 10 archivos, **61 pruebas aprobadas**, con PGlite descartable autorizado. Incluye previsión, permisos HTTP, navegación, comandos, preparación central y pedidos/recepciones.
- Playwright: **15 pruebas aprobadas**, datos ficticios, 600/768/1024 px. Incluye formulario de configuración separado del catálogo y oculto al personal, precarga exacta, protección frente a respuestas lentas/lectura fallida, cambio a caja, recepción parcial y tareas.
- TypeScript y compilación de producción webpack: aprobados; **68 páginas**. Salida de verificación en `.next-e2e/unified-purchases-build`.
- ESLint de archivos tocados: sin errores ni advertencias; formato y `git diff --check` correctos.
- App local: `/login` respondió HTTP 200. Se solicitó abrir `/inventory/purchases` en el panel de Codex.

Logs de verificación en `.next-e2e/unified-purchases-unit-final.log`, `.next-e2e/unified-ui-final.log`, `.next-e2e/unified-build.log` y `.next-e2e/unified-lint.log`. No se ejecutó la suite histórica completa en esta iteración: la corrida anterior tenía fallos ajenos documentados en el resultado de pedidos a proveedores.
