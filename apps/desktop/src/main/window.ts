import { BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { APP_NAME } from "./config";

export function createMainWindow(): BrowserWindow {
  const browserWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: "#f4f1ea",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true
    }
  });

  browserWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[renderer] Failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });

  browserWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer] Process gone: ${details.reason}`);
  });

  browserWindow.once("ready-to-show", () => {
    browserWindow.show();
  });

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    return browserWindow;
  }

  void browserWindow.loadFile(join(__dirname, "../renderer/index.html"));

  return browserWindow;
}
