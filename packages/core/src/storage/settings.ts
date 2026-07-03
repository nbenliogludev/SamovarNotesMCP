import { z } from "zod";

export const appSettingsSchema = z.object({
  openAiApiKey: z.string().trim().optional(),
  openAiModel: z.string().trim().default("gpt-4.1-mini"),
  notionAuthMode: z.enum(["oauth", "token"]).default("oauth"),
  notionToken: z.string().trim().optional(),
  notionParentPageId: z.string().trim().optional(),
  webResearchEnabled: z.boolean().default(false)
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  openAiModel: "gpt-4.1-mini",
  notionAuthMode: "oauth",
  webResearchEnabled: false
};
