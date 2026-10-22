import { z } from "zod";

export const GUIDANCE_CATEGORIES = ["learning", "setup", "rule", "general"] as const;
export type GuidanceCategory = (typeof GUIDANCE_CATEGORIES)[number];

export const guidanceCategorySchema = z.enum(GUIDANCE_CATEGORIES);

export const createGuidanceNoteSchema = z.object({
  category: guidanceCategorySchema.default("learning"),
  title: z.string().trim().max(200, "Title cannot exceed 200 characters").optional().default(""),
  body: z
    .string()
    .trim()
    .min(3, "Note body must be at least 3 characters")
    .max(10000, "Note body cannot exceed 10,000 characters"),
});

export type CreateGuidanceNoteInput = z.infer<typeof createGuidanceNoteSchema>;

export const updateGuidanceBodySchema = z.object({
  body: z
    .string()
    .max(100000, "Guidance body cannot exceed 100,000 characters"),
});

export type UpdateGuidanceBodyInput = z.infer<typeof updateGuidanceBodySchema>;

export const listGuidanceNotesQuerySchema = z.object({
  category: guidanceCategorySchema.optional(),
  status: z.enum(["pending", "accepted", "all"]).default("all"),
  sort: z.enum(["top", "newest"]).default("top"),
});

export type ListGuidanceNotesQuery = z.infer<typeof listGuidanceNotesQuerySchema>;
