# Entorno de jornada manual

**Objetivo:** dejar una copia utilizable de la aplicación y un recorrido manual completo sin consultar ni modificar Neon, usuarios reales, Blob o la impresora del local. Playwright queda fuera de esta etapa. Sin commit ni push.

**Actualización del 10 de noviembre:** el usuario autorizó commit y push de estas herramientas junto con el login y la recuperación por correo desactivada. Los resultados siguientes conservan la referencia del ensayo preparado inicialmente.

**Decisión:** reutilizar PGlite y la transición de datos ya probada del repositorio. Crear una base persistente nueva por ensayo bajo `.local/manual-day`, con marcador de propiedad, cuentas ficticias y saldos conocidos. Ejecutar una instantánea de la versión publicada en `127.0.0.1:3100`, con dependencias compartidas pero configuración y compilación propias. La aplicación real en `localhost:3000` permanece intacta.

**Aislamiento:** no cargar archivos `.env`; construir el entorno del proceso con una lista permitida de variables del sistema y secretos nuevos. Rechazar conexiones PostgreSQL, rutas ajenas y carpetas sin marcador. Usar un adaptador de fotos a disco únicamente en la configuración de la instantánea; no modificar el proveedor de producción. No vincular conectores de impresión reales. No borrar ni reinicializar ensayos al arrancar.

**Alternativas descartadas:** reutilizar la base configurada no cumple el aislamiento. Un entorno remoto independiente permite probar el celular, pero requiere preparar HTTPS y servicios separados; no es necesario para empezar el circuito operativo local.

- [x] Crear y verificar guardas de aislamiento y almacenamiento local de comprobantes.
- [x] Preparar instantánea, cuentas por rol, ubicaciones, recetas, proveedores, mínimos, turnos, medios de pago y mesa ficticios. Mantener ventas, caja y pedidos de compra sin movimientos iniciales.
- [x] Dejar comandos de preparación, arranque y parada que solo afecten al ensayo identificado.
- [x] Levantar la copia y comprobar ingreso, lectura de configuración y saldos sin ejecutar la jornada manual.
- [x] Entregar checklist cronológico, importes esperados, control de inventario y registro de incidencias. Separar las verificaciones de celular/HTTPS, impresora física y concurrencia PostgreSQL.

**Criterios:** credenciales reales ausentes del proceso; base vacía exigida antes del sembrado; servidor enlazado a loopback; archivos del ensayo fuera del índice Git; fotos conservadas solo dentro del ensayo; parada por identidad del proceso y sus descendientes; compilación y configuración de la copia real sin cambios.

## Resultado de preparación

- Ensayo activo: `.local/manual-day/20261105-173933-adc690ff`; aplicación en `http://127.0.0.1:3100`, versión `c7551a8`. Accesos en su `ACCESOS.md`; comprobante sintético en `COMPROBANTE-FICTICIO.png`.
- 23 comprobaciones HTTP autenticadas aprobadas: cinco cuentas ficticias, permisos, saldos, ausencia de compras/caja abierta, pantallas operativas, pantalla pública y selección del adaptador local de fotos. Un upload con jornada inexistente fue rechazado antes de crear un comprobante. No se ejecutó la jornada ni se registraron ventas, compras, gastos o apertura de caja.
- Cuatro pruebas unitarias de aislamiento aprobadas. Tres casos simulados verifican selección de árbol de procesos y reutilización de PID. Revisión independiente cerró el hallazgo de parada; se compara creación y se fija el proceso antes de detenerlo.
- Se comprobó parada/reinicio de la misma base. Preparar un ensayo en un puerto ocupado se rechaza sin crear carpetas ni cambiar el ensayo activo. Una configuración con conexión PostgreSQL es rechazada antes del arranque.
- La primera compilación con detección automática de estilos se demoraba excesivamente dentro de la copia anidada. Se acotó Tailwind explícitamente a `src` en la instantánea y se usa Turbopack con raíz compatible con las dependencias enlazadas. Las clases de los controles operativos se comprobaron en el CSS servido.
- La instantánea comprueba su identidad en `next.config.ts` y selecciona almacenamiento local para ambos compiladores. No se modificó configuración ni código de producto en la copia real. `localhost:3000/login` respondió 200 tras la preparación.
- TypeScript acotado a los scripts y ESLint aprobados. La modificación previa de `next-env.d.ts` se conserva. Sin cambios de .env, migraciones de Neon, imágenes de .tmp, commits o push. Playwright no se ejecutó.
- El checklist señala expresamente las limitaciones de celular/HTTPS, geolocalización y verificación, impresora física, Blob remoto, concurrencia PostgreSQL, cruce de medianoche y módulos de capacidad/conteos que requieren confirmar alcance.
