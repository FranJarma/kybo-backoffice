# Task 7 · Paletas de productos del POS

Confirmé nueve correspondencias entre las tarjetas canónicas y las identidades activas. Los valores se leyeron de los rellenos de Figma. El cruce de identidades se hizo una vez para preparar este mapa con los metadatos locales revisados. En ejecución, la clave es exclusivamente `productId`.

## Evidencia de diseño

Las tres filas del catálogo desktop contienen las mismas nueve identidades que las variantes tablet y celular. En cada tarjeta verifiqué sus 64 rellenos. Cada fila de ocho celdas tiene un único color y cada fila mide 19 px en un semicírculo de 152 px de diámetro. La tabla indica las corridas consecutivas de arriba hacia abajo y el ID local de la primera capa de cada corrida, dentro de la instancia de la tarjeta.

[Catálogo desktop](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-686) · [Tablet](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=186-2136) · [Celular](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=186-2972) · [Página canónica](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=159-666)

| Tarjeta Figma | Producto activo | `productId` | Color × filas de 19 px (capa inicial) |
| --- | --- | --- | --- |
| [Oreo Iced Latte · 160:750](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-750) | Oreo Iced Latte | `d8667694-d0b4-49ff-90cb-e72f3cc6aa17` | `#E9CEAE` × 2 (`164:1230`) · `#D2A775` × 2 (`164:1246`) · `#A87345` × 2 (`164:1262`) · `#68432F` × 1 (`164:1278`) · `#352B26` × 1 (`164:1286`) |
| [Kybo Shake · 160:756](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-756) | Kybo Shake | `36145bed-d3f4-4ddc-9289-1097992cd692` | `#F6E3BF` × 2 (`164:1230`) · `#EDD0A0` × 3 (`164:1246`) · `#DAB57F` × 2 (`164:1270`) · `#C29560` × 1 (`164:1286`) |
| [Shake Oreo · 160:762](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-762) | Kybo Shake Oreo | `a83e25f6-8b50-493f-a9fe-57ba74a03533` | `#F1E4D1` × 2 (`164:1230`) · `#DAC4AA` × 3 (`164:1246`) · `#9F7C60` × 1 (`164:1270`) · `#614A3B` × 1 (`164:1278`) · `#342C27` × 1 (`164:1286`) |
| [Shake Taro · 160:769](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-769) | Kybo Shake Taro | `d47f268b-2d57-4642-a9ff-5695aa0c2ce7` | `#E7DAF0` × 2 (`164:1230`) · `#C4A4E4` × 3 (`164:1246`) · `#A67ACB` × 2 (`164:1270`) · `#71518D` × 1 (`164:1286`) |
| [Kybo Frozen · 160:775](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-775) | Kybo Frozen | `30a9fd90-2f51-41b1-839c-8760f54b20a6` | `#FFE29A` × 2 (`164:1230`) · `#FFC14A` × 3 (`164:1246`) · `#FFA329` × 1 (`164:1270`) · `#E87325` × 1 (`164:1278`) · `#DC4C36` × 1 (`164:1286`) |
| [Soft Chocolate · 160:781](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-781) | Kybo Soft Sundae Chocolate | `35f4099a-a0d5-4f0d-afa5-ab5dfff9b1c9` | `#F0D4BA` × 2 (`164:1230`) · `#B98666` × 3 (`164:1246`) · `#956043` × 1 (`164:1270`) · `#69422D` × 1 (`164:1278`) · `#493026` × 1 (`164:1286`) |
| [Soft Frutilla · 160:788](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-788) | Kybo Soft Sundae Frutilla | `1685d383-5581-459f-a5c4-2777331c243e` | `#FFE0DF` × 2 (`164:1230`) · `#F6B1BC` × 3 (`164:1246`) · `#ED849C` × 1 (`164:1270`) · `#D95776` × 1 (`164:1278`) · `#B53859` × 1 (`164:1286`) |
| [Soft Frutos rojos · 160:794](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-794) | Kybo Soft Sundae Frutos rojos | `1bee7489-5ee8-4e93-a586-d85629cef23f` | `#F1D4E4` × 2 (`164:1230`) · `#D99DB8` × 3 (`164:1246`) · `#B66794` × 1 (`164:1270`) · `#914468` × 1 (`164:1278`) · `#693950` × 1 (`164:1286`) |
| [Cappuccino · 160:800](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=160-800) | Cappuccino | `3efc7be3-52af-402e-9990-350d0f1599f4` | `#F6E1BE` × 2 (`164:1230`) · `#E8BE8F` × 3 (`164:1246`) · `#C38D5B` × 1 (`164:1270`) · `#A26B43` × 1 (`164:1278`) · `#795037` × 1 (`164:1286`) |

El Oreo Iced Latte tiene una quinta banda inferior `#352B26`, desde y=133 px. En las tarjetas de cuatro bandas, la altura varía por color. Usar una gradiente lineal sin repetición con límites acumulados de 19 px conserva las bandas aprobadas sin construir una grilla de celdas. El contenedor del semicírculo sigue siendo de 152 px.

Taro Iced Latte, Matcha Iced Latte y Kybo Tea son productos activos, pero no aparecen como tarjetas con paleta propia en el catálogo desktop, tablet, celular ni en los nodos canónicos de venta y fundamentos. Shake Taro tiene una identidad distinta. Para esas tres bebidas y cualquier otro ID sin diseño verificado, se aplica el fallback neutro existente. [Venta](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=196-3981) · [Fundamentos](https://www.figma.com/design/C0M35OEPwFwn7aqaabqKaq?node-id=196-3983)

## Mapeo sugerido

El mapa puede vivir junto a `productAppearance`. Cada entrada suma ocho filas. La consulta al mapa devuelve la apariencia neutra si el ID no está presente. Las fotografías siguen el `imageAssetId` del catálogo real.

```ts
type Stripe = readonly [color: `#${string}`, rows: 1 | 2 | 3];
type CardPalette = readonly Stripe[];

const productStripePalettes: Readonly<Partial<Record<string, CardPalette>>> = {
  "d8667694-d0b4-49ff-90cb-e72f3cc6aa17": [["#E9CEAE", 2], ["#D2A775", 2], ["#A87345", 2], ["#68432F", 1], ["#352B26", 1]],
  "36145bed-d3f4-4ddc-9289-1097992cd692": [["#F6E3BF", 2], ["#EDD0A0", 3], ["#DAB57F", 2], ["#C29560", 1]],
  "a83e25f6-8b50-493f-a9fe-57ba74a03533": [["#F1E4D1", 2], ["#DAC4AA", 3], ["#9F7C60", 1], ["#614A3B", 1], ["#342C27", 1]],
  "d47f268b-2d57-4642-a9ff-5695aa0c2ce7": [["#E7DAF0", 2], ["#C4A4E4", 3], ["#A67ACB", 2], ["#71518D", 1]],
  "30a9fd90-2f51-41b1-839c-8760f54b20a6": [["#FFE29A", 2], ["#FFC14A", 3], ["#FFA329", 1], ["#E87325", 1], ["#DC4C36", 1]],
  "35f4099a-a0d5-4f0d-afa5-ab5dfff9b1c9": [["#F0D4BA", 2], ["#B98666", 3], ["#956043", 1], ["#69422D", 1], ["#493026", 1]],
  "1685d383-5581-459f-a5c4-2777331c243e": [["#FFE0DF", 2], ["#F6B1BC", 3], ["#ED849C", 1], ["#D95776", 1], ["#B53859", 1]],
  "1bee7489-5ee8-4e93-a586-d85629cef23f": [["#F1D4E4", 2], ["#D99DB8", 3], ["#B66794", 1], ["#914468", 1], ["#693950", 1]],
  "3efc7be3-52af-402e-9990-350d0f1599f4": [["#F6E1BE", 2], ["#E8BE8F", 3], ["#C38D5B", 1], ["#A26B43", 1], ["#795037", 1]],
};
```
