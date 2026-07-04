import type { NotionOAuthEvent, NotionWorkspace } from "../../preload";

export type { NotionOAuthEvent, NotionWorkspace };

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

export type Screen = "connect" | "chat";
