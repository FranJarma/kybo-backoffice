export const photoVariants = ["original", "thumbnail", "preview"] as const;
export type PhotoVariant = (typeof photoVariants)[number];

export const photoDimensions = { thumbnail: 128, preview: 384 } as const;
