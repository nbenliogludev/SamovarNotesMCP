import { contextBridge, ipcRenderer } from "electron";

type NotionOAuthStatus =
  | "idle"
  | "opened"
  | "connected"
  | "needs-token-exchange"
  | "cancelled"
  | "error";

export type NotionWorkspace = {
  workspaceId: string;
  workspaceName?: string;
  workspaceIcon?: string;
  botId?: string;
  connectedAt: string;
  updatedAt: string;
};

export type NotionOAuthEvent = {
  status: NotionOAuthStatus;
  message: string;
  workspace?: NotionWorkspace;
  error?: string;
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
  startNotionOAuth: () =>
    ipcRenderer.invoke("notion:start-oauth") as Promise<
      | {
          ok: true;
        }
      | {
          ok: false;
          reason: "missing-client-id" | "callback-server-failed";
        }
    >,
  listNotionWorkspaces: () =>
    ipcRenderer.invoke("notion:list-workspaces") as Promise<{
      activeWorkspaceId?: string;
      workspaces: NotionWorkspace[];
      latestOAuthEvent: NotionOAuthEvent;
    }>,
  setActiveNotionWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke("notion:set-active-workspace", workspaceId) as Promise<{ ok: boolean }>,
  removeNotionWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke("notion:remove-workspace", workspaceId) as Promise<{ ok: boolean }>,
  onNotionOAuthEvent: (callback: (event: NotionOAuthEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, oauthEvent: NotionOAuthEvent) => {
      callback(oauthEvent);
    };

    ipcRenderer.on("notion:oauth-event", listener);

    return () => {
      ipcRenderer.removeListener("notion:oauth-event", listener);
    };
  }
};

contextBridge.exposeInMainWorld("samovar", samovarApi);

export type SamovarDesktopApi = typeof samovarApi;
