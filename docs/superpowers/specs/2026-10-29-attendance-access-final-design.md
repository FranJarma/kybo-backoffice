# Asistencia: acceso del equipo y QR dinámico

Fecha: 29 de octubre de 2026.

Estado: **diseño y propuesta visual aprobados por el usuario el 29/10/2026 para implementar en esta rama**. Sin commit ni push. Las migraciones futuras en Neon siguen requiriendo autorización específica.

Última definición para la propuesta visual final: la PC/tablet mantiene una cuenta operativa compartida del local para atender pedidos y mostrar el QR. Verónica autoriza la gestión del turno con su cuenta personal desde esa misma PC, organiza los puestos y vuelve a la atención habitual al guardar. No se agrega un PIN por venta ni un PIN diario de la encargada. Este modo fue aprobado para implementar junto con el QR y las tareas personales; la activación en Neon se realizará por separado.

El usuario confirmó que **comenzar/finalizar pedido en el celular significa comenzar su preparación en Barra/Cocina y marcarlo listo para entregar**, no tomar ventas ni registrar cobros. El celular personal permite asistencia/pausas, ver asignaciones, registrar producción asignada y preparar pedidos. La entrega física al cliente sigue siendo una operación distinta.

Este documento consolida las decisiones posteriores al diseño de Asistencia del 28 de octubre y a la maqueta de invitaciones. Reemplaza sus apartados sobre primer ingreso, acceso al fichaje y equipos autorizados. Conserva turnos, asignaciones, pausas, informes, correcciones y excepciones ya implementados. La maqueta anterior es exploratoria y no representa por sí sola este circuito final.

## Resultado buscado

Las empleadas toman pedidos desde la PC/tablet del local. Para fichar usan su propia cuenta en su celular: escanean el QR de la sucursal, eligen la marca, validan cercanía y confirman con el desbloqueo del teléfono. Administración facilita el alta con una invitación que comparte personalmente por WhatsApp.

No se da de alta ni se autoriza cada PC/tablet. La comprobación normal de cercanía corresponde al celular de quien ficha. El QR es una condición de acceso al fichaje y no una prueba infalible de presencia ni de identidad física.

## Decisiones del usuario y propuestas por aprobar

| Tema | Diseño | Procedencia |
| --- | --- | --- |
| Pedidos | Se siguen tomando en la PC/tablet; escanear para fichar no cambia su sesión | Contexto y objetivo del usuario |
| QR | Se muestra en una pantalla y lo escanea la empleada con su celular | Aclaración explícita del usuario |
| QR impreso fijo | Se descarta por la posibilidad de copiarlo | Decisión explícita del usuario |
| Equipos autorizados | No habrá registro, aprobación ni vinculación a una PC/tablet | Decisión explícita del usuario |
| Verificación normal | Cuenta propia, ubicación reciente y verificación del celular en cada marca | Último circuito propuesto por el usuario |
| Método del teléfono | Face ID, huella o desbloqueo que admita el equipo; no se promete biometría exclusiva | Límite explicado y diseño existente |
| Excepciones | Encargado solicita, Administración aprueba y se usa un código único con vigencia por sucursal | Circuito previamente acordado |
| Invitación | Mensaje preparado por Kybo que Administración comparte por WhatsApp | Elección explícita del usuario |
| Renovación del QR | Automática cada 60 segundos; sin generarlo manualmente al comenzar el turno | Aprobado con la propuesta visual final |
| Vigencia inicial de invitación | 3 días, elegible entre 24 h, 48 h, 3 días y 7 días | Aprobado con la propuesta visual final |

## Enfoques considerados

**QR fijo con cuenta, ubicación y verificación.** Facilita imprimirlo una vez, pero una copia sirve indefinidamente como acceso. El usuario lo descartó.

**QR cambiado por día o por turno.** Organiza su validez y exige menos actualizaciones, pero una copia puede servir durante todo ese período. Fue la alternativa planteada por el usuario al descartar el impreso.

**QR renovado automáticamente cada minuto, con cuenta, ubicación y verificación.** Es la recomendación para cerrar el diseño: acota la utilidad de una captura sin agregar una tarea al encargado. El resto del documento describe la alternativa aprobada.

Autorizar una terminal específica no forma parte de ninguna alternativa vigente. Tampoco se reemplaza la verificación personal por un PIN compartido del local, selfies o reconocimiento facial propio.

## 1. Invitación y primer ingreso

En **Configuración → Usuarios**, Administración puede invitar una persona nueva indicando nombre, rol, sucursal y si tendrá habilitada la participación en Asistencia. Los horarios siguen asignándose en la planificación existente. El usuario de acceso y una contraseña inicial fuerte se generan en el sistema.

La invitación muestra un mensaje listo para copiar o compartir. La persona que administra elige WhatsApp y el destinatario; Kybo no envía mensajes automáticamente ni necesita una integración con WhatsApp Business. El mensaje contiene el enlace, el usuario y la contraseña inicial; la contraseña no se incorpora a la URL. El enlace no inicia sesión por sí solo.

La persona abre la invitación, ingresa con esos datos y recibe un paso claro **«Activar verificación del celular»**. El sistema prepara el nombre de la credencial y solicita la confirmación del teléfono, sin otro formulario de dispositivo ni repetir la contraseña recién utilizada. La aprobación del sistema operativo sigue siendo necesaria. La credencial se registra únicamente para la cuenta autenticada, con una autorización de alta breve vinculada a ese ingreso reciente; conservar una sesión antigua no concede esa autorización por sí solo.

La instalación de la PWA se ofrece con instrucciones adecuadas a iPhone/Android; no es condición para usar Asistencia desde un navegador compatible. El circuito no promete que un QR leído con la cámara externa abra siempre la PWA instalada, ni que el navegador y la PWA compartan automáticamente la sesión. Si el contexto que abre el enlace no tiene sesión, se pide ingresar allí.

La activación de la credencial se hace una vez; si la persona ya tiene una utilizable, no se le obliga a crear otra. Si cambia de equipo, pierde la credencial o no es compatible, conserva los caminos existentes de registro propio y revocación administrativa y la excepción manual. No se registra una credencial ajena desde la cuenta del encargado.

### Vida de la invitación y contraseña inicial

Propuesta para no agregar otro paso al alta: la contraseña se denomina **inicial**, no «de un solo uso». Tras activar la cuenta sigue sirviendo para ingresar cuando venza la sesión, hasta que se restablezca. No se exige un cambio de contraseña en este recorrido ni se introduce todavía el ingreso a Kybo mediante passkey como sustituto del login habitual.

La vigencia seleccionada corresponde a la invitación y a la activación de una cuenta pendiente. Una cuenta nueva pendiente no obtiene acceso operativo solo por conocer esa contraseña: debe completar un primer ingreso válido dentro de una invitación vigente. Activar la cuenta no obliga a terminar inmediatamente el registro de la credencial para usar otros módulos permitidos; el fichaje normal sí sigue exigiendo una credencial válida. Una cuenta ya activa no pierde su acceso porque venza el enlace histórico.

Renovar una invitación pendiente conserva el usuario y reemplaza el acceso de invitación y contraseña inicial anteriores. No crea otra persona. Una invitación no reactiva cuentas deshabilitadas por Administración ni cambia permisos de cuentas existentes; una cuenta activa con problemas de acceso se recupera por una acción administrativa explícita, no por una renovación silenciosa.

Administración ve **Invitación pendiente / Vencida / Cuenta activada**, **Primer ingreso** y **Verificación configurada**. Estos estados no se presentan como prueba de identidad física de una empleada ni de instalación efectiva de la PWA.

## 2. Pantalla del QR en la PC/tablet

Se propone **«Mostrar QR de asistencia»** dentro del puesto de venta de la sucursal, con una cuenta operativa compartida (por ejemplo, `mostrador.alberdi`). La cuenta tiene permisos limitados para las funciones acordadas del puesto y para mostrar el QR, sin administrar usuarios ni usar el fichaje como si fuera una empleada. La concesión de ese acceso se administra por cuenta y sucursal, sin autorizar un equipo físico. Las cuentas personales conservan sus permisos por separado y no reciben el permiso de generar/mostrar QR por el solo hecho de ser Personal.

La vista móvil personal muestra el fichaje y su confirmación, sin el botón ni la pantalla emisora de QR. La emisión se diseña para la PC/tablet del local. Esto es un alcance funcional y de permisos: no se promete demostrar físicamente que la cuenta operativa no está abierta en un teléfono, porque ocultar controles por tamaño de pantalla no establece esa garantía. El QR identifica la sucursal, no a la cuenta operativa ni a una empleada.

La pantalla muestra nombre del local, QR, cuenta regresiva y estado de conexión. Se puede dejar abierta en otra pestaña mientras se usa el punto de venta. La propuesta visual final incluye la acción en el punto de venta y en la navegación del puesto, con la cuenta «Mostrador · Alberdi».

La pantalla no muestra datos personales de otras empleadas ni necesita cámara, ubicación o registro del equipo para funcionar. El rol sigue controlando los datos y acciones disponibles: mostrar el QR no habilita fichajes manuales ni la administración de Asistencia.

El código se obtiene del servidor y se renueva automáticamente cada 60 segundos. Varias pantallas de una sucursal muestran códigos coherentes: abrir otra pantalla o actualizar una no invalida el QR vigente de la otra. Un código compartido puede servir a varias personas dentro de su validez; el primer fichaje no lo consume globalmente.

Se puede abrir la pantalla al empezar el turno, pero su funcionamiento no depende de una apertura de caja ni de crear una sesión de terminal. Los horarios se siguen configurando por sucursal/persona/fecha. No se corta el fichaje a las 17 o a las 23 si alguien necesita registrar una salida real o una jornada cruza medianoche; se mantienen las reglas actuales de asignaciones.

Si falta conexión o la sucursal deshabilita Asistencia, se muestra que no hay un QR válido disponible. No se deja una imagen vieja aparentando que sigue vigente. No hay QR imprimible permanente ni modo oficial offline.

## 3. Fichaje personal desde el QR

1. Escanear abre el acceso a Asistencia de la sucursal indicada. El enlace identifica una sucursal y un código temporal; no contiene contraseñas, identidad de una empleada ni una sesión administrativa.
2. Con sesión, se muestra **«Vas a fichar como [nombre]»** y la sucursal. Se ofrece cambiar de cuenta sin permitir elegir libremente otra persona para fichar.
3. Sin sesión, se solicita usuario y contraseña. El ingreso conserva un retorno interno a este fichaje en lugar de mandar a Inicio. Se vuelven a verificar los permisos para esa sucursal; no se cambia por ello la sucursal o sesión de la PC/tablet.
4. Si el QR venció antes de autenticar y abrir el intento personal, se informa **«El código venció. Escaneá el QR actual del local»**. El login no extiende la vigencia del código.
5. La persona elige una acción válida según su estado y, si corresponde, el tramo previsto entre los existentes. Kybo solicita ubicación reciente y luego la confirmación del celular para esa acción.
6. Se comprueban otra vez permisos, participación, estado, cercanía y verificación en el servidor; se registra la hora del servidor y se muestra la marca guardada.

Abrir el enlace, obtener la ubicación o ingresar a la cuenta no registra una marca automáticamente. La confirmación del teléfono se solicita después de elegir la acción, vinculada a esa persona, sucursal y operación.

Una vez autenticada la persona y comprobado el QR vigente se abre un intento personal de duración breve; propuesta técnica: 2 minutos para seleccionar/confirmar. El vencimiento del QR impide abrir intentos nuevos con esa captura, pero no interrumpe una confirmación que ya comenzó válidamente. El intento pertenece a una cuenta y se consume al guardar una operación. No se puede compartir, trasladar a otra sucursal o reutilizar para una segunda marca.

Cada marca normal requiere un intento nuevo a partir de un QR vigente. Mi jornada sigue disponible para consulta desde la navegación normal; no ofrece otro endpoint o botón que permita saltar la condición del QR para fichar. Una copia del enlace no demuestra que se utilizó la cámara: se comprueba la vigencia del código y los controles personales, no un gesto físico imposible de acreditar desde ese enlace.

## 4. Reglas de jornada que se conservan

| Estado | Acciones normales disponibles |
| --- | --- |
| Fuera | Registrar entrada |
| Trabajando | Iniciar pausa o registrar salida |
| En pausa | Finalizar pausa o finalizar pausa y registrar salida |

Se conservan la pausa prevista configurable (inicialmente 30 minutos), turnos variables por fecha, varios tramos, cruces de medianoche, informes y correcciones con historial.

El servidor impide entradas simultáneas, salida sin entrada en la misma sucursal, dos pausas abiertas y fin de pausa inexistente. Un doble toque, un reintento tras perder la respuesta o dos celulares concurrentes no duplican marcas ni efectos. Una solicitud aprobada de corrección conserva los originales; la pantalla no modifica libremente una hora pasada.

La cercanía usa el punto central confirmado de la sucursal, su radio y precisión configurados y una medición reciente del celular en cada marca normal. No hay seguimiento continuo ni ubicación de la PC/tablet. Si la ubicación es insuficiente, se explica cómo reintentar y se ofrece solicitar ayuda; no se inventa una validación correcta.

## 5. Fichaje manual excepcional

Se conserva **Asistencia → Autorizaciones**. El encargado solicita para una persona una entrada, pausa, fin de pausa o salida con hora declarada y **motivo obligatorio**. Administración mantiene su acceso de respaldo como en el módulo existente; Personal no puede solicitar ni confirmar estos fichajes.

Otro usuario administrador debe aprobar la solicitud exacta. Se genera un código de un solo uso, con la vigencia configurada por sucursal al aprobar. Solo quien solicitó la excepción puede confirmarla con ese código. No hay PIN permanente del encargado ni permiso genérico para saltear controles.

La excepción se puede completar desde una PC/tablet sin registro especial del equipo. **No exige QR, ubicación válida ni verificación del celular de la empleada**, porque precisamente resuelve impedimentos de ese circuito. Su control es la cuenta y rol del encargado, la aprobación administrativa, el código y la auditoría. No se afirma que el GPS garantice la presencia física de quien realiza una excepción.

Se conservan las validaciones de secuencia y participación. Quedan la hora declarada aprobada, la hora real de registro, el motivo, solicitante, administrador y confirmante. Se muestra como **Manual** y nunca como ubicación/identidad verificadas por celular.

## 6. Pedidos, caja y producción

El escaneo del QR desde el celular no cambia la cuenta abierta en la PC/tablet ni interrumpe el pedido o sus filtros. Hoy las ventas se atribuyen al usuario de la sesión actual. Si se utiliza únicamente la cuenta del local, esa será la identidad registrada y no se podrá atribuir cada pedido a una empleada.

La propuesta final distingue **cuenta del local**, **responsable asignada al puesto** y **persona que autoriza la gestión**. Verónica asigna por fecha/turno quién toma pedidos, quién trabaja en Barra y quién en Cocina, desde la misma PC. La responsabilidad asignada no demuestra quién presionó cada botón de una venta. No se incorpora un PIN de operadora ni se identifica automáticamente a quien cobra por haber fichado.

### Gestión protegida desde la PC

«Gestionar turno» solicita una autorización personal reciente de Verónica, con su cuenta y contraseña, sin cerrar la sesión operativa ni perder el pedido. La autorización permite las acciones concretas de organización del turno y solicitud de excepciones; no convierte la cuenta compartida en Encargado ni concede todos los permisos de Verónica. Debe comprobarse también en el servidor y quedar auditada con la persona que autorizó, la sucursal y la acción.

El modo muestra claramente «Estás gestionando como Verónica» y una salida visible. Guardar o salir termina la autorización y vuelve al punto de venta conservando su pedido. La futura planificación deberá definir el vencimiento breve y el rechazo de autorizaciones canceladas, vencidas o correspondientes a otra sucursal; ocultar controles no reemplaza esos controles. Los permisos de cuentas siguen administrándose por separado.

La maqueta muestra mañana 09–17 y tarde 17–23, con responsables elegidos mediante el Autocomplete compartido. Los horarios, las pausas y la asignación por persona/fecha siguen apoyándose en la planificación configurable existente; no se reemplazan por dos turnos fijos obligatorios. La organización por puesto no otorga por sí sola nuevos permisos a una persona.

En el celular se muestran las líneas de pedidos correspondientes al puesto asignado. «Marcar listo» completa esa parte de la preparación; si falta otra estación se indica «Tu parte está lista». Solo cuando todas las partes están listas el pedido pasa a «Listo para entregar», conservando el circuito de entrega separado. La producción asignada se registra en Depósito, según el diseño ya acordado.

Este diseño no activa ni desactiva la configuración existente que pide verificación al comenzar producción o cerrar caja. Tampoco usa el QR de asistencia para aprobar esas operaciones. Su eventual recorrido entre equipos debe diseñarse expresamente; no se mezcla con este cierre de Asistencia. Los permisos y la lógica contable existentes se conservan.

## 7. Límites y requisitos para construirlo

Se reutilizan el usuario, su acceso por sucursal, la participación, los turnos, WebAuthn/passkeys y las operaciones de Asistencia existentes. La verificación se presenta como **«Verificar con tu celular»**, con una explicación breve de los métodos admitidos. Kybo no recibe ni guarda biometría o el código de desbloqueo. Una credencial puede sincronizarse entre equipos y no acredita por sí sola que su titular sea una persona física concreta del legajo.

Sin equipos autorizados, el QR no acredita que se obtuvo de una pantalla situada en el local. Una captura puede reenviarse durante su vigencia; la cercanía y la verificación personal reducen el riesgo. No se promete impedir completamente la suplantación coordinada o la manipulación de una ubicación reportada por un cliente. No se añaden selfies, control de Wi-Fi, IP fija ni reconocimiento facial.

Los retornos de login admiten únicamente destinos internos del circuito; nunca redirecciones arbitrarias. Los QR e intentos se generan y validan en el servidor, con plazos, sucursal, cuenta e intención adecuados. El QR compartido y el intento individual no sustituyen los desafíos criptográficos de verificación del celular. Deshabilitar una cuenta, quitar su acceso o desactivar Asistencia impide nuevos fichajes, incluso con intentos pendientes.

Las contraseñas se guardan con hash como ahora. Los secretos de invitación y sus mensajes recuperables no se auditan, se guardan en claro ni se incorporan al HTML público. Propuesta para resolver respuestas perdidas sin duplicar personas: mensaje recuperable solo por Administración mientras la invitación está pendiente y vigente, con cifrado en el servidor, y eliminación de ese contenido al activarse, vencer o reemplazarse. Después de activar, no se puede volver a revelar la contraseña desde el historial. La creación y renovación son idempotentes; un reintento no crea otra cuenta ni invalida una invitación recién generada sin intención explícita.

La estructura exacta de tablas y rutas, bloqueo/transacciones, almacenamiento efímero, generación del QR, mensajes de error y limpieza de datos temporales quedan al implementador, siguiendo las convenciones del repositorio. Debe planificarlos sin relajar las garantías anteriores. Los selectores con búsqueda reutilizan `SearchCombobox`; las acciones del fichaje se mantienen en línea y con pocas interacciones.

## 8. Criterios de aceptación de la futura implementación

- Invitar, copiar/compartir y renovar una invitación pendiente sin duplicar personas ni revelar secretos históricos; impedir activaciones vencidas o de cuentas deshabilitadas.
- Conservar el login normal y devolver correctamente al fichaje solo por destinos internos permitidos, con sesión presente/ausente y QR vencido.
- Integrar la activación inicial de la credencial sin pedir nuevamente la contraseña recién verificada; rechazar el alta desde una sesión antigua sin autorización reciente.
- Mostrar QR por sucursal con renovación automática y cuenta regresiva; aceptar varios empleados sin consumo global ni invalidaciones entre pantallas.
- Registrar cada marca normal con intento de QR propio, ubicación reciente, confirmación del celular y hora del servidor. Rechazar intentos vencidos, compartidos, reutilizados o de otra sucursal/cuenta.
- Conservar reintentos seguros, bloqueo por persona, reglas de jornada, pausas, planificación, informes y permisos actuales. No aceptar saltarse QR llamando directamente a la operación previa de fichaje.
- Conservar el fichaje manual exclusivamente por excepción, con aprobación, código y auditoría. No exigir equipos autorizados ni fingir evidencia de GPS/celular.
- Probar el recorrido por HTTPS en iPhone/Android reales, con cámara externa y navegador/PWA, sesión vencida, ubicación lenta o insuficiente, confirmación cancelada, falta de conexión y respuesta perdida. Una maqueta no satisface estas pruebas.
- Verificar escritorio/tablet para el QR y celular para el fichaje, foco visible, campos obligatorios y mensajes legibles; tomar pedidos no cambia la identidad de la sesión por el fichaje móvil.
- Autorizar la organización desde la cuenta personal de Verónica en la PC compartida, con comprobación de alcance y vencimiento en el servidor. Al salir/guardar se pierde la autorización, se conserva el pedido y la cuenta operativa no gana permisos de Encargado.
- Reflejar las asignaciones por puesto en el celular, mantener separadas preparación y entrega y distinguir la responsable asignada de una identidad personal comprobada por venta.

## 9. Límite de esta etapa

La implementación se prepara en `codex/staff-attendance`, con pruebas en bases descartables y una instancia visual en memoria. No se crean cuentas o fichajes reales ni se cambia la configuración de Neon. El plan está en `docs/superpowers/plans/2026-10-29-attendance-workplace-access.md`. Cualquier migración futura a Neon requiere autorización específica nueva. Se mantienen las exclusiones de cambios de PDF de otro chat, sin commit ni push.
