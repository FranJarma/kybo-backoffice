# Impresión de comandas — entrega de implementación

2 de noviembre de 2026 · rama `codex/order-ticket-printing`. El usuario autorizó commit y push después de validar la salida USB; la instalación y vinculación permanente del conector siguen pendientes.

## Funcionamiento

Al confirmar una comanda se guardan sus tickets dentro de la misma operación de la venta. El conector de Windows los retira por HTTPS y envía a la cola USB: un ticket para Barra y otro para Cocina cuando corresponda. El cobro no espera a la impresora. En mesas, cada comanda adicional genera sus tickets; el cobro posterior no vuelve a imprimirlos.

Cada ticket conserva productos, cantidades, grupo y opción de los modificadores, cantidad por unidad, instrucciones, observaciones, cliente y localizador del momento. Los combos imprimen sus componentes en la estación correspondiente, sin duplicar el padre comercial ni multiplicar otra vez las cantidades. Un producto sin estación genera un ticket «REVISAR ESTACIÓN» y mantiene un aviso en caja.

Desde el detalle de venta se puede consultar cada ticket y solicitar una copia de una estación con motivo obligatorio. Se identifica como COPIA y conserva el contenido vendido, aunque luego cambie el catálogo. Los cambios explícitos de localizador y las anulaciones generan avisos separados. Las consultas históricas están identificadas como «NO PREPARAR» y requieren encargado o administrador.

En Configuración → Impresión, administración guarda la cola exacta de Windows, descarga el instalador, genera un código de vinculación de un uso y revisa o revoca el conector. El puesto compartido puede consultar y reimprimir tickets de ventas de su sucursal; no modifica la configuración.

## Recuperación y seguridad

- «Enviado a Windows» confirma aceptación por Windows, no salida física del papel.
- Cada envío tiene identidad y registro durable. Una respuesta perdida repite la consulta con la misma identidad, sin generar otra copia.
- Ante una salida incierta no se reenvía a ciegas. Las copias esperan que los intentos anteriores ya no puedan salir de la cola de Windows, incluidos los descartados en Kybo.
- El encargado puede confirmar que retiró un trabajo de Windows sin declarar falsamente que salió en papel. La acción es explícita y auditada; descartarlo en Kybo sin esa confirmación no habilita una copia.
- La versión de configuración observada queda guardada por trabajo. Un cambio de configuración retiene los anteriores para revisión; una transacción concurrente con versión anterior tampoco puede enviarlos a otra impresora.
- Trabajos demorados o con preparación iniciada quedan retenidos. No se descarga automáticamente una tanda de pedidos viejos al reconectar.
- La credencial técnica se guarda como hash en servidor y protegida para el usuario de Windows en la PC. No se abre un puerto público hacia la impresora.

## Verificación

- 50 pruebas enfocadas de impresión y navegación: documentos, cola, permisos, compatibilidad sin migración, ventas reales y combo entre estaciones, copias e idempotencia.
- 3 pruebas de navegador sobre la app real y base descartable: respuesta perdida sin copia duplicada, permisos del puesto, instalador y disposición de pantalla.
- 28 pruebas adicionales del modelo actual de preparación, entrega, localizadores y combos. Dos suites antiguas (`sales.test.ts`, `preparation.test.ts`) no llegan a ejecutar sus casos: su fixture anterior se detiene en la conciliación de la transición de inventario. No se afirma que la suite completa del repositorio esté verde.
- TypeScript, lint de los archivos modificados, compilación de producción y trazado de los cuatro recursos del instalador verificados. La compilación sin conexión a base emite un aviso de `DATABASE_URL` desde la página existente de cambio de contraseña; finaliza correctamente.
- Cuatro scripts de Windows PowerShell 5.1 verifican con adaptadores simulados el envío, recuperación, respuesta perdida, bloqueo entre procesos, HTTP UTF-8 y rasterización Unicode/logo a 384/512/576 puntos. No instalan tareas ni imprimen.
- Revisión independiente del conector y del conjunto. Los hallazgos importantes se reprodujeron y corrigieron con regresiones: copias descartadas aún presentes en Windows, cambios de localizador de ida y vuelta, y configuración concurrente.
- Comprobación visual del detalle en 1440/768/390/320 px y configuración en escritorio/celular. Capturas fuera del repositorio.

La documentación oficial de la [Hasar P-HAS-181](https://compania.grupohasar.com/producto/p-has-181/) confirma USB y compatibilidad ESC/POS. Esto no sustituye la prueba con la impresora y su controlador instalados.

## Activación

1. **Completado el 2/11/2026:** el usuario autorizó la `0035_order_printing` en Neon. Se verificó la 0034 previa, se aplicó únicamente la 0035 en una transacción y se confirmó desde una conexión nueva su registro y las seis tablas vacías. No se movió stock, registraron ventas ni habilitó automáticamente la impresión.
2. Hacer merge de esta rama y publicar los cambios en la app. El usuario autorizó commit y push de la rama; la publicación de la versión y la vinculación permanente del conector son los siguientes pasos.
3. **Cola localizada y validada en esta PC:** `Impresora1`, controlador `Generic / Text Only`, puerto `USB002`, procesador `winprint`, tipo `RAW`, ancho 576 puntos. La búsqueda inicial por nombre «Hasar» no la identificaba. El usuario confirmó la salida correcta; usar ese nombre exacto en Configuración → Impresión. No fue necesario cambiar el controlador para estas pruebas.
4. Descargar e instalar el conector en la cuenta de Windows que se usará en caja y vincularlo con el código generado por Kybo. Su inicio automático es al iniciar sesión con esa cuenta.
5. **Prueba física confirmada por el usuario el 2/11:** se enviaron dos documentos sintéticos marcados PRUEBA · NO PREPARAR, uno de Barra y otro de Cocina. Windows aceptó los trabajos 2 y 3 y una consulta posterior encontró la cola vacía. A la consulta por ambos tickets, logo, modificadores y corte, el usuario respondió: «Listo, salieron bien». Todavía falta validar con el conector completo la falta de papel/desconexión, reinicio y reimpresión antes de uso operativo.

La 0035 está aplicada en Neon. El usuario confirmó la salida correcta de las dos pruebas USB en esta PC. Sigue pendiente instalar/vincular el conector completo: no se registraron tareas de Windows ni se habilitó la impresión automática del negocio. El instalador ya está empaquetado en el área temporal de este trabajo, sin ejecutar. La comprobación de solo lectura de `https://kybo-backoffice.vercel.app/api/printing/connector` devuelve 404: primero deben publicarse los cambios de esta rama. El usuario autorizó commit y push; el merge y la publicación de la app quedan pendientes. La conexión de Neon se leyó en memoria desde la configuración del proyecto, sin copiar ni modificar el `.env` ni exponer credenciales. No se probó concurrencia con múltiples conexiones PostgreSQL reales; se verificaron invariantes, bloqueos y los casos reproducibles en la base descartable. El estado de papel del driver puede ser desconocido: la interfaz lo informa sin presumir que haya salido el ticket. Los diarios locales conservan los trabajos reconocidos; una futura política de archivo puede reducir su costo de lectura a largo plazo. La pantalla consulta hasta 100 trabajos por vez; los registros anteriores se conservan en la base.
