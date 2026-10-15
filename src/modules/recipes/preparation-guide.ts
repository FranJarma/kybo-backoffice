import { z } from "zod";

export const preparationGuideSchema = z
  .object({
    steps: z.array(z.string().trim().min(1).max(1000)).max(50),
    estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
    observations: z.string().trim().max(2000),
  })
  .strict();
export type PreparationGuide = z.output<typeof preparationGuideSchema>;
