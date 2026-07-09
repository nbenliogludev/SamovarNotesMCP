import type { ConnectionTestResult, PublicConnectionSettings } from "../../preload";

export type { ConnectionTestResult, PublicConnectionSettings };

export type AppInfo = {
  name: string;
  subtitle: string;
  version: string;
  platform: NodeJS.Platform;
  packaged: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type SettingsFormState = {
  openAiApiKey: string;
  openAiModel: string;
  notionToken: string;
};

export type Screen = "settings" | "chat";
