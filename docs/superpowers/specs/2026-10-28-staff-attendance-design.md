# Control de asistencia y turnos del personal

Estado: propuesta para revisar. Rama `codex/staff-attendance`, creada desde `f1c70ff`. Solo diseño; sin implementación, migraciones, commit ni push.

## Objetivo

Planificar quién trabaja cada día y comparar ese horario con las entradas, salidas y pausas reales. El personal debe fichar en pocos pasos; el encargado debe detectar y resolver olvidos o diferencias sin perder el registro original.

Se reutilizan los usuarios y las sucursales de Kybo. Los datos y cálculos de asistencia se mantienen separados de caja y producción. El usuario amplió el alcance de la verificación personal: también debe solicitarse al iniciar una producción y al confirmar el cierre de caja, reutilizando la misma identidad y mecanismo de passkeys.

## Definido por el usuario

- Turnos configurables, inicialmente Mañana de 09:00 a 17:00 y Tarde de 17:00 a 23:00.
- Asignación de turnos a cada empleado según la fecha; los horarios pueden variar.
- Pausa prevista para comer de 30 minutos, también configurable.
- El personal marca inicio y fin de la pausa, además de entrada y salida.
- El encargado también puede asignar turnos y aprobar correcciones de fichajes.
- Fichaje desde el celular mediante Face ID o huella, dentro de la misma PWA de Kybo; no desarrollar una app nativa aparte.
- Permitir fichar solamente cerca de la ubicación del local.
- Solicitar también verificación con Face ID o huella al iniciar una producción y al confirmar el cierre de caja.
- Si la empleada no puede usar su celular, el encargado puede solicitar un fichaje manual con motivo obligatorio. Cada excepción requiere aprobación previa de un usuario administrador y un código único generado en el momento; no es un PIN permanente del encargado.
- La vigencia de esos códigos es configurable por sucursal; no se fija en diez minutos para todas las sucursales.
- Disponer de un listado de asistencia para controlar ingreso, egreso, pausas e interrupciones. El usuario los denomina «tiempos muertos»; las marcas permiten medir intervalos registrados, no inferir productividad mientras alguien permanece trabajando.
- Diseño en otra rama, sin commit ni push.

El diseño general del proyecto proponía fichaje en un equipo autorizado del local con PIN individual. El usuario eligió después fichar desde su celular con Face ID o huella y cercanía al local: esa elección reemplaza el punto compartido como circuito principal. Se conservan la hora del servidor y las correcciones auditadas. Las decisiones añadidas abajo son propuestas pendientes de aprobación de este documento.

La PWA está contemplada en el diseño general, pero la revisión de esta rama no encontró manifiesto de instalación, registro de service worker ni integración de passkeys. Actualmente existe una aplicación web responsive; la instalación PWA y la autenticación del fichaje forman parte del trabajo futuro, no son capacidades ya habilitadas.

## Enfoques considerados

### Turnos y planificación

Se propone un catálogo de turnos reutilizables más asignaciones por persona y fecha. Permite configurar Mañana y Tarde una vez, y ajustar una asignación particular sin cambiar el resto. Responde al pedido de horarios variables por día.

Un horario permanente guardado en cada empleado resulta insuficiente para ese pedido. Cargar todas las horas como texto libre en cada fecha exige repetir datos y dificulta comparar la programación. Se descartan ambos como enfoque principal.

### Pausas

Se compararon registrar las marcas reales de inicio y fin, o descontar una duración fija. El usuario eligió las marcas reales. Los 30 minutos son la referencia prevista; no sustituyen una pausa que no se registró.

### Identificación y acceso móvil

Se presentaron dos alternativas: selfie tomada en cada fichaje más ubicación, o passkey verificada por el celular más ubicación. La selfie deja evidencia visual revisable pero agrega interacción y almacenamiento; no compara identidades automáticamente. La passkey permite un recorrido más rápido sin enviar fotos ni plantillas biométricas a Kybo. El usuario eligió Face ID o huella dentro de la PWA existente.

La implementación propuesta usa WebAuthn/passkeys y solicita verificación de usuario para cada operación. El sistema operativo decide el método disponible, que puede incluir el código de desbloqueo; la web no puede prometer Face ID o huella exclusivamente. Una passkey autentica una credencial de una cuenta, no verifica que el rostro corresponda al legajo del empleado. Además puede sincronizarse entre dispositivos; no equivale a la identidad de un único teléfono físico.

No se propone reconocimiento facial propio, selfie obligatoria ni una app nativa. Para un celular incompatible, perdido o sin batería, el usuario aceptó el fichaje manual solicitado por el encargado y añadió aprobación administrativa previa y código único. El circuito se detalla abajo; no se habilita fichaje libre con PIN.

## Permisos y alcance por sucursal

| Acción                                      | Administración             | Encargado                      | Personal          |
| ------------------------------------------- | -------------------------- | ------------------------------ | ----------------- |
| Consultar asistencia y planificación        | Todas las sucursales       | Su sucursal                    | Sus propios datos |
| Crear turnos y asignar horarios             | Sí                         | Su sucursal                    | No                |
| Solicitar corrección propia                 | Si participa en asistencia | Sí                             | Sí                |
| Aprobar correcciones del personal           | Sí                         | Su sucursal                    | No                |
| Aprobar corrección propia del encargado     | Sí                         | No                             | No                |
| Configurar ubicación y radio de la sucursal | Sí                         | No                             | No                |
| Habilitar asistencia y revocar credenciales | Sí                         | No                             | No                |
| Registrar una passkey propia                | Con cuenta habilitada      | Sí                             | Sí                |
| Solicitar fichaje manual por impedimento    | Sí                         | Su sucursal                    | No                |
| Aprobar y autorizar código de excepción     | Sí                         | No                             | No                |
| Configurar vigencia de códigos por sucursal | Sí                         | No                             | No                |
| Confirmar el fichaje manual autorizado      | Según solicitud aprobada   | Solo el solicitante autorizado | No                |

La restricción de revisión propia del encargado y el alcance administrativo de ubicación/credenciales son propuestas: evitan que quien solicita una corrección sea su único autorizante. El personal y los encargados participan en asistencia con su cuenta habilitada, acceso vigente a la sucursal y una passkey registrada. La participación de un administrador puede habilitarse explícitamente por sucursal; no se presupone que el dueño deba fichar.

Las autorizaciones se comprueban en el servidor. Ocultar botones no concede ni reemplaza permisos. Desactivar una cuenta o quitarle acceso impide nuevos fichajes, conservando sus registros para revisión administrativa.

## Turnos configurables

Cada turno tiene nombre, hora de entrada, hora de salida, duración prevista de pausa en minutos y estado activo. Pertenece a una sucursal y usa su zona horaria.

Valores iniciales propuestos a partir de lo confirmado:

| Nombre | Entrada | Salida | Pausa prevista |
| ------ | ------- | ------ | -------------- |
| Mañana | 09:00   | 17:00  | 30 minutos     |
| Tarde  | 17:00   | 23:00  | 30 minutos     |

Se permite una pausa prevista de cero para un turno que no la contemple. La pausa debe ser menor que la duración del turno. Una salida al día siguiente se declara explícitamente al configurar un turno nocturno; no se infiere un turno de 23 horas por un error de escritura. La primera versión admite turnos de menos de 24 horas.

Modificar o desactivar una plantilla afecta únicamente asignaciones nuevas. Las asignaciones existentes conservan su horario y pausa. No se elimina una plantilla que ya tenga historial.

## Planificación por empleado y fecha

Administración y encargado eligen la sucursal, la semana y el personal. Cada fecha admite un turno, un horario particular o un franco. Se propone permitir varios tramos previstos para la misma persona y fecha, siempre que no se superpongan, incluso al cruzar medianoche. Un franco completo es incompatible con turnos de ese día.

Seleccionar una plantilla copia su nombre, horario y pausa en la asignación. Se puede ajustar entrada, salida y pausa para esa fecha. La selección de empleados reutiliza el Autocomplete `search-combobox.tsx`.

Para reducir carga repetida se propone copiar una semana a otra. La copia presenta qué fechas se agregarán; no sobrescribe asignaciones existentes, francos ni fechas con fichajes. La planificación queda visible al personal al guardar, con quién la modificó y cuándo. No se introduce un circuito adicional de publicación de horarios en esta primera entrega.

Los cambios de programación anteriores al primer fichaje se versionan. Cambiar la referencia de una jornada que ya tiene fichajes requiere un motivo y deja disponibles el horario anterior y el nuevo. Nunca altera las horas registradas. La edición de una plantilla no ejecuta ese cambio retroactivo.

## Fichaje desde la PWA, cerca del local

La persona ingresa a Kybo con su cuenta y abre su fichaje. La identidad corresponde a esa cuenta: no se ofrece elegir otro empleado. Se muestra la sucursal prevista, el turno y las acciones válidas según su estado. El circuito pide ubicación reciente y verificación de la passkey para confirmar la acción. No expone registros de otras personas.

| Estado actual                | Acciones disponibles                                 |
| ---------------------------- | ---------------------------------------------------- |
| Fuera de un tramo de trabajo | Registrar entrada                                    |
| Trabajando                   | Iniciar pausa o registrar salida                     |
| En pausa                     | Finalizar pausa o finalizar pausa y registrar salida |

La última acción permite cerrar ambos intervalos con la misma hora real y una intención explícita, evitando dos operaciones sucesivas. El personal puede registrar más de una pausa o tramo real; se muestra su duración total frente a la pausa prevista. Una salida sin pausa registrada es válida, pero queda señalada para revisión si el turno preveía una.

Después de confirmar se muestra la acción, el nombre y la hora aceptada. La pantalla permanece en la cuenta personal y actualiza las acciones disponibles. La respuesta debe diferenciar guardado confirmado de conexión incierta; un indicador de carga no equivale a fichaje guardado.

Cada persona puede tener como máximo un tramo de trabajo abierto, en cualquier sucursal, y una pausa abierta dentro de ese tramo. No se aceptan pausas fuera del trabajo, dos entradas abiertas, dos pausas simultáneas ni intervalos superpuestos.

### Vincular con lo previsto

Al iniciar se ofrece la programación de esa persona para la fecha local y los turnos nocturnos del día anterior que aún alcancen esa fecha. Si hay una sola referencia disponible se selecciona automáticamente; si hay varias, la persona identifica el turno que está comenzando. La referencia elegida no modifica el instante real del servidor.

Se puede fichar sin turno asignado si la persona tiene acceso vigente, verifica su passkey y cumple la cercanía a la sucursal elegida: el registro queda «Sin horario asignado · Revisar». El encargado puede vincularlo después, con motivo e historial. No se crean horarios ficticios para hacer coincidir el fichaje.

Una entrada y sus pausas mantienen la jornada de referencia al cruzar medianoche, hasta registrar la salida. Si no hay programación, la referencia inicial es la fecha local de la entrada. Una nueva entrada posterior pertenece a su nueva referencia elegida; nunca se cambia la fecha de las marcas anteriores.

## Cálculos y diferencias

Se muestran por separado:

- Horario previsto y pausa prevista.
- Entrada y salida reales de cada tramo.
- Permanencia registrada: suma de tramos cerrados de entrada a salida.
- Pausa real: suma de pausas cerradas dentro de esos tramos.
- Tiempo registrado sin pausas: permanencia menos pausa real.
- Diferencias de entrada, salida y duración de pausa respecto de lo previsto.

Ejemplo: entrada 09:00, pausa 13:00–13:30 y salida 17:00 producen 8 horas de permanencia, 30 minutos de pausa y 7 horas 30 minutos sin pausa. Mostrar estas cantidades no decide si la pausa es remunerada ni calcula salario.

Para una jornada en curso se puede mostrar tiempo transcurrido, identificado como provisional. Los intervalos abiertos no se presentan como un total final. Si existen varios tramos previstos, los totales diarios suman sus duraciones sin duplicar períodos.

Si varios tramos reales corresponden al mismo turno previsto, la diferencia de entrada usa la primera entrada del conjunto y la de salida, la última salida. Las reentradas no se clasifican como nuevas llegadas tarde ni las salidas intermedias como retiros anticipados. Los huecos entre tramos se muestran como interrupciones y no se suman al tiempo registrado.

El listado admite filtros por período, persona y sucursal según permisos. Resume horario previsto, primera entrada, última salida, permanencia, pausas, tiempo sin pausas y diferencias; el detalle conserva todas las marcas, interrupciones, verificaciones y correcciones. Se evita una columna que llame «tiempo muerto» a toda pausa o que infiera inactividad no registrada. No se incorporan exportaciones PDF del otro chat.

Cada tramo real se vincula a una sola referencia de turno. Para realizar dos turnos previstos seguidos, la persona registra salida y nueva entrada al cambiar de turno; no se fabrican marcas intermedias ni se cuenta un intervalo dos veces para cubrir ambas asignaciones. Esta es una propuesta de la primera versión, a revisar si se necesitan turnos dobles continuos.

No se introduce una tolerancia inventada. La primera versión muestra diferencias exactas; una tolerancia opcional por sucursal puede configurarse antes de usar alertas de llegada tarde. Sin configurar, se muestra el desvío y no una clasificación automática de tardanza. No se redondean ni modifican marcas originales.

## Revisión y correcciones

El encargado consulta quién tenía turno, quién registró entrada, quién está en pausa y qué requiere revisión. Las incidencias incluyen falta de programación, pausa o salida abierta fuera del horario previsto, turno terminado sin fichajes y solicitudes de corrección.

Un turno sin marcas se muestra como «Sin fichaje · Revisar», no como una falta confirmada. No se inventa una salida al terminar el horario ni se detiene una pausa al llegar a 30 minutos.

El personal solicita una corrección de sus propios registros, indicando la marca faltante o incorrecta, hora declarada y motivo obligatorio. El encargado puede proponer una corrección del personal de su sucursal con los mismos datos. Al aprobar se ve el antes y después y el efecto sobre los intervalos y totales. Rechazar también requiere motivo.

La aprobación del encargado para corregir registros existentes no sustituye la autorización administrativa exigida para un fichaje manual por falta de celular. Agregar una marca en nombre de otra persona sin su verificación debe seguir el circuito de excepción siguiente, incluso si se solicita desde «Corregir fichaje»; cambiar el nombre de la operación no evita el control.

El original permanece inmutable. La propuesta admite agregar, reemplazar o anular una marca, y anular un tramo completo registrado por error. Anular cambia la vista efectiva y sus cálculos, sin borrar el original. Si anular una marca aislada dejara una pausa huérfana u otra secuencia inválida, la corrección debe resolver el conjunto afectado en una sola operación.

La corrección registra solicitante, autorizante, motivo, fecha de solicitud, fecha de resolución y vínculo con cada marca afectada. El historial diferencia hora declarada, hora de recepción de la solicitud y hora de aprobación. Una corrección debe producir una secuencia válida, sin superposición, y se aplica de manera atómica.

Si un tramo anterior quedó abierto, se pide regularización al encargado antes de confirmar otra entrada oficial. Se permite dejar una solicitud con la hora declarada de la nueva entrada y la hora de recepción del servidor mientras se resuelve; no se la presenta como asistencia ya validada. El encargado puede regularizar los eventos pendientes en orden con sus motivos.

## Fichaje manual con autorización administrativa

Requisito confirmado: el encargado puede intervenir cuando una empleada no puede usar su celular; debe existir un código único generado en el momento y aprobado previamente por un usuario administrador. Se propone el siguiente recorrido concreto, para revisión del usuario:

1. El encargado identifica a la empleada con el Autocomplete y completa sucursal, acción (entrada, inicio/fin de pausa o salida), fecha/hora declarada y motivo obligatorio.
2. La solicitud queda pendiente y aparece al administrador dentro de Kybo. Antes de resolver, ve esos datos y quién los solicita. No se crea todavía un fichaje oficial ni se entrega un código utilizable.
3. Si el administrador aprueba, se autoriza la generación de un código nuevo, impredecible y de un solo uso para esa solicitud. La propuesta es que el encargado lo obtenga en su sesión de Kybo, sin depender de WhatsApp ni mensajes externos. Rechazar exige motivo.
4. El encargado confirma el resumen e ingresa el código. El servidor valida aprobación vigente, identidad del solicitante, sucursal, permisos y la misma acción, empleada, hora y motivo autorizados. En una sola transacción consume el código y registra el fichaje manual, respetando la secuencia de entradas, pausas y salidas.
5. La asistencia identifica el registro como «Manual · Autorizado por Administración», conserva al empleado afectado, al encargado que lo ejecutó, al administrador que aprobó, el motivo y todas las horas de auditoría. No afirma que pasó Face ID o que su ubicación fue comprobada.

El código no es permanente ni habilita al encargado por todo el día. Tampoco sirve para fichar otra persona o autorizar otra acción. El usuario definió que su vigencia sea configurable por sucursal. Se propone un campo administrativo «Vigencia del código de autorización», expresado en minutos positivos y sin opción de duración ilimitada; los diez minutos anteriores no se consideran un valor confirmado. El vencimiento se calcula al emitir el código, con la hora del servidor y la configuración vigente de la sucursal de la solicitud. Se conserva esa duración y el instante de vencimiento junto con la autorización: cambiar la configuración afecta a códigos nuevos, sin prolongar, acortar ni reactivar los ya emitidos. Estas reglas de aplicación son propuestas de diseño.

Si vence o se cambia cualquier dato de la solicitud, se necesita nueva aprobación. La generación, entrega y canje solo ocurren dentro de sesiones autorizadas, con limitación de intentos y sin exponer el código en listados, logs ni historial de auditoría. El plan concretará su formato, protección y entrega sin guardar códigos de verificación en texto plano.

La aprobación y la ejecución quedan separadas: una persona no aprueba su propia solicitud, aunque también tenga privilegios administrativos. Si el administrador no está disponible, queda «Pendiente de autorización»; se conserva la hora declarada y cuándo se solicitó. Aprobar o canjear más tarde no convierte esa hora posterior en la entrada o salida declarada. El uso excepcional de horas declaradas siempre se distingue de un fichaje normal con hora del servidor.

Si una respuesta se pierde, reintentar la misma operación devuelve el resultado guardado; el código consumido no puede crear una segunda marca. Dos canjes simultáneos producen como máximo un fichaje. La revocación de permisos o un cambio incompatible en la secuencia antes de ejecutar impide registrar, aunque exista un código previamente emitido. La excepción no simula credenciales ni geolocalización de la empleada.

El código se aplica al fichaje manual. El usuario no autorizó reutilizarlo como alternativa a Face ID en producción o caja; esa extensión no se presupone.

## Passkeys y habilitación personal

La persona registra una passkey desde una sesión propia autenticada y con asistencia habilitada. La ceremonia de registro verifica desafío, origen, identificador del servicio y cuenta, siguiendo el mecanismo de autenticación existente. El primer registro, el alta de credenciales adicionales y la recuperación de acceso necesitan concretar controles de reautenticación y revocación al planificar; conocer un nombre o disponer de una sesión administrativa no autoriza registrar una credencial ajena.

Para cada marca el servidor emite un desafío breve y de un solo uso vinculado a cuenta, sucursal, acción y operación. Verifica la respuesta WebAuthn, la firma, el origen, el identificador del servicio, la presencia y verificación de usuario, la credencial vigente y los permisos actuales. No confía en un indicador enviado por el cliente que diga «Face ID correcto». Guardar una sesión o instalar la PWA no sustituye esa verificación de la operación.

Kybo guarda el identificador y la clave pública de la credencial y los datos de verificación necesarios, nunca el rostro, la huella, el código del teléfono ni una clave privada. La revocación impide nuevas marcas con esa credencial; no elimina el historial. La sincronización de passkeys impide tratarlas como prueba de un único dispositivo físico. Autenticar la credencial y comprobar cercanía son controles separados.

### Inicio de producción y cierre de caja

El usuario pidió la misma verificación del celular para comenzar una producción y cerrar caja. Se reutilizan las passkeys de la cuenta y se pide una confirmación vinculada a la operación concreta: iniciar la orden seleccionada o confirmar la sesión de caja y su cierre. Una verificación de asistencia no autoriza automáticamente esas otras acciones.

La verificación acompaña la confirmación final, no cada campo ni cada paso del formulario. Se conservan los permisos existentes y las validaciones transaccionales: estar autenticado no concede permiso para iniciar producciones ni cerrar cajas. El desafío se vincula al usuario, la sucursal, el recurso, la versión y los datos que se confirman; un cambio relevante obliga a renovar la verificación. No se acepta un booleano del navegador ni una prueba correspondiente a otra operación.

La exploración del repositorio identifica el inicio de una orden en `src/app/api/production/orders/[id]/route.ts`, mediante `production-start`, y el circuito de caja en `src/app/api/cash/route.ts` y `src/modules/cash/service.ts`. La planificación debe integrar la confirmación personal en esos circuitos existentes, sin duplicar una producción, un cierre o sus movimientos al reintentar. El alcance es el inicio de producción, no cada interacción de comandas.

La condición de cercanía fue requerida para asistencia. No se extiende automáticamente a caja o producción sin una decisión expresa. Tampoco se cambia el modo de contabilizar jornadas, stock o montos: estos módulos incorporan evidencia de quién confirmó la acción. El código de fichaje manual no permite saltarse su verificación.

### Ubicación al fichar

Cada sucursal requiere coordenadas y un radio permitido configurable por Administración. No se habilita fichaje móvil oficial sin esa configuración. Quedan pendientes el radio inicial y su prueba con teléfonos reales dentro del local; no se interpreta cualquier resultado GPS como preciso.

Se solicita una lectura reciente al confirmar cada entrada, pausa, reanudación o salida. Se propone conservar coordenadas declaradas, precisión, instante de medición y distancia calculada como evidencia de esa marca, con acceso administrativo restringido. La evaluación de antigüedad, precisión y distancia se realiza en el servidor; sus umbrales se concretarán en el plan y deberán probarse en el local. No se usa solamente la IP ni se confía en un booleano «está cerca» enviado por el navegador.

Fuera del radio, sin permiso de ubicación, sin lectura reciente o con precisión insuficiente, no se confirma una marca oficial. Se explica el impedimento y se permite reintentar o solicitar regularización auditada al encargado. La regularización se distingue de una marca que superó los controles; no fabrica una ubicación válida.

La geolocalización del navegador es una ubicación declarada con margen de error y puede ser manipulada: no es una prueba infalible de presencia. Solo se consulta para fichar, sin seguimiento continuo ni reconstrucción de recorridos. HTTPS y permisos del dispositivo son requisitos de funcionamiento en producción.

### Instalación y alcance PWA

Se mantiene una sola aplicación Next.js y un solo origen HTTPS para cuenta, passkeys, asistencia y el resto de Kybo. Se añade manifiesto e iconos e instrucciones de instalación adecuadas a iOS y Android. Instalarla no es una condición de identidad; el mismo circuito puede funcionar en un navegador compatible. Hay que verificar compatibilidad con los teléfonos reales antes de darlo por listo.

La primera entrega de asistencia sigue siendo online. Ser instalable no habilita fichaje offline ni confirma operaciones en una cola pendiente. Si se incorpora un service worker, su estrategia debe excluir respuestas autenticadas, listados personales y desafíos/operaciones de WebAuthn del caché offline; no se introduce un caché global de toda la aplicación por añadir Asistencia.

Referencias técnicas verificadas: [WebAuthn, privacidad biométrica](https://www.w3.org/TR/webauthn-3/#sctn-biometric-recognition), [passkeys en la web](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys), [geolocalización y permisos](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API), [precisión de la ubicación](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy) y guía PWA de la versión instalada de Next.js (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`, a consultar antes de implementar).

## Conexión, reintentos y concurrencia

En el fichaje normal, el instante oficial lo asigna el servidor al aceptar la operación por primera vez. Reintentar la misma operación devuelve ese resultado, sin crear otra marca ni usar la hora del reintento. El fichaje manual autorizado conserva por separado la hora declarada aprobada y los instantes reales de solicitud, aprobación y ejecución; no se presenta una declaración retroactiva como hora comprobada por el servidor.

Una respuesta perdida conserva la identidad de la operación mientras se consulta su resultado desde la misma cuenta autorizada. Si la operación original no se aceptó y vencieron sus verificaciones, se renuevan el desafío y la ubicación conservando la identidad de operación; no se crean dos marcas. Una operación ya aceptada devuelve su resultado sin volver a pedir ubicación ni usar otra hora. La misma identidad con otra persona, sucursal o intención no reutiliza un resultado ajeno.

Sin conexión no se confirma asistencia oficial. Se permite preparar una solicitud de regularización con hora declarada; al recuperar conexión permanece pendiente de revisión. No se transforma la hora de reconexión en hora de entrada, pausa o salida.

Dos acciones concurrentes se serializan por persona. La revisión final de permisos, programación y estado ocurre dentro de la operación transaccional; no se confía en el estado que mostraba una pantalla anterior. Las solicitudes y sus resoluciones también rechazan revisiones desactualizadas.

## Propuesta de navegación y presentación

- Nueva sección **Personal**, con **Asistencia** y **Turnos y horarios**. La segunda se reserva a encargado y administrador. Usuarios y credenciales administrativas conservan su ubicación actual en Configuración.
- Asistencia muestra el día y permite consultar períodos anteriores. Administración y encargado ven su alcance; el personal ve únicamente sus datos.
- Turnos y horarios permite planificar la semana, editar plantillas y revisar ajustes particulares. Se priorizan controles en línea y el Autocomplete existente.
- Mi fichaje utiliza una vista personal dentro de la misma PWA, pensada primero para celular, con turno, estado, validación de cercanía, acciones táctiles y confirmación clara.
- La interfaz mantiene azul y naranja Kybo, foco visible, campos obligatorios señalados y un tratamiento consistente para acciones principales y secundarias.

Estas decisiones de presentación son propuestas. El usuario pidió la maqueta visual y se preparó una versión exploratoria independiente de la app, en `.superpowers/attendance-visual/` (ignorada por Git). No son pantallas integradas ni conectadas a datos reales.

La propuesta se actualizó a pedido del usuario con vistas de ejemplo de Personal, Encargado y Administrador, alternables desde una barra de demostración. La vista personal muestra turno, estado actual, cercanía y acciones de fichaje con una confirmación de Face ID/huella expresamente simulada. Incluye escenarios de ubicación cercana, fuera de zona, poca precisión y falta de permiso. No solicita ubicación, biometría, cámara ni credenciales reales.

El encargado puede solicitar un fichaje manual con empleado, acción, hora y motivo obligatorio. La solicitud queda pendiente; la vista de Administración permite aprobar o rechazar, con motivo obligatorio al rechazar. Solo la vista del encargado muestra el código de ejemplo para canjearlo. Se puede recorrer su uso, su vencimiento y una solicitud nueva; al usarse, la asistencia identifica la excepción, el encargado y el administrador autorizante. Administración dispone de configuración de vigencia en minutos y radio por sucursal, con dos sucursales ficticias para comparar configuraciones.

Reutiliza el Autocomplete real de Kybo, el logo y Manrope. La planificación semanal anterior sigue disponible para explorar asignación por fecha, francos, horarios, pausas, copia y plantillas; conserva un estado de ejemplo propio y no sincroniza sus cambios con la nueva vista de asistencia. Su botón de fichaje vuelve al recorrido personal nuevo. El antiguo circuito de PIN quedó fuera del recorrido visible y no representa el enfoque elegido.

Se verificaron manualmente la confirmación simulada correcta y fallida, los impedimentos de ubicación, la solicitud manual con Autocomplete, el rechazo sin motivo, la aprobación, el código incorrecto, el canje y su historial, el vencimiento y la nueva solicitud. Se comprobó que cambiar de diez a veinticinco minutos afecta a autorizaciones nuevas y conserva diez en una ya emitida, y que otra sucursal mantiene su configuración independiente. Se revisaron escritorio de 1440 px, tablet de 768 px y celular de 390 px sin desbordamiento horizontal. Todos los nombres, horarios y fichajes son ejemplos en memoria del 28 de octubre, aunque la revisión continúe el día siguiente.

La maqueta no instala una PWA ni autentica personas reales. Tampoco valida GPS, persiste información, impone permisos de servidor o prueba concurrencia, reglas nocturnas o varias asignaciones previstas por persona/día. No cambia las pantallas reales de producción o caja. Esos casos pertenecen a la implementación futura y sus pruebas; esta propuesta visual no equivale a aprobación de todo el diseño.

Las capturas y los datos de conexión del servidor local están en `.superpowers/attendance-visual/previews/` y `.superpowers/attendance-visual/state/server-info`. El servidor se conserva para revisar la propuesta, sin commit ni push.

## Integración y datos necesarios

No se duplican empleados: se referencian los usuarios existentes y su acceso por sucursal. El módulo necesitará, conceptualmente, plantillas de turno, asignaciones versionadas, habilitación de asistencia, credenciales públicas de passkeys, desafíos efímeros vinculados a cada operación, configuración de cercanía por sucursal, marcas originales con evidencia de verificación, operaciones idempotentes, solicitudes/resoluciones de corrección y solicitudes de fichaje manual con aprobación administrativa y códigos de uso único. Los intervalos y totales se derivan de las marcas y correcciones aprobadas.

Las asignaciones conservan su zona horaria y horario de referencia. Las marcas guardan instante UTC, persona, sucursal, origen y referencia a la credencial/verificación y evidencia de cercanía cuando corresponda. Las correcciones administrativas y excepciones manuales se distinguen de las marcas verificadas desde la PWA. El inicio de producción y el cierre de caja deben conservar evidencia de su propia confirmación; no se altera la lógica contable de movimientos ni los contadores de preparación por añadir esa verificación.

La planificación posterior debe concretar esquema, APIs y pruebas siguiendo los patrones actuales de autorización, revisiones y transacciones. El fichaje normal exige identidad personal, passkey verificada y cercanía válida; la excepción manual exige la solicitud aprobada y el canje autorizado. No se puede reutilizar una sesión administrativa como identidad de otra persona ni habilitar genéricamente todos los comandos al personal.

## Fuera de esta primera entrega

Liquidación de sueldos, cálculo monetario de horas extra, reglas de pago de pausas, vacaciones/licencias complejas, reconocimiento facial propio o almacenamiento biométrico, selfie obligatoria, seguimiento continuo, app nativa independiente, fichaje oficial offline, integración con caja por turnos, impresión y generación de PDF. Se preservan las exclusiones de los archivos de PDF del otro chat. La verificación local del celular mediante passkeys y la validación de cercanía sí forman parte del enfoque elegido.

## Criterios para aceptar la implementación futura

1. Configurar Mañana 09–17 y Tarde 17–23 con pausa de 30 minutos y asignar fechas distintas a cada empleado.
2. Ajustar un horario o pausa particular conservando otras asignaciones e historial; impedir solapamientos y franco incompatible.
3. Registrar entrada, inicio de pausa, fin y salida con hora del servidor, sin permitir otra entrada o pausa simultánea.
4. Registrar múltiples pausas o tramos sin duplicar tiempo y manejar cruce de medianoche.
5. Mostrar por separado permanencia, pausas, tiempo sin pausas y comparación prevista; mantener provisionales los tramos abiertos.
6. Marcar registros sin horario y turnos sin fichajes para revisión, sin fabricar ausencias ni salidas.
7. Aprobar o rechazar correcciones con motivo, historial y vista de su efecto, preservando originales.
8. Permitir asignación y revisión al encargado de la sucursal; proteger registros ajenos al personal y revisiones propias del encargado.
9. Rechazar credenciales revocadas, respuestas WebAuthn inválidas, desafíos vencidos o reutilizados, cuentas desactivadas y permisos revocados, incluso en reintentos.
10. Una respuesta perdida o dos dispositivos concurrentes no crean marcas duplicadas o intervalos superpuestos.
11. Fichar únicamente para la cuenta verificada, solicitando verificación de usuario y sin guardar biometría ni el código del dispositivo. No afirmar que el método fue exclusivamente Face ID o huella.
12. Sin conexión, distinguir una solicitud declarada de un fichaje oficial; no usar la reconexión como hora trabajada.
13. Validar coordenadas, radio, antigüedad y precisión en el servidor para cada marca. Rechazar falta de configuración, permiso denegado, ubicación fuera de radio o no suficientemente precisa, sin inventar presencia.
14. Instalar la misma PWA en los equipos compatibles de iOS/Android y verificar el recorrido real de passkeys y ubicación por HTTPS; la simulación del prototipo no sustituye esa prueba.
15. Consultar asistencia por persona y período con ingresos, egresos, pausas e interrupciones, sin clasificar productividad no medida ni exponer datos de otros empleados.
16. Solicitar verificación de usuario al iniciar una producción o confirmar el cierre de caja, vinculada a la operación y a sus datos; conservar los permisos existentes y no duplicar efectos en reintentos.
17. Un fichaje manual requiere solicitud con persona, acción, hora y motivo, aprobación previa de otro usuario administrador y código generado para esa solicitud. Impedir uso previo, reutilización, canje ajeno o cambios de datos después de aprobar.
18. Distinguir fichaje manual, solicitante, administrador autorizante, hora declarada y horas reales de auditoría; no mostrarlo como Face ID/GPS válido ni permitir que otra pantalla evite esta autorización.
19. Configurar la vigencia de los códigos por sucursal y calcularla al emitir cada código; un cambio posterior solo afecta a códigos nuevos y no permite reutilizar o reactivar códigos vencidos.

## Siguiente paso

La revisión técnica anterior cerró las preguntas sobre anulación de marcas y comparación de varios tramos del mismo turno. Después el usuario eligió passkeys en su celular y cercanía al local, amplió su uso al inicio de producción y cierre de caja, y definió la contingencia de fichaje manual con aprobación administrativa previa y código único de vigencia configurable por sucursal. Estas ampliaciones deben incluirse en una nueva revisión antes de preparar el plan. Quedan por validar el recorrido concreto de solicitud/aprobación/canje, las reglas propuestas de aplicación de la vigencia y el radio inicial a probar en el local.

Revisar el documento y, si se solicita, la propuesta visual. Con la aprobación del diseño se prepara el plan de implementación. Aplicar futuras migraciones a Neon requerirá autorización específica; este diseño no modifica ninguna base.
