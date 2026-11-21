import Image from "next/image.js";

// Normalize the browser bundle's CJS wrapper around Next's actual Image.
const importedImage = Image as typeof Image & { default?: typeof Image };
export default importedImage.default ?? importedImage;
