import { contextBridge, ipcRenderer } from "electron";

const samovarApi = {
  getAppInfo: () =>
    ipcRenderer.invoke("app:get-info") as Promise<{
      name: string;
      subtitle: string;
      version: string;
      platform: NodeJS.Platform;
      packaged: boolean;
    }>,
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url) as Promise<{ ok: boolean }>
};

contextBridge.exposeInMainWorld("samovar", samovarApi);

export type SamovarDesktopApi = typeof samovarApi;
