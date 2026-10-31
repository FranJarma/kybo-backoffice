# Contraseñas temporales del equipo

Estado: aprobado expresamente por el usuario. Confirmó 24 horas desde el primer ingreso correcto, uso con aviso durante el plazo y bloqueo al vencer, incluidas las sesiones abiertas.

## Objetivo

Configurar las cuentas solicitadas, conservar las identidades existentes de Abigail e Ignacio y hacer cumplir el cambio de las contraseñas iniciales. Las contraseñas provistas por el usuario no se copian a este documento, al código, al historial Git ni a los eventos de auditoría.

## Alternativas y elección

Se comparó vencer la contraseña a las 23:59 del primer día con vencerla 24 horas después del primer ingreso. El usuario eligió 24 horas desde el primer ingreso. No contar desde el alta evita consumir el plazo antes de entregar la cuenta.

## Comportamiento propuesto

- El primer ingreso correcto con contraseña temporal fija el comienzo y vencimiento en el servidor. Ingresos posteriores, otra sesión o teléfono no renuevan el plazo.
- Al ingresar se ofrece cambiar la contraseña; mientras dura el plazo, la app muestra el vencimiento y permite continuar. Al cumplirse las 24 horas sin cambiarla se bloquea el acceso, incluidas las sesiones abiertas y la autorización de gestión desde el puesto compartido.
- Cada persona cambia su propia contraseña confirmando la actual y escribiendo una nueva diferente. Se conservan los requisitos actuales de contraseña. Los intentos se limitan y el cambio se audita sin registrar secretos.
- Un cambio correcto elimina la obligación temporal y revoca las otras sesiones. Se conserva el destino interno del QR o de la página que originó el ingreso.
- Si el plazo venció, Administración debe emitir una nueva contraseña temporal. No se puede prolongar el plazo reintentando el ingreso.
- La contraseña existente de Administración no se cambia ni se vuelve temporal. La cuenta compartida del local usa una credencial independiente, administrada por el propietario, y no es participante de Asistencia.
- Los usuarios personales pedidos reciben su rol y acceso a la sucursal. Cocina y Barra son puestos asignables por turno, sin crear roles de seguridad nuevos. Se conserva el permiso actual de catálogo de Ignacio.

## Datos y activación

Hace falta guardar por persona la obligación temporal y sus fechas; el modelo actual no lo tiene. Se implementará con una migración aditiva, pruebas descartables y validación de acceso en el servidor. Aplicarla a Neon requiere autorización específica nueva. Las contraseñas temporales del equipo no se activarán hasta que el control esté implementado, publicado y habilitado. La cuenta del local y la participación de Administración pueden configurarse usando los servicios existentes sin esperar esta migración.

## Verificación

Primer ingreso y reintentos sin reiniciar el reloj; vencimiento exacto a las 24 horas; sesiones abiertas y gestión del puesto rechazadas tras vencer; contraseña anterior y repetida rechazadas; cambio válido y sesiones revocadas; restablecimiento por Administración; actualización de Abigail e Ignacio sin duplicar sus IDs ni perder historial; QR y retorno de login conservados; límites de consultas de cobro sin regresión. No se registran fichajes de prueba sin intervención del propietario desde su teléfono.
