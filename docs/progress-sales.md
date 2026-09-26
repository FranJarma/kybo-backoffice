# SDD ledger — plan: docs/superpowers/plans/2026-09-25-ventas.md

Base: 8a348d4. Nueva rama feat/pos-sales en checkout Next aislado del sitio original.
Pre-flight: servicios exportan DTO sin costos; UI y API comparten validación; idempotencia reutiliza ledger transaccional. Sin conflicto de interfaces.
Estado: implementación y revisión completas; entrega local 0.4.0.

Task 1: complete. Baseline 78/78. RED: servicio ausente. GREEN: 89/89 pruebas. Typecheck corregido usando accessMode de Drizzle. Fixture de pago dividido corregido para buscar por referencia/importe: el orden entre cobros simultáneos no es un contrato. No se modificó el comportamiento para satisfacer una posición arbitraria.
Task 2: en curso. E2E RED: falta encabezado/ruta de Ventas, confirmado en navegador.

Task 2: complete. E2E RED rutas ausentes; GREEN 3/3 flujos nuevos. Se reprodujo RED del acceso de personal (layout antiguo bloqueaba) y recarga de venta confirmada (faltaba URL de cuenta); ambos corregidos. Suite completa GREEN 17/17. Un intento previo fue 15/17 por límite de logins de la fixture; sesión temporal reutilizada, sin cambiar protección de producción. Dominio 89/89, build/typecheck/lint sin errores. Ajustes visuales finales: mesas móviles en tarjetas, canales compactos y precio unitario legible.
Verificación visual final y flujos de ventas: 3/3 aprobados después de ajustar etiqueta de precio y posición de scroll en capturas.

Final: minor (deferred): el detalle de un reintento simultáneo con otra modificación puede mezclar versiones de lectura; las escrituras permanecen protegidas. Requiere lectura coherente antes de operación simultánea real.
Final: minor (deferred): pedidos con observaciones extensas pueden superar 20.000 bytes aunque cada campo sea válido. El servidor rechaza sin guardar; el borrador permanece en pantalla.
Final: Ruling: funciones operativas e integraciones aplazadas — se conserva el alcance local autorizado, visible en README/interfaz — falta completar preparación, stock, pagos externos, fiscal, offline, tiempos y despliegue antes de sustituir Fudo.
Final: Ruling: Neon multiconexión y equipamiento no ejecutados — se validaron migraciones y dominio en PostgreSQL embebido, con análisis estático de locks — falta comprobar concurrencia y entorno real al integrar.
Final: Ruling: el revisor no repitió pruebas/capturas — revisión independiente estática, evidencia ejecutada y capturas inspeccionadas por el implementador — no hay una segunda reproducción independiente de esos resultados.
Entrega: se conserva feat/pos-sales y el checkout local; sin publicar, conectar servicios ni modificar el sitio original. Archivo fuente 0.4.0 con instrucciones de instalación/actualización.
