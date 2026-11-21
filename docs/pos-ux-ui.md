# Superficie POS

El contrato funcional y el mapa de interfaces están en [el plan](superpowers/plans/2026-11-20-ux-ui-pos-improvements.md). La base verificada es main b5946319.

## Excepción visual acotada

El POS aplica Barlow, azul #013E5E, naranja #FF8000, tarjetas #FFFAF0, superficie #F3F6F8, bordes #D5E1E8 y texto secundario #567184. DESIGN.md conserva Manrope y la paleta administrativa para los demás módulos. Los portales de cobro/configuración llevan la misma clase de superficie, sin sobrescribir el tema global.

Se reutilizan Button, Dialog, Input, SearchCombobox, formato monetario y avisos existentes. Los controles mantienen 44 px como mínimo; las acciones principales usan 48–56 px. Un único catálogo y pedido permanecen montados al cambiar ancho o vista.

## Reglas que prevalecen sobre el prototipo

- Cupón de tarjeta requerido por política del servidor.
- Mostrador exige cobro completo; mesa/delivery conservan sus caminos de pago pendiente.
- Fotos y productos proceden del catálogo real; fallback neutro para IDs sin identidad visual configurada.
- Transferencia manual requiere confirmación explícita de acreditación. Titular y operación son opcionales y no requieren cliente.
- Recibido y vuelto son ayuda operativa; el servidor recibe exclusivamente monto aplicado.
- Reintentar una operación incierta conserva requestId y payload; impresión conserva recuperación independiente.
