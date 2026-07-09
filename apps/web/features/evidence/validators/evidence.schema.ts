import { z } from "zod";

export const evidenceTypeValues = [
  "SCREENSHOT",
  "HTTP_REQUEST",
  "HTTP_RESPONSE",
  "FILE",
  "LOG",
  "VIDEO",
] as const;

export const evidenceFormSchema = z.object({
  type: z.enum(evidenceTypeValues),
  title: z.string().min(1, "Title is required.").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  textContent: z.string().max(100_000).optional().or(z.literal("")),
});
export type EvidenceFormValues = z.infer<typeof evidenceFormSchema>;
