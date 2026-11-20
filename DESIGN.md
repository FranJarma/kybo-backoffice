---
name: Kybo Operations
description: Sistema operativo para el equipo de Kybo, pensado para PC, tablet y celular.
colors:
  primary: "#ff8500"
  primary-ink: "#9a4b00"
  primary-soft: "#fff5e9"
  brand: "#071b42"
  ink: "#10264a"
  blue: "#0669db"
  blue-soft: "#eaf4ff"
  muted: "#5c6f8b"
  surface: "#f4f7fb"
  line: "#e2eaf3"
  white: "#ffffff"
typography:
  body:
    fontFamily: "Manrope, Arial, Helvetica, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 650
rounded:
  control: "9px"
  panel: "13px"
  dialog: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  field: "12px"
  group: "16px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
    height: "44px"
  button-outline-primary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    height: "44px"
  button-operative:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.brand}"
    rounded: "{rounded.control}"
    height: "48px"
---

# Design System: Kybo Operations

## Overview

Interfaz de operación clara: reconocer el pedido, completar la tarea y seguir atendiendo. Refinamiento de la identidad existente; conservar logo, Manrope, naranja, azul oscuro, azul de interacción y fotos reales. Las decisiones de esta guía consolidan la auditoría aprobada del 3 de noviembre de 2026.

La densidad depende del trabajo: POS y cobro priorizan uso táctil; administración facilita comparar filas; la pantalla pública se lee a distancia. Compartir componentes y significados no exige copiar el mismo diseño de página.

## Colors

- Naranja `primary`: confirmar, crear o finalizar. Usar texto `brand` encima.
- Naranja oscuro `primary-ink`: texto, icono y borde del botón outlined naranja. El naranja de relleno sobre blanco no sirve como texto pequeño.
- Azul `blue`: selección de pestañas, enlaces y foco. Evitar hover naranja en acciones secundarias de navegación.
- `ink`: lectura principal; `muted`: etiquetas secundarias y ayuda legible. No aclararlo por decoración.
- `surface`, blanco y `line`: separar áreas de trabajo sin acumular contenedores.
- Estados: verde completado, ámbar atención, rojo error o destrucción, siempre con texto o señal adicional.

## Typography

Manrope como familia compartida. Título de página, título de sección, etiqueta y ayuda tienen funciones distintas. Mantener el perfil compacto del POS y sus cantidades visibles. Datos operativos no deben depender de microtexto de 10–11px. Importes y cantidades usan cifras tabulares; unidades explícitas.

## Layout

Escala de espacios 4/8/12/16/24/32px. Agrupar etiqueta, campo y ayuda; separar bloques de decisión con 24px. La base de página usa 24px laterales en escritorio y 16px en móvil. Las listas administrativas priorizan comparación: Editar visible y secundarios en un menú cuando su apilado aumenta la fila.

Conservar borradores al cambiar de vista donde ya se conservan. En formularios largos, encabezado y acciones se mantienen fuera del área desplazable. En pantallas muy bajas, permitir desplazar toda la ficha para que el teclado no impida salir.

## Elevation & Depth

Paneles planos con borde fino. Sombra reservada para capas flotantes y diálogos. El diálogo existente usa `0 24px 80px #071b4229`; el foco es un contorno funcional azul, no una sombra decorativa.

## Shapes

Controles de 9px, paneles de 13px y diálogos de 16px de radio. Cápsulas para filtros, no para cada superficie. Iconos Lucide: aproximadamente 16px en acciones y 20px en navegación; el área pulsable es independiente del dibujo.

## Components

- **Button:** autoridad de variante y tamaño. Base y auxiliares de 44px; `lg` y perfiles operativos de 48px. Las variantes pequeñas reducen texto/padding, no el área táctil. Las utilidades explícitas de tamaño deben funcionar, sin sobrescrituras globales que las anulen.
- **Tabs:** componente Radix compartido con subrayado y texto azul; mínimo 48px. Flechas/Home/End, un único Tab de entrada, panel asociado y foco visible. No convertir filtros ni enlaces entre páginas en pestañas locales.
- **Campos:** etiqueta visible y requerido/opcional explícito; foco azul. Relación con búsqueda mediante `SearchCombobox`. Errores cercanos al campo, con recuperación concreta.
- **Dialog:** foco inicial apropiado y regreso al disparador al cerrar; respetar manejadores especializados y anidación. Fichas simples usan anchos moderados; fichas complejas admiten más espacio y pie accesible.
- **POS:** controles en línea, pocas interacciones, cliente y localizador accesibles, reserva de espacio para el pedido. No añadir modales para tareas que ya se resuelven en línea.
- **Producto:** una explicación de IVA; precio de Mostrador requerido visible. Canales opcionales revelan su precio al habilitarse y conservan el borrador al deshabilitarlos.

## Do's and Don'ts

- Usar naranja para una acción dominante y azul para selección/foco.
- Verificar contraste real en normal, hover y foco; los colores de marca tienen roles diferentes.
- Preservar validaciones, bloqueos durante envíos, revisión antes de guardar y formularios en curso.
- No separar búsqueda y select para clientes, insumos u otras relaciones.
- No volver a definir Button, foco o pestañas por módulo sin una necesidad documentada.
- No reducir objetivos táctiles para conseguir más filas; reducir acciones repetidas y espacio innecesario.
