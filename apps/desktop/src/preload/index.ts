import { contextBridge, ipcRenderer } from "electron";

export type PublicConnectionSettings = {
  hasOpenAiApiKey: boolean;
  hasNotionToken: boolean;
  isConfigured: boolean;
  openAiModel: string;
  notionParentPageId?: string;
  updatedAt?: string;
};

export type SaveConnectionSettingsInput = {
  openAiApiKey?: string;
  openAiModel?: string;
  notionToken?: string;
  notionParentPageId?: string;
  clearOpenAiApiKey?: boolean;
  clearNotionToken?: boolean;
};

export type ConnectionTestResult = {
  ok: boolean;
  openAi: {
    ok: boolean;
    message: string;
  };
  notion: {
    ok: boolean;
    message: string;
  };
};

export type NotionChatCommandResult = {
  ok: boolean;
  message: string;
  url?: string;
};

const samovarApi = {
  getAppInfo: () =>
    ipcRenderer.invoke("app:get-info") as Promise<{
      name: string;
      subtitle: string;
      version: string;
      platform: NodeJS.Platform;
      packaged: boolean;
    }>,
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url) as Promise<{ ok: boolean }>,
  getConnectionSettings: () =>
    ipcRenderer.invoke("settings:get") as Promise<PublicConnectionSettings>,
  saveConnectionSettings: (input: SaveConnectionSettingsInput) =>
    ipcRenderer.invoke("settings:save", input) as Promise<PublicConnectionSettings>,
  testConnections: () => ipcRenderer.invoke("settings:test") as Promise<ConnectionTestResult>,
  executeNotionChatCommand: (input: { message: string }) =>
    ipcRenderer.invoke("notion:execute-chat-command", input) as Promise<NotionChatCommandResult>
};

contextBridge.exposeInMainWorld("samovar", samovarApi);

export type SamovarDesktopApi = typeof samovarApi;
