# Entorno local de pruebas manuales

La app usa una copia del commit publicado, una base PGlite nueva y credenciales ficticias. No carga `.env`, no copia Neon ni importa usuarios del negocio. La instancia habitual en `localhost:3000` no cambia.

Preparar otro ensayo desde PowerShell en la carpeta del proyecto:

```powershell
./scripts/manual-day/prepare.ps1 -Port 3100
./scripts/manual-day/start.ps1
```

Abrir `http://127.0.0.1:3100/login`. Si ese puerto pertenece a otro proceso, no se lo detiene: preparar otro ensayo con un puerto libre entre 3100 y 3199 y arrancarlo.

Los ensayos se guardan en `.local/manual-day/<fecha-hora-id>` y están ignorados por Git. Cada uno contiene:

- `ACCESOS.md`: cuentas QA y contraseñas aleatorias; solo sirven en su base ficticia.
- `manual-day.json`: identidad del ensayo y secreto de autenticación independiente.
- `database`: base persistente exclusiva. No se sobrescribe una base existente ni se ejecutan migraciones al arrancar.
- `app`: instantánea del commit, con sus propios archivos de configuración/compilación. Comparte únicamente las dependencias instaladas mediante una unión de carpetas.
- `uploads`: fotos locales del ensayo. La configuración de **esa instantánea** sustituye el adaptador Blob por el adaptador a disco. Las reglas de normalización, autorización y vínculo con Caja siguen siendo las de la app.
- `COMPROBANTE-FICTICIO.png`: imagen para el caso de tarjeta de $29.000 y tres operaciones del checklist.
- `dataset.json`: fecha del ensayo, identificadores y enlace de la pantalla pública. No contiene datos de producción.
- `server.stdout.log`, `server.stderr.log`, `processes.json`: diagnóstico y propiedad de los procesos de esta instancia.

Parar y volver a arrancar **conserva** los cambios:

```powershell
./scripts/manual-day/stop.ps1
./scripts/manual-day/start.ps1
```

Para un ensayo anterior, ambos comandos aceptan `-RunDirectory` con su carpeta completa. Por defecto usan el último preparado correctamente. La parada verifica el proceso y detiene solo su árbol; no borra base, fotos ni archivos. Detener entre operaciones, cuando no haya un envío en curso.

Para empezar desde cero, preparar **otro** ensayo. No borrar tablas, no editar la configuración real y no apuntar estos scripts a una base existente. Los intentos fallidos también se conservan para diagnóstico y no se convierten en el ensayo activo.

La preparación crea la estructura completa de la base vacía, incluida la transición explícita del inventario y las migraciones hasta 0035. Solo se aplican dentro de la carpeta nueva, comprobada por marcador; el migrador genérico de producción no se usa.

El proceso de la app recibe una lista permitida de variables del sistema, una conexión local y secretos nuevos. Se excluyen conexiones PostgreSQL, credenciales de Blob, tokens de Vercel, proxies y opciones heredadas de Node. No se vincula ningún conector real de impresión. La sucursal se llama **PRUEBAS · Kybo ficticio**.

Restricciones del ensayo:

- Solo accesible desde esta PC: enlazado a `127.0.0.1`. El checklist separa las pruebas del celular/HTTPS y los periféricos.
- Asistencia tiene ubicación y confirmación adicional de cierre/producción desactivadas en la sucursal QA. Los fichajes manuales siguen usando la aprobación y el código del circuito normal. La ventana de puestos de hoy es ficticia (00:00–23:59), para no esperar al turno real. Mañana debe prepararse otro ensayo o planificar las nuevas asignaciones.
- Precios, cantidades, costes, IVA 0 y comisiones 0 son datos didácticos; no son una configuración recomendada para el negocio.
- Usa modo desarrollo con Turbopack para la base local. La raíz incluye las dependencias compartidas, los estilos se buscan explícitamente dentro del código de la copia y la compilación queda en su propia carpeta. La primera visita puede compilar; no sirve para medir la velocidad del entorno publicado.
- No ejecuta Playwright. Las guardas de aislamiento tienen pruebas unitarias y la disponibilidad se comprueba con consultas autenticadas al ensayo.

Seguir [el checklist de jornada](manual-day-checklist.md) y registrar cualquier problema con [la plantilla de incidencias](manual-day-findings-template.md).
