import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizePhoto } from "../src/modules/media/image";
import { canSellProduct } from "../src/modules/products/availability";
describe("fotos y disponibilidad", () => {
  it("normaliza y reduce fotos sin metadatos", async () => {
    const raw = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "#ffeeaa" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const photo = await normalizePhoto(raw);
    const meta = await sharp(photo.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
    expect(meta.exif).toBeUndefined();
  });
  it("rechaza SVG y archivos grandes antes de decodificar", async () => {
    await expect(
      normalizePhoto(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        ),
      ),
    ).rejects.toThrow();
    await expect(
      normalizePhoto(Buffer.alloc(4 * 1024 * 1024 + 1)),
    ).rejects.toThrow();
  });
  it("combina canal y disponibilidad local sin inventar precios", () => {
    const p = {
      archivedAt: null,
      enabledCounter: true,
      enabledPedidosYa: false,
      enabledUberEats: true,
    };
    expect(
      canSellProduct(
        p,
        { enabled: true, temporarilySoldOut: false },
        "counter",
      ),
    ).toBe(true);
    expect(
      canSellProduct(p, { enabled: true, temporarilySoldOut: true }, "counter"),
    ).toBe(false);
    expect(
      canSellProduct(
        p,
        { enabled: true, temporarilySoldOut: false },
        "pedidosya",
      ),
    ).toBe(false);
    expect(canSellProduct(p, undefined, "counter")).toBe(false);
  });
});
