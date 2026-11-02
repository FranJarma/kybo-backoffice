# Cercanía opcional para Asistencia

El usuario aprobó una opción permanente por sucursal, administrada únicamente por Administración: **Exigir cercanía al local**. Su valor inicial es verdadero. Apagada permite fichar desde cualquier lugar con cuenta personal habilitada, QR vigente y verificación del celular; no solicita GPS. Encendida conserva radio, precisión y antigüedad de la lectura actuales.

Se eligió una configuración persistente frente a una excepción temporal de pruebas o ampliar artificialmente el radio. El servidor decide usando la política vigente; el teléfono no puede omitir una validación exigida. Cada cambio queda auditado e incrementa la revisión, invalidando intentos QR de la política anterior.

Cada fichaje nuevo guarda si la ubicación se exigió. El historial muestra esa condición histórica; los registros anteriores sin el nuevo indicador se consideran verificados como antes. Desactivar cercanía permite habilitar Asistencia sin coordenadas, manteniendo los valores anteriores de radio y precisión para una futura reactivación.

La migración 0034 agrega el campo con valor verdadero a las configuraciones existentes y adapta la restricción de coordenadas. No desactiva ninguna sucursal ni modifica fichajes. Antes de aplicarla, las lecturas siguen exigiendo ubicación y los cambios de configuración se rechazan con un aviso explícito. Aplicarla en Neon requiere autorización específica posterior. No cambiar .env ni hacer commit o push en esta etapa.
