# Requisitos visibles en los formularios

Pedido: revisar los formularios de la aplicación para reconocer antes de enviar cuáles datos son obligatorios y cuáles opcionales; en especial foto y datos del lote en Caja.

Convención: reutilizar FieldCaption/Label con asterisco para obligatorio y sufijo «(opcional)» para campos de carga que admiten ausencia. Conservar nombres accesibles y asociaciones existentes. La semántica required/aria-required debe seguir las validaciones actuales y sus condiciones, sin convertir valores desconocidos o valores por defecto en nuevos requisitos. Los filtros, interruptores y datos de consulta no se tratan como campos de carga obligatorios.

Auditoría por áreas:

- [x] Componentes compartidos, catálogo, acceso, Caja y gastos mensuales (agente principal).
- [x] Ventas, localizadores y Operación del día (required_sales).
- [x] Inventario, compras y proveedores de insumos (required_inventory).
- [x] Productos, recetas, producción, preparación, modificadores, sucursales y usuarios (required_configuration).
- [x] Revisar integración y verificar los requisitos condicionales y la alternativa de foto desde cámara/galería.

Se conservan los cambios visuales locales de Caja. Sin commit/push, cambios de esquema ni operaciones reales.

Decisiones de integración:

- La foto es un único requisito que puede satisfacerse desde cámara o galería. Se anuncia como obligatoria antes de cargarla; no se impone `required` nativo a ambos inputs de archivo porque son alternativas y el archivo queda guardado en el estado del borrador.
- Los motivos de diferencias, lote pendiente, cambios de precio y otras excepciones se señalan cuando corresponden. Los campos que permiten valores pendientes o vacíos conservan ese comportamiento.
- Los campos para agregar una línea de traslado se señalan como requisitos de esa acción, sin impedir confirmar un borrador ya cargado cuando el editor de la próxima línea está vacío.
- Los nombres accesibles se conservan. Las pruebas de compras y asignación de tareas usan roles y nombres accesibles, evitando depender del texto decorativo del asterisco o del sufijo opcional.
- Revisión independiente de los diffs y validadores: sin observaciones bloqueantes.

Verificación final:

- `pnpm typecheck` y `pnpm lint`: aprobados. ESLint adicional de las tres pruebas adaptadas: aprobado.
- 36 pruebas de componentes y validaciones en 10 archivos: aprobadas (`form-requirements-unit-final.log`).
- 35 casos de Caja aprobados en el primer grupo de navegador, incluidos requisitos visibles, motivos condicionales, foto alternativa, foco, borrador y disposición responsive (`form-requirements-browser-final.log`). Se interrumpió la ejecución de las otras áreas al detectar selectores de pruebas que dependían del texto decorativo de las etiquetas.
- Después de adaptar esos selectores a roles y nombres accesibles, los otros 37 casos de cobros, compras, tareas, reposición y traslados aprobaron completos (`form-requirements-browser-other-final.log`). Total: 72 casos de interfaz aprobados sobre el código final; no se repitieron los 35 de Caja porque no hubo cambios posteriores en esa implementación.
- Capturas de Caja revisadas en 390 y 1366 px: los requisitos se distinguen y las etiquetas caben. Traslados verifica confirmación de borradores con editor vacío, motivos y destinos condicionales.
- `git diff --check`: limpio. HEAD `7595c02`, nada preparado para commit.

Los servicios de navegador y la carga de imágenes se simularon. No se aplicaron migraciones ni se modificó Neon, `.env`, stock, cobros o comprobantes reales. Los registros de prueba locales quedan en `.superpowers/cash-implementation/`, ignorado por Git.
