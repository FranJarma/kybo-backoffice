# Actualizar grupos modificadores y recetas configurables

Esta actualización agrega tablas de grupos, opciones, asignaciones y composición histórica de ventas. No elimina las recetas ni reconstruye consumos de ventas anteriores. No integra todavía Fudo/Mercado Pago ni descuenta stock por vender.

## Antes de actualizar

1. Hacer una copia o rama de respaldo de la base actual. Conservar el código anterior y el `.env` de la instalación.
2. Probar esta entrega en una copia de desarrollo antes de usarla durante atención al público. La validación visual y la concurrencia real de Neon requieren completar los controles indicados en `verification-modifiers.md`.
3. Detener la aplicación para no mezclar procesos con distintas versiones del esquema y del código.

## Instalar

Usar Node 24 o superior y los archivos del proyecto actualizado. Conservar el `.env` propio; el ZIP no incluye credenciales.

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

El proyecto entregado conserva `package-lock.json`; `npm ci` respeta esas versiones. No ejecutar `db:push`, reset ni borrar tablas para esta actualización. La migración siguiente a 0005 debe aplicarse una sola vez a través del migrador.

## Configurar

1. En **Productos y recetas → Grupos modificadores**, crear un grupo, por ejemplo Perlas. Sus opciones pueden aportar ingredientes o instrucciones de preparación.
2. Crear una **Nueva receta configurable** para el producto. Cargar solo los ingredientes permanentes como fijos y asignar los grupos.
3. Definir mínimos, máximos, cantidades iniciales y recargos por canal. Cero debe cargarse explícitamente; dejar vacío significa sin precio.
4. El factor escala ingredientes heredados. Una composición propia reemplaza la heredada y usa cantidades finales por elección.
5. Publicar y usar **Comparar combinaciones** para revisar cantidades y costo. Los costos faltantes continúan pendientes.
6. Para una receta anterior, usar **Convertir a modificadores**. Revisar los grupos propuestos, sus nombres, cantidades y precios antes de publicar. La preparación de la conversión es un borrador: no crea grupos hasta guardar la receta. Grupos y receta se publican en una sola transacción; la versión anterior se conserva.
7. Al vender, elegir opciones. El renglón conserva toda su configuración; su cantidad repite esa configuración completa. Comandas consulta los nombres e instrucciones de la venta, no los del catálogo actual.

Editar un grupo no actualiza automáticamente productos ligados. Revisar su nueva versión dentro de cada receta y publicar la adopción. Archivar un grupo impide asignaciones nuevas; retirar una opción de un producto requiere una nueva versión de receta.

## Verificar en la instalación

- Abrir una venta y una producción anteriores y comparar importes con el respaldo.
- Crear dos configuraciones del mismo producto y confirmar que se muestran separadas en venta y cocina.
- Comprobar que el personal no accede al costeo ni a la administración de grupos.
- Simular un corte de conexión tras confirmar y reintentar el mismo envío; debe existir una sola venta.
- Ejecutar pruebas de venta/publicación simultánea en una base de prueba PostgreSQL con conexiones independientes.

## Recuperación

No borrar tablas nuevas ni revertir con SQL destructivo. Si hace falta volver atrás, detener escrituras, conservar los registros posteriores y evaluar el respaldo con conciliación de esas operaciones. Restaurar un respaldo sin esa conciliación perdería ventas posteriores. No ejecutar esta recuperación automáticamente.
