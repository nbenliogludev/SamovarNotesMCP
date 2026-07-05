import { app, ipcMain, shell } from "electron";
import { APP_NAME, APP_SUBTITLE } from "./config";
import { testConnections } from "./connectionTest";
import { executeNotionChatCommand } from "./notion/commands";
import { getPublicConnectionSettings, updateConnectionSettings } from "./settingsStore";
import type { NotionChatCommandInput, SaveConnectionSettingsInput } from "./types";

export function registerIpcHandlers(): void {
  ipcMain.handle("app:get-info", () => ({
    name: APP_NAME,
    subtitle: APP_SUBTITLE,
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged
  }));

  ipcMain.handle("app:open-external", async (_event, url: string) => {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only HTTP and HTTPS URLs can be opened externally.");
    }

    await shell.openExternal(parsedUrl.toString());

    return { ok: true };
  });

  ipcMain.handle("settings:get", async () => getPublicConnectionSettings());

  ipcMain.handle("settings:save", async (_event, input: SaveConnectionSettingsInput) =>
    updateConnectionSettings(input)
  );

  ipcMain.handle("settings:test", async () => testConnections());

  ipcMain.handle("notion:execute-chat-command", async (_event, input: NotionChatCommandInput) =>
    executeNotionChatCommand(input)
  );
}
