# Conector Kybo para Windows

Requiere Windows PowerShell 5.1, .NET Framework incluido en Windows, una sesión de usuario con acceso a la cola USB y el driver de la impresora instalado. La PC necesita acceso saliente HTTPS al origen de Kybo. La tarea se ejecuta en la sesión del usuario que instala; ese usuario debe iniciar sesión. La impresora debe admitir datos RAW ESC/POS.

Ejecutar `Install-KyboPrintConnector.ps1` desde PowerShell en esa cuenta. Ingresar el origen HTTPS, elegir el nombre exacto de la cola instalada, ancho 576 (o 384/512 si se verifica en la impresora) y el código de emparejamiento. La instalación no imprime; la prueba de papel se solicita explícitamente desde Kybo. Cerrar e iniciar sesión para iniciar el conector. La credencial queda protegida mediante DPAPI para el usuario y el directorio bajo `%LOCALAPPDATA%\KyboPrintConnector` restringido a esa cuenta. El código y la credencial no se pasan como argumentos.

Para retirar el conector, revocar primero la credencial desde la administración de Kybo, deshabilitar y eliminar la tarea programada `KyboPrintConnector`, detener su proceso y eliminar el directorio anterior. Revisar la cola de Windows para trabajos retenidos; revocar o desinstalar no los retira. Ante una instalación interrumpida después de emparejar, revocar la credencial antes de volver a intentarlo.

Los archivos se pueden distribuir juntos o embebidos en el instalador. Para crear un único archivo, reemplazar la línea `# KYBO_PAYLOAD_RECORDS` por una asignación de `$EmbeddedFiles` con claves exactas `KyboPrintConnector.ps1`, `KyboPrintNative.cs` y `assets/kybo-logo.png` y valores base64 de los bytes de cada archivo. No ejecutar el instalador durante el empaquetado.

El registro local se escribe en disco antes de enviar a Windows. Tras una interrupción en el envío, informa incertidumbre y nunca vuelve a enviar ese trabajo. Una confirmación perdida se reintenta. La reconciliación consulta la cola por nombre y, si se conoce, ID; una ausencia no demuestra que el papel salió. Si un trabajo sigue presente, el operador debe revisar la cola antes de solicitar una copia. El estado de cola desconocido no demuestra que haya papel. Validar en la Hasar real el ancho, caracteres, logo, corte y recuperación antes de usarlo operativamente.

Las pruebas `Test-KyboPrintConnector.ps1`, `Test-KyboSafety.ps1`, `Test-KyboRaster.ps1` y `Test-KyboHttp.ps1` se ejecutan con Windows PowerShell 5.1. No instalan, crean tareas ni envían datos al spooler; la prueba HTTP usa únicamente un servidor sintético en loopback.
