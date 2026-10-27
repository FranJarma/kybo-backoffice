# Sonido activado por defecto

Pedido explícito: habilitar por defecto los avisos ya implementados en Comandas y pantalla de clientes.

- Al montar `useReadySound`, intentar activar Web Audio automáticamente; solo mostrarlo habilitado si el contexto realmente funciona.
- Si el navegador exige interacción, reintentar desde el primer clic/toque o tecla de la pantalla. No bloquear operaciones de pedidos por audio.
- El botón permite silenciar; respetar esa decisión durante la apertura actual, sin que otra interacción reactive el audio. Excluir el control de sonido del manejador global para evitar que el primer toque lo active y silencie a la vez.
- Conservar aviso único, historial inicial silencioso, reintentos, limpieza al cerrar y soporte de navegadores sin Web Audio. No reproducir un pip al activar ni avisos acumulados.
- Pruebas de navegador con API/audio simulados: habilitación automática en ambas pantallas, desbloqueo con la primera acción ordinaria, activación explícita tras bloqueo, silencio manual respetado, errores e histórico sin avisos. Ejecutar las pruebas unitarias de audio, tipos y lint.

Sin migraciones, cambios de datos o configuración del navegador del usuario, commit ni push.

## Verificación

- RED: la prueba de apertura detectó cero contextos de audio, porque antes se esperaba la activación manual.
- GREEN: 16 pruebas unitarias/de render y 11 pruebas de navegador de audio. La apertura real de la pantalla pública con API simulada también pasó. Se verificaron activación automática, desbloqueo con la primera interacción de ambas pantallas, control explícito tras bloqueo, silencio manual, histórico/paginación, reintentos, reconexión y cierre.
- La simulación de bloqueo exige eventos reales de interfaz: la inyección de scripts de Playwright puede activar temporalmente `navigator.userActivation`, por lo que no se usa esa bandera como sustituto de un clic real en estas pruebas.
- TypeScript, ESLint de los archivos afectados y `git diff --check`: correctos.
- Evidencia descartable: `.next-e2e/default-sound-{red,unit,browser,browser-final,types,lint}.log`. La primera corrida completa detectó una suposición incorrecta del fixture sobre la activación de Playwright; se corrigió y la repetición pasó 11/11.
- Referencia de la restricción de Web Audio: https://developer.chrome.com/blog/autoplay/#web_audio . No se cambiaron políticas ni permisos del navegador para el usuario.
