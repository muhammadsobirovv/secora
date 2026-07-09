import { z } from "zod";

export const targetTypeValues = [
  "DOMAIN",
  "SUBDOMAIN",
  "URL",
  "IP_ADDRESS",
  "CIDR",
  "API",
  "MOBILE_APP",
  "INTERNAL_ASSET",
] as const;

export const targetEnvironmentValues = ["PRODUCTION", "STAGING", "DEVELOPMENT", "UNKNOWN"] as const;
export const targetScopeStatusValues = ["IN_SCOPE", "OUT_OF_SCOPE", "PENDING_REVIEW"] as const;

export const targetFormSchema = z.object({
  type: z.enum(targetTypeValues),
  value: z.string().min(1, "Value is required.").max(500),
  name: z.string().max(100).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  environment: z.enum(targetEnvironmentValues).optional(),
  scopeStatus: z.enum(targetScopeStatusValues).optional(),
});
export type TargetFormValues = z.infer<typeof targetFormSchema>;
