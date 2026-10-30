# Sucursales y ubicaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganizar la administración de sucursales en tres pestañas legibles y adaptables.

**Architecture:** BranchManager selecciona la sucursal y un workspace por sucursal conserva las pestañas visitadas. Los formularios de creación se abren bajo demanda; se conservan las APIs y sus validaciones. Una función pura deriva el acceso efectivo, incluyendo administradores globales.

**Tech Stack:** Next 16.3.6, React 19.3, Radix Tabs/Dialog, Tailwind, SearchCombobox, Vitest.

**Spec:** docs/superpowers/specs/2026-10-29-branches-interface-design.md

## Global Constraints

- Sin commit ni push, migraciones ni cambios de negocio en Neon.
- Reutilizar SearchCombobox para relaciones; conservar el trabajo previo y la rama actual.
- No modificar autorizaciones ni reglas de archivado.

## Review Focus

- Preferencia de sucursal inexistente y lista vacía: no operar con identificadores obsoletos.
- Respuesta tardía de otra sucursal o producto: no mostrar ni guardar sus datos.
- Borradores al cambiar pestañas: conservarlos hasta guardar o cerrar explícitamente.
- Administrador sin membresía local: mostrar acceso global, no falso acceso deshabilitado.
- Móvil y teclado: sin desbordamiento de página, pestañas navegables, foco visible y controles etiquetados.

### Task 1: Administración por pestañas y formularios contextuales

**Files:** src/components/branches/{manager,members,product-settings}.tsx, nuevos workspace.tsx, forms.tsx, presentation.ts y branches.css; settings/branches/page.tsx; api/branches/[id]/members/route.ts; tests/branch-settings.unit.test.ts.

**Interfaces:** resolveBranchSelection(rows, selected, preferred) retorna un id disponible o vacío; memberAccess(member) deriva enabled/label/global. BranchManager recibe initialBranchId. La API de miembros agrega accountRole, sin modificar PUT.

- [x] Escribir pruebas de selección actual/obsoleta/vacía y acceso efectivo; comprobar fallo inicial.
- [x] Implementar selección, cabecera, pestañas, listas, formularios independientes y confirmación de archivado con las APIs actuales.
- [x] Actualizar accesos y productos; proteger cargas y guardados, conservar borradores y distinguir alcance local/global.
- [x] Ejecutar pruebas enfocadas, comprobación de tipos y lint. Verificar la app real en escritorio/tablet/móvil con datos descartables.
- [x] Revisión independiente del diff de esta mejora y corrección de problemas importantes. Conservar todo sin commit ni push.
