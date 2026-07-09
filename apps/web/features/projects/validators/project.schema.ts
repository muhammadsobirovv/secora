import { z } from "zod";

export const projectStatusValues = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export const projectVisibilityValues = ["PRIVATE", "WORKSPACE", "PUBLIC"] as const;

export const projectFormSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  description: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(projectStatusValues).optional(),
  visibility: z.enum(projectVisibilityValues).optional(),
});
export type ProjectFormValues = z.infer<typeof projectFormSchema>;
