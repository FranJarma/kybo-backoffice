// Keep camera captures below the hosting request limit while preserving a readable ticket.
export async function cashUploadImage(file: File): Promise<Blob> {
  const budget = 3 * 1024 * 1024;
  if (file.size <= budget) return file;
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const ratio = Math.min(1, 2800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context)
      throw Error("No pudimos preparar la foto. Elegí otra imagen.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.82, 0.72]) {
      const result = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (result && result.size <= budget) return result;
    }
    throw Error(
      "La foto es demasiado grande. Probá con una toma más cercana del comprobante.",
    );
  } finally {
    bitmap.close();
  }
}
