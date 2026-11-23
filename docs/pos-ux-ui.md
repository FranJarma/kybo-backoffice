# Superficie POS

El contrato funcional y el mapa de interfaces están en [el plan](superpowers/plans/2026-11-20-ux-ui-pos-improvements.md). La base verificada es main b5946319.

## Excepción visual acotada

El POS aplica Barlow, azul #013E5E, naranja #FF8000, tarjetas #FFFAF0, superficie #F3F6F8, bordes #D5E1E8 y texto secundario #567184. DESIGN.md conserva Manrope y la paleta administrativa para los demás módulos. Los portales de cobro/configuración llevan la misma clase de superficie, sin sobrescribir el tema global.

Se reutilizan Button, Dialog, Input, SearchCombobox, formato monetario y avisos existentes. Los controles mantienen 44 px como mínimo; las acciones principales usan 48–56 px. Un único catálogo y pedido permanecen montados al cambiar ancho o vista.

## Reglas que prevalecen sobre el prototipo

- Cupón de tarjeta requerido por política del servidor.
- Mostrador exige cobro completo; mesa/delivery conservan sus caminos de pago pendiente.
- Los productos proceden del catálogo real. Las tarjetas usan las fotos y paletas suministradas por Francisco cuando tienen asociación por UUID; los demás conservan su foto del catálogo y fondo neutro. Detalle en [fotos y paletas del POS](pos-product-assets.md).
- Transferencia manual requiere confirmación explícita de acreditación. Titular y operación son opcionales y no requieren cliente.
- Recibido y vuelto son ayuda operativa; el servidor recibe exclusivamente monto aplicado.
- Reintentar una operación incierta conserva requestId y payload; impresión conserva recuperación independiente.

## Decisiones de integración

| Decisión                                                               | Motivo                                                              | Límite o costo                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Checkout independiente en la rama exacta                               | El .git original es de lectura y contiene trabajo local del usuario | El código debe incorporarse al checkout habitual para verlo en su localhost                 |
| Cupón de tarjeta obligatorio                                           | La política del servidor lo exige                                   | El campo difiere del ejemplo opcional del prototipo                                         |
| Titular de transferencia en referencia legible                         | El contrato actual persiste una sola referencia                     | Límite conjunto de 120 caracteres; un reporte estructurado futuro necesitaría otro contrato |
| Apariencia por identidades verificadas y fallback neutro               | No hay color de producto persistido; los nombres pueden cambiar     | Los nuevos IDs requieren configuración visual para tener una paleta específica              |
| Registro y empaquetado de revisión con herramientas nativas de Windows | La sesión no dispone de los scripts Unix del flujo                  | La evidencia y los gates equivalentes se registran en la verificación                       |
