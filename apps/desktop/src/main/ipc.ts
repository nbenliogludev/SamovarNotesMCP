import { app, ipcMain, shell } from "electron";
import { APP_NAME, APP_SUBTITLE } from "./config";
import { executeNotionChatCommand } from "./notion/commands";
import {
  createNotionOAuthUrl,
  ensureOAuthCallbackServer,
  getLatestOAuthEvent,
  setLatestOAuthEvent
} from "./notion/oauth";
import {
  createWorkspaceStore,
  loadWorkspaceStore,
  saveWorkspaceStore,
  toPublicWorkspace
} from "./notion/workspaces";
import type { NotionChatCommandInput } from "./types";

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

  ipcMain.handle("notion:start-oauth", async () => {
    const authorization = createNotionOAuthUrl();

    if (!authorization) {
      return {
        ok: false,
        reason: "missing-client-id"
      };
    }

    try {
      await ensureOAuthCallbackServer();
    } catch {
      return {
        ok: false,
        reason: "callback-server-failed"
      };
    }

    await shell.openExternal(authorization.url);

    setLatestOAuthEvent({
      status: "opened",
      message: "Notion sign-in opened in the browser."
    });

    return {
      ok: true
    };
  });

  ipcMain.handle("notion:list-workspaces", async () => {
    const store = await loadWorkspaceStore();

    return {
      activeWorkspaceId: store.activeWorkspaceId,
      workspaces: store.workspaces.map(toPublicWorkspace),
      latestOAuthEvent: getLatestOAuthEvent()
    };
  });

  ipcMain.handle("notion:set-active-workspace", async (_event, workspaceId: string) => {
    const store = await loadWorkspaceStore();

    if (!store.workspaces.some((workspace) => workspace.workspaceId === workspaceId)) {
      throw new Error("Unknown Notion workspace.");
    }

    await saveWorkspaceStore({
      ...store,
      activeWorkspaceId: workspaceId
    });

    return { ok: true };
  });

  ipcMain.handle("notion:remove-workspace", async (_event, workspaceId: string) => {
    const store = await loadWorkspaceStore();
    const nextWorkspaces = store.workspaces.filter((workspace) => workspace.workspaceId !== workspaceId);
    const nextActiveWorkspaceId =
      store.activeWorkspaceId === workspaceId ? nextWorkspaces[0]?.workspaceId : store.activeWorkspaceId;

    await saveWorkspaceStore(createWorkspaceStore(nextWorkspaces, nextActiveWorkspaceId));

    return { ok: true };
  });

  ipcMain.handle("notion:execute-chat-command", async (_event, input: NotionChatCommandInput) =>
    executeNotionChatCommand(input)
  );
}
