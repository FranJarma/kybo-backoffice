# Dirección central de sucursal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Buscar y confirmar la dirección de la sucursal para configurar automáticamente el punto de fichaje.

**Architecture:** Tabla opcional branch_addresses y API administrativa propia; Photon se consulta exclusivamente desde el servidor con caché y límites. Un formulario con SearchCombobox y mapa configura el punto. Asistencia consume ese punto y los guardados sincronizan su copia compatible bajo los mismos bloqueos.

**Tech Stack:** Next16, React19, Drizzle/PostgreSQL, Zod, SearchCombobox, Radix Dialog, Photon y OpenStreetMap embebido. Sin nuevas dependencias.

**Spec:** docs/superpowers/specs/2026-10-29-branch-address-design.md

## Global Constraints
- Sin commit ni push. No aplicar0031 ni escribir datos reales en Neon sin autorización nueva.
- Respetar trabajo pendiente de Asistencia, Sucursales y documentos de otros chats.
- Consultas de dirección solo para administradores; GPS de empleados nunca se envía al proveedor.
- Sin tabla nueva, compatibilidad explícita con instalación anterior.

## Review Focus
- Resultados del mismo número/calle en ciudades diferentes: nunca seleccionar el primero silenciosamente.
- Respuestas tardías o fallo del proveedor: no reemplazar un punto confirmado ni guardar un borrador incongruente.
- Cambio de punto concurrente con configuración/fichaje: bloqueo branch→attendance→address consistente y actualización atómica.
- Guardados con rol forjado, usuario revocado o revisión vieja: ninguna escritura.
- Formulario antes de migrar, con teclado y en móvil: estado claro, foco y confirmación accesibles.

### Task 1: Modelo, búsqueda y guardado central
**Files:** drizzle/0031_branch_addresses.sql, journal, db/branch-address-schema.ts, db/schema.ts, modules/branches/{geocoding,address}.ts, api/branches/[id]/address/{route,search/route}.ts; tests/helpers/data-model-database.ts; tests/branch-address*.test.ts.
**Interfaces:** searchAddresses(query) retorna GeocodedAddress[]; readBranchAddress(db,actor,branchId) retorna {ready,address}; saveBranchAddress(db,actor,branchId,input) valida/guarda/sincroniza. getSavedBranchAddress(tx,branchId) permite lectura interna compatible con tabla ausente. Todos los puntos son finitos y confirmados explícitamente.
- [x] Pruebas RED de normalización de candidatos, ciudades distintas, errores, caché; restricciones SQL, permisos/revisión y sincronización de asistencia.
- [x] Implementar migración y guardados con bloqueo exclusivo de branch antes del lock de attendance; configure ya posee branch compartido y attendance exclusivo antes de leer address.
- [x] Verificar pruebas enfocadas en PGlite y estado previo sin0031.

### Task 2: Ficha de sucursal y configuración de asistencia
**Files:** components/branches/address.tsx y estilos; integración manager; settings/branches/page.tsx; components/attendance/settings.tsx; modules/attendance/scheduling.ts; tests de UI/asistencia.
**Interfaces:** BranchAddress recibe branchId/name y puede notificar punto guardado; el resumen de Asistencia consulta el GET propio y envía las coordenadas obtenidas al configure existente; el servidor les da prioridad al punto guardado.
- [x] Prueba RED de Asistencia sin coordenadas manuales principales y con vínculo a la dirección de la sucursal.
- [x] Implementar Autocomplete, resultados explícitos, mapa, ajuste avanzado, confirmación e invalidación; selección por URL de la sucursal al seguir el enlace desde Asistencia.
- [x] Verificar tipos, lint, suites enfocadas y UI real descartable en escritorio/móvil. Revisión independiente única de este alcance; corregir hallazgos importantes y dejar0031 pendiente de autorización.

## Entrega y activación

El usuario autorizó específicamente aplicar únicamente0031 en Neon al finalizar la implementación. Se aplicó y verificó en una nueva conexión:32 migraciones registradas con hashes/fechas verificados, branch_addresses vacía, contenido de tablas preexistentes y .env preservados. La dirección real de Alberdi no fue guardada ni se cambiaron puntos de fichaje en Neon: Administración debe elegir la coincidencia de Salta Capital, revisar el marcador y confirmarlo.

Verificación:66 pruebas enfocadas en13 suites, comprobación de tipos y lint sin errores. Tras conservar la opción de dirección guardada al abrir el Autocomplete, se repitieron9 pruebas de UI/reconciliación/filtro, además de tipos y lint del componente. Se verificaron escritorio y teléfono390, mapa real, selección explícita, confirmación obligatoria, sincronización a Asistencia y recuperación de revisiones/guardados inciertos en una base local descartable. Se mantiene sin commit ni push.
